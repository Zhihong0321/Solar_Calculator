// Temporary demo route for video recording - provides mock auth context
// This should be removed after demo video is created

const express = require('express');
const path = require('path');

const router = express.Router();

// Mock auth middleware that injects a demo user
const mockAuthForDemo = (req, res, next) => {
  // Set a mock authenticated user for demo purposes
  req.resolvedUser = {
    bubble_id: 'demo-user-123',
    user_id: 999999,
    email: 'demo@example.com',
    name: 'Demo Agent',
    role: 'agent'
  };
  next();
};

// Serve claim submission page with mock auth (uses demo version with updated API paths)
router.get('/demo/claim-submission', mockAuthForDemo, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/templates/claim_submission_demo.html'));
});

// Real OCR endpoint (proxies to actual implementation with mock user)
router.post('/demo/api/claim-receipts/ocr', mockAuthForDemo,
  (req, res, next) => {
    const claimReceiptController = require('../src/modules/ClaimReceipt/claimReceiptController');
    // Apply multer middleware first
    claimReceiptController.uploadReceipt(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      // Then run OCR
      return claimReceiptController.ocr(req, res);
    });
  }
);

// Real create claim endpoint
router.post('/demo/api/claim-receipts', mockAuthForDemo, async (req, res) => {
  const claimReceiptController = require('../src/modules/ClaimReceipt/claimReceiptController');
  return claimReceiptController.create(req, res);
});

// Real get my claims endpoint
router.get('/demo/api/claim-receipts/mine', mockAuthForDemo, async (req, res) => {
  const claimReceiptController = require('../src/modules/ClaimReceipt/claimReceiptController');
  return claimReceiptController.getMyClaims(req, res);
});

module.exports = router;
