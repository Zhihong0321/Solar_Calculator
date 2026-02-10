/**
 * Customer Repository Module
 * Handles database operations for customer management
 */
const crypto = require('crypto');

/**
 * Get customers by User ID (created_by)
 * @param {object} client - Database client
 * @param {string} userId - User ID
 * @param {object} options - { limit, offset, search }
 */
async function getCustomersByUserId(client, userId, options = {}) {
  const limit = parseInt(options.limit) || 100;
  const offset = parseInt(options.offset) || 0;
  const search = options.search ? `%${options.search}%` : null;

  let query = `
    SELECT * FROM customer 
    WHERE created_by = $1
  `;
  const params = [String(userId)];

  if (search) {
    query += ` AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`;
    params.push(search);
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await client.query(query, params);
  
  // Count total
  let countQuery = `SELECT COUNT(*) as total FROM customer WHERE created_by = $1`;
  const countParams = [String(userId)];
  if (search) {
    countQuery += ` AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`;
    countParams.push(search);
  }
  
  const countResult = await client.query(countQuery, countParams);

  return {
    customers: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset
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
  const { name, phone, email, address, city, state, postcode, userId, profilePicture } = data;
  
  const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;
  
  const result = await client.query(
    `INSERT INTO customer 
     (customer_id, name, phone, email, address, city, state, postcode, created_by, created_at, updated_at, profile_picture)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10)
     RETURNING *`,
    [customerBubbleId, name, phone, email, address, city, state, postcode, String(userId), profilePicture]
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
  const { name, phone, email, address, city, state, postcode, userId, profilePicture } = data;

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
         updated_at = NOW(),
         updated_by = $8
     WHERE id = $9 AND created_by = $8
     RETURNING *`,
    [name, phone, email, address, city, state, postcode, String(userId), id, profilePicture]
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
    const result = await client.query(
      `DELETE FROM customer WHERE id = $1 AND created_by = $2 RETURNING id`,
      [id, String(userId)]
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
  // First verify ownership of the customer
  const ownershipCheck = await client.query(
    'SELECT id FROM customer WHERE id = $1 AND created_by = $2',
    [id, String(userId)]
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

module.exports = {
  getCustomersByUserId,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory
};
