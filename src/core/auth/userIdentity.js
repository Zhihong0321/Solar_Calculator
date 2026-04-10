function normalizeIdentityValue(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function getRequestUserBubbleId(req) {
  return normalizeIdentityValue(req?.user?.bubbleId ?? req?.user?.bubble_id);
}

function getRequestLegacyUserId(req) {
  return normalizeIdentityValue(req?.user?.userId ?? req?.user?.id);
}

function getRequestAgentBubbleId(req) {
  return normalizeIdentityValue(req?.user?.linked_agent_profile);
}

function getCanonicalUserIdentity(req) {
  return getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
}

function buildIdentityCandidates(input) {
  if (typeof input === 'string' || typeof input === 'number') {
    return [normalizeIdentityValue(input)].filter(Boolean);
  }

  return [
    getRequestUserBubbleId(input),
    getRequestLegacyUserId(input)
  ].filter(Boolean);
}

async function resolveAuthenticatedUserRecord(db, input) {
  const candidates = [...new Set(buildIdentityCandidates(input))];
  if (candidates.length === 0) {
    return null;
  }

  const result = await db.query(
    `SELECT
        u.id::text AS user_id,
        u.bubble_id,
        u.linked_agent_profile,
        u.email,
        u.access_level
     FROM "user" u
     WHERE u.bubble_id = ANY($1::text[])
        OR u.id::text = ANY($1::text[])
     ORDER BY
        CASE
          WHEN u.bubble_id = ANY($1::text[]) THEN 1
          WHEN u.id::text = ANY($1::text[]) THEN 2
          ELSE 3
        END,
        u.id DESC
     LIMIT 1`,
    [candidates]
  );

  return result.rows[0] || null;
}

async function resolveLegacyUserId(db, input) {
  const user = await resolveAuthenticatedUserRecord(db, input);
  return normalizeIdentityValue(user?.user_id);
}

async function resolveAgentBubbleId(db, input) {
  const directAgentBubbleId = typeof input === 'object' ? getRequestAgentBubbleId(input) : null;
  if (directAgentBubbleId) {
    return directAgentBubbleId;
  }

  const user = await resolveAuthenticatedUserRecord(db, input);
  return normalizeIdentityValue(user?.linked_agent_profile);
}

module.exports = {
  normalizeIdentityValue,
  getRequestUserBubbleId,
  getRequestLegacyUserId,
  getRequestAgentBubbleId,
  getCanonicalUserIdentity,
  resolveAuthenticatedUserRecord,
  resolveLegacyUserId,
  resolveAgentBubbleId
};
