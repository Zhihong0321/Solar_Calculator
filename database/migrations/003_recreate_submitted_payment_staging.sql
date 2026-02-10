
DROP TABLE IF EXISTS submitted_payment;

CREATE TABLE submitted_payment (
    id SERIAL PRIMARY KEY,
    bubble_id TEXT NOT NULL,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    payment_method TEXT,
    modified_date TIMESTAMP WITH TIME ZONE,
    amount NUMERIC,
    created_by TEXT,
    linked_agent TEXT,
    created_date TIMESTAMP WITH TIME ZONE,
    remark TEXT,
    payment_date TIMESTAMP WITH TIME ZONE,
    linked_invoice TEXT,
    linked_customer TEXT,
    payment_index INTEGER,
    attachment TEXT, 
    verified_by TEXT,
    edit_history TEXT,
    issuer_bank TEXT,
    epp_month INTEGER,
    payment_method_v2 TEXT,
    terminal TEXT,
    bank_charges INTEGER,
    epp_type TEXT
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_submitted_payment_linked_invoice ON submitted_payment(linked_invoice);
