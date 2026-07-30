'use strict';

/**
 * Writer for the shared `ai_activity_log` table.
 *
 * Rule 1: Logging must never break the caller's action — every failure
 * here is caught and logged to console, never thrown.
 * Rule 2: Non-blocking asynchronous execution.
 * Rule 3: `app` is a hardcoded slug ('agent-os'), fallback to APP_SLUG env if present.
 */

const pool = require('../database/pool');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../auth/userIdentity');

const APP_SLUG = process.env.APP_SLUG || 'agent-os';

let _tableExists = null;

async function checkAiActivityLogTableExists() {
  if (_tableExists !== null) return _tableExists;
  try {
    const result = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_activity_log'
        LIMIT 1`
    );
    _tableExists = result.rows.length > 0;
  } catch (_) {
    _tableExists = false;
  }
  return _tableExists;
}

/**
 * Resolve actor user context for a request if available.
 */
async function resolveUserContext(req) {
  if (!req) return { userId: null, userRef: null, userName: null };

  const bubbleId = getRequestUserBubbleId(req);
  const legacyId = getRequestLegacyUserId(req);

  if (!bubbleId && !legacyId) {
    return { userId: null, userRef: null, userName: null };
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.email, a.name
         FROM "user" u
         LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
        WHERE u.id::text = $1 OR u.bubble_id = $2
        LIMIT 1`,
      [String(legacyId || ''), String(bubbleId || '')]
    );
    const row = result.rows[0];
    return {
      userId: row?.id ?? null,
      userRef: bubbleId || null,
      userName: row?.name || row?.email || null
    };
  } catch (err) {
    return { userId: null, userRef: bubbleId || null, userName: null };
  }
}

/**
 * Sanitize and truncate summary strings to prevent secrets leakage.
 */
function sanitizeSummary(text, maxLength = 2000) {
  if (!text) return null;
  let str = '';
  if (typeof text === 'string') {
    str = text;
  } else {
    try {
      str = JSON.stringify(text);
    } catch (_) {
      str = String(text);
    }
  }
  str = str.replace(/(api[_-]?key|secret|password|auth[_-]?token|bearer\s+)[=:\s]*[^\s,"']+/gi, '$1***REDACTED***');
  if (str.length > maxLength) {
    return str.substring(0, maxLength) + '... [truncated]';
  }
  return str;
}

function safeInt(val) {
  if (val == null) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function safeFloat(val) {
  if (val == null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

/**
 * Write one row to the `ai_activity_log` table.
 *
 * @param {object} opts
 * @param {object} [opts.req]                   - Express request object
 * @param {string}  opts.agent                  - REQUIRED. Agent name / slug (e.g. 'claim_receipt_ocr')
 * @param {string} [opts.agentKind='main_loop'] - 'main_loop', 'sub_agent', 'tool', etc.
 * @param {string}  opts.model                  - REQUIRED. Exact model id (e.g. 'gemini-2.5-flash')
 * @param {string} [opts.apiUrl]                - Target API endpoint / URL
 * @param {string} [opts.sessionId]             - AI session / thread ID
 * @param {string} [opts.taskId]                - Task ID
 * @param {string} [opts.parentTaskId]          - Parent task ID
 * @param {number} [opts.triggeredByUserId]     - "user".id integer
 * @param {string} [opts.triggeredByRef]        - "user".bubble_id
 * @param {string} [opts.triggeredByName]       - User display name
 * @param {string}  opts.action                 - REQUIRED. Action name (e.g. 'extract_receipt_ocr')
 * @param {string} [opts.toolName]              - Tool invoked, if any
 * @param {string} [opts.entityType]            - Associated entity type (e.g. 'claim_receipt')
 * @param {string|number} [opts.entityId]       - Associated entity ID
 * @param {string} [opts.entityLabel]           - Associated entity label/name
 * @param {string} [opts.description]           - Human readable description
 * @param {string|object} [opts.inputSummary]   - Prompt / input payload summary
 * @param {string|object} [opts.outputSummary]  - Model output summary
 * @param {number} [opts.inputTokens]           - Input token count
 * @param {number} [opts.outputTokens]          - Output token count
 * @param {number} [opts.costUsd]               - Estimated USD cost
 * @param {number} [opts.durationMs]            - Execution duration in milliseconds
 * @param {string} [opts.status='success']      - 'success' | 'failed' | 'partial'
 * @param {string} [opts.errorMessage]          - Error details if failed
 * @param {number} [opts.activityLogId]         - Soft ref to activity_log.id
 * @param {object} [opts.metadata={}]           - Additional jsonb metadata
 * @param {Date|string} [opts.occurredAt]       - Timestamp of occurrence
 * @param {Date|string} [opts.retainUntil]      - Retention expiration timestamp
 */
async function writeAiActivity({
  req = null,
  agent,
  agentKind = 'main_loop',
  model,
  apiUrl = null,
  sessionId = null,
  taskId = null,
  parentTaskId = null,
  triggeredByUserId = null,
  triggeredByRef = null,
  triggeredByName = null,
  action,
  toolName = null,
  entityType = null,
  entityId = null,
  entityLabel = null,
  description = null,
  inputSummary = null,
  outputSummary = null,
  inputTokens = null,
  outputTokens = null,
  costUsd = null,
  durationMs = null,
  status = 'success',
  errorMessage = null,
  activityLogId = null,
  metadata = {},
  occurredAt = null,
  retainUntil = null
} = {}) {
  if (!agent || !model || !action) {
    console.warn('[writeAiActivity] Missing required fields (agent, model, or action). Skipping write.');
    return;
  }

  try {
    const tableExists = await checkAiActivityLogTableExists();
    if (!tableExists) return;

    let userId = triggeredByUserId;
    let userRef = triggeredByRef;
    let userName = triggeredByName;

    if (req && (!userId || !userRef || !userName)) {
      const resolved = await resolveUserContext(req);
      if (!userId) userId = resolved.userId;
      if (!userRef) userRef = resolved.userRef;
      if (!userName) userName = resolved.userName;
    }

    const appEnv = process.env.NODE_ENV === 'production' ? 'prod' : (process.env.NODE_ENV || 'dev');

    const cleanInputSummary = sanitizeSummary(inputSummary);
    const cleanOutputSummary = sanitizeSummary(outputSummary);

    let cleanMetadata = '{}';
    if (typeof metadata === 'object' && metadata !== null) {
      try {
        cleanMetadata = JSON.stringify(metadata);
      } catch (_) {
        cleanMetadata = '{}';
      }
    } else if (typeof metadata === 'string') {
      cleanMetadata = metadata;
    }

    await pool.query(
      `INSERT INTO ai_activity_log (
        app, app_env, agent, agent_kind, model, api_url, session_id, task_id, parent_task_id,
        triggered_by_user_id, triggered_by_ref, triggered_by_name, action, tool_name,
        entity_type, entity_id, entity_label, description, input_summary, output_summary,
        input_tokens, output_tokens, cost_usd, duration_ms, status, error_message,
        activity_log_id, metadata, occurred_at, retain_until
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26,
        $27, $28::jsonb, COALESCE($29::timestamptz, NOW()), $30::timestamptz
      )`,
      [
        APP_SLUG,
        appEnv,
        agent,
        agentKind || 'main_loop',
        model,
        apiUrl || (req ? req.originalUrl : null),
        sessionId ? String(sessionId) : null,
        taskId ? String(taskId) : null,
        parentTaskId ? String(parentTaskId) : null,
        safeInt(userId),
        userRef ? String(userRef) : null,
        userName ? String(userName) : null,
        action,
        toolName || null,
        entityType || null,
        entityId != null ? String(entityId) : null,
        entityLabel || null,
        description || null,
        cleanInputSummary,
        cleanOutputSummary,
        safeInt(inputTokens),
        safeInt(outputTokens),
        safeFloat(costUsd),
        safeInt(durationMs),
        status || 'success',
        errorMessage || null,
        safeInt(activityLogId),
        cleanMetadata,
        occurredAt || null,
        retainUntil || null
      ]
    );
  } catch (err) {
    console.error('[writeAiActivity] Failed to write ai_activity_log entry:', err.message);
  }
}

module.exports = {
  writeAiActivity,
  sanitizeSummary,
  APP_SLUG
};
