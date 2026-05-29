-- Add access_tag and allowed_users columns to voucher table
-- This allows restricting voucher visibility based on:
--   1. User access tags (access_tag) - matches against user.access_level array
--   2. Specific allowed users (allowed_users) - whitelist of user bubble_ids
--
-- Visibility rules:
--   - access_tag NULL + allowed_users NULL = visible to ALL users
--   - access_tag set = only visible to users with that tag in their access_level
--   - allowed_users set = only visible to users in the list
--   - Both set = user must match EITHER condition (OR logic)
--
-- Applied to prod_main on 2026-05-29

ALTER TABLE voucher
    ADD COLUMN IF NOT EXISTS access_tag TEXT;

ALTER TABLE voucher
    ADD COLUMN IF NOT EXISTS allowed_users TEXT[];

CREATE INDEX IF NOT EXISTS idx_voucher_access_tag ON voucher (access_tag);
CREATE INDEX IF NOT EXISTS idx_voucher_allowed_users ON voucher USING GIN (allowed_users);
