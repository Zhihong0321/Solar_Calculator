const express = require('express');
const router = express.Router();
const voucherRepo = require('../services/voucherRepo');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');

/**
 * GET /api/vouchers
 * List all vouchers
 */
router.get('/api/vouchers', requireAuth, async (req, res) => {
    try {
        const vouchers = await voucherRepo.getAllVouchers(pool);
        res.json(vouchers);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
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
