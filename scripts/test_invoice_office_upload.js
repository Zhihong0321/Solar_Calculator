/**
 * test_invoice_office_upload.js
 *
 * Local smoke test for the shared File Upload Processor as used by Invoice Office.
 *
 * Modes:
 *   MODE 1 — HTTP-only (default): tests shared upload processor + Invoice Office field config via a stub route
 *   MODE 2 — future optional DB-backed mode can be added later if we want to verify invoice array persistence
 *
 * Run:
 *   node scripts/test_invoice_office_upload.js
 *   npm run test:invoice-office-upload
 */

'use strict';

require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const {
    createUploader,
    buildPublicUrl,
    safeDelete,
    resolvedMime,
    fileExtension,
    validateFilename,
    validateSize,
    uploadSuccess,
    uploadError,
    ERROR_CODES,
} = require('../src/core/upload');

const TEST_PORT = 3101;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_STORAGE_ROOT = path.join(__dirname, '../storage');

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

const FILE_FIELDS = {
    roof_images: {
        label: 'Roof Image',
        accept: ['image/*'],
        maxMB: 10,
        storageSubdir: 'roof_images',
    },
    site_assessment_images: {
        label: 'Site Assessment Image',
        accept: ['image/*'],
        maxMB: 10,
        storageSubdir: 'site_assessment_images',
    },
    pv_drawings: {
        label: 'PV System Drawing',
        accept: ['application/pdf', 'image/*'],
        maxMB: 10,
        storageSubdir: 'pv_drawings',
    },
};

const results = [];
let passed = 0;
let failed = 0;

function pass(name, detail = '') { results.push({ status: '✓ PASS', name, detail }); passed++; }
function fail(name, detail = '') { results.push({ status: '✗ FAIL', name, detail }); failed++; }

async function upload(fieldKey, buffer, filename, mime, extraHeaders = {}) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), filename);
    const res = await fetch(`${BASE_URL}/api/v1/invoice-office/test_invoice/upload/${fieldKey}`, {
        method: 'POST',
        body: form,
        headers: extraHeaders,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
}

function getUploader(fieldKey) {
    const rule = FILE_FIELDS[fieldKey];
    return createUploader({
        storageSubdir: rule.storageSubdir,
        allowedMimes: rule.accept,
        maxFileSizeMB: rule.maxMB,
        generateFilename: (req, file) => {
            const ts = Date.now();
            const rand = crypto.randomBytes(4).toString('hex');
            return `${fieldKey}_${req.params.bubbleId}_${ts}_${rand}${fileExtension(file)}`;
        }
    });
}

function buildTestRouter() {
    const router = express.Router();

    router.post('/api/v1/invoice-office/:bubbleId/upload/:field', async (req, res) => {
        const { bubbleId, field } = req.params;
        const rule = FILE_FIELDS[field];

        if (!rule) {
            return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, {
                field,
                error: `"${field}" is not a valid Invoice Office upload field.`,
            }));
        }

        const multerErr = await getUploader(field)(req, res);
        if (multerErr) {
            const isTooLarge = multerErr.code === 'LIMIT_FILE_SIZE';
            const isWrongType = multerErr.code === 'WRONG_TYPE';
            const code = isTooLarge ? ERROR_CODES.TOO_LARGE : isWrongType ? ERROR_CODES.WRONG_TYPE : ERROR_CODES.STORAGE_FAILED;
            const status = isTooLarge ? 413 : isWrongType ? 400 : 500;
            const message = isTooLarge
                ? `${rule.label}: File too large. Maximum is ${rule.maxMB} MB.`
                : (multerErr.message || 'Upload failed.');
            return res.status(status).json(uploadError(code, { field, error: message }));
        }

        if (!req.file) {
            return res.status(400).json(uploadError(ERROR_CODES.NO_FILE, {
                field,
                error: `${rule.label}: No file received. Please select a file and try again.`,
            }));
        }

        const sizeCheck = validateSize(req.file.size, rule.maxMB, rule.label);
        if (!sizeCheck.ok) {
            safeDelete(req.file.path);
            return res.status(413).json(uploadError(ERROR_CODES.TOO_LARGE, { field, error: sizeCheck.error }));
        }

        const nameCheck = validateFilename(req.file.originalname || '');
        if (!nameCheck.ok) {
            safeDelete(req.file.path);
            return res.status(400).json(uploadError(ERROR_CODES.UNSAFE_FILENAME, {
                field,
                error: `${rule.label}: ${nameCheck.error}`,
            }));
        }

        const mime = resolvedMime(req.file);
        const fileUrl = buildPublicUrl(req, rule.storageSubdir, req.file.filename);
        return res.json(uploadSuccess({
            field,
            url: fileUrl,
            filename: req.file.filename,
            mime,
            size: req.file.size,
        }));
    });

    return router;
}

async function test_roof_accepts_jpeg() {
    const name = '[FIELD] roof_images accepts JPEG';
    try {
        const { ok, status, json } = await upload('roof_images', MINIMAL_JPG, 'roof.jpg', 'image/jpeg');
        if (!ok || !json?.success) return fail(name, `HTTP ${status}: ${json?.error}`);
        pass(name, json.filename);
    } catch (err) { fail(name, err.message); }
}

async function test_site_assessment_accepts_octet_stream_jpg() {
    const name = '[FIELD] site_assessment_images accepts octet-stream fallback by extension';
    try {
        const { ok, status, json } = await upload('site_assessment_images', MINIMAL_JPG, 'site-photo.jpg', 'application/octet-stream');
        if (!ok || !json?.success) return fail(name, `HTTP ${status}: ${json?.error}`);
        pass(name, json.mime);
    } catch (err) { fail(name, err.message); }
}

async function test_pv_accepts_pdf() {
    const name = '[FIELD] pv_drawings accepts PDF';
    try {
        const { ok, status, json } = await upload('pv_drawings', MINIMAL_PDF, 'drawing.pdf', 'application/pdf');
        if (!ok || !json?.success) return fail(name, `HTTP ${status}: ${json?.error}`);
        pass(name, json.filename);
    } catch (err) { fail(name, err.message); }
}

async function test_roof_rejects_pdf() {
    const name = '[REJECT] roof_images rejects PDF';
    try {
        const { ok, status, json } = await upload('roof_images', MINIMAL_PDF, 'roof.pdf', 'application/pdf');
        if (ok) return fail(name, 'Accepted wrong type');
        if (status !== 400) return fail(name, `Expected 400, got ${status}`);
        pass(name, json?.error || 'rejected');
    } catch (err) { fail(name, err.message); }
}

async function test_unknown_field() {
    const name = '[REJECT] unknown Invoice Office field';
    try {
        const { ok, status, json } = await upload('unknown_field', MINIMAL_JPG, 'x.jpg', 'image/jpeg');
        if (ok) return fail(name, 'Accepted unknown field');
        if (status !== 400) return fail(name, `Expected 400, got ${status}`);
        pass(name, json?.code || 'UNKNOWN_FIELD');
    } catch (err) { fail(name, err.message); }
}

async function test_empty_formdata() {
    const name = '[REJECT] empty FormData';
    try {
        const res = await fetch(`${BASE_URL}/api/v1/invoice-office/test_invoice/upload/roof_images`, {
            method: 'POST',
            body: new FormData(),
        });
        const json = await res.json().catch(() => null);
        if (res.ok) return fail(name, 'Accepted empty FormData');
        pass(name, `${res.status}: ${json?.error || 'rejected'}`);
    } catch (err) { fail(name, err.message); }
}

async function test_large_file_rejected() {
    const name = '[REJECT] oversized roof image';
    try {
        const big = Buffer.alloc(11 * 1024 * 1024, 0x41);
        const { ok, status, json } = await upload('roof_images', big, 'huge.jpg', 'image/jpeg');
        if (ok) return fail(name, 'Accepted oversized file');
        if (![400, 413].includes(status)) return fail(name, `Expected 400/413, got ${status}`);
        pass(name, json?.error || 'rejected');
    } catch (err) { fail(name, err.message); }
}

async function test_response_shape() {
    const name = '[RESPONSE] success body has required keys';
    try {
        const { ok, json } = await upload('pv_drawings', MINIMAL_PDF, 'shape.pdf', 'application/pdf');
        if (!ok || !json?.success) return fail(name, json?.error || 'Upload failed');
        const missing = ['success', 'field', 'url', 'filename', 'mime', 'size'].filter((key) => !(key in json));
        if (missing.length) return fail(name, `Missing keys: ${missing.join(', ')}`);
        pass(name, json.field);
    } catch (err) { fail(name, err.message); }
}

function cleanupTestFiles() {
    const dirs = Object.values(FILE_FIELDS).map((rule) => path.join(TEST_STORAGE_ROOT, rule.storageSubdir));
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter((name) => name.includes('test_invoice'));
        for (const file of files) {
            try { fs.unlinkSync(path.join(dir, file)); } catch (_) {}
        }
    }
}

async function main() {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  Invoice Office Upload Processor — Local Test');
    console.log('  HTTP layer only, no DB required');
    console.log('════════════════════════════════════════════════════\n');

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
        console.error(err.code === 'EADDRINUSE'
            ? `[Error] Port ${TEST_PORT} is already in use.`
            : `[Error] ${err.message}`);
        process.exit(1);
    }

    console.log(`[Init] Test server running on ${BASE_URL}\n`);

    try {
        await test_roof_accepts_jpeg();
        await test_site_assessment_accepts_octet_stream_jpg();
        await test_pv_accepts_pdf();
        await test_roof_rejects_pdf();
        await test_unknown_field();
        await test_empty_formdata();
        await test_large_file_rejected();
        await test_response_shape();
    } finally {
        cleanupTestFiles();
        server.close();

        const width = Math.max(...results.map((r) => r.name.length));
        console.log('\n════════════════════════════════════════════════════');
        console.log('  Results');
        console.log('════════════════════════════════════════════════════\n');
        for (const result of results) {
            const pad = ' '.repeat(Math.max(0, width - result.name.length + 2));
            console.log(`  ${result.status}  ${result.name}${result.detail ? pad + '→ ' + result.detail : ''}`);
        }
        console.log('\n────────────────────────────────────────────────────');
        console.log(`  ${passed} passed  |  ${failed} failed`);
        console.log('════════════════════════════════════════════════════\n');
        process.exit(failed > 0 ? 1 : 0);
    }
}

main();
