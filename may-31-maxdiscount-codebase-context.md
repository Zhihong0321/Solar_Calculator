# Codebase Context for Discount System Redesign

**Companion to:** `may-31-maxdiscount-updateplan.md`  
**Purpose:** Give any new AI agent enough codebase knowledge to execute the plan without re-exploring.

---

## Key Files & Their Roles

### Frontend — Invoice Creation

| File | Role |
|---|---|
| `public/templates/create_invoice.html` | Main HTML template. Contains `discountGiven` input (line ~477), promo checkboxes, voucher section, CEO discount. **Phase 2 target.** |
| `public/js/pages/create_invoice.js` | Create invoice JS. Contains `MANUAL_DISCOUNT_POLICY` (line ~287), `parseDiscount()` (line ~526), `updateInvoicePreview()` (line ~1124), `loadDraftVoucherStepForPackage()` (line ~1463). **Phase 3 target.** |
| `public/js/pages/edit_invoice.js` | Edit invoice JS. Same functions as create. `MANUAL_DISCOUNT_POLICY` (line ~47), `parseDiscount()` (line ~686). **Phase 6 target.** |
| `public/js/pages/invoice_page_shared.js` | Shared validation. `validateInvoiceSubmitState()` (line ~390) checks `window._maxDiscountExceeded`. `fetchVoucherPreviewData()` (line ~354). **Phase 3 target.** |
| `public/js/components/invoiceVoucherStep.js` | Voucher selection UI component. `extractCategories()` (line ~38) maps voucher fields including `discountAmount`, `discountPercent`. **Must add `deductable_from_commission` here.** |

### Backend — Invoice & Voucher Services

| File | Role |
|---|---|
| `src/modules/Invoicing/services/invoiceFinancials.js` | **Critical.** Contains `MANUAL_DISCOUNT_POLICY` tiered array (line 7-11), `getManualDiscountPolicy()` (line 15), `validateManualDiscountLimit()` (line 26), `calculateInvoiceFinancials()` (line 72). **Phase 1 & 5 target — replace tiered policy with `package.max_discount`.** |
| `src/modules/Invoicing/services/invoiceVoucherSupport.js` | Voucher query helpers. `buildVoucherInfoFromRows()` (line 7) — does NOT include `deductable_from_commission`. `loadVoucherCategoriesForSummary()` (line 128) — queries voucher rows. **Phase 1 target — add hidden discount fields.** |
| `src/modules/Invoicing/services/invoiceService.js` | Invoice creation orchestration. Calls `validateManualDiscountLimit()`, `calculateInvoiceFinancials()`. **Phase 5 target — add total discount validation.** |
| `src/modules/Invoicing/services/invoiceLookupSupport.js` | `getPackageById()` (line 7) — already returns `max_discount` from package table. |
| `src/modules/Invoicing/services/invoiceRepo.js` | Invoice persistence. Already handles `discount_fixed`, `discount_percent`, `voucher_code`. Line 435: copies `max_discount` when cloning package. |
| `src/modules/Voucher/services/voucherRepo.js` | Voucher CRUD. Line 387: `safeDeductable = data.deductable_from_commission ? parseFloat(data.deductable_from_commission) : 0`. Line 397: inserts `deductable_from_commission` column. **Already stores it — just not surfaced to invoice flow.** |

### Database

| Table | Key Columns |
|---|---|
| `voucher` | `bubble_id`, `title`, `voucher_code`, `voucher_type`, `discount_amount`, `discount_percent`, **`deductable_from_commission`**, `available_until`, `voucher_availability`, `invoice_description`, `linked_voucher_category`, `access_tag`, `allowed_users`, `active`, `delete` |
| `voucher_category` | `bubble_id`, `name`, `active`, `disabled`, `max_selectable`, `min_package_amount`, `max_package_amount`, `min_panel_quantity`, `max_panel_quantity`, `package_type_scope` |
| `invoice_voucher_selection` | `bubble_id`, `linked_invoice`, `linked_voucher`, `linked_voucher_category`, `voucher_code_snapshot`, `voucher_title_snapshot`, `discount_amount_snapshot`, `discount_percent_snapshot` |
| `package` | `bubble_id`, `package_name`, `price`, `panel`, `panel_qty`, `type`, **`max_discount`**, `invoice_desc`, `active` |
| `invoice` | `bubble_id`, `discount_fixed`, `discount_percent`, `voucher_code`, `total_amount`, `linked_package` |

**New columns needed on `voucher`:** `countdown_expires_at TIMESTAMPTZ`, `preset_description TEXT`

---

## Functions to REMOVE / REPLACE

| What | Where | Replace With |
|---|---|---|
| `MANUAL_DISCOUNT_POLICY` constant | `create_invoice.js:287`, `edit_invoice.js:47`, `invoiceFinancials.js:7` | `package.max_discount` from DB |
| `getManualDiscountPolicy()` | `create_invoice.js:289`, `edit_invoice.js:49`, `invoiceFinancials.js:15` | `getMaxDiscount()` reading `window.packageMaxDiscount` |
| `window.maxDiscountAllowed` | `create_invoice.js:1819`, `edit_invoice.js:1916` | `window.packageMaxDiscount` |
| `window.maxDiscountPercentAllowed` | `create_invoice.js:1820`, `edit_invoice.js:1917` | Remove (no longer percent-based) |
| `validateManualDiscountLimit()` | `invoiceFinancials.js:26` | `validateDiscountLimit(packageMaxDiscount, totalTowardMax)` |
| `discountGiven` text input | `create_invoice.html:477-483` | Custom discount panel (array of discount entries) |
| `parseDiscount()` parsing single string | `create_invoice.js:526`, `edit_invoice.js:686` | `customDiscounts` array with structured entries |

---

## Functions to ADD

| Function | Purpose |
|---|---|
| `getMaxDiscount()` | Returns `package.max_discount` from `window.packageMaxDiscount` |
| `getVoucherHiddenDiscount()` | Sum of `deductable_from_commission` from selected vouchers |
| `getTotalTowardMax()` | Sum of ALL negative amounts toward max discount |
| `getAvailableDiscount()` | Remaining discount budget for custom input |
| `validateDiscountLimit()` | Blocks save if total > max (unless CEO discount) |
| `addCustomDiscount(type, value, desc)` | Add structured discount entry |
| `removeCustomDiscount(id)` | Remove discount entry |
| `getCustomDiscountTotal()` | Sum of custom discount amounts |
| `checkCountdownDiscounts()` | Check expiry on vouchers with `countdown_expires_at` |
| `formatCountdown(ms)` | Format milliseconds as HH:MM:SS |
| `renderPresetDiscountCards()` | Render preset description cards with countdown timers |

---

## Current Discount Validation Flow (to be replaced)

1. Agent types in `discountGiven` text field (e.g. "500 10%")
2. `parseDiscount()` splits into `{fixed: 500, percent: 10}`
3. `updateInvoicePreview()` calculates `totalDiscountValue = fixed + (price * percent / 100)`
4. Compares against `window.maxDiscountAllowed` (from `MANUAL_DISCOUNT_POLICY` tier)
5. Sets `window._maxDiscountExceeded = true` if over limit
6. `validateInvoiceSubmitState()` blocks form submit if `_maxDiscountExceeded`

**Problem:** Voucher `deductable_from_commission` is never checked. Voucher visible discounts are not counted toward max. Only manual discount is checked.

---

## Voucher Data Flow (current)

1. `loadDraftVoucherStepForPackage(packageId)` fetches voucher categories + vouchers
2. `invoiceVoucherStep.js` `extractCategories()` maps voucher fields → `discountAmount`, `discountPercent`
3. Selected vouchers stored in `selectedDraftVouchers` array
4. `getSelectedDraftVoucherTotal()` sums visible discount amounts
5. `buildDraftVoucherRows()` builds preview line items
6. **`deductable_from_commission` is never passed to frontend** — gap to fix

---

## CEO Discount (unchanged)

- Hidden section, visible only to phone numbers `60127299201`, `601121000099`
- When CEO discount is entered, regular discount input is disabled
- CEO discount **bypasses all max discount limits** — this stays the same
- `fetchAndApplyCeoDiscountAccess()` in `invoice_page_shared.js` handles visibility

---

## Quick Start for New Agent

1. Read `may-31-maxdiscount-updateplan.md` for the full plan
2. Read this file for codebase context
3. Start with **Phase 0** (DB migration) — simplest, no code dependencies
4. Then **Phase 1** (backend) — surface `deductable_from_commission` in API
5. Then **Phase 2** (HTML) — build the new discount section
6. Then **Phase 3** (JS) — wire up the logic
7. Then **Phase 4** (countdown) — add timer script
8. Then **Phase 5** (backend validation) — server-side enforcement
9. Then **Phase 6** (edit page) — parity with create page
