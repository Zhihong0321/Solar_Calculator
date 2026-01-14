const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function inspect() {
  try {
    const client = await pool.connect();
    
    console.log("--- Tables ---");
    const resTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    for (const row of resTables.rows) {
      console.log(`Table: ${row.table_name}`);
      const resColumns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [row.table_name]);
      
      resColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
      });
    }
    
    client.release();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

inspect();
