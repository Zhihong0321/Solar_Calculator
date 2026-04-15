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
        let hybridUpgradeData = null;
        try {
          hybridUpgradeData = await invoiceRepo.getHybridUpgradeOptionsForPackage(client, id);
        } catch (hybridErr) {
          console.warn('Failed to enrich package details with hybrid upgrade data:', hybridErr.message);
        }

        res.json({
          success: true,
          package: {
            ...pkg,
            hybrid_upgrade_data: hybridUpgradeData
          }
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
 * GET /api/package/:id/hybrid-upgrades
 * Get matching hybrid inverter upgrade rules for a package.
 */
router.get('/api/package/:id/hybrid-upgrades', requireAuth, async (req, res) => {
  let client = null;

  try {
    const { id } = req.params;
    client = await pool.connect();
    const data = await invoiceRepo.getHybridUpgradeOptionsForPackage(client, id);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Error fetching hybrid upgrade options:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch hybrid upgrade options'
    });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/packages/search
 * Search active packages by panel rating and quantity for invoice replacement.
 */
router.get('/api/packages/search', requireAuth, async (req, res) => {
  let client = null;

  try {
    const panelQty = parseInt(req.query.panelQty, 10);
    const panelRating = parseInt(req.query.panelRating, 10);
    const packageType = String(req.query.type || '').trim();

    if (!Number.isInteger(panelQty) || panelQty <= 0) {
      return res.status(400).json({ success: false, error: 'panelQty must be a positive number' });
    }

    if (!Number.isInteger(panelRating) || panelRating <= 0) {
      return res.status(400).json({ success: false, error: 'panelRating must be a positive number' });
    }

    client = await pool.connect();

    const params = [panelQty, panelRating];
    let typeClause = '';
    if (packageType) {
      params.push(packageType);
      typeClause = ` AND p.type = $${params.length}`;
    }

    const result = await client.query(
      `SELECT
          COALESCE(p.bubble_id, p.id::text) AS bubble_id,
          p.id,
          p.package_name,
          p.price,
          p.panel_qty,
          p.type,
          p.invoice_desc,
          pr.solar_output_rating
       FROM package p
       LEFT JOIN product pr
         ON CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
         OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
       WHERE p.active = true
         AND p.panel_qty = $1
         AND pr.solar_output_rating = $2
         ${typeClause}
       ORDER BY p.price ASC, p.package_name ASC`,
      params
    );

    res.json({
      success: true,
      packages: result.rows
    });
  } catch (err) {
    console.error('Error searching packages:', err);
    res.status(500).json({ success: false, error: 'Failed to search packages' });
  } finally {
    if (client) client.release();
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
