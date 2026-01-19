ALTER TABLE invoice
ADD COLUMN IF NOT EXISTS customer_name_snapshot VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_email_snapshot VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_phone_snapshot VARCHAR(50),
ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;
