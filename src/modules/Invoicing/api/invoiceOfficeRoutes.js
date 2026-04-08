const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const { getAuthenticatedUserId } = require('./authUser');
const invoiceRepo = require('../services/invoiceRepo');
const { beginAgentAuditTransaction, resolveAgentAuditContext } = require('../services/agentAuditContext');

const router = express.Router();
const MAX_BATCH_FILES = 12;
const ROOF_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PV_DRAWING_MAX_BYTES = 10 * 1024 * 1024;
const FILE_EXTENSIONS = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/gif': '.gif',
    'image/bmp': '.bmp'
};

function getStorageRoot() {
    return process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../../storage');
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getAbsoluteUploadUrl(req, subDir, filename) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/uploads/${subDir}/${filename}`;
}

function getFileExtension(file) {
    const originalExt = path.extname(file.originalname || '');
    if (originalExt) return originalExt.toLowerCase();
    return FILE_EXTENSIONS[(file.mimetype || '').toLowerCase()] || '.bin';
}

function extensionLooksLikeImage(filename) {
    return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(filename || '');
}

function extensionLooksLikePdf(filename) {
    return /\.pdf$/i.test(filename || '');
}

function isAllowedFile(file, { allowPdf = false } = {}) {
    const mime = (file.mimetype || '').toLowerCase();
    const name = file.originalname || '';

    if (mime.startsWith('image/')) return true;
    if (allowPdf && mime === 'application/pdf') return true;
    if (!mime && extensionLooksLikeImage(name)) return true;
    if (allowPdf && (!mime || mime === 'application/octet-stream') && extensionLooksLikePdf(name)) return true;
    return false;
}

function createOfficeUpload({ subDir, prefix, maxBytes, allowPdf = false, fieldName }) {
    const storage = multer.diskStorage({
        destination(req, file, cb) {
            const uploadDir = path.join(getStorageRoot(), subDir);
            ensureDir(uploadDir);
            cb(null, uploadDir);
        },
        filename(req, file, cb) {
            const filename = `${prefix}_${req.params.bubbleId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${getFileExtension(file)}`;
            cb(null, filename);
        }
    });

    return multer({
        storage,
        limits: { fileSize: maxBytes, files: MAX_BATCH_FILES },
        fileFilter(req, file, cb) {
            if (!isAllowedFile(file, { allowPdf })) {
                return cb(new Error(allowPdf ? 'Unsupported file type. Upload image or PDF files only.' : 'Unsupported file type. Upload image files only.'));
            }
            cb(null, true);
        }
    }).array(fieldName, MAX_BATCH_FILES);
}

const uploadRoofImages = createOfficeUpload({
    subDir: 'roof_images',
    prefix: 'roof',
    maxBytes: ROOF_IMAGE_MAX_BYTES,
    fieldName: 'roofImages'
});

const uploadPvDrawings = createOfficeUpload({
    subDir: 'pv_drawings',
    prefix: 'pv',
    maxBytes: PV_DRAWING_MAX_BYTES,
    allowPdf: true,
    fieldName: 'pvDrawings'
});

function runUpload(middleware, req, res) {
    return new Promise((resolve, reject) => {
        middleware(req, res, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

function cleanupFiles(files) {
    files.forEach((file) => {
        try {
            if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (cleanupErr) {
            console.error('[InvoiceOffice] Failed to clean up uploaded file:', cleanupErr);
        }
    });
}

function formatUploadError(err, maxBytes) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return `File exceeds ${formatBytes(maxBytes)} limit.`;
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return `Too many files selected. Max ${MAX_BATCH_FILES} files per upload.`;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return 'Unexpected upload field received.';
        }
        return err.message || 'Upload failed.';
    }
    return err?.message || 'Upload failed.';
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
         LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id
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
            ii.linked_package as product_id,
            COALESCE(pkg.package_name, INITCAP(REPLACE(ii.inv_item_type, '_', ' ')), 'Item') as product_name
         FROM invoice_item ii
         LEFT JOIN package pkg ON ii.linked_package = pkg.bubble_id
         WHERE ii.linked_invoice = $1 
            OR ii.bubble_id = ANY($2::text[])
         ORDER BY ii.sort ASC, ii.created_at ASC`,
        [invoiceBubbleId, itemIds]
    );

    return itemsRes.rows;
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

    return {
        payments,
        seda,
        invoice: {
            linked_seda_registration: seda?.bubble_id || invoice.linked_seda_registration || null
        }
    };
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
        const [items, paidAmount] = await Promise.all([
            fetchOfficeItems(client, invoiceBubbleId, itemIds),
            fetchOfficePaidAmount(client, invoiceBubbleId, paymentIds)
        ]);

        invoice.paid_amount = paidAmount;

        res.json({
            success: true,
            data: {
                invoice,
                items
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
 * POST /api/v1/invoice-office/:bubbleId/roof-images
 */
router.post('/api/v1/invoice-office/:bubbleId/roof-images', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);

        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        await runUpload(uploadRoofImages, req, res);

        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length === 0) {
            return res.status(400).json({ success: false, error: 'No roof images received.' });
        }

        const uploadedUrls = files.map((file) => getAbsoluteUploadUrl(req, 'roof_images', file.filename));

        await beginAgentAuditTransaction(client, auditContext);
        await client.query(
            'UPDATE invoice SET linked_roof_image = array_cat(COALESCE(linked_roof_image, ARRAY[]::text[]), $1), updated_at = NOW() WHERE bubble_id = $2',
            [uploadedUrls, bubbleId]
        );
        await client.query('COMMIT');

        res.json({
            success: true,
            uploadedCount: uploadedUrls.length,
            urls: uploadedUrls,
            message: `${uploadedUrls.length} roof image(s) uploaded successfully.`
        });
    } catch (err) {
        console.error('Roof image upload error:', err);
        if (client) await client.query('ROLLBACK').catch(() => {});
        cleanupFiles(Array.isArray(req.files) ? req.files : []);
        const status = err instanceof multer.MulterError || err?.message?.startsWith('Unsupported file type') ? 400 : 500;
        res.status(status).json({ success: false, error: formatUploadError(err, ROOF_IMAGE_MAX_BYTES) });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoice-office/:bubbleId/pv-system-drawings
 */
router.post('/api/v1/invoice-office/:bubbleId/pv-system-drawings', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);

        const access = await getInvoiceAccess(client, bubbleId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!access.isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        await runUpload(uploadPvDrawings, req, res);

        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length === 0) {
            return res.status(400).json({ success: false, error: 'No PV system drawings received.' });
        }

        const uploadedUrls = files.map((file) => getAbsoluteUploadUrl(req, 'pv_drawings', file.filename));

        await beginAgentAuditTransaction(client, auditContext);
        await client.query(
            'UPDATE invoice SET pv_system_drawing = array_cat(COALESCE(pv_system_drawing, ARRAY[]::text[]), $1), updated_at = NOW() WHERE bubble_id = $2',
            [uploadedUrls, bubbleId]
        );
        await client.query('COMMIT');

        res.json({
            success: true,
            uploadedCount: uploadedUrls.length,
            urls: uploadedUrls,
            message: `${uploadedUrls.length} PV system drawing(s) uploaded successfully.`
        });
    } catch (err) {
        console.error('PV drawing upload error:', err);
        if (client) await client.query('ROLLBACK').catch(() => {});
        cleanupFiles(Array.isArray(req.files) ? req.files : []);
        const status = err instanceof multer.MulterError || err?.message?.startsWith('Unsupported file type') ? 400 : 500;
        res.status(status).json({ success: false, error: formatUploadError(err, PV_DRAWING_MAX_BYTES) });
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

        await beginAgentAuditTransaction(client, auditContext);
        await client.query(
            'UPDATE invoice SET pv_system_drawing = array_remove(pv_system_drawing, $1), updated_at = NOW() WHERE bubble_id = $2',
            [url, bubbleId]
        );
        await client.query('COMMIT');

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

        await beginAgentAuditTransaction(client, auditContext);
        await client.query(
            'UPDATE invoice SET linked_roof_image = array_remove(linked_roof_image, $1), updated_at = NOW() WHERE bubble_id = $2',
            [url, bubbleId]
        );
        await client.query('COMMIT');

        res.json({ success: true });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
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

module.exports = router;
