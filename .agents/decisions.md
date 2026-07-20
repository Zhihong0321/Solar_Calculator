# Decision Log

- repo: Solar Calculator v2
- purpose: record WHY architectural choices were made so future AI agents do not accidentally reverse them

---

<!-- Add new entries at the top, below this line -->

## 2026-07-20 — SEDA files move to Cloudflare R2 on a PUBLIC bucket

- made by: Claude Opus 4.8
- reason: The Railway attached volume hit 100% and blocked writes. SEDA is the heaviest writer (MyKad scans, PDFs, up to 12 TNB bills per registration). Moving uploads to R2 removes the volume as a scaling limit and lets the app stay on a small disk.
- decision: uploads go straight from memory to R2; the DB stores the public R2 URL; reads fall back disk -> R2 so pre-migration rows keep working.
- KNOWN ACCEPTED RISK: the bucket is publicly readable, so MyKad (national ID) scans, property ownership proof and TNB bills are reachable by anyone holding the URL, with no revocation path. Filenames carry only ~32 bits of randomness over a known bubble_id. This mirrors the pre-existing `/uploads` express.static exposure rather than introducing it, but it widens it and moves it outside the app's control. PDPA exposure is real and this was accepted deliberately to unblock the full disk.
- rejected alternatives:
  - private bucket + authenticated proxy route: correct, but needs signed-URL/streaming support that r2Storage.js does not have, and the volume was already full
  - split public/private buckets by sensitivity: best end state, deferred for the same reason
- follow-ups required: signed URLs or an auth-checked proxy for PII fields; a purge job (recycle_bin_upload.purged_at is currently written by nothing, so deleted files are never reclaimed from R2)
- do not reverse without: confirming every seda_registration row has been migrated, since the disk fallback is what keeps legacy rows readable
- status: ACTIVE

## 2026-07-14 — Support AI uses curated historical patterns, not raw ticket notes

- made by: GPT-5 Codex
- reason: Production support tickets contain useful patterns for customer intake and reassurance, but their technician remarks are internal, inconsistent, and may include customer-specific or unsafe technical detail. The Support AI therefore needs a reviewed, customer-safe support history plus live ticket-status queries instead of general model knowledge or raw-ticket retrieval.
- rejected alternatives:
  - use raw historical tickets as a retrieval corpus: rejected because it risks exposing personal/internal information and can reproduce unreviewed technical instructions or unprofessional wording
  - let the model answer from general solar knowledge: rejected because the requested product must describe Eternalgy's actual handling patterns and must not invent diagnosis, warranty, timing, or liability claims
- constraints it encodes: customer privacy, safe technical communication, accurate expectation-setting, preservation of the original `support_ticket` schema
- files affected: `support_history.md`, `support-ai-buildplan.md`
- do not reverse without: explicit user approval, a reviewed customer-facing knowledge source, and confirmation that privacy and safety controls remain equivalent or stronger
- status: ACTIVE

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
