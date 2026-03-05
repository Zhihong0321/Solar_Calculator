require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const i = await pool.query(`SELECT bubble_id, paid_amount, total_amount FROM invoice WHERE bubble_id = '1737152069635x501869871871981100' OR paid_amount > 0 LIMIT 5`);
  console.log("invoice: ", i.rows);
}
check().finally(() => pool.end());
