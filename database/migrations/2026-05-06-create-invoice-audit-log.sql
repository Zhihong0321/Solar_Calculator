-- Migration: 2026-05-06-create-invoice-audit-log.sql
-- Creates the invoice_audit_log table matching PRODUCTION schema.
-- NOTE: Production uses invoice_id (INTEGER), not invoice_bubble_id.
--       Production uses actor_name/actor_phone/actor_role, not edited_by_*.

CREATE TABLE IF NOT EXISTS public.invoice_audit_log (
    id                BIGSERIAL PRIMARY KEY,
    invoice_id        INTEGER     NOT NULL,       -- numeric invoice.id (FK conceptually)
    invoice_number    TEXT,                      -- human-readable reference
    entity_type       TEXT        NOT NULL DEFAULT 'invoice',  -- 'invoice', 'invoice_item', 'seda_registration', etc.
    entity_id         TEXT,                      -- entity bubble_id or identifier
    action_type       TEXT        NOT NULL DEFAULT 'UPDATED',  -- 'insert', 'update', 'delete', etc.
    changes           JSONB,                     -- [{field, before?, after?}]
    row_old           JSONB,                     -- full row snapshot (optional)
    row_new           JSONB,                     -- full row snapshot (optional)
    actor_user_id     TEXT,                      -- actor user bubble_id
    actor_phone       TEXT,                      -- actor contact
    actor_name        TEXT,                      -- actor display name
    actor_role        TEXT,                      -- actor role
    source_app        TEXT        DEFAULT 'agent-os',
    db_user           TEXT,                      -- database session user
    application_name  TEXT,                      -- application name from connection
    client_addr       TEXT,                      -- IP address
    txid              BIGINT,                    -- transaction ID
    edited_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_invoice_id
    ON public.invoice_audit_log (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_edited_at
    ON public.invoice_audit_log (edited_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_entity
    ON public.invoice_audit_log (entity_type, entity_id);
