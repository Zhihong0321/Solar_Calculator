-- SUPERSEDED by scripts/update_invoice_template_tnc_regrouped.sql (its text already includes this change). Running both is harmless.
-- Two TNC changes to invoice_template row id = 1 (template "Eternalgy"), run together in one transaction:
--   1. Roof Leaking Warranty = 1 year:
--        "During the period of the warranty where ..."  ->  "During the 1-year warranty period where ..."
--        (only the paragraph under the "Roof Leaking Warranty" heading; the "Workmanship Warranty"
--         paragraph has similar words and is NOT touched)
--   2. Overdue payment = 2%/month interest: adds one line at the end of "Our Payment Terms", just before
--        "Our Refund Policy:":  Overdue Payment: For overdue payment there will be a 2%/month interest.
-- Nothing else in the text changes. Safe to run twice: the second run finds nothing to change.
--
-- Rollback text: (1) change "During the 1-year warranty period where" back to
-- "During the period of the warranty where" under the "Roof Leaking Warranty" heading;
-- (2) delete the "Overdue Payment: ..." line and the blank line after it.

BEGIN;

-- Check 1 (before)
SELECT id,
       substring(terms_and_conditions from 'Roof Leaking Warranty\n[^\n]*') AS roof_leak_before,
       (terms_and_conditions ~* 'Overdue\s+Payment\s*:') AS has_overdue_before
FROM invoice_template
WHERE id = 1;

UPDATE invoice_template
SET terms_and_conditions = regexp_replace(
      terms_and_conditions,
      '(^[ \t]*Roof\s+Leaking\s+Warranty[ \t]*\r?\n[ \t]*During\s+the\s+)period\s+of\s+the\s+warranty(\s+where\M)',
      '\11-year warranty period\2',
      'n'
    ),
    updated_at = NOW()
WHERE id = 1
  AND terms_and_conditions ~ 'Roof\s+Leaking\s+Warranty[ \t]*\r?\n[ \t]*During\s+the\s+period\s+of\s+the\s+warranty\s+where';

UPDATE invoice_template
SET terms_and_conditions = regexp_replace(
      terms_and_conditions,
      '^([ \t]*Our\s+Refund\s+Policy\s*:)',
      'Overdue Payment: For overdue payment there will be a 2%/month interest.' || E'\n\n' || '\1',
      'n'
    ),
    updated_at = NOW()
WHERE id = 1
  AND terms_and_conditions !~* 'Overdue\s+Payment\s*:'
  AND terms_and_conditions ~* '^[ \t]*Our\s+Refund\s+Policy\s*:';

-- Check 2 (after): roof leak must start "During the 1-year warranty period where ...";
-- the overdue line must sit between the 20% payment line and "Our Refund Policy:".
SELECT id,
       substring(terms_and_conditions from 'Roof Leaking Warranty\n[^\n]*') AS roof_leak_after,
       substring(terms_and_conditions from '20% After Installation Complete:[^\n]*\n\n[^\n]*\n\nOur Refund Policy:') AS payment_terms_end_after
FROM invoice_template
WHERE id = 1;

-- Look at Check 2, then run COMMIT; (or ROLLBACK; to undo).
