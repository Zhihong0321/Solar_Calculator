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

// WhatsApp review-request campaign (HR / KC only)
const campaign = require('./campaignService');
const reviewer = [requireAuth, ctrl.requireReviewer];
const campaignHandler = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error('[GoogleReviewCampaign] error:', err);
    res.status(500).json({ error: err.message || 'Campaign request failed' });
  }
};

// Public short link for customers (no login): /review -> the Google Maps review box.
// 302 so the target can change later without breaking links already sent.
router.get('/review', (req, res) => res.redirect(302, campaign.GOOGLE_REVIEW_URL));

router.get('/google-review/campaign', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review_campaign.html')));
router.get('/google-review/campaign/progress', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review_campaign_progress.html')));

router.get('/api/google-review/campaign/eligible', ...reviewer, campaignHandler(async () => {
  const [customers, settings] = await Promise.all([campaign.scanEligible(), campaign.getSettings()]);
  return { customers, scanned_at: new Date().toISOString(), session_id: settings.session_id };
}));
router.post('/api/google-review/campaign/queue', ...reviewer, campaignHandler((req) =>
  campaign.enqueueEligible(req.googleReviewActor, { skipClaimed: req.body.skip_claimed !== false })));
router.get('/api/google-review/campaign/progress', ...reviewer, campaignHandler((req) => campaign.getProgress({ status: req.query.status })));
router.put('/api/google-review/campaign/settings', ...reviewer, campaignHandler(async (req) => ({ settings: await campaign.updateSettings(req.body) })));
router.post('/api/google-review/campaign/start', ...reviewer, campaignHandler(async () => ({ settings: await campaign.setRunning(true) })));
router.post('/api/google-review/campaign/pause', ...reviewer, campaignHandler(async () => ({ settings: await campaign.setRunning(false) })));
router.post('/api/google-review/campaign/retry-failed', ...reviewer, campaignHandler(() => campaign.retryFailed()));
router.post('/api/google-review/campaign/test-send', ...reviewer, campaignHandler((req) =>
  campaign.sendTest(req.googleReviewActor, { lang: req.body && req.body.lang })));

module.exports = router;
