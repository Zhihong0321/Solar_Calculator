const pool = require('../../core/database/pool');

const BUBBLE_ENDPOINT = 'https://eternalgy.com/api/1.1/obj/support_ticket';
const VALID_STATUSES = ['unread', 'read by support', 'processing', 'solved'];

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
      conditions.push(`(st.title ILIKE $${idx} OR st.problem_description ILIKE $${idx} OR cp.name ILIKE $${idx})`);
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
        cp.name AS customer_name,
        cp.contact AS customer_contact,
        u.name AS creator_name
      FROM support_ticket st
      LEFT JOIN customer_profile cp ON cp.bubble_id = st.link_customer
      LEFT JOIN "user" u ON u.bubble_id = st.created_by
      ${where}
      ORDER BY st.created_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  async getTicketById(id) {
    const result = await pool.query(
      `SELECT
        st.*,
        cp.name AS customer_name,
        cp.contact AS customer_contact,
        cp.address AS customer_address,
        u.name AS creator_name
       FROM support_ticket st
       LEFT JOIN customer_profile cp ON cp.bubble_id = st.link_customer
       LEFT JOIN "user" u ON u.bubble_id = st.created_by
       WHERE st.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updateTicket(id, { status, technician_remark }) {
    if (status && !VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const result = await pool.query(
      `UPDATE support_ticket
       SET status = COALESCE($2, status),
           technician_remark = COALESCE($3, technician_remark),
           modified_date = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status ?? null, technician_remark ?? null]
    );
    return result.rows[0] || null;
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
