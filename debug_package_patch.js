const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('--- Invoice & Package Analysis ---');
    
    // 1. Total invoices missing linked_package
    const res1 = await client.query("SELECT COUNT(*) as count FROM invoice WHERE linked_package IS NULL OR linked_package = ''");
    const missingCount = parseInt(res1.rows[0].count);
    console.log(`Total Invoices missing linked_package: ${missingCount}`);

    // 2. Invoices missing linked_package but HAVE legacy package_id (now legacy_pid_to_be_deleted)
    const res2 = await client.query("SELECT COUNT(*) as count FROM invoice WHERE (linked_package IS NULL OR linked_package = '') AND (package_id IS NOT NULL AND package_id != '' OR legacy_pid_to_be_deleted IS NOT NULL AND legacy_pid_to_be_deleted != '')");
    console.log(`Invoices missing linked_package but HAVE legacy package identifier: ${res2.rows[0].count}`);

    // 3. Invoices missing BOTH
    const res3 = await client.query("SELECT COUNT(*) as count FROM invoice WHERE (linked_package IS NULL OR linked_package = '') AND (package_id IS NULL OR package_id = '') AND (legacy_pid_to_be_deleted IS NULL OR legacy_pid_to_be_deleted = '')");
    console.log(`Invoices missing BOTH linked_package and legacy package identifier: ${res3.rows[0].count}`);

    // 4. Check if invoice_item has the data but is_a_package is false
    const res4 = await client.query(`
      SELECT COUNT(DISTINCT i.bubble_id) as count 
      FROM invoice i
      JOIN invoice_item ii ON i.bubble_id = ii.linked_invoice
      WHERE (i.linked_package IS NULL OR i.linked_package = '')
      AND (ii.is_a_package IS FALSE OR ii.is_a_package IS NULL)
      AND ii.linked_package IS NOT NULL AND ii.linked_package != ''
    `);
    console.log(`Invoices missing linked_package where invoice_item HAS linked_package but is_a_package is NOT true: ${res4.rows[0].count}`);

    // 5. Check if invoice_item has the data and is_a_package is true
    const res5 = await client.query(`
      SELECT COUNT(DISTINCT i.bubble_id) as count 
      FROM invoice i
      JOIN invoice_item ii ON i.bubble_id = ii.linked_invoice
      WHERE (i.linked_package IS NULL OR i.linked_package = '')
      AND ii.is_a_package IS TRUE
      AND ii.linked_package IS NOT NULL AND ii.linked_package != ''
    `);
    console.log(`Invoices missing linked_package where invoice_item HAS linked_package AND is_a_package is TRUE: ${res5.rows[0].count}`);

    // 6. Sample of invoices that are still missing linked_package
    const res6 = await client.query("SELECT bubble_id, linked_package, legacy_pid_to_be_deleted, package_id FROM invoice WHERE (linked_package IS NULL OR linked_package = '') LIMIT 5");
    console.log('Sample missing invoices:', res6.rows);

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
