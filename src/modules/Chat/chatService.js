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
   * Get invoice details for chat header
   */
  async getInvoiceDetails(invoiceId) {
    const res = await pool.query(
      `SELECT customer_name_snapshot, invoice_number 
       FROM invoice 
       WHERE bubble_id = $1`,
      [invoiceId]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

    /**

     * Add a message to a thread

     */

    async addMessage({ threadId, senderId, senderName, messageType, content, fileMeta, tagRole }) {

      const isTagActive = messageType === 'tag';

      

      const res = await pool.query(

        `INSERT INTO chat_message 

         (thread_id, sender_id, sender_name, message_type, content, file_meta, tag_role, is_tag_active)

         VALUES (
  , $2, $3, $4, $5, $6, $7, $8)

         RETURNING *`,

        [threadId, senderId, senderName, messageType, content, fileMeta, tagRole, isTagActive]

      );

      return res.rows[0];

    }

  

    /**

     * Acknowledge a tag message (mark as read/inactive)

     */

    async acknowledgeTag(messageId, userId) {

      const res = await pool.query(

        `UPDATE chat_message 

         SET is_tag_active = false

         WHERE id = 
   AND message_type = 'tag'

         RETURNING *`,

        [messageId]

      );

      return res.rows[0];

    }

  

    /**

     * Get customer name from invoice
   */
  async getInvoiceCustomerName(invoiceId) {
    try {
      const res = await pool.query(
        `SELECT customer_name_snapshot FROM invoice WHERE bubble_id = $1`,
        [invoiceId]
      );
      return res.rows.length > 0 ? res.rows[0].customer_name_snapshot : 'Unknown Customer';
    } catch (err) {
      console.error('Error fetching customer name:', err);
      return 'Unknown Customer';
    }
  }
}

module.exports = new ChatService();
