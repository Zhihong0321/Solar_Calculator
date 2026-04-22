/**
 * [AI-CONTEXT]
 * Domain: Invoicing Item Support
 * Primary Responsibility: Reusable invoice_item insert helpers for invoice persistence flows.
 * Stability: Keep these helpers focused on row insertion mechanics so invoiceRepo can stay centered on workflow decisions.
 */
const crypto = require('crypto');

function createInvoiceItemBubbleId() {
  return `item_${crypto.randomBytes(8).toString('hex')}`;
}

async function insertInvoiceItem(client, invoiceId, item) {
  const bubbleId = item.bubbleId || createInvoiceItemBubbleId();
  const columns = [
    'bubble_id',
    'linked_invoice',
    'description',
    'qty',
    'unit_price',
    'amount',
    'inv_item_type',
    'sort',
    'created_at',
    'updated_at',
    'is_a_package'
  ];
  const placeholders = ['$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8', 'NOW()', 'NOW()', '$9'];
  const values = [
    bubbleId,
    invoiceId,
    item.description,
    item.qty,
    item.unitPrice,
    item.amount,
    item.itemType,
    item.sort,
    Boolean(item.isPackage)
  ];

  if (item.linkedPackage !== undefined) {
    columns.push('linked_package');
    placeholders.push(`$${values.length + 1}`);
    values.push(item.linkedPackage);
  }

  if (item.linkedProduct !== undefined) {
    columns.push('linked_product');
    placeholders.push(`$${values.length + 1}`);
    values.push(item.linkedProduct);
  }

  await client.query(
    `INSERT INTO invoice_item
     (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})`,
    values
  );

  return bubbleId;
}

async function syncLinkedInvoiceItems(client, invoiceId, itemIds) {
  await client.query(
    `UPDATE invoice SET linked_invoice_item = $1 WHERE bubble_id = $2`,
    [itemIds, invoiceId]
  );
}

module.exports = {
  insertInvoiceItem,
  syncLinkedInvoiceItems
};
