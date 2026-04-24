ALTER TABLE activity_v2_task_preset
ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_activity_v2_task_preset_display_order
  ON activity_v2_task_preset (department, scope, is_active, display_order, task_title);
