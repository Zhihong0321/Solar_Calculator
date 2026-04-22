const assert = require('assert/strict');

const {
  getDefaultTemplate,
  getPackageById,
  getTemplateById,
  getVoucherByCode,
  getVoucherById
} = require('../src/modules/Invoicing/services/invoiceLookupSupport');

async function testGetPackageById() {
  const client = { async query() { return { rows: [{ bubble_id: 'pkg-1', name: 'Package' }] }; } };
  const result = await getPackageById(client, 'pkg-1');
  assert.equal(result.bubble_id, 'pkg-1');
}

async function testGetDefaultTemplateFallback() {
  const client = { async query() { return { rows: [] }; } };
  const result = await getDefaultTemplate(client);
  assert.equal(result.company_name, 'Atap Solar');
}

async function testGetTemplateById() {
  const client = { async query() { return { rows: [{ bubble_id: 'tpl-1' }] }; } };
  const result = await getTemplateById(client, 'tpl-1');
  assert.equal(result.bubble_id, 'tpl-1');
}

async function testGetVoucherByCode() {
  const client = { async query() { return { rows: [{ voucher_code: 'SAVE100' }] }; } };
  const result = await getVoucherByCode(client, 'SAVE100');
  assert.equal(result.voucher_code, 'SAVE100');
}

async function testGetVoucherById() {
  const client = { async query() { return { rows: [{ bubble_id: 'voucher-1' }] }; } };
  const result = await getVoucherById(client, 'voucher-1');
  assert.equal(result.bubble_id, 'voucher-1');
}

async function main() {
  await testGetPackageById();
  await testGetDefaultTemplateFallback();
  await testGetTemplateById();
  await testGetVoucherByCode();
  await testGetVoucherById();
  console.log('Invoice lookup support checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
