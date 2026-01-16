const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'invoice' AND column_name IN ('package_id', 'linked_package', 'legacy_pid_to_be_deleted')
    `);
    console.table(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
