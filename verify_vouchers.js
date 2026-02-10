require('dotenv').config();
const pool = require('./src/core/database/pool');

async function checkVouchers() {
    try {
        const res = await pool.query('SELECT id, voucher_code, active, "delete" FROM voucher');
        console.log('Total Vouchers:', res.rowCount);
        console.table(res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkVouchers();
