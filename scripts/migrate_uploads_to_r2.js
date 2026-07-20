/**
 * scripts/migrate_uploads_to_r2.js
 *
 * One-time backfill: moves the remaining legacy Railway-volume uploads to
 * Cloudflare R2 and repoints their DB rows. SEDA already has its own script
 * (migrate_seda_to_r2.js) and is NOT covered here. This covers everything
 * else the storageDriver cutover touched: agent/user photos, customer
 * profile photos, support ticket images, payment proofs, Invoice Office
 * (roof/site/PV), hosted HTML apps, and chat/bug-report file messages.
 *
 * Same safety model as the SEDA migration:
 *   - every upload is read back from its public URL and byte-compared BEFORE
 *     the DB row is repointed, so a bucket that writes but won't publicly
 *     read fails on file one, not after local copies are gone
 *   - the local file is deleted only AFTER the DB UPDATE commits
 *   - safe to re-run: anything already on R2 is skipped
 *
 * Must run with access to the Railway volume, i.e. against production.
 * Recommended sequence, same three passes as the SEDA script:
 *
 *   1. railway run node scripts/migrate_uploads_to_r2.js --dry-run
 *   2. railway run node scripts/migrate_uploads_to_r2.js --keep-local
 *        Verify in the app that images/files load, then:
 *   3. railway run node scripts/migrate_uploads_to_r2.js
 *
 * Scope a single target while rolling out incrementally:
 *   railway run node scripts/migrate_uploads_to_r2.js --dry-run --only=chat_message
 *   (target keys: agent, user, customer, support_ticket, submitted_payment,
 *    invoice_office, chat_message, bug_message, hosted_html_app)
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { resolveDiskPath } = require('../src/core/upload');
const r2Storage = require('../src/core/upload/r2Storage');
const pool = require('../src/core/database/pool');

const DRY_RUN    = process.argv.includes('--dry-run');
const KEEP_LOCAL = process.argv.includes('--keep-local');
const ONLY       = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;

const EXT_MIME_MAP = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heif',
    '.html': 'text/html',
};
function mimeFromUrl(url) {
    const ext = (url.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
    return EXT_MIME_MAP[ext] || 'application/octet-stream';
}

// Column-shaped targets: a table with one or more file columns, each either a
// single URL or an array of URLs, keyed by a stable primary key column.
const TARGETS = [
    {
        key: 'agent', table: 'agent', pk: 'bubble_id', subdir: 'agent_documents',
        columns: [
            { column: 'ic_front', isArray: false },
            { column: 'ic_back', isArray: false },
        ],
    },
    {
        key: 'user', table: '"user"', pk: 'bubble_id', subdir: 'agent_documents',
        columns: [{ column: 'profile_picture', isArray: false }],
    },
    {
        key: 'customer', table: 'customer', pk: 'customer_id', subdir: 'customer_profiles',
        columns: [{ column: 'profile_picture', isArray: false }],
    },
    {
        key: 'support_ticket', table: 'support_ticket', pk: 'id', subdir: 'support_ticket_uploads',
        columns: [{ column: 'images', isArray: true }],
    },
    {
        key: 'submitted_payment', table: 'submitted_payment', pk: 'bubble_id', subdir: 'uploaded_payment',
        columns: [{ column: 'attachment', isArray: true }],
    },
    {
        key: 'invoice_office', table: 'invoice', pk: 'bubble_id', subdir: null,
        columns: [
            { column: 'linked_roof_image', isArray: true, subdir: 'roof_images' },
            { column: 'site_assessment_image', isArray: true, subdir: 'site_assessment_images' },
            { column: 'pv_system_drawing', isArray: true, subdir: 'pv_drawings' },
        ],
    },
];

// Row-message targets: the file URL lives inside a free-text column mixed in
// with plain-text messages, so only rows flagged as image/file are touched.
const MESSAGE_TARGETS = [
    { key: 'chat_message', table: 'chat_message', subdir: 'chat_uploads' },
    { key: 'bug_message', table: 'bug_message', subdir: 'bug_uploads' },
];

const stats = { scanned: 0, migrated: 0, skippedAlreadyR2: 0, skippedNotFound: 0, failed: 0, reclaimed: 0 };
const failures = [];

/**
 * Confirms an uploaded object is actually readable at its public URL and that
 * the bytes match what was sent. Writing to R2 and reading from the public
 * r2.dev base are governed by different permissions, so a successful
 * PutObject proves nothing about whether the app can load the file.
 */
async function verifyUploaded(url, expectedBuffer) {
    const downloaded = await r2Storage.fetchBuffer(url); // throws on non-2xx
    if (downloaded.length !== expectedBuffer.length) {
        throw new Error(`read-back size mismatch at ${url}: sent ${expectedBuffer.length} bytes, got ${downloaded.length}`);
    }
    if (!downloaded.equals(expectedBuffer)) {
        throw new Error(`read-back content mismatch at ${url}`);
    }
}

// Deletes local copies whose DB rows have been confirmed updated and whose R2
// objects have been read back successfully. No-op under --keep-local.
function reclaimLocal(diskPaths) {
    if (KEEP_LOCAL) return;
    for (const p of diskPaths) {
        try {
            fs.unlinkSync(p);
            stats.reclaimed += 1;
        } catch (err) {
            console.warn(`  ! could not delete ${p}: ${err.message}`);
        }
    }
}

// Migrates a single stored URL: disk -> R2. Returns { newUrl, diskPath }, or
// null if skipped (already on R2, dry-run, or not found).
async function migrateOne(url, subdir) {
    stats.scanned += 1;

    if (r2Storage.isR2Url(url)) {
        stats.skippedAlreadyR2 += 1;
        // Already migrated — but a previous --keep-local pass may have left the
        // volume copy behind. Sweep it, guarded by the same read-back check.
        if (!KEEP_LOCAL && !DRY_RUN) {
            const stalePath = resolveDiskPath(url, subdir);
            if (stalePath) {
                try {
                    await verifyUploaded(url, fs.readFileSync(stalePath));
                    reclaimLocal([stalePath]);
                } catch (err) {
                    console.warn(`  ! leaving local copy in place for ${url}: ${err.message}`);
                }
            }
        }
        return null;
    }

    const diskPath = resolveDiskPath(url, subdir);
    if (!diskPath) {
        stats.skippedNotFound += 1;
        failures.push({ url, reason: 'not found on disk' });
        return null;
    }

    const filename = diskPath.split(/[/\\]/).pop();
    const key = `${subdir}/${filename}`;
    const buffer = fs.readFileSync(diskPath);

    if (DRY_RUN) {
        console.log(`[DRY RUN] would upload ${diskPath} -> ${key} (${buffer.length} bytes)`);
        stats.migrated += 1;
        return null;
    }

    const newUrl = await r2Storage.uploadBuffer(buffer, key, mimeFromUrl(url));
    // Prove the object is publicly readable and intact BEFORE the DB is
    // repointed and before the local copy is considered disposable.
    await verifyUploaded(newUrl, buffer);
    stats.migrated += 1;
    // NOTE: local file is deliberately NOT deleted here — only safe once the
    // DB row actually points at the new URL. Caller deletes via reclaimLocal().
    return { newUrl, diskPath };
}

async function migrateColumnTarget(client, target) {
    const columnList = target.columns.map((c) => c.column);
    const { rows } = await client.query(`SELECT ${target.pk}, ${columnList.join(', ')} FROM ${target.table}`);
    console.log(`\n[${target.key}] ${rows.length} rows`);

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
                    if (!url) continue;
                    try {
                        const result = await migrateOne(url, subdir);
                        if (result) {
                            newArray[i] = result.newUrl;
                            pendingDeletes.push(result.diskPath);
                            changed = true;
                        }
                    } catch (err) {
                        stats.failed += 1;
                        failures.push({ url, reason: err.message });
                    }
                }
                if (changed && !DRY_RUN) {
                    await client.query(
                        `UPDATE ${target.table} SET ${colDef.column} = $1 WHERE ${target.pk} = $2`,
                        [newArray, row[target.pk]]
                    );
                    reclaimLocal(pendingDeletes); // only after the DB points at R2
                }
            } else {
                try {
                    const result = await migrateOne(value, subdir);
                    if (result && !DRY_RUN) {
                        await client.query(
                            `UPDATE ${target.table} SET ${colDef.column} = $1 WHERE ${target.pk} = $2`,
                            [result.newUrl, row[target.pk]]
                        );
                        reclaimLocal([result.diskPath]);
                    }
                } catch (err) {
                    stats.failed += 1;
                    failures.push({ url: value, reason: err.message });
                }
            }
        }
    }
}

// chat_message / bug_message: the file URL lives inside `content`, mixed in
// with plain-text messages, so only rows flagged image/file are touched.
async function migrateMessageTarget(client, target) {
    const { rows } = await client.query(
        `SELECT id, content FROM ${target.table} WHERE message_type IN ('image', 'file') AND content IS NOT NULL`
    );
    console.log(`\n[${target.key}] ${rows.length} file/image messages`);

    for (const row of rows) {
        try {
            const result = await migrateOne(row.content, target.subdir);
            if (result && !DRY_RUN) {
                await client.query(`UPDATE ${target.table} SET content = $1 WHERE id = $2`, [result.newUrl, row.id]);
                reclaimLocal([result.diskPath]);
            }
        } catch (err) {
            stats.failed += 1;
            failures.push({ url: row.content, reason: err.message });
        }
    }
}

// hosted_html_app: legacy rows hold a raw absolute filesystem path under the
// old nested hosted_html/<slug>/index.html layout — every legacy row's
// basename is "index.html", so the generic basename-keyed resolveDiskPath
// cannot address them. Read those directly instead.
async function migrateHostedHtml(client) {
    const { rows } = await client.query('SELECT id, slug, storage_path FROM hosted_html_app');
    const legacyRows = rows.filter((r) => path.isAbsolute(r.storage_path) && !/^https?:\/\//i.test(r.storage_path));
    console.log(`\n[hosted_html_app] ${rows.length} rows, ${legacyRows.length} legacy (nested-path) rows`);

    for (const row of legacyRows) {
        stats.scanned += 1;
        if (!fs.existsSync(row.storage_path)) {
            stats.skippedNotFound += 1;
            failures.push({ url: row.storage_path, reason: 'legacy file not found on disk' });
            continue;
        }

        const buffer = fs.readFileSync(row.storage_path);
        const key = `hosted_html/${row.slug}.html`;

        if (DRY_RUN) {
            console.log(`[DRY RUN] would upload ${row.storage_path} -> ${key} (${buffer.length} bytes)`);
            stats.migrated += 1;
            continue;
        }

        try {
            const newUrl = await r2Storage.uploadBuffer(buffer, key, 'text/html');
            await verifyUploaded(newUrl, buffer);
            stats.migrated += 1;
            await client.query('UPDATE hosted_html_app SET storage_path = $1 WHERE id = $2', [newUrl, row.id]);
            reclaimLocal([row.storage_path]);
        } catch (err) {
            stats.failed += 1;
            failures.push({ url: row.storage_path, reason: err.message });
        }
    }
}

async function main() {
    const mode = DRY_RUN ? 'DRY RUN — no writes, no deletes'
        : KEEP_LOCAL ? 'LIVE (--keep-local) — will upload + update DB, local copies KEPT'
            : 'LIVE — will upload, update DB, and DELETE local files';
    console.log(`Uploads -> R2 backfill (${mode})${ONLY ? ` [only: ${ONLY}]` : ''}`);

    // Fail before touching anything if R2 isn't configured, rather than
    // throwing partway through with some rows already repointed.
    r2Storage.assertConfigured({ fatal: true });

    const client = await pool.connect();
    try {
        for (const target of TARGETS) {
            if (ONLY && ONLY !== target.key) continue;
            await migrateColumnTarget(client, target);
        }
        for (const target of MESSAGE_TARGETS) {
            if (ONLY && ONLY !== target.key) continue;
            await migrateMessageTarget(client, target);
        }
        if (!ONLY || ONLY === 'hosted_html_app') {
            await migrateHostedHtml(client);
        }
    } finally {
        client.release();
    }

    console.log('\n─── Backfill summary ───');
    console.log(`Files scanned:          ${stats.scanned}`);
    console.log(`Migrated:                ${stats.migrated}`);
    console.log(`Already on R2 (skipped): ${stats.skippedAlreadyR2}`);
    console.log(`Not found on disk:       ${stats.skippedNotFound}`);
    console.log(`Local copies reclaimed:  ${stats.reclaimed}${KEEP_LOCAL ? ' (--keep-local: none deleted)' : ''}`);
    console.log(`Failed:                  ${stats.failed}`);
    if (failures.length) {
        console.log('\nFailures / not-found detail:');
        failures.forEach((f) => console.log(`  - ${f.url}: ${f.reason}`));
    }

    await pool.end();
}

main().catch((err) => {
    console.error('Backfill aborted:', err);
    process.exit(1);
});
