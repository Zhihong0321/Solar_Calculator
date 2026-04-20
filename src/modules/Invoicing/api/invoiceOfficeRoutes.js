const express = require('express');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const { getAuthenticatedUserId } = require('./authUser');
const invoiceRepo = require('../services/invoiceRepo');
const {
    createUploader,
    buildPublicUrl,
    safeDelete,
    resolvedMime,
    fileExtension,
    validateFilename,
    validateSize,
    uploadSuccess,
    uploadError,
    ERROR_CODES,
    logUpload,
    insertRecycleBinEntry,
    listRecycleBinEntries,
    getActiveRecycleBinEntry,
    markRecycleBinRestored,
} = require('../../../core/upload');
let beginAgentAuditTransaction = async (client) => {
    await client.query('BEGIN');
};
let resolveAgentAuditContext = async (client, authUser = {}) => ({
    userPhone: String(authUser?.contact || authUser?.phone || authUser?.mobile_number || authUser?.userPhone || 'system').trim() || 'system',
    userId: String(authUser?.userId || authUser?.id || authUser?.bubbleId || authUser?.bubble_id || authUser?.sub || '').trim() || null,
    userName: String(authUser?.name || authUser?.displayName || authUser?.email || 'system').trim() || 'system',
    userRole: Array.isArray(authUser?.access_level) ? authUser.access_level.join(', ') : String(authUser?.role || '').trim() || null,
    sourceApp: 'agent-os',
    applicationName: 'agent-os'
});

try {
    ({ beginAgentAuditTransaction, resolveAgentAuditContext } = require('../services/agentAuditContext'));
} catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') {
        throw err;
    }
    console.warn('[InvoiceOfficeRoutes] agentAuditContext unavailable, using basic audit fallback.');
}

const router = express.Router();
const FILE_FIELDS = {
    roof_images: {
        label: 'Roof Image',
        accept: ['image/*'],
        maxMB: 10,
        column: 'linked_roof_image',
        storageSubdir: 'roof_images',
    },
    site_assessment_images: {
        label: 'Site Assessment Image',
        accept: ['image/*'],
        maxMB: 10,
        column: 'site_assessment_image',
        storageSubdir: 'site_assessment_images',
    },
    pv_drawings: {
        label: 'PV System Drawing',
        accept: ['application/pdf', 'image/*'],
        maxMB: 10,
        column: 'pv_system_drawing',
        storageSubdir: 'pv_drawings',
    },
};

const uploaders = {};

function getUploader(fieldKey) {
    if (uploaders[fieldKey]) return uploaders[fieldKey];
    const rule = FILE_FIELDS[fieldKey];
    uploaders[fieldKey] = createUploader({
        storageSubdir: rule.storageSubdir,
        allowedMimes: rule.accept,
        maxFileSizeMB: rule.maxMB,
        generateFilename: (req, file) => {
            const ts = Date.now();
            const rand = require('crypto').randomBytes(4).toString('hex');
            return `${fieldKey}_${req.params.bubbleId}_${ts}_${rand}${fileExtension(file)}`;
        }
    });
    return uploaders[fieldKey];
}

async function getInvoiceAccess(client, bubbleId, userId) {
    const invCheck = await client.query(
        'SELECT created_by, linked_agent FROM invoice WHERE bubble_id = $1',
        [bubbleId]
    );

    if (invCheck.rows.length === 0) {
        return { found: false, isOwner: false, invoice: null };
    }

    const invoice = invCheck.rows[0];
    const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
    return { found: true, isOwner, invoice };
}

async function handleInvoiceOfficeUpload(req, res) {
    const { bubbleId, field } = req.params;
    const rule = FILE_FIELDS[field];

    if (!rule) {
        logUpload({ route: req.path, field, recordId: bubbleId, result: 'rejected', code: ERROR_CODES.UNKNOWN_FIELD, error: 'Unknown upload field.' });
        return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, {
            field,
            error: `"${field}" is not a valid Invoice Office upload field.`,
        }));
    }

    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        const access = await getInvoiceAccess(client, bubbleId, userId);

        if (!access.found) {
            return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, {
                field,
                error: 'Invoice not found.',
            }));
        }

        if (!access.isOwner) {
            return res.status(403).json(uploadError(ERROR_CODES.FORBIDDEN, {
                field,
                error: 'You do not have access to this invoice.',
            }));
        }

        const multerErr = await getUploader(field)(req, res);
        if (multerErr) {
            const isTooLarge = multerErr.code === 'LIMIT_FILE_SIZE';
            const isWrongType = multerErr.code === 'WRONG_TYPE';
            const code = isTooLarge ? ERROR_CODES.TOO_LARGE
                : isWrongType ? ERROR_CODES.WRONG_TYPE
                : ERROR_CODES.STORAGE_FAILED;
            const status = isTooLarge ? 413 : isWrongType ? 400 : 500;
            const message = isTooLarge
                ? `${rule.label}: File too large. Maximum is ${rule.maxMB} MB.`
                : (multerErr.message || 'Upload failed.');

            logUpload({
                route: req.path,
                field,
                recordId: bubbleId,
                result: 'rejected',
                code,
                error: message,
            });

            return res.status(status).json(uploadError(code, { field, error: message }));
        }

        if (!req.file) {
            logUpload({ route: req.path, field, recordId: bubbleId, result: 'rejected', code: ERROR_CODES.NO_FILE, error: 'No file received.' });
            return res.status(400).json(uploadError(ERROR_CODES.NO_FILE, {
                field,
                error: `${rule.label}: No file received. Please select a file and try again.`,
            }));
        }

        const sizeCheck = validateSize(req.file.size, rule.maxMB, rule.label);
        if (!sizeCheck.ok) {
            safeDelete(req.file.path);
            logUpload({
                route: req.path,
                field,
                recordId: bubbleId,
                mime: req.file.mimetype,
                sizeBytes: req.file.size,
                result: 'rejected',
                code: ERROR_CODES.TOO_LARGE,
                error: sizeCheck.error,
            });
            return res.status(413).json(uploadError(ERROR_CODES.TOO_LARGE, { field, error: sizeCheck.error }));
        }

        const nameCheck = validateFilename(req.file.originalname || '');
        if (!nameCheck.ok) {
            safeDelete(req.file.path);
            logUpload({
                route: req.path,
                field,
                recordId: bubbleId,
                mime: req.file.mimetype,
                sizeBytes: req.file.size,
                result: 'rejected',
                code: ERROR_CODES.UNSAFE_FILENAME,
                error: nameCheck.error,
            });
            return res.status(400).json(uploadError(ERROR_CODES.UNSAFE_FILENAME, {
                field,
                error: `${rule.label}: ${nameCheck.error}`,
            }));
        }

        const mime = resolvedMime(req.file);
        const fileUrl = buildPublicUrl(req, rule.storageSubdir, req.file.filename);

        try {
            await beginAgentAuditTransaction(client, auditContext);
            await client.query(
                `UPDATE invoice
                 SET ${rule.column} = array_cat(COALESCE(${rule.column}, ARRAY[]::text[]), $1),
                     updated_at = NOW()
                 WHERE bubble_id = $2`,
                [[fileUrl], bubbleId]
            );
            await client.query('COMMIT');
        } catch (dbErr) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('[InvoiceOffice Upload] DB update failed — orphaned file:', req.file.path, dbErr.message);
            logUpload({
                route: req.path,
                field,
                recordId: bubbleId,
                mime,
                sizeBytes: req.file.size,
                filename: req.file.filename,
                result: 'error',
                code: ERROR_CODES.DB_FAILED,
                error: dbErr.message,
            });
            return res.status(500).json(uploadError(ERROR_CODES.DB_FAILED, {
                field,
                error: 'File saved but database update failed. Please try uploading again — the retry is safe.',
            }));
        }

        logUpload({
            route: req.path,
            field,
            recordId: bubbleId,
            mime,
            sizeBytes: req.file.size,
            filename: req.file.filename,
            result: 'success',
        });

        return res.json(uploadSuccess({
            field,
            url: fileUrl,
            filename: req.file.filename,
            mime,
            size: req.file.size,
        }));
    } catch (err) {
        if (req.file?.path) safeDelete(req.file.path);
        console.error('[InvoiceOffice Upload] Unexpected error:', err);
        logUpload({
            route: req.path,
            field,
            recordId: bubbleId,
            mime: req.file?.mimetype,
            sizeBytes: req.file?.size,
            filename: req.file?.filename,
            result: 'error',
            code: ERROR_CODES.SERVER_ERROR,
            error: err.message,
        });
        return res.status(500).json(uploadError(ERROR_CODES.SERVER_ERROR, {
            field,
            error: 'Unexpected upload failure. Please try again.',
        }));
    } finally {
        if (client) client.release();
    }
}

async function fetchOfficeInvoice(client, bubbleId) {
    const baseInvoiceQuery = `
        SELECT 
            i.*,
            COALESCE(c.name, 'Valued Customer') as customer_name,
            c.email as customer_email,
            c.phone as customer_phone,
            c.address as customer_address,
            c.profile_picture as profile_picture,
            c.lead_source as lead_source,
            c.remark as remark,
            pkg.package_name as package_name
         FROM invoice i
         LEFT JOIN customer c ON i.linked_customer = c.customer_id
         LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id OR i.linked_package = pkg.id::text
    `;

    let invoiceRes = await client.query(
        `${baseInvoiceQuery} WHERE i.bubble_id = $1 LIMIT 1`,
        [bubbleId]
    );

    if (invoiceRes.rows.length === 0) {
        invoiceRes = await client.query(
            `${baseInvoiceQuery} WHERE i.id::text = $1 LIMIT 1`,
            [bubbleId]
        );
    }

    return invoiceRes.rows[0] || null;
}

async function fetchOfficeItems(client, invoiceBubbleId, itemIds) {
    const itemsRes = await client.query(
        `SELECT 
            ii.bubble_id,
            ii.linked_invoice as invoice_id,
            ii.description,
            ii.qty,
            ii.unit_price,
            ii.amount as total_price,
            ii.inv_item_type as item_type,
            ii.sort as sort_order,
            ii.created_at,
            ii.is_a_package,
            ii.linked_package,
            ii.linked_product,
            COALESCE(ii.linked_product, ii.linked_package) as product_id,
            COALESCE(pr.name, pkg.package_name, INITCAP(REPLACE(ii.inv_item_type, '_', ' ')), 'Item') as product_name
         FROM invoice_item ii
         LEFT JOIN package pkg ON ii.linked_package = pkg.bubble_id OR ii.linked_package = pkg.id::text
         LEFT JOIN product pr ON ii.linked_product = pr.bubble_id OR ii.linked_product = pr.id::text
         WHERE ii.linked_invoice = $1 
            OR ii.bubble_id = ANY($2::text[])
         ORDER BY ii.sort ASC, ii.created_at ASC`,
        [invoiceBubbleId, itemIds]
    );

    return itemsRes.rows;
}

async function fetchHybridUpgradeApplications(client, itemIds) {
    const hasAuditTable = await invoiceRepo.hasTable(client, 'hybrid_inverter_upgrade_application');
    if (!hasAuditTable || !Array.isArray(itemIds) || itemIds.length === 0) {
        return new Map();
    }

    const appRes = await client.query(
        `SELECT
            invoice_item_bubble_id,
            original_package_bubble_id,
            new_package_bubble_id,
            upgrade_rule_bubble_id,
            upgrade_price_amount,
            applied_by,
            applied_at
         FROM hybrid_inverter_upgrade_application
         WHERE invoice_item_bubble_id = ANY($1::text[])`,
        [itemIds]
    );

    return new Map(appRes.rows.map((row) => [row.invoice_item_bubble_id, row]));
}

async function fetchOfficePaidAmount(client, invoiceBubbleId, paymentIds) {
    const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as paid_amount
         FROM payment
         WHERE linked_invoice = $1 OR bubble_id = ANY($2::text[])`,
        [invoiceBubbleId, paymentIds]
    );
    return parseFloat(paidRes.rows[0]?.paid_amount) || 0;
}

async function fetchOfficeExtras(client, invoice) {
    const invoiceBubbleId = invoice.bubble_id;
    const paymentIds = Array.isArray(invoice.linked_payment) ? invoice.linked_payment : [];
    const [submittedRes, legacyRes] = await Promise.all([
        client.query(
            'SELECT * FROM submitted_payment WHERE linked_invoice = $1 ORDER BY created_at DESC',
            [invoiceBubbleId]
        ),
        client.query(
            'SELECT * FROM payment WHERE linked_invoice = $1 OR bubble_id = ANY($2::text[]) ORDER BY created_at DESC',
            [invoiceBubbleId, paymentIds]
        )
    ]);

    const legacyPayments = legacyRes.rows.map((p) => ({
        ...p,
        status: 'verified',
        attachment: p.attachment || []
    }));

    const paymentsMap = new Map();
    for (const sp of submittedRes.rows) {
        paymentsMap.set(sp.bubble_id, sp);
    }
    for (const lp of legacyPayments) {
        paymentsMap.set(lp.bubble_id, lp);
    }

    const payments = Array.from(paymentsMap.values())
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    let seda = null;
    if (invoice.linked_seda_registration) {
        const sedaRes = await client.query(
            'SELECT * FROM seda_registration WHERE bubble_id = $1',
            [invoice.linked_seda_registration]
        );
        seda = sedaRes.rows[0] || null;
    }

    if (!seda) {
        const fallbackSedaRes = await client.query(
            'SELECT * FROM seda_registration WHERE $1 = ANY(linked_invoice) LIMIT 1',
            [invoiceBubbleId]
        );
        seda = fallbackSedaRes.rows[0] || null;
    }

    const deletedUploads = await listRecycleBinEntries(client, {
        module: 'invoice-office',
        linkedRecordType: 'invoice',
        linkedRecordId: invoiceBubbleId
    });

    return {
        payments,
        seda,
        deleted_uploads: deletedUploads,
        invoice: {
            linked_seda_registration: seda?.bubble_id || invoice.linked_seda_registration || null
        }
    };
}

async function softDeleteInvoiceOfficeFile(client, { bubbleId, fieldKey, url, userId, auditContext }) {
    const rule = FILE_FIELDS[fieldKey];
    if (!rule) {
        throw new Error(`Unknown Invoice Office field "${fieldKey}".`);
    }

    const activeRes = await client.query(`SELECT ${rule.column} AS active_urls FROM invoice WHERE bubble_id = $1`, [bubbleId]);
    const activeUrls = Array.isArray(activeRes.rows[0]?.active_urls) ? activeRes.rows[0].active_urls : [];
    if (!activeUrls.includes(url)) {
        return { ok: false, status: 404, error: 'File not found on the active invoice record' };
    }

    await beginAgentAuditTransaction(client, auditContext);
    await client.query(
        `UPDATE invoice
         SET ${rule.column} = array_remove(${rule.column}, $1),
             updated_at = NOW()
         WHERE bubble_id = $2`,
        [url, bubbleId]
    );
    await insertRecycleBinEntry(client, {
        module: 'invoice-office',
        linkedRecordType: 'invoice',
        linkedRecordId: bubbleId,
        fieldKey,
        fileUrl: url,
        storageSubdir: rule.storageSubdir,
        deletedBy: userId,
        deletedByName: auditContext?.userName || null,
        deletedByRole: auditContext?.userRole || null,
        metadataJson: {
            source: 'invoice-office-delete'
        }
    });
    await client.query('COMMIT');

    return { ok: true };
}

async function restoreInvoiceOfficeFile(client, { bubbleId, fieldKey, recycleBinId, userId, auditContext }) {
    const rule = FILE_FIELDS[fieldKey];
    if (!rule) {
        return { ok: false, status: 400, error: `"${fieldKey}" is not a valid Invoice Office upload field.` };
    }

    const recycleEntry = await getActiveRecycleBinEntry(client, recycleBinId, {
        module: 'invoice-office',
        linkedRecordType: 'invoice',
        linkedRecordId: bubbleId,
        fieldKey
    });

    if (!recycleEntry) {
        return { ok: false, status: 404, error: 'Deleted file not found in recycle bin.' };
    }

    const activeRes = await client.query(`SELECT ${rule.column} AS active_urls FROM invoice WHERE bubble_id = $1`, [bubbleId]);
    const activeUrls = Array.isArray(activeRes.rows[0]?.active_urls) ? activeRes.rows[0].active_urls : [];
    if (activeUrls.includes(recycleEntry.file_url)) {
        return { ok: false, status: 409, error: 'This file is already active on the invoice.' };
    }

    await beginAgentAuditTransaction(client, auditContext);
    await client.query(
        `UPDATE invoice
         SET ${rule.column} = array_cat(COALESCE(${rule.column}, ARRAY[]::text[]), $1),
             updated_at = NOW()
         WHERE bubble_id = $2`,
        [[recycleEntry.file_url], bubbleId]
    );
    await markRecycleBinRestored(client, recycleEntry.id, userId, auditContext?.userName || null);
    await client.query('COMMIT');

    return { ok: true, url: recycleEntry.file_url };
}

/**
 * GET /api/v1/invoice-office/:bubbleId
 * Get fast core data required to render invoice office
 */
router.get('/api/v1/invoice-office/:bubbleId', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId } = req.params;
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        client = await pool.connect();

        const invoice = await fetchOfficeInvoice(client, bubbleId);

        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        // Security check: Match User ID, Creator ID, OR Linked Agent
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const invoiceBubbleId = invoice.bubble_id;
        const itemIds = Array.isArray(invoice.linked_invoice_item) ? invoice.linked_invoice_item : [];
        const paymentIds = Array.isArray(invoice.linked_payment) ? invoice.linked_payment : [];
        const [items, paidAmount, hybridUpgradeApplications] = await Promise.all([
            fetchOfficeItems(client, invoiceBubbleId, itemIds),
            fetchOfficePaidAmount(client, invoiceBubbleId, paymentIds),
            fetchHybridUpgradeApplications(client, itemIds)
        ]);

        invoice.paid_amount = paidAmount;
        const annotatedItems = items.map((item) => {
            const hybridUpgradeApplication = hybridUpgradeApplications.get(item.bubble_id);
            if (!hybridUpgradeApplication) return item;

            return {
                ...item,
                hybrid_upgrade_application: hybridUpgradeApplication
            };
        });

        const deletedUploads = await listRecycleBinEntries(client, {
            module: 'invoice-office',
            linkedRecordType: 'invoice',
            linkedRecordId: invoiceBubbleId
        });

        res.json({
            success: true,
            data: {
                invoice,
                items: annotatedItems,
                deleted_uploads: deletedUploads
            }
        });
    } catch (err) {
        console.error('Error fetching invoice office data:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoice-office/:bubbleId/extras
 * Get non-critical invoice office sections after the main page is already visible
 */
router.get('/api/v1/invoice-office/:bubbleId/extras', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId } = req.params;
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        client = await pool.connect();

        const invoice = await fetchOfficeInvoice(client, bubbleId);

        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const extras = await fetchOfficeExtras(client, invoice);

        res.json({
            success: true,
            data: extras
        });
    } catch (err) {
        console.error('Error fetching invoice office extras:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoice-office/:bubbleId/upload/:field
 * Shared Invoice Office upload endpoint powered by src/core/upload.
 */
router.post('/api/v1/invoice-office/:bubbleId/upload/:field', requireAuth, handleInvoiceOfficeUpload);

/**
 * DELETE /api/v1/invoice-office/:bubbleId/site-assessment-image
 */
router.delete('/api/v1/invoice-office/:bubbleId/site-assessment-image', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { url } = req.body;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);

        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });
        const result = await softDeleteInvoiceOfficeFile(client, {
            bubbleId,
            fieldKey: 'site_assessment_images',
            url,
            userId,
            auditContext
        });
        if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

        res.json({ success: true });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/v1/invoice-office/:bubbleId/pv-system-drawing
 */
router.delete('/api/v1/invoice-office/:bubbleId/pv-system-drawing', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { url } = req.body;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);

        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });
        const result = await softDeleteInvoiceOfficeFile(client, {
            bubbleId,
            fieldKey: 'pv_drawings',
            url,
            userId,
            auditContext
        });
        if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

        res.json({ success: true });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/v1/invoice-office/:bubbleId/roof-image
 */
router.delete('/api/v1/invoice-office/:bubbleId/roof-image', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { url } = req.body;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);

        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });
        const result = await softDeleteInvoiceOfficeFile(client, {
            bubbleId,
            fieldKey: 'roof_images',
            url,
            userId,
            auditContext
        });
        if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

        res.json({ success: true });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

router.post('/api/v1/invoice-office/:bubbleId/restore/:field', requireAuth, async (req, res) => {
    const { bubbleId, field } = req.params;
    const { recycleBinId } = req.body || {};
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!recycleBinId) {
        return res.status(400).json({ success: false, error: 'recycleBinId required' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        const result = await restoreInvoiceOfficeFile(client, {
            bubbleId,
            fieldKey: field,
            recycleBinId,
            userId,
            auditContext
        });
        if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

        return res.json({ success: true, url: result.url });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * PUT /api/v1/invoice-office/:bubbleId/follow-up
 */
router.put('/api/v1/invoice-office/:bubbleId/follow-up', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { followUpDays } = req.body;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);

        const invCheck = await client.query('SELECT created_by, linked_agent FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });

        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by, invCheck.rows[0].linked_agent);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        let followUpDate = null;
        if (followUpDays && parseInt(followUpDays) > 0) {
            const date = new Date();
            date.setDate(date.getDate() + parseInt(followUpDays));
            followUpDate = date.toISOString();
        }

        await beginAgentAuditTransaction(client, auditContext);
        await client.query(
            'UPDATE invoice SET follow_up_date = $1, updated_at = NOW() WHERE bubble_id = $2',
            [followUpDate, bubbleId]
        );
        await client.query('COMMIT');

        res.json({ success: true, followUpDate });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoice-office/:bubbleId/items/:itemId/hybrid-upgrade-options
 * Detect available hybrid upgrade options for a package invoice item.
 */
router.get('/api/v1/invoice-office/:bubbleId/items/:itemId/hybrid-upgrade-options', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId, itemId } = req.params;
        const userId = getAuthenticatedUserId(req);
        client = await pool.connect();

        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Access denied' });

        // Load the invoice item
        const itemRes = await client.query(
            `SELECT bubble_id, linked_package, is_a_package, unit_price, amount, description
             FROM invoice_item
             WHERE bubble_id = $1 AND linked_invoice = $2 LIMIT 1`,
            [itemId, bubbleId]
        );
        if (itemRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice item not found' });

        const item = itemRes.rows[0];
        if (!item.is_a_package || !item.linked_package) {
            return res.json({ success: true, data: { already_upgraded: false, upgrade_options: [] } });
        }

        // Check if already upgraded
        const auditTableExists = await invoiceRepo.hasTable(client, 'hybrid_inverter_upgrade_application');
        if (auditTableExists) {
            const auditRes = await client.query(
                `SELECT * FROM hybrid_inverter_upgrade_application WHERE invoice_item_bubble_id = $1 LIMIT 1`,
                [itemId]
            );
            if (auditRes.rows.length > 0) {
                const app = auditRes.rows[0];
                return res.json({
                    success: true,
                    data: {
                        already_upgraded: true,
                        application: {
                            original_package_bubble_id: app.original_package_bubble_id,
                            new_package_bubble_id: app.new_package_bubble_id,
                            upgrade_rule_bubble_id: app.upgrade_rule_bubble_id,
                            upgrade_price_amount: parseFloat(app.upgrade_price_amount),
                            applied_at: app.applied_at
                        },
                        upgrade_options: []
                    }
                });
            }
        }

        // Fetch package details for price/name
        const pkgRes = await client.query(
            `SELECT bubble_id, package_name, price FROM package WHERE bubble_id = $1 LIMIT 1`,
            [item.linked_package]
        );
        const pkg = pkgRes.rows[0] || {};

        // Get upgrade options for the linked package
        const options = await invoiceRepo.getHybridUpgradeOptionsForPackage(client, item.linked_package);
        const originalPrice = parseFloat(pkg.price) || 0;

        const upgrade_options = (options.rules || []).map(rule => ({
            rule_bubble_id: rule.bubble_id,
            phase_scope: rule.phase_scope,
            from_model_code: rule.from_model_code,
            from_product_name_snapshot: rule.from_product_name_snapshot,
            to_model_code: rule.to_model_code,
            to_product_name_snapshot: rule.to_product_name_snapshot,
            price_amount: parseFloat(rule.price_amount) || 0,
            new_total_price: originalPrice + (parseFloat(rule.price_amount) || 0),
            stock_ready: rule.stock_ready
        }));

        res.json({
            success: true,
            data: {
                already_upgraded: false,
                already_hybrid: options.packageAlreadyHybrid || false,
                original_package: {
                    bubble_id: item.linked_package,
                    package_name: pkg.package_name || null,
                    price: originalPrice,
                    current_inverter: options.currentInverter || null
                },
                upgrade_options
            }
        });
    } catch (err) {
        console.error('[hybrid-upgrade-options]', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoice-office/:bubbleId/items/:itemId/hybrid-upgrade
 * Apply a hybrid inverter upgrade to a package invoice item.
 */
router.post('/api/v1/invoice-office/:bubbleId/items/:itemId/hybrid-upgrade', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId, itemId } = req.params;
        const { upgrade_rule_bubble_id } = req.body;
        const userId = getAuthenticatedUserId(req);

        if (!upgrade_rule_bubble_id) {
            return res.status(400).json({ success: false, error: 'upgrade_rule_bubble_id is required' });
        }

        client = await pool.connect();

        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Access denied' });

        const invoiceRes = await client.query(
            `SELECT total_amount, paid_amount, linked_payment, linked_invoice_item
             FROM invoice
             WHERE bubble_id = $1
             LIMIT 1`,
            [bubbleId]
        );
        const invoiceRow = invoiceRes.rows[0] || null;
        const linkedPaymentIds = Array.isArray(invoiceRow?.linked_payment) ? invoiceRow.linked_payment : [];
        const paymentStateRes = await client.query(
            `SELECT
                EXISTS(
                    SELECT 1
                    FROM payment p
                    WHERE p.linked_invoice = $1
                       OR p.bubble_id = ANY($2::text[])
                ) AS has_verified_payment,
                EXISTS(
                    SELECT 1
                    FROM submitted_payment sp
                    WHERE sp.linked_invoice = $1
                ) AS has_submitted_payment`,
            [bubbleId, linkedPaymentIds]
        );
        const paymentState = paymentStateRes.rows[0] || {};
        const hasLegacyPaidAmount = (parseFloat(invoiceRow?.paid_amount) || 0) > 0;
        const hasAnyPayment = Boolean(
            paymentState.has_verified_payment
            || paymentState.has_submitted_payment
            || hasLegacyPaidAmount
        );
        if (hasAnyPayment) {
            return res.status(400).json({
                success: false,
                error: 'Package cannot be upgraded because this invoice already has payment records.'
            });
        }

        // Load the invoice item
        const itemRes = await client.query(
            `SELECT bubble_id, linked_package, is_a_package
             FROM invoice_item
             WHERE bubble_id = $1 AND linked_invoice = $2 LIMIT 1`,
            [itemId, bubbleId]
        );
        if (itemRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice item not found' });

        const item = itemRes.rows[0];
        if (!item.is_a_package || !item.linked_package) {
            return res.status(400).json({ success: false, error: 'Invoice item is not a package item' });
        }

        // Guard: already upgraded?
        const auditTableExists = await invoiceRepo.hasTable(client, 'hybrid_inverter_upgrade_application');
        if (auditTableExists) {
            const auditRes = await client.query(
                `SELECT id FROM hybrid_inverter_upgrade_application WHERE invoice_item_bubble_id = $1 LIMIT 1`,
                [itemId]
            );
            if (auditRes.rows.length > 0) {
                return res.status(409).json({ success: false, error: 'This invoice item has already been upgraded to hybrid.' });
            }
        }

        await client.query('BEGIN');

        // Clone the package with the hybrid upgrade
        const cloned = await invoiceRepo.clonePackageWithHybridUpgrade(
            client,
            item.linked_package,
            upgrade_rule_bubble_id,
            userId,
            bubbleId
        );

        const newPackageId = cloned.package.bubble_id;
        const selectedRule = cloned.selectedRule;
        const upgradeAmount = parseFloat(selectedRule.price_amount) || 0;

        const sortRes = await client.query(
            `SELECT COALESCE(MAX(sort), 0) AS max_sort
             FROM invoice_item
             WHERE linked_invoice = $1`,
            [bubbleId]
        );
        const nextSort = (parseInt(sortRes.rows[0]?.max_sort, 10) || 0) + 1;

        // Update invoice_item.linked_package → new package
        await client.query(
            `UPDATE invoice_item SET linked_package = $1, updated_at = NOW() WHERE bubble_id = $2`,
            [newPackageId, itemId]
        );

        // Update invoice.linked_package → new package (keeps invoice header in sync)
        await client.query(
            `UPDATE invoice SET linked_package = $1, updated_at = NOW() WHERE bubble_id = $2`,
            [newPackageId, bubbleId]
        );

        const upgradeItemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
        const upgradeDescription = `Hybrid inverter upgrade top-up${selectedRule.to_product_name_snapshot ? ` (${selectedRule.to_product_name_snapshot})` : ''}`;
        await client.query(
            `INSERT INTO invoice_item
             (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package, linked_package)
             VALUES ($1, $2, $3, 1, $4, $5, 'hybrid_upgrade', $6, NOW(), NOW(), FALSE, NULL)`,
            [
                upgradeItemBubbleId,
                bubbleId,
                upgradeDescription,
                upgradeAmount,
                upgradeAmount,
                nextSort
            ]
        );

        await client.query(
            `UPDATE invoice
             SET total_amount = COALESCE(total_amount, 0) + $1,
                 balance_due = (COALESCE(total_amount, 0) + $1) - COALESCE(paid_amount, 0),
                 linked_invoice_item = array_append(COALESCE(linked_invoice_item, ARRAY[]::text[]), $2),
                 updated_at = NOW()
             WHERE bubble_id = $3`,
            [upgradeAmount, upgradeItemBubbleId, bubbleId]
        );

        // Attach custom package to invoice
        await invoiceRepo.attachCustomPackageToInvoice(client, newPackageId, bubbleId);

        // Insert audit row
        if (auditTableExists) {
            const auditBubbleId = `hiua_${crypto.randomBytes(10).toString('hex')}`;
            await client.query(
                `INSERT INTO hybrid_inverter_upgrade_application
                 (bubble_id, invoice_item_bubble_id, invoice_bubble_id, original_package_bubble_id,
                  new_package_bubble_id, upgrade_rule_bubble_id, upgrade_price_amount, applied_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    auditBubbleId,
                    itemId,
                    bubbleId,
                    item.linked_package,
                    newPackageId,
                    upgrade_rule_bubble_id,
                    selectedRule.price_amount,
                    String(userId)
                ]
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            data: {
                new_package_bubble_id: newPackageId,
                upgrade_item_bubble_id: upgradeItemBubbleId,
                upgrade_price_amount: upgradeAmount
            }
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('[hybrid-upgrade-apply]', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
