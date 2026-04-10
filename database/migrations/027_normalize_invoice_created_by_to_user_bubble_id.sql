-- Normalize invoice creator identity to user.bubble_id.
-- This keeps legacy rows readable while standardizing new logic on one app-wide user key.

UPDATE invoice i
SET created_by = u.bubble_id,
    updated_at = NOW()
FROM "user" u
WHERE i.created_by = u.id::text
  AND u.bubble_id IS NOT NULL
  AND TRIM(u.bubble_id) <> ''
  AND i.created_by IS DISTINCT FROM u.bubble_id;
