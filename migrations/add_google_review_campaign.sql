-- Migration: Google Review WhatsApp campaign
-- One row per eligible customer queued for the review-request WhatsApp message,
-- plus a single settings row (message template, send pacing, run state).
-- The service also runs these statements on first use (CREATE ... IF NOT EXISTS), so applying
-- this file by hand is optional.

CREATE TABLE IF NOT EXISTS google_review_campaign_settings (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    running             BOOLEAN NOT NULL DEFAULT FALSE,
    message_template    TEXT,
    review_url          TEXT,
    session_id          TEXT NOT NULL DEFAULT 'eternalgy-auth',
    min_interval_sec    INTEGER NOT NULL DEFAULT 60,
    max_interval_sec    INTEGER NOT NULL DEFAULT 180,
    daily_limit         INTEGER NOT NULL DEFAULT 60,
    window_start_hour   INTEGER NOT NULL DEFAULT 9,
    window_end_hour     INTEGER NOT NULL DEFAULT 20,
    batch_size_min      INTEGER NOT NULL DEFAULT 8,
    batch_size_max      INTEGER NOT NULL DEFAULT 15,
    batch_break_min_sec INTEGER NOT NULL DEFAULT 300,
    batch_break_max_sec INTEGER NOT NULL DEFAULT 900,
    sent_in_batch       INTEGER NOT NULL DEFAULT 0,
    batch_target        INTEGER NOT NULL DEFAULT 0,
    next_send_at        TIMESTAMPTZ,
    worker_note         TEXT,
    worker_note_at      TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_review_campaign_message (
    id            SERIAL PRIMARY KEY,
    customer_id   TEXT NOT NULL,
    customer_name TEXT,
    phone         TEXT NOT NULL,            -- international digits, e.g. 60123456789
    status        TEXT NOT NULL DEFAULT 'Queued'
                  CHECK (status IN ('Queued', 'Sending', 'Sent', 'Failed', 'Skipped')),
    attempts      INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    message_text  TEXT,                     -- exact text that was sent
    wa_message_id TEXT,
    is_test       BOOLEAN NOT NULL DEFAULT FALSE,
    queued_by     TEXT,
    queued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at       TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_review_campaign_customer
    ON google_review_campaign_message (customer_id) WHERE is_test = FALSE;

CREATE INDEX IF NOT EXISTS idx_google_review_campaign_status
    ON google_review_campaign_message (status, id);

-- Chinese message (sent when the customer's name looks Chinese) and the language each message used.
ALTER TABLE google_review_campaign_settings ADD COLUMN IF NOT EXISTS message_template_zh TEXT;
ALTER TABLE google_review_campaign_message  ADD COLUMN IF NOT EXISTS language TEXT;

-- Verification: an admin checks a customer's screenshot reply and sends them to the Google Review claims page.
ALTER TABLE google_review_campaign_message ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE google_review_campaign_message ADD COLUMN IF NOT EXISTS verified_by_name TEXT;
ALTER TABLE google_review_campaign_message ADD COLUMN IF NOT EXISTS claim_id INTEGER;
ALTER TABLE google_review_campaign_message ADD COLUMN IF NOT EXISTS remark TEXT;

DO $$
BEGIN
  IF to_regclass('google_review_claim') IS NOT NULL THEN
    -- A campaign claim is verified on WhatsApp, so the screenshot may not be in the app.
    ALTER TABLE google_review_claim ALTER COLUMN photo_url DROP NOT NULL;
    ALTER TABLE google_review_claim ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE google_review_claim ADD COLUMN IF NOT EXISTS campaign_message_id INTEGER;
  END IF;
END;
$$;

INSERT INTO google_review_campaign_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
