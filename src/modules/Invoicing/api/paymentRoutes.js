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
 * Submit payment details (Frontend: submit_payment.html)
 */
router.post('/api/v1/invoices/:bubbleId/payment', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { method, date, referenceNo, notes, proof, epp, paymentBank, paymentId, amount } = req.body;
    const userId = req.user.userId;

    if (!method || !date) {
        return res.status(400).json({ success: false, error: 'Missing required fields: method and date are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verify invoice exists
        const invoiceCheck = await client.query(
            'SELECT * FROM invoice WHERE bubble_id = $1',
            [bubbleId]
        );

        if (invoiceCheck.rows.length === 0) {
            throw new Error('Invoice not found');
        }
        const invoice = invoiceCheck.rows[0];

        // Determine actual payment amount (prefer provided amount, fallback to full invoice total)
        const finalAmount = amount !== undefined && amount !== null ? parseFloat(amount) : parseFloat(invoice.total_amount);

        // Map Method to Standard Strings
        let standardMethod = 'CASH';
        if (method === 'credit_card') standardMethod = 'CREDIT CARD';
        if (method === 'epp') standardMethod = 'EPP';

        // Prepare Remark
        const remark = `${notes || ''} [Ref: ${referenceNo || 'N/A'}]`.trim();

        // Handle Proof File Upload (Save to Disk)
        let attachmentUrl = null;
        if (proof && proof.data) {
            try {
                const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../../storage');
                const uploadDir = path.join(storageRoot, 'uploaded_payment');
                
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                const matches = proof.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const mimeType = (proof.type || matches[1] || '').toLowerCase();
                    const allowedMime = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
                    if (!allowedMime.includes(mimeType)) {
                        throw new Error(`Unsupported proof file type: ${mimeType || 'unknown'}. Allowed types: PDF or image.`);
                    }
                    const extByMime = {
                        'application/pdf': '.pdf',
                        'image/jpeg': '.jpg',
                        'image/jpg': '.jpg',
                        'image/png': '.png',
                        'image/webp': '.webp',
                        'image/heic': '.heic',
                        'image/heif': '.heif'
                    };
                    const fileExt = extByMime[mimeType] || (proof.name ? path.extname(proof.name) : '') || '.bin';
                    const buffer = Buffer.from(matches[2], 'base64');
                    const filename = `payment_${bubbleId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
                    const filePath = path.join(uploadDir, filename);
                    fs.writeFileSync(filePath, buffer);
                    
                    // Generate Full Absolute URL
                    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                    const host = req.get('host');
                    // The server serves storageRoot at /uploads
                    // The file is at storageRoot/uploaded_payment/filename
                    // So the URL should be /uploads/uploaded_payment/filename
                    attachmentUrl = `${protocol}://${host}/uploads/uploaded_payment/${filename}`;
                }
            } catch (fileErr) {
                console.error('[Payment] File save error:', fileErr);
                throw new Error('Failed to save proof of payment file.');
            }
        }

        // UPDATE or INSERT
        if (paymentId) {
            // Update Existing Payment
            if (attachmentUrl) {
                await client.query(
                    `UPDATE submitted_payment 
                     SET payment_method = $1, payment_method_v2 = $1, amount = $2, payment_date = $3, 
                         remark = $4, issuer_bank = $5, epp_month = $6, epp_type = $7,
                         attachment = $8, modified_date = NOW(), updated_at = NOW()
                     WHERE bubble_id = $9 AND (created_by = $10 OR 1=1)`, // 1=1 for safety if admin edits
                    [
                        standardMethod,
                        finalAmount,
                        date,
                        remark,
                        paymentBank || (epp ? epp.bank : null),
                        epp ? epp.tenure : null,
                        method === 'epp' ? 'EPP' : null,
                        [attachmentUrl],
                        paymentId,
                        userId
                    ]
                );
            } else {
                await client.query(
                    `UPDATE submitted_payment 
                     SET payment_method = $1, payment_method_v2 = $1, amount = $2, payment_date = $3, 
                         remark = $4, issuer_bank = $5, epp_month = $6, epp_type = $7,
                         modified_date = NOW(), updated_at = NOW()
                     WHERE bubble_id = $9 AND (created_by = $10 OR 1=1)`,
                    [
                        standardMethod,
                        finalAmount,
                        date,
                        remark,
                        paymentBank || (epp ? epp.bank : null),
                        epp ? epp.tenure : null,
                        method === 'epp' ? 'EPP' : null,
                        paymentId,
                        userId
                    ]
                );
            }
        } else {
            // Insert New Payment
            const newPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
            await client.query(
                `INSERT INTO submitted_payment (
                    bubble_id, amount, payment_date, attachment, remark, 
                    linked_invoice, created_by, status, payment_method, 
                    payment_method_v2, issuer_bank, epp_month, epp_type,
                    linked_agent, linked_customer,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
                [
                    newPaymentId, 
                    finalAmount, 
                    date, 
                    attachmentUrl ? [attachmentUrl] : [], 
                    remark, 
                    bubbleId, 
                    userId, 
                    'pending', 
                    standardMethod, 
                    standardMethod,
                    paymentBank || (epp ? epp.bank : null),
                    epp ? epp.tenure : null,
                    method === 'epp' ? 'EPP' : null,
                    invoice.linked_agent || null,
                    invoice.linked_customer || null
                ]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, paymentId: paymentId || 'new' });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
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

/**
 * GET /api/v1/submitted-payments/detail/:paymentId
 * Get a single payment's details for editing
 */
router.get('/api/v1/submitted-payments/:paymentId/detail', requireAuth, async (req, res) => {
    const { paymentId } = req.params;
    let client = null;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM submitted_payment WHERE bubble_id = $1',
            [paymentId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/v1/submitted-payments/:paymentId
 * Delete a submitted payment (pending only)
 */
router.delete('/api/v1/submitted-payments/:paymentId', requireAuth, async (req, res) => {
    const { paymentId } = req.params;
    const userId = req.user.userId;
    let client = null;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const paymentRes = await client.query(
            `SELECT sp.bubble_id, sp.status, sp.linked_invoice, i.created_by, i.linked_agent
             FROM submitted_payment sp
             LEFT JOIN invoice i ON i.bubble_id = sp.linked_invoice
             WHERE sp.bubble_id = $1
             LIMIT 1`,
            [paymentId]
        );

        if (paymentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        const payment = paymentRes.rows[0];
        const isOwner = await invoiceRepo.verifyOwnership(
            client,
            userId,
            payment.created_by,
            payment.linked_agent
        );
        if (!isOwner) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        if (payment.status === 'verified') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Verified payments cannot be deleted.' });
        }

        await client.query('DELETE FROM submitted_payment WHERE bubble_id = $1', [paymentId]);

        await client.query('COMMIT');
        return res.json({ success: true });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Delete submitted payment error:', err);
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
