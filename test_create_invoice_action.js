const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  const client = await pool.connect();
  try {
    // Get one invoice
    const result = await client.query(
      `SELECT bubble_id FROM invoice_new LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.log('No invoices found');
      return;
    }

    const bubbleId = result.rows[0].bubble_id;
    console.log('Testing with invoice:', bubbleId);

    // Get full invoice with items (simulating getInvoiceByBubbleId)
    const invoiceResult = await client.query(
      `SELECT * FROM invoice_new WHERE bubble_id = $1`,
      [bubbleId]
    );

    if (invoiceResult.rows.length === 0) {
      console.log('Invoice not found');
      return;
    }

    const invoice = invoiceResult.rows[0];

    const itemsResult = await client.query(
      `SELECT * FROM invoice_new_item WHERE invoice_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [bubbleId]
    );
    invoice.items = itemsResult.rows;

    // Show invoice structure (what gets stored in snapshot)
    console.log('\n=== INVOICE HEADER FIELDS ===\n');
    const headerFields = [
      'bubble_id', 'invoice_number', 'customer_name_snapshot', 'customer_phone_snapshot',
      'customer_address_snapshot', 'package_id', 'package_name_snapshot', 'invoice_date',
      'subtotal', 'sst_rate', 'sst_amount', 'discount_amount', 'discount_fixed',
      'discount_percent', 'voucher_code', 'voucher_amount', 'total_amount',
      'status', 'share_token', 'agent_markup', 'template_id', 'version',
      'root_id', 'parent_id', 'is_latest'
    ];

    headerFields.forEach(field => {
      const value = invoice[field];
      console.log(`  - ${field}: ${value}`);
    });

    console.log('\n=== INVOICE ITEMS ===\n');
    invoice.items.forEach((item, index) => {
      console.log(`  Item ${index + 1}:`);
      console.log(`    - id: ${item.id}`);
      console.log(`    - invoice_id: ${item.invoice_id}`);
      console.log(`    - item_type: ${item.item_type}`);
      console.log(`    - description: ${item.description}`);
      console.log(`    - qty: ${item.qty}`);
      console.log(`    - unit_price: ${item.unit_price}`);
      console.log(`    - total_price: ${item.total_price}`);
      console.log(`    - product_id: ${item.product_id}`);
      console.log(`    - sort_order: ${item.sort_order}`);
    });

    // Show template structure if present
    if (invoice.template) {
      console.log('\n=== TEMPLATE (if exists in invoice) ===\n');
      console.log(JSON.stringify(invoice.template, null, 2).split('\n').map(l => '  ' + l).join('\n'));
    }

    console.log('\n=== FULL SNAPSHOT JSON EXAMPLE ===\n');
    const snapshotJson = {
      bubble_id: invoice.bubble_id,
      invoice_number: invoice.invoice_number,
      customer_name_snapshot: invoice.customer_name_snapshot,
      customer_phone_snapshot: invoice.customer_phone_snapshot,
      customer_address_snapshot: invoice.customer_address_snapshot,
      package_id: invoice.package_id,
      package_name_snapshot: invoice.package_name_snapshot,
      invoice_date: invoice.invoice_date,
      subtotal: invoice.subtotal,
      sst_rate: invoice.sst_rate,
      sst_amount: invoice.sst_amount,
      discount_amount: invoice.discount_amount,
      discount_fixed: invoice.discount_fixed,
      discount_percent: invoice.discount_percent,
      voucher_code: invoice.voucher_code,
      voucher_amount: invoice.voucher_amount,
      total_amount: invoice.total_amount,
      status: invoice.status,
      share_token: invoice.share_token,
      agent_markup: invoice.agent_markup,
      version: invoice.version,
      root_id: invoice.root_id,
      parent_id: invoice.parent_id,
      is_latest: invoice.is_latest,
      template: invoice.template, // Note: this is a joined object from template table
      items: invoice.items
    };

    console.log(JSON.stringify(snapshotJson, null, 2).split('\n').map(l => '  ' + l).join('\n'));

    console.log('\n=== ACTION DETAILS STRUCTURE ===\n');
    const actionDetails = {
      change_summary: 'Created version from INV-XXXXX',
      discount_fixed: invoice.discount_fixed,
      discount_percent: invoice.discount_percent,
      total_amount: invoice.total_amount,
      snapshot: snapshotJson
    };

    console.log(JSON.stringify(actionDetails, null, 2).split('\n').map(l => '  ' + l).join('\n'));

  } finally {
    await client.release();
    await pool.end();
  }
}

test().catch(console.error);
