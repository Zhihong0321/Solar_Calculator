/**
 * Snapshot Service
 * Handles historical record keeping for invoices.
 */
const crypto = require('crypto');

/**
 * Capture a point-in-time snapshot of an invoice
 * This stores the FULL state (customer, package, items, totals) as a JSON blob.
 * 
 * @param {object} client - Database client (inside transaction)
 * @param {object} invoiceData - Full invoice object including .items
 * @param {string} actionType - e.g. 'CREATED', 'EDITED', 'VERSIONED'
 * @param {string|number} userId - Who performed the action
 * @param {string} [description] - Optional remark
 * @returns {Promise<string>} The action ID
 */
async function captureSnapshot(client, invoiceData, actionType, userId, description = '') {
    if (!invoiceData || !invoiceData.bubble_id) {
        throw new Error('Invalid invoice data for snapshot');
    }

    const actionId = `act_${crypto.randomBytes(8).toString('hex')}`;
    const invoiceId = invoiceData.bubble_id;
    const version = invoiceData.version || 1;
    const createdBy = String(userId);

    // Prepare the JSON snapshot
    // We clone to ensure we don't modify the original object
    const snapshot = { ...invoiceData };
    
    const details = {
        description: description || `${actionType} recorded`,
        snapshot: snapshot
    };

    try {
        // 1. Log to invoice_action (Legacy compatibility & Action log)
        await client.query(
            `INSERT INTO invoice_action (bubble_id, invoice_id, action_type, details, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [actionId, invoiceId, actionType, JSON.stringify(details), createdBy]
        );

        // 2. Log to invoice_snapshot (Immutable Versioning)
        // Note: Using the integer ID if available, or bubble_id if that's what the schema expects
        // Looking at the schema check earlier, invoice_snapshot.invoice_id references invoice.id (integer)
        const invoiceIntId = invoiceData.id;

        if (invoiceIntId) {
            await client.query(
                `INSERT INTO invoice_snapshot (invoice_id, version, snapshot_data, created_by, created_at)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [invoiceIntId, version, JSON.stringify(snapshot), createdBy]
            );
        }

        return actionId;
    } catch (err) {
        console.error('[SnapshotService] Failed to capture snapshot:', err);
        // We don't throw here to prevent the main transaction from failing if snapshotting fails
        // but in a critical system, you might want to throw.
        return null;
    }
}

module.exports = {
    captureSnapshot
};
