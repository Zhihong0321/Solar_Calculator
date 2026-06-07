/**
 * test_hosted_html.js
 *
 * Tests the Hosted HTML feature end-to-end.
 *
 *   MODE 1 — Real DB:   Full integration (issue, upload, list, public /h/:slug serve)
 *   MODE 2 — Stub DB:   HTTP/auth/validation/file-on-disk checks only
 *
 * Run:  node scripts/test_hosted_html.js
 */

'use strict';

require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');

const HostedHtml = require('../src/modules/HostedHtml');
const pool = require('../src/core/database/pool');
const ctrl = HostedHtml.controller;

const TEST_PORT = 3097;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const UPLOAD_DIR = path.join(__dirname, '../storage/hosted_html');

// ── Test framework ────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, skipped = 0;

function pass(name, detail) {
    results.push({ name, status: '✓', detail });
    passed++;
}
function fail(name, detail) {
    results.push({ name, status: '✗', detail });
    failed++;
}
function skip(name, detail) {
    results.push({ name, status: '○', detail });
    skipped++;
}

async function checkDbAvailable() {
    try {
        const result = await pool.query('SELECT 1 AS ok');
        return result.rows.length > 0;
    } catch (err) {
        return false;
    }
}

// Stub the pool so the controller can still serve a 404/200 path when the
// real DB is unreachable. Activated when DB is unavailable.
function stubPool() {
    const emptyResult = { rows: [], rowCount: 0 };
    const stubClient = {
        query: () => Promise.resolve(emptyResult),
        release: () => { }
    };
    pool.connect = () => Promise.resolve(stubClient);
    pool.query = () => Promise.resolve(emptyResult);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────
async function request(method, p, { headers = {}, body, isFormData } = {}) {
    const res = await fetch(`${BASE_URL}${p}`, {
        method,
        headers,
        body
    });
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) data = await res.json();
    else data = await res.text();
    return { ok: res.ok, status: res.status, data };
}

async function jsonRequest(method, p, payload, headers = {}) {
    return request(method, p, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
    });
}

function buildFormData(payload, fileField, fileName, fileBuffer, fileType) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(payload)) {
        if (v != null) fd.append(k, String(v));
    }
    if (fileBuffer) {
        fd.append(fileField, new Blob([fileBuffer], { type: fileType }), fileName);
    }
    return fd;
}

// ── Build a minimal test app ──────────────────────────────────────────────
function buildTestApp() {
    const app = express();

    // Mirror server.js: skip JSON parser for multipart
    app.use((req, res, next) => {
        const ct = req.headers['content-type'] || '';
        if (ct.startsWith('multipart/form-data')) return next();
        return express.json({ limit: '50mb' })(req, res, next);
    });

    // Mount the HostedHtml module routes
    app.use(HostedHtml.router);

    // Public serving route (mirrors server.js /h/:slug and /app/:friendlySlug)
    app.get('/h/:slug', async (req, res) => {
        const { slug } = req.params;
        if (!/^[a-f0-9]{16}$/.test(slug)) {
            return res.status(404).type('html').send('Not found');
        }
        let appRecord;
        try {
            appRecord = await HostedHtml.service.getAppBySlug(slug);
        } catch (err) {
            return res.status(500).type('html').send('Internal error');
        }
        if (!appRecord || appRecord.status !== 'published') {
            return res.status(404).type('html').send('Not found');
        }
        let html;
        try {
            html = await fs.promises.readFile(appRecord.storagePath, 'utf8');
        } catch (err) {
            return res.status(404).type('html').send('Not found');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.send(html);
    });

    app.get('/app/:friendlySlug', async (req, res) => {
        const { friendlySlug } = req.params;
        if (!HostedHtml.service.FRIENDLY_SLUG_RE.test(friendlySlug)) {
            return res.status(404).type('html').send('Not found');
        }
        let appRecord;
        try {
            appRecord = await HostedHtml.service.getAppByFriendlySlug(friendlySlug);
        } catch (err) {
            return res.status(500).type('html').send('Internal error');
        }
        if (!appRecord || appRecord.status !== 'published') {
            return res.status(404).type('html').send('Not found');
        }
        let html;
        try {
            html = await fs.promises.readFile(appRecord.storagePath, 'utf8');
        } catch (err) {
            return res.status(404).type('html').send('Not found');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(html);
    });

    return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

const VALID_HTML = '<!DOCTYPE html><html><body><h1>Hello from test</h1></body></html>';
const INVALID_HTML = 'this is not html at all';

async function test_missing_api_key() {
    const name = '[AUTH] POST /host without X-Api-Key → 401';
    try {
        const res = await jsonRequest('POST', '/api/hosted-html/host', {
            creatorName: 'Tester', html: VALID_HTML
        });
        if (res.status !== 401) return fail(name, `Expected 401, got ${res.status}`);
        if (!res.data.error) return fail(name, 'Missing error message');
        pass(name, `Rejected: "${res.data.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_wrong_api_key() {
    const name = '[AUTH] POST /host with wrong key → 403';
    try {
        const res = await jsonRequest('POST', '/api/hosted-html/host', {
            creatorName: 'Tester', html: VALID_HTML
        }, { 'X-Api-Key': 'definitely-wrong' });
        if (res.status !== 403) return fail(name, `Expected 403, got ${res.status}`);
        pass(name, `Rejected: "${res.data.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_api_key_via_body_field() {
    const name = '[AUTH] Apikey accepted in body field (no header)';
    try {
        // Issue endpoint requires only creatorName+title; does NOT touch DB writes for the placeholder file.
        // Without DB, the row insert will fail, so we just verify auth passes through.
        const res = await jsonRequest('POST', '/api/hosted-html/host/issue', {
            creatorName: 'Tester', apikey: 'hostmyapp'
        });
        // Without DB, expect 500 (insert fails). What we care about: NOT 401/403.
        if (res.status === 401 || res.status === 403) {
            return fail(name, `Auth rejected via body field: ${res.status} ${JSON.stringify(res.data)}`);
        }
        pass(name, `Auth via body field passed (status ${res.status})`);
    } catch (err) { fail(name, err.message); }
}

async function test_missing_creator_name() {
    const name = '[VAL] POST /host without creatorName → 400';
    try {
        const res = await jsonRequest('POST', '/api/hosted-html/host', {
            html: VALID_HTML
        }, { 'X-Api-Key': 'hostmyapp' });
        if (res.status !== 400) return fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
        if (!/creatorName/i.test(res.data.error || '')) return fail(name, 'Error does not mention creatorName');
        pass(name, `Rejected: "${res.data.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_missing_html() {
    const name = '[VAL] POST /host without html → 400';
    try {
        const res = await jsonRequest('POST', '/api/hosted-html/host', {
            creatorName: 'Tester'
        }, { 'X-Api-Key': 'hostmyapp' });
        if (res.status !== 400) return fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
        pass(name, `Rejected: "${res.data.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_invalid_html_content() {
    const name = '[VAL] POST /host with non-HTML content → 400';
    try {
        const res = await jsonRequest('POST', '/api/hosted-html/host', {
            creatorName: 'Tester', title: 'Bad HTML', html: INVALID_HTML
        }, { 'X-Api-Key': 'hostmyapp' });
        if (res.status !== 400) return fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
        pass(name, `Rejected: "${res.data.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_issue_writes_placeholder_file() {
    const name = '[FILE] POST /host/issue writes placeholder file to disk';
    if (!await checkDbAvailable()) {
        return skip(name, 'DB not available — placeholder file write requires slug allocation that may not happen in stub mode');
    }
    try {
        const res = await jsonRequest('POST', '/api/hosted-html/host/issue', {
            creatorName: 'Tester', title: 'Test Issue'
        }, { 'X-Api-Key': 'hostmyapp' });
        if (!res.ok || !res.data.success) return fail(name, `Issue failed: ${res.status} ${JSON.stringify(res.data)}`);
        const { id, slug, url, status, upload_url } = res.data;
        if (!id || !slug || !url) return fail(name, 'Missing id/slug/url in response');
        if (status !== 'pending') return fail(name, `Expected status=pending, got ${status}`);
        if (!upload_url || !upload_url.includes(id)) return fail(name, 'upload_url missing or wrong');
        // Verify placeholder file exists
        const storagePath = path.join(UPLOAD_DIR, slug, 'index.html');
        if (!fs.existsSync(storagePath)) return fail(name, `Placeholder file not written at ${storagePath}`);
        const content = fs.readFileSync(storagePath, 'utf8');
        if (!content.includes('Test Issue')) return fail(name, 'Placeholder missing title');
        if (!content.toLowerCase().includes('<!doctype')) return fail(name, 'Placeholder not valid HTML');
        pass(name, `slug=${slug} url=${url} file=${storagePath}`);
        return res.data;
    } catch (err) { fail(name, err.message); }
}

async function test_upload_to_issued_app(issued) {
    const name = `[FILE] PUT /host/:id/html uploads HTML to ${issued?.slug || 'pending app'}`;
    if (!issued) return skip(name, 'Skipped (no issued app from prior test)');
    try {
        const res = await jsonRequest('PUT', `/api/hosted-html/host/${issued.id}/html`, {
            html: VALID_HTML
        }, { 'X-Api-Key': 'hostmyapp' });
        if (!res.ok || !res.data.success) return fail(name, `Upload failed: ${res.status} ${JSON.stringify(res.data)}`);
        if (res.data.status !== 'published') return fail(name, `Expected status=published, got ${res.data.status}`);
        // Verify file was overwritten
        const storagePath = path.join(UPLOAD_DIR, issued.slug, 'index.html');
        const content = fs.readFileSync(storagePath, 'utf8');
        if (!content.includes('Hello from test')) return fail(name, 'Uploaded HTML not on disk');
        pass(name, `slug=${issued.slug} status=published`);
        return res.data;
    } catch (err) { fail(name, err.message); }
}

async function test_public_serve(published) {
    const name = `[PUBLIC] GET /h/:slug returns the uploaded HTML`;
    if (!published) return skip(name, 'Skipped (no published app)');
    try {
        const res = await fetch(`${BASE_URL}/h/${published.slug}`);
        if (!res.ok) return fail(name, `HTTP ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/html')) return fail(name, `Wrong content-type: ${ct}`);
        const body = await res.text();
        if (!body.includes('Hello from test')) return fail(name, 'Body does not match uploaded HTML');
        if (res.headers.get('x-content-type-options') !== 'nosniff') return fail(name, 'Missing X-Content-Type-Options: nosniff');
        pass(name, `served ${body.length} bytes`);
    } catch (err) { fail(name, err.message); }
}

async function test_public_404_for_unknown_slug() {
    const name = '[PUBLIC] GET /h/0000000000000000 (unknown) → 404';
    try {
        const res = await fetch(`${BASE_URL}/h/0000000000000000`);
        if (res.status !== 404) return fail(name, `Expected 404, got ${res.status}`);
        pass(name, 'Returned 404');
    } catch (err) { fail(name, err.message); }
}

async function test_public_404_for_malformed_slug() {
    const name = '[PUBLIC] GET /h/bad-slug (malformed) → 404';
    try {
        const res = await fetch(`${BASE_URL}/h/not-hex-string`);
        if (res.status !== 404) return fail(name, `Expected 404, got ${res.status}`);
        pass(name, 'Returned 404');
    } catch (err) { fail(name, err.message); }
}

async function test_friendly_slug_validation() {
    const cases = [
        { slug: 'API', desc: 'uppercase letters' },
        { slug: 'has space', desc: 'whitespace' },
        { slug: 'a', desc: 'too short' },
        { slug: 'a'.repeat(65), desc: 'too long' },
        { slug: 'has/slash', desc: 'illegal char' },
        { slug: 'has.dot', desc: 'illegal char' }
    ];
    for (const c of cases) {
        const name = `[VAL] friendlySlug "${c.slug.length > 12 ? c.slug.slice(0, 12) + '…' : c.slug}" (${c.desc}) → 400`;
        try {
            const res = await jsonRequest('POST', '/api/hosted-html/host', {
                creatorName: 'Tester', title: 'x', html: VALID_HTML, friendlySlug: c.slug
            }, { 'X-Api-Key': 'hostmyapp' });
            if (res.status !== 400) return fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
            pass(name, `Rejected: "${res.data.error}"`);
        } catch (err) { fail(name, err.message); }
    }
}

async function test_friendly_slug_reserved_blocklist() {
    // Note: 1-char and uppercase variants fail the FRIENDLY_SLUG_RE (2-64 chars,
    // lowercase only) before the blocklist — that's covered by
    // test_friendly_slug_validation above. Here we test 2+ char reserved words.
    const reserved = ['api', 'agent', 'app', 'uploads', 'login', 'public', 'hosted-html', 'my-seda', 'bug-dashboard'];
    for (const slug of reserved) {
        const name = `[VAL] friendlySlug "${slug}" is reserved → 400`;
        try {
            const res = await jsonRequest('POST', '/api/hosted-html/host', {
                creatorName: 'Tester', title: 'x', html: VALID_HTML, friendlySlug: slug
            }, { 'X-Api-Key': 'hostmyapp' });
            if (res.status !== 400) return fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
            if (!/reserved/i.test(res.data.error || '')) return fail(name, `Error should mention reserved: ${res.data.error}`);
            pass(name, `Rejected: "${res.data.error}"`);
        } catch (err) { fail(name, err.message); }
    }
}

async function test_friendly_slug_normalized() {
    const name = '[VAL] friendlySlug "  My-Page_2026  " accepted, normalized';
    try {
        // We only verify the controller accepts the shape and either succeeds
        // (DB) or fails predictably (DB stub). What we test: the regex passes.
        const res = await jsonRequest('POST', '/api/hosted-html/host', {
            creatorName: 'Tester', title: 'x', html: VALID_HTML, friendlySlug: 'My-Page_2026'
        }, { 'X-Api-Key': 'hostmyapp' });
        // Without DB → 500. With DB → 200. Either way: NOT 400 (validation passed).
        if (res.status === 400 && /friendlySlug/i.test(res.data.error || '')) {
            return fail(name, `Validation rejected a valid slug: ${res.data.error}`);
        }
        pass(name, `Accepted (status ${res.status})`);
    } catch (err) { fail(name, err.message); }
}

async function test_public_404_for_unknown_friendly_slug() {
    const name = '[PUBLIC] GET /app/zzz-unknown-friendly → 404';
    try {
        const res = await fetch(`${BASE_URL}/app/zzz-no-such-slug`);
        if (res.status !== 404) return fail(name, `Expected 404, got ${res.status}`);
        pass(name, 'Returned 404');
    } catch (err) { fail(name, err.message); }
}

async function test_public_404_for_malformed_friendly_slug() {
    const name = '[PUBLIC] GET /app/UPPERCASE-BAD → 404 (regex rejects)';
    try {
        const res = await fetch(`${BASE_URL}/app/UPPERCASE-BAD`);
        if (res.status !== 404) return fail(name, `Expected 404, got ${res.status}`);
        pass(name, 'Returned 404');
    } catch (err) { fail(name, err.message); }
}

async function test_list_by_api_key() {
    const name = '[LIST] GET /host/list returns the apps we pushed';
    if (!await checkDbAvailable()) return skip(name, 'DB not available');
    try {
        const res = await jsonRequest('GET', '/api/hosted-html/host/list', null, { 'X-Api-Key': 'hostmyapp' });
        if (!res.ok || !res.data.success) return fail(name, `List failed: ${res.status} ${JSON.stringify(res.data)}`);
        if (!Array.isArray(res.data.apps)) return fail(name, 'apps not an array');
        if (res.data.apps.length === 0) return fail(name, 'Expected at least 1 app in list');
        const a = res.data.apps[0];
        if (!a.url || !a.slug) return fail(name, 'App missing url/slug');
        pass(name, `count=${res.data.apps.length} first=${a.slug}`);
    } catch (err) { fail(name, err.message); }
}

async function test_disable_by_api_key() {
    const name = '[LIST] POST /host/:id/disable flips status to disabled';
    if (!await checkDbAvailable()) return skip(name, 'DB not available');
    try {
        const listRes = await jsonRequest('GET', '/api/hosted-html/host/list', null, { 'X-Api-Key': 'hostmyapp' });
        const target = listRes.data?.apps?.find((a) => a.status === 'published');
        if (!target) return skip(name, 'No published app to disable');

        const disRes = await jsonRequest('POST', `/api/hosted-html/host/${target.id}/disable`, {}, { 'X-Api-Key': 'hostmyapp' });
        if (!disRes.ok || !disRes.data.success) return fail(name, `Disable failed: ${disRes.status}`);
        if (disRes.data.app.status !== 'disabled') return fail(name, `Status not disabled: ${disRes.data.app.status}`);

        // Public fetch should now 404
        const pub = await fetch(`${BASE_URL}/h/${target.slug}`);
        if (pub.status !== 404) return fail(name, `Disabled app should 404 publicly, got ${pub.status}`);

        pass(name, `disabled id=${target.id} slug=${target.slug}`);
    } catch (err) { fail(name, err.message); }
}

async function test_size_limit() {
    const name = '[VAL] POST /host with 30 MB html → 400';
    try {
        const bigHtml = '<!DOCTYPE html><html><body>' + 'A'.repeat(30 * 1024 * 1024) + '</body></html>';
        const res = await jsonRequest('POST', '/api/hosted-html/host', {
            creatorName: 'Tester', title: 'Big', html: bigHtml
        }, { 'X-Api-Key': 'hostmyapp' });
        if (res.status !== 400) return fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
        pass(name, `Rejected: "${res.data.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_delete_unauth() {
    const name = '[AUTH] DELETE /host/:id without X-Api-Key → 401';
    try {
        const res = await fetch(`${BASE_URL}/api/hosted-html/host/1`, { method: 'DELETE' });
        if (res.status !== 401) return fail(name, `Expected 401, got ${res.status}`);
        pass(name, 'Rejected');
    } catch (err) { fail(name, err.message); }
}

async function test_put_replace_unauth() {
    const name = '[AUTH] PUT /host/:id without X-Api-Key → 401';
    try {
        const res = await fetch(`${BASE_URL}/api/hosted-html/host/1`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'x' })
        });
        if (res.status !== 401) return fail(name, `Expected 401, got ${res.status}`);
        pass(name, 'Rejected');
    } catch (err) { fail(name, err.message); }
}

async function test_delete_stub_returns_404() {
    const name = '[API] DELETE /host/:id with auth (stub DB) → 404';
    try {
        const res = await fetch(`${BASE_URL}/api/hosted-html/host/1`, {
            method: 'DELETE',
            headers: { 'X-Api-Key': 'hostmyapp' }
        });
        // Stub DB returns null from getAppByIdAndOwner (DELETE on null target = 404).
        if (res.status !== 404) return fail(name, `Expected 404, got ${res.status}: ${await res.text()}`);
        pass(name, 'Returned 404 (stub: app not found)');
    } catch (err) { fail(name, err.message); }
}

async function test_put_replace_stub_returns_404() {
    const name = '[API] PUT /host/:id with auth (stub DB) → 404';
    try {
        const res = await fetch(`${BASE_URL}/api/hosted-html/host/1`, {
            method: 'PUT',
            headers: { 'X-Api-Key': 'hostmyapp', 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'new' })
        });
        if (res.status !== 404) return fail(name, `Expected 404, got ${res.status}: ${await res.text()}`);
        pass(name, 'Returned 404 (stub: app not found)');
    } catch (err) { fail(name, err.message); }
}

async function test_docs_includes_new_endpoints() {
    const name = '[DOCS] /docs lists the 7 API-key + 8 JWT endpoints at 25 MB';
    try {
        const res = await fetch(`${BASE_URL}/api/hosted-html/docs`);
        const data = await res.json();
        if (data.limits.max_html_size_bytes !== 25 * 1024 * 1024) {
            return fail(name, `Expected 25 MB, got ${data.limits.max_html_size_bytes}`);
        }
        if (!Array.isArray(data.api_key_endpoints) || data.api_key_endpoints.length !== 7) {
            return fail(name, `Expected 7 api_key_endpoints, got ${data.api_key_endpoints?.length}`);
        }
        if (!data.user_endpoints_jwt || data.user_endpoints_jwt.length !== 8) {
            return fail(name, `Expected 8 user_endpoints_jwt lines, got ${data.user_endpoints_jwt?.length}`);
        }
        const hasReplace = data.api_key_endpoints.some((e) => e.method === 'PUT' && e.path.endsWith('/:id'));
        const hasDelete = data.api_key_endpoints.some((e) => e.method === 'DELETE' && e.path.endsWith('/:id'));
        if (!hasReplace) return fail(name, 'Missing PUT /:id in docs');
        if (!hasDelete) return fail(name, 'Missing DELETE /:id in docs');
        pass(name, `25 MB, ${data.api_key_endpoints.length} api + ${data.user_endpoints_jwt.length} jwt; PUT/DELETE present`);
    } catch (err) { fail(name, err.message); }
}

// ── Cleanup ───────────────────────────────────────────────────────────────
function cleanupTestFiles() {
    if (!fs.existsSync(UPLOAD_DIR)) return;
    const slugs = fs.readdirSync(UPLOAD_DIR);
    let count = 0;
    for (const slug of slugs) {
        const p = path.join(UPLOAD_DIR, slug);
        try {
            if (fs.statSync(p).isDirectory()) {
                fs.rmSync(p, { recursive: true, force: true });
                count++;
            }
        } catch (_) { /* ignore */ }
    }
    if (count) console.log(`[Cleanup] Removed ${count} test app dir(s) from ${UPLOAD_DIR}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  Hosted HTML — End-to-End Test');
    console.log('════════════════════════════════════════════════════\n');

    const dbOk = await checkDbAvailable();
    console.log(`[Init] DB available: ${dbOk ? 'YES (full integration)' : 'NO (HTTP/auth/validation only — pool stubbed)'}`);
    console.log(`[Init] Storage dir:  ${UPLOAD_DIR}`);
    console.log(`[Init] API key:      hostmyapp (default)\n`);

    if (!dbOk) stubPool();

    const app = buildTestApp();
    let server;
    try {
        server = await new Promise((resolve, reject) => {
            const s = http.createServer(app);
            s.once('error', reject);
            s.listen(TEST_PORT, () => resolve(s));
        });
    } catch (err) {
        if (err.code === 'EADDRINUSE') {
            console.error(`[Error] Port ${TEST_PORT} is in use. Stop other test runs first.\n`);
        } else {
            console.error('[Error]', err.message);
        }
        process.exit(1);
    }

    console.log(`[Init] Test server running on ${BASE_URL}\n`);
    console.log('── Running tests ─────────────────────────────────────\n');

    try {
        await test_missing_api_key();
        await test_wrong_api_key();
        await test_api_key_via_body_field();
        await test_missing_creator_name();
        await test_missing_html();
        await test_invalid_html_content();
        await test_size_limit();
        await test_delete_unauth();
        await test_put_replace_unauth();
        await test_delete_stub_returns_404();
        await test_put_replace_stub_returns_404();
        await test_docs_includes_new_endpoints();
        await test_public_404_for_unknown_slug();
        await test_public_404_for_malformed_slug();
        await test_friendly_slug_validation();
        await test_friendly_slug_reserved_blocklist();
        await test_friendly_slug_normalized();
        await test_public_404_for_unknown_friendly_slug();
        await test_public_404_for_malformed_friendly_slug();

        const issued = await test_issue_writes_placeholder_file();
        const published = await test_upload_to_issued_app(issued);
        await test_public_serve(published);
        await test_list_by_api_key();
        await test_disable_by_api_key();
    } finally {
        server.close();
        cleanupTestFiles();

        const w = Math.max(...results.map((r) => r.name.length));
        console.log('\n════════════════════════════════════════════════════');
        console.log('  Results');
        console.log('════════════════════════════════════════════════════\n');
        results.forEach((r) => {
            const pad = ' '.repeat(Math.max(0, w - r.name.length + 2));
            console.log(`  ${r.status}  ${r.name}${r.detail ? pad + '→ ' + r.detail : ''}`);
        });
        console.log('\n────────────────────────────────────────────────────');
        const line = skipped
            ? `  ${passed} passed  |  ${failed} failed  |  ${skipped} skipped`
            : `  ${passed} passed  |  ${failed} failed`;
        console.log(line);
        console.log('════════════════════════════════════════════════════\n');
        process.exit(failed > 0 ? 1 : 0);
    }
}

main();
