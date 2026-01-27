const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const invoiceRepo = require('../services/invoiceRepo');
const sedaService = require('../services/sedaService');

const router = express.Router();

/**
 * GET /api/v1/invoice-office/:bubbleId
 * Get comprehensive data for invoice office view
 */
router.get('/api/v1/invoice-office/:bubbleId', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId } = req.params;
        const userId = req.user.userId;

        client = await pool.connect();
        
        // 1. Fetch Invoice with Live Joins
        const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);

        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        // Security check: Match User ID, Creator ID, OR Linked Agent
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // 2. Fetch Payments (Combine submitted_payment AND legacy/synced payment)
        const [submittedRes, legacyRes] = await Promise.all([
            client.query(
                'SELECT * FROM submitted_payment WHERE linked_invoice = $1 ORDER BY created_at DESC',
                [bubbleId]
            ),
            client.query(
                'SELECT * FROM payment WHERE linked_invoice = $1 ORDER BY created_at DESC',
                [bubbleId]
            )
        ]);

        // Map legacy payments to match structure and set status='verified'
        const legacyPayments = legacyRes.rows.map(p => ({
            ...p,
            status: 'verified', // Synced payments are considered verified
            attachment: p.attachment || [] // Ensure array
        }));

        const allPayments = [...submittedRes.rows, ...legacyPayments];

        // Calculate total paid amount (verified only)
        const paidAmount = allPayments
            .filter(p => p.status === 'verified')
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        
        // Attach to invoice object for frontend
        invoice.paid_amount = paidAmount;

        // 3. Fetch Items (Enhanced Retrieval)
        const itemIds = Array.isArray(invoice.linked_invoice_item) ? invoice.linked_invoice_item : [];
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
                COALESCE(pkg.package_name, INITCAP(REPLACE(ii.inv_item_type, '_', ' ')), 'Item') as product_name_snapshot
             FROM invoice_item ii
             LEFT JOIN package pkg ON ii.linked_package = pkg.bubble_id
             WHERE ii.linked_invoice = $1 
                OR ii.bubble_id = ANY($2::text[])
             ORDER BY ii.sort ASC, ii.created_at ASC`,
            [bubbleId, itemIds]
        );

        // 4. Fetch SEDA Registration
        let seda = null;
        if (invoice.linked_seda_registration) {
            const sedaRes = await client.query(
                'SELECT * FROM seda_registration WHERE bubble_id = $1',
                [invoice.linked_seda_registration]
            );
            seda = sedaRes.rows[0];
        }

        // FALLBACK: If not found via direct link, check if any SEDA record points to this invoice
        if (!seda) {
            const fallbackSedaRes = await client.query(
                'SELECT * FROM seda_registration WHERE $1 = ANY(linked_invoice) LIMIT 1',
                [bubbleId]
            );
            seda = fallbackSedaRes.rows[0];
            
            if (seda) {
                invoice.linked_seda_registration = seda.bubble_id;
            }
        }

        // AUTO-FIX: If still no SEDA record but we have a customer, create it now
        if (!seda && invoice.linked_customer) {
            try {
                console.log(`[InvoiceOffice] Auto-creating SEDA for invoice ${bubbleId} customer ${invoice.linked_customer}`);
                seda = await sedaService.ensureSedaRegistration(
                    client,
                    bubbleId,
                    invoice.linked_customer,
                    String(userId)
                );
                if (seda) {
                    invoice.linked_seda_registration = seda.bubble_id;
                }
            } catch (autoCreateErr) {
                console.error('[InvoiceOffice] Failed to auto-create SEDA:', autoCreateErr);
            }
        }

        res.json({
            success: true,
            data: {
                invoice,
                payments: allPayments,
                items: itemsRes.rows,
                seda
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
 * POST /api/v1/invoice-office/:bubbleId/roof-images
 */
router.post('/api/v1/invoice-office/:bubbleId/roof-images', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { images } = req.body; 
    const userId = req.user.userId;

    if (!images || !Array.isArray(images)) {
        return res.status(400).json({ success: false, error: 'No images provided' });
    }

    let client = null;
    try {
        client = await pool.connect();
        
        const invCheck = await client.query('SELECT created_by, linked_roof_image FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../../storage');
        const uploadDir = path.join(storageRoot, 'roof_images');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const uploadedUrls = [];
        const MAX_SIZE = 1.5 * 1024 * 1024; // 1.5MB

        for (const img of images) {
            const matches = img.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) continue;

            const buffer = Buffer.from(matches[2], 'base64');
            if (buffer.length > MAX_SIZE) continue;

            const fileExt = img.name ? path.extname(img.name) : '.jpg';
            const filename = `roof_${bubbleId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, buffer);

            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            const url = `${protocol}://${host}/uploads/roof_images/${filename}`;
            uploadedUrls.push(url);
        }

        if (uploadedUrls.length > 0) {
            await client.query(
                'UPDATE invoice SET linked_roof_image = array_cat(COALESCE(linked_roof_image, ARRAY[]::text[]), $1), updated_at = NOW() WHERE bubble_id = $2',
                [uploadedUrls, bubbleId]
            );
        }

        res.json({ success: true, uploadedCount: uploadedUrls.length, urls: uploadedUrls });
    } catch (err) {
        console.error('Roof image upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoice-office/:bubbleId/pv-system-drawings
 */
router.post('/api/v1/invoice-office/:bubbleId/pv-system-drawings', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { drawings } = req.body; 
    const userId = req.user.userId;

    if (!drawings || !Array.isArray(drawings)) {
        return res.status(400).json({ success: false, error: 'No drawings provided' });
    }

    let client = null;
    try {
        client = await pool.connect();
        
        const invCheck = await client.query('SELECT created_by FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../../storage');
        const uploadDir = path.join(storageRoot, 'pv_drawings');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const uploadedUrls = [];
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB

        for (const draw of drawings) {
            const matches = draw.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) continue;

            const buffer = Buffer.from(matches[2], 'base64');
            if (buffer.length > MAX_SIZE) continue;

            const fileExt = draw.name ? path.extname(draw.name) : '.jpg';
            const filename = `pv_${bubbleId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, buffer);

            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            const url = `${protocol}://${host}/uploads/pv_drawings/${filename}`;
            uploadedUrls.push(url);
        }

        if (uploadedUrls.length > 0) {
            await client.query(
                'UPDATE invoice SET pv_system_drawing = array_cat(COALESCE(pv_system_drawing, ARRAY[]::text[]), $1), updated_at = NOW() WHERE bubble_id = $2',
                [uploadedUrls, bubbleId]
            );
        }

        res.json({ success: true, uploadedCount: uploadedUrls.length, urls: uploadedUrls });
    } catch (err) {
        console.error('PV drawing upload error:', err);
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
    const userId = req.user.userId;

    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    let client = null;
    try {
        client = await pool.connect();
        
        const invCheck = await client.query('SELECT created_by FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        await client.query(
            'UPDATE invoice SET pv_system_drawing = array_remove(pv_system_drawing, $1), updated_at = NOW() WHERE bubble_id = $2',
            [url, bubbleId]
        );

        res.json({ success: true });
    } catch (err) {
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
    const userId = req.user.userId;

    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    let client = null;
    try {
        client = await pool.connect();
        
        const invCheck = await client.query('SELECT created_by FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        await client.query(
            'UPDATE invoice SET linked_roof_image = array_remove(linked_roof_image, $1), updated_at = NOW() WHERE bubble_id = $2',
            [url, bubbleId]
        );

        res.json({ success: true });
    } catch (err) {
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
    const userId = req.user.userId;

    let client = null;
    try {
        client = await pool.connect();
        
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

        await client.query(
            'UPDATE invoice SET follow_up_date = $1, updated_at = NOW() WHERE bubble_id = $2',
            [followUpDate, bubbleId]
        );

        res.json({ success: true, followUpDate });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
