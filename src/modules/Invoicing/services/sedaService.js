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
    
    if (existing) {
        // [Fix] Ensure the existing SEDA record points to the CORRECT customer (in case it changed)
        if (existing.linked_customer !== customerId) {
            console.log(`[SedaService] Updating SEDA ${existing.bubble_id} linked customer from ${existing.linked_customer} to ${customerId}`);
            await sedaRepo.updateSedaLinkedCustomer(client, existing.bubble_id, customerId);
            existing.linked_customer = customerId; // Update local obj
        }

        // [Fix] Ensure bi-directional linking is robust (idempotent updates)
        await sedaRepo.linkSedaToCustomer(client, customerId, existing.bubble_id);
        await sedaRepo.linkSedaToInvoice(client, invoiceId, existing.bubble_id);

        return existing;
    }

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
