# Admin OS — Site & Roof Image Source Has Moved

**Date:** 2026-07-25
**Affects:** any Admin OS screen, report, or job that reads `invoice.linked_roof_image` or `invoice.site_assessment_image`
**Database:** `prod_main`
**Action required:** yes — see [What you need to change](#what-you-need-to-change)

---

## TL;DR

Agent site photos used to be two arrays of URLs on the `invoice` row. They are now rows in a new table, `ee_attachment`.

**The two old columns are frozen, not deleted.** They still hold every photo uploaded before today, so nothing you read right now has disappeared. But **after the deploy on the night of 2026-07-25, new photos stop landing in them.** If you keep reading the columns, your screens will look correct and quietly go stale.

**You do not need to wait for that deploy.** `ee_attachment` is already live in `prod_main` and already contains every photo from both old columns — the table and its backfill were applied on 2026-07-25. Switch your reads whenever you are ready, including today. There is no window where you have to read both, and if you switch before tonight the deploy is a non-event for you.

---

## Why this changed

Agents were asked for eight specific site-assessment photos instead of a general pile:

1. Roof from all angles
2. Roof close-up (to confirm roof type)
3. House DB — ground floor
4. House DB — second floor (if applicable)
5. House DB — third floor (if applicable)
6. Planned inverter location
7. Sun path direction
8. House front view (for skylift assessment)

Under the old design each of those would have needed its own `text[]` column on `invoice`, its own migration, and its own upload handler. There was also nowhere to record who uploaded a photo, when, or what it was a photo *of* — a URL in an array carries none of that.

`ee_attachment` stores one row per file with its type, uploader, and timestamps. Adding a ninth photo type is now a code change with no migration.

---

## Timeline

| Phase | When | State | Your action |
|---|---|---|---|
| **Table live** | 2026-07-25, done | `ee_attachment` created and backfilled with all 3,019 historical files. Old columns still being written by the current live page. | **Switch your reads now.** Nothing blocks you. |
| **Cutover** | night of 2026-07-25 | New Invoice Office page deploys. Old columns stop receiving new photos. Backfill re-run once to sweep anything uploaded in the gap. | Nothing, if you already switched. |
| **Phase 3** | date TBC, will be announced | `invoice.linked_roof_image` and `invoice.site_assessment_image` are **dropped**. | Any query still touching them breaks. |

Phase 3 will not happen until Admin OS confirms it has switched. You will get notice. Do not wait for it to start.

---

## What is in `ee_attachment` today

Backfilled from the old columns on 2026-07-25:

| doc_type | rows | invoices | came from |
|---|---:|---:|---|
| `roof_angle` | 1,826 | 425 | `invoice.linked_roof_image` |
| `site_other` | 1,078 | 211 | `invoice.site_assessment_image` |
| *(soft-deleted)* | 115 | 46 | `recycle_bin_upload` |
| **Total** | **3,019** | **431** | |

### Two things to understand about the backfill

**`site_other` means "we don't know what this is."** The old `site_assessment_image` column was an undifferentiated dump — nobody recorded whether a given photo was a distribution board, a sun path, or a front elevation. Those 1,078 photos were imported as `site_other` rather than guessed into one of the eight real slots. Treat `site_other` as "legacy / unclassified", not as a meaningful category. Agents can reclassify them over time.

**`uploaded_at` on backfilled rows is the invoice creation date, not the real upload time.** The old columns never recorded when a photo was uploaded. Rather than stamp all 2,904 photos with the backfill date, they carry `invoice.created_at`. These rows are flagged:

```sql
metadata_json->>'uploaded_at_imputed' = 'true'
```

**Do not build "photos uploaded per week" reporting on backfilled rows.** The dates are approximations. Rows created from today onward have real timestamps and no such flag.

---

## Schema

```
ee_attachment
  id                BIGSERIAL   primary key
  owner_type        TEXT        'invoice' (more later)
  owner_id          TEXT        = invoice.bubble_id
  linked_customer   TEXT        = invoice.linked_customer, denormalized
  module            TEXT        'invoice-office'
  category          TEXT        'site_assessment'
  doc_type          TEXT        which of the eight slots — see mapping below
  sort_order        INTEGER     display order within a slot
  caption           TEXT        agent's free-text note, nullable
  file_url          TEXT        the URL you render
  storage_subdir    TEXT        'attachments' for new rows
  storage_key       TEXT        R2 object key
  original_filename TEXT
  mime_type         TEXT        'image/jpeg', 'application/pdf', ...
  size_bytes        BIGINT
  checksum_sha256   TEXT        used to spot the same photo in two slots
  uploaded_by       TEXT        user id
  uploaded_by_name  TEXT        denormalized — safe to display directly
  uploaded_by_role  TEXT
  uploaded_at       TIMESTAMPTZ see the imputed-date warning above
  taken_at          TIMESTAMPTZ from photo EXIF, nullable
  gps_lat, gps_lng  NUMERIC     from photo EXIF, nullable
  deleted_at        TIMESTAMPTZ NOT NULL = in the recycle bin
  deleted_by        TEXT
  deleted_by_name   TEXT
  restored_at       TIMESTAMPTZ
  restored_by       TEXT
  purged_at         TIMESTAMPTZ NOT NULL = permanently gone
  metadata_json     JSONB       floor number, backfill provenance
  updated_at        TIMESTAMPTZ
```

### Document types

| doc_type | Meaning | Required of the agent |
|---|---|---|
| `roof_angle` | Roof from all angles | Yes, min 3 |
| `roof_closeup` | Roof close-up, confirms roof type | Yes |
| `house_db` | Distribution board — **floor in `metadata_json.floor`** (0 = ground) | Ground floor only |
| `inverter_location` | Planned inverter position | Yes |
| `sunpath` | Sun path direction | Yes |
| `house_front` | Front elevation, for skylift | Yes |
| `site_other` | Unclassified / legacy | No |

"Required" is displayed to the agent as a progress count. **It is not enforced** — an invoice can exist with zero photos. Do not assume any slot is populated.

### House DB floors

Floors are a value, not a type. One `house_db` row per floor:

```sql
-- ground floor DB photos
WHERE doc_type = 'house_db' AND COALESCE((metadata_json->>'floor')::int, 0) = 0
```

`0` = ground, `1` = second floor, `2` = third floor, and so on. A four-storey property just produces `floor = 3` with no schema change, so **do not hard-code three floors.**

---

## What you need to change

### The soft-delete rule — read this before anything else

Deleting a photo sets `deleted_at`. **The row stays in the table.** Every query you write must filter it out, or deleted photos will reappear on your screens:

```sql
WHERE deleted_at IS NULL AND purged_at IS NULL
```

The old columns had no equivalent — `array_remove` made the URL vanish — so this is a new failure mode. It is the single most likely bug in this migration.

### Replacing your roof image read

```sql
-- BEFORE
SELECT bubble_id, linked_roof_image
FROM invoice
WHERE bubble_id = $1;

-- AFTER
SELECT file_url, mime_type, uploaded_by_name, uploaded_at, caption
FROM ee_attachment
WHERE owner_type = 'invoice'
  AND owner_id = $1
  AND doc_type IN ('roof_angle', 'roof_closeup')
  AND deleted_at IS NULL
  AND purged_at IS NULL
ORDER BY doc_type, sort_order, id;
```

`linked_roof_image` mapped to `roof_angle`. Include `roof_closeup` as well unless you specifically want wide shots only — going forward, close-ups are a separate slot and will not appear under `roof_angle`.

### Replacing your site assessment image read

```sql
-- BEFORE
SELECT bubble_id, site_assessment_image
FROM invoice
WHERE bubble_id = $1;

-- AFTER  (everything the agent shot at the site)
SELECT doc_type, file_url, mime_type, uploaded_by_name, uploaded_at,
       (metadata_json->>'floor')::int AS floor
FROM ee_attachment
WHERE owner_type = 'invoice'
  AND owner_id = $1
  AND category = 'site_assessment'
  AND deleted_at IS NULL
  AND purged_at IS NULL
ORDER BY doc_type, sort_order, id;
```

Note this is **wider than the old column**. `site_assessment_image` held one undifferentiated pile; `category = 'site_assessment'` now returns all eight photo types including roof shots. If you want to preserve the old screen exactly, filter to `doc_type = 'site_other'` — but in most cases the wider set is what the screen actually wanted.

### If you list many invoices at once

Do not query per invoice in a loop. One index-backed query covers a batch:

```sql
SELECT owner_id, doc_type, file_url, sort_order
FROM ee_attachment
WHERE owner_type = 'invoice'
  AND owner_id = ANY($1::text[])
  AND category = 'site_assessment'
  AND deleted_at IS NULL
  AND purged_at IS NULL
ORDER BY owner_id, doc_type, sort_order;
```

The supporting index is `idx_ee_attachment_owner` on `(owner_type, owner_id, category, sort_order) WHERE deleted_at IS NULL`.

### Photo counts and completeness

```sql
SELECT doc_type, count(*) AS photos
FROM ee_attachment
WHERE owner_type = 'invoice' AND owner_id = $1
  AND deleted_at IS NULL AND purged_at IS NULL
GROUP BY doc_type;
```

### Customer-wide gallery

Every attachment for one customer across all their invoices — not possible at all before:

```sql
SELECT owner_id AS invoice_bubble_id, doc_type, file_url, uploaded_at
FROM ee_attachment
WHERE linked_customer = $1
  AND deleted_at IS NULL AND purged_at IS NULL
ORDER BY uploaded_at DESC;
```

Backed by `idx_ee_attachment_customer`.

---

## What did NOT change

Leave these alone — they are unaffected by this work:

- **`invoice.pv_system_drawing`** — PV system drawings still live in their own column with their own upload UI and Engineering-request flow. Not migrated, no plans to.
- **`seda_registration.roof_images`** — SEDA keeps its own separate copy, written by the SEDA module. Still there, still authoritative for SEDA.
- **`recycle_bin_upload`** — still used by the legacy upload path. New attachments record deletion on their own row instead, so do not expect new deletions to appear here.
- **All other `invoice` columns.**

---

## Optional: read via API instead of SQL

If Admin OS can authenticate as a user against the Solar Calculator app, there is a read endpoint that returns the checklist already assembled, including which required slots are missing:

```
GET /api/v1/attachments/invoice/:invoiceBubbleId?category=site_assessment
```

Returns `{ attachments, deleted, docTypes, progress }`, where `progress` gives `requiredDone` / `requiredTotal` per invoice. It enforces the same ownership rules as the agent-facing page, so **an admin user will only see invoices they own** — for a genuine admin view across all agents, query the database directly.

---

## Two things that will bite you

**A photo can be geotagged, and usually will not be.** `taken_at`, `gps_lat`, `gps_lng` come from photo EXIF, captured in the browser at upload time. They are populated only for JPEGs that carry EXIF — every backfilled row and any photo from an app that strips metadata has them as `NULL`. Useful as corroboration that an agent was on site; **useless as a filter**, because absence proves nothing.

**The same file can legitimately appear in two slots.** The upload path warns the agent when a checksum already exists on that invoice but does not block it. If you count distinct photos, count `DISTINCT checksum_sha256`, not rows.

---

## Migration checklist

- [ ] Grep Admin OS for `linked_roof_image` and `site_assessment_image`
- [ ] Replace each read with the equivalent above
- [ ] Confirm **every** new query filters `deleted_at IS NULL AND purged_at IS NULL`
- [ ] Replace any hard-coded three-floor DB logic with a loop over `metadata_json.floor`
- [ ] Check nothing reports upload trends off `uploaded_at` for rows flagged `uploaded_at_imputed`
- [ ] Confirm counts match before/after on a sample of invoices, e.g.:

```sql
SELECT
  cardinality(i.linked_roof_image)     AS old_roof,
  cardinality(i.site_assessment_image) AS old_site,
  (SELECT count(*) FROM ee_attachment a
    WHERE a.owner_type='invoice' AND a.owner_id=i.bubble_id
      AND a.deleted_at IS NULL AND a.purged_at IS NULL) AS new_total
FROM invoice i
WHERE cardinality(i.linked_roof_image) > 0
LIMIT 20;
```

`new_total` should equal `old_roof + old_site` for every invoice until the new page ships, after which it only grows.

---

## Reference

- Table definition: `database/migrations/2026-07-25-create-ee-attachment.sql`
- Backfill (idempotent, re-runnable): `database/migrations/2026-07-25-backfill-ee-attachment.sql`
- Document type definitions: `src/core/attachments/registry.js`
- Query layer: `src/core/attachments/repo.js`
- API: `src/modules/Attachments/api/attachmentRoutes.js`

Questions on the schema or the migration go to the Solar Calculator v2 team.
