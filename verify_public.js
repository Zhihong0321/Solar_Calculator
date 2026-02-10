require('dotenv').config();
const pool = require('./src/core/database/pool');

async function checkPublic() {
    try {
        const res = await pool.query('SELECT public, count(*) FROM voucher GROUP BY public');
        console.table(res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkPublic();
