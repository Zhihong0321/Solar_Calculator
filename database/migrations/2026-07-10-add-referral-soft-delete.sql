ALTER TABLE referral
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_referral_active_created_at
  ON referral (created_at DESC)
  WHERE deleted_at IS NULL;
