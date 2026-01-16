const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const client = await pool.connect();
  try {
    // Find invoices where package identifier doesn't exist in package table
    const orphanedResult = await client.query(
      `SELECT inv.bubble_id, inv.invoice_number, inv.linked_package, inv.legacy_pid_to_be_deleted as package_id, inv.package_name_snapshot
       FROM invoice_new inv
       LEFT JOIN package p ON (inv.linked_package = p.bubble_id)
       WHERE p.bubble_id IS NULL AND (inv.linked_package IS NOT NULL OR inv.package_id IS NOT NULL)`
    );

    console.log('\n=== Orphaned Invoices (No valid package found in package table) ===\n');
    
    if (orphanedResult.rows.length === 0) {
      console.log('✓ No orphaned invoices found. All package identifiers are valid.');
    } else {
      console.log(`✗ Found ${orphanedResult.rows.length} orphaned invoices:\n`);
      orphanedResult.rows.forEach(row => {
        console.log(`  - Invoice: ${row.invoice_number}`);
        console.log(`    bubble_id: ${row.bubble_id}`);
        console.log(`    linked_package: ${row.linked_package}`);
        console.log(`    package_id (legacy): ${row.package_id}`);
        console.log(`    package_name_snapshot: ${row.package_name_snapshot}`);
        console.log();
      });
    }

    // Also check total counts
    const totalInvoices = await client.query("SELECT COUNT(*) as count FROM invoice_new");
    const totalPackages = await client.query("SELECT COUNT(*) as count FROM package");
    
    console.log('=== Summary ===');
    console.log(`  Total invoices: ${totalInvoices.rows[0].count}`);
    console.log(`  Total packages: ${totalPackages.rows[0].count}`);
    console.log(`  Orphaned invoices: ${orphanedResult.rows.length}`);

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
