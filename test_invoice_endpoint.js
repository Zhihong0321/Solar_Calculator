const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const client = await pool.connect();
  try {
    // Get one invoice bubble_id
    const result = await client.query(
      "SELECT bubble_id FROM invoice_new LIMIT 1"
    );

    if (result.rows.length === 0) {
      console.log('No invoices found');
      return;
    }

    const bubbleId = result.rows[0].bubble_id;
    console.log('Testing with invoice bubble_id:', bubbleId);
    console.log('\n=== Simulating getInvoiceByBubbleId() ===\n');

    // Simulate getInvoiceByBubbleId query
    const invoiceResult = await client.query(
      `SELECT * FROM invoice_new WHERE bubble_id = $1`,
      [bubbleId]
    );

    if (invoiceResult.rows.length === 0) {
      console.log('Invoice not found');
      return;
    }

    const invoice = invoiceResult.rows[0];
    console.log('Invoice data returned:');
    console.log('  - bubble_id:', invoice.bubble_id);
    console.log('  - invoice_number:', invoice.invoice_number);
    console.log('  - package_id:', invoice.package_id);
    console.log('  - package_name_snapshot:', invoice.package_name_snapshot);
    console.log('  - customer_name_snapshot:', invoice.customer_name_snapshot);
    console.log('\n✓ package_id field is included in SELECT * result');

    // Check items
    const itemsResult = await client.query(
      `SELECT * FROM invoice_new_item WHERE invoice_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [bubbleId]
    );
    console.log('\n  - items count:', itemsResult.rows.length);

    // Verify package exists
    if (invoice.package_id) {
      const pkgResult = await client.query(
        `SELECT bubble_id, package_name as name, price FROM package WHERE bubble_id = $1`,
        [invoice.package_id]
      );
      console.log('\n=== Package Reference Check ===');
      if (pkgResult.rows.length > 0) {
        console.log('✓ Package exists in package table');
        console.log('  - bubble_id:', pkgResult.rows[0].bubble_id);
        console.log('  - name:', pkgResult.rows[0].name);
        console.log('  - price:', pkgResult.rows[0].price);
      } else {
        console.log('✗ Package NOT FOUND in package table!');
      }
    }

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
