const crypto = require('crypto');

/**
 * Generate a unique share token
 * @returns {string} Share token
 */
function generateShareToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if SEDA registration exists for a given invoice
 * @param {object} client - Database client
 * @param {string} invoiceId - Invoice Bubble ID
 * @returns {Promise<object|null>} Existing SEDA registration or null
 */
async function getSedaByInvoiceId(client, invoiceId) {
  try {
    const result = await client.query(
      `SELECT * FROM seda_registration WHERE $1 = ANY(linked_invoice) LIMIT 1`,
      [invoiceId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error fetching SEDA by invoice:', err);
    throw err;
  }
}

/**
 * Create a new SEDA registration record
 * @param {object} client - Database client
 * @param {object} data - SEDA data
 * @returns {Promise<object>} Created SEDA record
 */
async function createSedaRegistration(client, data) {
  const { invoiceId, customerId, createdBy } = data;
  const bubbleId = `seda_${crypto.randomBytes(8).toString('hex')}`;
  const shareToken = generateShareToken();
  // Share link expires in 30 days by default
  const shareExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  try {
    const result = await client.query(
      `INSERT INTO seda_registration
       (bubble_id, linked_invoice, linked_customer, created_by, created_at, updated_at,
        reg_status, seda_status, created_date, modified_date, share_token, share_enabled, share_expires_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), 'Draft', 'Pending', NOW(), NOW(), $5, true, $6)
       RETURNING *`,
      [bubbleId, [invoiceId], customerId, createdBy, shareToken, shareExpiresAt]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error creating SEDA registration:', err);
    throw err;
  }
}

/**
 * Link SEDA to Customer
 * @param {object} client 
 * @param {string} customerId 
 * @param {string} sedaId 
 */
async function linkSedaToCustomer(client, customerId, sedaId) {
    try {
        // Need to find the customer row first to update it.
        // Assuming customer_id is the bubble_id in the customer table? 
        // Wait, customer table has `customer_id` column as the bubble_id.
        // And `id` as integer. The `linked_customer` in `seda_registration` is text (likely bubble_id).
        // Let's verify `customerId` passed here is bubble_id.
        
        await client.query(
            `UPDATE customer SET linked_seda_registration = $1, updated_at = NOW() WHERE customer_id = $2`,
            [sedaId, customerId]
        );
    } catch (err) {
        console.error('Error linking SEDA to customer:', err);
        throw err;
    }
}

/**
 * Link SEDA to Invoice
 * @param {object} client 
 * @param {string} invoiceId 
 * @param {string} sedaId 
 */
async function linkSedaToInvoice(client, invoiceId, sedaId) {
    try {
        await client.query(
            `UPDATE invoice SET linked_seda_registration = $1, updated_at = NOW() WHERE bubble_id = $2`,
            [sedaId, invoiceId]
        );
    } catch (err) {
        console.error('Error linking SEDA to invoice:', err);
        throw err;
    }
}

/**
 * Get SEDA registration by share token (for public access)
 * @param {object} client - Database client
 * @param {string} shareToken - Share token
 * @returns {Promise<object|null>} SEDA registration with linked customer or null
 */
async function getByShareToken(client, shareToken) {
    try {
        const result = await client.query(
            `SELECT
                s.*,
                COALESCE(c.name, s.linked_customer_name) as customer_name,
                c.phone,
                c.email,
                c.address,
                c.city,
                c.state,
                c.postcode
             FROM seda_registration s
             LEFT JOIN customer c ON s.linked_customer = c.customer_id
             WHERE s.share_token = $1
               AND s.share_enabled = true
               AND (s.share_expires_at IS NULL OR s.share_expires_at > NOW())
             LIMIT 1`,
            [shareToken]
        );
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
        console.error('Error fetching SEDA by share token:', err);
        throw err;
    }
}

/**
 * Get SEDA share URL
 * @param {object} client - Database client
 * @param {string} bubbleId - SEDA bubble ID
 * @param {string} protocol - Protocol (http/https)
 * @param {string} host - Host header
 * @returns {Promise<string|null>} Share URL or null
 */
async function getShareUrl(client, bubbleId, protocol, host) {
    try {
        const result = await client.query(
            `SELECT share_token, share_enabled FROM seda_registration WHERE bubble_id = $1`,
            [bubbleId]
        );
        if (result.rows.length === 0 || !result.rows[0].share_enabled) {
            return null;
        }
        return `${protocol}://${host}/seda-public/${result.rows[0].share_token}`;
    } catch (err) {
        console.error('Error getting SEDA share URL:', err);
        throw err;
    }
}

/**
 * Update the linked customer for a SEDA registration
 * @param {object} client 
 * @param {string} sedaId 
 * @param {string} customerId 
 */
async function updateSedaLinkedCustomer(client, sedaId, customerId) {
    try {
        await client.query(
            `UPDATE seda_registration SET linked_customer = $1, updated_at = NOW() WHERE bubble_id = $2`,
            [customerId, sedaId]
        );
    } catch (err) {
        console.error('Error updating SEDA linked customer:', err);
        throw err;
    }
}

module.exports = {
  getSedaByInvoiceId,
  createSedaRegistration,
  linkSedaToCustomer,
  linkSedaToInvoice,
  getByShareToken,
  getShareUrl,
  generateShareToken,
  updateSedaLinkedCustomer
};
