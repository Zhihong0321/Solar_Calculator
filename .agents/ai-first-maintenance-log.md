# AI First Maintenance Log

- repo: Solar Calculator v2
- purpose: staged maintenance memory for AI-first codebase management

---

## 2026-04-21

- mode: action
- chosen stage: baseline-locked
- chosen target: Solar estimate normalization and invoice preview rendering
- reason: First maintenance run required a trusted baseline before later mapping or cleanup work.
- status: complete
- action taken: Initialized AI-first maintenance memory, ran the snapshot solar estimate consistency check, ran a syntax check on server.js, and wrote a baseline note.
- verification: npm run test:solar-estimate-consistency passed; node --check server.js passed; live calculator scenarios were skipped because DATABASE_URL and DATABASE_URL_TARIFF were unavailable.
- blockers: No blocking failure, but database-backed runtime verification is still unavailable in this environment.
- next exact action: Run a read-only map-ready pass to rank one maintenance target, or verify a DB-backed core flow before any risky structural change.
- next recommended stage: map-ready
## 2026-04-21

- mode: action
- chosen stage: map-ready
- chosen target: Repo maintenance map and ranked next target
- reason: The baseline pass completed and the next safe maintenance step was to rank one high-confidence target before any cleanup or refactor.
- status: complete
- action taken: Ran the large-file and context-noise inventory, sampled five files, searched for active references, and wrote a maintenance map with ranked digestion, cleanup, and optimization candidates.
- verification: Reviewed the sampled active files and noise candidates; repo search showed active code uses src/modules/Invoicing/services/invoiceRepo.js and found no active references to legacy_backup or tmp_find_payment_loo.js.
- blockers: No blocker for planning. Any cleanup-ready action still requires a dedicated branch per branch-safety policy.
- next exact action: Create or switch to a dedicated maintenance branch, then run a cleaning-ready pass targeting legacy_backup as an unused duplicate invoicing backup.
- next recommended stage: cleaning-ready
## 2026-04-21

- mode: action
- chosen stage: cleaning-ready
- chosen target: legacy_backup folder
- reason: The map-ready pass ranked legacy_backup as a high-confidence unused duplicate code folder that creates context noise for future AI work.
- status: complete
- action taken: Created a dedicated cleanup branch and moved legacy_backup out of the active repo path into archive/legacy_backup-2026-04-21.
- verification: Confirmed legacy_backup no longer exists at the repo root, confirmed archive/legacy_backup-2026-04-21 exists, and found no active references in src, routes, scripts, public, tests, package.json, or server.js.
- blockers: none
- next exact action: Run another cleaning-ready pass targeting tmp_find_payment_loo.js, or switch focus to digestion-ready for src/modules/Invoicing/services/invoiceRepo.js.
- next recommended stage: cleaning-ready
## 2026-04-21

- mode: action
- chosen stage: cleaning-ready
- chosen target: tmp_find_payment_loo.js
- reason: The map-ready pass ranked this file as a high-confidence residual: an unreferenced one-off database probe with a hardcoded invoice id.
- status: complete
- action taken: Deleted tmp_find_payment_loo.js from the repo root.
- verification: Confirmed tmp_find_payment_loo.js no longer exists and found no remaining repo references to the filename.
- blockers: none
- next exact action: Start a digestion-ready pass for src/modules/Invoicing/services/invoiceRepo.js to split the oversized active invoicing repository into clearer units.
- next recommended stage: digestion-ready
## 2026-04-21

- mode: action
- chosen stage: digestion-ready
- chosen target: src/modules/Invoicing/services/invoiceRepo.js financial-rule helpers
- reason: invoiceRepo.js was oversized and mixed SQL persistence with stable pricing and rebate calculations, which made the repository boundary harder for AI agents to reason about.
- status: complete
- action taken: Extracted the manual discount validation and invoice financial calculation helpers into src/modules/Invoicing/services/invoiceFinancials.js, rewired invoiceRepo.js to use that module, and added a focused verification script.
- verification: node scripts/test_invoice_financials.js passed; node --check src/modules/Invoicing/services/invoiceRepo.js passed; node --check src/modules/Invoicing/services/invoiceFinancials.js passed; npm run test:solar-estimate-consistency passed.
- blockers: Database-backed invoice creation/update flows remain unverified in this environment because no live database credentials were available for an end-to-end runtime check.
- next exact action: If continuing digestion on invoiceRepo.js, extract one more stable helper boundary such as schema metadata helpers or voucher-summary helpers; otherwise stop here and keep the smaller financial module as the completed slice.
- next recommended stage: digestion-ready
## 2026-04-21

- mode: action
- chosen stage: digestion-ready
- chosen target: src/modules/Invoicing/services/invoiceRepo.js schema helpers
- reason: invoiceRepo.js still mixed schema introspection with invoice persistence, and the schema helper boundary was a stable next slice after the financial-rule extraction.
- status: complete
- action taken: Extracted cached schema introspection helpers into src/modules/Invoicing/services/invoiceSchemaSupport.js and rewired invoiceRepo.js to import them while preserving the hasTable export.
- verification: node --check src/modules/Invoicing/services/invoiceRepo.js passed; node --check src/modules/Invoicing/services/invoiceSchemaSupport.js passed; node -e require('./src/modules/Invoicing/services/invoiceRepo') passed; node scripts/test_invoice_financials.js passed; npm run test:solar-estimate-consistency passed.
- blockers: Database-backed invoice creation and update flows remain unverified end-to-end because live database credentials were unavailable in this environment.
- next exact action: If continuing digestion on invoiceRepo.js, extract the voucher-step summary and eligibility helpers into one focused voucher module.
- next recommended stage: digestion-ready
## 2026-04-21

- mode: action
- chosen stage: digestion-ready
- chosen target: src/modules/Invoicing/services/invoiceRepo.js voucher helpers
- reason: invoiceRepo.js still mixed voucher eligibility and voucher-step read helpers with core invoice persistence, and that voucher slice was the next stable boundary after financial and schema helper extraction.
- status: complete
- action taken: Extracted voucher info builders, voucher eligibility rules, and voucher-step read helpers into src/modules/Invoicing/services/invoiceVoucherSupport.js, rewired invoiceRepo.js to use the module, and added focused voucher helper tests.
- verification: node --check src/modules/Invoicing/services/invoiceRepo.js passed; node --check src/modules/Invoicing/services/invoiceVoucherSupport.js passed; node -e require('./src/modules/Invoicing/services/invoiceRepo') passed; node scripts/test_invoice_voucher_support.js passed; node scripts/test_invoice_financials.js passed; npm run test:solar-estimate-consistency passed; DB proxy confirmed voucher_category, invoice_voucher_selection, and voucher tables exist with active data.
- blockers: Full end-to-end invoice mutation flows remain unverified because the DB proxy token is read-only and cannot exercise write paths.
- next exact action: If continuing digestion on invoiceRepo.js, extract normalizeNullableNumber and invoice estimate field mapping into one small input-normalization helper.
- next recommended stage: digestion-ready
## 2026-04-21

- mode: action
- chosen stage: digestion-ready
- chosen target: src/modules/Invoicing/services/invoiceRepo.js estimate helpers
- reason: invoiceRepo.js still mixed estimate input normalization and estimate-field SQL mapping with core invoice persistence, and that repeated field-plumbing was the next stable boundary after the voucher helper extraction.
- status: complete
- action taken: Extracted nullable estimate normalization and create/update estimate-field mapping helpers into src/modules/Invoicing/services/invoiceEstimateSupport.js, rewired invoiceRepo.js to use the module, and added focused estimate helper tests.
- verification: node --check src/modules/Invoicing/services/invoiceRepo.js passed; node --check src/modules/Invoicing/services/invoiceEstimateSupport.js passed; node -e require('./src/modules/Invoicing/services/invoiceRepo') passed; node scripts/test_invoice_estimate_support.js passed; node scripts/test_invoice_financials.js passed; node scripts/test_invoice_voucher_support.js passed; npm run test:solar-estimate-consistency passed; DB proxy confirmed all five estimate columns exist on the invoice table.
- blockers: Full end-to-end invoice mutation flows remain unverified because the DB proxy token is read-only and cannot execute write-path checks.
- next exact action: If continuing digestion on invoiceRepo.js, isolate create/update invoice-item insertion helpers into one focused support module.
- next recommended stage: digestion-ready
