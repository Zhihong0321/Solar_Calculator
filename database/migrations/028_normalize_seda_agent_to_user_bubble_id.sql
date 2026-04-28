-- Normalize SEDA agent ownership to user.bubble_id.
--
-- Canonical rule:
--   seda_registration.agent stores the assigned sales user's user.bubble_id.
--
-- This migration converts deterministic legacy rows:
--   1. agent currently stores agent.bubble_id -> agent.linked_user_login / agent.created_by
--   2. blank agent with linked invoice -> invoice linked agent's user bubble ID, then invoice creator
--   3. created_by fallback only when it resolves to a user

BEGIN;

CREATE TABLE IF NOT EXISTS seda_agent_identity_backup_20260428 (
    backup_id BIGSERIAL PRIMARY KEY,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seda_bubble_id TEXT NOT NULL,
    old_agent TEXT,
    new_agent TEXT,
    created_by TEXT,
    linked_invoice TEXT[]
);

WITH raw_candidate AS (
    SELECT
        s.bubble_id,
        s.agent AS old_agent,
        s.created_by,
        s.linked_invoice,
        COALESCE(
            direct_agent_user.bubble_id,
            direct_agent_profile_user.bubble_id,
            invoice_agent_user.bubble_id,
            invoice_agent_profile_user.bubble_id,
            invoice_created_user.bubble_id,
            created_by_user.bubble_id
        ) AS new_agent
    FROM seda_registration s
    LEFT JOIN "user" direct_agent_user
        ON direct_agent_user.bubble_id = s.agent
        OR direct_agent_user.id::text = s.agent
        OR direct_agent_user.linked_agent_profile = s.agent
    LEFT JOIN agent direct_agent_profile
        ON direct_agent_profile.bubble_id = s.agent
    LEFT JOIN "user" direct_agent_profile_user
        ON direct_agent_profile_user.bubble_id = direct_agent_profile.linked_user_login
        OR direct_agent_profile_user.bubble_id = direct_agent_profile.created_by
        OR direct_agent_profile_user.id::text = direct_agent_profile.created_by
        OR direct_agent_profile_user.linked_agent_profile = direct_agent_profile.bubble_id
    LEFT JOIN LATERAL (
        SELECT i.linked_agent, i.created_by
        FROM invoice i
        WHERE i.bubble_id = ANY(s.linked_invoice)
        ORDER BY i.updated_at DESC NULLS LAST
        LIMIT 1
    ) linked_invoice ON TRUE
    LEFT JOIN "user" invoice_agent_user
        ON invoice_agent_user.bubble_id = linked_invoice.linked_agent
        OR invoice_agent_user.id::text = linked_invoice.linked_agent
        OR invoice_agent_user.linked_agent_profile = linked_invoice.linked_agent
    LEFT JOIN agent invoice_agent_profile
        ON invoice_agent_profile.bubble_id = linked_invoice.linked_agent
    LEFT JOIN "user" invoice_agent_profile_user
        ON invoice_agent_profile_user.bubble_id = invoice_agent_profile.linked_user_login
        OR invoice_agent_profile_user.bubble_id = invoice_agent_profile.created_by
        OR invoice_agent_profile_user.id::text = invoice_agent_profile.created_by
        OR invoice_agent_profile_user.linked_agent_profile = invoice_agent_profile.bubble_id
    LEFT JOIN "user" invoice_created_user
        ON invoice_created_user.bubble_id = linked_invoice.created_by
        OR invoice_created_user.id::text = linked_invoice.created_by
    LEFT JOIN "user" created_by_user
        ON created_by_user.bubble_id = s.created_by
        OR created_by_user.id::text = s.created_by
), candidate AS (
    SELECT DISTINCT ON (bubble_id) *
    FROM raw_candidate
    ORDER BY bubble_id, new_agent NULLS LAST
)
INSERT INTO seda_agent_identity_backup_20260428 (
    seda_bubble_id,
    old_agent,
    new_agent,
    created_by,
    linked_invoice
)
SELECT
    bubble_id,
    old_agent,
    new_agent,
    created_by,
    linked_invoice
FROM candidate
WHERE new_agent IS NOT NULL
  AND old_agent IS DISTINCT FROM new_agent
  AND NOT EXISTS (
      SELECT 1
      FROM seda_agent_identity_backup_20260428 b
      WHERE b.seda_bubble_id = candidate.bubble_id
        AND b.old_agent IS NOT DISTINCT FROM candidate.old_agent
        AND b.new_agent IS NOT DISTINCT FROM candidate.new_agent
  );

WITH raw_candidate AS (
    SELECT
        s.bubble_id,
        COALESCE(
            direct_agent_user.bubble_id,
            direct_agent_profile_user.bubble_id,
            invoice_agent_user.bubble_id,
            invoice_agent_profile_user.bubble_id,
            invoice_created_user.bubble_id,
            created_by_user.bubble_id
        ) AS new_agent
    FROM seda_registration s
    LEFT JOIN "user" direct_agent_user
        ON direct_agent_user.bubble_id = s.agent
        OR direct_agent_user.id::text = s.agent
        OR direct_agent_user.linked_agent_profile = s.agent
    LEFT JOIN agent direct_agent_profile
        ON direct_agent_profile.bubble_id = s.agent
    LEFT JOIN "user" direct_agent_profile_user
        ON direct_agent_profile_user.bubble_id = direct_agent_profile.linked_user_login
        OR direct_agent_profile_user.bubble_id = direct_agent_profile.created_by
        OR direct_agent_profile_user.id::text = direct_agent_profile.created_by
        OR direct_agent_profile_user.linked_agent_profile = direct_agent_profile.bubble_id
    LEFT JOIN LATERAL (
        SELECT i.linked_agent, i.created_by
        FROM invoice i
        WHERE i.bubble_id = ANY(s.linked_invoice)
        ORDER BY i.updated_at DESC NULLS LAST
        LIMIT 1
    ) linked_invoice ON TRUE
    LEFT JOIN "user" invoice_agent_user
        ON invoice_agent_user.bubble_id = linked_invoice.linked_agent
        OR invoice_agent_user.id::text = linked_invoice.linked_agent
        OR invoice_agent_user.linked_agent_profile = linked_invoice.linked_agent
    LEFT JOIN agent invoice_agent_profile
        ON invoice_agent_profile.bubble_id = linked_invoice.linked_agent
    LEFT JOIN "user" invoice_agent_profile_user
        ON invoice_agent_profile_user.bubble_id = invoice_agent_profile.linked_user_login
        OR invoice_agent_profile_user.bubble_id = invoice_agent_profile.created_by
        OR invoice_agent_profile_user.id::text = invoice_agent_profile.created_by
        OR invoice_agent_profile_user.linked_agent_profile = invoice_agent_profile.bubble_id
    LEFT JOIN "user" invoice_created_user
        ON invoice_created_user.bubble_id = linked_invoice.created_by
        OR invoice_created_user.id::text = linked_invoice.created_by
    LEFT JOIN "user" created_by_user
        ON created_by_user.bubble_id = s.created_by
        OR created_by_user.id::text = s.created_by
), candidate AS (
    SELECT DISTINCT ON (bubble_id) *
    FROM raw_candidate
    ORDER BY bubble_id, new_agent NULLS LAST
)
UPDATE seda_registration s
SET agent = candidate.new_agent,
    updated_at = NOW()
FROM candidate
WHERE s.bubble_id = candidate.bubble_id
  AND candidate.new_agent IS NOT NULL
  AND s.agent IS DISTINCT FROM candidate.new_agent;

COMMIT;
