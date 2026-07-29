-- Admin rejecting a claim previously left no trace of *why* — the claimant just saw "Rejected"
-- with no explanation. Adds a remark column so the reviewer can record a reason on decide().
ALTER TABLE claim_receipt
  ADD COLUMN IF NOT EXISTS remark TEXT;
