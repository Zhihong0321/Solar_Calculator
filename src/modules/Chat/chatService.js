const pool = require('../../core/database/pool');

class ChatService {
  /**
   * Roles that can view all chats
   */
  ADMIN_ROLES = ['engineering', 'project', 'hr', 'finance', 'admin', 'ceo', 'superadmin'];

  /**
   * Get or Create a chat thread for an invoice
   */
  async getThread(invoiceId) {
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
  async getMessages(threadId, userId) {
    // We include user-specific tag status if available
    const res = await pool.query(
      `SELECT m.*, 
              cta.status as user_tag_status
       FROM chat_message m
       LEFT JOIN chat_tag_assignment cta ON m.id = cta.message_id AND cta.user_id = $2
       WHERE m.thread_id = $1 
       ORDER BY m.created_at ASC`,
      [threadId, userId]
    );
    return res.rows;
  }

  /**
   * Get all chat threads with latest message and customer details
   * Enforces visibility rules based on user roles and agent association
   *
   * @ai_context
   * VISIBILITY RULE:
   * - Admins (defined in ADMIN_ROLES) see ALL threads.
   * - Agents ONLY see threads for invoices they are linked to (via invoice.linked_agent).
   * - This query enforces strict data isolation for non-admins.
   */
  async getChatThreads(user) {
    const hasAdminAccess = user.access_level && user.access_level.some(role => this.ADMIN_ROLES.includes(role));
    
    let query = `
      SELECT 
          t.invoice_id,
          i.customer_name_snapshot as customer_name,
          i.invoice_number,
          m.content as last_message,
          m.created_at as last_message_at,
          m.message_type as last_message_type,
          (SELECT COUNT(*) FROM chat_tag_assignment cta 
           JOIN chat_message cm ON cta.message_id = cm.id 
           WHERE cm.thread_id = t.id AND cta.user_id = $1 AND cta.status = 'pending') as my_pending_tags
       FROM chat_thread t
       JOIN invoice i ON t.invoice_id = i.bubble_id
       LEFT JOIN LATERAL (
          SELECT content, created_at, message_type
          FROM chat_message
          WHERE thread_id = t.id
          ORDER BY created_at DESC
          LIMIT 1
       ) m ON TRUE
    `;

    const params = [user.userId];

    if (!hasAdminAccess) {
      // Filter for agent: where invoice.linked_agent maps to this user via agent table
      query += `
        WHERE i.linked_agent IN (
          SELECT bubble_id FROM agent WHERE linked_user_login = $2
        )
      `;
      params.push(user.bubbleId); // We need the user's bubble_id to match agent.linked_user_login
    }

    query += ` ORDER BY m.created_at DESC NULLS LAST`;

    const res = await pool.query(query, params);
    return res.rows;
  }

  /**
   * Add a message to a thread and handle tag assignments
   *
   * @ai_context
   * TAGGING LOGIC:
   * 1. 'agent' role: dynamically resolves to the specific agent linked to the invoice.
   *    - FALLBACK: If no agent is found, it defaults to tagging ALL Admins to prevent lost notifications.
   * 2. Standard roles (e.g. 'engineering'): resolves to all users with that role.
   */
  async addMessage({ threadId, senderId, senderName, messageType, content, fileMeta, tagRole }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const isTag = !!(messageType === 'tag' && tagRole);
      
      console.log(`[ChatService] Adding message: type=${messageType}, tagRole=${tagRole}, isTag=${isTag}`);

      const res = await client.query(
        `INSERT INTO chat_message 
         (thread_id, sender_id, sender_name, message_type, content, file_meta, tag_role, is_tag_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [threadId, senderId, senderName, messageType, content, fileMeta, tagRole, isTag]
      );
      
      const savedMessage = res.rows[0];

      if (isTag) {
        let tagUsers;
        
        console.log(`[ChatService] Processing tag for role: ${tagRole}`);

        if (tagRole.toLowerCase() === 'agent') {
            // Find the specific agent user for this thread's invoice
            tagUsers = await client.query(
                `SELECT u.id 
                 FROM "user" u
                 JOIN agent a ON a.linked_user_login = u.bubble_id
                 JOIN invoice i ON i.linked_agent = a.bubble_id
                 JOIN chat_thread t ON t.invoice_id = i.bubble_id
                 WHERE t.id = $1`,
                [threadId]
            );
            
            // Fallback: if no specific agent found, maybe tag all 'admin' or just log it
            if (tagUsers.rows.length === 0) {
              console.log(`[ChatService] No specific agent found for thread ${threadId}, falling back to admin role`);
              tagUsers = await client.query(
                `SELECT id FROM "user" WHERE 'admin' = ANY(access_level)`
              );
            }
        } else {
            // Standard role-based tagging: everyone with this role in access_level
            const targetRole = tagRole.toLowerCase();
            if (targetRole === 'engineering') {
              tagUsers = await client.query(
                `SELECT id FROM "user" WHERE 'engineering' = ANY(access_level) OR 'engineer' = ANY(access_level)`
              );
            } else {
              tagUsers = await client.query(
                `SELECT id FROM "user" WHERE $1 = ANY(access_level)`,
                [targetRole]
              );
            }
        }

        console.log(`[ChatService] Found ${tagUsers.rows.length} users to tag for role ${tagRole}`);

        if (tagUsers && tagUsers.rows.length > 0) {
          const assignmentValues = tagUsers.rows.map(u => `(${savedMessage.id}, ${u.id}, 'pending')`).join(',');
          await client.query(
            `INSERT INTO chat_tag_assignment (message_id, user_id, status)
             VALUES ${assignmentValues}
             ON CONFLICT (message_id, user_id) DO NOTHING`
          );
        } else {
          console.warn(`[ChatService] No users found for tagRole: ${tagRole}`);
        }
      }

      await client.query('COMMIT');
      return savedMessage;
    } catch (err) {
      console.error('[ChatService] Error in addMessage:', err);
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Acknowledge a tag message for a specific user
   */
  async acknowledgeTag(messageId, userId) {
    const res = await pool.query(
      `UPDATE chat_tag_assignment 
       SET status = 'acknowledged', updated_at = NOW()
       WHERE message_id = $1 AND user_id = $2
       RETURNING *`,
      [messageId, userId]
    );
    return res.rows[0];
  }

  /**
   * Get count of pending tags for a user
   */
  async getPendingTagsCount(userId) {
    const res = await pool.query(
      `SELECT COUNT(*) as count 
       FROM chat_tag_assignment 
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    return parseInt(res.rows[0].count);
  }

  /**
   * Helper to get user by bubble_id (since req.user might only have ID/email)
   */
  async getUserByBubbleId(bubbleId) {
     const res = await pool.query('SELECT * FROM "user" WHERE bubble_id = $1', [bubbleId]);
     return res.rows[0];
  }

  async getInvoiceAgentName(invoiceId) {
    const res = await pool.query(
      `SELECT a.name as agent_name
       FROM invoice i
       LEFT JOIN agent a ON i.linked_agent = a.bubble_id
       WHERE i.bubble_id = $1`,
      [invoiceId]
    );
    return res.rows.length > 0 ? res.rows[0].agent_name : 'Unknown Agent';
  }

  async getInvoiceCustomerName(invoiceId) {
    const res = await pool.query(
      `SELECT customer_name_snapshot FROM invoice WHERE bubble_id = $1`,
      [invoiceId]
    );
    return res.rows.length > 0 ? res.rows[0].customer_name_snapshot : 'Unknown Customer';
  }
}

module.exports = new ChatService();