const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const claimReceiptService = require('./claimReceiptService');
const ocrService = require('./ocrService');
const r2Storage = require('../../core/upload/r2Storage');

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf'
};

// Memory storage, not disk: the buffer is needed both for the Mimo call and the R2 upload,
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

    const { draft, status, model } = await ocrService.readReceipt({ bytes, mimeType });

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

/** Called automatically the moment OCR finishes on the client — there is no manual "submit" step. */
exports.create = async (req, res) => {
  try {
    const parsed = claimReceiptService.parseClaimFields(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    if (!req.body.md5) return res.status(400).json({ error: 'md5 is required' });
    const submittedBy = typeof req.body.submitted_by === 'string' && req.body.submitted_by.trim() ? req.body.submitted_by.trim() : null;
    if (!submittedBy) return res.status(400).json({ error: 'submitted_by is required' });

    const claim = await claimReceiptService.create({
      md5: req.body.md5,
      submittedBy,
      fileUrl: req.body.file_url || null,
      fileMime: req.body.file_mime || null,
      fields: parsed.fields
    });
    res.status(201).json({ claim });
  } catch (err) {
    console.error('[ClaimReceipt] Create error:', err);
    res.status(500).json({ error: 'Failed to save claim' });
  }
};

exports.update = async (req, res) => {
  try {
    const parsed = claimReceiptService.parseClaimFields(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const claim = await claimReceiptService.update(req.params.id, parsed.fields);
    if (!claim) return res.status(404).json({ error: 'claim not found' });
    res.json({ claim });
  } catch (err) {
    console.error('[ClaimReceipt] Update error:', err);
    res.status(500).json({ error: 'Failed to update claim' });
  }
};

/** Reviewer approve/reject. */
exports.decide = async (req, res) => {
  try {
    if (req.body.status !== 'Approved' && req.body.status !== 'Rejected') {
      return res.status(400).json({ error: 'status must be Approved or Rejected' });
    }
    const approvedBy = typeof req.body.approved_by === 'string' && req.body.approved_by.trim() ? req.body.approved_by.trim() : null;
    if (!approvedBy) return res.status(400).json({ error: 'approved_by is required' });

    const claim = await claimReceiptService.decide(req.params.id, req.body.status, approvedBy);
    if (!claim) return res.status(404).json({ error: 'claim not found' });
    res.json({ claim });
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
