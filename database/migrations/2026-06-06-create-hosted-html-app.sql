-- Hosted HTML Apps
-- Stores user-published HTML "apps" that are served at /h/:slug and /app/:friendlySlug
-- Content lives on disk at RAILWAY_VOLUME_MOUNT_PATH/hosted_html/{slug}/index.html
-- DB only owns metadata + ownership + lifecycle.

CREATE TABLE IF NOT EXISTS hosted_html_app (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL,
    friendly_slug TEXT,                              -- human-readable alias, served at /app/:friendly_slug
    title TEXT NOT NULL,
    description TEXT,
    owner_user_id TEXT NOT NULL,
    owner_bubble_id TEXT,
    owner_name TEXT,
    owner_email TEXT,
    storage_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',        -- 'published' | 'disabled' | 'pending'
    view_count BIGINT NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMPTZ,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT hosted_html_app_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_hosted_html_app_owner
    ON hosted_html_app (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hosted_html_app_status
    ON hosted_html_app (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hosted_html_app_slug_status
    ON hosted_html_app (slug)
    WHERE status = 'published';

-- friendly_slug: only published rows occupy the namespace.
-- Allows re-using a friendly_slug after the previous owner is disabled.
CREATE UNIQUE INDEX IF NOT EXISTS hosted_html_app_friendly_slug_published_uidx
    ON hosted_html_app (friendly_slug)
    WHERE friendly_slug IS NOT NULL AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_hosted_html_app_friendly_slug
    ON hosted_html_app (friendly_slug)
    WHERE friendly_slug IS NOT NULL;
