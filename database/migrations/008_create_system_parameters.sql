CREATE TABLE IF NOT EXISTS system_parameter (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize with the current max invoice number found (186)
INSERT INTO system_parameter (key, value, description)
VALUES ('invoice_count', '186', 'Current running number for invoices')
ON CONFLICT (key) DO NOTHING;
