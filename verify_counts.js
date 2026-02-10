require('dotenv').config();
const pool = require('./src/core/database/pool');

async function checkVouchers() {
    try {
        const res = await pool.query('SELECT  active, "delete", count(*) FROM voucher GROUP BY active, "delete"');
        console.table(res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkVouchers();
