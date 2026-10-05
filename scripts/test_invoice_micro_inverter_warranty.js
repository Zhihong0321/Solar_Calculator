const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolveMicroInverterWarrantyProduct } = require('../src/modules/Invoicing/services/invoiceMicroInverterWarrantySupport');
const { generateInvoiceHtmlA4 } = require('../src/modules/Invoicing/services/invoiceHtmlGeneratorA4');
const { generateInvoiceHtmlV2 } = require('../src/modules/Invoicing/services/invoiceHtmlGeneratorV2');

const s4 = '1712027846244x376551508591509500';
const s2 = '1712027911264x544501973692448800';
const sentItem = { description: 'SAJ M2-1.8K S4 Micro Inverter (RM1,500 → RM1,300)', qty: '2', linked_product: null };
assert.equal(resolveMicroInverterWarrantyProduct(sentItem), s4);
assert.equal(resolveMicroInverterWarrantyProduct({ description: 'SAJ M2-1.0K-S2 Micro Inverter' }), s2);
for (const description of ['Other Brand Micro Inverter', 'SAJ M2-1.8K S2 Micro Inverter', 'Remove SAJ M2-1.8K S4 Micro Inverter', 'SAJ M2-1.8K S4 Micro Inverter installation only']) {
  assert.equal(resolveMicroInverterWarrantyProduct({ description }), null);
}
assert.equal(resolveMicroInverterWarrantyProduct({ ...sentItem, linked_product: 'explicit-product' }), null);

// Exercise the repository's actual private loader without opening a database connection.
const repoSource = fs.readFileSync(path.join(__dirname, '../src/modules/Invoicing/services/invoiceRepo.js'), 'utf8');
const loaderSource = repoSource.slice(repoSource.indexOf('async function _fetchWarrantyInfo('), repoSource.indexOf('\nfunction inferPhaseScopeFromProductName'));
const fetchWarrantyInfo = vm.runInNewContext(`(${loaderSource})`, { resolveMicroInverterWarrantyProduct, console });

(async () => {
  const calls = [];
  const product = { name: 'SAJ M2-1.8K-S4 Micro Inverter', product_warranty_desc: '10 Years Manufacturer Warranty' };
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM package\s/.test(sql)) return { rows: [{ inverter_1: s4, linked_package_item: ['package-item'] }] };
      if (/FROM package_item/.test(sql)) return { rows: [{ product: 'panel-product' }] };
      if (/FROM product\s/.test(sql)) return { rows: [product] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const before = JSON.stringify(sentItem);
  const warranties = await fetchWarrantyInfo(client, 'package-id', [sentItem, sentItem, { linked_product: 'battery-product' }]);
  assert.equal(JSON.stringify(sentItem), before, 'Reading must not change the invoice item');
  assert.equal(warranties.length, 1);
  assert.equal(warranties[0].terms, product.product_warranty_desc);
  assert.deepEqual(Array.from(calls.at(-1).params[0]), [s4, 'panel-product', 'battery-product']);
  assert.ok(calls.every(({ sql }) => /^\s*SELECT\b/.test(sql)), 'Warranty loading must remain read-only');
  calls.length = 0;
  await fetchWarrantyInfo(client, null, [sentItem]);
  assert.deepEqual(Array.from(calls[0].params[0]), [s4], 'Legacy extras must work without a package');
  const invoice = { items: [], warranties };
  for (const render of [generateInvoiceHtmlA4, generateInvoiceHtmlV2]) {
    const html = render(invoice, {});
    assert.ok(html.includes(product.name));
    assert.ok(!html.includes('10 Years Product Warranty'));
    assert.ok(html.includes('10 Years Manufacturer Warranty'));
  }
  console.log('Invoice microinverter warranty reader checks passed.');
})().catch((err) => { console.error(err); process.exitCode = 1; });
