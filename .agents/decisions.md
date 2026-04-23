# Decision Log

- repo: Solar Calculator v2
- purpose: record WHY architectural choices were made so future AI agents do not accidentally reverse them

---

<!-- Add new entries at the top, below this line -->

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
