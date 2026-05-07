'use strict';

const SOURCE_APP = 'agent-os';

let _tableExists = null;
const _idCache = new Map(); // bubble_id -> {id, invoice_number}

async function checkAuditTableExists(client) {
    if (_tableExists !== null) return _tableExists;
    try {
        const result = await client.query(
            `SELECT 1
               FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'invoice_audit_log'
              LIMIT 1`
        );
        _tableExists = result.rows.length > 0;
    } catch (_) {
        _tableExists = false;
    }
    return _tableExists;
}

async function resolveInvoiceId(client, bubbleId) {
    if (!bubbleId) return null;
    const cached = _idCache.get(bubbleId);
    if (cached) return cached;
    try {
        const result = await client.query(
            `SELECT id, invoice_number FROM invoice WHERE bubble_id = $1 LIMIT 1`,
            [bubbleId]
        );
        if (result.rows[0]) {
            _idCache.set(bubbleId, result.rows[0]);
            return result.rows[0];
        }
    } catch (_) {}
    return null;
}

/**
 * Write a single audit entry to invoice_audit_log.
 * Matches PRODUCTION schema: invoice_id (INTEGER), actor_name/actor_phone/actor_role.
 * Safe to call inside or outside a transaction — does NOT throw on failure.
 *
 * @param {object} client - Active pg client
 * @param {object} opts
 * @param {string}  opts.invoiceBubbleId - Invoice bubble_id this entry belongs to
 * @param {string}  [opts.entityType]    - e.g. 'invoice', 'invoice_item', 'invoice_upload', 'seda_registration', 'seda_upload'
 * @param {string}  [opts.actionType]    - 'insert' | 'update' | 'delete' | 'ADDED' | 'UPDATED' | 'DELETED'
 * @param {string}  [opts.entityId]      - bubble_id of the entity being changed (optional)
 * @param {Array}   [opts.changes]       - [{field, before?, after?}]
 * @param {string}  [opts.actorName]
 * @param {string}  [opts.actorPhone]
 * @param {string}  [opts.actorRole]
 * @param {string}  [opts.actorUserId]   - actor user bubble_id
 * @param {string}  [opts.sourceApp]
 */
async function writeInvoiceAuditEntry(client, {
    invoiceBubbleId,
    entityType = 'invoice',
    actionType = 'UPDATED',
    entityId = null,
    changes = null,
    actorName = null,
    actorPhone = null,
    actorRole = null,
    actorUserId = null,
    sourceApp = SOURCE_APP,
    strict = false
} = {}) {
    if (!invoiceBubbleId) {
        if (strict) throw new Error('invoiceBubbleId is required for audit logging');
        return;
    }

    try {
        const exists = await checkAuditTableExists(client);
        if (!exists) {
            if (strict) throw new Error('invoice_audit_log table does not exist');
            return;
        }

        // Resolve numeric invoice_id from bubble_id
        const invoice = await resolveInvoiceId(client, invoiceBubbleId);
        if (!invoice) {
            if (strict) throw new Error(`Invoice not found for bubble_id ${invoiceBubbleId}`);
            return;
        }

        // Normalize action_type to lowercase for consistency with prod
        const normalizedAction = String(actionType || 'UPDATED').toLowerCase();

        await client.query(
            `INSERT INTO invoice_audit_log
                (invoice_id, invoice_number, entity_type, entity_id, action_type, changes,
                 actor_user_id, actor_phone, actor_name, actor_role, source_app, edited_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [
                invoice.id,
                invoice.invoice_number || null,
                entityType || 'invoice',
                entityId || invoiceBubbleId,
                normalizedAction,
                changes !== null ? JSON.stringify(changes) : null,
                actorUserId || null,
                actorPhone  || null,
                actorName   || null,
                actorRole   || null,
                sourceApp   || SOURCE_APP
            ]
        );
    } catch (err) {
        console.error('[auditWriter] Failed to write invoice_audit_log entry:', err.message);
        if (strict) {
            throw err;
        }
    }
}

module.exports = { writeInvoiceAuditEntry };
