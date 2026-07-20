#!/usr/bin/env node
/**
 * scripts/health_check_r2.js
 *
 * Post-deploy smoke test for the R2 storage migration. Run it right after a
 * deploy to confirm — in seconds, without clicking through the UI — that the
 * whole upload path is actually wired to R2 in the environment it runs in:
 *
 *   railway run node scripts/health_check_r2.js
 *   npm run health:r2                      # same, locally
 *
 * It checks five things, in order of what breaks first:
 *   1. R2 env vars are present
 *   2. A real write -> public read-back -> delete round trip against the bucket
 *      (proves the bucket is BOTH writable and publicly readable — the two use
 *      different permissions, and a PutObject success proves nothing about reads)
 *   3. Every upload subdir resolves to the R2 backend, not disk
 *   4. The database is reachable and is NOT the empty-stub fallback
 *   5. Migration progress: how many stored files still point at local disk
 *
 * Sections 1-4 are pass/fail and set the exit code (0 = healthy, 1 = problem),
 * so it doubles as a CI / deploy gate. Section 5 is informational and never
 * fails the check — a disk file is legacy data to be backfilled, not a fault.
 *
 * Non-destructive: the only thing it writes is one tiny probe object under a
 * `_healthcheck/` key, which it deletes before exiting.
 */

'use strict';

require('dotenv').config();

const { Pool } = require('pg');
const r2Storage = require('../src/core/upload/r2Storage');
const { backendFor } = require('../src/core/upload/storageDriver');

// Every upload subdir the app writes to. Kept in sync by hand with the modules.
const UPLOAD_SUBDIRS = [
    'seda_registration', 'claim_receipt_uploads', 'chat_uploads', 'bug_uploads',
    'support_ticket_uploads', 'uploaded_payment', 'agent_documents',
    'customer_profiles', 'hosted_html', 'roof_images', 'site_assessment_images',
    'pv_drawings',
];

// (table, column) pairs that store file URLs, and how the column is shaped so we
// can flatten it to text. Missing tables/columns are skipped, not fatal — this
// script must run against schemas at any migration stage.
const URL_COLUMNS = [
    ['seda_registration', 'ic_copy_front', 'text'],
    ['seda_registration', 'ic_copy_back', 'text'],
    ['seda_registration', 'mykad_pdf', 'text'],
    ['seda_registration', 'tnb_bill_1', 'text'],
    ['seda_registration', 'tnb_bill_2', 'text'],
    ['seda_registration', 'tnb_bill_3', 'text'],
    ['seda_registration', 'tnb_bills_12_months', 'array'],
    ['seda_registration', 'property_ownership_prove', 'text'],
    ['seda_registration', 'tnb_meter', 'text'],
    ['seda_registration', 'tax_document', 'text'],
    ['seda_registration', 'ssm_registration', 'text'],
    ['seda_registration', 'ssm_form_9', 'text'],
    ['seda_registration', 'ssm_form_49', 'text'],
    ['seda_registration', 'company_stamp', 'text'],
    ['claim_receipt', 'file_url', 'text'],
    ['support_ticket', 'images', 'array'],
    ['payment', 'attachment', 'any'],
    ['submitted_payment', 'attachment', 'any'],
    ['hosted_html_app', 'storage_path', 'text'],
    ['invoice', 'linked_roof_image', 'array'],
    ['invoice', 'site_assessment_image', 'array'],
    ['invoice', 'pv_system_drawing', 'array'],
    ['chat_message', 'file_meta', 'json'],
    ['bug_message', 'file_meta', 'json'],
];

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m';
const results = [];
function pass(name, detail) { results.push({ ok: true, name }); console.log(`  ${GREEN}PASS${RESET} ${name}${detail ? DIM + ' — ' + detail + RESET : ''}`); }
function fail(name, detail) { results.push({ ok: false, name }); console.log(`  ${RED}FAIL${RESET} ${name}${detail ? ' — ' + detail : ''}`); }
function warn(msg) { console.log(`  ${YELLOW}WARN${RESET} ${msg}`); }
function section(title) { console.log(`\n${title}`); }

// ── 1. Config ─────────────────────────────────────────────────────────────────
function checkConfig() {
    section('1. R2 configuration');
    const missing = r2Storage.missingConfig();
    if (missing.length) {
        fail('R2 env vars present', `missing: ${missing.join(', ')}`);
        return false;
    }
    pass('R2 env vars present', `bucket=${process.env.R2_BUCKET}, base=${process.env.R2_PUBLIC_BASE_URL}`);
    return true;
}

// ── 2. Round trip ───────────────────────────────────────────────────────────
async function checkRoundTrip() {
    section('2. R2 write -> public read -> delete');
    const key = `_healthcheck/probe_${process.pid}_${Date.now()}.txt`;
    const payload = Buffer.from(`r2-healthcheck ${new Date().toISOString()}`);
    let url;
    try {
        url = await r2Storage.uploadBuffer(payload, key, 'text/plain');
        pass('write (PutObject)', key);
    } catch (err) {
        fail('write (PutObject)', err.message);
        return false;
    }

    try {
        const back = await r2Storage.fetchBuffer(url);
        if (back.equals(payload)) {
            pass('public read-back', 'bytes match');
        } else {
            fail('public read-back', `got ${back.length} bytes, expected ${payload.length}`);
        }
    } catch (err) {
        // This is the failure mode that would silently destroy data in a live
        // backfill: writes work, public reads 403. Call it out loudly.
        fail('public read-back', `bucket is not publicly readable at R2_PUBLIC_BASE_URL — ${err.message}`);
    }

    try {
        await r2Storage.deleteObject(key);
        pass('delete (cleanup)', key);
    } catch (err) {
        warn(`probe object left behind (${key}): ${err.message}`);
    }
    return results.filter(r => !r.ok).length === 0;
}

// ── 3. Backend selection ──────────────────────────────────────────────────────
function checkBackends() {
    section('3. Upload subdirs route to R2');
    let allR2 = true;
    for (const subdir of UPLOAD_SUBDIRS) {
        const backend = backendFor(subdir);
        if (backend === 'r2') {
            pass(`${subdir}`, 'r2');
        } else {
            fail(`${subdir}`, `resolves to '${backend}' — new uploads here still hit local disk`);
            allR2 = false;
        }
    }
    return allR2;
}

// ── 4. Database ───────────────────────────────────────────────────────────────
async function checkDatabase(pool) {
    section('4. Database reachable');
    try {
        const r = await pool.query('SELECT 1 AS ok');
        // The app's pool.js swaps in a stub returning rowCount:0 for every query
        // when the initial connect fails. A live check must not mistake that for
        // a healthy DB, so verify we actually got the row back.
        if (r.rows[0] && r.rows[0].ok === 1) {
            pass('SELECT 1', 'live connection');
            return true;
        }
        fail('SELECT 1', 'query returned no row — possible stubbed/failed pool');
        return false;
    } catch (err) {
        fail('SELECT 1', err.message);
        return false;
    }
}

// ── 5. Migration progress (informational) ─────────────────────────────────────
async function reportMigrationProgress(pool) {
    section('5. Migration progress (informational — does not affect exit code)');
    const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
    let totalDisk = 0, totalR2 = 0, scanned = 0;

    for (const [table, column, kind] of URL_COLUMNS) {
        // Flatten each column shape to a set of URL strings, then classify.
        let expr;
        if (kind === 'array')      expr = `unnest(CASE WHEN ${column} IS NULL THEN ARRAY[]::text[] ELSE ${column}::text[] END)`;
        else if (kind === 'json')  expr = `${column}::text`;
        else                       expr = `${column}::text`;

        const sql = `
            WITH vals AS (SELECT ${expr} AS v FROM ${table})
            SELECT
                count(*) FILTER (WHERE v LIKE $1) AS r2,
                count(*) FILTER (WHERE v IS NOT NULL AND v <> '' AND v NOT LIKE $1
                                 AND (v LIKE '%/uploads/%' OR v LIKE '%/seda-files/%'
                                      OR v LIKE '%/agent-docs/%' OR v LIKE 'http%')) AS disk
            FROM vals`;
        try {
            const r = await pool.query(sql, [`%${base}%`]);
            const r2 = Number(r.rows[0].r2 || 0);
            const disk = Number(r.rows[0].disk || 0);
            scanned++;
            totalR2 += r2; totalDisk += disk;
            if (r2 + disk > 0) {
                const flag = disk > 0 ? `${YELLOW}${disk} on disk${RESET}` : `${GREEN}0 on disk${RESET}`;
                console.log(`  ${table}.${column}: ${r2} R2, ${flag}`);
            }
        } catch (err) {
            if (err.code === '42P01' || err.code === '42703') continue; // missing table/column — fine
            warn(`${table}.${column}: ${err.message}`);
        }
    }

    console.log(`\n  ${DIM}scanned ${scanned} columns${RESET}`);
    if (totalR2 + totalDisk === 0) {
        // No file references anywhere usually means this isn't the app's DB, not
        // that the backfill is done. Do not report a false all-clear.
        warn('no file references found in any known column — is DATABASE_URL pointing at the app database?');
    } else if (totalDisk === 0) {
        console.log(`  ${GREEN}All ${totalR2} stored files point at R2. Backfill complete — the /uploads volume can be reclaimed.${RESET}`);
    } else {
        console.log(`  ${YELLOW}${totalDisk} stored file reference(s) still point at local disk.${RESET}`);
        console.log(`  ${DIM}These are legacy rows served via the disk->R2 read fallback. Run the backfill to move them.${RESET}`);
    }
}

// Connects with SSL, falling back to no-SSL. Returns a live Pool or null.
async function connectResilient(connectionString) {
    for (const ssl of [{ rejectUnauthorized: false }, false]) {
        const pool = new Pool({ connectionString, ssl });
        try {
            const c = await pool.connect();
            c.release();
            return pool;
        } catch (_) {
            await pool.end().catch(() => {});
        }
    }
    return null;
}

async function main() {
    console.log('R2 storage health check');
    console.log(DIM + new Date().toISOString() + RESET);

    const configOk = checkConfig();
    let roundTripOk = false, backendsOk = false, dbOk = false;

    if (configOk) {
        roundTripOk = await checkRoundTrip();
        backendsOk = checkBackends();
    } else {
        section('2-3. Skipped'); warn('R2 not configured — skipping round trip and backend checks');
    }

    let pool;
    if (process.env.DATABASE_URL) {
        // Try SSL first (Railway/managed Postgres require it), then fall back to
        // no-SSL (local proxies reject it) so the check reflects DB health, not
        // which connection mode this particular host happens to use.
        pool = await connectResilient(process.env.DATABASE_URL);
        dbOk = pool ? await checkDatabase(pool) : (fail('DB connect', 'could not connect with or without SSL'), false);
        if (dbOk && configOk) {
            try { await reportMigrationProgress(pool); }
            catch (err) { warn(`migration progress scan failed: ${err.message}`); }
        }
        if (pool) await pool.end();
    } else {
        section('4. Database'); warn('DATABASE_URL not set — skipping DB checks');
    }

    // ── Verdict ──
    const criticalFailures = results.filter(r => !r.ok);
    section('Result');
    if (criticalFailures.length === 0 && configOk) {
        console.log(`  ${GREEN}HEALTHY${RESET} — uploads are wired to R2 and the bucket round-trips.`);
        process.exit(0);
    } else {
        console.log(`  ${RED}UNHEALTHY${RESET} — ${criticalFailures.length} check(s) failed:`);
        criticalFailures.forEach(r => console.log(`    - ${r.name}`));
        process.exit(1);
    }
}

main().catch(err => {
    console.error(`\n${RED}Health check crashed:${RESET}`, err);
    process.exit(1);
});
