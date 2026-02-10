-- Migration: Add share_token support to seda_registration table
-- This enables public access to SEDA registration forms via shareable links

-- Add share_token column
ALTER TABLE seda_registration ADD COLUMN IF NOT EXISTS share_token VARCHAR(255) UNIQUE;

-- Add share_enabled flag
ALTER TABLE seda_registration ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN DEFAULT true;

-- Add share_expires_at column
ALTER TABLE seda_registration ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP;

-- Create index on share_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_seda_share_token ON seda_registration(share_token) WHERE share_token IS NOT NULL;

-- Generate share tokens for existing records
UPDATE seda_registration
SET share_token = encode(gen_random_bytes(32), 'hex'),
    share_enabled = true,
    share_expires_at = NOW() + INTERVAL '30 days'
WHERE share_token IS NULL;
