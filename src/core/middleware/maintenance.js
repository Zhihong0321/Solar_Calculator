/**
 * src/core/middleware/maintenance.js
 *
 * Takes the app offline to visitors during a planned migration window.
 *
 * Mounted before body parsing and before every route, so a request during the
 * window is rejected before it can read a 50 MB upload into memory or touch the
 * database — the point of the window is that nothing writes while we work.
 *
 * The page is inlined rather than served from /public. Static mounting happens
 * after this middleware, and a maintenance page that depends on the very stack
 * you are taking down is a maintenance page that shows a blank screen.
 *
 * Toggle:
 *   MAINTENANCE_MODE=1                  turn it on (restart required on Railway)
 *   MAINTENANCE_BYPASS_KEY=<secret>     lets the team through — required
 *   MAINTENANCE_MESSAGE=<text>          optional, shown to visitors
 *   MAINTENANCE_ETA=<text>              optional, e.g. "back by 1:00 AM"
 *   MAINTENANCE_ALLOW_PATHS=/a,/b       optional extra exempt path prefixes
 *
 * Team access:
 *   https://app.example.com/?maintenance_key=<secret>
 * sets a cookie, so every later request in that browser passes through. For
 * curl or a script, send the same value as an X-Maintenance-Key header.
 */

'use strict';

const BYPASS_COOKIE = 'maintenance_bypass';
const BYPASS_QUERY = 'maintenance_key';
const BYPASS_HEADER = 'x-maintenance-key';

// Always answerable, even mid-window: a platform health check that fails during
// a planned window can make the host kill or refuse to route to the container.
const ALWAYS_ALLOWED = ['/__maintenance-health'];

function isEnabled() {
    const flag = String(process.env.MAINTENANCE_MODE || '').trim().toLowerCase();
    return flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes';
}

function bypassKey() {
    return String(process.env.MAINTENANCE_BYPASS_KEY || '').trim();
}

function allowedPaths() {
    const extra = String(process.env.MAINTENANCE_ALLOW_PATHS || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    return [...ALWAYS_ALLOWED, ...extra];
}

/**
 * Constant-time-ish comparison. The key is a shared secret in an env var, not a
 * password hash, but there is no reason to leak its length via early return.
 */
function keyMatches(candidate) {
    const expected = bypassKey();
    if (!expected || !candidate) return false;
    if (candidate.length !== expected.length) return false;

    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
    }
    return diff === 0;
}

function wantsJson(req) {
    if (req.path.startsWith('/api/')) return true;
    if (String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest') return true;
    const accept = String(req.headers.accept || '');
    return accept.includes('application/json') && !accept.includes('text/html');
}

function renderPage({ message, eta }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Under Maintenance</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    min-height:100svh;display:flex;align-items:center;justify-content:center;
    padding:24px calc(24px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));
    background:#0f172a;color:#e2e8f0;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .card{width:100%;max-width:380px;text-align:center}
  .icon{
    width:56px;height:56px;margin:0 auto 24px;border-radius:16px;
    background:#1e293b;display:flex;align-items:center;justify-content:center;
  }
  .icon svg{width:26px;height:26px;stroke:#facc15}
  h1{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:10px;color:#f8fafc}
  p{font-size:14px;line-height:1.6;color:#94a3b8}
  .eta{
    margin-top:20px;display:inline-block;padding:7px 14px;border-radius:999px;
    background:#1e293b;color:#facc15;
    font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;
  }
  .foot{margin-top:32px;font-size:11px;color:#475569}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
    </div>
    <h1>We&rsquo;ll be right back</h1>
    <p>${message}</p>
    ${eta ? `<div class="eta">${eta}</div>` : ''}
    <p class="foot">Nothing you saved has been lost.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function maintenanceMiddleware(req, res, next) {
    if (!isEnabled()) return next();

    if (req.path === '/__maintenance-health') {
        return res.status(200).json({ status: 'ok', maintenance: true });
    }

    if (allowedPaths().some((prefix) => req.path.startsWith(prefix))) {
        return next();
    }

    // Query key first: it is how someone gets the cookie in the first place.
    const queryKey = req.query?.[BYPASS_QUERY];
    if (queryKey && keyMatches(String(queryKey))) {
        res.cookie(BYPASS_COOKIE, String(queryKey), {
            httpOnly: true,
            sameSite: 'lax',
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
            maxAge: 12 * 60 * 60 * 1000,
        });
        return next();
    }

    if (keyMatches(String(req.cookies?.[BYPASS_COOKIE] || ''))) return next();
    if (keyMatches(String(req.headers[BYPASS_HEADER] || ''))) return next();

    const message = process.env.MAINTENANCE_MESSAGE
        || 'We are upgrading how site photos are stored. The app is unavailable for a short while.';
    const eta = process.env.MAINTENANCE_ETA || '';

    // 503 + Retry-After is the honest status: this is temporary and clients
    // (and crawlers) should come back rather than treat it as gone.
    res.status(503);
    res.set('Retry-After', '1800');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (wantsJson(req)) {
        return res.json({
            success: false,
            error: message,
            code: 'MAINTENANCE_MODE',
            maintenance: true,
            retryAfterSeconds: 1800,
        });
    }

    return res.type('html').send(renderPage({
        message: escapeHtml(message),
        eta: eta ? escapeHtml(eta) : '',
    }));
}

module.exports = {
    maintenanceMiddleware,
    isEnabled,
    BYPASS_COOKIE,
    BYPASS_QUERY,
    BYPASS_HEADER,
};
