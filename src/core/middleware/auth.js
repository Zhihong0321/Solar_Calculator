const jwt = require('jsonwebtoken');
const pool = require('../database/pool');

const AUTH_URL = process.env.AUTH_URL || 'https://auth.atap.solar';

function extractIdentityCandidates(decoded) {
    return [
        decoded?.userId,
        decoded?.id,
        decoded?.bubbleId,
        decoded?.bubble_id,
        decoded?.linked_agent_profile,
        decoded?.email,
        decoded?.sub
    ]
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
        .map((value) => String(value).trim());
}

async function resolveAuthenticatedUser(decoded) {
    const candidates = [...new Set(extractIdentityCandidates(decoded))];
    if (candidates.length === 0) {
        return null;
    }

    const result = await pool.query(
        `SELECT
            u.id::text AS user_id,
            u.bubble_id,
            u.linked_agent_profile,
            u.email,
            u.access_level
         FROM "user" u
         WHERE u.id::text = ANY($1::text[])
            OR u.bubble_id = ANY($1::text[])
            OR u.linked_agent_profile = ANY($1::text[])
            OR u.email = ANY($1::text[])
         ORDER BY
            CASE
                WHEN u.id::text = ANY($1::text[]) THEN 1
                WHEN u.bubble_id = ANY($1::text[]) THEN 2
                WHEN u.linked_agent_profile = ANY($1::text[]) THEN 3
                WHEN u.email = ANY($1::text[]) THEN 4
                ELSE 5
            END,
            u.id DESC
         LIMIT 1`,
        [candidates]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const user = result.rows[0];
    return {
        ...decoded,
        userId: user.user_id,
        id: user.user_id,
        bubbleId: user.bubble_id,
        bubble_id: user.bubble_id,
        linked_agent_profile: user.linked_agent_profile,
        email: user.email || decoded?.email || null,
        access_level: user.access_level || decoded?.access_level || []
    };
}

/**
 * Shared authentication middleware.
 * Ensures the user has a valid JWT in their cookies.
 */
const requireAuth = async (req, res, next) => {
    const token = req.cookies.auth_token;

    const handleAuthFail = () => {
        // If it's an API request, return 401 JSON
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized', redirect: AUTH_URL });
        }
        // Otherwise redirect
        const returnTo = encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
        return res.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
    };

    if (!token) {
        return handleAuthFail();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const resolvedUser = await resolveAuthenticatedUser(decoded);
        if (!resolvedUser) {
            return handleAuthFail();
        }

        req.user = resolvedUser;
        next();
    } catch (err) {
        if (err?.code && err.code !== 'ERR_JWT_EXPIRED') {
            console.error('[Auth] Request authentication failed:', err.message);
        }
        return handleAuthFail();
    }
};

module.exports = { requireAuth };
