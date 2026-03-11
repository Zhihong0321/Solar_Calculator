const express = require('express');
const path = require('path');
const { requireAuth } = require('../../../core/middleware/auth');
const {
  getHealthCheckState,
  runHealthChecks
} = require('../services/healthCheckService');

const router = express.Router();

router.get('/health-center', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../../public/templates/health_center.html'));
});

router.get('/api/internal-health', requireAuth, (req, res) => {
  res.json(getHealthCheckState());
});

router.post('/api/internal-health/run', requireAuth, async (req, res) => {
  const result = await runHealthChecks({ trigger: 'manual' });
  res.json(result);
});

module.exports = router;
