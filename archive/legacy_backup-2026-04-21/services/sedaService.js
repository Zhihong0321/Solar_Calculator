const sedaRepo = require('./sedaRepo');

/**
 * Ensure SEDA registration exists for an invoice if customer is present
 * @param {object} client - Database client (in transaction)
 * @param {string} invoiceId - Invoice Bubble ID
 * @param {string} customerId - Customer Bubble ID
 * @param {string} userId - User ID creating/updating
 */
async function ensureSedaRegistration(client, invoiceId, customerId, userId) {
    if (!invoiceId || !customerId) return;

    // Check if exists
    const existing = await sedaRepo.getSedaByInvoiceId(client, invoiceId);
    if (existing) return existing;

    // Create new
    const newSeda = await sedaRepo.createSedaRegistration(client, {
        invoiceId,
        customerId,
        createdBy: userId
    });

    // Link back
    await sedaRepo.linkSedaToCustomer(client, customerId, newSeda.bubble_id);
    await sedaRepo.linkSedaToInvoice(client, invoiceId, newSeda.bubble_id);

    return newSeda;
}

module.exports = {
    ensureSedaRegistration
};
