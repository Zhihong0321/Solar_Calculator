const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const invoiceRepo = require('../services/invoiceRepo');

const router = express.Router();

/**
 * GET /submit-payment
 * Customer payment submission page
 */
router.get('/submit-payment', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/submit_payment.html'));
});

/**
 * POST /api/v1/invoices/:bubbleId/payment
 * Submit payment proof (Customer side)
 */
router.post('/api/v1/invoices/:bubbleId/payment', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { amount, payment_date, attachment_base64, attachment_name, notes } = req.body;
    const userId = req.user.userId;

    if (!amount || !payment_date || !attachment_base64) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    let client = null;
    try {
        client = await pool.connect();
        
        // 1. Verify Invoice exists
        const invCheck = await client.query('SELECT bubble_id, customer_email FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        // 2. Save Attachment to Disk
        const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../../storage');
        const uploadDir = path.join(storageRoot, 'uploaded_payment');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Decode base64
        const matches = attachment_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ success: false, error: 'Invalid attachment format' });
        }

        const buffer = Buffer.from(matches[2], 'base64');
        const fileExt = attachment_name ? path.extname(attachment_name) : '.jpg';
        const filename = `pay_${bubbleId}_${Date.now()}${fileExt}`;
        const filePath = path.join(uploadDir, filename);

        fs.writeFileSync(filePath, buffer);

        // Construct public URL
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const attachmentUrl = `${protocol}://${host}/uploads/uploaded_payment/${filename}`;

        // 3. Insert into submitted_payment
        const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
        await client.query(
            `INSERT INTO submitted_payment (
                bubble_id, amount, payment_date, attachment, notes, 
                linked_invoice, created_by, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [paymentId, amount, payment_date, [attachmentUrl], notes, bubbleId, userId, 'pending']
        );

        // 4. Log Action
        await invoiceRepo.logInvoiceAction(client, bubbleId, 'payment_submitted', userId, {
            amount,
            paymentId
        });

        res.json({ success: true, paymentId });

    } catch (err) {
        console.error('Payment submission error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/submitted-payments/:bubbleId
 * Get submitted payments for an invoice
 */
router.get('/api/v1/submitted-payments/:bubbleId', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    let client = null;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM submitted_payment WHERE linked_invoice = $1 ORDER BY created_at DESC',
            [bubbleId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
