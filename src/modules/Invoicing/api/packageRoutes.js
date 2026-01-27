const express = require('express');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const invoiceRepo = require('../services/invoiceRepo');

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
 * Get list of public active vouchers
 */
router.get('/api/vouchers', requireAuth, async (req, res) => {
    let client = null;
    try {
        client = await pool.connect();
        const query = `
            SELECT bubble_id, code, discount_amount, type, description, expiry_date
            FROM voucher
            WHERE is_active = true 
              AND (expiry_date IS NULL OR expiry_date > NOW())
            ORDER BY created_at DESC
        `;
        const result = await client.query(query);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error('Error fetching vouchers:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch vouchers'
        });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
