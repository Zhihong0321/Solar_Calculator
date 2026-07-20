const pool = require('../../core/database/pool');

const BUBBLE_ENDPOINT = 'https://eternalgy.com/api/1.1/obj/support_ticket';
const VALID_STATUSES = ['unread', 'read by support', 'processing', 'solved', 'deleted'];
const BAILEYS_API_URL = 'https://ee-baileys-production.up.railway.app';
const BAILEYS_SESSION_ID = 'eternalgy-auth';

function normalizeMyPhoneNumber(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `60${digits.slice(1)}`;
  return digits;
}

class SupportTicketService {
  ADMIN_ROLES = ['admin', 'superadmin', 'engineering', 'project', 'ceo', 'support'];

  async listTickets({ status, search, limit = 100, offset = 0 } = {}) {
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`st.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(st.title ILIKE $${idx} OR st.problem_description ILIKE $${idx} OR COALESCE(cp.name, c.name) ILIKE $${idx})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    params.push(offset);

    const query = `
      SELECT
        st.id,
        st.bubble_id,
        st.title,
        st.status,
        st.problem_description,
        st.technician_remark,
        st.images,
        st.created_date,
        st.modified_date,
        COALESCE(cp.name, c.name) AS customer_name,
        COALESCE(cp.contact, c.phone) AS customer_contact,
        u.name AS creator_name
      FROM support_ticket st
      LEFT JOIN customer_profile cp ON cp.bubble_id = st.link_customer
      LEFT JOIN customer c ON c.customer_id = st.link_customer
      LEFT JOIN "user" u ON u.bubble_id = st.created_by
      ${where}
      ORDER BY st.created_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  async listMyTickets(createdBy) {
    const result = await pool.query(
      `SELECT
        st.id,
        st.title,
        st.status,
        st.problem_description,
        st.technician_remark,
        st.images,
        st.created_date,
        st.modified_date,
        COALESCE(cp.name, c.name) AS customer_name
       FROM support_ticket st
       LEFT JOIN customer_profile cp ON cp.bubble_id = st.link_customer
       LEFT JOIN customer c ON c.customer_id = st.link_customer
       WHERE st.created_by = $1
         AND COALESCE(st.status, 'unread') <> 'deleted'
       ORDER BY st.created_date DESC`,
      [createdBy]
    );
    return result.rows;
  }

  async getTicketById(id) {
    const result = await pool.query(
      `SELECT
        st.*,
        COALESCE(cp.name, c.name) AS customer_name,
        COALESCE(cp.contact, c.phone) AS customer_contact,
        COALESCE(cp.address, c.address) AS customer_address,
        u.name AS creator_name
       FROM support_ticket st
       LEFT JOIN customer_profile cp ON cp.bubble_id = st.link_customer
       LEFT JOIN customer c ON c.customer_id = st.link_customer
       LEFT JOIN "user" u ON u.bubble_id = st.created_by
       WHERE st.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async createTicket({ title, problem_description, link_customer, created_by, images }) {
    if (!title || !title.trim()) {
      throw new Error('Title is required');
    }

    const result = await pool.query(
      `INSERT INTO support_ticket
        (created_date, modified_date, created_by, link_customer, problem_description, technician_remark, status, title, images)
       VALUES (NOW(), NOW(), $1, $2, $3, NULL, 'unread', $4, $5)
       RETURNING *`,
      [created_by ?? null, link_customer ?? null, problem_description ?? null, title.trim(), images ?? null]
    );
    return result.rows[0];
  }

  async getSupportTeamContacts() {
    const result = await pool.query(
      `SELECT id, name, contact
       FROM "user"
       WHERE 'support' = ANY(access_level)
         AND contact IS NOT NULL
         AND contact <> ''`
    );
    return result.rows;
  }

  async listNotificationNumbers() {
    const result = await pool.query(
      `SELECT id, phone_number, label, active, created_at
       FROM support_ticket_notification_contact
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async addNotificationNumber({ phone_number, label }) {
    const normalized = normalizeMyPhoneNumber(phone_number);
    if (!normalized) {
      throw new Error('A valid phone number is required');
    }

    const result = await pool.query(
      `INSERT INTO support_ticket_notification_contact (phone_number, label)
       VALUES ($1, $2)
       ON CONFLICT (phone_number) DO UPDATE SET label = EXCLUDED.label, active = true
       RETURNING id, phone_number, label, active, created_at`,
      [normalized, label ? String(label).trim() || null : null]
    );
    return result.rows[0];
  }

  async deleteNotificationNumber(id) {
    const result = await pool.query(
      `DELETE FROM support_ticket_notification_contact WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  async sendWhatsAppNotification(to, text) {
    const response = await fetch(`${BAILEYS_API_URL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: BAILEYS_SESSION_ID,
        to,
        text,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `WhatsApp send failed with status ${response.status}`);
    }
    return payload;
  }

  async notifySupportTeam(ticket) {
    const [teamContacts, extraNumbers] = await Promise.all([
      this.getSupportTeamContacts(),
      this.listNotificationNumbers(),
    ]);

    const recipients = new Map();
    for (const contact of teamContacts) {
      const to = normalizeMyPhoneNumber(contact.contact);
      if (to) recipients.set(to, contact.name || to);
    }
    for (const entry of extraNumbers) {
      if (!entry.active) continue;
      const to = normalizeMyPhoneNumber(entry.phone_number);
      if (to && !recipients.has(to)) recipients.set(to, entry.label || to);
    }

    if (!recipients.size) return { sent: 0, failed: 0 };

    const message = [
      '🎫 New Support Ticket',
      '',
      `Title: ${ticket.title || 'Untitled'}`,
      ticket.customer_name ? `Customer: ${ticket.customer_name}` : null,
      '',
      ticket.problem_description || '',
      '',
      'View: https://calculator.atap.solar/support-tickets',
    ].filter((line) => line !== null).join('\n');

    let sent = 0;
    let failed = 0;

    for (const [to, name] of recipients) {
      try {
        await this.sendWhatsAppNotification(to, message);
        sent += 1;
      } catch (err) {
        console.error(`[SupportTicket] WhatsApp notify failed for ${name} (${to}):`, err.message);
        failed += 1;
      }
    }

    return { sent, failed };
  }

  async searchCustomers(query, limit = 10) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    const result = await pool.query(
      `SELECT customer_id, name, phone
       FROM customer
       WHERE name ILIKE $1 OR phone ILIKE $1
       ORDER BY name ASC
       LIMIT $2`,
      [`%${trimmed}%`, limit]
    );
    return result.rows;
  }

  async updateTicket(id, { status, technician_remark, link_customer }) {
    // '' is treated as "clear this field" (see `status || null` below), so it must
    // bypass the whitelist the same way null and undefined do — otherwise an empty
    // form field throws instead of clearing.
    if (status !== undefined && status !== null && status !== '' && !VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const assignments = ['modified_date = NOW()'];
    const params = [id];

    if (status !== undefined) {
      params.push(status || null);
      assignments.push(`status = $${params.length}`);
    }
    if (technician_remark !== undefined) {
      params.push(technician_remark ?? null);
      assignments.push(`technician_remark = $${params.length}`);
    }
    if (link_customer !== undefined) {
      params.push(link_customer || null);
      assignments.push(`link_customer = $${params.length}`);
    }

    const result = await pool.query(
      `UPDATE support_ticket
       SET ${assignments.join(', ')}
       WHERE id = $1
       RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  async softDeleteTicket(id) {
    const result = await pool.query(
      `UPDATE support_ticket SET status = 'deleted', modified_date = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  async restoreTicket(id) {
    const result = await pool.query(
      `UPDATE support_ticket SET status = 'unread', modified_date = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  async getStatusCounts() {
    const result = await pool.query(
      `SELECT COALESCE(status, 'unread') AS status, COUNT(*) AS count
       FROM support_ticket
       GROUP BY COALESCE(status, 'unread')`
    );
    return result.rows;
  }

  hasAdminAccess(user) {
    const levels = (user?.access_level || []).map((r) => String(r).toLowerCase().trim());
    return levels.some((role) => this.ADMIN_ROLES.includes(role));
  }

  async fetchAllFromBubble() {
    const records = [];
    let cursor = 0;
    const limit = 100;

    while (true) {
      const url = `${BUBBLE_ENDPOINT}?limit=${limit}&cursor=${cursor}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Bubble API request failed: ${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      const results = json?.response?.results || [];
      records.push(...results);

      const remaining = json?.response?.remaining || 0;
      if (remaining <= 0 || results.length === 0) break;
      cursor += results.length;
    }

    return records;
  }

  async syncFromBubble() {
    const records = await this.fetchAllFromBubble();
    let upserted = 0;

    for (const r of records) {
      await pool.query(
        `INSERT INTO support_ticket
          (bubble_id, created_date, modified_date, created_by, link_customer, problem_description, technician_remark, status, title, images, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (bubble_id) DO UPDATE SET
          modified_date = EXCLUDED.modified_date,
          link_customer = EXCLUDED.link_customer,
          problem_description = EXCLUDED.problem_description,
          technician_remark = EXCLUDED.technician_remark,
          status = EXCLUDED.status,
          title = EXCLUDED.title,
          images = EXCLUDED.images,
          synced_at = NOW()`,
        [
          r._id ?? null,
          r['Created Date'] ?? null,
          r['Modified Date'] ?? null,
          r['Created By'] ?? null,
          r['link customer'] ?? null,
          r['Problem description'] ?? null,
          r['technician remark'] ?? null,
          r['status'] ?? null,
          r['Title'] ?? null,
          r['images'] ?? null,
        ]
      );
      upserted += 1;
    }

    return { fetched: records.length, upserted };
  }
}

module.exports = new SupportTicketService();
