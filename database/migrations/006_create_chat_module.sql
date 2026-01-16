
CREATE TABLE IF NOT EXISTS chat_thread (
    id SERIAL PRIMARY KEY,
    invoice_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_message (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER REFERENCES chat_thread(id) ON DELETE CASCADE,
    sender_id VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    content TEXT,
    file_meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_message_thread_id ON chat_message(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_thread_invoice_id ON chat_thread(invoice_id);
