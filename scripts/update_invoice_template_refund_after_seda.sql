-- Refund after SEDA approval = amount paid minus RM1500.
-- Updates ONLY the "5% + N% Refund (After SEDA Application)" paragraph of
-- invoice_template.terms_and_conditions for row id = 1 (template "Eternalgy"). Nothing else in the text changes.
-- Keeps the paragraph's own percentage (75% now, 60% if an older text is still stored).
-- Safe to run twice: the second run rewrites the paragraph to the same text.
--
-- Old paragraph (for rollback):
--   This refund will be subject to deductions, including a non-refundable administrative fee of RM600 ,
--   RM600 site survey, engineering design fee and  SEDA application fee of RM300. (Total of RM1500 for
--   completed project milestone)

BEGIN;

-- Check 1 (before): the paragraph as stored now.
SELECT id, substring(terms_and_conditions from '5% \+ \d+% Refund \(After SEDA Application\):[^\n]*') AS refund_after_seda_before
FROM invoice_template
WHERE id = 1;

UPDATE invoice_template
SET terms_and_conditions = regexp_replace(
      terms_and_conditions,
      '^([ \t]*5%\s*\+\s*(\d+%)\s+Refund\s*\(After\s+SEDA\s+Application\)\s*:)[^\n]*$',
      '\1 Customers who have paid the 5% downpayment and the subsequent \2 fee but wish to cancel their project after SEDA approval may request a refund. The refund amount will be the amount paid minus RM1500.',
      'n'
    ),
    updated_at = NOW()
WHERE id = 1
  AND terms_and_conditions ~ '5%\s*\+\s*\d+%\s+Refund\s*\(After\s+SEDA\s+Application\)';

-- Check 2 (after): must show "The refund amount will be the amount paid minus RM1500."
SELECT id, substring(terms_and_conditions from '5% \+ \d+% Refund \(After SEDA Application\):[^\n]*') AS refund_after_seda_after
FROM invoice_template
WHERE id = 1;

-- Look at Check 2, then run COMMIT; (or ROLLBACK; to undo).
