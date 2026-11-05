-- Migration: Google Review Programme claims
-- One row per Google review an agent collected from a SEDA-approved customer.
-- Reward per approved claim: RM15 bonus to the submitting agent + RM15 TNG reload to the customer.
-- Status flow: Pending -> Approved | Rejected, then Approved -> Paid (both rewards paid out).
-- A customer can hold only one non-rejected claim, so a rejected claim can be resubmitted.

CREATE TABLE IF NOT EXISTS google_review_claim (
    id                   SERIAL PRIMARY KEY,
    customer_id          TEXT NOT NULL,
    customer_name        TEXT,
    seda_bubble_id       TEXT,
    tng_mobile           TEXT NOT NULL,
    photo_url            TEXT NOT NULL,
    photo_mime           TEXT,
    agent_bonus          NUMERIC(10,2) NOT NULL DEFAULT 15,
    customer_bonus       NUMERIC(10,2) NOT NULL DEFAULT 15,
    status               TEXT NOT NULL DEFAULT 'Pending'
                         CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Paid')),
    remark               TEXT,
    submitted_by_user_id TEXT NOT NULL,
    submitted_by_name    TEXT,
    reviewed_by_user_id  TEXT,
    reviewed_by_name     TEXT,
    reviewed_at          TIMESTAMPTZ,
    paid_by_user_id      TEXT,
    paid_by_name         TEXT,
    paid_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_review_claim_active_customer
    ON google_review_claim (customer_id)
    WHERE status <> 'Rejected';

CREATE INDEX IF NOT EXISTS idx_google_review_claim_submitter
    ON google_review_claim (submitted_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_review_claim_status
    ON google_review_claim (status, created_at DESC);
