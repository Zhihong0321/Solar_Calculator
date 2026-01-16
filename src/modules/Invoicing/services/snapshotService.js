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

/**
 * Capture a literal 'photocopy' snapshot of an invoice
 * Stores simplified, human-readable text and values for legal history.
 */
async function captureFlatSnapshot(client, invoiceData, actionType, userId) {
    if (!invoiceData || !invoiceData.bubble_id) return null;

    // Compile the 'Photocopy'
    const photocopy = {
        meta: {
            action: actionType,
            timestamp: new Date().toISOString(),
            operator_id: userId,
            invoice_uid: invoiceData.bubble_id,
            invoice_number: invoiceData.invoice_number,
            version_label: invoiceData.version ? `R${invoiceData.version}` : 'R1'
        },
        legal_header: {
            customer_name: invoiceData.customer_name_snapshot || 'Sample Quotation',
            customer_address: invoiceData.customer_address_snapshot || 'N/A',
            customer_phone: invoiceData.customer_phone_snapshot || 'N/A',
            package_name: invoiceData.package_name_snapshot || 'N/A'
        },
        line_items: (invoiceData.items || []).map(item => ({
            description: item.description,
            qty: item.qty,
            unit_price: item.unit_price,
            total: item.total_price || item.amount
        })),
        financials: {
            subtotal: invoiceData.subtotal,
            discount_fixed: invoiceData.discount_fixed,
            discount_percent: invoiceData.discount_percent,
            voucher_amount: invoiceData.voucher_amount,
            sst_amount: invoiceData.sst_amount,
            total_amount: invoiceData.total_amount
        }
    };

    try {
        const invoiceIntId = invoiceData.id;
        if (!invoiceIntId) return null;

        await client.query(
            `INSERT INTO invoice_snapshot (invoice_id, version, snapshot_data, created_by, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [invoiceIntId, invoiceData.version || 1, JSON.stringify(photocopy), String(userId)]
        );
        return true;
    } catch (err) {
        console.error('[SnapshotService] Flat Snapshot Failed:', err);
        return false;
    }
}

module.exports = {
    captureSnapshot,
    captureFlatSnapshot
};
