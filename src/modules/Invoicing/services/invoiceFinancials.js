/**
 * [AI-CONTEXT]
 * Domain: Invoicing Financial Rules
 * Primary Responsibility: Pure calculations and validation helpers for invoice pricing.
 * Stability: Keep this file side-effect free so repository code can stay focused on persistence work.
 */
const MANUAL_DISCOUNT_POLICY = [
  { minPrice: 40000, maxPercent: 7 },
  { minPrice: 30000, maxPercent: 6 },
  { minPrice: 18000, maxPercent: 5 }
];

const APRIL_2026_PROMO_END = new Date('2026-05-01T00:00:00');

function getManualDiscountPolicy(packagePrice) {
  const normalizedPrice = parseFloat(packagePrice) || 0;
  const matchedTier = MANUAL_DISCOUNT_POLICY.find((tier) => normalizedPrice >= tier.minPrice);
  const maxPercent = matchedTier ? matchedTier.maxPercent : 0;

  return {
    maxPercent,
    maxAmount: normalizedPrice * (maxPercent / 100)
  };
}

function validateManualDiscountLimit(packagePrice, totalDiscountValue) {
  const { maxPercent, maxAmount } = getManualDiscountPolicy(packagePrice);

  if (totalDiscountValue > (maxAmount + 0.01)) {
    throw new Error(
      `Manual discount (RM ${totalDiscountValue.toFixed(2)}) exceeds the maximum allowed for this package tier of ${maxPercent}% of package price (RM ${maxAmount.toFixed(2)}). Vouchers are not subject to this limit.`
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

function calculateInvoiceFinancials(data, packagePrice, totalVoucherAmount, panelQty = 0) {
  const {
    agentMarkup = 0,
    discountFixed = 0,
    discountPercent = 0,
    applySst = false,
    eppFeeAmount = 0,
    extraItems = [],
    applyEarnNowRebate = false,
    applyEarthMonthGoGreenBonus = false
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

  const trueSubtotal = priceWithMarkup
    + extraItemsTotal
    - discountFixed
    - percentDiscountVal
    - totalVoucherAmount
    - earnNowRebateDiscount
    - earthMonthGoGreenBonusDiscount;

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
    taxableSubtotal,
    sstRate,
    sstAmount,
    finalTotalAmount,
    earnNowRebateDiscount,
    earthMonthGoGreenBonusDiscount
  };
}

module.exports = {
  calculateInvoiceFinancials,
  validateManualDiscountLimit
};
