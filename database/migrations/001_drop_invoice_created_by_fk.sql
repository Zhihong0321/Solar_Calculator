-- Migration: Drop foreign key constraint on invoice_new.created_by
-- Date: 2026-01-01
-- Reason: Remove dependency on legacy_data_01 table. Store userId directly from JWT token.

-- Drop the foreign key constraint that references legacy_data_01.user_id
ALTER TABLE invoice_new 
DROP CONSTRAINT IF EXISTS invoice_new_created_by_fkey;

-- Note: created_by column remains as VARCHAR to store userId string from JWT token
-- No foreign key constraint needed - we're just storing user identifiers

