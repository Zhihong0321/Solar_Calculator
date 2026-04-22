# Maintenance Map

Date: 2026-04-21
Stage: map-ready

Top digestion candidates:
- `src/modules/Invoicing/services/invoiceHtmlGeneratorV2.js`
  - 2459 lines in the current tree.
  - It combines server-side invoice rendering with a very large embedded browser script for signature capture, sharing, PDF download, and solar estimate interactions.
  - Strong digestion target now that invoiceRepo.js has already been reduced through earlier helper extractions.
- `public/js/app.js`
  - 2034 lines and still mixes calculator math, data loading, DOM event wiring, chart rendering, billing-cycle logic, battery tuning, and invoice-link generation.
  - High-value front-end digestion target, but broader blast radius than the cleanup and optimization candidates.

Top cleanup candidates:
- `docs/SALES_TEAM_INVOICE_LINK_GUIDE.md`
  - 789 lines and still presents `package_id` as the default invoice-link format even though the guide also documents `linked_package` as the current required parameter.
  - It also points readers to a Python/uvicorn localhost flow that does not match this Node/Express repo.
  - Strong cleanup candidate because it appears stale, is unreferenced in the repo, and creates instruction noise for both humans and AI.
- `legacy_t3_html_presentation/`
  - Context-noise inventory still flags it as a likely residual folder.
  - It was not sampled deeply in this run, so it remains a secondary cleanup candidate rather than the next action.

Top optimization candidates:
- `public/js/pages/create_invoice.js` and `public/js/pages/edit_invoice.js`
  - 2113 and 2116 lines respectively, with sampled sections showing duplicated voucher preview calls, package/referral handling, customer field hydration, and submit payload construction.
  - Strong optimization candidate because a shared invoice-page support boundary would reduce duplicate business rules without reopening the repository-layer work immediately.
- Invoicing link parameter normalization flow.
  - URL parameter aliases like `linked_package` and `package_id` are normalized across front-end page scripts and back-end service code.
  - This is a follow-on optimization target after the larger create/edit duplication is clarified.

Recommended next target:
- `docs/SALES_TEAM_INVOICE_LINK_GUIDE.md` cleanup pass.
  - Reason: best balance of clarity, confidence, and value.
  - It appears stale, is unreferenced in the repo, and is safer to remove from the active docs path before taking on the larger duplicated invoice-page optimization work.
