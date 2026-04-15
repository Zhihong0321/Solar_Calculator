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

function formatTimeSlotLabel(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
}

const TIME_OF_DAY_SLOTS = Array.from({ length: 17 }, (_, index) => {
  const hour = index + 7;
  return {
    value: `${String(hour).padStart(2, '0')}:00`,
    label: formatTimeSlotLabel(hour)
  };
});

function isValidTimeOfDaySlot(value) {
  return TIME_OF_DAY_SLOTS.some(slot => slot.value === value);
}

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

function buildSalesTeamAccessClause(userAlias = 'u') {
  return `
    EXISTS (
      SELECT 1
      FROM unnest(COALESCE(${userAlias}.access_level, ARRAY[]::text[])) AS access_tag
      WHERE LOWER(access_tag) = 'sales'
    )
    AND EXISTS (
      SELECT 1
      FROM unnest(COALESCE(${userAlias}.access_level, ARRAY[]::text[])) AS access_tag
      WHERE LOWER(access_tag) LIKE 'team-%'
    )
  `;
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

  query += ` ORDER BY report_date DESC, time_of_day DESC NULLS LAST, created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
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
    timeOfDay,
    tags
  } = data;

  const bubbleId = generateBubbleId();
  const points = getPointsForActivity(activityType);

  const result = await client.query(
    `INSERT INTO agent_daily_report (
      bubble_id, linked_user, created_by, activity_type, follow_up_subtype,
      remark, linked_customer, report_date, time_of_day, report_point, tag,
      created_at, updated_at, created_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
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
      timeOfDay || null,
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
  const { activityType, followUpSubtype, remark, linkedCustomer, reportDate, timeOfDay, tags } = data;

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
      time_of_day = COALESCE($7, time_of_day),
      report_point = COALESCE($8, report_point),
      updated_at = NOW()
    WHERE id = $9 AND (linked_user = ANY($10) OR created_by = ANY($10))
    RETURNING *`,
    [
      activityType || null,
      followUpSubtype !== undefined ? followUpSubtype : null,
      remark !== undefined ? remark : null,
      linkedCustomer !== undefined ? linkedCustomer : null,
      reportDate || null,
      tags || null,
      timeOfDay !== undefined ? timeOfDay : null,
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
 * Get last-week focus data for an agent.
 * Includes activity points, new leads, real quotations, and newly closed deals.
 * @param {object} client
 * @param {string|string[]} agentIdentifiers
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 */
async function getWeeklyFocus(client, agentIdentifiers, startDate, endDate, currentMonthStart, currentMonthEnd) {
  const identifiers = Array.isArray(agentIdentifiers) ? agentIdentifiers : [agentIdentifiers];

  const [pointsResult, leadsResult, quotationsResult, closedDealsResult, currentMonthRevenueResult] = await Promise.all([
    client.query(
      `SELECT
         COUNT(*) as total_activities,
         COALESCE(SUM(report_point), 0) as total_points
       FROM agent_daily_report
       WHERE (linked_user = ANY($1) OR created_by = ANY($1))
         AND DATE(report_date) >= $2
         AND DATE(report_date) <= $3`,
      [identifiers, startDate, endDate]
    ),
    client.query(
      `SELECT
         customer_id,
         name,
         phone,
         email,
         lead_source,
         remark,
         created_at
       FROM customer
       WHERE created_by = ANY($1)
         AND created_at >= $2::date
         AND created_at < ($3::date + INTERVAL '1 day')
       ORDER BY created_at DESC`,
      [identifiers, startDate, endDate]
    ),
    client.query(
      `SELECT
         i.bubble_id,
         i.invoice_number,
         COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(i.customer_name_snapshot), ''), 'Unknown Customer') as customer_name,
         COALESCE(i.invoice_date, i.created_at) as quotation_date,
         COALESCE(pkg.panel_qty, i.panel_qty) as panel_qty,
         CASE
           WHEN COALESCE(pkg.type, i.package_type) = 'Residential' THEN 'Residential'
           WHEN COALESCE(pkg.type, i.package_type) IS NOT NULL THEN 'Commercial'
           ELSE 'Unknown'
         END as package_type_label,
         i.total_amount,
         i.status
       FROM invoice i
       LEFT JOIN customer c ON c.customer_id = i.linked_customer
       LEFT JOIN package pkg ON pkg.bubble_id = i.linked_package OR pkg.id::text = i.linked_package
       WHERE i.is_latest = true
         AND (i.status IS NULL OR i.status != 'deleted')
         AND (i.linked_agent = ANY($1) OR i.created_by = ANY($1))
         AND i.linked_customer IS NOT NULL
         AND LOWER(COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(i.customer_name_snapshot), ''), '')) != 'sample quotation'
         AND COALESCE(i.invoice_date, i.created_at) >= $2::date
         AND COALESCE(i.invoice_date, i.created_at) < ($3::date + INTERVAL '1 day')
       ORDER BY COALESCE(i.invoice_date, i.created_at) DESC, i.created_at DESC`,
      [identifiers, startDate, endDate]
    ),
    client.query(
      `SELECT
         i.bubble_id,
         i.invoice_number,
         COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(i.customer_name_snapshot), ''), 'Unknown Customer') as customer_name,
         COALESCE(i."1st_payment_date", fp.payment_date) as first_payment_date,
         fp.amount as first_payment_amount,
         i.total_amount,
         i.status
       FROM invoice i
       LEFT JOIN customer c ON c.customer_id = i.linked_customer
       LEFT JOIN LATERAL (
         SELECT p.payment_date, p.amount
         FROM payment p
         WHERE p.linked_invoice = i.bubble_id
            OR p.bubble_id = ANY(COALESCE(i.linked_payment, ARRAY[]::text[]))
         ORDER BY p.payment_date ASC NULLS LAST, p.created_at ASC NULLS LAST
         LIMIT 1
       ) fp ON TRUE
       WHERE i.is_latest = true
         AND (i.status IS NULL OR i.status != 'deleted')
         AND (i.linked_agent = ANY($1) OR i.created_by = ANY($1))
         AND i.linked_customer IS NOT NULL
         AND LOWER(COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(i.customer_name_snapshot), ''), '')) != 'sample quotation'
         AND COALESCE(i."1st_payment_date", fp.payment_date) >= $2::date
         AND COALESCE(i."1st_payment_date", fp.payment_date) < ($3::date + INTERVAL '1 day')
       ORDER BY COALESCE(i."1st_payment_date", fp.payment_date) DESC, i.created_at DESC`,
      [identifiers, startDate, endDate]
    ),
    client.query(
      `SELECT
         COUNT(*) as total_sales,
         COALESCE(SUM(i.total_amount), 0) as total_revenue
       FROM invoice i
       LEFT JOIN customer c ON c.customer_id = i.linked_customer
       LEFT JOIN LATERAL (
         SELECT p.payment_date
         FROM payment p
         WHERE p.linked_invoice = i.bubble_id
            OR p.bubble_id = ANY(COALESCE(i.linked_payment, ARRAY[]::text[]))
         ORDER BY p.payment_date ASC NULLS LAST, p.created_at ASC NULLS LAST
         LIMIT 1
       ) fp ON TRUE
       WHERE i.is_latest = true
         AND (i.status IS NULL OR i.status != 'deleted')
         AND (i.linked_agent = ANY($1) OR i.created_by = ANY($1))
         AND i.linked_customer IS NOT NULL
         AND LOWER(COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(i.customer_name_snapshot), ''), '')) != 'sample quotation'
         AND COALESCE(i."1st_payment_date", fp.payment_date) >= $2::date
         AND COALESCE(i."1st_payment_date", fp.payment_date) < ($3::date + INTERVAL '1 day')`,
      [identifiers, currentMonthStart, currentMonthEnd]
    )
  ]);

  return {
    summary: {
      totalActivities: parseInt(pointsResult.rows[0]?.total_activities || 0, 10),
      totalPoints: parseInt(pointsResult.rows[0]?.total_points || 0, 10)
    },
    currentMonthSales: {
      totalRevenue: parseFloat(currentMonthRevenueResult.rows[0]?.total_revenue || 0),
      totalSales: parseInt(currentMonthRevenueResult.rows[0]?.total_sales || 0, 10),
      monthStart: currentMonthStart,
      monthEnd: currentMonthEnd
    },
    weeklyNewLeads: leadsResult.rows,
    weeklyQuotations: quotationsResult.rows,
    weeklyClosedDeals: closedDealsResult.rows
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
  const whereConditions = [
    `EXISTS (
      SELECT 1
      FROM "user" u
      WHERE (u.linked_agent_profile = a.bubble_id OR u.bubble_id = a.bubble_id)
        AND ${buildSalesTeamAccessClause('u')}
    )`
  ];

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
    WHERE EXISTS (
      SELECT 1
      FROM "user" u
      WHERE (
        u.bubble_id = dr.linked_user OR
        u.bubble_id = dr.created_by OR
        u.linked_agent_profile = dr.linked_user OR
        u.linked_agent_profile = dr.created_by
      )
      AND ${buildSalesTeamAccessClause('u')}
    )
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

  query += ` ORDER BY dr.report_date DESC, dr.time_of_day DESC NULLS LAST, dr.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limit, offset);

  const result = await client.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total 
    FROM agent_daily_report dr
    WHERE EXISTS (
      SELECT 1
      FROM "user" u
      WHERE (
        u.bubble_id = dr.linked_user OR
        u.bubble_id = dr.created_by OR
        u.linked_agent_profile = dr.linked_user OR
        u.linked_agent_profile = dr.created_by
      )
      AND ${buildSalesTeamAccessClause('u')}
    )
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

/**
 * Get agent performance ranking
 */
async function getAgentPerformanceRanking(client, options = {}) {
  const { startDate, endDate } = options;
  const params = [];
  let dateConditions = '';

  if (startDate) {
    params.push(startDate);
    dateConditions += ` AND DATE(dr.report_date) >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate);
    dateConditions += ` AND DATE(dr.report_date) <= $${params.length}`;
  }

  const query = `
    SELECT 
      a.bubble_id,
      a.name as agent_name,
      a.contact,
      u.profile_picture,
      COUNT(dr.id) as total_activities,
      COALESCE(SUM(dr.report_point), 0) as total_points,
      COUNT(CASE WHEN dr.activity_type = 'Close Case' THEN 1 END) as close_cases
    FROM agent a
    LEFT JOIN "user" u ON (a.linked_user_login = u.bubble_id OR u.linked_agent_profile = a.bubble_id)
    LEFT JOIN agent_daily_report dr ON (
      (a.bubble_id = dr.linked_user OR a.bubble_id = dr.created_by)
      ${dateConditions}
    )
    WHERE ${buildSalesTeamAccessClause('u')}
    GROUP BY a.bubble_id, a.name, a.contact, u.profile_picture
    ORDER BY total_points DESC
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
    FROM agent_daily_report dr
    WHERE ${whereClause}
      AND EXISTS (
        SELECT 1
        FROM "user" u
        WHERE (
          u.bubble_id = dr.linked_user OR
          u.bubble_id = dr.created_by OR
          u.linked_agent_profile = dr.linked_user OR
          u.linked_agent_profile = dr.created_by
        )
        AND ${buildSalesTeamAccessClause('u')}
      )
    GROUP BY activity_type
    ORDER BY count DESC
  `;

  const result = await client.query(query, params);
  return result.rows;
}

module.exports = {
  ACTIVITY_POINTS,
  FOLLOW_UP_SUBTYPES,
  TIME_OF_DAY_SLOTS,
  isValidTimeOfDaySlot,
  getPointsForActivity,
  getActivitiesByAgent,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  getDailyStats,
  getWeeklyStats,
  getWeeklyFocus,
  getTeamStats,
  getAllActivitiesForReview,
  getAgentPerformanceRanking,
  getActivityTypeBreakdown
};
