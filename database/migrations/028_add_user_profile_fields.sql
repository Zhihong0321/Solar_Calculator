-- Make the user row the canonical source for registered user information.
-- The legacy agent row is retained for compatibility with existing references.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS agent_type TEXT,
  ADD COLUMN IF NOT EXISTS ic_front TEXT,
  ADD COLUMN IF NOT EXISTS ic_back TEXT,
  ADD COLUMN IF NOT EXISTS banker TEXT,
  ADD COLUMN IF NOT EXISTS bankin_account TEXT;

-- Backfill only missing user values so this migration is safe for any users
-- already updated through a newer user-profile flow.
UPDATE "user" AS u
SET name = COALESCE(NULLIF(u.name, ''), NULLIF(a.name, '')),
    contact = COALESCE(NULLIF(u.contact, ''), NULLIF(a.contact, '')),
    address = COALESCE(NULLIF(u.address, ''), NULLIF(a.address, '')),
    agent_type = COALESCE(NULLIF(u.agent_type, ''), NULLIF(a.agent_type, '')),
    ic_front = COALESCE(NULLIF(u.ic_front, ''), NULLIF(a.ic_front, '')),
    ic_back = COALESCE(NULLIF(u.ic_back, ''), NULLIF(a.ic_back, '')),
    banker = COALESCE(NULLIF(u.banker, ''), NULLIF(a.banker, '')),
    bankin_account = COALESCE(NULLIF(u.bankin_account, ''), NULLIF(a.bankin_account, '')),
    updated_at = NOW()
FROM agent AS a
WHERE u.linked_agent_profile = a.bubble_id
   OR a.linked_user_login = u.bubble_id;

CREATE INDEX IF NOT EXISTS idx_user_contact ON "user" (contact);
