/**
 * Routes for the /lab/chat prototype.
 *
 * Everything lives under /lab so it cannot collide with the production app,
 * and it is never registered in the navigation shell — the page is reachable
 * only by typing the URL.
 */

const express = require('express');
const path = require('path');
const { requireAuth } = require('../../core/middleware/auth');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');
const store = require('./sessionStore');
const chatService = require('./chatService');
const ai = require('./aiClient');

const router = express.Router();
const TEMPLATE = path.join(__dirname, '..', '..', '..', 'public', 'templates', 'lab_chat.html');

/** requireAuth redirects browsers to the auth hub; XHR needs a JSON 401 instead. */
function requireAuthJson(req, res, next) {
  if (!req.cookies || !req.cookies.auth_token) {
    return res.status(401).json({ error: 'Not signed in', signInUrl: process.env.AUTH_URL || 'https://auth.atap.solar' });
  }
  return requireAuth(req, res, next);
}

function userIdOf(req) {
  return getRequestUserBubbleId(req) || getRequestLegacyUserId(req) || (req.user && req.user.userId) || 'anon';
}

function sessionIdOf(req) {
  const raw = (req.body && req.body.sessionId) || (req.query && req.query.sessionId) || 'default';
  return String(raw).slice(0, 64);
}

// ── Page ──────────────────────────────────────────────────────────────────
router.get('/lab/chat', requireAuth, (req, res) => {
  res.sendFile(TEMPLATE);
});

// ── Who am I (greeting) ───────────────────────────────────────────────────
router.get('/lab/chat/api/me', requireAuthJson, (req, res) => {
  const user = req.user || {};
  res.json({
    name: user.name || null,
    role: user.role || null,
    model: ai.CHAT_MODEL
  });
});

// ── One conversational turn, streamed ─────────────────────────────────────
router.post('/lab/chat/api/message', requireAuthJson, async (req, res) => {
  const userId = userIdOf(req);
  const session = store.get(userId, sessionIdOf(req));
  const text = (req.body && req.body.text) || '';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const emit = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const startedAt = Date.now();
  try {
    const result = await chatService.handleTurn({ session, text, emit });
    emit('reply', { ...result, totalMs: Date.now() - startedAt });
  } catch (err) {
    console.error('[ChatQuote] turn failed:', err);
    emit('reply', { reply: 'Something went wrong on my side. Try again.', card: null, error: true });
  } finally {
    emit('done', {});
    res.end();
  }
});

// ── Chip adjustment: recalculate without touching the model ───────────────
router.post('/lab/chat/api/adjust', requireAuthJson, async (req, res) => {
  const userId = userIdOf(req);
  const session = store.get(userId, sessionIdOf(req));
  const patch = (req.body && req.body.patch) || {};

  const startedAt = Date.now();
  try {
    const card = await chatService.adjust({ session, patch });
    res.json({ card, totalMs: Date.now() - startedAt });
  } catch (err) {
    if (err.code === 'NO_CALC') {
      return res.status(409).json({ error: 'Calculate a bill first' });
    }
    console.error('[ChatQuote] adjust failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── Start over ────────────────────────────────────────────────────────────
router.post('/lab/chat/api/reset', requireAuthJson, (req, res) => {
  store.reset(userIdOf(req), sessionIdOf(req));
  res.json({ ok: true });
});

// ── Prototype health, no auth: confirms the mount without signing in ──────
router.get('/lab/chat/api/health', (req, res) => {
  res.json({
    ok: true,
    phase: '0+1',
    model: ai.CHAT_MODEL,
    visionModel: ai.VISION_MODEL,
    aiConfigured: Boolean(process.env.AI_ROUTER_API_KEY),
    ...store.stats()
  });
});

module.exports = router;
