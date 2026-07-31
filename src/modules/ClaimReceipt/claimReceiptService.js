const pool = require('../../core/database/pool');
const { BUYER_NAME, BUYER_PATTERN } = require('./ocrService');

/**
 * Shared between create (auto-submit right after OCR) and update (the claimant fixing fields
 * afterward). A freshly auto-submitted claim is often incomplete — amount/category may still be
 * null until the claimant fills them in via Update — so only the buyer-guard and amount's
 * *shape* (a positive number when present at all) are enforced; completeness isn't.
 */
function parseClaimFields(body) {
  const vendor = typeof body.vendor === 'string' ? body.vendor.trim() : '';
  if (BUYER_PATTERN.test(vendor)) {
    return { ok: false, error: `${BUYER_NAME} is the buyer on every claim — it can't also be the vendor.` };
  }

  let amount = null;
  if (body.amount !== null && body.amount !== undefined && body.amount !== '') {
    const parsed = Number(body.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, error: 'amount must be a positive number' };
    }
    amount = parsed;
  }

  return {
    ok: true,
    fields: {
      vendor: vendor || null,
      item: typeof body.item === 'string' && body.item ? body.item : null,
      description: typeof body.description === 'string' && body.description ? body.description : null,
      receipt_date: typeof body.receipt_date === 'string' && body.receipt_date ? body.receipt_date : null,
      receipt_id: typeof body.receipt_id === 'string' && body.receipt_id ? body.receipt_id : null,
      amount,
      currency: typeof body.currency === 'string' && body.currency ? body.currency : 'MYR',
      category: typeof body.category === 'string' && body.category ? body.category : null
    }
  };
}

class ClaimReceiptService {
  async list() {
    const result = await pool.query('SELECT * FROM claim_receipt ORDER BY created_at DESC');
    return result.rows;
  }

  /** Called automatically the moment OCR finishes — there is no manual "submit" step. */
  async create({ md5, submittedBy, submittedByUserId, submittedByEmail, fileUrl, fileMime, fields }) {
    const result = await pool.query(
      `INSERT INTO claim_receipt
         (md5, buyer, vendor, item, description, receipt_date, receipt_id, amount, currency, category,
          submitted_by, submitted_by_user_id, submitted_by_email, file_url, file_mime)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        md5,
        BUYER_NAME,
        fields.vendor,
        fields.item,
        fields.description,
        fields.receipt_date,
        fields.receipt_id,
        fields.amount,
        fields.currency,
        fields.category,
        submittedBy,
        submittedByUserId,
        submittedByEmail,
        fileUrl,
        fileMime
      ]
    );
    return result.rows[0];
  }

  /** The claimant editing their own claim — the only path to fixing/completing it post-auto-submit. */
  async update(id, fields) {
    const result = await pool.query(
      `UPDATE claim_receipt SET
         vendor = $1, item = $2, description = $3, receipt_date = $4, receipt_id = $5,
         amount = $6, currency = $7, category = $8, updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [fields.vendor, fields.item, fields.description, fields.receipt_date, fields.receipt_id, fields.amount, fields.currency, fields.category, id]
    );
    return result.rows[0] || null;
  }

  /** Reviewer approve/reject — distinct action from editing content. remark is optional (typically used on reject). */
  async decide(id, status, approverIdentity, remark) {
    const result = await pool.query(
      `UPDATE claim_receipt SET
         status = $1, approved_by = $2, approved_by_user_id = $3, approved_by_email = $4,
         approved_at = NOW(), updated_at = NOW(), remark = $5
       WHERE id = $6
       RETURNING *`,
      [status, approverIdentity.name, approverIdentity.userId, approverIdentity.email, remark, id]
    );
    return result.rows[0] || null;
  }

  async getById(id) {
    const result = await pool.query('SELECT * FROM claim_receipt WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM claim_receipt WHERE submitted_by_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async remove(id) {
    const result = await pool.query('DELETE FROM claim_receipt WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
}

module.exports = new ClaimReceiptService();
module.exports.parseClaimFields = parseClaimFields;
