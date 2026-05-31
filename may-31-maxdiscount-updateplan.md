# Invoice Discount & Voucher System — Implementation Plan

**Date:** May 31, 2026  
**Status:** Approved — Ready for Implementation

---

## Resolved Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Max discount source | `package.max_discount` from DB. `MANUAL_DISCOUNT_POLICY` is **obsolete**. CEO Discount bypasses all. |
| 2 | Identify hidden discount vouchers | Any voucher where `deductable_from_commission > 0` — no "gift" check needed |
| 3 | "Company first 5 customer" | Just a preset description text — sales gimmick, no real counting logic |
| 4 | Countdown timezone | UTC+8 (Malaysia) |
| 5 | What counts toward max | **Everything negative** + hidden: `manualDiscount + promoAmount + voucherVisibleDiscount + SUM(deductable_from_commission) + abs(negativeExtraItems)` |

---

## Core Formula

```
totalTowardMax = manualDiscount
               + promoAmount
               + voucherVisibleDiscount
               + SUM(deductable_from_commission)
               + abs(negativeExtraItems)

if totalTowardMax > package.max_discount → BLOCK invoice save

availableDiscount = package.max_discount
                  - SUM(deductable_from_commission)
                  - abs(negativeExtraItems)
                  - promoAmount
                  - voucherVisibleDiscount
```

---

## Phase 0: DB Migration — New Columns on `voucher`

**File:** `database/migrations/2026-05-31-add-voucher-countdown-and-preset.sql`

Add 2 new columns:

- `countdown_expires_at TIMESTAMPTZ` — when the countdown discount expires (NULL = no countdown)
- `preset_description TEXT` — e.g. `"Countdown discount, confirm before {TIME} = Discount RM1000"` or `"Company first 5 customer of current month"`

No need for `hidden_discount_amount` or `is_free_gift` — `deductable_from_commission` already covers the hidden discount concept.

### Phase 0 Checklist

- [ ] Write migration SQL for `countdown_expires_at` and `preset_description` columns
- [ ] Run migration against `prod_main` database
- [ ] Verify columns exist via `\d voucher`

---

## Phase 1: Backend — Surface Hidden Discount Data in Voucher Preview

**Goal:** Make `deductable_from_commission`, `countdown_expires_at`, and `preset_description` available to the frontend through the existing voucher preview API.

### Files to Modify

- `src/modules/Invoicing/services/invoiceVoucherSupport.js`
  - `loadVoucherCategoriesForSummary()` — include `deductable_from_commission`, `countdown_expires_at`, `preset_description` in voucher rows returned to frontend
  - `buildVoucherInfoFromRows()` — include `deductable_from_commission` in voucher item output

- `src/modules/Invoicing/services/invoiceFinancials.js`
  - Replace `MANUAL_DISCOUNT_POLICY` tiered logic with `package.max_discount`
  - Add `totalHiddenDiscount` calculation (sum of `deductable_from_commission` from selected vouchers)
  - Update `validateManualDiscountLimit()` → `validateDiscountLimit(packageMaxDiscount, totalTowardMax)`
  - Error message: `"Total discount (RM X) including hidden voucher costs (RM Y) exceeds package maximum (RM Z)"`

- `src/modules/Invoicing/services/invoiceService.js`
  - Pass `package.max_discount` through invoice creation flow
  - Validate total discount including hidden amounts on create/update
  - Return `maxDiscount` and `availableDiscount` in API response for frontend display

- `src/modules/Invoicing/services/invoiceLookupSupport.js`
  - `getPackageById()` — already returns `max_discount`, ensure it's passed to invoice creation

### Phase 1 Checklist

- [ ] Add `deductable_from_commission`, `countdown_expires_at`, `preset_description` to voucher SELECT queries in `invoiceVoucherSupport.js`
- [ ] Add `totalHiddenDiscount` calculation in `invoiceFinancials.js`
- [ ] Replace `MANUAL_DISCOUNT_POLICY` with `package.max_discount` in `invoiceFinancials.js`
- [ ] Update `validateManualDiscountLimit()` → `validateDiscountLimit()` using `package.max_discount`
- [ ] Update `invoiceService.js` to pass and validate `package.max_discount`
- [ ] Test: create invoice with voucher that has `deductable_from_commission > 0` → verify hidden discount is returned in API response
- [ ] Test: create invoice where total exceeds `package.max_discount` → verify error is thrown

---

## Phase 2: Frontend HTML — Dedicated Discount Section

**Goal:** Replace the scattered discount UI with a single, clear section.

### File to Modify

- `public/templates/create_invoice.html`

### New Section: `<section id="discount-promo-voucher">`

Position: between `price-controls` and `voucher-selection`

#### 2.1 — Discount Summary Bar (always visible)

```html
<div class="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
  <h3>Discount Budget</h3>
  <div>Maximum Discount: <span id="maxDiscountValue">RM 0.00</span></div>
  <div>Hidden Discount Consumed: <span id="hiddenDiscountConsumed">RM 0.00</span></div>
  <div>Available Discount: <span id="availableDiscountValue">RM 0.00</span></div>
</div>
```

- **Maximum Discount** = `package.max_discount`
- **Hidden Discount Consumed** = `SUM(deductable_from_commission)` of selected vouchers
- **Available Discount** = maxDiscount − hiddenConsumed − abs(negativeItems) − promoAmount − voucherVisibleDiscount

#### 2.2 — Promotions (moved from price-controls)

Move the `#promotionOptionsSection` block (Earn Now, Earth Month, Parents' Day checkboxes) into this section.

#### 2.3 — Custom Discount Panel

```html
<div class="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4">
  <h3>Add Custom Discount</h3>
  <select id="customDiscountType">  <!-- Fixed RM / Percentage -->
  <input id="customDiscountValue" type="number">
  <input id="customDiscountDescription" type="text" placeholder="Optional description">
  <button id="addCustomDiscountBtn">Add</button>
</div>
<div id="appliedDiscountsList">
  <!-- List of applied custom discounts with remove buttons -->
</div>
```

#### 2.4 — Preset Discount Cards

```html
<div id="presetDiscountsContainer">
  <!-- Rendered dynamically from voucher.preset_description -->
  <!-- Example card:
    "Countdown discount, confirm before 15:30:00 = Discount RM1000"
    [Countdown Timer: 02:15:33]
    [APPLY] button
  -->
  <!-- Example card:
    "Company first 5 customer of current month"
    [APPLY] button
  -->
</div>
```

#### 2.5 — Voucher Summary

Compact list of selected vouchers showing:
- Voucher title + code
- Visible discount amount
- Hidden cost (`deductable_from_commission`) — labeled "Commission Deduct"

### Changes to Existing HTML

- **Remove** `discountGiven` text input from `price-controls` section (line 477-483)
- **Remove** `inputMaxDiscountRow` / `inputMaxDiscountDisplay` helper text (line 481)
- **Move** `#promotionOptionsSection` from `price-controls` into new section
- **Keep** CEO Discount section as-is (hidden, authorized users only)
- **Keep** Additional Items section in `price-controls`
- **Keep** SST checkbox in `price-controls`

### Phase 2 Checklist

- [ ] Create new `<section id="discount-promo-voucher">` in `create_invoice.html`
- [ ] Add Discount Summary Bar with `maxDiscountValue`, `hiddenDiscountConsumed`, `availableDiscountValue`
- [ ] Move promotion checkboxes into new section
- [ ] Add Custom Discount Panel (type selector, value input, description, add button)
- [ ] Add Applied Discounts List container
- [ ] Add Preset Discount Cards container
- [ ] Add Voucher Summary container
- [ ] Remove old `discountGiven` input from `price-controls`
- [ ] Remove `inputMaxDiscountRow` / `inputMaxDiscountDisplay`
- [ ] Update navigation rail to include new section

---

## Phase 3: Frontend JS — Discount Manager Logic

**Goal:** Replace `parseDiscount` + tiered `MANUAL_DISCOUNT_POLICY` with new discount manager that uses `package.max_discount` and factors in all negative amounts.

### Files to Modify

- `public/js/pages/create_invoice.js`
- `public/js/pages/invoice_page_shared.js`
- `public/js/components/invoiceVoucherStep.js` — include `deductable_from_commission` in voucher data

### New Functions

```js
// Get max discount from package data (replaces MANUAL_DISCOUNT_POLICY)
function getMaxDiscount() {
  return parseFloat(window.packageMaxDiscount) || 0;
}

// Sum of deductable_from_commission from selected vouchers
function getVoucherHiddenDiscount() {
  return selectedDraftVouchers.reduce((sum, v) => {
    return sum + (parseFloat(v.deductable_from_commission) || 0);
  }, 0);
}

// Total of all amounts counting toward max discount
function getTotalTowardMax() {
  const manualDiscount = getCustomDiscountTotal();  // sum of all custom discounts
  const promoAmount = getAppliedPromotionAmounts().totalAppliedAmount;
  const voucherVisible = getSelectedDraftVoucherTotal(packagePrice);
  const voucherHidden = getVoucherHiddenDiscount();
  const negativeItems = Math.abs(getExtraItemsNegativeTotal());
  return manualDiscount + promoAmount + voucherVisible + voucherHidden + negativeItems;
}

// Remaining discount budget for custom input
function getAvailableDiscount() {
  const max = getMaxDiscount();
  const nonManual = getAppliedPromotionAmounts().totalAppliedAmount
                  + getSelectedDraftVoucherTotal(packagePrice)
                  + getVoucherHiddenDiscount()
                  + Math.abs(getExtraItemsNegativeTotal());
  return Math.max(0, max - nonManual);
}

// Validate — blocks save if exceeded
function validateDiscountLimit() {
  const ceoDiscountActive = (document.getElementById('ceoDiscount')?.value?.trim() || '').length > 0;
  if (ceoDiscountActive) {
    window._maxDiscountExceeded = false;
    return true;
  }
  const total = getTotalTowardMax();
  const max = getMaxDiscount();
  if (total > max + 0.01) {
    window._maxDiscountExceeded = true;
    return false;
  }
  window._maxDiscountExceeded = false;
  return true;
}

// Custom discount management
let customDiscounts = [];  // [{id, type:'fixed'|'percent', value, description, amount}]

function addCustomDiscount(type, value, description) {
  const available = getAvailableDiscount();
  const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
  let amount = 0;
  if (type === 'fixed') amount = parseFloat(value) || 0;
  if (type === 'percent') amount = packagePrice * ((parseFloat(value) || 0) / 100);
  if (amount > available + 0.01) return false;  // exceeds available
  customDiscounts.push({ id: Date.now(), type, value, description, amount });
  updateInvoicePreview();
  return true;
}

function removeCustomDiscount(id) {
  customDiscounts = customDiscounts.filter(d => d.id !== id);
  updateInvoicePreview();
}

function getCustomDiscountTotal() {
  return customDiscounts.reduce((sum, d) => sum + d.amount, 0);
}
```

### Changes to Existing Functions

- **`updateInvoicePreview()`** — use `getMaxDiscount()`, `getTotalTowardMax()`, `getAvailableDiscount()`; update summary bar elements; render custom discounts as line items; render voucher hidden costs
- **`validateInvoiceSubmitState()`** in `invoice_page_shared.js` — use `validateDiscountLimit()` instead of old `window.maxDiscountAllowed` check; update Swal error message to show hidden discount breakdown
- **Remove** `MANUAL_DISCOUNT_POLICY` constant and `getManualDiscountPolicy()` function from both `create_invoice.js` and `edit_invoice.js`
- **Remove** `window.maxDiscountAllowed` and `window.maxDiscountPercentAllowed` assignments
- **Add** `window.packageMaxDiscount` assignment when package is loaded (from `pkg.max_discount`)
- **Update** `buildInvoiceRequestData()` — send `customDiscounts` array instead of single `discount_given` string

### Phase 3 Checklist

- [ ] Add `deductable_from_commission` to voucher data in `invoiceVoucherStep.js` extractCategories
- [ ] Set `window.packageMaxDiscount` from `pkg.max_discount` when package loads in `create_invoice.js`
- [ ] Implement `getMaxDiscount()`, `getVoucherHiddenDiscount()`, `getTotalTowardMax()`, `getAvailableDiscount()`
- [ ] Implement `addCustomDiscount()`, `removeCustomDiscount()`, `getCustomDiscountTotal()`
- [ ] Implement `validateDiscountLimit()` using `package.max_discount`
- [ ] Update `updateInvoicePreview()` to render discount summary bar + custom discounts + hidden costs
- [ ] Update `validateInvoiceSubmitState()` in `invoice_page_shared.js`
- [ ] Remove `MANUAL_DISCOUNT_POLICY` and `getManualDiscountPolicy()` from `create_invoice.js`
- [ ] Remove `window.maxDiscountAllowed` / `window.maxDiscountPercentAllowed` assignments
- [ ] Update `buildInvoiceRequestData()` to send structured discount data
- [ ] Remove old `discountGiven` input event listeners
- [ ] Add event listeners for custom discount panel (add/remove)

---

## Phase 4: Countdown Discount Script

**Goal:** Auto-check countdown expiry on page load and on interval. If expired, mark as RM0.

### Logic

```js
function checkCountdownDiscounts() {
  selectedDraftVouchers.forEach(voucher => {
    if (!voucher.countdown_expires_at) return;
    const expiry = new Date(voucher.countdown_expires_at);
    const now = new Date();
    // Convert now to UTC+8 for comparison
    const malaysiaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    const malaysiaExpiry = new Date(expiry.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    
    if (malaysiaNow >= malaysiaExpiry) {
      voucher._countdownExpired = true;
      voucher._countdownRemaining = 0;
    } else {
      voucher._countdownExpired = false;
      voucher._countdownRemaining = malaysiaExpiry - malaysiaNow;
    }
  });
  renderPresetDiscountCards();
  updateInvoicePreview();
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function renderPresetDiscountCards() {
  const container = document.getElementById('presetDiscountsContainer');
  if (!container) return;
  container.innerHTML = '';
  
  selectedDraftVouchers.forEach(voucher => {
    if (!voucher.preset_description) return;
    const card = document.createElement('div');
    card.className = 'rounded-xl border p-3 ...';
    
    if (voucher._countdownExpired) {
      card.innerHTML = `
        <div class="text-red-600 font-bold">EXPIRED</div>
        <div class="line-through">${voucher.preset_description}</div>
        <div>Discount: RM 0.00</div>
      `;
    } else if (voucher.countdown_expires_at) {
      card.innerHTML = `
        <div>${voucher.preset_description}</div>
        <div class="text-amber-600 font-bold">Countdown: ${formatCountdown(voucher._countdownRemaining)}</div>
        <div>Discount: RM ${voucher.discount_amount || 0}</div>
      `;
    } else {
      card.innerHTML = `
        <div>${voucher.preset_description}</div>
        <div>Discount: RM ${voucher.discount_amount || 0}</div>
      `;
    }
    container.appendChild(card);
  });
}

// Start countdown interval
setInterval(() => {
  checkCountdownDiscounts();
}, 1000);
```

### Phase 4 Checklist

- [ ] Implement `checkCountdownDiscounts()` with UTC+8 timezone handling
- [ ] Implement `formatCountdown(ms)` helper
- [ ] Implement `renderPresetDiscountCards()` with expired/active/preset states
- [ ] Start `setInterval` every 1 second on page load
- [ ] Call `checkCountdownDiscounts()` on initial page load and after voucher selection changes
- [ ] Test: set a countdown expiry in the past → verify shows EXPIRED + RM0
- [ ] Test: set a countdown expiry in the future → verify shows live countdown
- [ ] Test: wait for countdown to expire during session → verify auto-updates to EXPIRED

---

## Phase 5: Backend Validation

**Goal:** Server-side enforcement mirroring client-side logic.

### File to Modify

- `src/modules/Invoicing/services/invoiceService.js`

### Changes

- On `createInvoice()` and `updateInvoice()`:
  1. Fetch `package.max_discount` from package record
  2. Calculate `totalTowardMax` = manualDiscount + promoAmount + voucherVisibleDiscount + SUM(deductable_from_commission) + abs(negativeExtraItems)
  3. If `totalTowardMax > package.max_discount` AND no CEO discount → throw error
  4. Error message: `"Total discount (RM X) including hidden voucher costs (RM Y) exceeds package maximum (RM Z)"`

- `src/modules/Invoicing/services/invoiceFinancials.js`
  - Remove `MANUAL_DISCOUNT_POLICY` constant
  - Remove `getManualDiscountPolicy()` function
  - Update `validateManualDiscountLimit()` → `validateDiscountLimit(packageMaxDiscount, totalTowardMax)`
  - Update `calculateInvoiceFinancials()` to accept `packageMaxDiscount` parameter

### Phase 5 Checklist

- [ ] Update `invoiceService.js` to fetch `package.max_discount` and validate total discount
- [ ] Update `invoiceFinancials.js` — remove `MANUAL_DISCOUNT_POLICY`, update validation function
- [ ] Add `totalTowardMax` calculation including `deductable_from_commission`
- [ ] Return clear error with breakdown when limit exceeded
- [ ] Test: create invoice via API with total discount > max_discount → verify 400 error
- [ ] Test: create invoice with CEO discount bypassing limit → verify success

---

## Phase 6: Edit Invoice Parity

**Goal:** Apply same discount section and logic to the edit invoice page.

### Files to Modify

- `public/templates/edit_invoice.html` (if exists, or same template)
- `public/js/pages/edit_invoice.js`

### Changes

- Same discount section HTML as Phase 2
- Same discount manager logic as Phase 3
- Same countdown logic as Phase 4
- On page load: hydrate existing discount items from invoice data into `customDiscounts` array
- Load existing voucher selections and their `deductable_from_commission` values
- Check countdown expiry for existing vouchers

### Phase 6 Checklist

- [ ] Add discount section to edit invoice HTML
- [ ] Port discount manager functions to `edit_invoice.js`
- [ ] Remove `MANUAL_DISCOUNT_POLICY` from `edit_invoice.js`
- [ ] Hydrate existing discounts into `customDiscounts` on load
- [ ] Load voucher `deductable_from_commission` for existing selections
- [ ] Check countdown expiry on load
- [ ] Update `updateInvoicePreview()` in edit page
- [ ] Update `validateInvoiceSubmitState()` in edit page
- [ ] Test: edit existing invoice with vouchers → verify hidden discount shown
- [ ] Test: edit invoice where total exceeds max → verify blocked

---

## Master Checklist (All Requirements)

- [ ] **#1** Dedicated discount/promo/voucher section with better UX
- [ ] **#2** Show available discount = `max_discount − (hidden + negative items + promo + voucher visible)`
- [ ] **#3** Block save when `totalTowardMax > package.max_discount`
- [ ] **#4** Surface `deductable_from_commission` in voucher preview API
- [ ] **#5** Custom discount input (fixed RM / %) when available > 0
- [ ] **#6** Discount panel with % and fixed RM inputs
- [ ] **#7** Preset descriptions from `voucher.preset_description` (text only, sales gimmick)
- [ ] **#8** Countdown: auto-expire, set RM0, timezone UTC+8
- [ ] **#9** Always show available + maximum discount in dedicated section
- [ ] **#10** Replace `MANUAL_DISCOUNT_POLICY` with `package.max_discount`
- [ ] **#11** CEO Discount bypasses all limits (unchanged)
