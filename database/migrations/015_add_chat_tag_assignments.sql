
CREATE TABLE IF NOT EXISTS chat_tag_assignment (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES chat_message(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'acknowledged'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_tag_assignment_user_id ON chat_tag_assignment(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_tag_assignment_status ON chat_tag_assignment(status);
CREATE INDEX IF NOT EXISTS idx_chat_tag_assignment_message_id ON chat_tag_assignment(message_id);
