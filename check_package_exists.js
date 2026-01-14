const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const client = await pool.connect();
  try {
    // Get sample package IDs from invoice_new
    const invoiceResult = await client.query(
      "SELECT DISTINCT package_id FROM invoice_new LIMIT 10"
    );

    console.log('\n=== Checking if package_ids exist in package table ===\n');

    for (const row of invoiceResult.rows) {
      const packageId = row.package_id;
      const pkgResult = await client.query(
        "SELECT bubble_id, package_name as name FROM package WHERE bubble_id = $1",
        [packageId]
      );

      if (pkgResult.rows.length > 0) {
        console.log(`✓ package_id ${packageId} FOUND - Package: ${pkgResult.rows[0].name}`);
      } else {
        console.log(`✗ package_id ${packageId} NOT FOUND in package table!`);
      }
    }

    // Also check package table structure
    const pkgCols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'package' ORDER BY ordinal_position"
    );
    console.log('\n=== package Table Columns ===');
    pkgCols.rows.forEach(r => console.log('  - ' + r.column_name));

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
