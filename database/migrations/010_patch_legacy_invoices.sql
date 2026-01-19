-- Note: This migration was executed via a script (patch_existing_invoices.js) 
-- to safely renumber existing INV-000... invoices to the new sequence starting from 1007865.
-- This file serves as a record of the logic.

-- Logic executed:
-- 1. Select all invoices with pattern 'INV-%' and length <= 10 (low numbers) ordered by created_at.
-- 2. Renumber sequentially starting from 1007866 (e.g. INV-1007866, INV-1007867...)
-- 3. Update system_parameter 'invoice_count' to the last used number (1008064).

-- SQL equivalent for future reference (conceptually):
-- UPDATE invoice SET invoice_number = 'INV-' || (1007865 + rank_index)
-- FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rank_index FROM invoice WHERE ...) as sub
-- WHERE invoice.id = sub.id;
