/**
 * scripts/migrate_seda_to_r2.js
 *
 * One-time migration: moves SEDA registration files from the Railway volume
 * to Cloudflare R2, updates seda_registration DB columns to the new R2 URLs,
 * then deletes the local copies to free up Railway storage.
 *
 * Must be run with access to the Railway volume, i.e. against production.
 * Recommended three-pass sequence — each pass is reversible until the last:
 *
 *   1. railway run node scripts/migrate_seda_to_r2.js --dry-run
 *        Reports what would move. Touches nothing.
 *
 *   2. railway run node scripts/migrate_seda_to_r2.js --keep-local
 *        Uploads to R2 and repoints the DB, but KEEPS the local copies.
 *        Verify in the app that images load, then proceed.
 *
 *   3. railway run node scripts/migrate_seda_to_r2.js
 *        Same as above, and reclaims local copies of files confirmed on R2.
 *
 * Safe to re-run: any URL that already points at R2 is skipped. Running pass 3
 * after pass 2 sweeps the leftovers, because the orphaned-local sweep matches
 * on the R2 URL's basename.
 *
 * Every upload is read back from the public URL and byte-compared before the DB
 * is repointed. A bucket that accepts writes but refuses public reads therefore
 * fails on file one, rather than after the local copies are already gone.
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const { resolveDiskPath } = require('../src/core/upload');
const r2Storage = require('../src/core/upload/r2Storage');
const pool = require('../src/core/database/pool');

const DRY_RUN    = process.argv.includes('--dry-run');
const KEEP_LOCAL = process.argv.includes('--keep-local');

// Mirrors FILE_FIELDS in routes/sedaRoutes.js — column name + whether it's an array field.
const FILE_COLUMNS = [
    { column: 'ic_copy_front',            isArray: false },
    { column: 'ic_copy_back',             isArray: false },
    { column: 'mykad_pdf',                isArray: false },
    { column: 'tnb_bill_1',               isArray: false },
    { column: 'tnb_bill_2',               isArray: false },
    { column: 'tnb_bill_3',               isArray: false },
    { column: 'tnb_bills_12_months',      isArray: true  },
    { column: 'property_ownership_prove', isArray: false },
    { column: 'tnb_meter',                isArray: false },
    { column: 'tax_document',             isArray: false },
    { column: 'ssm_registration',         isArray: false },
    { column: 'ssm_form_9',               isArray: false },
    { column: 'ssm_form_49',              isArray: false },
    { column: 'company_stamp',            isArray: false },
];

const EXT_MIME_MAP = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heif',
};

function mimeFromUrl(url) {
    const ext = (url.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
    return EXT_MIME_MAP[ext] || 'application/octet-stream';
}

const stats = { scanned: 0, migrated: 0, skippedAlreadyR2: 0, skippedNotFound: 0, failed: 0, reclaimed: 0 };
const failures = [];

/**
 * Confirms an uploaded object is actually readable at its public URL and that
 * the bytes match what we sent.
 *
 * Writing to R2 and reading from the public r2.dev base are governed by
 * different permissions, so a successful PutObject proves nothing about whether
 * the app will be able to load the file. Without this check, a bucket that is
 * not publicly readable would let the migration repoint the DB and delete every
 * local copy before anyone noticed the images were 403ing.
 */
async function verifyUploaded(url, expectedBuffer) {
    const downloaded = await r2Storage.fetchBuffer(url); // throws on non-2xx
    if (downloaded.length !== expectedBuffer.length) {
        throw new Error(
            `read-back size mismatch at ${url}: sent ${expectedBuffer.length} bytes, got ${downloaded.length}`
        );
    }
    if (!downloaded.equals(expectedBuffer)) {
        throw new Error(`read-back content mismatch at ${url}`);
    }
}

// Migrates a single stored URL: disk -> R2. Returns the new URL, or null if skipped.
async function migrateOne(url) {
    stats.scanned += 1;

    if (r2Storage.isR2Url(url)) {
        stats.skippedAlreadyR2 += 1;
        // Already migrated — but a previous --keep-local pass may have left the
        // volume copy behind. Sweep it, since the DB no longer references it.
        // Guarded by the same read-back check: we only drop the local file once
        // the R2 copy is confirmed fetchable, so a bucket that later lost public
        // access can't cause this sweep to destroy the last good copy.
        if (!KEEP_LOCAL && !DRY_RUN) {
            const stalePath = resolveDiskPath(url, 'seda_registration');
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

    const diskPath = resolveDiskPath(url, 'seda_registration');
    if (!diskPath) {
        stats.skippedNotFound += 1;
        failures.push({ url, reason: 'not found on disk' });
        return null;
    }

    const filename = diskPath.split(/[/\\]/).pop();
    const key = `seda_registration/${filename}`;
    const buffer = fs.readFileSync(diskPath);

    if (DRY_RUN) {
        console.log(`[DRY RUN] would upload ${diskPath} -> ${key} (${buffer.length} bytes)`);
        stats.migrated += 1;
        return null;
    }

    const newUrl = await r2Storage.uploadBuffer(buffer, key, mimeFromUrl(url));
    // Prove the object is publicly readable and intact BEFORE the DB is repointed
    // and before any local copy is considered disposable. Throws on mismatch,
    // which the caller records as a failure and leaves the local file untouched.
    await verifyUploaded(newUrl, buffer);
    stats.migrated += 1;
    // NOTE: the local file is deliberately NOT deleted here. It is only safe to
    // delete once the DB row actually points at the new URL — deleting first means
    // a crash (or a failed UPDATE) between here and the commit destroys the only
    // copy of a file the DB still references. Caller deletes via reclaimLocal().
    return { newUrl, diskPath };
}

// Deletes local copies whose DB rows have been confirmed updated and whose R2
// objects have been read back successfully. No-op under --keep-local, which
// leaves both copies in place so the migration can be eyeballed before the
// volume copy becomes unrecoverable.
function reclaimLocal(diskPaths) {
    if (KEEP_LOCAL) return;
    for (const p of diskPaths) {
        try {
            fs.unlinkSync(p); // free Railway volume space
            stats.reclaimed += 1;
        } catch (err) {
            console.warn(`  ! could not delete ${p}: ${err.message}`);
        }
    }
}

async function migrateRow(client, row) {
    for (const { column, isArray } of FILE_COLUMNS) {
        const value = row[column];
        if (!value) continue;

        if (isArray) {
            if (!Array.isArray(value) || !value.length) continue;
            const newArray = [...value];
            const pendingDeletes = [];
            let changed = false;
            for (let i = 0; i < newArray.length; i += 1) {
                const url = newArray[i];
                if (!url) continue;
                try {
                    const result = await migrateOne(url);
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
                    `UPDATE seda_registration SET ${column} = $1, updated_at = NOW() WHERE bubble_id = $2`,
                    [newArray, row.bubble_id]
                );
                reclaimLocal(pendingDeletes); // only after the DB points at R2
            }
        } else {
            try {
                const result = await migrateOne(value);
                if (result && !DRY_RUN) {
                    await client.query(
                        `UPDATE seda_registration SET ${column} = $1, updated_at = NOW() WHERE bubble_id = $2`,
                        [result.newUrl, row.bubble_id]
                    );
                    reclaimLocal([result.diskPath]); // only after the DB points at R2
                }
            } catch (err) {
                stats.failed += 1;
                failures.push({ url: value, reason: err.message });
            }
        }
    }
}

async function main() {
    const mode = DRY_RUN    ? 'DRY RUN — no writes, no deletes'
               : KEEP_LOCAL ? 'LIVE (--keep-local) — will upload + update DB, local copies KEPT'
               :              'LIVE — will upload, update DB, and DELETE local files';
    console.log(`SEDA -> R2 migration (${mode})`);

    // Fail before touching anything if R2 isn't configured, rather than throwing
    // partway through with some rows already repointed.
    r2Storage.assertConfigured({ fatal: true });

    const columns = ['bubble_id', ...FILE_COLUMNS.map(f => f.column)].join(', ');
    const { rows } = await pool.query(`SELECT ${columns} FROM seda_registration`);
    console.log(`Found ${rows.length} seda_registration rows.`);

    const client = await pool.connect();
    try {
        for (const row of rows) {
            await migrateRow(client, row);
        }
    } finally {
        client.release();
    }

    console.log('\n─── Migration summary ───');
    console.log(`Files scanned:          ${stats.scanned}`);
    console.log(`Migrated:                ${stats.migrated}`);
    console.log(`Already on R2 (skipped): ${stats.skippedAlreadyR2}`);
    console.log(`Not found on disk:       ${stats.skippedNotFound}`);
    console.log(`Local copies reclaimed:  ${stats.reclaimed}${KEEP_LOCAL ? ' (--keep-local: none deleted)' : ''}`);
    console.log(`Failed:                  ${stats.failed}`);
    if (failures.length) {
        console.log('\nFailures / not-found detail:');
        failures.forEach(f => console.log(`  - ${f.url}: ${f.reason}`));
    }

    await pool.end();
}

main().catch(err => {
    console.error('Migration aborted:', err);
    process.exit(1);
});
