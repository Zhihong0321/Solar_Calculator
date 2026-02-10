
ALTER TABLE chat_message 
ADD COLUMN tag_role VARCHAR(50),
ADD COLUMN is_tag_active BOOLEAN DEFAULT FALSE;

-- Index for quick lookup of active tags
CREATE INDEX idx_chat_message_active_tag ON chat_message(tag_role) WHERE is_tag_active = TRUE;
