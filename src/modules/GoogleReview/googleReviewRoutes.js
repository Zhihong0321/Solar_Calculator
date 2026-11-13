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
// WhatsApp (and other chat apps) fetch the link to build a preview card: they get a small page whose
// image is the campaign poster, so the customer sees the poster inside the message. People get the redirect.
const PREVIEW_BOTS = /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|linkedinbot|discordbot/i;
router.get('/review', (req, res) => {
  if (PREVIEW_BOTS.test(req.get('user-agent') || '')) {
    const origin = `${req.protocol}://${req.get('host')}`;
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Eternalgy - give us a 5 star review, get RM15 Touch 'n Go</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Eternalgy">
<meta property="og:title" content="Give us a 5 star review and get RM15 Touch 'n Go">
<meta property="og:description" content="Tap to leave your review on Google Maps.">
<meta property="og:image" content="${origin}/google-review-bonus.png">
<meta property="og:image:width" content="1080"><meta property="og:image:height" content="1080">
<meta property="og:url" content="${origin}/review">
<meta name="twitter:card" content="summary_large_image">
</head><body><a href="${campaign.GOOGLE_REVIEW_URL}">Leave a Google review</a></body></html>`);
  }
  return res.redirect(302, campaign.GOOGLE_REVIEW_URL);
});

router.get('/google-review/campaign', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review_campaign.html')));
router.get('/google-review/campaign/send', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review_campaign_send.html')));
router.get('/google-review/campaign/progress', requireAuth, (req, res) => res.sendFile(path.join(TEMPLATES, 'google_review_campaign_progress.html')));

router.get('/api/google-review/campaign/eligible', ...reviewer, campaignHandler(async () => {
  const [customers, settings] = await Promise.all([campaign.scanEligible(), campaign.getSettings()]);
  return { customers, scanned_at: new Date().toISOString(), session_id: settings.session_id };
}));
router.post('/api/google-review/campaign/queue', ...reviewer, campaignHandler((req) =>
  campaign.enqueueEligible(req.googleReviewActor, { skipClaimed: req.body.skip_claimed !== false })));
router.get('/api/google-review/campaign/progress', ...reviewer, campaignHandler((req) => campaign.getProgress({ status: req.query.status, q: req.query.q })));
router.get('/api/google-review/campaign/send-list', ...reviewer, campaignHandler((req) => campaign.listForSend({ status: req.query.status, q: req.query.q })));
router.post('/api/google-review/campaign/messages/:id/manual-send', ...reviewer, async (req, res) => {
  try {
    const result = await campaign.manualSend(Number(req.params.id), req.googleReviewActor);
    if (result.error) return res.status(result.code || 400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error('[GoogleReviewCampaign] manual-send error:', err);
    return res.status(500).json({ error: err.message || 'Could not prepare the message' });
  }
});
router.post('/api/google-review/campaign/messages/:id/undo-manual', ...reviewer, async (req, res) => {
  try {
    const result = await campaign.undoManualSend(Number(req.params.id));
    if (result.error) return res.status(result.code || 400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error('[GoogleReviewCampaign] undo-manual error:', err);
    return res.status(500).json({ error: err.message || 'Could not undo' });
  }
});
router.post('/api/google-review/campaign/messages/:id/verify', ...reviewer, ctrl.handleUpload, ctrl.verifyCampaignMessage);
router.put('/api/google-review/campaign/settings', ...reviewer, campaignHandler(async (req) => ({ settings: await campaign.updateSettings(req.body) })));
router.post('/api/google-review/campaign/start', ...reviewer, campaignHandler(async () => ({ settings: await campaign.setRunning(true) })));
router.post('/api/google-review/campaign/pause', ...reviewer, campaignHandler(async () => ({ settings: await campaign.setRunning(false) })));
router.post('/api/google-review/campaign/retry-failed', ...reviewer, campaignHandler(() => campaign.retryFailed()));
router.post('/api/google-review/campaign/test-send', ...reviewer, campaignHandler((req) =>
  campaign.sendTest(req.googleReviewActor, { lang: req.body && req.body.lang })));

module.exports = router;
