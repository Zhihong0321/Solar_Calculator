-- Migration 018: Add lead_source and remark columns to customer table
-- Adds lead source tracking and remark field for customers

ALTER TABLE customer 
ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS remark TEXT DEFAULT NULL;

-- Add check constraint for lead_source valid values
ALTER TABLE customer 
ADD CONSTRAINT customer_lead_source_check 
CHECK (lead_source IS NULL OR lead_source IN ('referral', 'bni', 'roadshow', 'digital_ads', 'own_network', 'other'));

-- Add comment for documentation
COMMENT ON COLUMN customer.lead_source IS 'Lead source: referral, bni, roadshow, digital_ads, own_network, other';
COMMENT ON COLUMN customer.remark IS 'Long text field for customer remarks/notes';
