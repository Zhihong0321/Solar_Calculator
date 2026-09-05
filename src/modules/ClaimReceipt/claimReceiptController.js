const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const claimReceiptService = require('./claimReceiptService');
const ocrService = require('./ocrService');
const r2Storage = require('../../core/upload/r2Storage');
const { resolveSubmitterIdentity, resolveIdentityByUserId, listSubmittableUsers } = require('./resolveSubmitterIdentity');
const { isReviewer } = require('./reviewerAccess');
const { writeActivity } = require('../../core/activityLog/writeActivity');
const { getRequestLegacyUserId } = require('../../core/auth/userIdentity');

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf'
};

// Memory storage, not disk: the buffer is needed both for the vision call and the R2 upload,
// and receipts are small (a few MB), so there's no reason to round-trip through local disk.
exports.uploadReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
}).single('file');

/** Runs OCR on an uploaded receipt, stores the original to R2, returns the draft + md5 + file URL. */
exports.ocr = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing file upload' });
    }

    const bytes = req.file.buffer;
    const mimeType = req.file.mimetype || 'application/octet-stream';
    const md5 = crypto.createHash('md5').update(bytes).digest('hex');

    let fileUrl = null;
    try {
      const ext = EXT_BY_MIME[mimeType] || path.extname(req.file.originalname) || '';
      const key = `claim_receipt_uploads/${Date.now()}-${crypto.randomUUID()}${ext}`;
      fileUrl = await r2Storage.uploadBuffer(bytes, key, mimeType);
    } catch (uploadErr) {
      // Storage is best-effort for this prototype module — OCR still proceeds without it,
      // the claim just ends up with no evidence file attached.
      console.error('[ClaimReceipt] R2 upload failed:', uploadErr.message);
    }

    const { draft, status, model } = await ocrService.readReceipt({ bytes, mimeType, req });

    res.json({ draft, status, model, md5, file_url: fileUrl, file_mime: mimeType });
  } catch (err) {
    console.error('[ClaimReceipt] OCR error:', err);
    res.status(err.status || 500).json({ error: err.message || 'OCR failed' });
  }
};

exports.list = async (req, res) => {
  try {
    const claims = await claimReceiptService.list();
    res.json({ claims });
  } catch (err) {
    console.error('[ClaimReceipt] List error:', err);
    res.status(500).json({ error: 'Failed to load claims' });
  }
};

/**
 * Called automatically the moment OCR finishes on the client — there is no manual "submit" step.
 * submitted_by is never taken from the request body as free text: either it's the authenticated
 * session's own identity, or — if the session is an admin/HR reviewer and passed
 * on_behalf_of_user_id — a specific other user's identity looked up server-side by id. Either way
 * a claim can never be attributed to an arbitrary name a non-reviewer typed in.
 */
exports.create = async (req, res) => {
  try {
    const parsed = claimReceiptService.parseClaimFields(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    // Receipt claims always arrive from the OCR pipeline with a real file md5. A manual
    // Business Trip Allowance claim has no file/OCR, so it can't have one — synthesize a
    // nonce'd md5 from the submitted fields so the existing integrity field stays populated
    // without loosening the requirement for receipt claims.
    let md5 = req.body.md5;
    if (!md5) {
      if (parsed.fields.category === 'Business Trip Allowance') {
        md5 = crypto
          .createHash('md5')
          .update(JSON.stringify(Object.assign({}, req.body, { _nonce: crypto.randomUUID() })))
          .digest('hex');
      } else {
        return res.status(400).json({ error: 'md5 is required' });
      }
    }

    const actorIdentity = await resolveSubmitterIdentity(req);
    if (!actorIdentity) return res.status(401).json({ error: 'Could not resolve the authenticated user' });

    let identity = actorIdentity;
    let onBehalfOfName = null;

    if (req.body.on_behalf_of_user_id) {
      if (!(await isReviewer(req))) {
        return res.status(403).json({ error: 'Only admin/HR can submit a claim on behalf of another user' });
      }
      const target = await resolveIdentityByUserId(req.body.on_behalf_of_user_id);
      if (!target) return res.status(400).json({ error: 'Selected user not found' });
      identity = target;
      onBehalfOfName = target.name;
    }

    const claim = await claimReceiptService.create({
      md5,
      submittedBy: identity.name,
      submittedByUserId: identity.userId,
      submittedByEmail: identity.email,
      fileUrl: req.body.file_url || null,
      fileMime: req.body.file_mime || null,
      fields: parsed.fields
    });
    res.status(201).json({ claim });

    writeActivity({
      req,
      app: 'claim-system',
      action: 'create',
      entityType: 'claim_receipt',
      entityId: claim?.id,
      entityLabel: claim?.vendor || null,
      description: onBehalfOfName
        ? `submitted a claim receipt on behalf of ${onBehalfOfName}${claim?.amount ? ` (RM${claim.amount})` : ''}`
        : `submitted a claim receipt${claim?.amount ? ` (RM${claim.amount})` : ''}`
    });
  } catch (err) {
    console.error('[ClaimReceipt] Create error:', err);
    res.status(500).json({ error: 'Failed to save claim' });
  }
};

/** Roster for the admin/HR "submit as" picker, plus which row is the requester's own. */
exports.listSubmittableUsers = async (req, res) => {
  try {
    const users = await listSubmittableUsers();
    const selfId = getRequestLegacyUserId(req);
    res.json({ users, selfId: selfId ? String(selfId) : null });
  } catch (err) {
    console.error('[ClaimReceipt] listSubmittableUsers error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
};

exports.update = async (req, res) => {
  try {
    const parsed = claimReceiptService.parseClaimFields(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const claim = await claimReceiptService.update(req.params.id, parsed.fields);
    if (!claim) return res.status(404).json({ error: 'claim not found' });
    res.json({ claim });

    writeActivity({
      req,
      app: 'claim-system',
      action: 'update',
      entityType: 'claim_receipt',
      entityId: claim?.id,
      entityLabel: claim?.vendor || null,
      description: `updated claim receipt${claim?.vendor ? ` for ${claim.vendor}` : ''}${claim?.amount ? ` (RM${claim.amount})` : ''}`,
      fields: Object.keys(parsed.fields)
    });
  } catch (err) {
    console.error('[ClaimReceipt] Update error:', err);
    res.status(500).json({ error: 'Failed to update claim' });
  }
};

/** Reviewer approve/reject. approved_by is resolved server-side, same reasoning as create(). */
exports.decide = async (req, res) => {
  try {
    if (req.body.status !== 'Approved' && req.body.status !== 'Rejected') {
      return res.status(400).json({ error: 'status must be Approved or Rejected' });
    }

    const remark = typeof req.body.remark === 'string' ? req.body.remark.trim() : '';
    if (req.body.status === 'Rejected' && !remark) {
      return res.status(400).json({ error: 'A remark is required when rejecting a claim' });
    }

    const identity = await resolveSubmitterIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Could not resolve the authenticated user' });

    const claim = await claimReceiptService.decide(req.params.id, req.body.status, identity, remark || null);
    if (!claim) return res.status(404).json({ error: 'claim not found' });
    res.json({ claim });

    writeActivity({
      req,
      app: 'claim-system',
      action: req.body.status === 'Approved' ? 'approve' : 'reject',
      entityType: 'claim_receipt',
      entityId: claim?.id,
      entityLabel: claim?.vendor || null,
      description: `${req.body.status === 'Approved' ? 'approved' : 'rejected'} claim receipt${claim?.vendor ? ` from ${claim.vendor}` : ''}${claim?.amount ? ` (RM${claim.amount})` : ''}${remark ? ` — ${remark}` : ''}`,
      metadata: { status: req.body.status, remark: remark || null }
    });
  } catch (err) {
    console.error('[ClaimReceipt] Decide error:', err);
    res.status(500).json({ error: 'Failed to update claim status' });
  }
};

exports.remove = async (req, res) => {
  try {
    const claim = await claimReceiptService.getById(req.params.id);
    const ok = await claimReceiptService.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'claim not found' });

    if (claim?.file_url && r2Storage.isR2Url(claim.file_url)) {
      r2Storage.deleteObject(r2Storage.keyFromUrl(claim.file_url));
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[ClaimReceipt] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete claim' });
  }
};

/** Get claims for the authenticated agent */
exports.getMyClaims = async (req, res) => {
  try {
    const identity = await resolveSubmitterIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Could not resolve the authenticated user' });

    const claims = await claimReceiptService.getByUserId(identity.userId);
    res.json({ claims });
  } catch (err) {
    console.error('[ClaimReceipt] getMyClaims error:', err);
    res.status(500).json({ error: 'Failed to load your claims' });
  }
};
