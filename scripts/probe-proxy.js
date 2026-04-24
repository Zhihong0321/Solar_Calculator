const https = require('https');

const TOKEN = process.env.PG_PROXY_TOKEN;
const DB = process.env.PG_PROXY_DB_NAME || 'tnb-tariff';

if (!TOKEN) {
    throw new Error('PG_PROXY_TOKEN must be provided by the runtime environment.');
}

function query(sql) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ db_name: DB, sql, params: [] });
        const req = https.request({
            hostname: 'pg-proxy-production.up.railway.app',
            path: '/api/sql',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + TOKEN,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('\n=== domestic_am_tariff COLUMNS ===');
    const cols = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='domestic_am_tariff' ORDER BY ordinal_position");
    cols.rows.forEach(r => console.log(' ', r.column_name, ':', r.data_type));

    console.log('\n=== domestic_am_tariff SAMPLE (3 rows) ===');
    const s = await query('SELECT * FROM domestic_am_tariff LIMIT 3');
    console.log(JSON.stringify(s.rows, null, 2));

    const cnt = await query('SELECT COUNT(*) as total FROM domestic_am_tariff');
    console.log('\nTotal rows:', cnt.rows[0].total);

    console.log('\n=== bill_simulation_lookup: distinct tariff_group values ===');
    const grps = await query("SELECT DISTINCT tariff_group, COUNT(*) as rows FROM bill_simulation_lookup GROUP BY tariff_group ORDER BY tariff_group");
    grps.rows.forEach(r => console.log(' ', r.tariff_group, '-', r.rows, 'rows'));
}

main().catch(console.error);
