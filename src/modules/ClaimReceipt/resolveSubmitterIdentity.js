const pool = require('../../core/database/pool');
const { getRequestLegacyUserId, getRequestUserBubbleId } = require('../../core/auth/userIdentity');

/**
 * Resolves the real, authenticated identity behind a request — same lookup /api/agent/me uses
 * (server.js) — so submitted_by/approved_by can be stamped server-side instead of trusted from
 * request-body text. Returns null if the request somehow reaches here without a resolvable user
 * (shouldn't happen behind requireAuth, but the caller must not fall back to client input).
 */
async function resolveSubmitterIdentity(req) {
  const userId = getRequestLegacyUserId(req);
  const bubbleId = getRequestUserBubbleId(req);
  if (!userId && !bubbleId) return null;

  const result = await pool.query(
    `SELECT a.name, u.email
       FROM "user" u
       LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
      WHERE u.id::text = $1 OR (u.bubble_id = $2 AND u.bubble_id IS NOT NULL AND u.bubble_id != '')
      LIMIT 1`,
    [String(userId || ''), String(bubbleId || '')]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    userId,
    name: row.name || row.email || 'Unknown',
    email: row.email || null
  };
}

module.exports = { resolveSubmitterIdentity };
