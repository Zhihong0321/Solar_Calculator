-- Migration: Versioned terms & conditions for quotations / invoices
-- A published version is frozen. A signed document is pinned (invoice_tnc_pin) to the exact version
-- the customer agreed to; an unsigned document has no pin and always renders the current version.
-- Pins live in their own table on purpose: updating invoice rows fires the snapshot/audit triggers.
-- Seeding and backfill live in scripts/migrate_invoice_tnc_versions.js, which also runs this file.

CREATE TABLE IF NOT EXISTS invoice_tnc_version (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    terms_and_conditions TEXT NOT NULL DEFAULT '',
    -- Payment schedule card rows: [{ "percent": "5%", "title": "...", "description": "..." }]
    payment_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    schedule_label TEXT,
    notes TEXT,
    is_current BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one current version.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_tnc_version_one_current
    ON invoice_tnc_version (is_current) WHERE is_current;

CREATE TABLE IF NOT EXISTS invoice_tnc_pin (
    invoice_bubble_id TEXT PRIMARY KEY,
    tnc_version_id INTEGER NOT NULL REFERENCES invoice_tnc_version(id),
    source TEXT NOT NULL, -- 'signature' | 'backfill'
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_tnc_pin_version ON invoice_tnc_pin (tnc_version_id);
