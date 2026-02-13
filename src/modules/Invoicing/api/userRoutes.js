const express = require('express');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

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
        const userId = req.user.userId || req.user.id;
        client = await pool.connect();
        
        const query = `
            SELECT a.name, a.contact, u.email
            FROM "user" u
            LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
            WHERE u.id::text = $1 OR u.bubble_id = $1
            LIMIT 1
        `;
        const result = await client.query(query, [String(userId)]);
        
        const dbUser = result.rows[0] || {};

        res.json({
            success: true,
            user: {
                ...req.user,
                name: dbUser.name || req.user.name,
                contact: dbUser.contact || req.user.contact,
                email: dbUser.email || req.user.email
            }
        });
    } catch (err) {
        console.error('Error in /api/user/me:', err);
        res.json({
            success: true,
            user: req.user
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
        const result = await client.query('SELECT id, email, name, role, bubble_id, linked_agent_profile FROM "user" LIMIT 50');
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
