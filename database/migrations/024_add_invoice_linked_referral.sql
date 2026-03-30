ALTER TABLE invoice
ADD COLUMN IF NOT EXISTS linked_referral TEXT;

CREATE INDEX IF NOT EXISTS idx_invoice_linked_referral
ON invoice(linked_referral);
