const express = require('express');
const path = require('path');
const { requireAuth } = require('../../core/middleware/auth');
const ctrl = require('./googleReviewController');

const router = express.Router();
const TEMPLATES = path.join(__dirname, '../../../public/templates');

// Pages
router.get('/google-review', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review.html')));
router.get('/google-review/my-claims', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review_my_claims.html')));
router.get('/google-review/admin', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review_admin.html')));

// Any logged-in agent
router.get('/api/google-review/me', requireAuth, ctrl.me);
router.get('/api/google-review/customers', requireAuth, ctrl.searchCustomers);
router.post('/api/google-review/claims', requireAuth, ctrl.handleUpload, ctrl.createClaim);
router.get('/api/google-review/claims/mine', requireAuth, ctrl.listMine);

// HR / KC only
router.get('/api/google-review/claims', requireAuth, ctrl.requireReviewer, ctrl.listAll);
router.patch('/api/google-review/claims/:id', requireAuth, ctrl.requireReviewer, ctrl.decide);

module.exports = router;
