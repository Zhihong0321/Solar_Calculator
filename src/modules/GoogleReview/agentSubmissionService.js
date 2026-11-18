const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const pool = require('../../core/database/pool');
const r2Storage = require('../../core/upload/r2Storage');
const reviewService = require('./googleReviewService');
const campaign = require('./campaignService');
const reviewScan = require('./reviewScanService');

/**
 * API for the WhatsApp AI agents. Each agent that gets a customer's screenshot reply posts it here:
 * the proof image, who added the review (the name on the Google review) and the customer's mobile number.
 *
 * Nothing sent here is ever thrown away: whatever the agent submits is recorded and labelled
 * (invalid mobile, no proof, no matching customer, no matching Google review, duplicate ...), and when the mobile
 * matches a customer we messaged, a Pending claim is created for HR/KC to approve and pay on the claims page.
 * The endpoint is open: no key or token is needed. A Pending claim still needs HR/KC approval before anything is paid.
 */

const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' };
const PROOF_FIELDS = ['proof', 'photo', 'image', 'screenshot', 'file'];

let schemaPromise = null;

/** Own tables, created on first use (kept apart from the campaign migration so it can never affect sending). */
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS google_review_agent_submission (
          id                 SERIAL PRIMARY KEY,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          agent_name         TEXT,
          key_label          TEXT,
          reviewer_name      TEXT,
          mobile_input       TEXT,
          mobile             TEXT,
          proof_url          TEXT,
          proof_mime         TEXT,
          note               TEXT,
          matched_message_id INTEGER,
          matched_customer   TEXT,
          claim_id           INTEGER,
          google_review_id   TEXT,
          status             TEXT NOT NULL,
          labels             JSONB NOT NULL DEFAULT '[]'::jsonb
        );
        CREATE INDEX IF NOT EXISTS idx_google_review_agent_submission_created ON google_review_agent_submission (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_google_review_agent_submission_mobile ON google_review_agent_submission (mobile);
        ALTER TABLE google_review_agent_submission ADD COLUMN IF NOT EXISTS google_check TEXT;
        ALTER TABLE google_review_agent_submission ADD COLUMN IF NOT EXISTS google_checked_at TIMESTAMPTZ;
        ALTER TABLE google_review_agent_submission ADD COLUMN IF NOT EXISTS google_note TEXT;
        ALTER TABLE google_review_agent_submission ADD COLUMN IF NOT EXISTS chat_mobile TEXT;
        ALTER TABLE google_review_agent_submission ADD COLUMN IF NOT EXISTS special_tng_mobile TEXT;
        UPDATE google_review_agent_submission s SET special_tng_mobile = s.mobile
         WHERE s.special_tng_mobile IS NULL AND s.mobile IS NOT NULL AND s.matched_message_id IS NOT NULL
           AND ('6' || s.mobile) <> COALESCE((SELECT m.phone FROM google_review_campaign_message m WHERE m.id = s.matched_message_id), '6' || s.mobile);
      `);
    })().catch((err) => { schemaPromise = null; throw err; });
  }
  return schemaPromise;
}

/** No key or token: every agent posts to the same open endpoint. The agent is told apart by the agent_name it sends. */
function identify(req, res, next) {
  req.agentKey = { id: null, label: 'whatsapp-agents' };
  next();
}

const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })
  .fields(PROOF_FIELDS.map((name) => ({ name, maxCount: 1 })));

/** Multipart parsing that never refuses: a bad or oversized file is recorded as "proof not received". */
function parseUpload(req, res, next) {
  if (!/multipart\/form-data/i.test(String(req.headers['content-type'] || ''))) return next();
  return uploadMiddleware(req, res, (err) => {
    if (err) {
      req.uploadProblem = err.code === 'LIMIT_FILE_SIZE' ? 'proof image is larger than 15MB' : `proof upload problem: ${err.message}`;
      req.files = {};
    }
    next();
  });
}

const pick = (body, names) => {
  for (const n of names) {
    const v = body && body[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

// ----- which customer we messaged? -----

/** Malaysian mobile numbers written inside free text, e.g. "chat +60 10-710 5112". */
function numbersInText(text) {
  const found = String(text || '').match(/(?:\+?60|0)[\s-]?1\d(?:[\s-]?\d){7,8}/g) || [];
  return found.map((n) => reviewService.normalizeMobile(n)).filter(Boolean);
}

/**
 * The customer's WhatsApp chat number is not always the number they want the Touch 'n Go reload on, so every number
 * the agent gave is tried, in this order: the chat number, the mobile, then any number written in the note.
 */
function candidateNumbers({ chatMobileInput, mobile, note }) {
  const list = [reviewService.normalizeMobile(chatMobileInput), mobile, ...numbersInText(note)].filter(Boolean);
  return [...new Set(list)];
}

async function findCustomer(candidates) {
  for (const n of candidates) {
    const found = await pool.query(
      `SELECT id, customer_id, customer_name, status, claim_id FROM google_review_campaign_message
        WHERE is_test = FALSE AND phone = $1 ORDER BY id DESC LIMIT 1`, [`6${n}`]);
    if (found.rows[0]) return { matched: found.rows[0], via: n };
  }
  return { matched: null, via: null };
}

/** A matched customer without a claim yet gets a Pending claim for HR/KC to approve and pay. */
async function tryCreateClaim({ matched, mobile, proofUrl, proofMime, agentName, reviewerName, note, labels }) {
  if (matched.claim_id) {
    labels.push(`customer already has claim #${matched.claim_id}`);
    return { claimId: matched.claim_id, status: 'Recorded' };
  }
  try {
    const result = await campaign.verifyAndCreateClaim({
      messageId: matched.id,
      tngMobileInput: mobile || null,
      photoUrl: proofUrl,
      photoMime: proofMime,
      note: `via WhatsApp AI agent "${agentName}"${reviewerName ? `, Google reviewer name "${reviewerName}"` : ''}${note ? `: ${note}` : ''}`,
      actor: { userId: 'ai-agent', name: `AI agent (${agentName})` }
    });
    if (result.error) { labels.push(`claim not created: ${result.error}`); return { claimId: null, status: 'Recorded' }; }
    return { claimId: result.claim.id, status: 'Claim created' };
  } catch (err) {
    console.error('[AgentApi] claim creation failed:', err.message);
    labels.push('claim not created: server error (the submission is recorded)');
    return { claimId: null, status: 'Recorded' };
  }
}

/** Submissions that found no customer when they arrived are tried again (the numbers may be in the note). */
async function rematchCustomers() {
  const open = await pool.query(
    `SELECT id, chat_mobile, special_tng_mobile, mobile, mobile_input, note, proof_url, proof_mime, agent_name, reviewer_name, labels
       FROM google_review_agent_submission WHERE claim_id IS NULL AND matched_message_id IS NULL
        AND created_at > NOW() - interval '30 days' ORDER BY id DESC LIMIT 50`);
  for (const r of open.rows) {
    const candidates = candidateNumbers({ chatMobileInput: r.chat_mobile, mobile: r.mobile, note: r.note });
    const { matched, via } = await findCustomer(candidates);
    if (!matched) continue;
    const labels = (Array.isArray(r.labels) ? r.labels : []).filter((l) => !/not a customer we messaged/.test(l));
    labels.push(`customer found later by the number 0${String(via).slice(1)} (${matched.customer_name})`);
    const made = await tryCreateClaim({ matched, mobile: r.special_tng_mobile || r.mobile, proofUrl: r.proof_url, proofMime: r.proof_mime, agentName: r.agent_name || 'agent', reviewerName: r.reviewer_name, note: r.note, labels });
    await pool.query(
      `UPDATE google_review_agent_submission SET matched_message_id = $2, matched_customer = $3, claim_id = $4, status = $5, labels = $6 WHERE id = $1`,
      [r.id, matched.id, matched.customer_name, made.claimId, made.status, JSON.stringify(labels)]);
  }
}

// ----- name matching against the Google reviews we scanned -----
const normName = (s) => String(s || '').toLowerCase().replace(/\((atap|ecn|ec)\)|[^a-z一-鿿 ]/gi, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => normName(s).split(' ').filter((t) => t.length > 1);

const reviewMatches = (reviewerName, r) => {
  const a = tokens(reviewerName);
  if (!a.length) return false;
  if (normName(r.reviewer_name) === normName(reviewerName)) return true;
  const b = tokens(r.reviewer_name);
  const overlap = a.filter((t) => b.includes(t)).length;
  return overlap >= 2 || (a.length === 1 && b.length === 1 && overlap === 1);
};

/** The Google reviews we have read from the Eternalgy (Johor Bahru) profile, newest first. */
async function loadScanned() {
  try {
    const { rows } = await pool.query(
      `SELECT review_id, reviewer_name, posted_at, rating, review_link FROM google_review_scanned ORDER BY posted_at DESC LIMIT 500`);
    return rows;
  } catch (err) {
    console.error('[AgentApi] scanned review lookup failed:', err.message);
    return [];
  }
}

async function findScannedReview(reviewerName) {
  const all = await loadScanned();
  return all.find((r) => reviewMatches(reviewerName, r)) || null;
}

const dateOf = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

/**
 * Cross-checks one submission against Google: with fresh = true the scraper.tech Google Maps scraper reads the newest
 * reviews of our profile first, then the reviewer name is looked for among them. The result is only a label on the
 * submission (found / not found yet / check failed): it never changes or blocks the claim.
 */
async function crossCheck(id, { fresh = false, preloaded = null } = {}) {
  await ensureSchema();
  const row = (await pool.query('SELECT id, reviewer_name FROM google_review_agent_submission WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  let scanNote = null;
  if (fresh) {
    try {
      const out = await reviewScan.scan();
      if (out && out.ok === false && !out.skipped) scanNote = out.note || 'scan failed';
    } catch (err) { scanNote = err.message; }
  }
  const all = preloaded || await loadScanned();
  let check;
  let review = null;
  let note;
  if (!String(row.reviewer_name || '').trim()) {
    check = 'no_name'; note = 'No reviewer name was sent, so there is nothing to look for on Google.';
  } else {
    review = all.find((r) => reviewMatches(row.reviewer_name, r)) || null;
    if (review) { check = 'found'; note = `Found on Google: "${review.reviewer_name}", ${review.rating || '?'} star, posted ${dateOf(review.posted_at)}.`; }
    else if (scanNote) { check = 'error'; note = `Could not read Google just now (${scanNote}). It will be tried again.`; }
    else { check = 'not_found'; note = 'Not found on the Eternalgy Johor Bahru Google profile yet. Google can take a while to show a new review.'; }
  }
  await pool.query(
    `UPDATE google_review_agent_submission SET google_check = $2, google_checked_at = NOW(), google_note = $3,
            google_review_id = COALESCE($4, google_review_id) WHERE id = $1`,
    [id, check, note, review ? review.review_id : null]
  );
  return { id, check, note };
}

/** Re-checks every submission that is not confirmed yet: one Google read, then a match for each. */
async function checkAll() {
  await ensureSchema();
  const pending = await pool.query(
    `SELECT id FROM google_review_agent_submission WHERE COALESCE(google_check, 'pending') <> 'found' ORDER BY id DESC LIMIT 200`);
  if (!pending.rows.length) return { checked: 0, found: 0 };
  let scanNote = null;
  try {
    const out = await reviewScan.scan();
    if (out && out.ok === false && !out.skipped) scanNote = out.note;
  } catch (err) { scanNote = err.message; }
  const all = await loadScanned();
  let found = 0;
  for (const r of pending.rows) {
    const res = await crossCheck(r.id, { preloaded: all }).catch(() => null);
    if (res && res.check === 'found') found += 1;
  }
  return { checked: pending.rows.length, found, scan_note: scanNote };
}

async function submit(req) {
  await ensureSchema();
  const body = req.body || {};
  const labels = [];
  const agentName = pick(body, ['agent_name', 'agent', 'session_id', 'whatsapp_session']) || req.agentKey.label;
  const reviewerName = pick(body, ['reviewer_name', 'reviewer', 'who', 'name', 'added_by', 'review_by']);
  const mobileInput = pick(body, ['mobile', 'mobile_number', 'phone', 'whatsapp', 'customer_mobile']);
  const note = pick(body, ['note', 'remark', 'notes']);
  const mobile = reviewService.normalizeMobile(mobileInput);
  const chatMobileInput = pick(body, ['chat_mobile', 'chat_number', 'whatsapp_number', 'customer_whatsapp', 'replied_from']);
  const specialTngInput = pick(body, ['special_tng_mobile', 'special_tng', 'tng_mobile', 'tng_number', 'special_request_mobile']);
  const specialTng = reviewService.normalizeMobile(specialTngInput);
  if (specialTngInput && !specialTng) labels.push('special TNG mobile is not a valid Malaysian mobile, so the normal mobile is used');
  const tngMobile = specialTng || mobile;
  if (specialTng && specialTng !== mobile) labels.push(`special request: the RM15 reload goes to ${specialTng}, not the mobile`);

  if (!reviewerName) labels.push('no reviewer name given');
  if (!mobileInput) labels.push('no mobile number given');
  else if (!mobile) labels.push('mobile number is not a valid Malaysian mobile');

  // Proof image: an uploaded file, else a link the agent already has.
  let proofUrl = null;
  let proofMime = null;
  const file = PROOF_FIELDS.map((n) => req.files && req.files[n] && req.files[n][0]).find(Boolean);
  if (file) {
    try {
      proofMime = file.mimetype || 'image/jpeg';
      const ext = EXT_BY_MIME[proofMime] || path.extname(file.originalname || '') || '.jpg';
      proofUrl = await r2Storage.uploadBuffer(file.buffer, `google_review_uploads/${Date.now()}-${crypto.randomUUID()}${ext}`, proofMime);
    } catch (err) {
      console.error('[AgentApi] proof upload failed:', err.message);
      labels.push('proof image upload failed');
      proofUrl = null;
    }
  } else {
    // The screenshot can also be a link: in the proof/photo/image/screenshot field itself (text instead of a file),
    // or in proof_url / image_url / screenshot_url. The link is kept exactly as sent.
    const given = pick(body, [...PROOF_FIELDS, 'proof_url', 'image_url', 'screenshot_url', 'url']);
    if (given) {
      if (/^https?:\/\/\S+$/i.test(given)) {
        proofUrl = given;
        proofMime = pick(body, ['proof_mime']) || null;
      } else {
        labels.push('the proof was sent as text but it is not a web link (http or https)');
      }
    }
  }
  if (req.uploadProblem) labels.push(req.uploadProblem);
  if (!proofUrl && !labels.some((l) => /proof/.test(l))) labels.push('no proof image');

  // Which customer we messaged is this? Try the chat number, the mobile and any number written in the note.
  const candidates = candidateNumbers({ chatMobileInput, mobile, note });
  const { matched, via } = await findCustomer(candidates);
  if (!matched) labels.push('no customer we messaged has any of the numbers given (chat number, mobile or note)');
  else if (via !== mobile) labels.push(`customer found by the number 0${String(via).slice(1)}, not by the mobile`);

  // Is there a Google review under this name?
  const scanned = reviewerName ? await findScannedReview(reviewerName) : null;
  if (reviewerName) {
    labels.push(scanned
      ? `matches a Google review by "${scanned.reviewer_name}" posted ${dateOf(scanned.posted_at)}`
      : 'not seen on Google yet: it is being checked now and the result shows on the submissions page');
  }

  const dup = mobile ? await pool.query('SELECT id FROM google_review_agent_submission WHERE mobile = $1 ORDER BY id LIMIT 1', [mobile]) : { rows: [] };
  if (dup.rows[0]) labels.push(`this mobile was already submitted (submission #${dup.rows[0].id})`);

  let claimId = null;
  let status = 'Recorded';
  if (matched) {
    const made = await tryCreateClaim({ matched, mobile: tngMobile, proofUrl, proofMime, agentName, reviewerName, note, labels });
    claimId = made.claimId;
    status = made.status;
  }

  const ins = await pool.query(
    `INSERT INTO google_review_agent_submission
       (agent_name, key_label, reviewer_name, mobile_input, mobile, proof_url, proof_mime, note,
        matched_message_id, matched_customer, claim_id, google_review_id, status, labels, chat_mobile, special_tng_mobile)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, created_at`,
    [agentName, req.agentKey.label, reviewerName || null, mobileInput || null, mobile || null, proofUrl, proofMime, note || null,
      matched ? matched.id : null, matched ? matched.customer_name : null, claimId, scanned ? scanned.review_id : null, status, JSON.stringify(labels), chatMobileInput || null, specialTng || null]
  );
  // Read Google right after the reply goes out (the agent does not wait for it), then label the submission.
  setImmediate(() => { crossCheck(ins.rows[0].id, { fresh: true }).catch((err) => console.error('[AgentApi] cross-check failed:', err.message)); });
  console.log(`[AgentApi] submission #${ins.rows[0].id} from "${agentName}" mobile=${mobile || mobileInput || '-'} status=${status} labels=${labels.length}`);
  return {
    ok: true,
    submission_id: ins.rows[0].id,
    status,
    matched_customer: matched ? matched.customer_name : null,
    claim_id: claimId,
    proof_saved: Boolean(proofUrl),
    tng_reload_number: tngMobile || null,
    special_request: Boolean(specialTng && specialTng !== mobile),
    notes: labels
  };
}

function handler(req, res) {
  submit(req).then((out) => res.status(201).json(out)).catch((err) => {
    console.error('[AgentApi] submit failed:', err);
    res.status(500).json({ ok: false, error: 'The server could not record this submission. Please send it again.' });
  });
}

/** Latest submissions for the team page, with totals and the Google check of each. */
async function list(limit = 300) {
  await ensureSchema();
  try { await rematchCustomers(); } catch (err) { console.error('[AgentApi] customer re-match failed:', err.message); }
  // Cheap re-match against the reviews already read from Google (no scraper call): an hourly scan may have found it since.
  try {
    const open = await pool.query(`SELECT id FROM google_review_agent_submission WHERE COALESCE(google_check, 'pending') <> 'found' AND created_at > NOW() - interval '30 days' ORDER BY id DESC LIMIT 100`);
    if (open.rows.length) {
      const all = await loadScanned();
      for (const r of open.rows) await crossCheck(r.id, { preloaded: all }).catch(() => null);
    }
  } catch (err) { console.error('[AgentApi] re-match failed:', err.message); }
  const { rows } = await pool.query(
    `SELECT s.id, s.created_at, s.agent_name, s.reviewer_name, s.mobile_input, s.mobile, s.chat_mobile, s.special_tng_mobile, s.proof_url, s.proof_mime, s.note,
            s.matched_customer, s.claim_id, s.status, s.labels, s.google_check, s.google_checked_at, s.google_note,
            g.reviewer_name AS google_reviewer, g.posted_at AS google_posted_at, g.rating AS google_rating,
            g.review_link AS google_link, g.review_text AS google_text
       FROM google_review_agent_submission s
       LEFT JOIN google_review_scanned g ON g.review_id = s.google_review_id
      ORDER BY s.id DESC LIMIT $1`, [limit]);
  const totals = (await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE claim_id IS NOT NULL)::int AS with_claim,
            COUNT(*) FILTER (WHERE claim_id IS NULL)::int AS needs_check,
            COUNT(*) FILTER (WHERE google_check = 'found')::int AS found_on_google,
            COUNT(*) FILTER (WHERE created_at > NOW() - interval '24 hours')::int AS last_24h,
            MAX(created_at) AS last_at
       FROM google_review_agent_submission`)).rows[0];
  return { totals, submissions: rows };
}

const usage = {
  endpoint: 'POST /api/google-review/agent/verified-review',
  auth: 'none: no key or token is needed',
  content_type: 'multipart/form-data (image file or link) or application/json (link)',
  fields: {
    proof: 'the screenshot: either the image file, or a link (http/https URL) to the image. Send it in the field proof (photo, image or screenshot also work); proof_url also works for a link.',
    reviewer_name: 'who added the review: the name shown on the Google review',
    mobile: "the mobile number for the RM15 Touch 'n Go reload, e.g. 012-345 6789 or 60123456789 (the customer's chat number if they gave no other)",
    special_tng_mobile: "(optional) the Touch 'n Go number the customer asked the RM15 to be sent to, when they asked for a different one. If sent, the reload goes here; if not, it goes to mobile.",
    chat_mobile: "(optional but recommended) the WhatsApp number the customer chatted from, when it differs from mobile. This is how the customer we messaged is found.",
    agent_name: '(optional) which WhatsApp agent/session is sending this, e.g. marketing-292',
    note: '(optional) anything the agent wants to add'
  },
  result: 'Always 201 with { ok, submission_id, status, matched_customer, claim_id, proof_saved, tng_reload_number, special_request, notes[] }. Problems with the data are listed in notes and never cause the submission to be dropped.'
};

module.exports = { identify, parseUpload, handler, list, usage, ensureSchema, crossCheck, checkAll };
