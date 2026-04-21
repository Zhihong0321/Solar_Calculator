const assert = require('assert/strict');

const {
  calculateInvoiceFinancials,
  validateManualDiscountLimit
} = require('../src/modules/Invoicing/services/invoiceFinancials');

function testBasicFinancialCalculation() {
  const result = calculateInvoiceFinancials(
    {
      agentMarkup: 200,
      discountFixed: 100,
      discountPercent: 5,
      applySst: true,
      eppFeeAmount: 50,
      extraItems: [{ total_price: 300 }]
    },
    10000,
    500,
    0
  );

  assert.equal(result.markupAmount, 200);
  assert.equal(result.priceWithMarkup, 10200);
  assert.equal(result.percentDiscountVal, 500);
  assert.equal(result.taxableSubtotal, 9400);
  assert.equal(result.sstAmount, 564);
  assert.equal(result.finalTotalAmount, 10014);
}

function testNegativeExtraItemGuard() {
  assert.throws(
    () => calculateInvoiceFinancials(
      {
        extraItems: [{ total_price: -600 }]
      },
      10000,
      0,
      0
    ),
    /exceeds the maximum allowed 5% of package price/
  );
}

function testManualDiscountGuard() {
  validateManualDiscountLimit(20000, 1000);

  assert.throws(
    () => validateManualDiscountLimit(20000, 1001),
    /exceeds the maximum allowed/
  );
}

function main() {
  testBasicFinancialCalculation();
  testNegativeExtraItemGuard();
  testManualDiscountGuard();
  console.log('Invoice financial helper checks passed.');
}

main();
