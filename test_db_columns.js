const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    const client = await pool.connect();
    console.log("Connected.");
    
    // Check columns
    const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'product'");
    const cols = res.rows.map(r => r.column_name);
    console.log("Product columns:", cols);

    const res2 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'package'");
    const cols2 = res2.rows.map(r => r.column_name);
    console.log("Package columns:", cols2);

    client.release();
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

test();
