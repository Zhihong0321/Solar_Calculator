const express = require('express');
const router = express.Router();

const claimReceiptController = require('./claimReceiptController');
const pool = require('../../core/database/pool');
const { requireAuth } = require('../../core/middleware/auth');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

const REVIEW_ROLES = ['admin', 'hr'];

/** Same pattern as SupportTicket's requireAdmin — reviewing/approving claims is restricted. */
const requireReviewer = async (req, res, next) => {
  try {
    const identity = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const result = await pool.query(
      'SELECT access_level FROM "user" WHERE bubble_id = $1 OR id::text = $1 LIMIT 1',
      [String(identity)]
    );
    const user = result.rows[0];
    const levels = Array.isArray(user?.access_level) ? user.access_level.map((r) => String(r).toLowerCase()) : [];
    const allowed = levels.some((level) => REVIEW_ROLES.includes(level));
    if (!allowed) {
      return res.status(403).json({ error: 'Claim review is restricted to admin/HR access levels' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Authorization error' });
  }
};

// Submitting/editing/deleting a claim only requires being a logged-in agent.
router.post('/api/claim-receipts/ocr', requireAuth, claimReceiptController.uploadReceipt, claimReceiptController.ocr);
router.post('/api/claim-receipts', requireAuth, claimReceiptController.create);
router.put('/api/claim-receipts/:id', requireAuth, claimReceiptController.update);
router.delete('/api/claim-receipts/:id', requireAuth, claimReceiptController.remove);

// Seeing every claim and approving/rejecting is reviewer-only.
router.get('/api/claim-receipts', requireAuth, requireReviewer, claimReceiptController.list);
router.patch('/api/claim-receipts/:id', requireAuth, requireReviewer, claimReceiptController.decide);

module.exports = router;
