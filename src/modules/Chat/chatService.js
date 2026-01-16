const pool = require('../../core/database/pool');

class ChatService {
  /**
   * Get or Create a chat thread for an invoice
   */
  async getThread(invoiceId) {
    // Upsert pattern to handle concurrency safely
    const res = await pool.query(
      `INSERT INTO chat_thread (invoice_id) 
       VALUES ($1) 
       ON CONFLICT (invoice_id) 
       DO UPDATE SET updated_at = NOW() 
       RETURNING *`,
      [invoiceId]
    );
    return res.rows[0];
  }

  /**
   * Get messages for a thread
   */
  async getMessages(threadId) {
    const res = await pool.query(
      `SELECT * FROM chat_message 
       WHERE thread_id = $1 
       ORDER BY created_at ASC`,
      [threadId]
    );
    return res.rows;
  }

  /**
   * Add a message to a thread
   */
  async addMessage({ threadId, senderId, senderName, messageType, content, fileMeta }) {
    const res = await pool.query(
      `INSERT INTO chat_message 
       (thread_id, sender_id, sender_name, message_type, content, file_meta)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [threadId, senderId, senderName, messageType, content, fileMeta]
    );
    return res.rows[0];
  }
}

module.exports = new ChatService();
