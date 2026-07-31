'use strict';

/**
 * Writer for the shared cross-app `activity_log` table (prod_main).
 * Spec: E:\EE-Admin-v5\SOP-SCHEMA-Activity-log.md
 *
 * Rule 1 (SOP): logging must never break the caller's action — every failure
 * here is caught and swallowed, never thrown.
 * Rule 2 (SOP): call this AFTER your business transaction commits.
 * Rule 3 (SOP): `app` is a hardcoded slug, never derived from a URL.
 */

const pool = require('../database/pool');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../auth/userIdentity');

// Matches the source_app already used for this app's invoice_audit_log writes
// (src/modules/Invoicing/services/auditWriter.js) — one identity, one slug.
const APP_SLUG = 'agent-os';

let _tableExists = null;

async function checkActivityLogTableExists() {
  if (_tableExists !== null) return _tableExists;
  try {
    const result = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'activity_log'
        LIMIT 1`
    );
    _tableExists = result.rows.length > 0;
  } catch (_) {
    _tableExists = false;
  }
  return _tableExists;
}

/**
 * Resolve actor_user_id (integer), actor_ref (bubble_id), actor_name for a request.
 * Never throws — falls back to nulls so the write can still proceed as a
 * system-attributed-but-thin row rather than being dropped entirely.
 */
async function resolveActorContext(req) {
  const bubbleId = getRequestUserBubbleId(req);
  const legacyId = getRequestLegacyUserId(req);

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
      actorUserId: row?.id ?? null,
      actorRef: bubbleId || null,
      actorName: row?.name || row?.email || null
    };
  } catch (err) {
    console.error('[activityLog] Failed to resolve actor context:', err.message);
    return { actorUserId: null, actorRef: bubbleId || null, actorName: null };
  }
}

/**
 * Write one row to the shared activity_log table. Fire-and-forget safe —
 * never rejects, never throws.
 *
 * @param {object} opts
 * @param {object} [opts.req]         - Express request, used to resolve the actor + source_url
 * @param {string}  [opts.app]        - app slug (default: 'agent-os'). Pass 'claim-system' for
 *                                       claim receipts to give them a separate namespace in the feed.
 * @param {string}  opts.action       - REQUIRED. free text verb, e.g. 'create', 'send', 'approve'
 * @param {string}  [opts.entityType] - e.g. 'invoice' | 'customer' | 'claim_receipt'
 * @param {string|number} [opts.entityId]
 * @param {string}  [opts.entityLabel]
 * @param {string}  [opts.description] - the "{did what} {to what}" fragment, starting at the
 *                                       verb (e.g. "created customer Lim Enterprise"). The
 *                                       resolved actor name is prepended automatically to
 *                                       produce the SOP's "{who} {did what} {to what}" line.
 * @param {string[]} [opts.fields]     - changed column NAMES only, never values
 * @param {string}  [opts.sourceUrl]
 * @param {object}  [opts.metadata]
 * @param {string}  [opts.status]      - 'success' | 'failed'
 * @param {string}  [opts.errorMessage]
 * @param {string}  [opts.actorName]   - override, skips the DB lookup if already known
 */
async function writeActivity({
  req = null,
  app = null,
  action,
  entityType = null,
  entityId = null,
  entityLabel = null,
  description = null,
  fields = null,
  sourceUrl = null,
  metadata = null,
  status = 'success',
  errorMessage = null,
  actorName = null
} = {}) {
  if (!action) return;

  try {
    const exists = await checkActivityLogTableExists();
    if (!exists) return;

    let actorUserId = null;
    let actorRef = null;
    let resolvedActorName = actorName;

    if (req) {
      const actor = await resolveActorContext(req);
      actorUserId = actor.actorUserId;
      actorRef = actor.actorRef;
      if (!resolvedActorName) resolvedActorName = actor.actorName;
    }

    const finalDescription = description
      ? (resolvedActorName ? `${resolvedActorName} ${description}` : description)
      : null;

    await pool.query(
      `INSERT INTO activity_log
         (app, app_env, source_url, actor_kind, actor_user_id, actor_ref, actor_name,
          action, entity_type, entity_id, entity_label, description, fields, status, error_message, metadata)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
      [
        app || APP_SLUG,
        process.env.NODE_ENV === 'production' ? 'prod' : (process.env.NODE_ENV || 'dev'),
        sourceUrl || (req ? req.originalUrl : null),
        'user',
        actorUserId,
        actorRef,
        resolvedActorName,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        entityLabel,
        finalDescription,
        fields,
        status,
        errorMessage,
        metadata ? JSON.stringify(metadata) : '{}'
      ]
    );
  } catch (err) {
    console.error('[activityLog] Failed to write activity_log entry:', err.message);
  }
}

module.exports = { writeActivity, APP_SLUG };
