const pool = require('../../../core/database/pool');

class EmailService {
  async getAgentEmailAccounts(agentBubbleId) {
    const query = 'SELECT * FROM agent_email_accounts WHERE agent_bubble_id = $1 ORDER BY created_at DESC';
    const { rows } = await pool.query(query, [agentBubbleId]);
    return rows;
  }

  async claimEmailAccount(agentBubbleId, emailPrefix) {
    // 1. Validate prefix
    if (!emailPrefix || !/^[a-zA-Z0-9._-]+$/.test(emailPrefix)) {
      throw new Error('Invalid email prefix. Use only alphanumeric characters, dots, underscores, or hyphens.');
    }

    const fullEmail = `${emailPrefix.toLowerCase()}@eternalgy.me`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 2. Check limit (3 per agent)
      const countQuery = 'SELECT COUNT(*) FROM agent_email_accounts WHERE agent_bubble_id = $1';
      const countRes = await client.query(countQuery, [agentBubbleId]);
      if (parseInt(countRes.rows[0].count) >= 3) {
        throw new Error('You have reached the maximum limit of 3 email accounts.');
      }

      // 3. Check if taken
      const existsQuery = 'SELECT id FROM agent_email_accounts WHERE full_email = $1';
      const existsRes = await client.query(existsQuery, [fullEmail]);
      if (existsRes.rows.length > 0) {
        throw new Error('This email address is already taken.');
      }

      // 4. Insert
      const insertQuery = `
        INSERT INTO agent_email_accounts (agent_bubble_id, email_prefix, full_email)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const insertRes = await client.query(insertQuery, [agentBubbleId, emailPrefix.toLowerCase(), fullEmail]);

      await client.query('COMMIT');
      return insertRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getReceivedEmails(fullEmail, limit = 50, offset = 0) {
    const query = `
      SELECT id, email_id, from_email, to_email, subject, received_at, text_content, 
             (html_content IS NOT NULL) as has_html, attachments
      FROM received_emails
      WHERE to_email = $1
      ORDER BY received_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(query, [fullEmail, limit, offset]);
    return rows;
  }

  async getSentEmails(fullEmail, limit = 50, offset = 0) {
    const query = `
      SELECT id, resend_id as email_id, from_email, to_email, subject, sent_at, status, text_content,
             (html_content IS NOT NULL) as has_html
      FROM emails
      WHERE from_email = $1
      ORDER BY sent_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(query, [fullEmail, limit, offset]);
    return rows;
  }

  async getEmailDetails(id, type = 'received') {
    const isReceived = type === 'received';
    const table = isReceived ? 'received_emails' : 'emails';
    const dateCol = isReceived ? 'received_at' : 'sent_at';
    
    const query = `SELECT *, ${dateCol} as date FROM ${table} WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  }

  async isEmailOwnedByAgent(fullEmail, agentBubbleId) {
    const query = 'SELECT id FROM agent_email_accounts WHERE full_email = $1 AND agent_bubble_id = $2';
    const { rows } = await pool.query(query, [fullEmail, agentBubbleId]);
    return rows.length > 0;
  }

  async sendEmail({ from, to, subject, text, html }) {
    const response = await fetch('https://ee-mail-production.up.railway.app/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text, html })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send email');
    }
    return data;
  }

  async getEmailStats() {
    const response = await fetch('https://ee-mail-production.up.railway.app/stats');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch email stats');
    }
    return data.data;
  }
}

module.exports = new EmailService();
