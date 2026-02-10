const { Pool } = require('pg');
const pool = require('./src/core/database/pool');

async function checkStatusColumn() {
    try {
        const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'voucher' 
      AND column_name = 'status'
    `);

        if (res.rows.length > 0) {
            console.log('FOUND: status column exists!');
        } else {
            console.log('NOT FOUND: status column does not exist.');

            // List all columns again to be sure
            const allCols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'voucher'
      `);
            console.log('All columns:', allCols.rows.map(c => c.column_name).join(', '));
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkStatusColumn();
