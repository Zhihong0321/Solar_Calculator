const crypto = require('crypto');

const DEFAULT_MAX_LENGTH_MINUTES = 120;
const MAX_LENGTH_MINUTES = 720;

const VALUE_TIERS = ['revenue', 'support', 'offline'];
const DEFAULT_VALUE_TIER = 'support';
const VALUE_TIER_LABELS = {
  revenue: 'Revenue Generating',
  support: 'Support & Admin',
  offline: 'Break & Offline'
};
const REVENUE_KEYWORDS = /(prospect|cold.?call|lead|customer|hunt|sales|meeting|site.?visit|closing|quotation|proposal|demo|follow.?up)/i;
const OFFLINE_KEYWORDS = /(lunch|break|off.?duty|rest|away)/i;

function normalizeValueTier(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return VALUE_TIERS.includes(normalized) ? normalized : null;
}

function inferTierFromTitle(taskTitle) {
  const title = String(taskTitle || '');
  if (OFFLINE_KEYWORDS.test(title)) return 'offline';
  if (REVENUE_KEYWORDS.test(title)) return 'revenue';
  return DEFAULT_VALUE_TIER;
}

const DEPARTMENT_PRESET_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'hod',
  'head-of-department',
  'head_of_department',
  'hr'
]);

const MANAGER_VIEW_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'hod',
  'head-of-department',
  'head_of_department',
  'hr',
  'kc',
  'sales-manager',
  'sales_manager'
]);

function generateBubbleId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LENGTH_MINUTES);
}

function normalizeTaskPoint(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeAccessLevels(accessLevel) {
  return Array.isArray(accessLevel)
    ? accessLevel.map((role) => String(role).trim()).filter(Boolean)
    : [];
}

function getUserDepartment(accessLevel) {
  const roles = normalizeAccessLevels(accessLevel);
  return roles.find((role) => role.toLowerCase().startsWith('team-')) || 'general';
}

function canCreateDepartmentPreset(accessLevel) {
  return normalizeAccessLevels(accessLevel)
    .some((role) => DEPARTMENT_PRESET_ROLES.has(role.toLowerCase()));
}

function canViewManagerBoard(accessLevel) {
  return normalizeAccessLevels(accessLevel)
    .some((role) => MANAGER_VIEW_ROLES.has(role.toLowerCase()));
}

function buildUserContext(req) {
  const linkedUser = normalizeText(req?.user?.bubbleId ?? req?.user?.bubble_id);
  if (!linkedUser) {
    throw new Error('Authenticated linked_user is required.');
  }

  const accessLevel = normalizeAccessLevels(req.user.access_level);
  return {
    linkedUser,
    accessLevel,
    department: getUserDepartment(accessLevel),
    canCreateDepartmentPreset: canCreateDepartmentPreset(accessLevel),
    canViewManagerBoard: canViewManagerBoard(accessLevel)
  };
}

async function applyAutoCutoffs(client, linkedUser = null) {
  const params = [];
  let filter = '';

  if (linkedUser) {
    params.push(linkedUser);
    filter = `AND linked_user = $1`;
  }

  const result = await client.query(
    `UPDATE activity_v2_report
        SET ended_at = started_at + (max_length_minutes * INTERVAL '1 minute'),
            end_reason = 'auto_cutoff',
            updated_at = NOW()
      WHERE ended_at IS NULL
        ${filter}
        AND started_at + (max_length_minutes * INTERVAL '1 minute') <= NOW()
      RETURNING *`,
    params
  );

  return result.rows;
}

async function listPresetsForUser(client, userContext) {
  const departmentResult = await client.query(
    `SELECT *
       FROM activity_v2_task_preset
      WHERE scope = 'department'
        AND department = $1
        AND is_active = TRUE
      ORDER BY task_title ASC, id ASC`,
    [userContext.department]
  );

  const personalResult = await client.query(
    `SELECT *
       FROM activity_v2_task_preset
      WHERE scope = 'personal'
        AND owner_user = $1
        AND is_active = TRUE
      ORDER BY task_title ASC, id ASC`,
    [userContext.linkedUser]
  );

  return {
    department: userContext.department,
    groups: [
      { label: 'Department Tasks', scope: 'department', presets: departmentResult.rows },
      { label: 'My Tasks', scope: 'personal', presets: personalResult.rows }
    ]
  };
}

async function listManageablePresets(client, userContext) {
  if (userContext.canCreateDepartmentPreset) {
    const result = await client.query(
      `SELECT *
         FROM activity_v2_task_preset
        WHERE (scope = 'department' AND department = $1)
           OR (scope = 'personal' AND owner_user = $2)
        ORDER BY scope ASC, is_active DESC, task_title ASC, id ASC`,
      [userContext.department, userContext.linkedUser]
    );
    return result.rows;
  }

  const result = await client.query(
    `SELECT *
       FROM activity_v2_task_preset
      WHERE scope = 'personal'
        AND owner_user = $1
      ORDER BY is_active DESC, task_title ASC, id ASC`,
    [userContext.linkedUser]
  );
  return result.rows;
}

async function createPreset(client, userContext, data) {
  const taskTitle = normalizeText(data.taskTitle ?? data.task_title);
  if (!taskTitle) {
    throw new Error('task_title is required.');
  }

  const requestedScope = normalizeText(data.scope) || 'personal';
  if (!['department', 'personal'].includes(requestedScope)) {
    throw new Error('scope must be department or personal.');
  }

  if (requestedScope === 'department' && !userContext.canCreateDepartmentPreset) {
    throw new Error('Only HoD, Admin, or Superadmin users can create department presets.');
  }

  const department = requestedScope === 'department'
    ? (normalizeText(data.department) || userContext.department)
    : userContext.department;

  const maxLengthMinutes = normalizePositiveInteger(
    data.maxLengthMinutes ?? data.max_length_minutes,
    DEFAULT_MAX_LENGTH_MINUTES
  );
  const taskPoint = normalizeTaskPoint(data.taskPoint ?? data.task_point);
  const valueTier = normalizeValueTier(data.valueTier ?? data.value_tier)
    || inferTierFromTitle(taskTitle);
  const ownerUser = requestedScope === 'personal' ? userContext.linkedUser : null;

  const result = await client.query(
    `INSERT INTO activity_v2_task_preset (
      bubble_id,
      task_title,
      department,
      max_length_minutes,
      task_point,
      scope,
      created_by_user,
      owner_user,
      value_tier,
      is_active,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW(), NOW())
    RETURNING *`,
    [
      generateBubbleId('av2_preset'),
      taskTitle,
      department,
      maxLengthMinutes,
      taskPoint,
      requestedScope,
      userContext.linkedUser,
      ownerUser,
      valueTier
    ]
  );

  return result.rows[0];
}

async function updatePreset(client, userContext, presetId, data) {
  const taskTitle = normalizeText(data.taskTitle ?? data.task_title);
  const maxLengthMinutes = data.maxLengthMinutes !== undefined || data.max_length_minutes !== undefined
    ? normalizePositiveInteger(data.maxLengthMinutes ?? data.max_length_minutes, DEFAULT_MAX_LENGTH_MINUTES)
    : null;
  const taskPoint = data.taskPoint !== undefined || data.task_point !== undefined
    ? normalizeTaskPoint(data.taskPoint ?? data.task_point)
    : null;
  const isActive = data.isActive !== undefined || data.is_active !== undefined
    ? Boolean(data.isActive ?? data.is_active)
    : null;
  const valueTier = data.valueTier !== undefined || data.value_tier !== undefined
    ? normalizeValueTier(data.valueTier ?? data.value_tier)
    : null;

  const result = await client.query(
    `UPDATE activity_v2_task_preset
        SET task_title = COALESCE($3, task_title),
            max_length_minutes = COALESCE($4, max_length_minutes),
            task_point = COALESCE($5, task_point),
            is_active = COALESCE($6, is_active),
            value_tier = COALESCE($9, value_tier),
            updated_at = NOW()
      WHERE (id::text = $1 OR bubble_id = $1)
        AND (
          (scope = 'personal' AND owner_user = $2)
          OR (scope = 'department' AND department = $7 AND $8 = TRUE)
        )
      RETURNING *`,
    [
      String(presetId),
      userContext.linkedUser,
      taskTitle,
      maxLengthMinutes,
      taskPoint,
      isActive,
      userContext.department,
      userContext.canCreateDepartmentPreset,
      valueTier
    ]
  );

  return result.rows[0] || null;
}

async function getPresetForStart(client, userContext, presetId) {
  const result = await client.query(
    `SELECT *
       FROM activity_v2_task_preset
      WHERE is_active = TRUE
        AND (id::text = $1 OR bubble_id = $1)
        AND (
          (scope = 'department' AND department = $2)
          OR (scope = 'personal' AND owner_user = $3)
        )
      LIMIT 1`,
    [String(presetId), userContext.department, userContext.linkedUser]
  );

  return result.rows[0] || null;
}

function buildTaskFromCustomInput(userContext, data) {
  const taskTitle = normalizeText(data.taskTitle ?? data.task_title);
  if (!taskTitle) {
    throw new Error('task_title is required for custom task.');
  }

  return {
    taskPresetId: null,
    taskTitle,
    department: normalizeText(data.department) || userContext.department,
    maxLengthMinutes: normalizePositiveInteger(
      data.maxLengthMinutes ?? data.max_length_minutes,
      DEFAULT_MAX_LENGTH_MINUTES
    ),
    taskPoint: normalizeTaskPoint(data.taskPoint ?? data.task_point)
  };
}

async function buildTaskFromStartRequest(client, userContext, data) {
  const presetId = normalizeText(data.presetId ?? data.preset_id ?? data.taskPresetId ?? data.task_preset_id);
  if (!presetId) {
    return buildTaskFromCustomInput(userContext, data);
  }

  const preset = await getPresetForStart(client, userContext, presetId);
  if (!preset) {
    throw new Error('Task preset not found or not available for this user.');
  }

  return {
    taskPresetId: preset.id,
    taskTitle: preset.task_title,
    department: preset.department,
    maxLengthMinutes: normalizePositiveInteger(preset.max_length_minutes, DEFAULT_MAX_LENGTH_MINUTES),
    taskPoint: normalizeTaskPoint(preset.task_point)
  };
}

async function startActivity(client, userContext, data) {
  const task = await buildTaskFromStartRequest(client, userContext, data);
  const startedAt = data.startedAt || data.started_at ? new Date(data.startedAt || data.started_at) : new Date();

  if (Number.isNaN(startedAt.getTime())) {
    throw new Error('started_at is invalid.');
  }

  await client.query('BEGIN');
  try {
    await applyAutoCutoffs(client, userContext.linkedUser);

    await client.query(
      `UPDATE activity_v2_report
          SET ended_at = $2,
              end_reason = 'next_entry',
              updated_at = NOW()
        WHERE linked_user = $1
          AND ended_at IS NULL`,
      [userContext.linkedUser, startedAt]
    );

    const result = await client.query(
      `INSERT INTO activity_v2_report (
        bubble_id,
        linked_user,
        task_preset_id,
        task_title,
        department,
        task_point,
        started_at,
        ended_at,
        end_reason,
        max_length_minutes,
        detail_text,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9, NOW(), NOW())
      RETURNING *`,
      [
        generateBubbleId('av2_report'),
        userContext.linkedUser,
        task.taskPresetId,
        task.taskTitle,
        task.department,
        task.taskPoint,
        startedAt,
        task.maxLengthMinutes,
        normalizeText(data.detailText ?? data.detail_text)
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function getCurrentActivity(client, userContext) {
  await applyAutoCutoffs(client, userContext.linkedUser);

  const result = await client.query(
    `SELECT *,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)::integer AS elapsed_minutes
       FROM activity_v2_report
      WHERE linked_user = $1
        AND ended_at IS NULL
      ORDER BY started_at DESC, id DESC
      LIMIT 1`,
    [userContext.linkedUser]
  );

  return result.rows[0] || null;
}

async function getTimeline(client, userContext, options = {}) {
  await applyAutoCutoffs(client, userContext.linkedUser);

  const targetDate = normalizeText(options.date) || new Date().toISOString().split('T')[0];
  const result = await client.query(
    `SELECT *,
            FLOOR(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60)::integer AS duration_minutes
       FROM activity_v2_report
      WHERE linked_user = $1
        AND started_at >= $2::date
        AND started_at < ($2::date + INTERVAL '1 day')
      ORDER BY started_at ASC, id ASC`,
    [userContext.linkedUser, targetDate]
  );

  return {
    date: targetDate,
    reports: result.rows
  };
}

async function getLiveBoard(client, userContext) {
  if (!userContext.canViewManagerBoard) {
    throw new Error('Manager access is required.');
  }

  await applyAutoCutoffs(client);

  const activeResult = await client.query(
    `SELECT
        r.*,
        u.email,
        u.access_level,
        a.name AS agent_name,
        preset_match.value_tier AS matched_value_tier,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - r.started_at)) / 60)::integer AS elapsed_minutes
       FROM activity_v2_report r
       LEFT JOIN "user" u ON u.bubble_id = r.linked_user
       LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
       LEFT JOIN LATERAL (
         SELECT p.value_tier
           FROM activity_v2_task_preset p
          WHERE p.is_active = TRUE
            AND LOWER(p.task_title) = LOWER(r.task_title)
            AND (
              (p.scope = 'department' AND p.department IN (r.department, 'general'))
              OR (p.scope = 'personal' AND p.owner_user = r.linked_user)
            )
          ORDER BY CASE WHEN p.department = r.department THEN 0 ELSE 1 END,
                   CASE WHEN p.scope = 'department' THEN 0 ELSE 1 END,
                   p.id ASC
          LIMIT 1
       ) preset_match ON TRUE
      WHERE r.ended_at IS NULL
      ORDER BY r.task_title ASC, r.started_at ASC`
  );

  const todayResult = await client.query(
    `SELECT
        r.*,
        u.email,
        a.name AS agent_name,
        FLOOR(EXTRACT(EPOCH FROM (COALESCE(r.ended_at, NOW()) - r.started_at)) / 60)::integer AS duration_minutes
       FROM activity_v2_report r
       LEFT JOIN "user" u ON u.bubble_id = r.linked_user
       LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
      WHERE r.started_at >= CURRENT_DATE
        AND r.started_at < (CURRENT_DATE + INTERVAL '1 day')
      ORDER BY r.started_at DESC, r.id DESC
      LIMIT 150`
  );

  const byTier = { revenue: {}, support: {}, offline: {} };
  const tierCounts = { revenue: 0, support: 0, offline: 0 };
  const taskCounts = {};

  activeResult.rows.forEach((row) => {
    const tier = normalizeValueTier(row.matched_value_tier) || inferTierFromTitle(row.task_title);
    const taskTitle = row.task_title || 'Other Task';
    row.value_tier = tier;
    if (!byTier[tier][taskTitle]) byTier[tier][taskTitle] = [];
    byTier[tier][taskTitle].push(row);
    tierCounts[tier] += 1;
    taskCounts[taskTitle] = (taskCounts[taskTitle] || 0) + 1;
  });

  const totalActive = activeResult.rows.length;
  const onValueWork = tierCounts.revenue;
  const revenuePct = totalActive > 0 ? Math.round((onValueWork / totalActive) * 100) : 0;

  return {
    active: activeResult.rows,
    byTier,
    tierOrder: VALUE_TIERS,
    tierLabels: VALUE_TIER_LABELS,
    tierCounts,
    taskCounts,
    barometer: {
      total: totalActive,
      revenue: tierCounts.revenue,
      support: tierCounts.support,
      offline: tierCounts.offline,
      onValueWork,
      revenuePct
    },
    today: todayResult.rows
  };
}

async function getPersonTimeline(client, userContext, linkedUser, options = {}) {
  if (!userContext.canViewManagerBoard) {
    throw new Error('Manager access is required.');
  }

  const targetLinkedUser = normalizeText(linkedUser);
  if (!targetLinkedUser) {
    throw new Error('linked_user is required.');
  }

  await applyAutoCutoffs(client, targetLinkedUser);

  const targetDate = normalizeText(options.date) || new Date().toISOString().split('T')[0];

  const profileResult = await client.query(
    `SELECT
        u.bubble_id AS linked_user,
        u.email,
        u.access_level,
        a.name AS agent_name,
        a.contact AS agent_contact
       FROM "user" u
       LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
      WHERE u.bubble_id = $1
      LIMIT 1`,
    [targetLinkedUser]
  );

  const reportResult = await client.query(
    `SELECT r.*,
            preset_match.value_tier AS matched_value_tier,
            FLOOR(EXTRACT(EPOCH FROM (COALESCE(r.ended_at, NOW()) - r.started_at)) / 60)::integer AS duration_minutes
       FROM activity_v2_report r
       LEFT JOIN LATERAL (
         SELECT p.value_tier
           FROM activity_v2_task_preset p
          WHERE p.is_active = TRUE
            AND LOWER(p.task_title) = LOWER(r.task_title)
            AND (
              (p.scope = 'department' AND p.department IN (r.department, 'general'))
              OR (p.scope = 'personal' AND p.owner_user = r.linked_user)
            )
          ORDER BY CASE WHEN p.department = r.department THEN 0 ELSE 1 END,
                   CASE WHEN p.scope = 'department' THEN 0 ELSE 1 END,
                   p.id ASC
          LIMIT 1
       ) preset_match ON TRUE
      WHERE r.linked_user = $1
        AND r.started_at >= $2::date
        AND r.started_at < ($2::date + INTERVAL '1 day')
      ORDER BY r.started_at ASC, r.id ASC`,
    [targetLinkedUser, targetDate]
  );

  const reports = reportResult.rows.map((row) => ({
    ...row,
    value_tier: normalizeValueTier(row.matched_value_tier) || inferTierFromTitle(row.task_title)
  }));

  const totals = reports.reduce((acc, row) => {
    acc.minutes += Number(row.duration_minutes || 0);
    acc.points += Number(row.task_point || 0);
    acc[row.value_tier] = (acc[row.value_tier] || 0) + Number(row.duration_minutes || 0);
    return acc;
  }, { minutes: 0, points: 0, revenue: 0, support: 0, offline: 0 });

  return {
    date: targetDate,
    person: profileResult.rows[0] || { linked_user: targetLinkedUser },
    reports,
    totals
  };
}

async function updateDetail(client, userContext, reportId, detailText) {
  const result = await client.query(
    `UPDATE activity_v2_report
        SET detail_text = $3,
            updated_at = NOW()
      WHERE (id::text = $1 OR bubble_id = $1)
        AND linked_user = $2
      RETURNING *`,
    [String(reportId), userContext.linkedUser, normalizeText(detailText)]
  );

  return result.rows[0] || null;
}

module.exports = {
  DEFAULT_MAX_LENGTH_MINUTES,
  MAX_LENGTH_MINUTES,
  buildUserContext,
  applyAutoCutoffs,
  listPresetsForUser,
  listManageablePresets,
  createPreset,
  updatePreset,
  startActivity,
  getCurrentActivity,
  getTimeline,
  getLiveBoard,
  getPersonTimeline,
  updateDetail
};
