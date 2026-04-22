const jwt = require('jsonwebtoken');
const pool = require('../database/pool');

const AUTH_URL = process.env.AUTH_URL || 'https://auth.atap.solar';

const AUTH_DEBUG_SOURCE_FILE = 'src/core/middleware/auth.js';
const AUTH_DEBUG_SOURCE_FUNCTION = 'resolveAuthenticatedUser';

function normalizePhoneDigits(value) {
    return String(value || '').replace(/\D/g, '').trim();
}

function buildPhoneCandidates(phone) {
    const digits = normalizePhoneDigits(phone);
    const candidates = new Set();

    if (!digits) return [];

    candidates.add(digits);
    if (digits.startsWith('0')) {
        candidates.add(`6${digits}`);
    }
    if (digits.startsWith('60')) {
        candidates.add(digits.slice(1));
    }

    return [...candidates].filter(Boolean);
}

function isTruthyEnvFlag(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isPlaytestAuthBypassEnabled(req) {
    if (!isTruthyEnvFlag(process.env.PLAYTEST_AUTH_BYPASS)) {
        return false;
    }

    if (!String(process.env.PLAYTEST_AUTH_PHONE || '').trim()) {
        return false;
    }

    const allowedHost = String(process.env.PLAYTEST_AUTH_ALLOWED_HOST || '').trim().toLowerCase();
    if (!allowedHost) {
        return true;
    }

    const requestHost = String(req?.get?.('host') || req?.headers?.host || '').trim().toLowerCase();
    return requestHost === allowedHost;
}

function normalizeDebugValue(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
}

function buildIdentityDebugDetails(decoded, candidates, matchedField, resolvedUser) {
    return {
        decoded,
        candidates,
        matchedField,
        resolvedUser: resolvedUser ? {
            user_id: resolvedUser.user_id,
            bubble_id: resolvedUser.bubble_id,
            linked_agent_profile: resolvedUser.linked_agent_profile,
            email: resolvedUser.email
        } : null
    };
}

async function writeUserDebugEvent(event) {
    try {
        await pool.query(
            `INSERT INTO user_debug (
                event_type,
                source_file,
                source_function,
                request_method,
                request_path,
                request_url,
                decoded_user_id,
                decoded_bubble_id,
                decoded_linked_agent_profile,
                decoded_email,
                matched_user_id,
                matched_bubble_id,
                matched_field,
                fallback_used,
                fallback_reason,
                details
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16
            )`,
            [
                normalizeDebugValue(event.eventType),
                normalizeDebugValue(event.sourceFile) || AUTH_DEBUG_SOURCE_FILE,
                normalizeDebugValue(event.sourceFunction) || AUTH_DEBUG_SOURCE_FUNCTION,
                normalizeDebugValue(event.requestMethod),
                normalizeDebugValue(event.requestPath),
                normalizeDebugValue(event.requestUrl),
                normalizeDebugValue(event.decodedUserId),
                normalizeDebugValue(event.decodedBubbleId),
                normalizeDebugValue(event.decodedLinkedAgentProfile),
                normalizeDebugValue(event.decodedEmail),
                normalizeDebugValue(event.matchedUserId),
                normalizeDebugValue(event.matchedBubbleId),
                normalizeDebugValue(event.matchedField),
                Boolean(event.fallbackUsed),
                normalizeDebugValue(event.fallbackReason),
                event.details ? JSON.stringify(event.details) : null
            ]
        );
    } catch (err) {
        console.warn('[AuthDebug] Failed to write user_debug row:', err.message);
    }
}

function extractIdentityCandidates(decoded) {
    return [
        decoded?.bubbleId,
        decoded?.bubble_id,
        decoded?.userId,
        decoded?.id,
        decoded?.linked_agent_profile,
        decoded?.email,
        decoded?.sub
    ]
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
        .map((value) => String(value).trim());
}

async function resolveAuthenticatedUser(decoded, context = {}) {
    const candidates = [...new Set(extractIdentityCandidates(decoded))];
    const decodedBubbleId = normalizeDebugValue(decoded?.bubbleId ?? decoded?.bubble_id);
    if (candidates.length === 0) {
        await writeUserDebugEvent({
            eventType: 'auth_identity_resolution_failed',
            sourceFile: AUTH_DEBUG_SOURCE_FILE,
            sourceFunction: AUTH_DEBUG_SOURCE_FUNCTION,
            requestMethod: context.method,
            requestPath: context.path,
            requestUrl: context.url,
            decodedUserId: decoded?.userId,
            decodedBubbleId,
            decodedLinkedAgentProfile: decoded?.linked_agent_profile,
            decodedEmail: decoded?.email,
            fallbackUsed: true,
            fallbackReason: 'No identity candidates were present on the JWT payload.',
            details: { decoded, candidates }
        });
        return null;
    }

    const result = await pool.query(
        `SELECT
            u.id::text AS user_id,
            u.bubble_id,
            u.linked_agent_profile,
            u.email,
            u.access_level,
            CASE
                WHEN u.bubble_id = ANY($1::text[]) THEN 'bubble_id'
                WHEN u.id::text = ANY($1::text[]) THEN 'user_id'
                WHEN u.linked_agent_profile = ANY($1::text[]) THEN 'linked_agent_profile'
                WHEN u.email = ANY($1::text[]) THEN 'email'
                ELSE 'unknown'
            END AS matched_field
         FROM "user" u
         WHERE u.id::text = ANY($1::text[])
            OR u.bubble_id = ANY($1::text[])
            OR u.linked_agent_profile = ANY($1::text[])
            OR u.email = ANY($1::text[])
         ORDER BY
            CASE
                WHEN u.bubble_id = ANY($1::text[]) THEN 1
                WHEN u.id::text = ANY($1::text[]) THEN 2
                WHEN u.linked_agent_profile = ANY($1::text[]) THEN 3
                WHEN u.email = ANY($1::text[]) THEN 4
                ELSE 5
            END,
            u.id DESC
         LIMIT 1`,
        [candidates]
    );

    if (result.rows.length === 0) {
        await writeUserDebugEvent({
            eventType: 'auth_identity_resolution_failed',
            sourceFile: AUTH_DEBUG_SOURCE_FILE,
            sourceFunction: AUTH_DEBUG_SOURCE_FUNCTION,
            requestMethod: context.method,
            requestPath: context.path,
            requestUrl: context.url,
            decodedUserId: decoded?.userId,
            decodedBubbleId,
            decodedLinkedAgentProfile: decoded?.linked_agent_profile,
            decodedEmail: decoded?.email,
            fallbackUsed: true,
            fallbackReason: 'No row matched any JWT identity candidate.',
            details: buildIdentityDebugDetails(decoded, candidates, null, null)
        });
        return null;
    }

    const user = result.rows[0];
    const fallbackUsed = user.matched_field !== 'bubble_id';
    if (fallbackUsed) {
        let fallbackReason = 'JWT identity resolved through a non-primary path.';
        if (user.matched_field === 'user_id') {
            fallbackReason = decodedBubbleId
                ? 'JWT bubble_id did not resolve to a user; user_id matched instead.'
                : 'JWT bubble_id was missing; user_id matched instead.';
        } else if (user.matched_field === 'linked_agent_profile') {
            fallbackReason = decodedBubbleId
                ? 'JWT bubble_id did not resolve to a user; linked_agent_profile matched instead.'
                : 'JWT bubble_id was missing; linked_agent_profile matched instead.';
        } else if (user.matched_field === 'email') {
            fallbackReason = decodedBubbleId
                ? 'JWT bubble_id did not resolve to a user; email matched instead.'
                : 'JWT bubble_id was missing; email matched instead.';
        }

        await writeUserDebugEvent({
            eventType: 'auth_identity_fallback',
            sourceFile: AUTH_DEBUG_SOURCE_FILE,
            sourceFunction: AUTH_DEBUG_SOURCE_FUNCTION,
            requestMethod: context.method,
            requestPath: context.path,
            requestUrl: context.url,
            decodedUserId: decoded?.userId,
            decodedBubbleId,
            decodedLinkedAgentProfile: decoded?.linked_agent_profile,
            decodedEmail: decoded?.email,
            matchedUserId: user.user_id,
            matchedBubbleId: user.bubble_id,
            matchedField: user.matched_field,
            fallbackUsed: true,
            fallbackReason,
            details: buildIdentityDebugDetails(decoded, candidates, user.matched_field, user)
        });
    }

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

async function resolvePlaytestBypassUser(req) {
    if (!isPlaytestAuthBypassEnabled(req)) {
        return null;
    }

    const phoneCandidates = buildPhoneCandidates(process.env.PLAYTEST_AUTH_PHONE);
    if (phoneCandidates.length === 0) {
        return null;
    }

    const result = await pool.query(
        `SELECT
            u.id::text AS user_id,
            u.bubble_id,
            u.linked_agent_profile,
            u.email,
            u.access_level,
            a.name AS agent_name,
            a.contact AS agent_contact
         FROM "user" u
         LEFT JOIN agent a
           ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
         WHERE regexp_replace(COALESCE(a.contact, ''), '\D', '', 'g') = ANY($1::text[])
         ORDER BY u.id DESC
         LIMIT 1`,
        [phoneCandidates]
    );

    const user = result.rows[0];
    if (!user) {
        console.warn(`[Auth] Playtest bypass enabled but no user matched phone ${process.env.PLAYTEST_AUTH_PHONE}`);
        return null;
    }

    return {
        userId: user.user_id,
        id: user.user_id,
        bubbleId: user.bubble_id,
        bubble_id: user.bubble_id,
        linked_agent_profile: user.linked_agent_profile,
        email: user.email || null,
        access_level: user.access_level || [],
        name: user.agent_name || user.email || 'Playtest User',
        contact: user.agent_contact || process.env.PLAYTEST_AUTH_PHONE,
        phone: user.agent_contact || process.env.PLAYTEST_AUTH_PHONE,
        auth_bypass: 'playtest-phone'
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
        const bypassUser = await resolvePlaytestBypassUser(req);
        if (bypassUser) {
            req.user = bypassUser;
            return next();
        }
        return handleAuthFail();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const resolvedUser = await resolveAuthenticatedUser(decoded, {
            method: req.method,
            path: req.originalUrl,
            url: req.url
        });
        if (!resolvedUser) {
            const bypassUser = await resolvePlaytestBypassUser(req);
            if (bypassUser) {
                req.user = bypassUser;
                return next();
            }
            return handleAuthFail();
        }

        req.user = resolvedUser;
        next();
    } catch (err) {
        if (err?.code && err.code !== 'ERR_JWT_EXPIRED') {
            console.error('[Auth] Request authentication failed:', err.message);
        }
        const bypassUser = await resolvePlaytestBypassUser(req);
        if (bypassUser) {
            req.user = bypassUser;
            return next();
        }
        return handleAuthFail();
    }
};

module.exports = { requireAuth, isPlaytestAuthBypassEnabled };
