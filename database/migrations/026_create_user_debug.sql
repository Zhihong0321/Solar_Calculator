-- Debug table for identity resolution fallbacks
-- Records when auth resolves a user through a non-primary identity path.

CREATE TABLE IF NOT EXISTS user_debug (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_function TEXT NOT NULL,
  request_method TEXT,
  request_path TEXT,
  request_url TEXT,
  decoded_user_id TEXT,
  decoded_bubble_id TEXT,
  decoded_linked_agent_profile TEXT,
  decoded_email TEXT,
  matched_user_id TEXT,
  matched_bubble_id TEXT,
  matched_field TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_reason TEXT,
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_debug_created_at ON user_debug(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_debug_event_type ON user_debug(event_type);
CREATE INDEX IF NOT EXISTS idx_user_debug_matched_field ON user_debug(matched_field);
CREATE INDEX IF NOT EXISTS idx_user_debug_request_path ON user_debug(request_path);
