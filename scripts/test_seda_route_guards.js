'use strict';

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const Module = require('module');

const TEST_PORT = 3100;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'seda-route-guards-'));

const results = [];
let passed = 0;
let failed = 0;

function pass(name, detail = '') {
    results.push({ status: 'PASS', name, detail });
    passed += 1;
}

function fail(name, detail = '') {
    results.push({ status: 'FAIL', name, detail });
    failed += 1;
}

function cleanupTempRoot() {
    try {
        fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
    } catch (_) {}
}

function createStoredFile(filename, content = 'test-file') {
    const fullPath = path.join(TEMP_ROOT, filename);
    fs.writeFileSync(fullPath, content);
    return fullPath;
}

createStoredFile('existing-bill.pdf', '%PDF-1.0 test');
createStoredFile('existing-mykad.jpg', 'jpeg-test');
createStoredFile('existing-meter.jpg', 'meter-test');
createStoredFile('existing-proof.pdf', '%PDF-1.0 proof');

const sedaRecords = {
    'seda-owned': {
        bubble_id: 'seda-owned',
        agent: 'agent-1',
        created_by: 'agent-1',
        ic_copy_front: '/uploads/seda_registration/existing-mykad.jpg',
        mykad_pdf: '/uploads/seda_registration/existing-bill.pdf',
        tnb_bill_1: '/uploads/seda_registration/existing-bill.pdf',
        tnb_meter: '/uploads/seda_registration/existing-meter.jpg',
        property_ownership_prove: '/uploads/seda_registration/existing-proof.pdf',
        installation_address: '123 Test Street',
        linked_customer: 'cust-1',
        linked_invoice: ['inv-1']
    },
    'seda-foreign': {
        bubble_id: 'seda-foreign',
        agent: 'agent-2',
        created_by: 'agent-2',
        ic_copy_front: '/uploads/seda_registration/existing-mykad.jpg',
        tnb_bill_1: '/uploads/seda_registration/existing-bill.pdf',
        tnb_meter: '/uploads/seda_registration/existing-meter.jpg',
        property_ownership_prove: '/uploads/seda_registration/existing-proof.pdf',
        installation_address: '456 Foreign Street',
        linked_customer: 'cust-2',
        linked_invoice: ['inv-2']
    }
};

const shareTokens = {
    'valid-share': sedaRecords['seda-owned']
};

function createDbClient() {
    return {
        async query(sql, params = []) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
            const bubbleId = params[0];

            if (normalized.includes('select bubble_id, agent, created_by from seda_registration where bubble_id = $1')) {
                const record = sedaRecords[bubbleId];
                if (!record) return { rows: [] };
                return {
                    rows: [{
                        bubble_id: record.bubble_id,
                        agent: record.agent,
                        created_by: record.created_by
                    }]
                };
            }

            if (normalized.startsWith('select * from seda_registration where bubble_id = $1')) {
                const record = sedaRecords[bubbleId];
                return { rows: record ? [record] : [] };
            }

            if (normalized.includes('from seda_registration where bubble_id = $1')) {
                const selectMatch = sql.match(/select\s+(.+?)\s+from\s+seda_registration/i);
                const columnList = selectMatch ? selectMatch[1].split(',').map((entry) => entry.trim()) : [];
                const record = sedaRecords[bubbleId];
                if (!record) return { rows: [] };

                const row = {};
                for (const column of columnList) {
                    if (column === '*') {
                        Object.assign(row, record);
                        continue;
                    }
                    const cleanColumn = column.replace(/["']/g, '');
                    row[cleanColumn] = record[cleanColumn];
                }
                return { rows: [row] };
            }

            if (normalized.includes('select name, phone, email, address, city, state, postcode from customer where customer_id = $1')) {
                return {
                    rows: [{
                        name: 'Test Customer',
                        phone: '0123456789',
                        email: 'test@example.com',
                        address: '123 Test Street',
                        city: 'Kuala Lumpur',
                        state: 'WP Kuala Lumpur',
                        postcode: '50000'
                    }]
                };
            }

            if (normalized.includes('select bubble_id, customer_signature, share_token, invoice_number from invoice where bubble_id = $1')) {
                return {
                    rows: [{
                        bubble_id: bubbleId,
                        customer_signature: null,
                        share_token: 'invoice-share',
                        invoice_number: 'INV-001'
                    }]
                };
            }

            if (normalized.startsWith('update seda_registration')) {
                return { rowCount: 1, rows: [] };
            }

            return { rows: [] };
        },
        release() {}
    };
}

const mockPool = {
    async connect() {
        return createDbClient();
    },
    async query(sql, params) {
        return createDbClient().query(sql, params);
    }
};

const mockAuth = {
    requireAuth(req, res, next) {
        if (req.headers['x-test-auth'] !== 'ok') {
            return res.status(401).json({ success: false, error: 'Auth required for test.' });
        }
        req.user = {
            bubbleId: 'user-1',
            bubble_id: 'user-1',
            linked_agent_profile: req.headers['x-test-agent'] || 'agent-1',
            access_level: req.headers['x-test-admin'] === 'yes' ? ['admin'] : []
        };
        return next();
    }
};

const mockUserIdentity = {
    async resolveAgentBubbleId(_db, req) {
        return req.headers['x-test-agent'] || req.user?.linked_agent_profile || null;
    }
};

const mockSedaRepo = {
    async getByShareToken(_client, shareToken) {
        return shareTokens[shareToken] || null;
    }
};

const mockExtractionService = {
    async verifyTnbBill() {
        return { tnb_account: '1234567890', state: 'Selangor' };
    },
    async verifyMykad() {
        return { quality_ok: true, customer_name: 'Test Owner', mykad_id: '900101011234' };
    },
    async verifyTnbMeter() {
        return { is_clear: true, remark: 'Meter image is readable.' };
    },
    async verifyOwnership() {
        return { name_match: true, address_match: true, owner_name: 'Test Owner' };
    }
};

const ERROR_CODES = {
    NO_FILE: 'NO_FILE',
    WRONG_TYPE: 'WRONG_TYPE',
    TOO_LARGE: 'TOO_LARGE',
    UNSAFE_FILENAME: 'UNSAFE_FILENAME',
    UNKNOWN_FIELD: 'UNKNOWN_FIELD',
    RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
    FORBIDDEN: 'FORBIDDEN',
    STORAGE_FAILED: 'STORAGE_FAILED',
    DB_FAILED: 'DB_FAILED',
    SERVER_ERROR: 'SERVER_ERROR'
};

function uploadError(code, { field, error } = {}) {
    return {
        success: false,
        code,
        ...(field ? { field } : {}),
        error: error || code
    };
}

function uploadSuccess(payload) {
    return { success: true, ...payload };
}

const mockUpload = {
    createUploader({ generateFilename }) {
        return async (req, _res) => {
            const mode = req.headers['x-test-upload-mode'] || 'success';
            if (mode === 'missing') return null;
            if (mode === 'wrong-type') {
                const err = new Error('Wrong file type.');
                err.code = 'WRONG_TYPE';
                return err;
            }
            if (mode === 'too-large') {
                const err = new Error('Too large.');
                err.code = 'LIMIT_FILE_SIZE';
                return err;
            }

            const originalname = req.headers['x-test-originalname'] || 'test.pdf';
            const mimetype = req.headers['x-test-mime'] || (originalname.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'application/pdf');
            const file = { originalname, mimetype };
            const filename = generateFilename ? generateFilename(req, file) : `upload_${Date.now()}.pdf`;
            const filePath = path.join(TEMP_ROOT, filename);
            fs.writeFileSync(filePath, 'uploaded-test-file');
            req.file = {
                originalname,
                mimetype,
                size: Number(req.headers['x-test-size'] || '1024'),
                filename,
                path: filePath
            };
            return null;
        };
    },
    buildPublicUrl(_req, storageSubdir, filename) {
        return `/uploads/${storageSubdir}/${filename}`;
    },
    resolveDiskPath(url) {
        if (!url) return null;
        return path.join(TEMP_ROOT, path.basename(url));
    },
    safeDelete(filePath) {
        try {
            fs.unlinkSync(filePath);
        } catch (_) {}
    },
    resolvedMime(file) {
        return (file?.mimetype || '').toLowerCase();
    },
    validateFilename(name) {
        if (String(name).includes('..')) {
            return { ok: false, error: 'Filename is not safe.' };
        }
        return { ok: true };
    },
    validateSize(size, maxMB, label) {
        const limit = maxMB * 1024 * 1024;
        if (size > limit) {
            return { ok: false, error: `${label}: File too large. Maximum is ${maxMB} MB.` };
        }
        return { ok: true };
    },
    uploadSuccess,
    uploadError,
    ERROR_CODES,
    logUpload() {},
    mb(value) {
        return value * 1024 * 1024;
    },
    fileExtension(file) {
        const ext = path.extname(file?.originalname || '').toLowerCase();
        if (ext) return ext;
        if (file?.mimetype === 'image/jpeg') return '.jpg';
        if (file?.mimetype === 'application/pdf') return '.pdf';
        return '';
    }
};

function loadRouterWithMocks() {
    const routeModulePath = require.resolve(path.join(__dirname, '../routes/sedaRoutes.js'));
    const mockMap = new Map([
        [require.resolve(path.join(__dirname, '../src/core/database/pool.js')), mockPool],
        [require.resolve(path.join(__dirname, '../src/core/middleware/auth.js')), mockAuth],
        [require.resolve(path.join(__dirname, '../src/core/auth/userIdentity.js')), mockUserIdentity],
        [require.resolve(path.join(__dirname, '../src/core/upload/index.js')), mockUpload],
        [require.resolve(path.join(__dirname, '../src/modules/Invoicing/services/sedaRepo.js')), mockSedaRepo],
        [require.resolve(path.join(__dirname, '../src/modules/Invoicing/services/extractionService.js')), mockExtractionService]
    ]);

    for (const modulePath of [routeModulePath, ...mockMap.keys()]) {
        delete require.cache[modulePath];
    }

    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        try {
            const resolved = Module._resolveFilename(request, parent, isMain);
            if (mockMap.has(resolved)) {
                return mockMap.get(resolved);
            }
        } catch (_) {}
        return originalLoad.apply(this, arguments);
    };

    try {
        return require(routeModulePath);
    } finally {
        Module._load = originalLoad;
    }
}

async function startServer() {
    const app = express();
    app.use(express.json());
    app.use(loadRouterWithMocks());

    return await new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.once('error', reject);
        server.listen(TEST_PORT, () => resolve(server));
    });
}

async function requestJson(pathname, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(`${BASE_URL}${pathname}`, {
        method,
        headers: {
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...headers
        },
        body: body ? JSON.stringify(body) : undefined
    });

    const json = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, json };
}

async function expectStatus(name, requestPromise, expectedStatus) {
    try {
        const { status, json } = await requestPromise;
        if (status !== expectedStatus) {
            return fail(name, `Expected HTTP ${expectedStatus}, got ${status}. Response: ${JSON.stringify(json)}`);
        }
        return pass(name, `HTTP ${status}`);
    } catch (err) {
        return fail(name, err.message);
    }
}

async function expectSuccess(name, requestPromise) {
    try {
        const { ok, status, json } = await requestPromise;
        if (!ok || !json?.success) {
            return fail(name, `Expected success, got HTTP ${status}. Response: ${JSON.stringify(json)}`);
        }
        return pass(name, `HTTP ${status}`);
    } catch (err) {
        return fail(name, err.message);
    }
}

async function expectSuccessWithData(name, requestPromise, keyPath) {
    try {
        const { ok, status, json } = await requestPromise;
        if (!ok || !json?.success) {
            return fail(name, `Expected success, got HTTP ${status}. Response: ${JSON.stringify(json)}`);
        }

        let cursor = json;
        for (const key of keyPath) {
            cursor = cursor?.[key];
        }
        if (cursor === undefined) {
            return fail(name, `Success response did not include ${keyPath.join('.')}. Response: ${JSON.stringify(json)}`);
        }

        return pass(name, `HTTP ${status}`);
    } catch (err) {
        return fail(name, err.message);
    }
}

async function runTests() {
    await expectStatus(
        '[AUTH] GET /api/v1/seda/:id blocks anonymous access',
        requestJson('/api/v1/seda/seda-owned'),
        401
    );

    await expectStatus(
        '[AUTH] POST /api/v1/seda/:id/upload/:field blocks anonymous access',
        requestJson('/api/v1/seda/seda-owned/upload/mykad_front', { method: 'POST' }),
        401
    );

    await expectStatus(
        '[OWNERSHIP] GET /api/v1/seda/:id blocks non-owner agent',
        requestJson('/api/v1/seda/seda-owned', { headers: { 'x-test-auth': 'ok', 'x-test-agent': 'agent-9' } }),
        403
    );

    await expectStatus(
        '[OWNERSHIP] POST /api/v1/seda/:id/upload/:field blocks non-owner agent',
        requestJson('/api/v1/seda/seda-owned/upload/mykad_front', {
            method: 'POST',
            headers: {
                'x-test-auth': 'ok',
                'x-test-agent': 'agent-9'
            }
        }),
        403
    );

    await expectSuccess(
        '[PUBLIC] Share-token upload accepts valid token',
        requestJson('/api/v1/seda-public/valid-share/upload/tnb_bill_1', {
            method: 'POST',
            headers: {
                'x-test-upload-mode': 'success',
                'x-test-originalname': 'bill.pdf',
                'x-test-mime': 'application/pdf'
            }
        })
    );

    await expectStatus(
        '[PUBLIC] Share-token upload rejects invalid token',
        requestJson('/api/v1/seda-public/bad-share/upload/tnb_bill_1', { method: 'POST' }),
        404
    );

    await expectSuccess(
        '[AUTH] Protected upload succeeds for owning agent',
        requestJson('/api/v1/seda/seda-owned/upload/mykad_front', {
            method: 'POST',
            headers: {
                'x-test-auth': 'ok',
                'x-test-agent': 'agent-1',
                'x-test-upload-mode': 'success',
                'x-test-originalname': 'front.jpg',
                'x-test-mime': 'image/jpeg'
            }
        })
    );

    await expectStatus(
        '[SECURITY] extract-tnb should block anonymous access',
        requestJson('/api/v1/seda/extract-tnb', {
            method: 'POST',
            body: { sedaId: 'seda-owned', fieldKey: 'tnb_bill_1' }
        }),
        401
    );

    await expectStatus(
        '[SECURITY] extract-mykad should block anonymous access',
        requestJson('/api/v1/seda/extract-mykad', {
            method: 'POST',
            body: { sedaId: 'seda-owned', fieldKey: 'mykad_front' }
        }),
        401
    );

    await expectStatus(
        '[SECURITY] verify-meter should block anonymous access',
        requestJson('/api/v1/seda/verify-meter', {
            method: 'POST',
            body: { sedaId: 'seda-owned' }
        }),
        401
    );

    await expectStatus(
        '[SECURITY] verify-ownership should block anonymous access',
        requestJson('/api/v1/seda/verify-ownership', {
            method: 'POST',
            body: { sedaId: 'seda-owned', context: { name: 'Test Owner', address: '123 Test Street' } }
        }),
        401
    );

    await expectSuccessWithData(
        '[ROUTING] extract-tnb should reach extraction handler',
        requestJson('/api/v1/seda/extract-tnb', {
            method: 'POST',
            headers: { 'x-test-auth': 'ok', 'x-test-agent': 'agent-1' },
            body: { sedaId: 'seda-owned', fieldKey: 'tnb_bill_1' }
        }),
        ['data', 'tnb_account']
    );

    await expectSuccessWithData(
        '[ROUTING] extract-mykad should reach extraction handler',
        requestJson('/api/v1/seda/extract-mykad', {
            method: 'POST',
            headers: { 'x-test-auth': 'ok', 'x-test-agent': 'agent-1' },
            body: { sedaId: 'seda-owned', fieldKey: 'mykad_front' }
        }),
        ['data', 'customer_name']
    );

    await expectSuccessWithData(
        '[ROUTING] verify-meter should reach extraction handler',
        requestJson('/api/v1/seda/verify-meter', {
            method: 'POST',
            headers: { 'x-test-auth': 'ok', 'x-test-agent': 'agent-1' },
            body: { sedaId: 'seda-owned' }
        }),
        ['data', 'is_clear']
    );

    await expectSuccessWithData(
        '[ROUTING] verify-ownership should reach extraction handler',
        requestJson('/api/v1/seda/verify-ownership', {
            method: 'POST',
            headers: { 'x-test-auth': 'ok', 'x-test-agent': 'agent-1' },
            body: { sedaId: 'seda-owned', context: { name: 'Test Owner', address: '123 Test Street' } }
        }),
        ['data', 'owner_name']
    );
}

async function main() {
    console.log('\n====================================================');
    console.log('  SEDA Route Guard Test');
    console.log('  Real sedaRoutes.js with mocked DB/auth/upload deps');
    console.log('====================================================\n');

    let server;
    try {
        server = await startServer();
        console.log(`[Init] Test server running on ${BASE_URL}`);
        console.log(`[Init] Temp file root: ${TEMP_ROOT}\n`);
        await runTests();
    } catch (err) {
        console.error('[Fatal]', err.message);
        failed += 1;
    } finally {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        cleanupTempRoot();
    }

    const width = results.length ? Math.max(...results.map((entry) => entry.name.length)) : 0;

    console.log('\n====================================================');
    console.log('  Results');
    console.log('====================================================\n');
    for (const entry of results) {
        const padding = ' '.repeat(Math.max(0, width - entry.name.length + 2));
        console.log(`  ${entry.status}  ${entry.name}${entry.detail ? `${padding}${entry.detail}` : ''}`);
    }
    console.log('\n----------------------------------------------------');
    console.log(`  ${passed} passed  |  ${failed} failed`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

main();
