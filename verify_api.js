require('dotenv').config();
const pool = require('./src/core/database/pool');
const voucherRepo = require('./src/modules/Voucher/services/voucherRepo');

async function testRepo() {
    try {
        console.log('--- Testing getAllVouchers(deleted) ---');
        const deleted = await voucherRepo.getAllVouchers(pool, 'deleted');
        console.log('Deleted Count:', deleted.length);
        if (deleted.length > 0) console.log('Sample:', deleted[0]);

        console.log('\n--- Testing getAllVouchers(active) ---');
        const active = await voucherRepo.getAllVouchers(pool, 'active');
        console.log('Active Count:', active.length);

        console.log('\n--- Testing getAllVouchers(all) ---');
        const all = await voucherRepo.getAllVouchers(pool, 'all');
        console.log('All Count:', all.length);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

testRepo();
