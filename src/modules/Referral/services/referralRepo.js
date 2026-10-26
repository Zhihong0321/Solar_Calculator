/**
 * Referral Repository Module
 * Handles database operations for customer referral program
 */
const crypto = require('crypto');

let referralColumnCache = null;

async function getReferralColumns(client) {
  if (referralColumnCache && referralColumnCache.has('deleted_at')) {
    return referralColumnCache;
  }

  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'referral'`
  );

  referralColumnCache = new Set(result.rows.map((row) => row.column_name));
  return referralColumnCache;
}

async function resolveAgentIdentifiers(client, actorId) {
  const normalized = String(actorId);
  const identifiers = new Set();
  const isDigits = /^\d+$/.test(normalized);

  // Identity is rooted strictly in the "user" table.
  // Table "agent" is not a source of identity.
  const userResult = await client.query(
    `SELECT u.id::text AS user_id,
            u.bubble_id AS user_bubble_id
     FROM "user" u
     WHERE u.bubble_id = $1 ${isDigits ? 'OR u.id::text = $1' : ''}`,
    [normalized]
  );

  if (userResult.rows.length > 0) {
    userResult.rows.forEach((row) => {
      if (row.user_bubble_id) identifiers.add(String(row.user_bubble_id));
      if (row.user_id) identifiers.add(String(row.user_id));
    });
  } else {
    identifiers.add(normalized);
  }

  return Array.from(identifiers);
}

function getLocationExpressions(columns, fallbackAlias = 'referrer') {
  return {
    state: columns.has('state')
      ? `COALESCE(NULLIF(r.state, ''), ${fallbackAlias}.state)`
      : `${fallbackAlias}.state`,
    city: columns.has('city')
      ? `COALESCE(NULLIF(r.city, ''), ${fallbackAlias}.city)`
      : `${fallbackAlias}.city`,
    address: columns.has('address')
      ? `COALESCE(NULLIF(r.address, ''), ${fallbackAlias}.address)`
      : `${fallbackAlias}.address`
  };
}

function getAssignmentExpression(columns) {
  if (columns.has('assigned_agent')) {
    return `COALESCE(NULLIF(r.assigned_agent, ''), r.linked_agent)`;
  }
  return 'r.linked_agent';
}

function getPreferredAgentExpression(columns) {
  if (columns.has('preferred_agent')) {
    return `NULLIF(r.preferred_agent, '')`;
  }
  return 'NULL::text';
}

function getActiveReferralClause(columns, alias = 'r') {
  return columns.has('deleted_at') ? `${alias}.deleted_at IS NULL` : 'TRUE';
}

/**
 * Get referrals by customer ID
 * @param {object} client - Database client
 * @param {string} customerId - Customer bubble_id
 */
async function getReferralsByCustomerId(client, customerId) {
  const columns = await getReferralColumns(client);
  const assignmentExpr = getAssignmentExpression(columns);
  const preferredAgentExpr = getPreferredAgentExpression(columns);
  const location = getLocationExpressions(columns, 'c');
  const activeReferralClause = getActiveReferralClause(columns);

  const result = await client.query(
    `SELECT r.*,
            c.name AS referral_customer_name,
            c.customer_id AS referral_customer_id,
            ${assignmentExpr} AS assigned_agent_key,
            ${preferredAgentExpr} AS preferred_agent_key,
            ${location.state} AS lead_state,
            ${location.city} AS lead_city,
            ${location.address} AS lead_address
     FROM referral r
     LEFT JOIN customer c ON r.linked_invoice IS NOT NULL AND c.customer_id = (
       SELECT i.linked_customer FROM invoice i WHERE i.bubble_id = r.linked_invoice LIMIT 1
     )
     WHERE ${activeReferralClause} AND r.linked_customer_profile = $1
     ORDER BY r.created_at DESC`,
    [customerId]
  );
  return result.rows;
}

/**
 * Get referrals by agent ID
 * @param {object} client - Database client
 * @param {string} agentId - Agent user ID or bubble_id
 */
async function getReferralsByAgentId(client, agentId) {
  const identifiers = await resolveAgentIdentifiers(client, agentId);
  const columns = await getReferralColumns(client);
  const assignmentExpr = getAssignmentExpression(columns);
  const preferredAgentExpr = getPreferredAgentExpression(columns);
  const location = getLocationExpressions(columns, 'c');
  const activeReferralClause = getActiveReferralClause(columns);

  const result = await client.query(
    `SELECT r.*,
            c.name AS customer_name,
            c.customer_id,
            ${assignmentExpr} AS assigned_agent_key,
            ${preferredAgentExpr} AS preferred_agent_key,
            ${location.state} AS lead_state,
            ${location.city} AS lead_city,
            ${location.address} AS lead_address,
            COALESCE(assigned_user.name, ${assignmentExpr}) AS assigned_agent_name,
            COALESCE(preferred_user.name, ${preferredAgentExpr}) AS preferred_agent_name
     FROM referral r
     LEFT JOIN customer c ON r.linked_customer_profile = c.customer_id
     LEFT JOIN "user" assigned_user
       ON (assigned_user.bubble_id = ${assignmentExpr}
           OR (${assignmentExpr} ~ '^[0-9]+$' AND assigned_user.id::text = ${assignmentExpr}))
     LEFT JOIN "user" preferred_user
       ON (preferred_user.bubble_id = ${preferredAgentExpr}
           OR (${preferredAgentExpr} ~ '^[0-9]+$' AND preferred_user.id::text = ${preferredAgentExpr}))
     WHERE ${activeReferralClause} AND ${assignmentExpr} = ANY($1::text[])
     ORDER BY r.created_at DESC`,
    [identifiers]
  );
  return result.rows;
}

/**
 * Check if mobile number already exists in referrals
 * @param {object} client - Database client
 * @param {string} mobileNumber - Mobile number to check
 */
async function checkMobileNumberExists(client, mobileNumber) {
  const columns = await getReferralColumns(client);
  const activeReferralClause = getActiveReferralClause(columns, 'referral');
  const result = await client.query(
    `SELECT bubble_id FROM referral WHERE ${activeReferralClause} AND mobile_number = $1 LIMIT 1`,
    [mobileNumber]
  );
  return result.rows.length > 0;
}

/**
 * Create new referral
 * @param {object} client - Database client
 * @param {object} data - Referral data
 */
async function createReferral(client, data) {
  const { customerId, agentId, name, relationship, mobileNumber } = data;
  const columns = await getReferralColumns(client);
  const referralBubbleId = `ref_${crypto.randomBytes(6).toString('hex')}`;

  const assignmentColumns = columns.has('assigned_agent')
    ? ', assigned_agent'
    : '';
  const assignmentValues = columns.has('assigned_agent')
    ? ', $7'
    : '';
  const params = [referralBubbleId, customerId, agentId, name, relationship, mobileNumber];
  if (columns.has('assigned_agent')) {
    params.push(agentId);
  }

  const result = await client.query(
    `INSERT INTO referral 
     (bubble_id, linked_customer_profile, linked_agent, name, relationship, mobile_number, status, created_at, updated_at${assignmentColumns})
     VALUES ($1, $2, $3, $4, $5, $6, 'Pending', NOW(), NOW()${assignmentValues})
     RETURNING *`,
    params
  );

  return result.rows[0];
}

/**
 * Update referral status and link to invoice when deal closes
 * @param {object} client - Database client
 * @param {string} referralBubbleId - Referral bubble_id
 * @param {object} data - Update data
 */
async function updateReferralStatus(client, referralBubbleId, data) {
  const { status, linkedInvoice, dealValue, commissionEarned } = data;
  const columns = await getReferralColumns(client);
  const statusColumn = columns.has('workflow_status') ? 'workflow_status' : 'status';
  const activeReferralClause = getActiveReferralClause(columns, 'referral');

  const result = await client.query(
    `UPDATE referral 
     SET ${statusColumn} = COALESCE($1, ${statusColumn}),
         linked_invoice = COALESCE($2, linked_invoice),
         deal_value = COALESCE($3, deal_value),
         commission_earned = COALESCE($4, commission_earned),
         updated_at = NOW()
     WHERE bubble_id = $5 AND ${activeReferralClause}
     RETURNING *`,
    [status, linkedInvoice, dealValue, commissionEarned, referralBubbleId]
  );
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get referral by bubble_id
 * @param {object} client - Database client
 * @param {string} bubbleId - Referral bubble_id
 */
async function getReferralByBubbleId(client, bubbleId) {
  const columns = await getReferralColumns(client);
  const activeReferralClause = getActiveReferralClause(columns, 'referral');
  const result = await client.query(
    `SELECT * FROM referral WHERE bubble_id = $1 AND ${activeReferralClause}`,
    [bubbleId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getReferralManagementQueue(client, filters = {}) {
  const columns = await getReferralColumns(client);
  const assignmentExpr = getAssignmentExpression(columns);
  const preferredAgentExpr = getPreferredAgentExpression(columns);
  const location = getLocationExpressions(columns);
  const statusExpr = columns.has('workflow_status') ? 'COALESCE(r.workflow_status, r.status)' : 'r.status';

  const clauses = [];
  const params = [];

  if (columns.has('deleted_at')) {
    clauses.push(filters.status === 'Deleted' ? 'r.deleted_at IS NOT NULL' : 'r.deleted_at IS NULL');
  }

  if (filters.status && filters.status !== 'Deleted') {
    params.push(filters.status);
    clauses.push(`${statusExpr} = $${params.length}`);
  }

  if (filters.assignment === 'assigned') {
    clauses.push(`${assignmentExpr} IS NOT NULL`);
  } else if (filters.assignment === 'unassigned') {
    clauses.push(`${assignmentExpr} IS NULL`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(`(
      r.name ILIKE $${params.length}
      OR COALESCE(r.mobile_number, '') ILIKE $${params.length}
      OR COALESCE(referrer.name, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await client.query(
    `SELECT r.*,
            referrer.name AS referrer_customer_name,
            referrer.customer_id AS referrer_customer_id,
            ${statusExpr} AS workflow_status,
            ${assignmentExpr} AS assigned_agent_key,
            ${preferredAgentExpr} AS preferred_agent_key,
            r.linked_invoice AS customer_profile_id,
            ${location.state} AS lead_state,
            ${location.city} AS lead_city,
            ${location.address} AS lead_address,
            COALESCE(assigned_user.name, ${assignmentExpr}) AS assigned_agent_name,
            COALESCE(preferred_user.name, ${preferredAgentExpr}) AS preferred_agent_name,
            linked_invoice.invoice_id AS linked_invoice_id,
            linked_invoice.invoice_number AS linked_invoice_number
     FROM referral r
     LEFT JOIN customer referrer ON referrer.customer_id = r.linked_customer_profile
     LEFT JOIN LATERAL (
       SELECT i.bubble_id AS invoice_id,
              i.invoice_number
       FROM invoice i
       WHERE i.linked_referral = r.bubble_id
         AND COALESCE(i.is_deleted, false) = false
         AND COALESCE(i.status, '') <> 'deleted'
       ORDER BY i.created_at DESC NULLS LAST, i.id DESC
       LIMIT 1
     ) linked_invoice ON TRUE
     LEFT JOIN "user" assigned_user
       ON (assigned_user.bubble_id = ${assignmentExpr}
           OR (${assignmentExpr} ~ '^[0-9]+$' AND assigned_user.id::text = ${assignmentExpr}))
     LEFT JOIN "user" preferred_user
       ON (preferred_user.bubble_id = ${preferredAgentExpr}
           OR (${preferredAgentExpr} ~ '^[0-9]+$' AND preferred_user.id::text = ${preferredAgentExpr}))
     ${whereClause}
     ORDER BY r.created_at DESC`,
    params
  );

  return result.rows;
}

async function getAssignableAgents(client) {
  const result = await client.query(
    `SELECT DISTINCT
       u.bubble_id AS assignment_key,
       u.id::text AS user_id,
       u.bubble_id AS user_bubble_id,
       u.name,
       u.email,
       u.access_level
     FROM "user" u
     WHERE u.bubble_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM unnest(COALESCE(u.access_level, ARRAY[]::text[])) AS role
         WHERE LOWER(role) LIKE '%sales%'
            OR LOWER(role) LIKE '%osa%'
            OR LOWER(role) LIKE '%oum%'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM unnest(COALESCE(u.access_level, ARRAY[]::text[])) AS role
         WHERE LOWER(role) = 'blocked'
       )
     ORDER BY u.name`
  );

  return result.rows;
}

async function updateReferralAssignment(client, referralBubbleId, assignmentKey) {
  let validatedBubbleId = null;

  if (assignmentKey) {
    const isDigits = /^\d+$/.test(String(assignmentKey));
    const userRes = await client.query(
      `SELECT bubble_id
       FROM "user"
       WHERE (bubble_id = $1 ${isDigits ? 'OR id::text = $1' : ''})
         AND EXISTS (
           SELECT 1
           FROM unnest(COALESCE(access_level, ARRAY[]::text[])) AS role
           WHERE LOWER(role) LIKE '%sales%'
              OR LOWER(role) LIKE '%osa%'
              OR LOWER(role) LIKE '%oum%'
         )
       LIMIT 1`,
      [String(assignmentKey)]
    );

    if (userRes.rows.length === 0) {
      throw new Error('Assigned user must be an active sales user');
    }
    validatedBubbleId = userRes.rows[0].bubble_id;
  }

  const columns = await getReferralColumns(client);
  const updates = ['linked_agent = $1', 'updated_at = NOW()'];

  if (columns.has('assigned_agent')) {
    updates.unshift('assigned_agent = $1');
  }

  const result = await client.query(
    `UPDATE referral
     SET ${updates.join(', ')}
     WHERE bubble_id = $2${columns.has('deleted_at') ? ' AND deleted_at IS NULL' : ''}
     RETURNING *`,
    [validatedBubbleId, referralBubbleId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

async function softDeleteReferral(client, referralBubbleId, deletedBy) {
  const columns = await getReferralColumns(client);
  if (!columns.has('deleted_at')) {
    throw new Error('Referral soft delete is not available until the database migration is applied');
  }

  const deletedByUpdate = columns.has('deleted_by') ? ', deleted_by = $2' : '';
  const params = columns.has('deleted_by')
    ? [referralBubbleId, deletedBy || null]
    : [referralBubbleId];

  const result = await client.query(
    `UPDATE referral
     SET deleted_at = NOW(),
         updated_at = NOW()${deletedByUpdate}
     WHERE bubble_id = $1
       AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get customer ID from invoice share token
 * @param {object} client - Database client
 * @param {string} shareToken - Invoice share token
 */
async function getCustomerIdFromShareToken(client, shareToken) {
  const invoiceRepo = require('../../Invoicing/services/invoiceRepo');
  const invoice = await invoiceRepo.getPublicInvoice(client, shareToken);
  return invoice ? invoice.linked_customer : null;
}

/**
 * Get agent ID from customer
 * Resolves to the user's bubble_id if they are an active sales user
 * @param {object} client - Database client
 * @param {string} customerId - Customer bubble_id (customer_id)
 */
async function getAgentIdFromCustomer(client, customerId) {
  const result = await client.query(
    `SELECT u.bubble_id
     FROM customer c
     JOIN "user" u
       ON (u.bubble_id = c.created_by
           OR (c.created_by ~ '^[0-9]+$' AND u.id::text = c.created_by))
     WHERE c.customer_id = $1
       AND EXISTS (
         SELECT 1
         FROM unnest(COALESCE(u.access_level, ARRAY[]::text[])) AS role
         WHERE LOWER(role) LIKE '%sales%'
            OR LOWER(role) LIKE '%osa%'
            OR LOWER(role) LIKE '%oum%'
       )
     LIMIT 1`,
    [customerId]
  );
  return result.rows.length > 0 ? result.rows[0].bubble_id : null;
}

module.exports = {
  resolveAgentIdentifiers,
  getReferralsByCustomerId,
  getReferralsByAgentId,
  getReferralManagementQueue,
  getAssignableAgents,
  createReferral,
  updateReferralAssignment,
  softDeleteReferral,
  updateReferralStatus,
  getReferralByBubbleId,
  getCustomerIdFromShareToken,
  getAgentIdFromCustomer,
  checkMobileNumberExists
};
