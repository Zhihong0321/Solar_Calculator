// Test the actual API endpoint response structure
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function getInvoiceByBubbleId(client, bubbleId) {
  try {
    const invoiceResult = await client.query(
      `SELECT * FROM invoice_new WHERE bubble_id = $1`,
      [bubbleId]
    );

    if (invoiceResult.rows.length === 0) return null;
    const invoice = invoiceResult.rows[0];

    const itemsResult = await client.query(
      `SELECT * FROM invoice_new_item WHERE invoice_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [bubbleId]
    );
    invoice.items = itemsResult.rows;

    return invoice;
  } catch (err) {
    console.error('Error in getInvoiceByBubbleId:', err);
    throw err;
  }
}

async function check() {
  const client = await pool.connect();
  try {
    // Get one invoice
    const result = await client.query(
      "SELECT bubble_id FROM invoice_new LIMIT 1"
    );

    if (result.rows.length === 0) {
      console.log('No invoices found');
      return;
    }

    const bubbleId = result.rows[0].bubble_id;
    console.log('Testing API response for invoice:', bubbleId);
    console.log('\n=== Full getInvoiceByBubbleId() result (JSON) ===\n');

    const invoice = await getInvoiceByBubbleId(client, bubbleId);

    if (!invoice) {
      console.log('Invoice not found');
      return;
    }

    // Log package identifiers specifically
    console.log('inv.linked_package:', invoice.linked_package);
    console.log('inv.legacy_pid_to_be_deleted:', invoice.legacy_pid_to_be_deleted);
    console.log('inv.package_id (original):', invoice.package_id);
    console.log('inv.linked_package type:', typeof invoice.linked_package);
    console.log('inv.linked_package === null:', invoice.linked_package === null);
    console.log('!!inv.linked_package:', !!invoice.linked_package);

    // Log all keys for inspection
    console.log('\n=== All invoice fields ===');
    console.log(Object.keys(invoice).sort());

    // Simulate the frontend check: if (inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id)
    console.log('\n=== Frontend condition check ===');
    if (invoice.linked_package || invoice.legacy_pid_to_be_deleted || invoice.package_id) {
      console.log('✓ if (inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id) is TRUE');
      console.log('  fetchPackageDetails() would be called');
    } else {
      console.log('✗ if (inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id) is FALSE');
      console.log('  fetchPackageDetails() would NOT be called');
      console.log('  This is why packageIdForm might be shown!');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
