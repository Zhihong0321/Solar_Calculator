-- Migration: 023_create_bug_module
-- Description: Create tables for system bug submission tracking (AI-backed chat interface)

CREATE TABLE IF NOT EXISTS bug_thread (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id) -- Ensures 1:1 continuous chat per user
);

CREATE TABLE IF NOT EXISTS bug_message (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER REFERENCES bug_thread(id) ON DELETE CASCADE,
    sender_id VARCHAR(255) NOT NULL, -- Either User ID OR 'SYSTEM_AI'
    sender_name VARCHAR(255) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    content TEXT,
    file_meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_message_thread_id ON bug_message(thread_id);
