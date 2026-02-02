const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- Core Resources ---
const pool = require('./src/core/database/pool');
const { requireAuth } = require('./src/core/middleware/auth');

// --- Feature Modules ---
const Invoicing = require('./src/modules/Invoicing');
const SolarCalculator = require('./src/modules/SolarCalculator');
const Customer = require('./src/modules/Customer');
const Chat = require('./src/modules/Chat');
const Referral = require('./src/modules/Referral');
const sedaRoutes = require('./routes/sedaRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json({ limit: '50mb' }));

// --- Module Mounting ---
app.use(Invoicing.router);
app.use(SolarCalculator.router);
app.use(Customer.router);
app.use(Chat.router);
app.use(Referral.router);
app.use(sedaRoutes);

// --- Global Routes & Static Files ---
app.use(express.static('public'));
app.use('/proposal', express.static('portable-proposal'));

const storagePath = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'storage');
app.use('/uploads', express.static(storagePath));
app.use('/seda-files', express.static(path.join(storagePath, 'seda_registration')));

app.get('/', (req, res) => {
  if (req.cookies.auth_token) {
    return res.redirect('/agent/home');
  }
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/domestic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'domestic.html'));
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

/**
 * API: Get full agent profile
 */
app.get('/api/agent/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const bubbleId = req.user.bubbleId;

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
    const userId = req.user.userId;
    const bubbleId = req.user.bubbleId;

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
    const userId = req.user.userId || req.user.id;
    const bubbleId = req.user.bubbleId || req.user.bubble_id;

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

app.listen(PORT, () => {
  console.log(`[Modular Monolith] Server running on port ${PORT}`);
});
