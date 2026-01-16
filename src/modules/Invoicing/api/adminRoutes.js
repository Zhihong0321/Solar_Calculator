const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');

const router = express.Router();

/**
 * Admin Authorization Middleware
 * Only allows users with phone number containing "01121000099"
 */
const requireAdminAccess = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).send('Unauthorized');
    }

    // 1. Check JWT payload directly (in case phone is encoded there)
    const jwtPayload = JSON.stringify(req.user);
    if (jwtPayload.includes('01121000099')) {
        return next();
    }

    const userId = req.user.userId || req.user.id || req.user.sub;
    if (!userId) {
        return res.status(403).send('Access Denied: User identification missing.');
    }

    let client = null;
    try {
        client = await pool.connect();

        // 2. Search for any agent contact associated with this user
        // We check by u.id, u.bubble_id, u.email, and even agent_code fallbacks
        const query = `
            SELECT a.contact, u.email, a.name
            FROM "user" u
            LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
            WHERE u.id::text = $1 
               OR u.bubble_id = $1 
               OR u.email = $1
               OR a.bubble_id = $1
        `;
        const result = await client.query(query, [String(userId)]);

        if (result.rows.length > 0) {
            for (const row of result.rows) {
                if (row.contact && row.contact.includes('01121000099')) {
                    return next();
                }
            }
        }

        // 3. Last resort: check if the userId itself contains the target number
        if (String(userId).includes('01121000099')) {
            return next();
        }

        res.status(403).send('Access Denied: Your account is not authorized for the ADMIN Panel.');
    } catch (err) {
        console.error('Admin Auth Error:', err);
        res.status(500).send('Internal Authorization Error');
    } finally {
        if (client) client.release();
    }
};

/**
 * POST /api/admin/logout
 * Clears authentication cookies
 */
router.post('/api/admin/logout', (req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    res.clearCookie('auth_token', { path: '/', domain: '.atap.solar' });
    res.json({ success: true });
});

/**
 * GET /admin
 * Serves Admin Panel
 */
router.get('/admin', requireAuth, requireAdminAccess, (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/admin_panel.html'));
});

/**
 * POST /api/admin/patch
 * Routes to specific maintenance logic
 */
router.post('/api/admin/patch', requireAuth, requireAdminAccess, async (req, res) => {
    const { action } = req.body;
    let client = null;

    try {
        client = await pool.connect();
        if (action === 'fix-packages') {
            await runFixPackagesPatch(client, res);
        } else if (action === 'fix-bubble-tokens') {
            await runFixBubbleTokensPatch(client, res);
        } else {
            res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * Patch: Refill invoice.linked_package from invoice_item.linked_package
 * where invoice_item.is_a_package is true.
 */
async function runFixPackagesPatch(client, res) {
    await client.query('BEGIN');
    const logs = [];
    let updated = 0;

    try {
        // Find invoices with missing linked_package
        const candidates = await client.query(`
            SELECT bubble_id, invoice_number 
            FROM invoice 
            WHERE (linked_package IS NULL OR linked_package = '')
        `);

        logs.push(`Analyzing ${candidates.rows.length} invoices with missing linked_package...`);

        for (const inv of candidates.rows) {
            // Find the package item for this invoice
            // Join condition: item.linked_invoice matches invoice.bubble_id
            const itemRes = await client.query(`
                SELECT linked_package, bubble_id 
                FROM invoice_item 
                WHERE linked_invoice = $1 
                AND is_a_package = true 
                LIMIT 1
            `, [inv.bubble_id]);

            if (itemRes.rows.length > 0) {
                const pkgId = itemRes.rows[0].linked_package;
                if (pkgId) {
                    await client.query(
                        'UPDATE invoice SET linked_package = $1, updated_at = NOW() WHERE bubble_id = $2',
                        [pkgId, inv.bubble_id]
                    );
                    updated++;
                    logs.push(`[FIXED] ${inv.invoice_number}: Found package ${pkgId} in item ${itemRes.rows[0].bubble_id}`);
                }
            }
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            data: {
                summary: `Successfully refilled ${updated} invoice linked_package values.`,
                logs: logs
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
}

/**
 * Patch: Set share_token = bubble_id and share_enabled = true
 * for all invoices where share_token is NULL or empty.
 */
async function runFixBubbleTokensPatch(client, res) {
    await client.query('BEGIN');
    try {
        const result = await client.query(`
            UPDATE invoice 
            SET 
                share_token = bubble_id,
                share_enabled = true,
                updated_at = NOW()
            WHERE (share_token IS NULL OR share_token = '')
               OR (share_enabled IS NULL OR share_enabled = false)
        `);

        await client.query('COMMIT');
        
        res.json({
            success: true,
            data: {
                summary: `Successfully enabled share tokens for ${result.rowCount} invoices.`,
                logs: [`Updated ${result.rowCount} rows using bubble_id as the share_token.`]
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
}

module.exports = router;
