const telemarketingService = require('./services/telemarketingService');

async function getProfile(req, res) {
  try {
    const uid = await telemarketingService.resolveTelemarketerUid(req);
    const profile = await telemarketingService.getProfile(uid);
    res.json(profile);
  } catch (err) {
    console.error('[TelemarketingController] getProfile error:', err.message);
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Failed to fetch telemarketer profile'
    });
  }
}

async function listLeads(req, res) {
  try {
    const uid = await telemarketingService.resolveTelemarketerUid(req);
    const { status, search, limit, offset, sort } = req.query;

    const data = await telemarketingService.getLeads(uid, {
      status,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      sort
    });

    res.json(data);
  } catch (err) {
    console.error('[TelemarketingController] listLeads error:', err.message);
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Failed to fetch leads'
    });
  }
}

async function getLeadDetail(req, res) {
  try {
    const uid = await telemarketingService.resolveTelemarketerUid(req);
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ ok: false, error: 'Lead ID is required' });
    }

    const data = await telemarketingService.getLeadDetail(id, uid);
    res.json(data);
  } catch (err) {
    console.error('[TelemarketingController] getLeadDetail error:', err.message);
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Failed to fetch lead detail'
    });
  }
}

async function updateLead(req, res) {
  try {
    const uid = await telemarketingService.resolveTelemarketerUid(req);
    const { id } = req.params;
    const { leadStatus, notes, appendNotes } = req.body || {};

    if (!id) {
      return res.status(400).json({ ok: false, error: 'Lead ID is required' });
    }

    const result = await telemarketingService.updateLead(id, uid, {
      leadStatus,
      notes,
      appendNotes
    });

    res.json(result);
  } catch (err) {
    console.error('[TelemarketingController] updateLead error:', err.message);
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Failed to update lead'
    });
  }
}

module.exports = {
  getProfile,
  listLeads,
  getLeadDetail,
  updateLead
};
