# Referral and Customer Prod Schema Audit

Inspected directly against the production PostgreSQL database in read-only mode on March 13, 2026.

Scope:
- `public.referral`
- `public.customer`

This document captures the latest live schema, the current data shape, and practical optimization ideas before further development.

## Executive Summary

- `referral` exists in production and is already being used by the app.
- `customer` in production includes the newer `lead_source` and `remark` columns.
- The `customer` update matches the repo migration `database/migrations/018_add_lead_source_remark.sql`.
- `referral` currently has only primary key and `bubble_id` uniqueness at the database layer.
- Several important referral access paths used by the app are not indexed yet.
- Historical customer data is mostly missing `lead_source` and `remark`, so any stricter rule should be introduced carefully.

## Table: `customer`

Row count at inspection time: `4811`

### Columns

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `integer` | No | `nextval('customer_id_seq')` | Primary key |
| 2 | `customer_id` | `text` | No | none | Unique public/business ID |
| 3 | `last_synced_at` | `timestamptz` | Yes | `now()` | Sync metadata |
| 4 | `created_at` | `timestamptz` | Yes | `now()` | Creation time |
| 5 | `updated_at` | `timestamptz` | Yes | `now()` | Last update time |
| 6 | `name` | `text` | Yes | none | Customer name |
| 7 | `phone` | `text` | Yes | none | Customer phone |
| 8 | `email` | `text` | Yes | none | Customer email |
| 9 | `address` | `text` | Yes | none | Address |
| 10 | `city` | `text` | Yes | none | City |
| 11 | `state` | `text` | Yes | none | State |
| 12 | `postcode` | `text` | Yes | none | Postcode |
| 13 | `ic_number` | `text` | Yes | none | ID number |
| 14 | `linked_seda_registration` | `text` | Yes | none | External link field |
| 15 | `linked_old_customer` | `text` | Yes | none | Legacy link field |
| 16 | `notes` | `text` | Yes | none | Older free-text field |
| 17 | `created_by` | `text` | Yes | none | Owner/user reference |
| 18 | `version` | `integer` | Yes | `1` | Versioning |
| 19 | `updated_by` | `text` | Yes | none | Last editor |
| 20 | `profile_picture` | `text` | Yes | none | Image URL/path |
| 21 | `lead_source` | `text` | Yes | none | Newer lead-source field |
| 22 | `remark` | `text` | Yes | none | Newer remark field |

### Constraints and Indexes

- Primary key: `customer_pkey (id)`
- Unique: `customer_bubble_id_key (customer_id)`
- Check: `customer_lead_source_check`
  - Allowed values: `referral`, `bni`, `roadshow`, `digital_ads`, `own_network`, `other`

Current indexes:
- `customer_pkey` on `id`
- `customer_bubble_id_key` on `customer_id`

### Triggers

- `trg_auto_snapshot_customer`
  - `AFTER INSERT`
  - `AFTER UPDATE`
  - Calls `create_customer_snapshot_func()`
- `trg_customer_history`
  - `BEFORE UPDATE`
  - `BEFORE DELETE`
  - Calls `archive_customer_history()`

### Live Data Shape

`lead_source` distribution:

| Value | Count |
|---|---:|
| `NULL` | 4644 |
| `referral` | 59 |
| `other` | 41 |
| `own_network` | 27 |
| `roadshow` | 20 |
| `digital_ads` | 12 |
| `bni` | 8 |

`remark` completeness:

- Empty or null: `4664`
- Filled: `147`
- Max length: `114`
- Average filled length: `13.74`

Interpretation:
- `lead_source` is missing on about `96.53%` of current customers.
- `remark` is empty or null on about `96.94%` of current customers.
- The schema is ready for these fields, but the dataset is still mostly legacy/unbackfilled.

## Table: `referral`

Row count at inspection time: `34`

### Columns

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `integer` | No | `nextval('referral_id_seq')` | Primary key |
| 2 | `bubble_id` | `varchar(50)` | No | none | Unique public/business ID |
| 3 | `linked_customer_profile` | `varchar(50)` | No | none | FK to `customer.customer_id` |
| 4 | `name` | `varchar(255)` | No | none | Referred person name |
| 5 | `relationship` | `varchar(100)` | Yes | none | Relationship text |
| 6 | `mobile_number` | `varchar(20)` | Yes | none | Referred person phone |
| 7 | `status` | `varchar(50)` | Yes | `'Pending'` | Referral stage |
| 8 | `created_at` | `timestamptz` | Yes | `CURRENT_TIMESTAMP` | Creation time |
| 9 | `updated_at` | `timestamptz` | Yes | `CURRENT_TIMESTAMP` | Last update time |
| 10 | `linked_agent` | `varchar(50)` | Yes | none | Agent/user link field |
| 11 | `deal_value` | `numeric(10,2)` | Yes | `0` | Closed deal amount |
| 12 | `commission_earned` | `numeric(10,2)` | Yes | `0` | Commission amount |
| 13 | `linked_invoice` | `varchar(50)` | Yes | none | Invoice link field |
| 14 | `project_type` | `varchar` | Yes | none | Project label/category |

### Constraints and Indexes

- Primary key: `referral_pkey (id)`
- Unique: `referral_bubble_id_key (bubble_id)`
- Foreign key: `referral_linked_customer_profile_fkey`
  - `linked_customer_profile -> customer.customer_id`

Current indexes:
- `referral_pkey` on `id`
- `referral_bubble_id_key` on `bubble_id`

### Live Data Shape

`status` distribution:

| Value | Count |
|---|---:|
| `Pending` | 34 |

`project_type` distribution:

| Value | Count |
|---|---:|
| `NULL` | 25 |
| `RESIDENTIAL (2%)` | 8 |
| `SHOP-LOT (2%)` | 1 |

Completeness snapshot:

- Missing `linked_agent`: `20`
- Missing `linked_invoice`: `25`
- Missing `project_type`: `25`
- Zero or null `deal_value`: `34`
- Zero or null `commission_earned`: `34`

Duplicate `mobile_number` values currently exist in production:

- `01110988627` appears 2 times
- `0127089555` appears 2 times
- `0127711309` appears 2 times
- `0167256519` appears 2 times
- `0182920127` appears 2 times

Interpretation:
- Referral workflow is live but still early-stage or incomplete.
- The table stores business state, but most rows have not progressed past the initial stage.
- `project_type` is partly being used, but not consistently populated.

## Relationship Notes

Confirmed live FK relationships touching these tables:

- `referral.linked_customer_profile -> customer.customer_id`
- `customer_snapshot.customer_id -> customer.id`
- `invoice_new.customer_id -> customer.id`

Important non-FK linkage fields:

- `referral.linked_agent`
- `referral.linked_invoice`
- `customer.created_by`
- `customer.updated_by`

These fields are meaningful in the application, but they are not currently protected by foreign keys at the database layer.

## Current Repo Alignment

Relevant repo files:

- `server.js` mounts both modules.
- `src/modules/Referral/services/referralRepo.js` reads and writes the `referral` table.
- `src/modules/Customer/services/customerRepo.js` already reads and writes `lead_source` and `remark`.
- `database/migrations/018_add_lead_source_remark.sql` matches the live `customer` schema update.

One notable gap:

- No repo migration was found for creating `referral`; the table appears to exist in production independently from the tracked migrations in this repo.

## Optimization Ideas

### 1. Add indexes for actual query paths

These are the highest-value database optimizations based on current code usage:

- `referral(linked_agent)`
  - Used by the agent dashboard query.
- `referral(linked_customer_profile, created_at DESC)`
  - Used when loading referrals for a customer/share-token flow.
- `referral(mobile_number)`
  - Used for duplicate-checking before insert.
- `customer(created_by, created_at DESC)`
  - Used heavily for "my customers" listing.
- `customer(lead_source)` or a partial index on non-null values
  - Useful if analytics or KPI reports will query lead sources frequently.

Why this matters:
- Right now both `customer` and `referral` rely on several non-indexed filters that will get slower as data grows.

### 2. Clean and normalize referral identity links

`linked_agent` and `linked_invoice` behave like relationships but are not enforced as relationships.

Recommendation:
- Standardize what `linked_agent` stores.
- Standardize what `linked_invoice` stores.
- Add proper foreign keys only after the stored identifiers are stable and consistent.

Why this matters:
- This removes orphaned links and makes reporting safer.

### 3. Decide whether `mobile_number` must be unique in `referral`

App code currently checks for duplicates, but the database does not enforce uniqueness.

Recommendation:
- If one mobile number should only ever have one referral, clean existing duplicates first and then add a unique constraint or a normalized unique index.
- If multiple referrals per mobile number are valid in some cases, keep it non-unique and define the business rule clearly.

Why this matters:
- Current data already contains duplicates, so business intent should be clarified before enforcing anything.

### 4. Normalize `project_type`

Current values like `RESIDENTIAL (2%)` mix category and commission logic in one text field.

Recommendation:
- Split into:
  - `project_type`
  - `commission_rate`

Why this matters:
- Avoids hard-coding commission percentages inside labels.
- Makes reporting and rule changes easier later.

### 5. Add controlled status rules for `referral`

`status` currently defaults to `Pending`, but there is no database constraint on allowed values.

Recommendation:
- Add a `CHECK` constraint or a lookup table for approved statuses.
- Consider adding milestone timestamps later if the workflow grows.

Possible statuses:
- `Pending`
- `Contacted`
- `Qualified`
- `Successful`
- `Rejected`

Why this matters:
- Prevents typo states and improves dashboard/report consistency.

### 6. Treat `customer.lead_source` as a reporting field and backfill gradually

The schema is good, but most historical rows are still null.

Recommendation:
- Keep it nullable for legacy rows.
- Require it only for new records or edited records.
- Backfill from known sources where possible, especially invoice creation flows.

Why this matters:
- You get better analytics without breaking old data.

### 7. Clarify the role of `customer.notes` versus `customer.remark`

The table has both `notes` and `remark`.

Recommendation:
- Define a clear semantic split, or merge to one long-text field in the long term.

Suggested split:
- `remark`: short sales/lead context captured during acquisition
- `notes`: broader ongoing customer notes

Why this matters:
- Two overlapping text fields usually lead to inconsistent usage.

## Suggested Next Steps Before Building

1. Decide the business rules for referral uniqueness and status values.
2. Add the missing read-performance indexes.
3. Decide whether `project_type` should be split from commission rate.
4. Clarify whether `notes` and `remark` should remain separate.
5. If needed, create a proper migration history entry for `referral` so repo state matches prod state.
