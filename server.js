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
const Health = require('./src/modules/Health');
const BugReport = require('./src/modules/BugReport');

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
app.use(Health.router);
app.use('/api/v1/bug', BugReport.bugRoutes);

// --- Global Routes & Static Files ---
app.use(express.static('public'));
app.get('/v2-part-1.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'slide-001.webp'));
});
app.get('/domestic-mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'domestic-mobile.html'));
});
app.get('/legacy-domestic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'domestic.html'));
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

    const uploadDir = path.join(storagePath, 'agent_documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Helper to save base64 image
    const saveImage = (base64Data, prefix, bubble_id) => {
      if (!base64Data) return null;
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1].split('/')[1] || 'jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${prefix}_${bubble_id}_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(uploadDir, filename), buffer);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        return `${protocol}://${host}/agent-docs/${filename}`;
      }
      return null;
    };

    const icFrontUrl = saveImage(ic_front, 'ic_front', agent_bubble_id);
    const icBackUrl = saveImage(ic_back, 'ic_back', agent_bubble_id);
    const profilePicUrl = saveImage(profile_picture, 'profile', user_bubble_id);

    await client.query('BEGIN');

    // 1. Create User first
    const userQuery = `
      INSERT INTO "user" (
        bubble_id, email, access_level, linked_agent_profile, user_signed_up, profile_picture, introducer, agent_code, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;
    await client.query(userQuery, [
      user_bubble_id, normalizedEmail, ['pending'], agent_bubble_id, false, profilePicUrl, normalizedIntroducer, normalizedAgentCode
    ]);

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
  res.sendFile(path.join(__dirname, 'public', 'domestic-mobile.html'));
});

app.get('/domestic-v3', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'domestic-v3.html'));
});

app.get('/domestic-v4', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'domestic-v4.html'));
});

// ── /domestic-preview ────────────────────────────────────────────────────────
// Serves domestic-mobile.html with an injected autorun script.
// Reads ?bill=500 and auto-runs the full calculation end-to-end.
// Designed for Claude-Design AI / prod design review without touching the real page.
app.get('/domestic-preview', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'domestic-mobile.html');
  fs.readFile(htmlPath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Preview unavailable');

    // Remove all JS lock classes so layout is exposed immediately
    let injected = html
        .replace(/class="card locked collapsed"/g, 'class="card"')
        .replace(/class="card locked"/g, 'class="card"');

    // Hide spinners
    injected = injected.replace('</head>', '<style>.loading-spinner { display: none !important; }</style></head>');

    // Inject bare minimum structural html into the bodies so they don't look completely empty if JS fails
    const mockBill = `<div style="padding:20px;text-align:center;color:#666;font-style:italic;">Calculated bill breakdown (Content generated dynamically)</div>`;
    const mockRoi = `<div style="padding:20px;text-align:center;color:#666;font-style:italic;">ROI Matrix Comparison (Content generated dynamically)</div>`;
    const mockDetailed = `<div style="padding:20px;text-align:center;color:#666;font-style:italic;">Detailed System Info (Content generated dynamically)</div>`;
    
    // Attempt basic string injection for the empty bodies
    injected = injected.replace(/(id="billBreakdownBody">)[\s\S]*?(<\/div>\s*<!-- \/card2 -->)/, `$1${mockBill}$2`);
    injected = injected.replace(/(id="roiResultBody">)[\s\S]*?(<\/div>\s*<!-- \/card4 -->)/, `$1${mockRoi}$2`);
    injected = injected.replace(/(id="detailedBody">)[\s\S]*?(<\/div>\s*<!-- \/card5 -->)/, `$1${mockDetailed}$2`);

    // Extract bill param — accept ?bill=500 or ?bill=rm500
    const rawBill = (req.query.bill || '').toString().replace(/[^0-9.]/gi, '');
    const billAmount = parseFloat(rawBill) > 0 ? rawBill : '';

    const autorunScript = `
<script>
(function() {
  const _bill = ${JSON.stringify(billAmount)};
  if (!_bill) return;

  async function autoRun() {
    try {
      const billEl = document.getElementById('billAmount');
      if (billEl) {
        billEl.value = _bill;
        billEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Trigger API calculations synchronously if available to fill the actual data
      if (typeof handleBillAnalysis === 'function') await handleBillAnalysis();
      if (typeof handleROIGenerate === 'function') await handleROIGenerate();

      const card4 = document.getElementById('card4');
      if (card4) card4.scrollIntoView({ behavior: 'instant', block: 'start' });
    } catch(e) {
      console.error('[Preview] autoRun failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRun);
  } else {
    autoRun();
  }
})();
</script>
</body>`;

    injected = injected.replace('</body>', autorunScript);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(injected);
  });
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

// Voucher Management Route
app.get('/voucher-management', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'voucher_management.html'));
});

// Help Directory
app.get('/help/new-user', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'help_new_user.html'));
});

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
    const { name, contact, email, banker, bankin_account } = req.body;
    const userId = getRequestLegacyUserId(req);
    const bubbleId = getRequestUserBubbleId(req);

    // Validation: Phone must start with 0 and be 10-11 digits
    if (!/^0\d{9,10}$/.test(contact)) {
      return res.status(400).json({ error: 'Invalid mobile number format. Must start with 0 and be 10-11 digits.' });
    }

    await client.query('BEGIN');

    // 1. Update User table (No 'name' column in user table)
    await client.query(
      `UPDATE "user" SET email = $1, updated_at = NOW() 
       WHERE id::text = $2 OR bubble_id = $3`,
      [email, userId, bubbleId]
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
    res.status(500).json({ error: 'Failed to update profile' });
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
});

Health.startHealthCheckScheduler();
