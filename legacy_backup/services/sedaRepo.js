const crypto = require('crypto');

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
  
  try {
    const result = await client.query(
      `INSERT INTO seda_registration 
       (bubble_id, linked_invoice, linked_customer, created_by, created_at, updated_at, 
        reg_status, seda_status, created_date, modified_date)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), 'Draft', 'Pending', NOW(), NOW())
       RETURNING *`,
      [bubbleId, [invoiceId], customerId, createdBy]
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

module.exports = {
  getSedaByInvoiceId,
  createSedaRegistration,
  linkSedaToCustomer,
  linkSedaToInvoice
};
