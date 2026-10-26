const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolveExtraItemProducts, insertInvoiceItem, syncLinkedInvoiceItems } = require('../src/modules/Invoicing/services/invoiceItemSupport');
const { resolveMicroInverterWarrantyProduct } = require('../src/modules/Invoicing/services/invoiceMicroInverterWarrantySupport');
const s4 = '1712027846244x376551508591509500';
const s2 = '1712027911264x544501973692448800';
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Both pages must send the catalog links through the actual shared request builder.
for (const page of ['create_invoice', 'edit_invoice']) {
  const source = read(`public/js/pages/${page}.js`);
  const models = source.match(/const MICRO_INVERTER_MODELS = \[[\s\S]*?\];/)[0];
  const getter = source.slice(source.indexOf('function getMicroInverterItems()'), source.indexOf('\nfunction ', source.indexOf('function getMicroInverterItems()') + 10));
  const context = { window: {}, document: { getElementById: (id) => id.startsWith('mi_') ? { value: '2' } : null } };
  vm.createContext(context);
  vm.runInContext(read('public/js/pages/invoice_page_shared.js'), context);
  const request = vm.runInContext(`${models}\n${getter}\nwindow.InvoicePageShared.buildInvoiceRequestData({ formValues: {}, extraItems: getMicroInverterItems() })`, context);
  assert.deepEqual(Array.from(request.extra_items, (item) => item.linked_product), [s2, s4], page);
  assert.deepEqual(Array.from(request.extra_items, (item) => item.total_price), [1400, 2600]);
}

(async () => {
  const original = [
    { description: 'SAJ M2-1.8K S4 Micro Inverter (RM1,500 → RM1,300)', qty: 2, unit_price: 1300, total_price: 2600 },
    { description: ' Catalog Battery ', qty: 1, unit_price: 8000, total_price: 8000 },
    { description: 'Ambiguous Product', qty: 1 },
    { description: 'Catalog Battery installation', qty: 1 },
    { description: 'Custom description', linked_product: 'explicit-product', qty: 1 },
    { description: 'Other description', linkedProduct: 'camel-case-product', qty: 1 }
  ];
  const before = JSON.stringify(original);
  const calls = [];
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    if (/FROM product WHERE/.test(sql)) return { rows: [
      { bubble_id: 'battery-product', match_name: 'catalog battery' },
      { bubble_id: 'ambiguous-1', match_name: 'ambiguous product' },
      { bubble_id: 'ambiguous-2', match_name: 'ambiguous product' }
    ] };
    if (/FROM product\s/.test(sql)) return { rows: values[0].map((id) => ({ name: id, product_warranty_desc: `Warranty for ${id}` })) };
    return { rows: [] };
  } };
  const resolved = await resolveExtraItemProducts(client, original);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(resolved.map((item) => item.linked_product), [s4, 'battery-product', null, null, 'explicit-product', 'camel-case-product']);
  const source = read('src/modules/Invoicing/services/invoiceRepo.js');
  const lineItemsSource = source.slice(source.indexOf('async function _createLineItems('), source.indexOf('async function createInvoiceOnTheFly('));
  const createLineItems = vm.runInNewContext(`(${lineItemsSource})`, { resolveExtraItemProducts, insertInvoiceItem, syncLinkedInvoiceItems });
  calls.length = 0;
  const result = await createLineItems(client, 'invoice-id', { extraItems: original }, { priceWithMarkup: 20000 }, { pkg: { bubble_id: 'package-id' } }, { voucherItemsToCreate: [] });
  const extraInserts = calls.filter(({ sql }) => /INSERT INTO invoice_item/.test(sql)).slice(1);
  assert.deepEqual(extraInserts.map(({ values }) => values.at(-1)), resolved.map((item) => item.linked_product));
  assert.equal(result.extraItems[0].linked_product, s4);
  // Create hydration uses resolved extras, while edit reloads persisted rows through the reader.
  assert.match(source, /_fetchWarrantyInfo\(client, invoice\.linked_package, extraItems\)/);
  const loaderSource = source.slice(source.indexOf('async function _fetchWarrantyInfo('), source.indexOf('\nfunction inferPhaseScopeFromProductName'));
  const load = vm.runInNewContext(`(${loaderSource})`, { resolveMicroInverterWarrantyProduct, console });
  const warranties = await load(client, null, result.extraItems);
  assert.deepEqual(Array.from(warranties, (w) => w.name), [s4, 'battery-product', 'explicit-product', 'camel-case-product']);
  calls.length = 0;
  assert.equal((await load(client, null, [])).length, 0, 'Removed extras must not leave stale warranties');
  assert.equal(calls.length, 0);
  console.log('Invoice extra product create/edit workflow checks passed.');
})().catch((err) => { console.error(err); process.exitCode = 1; });
