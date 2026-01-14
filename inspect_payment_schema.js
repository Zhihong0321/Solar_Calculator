const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function inspectPaymentTables() {
  const client = await pool.connect();
  try {
    // 1. Find tables with "payment" in the name
    console.log("Searching for tables with 'payment' in name...");
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name ILIKE '%payment%'
    `);
    
    if (tablesRes.rows.length === 0) {
        console.log("No tables found with 'payment' in the name.");
    } else {
        console.log("Found tables:", tablesRes.rows.map(r => r.table_name));

        // 2. For each table found, show schema and sample data
        for (const row of tablesRes.rows) {
            const tableName = row.table_name;
            console.log(`
--- Schema for table: ${tableName} ---`);
            
            const schemaRes = await client.query(`
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);
            console.table(schemaRes.rows);

            console.log(`
--- Sample data for table: ${tableName} (Limit 3) ---`);
            const dataRes = await client.query(`SELECT * FROM "${tableName}" LIMIT 3`);
            console.log(JSON.stringify(dataRes.rows, null, 2));
        }
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

inspectPaymentTables();
