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
            SELECT bubble_id, voucher_code, discount_amount, discount_percent, title, invoice_description, terms_conditions
            FROM voucher
            WHERE active = true 
              AND public = true
              AND ("delete" = false OR "delete" IS NULL)
            ORDER BY created_at DESC
        `;
        const result = await client.query(query);
        
        res.json({
            success: true,
            vouchers: result.rows
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
