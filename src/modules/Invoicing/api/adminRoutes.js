const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');

const router = express.Router();

/**
 * Admin Authorization Middleware
 * Only allows users with phone "01121000099"
 */
const requireAdminAccess = async (req, res, next) => {
    if (!req.user || !req.user.userId) {
        return res.status(401).send('Unauthorized');
    }

    const userId = req.user.userId;
    let client = null;

    try {
        client = await pool.connect();
        const query = `
            SELECT a.contact
            FROM "user" u
            JOIN agent a ON u.linked_agent_profile = a.bubble_id
            WHERE u.id::text = $1 OR u.bubble_id = $1
            LIMIT 1
        `;
        const result = await client.query(query, [String(userId)]);

        if (result.rows.length > 0 && result.rows[0].contact && result.rows[0].contact.includes('01121000099')) {
            next();
        } else {
            res.status(403).send('Access Denied: Admin privileges required.');
        }
    } catch (err) {
        console.error('Admin Auth Error:', err);
        res.status(500).send('Authorization Error');
    } finally {
        if (client) client.release();
    }
};

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
 * Patch: Refill invoice.package_id from invoice_item.linked_package
 * where invoice_item.is_a_package is true.
 */
async function runFixPackagesPatch(client, res) {
    await client.query('BEGIN');
    const logs = [];
    let updated = 0;

    try {
        // Find invoices with missing package_id
        const candidates = await client.query(`
            SELECT bubble_id, invoice_number 
            FROM invoice 
            WHERE (package_id IS NULL OR package_id = '')
        `);

        logs.push(`Analyzing ${candidates.rows.length} invoices with missing package_id...`);

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
                        'UPDATE invoice SET package_id = $1, updated_at = NOW() WHERE bubble_id = $2',
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
                summary: `Successfully refilled ${updated} invoice package IDs.`,
                logs: logs
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
}

module.exports = router;
