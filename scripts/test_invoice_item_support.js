const assert = require('assert/strict');

const {
  insertInvoiceItem,
  syncLinkedInvoiceItems
} = require('../src/modules/Invoicing/services/invoiceItemSupport');

async function testInsertInvoiceItem() {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [] };
    }
  };

  const bubbleId = await insertInvoiceItem(client, 'inv-1', {
    description: 'Test item',
    qty: 2,
    unitPrice: 50,
    amount: 100,
    itemType: 'extra',
    sort: 10,
    isPackage: false,
    linkedProduct: 'prod-1'
  });

  assert.match(bubbleId, /^item_/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO invoice_item/);
  assert.equal(calls[0].values[1], 'inv-1');
  assert.equal(calls[0].values.at(-1), 'prod-1');
}

async function testSyncLinkedInvoiceItems() {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [] };
    }
  };

  await syncLinkedInvoiceItems(client, 'inv-2', ['item-1', 'item-2']);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE invoice SET linked_invoice_item/);
  assert.deepEqual(calls[0].values, [['item-1', 'item-2'], 'inv-2']);
}

async function main() {
  await testInsertInvoiceItem();
  await testSyncLinkedInvoiceItems();
  console.log('Invoice item support checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
