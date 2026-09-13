/**
 * Customer Repository Module
 * Handles database operations for customer management
 */
const crypto = require('crypto');

async function resolveCustomerOwnerIdentifiers(client, ownerKey) {
  const normalizedOwnerKey = String(ownerKey);
  const ownerIdentifiers = new Set([normalizedOwnerKey]);

  const userResult = await client.query(
    `SELECT id::text AS user_id, bubble_id
     FROM "user"
     WHERE bubble_id = $1 OR id::text = $1
     LIMIT 1`,
    [normalizedOwnerKey]
  );

  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];
    if (user.user_id) ownerIdentifiers.add(String(user.user_id));
    if (user.bubble_id) ownerIdentifiers.add(String(user.bubble_id));
  }

  return Array.from(ownerIdentifiers);
}

/**
 * Get customers by owner identity (created_by)
 * @param {object} client - Database client
 * @param {string} ownerKey - User bubble_id (preferred) or legacy user id
 * @param {object} options - { limit, offset, search, status: 'paid'|'unpaid' }
 *
 * Each row is enriched with payment totals and their linked SEDA registration's
 * form/admin status, since the "My Customers" directory shows these per card.
 *
 * Paid totals come from the `payment` table, not `invoice.paid_amount` — that
 * column is unpopulated Bubble-sync leftover (see fetchOfficePaidAmount in
 * invoiceOfficeRoutes.js: only `payment` rows count as verified/paid money).
 */
async function getCustomersByUserId(client, ownerKey, options = {}) {
  const limit = parseInt(options.limit) || 100;
  const offset = parseInt(options.offset) || 0;
  const search = options.search ? `%${options.search}%` : null;
  const status = options.status === 'paid' || options.status === 'unpaid' ? options.status : null;
  const ownerIdentifiers = await resolveCustomerOwnerIdentifiers(client, ownerKey);

  const whereParams = [ownerIdentifiers];
  const conditions = ['c.created_by = ANY($1::text[])'];

  if (search) {
    whereParams.push(search);
    conditions.push(`(c.name ILIKE $${whereParams.length} OR c.phone ILIKE $${whereParams.length} OR c.email ILIKE $${whereParams.length})`);
  }

  if (status === 'paid') {
    conditions.push('COALESCE(cpa.total_paid, 0) > 0');
  } else if (status === 'unpaid') {
    conditions.push('COALESCE(cpa.total_paid, 0) = 0');
  }

  const whereClause = conditions.join(' AND ');
  const joinClause = `
    FROM customer c
    LEFT JOIN (
      SELECT linked_customer,
             SUM(COALESCE(amount, 0)) AS total_paid,
             MAX(payment_date) AS last_payment_date
      FROM payment
      WHERE linked_customer IS NOT NULL
      GROUP BY linked_customer
    ) cpa ON cpa.linked_customer = c.customer_id
    LEFT JOIN (
      SELECT linked_customer,
             SUM(COALESCE(total_amount, 0)) AS total_invoiced,
             MAX(updated_at) AS last_invoice_activity
      FROM invoice
      WHERE is_deleted IS NOT TRUE AND linked_customer IS NOT NULL
      GROUP BY linked_customer
    ) cia ON cia.linked_customer = c.customer_id
    LEFT JOIN seda_registration s ON s.bubble_id = c.linked_seda_registration
  `;

  const result = await client.query(
    `SELECT c.*,
            COALESCE(cpa.total_paid, 0) AS total_paid,
            COALESCE(cia.total_invoiced, 0) AS total_invoiced,
            CASE WHEN COALESCE(cia.total_invoiced, 0) > 0
                 THEN ROUND((COALESCE(cpa.total_paid, 0) / cia.total_invoiced) * 100, 1)
                 ELSE 0 END AS paid_percent,
            COALESCE(cpa.last_payment_date, cia.last_invoice_activity) AS last_activity,
            s.mapper_status AS seda_form_status,
            s.seda_status AS seda_admin_status
     ${joinClause}
     WHERE ${whereClause}
     ORDER BY COALESCE(cpa.last_payment_date, cia.last_invoice_activity, c.updated_at, c.created_at) DESC
     LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
    [...whereParams, limit, offset]
  );

  const countResult = await client.query(
    `SELECT COUNT(*) as total ${joinClause} WHERE ${whereClause}`,
    whereParams
  );

  return {
    customers: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset,
    status: status || 'all'
  };
}

/**
 * Get customer by ID
 * @param {object} client - Database client
 * @param {number} id - Internal ID
 */
async function getCustomerById(client, id) {
  const result = await client.query(
    `SELECT * FROM customer WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Create new customer
 * @param {object} client - Database client
 * @param {object} data - Customer data
 */
async function createCustomer(client, data) {
  const { name, phone, email, address, city, state, postcode, userId, profilePicture, leadSource, remark } = data;

  const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;

  const result = await client.query(
    `INSERT INTO customer 
     (customer_id, name, phone, email, address, city, state, postcode, created_by, created_at, updated_at, profile_picture, lead_source, remark)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10, $11, $12)
     RETURNING *`,
    [customerBubbleId, name, phone, email, address, city, state, postcode, String(userId), profilePicture, leadSource, remark]
  );

  return result.rows[0];
}

/**
 * Update customer
 * @param {object} client - Database client
 * @param {number} id - Internal ID
 * @param {object} data - Data to update
 */
async function updateCustomer(client, id, data) {
  const { name, phone, email, address, city, state, postcode, userId, profilePicture, leadSource, remark } = data;
  const ownerIdentifiers = await resolveCustomerOwnerIdentifiers(client, userId);

  const result = await client.query(
    `UPDATE customer 
     SET name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         email = COALESCE($3, email),
         address = COALESCE($4, address),
         city = COALESCE($5, city),
         state = COALESCE($6, state),
         postcode = COALESCE($7, postcode),
         profile_picture = COALESCE($10, profile_picture),
         lead_source = COALESCE($11, lead_source),
         remark = COALESCE($12, remark),
         updated_at = NOW(),
         updated_by = $8
     WHERE id = $9 AND created_by = ANY($13::text[])
     RETURNING *`,
    [name, phone, email, address, city, state, postcode, String(userId), id, profilePicture, leadSource, remark, ownerIdentifiers]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Delete customer (Hard delete for now, or check for linked invoices?)
 * Ideally we should soft delete or block if invoices exist.
 * For now, let's try delete and let FK constraints fail if linked.
 */
async function deleteCustomer(client, id, userId) {
  try {
    const ownerIdentifiers = await resolveCustomerOwnerIdentifiers(client, userId);
    const result = await client.query(
      `DELETE FROM customer WHERE id = $1 AND created_by = ANY($2::text[]) RETURNING id`,
      [id, ownerIdentifiers]
    );
    return result.rows.length > 0;
  } catch (err) {
    // If FK constraint fails
    if (err.code === '23503') {
      throw new Error('Cannot delete customer because they are linked to existing invoices.');
    }
    throw err;
  }
}

/**
 * Get customer history from customer_history table
 * @param {object} client - Database client
 * @param {number} id - Customer internal ID (id from customer table)
 * @param {string} userId - User ID who owns the customer
 */
async function getCustomerHistory(client, id, userId) {
  const ownerIdentifiers = await resolveCustomerOwnerIdentifiers(client, userId);
  // First verify ownership of the customer
  const ownershipCheck = await client.query(
    'SELECT id FROM customer WHERE id = $1 AND created_by = ANY($2::text[])',
    [id, ownerIdentifiers]
  );

  if (ownershipCheck.rows.length === 0) {
    return [];
  }

  // Fetch history
  const result = await client.query(
    `SELECT * FROM customer_history 
     WHERE customer_id = $1 
     ORDER BY changed_at DESC`,
    [id]
  );

  return result.rows;
}

/**
 * Get lead source statistics
 */
async function getLeadSourceStatistics(client, options = {}) {
  const { startDate, endDate } = options;
  const params = [];
  let whereClause = '1=1';

  if (startDate) {
    params.push(startDate);
    whereClause += ` AND DATE(created_at) >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate);
    whereClause += ` AND DATE(created_at) <= $${params.length}`;
  }

  const query = `
    SELECT 
      lead_source,
      COUNT(*) as count
    FROM customer
    WHERE ${whereClause}
    GROUP BY lead_source
    ORDER BY count DESC
  `;

  const result = await client.query(query, params);
  return result.rows;
}

module.exports = {
  getCustomersByUserId,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
  getLeadSourceStatistics
};
