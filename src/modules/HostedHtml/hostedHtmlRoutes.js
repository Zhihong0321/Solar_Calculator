const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../core/middleware/auth');
const ctrl = require('./hostedHtmlController');

// Public self-describing docs (no auth). Pass this URL to an AI Coder.
router.get('/api/hosted-html/docs', ctrl.getDocs);

// Public routes (no auth) — public HTML serve
//   GET /h/:slug
//   GET /app/:friendlySlug
// (defined in server.js)

// Authenticated user routes (JWT)
router.get('/api/v1/hosted-html', requireAuth, ctrl.listMyApps);
router.post('/api/v1/hosted-html', requireAuth, ...ctrl.createApp);
router.get('/api/v1/hosted-html/:id', requireAuth, ctrl.getApp);
router.put('/api/v1/hosted-html/:id', requireAuth, ...ctrl.updateApp);
router.post('/api/v1/hosted-html/:id/disable', requireAuth, ctrl.disableApp);
router.post('/api/v1/hosted-html/:id/enable', requireAuth, ctrl.enableApp);

// API-key routes (for AI/automation; no JWT)
//   Single-shot:  POST /api/hosted-html/host        {creatorName, title?, html}  → {url, ...}
//   Two-step:
//     1) issue:   POST /api/hosted-html/host/issue  {creatorName, title?}       → {url, upload_url, ...}
//     2) upload:  PUT  /api/hosted-html/host/:id/html {html}                      → {url, ...}
//   Management:
//     list:       GET   /api/hosted-html/host/list                              → {apps:[{url,...}]}
//     disable:    POST  /api/hosted-html/host/:id/disable                       → {app}
router.post('/api/hosted-html/host', ...ctrl.hostFromApi);
router.post('/api/hosted-html/host/issue', ...ctrl.hostIssueFromApi);
router.put('/api/hosted-html/host/:id/html', ...ctrl.hostUploadHtmlFromApi);
router.get('/api/hosted-html/host/list', ...ctrl.listHostedByApi);
router.post('/api/hosted-html/host/:id/disable', ...ctrl.disableHostedByApi);

module.exports = router;
