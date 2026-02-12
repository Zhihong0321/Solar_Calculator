-- Migration: Add follow_up_subtype column to agent_daily_report
-- Purpose: Support Follow-up activity subtypes for KPI tracking

ALTER TABLE agent_daily_report 
ADD COLUMN IF NOT EXISTS follow_up_subtype text;

-- Add comment for documentation
COMMENT ON COLUMN agent_daily_report.follow_up_subtype IS 
'Subtype for Follow-up activities: Customer Service, Collect Premium, After Sales Service, etc.';
