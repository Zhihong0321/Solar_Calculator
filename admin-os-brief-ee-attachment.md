# Brief for the Admin OS team — `ee_attachment` migration

**From:** Solar Calculator v2 team
**Date:** 2026-07-25
**Read with:** `ee-attachment-update-Admin-OS.md` (the schema/read reference — this brief supersedes it where they disagree)

---

## First: you were right, and thank you

You found that `src/app/(app)/engineering-v2/actions.ts` writes to `invoice.linked_roof_image` and `invoice.site_assessment_image` via `TYPE_CONFIG`.

**We did not know that.** Our migration doc claimed the old columns were "still written by the current live page", and that claim came from surveying writers inside the Solar Calculator v2 repo only. We never checked the Admin OS codebase. Admin OS is a second writer, our cutover plan did not account for it, and had you not caught it, admin-uploaded photos would have landed in a column the new agent page no longer reads — and phase 3 would have deleted them.

The plan below is corrected for that.

---

## What changed in the plan

We are **not** doing a silent cutover. Both apps go into a **shared maintenance window** so the cutover happens with zero live writers, then we bring both back up on the new contract.

That means one thing is needed from you **today**, before anything else.

---

## ASK 1 — Maintenance mode in Admin OS (today, blocking)

We have built maintenance mode on our side. Admin OS needs its own — if only one app goes dark, admins keep writing to the columns we are freezing and the window achieves nothing.

Your stack is Next.js App Router, so this is `middleware.ts` at the project root rather than an Express middleware. Behaviour to match:

**Requirements**

1. **Env-flag driven** — `MAINTENANCE_MODE=1` turns it on. No code deploy needed to toggle.
2. **Blocks everything** — pages, server actions, route handlers, API endpoints. It must run before any handler touches the database. A server action that writes during the window defeats the purpose.
3. **Correct status** — respond `503` with `Retry-After: 1800` and `Cache-Control: no-store`. Not 200-with-a-message (clients and crawlers will cache it), not 404.
4. **JSON for API-shaped requests**, HTML page for browser navigations. Distinguish on path prefix and `Accept`.
5. **Bypass key so your team can still work** — `MAINTENANCE_BYPASS_KEY=<secret>`. Accept it three ways:
   - `?maintenance_key=<secret>` in the URL, which then sets an httpOnly cookie (12h) so subsequent browsing just works
   - the same cookie on later requests
   - an `X-Maintenance-Key` header, for curl and scripts
   - Compare in constant time. Wrong key must behave exactly like no key.
6. **One always-200 path** — e.g. `/__maintenance-health`, exempt from the block. If your platform health check 503s during a planned window it may kill or stop routing to the container.
7. **Inline the maintenance page** — do not serve it from a static route or a layout that depends on the app booting normally. A maintenance page that depends on the stack you are taking down renders a blank screen.
8. **Mobile-first page.** Our users are on phones.

Our implementation is at `src/core/middleware/maintenance.js` in the Solar Calculator v2 repo if you want a reference — the logic ports directly, only the framework hook differs.

**Confirm to us when this is deployed and you have tested the bypass key.** We will not schedule the window until both sides are ready.

---

## ASK 2 — Switch your reads to `ee_attachment`

You can do this **now**, independently of the window. `ee_attachment` is already live in `prod_main` and already contains every photo from both old columns — 3,019 rows across 431 invoices, backfilled 2026-07-25.

Read queries are in `ee-attachment-update-Admin-OS.md`. The one rule that has no equivalent in the old world:

```sql
WHERE deleted_at IS NULL AND purged_at IS NULL
```

Deleting a photo now sets a flag; the row stays. `array_remove` used to make a URL genuinely vanish. **Every query needs this filter or deleted photos reappear on your screens.** It is the most likely bug in this migration.

---

## ASK 3 — Dual-write to `ee_attachment`

Change `TYPE_CONFIG`'s write path so an admin upload writes **both** the legacy column (as today) **and** an `ee_attachment` row.

Dual-write, not switch-write. It means neither team has to deploy in lockstep with the other, and both the old and new pages stay correct throughout.

### Write contract

| Column | Value | Notes |
|---|---|---|
| `owner_type` | `'invoice'` | |
| `owner_id` | `invoice.bubble_id` | see the open versioning question below |
| `linked_customer` | `invoice.linked_customer` | denormalized; powers customer-wide galleries |
| `module` | `'admin-os'` | **your attribution field.** Ours writes `'invoice-office'`. `NOT NULL`. |
| `category` | `'site_assessment'` | `NOT NULL` |
| `doc_type` | `'roof_angle'` for roof, `'site_other'` for generic site | see below |
| `sort_order` | `0`, or max+1 within the slot | |
| `file_url` | the URL you already store | |
| `storage_subdir` | `'attachments'` | use ours or purge/migration tooling will not find your objects |
| `storage_key` | `attachments/<unique-filename>` | ours are `{docType}_{ownerId}_{ts}_{rand}.{ext}` |
| `original_filename`, `mime_type`, `size_bytes` | as uploaded | |
| `checksum_sha256` | SHA-256 of stored bytes | optional but do it — duplicate detection uses it |
| `uploaded_by` | admin user id | |
| `uploaded_by_name` | display name | denormalized on purpose; user records change, audit should not |
| `uploaded_by_role` | `'admin'` | |
| `metadata_json` | `{}`, or `{"floor": N}` for `house_db` | |

### Answering your specific questions

**doc_type — use the same vocabulary as agents. Do not create admin-specific types.** `doc_type` answers "what is this a photo of", and the agent's checklist groups by it. An `admin_roof` type would fragment that checklist and make "is this invoice complete?" unanswerable. Source attribution belongs in `module`, which is exactly what it is for.

**uploaded_by_role — there is no enum. It is free text.** It comes from `normalizeRole(role, access_level, hasAgentIdentity)`: the user's `role` if set, else their `access_level[]` array joined with commas, else the literal `'agent'`. Write `'admin'` for consistency, but **do not filter on it** — filter on `module = 'admin-os'`, which is stable.

**module — use `'admin-os'`.** Distinct value, so admin uploads are attributable in queries and audit.

**storage_subdir / storage_key — write your own key, using our prefix.** Keep uploading to R2 yourselves; just use `attachments/` and guarantee filename uniqueness.

**Is there a write API? Yes, but it will not work for you.**
`POST /api/v1/attachments/invoice/:bubbleId/:docType` exists, but it calls `invoiceRepo.verifyOwnership`, which matches only the invoice's creator or its linked agent. **We grepped: there is no admin bypass.** An admin uploading to an invoice they do not own gets a 403. Until we add a service-token path, **INSERT directly.** If you would rather call an API than write SQL, tell us and we will add an admin-scoped endpoint — it is not much work, but we are not going to pretend the current one fits.

---

## Answers to your remaining questions

**URLs are byte-identical after backfill.** The backfill inserts the array element straight into `file_url`. The `split_part`/`regexp_replace` calls in that migration derive `storage_key`, `original_filename` and `mime_type` only — `file_url` is never rewritten. Your SEDA dedupe on exact URL string in `engineering/actions.ts:129` still works.

**`checksum_sha256` is NULL on all 3,019 backfilled rows.** Computing it would have meant pulling every file back from R2. **And our doc's advice was wrong in a way that matters:** `COUNT(DISTINCT checksum_sha256)` ignores NULLs in Postgres, so a legacy invoice with 5 photos returns **0**, not 1. Use:

```sql
COUNT(DISTINCT COALESCE(checksum_sha256, file_url))
```

We are correcting that line in the doc.

**Database grants — unverified, please check on your side.** We created the table through a proxy role and do not know which role Admin OS connects with. You need `SELECT` on `ee_attachment`, plus `INSERT`/`UPDATE` and `USAGE` on `ee_attachment_id_seq` once ASK 3 lands. We would rather you confirm this than take our word for it.

**Is it live in `prod_main` right now? Yes.** Table created and backfilled 2026-07-25, verified: 1,826 `roof_angle`, 1,078 `site_other`, 115 soft-deleted, counts matching the source arrays exactly, backfill proven idempotent by running it twice. The one thing we cannot confirm is that your connection string points at the same database — please verify.

**Phase 3 notice.** Will not start until you confirm in writing that both reads and writes have moved. Two weeks' notice after that. Nothing gets dropped on a surprise.

---

## Open question we have not resolved — and it is yours too

**Invoice versioning.** You noted you read with `inv.is_latest = true`. We confirmed `invoice` carries `version`, `root_id`, `parent_id`, `is_latest` — and **our backfill had no `is_latest` filter.** Photos are pinned to whichever `bubble_id` held the array. If an invoice was revised after its photos were uploaded, those rows now point at a superseded version, and a page loading by the latest `bubble_id` would show nothing.

This is unresolved. It is a data-correctness problem, so it is unaffected by the maintenance window. First step is this query:

```sql
SELECT i.is_latest, count(DISTINCT a.owner_id) AS invoices, count(*) AS attachments
FROM ee_attachment a JOIN invoice i ON i.bubble_id = a.owner_id
GROUP BY i.is_latest;
```

We are running it on our side. If a meaningful share is `is_latest = false`, we will write a re-pointing migration before the window. **If you already know how attachments should behave across an invoice revision — copied to the new version, or re-pointed, or deliberately left on the old one — tell us, because you have more history with the versioning model than we do.**

---

## Summary of what we need from you

| # | Ask | When |
|---|---|---|
| 1 | Maintenance mode deployed and bypass key tested | **Today** — blocks scheduling the window |
| 2 | Reads switched to `ee_attachment` | Any time, safe now |
| 3 | Dual-write to `ee_attachment` | Before the window |
| 4 | Confirm DB grants and that you connect to `prod_main` | Before ASK 2 ships |
| 5 | Tell us how attachments should behave across invoice revisions | Before the window |

Reply on any of these and we will adjust.
