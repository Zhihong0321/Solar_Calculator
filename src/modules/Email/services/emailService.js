const pool = require('../../../core/database/pool');

class EmailService {
  async getAgentEmailAccounts(agentBubbleId) {
    const query = 'SELECT * FROM agent_email_accounts WHERE agent_bubble_id = $1 ORDER BY created_at DESC';
    const { rows } = await pool.query(query, [agentBubbleId]);
    return rows;
  }

  async claimEmailAccount(agentBubbleId, emailPrefix, domain = 'eternalgy.me') {
    const allowedDomains = ['brightfield.com.my', 'eternalgy.com', 'eternalgy.me'];
    if (!allowedDomains.includes(domain)) {
      throw new Error('Invalid domain selected.');
    }

    // 1. Validate prefix
    if (!emailPrefix || !/^[a-zA-Z0-9._-]+$/.test(emailPrefix)) {
      throw new Error('Invalid email prefix. Use only alphanumeric characters, dots, underscores, or hyphens.');
    }

    const fullEmail = `${emailPrefix.toLowerCase()}@${domain}`;

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
    const response = await fetch(`https://ee-mail-production.up.railway.app/received-emails?domain=${fullEmail.split('@')[1]}&limit=${limit}&to=${fullEmail}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch received emails');
    
    // Map API response to match existing frontend expectations if necessary
    return data.data || [];
  }

  async getSentEmails(fullEmail, limit = 50, offset = 0) {
    const response = await fetch(`https://ee-mail-production.up.railway.app/emails?domain=${fullEmail.split('@')[1]}&limit=${limit}&from=${fullEmail}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch sent emails');
    
    return data.data || [];
  }

  async getEmailDetails(id, type = 'received') {
    const endpoint = type === 'received' ? 'received-emails' : 'emails';
    const response = await fetch(`https://ee-mail-production.up.railway.app/${endpoint}/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch email details');
    
    const email = data.data;
    if (email) {
        // Map date field for frontend consistency
        email.date = type === 'received' ? email.received_at : email.sent_at;
    }
    return email;
  }

  async isEmailOwnedByAgent(fullEmail, agentBubbleId) {
    const query = 'SELECT id FROM agent_email_accounts WHERE full_email = $1 AND agent_bubble_id = $2';
    const { rows } = await pool.query(query, [fullEmail, agentBubbleId]);
    return rows.length > 0;
  }

  async sendEmail({ from, to, subject, text, html, attachments }) {
    // Ensure domain is passed for the new API
    const domain = from.split('@')[1];
    
    const response = await fetch('https://ee-mail-production.up.railway.app/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        from, 
        to, 
        subject, 
        text, 
        html, 
        attachments,
        domain 
      })
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
