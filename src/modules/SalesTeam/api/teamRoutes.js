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
  const client = await pool.connect();
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const hasAccess = await teamRepo.hasHRAccess(userId, client);
    if (!hasAccess) {
      return res.status(403).send('<h1>Access Denied - HR only</h1>');
    }
    res.sendFile(path.join(__dirname, '../../../../public/templates/sales_team_management.html'));
  } finally {
    client.release();
  }
});

// API: Get all teams with members
router.get('/api/teams', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId || req.user.bubbleId;
    if (!await teamRepo.hasHRAccess(userId, client)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    
    const teams = await teamRepo.getTeamsWithMembers(client);
    const unassigned = await teamRepo.getUsersWithoutTeam(client);
    
    res.json({ success: true, data: { teams, unassigned } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// API: Assign user to team
router.post('/api/teams/assign', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId || req.user.bubbleId;
    if (!await teamRepo.hasHRAccess(userId, client)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    
    const { targetUserId, teamTag } = req.body;
    await teamRepo.assignUserToTeam(targetUserId, teamTag, client);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// API: Remove user from team
router.post('/api/teams/remove', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId || req.user.bubbleId;
    if (!await teamRepo.hasHRAccess(userId, client)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    
    const { targetUserId } = req.body;
    await teamRepo.removeUserFromTeam(targetUserId, client);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
