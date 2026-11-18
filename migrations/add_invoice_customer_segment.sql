-- Migration: invoice.customer_segment (residential / commercial / factory)
-- Already present on production (prod_main) as nullable text; this file only keeps other environments in line.
-- Values are stored lowercase. The create and edit invoice screens make the agent pick one.
-- Existing invoices stay NULL ("not picked yet") until next edited. No CHECK constraint on purpose:
-- the app normalizes the value to one of the three names or NULL, so a save is never rejected by the database.

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS customer_segment TEXT;
