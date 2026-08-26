const express = require('express');
const router = express.Router();

const claimReceiptController = require('./claimReceiptController');
const { requireAuth } = require('../../core/middleware/auth');
const { requireReviewer } = require('./reviewerAccess');

// Submitting/editing/deleting a claim only requires being a logged-in agent.
router.post('/api/claim-receipts/ocr', requireAuth, claimReceiptController.uploadReceipt, claimReceiptController.ocr);
router.post('/api/claim-receipts', requireAuth, claimReceiptController.create);
router.put('/api/claim-receipts/:id', requireAuth, claimReceiptController.update);
router.delete('/api/claim-receipts/:id', requireAuth, claimReceiptController.remove);

// Agent can view their own claims
router.get('/api/claim-receipts/mine', requireAuth, claimReceiptController.getMyClaims);

// Picking who to submit a claim on behalf of is reviewer-only (same tier as approving claims).
router.get('/api/claim-receipts/submittable-users', requireAuth, requireReviewer, claimReceiptController.listSubmittableUsers);

// Seeing every claim and approving/rejecting is reviewer-only.
router.get('/api/claim-receipts', requireAuth, requireReviewer, claimReceiptController.list);
router.patch('/api/claim-receipts/:id', requireAuth, requireReviewer, claimReceiptController.decide);

module.exports = router;
