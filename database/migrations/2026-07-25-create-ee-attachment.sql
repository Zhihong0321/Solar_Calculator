-- Generic attachment store.
--
-- Replaces the "one text[] column on the parent table per upload field" pattern
-- (invoice.linked_roof_image / site_assessment_image / pv_system_drawing).
-- The link lives on the attachment row, so parent tables never gain a column
-- again and one row can hang off invoice, customer, seda_registration, etc.
--
-- category / doc_type are validated against a code-side registry, not a DB enum,
-- so adding a document type is a JS change and not a migration.
--
-- Purely additive: legacy columns and recycle_bin_upload are untouched.

CREATE TABLE IF NOT EXISTS ee_attachment (
    id                BIGSERIAL PRIMARY KEY,

    -- linkage
    owner_type        TEXT NOT NULL,          -- 'invoice' | 'customer' | 'seda_registration' | ...
    owner_id          TEXT NOT NULL,          -- that record's bubble_id
    linked_customer   TEXT,                   -- denormalized, powers customer-wide galleries
    module            TEXT NOT NULL,          -- 'invoice-office' — same vocabulary as recycle_bin_upload

    -- classification
    category          TEXT NOT NULL,          -- 'site_assessment' | 'pv_drawing' | 'payment_proof' | ...
    doc_type          TEXT NOT NULL,          -- 'roof_angle' | 'house_db' | 'sunpath' | ...
    sort_order        INTEGER NOT NULL DEFAULT 0,
    caption           TEXT,

    -- file
    file_url          TEXT NOT NULL,
    storage_subdir    TEXT,
    storage_key       TEXT,                   -- explicit R2 object key; do not re-derive from the URL
    original_filename TEXT,
    mime_type         TEXT,
    size_bytes        BIGINT,
    checksum_sha256   TEXT,

    -- provenance
    uploaded_by       TEXT,
    uploaded_by_name  TEXT,                   -- denormalized on purpose: user records change, audit shouldn't
    uploaded_by_role  TEXT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    taken_at          TIMESTAMPTZ,            -- EXIF, read before imageOptimizer strips it
    gps_lat           NUMERIC(10,7),
    gps_lng           NUMERIC(10,7),

    -- lifecycle (soft delete lives here; no second recycle-bin table for new uploads)
    deleted_at        TIMESTAMPTZ,
    deleted_by        TEXT,
    deleted_by_name   TEXT,
    restored_at       TIMESTAMPTZ,
    restored_by       TEXT,
    purged_at         TIMESTAMPTZ,

    metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary read path: every active attachment for one record, grouped and ordered.
CREATE INDEX IF NOT EXISTS idx_ee_attachment_owner
    ON ee_attachment (owner_type, owner_id, category, sort_order)
    WHERE deleted_at IS NULL;

-- Narrow lookup for a single slot ("has this invoice got its sun path photo?").
CREATE INDEX IF NOT EXISTS idx_ee_attachment_owner_doc_type
    ON ee_attachment (owner_type, owner_id, doc_type)
    WHERE deleted_at IS NULL;

-- Customer-wide gallery across invoices.
CREATE INDEX IF NOT EXISTS idx_ee_attachment_customer
    ON ee_attachment (linked_customer, uploaded_at DESC)
    WHERE deleted_at IS NULL AND linked_customer IS NOT NULL;

-- Recycle bin view.
CREATE INDEX IF NOT EXISTS idx_ee_attachment_deleted
    ON ee_attachment (owner_type, owner_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

-- Duplicate detection (same photo uploaded into several slots).
CREATE INDEX IF NOT EXISTS idx_ee_attachment_checksum
    ON ee_attachment (owner_type, owner_id, checksum_sha256)
    WHERE deleted_at IS NULL AND checksum_sha256 IS NOT NULL;

-- Purge job: find storage objects that are soft-deleted and past retention.
CREATE INDEX IF NOT EXISTS idx_ee_attachment_purge_queue
    ON ee_attachment (deleted_at)
    WHERE deleted_at IS NOT NULL AND purged_at IS NULL;
