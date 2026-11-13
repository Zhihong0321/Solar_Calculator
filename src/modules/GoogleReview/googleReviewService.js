const pool = require('../../core/database/pool');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

const AGENT_BONUS = 15;
const CUSTOMER_BONUS = 15;
const REVIEWER_ROLES = ['hr', 'kc'];

// SEDA approved = seda_status or mapper_status says approved (any letter case).
const SEDA_APPROVED_SQL = `(
  LOWER(TRIM(COALESCE(s.seda_status, ''))) IN ('approved', 'approved by seda')
  OR LOWER(TRIM(COALESCE(s.mapper_status, ''))) = 'approved'
)`;

const STATE_ALIASES = [
  [/\bnegeri\s*sembilan\b|\bn\.?\s*sembilan\b/i, 'Negeri Sembilan'],
  [/\bpulau\s*pinang\b|\bpenang\b|\bp\.?\s*pinang\b/i, 'Pulau Pinang'],
  [/\bkuala\s*lumpur\b|\bw\.?p\.?\s*kl\b/i, 'Kuala Lumpur'],
  [/\bmelaka\b|\bmalacca\b/i, 'Melaka'],
  [/\bjohor\b/i, 'Johor'],
  [/\bselangor\b/i, 'Selangor'],
  [/\bpahang\b/i, 'Pahang'],
  [/\bperak\b/i, 'Perak'],
  [/\bkedah\b/i, 'Kedah'],
  [/\bkelantan\b/i, 'Kelantan'],
  [/\bterengganu\b/i, 'Terengganu'],
  [/\bperlis\b/i, 'Perlis'],
  [/\bsabah\b/i, 'Sabah'],
  [/\bsarawak\b/i, 'Sarawak'],
  [/\bputrajaya\b/i, 'Putrajaya'],
  [/\blabuan\b/i, 'Labuan']
];

/** Malaysian postcode prefix -> state (first two digits). */
function stateFromPostcode(postcode) {
  const n = Number(String(postcode).slice(0, 2));
  if (!Number.isFinite(n)) return null;
  if (n <= 2) return 'Perlis';
  if (n <= 9) return 'Kedah';
  if (n <= 14) return 'Pulau Pinang';
  if (n <= 18) return 'Kelantan';
  if (n <= 24) return 'Terengganu';
  if (n <= 28 || n === 39 || n === 49) return 'Pahang';
  if (n <= 36) return 'Perak';
  if (n <= 48) return 'Selangor';
  if (n <= 60) return 'Kuala Lumpur';
  if (n === 62) return 'Putrajaya';
  if (n <= 69) return 'Selangor';
  if (n <= 73) return 'Negeri Sembilan';
  if (n <= 78) return 'Melaka';
  if (n <= 86) return 'Johor';
  if (n === 87) return 'Labuan';
  if (n <= 91) return 'Sabah';
  if (n <= 98) return 'Sarawak';
  return null;
}

function matchState(text) {
  const value = String(text || '');
  for (const [pattern, state] of STATE_ALIASES) {
    if (pattern.test(value)) return state;
  }
  return null;
}

/**
 * State of the installation, from SEDA: the state field, else a state named in the
 * installation address, else the postcode (SEDA postcode or the 5-digit code in the address).
 */
function resolveInstallationState(row) {
  const fromField = matchState(row.seda_state);
  if (fromField) return fromField;
  const fromAddress = matchState(row.address);
  if (fromAddress) return fromAddress;
  const postcode = /^\d{5}$/.test(String(row.seda_postcode || '').trim())
    ? String(row.seda_postcode).trim()
    : (String(row.address || '').match(/\b(\d{5})\b/) || [])[1];
  return (postcode && stateFromPostcode(postcode)) || 'Unknown';
}

/**
 * The logged-in user, read from the "user" table only (never the agent table).
 * Returns null when the session has no resolvable user.
 */
async function resolveActor(req) {
  const bubbleId = getRequestUserBubbleId(req);
  const userId = getRequestLegacyUserId(req);
  if (!bubbleId && !userId) return null;

  const result = await pool.query(
    `SELECT u.id::text AS user_id, u.name, u.email, u.access_level
       FROM "user" u
      WHERE (u.bubble_id = $1 AND u.bubble_id IS NOT NULL AND u.bubble_id <> '')
         OR u.id::text = $2
      ORDER BY CASE WHEN u.bubble_id = $1 THEN 1 ELSE 2 END
      LIMIT 1`,
    [String(bubbleId || ''), String(userId || '')]
  );
  const row = result.rows[0];
  if (!row) return null;

  const roles = Array.isArray(row.access_level)
    ? row.access_level.map((r) => String(r).trim().toLowerCase())
    : [];

  return {
    userId: row.user_id,
    name: row.name || row.email || 'Unknown',
    isReviewer: roles.some((r) => REVIEWER_ROLES.includes(r))
  };
}

/**
 * Malaysian mobile numbers only. Accepts 012-345 6789, +6012..., 6012...; stores as 0123456789.
 * Returns null when the input is not a valid mobile number.
 */
function normalizeMobile(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('60')) digits = `0${digits.slice(2)}`;
  return /^01\d{8,9}$/.test(digits) ? digits : null;
}

async function searchApprovedCustomers(query) {
  const q = String(query || '').trim();
  const like = `%${q}%`;
  const result = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (c.customer_id)
              c.customer_id,
              c.name,
              c.phone,
              s.applicant_phone,
              s.bubble_id AS seda_bubble_id,
              s.state AS seda_state,
              s.postcode AS seda_postcode,
              COALESCE(NULLIF(s.installation_address, ''), c.address) AS address,
              g.id AS claim_id,
              g.status AS claim_status,
              g.submitted_by_name AS claim_submitted_by
         FROM seda_registration s
         JOIN customer c ON c.customer_id = s.linked_customer
         LEFT JOIN google_review_claim g
                ON g.customer_id = c.customer_id AND g.status <> 'Rejected'
        WHERE ${SEDA_APPROVED_SQL}
          AND ($1 = '' OR c.name ILIKE $2 OR c.phone ILIKE $2 OR s.applicant_phone ILIKE $2
               OR s.installation_address ILIKE $2 OR c.address ILIKE $2 OR s.state ILIKE $2)
        ORDER BY c.customer_id, s.created_at DESC NULLS LAST
     ) t
     ORDER BY t.name ASC NULLS LAST
     LIMIT 1000`,
    [q, like]
  );

  const rows = result.rows.map(({ seda_state, seda_postcode, ...row }) => ({
    ...row,
    state: resolveInstallationState({ seda_state, seda_postcode, address: row.address })
  }));

  // Group order: states A–Z, "Unknown" last; names A–Z within a state.
  const byState = new Map();
  for (const row of rows) {
    if (!byState.has(row.state)) byState.set(row.state, []);
    byState.get(row.state).push(row);
  }
  return [...byState.entries()]
    .sort(([a], [b]) => (a === 'Unknown') - (b === 'Unknown') || a.localeCompare(b))
    .map(([state, customers]) => ({ state, customers }));
}

/** Same eligibility as the list (SEDA approved), so a claim can only target a listed customer. */
async function getApprovedCustomer(customerId) {
  const result = await pool.query(
    `SELECT c.customer_id, c.name, s.bubble_id AS seda_bubble_id
       FROM seda_registration s
       JOIN customer c ON c.customer_id = s.linked_customer
      WHERE c.customer_id = $1 AND ${SEDA_APPROVED_SQL}
      ORDER BY s.created_at DESC NULLS LAST
      LIMIT 1`,
    [customerId]
  );
  return result.rows[0] || null;
}

async function createClaim({ customer, tngMobile, photoUrl, photoMime, actor }) {
  const result = await pool.query(
    `INSERT INTO google_review_claim
       (customer_id, customer_name, seda_bubble_id, tng_mobile, photo_url, photo_mime,
        agent_bonus, customer_bonus, submitted_by_user_id, submitted_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      customer.customer_id,
      customer.name,
      customer.seda_bubble_id,
      tngMobile,
      photoUrl,
      photoMime,
      AGENT_BONUS,
      CUSTOMER_BONUS,
      actor.userId,
      actor.name
    ]
  );
  return result.rows[0];
}

async function listMine(userId) {
  const result = await pool.query(
    'SELECT * FROM google_review_claim WHERE submitted_by_user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

async function listAll(status) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE status = $1';
  }
  const result = await pool.query(
    `SELECT * FROM google_review_claim ${where} ORDER BY created_at DESC LIMIT 1000`,
    params
  );
  return result.rows;
}

/**
 * Allowed moves: Pending -> Approved | Rejected, Approved -> Paid.
 * Returns { claim } on success, { error, code } otherwise.
 */
async function decide(id, nextStatus, actor, remark) {
  const current = await pool.query('SELECT * FROM google_review_claim WHERE id = $1', [id]);
  const claim = current.rows[0];
  if (!claim) return { error: 'Claim not found', code: 404 };

  const allowed = {
    Pending: ['Approved', 'Rejected'],
    Approved: ['Paid']
  };
  if (!(allowed[claim.status] || []).includes(nextStatus)) {
    return { error: `A ${claim.status} claim cannot be marked ${nextStatus}`, code: 409 };
  }

  let sql;
  if (nextStatus === 'Paid') {
    sql = `UPDATE google_review_claim
              SET status = 'Paid', paid_by_user_id = $2, paid_by_name = $3, paid_at = NOW(),
                  remark = COALESCE($4, remark), updated_at = NOW()
            WHERE id = $1 AND status = 'Approved'
            RETURNING *`;
  } else {
    sql = `UPDATE google_review_claim
              SET status = $5, reviewed_by_user_id = $2, reviewed_by_name = $3, reviewed_at = NOW(),
                  remark = $4, updated_at = NOW()
            WHERE id = $1 AND status = 'Pending'
            RETURNING *`;
  }
  const params = [id, actor.userId, actor.name, remark || null];
  if (nextStatus !== 'Paid') params.push(nextStatus);

  const result = await pool.query(sql, params);
  if (!result.rows[0]) return { error: 'Claim was changed by someone else. Refresh and try again.', code: 409 };
  return { claim: result.rows[0] };
}

module.exports = {
  AGENT_BONUS,
  CUSTOMER_BONUS,
  SEDA_APPROVED_SQL,
  resolveInstallationState,
  resolveActor,
  normalizeMobile,
  searchApprovedCustomers,
  getApprovedCustomer,
  createClaim,
  listMine,
  listAll,
  decide
};
