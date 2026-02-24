/**
 * Activity Report Routes
 * API endpoints for agent daily activity reporting
 */
const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const activityRepo = require('../services/activityRepo');
const customerRepo = require('../../Customer/services/customerRepo');

const router = express.Router();

/**
 * Restrict route to users with "kc" access level.
 */
async function requireKcAccess(req, res, next) {
  let client = null;
  const isApiRoute = req.originalUrl.startsWith('/api/');
  try {
    const userId = req.user.userId || req.user.id || req.user.bubbleId || req.user.bubble_id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Invalid session data' });
    }

    client = await pool.connect();
    const result = await client.query(
      `SELECT access_level
       FROM "user"
       WHERE id::text = $1 OR bubble_id = $1
       LIMIT 1`,
      [String(userId)]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }

    const accessLevel = result.rows[0].access_level || [];
    if (!Array.isArray(accessLevel) || !accessLevel.includes('kc')) {
      if (isApiRoute) {
        return res.status(403).json({ success: false, error: 'KC access required' });
      }
      return res.redirect('/agent/home');
    }

    next();
  } catch (err) {
    console.error('KC access check error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
}

// ==================== PAGE ROUTES ====================

/**
 * GET /sales-kpi
 * Activity Report Review
 */
router.get('/sales-kpi', requireAuth, requireKcAccess, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../../public/templates/sales_kpi.html'));
});

/**
 * GET /activity-report
 * Agent's own activity report page
 */
router.get('/activity-report', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../../public/templates/activity_report.html'));
});

/**
 * GET /activity-review
 * Manager review dashboard page
 */
router.get('/activity-review', requireAuth, requireKcAccess, (req, res) => {
  return res.redirect('/sales-kpi');
});

// ==================== API ROUTES ====================

/**
 * GET /api/activity/config
 * Get activity types and points configuration
 */
router.get('/api/activity/config', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      activityTypes: Object.entries(activityRepo.ACTIVITY_POINTS).map(([type, points]) => ({
        type,
        points
      })),
      followUpSubtypes: activityRepo.FOLLOW_UP_SUBTYPES
    }
  });
});

/**
 * GET /api/activity/my-reports
 * Get current agent's activity reports
 */
router.get('/api/activity/my-reports', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const { limit, offset, startDate, endDate, activityType } = req.query;

    // Get agent's bubble_id AND user's bubble_id to support legacy data
    client = await pool.connect();
    const agentResult = await client.query(
      `SELECT bubble_id, linked_agent_profile FROM "user" 
       WHERE id::text = $1 OR bubble_id = $1 
       LIMIT 1`,
      [String(userId)]
    );

    if (agentResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }

    const { bubble_id, linked_agent_profile } = agentResult.rows[0];
    // Create array of valid identifiers
    const identifiers = [bubble_id, linked_agent_profile].filter(Boolean);

    if (identifiers.length === 0) {
      return res.status(403).json({ success: false, error: 'No valid agent profile or user ID found' });
    }

    const result = await activityRepo.getActivitiesByAgent(client, identifiers, {
      limit, offset, startDate, endDate, activityType
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error fetching activities:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/activity/:id
 * Get single activity by ID
 */
router.get('/api/activity/:id', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const { id } = req.params;

    client = await pool.connect();
    const agentResult = await client.query(
      `SELECT bubble_id, linked_agent_profile FROM "user" 
       WHERE id::text = $1 OR bubble_id = $1 
       LIMIT 1`,
      [String(userId)]
    );

    if (agentResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }

    const { bubble_id, linked_agent_profile } = agentResult.rows[0];
    const identifiers = [bubble_id, linked_agent_profile].filter(Boolean);

    if (identifiers.length === 0) {
      return res.status(403).json({ success: false, error: 'No valid agent profile or user ID found' });
    }

    const activity = await activityRepo.getActivityById(client, id, identifiers);

    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    res.json({ success: true, data: activity });
  } catch (err) {
    console.error('Error fetching activity:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/activity/submit
 * Submit new activity report
 */
router.post('/api/activity/submit', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const { activityType, followUpSubtype, remark, linkedCustomer, reportDate, activityDate, tags } = req.body;

    if (!activityType) {
      return res.status(400).json({ success: false, error: 'Activity type is required' });
    }

    // Validate follow-up subtype
    if (activityType === 'Follow-up' && !followUpSubtype) {
      return res.status(400).json({
        success: false,
        error: 'Follow-up subtype is required for Follow-up activities'
      });
    }

    client = await pool.connect();

    // Get agent's bubble_id
    const agentResult = await client.query(
      `SELECT linked_agent_profile FROM "user" 
       WHERE id::text = $1 OR bubble_id = $1 
       LIMIT 1`,
      [String(userId)]
    );

    if (agentResult.rows.length === 0 || !agentResult.rows[0].linked_agent_profile) {
      return res.status(403).json({ success: false, error: 'No agent profile linked' });
    }

    const agentBubbleId = agentResult.rows[0].linked_agent_profile;

    const activity = await activityRepo.createActivity(client, {
      agentBubbleId,
      activityType,
      followUpSubtype,
      remark,
      linkedCustomer,
      reportDate: reportDate ? new Date(reportDate) : (activityDate ? new Date(activityDate) : new Date()),
      tags
    });

    res.status(201).json({
      success: true,
      data: activity,
      message: `Activity submitted! Points earned: ${activity.report_point}`
    });
  } catch (err) {
    console.error('Error creating activity:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * PUT /api/activity/:id
 * Update activity report
 */
router.put('/api/activity/:id', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const { id } = req.params;
    const { activityType, followUpSubtype, remark, linkedCustomer, reportDate, tags } = req.body;

    client = await pool.connect();

    // Get identifiers
    const agentResult = await client.query(
      `SELECT bubble_id, linked_agent_profile FROM "user" 
       WHERE id::text = $1 OR bubble_id = $1 
       LIMIT 1`,
      [String(userId)]
    );

    if (agentResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }

    const { bubble_id, linked_agent_profile } = agentResult.rows[0];
    const identifiers = [bubble_id, linked_agent_profile].filter(Boolean);

    if (identifiers.length === 0) {
      return res.status(403).json({ success: false, error: 'No valid agent profile or user ID found' });
    }

    const activity = await activityRepo.updateActivity(client, id, {
      activityType,
      followUpSubtype,
      remark,
      linkedCustomer,
      reportDate: reportDate ? new Date(reportDate) : undefined,
      tags
    }, identifiers);

    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found or permission denied' });
    }

    res.json({
      success: true,
      data: activity,
      message: 'Activity updated successfully'
    });
  } catch (err) {
    console.error('Error updating activity:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * DELETE /api/activity/:id
 * Delete activity report
 */
router.delete('/api/activity/:id', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const { id } = req.params;

    client = await pool.connect();

    // Get identifiers
    const agentResult = await client.query(
      `SELECT bubble_id, linked_agent_profile FROM "user" 
       WHERE id::text = $1 OR bubble_id = $1 
       LIMIT 1`,
      [String(userId)]
    );

    if (agentResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }

    const { bubble_id, linked_agent_profile } = agentResult.rows[0];
    const identifiers = [bubble_id, linked_agent_profile].filter(Boolean);

    if (identifiers.length === 0) {
      return res.status(403).json({ success: false, error: 'No valid agent profile or user ID found' });
    }

    const deleted = await activityRepo.deleteActivity(client, id, identifiers);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Activity not found or permission denied' });
    }

    res.json({ success: true, message: 'Activity deleted successfully' });
  } catch (err) {
    console.error('Error deleting activity:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/activity/stats/daily
 * Get daily stats for current agent
 */
router.get('/api/activity/stats/daily', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    client = await pool.connect();

    const agentResult = await client.query(
      `SELECT bubble_id, linked_agent_profile FROM "user" 
       WHERE id::text = $1 OR bubble_id = $1 
       LIMIT 1`,
      [String(userId)]
    );

    if (agentResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }

    const { bubble_id, linked_agent_profile } = agentResult.rows[0];
    const identifiers = [bubble_id, linked_agent_profile].filter(Boolean);

    if (identifiers.length === 0) {
      return res.status(403).json({ success: false, error: 'No valid agent profile or user ID found' });
    }

    const stats = await activityRepo.getDailyStats(client, identifiers, targetDate);

    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Error fetching daily stats:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/activity/stats/weekly
 * Get weekly stats for current agent
 */
router.get('/api/activity/stats/weekly', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId || req.user.bubbleId;
    const { weekStart, weekEnd } = req.query;

    // Default to current week if not provided
    const today = new Date();
    const dayOfWeek = today.getDay();
    const defaultWeekStart = new Date(today);
    defaultWeekStart.setDate(today.getDate() - dayOfWeek);
    const defaultWeekEnd = new Date(defaultWeekStart);
    defaultWeekEnd.setDate(defaultWeekStart.getDate() + 6);

    const startDate = weekStart || defaultWeekStart.toISOString().split('T')[0];
    const endDate = weekEnd || defaultWeekEnd.toISOString().split('T')[0];

    client = await pool.connect();

    const agentResult = await client.query(
      `SELECT bubble_id, linked_agent_profile FROM "user" 
       WHERE id::text = $1 OR bubble_id = $1 
       LIMIT 1`,
      [String(userId)]
    );

    if (agentResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }

    const { bubble_id, linked_agent_profile } = agentResult.rows[0];
    const identifiers = [bubble_id, linked_agent_profile].filter(Boolean);

    if (identifiers.length === 0) {
      return res.status(403).json({ success: false, error: 'No valid agent profile or user ID found' });
    }

    const stats = await activityRepo.getWeeklyStats(client, identifiers, startDate, endDate);

    res.json({ success: true, data: { ...stats, weekStart: startDate, weekEnd: endDate } });
  } catch (err) {
    console.error('Error fetching weekly stats:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/activity/team-stats
 * Get team statistics (Manager view)
 */
router.get('/api/activity/team-stats', requireAuth, requireKcAccess, async (req, res) => {
  let client = null;
  try {
    const { startDate, endDate, teamTag, agentId, activityType } = req.query;

    client = await pool.connect();
    const stats = await activityRepo.getTeamStats(client, {
      startDate, endDate, teamTag, agentId, activityType
    });

    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Error fetching team stats:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/activity/all-reports
 * Get all activities for manager review
 */
router.get('/api/activity/all-reports', requireAuth, requireKcAccess, async (req, res) => {
  let client = null;
  try {
    const { limit, offset, startDate, endDate, agentId, activityType } = req.query;

    client = await pool.connect();
    const result = await activityRepo.getAllActivitiesForReview(client, {
      limit, offset, startDate, endDate, agentId, activityType
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error fetching all reports:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * PUT /api/activity/:id/review-comment
 * Save manager review comment
 */
router.put('/api/activity/:id/review-comment', requireAuth, requireKcAccess, async (req, res) => {
  let client = null;
  try {
    const id = parseInt(req.params.id, 10);
    const { reviewComment } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid activity ID' });
    }

    client = await pool.connect();
    const updated = await activityRepo.updateReviewComment(client, id, reviewComment);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    res.json({
      success: true,
      data: updated,
      message: 'Review comment saved'
    });
  } catch (err) {
    console.error('Error saving review comment:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/activity/agents
 * Get list of all agents for manager filter
 */
router.get('/api/activity/agents', requireAuth, requireKcAccess, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const result = await client.query(
      `
      SELECT bubble_id, name
      FROM (
        SELECT DISTINCT
          u.bubble_id,
          COALESCE(NULLIF(BTRIM(u.name), ''), NULLIF(BTRIM(a.name), ''), u.bubble_id) AS name
        FROM "user" u
        LEFT JOIN agent a ON a.bubble_id = u.linked_agent_profile
        WHERE EXISTS (
          SELECT 1
          FROM agent_daily_report dr
          WHERE dr.linked_user = u.bubble_id OR dr.created_by = u.bubble_id
        )

        UNION

        SELECT DISTINCT
          a.bubble_id,
          COALESCE(NULLIF(BTRIM(a.name), ''), a.bubble_id) AS name
        FROM agent a
        WHERE EXISTS (
          SELECT 1
          FROM agent_daily_report dr
          WHERE dr.linked_user = a.bubble_id OR dr.created_by = a.bubble_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "user" u
          WHERE u.bubble_id = a.bubble_id
        )
      ) agent_list
      ORDER BY name
      `
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching agents:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/kpi/overview
 * Get activity report review overview data
 */
router.get('/api/kpi/overview', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { startDate, endDate } = req.query;

    client = await pool.connect();

    const [agentRanking, activityBreakdown, leadSourceStats] = await Promise.all([
      activityRepo.getAgentPerformanceRanking(client, { startDate, endDate }),
      activityRepo.getActivityTypeBreakdown(client, { startDate, endDate }),
      customerRepo.getLeadSourceStatistics(client, { startDate, endDate })
    ]);

    res.json({
      success: true,
      data: {
        agentRanking,
        activityBreakdown,
        leadSourceStats
      }
    });

  } catch (err) {
    console.error('Error fetching activity review overview:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/kpi/agent-activities
 * Get one agent's activity rows for date-range drill-down
 */
router.get('/api/kpi/agent-activities', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { agentId, startDate, endDate, limit } = req.query;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    client = await pool.connect();
    const activities = await activityRepo.getAgentActivitiesForDetail(client, {
      agentId, startDate, endDate, limit
    });

    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('Error fetching agent activities drill-down:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
