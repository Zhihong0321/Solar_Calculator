-- Normalize agent/user identity for referral assignments.
--
-- Root cause: agent.id and user.id are independent integer sequences that can
-- collide (e.g. agent.id=14 belongs to a different person than user.id=14).
-- Referral read queries resolved an assignment against whichever table
-- matched first, so any referral whose linked_agent value happened to collide
-- displayed the wrong assigned agent. Confirmed for referral.id=398
-- ("Ahmad 2"): displayed CHOONG YE HONG via the agent.id=14 collision, should
-- be DEAN WAI LEONG YEE via user.id=14, per referral team confirmation.
--
-- Canonical rule going forward: referral.linked_agent stores user.bubble_id.
-- The agent table is intentionally retained (not dropped, not altered beyond
-- this) for historical / future back-linking reference, per team decision.

BEGIN;

-- 1. Give "user" the one agent-only field the app actually reads/writes.
--    agent_type is used by the agent registration form (server.js,
--    agent_registration.html). Every other agent-only column (commission,
--    created_by, tree_seed, annual_collection, etc.) is legacy Bubble-import
--    data with zero references anywhere in this app's code, so it is
--    intentionally left on the agent table rather than promoted to a live
--    user column.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS agent_type TEXT;

UPDATE "user" u
SET agent_type = a.agent_type
FROM agent a
WHERE a.agent_type IS NOT NULL
  AND (a.linked_user_login = u.bubble_id OR u.linked_agent_profile = a.bubble_id)
  AND (u.agent_type IS NULL OR u.agent_type = '');

-- 2. Normalize referral.linked_agent to user.bubble_id.
--    Default resolution preserves whatever is CURRENTLY displayed today
--    (an agent-table match wins over a user-table match when a raw id
--    happens to match both, same priority the existing read queries use),
--    so this migration does not silently change anyone's displayed
--    assignment except the specific rows confirmed wrong in step 2a.
CREATE TABLE IF NOT EXISTS referral_agent_identity_backup_20260720 (
    backup_id BIGSERIAL PRIMARY KEY,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    referral_bubble_id TEXT NOT NULL,
    old_linked_agent TEXT,
    new_linked_agent TEXT,
    resolution_reason TEXT
);

WITH candidate AS (
    SELECT
        r.bubble_id AS referral_bubble_id,
        r.linked_agent AS old_linked_agent,
        COALESCE(agent_user.bubble_id, direct_user.bubble_id) AS new_linked_agent,
        CASE
            WHEN agent_user.bubble_id IS NOT NULL THEN 'agent-table match (preserves current display)'
            ELSE 'user-table match (direct)'
        END AS resolution_reason
    FROM referral r
    LEFT JOIN "user" direct_user
        ON direct_user.bubble_id = r.linked_agent
        OR direct_user.id::text = r.linked_agent
    LEFT JOIN agent a
        ON a.id::text = r.linked_agent
        OR a.bubble_id = r.linked_agent
        OR a.linked_user_login = r.linked_agent
    LEFT JOIN "user" agent_user
        ON agent_user.bubble_id = a.linked_user_login
        OR agent_user.linked_agent_profile = a.bubble_id
    WHERE r.linked_agent IS NOT NULL
)
INSERT INTO referral_agent_identity_backup_20260720 (referral_bubble_id, old_linked_agent, new_linked_agent, resolution_reason)
SELECT referral_bubble_id, old_linked_agent, new_linked_agent, resolution_reason
FROM candidate
WHERE new_linked_agent IS NOT NULL
  AND new_linked_agent IS DISTINCT FROM old_linked_agent;

-- 2a. Confirmed correction: linked_agent='14' was written by an external
--     process (WhatsApp assignment bot) as DEAN WAI LEONG YEE's user.id, not
--     CHOONG YE HONG's agent.id. Referral team confirmed referral.id=398
--     ("Ahmad 2") should be Dean; the other rows sharing the same raw value
--     came from the same write path.
UPDATE referral_agent_identity_backup_20260720
SET new_linked_agent = '1705563151420x807895867406405100', -- DEAN WAI LEONG YEE user.bubble_id
    resolution_reason = 'confirmed correction: linked_agent=14 collision (agent.id=14 is Choong Ye Hong, user.id=14 is Dean Wai Leong Yee; referral team confirmed Dean)'
WHERE old_linked_agent = '14';

UPDATE referral r
SET linked_agent = b.new_linked_agent,
    updated_at = NOW()
FROM referral_agent_identity_backup_20260720 b
WHERE r.bubble_id = b.referral_bubble_id
  AND r.linked_agent = b.old_linked_agent;

COMMIT;
