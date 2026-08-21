/**
 * In-memory conversation state for /lab/chat.
 *
 * Phase 1 deliberately avoids a schema change: no new tables, nothing to
 * migrate, nothing to roll back. Sessions live in process memory and expire.
 * Postgres persistence lands with phase 3, when quotations become real and
 * the thread is worth keeping.
 */

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_TURNS = 24;              // trimmed history sent to the model
const SWEEP_MS = 10 * 60 * 1000;

const sessions = new Map();

function key(userId, sessionId) {
  return `${userId || 'anon'}::${sessionId}`;
}

function create(userId, sessionId) {
  return {
    userId,
    sessionId,
    createdAt: Date.now(),
    touchedAt: Date.now(),
    messages: [],   // { role, content } pairs for the model
    lastCalc: null  // { params, card } from the most recent calculation
  };
}

function get(userId, sessionId) {
  const id = key(userId, sessionId);
  let session = sessions.get(id);
  if (!session) {
    session = create(userId, sessionId);
    sessions.set(id, session);
  }
  session.touchedAt = Date.now();
  return session;
}

function pushMessage(session, role, content) {
  session.messages.push({ role, content });
  if (session.messages.length > MAX_TURNS) {
    session.messages.splice(0, session.messages.length - MAX_TURNS);
  }
  session.touchedAt = Date.now();
}

function setLastCalc(session, params, card) {
  session.lastCalc = { params, card, at: Date.now() };
  session.touchedAt = Date.now();
}

function reset(userId, sessionId) {
  sessions.delete(key(userId, sessionId));
}

function stats() {
  return { sessions: sessions.size };
}

const sweeper = setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, session] of sessions) {
    if (session.touchedAt < cutoff) sessions.delete(id);
  }
}, SWEEP_MS);
sweeper.unref();

module.exports = { get, pushMessage, setLastCalc, reset, stats };
