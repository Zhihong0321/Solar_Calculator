const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const resSeda = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'seda_registration'
    `);
    console.log('--- seda_registration columns ---');
    console.table(resSeda.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
