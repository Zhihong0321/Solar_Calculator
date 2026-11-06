const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const service = require('./googleReviewService');
const r2Storage = require('../../core/upload/r2Storage');
const { writeActivity } = require('../../core/activityLog/writeActivity');

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif'
};

exports.uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (String(file.mimetype || '').startsWith('image/')) return cb(null, true);
    const err = new Error('Only image files are accepted');
    err.status = 400;
    return cb(err);
  }
}).single('photo');

/** Wraps the multer middleware so a bad/oversized file returns JSON instead of an HTML error page. */
exports.handleUpload = (req, res, next) => {
  exports.uploadPhoto(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is larger than 15MB' : err.message || 'Upload failed';
    return res.status(err.status || 400).json({ error: message });
  });
};

async function requireActor(req, res) {
  const actor = await service.resolveActor(req);
  if (!actor) {
    res.status(401).json({ error: 'Could not resolve the logged-in user' });
    return null;
  }
  return actor;
}

exports.requireReviewer = async (req, res, next) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return undefined;
    if (!actor.isReviewer) return res.status(403).json({ error: 'Google Review claims are restricted to HR/KC' });
    req.googleReviewActor = actor;
    return next();
  } catch (err) {
    console.error('[GoogleReview] reviewer check error:', err);
    return res.status(500).json({ error: 'Authorization error' });
  }
};

exports.me = async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    res.json({
      name: actor.name,
      isReviewer: actor.isReviewer,
      agentBonus: service.AGENT_BONUS,
      customerBonus: service.CUSTOMER_BONUS
    });
  } catch (err) {
    console.error('[GoogleReview] me error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
};

exports.searchCustomers = async (req, res) => {
  try {
    const groups = await service.searchApprovedCustomers(req.query.q);
    res.json({ groups });
  } catch (err) {
    console.error('[GoogleReview] searchCustomers error:', err);
    res.status(500).json({ error: 'Failed to load customers' });
  }
};

exports.createClaim = async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;

    const customerId = String(req.body.customer_id || '').trim();
    if (!customerId) return res.status(400).json({ error: 'Select a customer' });
    if (!req.file) return res.status(400).json({ error: 'Add a photo of the posted review' });

    const tngMobile = service.normalizeMobile(req.body.tng_mobile);
    if (!tngMobile) return res.status(400).json({ error: 'Enter a valid Malaysian mobile number (e.g. 012-345 6789)' });

    const customer = await service.getApprovedCustomer(customerId);
    if (!customer) return res.status(400).json({ error: 'This customer is not SEDA approved and fully paid' });

    const mime = req.file.mimetype || 'image/jpeg';
    const ext = EXT_BY_MIME[mime] || path.extname(req.file.originalname || '') || '.jpg';
    const key = `google_review_uploads/${Date.now()}-${crypto.randomUUID()}${ext}`;
    const photoUrl = await r2Storage.uploadBuffer(req.file.buffer, key, mime);

    let claim;
    try {
      claim = await service.createClaim({ customer, tngMobile, photoUrl, photoMime: mime, actor });
    } catch (err) {
      if (err.code === '23505') {
        if (r2Storage.isR2Url(photoUrl)) r2Storage.deleteObject(r2Storage.keyFromUrl(photoUrl));
        return res.status(409).json({ error: 'This customer already has a Google review claim' });
      }
      throw err;
    }

    res.status(201).json({ claim });

    writeActivity({
      req,
      app: 'google-review',
      action: 'create',
      entityType: 'google_review_claim',
      entityId: claim.id,
      entityLabel: claim.customer_name || null,
      description: `submitted a Google review claim for ${claim.customer_name || claim.customer_id}`
    });
  } catch (err) {
    console.error('[GoogleReview] createClaim error:', err);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
};

exports.listMine = async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const claims = await service.listMine(actor.userId);
    res.json({ claims });
  } catch (err) {
    console.error('[GoogleReview] listMine error:', err);
    res.status(500).json({ error: 'Failed to load your claims' });
  }
};

exports.listAll = async (req, res) => {
  try {
    const status = ['Pending', 'Approved', 'Rejected', 'Paid'].includes(req.query.status) ? req.query.status : null;
    const claims = await service.listAll(status);
    res.json({ claims });
  } catch (err) {
    console.error('[GoogleReview] listAll error:', err);
    res.status(500).json({ error: 'Failed to load claims' });
  }
};

exports.decide = async (req, res) => {
  try {
    const status = req.body.status;
    if (!['Approved', 'Rejected', 'Paid'].includes(status)) {
      return res.status(400).json({ error: 'status must be Approved, Rejected or Paid' });
    }
    const remark = typeof req.body.remark === 'string' ? req.body.remark.trim() : '';
    if (status === 'Rejected' && !remark) {
      return res.status(400).json({ error: 'A remark is required when rejecting a claim' });
    }

    const result = await service.decide(req.params.id, status, req.googleReviewActor, remark);
    if (result.error) return res.status(result.code).json({ error: result.error });
    res.json({ claim: result.claim });

    writeActivity({
      req,
      app: 'google-review',
      action: status.toLowerCase(),
      entityType: 'google_review_claim',
      entityId: result.claim.id,
      entityLabel: result.claim.customer_name || null,
      description: `marked Google review claim for ${result.claim.customer_name || result.claim.customer_id} as ${status}${remark ? ` — ${remark}` : ''}`,
      metadata: { status, remark: remark || null }
    });
  } catch (err) {
    console.error('[GoogleReview] decide error:', err);
    res.status(500).json({ error: 'Failed to update claim' });
  }
};
