const pool = require('../../core/database/pool');

class BugService {
  /**
   * Roles that can view all bug chats (IT Admins)
   */
  ADMIN_ROLES = ['engineering', 'project', 'superadmin', 'admin', 'ceo'];

  /**
   * Get or Create a bug thread for a user
   */
  async getThread(userId) {
    const res = await pool.query(
      `INSERT INTO bug_thread (user_id) 
       VALUES ($1) 
       ON CONFLICT (user_id) 
       DO UPDATE SET updated_at = NOW() 
       RETURNING *`,
      [userId]
    );
    return res.rows[0];
  }

  /**
   * Get messages for a bug thread
   */
  async getMessages(threadId) {
    const res = await pool.query(
      `SELECT * FROM bug_message 
       WHERE thread_id = $1 
       ORDER BY created_at ASC`,
      [threadId]
    );
    return res.rows;
  }

  /**
   * Get all bug threads with latest message and user details for Admins
   */
  async getAllBugThreads(user) {
    const hasAdminAccess = user.access_level && user.access_level.some(role => this.ADMIN_ROLES.includes(role));
    
    if (!hasAdminAccess) {
        throw new Error("Unauthorized to view all bug threads");
    }

    const query = `
      SELECT 
          t.user_id,
          t.id as thread_id,
          t.status,
          u.name as user_name,
          u.email as user_email,
          m.content as last_message,
          m.created_at as last_message_at,
          m.message_type as last_message_type
       FROM bug_thread t
       JOIN "user" u ON t.user_id = u.id
       LEFT JOIN LATERAL (
          SELECT content, created_at, message_type
          FROM bug_message
          WHERE thread_id = t.id
          ORDER BY created_at DESC
          LIMIT 1
       ) m ON TRUE
       ORDER BY m.created_at DESC NULLS LAST
    `;

    const res = await pool.query(query);
    return res.rows;
  }

  /**
   * Add a generic message to a bug thread
   */
  async addMessage({ threadId, senderId, senderName, messageType, content, fileMeta }) {
    const res = await pool.query(
      `INSERT INTO bug_message 
       (thread_id, sender_id, sender_name, message_type, content, file_meta)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [threadId, senderId, senderName, messageType, content, fileMeta]
    );
    return res.rows[0];
  }

  /**
   * Add a system AI message
   */
  async addSystemMessage(threadId, content) {
    return this.addMessage({
        threadId,
        senderId: 'SYSTEM_AI',
        senderName: 'System Bug Agent',
        messageType: 'text',
        content,
        fileMeta: null
    });
  }
}

module.exports = new BugService();
