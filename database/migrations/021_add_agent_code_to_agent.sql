ALTER TABLE agent
ADD COLUMN IF NOT EXISTS agent_code TEXT;

UPDATE agent AS a
SET agent_code = u.agent_code
FROM "user" AS u
WHERE a.linked_user_login = u.bubble_id
  AND (a.agent_code IS NULL OR a.agent_code = '')
  AND u.agent_code IS NOT NULL
  AND u.agent_code <> '';
