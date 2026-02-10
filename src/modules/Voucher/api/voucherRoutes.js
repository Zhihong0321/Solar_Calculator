const express = require('express');
const router = express.Router();
const voucherRepo = require('../services/voucherRepo');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');

/**
 * GET /api/vouchers
 * List all vouchers
 */
router.get('/api/vouchers_v2', requireAuth, async (req, res) => {
    try {
        const { status } = req.query;
        let where = '';
        if (status === 'deleted') where = 'WHERE "delete" = TRUE';
        else if (status === 'active') where = 'WHERE active = TRUE AND ("delete" IS NULL OR "delete" = FALSE)';
        else if (status === 'inactive') where = 'WHERE active = FALSE AND ("delete" IS NULL OR "delete" = FALSE)';

        // RAW QUERY BYPASSING REPO
        const result = await pool.query(`SELECT * FROM voucher ${where} ORDER BY created_at DESC`);

        console.log(`[API V2] Status: ${status}, Count: ${result.rows.length}`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

/**
 * GET /api/vouchers
router.get('/api/vouchers', requireAuth, async (req, res) => {
    try {
        const { status } = req.query; // 'active', 'inactive', 'deleted', 'all'
        console.log(`[API] Fetching vouchers with status: ${status}`);
        const vouchers = await voucherRepo.getAllVouchers(pool, status);
        res.json(vouchers || []);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
    }
});

/**
 * POST /api/vouchers/:id/restore
 * Restore a deleted voucher
 */
router.post('/api/vouchers/:id/restore', requireAuth, async (req, res) => {
    try {
        const success = await voucherRepo.restoreVoucher(pool, req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json({ success: true, message: 'Voucher restored successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to restore voucher' });
    }
});

/**
 * GET /api/vouchers/:id
 * Get a single voucher
 */
router.get('/api/vouchers/:id', requireAuth, async (req, res) => {
    try {
        const voucher = await voucherRepo.getVoucherById(pool, req.params.id);
        if (!voucher) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json(voucher);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch voucher' });
    }
});

/**
 * POST /api/vouchers
 * Create a new voucher
 */
router.post('/api/vouchers', requireAuth, async (req, res) => {
    try {
        const { voucher_code } = req.body;

        // Check for duplicate code
        if (await voucherRepo.checkVoucherCodeExists(pool, voucher_code)) {
            return res.status(400).json({ error: 'This voucher code already exists.' });
        }

        const data = {
            ...req.body,
            created_by: req.user.bubbleId || req.user.userId
        };
        const voucher = await voucherRepo.createVoucher(pool, data);
        res.status(201).json(voucher);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create voucher' });
    }
});

/**
 * PATCH /api/vouchers/:id/toggle
 * Toggle active status
 */
router.patch('/api/vouchers/:id/toggle', requireAuth, async (req, res) => {
    try {
        const newStatus = await voucherRepo.toggleVoucherStatus(pool, req.params.id);
        if (newStatus === null) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json({ success: true, active: newStatus });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle status' });
    }
});

/**
 * PUT /api/vouchers/:id
 * Update an existing voucher
 */
router.put('/api/vouchers/:id', requireAuth, async (req, res) => {
    try {
        const { voucher_code } = req.body;

        // Check for duplicate code (excluding current voucher)
        if (voucher_code && await voucherRepo.checkVoucherCodeExists(pool, voucher_code, req.params.id)) {
            return res.status(400).json({ error: 'This voucher code is already in use by another voucher.' });
        }

        const voucher = await voucherRepo.updateVoucher(pool, req.params.id, req.body);
        if (!voucher) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json(voucher);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update voucher' });
    }
});

/**
 * DELETE /api/vouchers/:id
 * Delete a voucher (soft delete)
 */
router.delete('/api/vouchers/:id', requireAuth, async (req, res) => {
    try {
        const success = await voucherRepo.deleteVoucher(pool, req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json({ success: true, message: 'Voucher deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete voucher' });
    }
});

module.exports = router;
