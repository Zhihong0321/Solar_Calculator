const fs = require('fs');
const path = require('path');
const pool = require('../../core/database/pool');
const reviewService = require('./googleReviewService');
const nameUtils = require('./nameUtils');

const WA_BASE_URL = String(process.env.GOOGLE_REVIEW_WA_BASE_URL || 'https://ee-baileys-production.up.railway.app').replace(/\/+$/, '');
const DEFAULT_SESSION_ID = 'eternalgy-auth';
const TEST_PHONE = '601121000099';
// Where customers finally land: Google's direct "write a review" page for the business (opens the review
// form, asks for a Google sign-in if needed). Place ID of Eternalgy Sdn Bhd, checked against Google Maps.
// The old Maps place link (.../maps/place/...!9m1!1b1) only listed existing reviews and pushed Maps app updates.
const GOOGLE_PLACE_ID = 'ChIJj9bg8rlt2jERcLzNDSYhD-M';
const GOOGLE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}`;
// Short link put in the WhatsApp message; GET /review on this app redirects to GOOGLE_REVIEW_URL.
const SHORT_REVIEW_URL = `${String(process.env.PUBLIC_BASE_URL || 'https://calculator.atap.solar').replace(/\/+$/, '')}/review`;
const DEFAULT_REVIEW_URL = SHORT_REVIEW_URL;
const TICK_MS = 15 * 1000;
const WA_TIMEOUT_MS = 30 * 1000;
const SEND_LEASE_SEC = 300; // a crashed send frees its slot after this long
const SENDING_STALE_MIN = 10;
const MIN_INTERVAL_FLOOR_SEC = 30; // pacing never goes faster than this, whatever is saved

let schemaPromise = null;

/** Create the tables on first use so a deploy needs no manual migration step. */
function ensureSchema() {
  if (!schemaPromise) {
    const sql = fs.readFileSync(path.join(__dirname, '../../../migrations/add_google_review_campaign.sql'), 'utf8');
    schemaPromise = pool.query(sql).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

// ---------- settings ----------

const num = (value, fallback, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

async function getSettings() {
  await ensureSchema();
  const { rows } = await pool.query('SELECT * FROM google_review_campaign_settings WHERE id = 1');
  const row = rows[0] || {};
  return { ...row, review_url: row.review_url || DEFAULT_REVIEW_URL };
}

async function updateSettings(input = {}) {
  const current = await getSettings();
  const minInterval = num(input.min_interval_sec, current.min_interval_sec, MIN_INTERVAL_FLOOR_SEC, 3600);
  const maxInterval = Math.max(minInterval, num(input.max_interval_sec, current.max_interval_sec, MIN_INTERVAL_FLOOR_SEC, 7200));
  const batchMin = num(input.batch_size_min, current.batch_size_min, 1, 100);
  const batchMax = Math.max(batchMin, num(input.batch_size_max, current.batch_size_max, 1, 200));
  const breakMin = num(input.batch_break_min_sec, current.batch_break_min_sec, 60, 7200);
  const breakMax = Math.max(breakMin, num(input.batch_break_max_sec, current.batch_break_max_sec, 60, 14400));
  const startHour = num(input.window_start_hour, current.window_start_hour, 0, 23);
  const endHour = num(input.window_end_hour, current.window_end_hour, 1, 24);

  const template = input.message_template === undefined
    ? current.message_template
    : (String(input.message_template || '').trim() || null);
  const templateZh = input.message_template_zh === undefined
    ? current.message_template_zh
    : (String(input.message_template_zh || '').trim() || null);
  const reviewUrl = input.review_url === undefined
    ? current.review_url
    : (String(input.review_url || '').trim() || DEFAULT_REVIEW_URL);
  const sessionId = input.session_id === undefined
    ? current.session_id
    : (String(input.session_id || '').trim() || DEFAULT_SESSION_ID);

  await pool.query(
    `UPDATE google_review_campaign_settings
        SET message_template = $1, review_url = $2, session_id = $3,
            min_interval_sec = $4, max_interval_sec = $5, daily_limit = $6,
            window_start_hour = $7, window_end_hour = $8,
            batch_size_min = $9, batch_size_max = $10,
            batch_break_min_sec = $11, batch_break_max_sec = $12,
            message_template_zh = $13,
            updated_at = NOW()
      WHERE id = 1`,
    [
      template, reviewUrl, sessionId, minInterval, maxInterval,
      num(input.daily_limit, current.daily_limit, 1, 1000),
      startHour, Math.max(endHour, startHour + 1),
      batchMin, batchMax, breakMin, breakMax, templateZh
    ]
  );
  return getSettings();
}

async function setRunning(running) {
  await ensureSchema();
  await pool.query(
    `UPDATE google_review_campaign_settings
        SET running = $1, next_send_at = CASE WHEN $1 THEN NOW() ELSE next_send_at END,
            worker_note = $2, worker_note_at = NOW(), updated_at = NOW()
      WHERE id = 1`,
    [Boolean(running), running ? 'Started' : 'Paused by user']
  );
  return getSettings();
}

async function setNote(note) {
  await pool.query(
    'UPDATE google_review_campaign_settings SET worker_note = $1, worker_note_at = NOW() WHERE id = 1',
    [String(note || '').slice(0, 300)]
  );
}

// ---------- message rendering ----------

/** Picks one option from each {a|b|c} group, so messages are not word-for-word identical. */
function spin(text) {
  return String(text || '').replace(/\{([^{}|]*(?:\|[^{}|]*)+)\}/g, (m, group) => {
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

/**
 * Template for this customer: the Chinese one when the name looks Chinese (see nameUtils), otherwise the
 * English one. Falls back to whichever template exists, so a missing one never stops a message.
 */
function pickTemplate(settings, customerName) {
  const wanted = nameUtils.detectLanguage(customerName);
  if (wanted === 'zh' && settings.message_template_zh) return { lang: 'zh', template: settings.message_template_zh };
  if (settings.message_template) return { lang: 'en', template: settings.message_template };
  if (settings.message_template_zh) return { lang: 'zh', template: settings.message_template_zh };
  return { lang: 'en', template: '' };
}

/**
 * Placeholders: {customer_name} (tidied: no "(ATAP)", proper case; "Valued Customer" / "客户" for a company
 * or blank record) and {review_link}. {name} still works as an alias. {a|b|c} picks one option at random.
 */
function renderMessage(template, { name, reviewUrl, lang = 'en' }) {
  const greeting = nameUtils.greetingName(name, lang);
  return spin(String(template || ''))
    .replace(/\{customer_name\}/gi, greeting)
    .replace(/\{name\}/gi, greeting)
    .replace(/\{review_link\}/gi, reviewUrl || DEFAULT_REVIEW_URL);
}

/** Malaysian mobile (0123456789 / +60123456789 / 60123456789) -> 60123456789, or null. */
function toWaNumber(input) {
  const local = reviewService.normalizeMobile(input);
  return local ? `60${local.slice(1)}` : null;
}

// ---------- eligibility scan ----------

/**
 * Eligible = SEDA approved AND paid >= 100% of invoiced (same payment/invoice sums the Customer page
 * uses). Customers without a usable mobile number are still listed, labelled, so nothing disappears.
 */
async function scanEligible() {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (c.customer_id)
              c.customer_id,
              c.name,
              c.phone,
              s.applicant_phone,
              COALESCE(cia.total_invoiced, 0) AS total_invoiced,
              COALESCE(cpa.total_paid, 0)     AS total_paid,
              ROUND((COALESCE(cpa.total_paid, 0) / cia.total_invoiced) * 100, 1) AS paid_percent,
              cpa.last_payment_date,
              s.state AS seda_state,
              s.postcode AS seda_postcode,
              COALESCE(NULLIF(s.installation_address, ''), c.address) AS address,
              g.status AS claim_status,
              m.status AS campaign_status,
              m.sent_at AS campaign_sent_at
         FROM seda_registration s
         JOIN customer c ON c.customer_id = s.linked_customer
         JOIN (
           SELECT linked_customer, SUM(COALESCE(total_amount, 0)) AS total_invoiced
             FROM invoice
            WHERE is_deleted IS NOT TRUE AND linked_customer IS NOT NULL
            GROUP BY linked_customer
         ) cia ON cia.linked_customer = c.customer_id AND cia.total_invoiced > 0
         LEFT JOIN (
           SELECT linked_customer, SUM(COALESCE(amount, 0)) AS total_paid, MAX(payment_date) AS last_payment_date
             FROM payment
            WHERE linked_customer IS NOT NULL
            GROUP BY linked_customer
         ) cpa ON cpa.linked_customer = c.customer_id
         LEFT JOIN google_review_claim g
                ON g.customer_id = c.customer_id AND g.status <> 'Rejected'
         LEFT JOIN google_review_campaign_message m
                ON m.customer_id = c.customer_id AND m.is_test = FALSE
        WHERE ${reviewService.SEDA_APPROVED_SQL}
          AND ROUND((COALESCE(cpa.total_paid, 0) / cia.total_invoiced) * 100, 1) >= 100
        ORDER BY c.customer_id, s.created_at DESC NULLS LAST
     ) t
     ORDER BY t.last_payment_date DESC NULLS LAST, t.name ASC NULLS LAST`
  );

  return rows.map((row) => {
    const waNumber = toWaNumber(row.phone) || toWaNumber(row.applicant_phone);
    return {
      customer_id: row.customer_id,
      name: row.name,
      phone: waNumber,
      raw_phone: row.phone || row.applicant_phone || null,
      state: reviewService.resolveInstallationState({
        seda_state: row.seda_state, seda_postcode: row.seda_postcode, address: row.address
      }),
      total_invoiced: Number(row.total_invoiced),
      total_paid: Number(row.total_paid),
      paid_percent: Number(row.paid_percent),
      last_payment_date: row.last_payment_date,
      language: nameUtils.detectLanguage(row.name),
      is_company: nameUtils.isCompanyName(row.name),
      claim_status: row.claim_status || null,
      campaign_status: row.campaign_status || null,
      campaign_sent_at: row.campaign_sent_at || null
    };
  });
}

/** Queue every eligible customer with a valid mobile who is not already in the campaign. */
async function enqueueEligible(actor, { skipClaimed = true } = {}) {
  const eligible = await scanEligible();
  const queueable = eligible.filter((c) => c.phone && !c.campaign_status && !(skipClaimed && c.claim_status));
  let queued = 0;
  for (const c of queueable) {
    const result = await pool.query(
      `INSERT INTO google_review_campaign_message (customer_id, customer_name, phone, queued_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (customer_id) WHERE is_test = FALSE DO NOTHING`,
      [c.customer_id, c.name, c.phone, actor && actor.name]
    );
    queued += result.rowCount;
  }
  return {
    eligible: eligible.length,
    queued,
    already_in_campaign: eligible.filter((c) => c.campaign_status).length,
    no_valid_mobile: eligible.filter((c) => !c.phone).length,
    skipped_already_claimed: skipClaimed ? eligible.filter((c) => c.claim_status && !c.campaign_status && c.phone).length : 0
  };
}

// ---------- WhatsApp API ----------

async function waRequest(method, urlPath, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WA_TIMEOUT_MS);
  try {
    const res = await fetch(`${WA_BASE_URL}${urlPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.name === 'AbortError' ? 'WhatsApp API timed out' : err.message } };
  } finally {
    clearTimeout(timer);
  }
}

async function getSessionStatus(sessionId) {
  const res = await waRequest('GET', `/sessions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    return { connected: false, status: 'unreachable', message: res.data.error || `HTTP ${res.status}`, number: null };
  }
  return {
    connected: res.data.status === 'connected',
    status: res.data.status || 'unknown',
    message: res.data.message || null,
    number: res.data.connectedNumber || null
  };
}

async function sendText(sessionId, phone, text) {
  const res = await waRequest('POST', '/messages/send', { sessionId, to: phone, text });
  if (res.ok && res.data.status === 'sent') {
    return { ok: true, waMessageId: (res.data.result && res.data.result.key && res.data.result.key.id) || null };
  }
  return { ok: false, error: String(res.data.error || res.data.message || `HTTP ${res.status}`).slice(0, 300) };
}

/**
 * Test send to the fixed test number. Uses the saved template (rendered with a sample name) unless
 * a text is given. Recorded as a test row so it shows on the monitor page.
 */
async function sendTest(actor, { lang } = {}) {
  const settings = await getSettings();
  const wantZh = lang === 'zh';
  const template = wantZh ? settings.message_template_zh : settings.message_template;
  if (!template) {
    return { error: `No ${wantZh ? 'Chinese' : 'English'} message template saved yet. Save it first.` };
  }
  const body = renderMessage(template, {
    name: wantZh ? 'Tan Wei Ming' : 'Test Customer',
    reviewUrl: settings.review_url,
    lang: wantZh ? 'zh' : 'en'
  });

  const { rows } = await pool.query(
    `INSERT INTO google_review_campaign_message (customer_id, customer_name, phone, status, is_test, queued_by, message_text, attempts, language)
     VALUES ('TEST', $4, $1, 'Sending', TRUE, $2, $3, 1, $5) RETURNING id`,
    [TEST_PHONE, actor && actor.name, body, wantZh ? 'Test send (Chinese)' : 'Test send (English)', wantZh ? 'zh' : 'en']
  );
  const result = await sendText(settings.session_id, TEST_PHONE, body);
  await pool.query(
    `UPDATE google_review_campaign_message
        SET status = $2, last_error = $3, wa_message_id = $4, sent_at = CASE WHEN $2 = 'Sent' THEN NOW() END, updated_at = NOW()
      WHERE id = $1`,
    [rows[0].id, result.ok ? 'Sent' : 'Failed', result.ok ? null : result.error, result.ok ? result.waMessageId : null]
  );
  return result.ok ? { sent: true, to: TEST_PHONE } : { sent: false, to: TEST_PHONE, error: result.error };
}

// ---------- gentle sender ----------

const randBetween = (min, max) => min + Math.random() * Math.max(0, max - min);

function myNow() {
  // Hour and date in Malaysia time, whatever the server timezone is.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', hour12: false
  }).formatToParts(new Date());
  return { hour: Number(parts.find((p) => p.type === 'hour').value) % 24 };
}

async function sentTodayCount() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM google_review_campaign_message
      WHERE is_test = FALSE AND status = 'Sent'
        AND (sent_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date`
  );
  return rows[0].n;
}

let ticking = false;

/**
 * One scheduler pass. Sends at most one message, then books the next slot a random time away.
 * Nothing here deletes or hides queue rows: when sending cannot happen (paused, outside the
 * window, daily cap, session down) the reason is written to worker_note and rows stay queued.
 */
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await ensureSchema();
    const s = await getSettings();
    if (!s.running) return;

    if (!s.message_template && !s.message_template_zh) return setNote('Waiting: no message template saved yet');

    const { hour } = myNow();
    if (hour < s.window_start_hour || hour >= s.window_end_hour) {
      return setNote(`Waiting: outside sending hours (${s.window_start_hour}:00-${s.window_end_hour}:00 Malaysia time)`);
    }
    if ((await sentTodayCount()) >= s.daily_limit) {
      return setNote(`Waiting: daily limit of ${s.daily_limit} reached, resumes tomorrow`);
    }

    // Take the send slot. The lease also stops two server instances sending at once.
    const slot = await pool.query(
      `UPDATE google_review_campaign_settings
          SET next_send_at = NOW() + make_interval(secs => $1)
        WHERE id = 1 AND running = TRUE AND (next_send_at IS NULL OR next_send_at <= NOW())
        RETURNING id`,
      [SEND_LEASE_SEC]
    );
    if (!slot.rowCount) return undefined;

    const session = await getSessionStatus(s.session_id);
    if (!session.connected) {
      await pool.query(`UPDATE google_review_campaign_settings SET next_send_at = NOW() + interval '60 seconds' WHERE id = 1`);
      return setNote(`Waiting: WhatsApp session "${s.session_id}" is ${session.status}${session.message ? ` (${session.message})` : ''}`);
    }

    // Rows stuck in Sending (server restarted mid-send) go back to the queue.
    await pool.query(
      `UPDATE google_review_campaign_message SET status = 'Queued', updated_at = NOW()
        WHERE status = 'Sending' AND is_test = FALSE AND updated_at < NOW() - make_interval(mins => $1)`,
      [SENDING_STALE_MIN]
    );

    const claimed = await pool.query(
      `UPDATE google_review_campaign_message
          SET status = 'Sending', attempts = attempts + 1, updated_at = NOW()
        WHERE id = (SELECT id FROM google_review_campaign_message
                     WHERE status = 'Queued' AND is_test = FALSE
                     ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`
    );
    const row = claimed.rows[0];
    if (!row) {
      await pool.query(`UPDATE google_review_campaign_settings SET next_send_at = NOW() + interval '30 seconds' WHERE id = 1`);
      return setNote('Idle: queue is empty');
    }

    const { lang, template } = pickTemplate(s, row.customer_name);
    const text = renderMessage(template, { name: row.customer_name, reviewUrl: s.review_url, lang });
    const result = await sendText(s.session_id, row.phone, text);
    await pool.query(
      `UPDATE google_review_campaign_message
          SET status = $2, last_error = $3, message_text = $4, wa_message_id = $5, language = $6,
              sent_at = CASE WHEN $2 = 'Sent' THEN NOW() END, updated_at = NOW()
        WHERE id = $1`,
      [row.id, result.ok ? 'Sent' : 'Failed', result.ok ? null : result.error, text, result.ok ? result.waMessageId : null, lang]
    );

    // Book the next slot: random gap, plus a longer random rest after each random-sized batch.
    let waitSec = randBetween(s.min_interval_sec, s.max_interval_sec);
    let sentInBatch = s.sent_in_batch + 1;
    let batchTarget = s.batch_target || Math.round(randBetween(s.batch_size_min, s.batch_size_max));
    let note = result.ok ? `Sent to ${row.customer_name || row.customer_id}` : `Failed for ${row.customer_name || row.customer_id}: ${result.error}`;
    if (!result.ok) waitSec = Math.max(waitSec, s.max_interval_sec) * 2; // back off after an error, keep going
    if (sentInBatch >= batchTarget) {
      waitSec = randBetween(s.batch_break_min_sec, s.batch_break_max_sec);
      sentInBatch = 0;
      batchTarget = Math.round(randBetween(s.batch_size_min, s.batch_size_max));
      note += ` · resting ${Math.round(waitSec / 60)} min`;
    }
    await pool.query(
      `UPDATE google_review_campaign_settings
          SET next_send_at = NOW() + make_interval(secs => $1), sent_in_batch = $2, batch_target = $3,
              worker_note = $4, worker_note_at = NOW()
        WHERE id = 1`,
      [waitSec, sentInBatch, batchTarget, note.slice(0, 300)]
    );
    return undefined;
  } catch (err) {
    console.error('[GoogleReviewCampaign] tick error:', err.message);
    return undefined;
  } finally {
    ticking = false;
  }
}

let timer = null;
function startWorker() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  if (timer.unref) timer.unref();
}

// ---------- monitor ----------

async function getProgress({ limit = 200 } = {}) {
  const s = await getSettings();
  const counts = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM google_review_campaign_message WHERE is_test = FALSE GROUP BY status`
  );
  const by = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
  const recent = await pool.query(
    `SELECT id, customer_id, customer_name, phone, status, attempts, last_error, message_text, is_test, language,
            queued_at, sent_at, updated_at
       FROM google_review_campaign_message
      ORDER BY CASE status WHEN 'Sending' THEN 0 WHEN 'Queued' THEN 1 ELSE 2 END,
               COALESCE(sent_at, updated_at) DESC, id DESC
      LIMIT $1`,
    [limit]
  );
  const sentToday = await sentTodayCount();
  const session = await getSessionStatus(s.session_id);
  const queued = by.Queued || 0;
  const avgGap = (s.min_interval_sec + s.max_interval_sec) / 2;

  return {
    settings: s,
    session,
    test_phone: TEST_PHONE,
    totals: {
      queued,
      sending: by.Sending || 0,
      sent: by.Sent || 0,
      failed: by.Failed || 0,
      skipped: by.Skipped || 0,
      total: Object.values(by).reduce((a, b) => a + b, 0),
      sent_today: sentToday
    },
    // Rough finish estimate: average gap plus the batch rests, ignoring the daily cap.
    estimated_minutes_left: Math.round(
      (queued * avgGap) / 60 +
      (queued / Math.max(1, (s.batch_size_min + s.batch_size_max) / 2)) * ((s.batch_break_min_sec + s.batch_break_max_sec) / 2 / 60)
    ),
    messages: recent.rows
  };
}

/** Failed rows go back to the queue so they are tried again at the normal pace. */
async function retryFailed() {
  await ensureSchema();
  const result = await pool.query(
    `UPDATE google_review_campaign_message SET status = 'Queued', last_error = NULL, updated_at = NOW()
      WHERE status = 'Failed' AND is_test = FALSE`
  );
  return { requeued: result.rowCount };
}

module.exports = {
  TEST_PHONE,
  GOOGLE_REVIEW_URL,
  SHORT_REVIEW_URL,
  ensureSchema,
  getSettings,
  updateSettings,
  setRunning,
  renderMessage,
  pickTemplate,
  scanEligible,
  enqueueEligible,
  getSessionStatus,
  sendTest,
  getProgress,
  retryFailed,
  startWorker,
  tick
};
