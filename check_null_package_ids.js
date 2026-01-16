const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const client = await pool.connect();
  try {
    // Check all invoices and their package identifier status
    const result = await client.query(
      `SELECT 
        bubble_id, 
        invoice_number, 
        linked_package,
        package_id as legacy_pid_to_be_deleted, 
        package_name_snapshot,
        customer_name_snapshot,
        created_at
       FROM invoice_new 
       ORDER BY created_at DESC
       LIMIT 20`
    );

    console.log('\n=== Recent 20 Invoices (by created_at DESC) ===\n');
    
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.invoice_number}`);
      console.log(`   bubble_id: ${row.bubble_id}`);
      console.log(`   linked_package: ${row.linked_package || 'NULL'}`);
      console.log(`   package_id (legacy): ${row.legacy_pid_to_be_deleted || 'NULL'}`);
      console.log(`   package_name: ${row.package_name_snapshot || 'N/A'}`);
      console.log(`   customer: ${row.customer_name_snapshot || 'N/A'}`);
      console.log(`   created_at: ${row.created_at}`);
      console.log();
    });

    // Check for any NULL package identifiers
    const nullResult = await client.query(
      `SELECT COUNT(*) as count FROM invoice_new WHERE (linked_package IS NULL OR linked_package = '')`
    );
    console.log(`Total invoices with NO package identifier (linked_package): ${nullResult.rows[0].count}`);

    // Check migration status if column exists
    try {
      const migrationResult = await client.query(
        `SELECT migration_status, COUNT(*) as count FROM invoice_new GROUP BY migration_status`
      );
      console.log('\n=== Migration Status ===');
      migrationResult.rows.forEach(row => {
        console.log(`  ${row.migration_status || 'NULL'}: ${row.count} invoices`);
      });
    } catch (e) {
      console.log('\n(Migration status column check skipped)');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
