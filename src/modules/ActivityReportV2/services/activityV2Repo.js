const crypto = require('crypto');

const DEFAULT_MAX_LENGTH_MINUTES = 120;
const MAX_LENGTH_MINUTES = 720;

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

function normalizeDisplayOrder(value, fallback = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
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
      ORDER BY display_order ASC, task_title ASC, id ASC`,
    [userContext.department]
  );

  const personalResult = await client.query(
    `SELECT *
      FROM activity_v2_task_preset
      WHERE scope = 'personal'
        AND owner_user = $1
        AND is_active = TRUE
      ORDER BY display_order ASC, task_title ASC, id ASC`,
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
        ORDER BY scope ASC, is_active DESC, display_order ASC, task_title ASC, id ASC`,
      [userContext.department, userContext.linkedUser]
    );
    return result.rows;
  }

  const result = await client.query(
    `SELECT *
       FROM activity_v2_task_preset
      WHERE scope = 'personal'
        AND owner_user = $1
      ORDER BY is_active DESC, display_order ASC, task_title ASC, id ASC`,
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
  const displayOrder = normalizeDisplayOrder(data.displayOrder ?? data.display_order);
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
      display_order,
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
      displayOrder
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
  const displayOrder = data.displayOrder !== undefined || data.display_order !== undefined
    ? normalizeDisplayOrder(data.displayOrder ?? data.display_order)
    : null;

  const result = await client.query(
    `UPDATE activity_v2_task_preset
        SET task_title = COALESCE($3, task_title),
            max_length_minutes = COALESCE($4, max_length_minutes),
            task_point = COALESCE($5, task_point),
            is_active = COALESCE($6, is_active),
            display_order = COALESCE($9, display_order),
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
      displayOrder
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
        COALESCE(preset_order.display_order, 9999) AS task_display_order,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - r.started_at)) / 60)::integer AS elapsed_minutes
       FROM activity_v2_report r
       LEFT JOIN "user" u ON u.bubble_id = r.linked_user
       LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
       LEFT JOIN LATERAL (
         SELECT p.display_order
          FROM activity_v2_task_preset p
         WHERE p.is_active = TRUE
            AND p.scope = 'department'
            AND p.department IN (r.department, 'sales')
            AND LOWER(p.task_title) = LOWER(r.task_title)
          ORDER BY CASE WHEN p.department = r.department THEN 0 ELSE 1 END,
                   p.display_order ASC,
                   p.id ASC
          LIMIT 1
       ) preset_order ON TRUE
      WHERE r.ended_at IS NULL
      ORDER BY r.department ASC, COALESCE(preset_order.display_order, 9999) ASC, r.task_title ASC, r.started_at ASC`
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

  const byDepartment = {};
  activeResult.rows.forEach((row) => {
    const department = row.department || 'general';
    const taskTitle = row.task_title || 'Other Task';
    if (!byDepartment[department]) byDepartment[department] = {};
    if (!byDepartment[department][taskTitle]) byDepartment[department][taskTitle] = [];
    byDepartment[department][taskTitle].push(row);
  });

  return {
    active: activeResult.rows,
    byDepartment,
    today: todayResult.rows
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
  updateDetail
};
