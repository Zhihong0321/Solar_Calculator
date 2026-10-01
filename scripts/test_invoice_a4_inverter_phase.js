const assert = require('assert');
const { generateInvoiceHtmlA4 } = require('../src/modules/Invoicing/services/invoiceHtmlGeneratorA4');

function render(invoice) {
  return generateInvoiceHtmlA4({ items: [], ...invoice }, {});
}

for (const name of ['[1P] SAJ R5 4KW String Inverter', 'SAJ Single Phase Inverter', 'SAJ 1-phase Inverter']) {
  const html = render({ inverter_name: name, package_name: '[3P] Solar Package' });
  assert.ok(html.includes(name), 'Linked product name must appear in the printout');
  assert.match(html, /<span>Phase<\/span><strong>1-Phase<\/strong>/);
  assert.match(html, /Single-phase inverter tied/);
  assert.doesNotMatch(html, /Three-phase inverter tied|<strong>3-Phase<\/strong>/);
}

for (const name of ['[3P] SAJ R6 Inverter', 'SAJ Three Phase Inverter', 'SAJ 3-phase Inverter']) {
  const html = render({ inverter_name: name });
  assert.match(html, /<span>Phase<\/span><strong>3-Phase<\/strong>/);
  assert.match(html, /Three-phase inverter tied/);
}

assert.match(render({ inverter_name: 'SAJ Inverter', package_name: '[1P] Solar Package' }), /<strong>1-Phase<\/strong>/);
assert.match(render({ items: [{ description: '[1P] SAJ String Inverter' }] }), /<strong>1-Phase<\/strong>/);
const unknown = render({ inverter_name: 'SAJ Inverter' });
assert.match(unknown, /<span>Phase<\/span><strong>—<\/strong>/);
assert.doesNotMatch(unknown, /Three-phase inverter tied|<strong>3-Phase<\/strong>/);
console.log('A4 inverter phase regression checks passed.');
