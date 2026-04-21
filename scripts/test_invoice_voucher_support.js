const assert = require('assert/strict');

const {
  buildVoucherInfoFromRows,
  isVoucherCategoryEligible,
  normalizeVoucherCategoryPackageType
} = require('../src/modules/Invoicing/services/invoiceVoucherSupport');

function testBuildVoucherInfoFromRows() {
  const result = buildVoucherInfoFromRows([
    {
      bubble_id: 'voucher-1',
      voucher_code: 'SAVE100',
      discount_amount: '100',
      invoice_description: 'Save RM100'
    },
    {
      bubble_id: 'voucher-2',
      voucher_code: 'SAVE5',
      discount_percent: '5',
      invoice_description: 'Save 5%'
    },
    {
      bubble_id: 'voucher-3',
      voucher_code: 'SAVE100',
      discount_amount: '999'
    }
  ], 10000);

  assert.equal(result.totalVoucherAmount, 600);
  assert.deepEqual(result.validVoucherCodes, ['SAVE100', 'SAVE5']);
  assert.equal(result.voucherItemsToCreate.length, 2);
  assert.equal(result.selectedVoucherIds[0], 'voucher-1');
}

function testNormalizeVoucherCategoryPackageType() {
  assert.equal(normalizeVoucherCategoryPackageType('Residential'), 'resi');
  assert.equal(normalizeVoucherCategoryPackageType('commercial'), 'non-resi');
  assert.equal(normalizeVoucherCategoryPackageType(''), 'all');
}

function testVoucherCategoryEligibility() {
  const invoiceSummary = {
    packagePrice: 25000,
    panelQty: 18,
    packageTypeScope: 'resi'
  };

  assert.equal(isVoucherCategoryEligible({
    active: true,
    disabled: false,
    min_package_amount: '20000',
    max_package_amount: '30000',
    min_panel_quantity: '10',
    max_panel_quantity: '20',
    package_type_scope: 'Residential'
  }, invoiceSummary), true);

  assert.equal(isVoucherCategoryEligible({
    active: true,
    disabled: false,
    min_package_amount: '26000',
    package_type_scope: 'Residential'
  }, invoiceSummary), false);
}

function main() {
  testBuildVoucherInfoFromRows();
  testNormalizeVoucherCategoryPackageType();
  testVoucherCategoryEligibility();
  console.log('Invoice voucher support checks passed.');
}

main();
