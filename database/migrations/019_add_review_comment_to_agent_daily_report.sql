-- Migration: Add manager review comment field for activity review workflow

ALTER TABLE agent_daily_report
ADD COLUMN IF NOT EXISTS review_comment text;

COMMENT ON COLUMN agent_daily_report.review_comment IS
'Manager review note for each activity report row.';
