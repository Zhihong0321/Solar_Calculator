const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function checkCustomerSchema() {
  try {
    const client = await pool.connect();
    
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'customer'
    `);
    
    console.log("\n--- customer columns ---");
    console.table(res.rows);

    client.release();
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

checkCustomerSchema();
