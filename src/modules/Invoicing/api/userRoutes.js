const express = require('express');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const jwt = require('jsonwebtoken');
const { getCanonicalUserIdentity } = require('../../../core/auth/userIdentity');

const router = express.Router();

function sanitizeUserForClient(user = {}) {
    return {
        bubbleId: user.bubbleId || user.bubble_id || null,
        bubble_id: user.bubble_id || user.bubbleId || null,
        linked_agent_profile: user.linked_agent_profile || null,
        email: user.email || null,
        access_level: user.access_level || [],
        name: user.name || null,
        contact: user.contact || null,
        profile_picture: user.profile_picture || null,
        address: user.address || null,
        agent_type: user.agent_type || null,
        introducer: user.introducer || null,
        agent_code: user.agent_code || null
    };
}

/**
 * Debug Passkey Middleware
 */
const requireDebugPasskey = (req, res, next) => {
    const passkey = req.headers['x-debug-passkey'] || req.query.passkey;
    if (passkey === 'super-secret-debug-2025') {
        return next();
    }
    res.status(403).json({ success: false, error: 'Unauthorized debug access' });
};

/**
 * GET /api/user/me
 * Get current user profile with agent details
 */
router.get('/api/user/me', requireAuth, async (req, res) => {
    let client = null;
    try {
        const userIdentity = getCanonicalUserIdentity(req);
        client = await pool.connect();
        
        const query = `
            SELECT u.name, u.contact, u.email, u.profile_picture,
                   u.address, u.agent_type, u.introducer, u.agent_code
            FROM "user" u
            WHERE u.id::text = $1 OR u.bubble_id = $1
            LIMIT 1
        `;
        const result = await client.query(query, [String(userIdentity)]);
        
        const dbUser = result.rows[0] || {};
        const safeUser = sanitizeUserForClient({
            ...req.user,
            name: dbUser.name || req.user.name,
            contact: dbUser.contact || req.user.contact,
            email: dbUser.email || req.user.email,
            profile_picture: dbUser.profile_picture || req.user.profile_picture,
            address: dbUser.address || req.user.address,
            agent_type: dbUser.agent_type || req.user.agent_type,
            introducer: dbUser.introducer || req.user.introducer,
            agent_code: dbUser.agent_code || req.user.agent_code
        });

        res.json({
            success: true,
            user: safeUser
        });
    } catch (err) {
        console.error('Error in /api/user/me:', err);
        res.json({
            success: true,
            user: sanitizeUserForClient(req.user)
        });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/debug/users
 * List users for debugging
 */
router.get('/api/debug/users', requireDebugPasskey, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT id, email, name, contact, role, bubble_id, linked_agent_profile FROM "user" LIMIT 50');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/debug/login-as
 * Impersonate a user
 */
router.post('/api/debug/login-as', requireDebugPasskey, async (req, res) => {
    const { userId } = req.body;
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM "user" WHERE id::text = $1 OR bubble_id = $1', [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email, 
                role: user.role,
                bubble_id: user.bubble_id
            }, 
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.json({ success: true, token, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
