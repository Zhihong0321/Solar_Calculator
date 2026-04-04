/**
 * Referral Repository Module
 * Handles database operations for customer referral program
 */
const crypto = require('crypto');

let referralColumnCache = null;

async function getReferralColumns(client) {
  if (referralColumnCache) {
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

  // 1. Try to resolve as a USER first to avoid ambiguous integer collisions between user.id and agent.id
  const userResult = await client.query(
    `SELECT a.id::text AS agent_id,
            a.bubble_id AS agent_bubble_id,
            u.bubble_id AS user_bubble_id,
            u.linked_agent_profile
     FROM "user" u
     LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR u.bubble_id = a.linked_user_login)
     WHERE u.id::text = $1 OR u.bubble_id = $1`,
    [normalized]
  );

  if (userResult.rows.length > 0) {
    userResult.rows.forEach((row) => {
      [row.agent_id, row.agent_bubble_id, row.user_bubble_id, row.linked_agent_profile]
        .filter(Boolean)
        .forEach((v) => identifiers.add(String(v)));
    });
  } else {
    // 2. If no user found, try resolving as an AGENT directly (e.g. if actorId is an agent bubble_id)
    const agentResult = await client.query(
      `SELECT a.id::text AS agent_id,
              a.bubble_id AS agent_bubble_id,
              a.linked_user_login AS user_bubble_id
       FROM agent a
       WHERE a.id::text = $1 OR a.bubble_id = $1`,
      [normalized]
    );
    agentResult.rows.forEach((row) => {
      [row.agent_id, row.agent_bubble_id, row.user_bubble_id]
        .filter(Boolean)
        .forEach((v) => identifiers.add(String(v)));
    });
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
     WHERE r.linked_customer_profile = $1
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

  const result = await client.query(
    `SELECT r.*,
            c.name AS customer_name,
            c.customer_id,
            ${assignmentExpr} AS assigned_agent_key,
            ${preferredAgentExpr} AS preferred_agent_key,
            ${location.state} AS lead_state,
            ${location.city} AS lead_city,
            ${location.address} AS lead_address,
            COALESCE(assigned_agent.name, assigned_user.name, ${assignmentExpr}) AS assigned_agent_name,
            COALESCE(preferred_agent.name, preferred_user.name, ${preferredAgentExpr}) AS preferred_agent_name
     FROM referral r
     LEFT JOIN customer c ON r.linked_customer_profile = c.customer_id
     LEFT JOIN agent assigned_agent
       ON (assigned_agent.id::text = ${assignmentExpr}
           OR assigned_agent.bubble_id = ${assignmentExpr}
           OR assigned_agent.linked_user_login = ${assignmentExpr})
     LEFT JOIN "user" assigned_user
       ON (assigned_user.id::text = ${assignmentExpr}
           OR assigned_user.bubble_id = ${assignmentExpr})
     LEFT JOIN agent preferred_agent
       ON (${preferredAgentExpr} IS NOT NULL AND (
             preferred_agent.id::text = ${preferredAgentExpr}
             OR preferred_agent.bubble_id = ${preferredAgentExpr}
             OR preferred_agent.linked_user_login = ${preferredAgentExpr}
          ))
     LEFT JOIN "user" preferred_user
       ON (preferred_user.id::text = ${preferredAgentExpr}
           OR preferred_user.bubble_id = ${preferredAgentExpr})
     WHERE ${assignmentExpr} = ANY($1::text[])
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
  const result = await client.query(
    `SELECT bubble_id FROM referral WHERE mobile_number = $1 LIMIT 1`,
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

  const result = await client.query(
    `UPDATE referral 
     SET ${statusColumn} = COALESCE($1, ${statusColumn}),
         linked_invoice = COALESCE($2, linked_invoice),
         deal_value = COALESCE($3, deal_value),
         commission_earned = COALESCE($4, commission_earned),
         updated_at = NOW()
     WHERE bubble_id = $5
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
  const result = await client.query(
    `SELECT * FROM referral WHERE bubble_id = $1`,
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

  if (filters.status) {
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
            ${location.state} AS lead_state,
            ${location.city} AS lead_city,
            ${location.address} AS lead_address,
            COALESCE(assigned_agent.name, assigned_user.name, ${assignmentExpr}) AS assigned_agent_name,
            COALESCE(preferred_agent.name, preferred_user.name, ${preferredAgentExpr}) AS preferred_agent_name
     FROM referral r
     LEFT JOIN customer referrer ON referrer.customer_id = r.linked_customer_profile
     LEFT JOIN agent assigned_agent
       ON (assigned_agent.id::text = ${assignmentExpr}
           OR assigned_agent.bubble_id = ${assignmentExpr}
           OR assigned_agent.linked_user_login = ${assignmentExpr})
     LEFT JOIN "user" assigned_user
       ON (assigned_user.id::text = ${assignmentExpr}
           OR assigned_user.bubble_id = ${assignmentExpr})
     LEFT JOIN agent preferred_agent
       ON (${preferredAgentExpr} IS NOT NULL AND (
             preferred_agent.id::text = ${preferredAgentExpr}
             OR preferred_agent.bubble_id = ${preferredAgentExpr}
             OR preferred_agent.linked_user_login = ${preferredAgentExpr}
          ))
     LEFT JOIN "user" preferred_user
       ON (preferred_user.id::text = ${preferredAgentExpr}
           OR preferred_user.bubble_id = ${preferredAgentExpr})
     ${whereClause}
     ORDER BY r.created_at DESC`,
    params
  );

  return result.rows;
}

async function getAssignableAgents(client) {
  const result = await client.query(
    `SELECT DISTINCT
       a.id::text AS assignment_key,
       a.id::text AS agent_id,
       a.bubble_id AS agent_bubble_id,
       u.id::text AS user_id,
       u.bubble_id AS user_bubble_id,
       a.name,
       u.email,
       u.access_level
     FROM agent a
     LEFT JOIN "user" u
       ON (u.linked_agent_profile = a.bubble_id OR u.bubble_id = a.linked_user_login)
     WHERE a.name IS NOT NULL
       AND u.id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM unnest(COALESCE(u.access_level, ARRAY[]::text[])) AS role
         WHERE role IN ('sales', 'hr', 'kc')
            OR role LIKE 'team-%'
       )
     ORDER BY a.name`
  );

  return result.rows;
}

async function updateReferralAssignment(client, referralBubbleId, assignmentKey) {
  const columns = await getReferralColumns(client);
  const updates = ['linked_agent = $1', 'updated_at = NOW()'];

  if (columns.has('assigned_agent')) {
    updates.unshift('assigned_agent = $1');
  }

  const result = await client.query(
    `UPDATE referral
     SET ${updates.join(', ')}
     WHERE bubble_id = $2
     RETURNING *`,
    [assignmentKey || null, referralBubbleId]
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
 * @param {object} client - Database client
 * @param {string} customerId - Customer bubble_id (customer_id)
 */
async function getAgentIdFromCustomer(client, customerId) {
  const result = await client.query(
    `SELECT created_by FROM customer WHERE customer_id = $1`,
    [customerId]
  );
  return result.rows.length > 0 ? result.rows[0].created_by : null;
}

module.exports = {
  resolveAgentIdentifiers,
  getReferralsByCustomerId,
  getReferralsByAgentId,
  getReferralManagementQueue,
  getAssignableAgents,
  createReferral,
  updateReferralAssignment,
  updateReferralStatus,
  getReferralByBubbleId,
  getCustomerIdFromShareToken,
  getAgentIdFromCustomer,
  checkMobileNumberExists
};
