/**
 * [AI-CONTEXT]
 * Domain: Invoicing Item Support
 * Primary Responsibility: Reusable invoice_item insert helpers for invoice persistence flows.
 * Stability: Keep these helpers focused on row insertion mechanics so invoiceRepo can stay centered on workflow decisions.
 */
const crypto = require('crypto');
const { resolveMicroInverterWarrantyProduct } = require('./invoiceMicroInverterWarrantySupport');

// Explicit catalog links take precedence. Unlinked manual rows may match a unique
// catalog name exactly (case-insensitive, trimmed); never infer from partial text.
async function resolveExtraItemProducts(client, items = []) {
  const resolved = items.map((item) => ({
    ...item,
    linked_product: item.linked_product || item.linkedProduct || resolveMicroInverterWarrantyProduct(item)
  }));
  const names = [...new Set(resolved.filter((item) => !item.linked_product)
    .map((item) => String(item.description || '').trim().toLowerCase()).filter(Boolean))];
  if (!names.length) return resolved;

  const result = await client.query(
    `SELECT bubble_id, id::text AS id, LOWER(TRIM(name)) AS match_name
     FROM product WHERE LOWER(TRIM(name)) = ANY($1::text[])`,
    [names]
  );
  const matches = new Map();
  for (const product of result.rows) {
    const previous = matches.get(product.match_name);
    matches.set(product.match_name, previous === undefined ? (product.bubble_id || product.id) : null);
  }
  return resolved.map((item) => ({
    ...item,
    linked_product: item.linked_product || matches.get(String(item.description || '').trim().toLowerCase()) || null
  }));
}

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
  resolveExtraItemProducts,
  insertInvoiceItem,
  syncLinkedInvoiceItems
};
