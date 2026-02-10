
CREATE TABLE IF NOT EXISTS submitted_payment (
    bubble_id VARCHAR(255) PRIMARY KEY,
    invoice_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    payment_method VARCHAR(50),
    payment_bank VARCHAR(100),
    epp_bank VARCHAR(100),
    epp_tenure INTEGER,
    amount NUMERIC(15, 2),
    reference_no VARCHAR(100),
    payment_date TIMESTAMP,
    proof_file JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_submitted_payment_invoice_id ON submitted_payment(invoice_id);
