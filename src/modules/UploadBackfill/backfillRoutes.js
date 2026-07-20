/**
 * src/modules/UploadBackfill/backfillRoutes.js
 *
 * Protected, narrow-scope internal endpoint that runs the legacy-uploads ->
 * R2 backfill INSIDE the already-deployed app. This exists because running
 * scripts/migrate_uploads_to_r2.js requires shell access to the Railway
 * container, which is not available to the operator driving this migration.
 *
 * Running the same logic as an in-app route instead of an external script
 * means:
 *   - disk reads are local filesystem reads on the same box (no egress)
 *   - the DB write goes through the app's own existing internal connection
 *     (src/core/database/pool.js) - no separate DB credential is minted or
 *     handed to anyone
 *   - the only capability exposed is "migrate these specific file-path
 *     columns for rows still on disk" - not arbitrary SQL
 *
 * Guarded by BACKFILL_ADMIN_KEY. Unset (the default) = route refuses every
 * request. Remove this module (and its mount in server.js) once the backfill
 * is complete; it has no reason to exist afterward.
 */

'use strict';

const express = require('express');
const fs = require('fs');
const pool = require('../../core/database/pool');
const { resolveDiskPath } = require('../../core/upload');
const r2Storage = require('../../core/upload/r2Storage');

const router = express.Router();

const EXT_MIME_MAP = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heif',
};
function mimeFromUrl(url) {
    const ext = (url.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
    return EXT_MIME_MAP[ext] || 'application/octet-stream';
}

// Same shape as scripts/migrate_uploads_to_r2.js's TARGETS/MESSAGE_TARGETS.
const TARGETS = [
    { key: 'agent', table: 'agent', pk: 'bubble_id', subdir: 'agent_documents',
      columns: [{ column: 'ic_front', isArray: false }, { column: 'ic_back', isArray: false }] },
    { key: 'user', table: '"user"', pk: 'bubble_id', subdir: 'agent_documents',
      columns: [{ column: 'profile_picture', isArray: false }] },
    { key: 'customer', table: 'customer', pk: 'customer_id', subdir: 'customer_profiles',
      columns: [{ column: 'profile_picture', isArray: false }] },
    { key: 'support_ticket', table: 'support_ticket', pk: 'id', subdir: 'support_ticket_uploads',
      columns: [{ column: 'images', isArray: true }] },
    { key: 'submitted_payment', table: 'submitted_payment', pk: 'bubble_id', subdir: 'uploaded_payment',
      columns: [{ column: 'attachment', isArray: true }] },
    { key: 'invoice', table: 'invoice', pk: 'bubble_id', subdir: null,
      columns: [
          { column: 'linked_roof_image', isArray: true, subdir: 'roof_images' },
          { column: 'site_assessment_image', isArray: true, subdir: 'site_assessment_images' },
          { column: 'pv_system_drawing', isArray: true, subdir: 'pv_drawings' },
      ] },
];

const MESSAGE_TARGETS = [
    { key: 'chat_message', table: 'chat_message', subdir: 'chat_uploads' },
];

function requireBackfillKey(req, res, next) {
    const configured = process.env.BACKFILL_ADMIN_KEY;
    if (!configured) {
        return res.status(404).json({ success: false, error: 'not found' }); // fail closed, look inert
    }
    const provided = req.headers['x-backfill-key'];
    if (provided !== configured) {
        return res.status(403).json({ success: false, error: 'forbidden' });
    }
    return next();
}

async function verifyUploaded(url, expectedBuffer) {
    const downloaded = await r2Storage.fetchBuffer(url);
    if (downloaded.length !== expectedBuffer.length || !downloaded.equals(expectedBuffer)) {
        throw new Error(`read-back mismatch at ${url}`);
    }
}

// Migrates one stored URL by reading the LOCAL disk file (this route only
// ever runs inside the container that owns the volume) and uploading to R2.
async function migrateOneLocal(url, subdir, dryRun) {
    if (!url || r2Storage.isR2Url(url)) return null;
    const diskPath = resolveDiskPath(url, subdir);
    if (!diskPath) return { notFound: true, url };

    const buffer = fs.readFileSync(diskPath);
    const filename = diskPath.split(/[/\\]/).pop();
    const key = `${subdir}/${filename}`;

    if (dryRun) return { wouldMigrate: true, url, bytes: buffer.length };

    const newUrl = await r2Storage.uploadBuffer(buffer, key, mimeFromUrl(url));
    await verifyUploaded(newUrl, buffer);
    return { newUrl, diskPath };
}

function reclaimLocal(diskPath, keepLocal) {
    if (keepLocal || !diskPath) return;
    try { fs.unlinkSync(diskPath); } catch (_) {}
}

async function runColumnTarget(target, { limit, dryRun, keepLocal }) {
    const stats = { migrated: 0, notFound: 0, failed: 0, rowsScanned: 0, failures: [] };
    const r2Base = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

    // Only pull rows that still have at least one non-R2 value in a target
    // column, and cap how many rows one call touches.
    const colConds = target.columns.map((c) => c.isArray
        ? `EXISTS (SELECT 1 FROM unnest(COALESCE(${c.column}, ARRAY[]::text[])) x WHERE x IS NOT NULL AND x <> '' AND x NOT LIKE '%' || $1 || '%')`
        : `(${c.column} IS NOT NULL AND ${c.column} <> '' AND ${c.column} NOT LIKE '%' || $1 || '%')`
    ).join(' OR ');

    const columnList = target.columns.map((c) => c.column);
    const { rows } = await pool.query(
        `SELECT ${target.pk}, ${columnList.join(', ')} FROM ${target.table} WHERE ${colConds} LIMIT $2`,
        [r2Base, limit]
    );
    stats.rowsScanned = rows.length;

    for (const row of rows) {
        for (const colDef of target.columns) {
            const subdir = colDef.subdir || target.subdir;
            const value = row[colDef.column];
            if (!value) continue;

            if (colDef.isArray) {
                if (!Array.isArray(value) || !value.length) continue;
                const newArray = [...value];
                const pendingDeletes = [];
                let changed = false;
                for (let i = 0; i < newArray.length; i += 1) {
                    const url = newArray[i];
                    try {
                        const result = await migrateOneLocal(url, subdir, dryRun);
                        if (result && result.newUrl) {
                            newArray[i] = result.newUrl;
                            pendingDeletes.push(result.diskPath);
                            changed = true;
                            stats.migrated += 1;
                        } else if (result && result.notFound) { stats.notFound += 1; }
                        else if (result && result.wouldMigrate) { stats.migrated += 1; }
                    } catch (err) {
                        stats.failed += 1;
                        stats.failures.push({ url, reason: err.message });
                    }
                }
                if (changed && !dryRun) {
                    await pool.query(`UPDATE ${target.table} SET ${colDef.column} = $1 WHERE ${target.pk} = $2`, [newArray, row[target.pk]]);
                    // Only delete local copies whose row is confirmed repointed to R2.
                    for (const p of pendingDeletes) reclaimLocal(p, keepLocal);
                }
            } else {
                try {
                    const result = await migrateOneLocal(value, subdir, dryRun);
                    if (result && result.newUrl) {
                        stats.migrated += 1;
                        if (!dryRun) {
                            await pool.query(`UPDATE ${target.table} SET ${colDef.column} = $1 WHERE ${target.pk} = $2`, [result.newUrl, row[target.pk]]);
                            reclaimLocal(result.diskPath, keepLocal);
                        }
                    } else if (result && result.notFound) {
                        stats.notFound += 1;
                    } else if (result && result.wouldMigrate) {
                        stats.migrated += 1;
                    }
                } catch (err) {
                    stats.failed += 1;
                    stats.failures.push({ url: value, reason: err.message });
                }
            }
        }
    }
    return stats;
}

async function runMessageTarget(target, { limit, dryRun, keepLocal }) {
    const stats = { migrated: 0, notFound: 0, failed: 0, rowsScanned: 0, failures: [] };
    const r2Base = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const { rows } = await pool.query(
        `SELECT id, content FROM ${target.table}
         WHERE message_type IN ('image','file') AND content IS NOT NULL AND content NOT LIKE '%' || $1 || '%'
         LIMIT $2`,
        [r2Base, limit]
    );
    stats.rowsScanned = rows.length;

    for (const row of rows) {
        try {
            const result = await migrateOneLocal(row.content, target.subdir, dryRun);
            if (result && result.newUrl) {
                stats.migrated += 1;
                if (!dryRun) {
                    await pool.query(`UPDATE ${target.table} SET content = $1 WHERE id = $2`, [result.newUrl, row.id]);
                    reclaimLocal(result.diskPath, keepLocal);
                }
            } else if (result && result.notFound) {
                stats.notFound += 1;
            } else if (result && result.wouldMigrate) {
                stats.migrated += 1;
            }
        } catch (err) {
            stats.failed += 1;
            stats.failures.push({ url: row.content, reason: err.message });
        }
    }
    return stats;
}

router.post('/internal/backfill/run', requireBackfillKey, async (req, res) => {
    try {
        const only = req.body && req.body.only;
        const dryRun = !!(req.body && req.body.dryRun);
        const keepLocal = !!(req.body && req.body.keepLocal);
        const limit = Math.min(Number((req.body && req.body.limit) || 100), 500);

        if (!only) {
            return res.status(400).json({ success: false, error: 'body.only is required, e.g. "agent"' });
        }

        r2Storage.assertConfigured({ fatal: true });

        const colTarget = TARGETS.find((t) => t.key === only);
        const msgTarget = MESSAGE_TARGETS.find((t) => t.key === only);

        let result;
        if (colTarget) result = await runColumnTarget(colTarget, { limit, dryRun, keepLocal });
        else if (msgTarget) result = await runMessageTarget(msgTarget, { limit, dryRun, keepLocal });
        else return res.status(400).json({ success: false, error: `unknown target "${only}"` });

        return res.json({ success: true, only, dryRun, limit, result });
    } catch (err) {
        console.error('[UploadBackfill] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
