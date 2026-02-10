require('dotenv').config();
const pool = require('./src/core/database/pool');

async function checkCreatedBy() {
    try {
        const res = await pool.query('SELECT created_by, public, count(*) FROM voucher GROUP BY created_by, public');
        console.table(res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkCreatedBy();
