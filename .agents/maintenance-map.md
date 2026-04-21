# Maintenance Map

Date: 2026-04-21
Stage: map-ready

Top digestion candidates:
- `src/modules/Invoicing/services/invoiceRepo.js`
  - 2746 lines in the current tree.
  - The file header says it should stay focused on low-level PostgreSQL operations, but the implementation also carries promotion rules, voucher orchestration, hybrid-upgrade flows, ownership checks, invoice history logic, and financial calculations.
  - High value digestion target because many API routes and services depend on it.
- `src/modules/Invoicing/services/invoiceHtmlGeneratorV2.js`
  - 2167 lines with mixed responsibilities.
  - It combines server-side HTML generation with a very large embedded browser script for signature capture, PDF download, sharing, and solar estimate scenario state.
  - Good digestion target after the repo shape is safer to change.
- `public/js/app.js`
  - 1809 lines and mixes calculator math, data loading, DOM event wiring, chart rendering, billing-cycle logic, battery tuning, and invoice-link generation.
  - High-value front-end digestion target, but broader blast radius than the cleanup candidates.

Top cleanup candidates:
- `legacy_backup/`
  - Inventory flagged it as context noise.
  - Sampled file `legacy_backup/services/invoiceRepo.js` is a large older duplicate of the active invoicing repository.
  - Repo search found active code importing `src/modules/Invoicing/services/invoiceRepo.js` and found no active references to `legacy_backup`.
  - Strong candidate for a branch-based soft-remove or quarantine pass because it creates competing entry points for future AI sessions.
- `tmp_find_payment_loo.js`
  - 8-line one-off DB probe script with a hardcoded invoice id.
  - Not part of `package.json` scripts and not referenced by the repo search.
  - Very high-confidence low-risk cleanup candidate.

Top optimization candidates:
- Invoice rendering entry points in the invoicing module.
  - Repo search shows `invoiceViewRoutes` still wiring `invoiceHtmlGenerator`, `invoiceHtmlGeneratorV2`, and `invoiceHtmlGeneratorV3`.
  - This likely reflects staged evolution rather than a finished boundary, so it is a future optimization target after cleanup and digestion work reduce ambiguity.
- Active invoicing domain boundaries.
  - `invoiceRepo.js` is imported by many API routes and services, which suggests the current repository boundary has absorbed orchestration concerns that may belong elsewhere.
  - This is a later optimization target, not the next safest action.

Recommended next target:
- `legacy_backup/` cleanup pass on a dedicated branch.
  - Reason: best balance of clarity, confidence, and value.
  - It appears to be unused duplicate code, it increases AI confusion, and cleaning it up is safer than digesting a live 2k+ line production file as the very next step.
