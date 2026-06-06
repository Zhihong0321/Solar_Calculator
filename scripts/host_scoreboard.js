/**
 * Pushes scoreboard.html to the hosted-HTML service with friendlySlug="scoreboard"
 * so it's served at {BASE_URL}/app/scoreboard.
 *
 * Idempotent: if a published app already owns that friendly slug, we PUT to update it
 * instead of creating a second row (which would hit the unique partial index).
 *
 * Usage:
 *   HOSTED_HTML_API_KEY=hostmyapp BASE_URL=https://atap.solar node scripts/host_scoreboard.js
 *   npm run host:scoreboard -- --base=https://atap.solar --key=hostmyapp
 *
 * Env / args:
 *   BASE_URL (default: http://localhost:3000)
 *   HOSTED_HTML_API_KEY (default: hostmyapp — same as server default)
 *   CREATOR_NAME (default: scoreboard-bot)
 *   TITLE (default: WC2026 实时积分榜 (DEMO))
 *   HTML_PATH (default: ./scoreboard.html)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const [k, ...rest] = a.slice(2).split('=');
            out[k] = rest.length ? rest.join('=') : true;
        }
    }
    return out;
}

function requestJson(method, urlString, body, apiKey) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const lib = url.protocol === 'https:' ? https : http;
        const data = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');

        const req = lib.request(
            {
                method,
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + (url.search || ''),
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data ? data.length : 0,
                    'X-Api-Key': apiKey
                }
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    let parsed = null;
                    try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* leave as text */ }
                    resolve({ status: res.statusCode || 0, body: parsed, text });
                });
            }
        );
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    const args = parseArgs(process.argv);

    const baseUrl = (args.base || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const apiKey = args.key || process.env.HOSTED_HTML_API_KEY || 'hostmyapp';
    const creatorName = args.creator || process.env.CREATOR_NAME || 'scoreboard-bot';
    const title = process.env.TITLE || 'WC2026 实时积分榜 (DEMO)';
    const htmlPath = path.resolve(args.html || process.env.HTML_PATH || path.join(__dirname, '..', 'scoreboard.html'));
    const friendlySlug = args.slug || process.env.FRIENDLY_SLUG || 'scoreboard';

    if (!fs.existsSync(htmlPath)) {
        console.error(`[host-scoreboard] HTML file not found at ${htmlPath}`);
        process.exit(2);
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    console.log(`[host-scoreboard] Read ${html.length} bytes from ${htmlPath}`);
    console.log(`[host-scoreboard] Target: ${baseUrl}/app/${friendlySlug}`);

    // 1) List existing AI-owned apps and find any with the same friendlySlug.
    const listResp = await requestJson('GET', `${baseUrl}/api/hosted-html/host/list`, null, apiKey);
    if (listResp.status !== 200) {
        console.error(`[host-scoreboard] List failed: HTTP ${listResp.status}`);
        console.error(listResp.text);
        process.exit(1);
    }
    const existing = (listResp.body && listResp.body.apps || []).find(
        (a) => a.friendlySlug === friendlySlug
    );

    if (existing) {
        console.log(`[host-scoreboard] Found existing app id=${existing.id} status=${existing.status} — updating HTML.`);
        const put = await requestJson(
            'PUT',
            `${baseUrl}/api/hosted-html/host/${existing.id}/html`,
            { html },
            apiKey
        );
        if (put.status !== 200) {
            console.error(`[host-scoreboard] Update failed: HTTP ${put.status}`);
            console.error(put.text);
            process.exit(1);
        }
        const app = put.body.app || {};
        const url = put.body.url || `${baseUrl}/h/${app.slug}`;
        const friendlyUrl = put.body.friendlyUrl || (app.friendlySlug ? `${baseUrl}/app/${app.friendlySlug}` : null);
        console.log(`[host-scoreboard] ✓ Updated id=${app.id} slug=${app.slug} status=${app.status}`);
        console.log(`[host-scoreboard]   canonical: ${url}`);
        if (friendlyUrl) console.log(`[host-scoreboard]   friendly : ${friendlyUrl}`);
        return;
    }

    // 2) No existing app with that friendly slug — create one.
    console.log(`[host-scoreboard] No existing app with friendlySlug="${friendlySlug}" — creating.`);
    const create = await requestJson(
        'POST',
        `${baseUrl}/api/hosted-html/host`,
        { creatorName, title, friendlySlug, html },
        apiKey
    );
    if (create.status !== 200) {
        console.error(`[host-scoreboard] Create failed: HTTP ${create.status}`);
        console.error(create.text);
        process.exit(1);
    }
    const app = create.body.app || {};
    const url = create.body.url || `${baseUrl}/h/${app.slug}`;
    const friendlyUrl = create.body.friendlyUrl || (app.friendlySlug ? `${baseUrl}/app/${app.friendlySlug}` : null);
    console.log(`[host-scoreboard] ✓ Created id=${app.id} slug=${app.slug}`);
    console.log(`[host-scoreboard]   canonical: ${url}`);
    if (friendlyUrl) console.log(`[host-scoreboard]   friendly : ${friendlyUrl}`);
}

main().catch((err) => {
    console.error('[host-scoreboard] Unexpected error:', err && err.stack || err);
    process.exit(1);
});
