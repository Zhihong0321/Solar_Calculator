const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const invoiceRepo = require('../services/invoiceRepo');
const invoiceService = require('../services/invoiceService');

const router = express.Router();

/**
 * PAGE ROUTES
 */

router.get('/create-invoice', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/create_invoice.html'));
});

router.get('/edit-invoice', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/edit_invoice.html'));
});

router.get('/invoice-office', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/invoice_office.html'));
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
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const { startDate, endDate, paymentStatus } = req.query;

        client = await pool.connect();
        
        const result = await invoiceRepo.getInvoicesByUserId(client, userId, {
            limit,
            offset,
            startDate,
            endDate,
            paymentStatus
        });
        
        // Build URLs (Legacy support)
        const protocol = req.protocol;
        const host = req.get('host');
        const invoices = result.invoices.map(inv => ({
            ...inv,
            share_url: inv.share_token ? `${protocol}://${host}/view/${inv.share_token}` : null
        }));

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
 * POST /api/v1/invoices/on-the-fly
 * Create a new invoice
 */
router.post('/api/v1/invoices/on-the-fly', requireAuth, async (req, res) => {
    let client = null;
    try {
        const invoiceData = req.body;
        const userId = req.user.userId;

        client = await pool.connect();
        await client.query('BEGIN');

        const result = await invoiceService.createInvoiceOnTheFly(client, invoiceData, userId);

        await client.query('COMMIT');
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Error creating invoice:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/v1/invoices/:bubbleId
 * Delete an invoice
 */
router.delete('/api/v1/invoices/:bubbleId', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = req.user.userId;
    let client = null;
    try {
        client = await pool.connect();
        
        // Ownership check
        const inv = await client.query('SELECT created_by, linked_agent FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (inv.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, inv.rows[0].created_by, inv.rows[0].linked_agent);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Access denied' });

        await client.query("UPDATE invoice SET status = 'deleted', updated_at = NOW() WHERE bubble_id = $1", [bubbleId]);
        res.json({ success: true });
    } catch (err) {
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
    const userId = req.user.userId;
    let client = null;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        
        const newInvoice = await invoiceService.createNewVersion(client, bubbleId, userId);
        
        await client.query('COMMIT');
        res.json({ success: true, data: newInvoice });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
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
    let client = null;
    try {
        client = await pool.connect();
        const result = await client.query(
            `SELECT a.*, u.name as user_name 
             FROM invoice_action a
             LEFT JOIN "user" u ON a.created_by = u.id::text OR a.created_by = u.bubble_id
             WHERE a.invoice_id = $1 
             ORDER BY a.created_at DESC`,
            [bubbleId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**

 * DELETE /api/v1/invoices/cleanup-samples

 */

router.delete('/api/v1/invoices/cleanup-samples', requireAuth, async (req, res) => {
    let client = null;
    try {
        client = await pool.connect();
        await client.query("DELETE FROM invoice WHERE customer_name LIKE '%Sample%' OR customer_name LIKE '%Test%'");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
