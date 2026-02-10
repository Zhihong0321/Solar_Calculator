require('dotenv').config();
const pool = require('./src/core/database/pool');

async function checkNullPublicMap() {
    try {
        const res = await pool.query('SELECT active, "delete", count(*) FROM voucher WHERE public IS NULL GROUP BY active, "delete"');
        console.table(res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkNullPublicMap();
