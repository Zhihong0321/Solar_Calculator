'use strict';

const {
    listRecycleBinEntries,
    getActiveRecycleBinEntry,
    insertRecycleBinEntry,
    markRecycleBinRestored,
    isMissingRecycleBinTableError,
} = require('../src/core/upload/recycleBin');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function makeMissingTableError() {
    const err = new Error('relation "recycle_bin_upload" does not exist');
    err.code = '42P01';
    return err;
}

function createMissingTableClient() {
    return {
        async query() {
            throw makeMissingTableError();
        }
    };
}

async function expectThrows(fn, predicate, message) {
    try {
        await fn();
        throw new Error(`Expected error: ${message}`);
    } catch (err) {
        assert(predicate(err), message + `\nReceived: ${err.code || err.message}`);
    }
}

async function main() {
    const client = createMissingTableClient();

    assert(isMissingRecycleBinTableError(makeMissingTableError()) === true, 'Should detect missing recycle_bin_upload table errors.');

    const listResult = await listRecycleBinEntries(client, {
        module: 'invoice-office',
        linkedRecordType: 'invoice',
        linkedRecordId: 'test-invoice'
    });
    assert(Array.isArray(listResult), 'listRecycleBinEntries should return an array.');
    assert(listResult.length === 0, 'listRecycleBinEntries should fall back to empty results when recycle_bin_upload is missing.');

    const getResult = await getActiveRecycleBinEntry(client, 123, {
        module: 'invoice-office',
        linkedRecordType: 'invoice',
        linkedRecordId: 'test-invoice',
        fieldKey: 'roof_images'
    });
    assert(getResult === null, 'getActiveRecycleBinEntry should fall back to null when recycle_bin_upload is missing.');

    await expectThrows(
        () => insertRecycleBinEntry(client, {
            module: 'invoice-office',
            linkedRecordType: 'invoice',
            linkedRecordId: 'test-invoice',
            fieldKey: 'roof_images',
            fileUrl: '/uploads/roof_images/demo.jpg'
        }),
        (err) => err.code === 'RECYCLE_BIN_TABLE_MISSING',
        'insertRecycleBinEntry should throw a controlled migration-readiness error.'
    );

    await expectThrows(
        () => markRecycleBinRestored(client, 123, 'tester'),
        (err) => err.code === 'RECYCLE_BIN_TABLE_MISSING',
        'markRecycleBinRestored should throw a controlled migration-readiness error.'
    );

    console.log('recycle-bin-fallback-ok');
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
