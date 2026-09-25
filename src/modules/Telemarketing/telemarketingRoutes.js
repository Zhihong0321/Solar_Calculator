const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../core/middleware/auth');
const ctrl = require('./telemarketingController');

// Telemarketer profile & stats
router.get('/api/v1/telemarketing/profile', requireAuth, ctrl.getProfile);

// Assigned leads list with search and filters
router.get('/api/v1/telemarketing/leads', requireAuth, ctrl.listLeads);

// Individual lead detail with contacts and decision makers
router.get('/api/v1/telemarketing/leads/:id', requireAuth, ctrl.getLeadDetail);

// Update lead status and add/edit notes
router.patch('/api/v1/telemarketing/leads/:id', requireAuth, ctrl.updateLead);

module.exports = router;
