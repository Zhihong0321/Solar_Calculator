-- submitted_by/approved_by were free-text strings taken straight from the request body — a
-- logged-in agent could edit the "Claimant" field (or bypass the UI entirely) and post any name.
-- These columns record the actual authenticated identity the server resolved for that request,
-- alongside the existing display-name columns. Nullable: existing rows predate this and are not
-- backfilled.
ALTER TABLE claim_receipt
  ADD COLUMN IF NOT EXISTS submitted_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_email TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_claim_receipt_submitted_by_user_id ON claim_receipt(submitted_by_user_id);
