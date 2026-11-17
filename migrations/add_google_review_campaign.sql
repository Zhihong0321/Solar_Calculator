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
ALTER TABLE google_review_campaign_message ADD COLUMN IF NOT EXISTS sent_via TEXT;   -- NULL = automatic sender, 'manual' = sent from a phone

-- Several WhatsApp numbers share the sending. Each has its own daily limit; the sender rotates between the
-- numbers that are connected and still under their limit. The number that sent a message is recorded on it.
-- Sending window with minutes (e.g. 09:00 to 19:30). The hour columns stay; these add the minute part.
ALTER TABLE google_review_campaign_settings ADD COLUMN IF NOT EXISTS window_start_minute INTEGER NOT NULL DEFAULT 0;
ALTER TABLE google_review_campaign_settings ADD COLUMN IF NOT EXISTS window_end_minute   INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS google_review_campaign_session (
    session_id  TEXT PRIMARY KEY,
    daily_limit INTEGER NOT NULL DEFAULT 20,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    position    INTEGER NOT NULL DEFAULT 0
);
-- A number that shows signs of a WhatsApp block/restriction is rested until this time (the others keep sending).
ALTER TABLE google_review_campaign_session ADD COLUMN IF NOT EXISTS paused_until  TIMESTAMPTZ;
ALTER TABLE google_review_campaign_session ADD COLUMN IF NOT EXISTS paused_reason TEXT;

-- Every send attempt, kept as history (the message row only keeps its latest state).
CREATE TABLE IF NOT EXISTS google_review_campaign_log (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event       TEXT NOT NULL,              -- sent | failed | link_dropped | possible_block | manual_sent | test_sent | test_failed
    session_id  TEXT,
    message_id  INTEGER,
    customer    TEXT,
    phone       TEXT,
    detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_google_review_campaign_log_at ON google_review_campaign_log (at DESC);

ALTER TABLE google_review_campaign_message ADD COLUMN IF NOT EXISTS sent_session TEXT;
-- Messages sent before the rotation existed all went out from the one original number.
UPDATE google_review_campaign_message SET sent_session = 'eternalgy-auth'
 WHERE sent_session IS NULL AND status = 'Sent' AND sent_via IS NULL AND is_test = FALSE;
-- Starting numbers (only inserted when missing, so edits made on the progress page are kept).
-- eternalgy-auth also sends OTP codes, so it gets the low limit; the two marketing numbers only do this job.
INSERT INTO google_review_campaign_session (session_id, daily_limit, position) VALUES
    ('eternalgy-auth', 10, 0), ('marketing-292', 20, 1), ('marketing-2800', 20, 2)
ON CONFLICT (session_id) DO NOTHING;

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

-- Reviews found on our Google Maps profile by the scanner (Reviews page). One row per Google review id.
CREATE TABLE IF NOT EXISTS google_review_scanned (
    id               SERIAL PRIMARY KEY,
    review_id        TEXT NOT NULL UNIQUE,
    reviewer_name    TEXT,
    reviewer_link    TEXT,
    reviewer_reviews INTEGER,
    rating           INTEGER,
    review_text      TEXT,
    review_text_en   TEXT,
    posted_at        TIMESTAMPTZ,
    review_link      TEXT,
    photos           JSONB,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_google_review_scanned_posted ON google_review_scanned (posted_at DESC);

CREATE TABLE IF NOT EXISTS google_review_scan_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    last_run_at TIMESTAMPTZ,
    last_ok     BOOLEAN,
    last_note   TEXT,
    last_added  INTEGER
);
INSERT INTO google_review_scan_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
