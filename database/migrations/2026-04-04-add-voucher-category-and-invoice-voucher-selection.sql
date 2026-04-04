-- Voucher category layer + post-submit invoice voucher selections

CREATE TABLE IF NOT EXISTS voucher_category (
    id BIGSERIAL PRIMARY KEY,
    bubble_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    max_selectable INTEGER NOT NULL DEFAULT 1 CHECK (max_selectable > 0),
    min_package_amount NUMERIC(12,2),
    min_panel_quantity INTEGER,
    package_type_scope TEXT NOT NULL DEFAULT 'all'
        CHECK (package_type_scope IN ('resi', 'non-resi', 'all')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    disabled BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    "delete" BOOLEAN,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_category_active_not_deleted
    ON voucher_category (active, disabled)
    WHERE "delete" IS NULL OR "delete" = FALSE;

CREATE INDEX IF NOT EXISTS idx_voucher_category_scope
    ON voucher_category (package_type_scope);

ALTER TABLE voucher
    ADD COLUMN IF NOT EXISTS linked_voucher_category TEXT;

CREATE INDEX IF NOT EXISTS idx_voucher_linked_voucher_category
    ON voucher (linked_voucher_category);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_voucher_linked_voucher_category'
    ) THEN
        ALTER TABLE voucher
            ADD CONSTRAINT fk_voucher_linked_voucher_category
            FOREIGN KEY (linked_voucher_category)
            REFERENCES voucher_category (bubble_id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS invoice_voucher_selection (
    id BIGSERIAL PRIMARY KEY,
    bubble_id TEXT NOT NULL UNIQUE,
    linked_invoice TEXT NOT NULL,
    linked_voucher TEXT NOT NULL,
    linked_voucher_category TEXT,
    voucher_code_snapshot TEXT NOT NULL,
    voucher_title_snapshot TEXT,
    discount_amount_snapshot NUMERIC(12,2),
    discount_percent_snapshot NUMERIC(8,2),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invoice_voucher UNIQUE (linked_invoice, linked_voucher)
);

CREATE INDEX IF NOT EXISTS idx_invoice_voucher_selection_linked_invoice
    ON invoice_voucher_selection (linked_invoice);

CREATE INDEX IF NOT EXISTS idx_invoice_voucher_selection_category
    ON invoice_voucher_selection (linked_voucher_category);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_invoice_voucher_selection_linked_voucher'
    ) THEN
        ALTER TABLE invoice_voucher_selection
            ADD CONSTRAINT fk_invoice_voucher_selection_linked_voucher
            FOREIGN KEY (linked_voucher)
            REFERENCES voucher (bubble_id)
            ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_invoice_voucher_selection_linked_voucher_category'
    ) THEN
        ALTER TABLE invoice_voucher_selection
            ADD CONSTRAINT fk_invoice_voucher_selection_linked_voucher_category
            FOREIGN KEY (linked_voucher_category)
            REFERENCES voucher_category (bubble_id)
            ON DELETE SET NULL;
    END IF;
END $$;
