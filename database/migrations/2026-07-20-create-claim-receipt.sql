CREATE TABLE IF NOT EXISTS claim_receipt (
  id SERIAL PRIMARY KEY,
  md5 TEXT NOT NULL,
  buyer TEXT NOT NULL DEFAULT 'Eternalgy Sdn Bhd',
  vendor TEXT,
  item TEXT,
  description TEXT,
  receipt_date DATE,
  receipt_id TEXT,
  amount NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'MYR',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  submitted_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  file_url TEXT,
  file_mime TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_receipt_status ON claim_receipt(status);
CREATE INDEX IF NOT EXISTS idx_claim_receipt_md5 ON claim_receipt(md5);
CREATE INDEX IF NOT EXISTS idx_claim_receipt_submitted_by ON claim_receipt(submitted_by);
