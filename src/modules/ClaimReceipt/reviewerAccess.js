const pool = require('../../core/database/pool');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

const REVIEW_ROLES = ['admin', 'hr'];

/**
 * Shared by claimReceiptRoutes (gates the review endpoints) and claimReceiptController (gates
 * submitting a claim on behalf of someone else) — both are the same trust tier.
 */
async function isReviewer(req) {
  const identity = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
  const result = await pool.query(
    'SELECT access_level FROM "user" WHERE bubble_id = $1 OR id::text = $1 LIMIT 1',
    [String(identity)]
  );
  const user = result.rows[0];
  const levels = Array.isArray(user?.access_level) ? user.access_level.map((r) => String(r).toLowerCase()) : [];
  return levels.some((level) => REVIEW_ROLES.includes(level));
}

const requireReviewer = async (req, res, next) => {
  try {
    const allowed = await isReviewer(req);
    if (!allowed) {
      return res.status(403).json({ error: 'Claim review is restricted to admin/HR access levels' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Authorization error' });
  }
};

module.exports = { isReviewer, requireReviewer, REVIEW_ROLES };
