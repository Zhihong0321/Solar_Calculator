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
  res.redirect('/domestic');
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

/**
 * API: Get current logged in agent details
 */
app.get('/api/agent/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const bubbleId = req.user.bubbleId;

    // Fetch user details and link to agent table for contact info
    const query = `
      SELECT 
        u.name, 
        u.email, 
        u.linked_agent_profile as profile_picture,
        a.contact as phone
      FROM "user" u
      LEFT JOIN agent a ON a.linked_user_login = u.bubble_id
      WHERE u.id::text = $1 OR u.bubble_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [userId, bubbleId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching agent me:', err);
    res.status(500).json({ error: 'Internal server error' });
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
