const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const client = await pool.connect();
  try {
    // Check invoice_new table columns
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'invoice_new' ORDER BY ordinal_position"
    );
    console.log('\n=== invoice_new Table Columns ===');
    cols.rows.forEach(r => console.log('  - ' + r.column_name));
    
    // Check if package_id column exists
    const packageIdCol = cols.rows.find(r => r.column_name === 'package_id');
    if (packageIdCol) {
      console.log('\n✓ package_id column EXISTS in invoice_new table');
    } else {
      console.log('\n✗ package_id column DOES NOT EXIST in invoice_new table');
    }
    
    // Sample data from invoice_new
    const sample = await client.query(
      "SELECT bubble_id, invoice_number, package_id, package_name_snapshot, customer_name_snapshot FROM invoice_new LIMIT 5"
    );
    console.log('\n=== Sample invoice_new Records ===');
    sample.rows.forEach(r => {
      console.log('  - Invoice:', r.invoice_number, '| package_id:', r.package_id, '| package_name:', r.package_name_snapshot);
    });
    
    // Count how many have null package_id
    const nullCount = await client.query(
      "SELECT COUNT(*) as count FROM invoice_new WHERE package_id IS NULL"
    );
    console.log('\n=== NULL package_id Count ===');
    console.log('  Invoices with NULL package_id:', nullCount.rows[0].count);
    
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
