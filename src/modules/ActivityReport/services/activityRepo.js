/**
 * Activity Report Repository
 * Handles database operations for agent daily activity reports
 */
const crypto = require('crypto');

// Activity type to points mapping
const ACTIVITY_POINTS = {
  'New Lead': 10,
  'New Contact (Lead)': 10,
  'Open Case': 20,
  'Follow-up': 10,
  'Site Visit': 30,
  'Roadshow': 10,
  'Others': 10,
  'Close Case': 50
};

// Follow-up subtypes
const FOLLOW_UP_SUBTYPES = [
  'Customer Service',
  'Collect Premium',
  'After Sales Service',
  'Technical Support',
  'Documentation',
  'Other'
];

/**
 * Generate unique bubble_id
 */
function generateBubbleId() {
  return `${Date.now()}x${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Get points for activity type
 * @param {string} activityType 
 * @returns {number}
 */
function getPointsForActivity(activityType) {
  return ACTIVITY_POINTS[activityType] || 10;
}

/**
 * Get activities by agent (linked_user)
 * @param {object} client - Database client or pool
 * @param {string} agentBubbleId - Agent's bubble_id
 * @param {object} options - { limit, offset, startDate, endDate, activityType }
 */
async function getActivitiesByAgent(client, agentBubbleId, options = {}) {
  const limit = parseInt(options.limit) || 50;
  const offset = parseInt(options.offset) || 0;
  const { startDate, endDate, activityType } = options;

  let query = `
    SELECT * FROM agent_daily_report 
    WHERE (linked_user = $1 OR created_by = $1)
  `;
  const params = [agentBubbleId];
  let paramCount = 1;

  if (startDate) {
    paramCount++;
    query += ` AND report_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND report_date <= $${paramCount}`;
    params.push(endDate);
  }

  if (activityType) {
    paramCount++;
    query += ` AND activity_type = $${paramCount}`;
    params.push(activityType);
  }

  query += ` ORDER BY report_date DESC, created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limit, offset);

  const result = await client.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total FROM agent_daily_report 
    WHERE (linked_user = $1 OR created_by = $1)
  `;
  const countParams = [agentBubbleId];
  let countParamCount = 1;

  if (startDate) {
    countParamCount++;
    countQuery += ` AND report_date >= $${countParamCount}`;
    countParams.push(startDate);
  }

  if (endDate) {
    countParamCount++;
    countQuery += ` AND report_date <= $${countParamCount}`;
    countParams.push(endDate);
  }

  if (activityType) {
    countParamCount++;
    countQuery += ` AND activity_type = $${countParamCount}`;
    countParams.push(activityType);
  }

  const countResult = await client.query(countQuery, countParams);

  return {
    activities: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset
  };
}

/**
 * Get single activity by ID
 * @param {object} client 
 * @param {number} id 
 * @param {string} agentBubbleId - For ownership verification
 */
async function getActivityById(client, id, agentBubbleId) {
  const result = await client.query(
    `SELECT * FROM agent_daily_report 
     WHERE id = $1 AND (linked_user = $2 OR created_by = $2)`,
    [id, agentBubbleId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Create new activity report
 * @param {object} client 
 * @param {object} data - Activity data
 */
async function createActivity(client, data) {
  const {
    agentBubbleId,
    activityType,
    followUpSubtype,
    remark,
    linkedCustomer,
    reportDate,
    tags
  } = data;

  const bubbleId = generateBubbleId();
  const points = getPointsForActivity(activityType);

  const result = await client.query(
    `INSERT INTO agent_daily_report (
      bubble_id, linked_user, created_by, activity_type, follow_up_subtype,
      remark, linked_customer, report_date, report_point, tag, 
      created_at, updated_at, created_date, report_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW(), $8)
    RETURNING *`,
    [
      bubbleId,
      agentBubbleId,
      agentBubbleId,
      activityType,
      followUpSubtype || null,
      remark || null,
      linkedCustomer || null,
      reportDate || new Date(),
      points,
      tags || null
    ]
  );

  return result.rows[0];
}

/**
 * Update activity report
 * @param {object} client 
 * @param {number} id 
 * @param {object} data 
 * @param {string} agentBubbleId - For ownership verification
 */
async function updateActivity(client, id, data, agentBubbleId) {
  const { activityType, followUpSubtype, remark, linkedCustomer, reportDate, tags } = data;

  // Recalculate points if activity type changed
  const points = activityType ? getPointsForActivity(activityType) : undefined;

  const result = await client.query(
    `UPDATE agent_daily_report SET
      activity_type = COALESCE($1, activity_type),
      follow_up_subtype = COALESCE($2, follow_up_subtype),
      remark = COALESCE($3, remark),
      linked_customer = COALESCE($4, linked_customer),
      report_date = COALESCE($5, report_date),
      tag = COALESCE($6, tag),
      report_point = COALESCE($7, report_point),
      updated_at = NOW()
    WHERE id = $8 AND (linked_user = $9 OR created_by = $9)
    RETURNING *`,
    [
      activityType || null,
      followUpSubtype !== undefined ? followUpSubtype : null,
      remark !== undefined ? remark : null,
      linkedCustomer !== undefined ? linkedCustomer : null,
      reportDate || null,
      tags || null,
      points,
      id,
      agentBubbleId
    ]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Delete activity report
 * @param {object} client 
 * @param {number} id 
 * @param {string} agentBubbleId 
 */
async function deleteActivity(client, id, agentBubbleId) {
  const result = await client.query(
    `DELETE FROM agent_daily_report 
     WHERE id = $1 AND (linked_user = $2 OR created_by = $2)
     RETURNING id`,
    [id, agentBubbleId]
  );
  return result.rows.length > 0;
}

/**
 * Get daily stats for an agent
 * @param {object} client 
 * @param {string} agentBubbleId 
 * @param {string} date - YYYY-MM-DD format
 */
async function getDailyStats(client, agentBubbleId, date) {
  const result = await client.query(
    `SELECT 
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points,
      activity_type,
      COUNT(*) as count
    FROM agent_daily_report 
    WHERE (linked_user = $1 OR created_by = $1)
      AND DATE(report_date) = $2
    GROUP BY activity_type
    ORDER BY activity_type`,
    [agentBubbleId, date]
  );

  // Get overall summary
  const summaryResult = await client.query(
    `SELECT 
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points
    FROM agent_daily_report 
    WHERE (linked_user = $1 OR created_by = $1)
      AND DATE(report_date) = $2`,
    [agentBubbleId, date]
  );

  return {
    breakdown: result.rows,
    summary: summaryResult.rows[0]
  };
}

/**
 * Get weekly stats for an agent
 * @param {object} client 
 * @param {string} agentBubbleId 
 * @param {string} weekStart - Start date of week (YYYY-MM-DD)
 * @param {string} weekEnd - End date of week (YYYY-MM-DD)
 */
async function getWeeklyStats(client, agentBubbleId, weekStart, weekEnd) {
  const result = await client.query(
    `SELECT 
      DATE(report_date) as date,
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points
    FROM agent_daily_report 
    WHERE (linked_user = $1 OR created_by = $1)
      AND DATE(report_date) >= $2 
      AND DATE(report_date) <= $3
    GROUP BY DATE(report_date)
    ORDER BY date`,
    [agentBubbleId, weekStart, weekEnd]
  );

  // Get weekly summary
  const summaryResult = await client.query(
    `SELECT 
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points
    FROM agent_daily_report 
    WHERE (linked_user = $1 OR created_by = $1)
      AND DATE(report_date) >= $2 
      AND DATE(report_date) <= $3`,
    [agentBubbleId, weekStart, weekEnd]
  );

  return {
    dailyBreakdown: result.rows,
    summary: summaryResult.rows[0]
  };
}

/**
 * Get team stats for manager view
 * @param {object} client 
 * @param {object} options - { startDate, endDate, teamTag }
 */
async function getTeamStats(client, options = {}) {
  const { startDate, endDate, teamTag } = options;

  let query = `
    SELECT 
      a.bubble_id,
      a.name as agent_name,
      COUNT(dr.id) as total_activities,
      COALESCE(SUM(dr.report_point), 0) as total_points
    FROM agent a
    LEFT JOIN agent_daily_report dr ON (a.bubble_id = dr.linked_user OR a.bubble_id = dr.created_by)
  `;
  
  const params = [];
  let whereConditions = [];

  if (startDate && endDate) {
    params.push(startDate, endDate);
    whereConditions.push(`DATE(dr.report_date) >= $${params.length - 1} AND DATE(dr.report_date) <= $${params.length}`);
  }

  if (teamTag) {
    params.push(`%${teamTag}%`);
    whereConditions.push(`dr.tag::text LIKE $${params.length}`);
  }

  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  query += `
    GROUP BY a.bubble_id, a.name
    ORDER BY total_points DESC
  `;

  const result = await client.query(query, params);
  return result.rows;
}

/**
 * Get all activities for manager review
 * @param {object} client 
 * @param {object} options - { limit, offset, startDate, endDate, agentId, activityType }
 */
async function getAllActivitiesForReview(client, options = {}) {
  const limit = parseInt(options.limit) || 100;
  const offset = parseInt(options.offset) || 0;
  const { startDate, endDate, agentId, activityType } = options;

  let query = `
    SELECT 
      dr.*,
      a.name as agent_name,
      c.name as customer_name
    FROM agent_daily_report dr
    LEFT JOIN agent a ON (dr.linked_user = a.bubble_id OR dr.created_by = a.bubble_id)
    LEFT JOIN customer c ON dr.linked_customer = c.customer_id
    WHERE 1=1
  `;
  
  const params = [];
  let paramCount = 0;

  if (startDate) {
    paramCount++;
    query += ` AND DATE(dr.report_date) >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND DATE(dr.report_date) <= $${paramCount}`;
    params.push(endDate);
  }

  if (agentId) {
    paramCount++;
    query += ` AND (dr.linked_user = $${paramCount} OR dr.created_by = $${paramCount})`;
    params.push(agentId);
  }

  if (activityType) {
    paramCount++;
    query += ` AND dr.activity_type = $${paramCount}`;
    params.push(activityType);
  }

  query += ` ORDER BY dr.report_date DESC, dr.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limit, offset);

  const result = await client.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total 
    FROM agent_daily_report dr
    WHERE 1=1
  `;
  const countParams = [];
  let countParamCount = 0;

  if (startDate) {
    countParamCount++;
    countQuery += ` AND DATE(dr.report_date) >= $${countParamCount}`;
    countParams.push(startDate);
  }

  if (endDate) {
    countParamCount++;
    countQuery += ` AND DATE(dr.report_date) <= $${countParamCount}`;
    countParams.push(endDate);
  }

  if (agentId) {
    countParamCount++;
    countQuery += ` AND (dr.linked_user = $${countParamCount} OR dr.created_by = $${countParamCount})`;
    countParams.push(agentId);
  }

  if (activityType) {
    countParamCount++;
    countQuery += ` AND dr.activity_type = $${countParamCount}`;
    countParams.push(activityType);
  }

  const countResult = await client.query(countQuery, countParams);

  return {
    activities: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset
  };
}

module.exports = {
  ACTIVITY_POINTS,
  FOLLOW_UP_SUBTYPES,
  getPointsForActivity,
  getActivitiesByAgent,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  getDailyStats,
  getWeeklyStats,
  getTeamStats,
  getAllActivitiesForReview
};
