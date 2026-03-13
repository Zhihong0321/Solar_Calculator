-- Migration: Add time_of_day column to agent_daily_report
-- Purpose: Store the selected activity time slot for daily report entries

ALTER TABLE agent_daily_report
ADD COLUMN IF NOT EXISTS time_of_day text;

COMMENT ON COLUMN agent_daily_report.time_of_day IS
'Selected hourly time slot for the activity report entry, from 07:00 through 23:00.';
