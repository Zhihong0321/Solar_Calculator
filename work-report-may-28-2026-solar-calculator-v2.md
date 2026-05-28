# Work Report — May 28, 2026 — Solar Calculator v2

## Tasks Completed

### CEO Discount Feature

Added a CEO Discount input field to both the Create Invoice and Edit Invoice pages. The field is hidden by default and only shown to users whose login phone number matches `60127299201` or `601121000099`.

**Behaviour:**
- When CEO Discount is entered, the regular Discount Given field is automatically disabled and cleared.
- CEO Discount has no upper limit — the tiered max discount policy (5–7% of package price) is bypassed entirely on both frontend and backend.
- The invoice preview and EPP fee calculations use the CEO discount value when it is active.
- On form submit, the CEO discount value is sent as `discount_given` with a `ceo_discount: true` flag.

**Files changed:**
- `public/templates/create_invoice.html` — added CEO Discount input section
- `public/templates/edit_invoice.html` — added CEO Discount input section
- `public/js/pages/invoice_page_shared.js` — added `CEO_DISCOUNT_PHONES` constant, `fetchAndApplyCeoDiscountAccess()` function, updated `validateInvoiceSubmitState` to skip max discount check when CEO discount is active, updated `buildInvoiceRequestData` to include `ceo_discount` flag
- `public/js/pages/create_invoice.js` — updated `updateInvoicePreview` and `calculateAllEPPFees` to use CEO discount when active, called `fetchAndApplyCeoDiscountAccess()` on page load
- `public/js/pages/edit_invoice.js` — same updates as create_invoice.js
- `src/modules/Invoicing/services/invoiceService.js` — passed `ceoDiscount` flag through to repo payload in both `createInvoice` and `createInvoiceVersion`
- `src/modules/Invoicing/services/invoiceRepo.js` — bypassed `validateManualDiscountLimit` when `data.ceoDiscount` is true, for both create and update paths

### Invoice Mobile View Optimization

Optimized the presentation of discount and voucher rows in the responsive layout (mobile view) to prevent unnecessary vertical expansion and display more compactly.

**Behaviour:**
- Detects discount, voucher, promo, rebate, bonus, and reward items using negative pricing or description text matching.
- Applies a `discount-row` class to target rows.
- Restructures layout on mobile to hide unit price, quantity, and item number details for these entries.
- Renders the description on the left and the total discount amount on the right in a single, clean horizontal row inside the card.

**Files changed:**
- `src/modules/Invoicing/services/invoiceHtmlGeneratorV2.js` — added `discount-row` class detection/assignment and added compact mobile CSS rules inside max-width 768px media query.
