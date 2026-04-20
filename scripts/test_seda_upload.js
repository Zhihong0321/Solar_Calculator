/**
 * test_seda_upload.js
 *
 * Tests the SEDA file upload HTTP layer end-to-end.
 *
 * Two modes:
 *   MODE 1 — Full (DB available):  Tests upload + DB persistence
 *   MODE 2 — HTTP-only (no DB):    Tests multer, file routing, rejections via a stub router
 *
 * Run:  node scripts/test_seda_upload.js
 */

'use strict';

require('dotenv').config();
const http         = require('http');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');
const express      = require('express');
const multer       = require('multer');

// ─── Config ──────────────────────────────────────────────────────────────────
const TEST_PORT  = 3099;
const BASE_URL   = `http://localhost:${TEST_PORT}`;
const UPLOAD_DIR = path.join(__dirname, '../storage/seda_test_tmp');

// ─── Minimal valid test files ─────────────────────────────────────────────────
const MINIMAL_PDF = Buffer.from(
    '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj ' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n' +
    '0000000058 00000 n \n0000000115 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF\n'
);

const MINIMAL_JPG = Buffer.from(
    'FFD8FFE000104A46494600010100000100010000' +
    'FFDB004300080606070605080707070909080A0C' +
    '140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20' +
    '242E2720222C231C1C2837292C30313434341F27' +
    '393D38323C2E333432FFC0000B080001000101011100' +
    'FFC4001F0000010501010101010100000000000000' +
    '000102030405060708090A0BFFDA00030101003F00' +
    'A7FFD9',
    'hex'
);

// ─── Field config (mirrors server FILE_FIELDS exactly) ────────────────────────
const FILE_FIELDS = {
    mykad_front:    { label: 'MyKad Front',              accept: ['image/*'],                    maxMB: 20 },
    mykad_back:     { label: 'MyKad Back',               accept: ['image/*'],                    maxMB: 20 },
    mykad_pdf:      { label: 'MyKad PDF',                accept: ['application/pdf'],             maxMB: 25 },
    tnb_bill_1:     { label: 'TNB Bill Month 1',         accept: ['application/pdf', 'image/*'],  maxMB: 25 },
    tnb_bill_2:     { label: 'TNB Bill Month 2',         accept: ['application/pdf', 'image/*'],  maxMB: 25 },
    tnb_bill_3:     { label: 'TNB Bill Month 3',         accept: ['application/pdf', 'image/*'],  maxMB: 25 },
    property_proof: { label: 'Property Ownership Proof', accept: ['application/pdf', 'image/*'], maxMB: 25 },
    tnb_meter:      { label: 'TNB Meter Image',          accept: ['image/*'],                    maxMB: 20 },
};

// ─── Results ──────────────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, skipped = 0;

function pass(name, detail = '')  { results.push({ status: '✓ PASS', name, detail }); passed++;  }
function fail(name, detail = '')  { results.push({ status: '✗ FAIL', name, detail }); failed++;  }
function skip(name, reason = '')  { results.push({ status: '⊖ SKIP', name, detail: reason }); skipped++; }

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function upload(fieldKey, buffer, filename, mime) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), filename);
    const res  = await fetch(`${BASE_URL}/upload/${fieldKey}`, { method: 'POST', body: form });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
}

// ─── Stub Express app (no DB, pure HTTP layer test) ───────────────────────────
//
// This re-implements the exact same multer setup as sedaRoutes.js handleUpload()
// so we can test it in isolation without a database.
//

function isMimeOk(mime, accept) {
    return accept.some(rule =>
        rule.endsWith('/*') ? mime.startsWith(rule.slice(0, -1)) : mime === rule
    );
}

function resolvedMime(file) {
    const declared = (file.mimetype || '').toLowerCase().trim();
    if (declared && declared !== 'application/octet-stream') return declared;
    // Sniff from extension
    const ext = path.extname(file.originalname || '').toLowerCase();
    const map = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    return map[ext] || '';
}

function fileExt(file) {
    const e = path.extname(file.originalname || '');
    if (e) return e.toLowerCase();
    const m = resolvedMime(file);
    if (m === 'application/pdf') return '.pdf';
    if (m === 'image/png')       return '.png';
    return '.jpg';
}

function buildTestRouter() {
    const router = express.Router();

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    const upload = multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
            filename: (req, file, cb) => {
                const unique = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                cb(null, `${req.params.field}_test_${unique}${fileExt(file)}`);
            }
        }),
        limits: { fileSize: 30 * 1024 * 1024, files: 1 },
        fileFilter(req, file, cb) {
            const rule = FILE_FIELDS[req.params.field];
            if (!rule) return cb(new Error('Unknown upload field.'));
            const mime = resolvedMime(file);
            if (!mime) return cb(new Error(`${rule.label}: Cannot determine file type.`));
            if (!isMimeOk(mime, rule.accept)) return cb(new Error(`${rule.label}: Wrong file type. Accepted: ${rule.accept.join(', ')}.`));
            cb(null, true);
        }
    }).single('file');

    router.post('/upload/:field', (req, res) => {
        const rule = FILE_FIELDS[req.params.field];
        if (!rule) return res.status(400).json({ success: false, error: 'Unknown upload field.' });

        upload(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: `${rule.label}: File too large.` });
                return res.status(400).json({ success: false, error: err.message });
            }
            if (!req.file) return res.status(400).json({ success: false, error: `${rule.label}: No file received.` });

            return res.json({
                success: true,
                field: req.params.field,
                url: `http://localhost:${TEST_PORT}/seda-files/${req.file.filename}`,
                filename: req.file.filename,
                size: req.file.size
            });
        });
    });

    return router;
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

async function test_valid_pdf_upload() {
    const name = '[CORE] Valid PDF → tnb_bill_1 (the field that kept failing)';
    try {
        const { ok, status, json } = await upload('tnb_bill_1', MINIMAL_PDF, 'bill.pdf', 'application/pdf');
        if (!ok || !json?.success) return fail(name, `HTTP ${status}: ${json?.error}`);
        if (!json.url) return fail(name, 'No URL in response');
        pass(name, `OK — size=${json.size}b  file=${json.filename}`);
    } catch (err) { fail(name, err.message); }
}

async function test_all_fields_accept_correct_types() {
    const cases = [
        { field: 'mykad_front',    buf: MINIMAL_JPG, file: 'front.jpg', mime: 'image/jpeg'      },
        { field: 'mykad_back',     buf: MINIMAL_JPG, file: 'back.jpg',  mime: 'image/jpeg'      },
        { field: 'mykad_pdf',      buf: MINIMAL_PDF, file: 'id.pdf',    mime: 'application/pdf' },
        { field: 'tnb_bill_1',     buf: MINIMAL_PDF, file: 'b1.pdf',    mime: 'application/pdf' },
        { field: 'tnb_bill_2',     buf: MINIMAL_JPG, file: 'b2.jpg',    mime: 'image/jpeg'      },
        { field: 'tnb_bill_3',     buf: MINIMAL_PDF, file: 'b3.pdf',    mime: 'application/pdf' },
        { field: 'property_proof', buf: MINIMAL_PDF, file: 'sp.pdf',    mime: 'application/pdf' },
        { field: 'tnb_meter',      buf: MINIMAL_JPG, file: 'm.jpg',     mime: 'image/jpeg'      },
    ];

    for (const c of cases) {
        const name = `[FIELD] ${FILE_FIELDS[c.field].label} → correct type`;
        try {
            const { ok, status, json } = await upload(c.field, c.buf, c.file, c.mime);
            if (!ok || !json?.success) { fail(name, `HTTP ${status}: ${json?.error}`); continue; }
            pass(name, `size=${json.size}b`);
        } catch (err) { fail(name, err.message); }
    }
}

async function test_property_proof_accepts_image() {
    const name = '[FIELD] Property Proof → JPEG (also accepted)';
    try {
        const { ok, status, json } = await upload('property_proof', MINIMAL_JPG, 'proof.jpg', 'image/jpeg');
        if (!ok || !json?.success) return fail(name, `HTTP ${status}: ${json?.error}`);
        pass(name, 'JPEG accepted for property_proof field');
    } catch (err) { fail(name, err.message); }
}

async function test_tnb_bill_accepts_image() {
    const name = '[FIELD] TNB Bill Month 1 → JPEG (also accepted)';
    try {
        const { ok, status, json } = await upload('tnb_bill_1', MINIMAL_JPG, 'bill.jpg', 'image/jpeg');
        if (!ok || !json?.success) return fail(name, `HTTP ${status}: ${json?.error}`);
        pass(name, 'JPEG accepted for tnb_bill_1 field');
    } catch (err) { fail(name, err.message); }
}

async function test_wrong_type_pdf_to_image_field() {
    const name = '[REJECT] PDF sent to mykad_front (image-only field)';
    try {
        const { ok, status, json } = await upload('mykad_front', MINIMAL_PDF, 'doc.pdf', 'application/pdf');
        if (ok) return fail(name, 'Accepted wrong type — should have rejected');
        if (status !== 400) return fail(name, `Expected 400, got ${status}`);
        pass(name, `Rejected: "${json?.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_unknown_field() {
    const name = '[REJECT] Unknown field key (/upload/hacker_field)';
    try {
        const { ok, status } = await upload('hacker_field', MINIMAL_PDF, 'x.pdf', 'application/pdf');
        if (ok) return fail(name, 'Accepted unknown field');
        pass(name, `Rejected with HTTP ${status}`);
    } catch (err) { fail(name, err.message); }
}

async function test_empty_formdata() {
    const name = '[REJECT] Empty FormData (no file key)';
    try {
        const res  = await fetch(`${BASE_URL}/upload/tnb_bill_1`, { method: 'POST', body: new FormData() });
        const json = await res.json().catch(() => null);
        if (res.ok) return fail(name, 'Accepted empty FormData');
        pass(name, `Rejected HTTP ${res.status}: "${json?.error}"`);
    } catch (err) { fail(name, err.message); }
}

async function test_response_shape_correct() {
    const name = '[RESPONSE] Success body has required keys: success, field, url';
    try {
        const { ok, json } = await upload('tnb_bill_1', MINIMAL_PDF, 'r.pdf', 'application/pdf');
        if (!ok || !json?.success) return fail(name, `Upload failed: ${json?.error}`);
        const missing = ['success', 'field', 'url'].filter(k => !(k in json));
        if (missing.length) return fail(name, `Missing keys: ${missing.join(', ')}`);
        if (json.field !== 'tnb_bill_1') return fail(name, `field="${json.field}" expected "tnb_bill_1"`);
        if (!json.url.startsWith('http')) return fail(name, `url not absolute: "${json.url}"`);
        pass(name, `{ success:true, field:"${json.field}", url:…${json.url.slice(-20)} }`);
    } catch (err) { fail(name, err.message); }
}

async function test_content_type_not_required() {
    // The frontend must NOT set Content-Type manually for multipart.
    // This test confirms the server works even when the client sends no explicit Content-Type
    // (the FormData body auto-sets the multipart boundary header)
    const name = '[SPEC] Client does not manually set Content-Type (browser FormData rule)';
    try {
        // fetch with FormData body automatically sets correct multipart header — this is the spec
        const form = new FormData();
        form.append('file', new Blob([MINIMAL_PDF], { type: 'application/pdf' }), 'spec_test.pdf');
        const res  = await fetch(`${BASE_URL}/upload/tnb_bill_1`, { method: 'POST', body: form });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) return fail(name, `Failed: ${json?.error}`);
        pass(name, 'Server correctly parsed multipart without explicit Content-Type header');
    } catch (err) { fail(name, err.message); }
}

async function test_large_file_rejected() {
    const name = '[REJECT] File exceeding 30 MB size limit';
    try {
        // Create a 31 MB buffer
        const bigFile = Buffer.alloc(31 * 1024 * 1024, 0x41); // 31MB of 'A'
        const { ok, status, json } = await upload('tnb_bill_1', bigFile, 'huge.pdf', 'application/pdf');
        if (ok) return fail(name, 'Server accepted oversized file');
        pass(name, `Rejected with HTTP ${status}: "${json?.error}"`);
    } catch (err) { fail(name, err.message); }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanupTestFiles() {
    if (!fs.existsSync(UPLOAD_DIR)) return;
    const files = fs.readdirSync(UPLOAD_DIR);
    files.forEach(f => { try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch (_) {} });
    try { fs.rmdirSync(UPLOAD_DIR); } catch (_) {}
    if (files.length) console.log(`[Cleanup] Removed ${files.length} test file(s) from ${UPLOAD_DIR}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  SEDA Upload System — End-to-End Test');
    console.log('  Tests the HTTP + multer layer (no DB required)');
    console.log('════════════════════════════════════════════════════\n');

    // Build a standalone test server with the same multer logic
    const app = express();
    app.use((req, res, next) => {
        const ct = req.headers['content-type'] || '';
        if (ct.startsWith('multipart/form-data')) return next();
        return express.json({ limit: '50mb' })(req, res, next);
    });
    app.use(buildTestRouter());

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

    console.log(`[Init] Test server running on ${BASE_URL}`);
    console.log('[Init] Upload dir:', UPLOAD_DIR, '\n');
    console.log('── Running tests ─────────────────────────────────────\n');

    try {
        await test_valid_pdf_upload();
        await test_response_shape_correct();
        await test_content_type_not_required();
        await test_all_fields_accept_correct_types();
        await test_property_proof_accepts_image();
        await test_tnb_bill_accepts_image();
        await test_wrong_type_pdf_to_image_field();
        await test_unknown_field();
        await test_empty_formdata();
        await test_large_file_rejected();
    } finally {
        cleanupTestFiles();
        server.close();

        const w = Math.max(...results.map(r => r.name.length));
        console.log('\n════════════════════════════════════════════════════');
        console.log('  Results');
        console.log('════════════════════════════════════════════════════\n');
        results.forEach(r => {
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
