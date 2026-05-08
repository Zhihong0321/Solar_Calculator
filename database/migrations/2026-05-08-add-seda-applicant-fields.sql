ALTER TABLE seda_registration
  ADD COLUMN IF NOT EXISTS applicant_name TEXT,
  ADD COLUMN IF NOT EXISTS applicant_ic TEXT,
  ADD COLUMN IF NOT EXISTS applicant_phone TEXT,
  ADD COLUMN IF NOT EXISTS applicant_email TEXT;
