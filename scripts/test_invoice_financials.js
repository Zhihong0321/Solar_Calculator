const assert = require('assert/strict');

const {
  calculateInvoiceFinancials,
  validateDiscountLimit,
  computeTotalTowardMax,
  normalizePackageMaxDiscount
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

function testDiscountLimitNoCap() {
  // NULL or 0 max_discount means no cap is enforced yet — should never throw.
  assert.doesNotThrow(() => validateDiscountLimit(null, 99999, 0));
  assert.doesNotThrow(() => validateDiscountLimit(0, 99999, 0));
  assert.equal(normalizePackageMaxDiscount(null), 0);
  assert.equal(normalizePackageMaxDiscount(0), 0);
  assert.equal(normalizePackageMaxDiscount(-5), 0);
  assert.equal(normalizePackageMaxDiscount('1500'), 1500);
}

function testDiscountLimitWithCap() {
  // Within cap — allowed.
  assert.doesNotThrow(() => validateDiscountLimit(2000, 2000, 0));
  // Exceeds cap — blocked, error mentions the package maximum.
  assert.throws(
    () => validateDiscountLimit(2000, 2000.5, 500),
    /exceeds package maximum/
  );
}

function testComputeTotalTowardMax() {
  const total = computeTotalTowardMax({
    manualDiscount: 500,
    promoAmount: 1000,
    voucherVisibleDiscount: 300,
    totalHiddenDiscount: 600,
    negativeExtraItems: -200
  });
  // 500 + 1000 + 300 + 600 + abs(-200) = 2600
  assert.equal(total, 2600);
}

function main() {
  testBasicFinancialCalculation();
  testNegativeExtraItemGuard();
  testDiscountLimitNoCap();
  testDiscountLimitWithCap();
  testComputeTotalTowardMax();
  console.log('Invoice financial helper checks passed.');
}

main();
