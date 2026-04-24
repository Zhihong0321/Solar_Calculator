const express = require('express');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const activityV2Repo = require('../services/activityV2Repo');

const router = express.Router();

function sendError(res, err) {
  const message = err?.message || 'Activity V2 request failed.';
  const status = message.includes('required') || message.includes('invalid') || message.includes('must be')
    ? 400
    : message.includes('Only HoD') || message.includes('not available') || message.includes('Manager access')
      ? 403
      : 500;

  if (status >= 500) {
    console.error('[ActivityV2] Error:', err);
  }

  return res.status(status).json({ success: false, error: message });
}

router.get('/activity-report-v2/presets', requireAuth, (req, res) => {
  res.sendFile(require('path').join(__dirname, '../../../../public/templates/activity_v2_presets.html'));
});

router.get('/activity-report-v2/report', requireAuth, (req, res) => {
  res.sendFile(require('path').join(__dirname, '../../../../public/templates/activity_v2_report.html'));
});

router.get('/activity-live-board', requireAuth, (req, res) => {
  res.sendFile(require('path').join(__dirname, '../../../../public/templates/activity_v2_live_board.html'));
});

router.get('/activity-live-board/person/:linkedUser', requireAuth, (req, res) => {
  res.sendFile(require('path').join(__dirname, '../../../../public/templates/activity_v2_person_card.html'));
});

router.get('/api/activity-v2/presets', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const data = await activityV2Repo.listPresetsForUser(client, userContext);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.post('/api/activity-v2/presets', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const preset = await activityV2Repo.createPreset(client, userContext, req.body || {});
    res.status(201).json({ success: true, data: preset });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.get('/api/activity-v2/presets/manage', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const presets = await activityV2Repo.listManageablePresets(client, userContext);
    res.json({
      success: true,
      data: {
        canCreateDepartmentPreset: userContext.canCreateDepartmentPreset,
        department: userContext.department,
        presets
      }
    });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.put('/api/activity-v2/presets/:id', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const preset = await activityV2Repo.updatePreset(client, userContext, req.params.id, req.body || {});
    if (!preset) {
      return res.status(404).json({ success: false, error: 'Task preset not found.' });
    }
    res.json({ success: true, data: preset });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.post('/api/activity-v2/start', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const report = await activityV2Repo.startActivity(client, userContext, req.body || {});
    res.status(201).json({ success: true, data: report });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.get('/api/activity-v2/current', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const current = await activityV2Repo.getCurrentActivity(client, userContext);
    res.json({ success: true, data: current });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.get('/api/activity-v2/timeline', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const timeline = await activityV2Repo.getTimeline(client, userContext, { date: req.query.date });
    res.json({ success: true, data: timeline });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.get('/api/activity-v2/live-board', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const board = await activityV2Repo.getLiveBoard(client, userContext);
    res.json({ success: true, data: board });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.get('/api/activity-v2/person/:linkedUser/timeline', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const data = await activityV2Repo.getPersonTimeline(client, userContext, req.params.linkedUser, { date: req.query.date });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

router.put('/api/activity-v2/reports/:id/detail', requireAuth, async (req, res) => {
  let client;
  try {
    const userContext = activityV2Repo.buildUserContext(req);
    client = await pool.connect();
    const report = await activityV2Repo.updateDetail(
      client,
      userContext,
      req.params.id,
      req.body?.detailText ?? req.body?.detail_text
    );

    if (!report) {
      return res.status(404).json({ success: false, error: 'Activity report not found.' });
    }

    res.json({ success: true, data: report });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
