const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const tariffs = await client.query('SELECT usage_kwh, usage_normal, network, capacity, sst_normal, eei, bill_total_normal, retail, kwtbb_normal FROM tnb_tariff_2025 ORDER BY usage_kwh ASC');
    console.log('Tariffs count:', tariffs.rowCount);
    if (tariffs.rowCount > 0) console.log('Sample tariff:', tariffs.rows[0]);

    const packages = await client.query(`
      SELECT p.id, p.bubble_id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special, p.max_discount, p.invoice_desc,
             pr.bubble_id as product_bubble_id, pr.solar_output_rating
      FROM package p
      JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
      WHERE p.active = true AND p.type = 'Residential'
    `);
    console.log('Packages count:', packages.rowCount);
    if (packages.rowCount > 0) console.log('Sample package:', packages.rows[0]);
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
