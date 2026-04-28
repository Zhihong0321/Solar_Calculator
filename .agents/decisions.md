# Decision Log

- repo: Solar Calculator v2
- purpose: record WHY architectural choices were made so future AI agents do not accidentally reverse them

---

<!-- Add new entries at the top, below this line -->

## 2026-04-28 — SEDA ownership uses user bubble IDs

- made by: GPT-5 Codex
- reason: The repo is phasing out agent-profile identity for SEDA ownership. Production SEDA rows historically mixed `user.bubble_id` and `agent.bubble_id` in `seda_registration.agent`, which caused access failures when the same real person had different user and agent-profile IDs. SEDA ownership now treats `user.bubble_id` as canonical and only resolves agent-profile IDs as a migration compatibility bridge.
- rejected alternatives:
  - keep `agent.bubble_id` as the SEDA owner: rejected because the product direction is to phase out agent profiles and it keeps identity checks split
  - check only `created_by`: rejected because SEDA staff/admin users can create forms for sales agents, so creator and assigned sales owner are different people
- constraints it encodes: access control correctness, production data migration safety, future agent-profile deprecation
- files affected: `routes/sedaRoutes.js`, `src/modules/Invoicing/services/sedaRepo.js`, `src/modules/Invoicing/services/sedaService.js`, `database/migrations/028_normalize_seda_agent_to_user_bubble_id.sql`
- do not reverse without: explicit user approval and a replacement identity migration plan
- status: ACTIVE

## 2026-04-23 — Verified payment totals must come only from the payment table

- made by: GPT-5 Codex
- reason: Submitted payments are part of a workflow/review queue, not the source of truth for verified revenue. This bug has recurred multiple times because AI agents keep collapsing submitted and verified states into one concept. Verified totals, paid balances, and verified payment UI must come only from rows in `payment`. Submitted payments may still count as "has payment" for edit locks, but they must stay separate from verified money.
- rejected alternatives:
  - infer verified money from `submitted_payment.status`: rejected because the workflow status is not a reliable financial source of truth and has repeatedly produced severe finance regressions
  - merge `submitted_payment` and `payment` into one verified payment list: rejected because the same real-world payment can appear in both lifecycle stages and gets double-counted or misclassified
- constraints it encodes: financial accuracy, auditability, regression prevention
- files affected: `src/modules/Invoicing/api/invoiceOfficeRoutes.js`, `public/templates/invoice_office.html`, `src/modules/Invoicing/services/invoiceRepo.js`
- do not reverse without: explicit user approval and a deliberate redesign to a single audited payment source of truth with migration rules for existing invoice/payment data
- status: STABLE
