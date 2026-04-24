CREATE TABLE IF NOT EXISTS activity_v2_task_preset (
  id BIGSERIAL PRIMARY KEY,
  bubble_id TEXT NOT NULL UNIQUE,
  task_title TEXT NOT NULL,
  department TEXT NOT NULL,
  max_length_minutes INTEGER NOT NULL DEFAULT 120,
  task_point INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'personal',
  created_by_user TEXT NOT NULL,
  owner_user TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_v2_task_preset_scope_check
    CHECK (scope IN ('department', 'personal')),
  CONSTRAINT activity_v2_task_preset_max_length_check
    CHECK (max_length_minutes BETWEEN 1 AND 720),
  CONSTRAINT activity_v2_task_preset_task_point_check
    CHECK (task_point >= 0),
  CONSTRAINT activity_v2_task_preset_personal_owner_check
    CHECK (
      (scope = 'personal' AND owner_user IS NOT NULL)
      OR (scope = 'department' AND owner_user IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_activity_v2_task_preset_department
  ON activity_v2_task_preset (department, is_active, scope);

CREATE INDEX IF NOT EXISTS idx_activity_v2_task_preset_owner
  ON activity_v2_task_preset (owner_user, is_active)
  WHERE scope = 'personal';

CREATE TABLE IF NOT EXISTS activity_v2_report (
  id BIGSERIAL PRIMARY KEY,
  bubble_id TEXT NOT NULL UNIQUE,
  linked_user TEXT NOT NULL,
  task_preset_id BIGINT REFERENCES activity_v2_task_preset(id) ON DELETE SET NULL,
  task_title TEXT NOT NULL,
  department TEXT NOT NULL,
  task_point INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  max_length_minutes INTEGER NOT NULL DEFAULT 120,
  detail_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_v2_report_max_length_check
    CHECK (max_length_minutes BETWEEN 1 AND 720),
  CONSTRAINT activity_v2_report_task_point_check
    CHECK (task_point >= 0),
  CONSTRAINT activity_v2_report_end_reason_check
    CHECK (end_reason IS NULL OR end_reason IN ('next_entry', 'manual_stop', 'auto_cutoff', 'manager_adjusted', 'system_adjusted')),
  CONSTRAINT activity_v2_report_time_order_check
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_activity_v2_report_linked_user_started
  ON activity_v2_report (linked_user, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_v2_report_running
  ON activity_v2_report (linked_user, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activity_v2_report_department_started
  ON activity_v2_report (department, started_at DESC);
