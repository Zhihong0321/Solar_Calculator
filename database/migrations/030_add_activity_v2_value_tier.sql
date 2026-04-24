ALTER TABLE activity_v2_task_preset
  ADD COLUMN IF NOT EXISTS value_tier TEXT NOT NULL DEFAULT 'support';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_v2_task_preset_value_tier_check'
  ) THEN
    ALTER TABLE activity_v2_task_preset
      ADD CONSTRAINT activity_v2_task_preset_value_tier_check
      CHECK (value_tier IN ('revenue', 'support', 'offline'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_activity_v2_task_preset_value_tier
  ON activity_v2_task_preset (value_tier, is_active);

UPDATE activity_v2_task_preset
   SET value_tier = 'revenue'
 WHERE value_tier = 'support'
   AND LOWER(task_title) ~ '(prospect|cold call|lead|customer|hunt|sales|meeting|site visit|closing|quotation|proposal|demo|follow.?up)';

UPDATE activity_v2_task_preset
   SET value_tier = 'offline'
 WHERE value_tier = 'support'
   AND LOWER(task_title) ~ '(lunch|break|off.?duty|rest|away)';
