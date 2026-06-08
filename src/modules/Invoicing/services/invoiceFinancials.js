/**
 * [AI-CONTEXT]
 * Domain: Invoicing Financial Rules
 * Primary Responsibility: Pure calculations and validation helpers for invoice pricing.
 * Stability: Keep this file side-effect free so repository code can stay focused on persistence work.
 *
 * Discount cap model (2026-06-03 redesign):
 *   - The guardrail is now `nett_price` — invoice total cannot go below it.
 *   - For packages WITH nett_price set: cap = price - nett_price (fixed RM floor).
 *   - For packages WITHOUT nett_price: cap = price * 0.07 (7% of package price).
 *   - Everything that reduces the invoice counts toward the cap ("total toward max"):
 *       custom discounts + promo amount + visible voucher discount
 *       + SUM(voucher.deductable_from_commission) + abs(negative extra items)
 *   - cap = 0 (or null/zero price) means NO CAP is enforced.
 *   - CEO discount bypasses the cap entirely (handled by the caller).
 */
const LEGACY_INVOICE_PROMOTIONS_ENABLED = false;
const PARENTS_DAY_2026_ENABLED = true;
const APRIL_2026_PROMO_END = new Date('2026-07-01T00:00:00');

function isApril2026PromotionActive() {
    return LEGACY_INVOICE_PROMOTIONS_ENABLED && new Date() < APRIL_2026_PROMO_END;
}

function isParentsDay2026Active() {
    return PARENTS_DAY_2026_ENABLED && new Date() < APRIL_2026_PROMO_END;
}

/**
 * Compute the maximum allowable discount from a package's nett_price.
 *
 * @param {number} packagePrice - package.price
 * @param {number} nettPrice - package.nett_price (nullable/0 = fallback to 7% cap)
 * @returns {number} Positive cap amount, or 0 meaning no cap enforced.
 *
 * Logic:
 *   - If nett_price is set and positive: cap = price - nett_price
 *   - Otherwise: cap = price * 0.07 (7% of package price)
 *   - If resulting cap is 0 or price is invalid: no cap enforced.
 */
function normalizeDiscountCap(packagePrice, nettPrice) {
  const price = parseFloat(packagePrice) || 0;
  if (price <= 0) return 0;

  const nett = parseFloat(nettPrice) || 0;
  let cap;
  if (nett > 0) {
    cap = price - nett;
  } else {
    cap = price * 0.07;
  }

  return cap > 0 ? cap : 0;
}

/**
 * Validate the final invoice total against the nett_price floor.
 *
 * @param {number} packagePrice - package.price
 * @param {number} nettPrice - package.nett_price (nullable/0 = fallback to 7% cap)
 * @param {number} totalTowardMax - sum of all amounts counting toward the discount budget
 * @param {number} totalHiddenDiscount - hidden commission deductions, surfaced
 *        separately so the error message can explain the breakdown.
 * @param {boolean} ceoDiscount - when true, the CEO discount is in effect and
 *        the cap is bypassed (mirrors existing caller-side behavior).
 * @throws {Error} when a cap is set and totalTowardMax exceeds it.
 *
 * NOTE: Vouchers with `bypass_max_discount = true` should have their amounts
 * (visible + hidden) removed from `totalTowardMax` / `totalHiddenDiscount`
 * BEFORE this function is called. That split is computed upstream in
 * `buildVoucherInfoFromRows` so the cap check only ever sees the
 * budget-bound amounts.
 */
function validateDiscountLimit(packagePrice, nettPrice, totalTowardMax, totalHiddenDiscount = 0, ceoDiscount = false) {
  // CEO discount bypasses the cap entirely (no per-voucher check needed either).
  if (ceoDiscount) return;

  const cap = normalizeDiscountCap(packagePrice, nettPrice);

  // No cap configured for this package — nothing to enforce.
  if (cap <= 0) return;

  const total = parseFloat(totalTowardMax) || 0;
  if (total > cap + 0.01) {
    const hidden = parseFloat(totalHiddenDiscount) || 0;
    const maxAllowed = cap.toFixed(2);
    const pkgPrice = parseFloat(packagePrice) || 0;
    const maxPercent = pkgPrice > 0 ? ((cap / pkgPrice) * 100).toFixed(2) : '0';
    throw new Error(
      `Total discount (RM ${total.toFixed(2)}) exceeds the allowed budget (RM ${maxAllowed} / ${maxPercent}% of package price). ` +
      `Hidden voucher costs (RM ${hidden.toFixed(2)}) count toward the limit. ` +
      `Reduce discounts or remove vouchers to proceed.`
    );
  }
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
  if (!isParentsDay2026Active()) return 0;

  const qty = parseInt(panelQty, 10) || 0;
  if (qty >= 10 && qty <= 15) return 800;
  if (qty >= 16 && qty <= 19) return 1000;
  if (qty >= 20 && qty <= 29) return 1300;
  if (qty >= 30 && qty <= 48) return 1800;
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
 * Compute the total discount load that counts toward the discount budget.
 * Mirrors the plan's core formula. All inputs are coerced to numbers.
 *
 *   totalTowardMax = customDiscount + promoAmount + voucherVisibleDiscount
 *                  + totalHiddenDiscount + abs(negativeExtraItems)
 *
 * The budget cap is: price - nett_price (or price * 0.07 if nett_price not set).
 *
 * NOTE: Bypass-flagged voucher amounts must be subtracted from
 * `voucherVisibleDiscount` and `totalHiddenDiscount` BEFORE this function is
 * called, so that a bypass voucher can never reduce the manual discount /
 * promo portion. The split is computed upstream in `buildVoucherInfoFromRows`
 * (returns `bypassingVoucherAmount` + `bypassingHiddenDiscount`).
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
  normalizeDiscountCap,
  computeTotalTowardMax
};
