# Work Report — June 1, 2026 — Solar Calculator v2

## Tasks Completed

### Invoice Discount System Redesign — package.max_discount + Hidden Voucher Costs

Replaced the old tiered manual-discount policy (5–7% of package price) with a
package-driven discount cap (`package.max_discount`), and surfaced hidden voucher
commission costs (`deductable_from_commission`) so they count toward the cap.
Added a dedicated Discount & Promotions section with a live discount budget,
custom discounts, preset cards, and a countdown timer.

**Discount cap behaviour:**
- Maximum discount now comes from `package.max_discount`.
- When `max_discount` is NULL or 0, no cap is enforced (values populated later).
- Everything that lowers the invoice counts toward the cap: custom discounts,
  promotions, visible voucher discount, hidden commission deductions, and the
  absolute value of negative extra items.
- CEO discount continues to bypass the cap entirely.

**Frontend — new Discount & Promotions section (create + edit):**
- Discount Budget bar showing Maximum, Hidden Consumed, and Available discount.
- Custom discount panel (fixed RM / percentage) with an applied-discounts list
  and remove buttons.
- Promotions relocated into the new section.
- Preset discount cards driven by an in-code config, with a UTC+8 countdown that
  auto-expires presets to RM0.
- Selected-voucher summary showing visible discount and commission deduction.
- The free-text "Discount Given" input was replaced with a hidden bridge field so
  the existing `discount_given` request contract continues to work unchanged.

**Backend:**
- `invoiceFinancials.js` — removed `MANUAL_DISCOUNT_POLICY`,
  `getManualDiscountPolicy`, and `validateManualDiscountLimit`; added
  `validateDiscountLimit`, `computeTotalTowardMax`, and
  `normalizePackageMaxDiscount`; exposed extra-item negative totals from
  `calculateInvoiceFinancials`.
- `invoiceVoucherSupport.js` — aggregated `totalHiddenDiscount` and surfaced
  `deductableFromCommission` per voucher; added `max_discount` to the voucher
  step summary.
- `invoiceRepo.js` — both create and update paths validate the combined discount
  load against `package.max_discount`; voucher preview now returns `maxDiscount`.

**Files changed:**
- `public/templates/create_invoice.html` — new Discount & Promotions section, hidden discount bridge, nav entries
- `public/templates/edit_invoice.html` — same section and nav entries
- `public/js/pages/create_invoice.js` — discount manager, preset/countdown logic, summary bar, preview rewrite
- `public/js/pages/edit_invoice.js` — same as create plus hydration of existing invoice discounts
- `public/js/pages/invoice_page_shared.js` — updated max-discount submit error message
- `public/js/components/invoiceVoucherStep.js` — carry `deductableFromCommission` through voucher selection
- `src/modules/Invoicing/services/invoiceFinancials.js` — new validation and formula helpers
- `src/modules/Invoicing/services/invoiceVoucherSupport.js` — hidden discount aggregation, max_discount on summary
- `src/modules/Invoicing/services/invoiceRepo.js` — discount validation on create/update, maxDiscount in preview
- `scripts/test_invoice_financials.js` — updated tests for the new validation and formula
- `public/css/tailwind.css` — rebuilt for new utility classes

**Verification:**
- Financial helper tests pass.
- All modified JS passes syntax checks; backend modules load cleanly.
- Server boots without errors; HTML tag balance preserved.
