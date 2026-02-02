/**
 * Referral Repository Module
 * Handles database operations for customer referral program
 */
const crypto = require('crypto');

/**
 * Get referrals by customer ID
 * @param {object} client - Database client
 * @param {string} customerId - Customer bubble_id
 */
async function getReferralsByCustomerId(client, customerId) {
  const result = await client.query(
    `SELECT r.*, c.name as referral_customer_name, c.customer_id as referral_customer_id
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
  const result = await client.query(
    `SELECT r.*, c.name as customer_name, c.customer_id
     FROM referral r
     LEFT JOIN customer c ON r.linked_customer_profile = c.customer_id
     WHERE r.linked_agent = $1
     ORDER BY r.created_at DESC`,
    [agentId]
  );
  return result.rows;
}

/**
 * Create new referral
 * @param {object} client - Database client
 * @param {object} data - Referral data
 */
async function createReferral(client, data) {
  const { customerId, agentId, name, relationship, mobileNumber } = data;
  
  const referralBubbleId = `ref_${crypto.randomBytes(6).toString('hex')}`;
  
  const result = await client.query(
    `INSERT INTO referral 
     (bubble_id, linked_customer_profile, linked_agent, name, relationship, mobile_number, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Pending', NOW(), NOW())
     RETURNING *`,
    [referralBubbleId, customerId, agentId, name, relationship, mobileNumber]
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
  
  const result = await client.query(
    `UPDATE referral 
     SET status = COALESCE($1, status),
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
  getReferralsByCustomerId,
  getReferralsByAgentId,
  createReferral,
  updateReferralStatus,
  getReferralByBubbleId,
  getCustomerIdFromShareToken,
  getAgentIdFromCustomer
};
