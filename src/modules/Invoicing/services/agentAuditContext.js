const SOURCE_APP = 'agent-os';
const APPLICATION_NAME = 'agent-os';

function normalizeTrimmed(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRole(role, accessLevel, hasAgentIdentity) {
  const directRole = normalizeTrimmed(role);
  if (directRole) return directRole;

  if (Array.isArray(accessLevel)) {
    const normalizedLevels = accessLevel
      .map((level) => normalizeTrimmed(level))
      .filter(Boolean);

    if (normalizedLevels.length > 0) {
      return normalizedLevels.join(', ');
    }
  }

  return hasAgentIdentity ? 'agent' : null;
}

function extractIdentityCandidate(authUser) {
  return normalizeTrimmed(
    authUser?.userId
    || authUser?.id
    || authUser?.bubbleId
    || authUser?.bubble_id
    || authUser?.sub
  );
}

async function resolveAgentAuditContext(client, authUser = {}) {
  const identityCandidate = extractIdentityCandidate(authUser);
  let row = null;

  if (identityCandidate) {
    const result = await client.query(
      `SELECT
          u.id::text AS user_id,
          u.bubble_id AS user_bubble_id,
          u.access_level,
          u.email,
          a.name AS agent_name,
          a.contact AS agent_phone,
          a.bubble_id AS agent_bubble_id
       FROM "user" u
       LEFT JOIN agent a
         ON u.linked_agent_profile = a.bubble_id
         OR a.linked_user_login = u.bubble_id
       WHERE u.id::text = $1
          OR u.bubble_id = $1
       ORDER BY
          CASE
            WHEN u.id::text = $1 THEN 1
            WHEN u.bubble_id = $1 THEN 2
            ELSE 3
          END
       LIMIT 1`,
      [identityCandidate]
    );

    row = result.rows[0] || null;
  }

  const userPhone = normalizeTrimmed(
    row?.agent_phone
    || authUser?.contact
    || authUser?.phone
    || authUser?.mobile_number
  );

  if (!userPhone) {
    throw new Error('Authenticated user phone is required for invoice audit stamping.');
  }

  const hasAgentIdentity = Boolean(row?.agent_name || row?.agent_phone || row?.agent_bubble_id);

  return {
    userPhone,
    userId: normalizeTrimmed(row?.user_id || identityCandidate),
    userName: normalizeTrimmed(
      row?.agent_name
      || authUser?.name
      || authUser?.displayName
      || authUser?.email
      || row?.email
    ),
    userRole: normalizeRole(
      authUser?.role,
      row?.access_level || authUser?.access_level,
      hasAgentIdentity
    ),
    sourceApp: SOURCE_APP,
    applicationName: APPLICATION_NAME
  };
}

async function stampAgentAuditContext(client, auditContext) {
  const context = auditContext || {};
  const userPhone = normalizeTrimmed(context.userPhone);

  if (!userPhone) {
    throw new Error('Authenticated user phone is required for invoice audit stamping.');
  }

  await client.query(
    `SELECT
        set_config('application_name', $1, true),
        set_config('app.user_phone', $2, true),
        set_config('app.user_id', $3, true),
        set_config('app.user_name', $4, true),
        set_config('app.user_role', $5, true),
        set_config('app.source_app', $6, true)`,
    [
      normalizeTrimmed(context.applicationName) || APPLICATION_NAME,
      userPhone,
      normalizeTrimmed(context.userId) || '',
      normalizeTrimmed(context.userName) || '',
      normalizeTrimmed(context.userRole) || '',
      normalizeTrimmed(context.sourceApp) || SOURCE_APP
    ]
  );
}

async function beginAgentAuditTransaction(client, auditContext) {
  await client.query('BEGIN');
  await stampAgentAuditContext(client, auditContext);
}

module.exports = {
  SOURCE_APP,
  APPLICATION_NAME,
  resolveAgentAuditContext,
  stampAgentAuditContext,
  beginAgentAuditTransaction
};
