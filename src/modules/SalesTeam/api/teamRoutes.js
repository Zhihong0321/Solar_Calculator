/**
 * Sales Team Management Routes
 * API endpoints for HR to manage sales teams
 */
const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const teamRepo = require('../services/teamRepo');

const router = express.Router();

// ==================== PAGE ROUTES ====================

/**
 * GET /sales-team-management
 * Sales Team Management page (HR only)
 */
router.get('/sales-team-management', requireAuth, async (req, res) => {
  // Check HR access
  const client = await pool.connect();
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const hasAccess = await teamRepo.hasHRAccess(userId, client);
    
    if (!hasAccess) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Access Denied</title>
        <script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-100 min-h-screen flex items-center justify-center">
          <div class="text-center">
            <h1 class="text-2xl font-bold text-red-600">Access Denied</h1>
            <p class="text-gray-600 mt-2">You need HR access to view this page.</p>
            <a href="/agent/home" class="mt-4 inline-block text-blue-600 hover:underline">Return to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    }
    
    res.sendFile(path.join(__dirname, '../../../../public/templates/sales_team_management.html'));
  } finally {
    client.release();
  }
});

// ==================== API ROUTES ====================

/**
 * Middleware to check HR access for API routes
 */
const requireHRAccess = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const hasAccess = await teamRepo.hasHRAccess(userId, client);
    
    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'HR access required' 
      });
    }
    
    next();
  } finally {
    client.release();
  }
};

/**
 * GET /api/sales-team/all-personnel
 * Get all users with their team assignments
 */
router.get('/api/sales-team/all-personnel', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const personnel = await teamRepo.getAllPersonnel(client);
    
    res.json({ 
      success: true, 
      data: personnel 
    });
  } catch (err) {
    console.error('Error fetching personnel:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/sales-team/teams
 * Get all teams (unique team-* tags)
 */
router.get('/api/sales-team/teams', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const teams = await teamRepo.getAllTeams(client);
    
    // Get stats for each team
    const teamsWithStats = await Promise.all(
      teams.map(async (teamTag) => {
        const stats = await teamRepo.getTeamStats(teamTag, client);
        return {
          teamTag,
          displayName: formatTeamName(teamTag),
          ...stats
        };
      })
    );
    
    res.json({ 
      success: true, 
      data: teamsWithStats 
    });
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/sales-team/unassigned
 * Get users without team assignment
 */
router.get('/api/sales-team/unassigned', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const unassigned = await teamRepo.getUnassignedPersonnel(client);
    
    res.json({ 
      success: true, 
      data: unassigned 
    });
  } catch (err) {
    console.error('Error fetching unassigned personnel:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/sales-team/team/:teamTag
 * Get members of a specific team
 */
router.get('/api/sales-team/team/:teamTag', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const { teamTag } = req.params;
    const members = await teamRepo.getTeamMembers(teamTag, client);
    
    res.json({ 
      success: true, 
      data: {
        teamTag,
        displayName: formatTeamName(teamTag),
        members
      }
    });
  } catch (err) {
    console.error('Error fetching team members:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/sales-team/create
 * Create a new team
 */
router.post('/api/sales-team/create', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const { teamName } = req.body;
    
    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Team name is required' 
      });
    }
    
    // Convert to team tag format
    const teamTag = 'team-' + teamName.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const result = await teamRepo.createTeam(teamTag, client);
    
    res.json({ 
      success: true, 
      data: result,
      message: `Team "${teamName}" created successfully`
    });
  } catch (err) {
    console.error('Error creating team:', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/sales-team/assign
 * Assign a user to a team
 */
router.post('/api/sales-team/assign', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const { userId, teamTag } = req.body;
    
    if (!userId || !teamTag) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID and team tag are required' 
      });
    }
    
    const result = await teamRepo.assignToTeam(userId, teamTag, client);
    
    res.json({ 
      success: true, 
      data: result,
      message: 'User assigned to team successfully'
    });
  } catch (err) {
    console.error('Error assigning to team:', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/sales-team/remove
 * Remove a user from their team
 */
router.post('/api/sales-team/remove', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }
    
    const result = await teamRepo.removeFromTeam(userId, client);
    
    res.json({ 
      success: true, 
      data: result,
      message: 'User removed from team successfully'
    });
  } catch (err) {
    console.error('Error removing from team:', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/sales-team/move
 * Move a user from one team to another
 */
router.post('/api/sales-team/move', requireAuth, requireHRAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const { userId, newTeamTag } = req.body;
    
    if (!userId || !newTeamTag) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID and new team tag are required' 
      });
    }
    
    const result = await teamRepo.moveUserToTeam(userId, newTeamTag, client);
    
    res.json({ 
      success: true, 
      data: result,
      message: 'User moved to new team successfully'
    });
  } catch (err) {
    console.error('Error moving user:', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * Helper function to format team tag to display name
 */
function formatTeamName(teamTag) {
  if (!teamTag) return 'Unknown';
  return teamTag
    .replace(/^team-/i, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = router;
