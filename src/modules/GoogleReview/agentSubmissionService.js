const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const pool = require('../../core/database/pool');
const r2Storage = require('../../core/upload/r2Storage');
const reviewService = require('./googleReviewService');
const campaign = require('./campaignService');

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

// ----- name matching against the Google reviews we scanned -----
const normName = (s) => String(s || '').toLowerCase().replace(/\((atap|ecn|ec)\)|[^a-z一-鿿 ]/gi, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => normName(s).split(' ').filter((t) => t.length > 1);

async function findScannedReview(reviewerName) {
  const a = tokens(reviewerName);
  if (!a.length) return null;
  try {
    const { rows } = await pool.query(`SELECT review_id, reviewer_name, posted_at, rating FROM google_review_scanned ORDER BY posted_at DESC LIMIT 500`);
    return rows.find((r) => {
      if (normName(r.reviewer_name) === normName(reviewerName)) return true;
      const b = tokens(r.reviewer_name);
      const overlap = a.filter((t) => b.includes(t)).length;
      return overlap >= 2 || (a.length === 1 && b.length === 1 && overlap === 1);
    }) || null;
  } catch (err) {
    console.error('[AgentApi] scanned review lookup failed:', err.message);
    return null;
  }
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

  // Which customer we messaged does this mobile belong to?
  let matched = null;
  if (mobile) {
    const found = await pool.query(
      `SELECT id, customer_id, customer_name, status, claim_id FROM google_review_campaign_message
        WHERE is_test = FALSE AND phone = $1 ORDER BY id DESC LIMIT 1`, [`6${mobile}`]);
    matched = found.rows[0] || null;
  }
  if (mobile && !matched) labels.push('this mobile is not a customer we messaged');

  // Is there a Google review under this name?
  const scanned = reviewerName ? await findScannedReview(reviewerName) : null;
  if (reviewerName) {
    labels.push(scanned
      ? `matches a Google review by "${scanned.reviewer_name}" posted ${new Date(scanned.posted_at).toISOString().slice(0, 10)}`
      : 'no Google review with this name seen yet (the scan runs hourly)');
  }

  const dup = mobile ? await pool.query('SELECT id FROM google_review_agent_submission WHERE mobile = $1 ORDER BY id LIMIT 1', [mobile]) : { rows: [] };
  if (dup.rows[0]) labels.push(`this mobile was already submitted (submission #${dup.rows[0].id})`);

  // A matched customer without a claim yet gets a Pending claim for HR/KC to approve and pay.
  let claimId = null;
  let status = 'Recorded';
  if (matched && matched.claim_id) {
    claimId = matched.claim_id;
    labels.push(`customer already has claim #${matched.claim_id}`);
  } else if (matched) {
    try {
      const result = await campaign.verifyAndCreateClaim({
        messageId: matched.id,
        tngMobileInput: mobile,
        photoUrl: proofUrl,
        photoMime: proofMime,
        note: `via WhatsApp AI agent "${agentName}"${reviewerName ? `, Google reviewer name "${reviewerName}"` : ''}${note ? `: ${note}` : ''}`,
        actor: { userId: 'ai-agent', name: `AI agent (${agentName})` }
      });
      if (result.error) labels.push(`claim not created: ${result.error}`);
      else { claimId = result.claim.id; status = 'Claim created'; }
    } catch (err) {
      console.error('[AgentApi] claim creation failed:', err.message);
      labels.push('claim not created: server error (the submission is recorded)');
    }
  }

  const ins = await pool.query(
    `INSERT INTO google_review_agent_submission
       (agent_name, key_label, reviewer_name, mobile_input, mobile, proof_url, proof_mime, note,
        matched_message_id, matched_customer, claim_id, google_review_id, status, labels)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, created_at`,
    [agentName, req.agentKey.label, reviewerName || null, mobileInput || null, mobile || null, proofUrl, proofMime, note || null,
      matched ? matched.id : null, matched ? matched.customer_name : null, claimId, scanned ? scanned.review_id : null, status, JSON.stringify(labels)]
  );
  console.log(`[AgentApi] submission #${ins.rows[0].id} from "${agentName}" mobile=${mobile || mobileInput || '-'} status=${status} labels=${labels.length}`);
  return {
    ok: true,
    submission_id: ins.rows[0].id,
    status,
    matched_customer: matched ? matched.customer_name : null,
    claim_id: claimId,
    proof_saved: Boolean(proofUrl),
    notes: labels
  };
}

function handler(req, res) {
  submit(req).then((out) => res.status(201).json(out)).catch((err) => {
    console.error('[AgentApi] submit failed:', err);
    res.status(500).json({ ok: false, error: 'The server could not record this submission. Please send it again.' });
  });
}

/** Latest submissions for the team page. */
async function list(limit = 100) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT id, created_at, agent_name, reviewer_name, mobile, proof_url, matched_customer, claim_id, status, labels
       FROM google_review_agent_submission ORDER BY id DESC LIMIT $1`, [limit]);
  return { submissions: rows };
}

const usage = {
  endpoint: 'POST /api/google-review/agent/verified-review',
  auth: 'none: no key or token is needed',
  content_type: 'multipart/form-data (image file or link) or application/json (link)',
  fields: {
    proof: 'the screenshot: either the image file, or a link (http/https URL) to the image. Send it in the field proof (photo, image or screenshot also work); proof_url also works for a link.',
    reviewer_name: 'who added the review: the name shown on the Google review',
    mobile: "the customer's mobile number, e.g. 012-345 6789 or 60123456789",
    agent_name: '(optional) which WhatsApp agent/session is sending this, e.g. marketing-292',
    note: '(optional) anything the agent wants to add'
  },
  result: 'Always 201 with { ok, submission_id, status, matched_customer, claim_id, proof_saved, notes[] }. Problems with the data are listed in notes and never cause the submission to be dropped.'
};

module.exports = { identify, parseUpload, handler, list, usage, ensureSchema };
