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
    
    // Check if package identifier columns exist
    const packageIdCol = cols.rows.find(r => r.column_name === 'package_id');
    const linkedPkgCol = cols.rows.find(r => r.column_name === 'linked_package');
    const legacyPidCol = cols.rows.find(r => r.column_name === 'legacy_pid_to_be_deleted');
    
    if (packageIdCol) console.log('✓ package_id column EXISTS');
    if (linkedPkgCol) console.log('✓ linked_package column EXISTS');
    if (legacyPidCol) console.log('✓ legacy_pid_to_be_deleted column EXISTS');
    
    // Sample data from invoice_new
    const sample = await client.query(
      "SELECT bubble_id, invoice_number, linked_package, package_id, legacy_pid_to_be_deleted, package_name_snapshot FROM invoice_new LIMIT 5"
    );
    console.log('\n=== Sample invoice_new Records ===');
    sample.rows.forEach(r => {
      const pid = r.linked_package || r.legacy_pid_to_be_deleted || r.package_id;
      console.log('  - Invoice:', r.invoice_number, '| effective_pid:', pid, '| package_name:', r.package_name_snapshot);
    });
    
    // Count how many have null linked_package
    const nullCount = await client.query(
      "SELECT COUNT(*) as count FROM invoice_new WHERE (linked_package IS NULL OR linked_package = '') AND (package_id IS NULL OR package_id = '') AND (legacy_pid_to_be_deleted IS NULL OR legacy_pid_to_be_deleted = '')"
    );
    console.log('\n=== NULL Package Identifier Count ===');
    console.log('  Invoices with NO package identifier:', nullCount.rows[0].count);
    
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
