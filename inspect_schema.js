const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const resUser = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user'
    `);
    console.log('--- user columns ---');
    console.table(resUser.rows);

    const resAgent = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'agent'
    `);
    console.log('--- agent columns ---');
    console.table(resAgent.rows);

    const resInvoice = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'invoice'
    `);
    console.log('--- invoice columns ---');
    console.table(resInvoice.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
