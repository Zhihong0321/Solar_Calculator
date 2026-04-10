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
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../../core/auth/userIdentity');

const router = express.Router();

function formatDateOnly(date) {
  return date.toISOString().split('T')[0];
}

function getLastWeekRange(baseDate = new Date()) {
  const today = new Date(baseDate);
  const currentDay = today.getDay();
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

  const currentWeekStart = new Date(today);
  currentWeekStart.setHours(0, 0, 0, 0);
  currentWeekStart.setDate(today.getDate() + mondayOffset);

  const lastWeekStart = new Date(currentWeekStart);
  lastWeekStart.setDate(currentWeekStart.getDate() - 7);

  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekStart.getDate() + 6);

  return {
    startDate: formatDateOnly(lastWeekStart),
    endDate: formatDateOnly(lastWeekEnd)
  };
}

function getCurrentMonthRange(baseDate = new Date()) {
  const today = new Date(baseDate);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return {
    startDate: formatDateOnly(monthStart),
    endDate: formatDateOnly(monthEnd)
  };
}

async function resolveAgentIdentifiers(client, actorId) {
  const normalized = String(actorId);
  const identifiers = new Set();

  // 1. Try to resolve as a USER first to avoid ambiguous integer collisions between user.id and agent.id
  const userResult = await client.query(
    `SELECT a.id::text AS agent_id,
            a.bubble_id AS agent_bubble_id,
            u.bubble_id AS user_bubble_id,
            u.linked_agent_profile
     FROM "user" u
     LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR u.bubble_id = a.linked_user_login)
     WHERE u.id::text = $1 OR u.bubble_id = $1`,
    [normalized]
  );

  if (userResult.rows.length > 0) {
    userResult.rows.forEach((row) => {
      [row.agent_id, row.agent_bubble_id, row.user_bubble_id, row.linked_agent_profile]
        .filter(Boolean)
        .forEach((v) => identifiers.add(String(v)));
    });
  } else {
    // 2. If no user found, try resolving as an AGENT directly
    const agentResult = await client.query(
      `SELECT a.id::text AS agent_id,
              a.bubble_id AS agent_bubble_id,
              a.linked_user_login AS user_bubble_id
       FROM agent a
       WHERE a.id::text = $1 OR a.bubble_id = $1`,
      [normalized]
    );
    agentResult.rows.forEach((row) => {
      [row.agent_id, row.agent_bubble_id, row.user_bubble_id]
        .filter(Boolean)
        .forEach((v) => identifiers.add(String(v)));
    });
  }

  return Array.from(identifiers);
}

// ==================== PAGE ROUTES ====================

/**
 * GET /sales-kpi
 * Sales Manager KPI Overview
 */
router.get('/sales-kpi', requireAuth, (req, res) => {
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
router.get('/activity-review', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../../public/templates/activity_review.html'));
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
      followUpSubtypes: activityRepo.FOLLOW_UP_SUBTYPES,
      timeOfDaySlots: activityRepo.TIME_OF_DAY_SLOTS
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const { limit, offset, startDate, endDate, activityType } = req.query;

    // Get agent's bubble_id from linked_agent_profile
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
 * GET /api/activity/agent-reports
 * Get a selected agent's activity reports for manager drilldown
 */
router.get('/api/activity/agent-reports', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { agentId, limit, offset, startDate, endDate, activityType } = req.query;

    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    client = await pool.connect();

    const agentResult = await client.query(
      `SELECT DISTINCT bubble_id, linked_agent_profile
       FROM "user"
       WHERE bubble_id = $1
          OR linked_agent_profile = $1`,
      [String(agentId)]
    );

    const identifiers = new Set([String(agentId)]);
    agentResult.rows.forEach(({ bubble_id, linked_agent_profile }) => {
      if (bubble_id) identifiers.add(bubble_id);
      if (linked_agent_profile) identifiers.add(linked_agent_profile);
    });

    const result = await activityRepo.getActivitiesByAgent(client, Array.from(identifiers), {
      limit, offset, startDate, endDate, activityType
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error fetching selected agent reports:', err);
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const {
      activityType,
      followUpSubtype,
      remark,
      linkedCustomer,
      reportDate,
      activityDate,
      timeOfDay,
      tags
    } = req.body;

    if (!activityType) {
      return res.status(400).json({ success: false, error: 'Activity type is required' });
    }

    if (!timeOfDay) {
      return res.status(400).json({ success: false, error: 'Time of day is required' });
    }

    if (!activityRepo.isValidTimeOfDaySlot(timeOfDay)) {
      return res.status(400).json({ success: false, error: 'Invalid time of day selection' });
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
      reportDate: (reportDate || activityDate) ? new Date(reportDate || activityDate) : new Date(),
      timeOfDay,
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const { id } = req.params;
    const {
      activityType,
      followUpSubtype,
      remark,
      linkedCustomer,
      reportDate,
      activityDate,
      timeOfDay,
      tags
    } = req.body;

    if (timeOfDay !== undefined && timeOfDay !== null && timeOfDay !== '' && !activityRepo.isValidTimeOfDaySlot(timeOfDay)) {
      return res.status(400).json({ success: false, error: 'Invalid time of day selection' });
    }

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
      reportDate: (reportDate || activityDate) ? new Date(reportDate || activityDate) : undefined,
      timeOfDay: timeOfDay !== undefined && timeOfDay !== '' ? timeOfDay : undefined,
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
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
 * GET /api/activity/focus/weekly
 * Get last-week focus summary for current agent or manager-selected agent.
 */
router.get('/api/activity/focus/weekly', requireAuth, async (req, res) => {
  let client = null;
  try {
    const fallbackActorId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const requestedAgentId = req.query.agentId;
    const actorId = requestedAgentId || fallbackActorId;
    const { weekStart, weekEnd } = req.query;

    client = await pool.connect();

    const identifiers = await resolveAgentIdentifiers(client, actorId);
    if (identifiers.length === 0) {
      return res.status(403).json({ success: false, error: 'No valid user or agent identifiers found' });
    }

    const defaultRange = getLastWeekRange();
    const startDate = weekStart || defaultRange.startDate;
    const endDate = weekEnd || defaultRange.endDate;
    const currentMonthRange = getCurrentMonthRange();
    const focus = await activityRepo.getWeeklyFocus(
      client,
      identifiers,
      startDate,
      endDate,
      currentMonthRange.startDate,
      currentMonthRange.endDate
    );

    res.json({
      success: true,
      data: {
        ...focus,
        weekStart: startDate,
        weekEnd: endDate,
        identifiers
      }
    });
  } catch (err) {
    console.error('Error fetching weekly focus:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/activity/team-stats
 * Get team statistics (Manager view)
 */
router.get('/api/activity/team-stats', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { startDate, endDate, teamTag } = req.query;

    client = await pool.connect();
    const stats = await activityRepo.getTeamStats(client, { startDate, endDate, teamTag });

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
router.get('/api/activity/all-reports', requireAuth, async (req, res) => {
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
 * GET /api/activity/agents
 * Get list of all agents for manager filter
 */
router.get('/api/activity/agents', requireAuth, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT DISTINCT
         a.bubble_id,
         a.name
       FROM "user" u
       JOIN agent a
         ON (u.linked_agent_profile = a.bubble_id OR u.bubble_id = a.bubble_id)
       WHERE a.name IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM unnest(COALESCE(u.access_level, ARRAY[]::text[])) AS access_tag
           WHERE LOWER(access_tag) = 'sales'
         )
         AND EXISTS (
           SELECT 1
           FROM unnest(COALESCE(u.access_level, ARRAY[]::text[])) AS access_tag
           WHERE LOWER(access_tag) LIKE 'team-%'
         )
       ORDER BY a.name`
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
 * Get Sales KPI overview data
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
    console.error('Error fetching KPI overview:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
