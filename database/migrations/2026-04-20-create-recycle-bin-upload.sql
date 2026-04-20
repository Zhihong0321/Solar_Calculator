CREATE TABLE IF NOT EXISTS recycle_bin_upload (
    id BIGSERIAL PRIMARY KEY,
    module TEXT NOT NULL,
    linked_record_type TEXT NOT NULL,
    linked_record_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    file_url TEXT NOT NULL,
    storage_subdir TEXT,
    original_filename TEXT,
    mime_type TEXT,
    deleted_by TEXT,
    deleted_by_name TEXT,
    deleted_by_role TEXT,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    restored_by TEXT,
    restored_at TIMESTAMPTZ,
    purged_at TIMESTAMPTZ,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_upload_record
    ON recycle_bin_upload (linked_record_type, linked_record_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_upload_module_record
    ON recycle_bin_upload (module, linked_record_type, linked_record_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_upload_active
    ON recycle_bin_upload (field_key, deleted_at DESC)
    WHERE restored_at IS NULL AND purged_at IS NULL;
