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
## 2026-04-21

- mode: action
- chosen stage: digestion-ready
- chosen target: src/modules/Invoicing/services/invoiceRepo.js invoice-item insertion helpers
- reason: invoiceRepo.js still carried repeated invoice_item insert boilerplate across create and voucher-update paths, and that persistence plumbing was the next stable boundary after estimate helper extraction.
- status: complete
- action taken: Extracted reusable invoice_item insert and linked-item sync helpers into src/modules/Invoicing/services/invoiceItemSupport.js, rewired invoiceRepo.js to use them, and added focused invoice-item helper tests.
- verification: node --check src/modules/Invoicing/services/invoiceRepo.js passed; node --check src/modules/Invoicing/services/invoiceItemSupport.js passed; node -e require('./src/modules/Invoicing/services/invoiceRepo') passed; node scripts/test_invoice_item_support.js passed; node scripts/test_invoice_financials.js passed; node scripts/test_invoice_voucher_support.js passed; node scripts/test_invoice_estimate_support.js passed; npm run test:solar-estimate-consistency passed.
- blockers: DB proxy token expired before the live invoice_item schema check could complete, and write-path invoice mutations still cannot be exercised with a read-only token.
- next exact action: Renew the DB proxy token, then verify invoice_item schema live or continue digestion by extracting referral/customer dependency helpers from invoiceRepo.js.
- next recommended stage: digestion-ready
## 2026-04-21

- mode: action
- chosen stage: digestion-ready
- chosen target: src/modules/Invoicing/services/invoiceRepo.js lookup helpers
- reason: invoiceRepo.js still mixed stable package/template/voucher lookup queries with higher-level invoice orchestration, and that lookup slice remained a clear low-risk extraction after the dependency helper split.
- status: complete
- action taken: Extracted package, invoice-template, and voucher lookup helpers into src/modules/Invoicing/services/invoiceLookupSupport.js, rewired invoiceRepo.js to use the module, and added focused lookup helper tests. Also fixed the missing normalizeVoucherCategoryPackageType import used by voucher preview mapping.
- verification: node --check src/modules/Invoicing/services/invoiceRepo.js passed; node --check src/modules/Invoicing/services/invoiceLookupSupport.js passed; node -e require('./src/modules/Invoicing/services/invoiceRepo') passed; node scripts/test_invoice_lookup_support.js passed; node scripts/test_invoice_dependency_support.js passed; node scripts/test_invoice_item_support.js passed; node scripts/test_invoice_estimate_support.js passed; node scripts/test_invoice_voucher_support.js passed; node scripts/test_invoice_financials.js passed; npm run test:solar-estimate-consistency passed; DB proxy confirmed package, invoice_template, and voucher tables exist.
- blockers: Write-path invoice flows still cannot be exercised end-to-end with the current read-only DB proxy token, and the remaining invoiceRepo business clusters are no longer an obviously clear next digestion slice.
- next exact action: If continuing, verify write paths with a write-capable or runtime DB session before deeper business-logic extraction from invoiceRepo.js.
- next recommended stage: digestion-ready
## 2026-04-21

- mode: action
- chosen stage: baseline-locked
- chosen target: DB-backed invoice write-path verification
- reason: Deeper invoiceRepo digestion was no longer obviously safe without proving the live write paths and table permissions behind invoice creation, item writes, and referral updates.
- status: complete
- action taken: Validated live write capability with the full DB proxy token by performing residue-free customer and invoice_item insert/delete checks plus no-op invoice and referral updates, then confirmed the temporary rows were removed.
- verification: DB proxy confirmed invoice_item schema columns; customer insert succeeded and was deleted; invoice_item insert succeeded and was deleted; invoice linked_invoice_item no-op update succeeded; referral linked_invoice no-op update succeeded; final existence check confirmed the temporary customer and invoice_item rows were gone.
- blockers: No immediate database-permission blocker remains, but the next code extraction target is no longer an obviously clear low-risk slice.
- next exact action: run codebase-mapper to identify next target
- next recommended stage: map-ready
## 2026-04-21

- mode: action
- chosen stage: map-ready
- chosen target: Updated repo maintenance map and ranked next target
- reason: Live DB write-path verification removed the main blocker around invoiceRepo.js, so the next safe step was to remap the repo and deliberately pick the clearest single follow-up target instead of guessing at another refactor slice.
- status: complete
- action taken: Ran the large-file and context-noise inventory again, sampled the current invoice UI and doc hotspots, and rewrote the maintenance map to reflect the slimmer invoiceRepo.js, the large invoice UI files, and the stale sales invoice link guide.
- verification: Inventory now shows invoiceRepo.js down to 2287 lines; sampled create_invoice.js and edit_invoice.js remain over 2.1k lines with overlapping invoice workflow logic; repo search found docs/SALES_TEAM_INVOICE_LINK_GUIDE.md is unreferenced while its contents still default to legacy package_id guidance and a mismatched Python/uvicorn local flow.
- blockers: none
- next exact action: Run a cleaning-ready pass targeting docs/SALES_TEAM_INVOICE_LINK_GUIDE.md as a stale active doc.
- next recommended stage: cleaning-ready
## 2026-04-21

- mode: action
- chosen stage: cleaning-ready
- chosen target: docs/SALES_TEAM_INVOICE_LINK_GUIDE.md
- reason: The refreshed maintenance map ranked this guide as the clearest residual source of confusion because it was unreferenced in the repo and still taught legacy invoice-link defaults plus a mismatched local runtime.
- status: complete
- action taken: Soft-removed the guide from the active docs path by moving it to archive/soft-removed-docs/SALES_TEAM_INVOICE_LINK_GUIDE-2026-04-21.md and adding a dated reason banner at the top of the archived copy.
- verification: Confirmed docs/SALES_TEAM_INVOICE_LINK_GUIDE.md no longer exists, confirmed the archived soft-removed copy exists, and repo search found no remaining references to SALES_TEAM_INVOICE_LINK_GUIDE in the current tree.
- blockers: none
- next exact action: Run an optimization-ready pass targeting the duplicated workflow logic shared by public/js/pages/create_invoice.js and public/js/pages/edit_invoice.js.
- next recommended stage: optimization-ready
## 2026-04-21

- mode: action
- chosen stage: optimization-ready
- chosen target: Shared invoice page workflow helpers for create/edit quotation pages
- reason: The create and edit invoice pages still duplicated the same voucher-preview fetch, submit validation, loading-state handling, and base request-payload assembly, which made pricing and form behavior harder to maintain consistently.
- status: complete
- action taken: Extracted those shared browser-side workflow primitives into public/js/pages/invoice_page_shared.js, loaded that helper in both invoice page templates, and rewired public/js/pages/create_invoice.js plus public/js/pages/edit_invoice.js to use the shared boundary.
- verification: node --check passed for public/js/pages/invoice_page_shared.js, public/js/pages/create_invoice.js, and public/js/pages/edit_invoice.js; repo search confirmed both create_invoice.html and edit_invoice.html now load /js/pages/invoice_page_shared.js; both page scripts now call the shared helper for voucher preview loading, submit validation, loading-state handling, and request-data assembly.
- blockers: none
- next exact action: Continue the invoice-page optimization by extracting the shared initialization and URL-prefill flow that still spans public/js/pages/create_invoice.js and public/js/pages/edit_invoice.js.
- next recommended stage: optimization-ready
## 2026-04-22

- mode: action
- chosen stage: optimization-ready
- chosen target: Shared invoice page initialization and prefill helpers for create/edit quotation pages
- reason: After the first invoice-page optimization pass, both pages still duplicated page bootstrap, user-profile hydration, customer field prefills, discount formatting, and create-flow URL prefills, which kept the startup flow noisy and easy to drift apart.
- status: complete
- action taken: Extended public/js/pages/invoice_page_shared.js with shared startup and prefill helpers, then rewired public/js/pages/create_invoice.js and public/js/pages/edit_invoice.js to use the shared page bootstrap, user-profile fetch, customer field hydration, discount formatting, and create-flow query-prefill helpers.
- verification: node --check passed for public/js/pages/invoice_page_shared.js, public/js/pages/create_invoice.js, and public/js/pages/edit_invoice.js; repo search confirmed both pages now call initializeInvoicePageBase, fetchUserProfile, and the shared prefill helpers; create_invoice.js is down to 1708 lines and edit_invoice.js is down to 1723 lines in the current tree.
- blockers: none
- next exact action: Continue the invoice-page optimization by extracting the remaining shared listener wiring and section-status setup between public/js/pages/create_invoice.js and public/js/pages/edit_invoice.js.
- next recommended stage: optimization-ready
## 2026-04-22

- mode: action
- chosen stage: optimization-ready
- chosen target: Shared invoice page listener wiring and workspace-status helpers for create/edit quotation pages
- reason: After the startup/prefill extraction, both invoice pages still repeated the same DOM listener wiring for manual items, referral selection, pricing toggles, ballast updates, and payment methods, plus the same workspace status computation for package, customer, pricing, voucher, payment, and review sections.
- status: complete
- action taken: Extended public/js/pages/invoice_page_shared.js with shared listener-wiring and workspace-status helpers, then rewired public/js/pages/create_invoice.js and public/js/pages/edit_invoice.js to delegate those repeated UI flows to the shared boundary.
- verification: node --check passed for public/js/pages/invoice_page_shared.js, public/js/pages/create_invoice.js, and public/js/pages/edit_invoice.js; repo search confirmed both pages now call wireCommonInvoicePageInteractions and applyCommonWorkspaceStatuses; create_invoice.js is down to 1656 lines and edit_invoice.js is down to 1659 lines in the current tree.
- blockers: none
- next exact action: Continue the invoice-page optimization by extracting the remaining shared workspace shell navigation behavior between public/js/pages/create_invoice.js and public/js/pages/edit_invoice.js.
- next recommended stage: optimization-ready
## 2026-04-22

- mode: action
- chosen stage: optimization-ready
- chosen target: Shared invoice page workspace shell navigation helpers for create/edit quotation pages
- reason: After the listener and status extraction, both invoice pages still duplicated the same workspace shell navigation primitives for section status rendering, active-section refresh, scroll-to-section behavior, and mobile workspace panel wiring.
- status: complete
- action taken: Moved the shared workspace shell navigation behavior into public/js/pages/invoice_page_shared.js, rewired both invoice pages to use the shared shell helpers directly, and removed the remaining page-local shell wrappers.
- verification: node --check passed for public/js/pages/invoice_page_shared.js, public/js/pages/create_invoice.js, and public/js/pages/edit_invoice.js; repo search confirmed the shared module now owns initWorkspaceShell, setSectionStatus, scrollToWorkspaceSection, and refreshActiveWorkspaceSection; create_invoice.js is down to 1591 lines and edit_invoice.js is down to 1598 lines in the current tree.
- blockers: none
- next exact action: Re-run codebase-mapper to identify the next highest-value maintenance target now that the invoice page duplication slice is substantially reduced.
- next recommended stage: map-ready
