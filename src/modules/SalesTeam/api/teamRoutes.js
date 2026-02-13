/**
 * Sales Team Management Routes - SIMPLE VERSION
 */
const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const teamRepo = require('../services/teamRepo');

const router = express.Router();

// Page route
router.get('/sales-team-management', requireAuth, async (req, res) => {
  let client;
  try {
    console.log('[SalesTeam] req.user:', req.user);
    client = await pool.connect();
    const userId = req.user?.userId || req.user?.bubbleId || req.user?.id;
    if (!userId) {
      console.error('[SalesTeam] No userId found in req.user');
      return res.status(401).send('<h1>Unauthorized</h1><p>Invalid session.</p>');
    }
    const hasAccess = await teamRepo.hasHRAccess(userId, client);
    if (!hasAccess) {
      return res.status(403).send('<h1>Access Denied - HR only</h1>');
    }
    res.sendFile(path.join(__dirname, '../../../../public/templates/sales_team_management.html'));
  } catch (err) {
    console.error('[SalesTeam] Error:', err.message, err.stack);
    res.status(500).send(`<h1>Server Error</h1><p>${err.message}</p>`);
  } finally {
    if (client) client.release();
  }
});

// API: Get all teams with members
router.get('/api/teams', requireAuth, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const userId = req.user?.userId || req.user?.bubbleId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!await teamRepo.hasHRAccess(userId, client)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    
    const { teams, unassigned } = await teamRepo.getTeamsWithMembers(client);
    res.json({ success: true, data: { teams, unassigned } });
  } catch (err) {
    console.error('[SalesTeam API] Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// API: Assign user to team
router.post('/api/teams/assign', requireAuth, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const userId = req.user?.userId || req.user?.bubbleId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!await teamRepo.hasHRAccess(userId, client)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    
    const { targetUserId, teamTag } = req.body;
    await teamRepo.assignUserToTeam(targetUserId, teamTag, client);
    res.json({ success: true });
  } catch (err) {
    console.error('[SalesTeam API] Error:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// API: Remove user from team
router.post('/api/teams/remove', requireAuth, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const userId = req.user?.userId || req.user?.bubbleId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!await teamRepo.hasHRAccess(userId, client)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    
    const { targetUserId } = req.body;
    await teamRepo.removeUserFromTeam(targetUserId, client);
    res.json({ success: true });
  } catch (err) {
    console.error('[SalesTeam API] Error:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
