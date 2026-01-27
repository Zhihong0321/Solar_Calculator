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
        client = await pool.connect();
        
        // Fetch invoices where user is creator OR linked agent
        const query = `
            SELECT 
                i.bubble_id, i.invoice_number, i.total_amount, i.status, i.invoice_date, 
                i.customer_name, i.customer_email, i.share_token,
                a.name as agent_name
            FROM invoice i
            LEFT JOIN agent a ON i.linked_agent = a.bubble_id
            LEFT JOIN "user" u ON u.linked_agent_profile = a.bubble_id
            WHERE i.created_by = $1 
               OR u.id::text = $1 
               OR u.bubble_id = $1
            ORDER BY i.created_at DESC
        `;
        const result = await client.query(query, [String(userId)]);
        
        res.json({
            success: true,
            data: result.rows
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

        await client.query('DELETE FROM invoice WHERE bubble_id = $1', [bubbleId]);
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
 * GET /api/v1/invoices/actions/:actionId/snapshot
 */
router.get('/api/v1/invoices/actions/:actionId/snapshot', requireAuth, async (req, res) => {
    const { actionId } = req.params;
    let client = null;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT details->\'snapshot\' as snapshot FROM invoice_action WHERE bubble_id = $1', [actionId]);
        
        if (result.rows.length === 0 || !result.rows[0].snapshot) {
            return res.status(404).json({ success: false, error: 'Snapshot not found' });
        }
        
        res.json({ success: true, data: result.rows[0].snapshot });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoices/:bubbleId/snapshot
 */
router.post('/api/v1/invoices/:bubbleId/snapshot', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = req.user.userId;
    let client = null;
    try {
        client = await pool.connect();
        await invoiceRepo.logInvoiceAction(client, bubbleId, 'manual_snapshot', userId, {
            note: 'User requested manual snapshot'
        });
        res.json({ success: true });
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
