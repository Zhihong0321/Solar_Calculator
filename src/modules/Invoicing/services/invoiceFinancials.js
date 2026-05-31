/**
 * [AI-CONTEXT]
 * Domain: Invoicing Financial Rules
 * Primary Responsibility: Pure calculations and validation helpers for invoice pricing.
 * Stability: Keep this file side-effect free so repository code can stay focused on persistence work.
 *
 * Discount cap model (2026-05-31 redesign):
 *   - The maximum discount allowed on an invoice comes from `package.max_discount`.
 *   - The old tiered MANUAL_DISCOUNT_POLICY (percentage-of-price tiers) is removed.
 *   - Everything that reduces the invoice counts toward the cap ("total toward max"):
 *       manual discount + promo amount + visible voucher discount
 *       + SUM(voucher.deductable_from_commission) + abs(negative extra items)
 *   - max_discount NULL or <= 0 means NO CAP is enforced yet (admins populate it
 *     later). Enforcement only kicks in once a package has a positive max_discount.
 *   - CEO discount bypasses the cap entirely (handled by the caller).
 */
const APRIL_2026_PROMO_END = new Date('2026-07-01T00:00:00');

/**
 * Normalize a package max_discount value into a usable cap.
 * Returns a positive number when a cap is set, or 0 meaning "no cap enforced".
 */
function normalizePackageMaxDiscount(packageMaxDiscount) {
  const value = parseFloat(packageMaxDiscount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * Validate the combined discount load against the package max_discount cap.
 *
 * @param {number} packageMaxDiscount - package.max_discount (NULL/0 = no cap yet)
 * @param {number} totalTowardMax - sum of all amounts counting toward the cap
 * @param {number} totalHiddenDiscount - hidden commission deductions, surfaced
 *        separately so the error message can explain the breakdown.
 * @throws {Error} when a positive cap is set and totalTowardMax exceeds it.
 */
function validateDiscountLimit(packageMaxDiscount, totalTowardMax, totalHiddenDiscount = 0) {
  const cap = normalizePackageMaxDiscount(packageMaxDiscount);

  // No cap configured for this package yet — nothing to enforce.
  if (cap <= 0) return;

  const total = parseFloat(totalTowardMax) || 0;
  if (total > cap + 0.01) {
    const hidden = parseFloat(totalHiddenDiscount) || 0;
    throw new Error(
      `Total discount (RM ${total.toFixed(2)}) including hidden voucher costs (RM ${hidden.toFixed(2)}) exceeds package maximum (RM ${cap.toFixed(2)}).`
    );
  }
}

function isApril2026PromotionActive() {
  return new Date() < APRIL_2026_PROMO_END;
}

function getEarnNowRebateDiscount(panelQty) {
  if (!isApril2026PromotionActive()) return 0;

  const qty = parseInt(panelQty, 10) || 0;
  if (qty >= 11 && qty <= 18) return 1000;
  if (qty >= 19 && qty <= 25) return 1500;
  if (qty >= 26 && qty <= 30) return 2000;
  if (qty >= 31 && qty <= 36) return 2500;
  return 0;
}

function getEarthMonthGoGreenBonusDiscount(panelQty) {
  if (!isApril2026PromotionActive()) return 0;

  const qty = parseInt(panelQty, 10) || 0;
  if (qty >= 11 && qty <= 17) return 600;
  if (qty >= 18 && qty <= 24) return 1200;
  if (qty >= 25 && qty <= 36) return 1500;
  return 0;
}

function getParentsDayPromoDiscount(panelQty) {
  if (!isApril2026PromotionActive()) return 0;

  const qty = parseInt(panelQty, 10) || 0;
  if (qty >= 11 && qty <= 15) return 300;
  if (qty >= 16 && qty <= 19) return 500;
  if (qty >= 20 && qty <= 29) return 800;
  if (qty >= 30) return 1300;
  return 0;
}

function calculateInvoiceFinancials(data, packagePrice, totalVoucherAmount, panelQty = 0) {
  const {
    agentMarkup = 0,
    discountFixed = 0,
    discountPercent = 0,
    applySst = false,
    eppFeeAmount = 0,
    extraItems = [],
    applyEarnNowRebate = false,
    applyEarthMonthGoGreenBonus = false,
    applyParentsDayPromo = false
  } = data;

  const markupAmount = parseFloat(agentMarkup) || 0;
  const priceWithMarkup = packagePrice + markupAmount;

  let extraItemsTotal = 0;
  let extraItemsNegativeTotal = 0;
  if (Array.isArray(extraItems)) {
    extraItems.forEach((item) => {
      const totalPrice = parseFloat(item.total_price) || 0;
      extraItemsTotal += totalPrice;
      if (totalPrice < 0) extraItemsNegativeTotal += totalPrice;
    });
  }

  const maxNegative = -(packagePrice * 0.05);
  if (extraItemsNegativeTotal < maxNegative && packagePrice > 0) {
    throw new Error(
      `Additional items discount (RM ${Math.abs(extraItemsNegativeTotal).toFixed(2)}) exceeds the maximum allowed 5% of package price (RM ${Math.abs(maxNegative).toFixed(2)}).`
    );
  }

  let percentDiscountVal = 0;
  if (discountPercent > 0) {
    percentDiscountVal = (packagePrice * discountPercent) / 100;
  }

  const earnNowRebateDiscount = applyEarnNowRebate ? getEarnNowRebateDiscount(panelQty) : 0;
  const earthMonthGoGreenBonusDiscount = applyEarthMonthGoGreenBonus ? getEarthMonthGoGreenBonusDiscount(panelQty) : 0;
  const parentsDayPromoDiscount = applyParentsDayPromo ? getParentsDayPromoDiscount(panelQty) : 0;

  const trueSubtotal = priceWithMarkup
    + extraItemsTotal
    - discountFixed
    - percentDiscountVal
    - totalVoucherAmount
    - earnNowRebateDiscount
    - earthMonthGoGreenBonusDiscount
    - parentsDayPromoDiscount;

  if (trueSubtotal <= 0) {
    throw new Error('Total amount cannot be zero or negative after applying discounts and vouchers.');
  }

  const taxableSubtotal = Math.max(0, trueSubtotal);
  const sstRate = applySst ? 6.0 : 0;
  const sstAmount = applySst ? (taxableSubtotal * sstRate) / 100 : 0;
  const finalTotalAmount = taxableSubtotal + sstAmount + parseFloat(eppFeeAmount);

  return {
    markupAmount,
    priceWithMarkup,
    percentDiscountVal,
    extraItemsTotal,
    extraItemsNegativeTotal,
    taxableSubtotal,
    sstRate,
    sstAmount,
    finalTotalAmount,
    earnNowRebateDiscount,
    earthMonthGoGreenBonusDiscount,
    parentsDayPromoDiscount
  };
}

/**
 * Compute the total discount load that counts toward package.max_discount.
 * Mirrors the plan's core formula. All inputs are coerced to numbers.
 *
 *   totalTowardMax = manualDiscount + promoAmount + voucherVisibleDiscount
 *                  + totalHiddenDiscount + abs(negativeExtraItems)
 */
function computeTotalTowardMax({
  manualDiscount = 0,
  promoAmount = 0,
  voucherVisibleDiscount = 0,
  totalHiddenDiscount = 0,
  negativeExtraItems = 0
} = {}) {
  const manual = parseFloat(manualDiscount) || 0;
  const promo = parseFloat(promoAmount) || 0;
  const voucherVisible = parseFloat(voucherVisibleDiscount) || 0;
  const hidden = parseFloat(totalHiddenDiscount) || 0;
  const negItems = Math.abs(parseFloat(negativeExtraItems) || 0);
  return manual + promo + voucherVisible + hidden + negItems;
}

module.exports = {
  calculateInvoiceFinancials,
  validateDiscountLimit,
  computeTotalTowardMax,
  normalizePackageMaxDiscount
};
