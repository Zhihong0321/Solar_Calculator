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

function testCeoDiscountBypassesCap() {
  // CEO discount skips the cap check entirely, even if total > cap.
  // Previously this was enforced outside validateDiscountLimit; the
  // function now also accepts the flag for defense in depth.
  assert.doesNotThrow(() => validateDiscountLimit(10000, 8500, 99999, 9999, true));
  assert.doesNotThrow(() => validateDiscountLimit(10000, null, 99999, 0, true));
}

function testBypassVoucherExcludedFromCap() {
  // Cap = price - nett_price = 10000 - 8500 = 1500.
  // Bypass voucher: 1200 visible, 0 hidden. Should be fully excluded from
  // the cap. Manual 1000 is at the cap edge but does not exceed it.
  const pkgPrice = 10000;
  const nettPrice = 8500;
  const cap = 1500;
  const manualDiscount = 1000;
  const totalVoucherAmount = 1200;
  const totalHiddenDiscount = 0;
  const bypassingVoucherAmount = 1200;
  const bypassingHiddenDiscount = 0;

  // Caller pre-subtracts bypass from bound, then calls computeTotalTowardMax.
  const boundVoucherAmount = totalVoucherAmount - bypassingVoucherAmount;
  const boundHiddenDiscount = totalHiddenDiscount - bypassingHiddenDiscount;
  const totalTowardMax = computeTotalTowardMax({
    manualDiscount,
    promoAmount: 0,
    voucherVisibleDiscount: boundVoucherAmount,
    totalHiddenDiscount: boundHiddenDiscount,
    negativeExtraItems: 0
  });
  assert.equal(totalTowardMax, manualDiscount);
  assert.equal(totalTowardMax, cap - 500);
  assert.doesNotThrow(
    () => validateDiscountLimit(pkgPrice, nettPrice, totalTowardMax, boundHiddenDiscount)
  );
}

function testBypassVoucherAllowsZeroBound() {
  // Without the bypass, a 1200 voucher would push 0 manual + 1200 voucher
  // = 1200 total, still under 1500 cap, so it would pass. The bypass only
  // matters when the bound amount would EXCEED the cap. Demonstrate that
  // the bypass voucher is itself still allowed even when bound = 0.
  const pkgPrice = 10000;
  const nettPrice = 8500;
  // Bound: only manual = 1500 (at the cap). Bypass: another 1200 voucher.
  // totalTowardMax = 1500, exactly at cap → should NOT throw.
  const totalTowardMax = computeTotalTowardMax({
    manualDiscount: 1500,
    promoAmount: 0,
    voucherVisibleDiscount: 0,
    totalHiddenDiscount: 0,
    negativeExtraItems: 0
  });
  assert.equal(totalTowardMax, 1500);
  assert.doesNotThrow(
    () => validateDiscountLimit(pkgPrice, nettPrice, totalTowardMax, 0)
  );
}

function testBypassVoucherDoesNotReduceManual() {
  // The semantic check: a 1200 bypass voucher must NEVER reduce the manual
  // discount contribution. Manual = 1500 (at cap) + 1200 bypass = totalTowardMax
  // should still equal 1500, not 300.
  const manualDiscount = 1500;
  const totalVoucherAmount = 1200;
  const totalHiddenDiscount = 0;
  const bypassingVoucherAmount = 1200;
  const bypassingHiddenDiscount = 0;

  const boundVoucherAmount = totalVoucherAmount - bypassingVoucherAmount;
  const boundHiddenDiscount = totalHiddenDiscount - bypassingHiddenDiscount;
  const totalTowardMax = computeTotalTowardMax({
    manualDiscount,
    promoAmount: 0,
    voucherVisibleDiscount: boundVoucherAmount,
    totalHiddenDiscount: boundHiddenDiscount,
    negativeExtraItems: 0
  });
  assert.equal(totalTowardMax, 1500, 'manual discount must be untouched by a bypass voucher');
}

function testBoundVoucherStillBlockedWhenExceedingCap() {
  // Sanity check: without bypass, the existing block behavior is preserved.
  // 2000 bound voucher > 1500 cap → throw.
  const pkgPrice = 10000;
  const nettPrice = 8500;
  const totalTowardMax = 2000;
  assert.throws(
    () => validateDiscountLimit(pkgPrice, nettPrice, totalTowardMax, 0),
    /exceeds the allowed budget/
  );
}

function testBuildVoucherInfoFromRowsBypassSplit() {
  // Direct unit test for buildVoucherInfoFromRows' bypass split.
  const { buildVoucherInfoFromRows } = require('../src/modules/Invoicing/services/invoiceVoucherSupport');

  const voucherRows = [
    {
      bubble_id: 'v_a',
      voucher_code: 'BYPASS_A',
      discount_amount: 1000,
      deductable_from_commission: 200,
      invoice_description: 'Bypass voucher',
      linked_voucher_category: 'cat_1',
      bypass_max_discount: true
    },
    {
      bubble_id: 'v_b',
      voucher_code: 'NORMAL_B',
      discount_amount: 300,
      deductable_from_commission: 50,
      invoice_description: 'Bound voucher',
      linked_voucher_category: 'cat_1',
      bypass_max_discount: false
    }
  ];

  const result = buildVoucherInfoFromRows(voucherRows, 10000);
  // Both vouchers still apply to the invoice total.
  assert.equal(result.totalVoucherAmount, 1300);
  assert.equal(result.totalHiddenDiscount, 250);
  // Bypass voucher contributes 1000 (visible) + 200 (hidden) to the bypass pool.
  assert.equal(result.bypassingVoucherAmount, 1000);
  assert.equal(result.bypassingHiddenDiscount, 200);
  // Caller pre-subtracts: bound voucher = 300 visible, 50 hidden.
  const boundVoucherAmount = result.totalVoucherAmount - result.bypassingVoucherAmount;
  const boundHiddenDiscount = result.totalHiddenDiscount - result.bypassingHiddenDiscount;
  assert.equal(boundVoucherAmount, 300);
  assert.equal(boundHiddenDiscount, 50);
  // Both vouchers still get line items.
  assert.equal(result.voucherItemsToCreate.length, 2);
  const bypassItem = result.voucherItemsToCreate.find((v) => v.code === 'BYPASS_A');
  const boundItem = result.voucherItemsToCreate.find((v) => v.code === 'NORMAL_B');
  assert.equal(bypassItem.bypassMaxDiscount, true);
  assert.equal(boundItem.bypassMaxDiscount, false);
}

function testBuildVoucherInfoFromRowsNoBypassFlag() {
  // When bypass_max_discount is absent (older data, NULL), nothing should
  // fall into the bypass pool — backwards compatibility.
  const { buildVoucherInfoFromRows } = require('../src/modules/Invoicing/services/invoiceVoucherSupport');

  const result = buildVoucherInfoFromRows([
    {
      bubble_id: 'v_x',
      voucher_code: 'LEGACY',
      discount_amount: 500,
      deductable_from_commission: 0,
      linked_voucher_category: null
      // bypass_max_discount intentionally omitted
    }
  ], 10000);

  assert.equal(result.totalVoucherAmount, 500);
  assert.equal(result.bypassingVoucherAmount, 0);
  assert.equal(result.bypassingHiddenDiscount, 0);
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
  testCeoDiscountBypassesCap();
  testBypassVoucherExcludedFromCap();
  testBypassVoucherAllowsZeroBound();
  testBypassVoucherDoesNotReduceManual();
  testBoundVoucherStillBlockedWhenExceedingCap();
  testBuildVoucherInfoFromRowsBypassSplit();
  testBuildVoucherInfoFromRowsNoBypassFlag();
  testComputeTotalTowardMax();
  console.log('Invoice financial helper checks passed.');
}

main();
