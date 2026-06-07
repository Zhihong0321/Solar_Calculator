const multer = require('multer');
const fs = require('fs');
const path = require('path');
const hostedHtmlService = require('./hostedHtmlService');
const pool = require('../../core/database/pool');
const {
    getRequestUserBubbleId,
    getRequestLegacyUserId
} = require('../../core/auth/userIdentity');

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB
const HOST_MY_APP_KEY = process.env.HOSTED_HTML_API_KEY || 'hostmyapp';

// Memory storage — we read the buffer then write to disk under our own slug.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_HTML_BYTES }
}).single('file');

async function getCurrentUser(req) {
    const bubbleId = getRequestUserBubbleId(req);
    const legacyId = getRequestLegacyUserId(req);
    if (!bubbleId && !legacyId) return null;

    const result = await pool.query(
        `SELECT id::text AS user_id,
                bubble_id,
                email,
                access_level
           FROM "user"
          WHERE bubble_id = $1 OR id::text = $2
          ORDER BY (bubble_id = $1) DESC
          LIMIT 1`,
        [bubbleId || '', String(legacyId || '')]
    );
    if (!result.rows[0]) return null;
    const u = result.rows[0];
    return {
        userId: u.user_id,
        bubbleId: u.bubble_id,
        email: u.email,
        name: u.email || (u.bubble_id ? `user_${u.bubble_id}` : 'User')
    };
}

function buildPublicUrl(req, slug) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
    const host = req.get('host');
    return `${proto}://${host}/h/${slug}`;
}

function buildFriendlyUrl(req, friendlySlug) {
    if (!friendlySlug) return null;
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
    const host = req.get('host');
    return `${proto}://${host}/app/${friendlySlug}`;
}

// Reserved friendly slugs — they would shadow existing top-level routes /
// assets / API prefixes in server.js. A user trying to claim one of these
// gets a 400 so the public URL never collides with internal infrastructure.
const RESERVED_FRIENDLY_SLUGS = new Set([
    'api', 'agent', 'h', 'app', 'uploads', 'seda-files', 'agent-docs',
    'company-logo', 't3_html_presentation', 'proposal', 'css', 'js',
    'public', 'assets', 'login', 'auth-login', 'auth', 'select-package',
    'chat-dashboard', 'chat-settings', 'domestic', 'domestic-mobile',
    'domestic-legacy', 'domestic-v3', 'domestic-v4', 'domestic-preview',
    'non-domestic', 'eei-optimizer', 'invoice-chat', 'bug-dashboard',
    'bug-chat', 'my-seda', 'my-referal', 'my-emails', 'shared-email-access',
    'voucher-management', 'help', 'company-cloud', 'hosted-html',
    'agent-registration', 'v2-part-1', 'battery_guide', 'health',
    'activity-report', 'activity-live-board', 'activity-review',
    'activity-report-v2', 'activity-v2-report', 'activity-v2-presets',
    'activity-v2-live-board', 'activity-v2-person-card'
]);

function validateFriendlySlugWithBlocklist(slug) {
    const err = hostedHtmlService.validateFriendlySlug(slug);
    if (err) return err;
    if (slug == null || slug === '') return null;
    const normalized = String(slug).trim().toLowerCase();
    if (RESERVED_FRIENDLY_SLUGS.has(normalized)) {
        return `friendlySlug "${normalized}" is reserved. Choose a different alias.`;
    }
    return null;
}

function writeHtmlToDisk(slug, htmlContent) {
    const storagePath = hostedHtmlService.buildStoragePath(slug);
    const dir = path.dirname(storagePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storagePath, htmlContent, 'utf8');
    return { storagePath, sizeBytes: Buffer.byteLength(htmlContent, 'utf8') };
}

function validateTitle(title) {
    if (typeof title !== 'string') return 'Title is required.';
    const trimmed = title.trim();
    if (trimmed.length === 0) return 'Title is required.';
    if (trimmed.length > hostedHtmlService.MAX_TITLE_LEN) {
        return `Title must be ≤${hostedHtmlService.MAX_TITLE_LEN} characters.`;
    }
    return null;
}

function validateHtml(html) {
    if (typeof html !== 'string') return 'HTML content is required.';
    const trimmed = html.trim();
    if (trimmed.length === 0) return 'HTML content is required.';
    if (Buffer.byteLength(trimmed, 'utf8') > MAX_HTML_BYTES) {
        return `HTML must be ≤${MAX_HTML_BYTES / 1024 / 1024} MB.`;
    }
    if (!/<\s*html|<\s*!doctype/i.test(trimmed)) {
        return 'Content does not look like HTML (no <html> or <!doctype> tag).';
    }
    return null;
}

function extractFromRequest(req) {
    // JSON body
    if (req.body && typeof req.body.html === 'string') {
        return {
            title: req.body.title,
            description: req.body.description,
            friendlySlug: req.body.friendlySlug ?? req.body.friendly_slug,
            html: req.body.html
        };
    }
    // Multipart body
    if (req.file && req.file.buffer) {
        return {
            title: req.body && req.body.title,
            description: req.body && req.body.description,
            friendlySlug: req.body && (req.body.friendlySlug ?? req.body.friendly_slug),
            html: req.file.buffer.toString('utf8')
        };
    }
    return null;
}

function runUpload(req, res, next) {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('multipart/form-data')) return next();
    upload(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                error: `HTML must be ≤${MAX_HTML_BYTES / 1024 / 1024} MB.`,
                code: 'PAYLOAD_TOO_LARGE'
            });
        }
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    });
}

function buildPlaceholderHtml({ title, creatorName }) {
    const safeTitle = String(title || 'Hosted App').replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const safeCreator = String(creatorName || 'AI').replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #f8fafc; color: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 480px; text-align: center; padding: 40px 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 12px rgba(15,23,42,0.05); }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    p { color: #64748b; margin: 4px 0; font-size: 0.95rem; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #f1f5f9; color: #475569; font-size: 0.75rem; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>Content is being prepared.</p>
    <p>Hosted by Eternalgy OS.</p>
    <div class="badge">by ${safeCreator}</div>
  </div>
</body>
</html>
`;
}

// ── API-key auth (for AI/automation) ──────────────────────────────────────
function getApiKeyFromRequest(req) {
    const headerKey = req.headers['x-api-key'] || req.headers['X-Api-Key'];
    if (headerKey) return String(headerKey).trim();
    if (req.body && typeof req.body.apikey === 'string') return req.body.apikey.trim();
    if (req.query && typeof req.query.apikey === 'string') return req.query.apikey.trim();
    return null;
}

function requireApiKey(req, res, next) {
    const provided = getApiKeyFromRequest(req);
    if (!provided) {
        return res.status(401).json({ success: false, error: 'Missing API key. Provide X-Api-Key header or apikey body field.' });
    }
    if (provided !== HOST_MY_APP_KEY) {
        return res.status(403).json({ success: false, error: 'Invalid API key.' });
    }
    return next();
}

function validateCreatorName(name) {
    if (typeof name !== 'string') return 'creatorName is required.';
    const trimmed = name.trim();
    if (trimmed.length === 0) return 'creatorName is required.';
    if (trimmed.length > 120) return 'creatorName must be ≤120 characters.';
    return null;
}

exports.createApp = [
    runUpload,
    async (req, res) => {
        try {
            const user = await getCurrentUser(req);
            if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

            const payload = extractFromRequest(req);
            if (!payload) {
                return res.status(400).json({
                    success: false,
                    error: 'Provide HTML either as JSON {title, html} or as a multipart file upload (field: file).'
                });
            }
            const titleError = validateTitle(payload.title);
            if (titleError) return res.status(400).json({ success: false, error: titleError });
            const htmlError = validateHtml(payload.html);
            if (htmlError) return res.status(400).json({ success: false, error: htmlError });

            const description = typeof payload.description === 'string'
                ? payload.description.trim().slice(0, hostedHtmlService.MAX_DESC_LEN) || null
                : null;

            const friendlyError = validateFriendlySlugWithBlocklist(req.body && req.body.friendlySlug);
            if (friendlyError) return res.status(400).json({ success: false, error: friendlyError });

            const slug = hostedHtmlService.generateSlug();
            const { storagePath, sizeBytes } = writeHtmlToDisk(slug, payload.html);

            const app = await hostedHtmlService.createHostedApp({
                ownerUserId: user.userId,
                ownerBubbleId: user.bubbleId,
                ownerName: user.name,
                ownerEmail: user.email,
                title: payload.title.trim(),
                description,
                friendlySlug: req.body && req.body.friendlySlug,
                htmlContent: payload.html,
                storagePath
            });

            return res.json({
                success: true,
                app,
                url: buildPublicUrl(req, slug),
                friendlyUrl: buildFriendlyUrl(req, app.friendlySlug),
                slug
            });
        } catch (err) {
            console.error('[HostedHtml] createApp error:', err);
            return res.status(500).json({ success: false, error: 'Failed to create hosted app.' });
        }
    }
];

exports.listMyApps = async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

        const apps = await hostedHtmlService.listMyApps({ ownerUserId: user.userId });
        return res.json({ success: true, apps });
    } catch (err) {
        console.error('[HostedHtml] listMyApps error:', err);
        return res.status(500).json({ success: false, error: 'Failed to list hosted apps.' });
    }
};

exports.getApp = async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const id = req.params.id;
        const app = await hostedHtmlService.getAppByIdForOwner({ id, ownerUserId: user.userId });
        if (!app) return res.status(404).json({ success: false, error: 'App not found.' });
        return res.json({ success: true, app, url: buildPublicUrl(req, app.slug), friendlyUrl: buildFriendlyUrl(req, app.friendlySlug) });
    } catch (err) {
        console.error('[HostedHtml] getApp error:', err);
        return res.status(500).json({ success: false, error: 'Failed to load hosted app.' });
    }
};

exports.updateApp = [
    runUpload,
    async (req, res) => {
        try {
            const user = await getCurrentUser(req);
            if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const id = req.params.id;

            const existing = await hostedHtmlService.getAppByIdForOwner({ id, ownerUserId: user.userId });
            if (!existing) return res.status(404).json({ success: false, error: 'App not found.' });

            const patch = {};
            if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'title')) {
                const titleError = validateTitle(req.body.title);
                if (titleError) return res.status(400).json({ success: false, error: titleError });
                patch.title = req.body.title.trim();
            }
            if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'description')) {
                const desc = typeof req.body.description === 'string' ? req.body.description.trim() : '';
                patch.description = desc.slice(0, hostedHtmlService.MAX_DESC_LEN) || null;
            }
            if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'friendlySlug')) {
                const friendlyError = validateFriendlySlugWithBlocklist(req.body.friendlySlug);
                if (friendlyError) return res.status(400).json({ success: false, error: friendlyError });
                patch.friendlySlug = req.body.friendlySlug;
            }

            let newStoragePath = null;
            let newSizeBytes = null;
            const incoming = extractFromRequest(req);
            if (incoming && typeof incoming.html === 'string' && incoming.html.trim().length > 0) {
                const htmlError = validateHtml(incoming.html);
                if (htmlError) return res.status(400).json({ success: false, error: htmlError });
                const written = writeHtmlToDisk(existing.slug, incoming.html);
                newStoragePath = written.storagePath;
                newSizeBytes = written.sizeBytes;
            }

            if (existing.status === 'disabled') {
                // Re-publish on edit so creators can recover from a disable without a separate call.
                await hostedHtmlService.setStatus({ id, ownerUserId: user.userId, status: 'published' });
            }

            const updated = await hostedHtmlService.updateApp({
                id,
                ownerUserId: user.userId,
                patch,
                newStoragePath,
                newSizeBytes
            });

            return res.json({
                success: true,
                app: updated,
                url: buildPublicUrl(req, existing.slug),
                friendlyUrl: buildFriendlyUrl(req, updated.friendlySlug)
            });
        } catch (err) {
            console.error('[HostedHtml] updateApp error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update hosted app.' });
        }
    }
];

exports.disableApp = async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const updated = await hostedHtmlService.setStatus({ id: req.params.id, ownerUserId: user.userId, status: 'disabled' });
        if (!updated) return res.status(404).json({ success: false, error: 'App not found.' });
        return res.json({ success: true, app: updated });
    } catch (err) {
        console.error('[HostedHtml] disableApp error:', err);
        return res.status(500).json({ success: false, error: 'Failed to disable hosted app.' });
    }
};

exports.enableApp = async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const updated = await hostedHtmlService.setStatus({ id: req.params.id, ownerUserId: user.userId, status: 'published' });
        if (!updated) return res.status(404).json({ success: false, error: 'App not found.' });
        return res.json({ success: true, app: updated });
    } catch (err) {
        console.error('[HostedHtml] enableApp error:', err);
        return res.status(500).json({ success: false, error: 'Failed to enable hosted app.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
//  API-key routes (for AI/automation). Owner is the synthetic 'ai:hostmyapp'.
//  No JWT required. Auth via X-Api-Key header (env: HOSTED_HTML_API_KEY).
// ────────────────────────────────────────────────────────────────────────────

function pickApiPayload(req) {
    if (req.body && typeof req.body.html === 'string') {
        return {
            title: req.body.title,
            description: req.body.description,
            friendlySlug: req.body.friendlySlug ?? req.body.friendly_slug,
            html: req.body.html
        };
    }
    if (req.file && req.file.buffer) {
        return {
            title: req.body && req.body.title,
            description: req.body && req.body.description,
            friendlySlug: req.body && (req.body.friendlySlug ?? req.body.friendly_slug),
            html: req.file.buffer.toString('utf8')
        };
    }
    return null;
}

// Single-shot push: creatorName + html → returns the URL.
exports.hostFromApi = [
    requireApiKey,
    runUpload,
    async (req, res) => {
        try {
            const nameError = validateCreatorName(req.body && req.body.creatorName);
            if (nameError) return res.status(400).json({ success: false, error: nameError });

            const payload = pickApiPayload(req);
            if (!payload) {
                return res.status(400).json({
                    success: false,
                    error: 'Provide HTML either as JSON {creatorName, title?, description?, html} or as multipart file upload (field: file).'
                });
            }
            const titleInput = typeof payload.title === 'string' ? payload.title.trim() : '';
            const title = titleInput || `Hosted app by ${req.body.creatorName.trim()}`;
            const titleError = validateTitle(title);
            if (titleError) return res.status(400).json({ success: false, error: titleError });
            const htmlError = validateHtml(payload.html);
            if (htmlError) return res.status(400).json({ success: false, error: htmlError });
            const description = typeof payload.description === 'string'
                ? payload.description.trim().slice(0, hostedHtmlService.MAX_DESC_LEN) || null
                : null;
            const friendlyError = validateFriendlySlugWithBlocklist(payload.friendlySlug);
            if (friendlyError) return res.status(400).json({ success: false, error: friendlyError });

            const slug = hostedHtmlService.generateSlug();
            const { storagePath, sizeBytes } = writeHtmlToDisk(slug, payload.html);
            const app = await hostedHtmlService.createHostedAppByAi({
                creatorName: req.body.creatorName.trim(),
                title,
                description,
                friendlySlug: payload.friendlySlug,
                htmlContent: payload.html,
                storagePath
            });
            if (!app) {
                return res.status(500).json({ success: false, error: 'Database insert returned no row.' });
            }

            return res.json({
                success: true,
                app,
                id: app.id,
                slug,
                url: buildPublicUrl(req, slug),
                friendlyUrl: buildFriendlyUrl(req, app.friendlySlug)
            });
        } catch (err) {
            console.error('[HostedHtml] hostFromApi error:', err);
            return res.status(500).json({ success: false, error: 'Failed to host app.' });
        }
    }
];

// Step 1 of two-step: issue a URL immediately, no HTML yet.
exports.hostIssueFromApi = [
    requireApiKey,
    async (req, res) => {
        try {
            const nameError = validateCreatorName(req.body && req.body.creatorName);
            if (nameError) return res.status(400).json({ success: false, error: nameError });

            const titleInput = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
            const title = titleInput || `Hosted app by ${req.body.creatorName.trim()}`;
            const titleError = validateTitle(title);
            if (titleError) return res.status(400).json({ success: false, error: titleError });

            const description = typeof req.body?.description === 'string'
                ? req.body.description.trim().slice(0, hostedHtmlService.MAX_DESC_LEN) || null
                : null;
            const friendlyInput = req.body?.friendlySlug ?? req.body?.friendly_slug;
            const friendlyError = validateFriendlySlugWithBlocklist(friendlyInput);
            if (friendlyError) return res.status(400).json({ success: false, error: friendlyError });

            // Generate slug locally so we can write the placeholder file before inserting the row.
            const slug = hostedHtmlService.generateSlug();
            const placeholderHtml = buildPlaceholderHtml({ title, creatorName: req.body.creatorName.trim() });
            const { storagePath, sizeBytes } = writeHtmlToDisk(slug, placeholderHtml);

            const app = await hostedHtmlService.issueHostedAppByAi({
                creatorName: req.body.creatorName.trim(),
                title,
                description,
                friendlySlug: friendlyInput,
                storagePath,
                placeholderSize: sizeBytes
            });
            if (!app) {
                return res.status(500).json({ success: false, error: 'Database insert returned no row.' });
            }

            const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
            const host = req.get('host');

            return res.json({
                success: true,
                app,
                id: app.id,
                slug,
                status: 'pending',
                url: `${proto}://${host}/h/${slug}`,
                friendlyUrl: buildFriendlyUrl(req, app.friendlySlug),
                upload_url: `${proto}://${host}/api/hosted-html/host/${app.id}/html`,
                upload_method: 'PUT',
                upload_body_format: 'JSON: {html: "<!doctype html>..."}'
            });
        } catch (err) {
            console.error('[HostedHtml] hostIssueFromApi error:', err);
            return res.status(500).json({ success: false, error: 'Failed to issue hosted app URL.' });
        }
    }
];

// Step 2 of two-step: upload HTML to a previously-issued app.
exports.hostUploadHtmlFromApi = [
    requireApiKey,
    runUpload,
    async (req, res) => {
        try {
            const existing = await hostedHtmlService.getAppByIdAndOwner({
                id: req.params.id,
                ownerUserId: hostedHtmlService.AI_OWNER_USER_ID
            });
            if (!existing) return res.status(404).json({ success: false, error: 'Issued app not found.' });

            const payload = pickApiPayload(req);
            if (!payload) {
                return res.status(400).json({
                    success: false,
                    error: 'Provide HTML either as JSON {html} or as multipart file upload (field: file).'
                });
            }
            const htmlError = validateHtml(payload.html);
            if (htmlError) return res.status(400).json({ success: false, error: htmlError });

            const { storagePath, sizeBytes } = writeHtmlToDisk(existing.slug, payload.html);
            const updated = await hostedHtmlService.publishIssuedAppByAi({
                id: existing.id,
                storagePath,
                sizeBytes,
                htmlContent: payload.html
            });

            return res.json({
                success: true,
                app: updated,
                slug: existing.slug,
                status: 'published',
                url: buildPublicUrl(req, existing.slug),
                friendlyUrl: buildFriendlyUrl(req, updated.friendlySlug)
            });
        } catch (err) {
            console.error('[HostedHtml] hostUploadHtmlFromApi error:', err);
            return res.status(500).json({ success: false, error: 'Failed to upload HTML.' });
        }
    }
];

// List AI-owned apps (both pending and published).
exports.listHostedByApi = [
    requireApiKey,
    async (req, res) => {
        try {
            const apps = await hostedHtmlService.listAppsByOwnerUserId(
                hostedHtmlService.AI_OWNER_USER_ID,
                { includeDisabled: true }
            );
            const enriched = apps.map((a) => ({
                ...a,
                url: buildPublicUrl(req, a.slug),
                friendlyUrl: buildFriendlyUrl(req, a.friendlySlug)
            }));
            return res.json({ success: true, apps: enriched });
        } catch (err) {
            console.error('[HostedHtml] listHostedByApi error:', err);
            return res.status(500).json({ success: false, error: 'Failed to list hosted apps.' });
        }
    }
];

// Disable an AI-owned app.
exports.disableHostedByApi = [
    requireApiKey,
    async (req, res) => {
        try {
            const updated = await hostedHtmlService.setStatusForOwner({
                id: req.params.id,
                ownerUserId: hostedHtmlService.AI_OWNER_USER_ID,
                status: 'disabled'
            });
            if (!updated) return res.status(404).json({ success: false, error: 'App not found.' });
            return res.json({ success: true, app: updated });
        } catch (err) {
            console.error('[HostedHtml] disableHostedByApi error:', err);
            return res.status(500).json({ success: false, error: 'Failed to disable hosted app.' });
        }
    }
];

// ── Public docs (for AI Coders and humans) ──────────────────────────────────
// GET /api/hosted-html/docs
// Returns a self-describing JSON manifest of every API endpoint, the API key
// name, request/response shapes, and copy-pasteable curl examples. Intended
// to be passed verbatim to an AI coding agent that needs to integrate with
// the HTML Hosting Engine.
//
// Supports `Accept: text/plain` for a quick-read text summary.
exports.getDocs = (req, res) => {
    const host = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
    const base = `${host}://${req.get('host')}`;

    const manifest = {
        name: 'Eternalgy OS — HTML Hosting Engine',
        version: '1.0',
        base_url: base,
        api_key: {
            name: 'hostmyapp',
            header: 'X-Api-Key',
            env_override: 'HOSTED_HTML_API_KEY',
            note: 'Send in `X-Api-Key` header, or `apikey` body field, or `?apikey=...` query string.'
        },
        public_routes: [
            {
                method: 'GET',
                path: '/api/hosted-html/docs',
                auth: 'none',
                purpose: 'THIS endpoint. Self-describing API manifest. Show this to your AI agent.'
            },
            {
                method: 'GET',
                path: '/h/:slug',
                auth: 'none',
                purpose: 'Public HTML serve by random 16-hex slug.'
            },
            {
                method: 'GET',
                path: '/app/:friendlySlug',
                auth: 'none',
                purpose: 'Public HTML serve by human-friendly alias (e.g. /app/scoreboard).'
            }
        ],
        api_key_endpoints: [
            {
                method: 'POST',
                path: '/api/hosted-html/host',
                auth: 'api_key',
                body: {
                    creatorName: 'string (required, ≤120 chars)',
                    title: 'string (optional, ≤200 chars; defaults to "Hosted app by <creatorName>")',
                    description: 'string (optional, ≤1000 chars)',
                    friendlySlug: 'string (optional, 2-64 chars, lowercase a-z0-9_-, not reserved)',
                    html: 'string (required, ≤5 MB, must contain <html or <!doctype)'
                },
                returns: '{ success, app, id, slug, url, friendlyUrl }',
                curl: `curl -X POST ${base}/api/hosted-html/host \\
  -H "X-Api-Key: hostmyapp" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creatorName": "AI Assistant",
    "title": "My Page",
    "friendlySlug": "my-page",
    "html": "<!doctype html><html><body><h1>Hello</h1></body></html>"
  }'`
            },
            {
                method: 'POST',
                path: '/api/hosted-html/host/issue',
                auth: 'api_key',
                purpose: 'Step 1 of two-step. Issue URL immediately with a "coming soon" placeholder; no HTML needed yet.',
                body: {
                    creatorName: 'string (required)',
                    title: 'string (optional)',
                    description: 'string (optional)',
                    friendlySlug: 'string (optional)'
                },
                returns: '{ success, app, id, slug, status:"pending", url, friendlyUrl, upload_url, upload_method:"PUT", upload_body_format }',
                curl: `curl -X POST ${base}/api/hosted-html/host/issue \\
  -H "X-Api-Key: hostmyapp" \\
  -H "Content-Type: application/json" \\
  -d '{"creatorName":"AI","title":"My Page"}'`
            },
            {
                method: 'PUT',
                path: '/api/hosted-html/host/:id/html',
                auth: 'api_key',
                purpose: 'Step 2 of two-step. Upload HTML to a previously-issued app.',
                body: { html: 'string (required, ≤5 MB)' },
                returns: '{ success, app, slug, status:"published", url, friendlyUrl }',
                curl: `curl -X PUT ${base}/api/hosted-html/host/42/html \\
  -H "X-Api-Key: hostmyapp" \\
  -H "Content-Type: application/json" \\
  -d '{"html":"<!doctype html><html><body><h1>Hello</h1></body></html>"}'`
            },
            {
                method: 'GET',
                path: '/api/hosted-html/host/list',
                auth: 'api_key',
                purpose: 'List all apps pushed by this API key. Returns friendlyUrl on every row.',
                returns: '{ success, apps: [{ id, slug, friendlySlug, title, status, viewCount, url, friendlyUrl, ... }] }',
                curl: `curl ${base}/api/hosted-html/host/list -H "X-Api-Key: hostmyapp"`
            },
            {
                method: 'POST',
                path: '/api/hosted-html/host/:id/disable',
                auth: 'api_key',
                purpose: 'Disable a previously-published app. Disabled apps return 404 publicly.',
                curl: `curl -X POST ${base}/api/hosted-html/host/42/disable -H "X-Api-Key: hostmyapp"`
            }
        ],
        user_endpoints_jwt: [
            'GET    /api/v1/hosted-html              (list mine)',
            'POST   /api/v1/hosted-html              (create, JSON or multipart file upload)',
            'GET    /api/v1/hosted-html/:id          (get one)',
            'PUT    /api/v1/hosted-html/:id          (update title/description/friendlySlug/HTML)',
            'POST   /api/v1/hosted-html/:id/disable',
            'POST   /api/v1/hosted-html/:id/enable',
            'GET    /hosted-html                     (mobile-first manager UI, requires agent login)'
        ],
        quickstart_for_ai: [
            '1. curl ' + base + '/api/hosted-html/docs  ← (this endpoint)',
            '2. Pick a flow: single-shot or two-step issue+upload.',
            '3. Authenticate every request with header: X-Api-Key: hostmyapp',
            '4. Use POST /api/hosted-html/host to publish in one call — it returns the public url.',
            '5. To claim a stable alias (e.g. /app/scoreboard), pass friendlySlug in the body.',
            '6. After publishing, GET /h/<slug> or /app/<friendlySlug> renders the HTML publicly.'
        ],
        limits: {
            max_html_size_bytes: 5 * 1024 * 1024,
            max_title_length: 200,
            max_description_length: 1000,
            max_creator_name_length: 120,
            friendly_slug_pattern: '^[a-z0-9][a-z0-9_-]{1,63}$',
            friendly_slug_reserved_examples: ['api', 'agent', 'h', 'app', 'uploads', 'login', 'hosted-html']
        }
    };

    // Plain-text summary for human / log-friendly reads
    if ((req.headers.accept || '').includes('text/plain')) {
        const lines = [
            manifest.name,
            '='.repeat(manifest.name.length),
            '',
            `Base URL:  ${manifest.base_url}`,
            `API key:   ${manifest.api_key.name}  (header: ${manifest.api_key.header})`,
            '',
            'Quickstart:',
            ...manifest.quickstart_for_ai.map((l) => '  ' + l),
            '',
            'API-key endpoints:',
            ...manifest.api_key_endpoints.map((e) => `  ${e.method.padEnd(6)} ${e.path}\n    ${e.purpose || ''}\n    curl: ${(e.curl || '').replace(/\n/g, '\n    ')}`),
            '',
            'Public routes:',
            ...manifest.public_routes.map((r) => `  ${r.method.padEnd(6)} ${r.path}  — ${r.purpose}`),
            '',
            'User (JWT) endpoints:',
            ...manifest.user_endpoints_jwt.map((l) => '  ' + l),
            '',
            'Limits:',
            `  max html size: ${manifest.limits.max_html_size_bytes} bytes`,
            `  friendly slug: ${manifest.limits.friendly_slug_pattern}`,
            `  reserved (subset): ${manifest.limits.friendly_slug_reserved_examples.join(', ')}`
        ];
        return res.type('text/plain').send(lines.join('\n'));
    }

    return res.json(manifest);
};
