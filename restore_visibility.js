require('dotenv').config();
const pool = require('./src/core/database/pool');

async function forceDisplay() {
    try {
        console.log('Restoring visibility for ALL non-deleted vouchers...');
        // Set active=true and public=true for all non-deleted vouchers
        const res = await pool.query(`
      UPDATE voucher 
      SET active = TRUE, public = TRUE 
      WHERE ("delete" IS NULL OR "delete" = FALSE)
    `);
        console.log(`Updated ${res.rowCount} vouchers to be Active and Public.`);

        // Check new counts
        const verify = await pool.query('SELECT active, public, "delete", count(*) FROM voucher GROUP BY active, public, "delete"');
        console.table(verify.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

forceDisplay();
