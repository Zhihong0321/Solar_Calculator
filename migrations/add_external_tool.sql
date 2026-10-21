-- Migration: External Tools page (/external-tools)
-- Links to apps that users build outside our system. created_by holds the user's bubble_id (or legacy id).

CREATE TABLE IF NOT EXISTS external_tool (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    short_description TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_tool_created_at ON external_tool (created_at DESC);
