/**
 * Routes for the /lab/chat prototype.
 *
 * Everything lives under /lab so it cannot collide with the production app,
 * and it is never registered in the navigation shell — the pages are reachable
 * only by typing the URL.
 *
 *   GET  /lab/chat            thread list
 *   GET  /lab/chat/t/:key     one conversation
 */

const express = require('express');
const path = require('path');
const { requireAuth } = require('../../core/middleware/auth');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');
const repo = require('./threadRepo');
const chatService = require('./chatService');
const ai = require('./aiClient');
const eeAuto = require('./eeAuto');

const router = express.Router();
const TEMPLATES = path.join(__dirname, '..', '..', '..', 'public', 'templates');

/** requireAuth redirects browsers to the auth hub; XHR needs a JSON 401 instead. */
function requireAuthJson(req, res, next) {
  if (!req.cookies || !req.cookies.auth_token) {
    return res.status(401).json({ error: 'Not signed in', signInUrl: process.env.AUTH_URL || 'https://auth.atap.solar' });
  }
  return requireAuth(req, res, next);
}

function userIdOf(req) {
  return getRequestUserBubbleId(req) || getRequestLegacyUserId(req) || (req.user && req.user.userId) || null;
}

/** Loads the thread and proves the caller owns it, or answers 404. */
async function loadOwnThread(req, res) {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  const thread = await repo.getThread(userId, req.params.key);
  if (!thread) {
    res.status(404).json({ error: 'Thread not found' });
    return null;
  }
  return thread;
}

// ── Pages ─────────────────────────────────────────────────────────────────
router.get('/lab/chat', requireAuth, (req, res) => {
  res.sendFile(path.join(TEMPLATES, 'lab_threads.html'));
});

router.get('/lab/chat/t/:key', requireAuth, (req, res) => {
  res.sendFile(path.join(TEMPLATES, 'lab_chat.html'));
});

// ── Who am I ──────────────────────────────────────────────────────────────
router.get('/lab/chat/api/me', requireAuthJson, (req, res) => {
  const user = req.user || {};
  res.json({ name: user.name || null, role: user.role || null, model: ai.CHAT_MODEL });
});

// ── Threads ───────────────────────────────────────────────────────────────
router.get('/lab/chat/api/threads', requireAuthJson, async (req, res) => {
  try {
    res.json({ threads: await repo.listThreads(userIdOf(req)) });
  } catch (err) {
    console.error('[ChatQuote] listThreads failed:', err.message);
    res.status(500).json({ error: 'Could not load your quotations' });
  }
});

router.post('/lab/chat/api/threads', requireAuthJson, async (req, res) => {
  try {
    const thread = await repo.createThread(userIdOf(req));
    res.json({ thread });
  } catch (err) {
    console.error('[ChatQuote] createThread failed:', err.message);
    res.status(500).json({ error: 'Could not start a new quotation' });
  }
});

router.get('/lab/chat/api/threads/:key', requireAuthJson, async (req, res) => {
  try {
    const thread = await loadOwnThread(req, res);
    if (!thread) return undefined;
    const messages = await repo.getMessages(thread.id);
    return res.json({
      thread: {
        threadKey: thread.thread_key,
        title: thread.title,
        status: thread.status,
        createdAt: thread.created_at
      },
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        card: m.card,
        at: m.created_at
      }))
    });
  } catch (err) {
    console.error('[ChatQuote] getThread failed:', err.message);
    return res.status(500).json({ error: 'Could not load this quotation' });
  }
});

router.delete('/lab/chat/api/threads/:key', requireAuthJson, async (req, res) => {
  try {
    const removed = await repo.softDelete(userIdOf(req), req.params.key);
    res.json({ ok: removed });
  } catch (err) {
    console.error('[ChatQuote] softDelete failed:', err.message);
    res.status(500).json({ error: 'Could not remove this quotation' });
  }
});

// ── One conversational turn, streamed ─────────────────────────────────────
router.post('/lab/chat/api/threads/:key/message', requireAuthJson, async (req, res) => {
  const thread = await loadOwnThread(req, res);
  if (!thread) return undefined;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const startedAt = Date.now();

  try {
    const result = await chatService.handleTurn({ thread, text: (req.body && req.body.text) || '', emit });
    emit('reply', { ...result, totalMs: Date.now() - startedAt });
  } catch (err) {
    console.error('[ChatQuote] turn failed:', err);
    emit('reply', { reply: 'Something went wrong on my side. Try again.', card: null, error: true });
  } finally {
    emit('done', {});
    res.end();
  }
  return undefined;
});

// ── Chip adjustment: recalculate without touching the model ───────────────
router.post('/lab/chat/api/threads/:key/adjust', requireAuthJson, async (req, res) => {
  const thread = await loadOwnThread(req, res);
  if (!thread) return undefined;

  const startedAt = Date.now();
  try {
    const card = await chatService.adjust({ thread, patch: (req.body && req.body.patch) || {} });
    return res.json({ card, totalMs: Date.now() - startedAt });
  } catch (err) {
    if (err.code === 'NO_CALC') return res.status(409).json({ error: 'Calculate a bill first' });
    console.error('[ChatQuote] adjust failed:', err.code || err.message);
    return res.status(400).json({ error: err.message || 'Could not recalculate' });
  }
});

// ── Refresh a report that was still running when the turn ended ───────────
router.get('/lab/chat/api/threads/:key/report/:kind/:reportId', requireAuthJson, async (req, res) => {
  const thread = await loadOwnThread(req, res);
  if (!thread) return undefined;

  const { kind, reportId } = req.params;
  if (kind !== 'leads' && kind !== 'research') {
    return res.status(400).json({ error: 'Unknown report kind' });
  }

  try {
    const card = await chatService.refreshReport({ thread, kind, reportId });
    return res.json({ card });
  } catch (err) {
    console.error('[ChatQuote] refreshReport failed:', err.code || err.message);
    return res.status(502).json({ error: 'Could not refresh that report' });
  }
});

// ── Prototype health, no auth: confirms the mount without signing in ──────
router.get('/lab/chat/api/health', (req, res) => {
  res.json({
    ok: true,
    phase: '0+1 threads',
    model: ai.CHAT_MODEL,
    visionModel: ai.VISION_MODEL,
    aiConfigured: Boolean(process.env.AI_ROUTER_API_KEY),
    tools: ['calculate_savings', 'business_search', 'company_research'],
    eeAutoConfigured: eeAuto.isConfigured()
  });
});

module.exports = router;
