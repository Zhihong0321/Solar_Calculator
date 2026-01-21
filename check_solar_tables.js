const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const tables = ['tnb_tariff_2025', 'package', 'product'];
    for (const table of tables) {
      const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
      `);
      console.log(`--- ${table} columns ---`);
      console.table(res.rows);
      
      const count = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`Count: ${count.rows[0].count}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
