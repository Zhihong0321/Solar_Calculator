/**
 * tariffProxyClient.js
 *
 * A drop-in pg-client adapter that routes tariff queries
 * through the Postgres Proxy REST API instead of a direct connection.
 *
 * Compatible with the query interface used by solarCalculatorService.js:
 *   client.query(sqlString, [param1, param2, ...])
 *   → returns { rows: [...] }
 */

const https = require('https');

const PROXY_BASE = 'pg-proxy-production.up.railway.app';
const PROXY_DB_NAME = 'tnb-tariff';

// ── Token Management ──────────────────────────────────────────────────────────
// Token is injected at runtime (from .env or from the token endpoint).
// We store it here so it can be refreshed without restarting the server.
let _token = process.env.TARIFF_PROXY_TOKEN || null;
let _tokenSetAt = _token ? Date.now() : null;

function setToken(token) {
    _token = token;
    _tokenSetAt = Date.now();
    console.log('[TariffProxy] Token updated, valid ~1h from now');
}

function getToken() {
    return _token;
}

// ── Raw HTTP helper ───────────────────────────────────────────────────────────
function postJson(path, body, token) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request({
            hostname: PROXY_BASE,
            path,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    // Proxy returns { error: '...' } on failure
                    if (parsed.error) return reject(new Error('[TariffProxy] ' + parsed.error));
                    resolve(parsed);
                } catch (e) {
                    reject(new Error('[TariffProxy] Bad JSON: ' + data.slice(0, 200)));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── Param substitution ────────────────────────────────────────────────────────
// The proxy /api/sql endpoint accepts SQL + params array.
// We pass them through as-is — the proxy handles $1/$2 substitution.
async function runQuery(sql, params = []) {
    const token = getToken();
    if (!token) {
        throw new Error('[TariffProxy] No token set. Call setToken() or set TARIFF_PROXY_TOKEN env var.');
    }
    const result = await postJson('/api/sql', {
        db_name: PROXY_DB_NAME,
        sql,
        params
    }, token);

    // Proxy returns { rows: [...], rowCount: N, command: 'SELECT' }
    return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        command: result.command || 'SELECT'
    };
}

// ── pg-compatible client interface ────────────────────────────────────────────
// solarCalculatorService calls: const tariffClient = await tariffPool.connect()
// then: tariffClient.query(sql, params) and tariffClient.release()
// We mimic that exact interface.

const proxyClient = {
    query: (sql, params) => runQuery(sql, params),
    release: () => { }   // no-op; proxy is stateless
};

const proxyPool = {
    connect: () => Promise.resolve(proxyClient),
    query: (sql, params) => runQuery(sql, params),
    end: () => Promise.resolve()
};

module.exports = { proxyPool, proxyClient, setToken, getToken };
