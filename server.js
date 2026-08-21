const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- Core Resources ---
const pool = require('./src/core/database/pool');
const { requireAuth } = require('./src/core/middleware/auth');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('./src/core/auth/userIdentity');
const { storageDriver } = require('./src/core/upload');

// --- Feature Modules ---
const Invoicing = require('./src/modules/Invoicing');
const SolarCalculator = require('./src/modules/SolarCalculator');
const Customer = require('./src/modules/Customer');
const Chat = require('./src/modules/Chat');
const Referral = require('./src/modules/Referral');
const Email = require('./src/modules/Email');
const Voucher = require('./src/modules/Voucher');
const SalesTeam = require('./src/modules/SalesTeam');
const sedaRoutes = require('./routes/sedaRoutes');
const ActivityReport = require('./src/modules/ActivityReport');
const ActivityReportV2 = require('./src/modules/ActivityReportV2');
const Health = require('./src/modules/Health');
const BugReport = require('./src/modules/BugReport');
const HostedHtml = require('./src/modules/HostedHtml');
const SupportTicket = require('./src/modules/SupportTicket');
const ClaimReceipt = require('./src/modules/ClaimReceipt');
const Attachments = require('./src/modules/Attachments');
const uploadBackfillRoutes = require('./src/modules/UploadBackfill/backfillRoutes');
const { maintenanceMiddleware } = require('./src/core/middleware/maintenance');
const demoRoutes = require('./routes/demoRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_URL = process.env.AUTH_URL || 'https://auth.atap.solar';

// Trust Proxy for Railway/Load Balancers
app.set('trust proxy', 1);

// --- Global Middleware ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true
}));

app.use((req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.use(cookieParser());

// Maintenance window — must sit before body parsing and before every route, so
// a request during the window never reaches a parser, a route, or the database.
// Off unless MAINTENANCE_MODE is set; see src/core/middleware/maintenance.js.
app.use(maintenanceMiddleware);

// Skip JSON body parsing for multipart/form-data requests (file uploads).
// express.json() reads and exhausts the raw request stream. If it runs before
// multer on a multipart upload, multer receives an empty body and req.file is
// undefined — causing every SEDA TNB bill upload to silently fail with
// "No file uploaded." This one-liner is the root fix for 90+ days of failures.
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.startsWith('multipart/form-data')) return next();
  return express.json({ limit: '50mb' })(req, res, next);
});
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large. Reduce file size or upload fewer files in one save.',
      code: 'PAYLOAD_TOO_LARGE',
      details: [{ limit: '50mb' }]
    });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON request body.',
      code: 'INVALID_JSON'
    });
  }
  return next(err);
});

// --- Module Mounting ---
app.use(Invoicing.router);
app.use(SolarCalculator.router);
app.use(Customer.router);
app.use(Chat.router);
app.use(Referral.router);
app.use(Email.router);
app.use(Voucher.router);
app.use(SalesTeam.router);
app.use(sedaRoutes);
app.use(ActivityReport.router);
app.use(ActivityReportV2.router);
app.use(Health.router);
app.use(HostedHtml.router);
app.use('/api/v1/bug', BugReport.bugRoutes);
app.use(SupportTicket.router);
app.use(ClaimReceipt.router);
app.use(Attachments.router);
app.use(uploadBackfillRoutes);
app.use(demoRoutes);

// --- Prototype: conversational quotation (/lab/chat) ---
// Opt-in and isolated. Not registered in the navigation shell, reachable only
// by URL. Remove this block and src/modules/ChatQuote to drop it entirely.
if (process.env.CHAT_LAB_ENABLED === 'true') {
  app.use(require('./src/modules/ChatQuote').router);
  console.log('[ChatQuote] /lab/chat enabled');
}

// --- Global Routes & Static Files ---
app.use(express.static('public'));
app.get('/v2-part-1.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'slide-001.webp'));
});
app.get('/battery_guide', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'battery-explanation-opus.html'));
});
app.use('/proposal', express.static('portable-proposal'));
app.use('/t3_html_presentation', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return express.static('mobile_html_output')(req, res, next);
});
app.use('/company-logo', express.static(path.join(__dirname, 'v3-quotation-view', 'company-logo')));

const storagePath = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'storage');
app.use('/uploads', express.static(storagePath));
app.use('/seda-files', express.static(path.join(storagePath, 'seda_registration')));
app.use('/agent-docs', express.static(path.join(storagePath, 'agent_documents')));

const columnPresenceCache = new Map();

function clearAuthCookies(res) {
  res.clearCookie('auth_token', { path: '/' });
  res.clearCookie('auth_token', { path: '/', domain: '.atap.solar' });
}

function buildAbsoluteReturnTo(req, fallbackPath = '/agent/home') {
  const requested = typeof req.query.return_to === 'string' ? req.query.return_to.trim() : '';
  if (requested.startsWith('http://') || requested.startsWith('https://')) {
    return requested;
  }

  const relativePath = requested.startsWith('/') ? requested : fallbackPath;
  return `${req.protocol}://${req.get('host')}${relativePath}`;
}

async function hasTableColumn(client, tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (columnPresenceCache.has(cacheKey)) {
    return columnPresenceCache.get(cacheKey);
  }

  const result = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableName, columnName]
  );

  const exists = result.rows.length > 0;
  columnPresenceCache.set(cacheKey, exists);
  return exists;
}

app.get('/', (req, res) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.redirect('/login');
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return res.redirect('/agent/home');
  } catch (err) {
    clearAuthCookies(res);
    return res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/auth-login', (req, res) => {
  const returnTo = encodeURIComponent(buildAbsoluteReturnTo(req));
  res.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
});

// Agent Registration Route
app.get(['/agent-registration', '/agent/registration'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'agent_registration.html'));
});

/**
 * API: Agent Registration
 */
app.post('/api/agent/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, contact, email, address, introducer, agent_code, agent_type, ic_front, ic_back, profile_picture } = req.body;
    const normalizedName = name?.trim();
    const normalizedContact = contact?.trim();
    const normalizedEmail = email?.trim();
    const normalizedAddress = address?.trim();
    const normalizedIntroducer = introducer?.trim();
    const normalizedAgentCode = agent_code?.trim() || null;
    const normalizedAgentType = agent_type?.trim() || null;

    // Basic Validation
    if (!normalizedName || !normalizedContact || !normalizedEmail || !normalizedIntroducer || !profile_picture) {
      return res.status(400).json({ error: 'Name, Mobile, Email, Introducer, and Profile Picture are required.' });
    }

    // Check if email already exists in user table
    const checkUser = await client.query('SELECT id FROM "user" WHERE email = $1', [normalizedEmail]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: 'This email is already registered.' });
    }

    const agent_bubble_id = `agent_${crypto.randomBytes(8).toString('hex')}`;
    const user_bubble_id = `user_${crypto.randomBytes(8).toString('hex')}`;

    // Helper to save base64 image via storageDriver (R2 or disk)
    const saveImage = async (base64Data, prefix, bubble_id) => {
      if (!base64Data) return null;
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const ext = mimeType.split('/')[1] || 'jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${prefix}_${bubble_id}_${Date.now()}.${ext}`;

        const stored = await storageDriver.put(buffer, {
          subdir: 'agent_documents',
          filename,
          mimeType,
          req,
        });
        return stored.url;
      }
      return null;
    };

    const [icFrontUrl, icBackUrl, profilePicUrl] = await Promise.all([
      saveImage(ic_front, 'ic_front', agent_bubble_id),
      saveImage(ic_back, 'ic_back', agent_bubble_id),
      saveImage(profile_picture, 'profile', user_bubble_id),
    ]);

    await client.query('BEGIN');

    // 1. Create User first. The "user" row is the record of truth for agent
    //    identity — name, contact, MyKad, address all belong here. The agent
    //    row below is kept only so existing linked_agent_profile joins resolve.
    const userColumns = [
      'bubble_id',
      'email',
      'access_level',
      'linked_agent_profile',
      'user_signed_up',
      'profile_picture',
      'introducer',
      'agent_code'
    ];
    const userValues = [
      user_bubble_id,
      normalizedEmail,
      ['pending'],
      agent_bubble_id,
      false,
      profilePicUrl,
      normalizedIntroducer,
      normalizedAgentCode
    ];

    // Guarded the same way as agent.agent_code below: not every environment has
    // received the identity columns on "user" yet.
    for (const [column, value] of [
      ['name', normalizedName],
      ['contact', normalizedContact],
      ['address', normalizedAddress],
      ['agent_type', normalizedAgentType],
      ['ic_front', icFrontUrl],
      ['ic_back', icBackUrl]
    ]) {
      if (await hasTableColumn(client, 'user', column)) {
        userColumns.push(column);
        userValues.push(value);
      }
    }

    const userPlaceholders = userValues.map((_, index) => `$${index + 1}`);
    const userQuery = `
      INSERT INTO "user" (
        ${userColumns.join(', ')}, created_at, updated_at
      ) VALUES (${userPlaceholders.join(', ')}, NOW(), NOW())
      RETURNING *
    `;
    await client.query(userQuery, userValues);

    // 2. Create Agent linked back to user
    const agentColumns = [
      'bubble_id',
      'name',
      'contact',
      'email',
      'address',
      'introducer',
      'agent_type',
      'ic_front',
      'ic_back',
      'linked_user_login'
    ];
    const agentValues = [
      agent_bubble_id,
      normalizedName,
      normalizedContact,
      normalizedEmail,
      normalizedAddress,
      normalizedIntroducer,
      normalizedAgentType,
      icFrontUrl,
      icBackUrl,
      user_bubble_id
    ];

    // Some live databases have not received migration 021 yet, so we only write
    // agent_code when the column is actually present.
    if (await hasTableColumn(client, 'agent', 'agent_code')) {
      agentColumns.splice(6, 0, 'agent_code');
      agentValues.splice(6, 0, normalizedAgentCode);
    }

    const agentPlaceholders = agentValues.map((_, index) => `$${index + 1}`);
    const agentQuery = `
      INSERT INTO agent (
        ${agentColumns.join(', ')}, created_at, updated_at
      ) VALUES (${agentPlaceholders.join(', ')}, NOW(), NOW())
      RETURNING *
    `;
    const agentResult = await client.query(agentQuery, agentValues);

    await client.query('COMMIT');
    res.json({ success: true, agent: agentResult.rows[0] });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Agent Registration Error:', err);
    res.status(500).json({ error: 'Failed to complete registration.' });
  } finally {
    client.release();
  }
});

app.get('/domestic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'domestic-v4.html'));
});

app.get('/domestic-v4', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'domestic-v4.html'));
});

app.get('/eei-optimizer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'eei-optimizer.html'));
});

app.get('/non-domestic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'non-domestic.html'));
});

// Chat Page Routes
app.get('/invoice-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'invoice_chat.html'));
});

// Agent Launcher Route
app.get('/agent/home', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'agent_dashboard.html'));
});

// Useful Tools directory proxy (hosted sales-app list; upstream sends no CORS headers)
const USEFUL_TOOLS_DIRECTORY_URL = 'https://ee-html.up.railway.app/apps.json?tag=sales-app';
app.get('/api/useful-tools', requireAuth, async (req, res) => {
  try {
    const upstream = await fetch(USEFUL_TOOLS_DIRECTORY_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Directory unavailable', status: upstream.status });
    }
    const data = await upstream.json();
    res.set('Cache-Control', 'public, max-age=120');
    res.json({ count: data.count || 0, apps: Array.isArray(data.apps) ? data.apps : [] });
  } catch (error) {
    console.error('[useful-tools] directory fetch failed:', error.message);
    res.status(502).json({ error: 'Directory unavailable' });
  }
});

// SEDA Management Route
app.get('/my-seda', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'my_seda.html'));
});

// Agent Profile Management Route
app.get('/agent/profile', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'agent_profile.html'));
});

// Agent Referral Management Route
app.get('/my-referal', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'my_referal.html'));
});

// Agent Email Management Route
app.get('/my-emails', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'my_emails.html'));
});

app.get('/shared-email-access', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'shared_email_access.html'));
});

// WhatsApp QR Code Generator Route
app.get('/qr-generator', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'qr_generator.html'));
});

// Voucher Management Route
app.get('/voucher-management', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'voucher_management.html'));
});

// Help Directory
app.get('/help/new-user', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'help_new_user.html'));
});

// Company Cloud
app.get('/company-cloud', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'company_cloud.html'));
});

function normalizeUserSignature(signature) {
  if (signature == null || signature === '') return null;
  if (typeof signature !== 'string') {
    const err = new Error('User signature must be a PNG data URL.');
    err.statusCode = 400;
    throw err;
  }

  const trimmed = signature.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    const err = new Error('User signature must be a transparent PNG data URL.');
    err.statusCode = 400;
    throw err;
  }

  return trimmed;
}

/**
 * API: Get full agent profile
 */
app.get('/api/agent/profile', requireAuth, async (req, res) => {
  try {
    const userId = getRequestLegacyUserId(req);
    const bubbleId = getRequestUserBubbleId(req);

    const query = `
      SELECT 
        a.name, 
        u.email, 
        u.profile_picture,
        u.user_signature,
        a.contact,
        a.banker,
        a.bankin_account
      FROM "user" u
      LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
      WHERE u.id::text = $1 OR u.bubble_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [userId, bubbleId]);
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * API: Update agent profile
 */
app.put('/api/agent/profile', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, contact, email, banker, bankin_account, user_signature } = req.body;
    const userId = getRequestLegacyUserId(req);
    const bubbleId = getRequestUserBubbleId(req);
    const shouldUpdateSignature = Object.prototype.hasOwnProperty.call(req.body, 'user_signature');
    const normalizedSignature = shouldUpdateSignature ? normalizeUserSignature(user_signature) : null;

    // Validation: Phone must start with 0 and be 10-11 digits
    if (!/^0\d{9,10}$/.test(contact)) {
      return res.status(400).json({ error: 'Invalid mobile number format. Must start with 0 and be 10-11 digits.' });
    }

    await client.query('BEGIN');

    // 1. Update User table — identity fields land here, same as registration,
    //    otherwise every profile edit re-creates the user/agent divergence.
    const userSetClauses = [
      'email = $1',
      'user_signature = CASE WHEN $2::boolean THEN $3 ELSE user_signature END'
    ];
    const userParams = [email, shouldUpdateSignature, normalizedSignature];

    for (const [column, value] of [
      ['name', name],
      ['contact', contact],
      ['banker', banker],
      ['bankin_account', bankin_account]
    ]) {
      if (await hasTableColumn(client, 'user', column)) {
        userParams.push(value);
        userSetClauses.push(`${column} = $${userParams.length}`);
      }
    }

    userParams.push(userId, bubbleId);
    await client.query(
      `UPDATE "user"
       SET ${userSetClauses.join(', ')},
           updated_at = NOW()
       WHERE id::text = $${userParams.length - 1} OR bubble_id = $${userParams.length}`,
      userParams
    );

    // 2. Update Agent table
    await client.query(
      `UPDATE agent SET name = $1, contact = $2, email = $3, banker = $4, bankin_account = $5, updated_at = NOW() 
       WHERE linked_user_login = $6 OR bubble_id = $7`,
      [name, contact, email, banker, bankin_account, bubbleId, bubbleId]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update Profile Error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to update profile' });
  } finally {
    client.release();
  }
});

/**
 * API: Get current logged in agent details (minimal for header)
 */
app.get('/api/agent/me', requireAuth, async (req, res) => {
  try {
    const userId = getRequestLegacyUserId(req);
    const bubbleId = getRequestUserBubbleId(req);

    if (!userId) {
      console.error('[AgentMe] No userId found in req.user:', req.user);
      return res.status(401).json({ error: 'Invalid session data' });
    }

    // Verified Query based on confirmed schema:
    // Identity (Name, Contact) lives in 'agent'
    // Profile Image lives in 'user'
    const query = `
      SELECT 
        a.name, 
        u.email, 
        u.profile_picture,
        u.user_signature,
        u.access_level,
        a.contact as phone
      FROM "user" u
      LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
      WHERE u.id::text = $1 OR (u.bubble_id = $2 AND u.bubble_id IS NOT NULL AND u.bubble_id != '')
      LIMIT 1
    `;
    const result = await pool.query(query, [String(userId), String(bubbleId || '')]);

    if (result.rows.length === 0) {
      console.warn(`[AgentMe] No user found for ID: ${userId}`);
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[AgentMe] Critical Error:', err);
    // Return detailed error for debugging purposes
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: err.stack,
      hint: 'Check if all columns (name, email, linked_agent_profile, profile_picture) exist in "user" table and contact in "agent" table.'
    });
  }
});

app.get('/select-package', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'select_package.html'));
});

app.get('/chat-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'chat_dashboard.html'));
});

app.get('/chat-settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'chat_settings.html'));
});

app.get('/bug-dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'bug_dashboard.html'));
});

app.get('/bug-chat', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'bug_chat.html'));
});

app.get('/support-tickets', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'support_tickets.html'));
});

app.get('/submit-support-ticket', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'submit_support_ticket.html'));
});

app.get('/claim-submission', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'claim_submission.html'));
});

app.get('/claim-review', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'claim_review.html'));
});

// ── Hosted HTML Apps ───────────────────────────────────────────────────────
app.get('/hosted-html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'hosted_html_manager.html'));
});

async function serveHostedApp(app, label, res) {
  if (!app || app.status !== 'published') {
    return res.status(404).type('html').send(hostedHtmlNotFoundHtml(label));
  }

  let html;
  try {
    // Legacy rows (written before the R2 migration) hold a raw absolute
    // filesystem path under hosted_html/<slug>/index.html — every legacy
    // row's basename is "index.html", so storageDriver's basename-based disk
    // resolution can't address them. Read those directly; anything else goes
    // through storageDriver (new flat disk layout, or R2).
    if (path.isAbsolute(app.storagePath) && !/^https?:\/\//i.test(app.storagePath)) {
      html = await fs.promises.readFile(app.storagePath, 'utf8');
    } else {
      const { buffer } = await storageDriver.getBuffer(app.storagePath, { subdir: 'hosted_html' });
      html = buffer.toString('utf8');
    }
  } catch (err) {
    console.error(`[HostedHtml] missing file for ${label}=${app.slug} at ${app.storagePath}:`, err.message);
    return res.status(404).type('html').send(hostedHtmlNotFoundHtml(label));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors *;");
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.send(html);

  // Fire-and-forget view count
  HostedHtml.service.incrementViewCount(app.id);
  return undefined;
}

app.get('/h/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!/^[a-f0-9]{16}$/.test(slug)) {
    return res.status(404).type('html').send(hostedHtmlNotFoundHtml(slug));
  }
  let app;
  try {
    app = await HostedHtml.service.getAppBySlug(slug);
  } catch (err) {
    console.error('[HostedHtml] public lookup error:', err);
    return res.status(500).type('html').send('Internal error');
  }
  return serveHostedApp(app, slug, res);
});

// Stable, human-readable aliases served at /app/:friendlySlug.
// e.g. /app/scoreboard -> the WC2026 demo scoreboard.
app.get('/app/:friendlySlug', async (req, res) => {
  const { friendlySlug } = req.params;
  if (!HostedHtml.service.FRIENDLY_SLUG_RE.test(friendlySlug)) {
    return res.status(404).type('html').send(hostedHtmlNotFoundHtml(friendlySlug));
  }
  let app;
  try {
    app = await HostedHtml.service.getAppByFriendlySlug(friendlySlug);
  } catch (err) {
    console.error('[HostedHtml] friendly lookup error:', err);
    return res.status(500).type('html').send('Internal error');
  }
  return serveHostedApp(app, friendlySlug, res);
});

// ── /debug — temporary diagnostic for the scoreboard 404 hunt. ─────────────
app.get('/debug', async (req, res) => {
  const checks = [];
  const add = (name, value) => checks.push({ name, value });

  // 1. Environment
  add('env.RAILWAY_VOLUME_MOUNT_PATH', process.env.RAILWAY_VOLUME_MOUNT_PATH || '(unset)');
  add('env.NODE_ENV', process.env.NODE_ENV || '(unset)');
  add('env.DATABASE_URL', process.env.DATABASE_URL ? `(set, length=${process.env.DATABASE_URL.length})` : '(unset)');
  add('env.HOSTED_HTML_API_KEY', process.env.HOSTED_HTML_API_KEY || '(unset — using default "hostmyapp")');
  add('process.cwd()', process.cwd());
  add('__dirname', __dirname);
  add('process.version', process.version);
  add('process.platform', process.platform);

  // 2. Storage path resolution
  const root = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.resolve(__dirname, 'storage');
  add('storage.root.computed', root);
  add('storage.root.exists', fs.existsSync(root));
  try {
    fs.accessSync(root, fs.constants.W_OK);
    add('storage.root.writable', true);
  } catch (e) {
    add('storage.root.writable', `false (${e.code}: ${e.message})`);
  }

  // 3. List the hosted_html directory
  const hostedDir = path.join(root, 'hosted_html');
  add('storage.hosted_html.path', hostedDir);
  add('storage.hosted_html.exists', fs.existsSync(hostedDir));
  if (fs.existsSync(hostedDir)) {
    try {
      const entries = fs.readdirSync(hostedDir).sort();
      add('storage.hosted_html.entries', entries);
    } catch (e) {
      add('storage.hosted_html.list_error', `${e.code}: ${e.message}`);
    }
  }

  // 4. Roundtrip write/read test under storage root
  const testFile = path.join(root, 'hosted_html', '_debug_roundtrip.txt');
  try {
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    const payload = 'debug-' + Date.now();
    fs.writeFileSync(testFile, payload, 'utf8');
    const readBack = fs.readFileSync(testFile, 'utf8');
    add('storage.roundtrip.path', testFile);
    add('storage.roundtrip.ok', readBack === payload);
    add('storage.roundtrip.persists_after_write', readBack);
    try { fs.unlinkSync(testFile); add('storage.roundtrip.cleanup', 'ok'); }
    catch (e) { add('storage.roundtrip.cleanup', `${e.code}: ${e.message}`); }
  } catch (e) {
    add('storage.roundtrip.error', `${e.code}: ${e.message}`);
  }

  // 5. Same roundtrip but one second later — catches ephemeral volumes
  //    that survive in-process reads but not time-based ones.
  try {
    const f = path.join(root, 'hosted_html', '_debug_persist.txt');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'persist-' + Date.now(), 'utf8');
    await new Promise(r => setTimeout(r, 1100));
    const still = fs.readFileSync(f, 'utf8');
    add('storage.persist_test.after_1.1s_ok', !!still);
    fs.unlinkSync(f);
  } catch (e) {
    add('storage.persist_test.error', `${e.code}: ${e.message}`);
  }

  // 6. DB row inspection — scoreboard + all rows
  try {
    const one = await pool.query(
      `SELECT id, slug, friendly_slug, status, storage_path, size_bytes,
              created_at, updated_at, view_count
         FROM hosted_html_app
        WHERE friendly_slug = $1
        LIMIT 1`,
      ['scoreboard']
    );
    if (one.rows.length === 0) {
      add('db.scoreboard_row', '(not found)');
    } else {
      const r = one.rows[0];
      add('db.scoreboard_row.id', String(r.id));
      add('db.scoreboard_row.slug', r.slug);
      add('db.scoreboard_row.friendly_slug', r.friendly_slug);
      add('db.scoreboard_row.status', r.status);
      add('db.scoreboard_row.storage_path', r.storage_path);
      add('db.scoreboard_row.size_bytes', String(r.size_bytes));
      add('db.scoreboard_row.created_at', r.created_at && r.created_at.toISOString());
      add('db.scoreboard_row.updated_at', r.updated_at && r.updated_at.toISOString());
      add('db.scoreboard_row.view_count', String(r.view_count));
      // Does the file actually exist at storage_path right now?
      add('db.scoreboard_row.file_exists', fs.existsSync(r.storage_path));
      if (fs.existsSync(r.storage_path)) {
        try {
          const stat = fs.statSync(r.storage_path);
          add('db.scoreboard_row.file_size', stat.size);
          add('db.scoreboard_row.file_mtime', stat.mtime.toISOString());
        } catch (e) { add('db.scoreboard_row.stat_error', e.message); }
      }
    }
  } catch (e) {
    add('db.query_error', e.message);
  }

  try {
    const all = await pool.query(
      `SELECT id, slug, friendly_slug, status, storage_path
         FROM hosted_html_app
        ORDER BY id`
    );
    add('db.all_rows.count', String(all.rows.length));
    add('db.all_rows', all.rows.map(r => ({
      id: String(r.id), slug: r.slug, friendly: r.friendly_slug,
      status: r.status, path: r.storage_path,
      file_on_disk: fs.existsSync(r.storage_path)
    })));
  } catch (e) {
    add('db.all_rows.error', e.message);
  }

  // 7. What would the controller compute for buildStoragePath(slug) right now?
  if (HostedHtml.service && typeof HostedHtml.service.buildStoragePath === 'function') {
    add('buildStoragePath("scoreboard")', HostedHtml.service.buildStoragePath('scoreboard'));
  } else {
    add('buildStoragePath', '(not exposed on service)');
  }

  // 7b. Route-handler simulation — run the exact same lookups + reads the live
  //     routes do, so we can tell whether the 404 is "row not found" or "file read failed".
  add('route.friendly_regex.test("scoreboard")', HostedHtml.service.FRIENDLY_SLUG_RE.test('scoreboard'));
  add('route.slug_regex(/^[a-f0-9]{16}$/).test("e9c02e34f48b430d")', /^[a-f0-9]{16}$/.test('e9c02e34f48b430d'));

  let routeApp1 = null;
  try {
    routeApp1 = await HostedHtml.service.getAppByFriendlySlug('scoreboard');
    add('route.getAppByFriendlySlug("scoreboard")', routeApp1 || '(null)');
  } catch (e) { add('route.getAppByFriendlySlug.error', e.message); }

  let routeApp2 = null;
  try {
    routeApp2 = await HostedHtml.service.getAppBySlug('e9c02e34f48b430d');
    add('route.getAppBySlug("e9c02e34f48b430d")', routeApp2 || '(null)');
  } catch (e) { add('route.getAppBySlug.error', e.message); }

  // The exact read the route does:
  for (const [label, appObj] of [['friendly', routeApp1], ['canonical', routeApp2]]) {
    if (!appObj) continue;
    add(`route.${label}.status_check_pass`, appObj.status === 'published');
    add(`route.${label}.storagePath`, appObj.storagePath);
    add(`route.${label}.fs.existsSync`, fs.existsSync(appObj.storagePath));
    try {
      const stat = fs.statSync(appObj.storagePath);
      add(`route.${label}.fs.statSync.isFile`, stat.isFile());
      add(`route.${label}.fs.statSync.size`, stat.size);
    } catch (e) { add(`route.${label}.fs.statSync.error`, `${e.code}: ${e.message}`); }
    try {
      const buf = await fs.promises.readFile(appObj.storagePath);
      add(`route.${label}.fs.promises.readFile.bytes`, buf.length);
      add(`route.${label}.fs.promises.readFile.first60`, buf.toString('utf8', 0, 60));
    } catch (e) { add(`route.${label}.fs.promises.readFile.error`, `${e.code}: ${e.message}`); }
  }

  // 8. Render as plain HTML (no auth — for the user to inspect in a browser).
  const escape = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = checks.map(c => `<tr><th>${escape(c.name)}</th><td><pre>${escape(typeof c.value === 'string' ? c.value : JSON.stringify(c.value, null, 2))}</pre></td></tr>`).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>/debug — hosted_html diagnostic</title>
  <style>
    body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0f172a; color: #e2e8f0; padding: 20px; }
    h1 { color: #f0c24b; margin: 0 0 6px; font-size: 1.1rem; }
    p.sub { color: #94a3b8; margin: 0 0 16px; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; width: 36%; color: #94a3b8; padding: 8px 10px; border-bottom: 1px solid #1e293b; font-weight: 500; vertical-align: top; }
    td { padding: 8px 10px; border-bottom: 1px solid #1e293b; vertical-align: top; }
    td pre { margin: 0; white-space: pre-wrap; word-break: break-all; color: #fbbf24; font-size: 0.82rem; }
    .meta { background: #1e293b; border-left: 3px solid #f0c24b; padding: 10px 12px; border-radius: 4px; margin-bottom: 16px; font-size: 0.78rem; color: #cbd5e1; }
  </style>
</head>
<body>
  <h1>/debug — hosted_html diagnostic</h1>
  <p class="sub">Prod-only diagnostic. Delete the route after the 404 is fixed.</p>
  <div class="meta">Run at ${new Date().toISOString()} · node ${process.version} · ${process.platform}</div>
  <table>${rows}</table>
</body>
</html>`);
});

function hostedHtmlNotFoundHtml(slug) {
  const safe = String(slug || '').replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App not found</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #f8fafc; color: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 420px; text-align: center; padding: 40px 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 12px rgba(15,23,42,0.05); }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    p { color: #64748b; margin: 4px 0; font-size: 0.95rem; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>App not found</h1>
    <p>This hosted app may have been removed or disabled.</p>
    <p>Reference: <code>${safe}</code></p>
  </div>
</body>
</html>`;
}

// API endpoint to test database connection (Core Health)
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    res.json({ status: 'Database connected successfully', timestamp: new Date() });
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

app.get('/api/version', (req, res) => {
  res.json({ version: '4.1', timestamp: new Date(), message: 'Connection String Logging' });
});

app.listen(PORT, () => {
  console.log(`[Modular Monolith] Server running on port ${PORT}`);
  // Warn loudly at boot rather than letting a missing R2 var surface later as a
  // bogus "file not found" on every upload and download. Non-fatal: modules still
  // on local disk storage keep working without R2 configured.
  require('./src/core/upload/r2Storage').assertConfigured();
});

Health.startHealthCheckScheduler();
