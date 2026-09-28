'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { ownershipFiles, appendOwnershipFileSql, removeOwnershipFileSql } = require('../src/modules/Invoicing/services/sedaOwnershipFiles');

test('ownership documents read legacy TEXT URLs and JSON text lists', () => {
    assert.deepEqual(ownershipFiles(null), []);
    assert.deepEqual(ownershipFiles(''), []);
    assert.deepEqual(ownershipFiles('/uploads/legacy.pdf'), ['/uploads/legacy.pdf']);
    assert.deepEqual(ownershipFiles('["/uploads/legacy.pdf","https://files.test/photo.jpg"]'), ['/uploads/legacy.pdf', 'https://files.test/photo.jpg']);
    assert.deepEqual(ownershipFiles('[]'), []);
    assert.deepEqual(ownershipFiles(['/uploads/legacy.pdf']), ['/uploads/legacy.pdf']);
});

// Execute the actual route persistence function with isolated DB/R2 dependencies.
// SQL typing and expressions were separately checked against production PostgreSQL
// with read-only EXPLAIN/SELECT; this test makes no network or storage writes.
for (const initialValue of [null, '/uploads/legacy.pdf']) {
    test(`actual upload handler preserves ${initialValue ? 'legacy TEXT proof' : 'empty TEXT column'} and caps the list at five`, async () => {
        const source = fs.readFileSync(require.resolve('../routes/sedaRoutes.js'), 'utf8');
        const functionSource = source.slice(source.indexOf('async function persistSedaFile('), source.indexOf('function drainRequest('));
        const fieldConfig = source.match(/property_proof: (\{[^\n]+\}),/)[1];
        let storedValue = initialValue;
        const reclaimed = [];
        const client = {
            async query(sql, params) {
                assert.equal(sql, appendOwnershipFileSql(), 'ownership uploads must use TEXT-compatible SQL');
                assert.equal(params[2], 5);
                const urls = ownershipFiles(storedValue);
                if (urls.length >= params[2]) return { rowCount: 0 };
                storedValue = JSON.stringify([...urls, params[0]]);
                return { rowCount: 1 };
            },
            release() {}
        };
        const context = vm.createContext({
            appendOwnershipFileSql, removeOwnershipFileSql,
            pool: { connect: async () => client },
            optimizeBuffer: async (buffer, mimeType) => ({ buffer, mimeType, finalBytes: buffer.length }),
            r2Storage: { uploadBuffer: async (_, filename) => `https://files.test/${filename}`, keyFromUrl: url => url, deleteObject: async url => reclaimed.push(url) },
            getLinkedInvoiceBubbleId: async () => null, getSedaActor: () => ({}), writeInvoiceAuditEntry: async () => {},
            logUpload() {}, console,
            ERROR_CODES: { DB_FAILED: 'DB_FAILED' }, uploadError: (code, data) => ({ code, ...data })
        });
        vm.runInContext(`${functionSource}\nconst rule = ${fieldConfig};`, context);
        const rule = vm.runInContext('rule', context);
        const startingCount = ownershipFiles(initialValue).length;
        for (let number = startingCount + 1; number <= 5; number++) {
            await context.persistSedaFile({ field: 'property_proof', rule, recordId: 'test', buffer: Buffer.from('test'), mime: 'application/pdf', filename: `${number}.pdf`, req: {}, routePath: '/test' });
            assert.equal(typeof storedValue, 'string');
            assert.equal(ownershipFiles(storedValue).length, number);
            if (initialValue) assert.equal(ownershipFiles(storedValue)[0], initialValue);
        }
        await assert.rejects(
            context.persistSedaFile({ field: 'property_proof', rule, recordId: 'test', buffer: Buffer.from('test'), mime: 'application/pdf', filename: 'sixth.pdf', req: {}, routePath: '/test' }),
            error => error.status === 409 && /maximum 5/.test(error.body.error)
        );
        assert.equal(ownershipFiles(storedValue).length, 5);
        assert.deepEqual(reclaimed, ['https://files.test/seda_registration/sixth.pdf']);
    });
}
