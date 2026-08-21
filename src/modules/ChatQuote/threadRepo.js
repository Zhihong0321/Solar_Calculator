/**
 * Thread persistence for /lab/chat.
 *
 * Tables lab_chat_thread and lab_chat_message live on prod_main. They are
 * additive — nothing else in the schema references them, and dropping both
 * removes the prototype's entire footprint from the database.
 *
 * Threads are scoped to the owning agent on every query. A thread is only ever
 * reachable by the user_id that created it; the thread_key alone is not enough.
 */

const crypto = require('crypto');
const pool = require('../../core/database/pool');

const MAX_TITLE = 120;
const MAX_PREVIEW = 200;

function newThreadKey() {
  return 'th_' + crypto.randomBytes(9).toString('hex');
}

function truncate(value, max) {
  if (!value) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** "RM 450 · 9.1 kWp" — derived, so the agent never names a thread. */
function titleFromCard(card) {
  if (!card) return null;
  const amount = card.params && Number(card.params.amount);
  const kwp = card.system && card.system.sizeKwp;
  const parts = [];
  if (Number.isFinite(amount)) parts.push('RM ' + Math.round(amount));
  if (kwp) parts.push(kwp + ' kWp');
  return parts.length ? parts.join(' · ') : null;
}

function previewFromCard(card) {
  if (!card || !card.bill || card.bill.savings == null) return null;
  return 'Saves RM ' + Math.round(Number(card.bill.savings)) + '/mo';
}

async function createThread(userId) {
  const { rows } = await pool.query(
    `INSERT INTO lab_chat_thread (thread_key, user_id)
     VALUES ($1, $2)
     RETURNING id, thread_key, title, status, preview, created_at, updated_at`,
    [newThreadKey(), userId]
  );
  return rows[0];
}

async function listThreads(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT thread_key, title, status, preview, updated_at
       FROM lab_chat_thread
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function getThread(userId, threadKey) {
  const { rows } = await pool.query(
    `SELECT id, thread_key, title, status, last_calc, preview, created_at, updated_at
       FROM lab_chat_thread
      WHERE user_id = $1 AND thread_key = $2 AND deleted_at IS NULL`,
    [userId, threadKey]
  );
  return rows[0] || null;
}

async function getMessages(threadId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT role, content, card, created_at
       FROM lab_chat_message
      WHERE thread_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT $2`,
    [threadId, limit]
  );
  return rows;
}

async function appendMessage(threadId, role, content, card = null) {
  await pool.query(
    `INSERT INTO lab_chat_message (thread_id, role, content, card)
     VALUES ($1, $2, $3, $4)`,
    [threadId, role, content || null, card ? JSON.stringify(card) : null]
  );
  await pool.query('UPDATE lab_chat_thread SET updated_at = now() WHERE id = $1', [threadId]);
}

/**
 * Records the newest calculation on the thread and lets the title and preview
 * catch up. An existing customer-named title is left alone — phase 3 sets that
 * and it should outrank the derived one.
 */
async function recordCalculation(threadId, card, { keepTitle = false } = {}) {
  const title = keepTitle ? null : truncate(titleFromCard(card), MAX_TITLE);
  const preview = truncate(previewFromCard(card), MAX_PREVIEW);

  await pool.query(
    `UPDATE lab_chat_thread
        SET last_calc  = $2,
            title      = COALESCE($3, title),
            preview    = COALESCE($4, preview),
            status     = 'quoted',
            updated_at = now()
      WHERE id = $1`,
    [threadId, JSON.stringify(card), title, preview]
  );
}

/**
 * Chip adjustments replace the card in place rather than adding a turn, so the
 * stored message has to move with it — otherwise reloading the thread would
 * show the pre-adjustment card.
 */
async function updateLatestCard(threadId, card) {
  await pool.query(
    `UPDATE lab_chat_message
        SET card = $2
      WHERE id = (
        SELECT id FROM lab_chat_message
         WHERE thread_id = $1 AND card IS NOT NULL
         ORDER BY created_at DESC, id DESC
         LIMIT 1
      )`,
    [threadId, JSON.stringify(card)]
  );
}

/** Newest card of a given type on the thread, or null. */
async function latestCardOfType(threadId, type) {
  const { rows } = await pool.query(
    `SELECT card FROM lab_chat_message
      WHERE thread_id = $1 AND card->>'type' = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [threadId, type]
  );
  return rows[0] ? rows[0].card : null;
}

/** Rewrites the newest card of a type in place (report refresh). */
async function updateCardOfType(threadId, type, card) {
  await pool.query(
    `UPDATE lab_chat_message
        SET card = $3
      WHERE id = (
        SELECT id FROM lab_chat_message
         WHERE thread_id = $1 AND card->>'type' = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 1
      )`,
    [threadId, type, JSON.stringify(card)]
  );
}

async function setPreview(threadId, text) {
  await pool.query(
    'UPDATE lab_chat_thread SET preview = $2, updated_at = now() WHERE id = $1',
    [threadId, truncate(text, MAX_PREVIEW)]
  );
}

async function softDelete(userId, threadKey) {
  const { rowCount } = await pool.query(
    `UPDATE lab_chat_thread
        SET deleted_at = now()
      WHERE user_id = $1 AND thread_key = $2 AND deleted_at IS NULL`,
    [userId, threadKey]
  );
  return rowCount > 0;
}

module.exports = {
  createThread,
  listThreads,
  getThread,
  getMessages,
  appendMessage,
  recordCalculation,
  updateLatestCard,
  latestCardOfType,
  updateCardOfType,
  setPreview,
  softDelete,
  titleFromCard
};
