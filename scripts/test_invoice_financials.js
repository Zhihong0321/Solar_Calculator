const assert = require('assert/strict');

function assertMoneyEqual(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.001, `Expected ${actual} to equal ${expected}`);
}

const {
  calculateInvoiceFinancials,
  validateDiscountLimit,
  computeTotalTowardMax,
  normalizeDiscountCap
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
  // Invalid package price means no cap can be computed — should never throw.
  assert.doesNotThrow(() => validateDiscountLimit(null, 99999, 0));
  assert.doesNotThrow(() => validateDiscountLimit(0, 99999, 0));
  assert.equal(normalizeDiscountCap(null, 99999), 0);
  assert.equal(normalizeDiscountCap(0, 99999), 0);
  assert.equal(normalizeDiscountCap(-5, 99999), 0);
}

function testDiscountLimitWithCap() {
  // With nett_price set, cap is package price minus nett_price.
  assert.equal(normalizeDiscountCap(10000, 8500), 1500);
  assert.doesNotThrow(() => validateDiscountLimit(10000, 8500, 1500));
  assert.throws(
    () => validateDiscountLimit(10000, 8500, 1500.5, 500),
    /exceeds the allowed budget/
  );

  // Without nett_price, fallback cap is 7% of package price.
  assertMoneyEqual(normalizeDiscountCap(10000, null), 700);
  assert.doesNotThrow(() => validateDiscountLimit(10000, null, 700));
  assert.throws(
    () => validateDiscountLimit(10000, null, 700.5, 0),
    /exceeds the allowed budget/
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
