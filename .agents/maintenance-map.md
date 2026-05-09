# Maintenance Map

Date: 2026-04-22
Stage: map-ready

Top digestion candidates:
- `src/modules/Invoicing/services/invoiceHtmlGeneratorV2.js`
  - 2459 lines in the current tree and currently the largest active invoicing service file.
  - It still mixes server-side quotation rendering with a large embedded browser script for signature capture, sharing, PDF download, and solar estimate interactions.
  - `src/modules/Invoicing/api/invoiceViewRoutes.js` still calls it for live quotation and PDF views, so it remains a high-value but well-scoped digestion target.
- `public/js/app.js`
  - 2034 lines and still mixes calculator state, tariff/package data loading, billing-cycle logic, battery modeling, chart rendering, and invoice-link generation.
  - Valuable digestion target, but broader blast radius than the invoicing renderer slice above.

Top cleanup candidates:
- `legacy_t3_html_presentation/`
  - Context-noise inventory still flags it as a likely residual folder.
  - Repo search found active `/t3_html_presentation` usage pointing at `mobile_html_output`, not this folder, so `legacy_t3_html_presentation/` looks like a plausible cleanup target after a dedicated validation pass.
- `database/migrations/010_patch_legacy_invoices.sql`
  - Flagged only by the context-noise keyword scan because of `legacy` in the filename.
  - This is a lower-confidence cleanup candidate and should not be touched without a dedicated migration-history check.

Top optimization candidates:
- `public/js/pages/create_invoice.js` and `public/js/pages/edit_invoice.js`
  - They are now down to 1842 and 1854 lines, with shared startup, prefill, listener wiring, and workspace shell behavior already moved into `public/js/pages/invoice_page_shared.js` (435 lines).
  - More optimization is still possible, but the last three maintenance runs already reduced this slice, so it is no longer the clearest immediate next target.
- Invoice rendering overlap across `invoiceHtmlGenerator.js`, `invoiceHtmlGeneratorV2.js`, and `invoiceHtmlGeneratorV3.js`
  - Multiple renderer generations remain in the tree with overlapping presentation-link and quotation-output responsibilities.
  - This looks structurally important, but it is a wider optimization question than the next single maintenance move.

Recommended next target:
- `src/modules/Invoicing/services/invoiceHtmlGeneratorV2.js` digestion pass.
  - Reason: best balance of clarity, confidence, and value after the invoice-page optimization work.
  - It is the clearest current large mixed-responsibility file, and extracting its embedded browser interaction helpers would shrink a live invoicing hotspot without reopening the broader calculator front end.
