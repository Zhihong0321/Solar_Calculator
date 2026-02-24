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

let reviewCommentColumnReady = false;

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
 * LATERAL join fragments to resolve report ownership across mixed IDs.
 * Newer/legacy rows may store user bubble_id or agent bubble_id.
 */
const USER_RESOLUTION_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      u.bubble_id AS user_bubble_id,
      u.name AS user_name,
      u.contact AS user_contact,
      u.profile_picture,
      u.linked_agent_profile
    FROM "user" u
    WHERE u.bubble_id IN (dr.linked_user, dr.created_by)
    ORDER BY CASE
      WHEN u.bubble_id = dr.linked_user THEN 0
      ELSE 1
    END
    LIMIT 1
  ) uo ON TRUE
`;

const AGENT_RESOLUTION_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      a.bubble_id AS agent_bubble_id,
      a.name AS agent_name,
      a.contact AS agent_contact
    FROM agent a
    WHERE a.bubble_id IN (dr.linked_user, dr.created_by, uo.linked_agent_profile)
    ORDER BY CASE
      WHEN uo.linked_agent_profile IS NOT NULL AND a.bubble_id = uo.linked_agent_profile THEN 0
      WHEN a.bubble_id = dr.linked_user THEN 1
      WHEN a.bubble_id = dr.created_by THEN 2
      ELSE 3
    END
    LIMIT 1
  ) ao ON TRUE
`;

function buildActorFilterClause(paramRef) {
  return `
    (
      dr.linked_user = ${paramRef}
      OR dr.created_by = ${paramRef}
      OR EXISTS (
        SELECT 1
        FROM "user" u_filter
        WHERE u_filter.bubble_id IN (dr.linked_user, dr.created_by)
          AND u_filter.linked_agent_profile = ${paramRef}
      )
    )
  `;
}

async function ensureReviewCommentColumn(client) {
  if (reviewCommentColumnReady) return;

  await client.query(`
    ALTER TABLE agent_daily_report
    ADD COLUMN IF NOT EXISTS review_comment text
  `);

  reviewCommentColumnReady = true;
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

  /*
   * Handle multiple identifiers (User bubble_id + Agent bubble_id)
   * to support legacy reports linked to user ID.
   */
  const identifiers = Array.isArray(agentBubbleId) ? agentBubbleId : [agentBubbleId];

  let query = `
    SELECT * FROM agent_daily_report 
    WHERE (linked_user = ANY($1) OR created_by = ANY($1))
  `;
  const params = [identifiers];
  let paramCount = 1;

  if (startDate) {
    paramCount++;
    query += ` AND DATE(report_date) >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND DATE(report_date) <= $${paramCount}`;
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
    WHERE (linked_user = ANY($1) OR created_by = ANY($1))
  `;
  const countParams = [identifiers];
  let countParamCount = 1;

  if (startDate) {
    countParamCount++;
    countQuery += ` AND DATE(report_date) >= $${countParamCount}`;
    countParams.push(startDate);
  }

  if (endDate) {
    countParamCount++;
    countQuery += ` AND DATE(report_date) <= $${countParamCount}`;
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
  const identifiers = Array.isArray(agentBubbleId) ? agentBubbleId : [agentBubbleId];

  const result = await client.query(
    `SELECT * FROM agent_daily_report 
     WHERE id = $1 AND (linked_user = ANY($2) OR created_by = ANY($2))`,
    [id, identifiers]
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
      created_at, updated_at, created_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW())
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

  const identifiers = Array.isArray(agentBubbleId) ? agentBubbleId : [agentBubbleId];

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
    WHERE id = $8 AND (linked_user = ANY($9) OR created_by = ANY($9))
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
      identifiers
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
  const identifiers = Array.isArray(agentBubbleId) ? agentBubbleId : [agentBubbleId];

  const result = await client.query(
    `DELETE FROM agent_daily_report 
     WHERE id = $1 AND (linked_user = ANY($2) OR created_by = ANY($2))
     RETURNING id`,
    [id, identifiers]
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
  const identifiers = Array.isArray(agentBubbleId) ? agentBubbleId : [agentBubbleId];

  const result = await client.query(
    `SELECT 
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points,
      activity_type,
      COUNT(*) as count
    FROM agent_daily_report 
    WHERE (linked_user = ANY($1) OR created_by = ANY($1))
      AND DATE(report_date) = $2
    GROUP BY activity_type
    ORDER BY activity_type`,
    [identifiers, date]
  );

  // Get overall summary
  const summaryResult = await client.query(
    `SELECT 
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points
    FROM agent_daily_report 
    WHERE (linked_user = ANY($1) OR created_by = ANY($1))
      AND DATE(report_date) = $2`,
    [identifiers, date]
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
  const identifiers = Array.isArray(agentBubbleId) ? agentBubbleId : [agentBubbleId];

  const result = await client.query(
    `SELECT 
      DATE(report_date) as date,
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points
    FROM agent_daily_report 
    WHERE (linked_user = ANY($1) OR created_by = ANY($1))
      AND DATE(report_date) >= $2 
      AND DATE(report_date) <= $3
    GROUP BY DATE(report_date)
    ORDER BY date`,
    [identifiers, weekStart, weekEnd]
  );

  // Get weekly summary
  const summaryResult = await client.query(
    `SELECT 
      COUNT(*) as total_activities,
      COALESCE(SUM(report_point), 0) as total_points
    FROM agent_daily_report 
    WHERE (linked_user = ANY($1) OR created_by = ANY($1))
      AND DATE(report_date) >= $2 
      AND DATE(report_date) <= $3`,
    [identifiers, weekStart, weekEnd]
  );

  return {
    dailyBreakdown: result.rows,
    summary: summaryResult.rows[0]
  };
}

/**
 * Get team stats for manager view
 * @param {object} client 
 * @param {object} options - { startDate, endDate, teamTag, agentId, activityType }
 */
async function getTeamStats(client, options = {}) {
  const { startDate, endDate, teamTag, agentId, activityType } = options;

  let query = `
    SELECT 
      COALESCE(uo.user_bubble_id, ao.agent_bubble_id, dr.linked_user, dr.created_by) AS bubble_id,
      COALESCE(
        NULLIF(BTRIM(uo.user_name), ''),
        NULLIF(BTRIM(ao.agent_name), ''),
        COALESCE(uo.user_bubble_id, ao.agent_bubble_id, dr.linked_user, dr.created_by)
      ) AS agent_name,
      COUNT(dr.id) as total_activities,
      COALESCE(SUM(dr.report_point), 0) as total_points
    FROM agent_daily_report dr
    ${USER_RESOLUTION_JOIN}
    ${AGENT_RESOLUTION_JOIN}
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

  if (teamTag) {
    paramCount++;
    query += ` AND dr.tag::text LIKE $${paramCount}`;
    params.push(`%${teamTag}%`);
  }

  if (activityType) {
    paramCount++;
    query += ` AND dr.activity_type = $${paramCount}`;
    params.push(activityType);
  }

  if (agentId) {
    paramCount++;
    query += ` AND ${buildActorFilterClause(`$${paramCount}`)}`;
    params.push(agentId);
  }

  query += `
    GROUP BY 1, 2
    ORDER BY total_points DESC, total_activities DESC, agent_name ASC
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
      COALESCE(
        NULLIF(BTRIM(uo.user_name), ''),
        NULLIF(BTRIM(ao.agent_name), ''),
        COALESCE(uo.user_bubble_id, ao.agent_bubble_id, dr.linked_user, dr.created_by)
      ) AS agent_name,
      COALESCE(uo.user_bubble_id, ao.agent_bubble_id, dr.linked_user, dr.created_by) AS agent_bubble_id,
      COALESCE(ao.agent_bubble_id, uo.linked_agent_profile) AS linked_agent_profile,
      c.name as customer_name
    FROM agent_daily_report dr
    ${USER_RESOLUTION_JOIN}
    ${AGENT_RESOLUTION_JOIN}
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
    query += ` AND ${buildActorFilterClause(`$${paramCount}`)}`;
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
    countQuery += ` AND ${buildActorFilterClause(`$${countParamCount}`)}`;
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

/**
 * Get agent performance ranking
 */
async function getAgentPerformanceRanking(client, options = {}) {
  const { startDate, endDate } = options;
  const params = [];
  let whereClause = '1=1';

  if (startDate) {
    params.push(startDate);
    whereClause += ` AND DATE(dr.report_date) >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate);
    whereClause += ` AND DATE(dr.report_date) <= $${params.length}`;
  }

  const query = `
    SELECT 
      COALESCE(ao.agent_bubble_id, uo.linked_agent_profile, uo.user_bubble_id, dr.linked_user, dr.created_by) AS bubble_id,
      COALESCE(
        NULLIF(BTRIM(uo.user_name), ''),
        NULLIF(BTRIM(ao.agent_name), ''),
        COALESCE(uo.user_bubble_id, ao.agent_bubble_id, dr.linked_user, dr.created_by)
      ) AS agent_name,
      COALESCE(NULLIF(BTRIM(ao.agent_contact), ''), NULLIF(BTRIM(uo.user_contact), '')) AS contact,
      uo.profile_picture,
      COUNT(dr.id) as total_activities,
      COALESCE(SUM(dr.report_point), 0) as total_points,
      COUNT(CASE WHEN dr.activity_type IN ('Close Case', 'New Case') THEN 1 END) as close_cases
    FROM agent_daily_report dr
    ${USER_RESOLUTION_JOIN}
    ${AGENT_RESOLUTION_JOIN}
    WHERE ${whereClause}
    GROUP BY 1, 2, 3, 4
    ORDER BY total_points DESC, total_activities DESC, agent_name ASC
  `;

  const result = await client.query(query, params);
  return result.rows;
}

/**
 * Get activity type breakdown
 */
async function getActivityTypeBreakdown(client, options = {}) {
  const { startDate, endDate } = options;
  const params = [];
  let whereClause = '1=1';

  if (startDate) {
    params.push(startDate);
    whereClause += ` AND DATE(report_date) >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate);
    whereClause += ` AND DATE(report_date) <= $${params.length}`;
  }

  const query = `
    SELECT 
      activity_type,
      COUNT(*) as count,
      COALESCE(SUM(report_point), 0) as total_points
    FROM agent_daily_report
    WHERE ${whereClause}
    GROUP BY activity_type
    ORDER BY count DESC
  `;

  const result = await client.query(query, params);
  return result.rows;
}

/**
 * Update manager review comment for activity row
 * @param {object} client
 * @param {number} id
 * @param {string|null} reviewComment
 */
async function updateReviewComment(client, id, reviewComment) {
  await ensureReviewCommentColumn(client);

  const normalizedComment = typeof reviewComment === 'string' ? reviewComment.trim() : '';

  const result = await client.query(
    `UPDATE agent_daily_report
     SET review_comment = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, review_comment, updated_at`,
    [normalizedComment || null, id]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
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
  getAllActivitiesForReview,
  getAgentPerformanceRanking,
  getActivityTypeBreakdown,
  updateReviewComment
};
