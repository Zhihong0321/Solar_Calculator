const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const { getAuthenticatedUserId } = require('./authUser');
const invoiceRepo = require('../services/invoiceRepo');
const invoiceService = require('../services/invoiceService');
const invoiceHistoryRepo = require('../services/invoiceHistoryRepo');
const { writeActivity } = require('../../../core/activityLog/writeActivity');
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
    console.warn('[InvoiceRoutes] agentAuditContext unavailable, using basic audit fallback.');
}

const router = express.Router();

function safeJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (err) {
        return null;
    }
}

function getChangeAfter(changes, field) {
    if (!Array.isArray(changes)) return null;
    const match = changes.find((change) => String(change?.field || '').toLowerCase() === field);
    return match ? match.after : null;
}

function normalizeViewerActivityRow(row) {
    const changes = safeJson(row.changes) || [];
    const eventType = String(row.action_type || getChangeAfter(changes, 'event_type') || '').toLowerCase();
    const pageType = String(getChangeAfter(changes, 'page_type') || '').toLowerCase();
    const duration = Number(getChangeAfter(changes, 'duration_seconds'));
    const deviceHash = String(row.entity_id || getChangeAfter(changes, 'device_hash') || '').trim();
    const actorName = String(row.actor_name || '').trim();
    const actorPhone = String(row.actor_phone || '').trim();
    const actorRole = String(row.actor_role || '').trim();
    const hasLoggedInViewer = Boolean(row.actor_user_id || actorName || actorPhone);

    return {
        id: row.id,
        event_type: eventType,
        page_type: pageType,
        device_hash: deviceHash,
        visitor_label: actorName || (row.actor_user_id ? `user ${row.actor_user_id}` : `device ${deviceHash.slice(0, 8)}`),
        viewer_type: hasLoggedInViewer ? 'logged_in' : (getChangeAfter(changes, 'viewer_type') || 'anonymous'),
        actor_user_id: row.actor_user_id || null,
        actor_name: actorName || null,
        actor_phone: actorPhone || null,
        actor_role: actorRole || null,
        button_name: getChangeAfter(changes, 'button_name'),
        duration_seconds: Number.isFinite(duration) ? duration : null,
        viewed_at: row.edited_at,
        created_at: row.edited_at
    };
}

function summarizeViewerActivity(events) {
    const uniqueVisitors = new Set(events.map((event) => event.device_hash).filter(Boolean));
    const invoiceVisitors = new Set(events
        .filter((event) => event.event_type === 'invoice_viewed')
        .map((event) => event.device_hash)
        .filter(Boolean));
    const proposalVisitors = new Set(events
        .filter((event) => event.event_type === 'proposal_viewed')
        .map((event) => event.device_hash)
        .filter(Boolean));
    const durations = events
        .filter((event) => event.duration_seconds !== null)
        .map((event) => event.duration_seconds);
    const averageDuration = durations.length > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : 0;

    return {
        total_events: events.length,
        invoice_views: events.filter((event) => event.event_type === 'invoice_viewed').length,
        proposal_views: events.filter((event) => event.event_type === 'proposal_viewed').length,
        button_clicks: events.filter((event) => event.event_type.endsWith('_button_clicked')).length,
        unique_visitors: uniqueVisitors.size,
        unique_invoice_visitors: invoiceVisitors.size,
        unique_proposal_visitors: proposalVisitors.size,
        average_duration_seconds: averageDuration,
        last_activity_at: events[0]?.created_at || null
    };
}

/**
 * PAGE ROUTES
 */

router.get('/create-invoice', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/create_invoice.html'));
});

router.get('/create-ev-charger-invoice', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/create_ev_charger_invoice.html'));
});

router.get('/edit-invoice', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/edit_invoice.html'));
});

router.get('/invoice-vouchers', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/invoice_vouchers.html'));
});

router.get('/invoice-office', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/invoice_office.html'));
});

router.get('/invoice-office-upload-test', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/invoice_office_upload_test.html'));
});

router.get('/my-invoice', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/my_invoice.html'));
});

/**
 * API ROUTES
 */

/**
 * GET /api/v1/invoices/my-invoices
 * Get invoices for the current user
 */
router.get('/api/v1/invoices/my-invoices', requireAuth, async (req, res) => {
    let client = null;
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const { startDate, endDate, paymentStatus, search } = req.query;

        client = await pool.connect();
        
        const result = await invoiceRepo.getInvoicesByUserId(client, userId, {
            limit,
            offset,
            startDate,
            endDate,
            paymentStatus,
            search
        });
        
        // Build URLs (Legacy support)
        const protocol = req.protocol;
        const host = req.get('host');
        const invoices = result.invoices.map(inv => {
            const publicIdentifier = inv.share_token || inv.bubble_id || null;
            return {
                ...inv,
                share_url: publicIdentifier ? `${protocol}://${host}/view/${publicIdentifier}` : null
            };
        });

        res.json({
            success: true,
            data: {
                invoices,
                total: result.total,
                limit: result.limit,
                offset: result.offset
            }
        });
    } catch (err) {
        console.error('Error fetching my invoices:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch invoices' });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoices/scanner/search
 * Search invoices specifically for barcode scanning workflow
 */
router.get('/api/v1/invoices/scanner/search', requireAuth, async (req, res) => {
    let client = null;
    try {
        const query = String(req.query.q || '').trim();
        if (!query) {
            return res.json({ success: true, data: [] });
        }
        client = await pool.connect();
        const pattern = `%${query.toLowerCase()}%`;
        const result = await client.query(`
            SELECT 
                i.bubble_id,
                i.invoice_number,
                COALESCE(c.name, i.customer_name_snapshot, 'Unknown Customer') AS customer_name,
                COALESCE(c.phone, i.customer_phone_snapshot, '') AS customer_phone,
                COALESCE(pkg.package_name, i.package_name_snapshot, 'Custom Package') AS package_name,
                i.linked_package,
                i.invoice_date,
                i.status
            FROM invoice i
            LEFT JOIN customer c ON i.linked_customer = c.customer_id
            LEFT JOIN package pkg ON (i.linked_package = pkg.bubble_id OR i.linked_package = pkg.id::text)
            WHERE (i.status != 'deleted' OR i.status IS NULL)
              AND (
                LOWER(COALESCE(i.invoice_number, '')) LIKE $1
                OR LOWER(COALESCE(c.name, '')) LIKE $1
                OR LOWER(COALESCE(i.customer_name_snapshot, '')) LIKE $1
                OR LOWER(COALESCE(c.phone, '')) LIKE $1
                OR LOWER(COALESCE(i.customer_phone_snapshot, '')) LIKE $1
                OR LOWER(COALESCE(pkg.package_name, '')) LIKE $1
              )
            ORDER BY i.id DESC
            LIMIT 15;
        `, [pattern]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[ScannerSearch] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoices/:bubbleId
 * Get single invoice details
 */
router.get('/api/v1/invoices/:bubbleId', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    let client = null;
    try {
        client = await pool.connect();
        const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }
        res.json({ success: true, data: invoice });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoices/:bubbleId/scanner-context
 * Resolve scannable products (panels & inverters) and existing barcodes for an invoice
 */
router.get('/api/v1/invoices/:bubbleId/scanner-context', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    let client = null;
    try {
        client = await pool.connect();
        const invRes = await client.query(`
            SELECT 
                i.bubble_id,
                i.invoice_number,
                COALESCE(c.name, i.customer_name_snapshot, 'Unknown Customer') AS customer_name,
                COALESCE(c.phone, i.customer_phone_snapshot, '') AS customer_phone,
                COALESCE(pkg.package_name, i.package_name_snapshot, 'Custom Package') AS package_name,
                i.linked_package,
                i.invoice_date,
                i.status
            FROM invoice i
            LEFT JOIN customer c ON i.linked_customer = c.customer_id
            LEFT JOIN package pkg ON (i.linked_package = pkg.bubble_id OR i.linked_package = pkg.id::text)
            WHERE i.bubble_id = $1 OR i.id::text = $1
            LIMIT 1;
        `, [bubbleId]);

        if (invRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const invoice = invRes.rows[0];
        const scannableProducts = [];

        if (invoice.linked_package) {
            const pkgRes = await client.query(`
                SELECT 
                    pkg.bubble_id,
                    pkg.package_name,
                    pkg.panel,
                    pkg.panel_qty,
                    pkg.inverter_1,
                    pkg.inverter_2,
                    pkg.inverter_3,
                    pkg.inverter_4,
                    p_panel.name AS panel_name,
                    p_panel.description AS panel_desc,
                    p_inv1.name AS inv1_name,
                    p_inv1.description AS inv1_desc,
                    p_inv2.name AS inv2_name,
                    p_inv2.description AS inv2_desc,
                    p_inv3.name AS inv3_name,
                    p_inv3.description AS inv3_desc,
                    p_inv4.name AS inv4_name,
                    p_inv4.description AS inv4_desc
                FROM package pkg
                LEFT JOIN product p_panel ON pkg.panel = p_panel.bubble_id
                LEFT JOIN product p_inv1 ON pkg.inverter_1 = p_inv1.bubble_id
                LEFT JOIN product p_inv2 ON pkg.inverter_2 = p_inv2.bubble_id
                LEFT JOIN product p_inv3 ON pkg.inverter_3 = p_inv3.bubble_id
                LEFT JOIN product p_inv4 ON pkg.inverter_4 = p_inv4.bubble_id
                WHERE pkg.bubble_id = $1 OR pkg.id::text = $1
                LIMIT 1;
            `, [invoice.linked_package]);

            if (pkgRes.rows.length > 0) {
                const pkg = pkgRes.rows[0];
                if (pkg.panel) {
                    scannableProducts.push({
                        productId: pkg.panel,
                        name: pkg.panel_name || 'Solar Panel',
                        description: pkg.panel_desc || '',
                        type: 'panel',
                        targetQty: parseInt(pkg.panel_qty, 10) || 1
                    });
                }
                const inverters = [
                    { id: pkg.inverter_1, name: pkg.inv1_name, desc: pkg.inv1_desc },
                    { id: pkg.inverter_2, name: pkg.inv2_name, desc: pkg.inv2_desc },
                    { id: pkg.inverter_3, name: pkg.inv3_name, desc: pkg.inv3_desc },
                    { id: pkg.inverter_4, name: pkg.inv4_name, desc: pkg.inv4_desc }
                ];
                inverters.forEach((inv, index) => {
                    if (inv.id) {
                        scannableProducts.push({
                            productId: inv.id,
                            name: inv.name || `Inverter ${index + 1}`,
                            description: inv.desc || '',
                            type: 'inverter',
                            targetQty: 1
                        });
                    }
                });
            }
        }

        const barcodesRes = await client.query(`
            SELECT id, bubble_id, barcode, linked_product, created_at
            FROM barcode
            WHERE linked_invoice = $1
            ORDER BY id ASC;
        `, [invoice.bubble_id]);

        const barcodesByProduct = {};
        barcodesRes.rows.forEach((row) => {
            const pid = row.linked_product;
            if (!barcodesByProduct[pid]) barcodesByProduct[pid] = [];
            barcodesByProduct[pid].push(row);
        });

        const productsWithScans = scannableProducts.map(p => ({
            ...p,
            scannedCount: (barcodesByProduct[p.productId] || []).length,
            scannedBarcodes: barcodesByProduct[p.productId] || []
        }));

        res.json({
            success: true,
            data: {
                invoice,
                products: productsWithScans,
                allBarcodes: barcodesRes.rows
            }
        });
    } catch (err) {
        console.error('[ScannerContext] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoices/:bubbleId/barcodes
 * Batch save scanned barcodes for an invoice and linked product
 */
router.post('/api/v1/invoices/:bubbleId/barcodes', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { productId, barcodes } = req.body;

    if (!productId || !Array.isArray(barcodes) || barcodes.length === 0) {
        return res.status(400).json({ success: false, error: 'productId and barcodes array are required' });
    }

    const userId = getAuthenticatedUserId(req) || 'system';
    let client = null;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const invRes = await client.query(
            'SELECT bubble_id, invoice_number FROM invoice WHERE bubble_id = $1 OR id::text = $1 LIMIT 1',
            [bubbleId]
        );
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }
        const actualInvoiceId = invRes.rows[0].bubble_id;
        const invoiceNumber = invRes.rows[0].invoice_number;

        const insertedBarcodes = [];
        const barcodeBubbleIds = [];

        for (const code of barcodes) {
            const cleanCode = String(code).trim();
            if (!cleanCode) continue;

            const bubbleIdGen = `${Date.now()}x${Math.random().toString(16).slice(2, 10)}`;
            const insertRes = await client.query(`
                INSERT INTO barcode (
                    bubble_id, barcode, linked_product, linked_invoice,
                    created_by, created_date, modified_date, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW(), NOW())
                ON CONFLICT (linked_product, barcode) 
                DO UPDATE SET linked_invoice = EXCLUDED.linked_invoice, updated_at = NOW()
                RETURNING bubble_id, barcode, linked_product, linked_invoice;
            `, [bubbleIdGen, cleanCode, productId, actualInvoiceId, String(userId)]);

            if (insertRes.rows.length > 0) {
                insertedBarcodes.push(insertRes.rows[0]);
                barcodeBubbleIds.push(insertRes.rows[0].bubble_id);
            }
        }

        if (barcodeBubbleIds.length > 0) {
            await client.query(`
                UPDATE invoice
                SET linked_barcode = ARRAY(
                    SELECT DISTINCT unnest(COALESCE(linked_barcode, ARRAY[]::text[]) || $1::text[])
                )
                WHERE bubble_id = $2;
            `, [barcodeBubbleIds, actualInvoiceId]);
        }

        await client.query('COMMIT');

        writeActivity({
            req,
            action: 'update',
            entityType: 'invoice',
            entityId: actualInvoiceId,
            entityLabel: invoiceNumber,
            description: `linked ${insertedBarcodes.length} barcode(s) to product ${productId} on invoice ${invoiceNumber}`
        });

        res.json({
            success: true,
            data: {
                count: insertedBarcodes.length,
                barcodes: insertedBarcodes
            }
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('[SaveBarcodes] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/v1/invoices/:bubbleId/barcodes/:barcodeValue
 * Delete a barcode from an invoice
 */
router.delete('/api/v1/invoices/:bubbleId/barcodes/:barcodeValue', requireAuth, async (req, res) => {
    const { bubbleId, barcodeValue } = req.params;
    let client = null;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const invRes = await client.query(
            'SELECT bubble_id FROM invoice WHERE bubble_id = $1 OR id::text = $1 LIMIT 1',
            [bubbleId]
        );
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }
        const actualInvoiceId = invRes.rows[0].bubble_id;

        const bcRes = await client.query(
            'DELETE FROM barcode WHERE linked_invoice = $1 AND (barcode = $2 OR bubble_id = $2) RETURNING bubble_id',
            [actualInvoiceId, barcodeValue]
        );

        if (bcRes.rows.length > 0) {
            const removedIds = bcRes.rows.map(r => r.bubble_id);
            await client.query(`
                UPDATE invoice
                SET linked_barcode = ARRAY(
                    SELECT item FROM unnest(COALESCE(linked_barcode, ARRAY[]::text[])) item
                    WHERE item != ALL($1::text[])
                )
                WHERE bubble_id = $2;
            `, [removedIds, actualInvoiceId]);
        }

        await client.query('COMMIT');
        res.json({ success: true, deleted: bcRes.rows.length });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('[DeleteBarcode] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoices/on-the-fly
 * Create a new invoice
 */
router.post('/api/v1/invoices/on-the-fly', requireAuth, async (req, res) => {
    try {
        const invoiceData = req.body;
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Add userId to payload as expected by service
        invoiceData.userId = userId;
        invoiceData.auditActor = req.user;

        const result = await invoiceService.createInvoice(pool, invoiceData);

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                invoice_link: result.data.shareToken ? `/view/${result.data.shareToken}` : null
            });

            writeActivity({
                req,
                action: 'create',
                entityType: 'invoice',
                entityId: result.data.bubbleId,
                entityLabel: result.data.invoiceNumber,
                description: `created invoice ${result.data.invoiceNumber}${invoiceData.customerName ? ` for ${invoiceData.customerName}` : ''}`
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (err) {
        console.error('Error creating invoice:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/v1/invoices/:bubbleId
 * Delete an invoice
 */
router.delete('/api/v1/invoices/:bubbleId', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        
        // Ownership check
        const inv = await client.query('SELECT created_by, linked_agent FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (inv.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, inv.rows[0].created_by, inv.rows[0].linked_agent);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Access denied' });

        await beginAgentAuditTransaction(client, auditContext);
        await client.query("UPDATE invoice SET status = 'deleted', updated_at = NOW() WHERE bubble_id = $1", [bubbleId]);
        await client.query('COMMIT');
        res.json({ success: true });

        writeActivity({
            req,
            action: 'delete',
            entityType: 'invoice',
            entityId: bubbleId,
            description: 'deleted invoice'
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * PUT /api/v1/invoices/:bubbleId/restore
 * Restore a deleted invoice
 */
router.put('/api/v1/invoices/:bubbleId/restore', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        
        // Ownership check
        const inv = await client.query('SELECT created_by, linked_agent FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (inv.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, inv.rows[0].created_by, inv.rows[0].linked_agent);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Access denied' });

        // Restore to draft
        await beginAgentAuditTransaction(client, auditContext);
        await client.query("UPDATE invoice SET status = 'draft', updated_at = NOW() WHERE bubble_id = $1", [bubbleId]);
        await client.query('COMMIT');
        res.json({ success: true });

        writeActivity({
            req,
            action: 'restore',
            entityType: 'invoice',
            entityId: bubbleId,
            description: 'restored invoice from deleted'
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoices/:bubbleId/version
 * Create a new version of an invoice
 */
router.post('/api/v1/invoices/:bubbleId/version', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const invoiceData = req.body;
    
    try {
        // Add userId to payload
        invoiceData.userId = userId;
        invoiceData.auditActor = req.user;

        const result = await invoiceService.createInvoiceVersion(pool, bubbleId, invoiceData);
        
        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                invoice_link: result.data.shareToken ? `/view/${result.data.shareToken}` : null
            });

            writeActivity({
                req,
                action: 'create',
                entityType: 'invoice',
                entityId: result.data.bubbleId || bubbleId,
                entityLabel: result.data.invoiceNumber,
                description: `generated a new version of quotation ${result.data.invoiceNumber || bubbleId}`
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (err) {
        console.error('Error creating invoice version:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/v1/invoices/:bubbleId/voucher-step', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const userAccessTags = Array.isArray(req.user?.access_level) ? req.user.access_level : [];
        const userBubbleId = req.user?.bubbleId || req.user?.bubble_id || userId || null;
        const data = await invoiceRepo.getVoucherStepData(client, bubbleId, { userAccessTags, userBubbleId });
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error fetching voucher-step data:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

// DEBUG: voucher access filter diagnostic endpoint
router.get('/api/v1/debug/voucher-access', requireAuth, async (req, res) => {
    const BUILD_HASH = '20260529-v4-jsfilter';
    const userId = getAuthenticatedUserId(req);
    const userBubbleId = req.user?.bubbleId || req.user?.bubble_id || userId || null;
    const userAccessTags = Array.isArray(req.user?.access_level) ? req.user.access_level : [];
    
    let client = null;
    try {
        client = await pool.connect();
        const voucherResult = await client.query(
            `SELECT bubble_id, voucher_code, title, access_tag, allowed_users, active 
             FROM voucher 
             WHERE bubble_id LIKE 'voucher_panel_%' 
             ORDER BY discount_amount`
        );
        
        const results = voucherResult.rows.map(v => {
            const vAccessTag = (v.access_tag || '').trim();
            const vAllowedUsers = Array.isArray(v.allowed_users) ? v.allowed_users : [];
            const hasTagRestriction = vAccessTag !== '';
            const hasUserRestriction = vAllowedUsers.length > 0;
            
            let pass = false;
            let reason = '';
            if (!hasTagRestriction && !hasUserRestriction) { pass = true; reason = 'no restriction'; }
            else if (hasTagRestriction && userAccessTags.includes(vAccessTag)) { pass = true; reason = 'tag match'; }
            else if (hasUserRestriction && userBubbleId && vAllowedUsers.includes(String(userBubbleId))) { pass = true; reason = 'user in allowed_users'; }
            else { reason = 'BLOCKED - no match'; }
            
            return {
                voucher_code: v.voucher_code,
                active: v.active,
                access_tag: vAccessTag || null,
                allowed_users: vAllowedUsers,
                allowed_users_type: typeof v.allowed_users,
                allowed_users_isArray: Array.isArray(v.allowed_users),
                pass,
                reason
            };
        });
        
        res.json({
            build: BUILD_HASH,
            your_userId: userId,
            your_bubbleId: userBubbleId,
            your_access_level: userAccessTags,
            req_user_keys: Object.keys(req.user || {}),
            vouchers: results
        });
    } catch (err) {
        res.status(500).json({ error: err.message, build: BUILD_HASH });
    } finally {
        if (client) client.release();
    }
});

router.put('/api/v1/invoices/:bubbleId/vouchers', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const applied = await invoiceRepo.applyInvoiceVoucherSelections(
            client,
            bubbleId,
            req.body?.voucher_ids || [],
            String(userId),
            auditContext
        );

        res.json({ success: true, data: applied });
    } catch (err) {
        console.error('Error applying invoice vouchers:', err);
        res.status(400).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

router.get('/api/v1/vouchers/preview', requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const packageId = String(req.query.package_id || '').trim();
    if (!packageId) {
        return res.status(400).json({ success: false, error: 'package_id is required' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const userAccessTags = Array.isArray(req.user?.access_level) ? req.user.access_level : [];
        const userBubbleId = req.user?.bubbleId || req.user?.bubble_id || userId || null;
        const data = await invoiceRepo.getVoucherPreviewDataByPackage(client, packageId, { userAccessTags, userBubbleId });
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error fetching voucher preview data:', err);
        res.status(400).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoices/:bubbleId/history
 * Get action history for an invoice
 */
router.get('/api/v1/invoices/:bubbleId/history', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    let client = null;
    try {
        client = await pool.connect();
        const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const result = await invoiceHistoryRepo.loadInvoiceHistory(client, bubbleId);
        if (!result) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoices/:bubbleId/viewer-activity
 * Summarize public invoice/proposal visitor activity recorded in invoice_audit_log.
 */
router.get('/api/v1/invoices/:bubbleId/viewer-activity', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const auditRows = await client.query(
            `SELECT id, action_type, entity_id, actor_user_id, actor_name, actor_phone, actor_role, changes, edited_at
               FROM invoice_audit_log
              WHERE invoice_id = $1
                AND entity_type = 'viewer_activity'
              ORDER BY edited_at DESC
              LIMIT 500`,
            [invoice.id]
        );
        const events = auditRows.rows.map(normalizeViewerActivityRow);

        res.json({
            success: true,
            data: {
                summary: summarizeViewerActivity(events),
                events
            }
        });
    } catch (err) {
        console.error('Error fetching invoice viewer activity:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**

 * DELETE /api/v1/invoices/cleanup-samples

 */

router.delete('/api/v1/invoices/cleanup-samples', requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        const deletedCount = await invoiceRepo.deleteSampleInvoices(client, userId, auditContext);
        res.json({ success: true, message: `${deletedCount} sample quotation(s) moved to trash.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
