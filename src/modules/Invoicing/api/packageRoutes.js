const express = require('express');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const invoiceRepo = require('../services/invoiceRepo');
const voucherRepo = require('../../Voucher/services/voucherRepo');

const router = express.Router();

/**
 * GET /api/package/:id
 * Get package details by ID
 */
router.get('/api/package/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const pkg = await invoiceRepo.getPackageById(client, id);
      if (pkg) {
        res.json({
          success: true,
          package: pkg
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Package with ID '${id}' not found`
        });
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching package:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/vouchers
 * Compatibility endpoint for invoice pages.
 * NOTE: This path is also defined in Voucher module. Since Invoicing is mounted first,
 * this handler must mirror voucher behavior to avoid response shape mismatches.
 */
router.get('/api/vouchers', requireAuth, async (req, res) => {
    try {
        const status = req.query.status || 'active'; // 'active', 'inactive', 'deleted', 'all'
        const vouchers = await voucherRepo.getAllVouchers(pool, status);

        res.json({
            success: true,
            vouchers: vouchers || []
        });
    } catch (err) {
        console.error('Error fetching vouchers:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch vouchers'
        });
    }
});

module.exports = router;
