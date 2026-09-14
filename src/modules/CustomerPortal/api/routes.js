const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const pool = require('../../../core/database/pool');
const sedaRepo = require('../../Invoicing/services/sedaRepo');
const { ensureSedaRegistrationForQuotationView } = require('../../Invoicing/api/invoiceViewRoutes');
const { getPaymentTermsSchedule } = require('../../Invoicing/services/invoicePaymentTermsPolicy');
const { writeInvoiceAuditEntry } = require('../../Invoicing/services/auditWriter');
const { storageDriver } = require('../../../core/upload');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const SEDA_SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Public, unauthenticated portal for a customer to look up their own records
 * by Customer ID. Deliberately as low-friction as the existing invoice/SEDA
 * share_token model (see .agents/decisions.md) — knowing the Customer ID is
 * the only credential required, matching the accepted risk profile already
 * in place for /view/:tokenOrId and /seda-public/:shareToken.
 */

function normalizeCustomerId(raw) {
  return String(raw || '').trim();
}

/**
 * `customer.customer_id` is usually `cust_<8 hex>` (see customerRepo.js), but
 * older rows synced from Bubble keep their original Bubble-style unique id
 * (e.g. "1734424530592x979356283099938800") — a different shape entirely.
 * Try the input verbatim first so legacy IDs still resolve, and only fall
 * back to prefixing "cust_" for the common case of someone pasting just the
 * hex suffix of a newer ID.
 */
async function findCustomerByAnyIdShape(client, rawId) {
  const exact = await client.query(
    `SELECT customer_id, name, phone, email, address, city, state, postcode
     FROM customer WHERE customer_id = $1 LIMIT 1`,
    [rawId]
  );
  if (exact.rows[0]) return exact.rows[0];

  if (!rawId.startsWith('cust_')) {
    const prefixed = await client.query(
      `SELECT customer_id, name, phone, email, address, city, state, postcode
       FROM customer WHERE customer_id = $1 LIMIT 1`,
      [`cust_${rawId}`]
    );
    if (prefixed.rows[0]) return prefixed.rows[0];
  }

  return null;
}

async function ensureFreshSedaShareToken(client, seda) {
  if (!seda) return null;

  const expired = Boolean(seda.share_expires_at) && new Date(seda.share_expires_at).getTime() <= Date.now();
  if (seda.share_token && seda.share_enabled && !expired) {
    return seda.share_token;
  }

  const token = sedaRepo.generateShareToken();
  const expiresAt = new Date(Date.now() + SEDA_SHARE_LIFETIME_MS);
  await client.query(
    `UPDATE seda_registration
     SET share_token = $1, share_enabled = true, share_expires_at = $2, updated_at = NOW()
     WHERE bubble_id = $3`,
    [token, expiresAt, seda.bubble_id]
  );
  return token;
}

function maskPhone(phone) {
  const digits = String(phone || '');
  if (digits.length <= 5) return digits;
  const head = digits.slice(0, 3);
  const tail = digits.slice(-2);
  return `${head}${'•'.repeat(Math.max(digits.length - 5, 3))}${tail}`;
}

// Verified paid amount must come only from `payment` rows, never
// invoice.paid_amount (see .agents/decisions.md, 2026-04-23).
async function getVerifiedPaidAmount(client, invoiceBubbleId, linkedPaymentIds) {
  const res = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid_amount
     FROM payment
     WHERE linked_invoice = $1 OR bubble_id = ANY($2::text[])`,
    [invoiceBubbleId, linkedPaymentIds || []]
  );
  return Number(res.rows[0]?.paid_amount || 0);
}

const SEARCH_RESULT_LIMIT = 20;
const SEARCH_INVOICE_PREVIEW_LIMIT = 5;

// Same-name duplicates are common, so the search list needs enough per-match
// context (quotation + amounts) for a customer to recognize their own record
// without ever showing another customer's full contact details.
async function getInvoicePreviewsForCustomer(client, customerId) {
  const result = await client.query(
    `SELECT bubble_id, invoice_number, total_amount, linked_payment
     FROM invoice
     WHERE linked_customer = $1
       AND COALESCE(is_latest, true) = true
       AND COALESCE(is_deleted, false) = false
       AND (status IS NULL OR status <> 'deleted')
     ORDER BY invoice_date DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT $2`,
    [customerId, SEARCH_INVOICE_PREVIEW_LIMIT + 1]
  );

  const rows = result.rows.slice(0, SEARCH_INVOICE_PREVIEW_LIMIT);
  const invoices = [];
  for (const row of rows) {
    const totalAmount = Number(row.total_amount || 0);
    const paidAmount = await getVerifiedPaidAmount(client, row.bubble_id, row.linked_payment);
    invoices.push({
      invoice_number: row.invoice_number,
      total_amount: totalAmount,
      paid_amount: paidAmount
    });
  }

  return { invoices, moreCount: Math.max(result.rows.length - SEARCH_INVOICE_PREVIEW_LIMIT, 0) };
}

// Registered before the /:customerId route below so Express doesn't treat
// "search" as a customer_id. Returns phone-masked matches only — enough for
// a customer to recognize their own record in a list, not enough for
// someone scanning common names to harvest full contact details. Quotation
// numbers/amounts are included (not masked) since they're needed to tell
// same-name customers apart and aren't sensitive on their own.
router.get('/api/v1/customer-portal/search', async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (name.length < 2) {
    return res.status(400).json({ success: false, error: 'Please enter at least 2 characters.' });
  }

  try {
    const result = await pool.query(
      `SELECT customer_id, name, phone
       FROM customer
       WHERE name ILIKE $1
       ORDER BY name
       LIMIT $2`,
      [`%${name}%`, SEARCH_RESULT_LIMIT]
    );

    const matches = [];
    for (const row of result.rows) {
      const { invoices, moreCount } = await getInvoicePreviewsForCustomer(pool, row.customer_id);
      matches.push({
        customer_id: row.customer_id,
        name: row.name,
        phone_masked: maskPhone(row.phone),
        invoices,
        more_invoices: moreCount
      });
    }

    res.json({ success: true, matches, truncated: result.rows.length === SEARCH_RESULT_LIMIT });
  } catch (err) {
    console.error('[CustomerPortal] Name search failed:', err);
    res.status(500).json({ success: false, error: 'Search failed. Please try again.' });
  }
});

router.get('/api/v1/customer-portal/:customerId', async (req, res) => {
  const customerId = normalizeCustomerId(req.params.customerId);
  if (!customerId) {
    return res.status(400).json({ success: false, error: 'Customer ID is required.' });
  }

  const baseUrl = (process.env.SOLAR_APP_BASE_URL || 'https://calculator.atap.solar').replace(/\/+$/, '');

  const client = await pool.connect();
  try {
    const customer = await findCustomerByAnyIdShape(client, customerId);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    const invoicesResult = await client.query(
      `SELECT i.bubble_id, i.invoice_number, i.invoice_date, i.status, i.total_amount,
              i.linked_payment, i.share_token, i.linked_seda_registration, i.linked_customer,
              i.created_by, i.linked_agent, i.linked_package,
              i.customer_signature, i.signature_date,
              p.package_name AS package_name, p.type AS package_category
       FROM invoice i
       LEFT JOIN package p ON p.bubble_id = i.linked_package
       WHERE i.linked_customer = $1
         AND COALESCE(i.is_latest, true) = true
         AND COALESCE(i.is_deleted, false) = false
         AND (i.status IS NULL OR i.status <> 'deleted')
       ORDER BY i.invoice_date DESC NULLS LAST, i.created_at DESC NULLS LAST`,
      [customer.customer_id]
    );

    const invoices = [];
    for (const invoice of invoicesResult.rows) {
      const paidAmount = await getVerifiedPaidAmount(client, invoice.bubble_id, invoice.linked_payment);
      const totalAmount = Number(invoice.total_amount || 0);

      // Guarantee a SEDA registration (and a live share token) exists for
      // every invoice shown here, mirroring the auto-provisioning that
      // already runs when a customer opens the public quotation view.
      const ensured = await ensureSedaRegistrationForQuotationView(
        client,
        { ...invoice },
        invoice.created_by || invoice.linked_agent
      );

      let seda = null;
      if (ensured.linked_seda_registration) {
        const sedaRes = await client.query(
          `SELECT bubble_id, share_token, share_enabled, share_expires_at,
                  mapper_status AS reg_status, seda_status
           FROM seda_registration
           WHERE bubble_id = $1
           LIMIT 1`,
          [ensured.linked_seda_registration]
        );
        const sedaRow = sedaRes.rows[0];
        if (sedaRow) {
          const shareToken = await ensureFreshSedaShareToken(client, sedaRow);
          seda = {
            share_token: shareToken,
            reg_status: sedaRow.reg_status,
            seda_status: sedaRow.seda_status
          };
        }
      }

      const pendingRes = await client.query(
        `SELECT bubble_id, amount, payment_date, payment_method, remark, created_at
         FROM submitted_payment
         WHERE linked_invoice = $1 AND status = 'pending'
         ORDER BY created_at DESC`,
        [invoice.bubble_id]
      );
      const pendingPayments = pendingRes.rows.map((row) => ({
        bubble_id: row.bubble_id,
        amount: Number(row.amount || 0),
        payment_date: row.payment_date,
        payment_method: row.payment_method,
        remark: row.remark,
        submitted_at: row.created_at
      }));

      const quotationToken = invoice.share_token || invoice.bubble_id;
      invoices.push({
        bubble_id: invoice.bubble_id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        status: invoice.status,
        package_name: invoice.package_name,
        package_category: invoice.package_category,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        balance_due: Math.max(totalAmount - paidAmount, 0),
        is_signed: Boolean(invoice.customer_signature),
        signature_date: invoice.signature_date,
        payment_schedule: getPaymentTermsSchedule(invoice).rows,
        pending_payments: pendingPayments,
        quotation_url: `${baseUrl}/view/${quotationToken}`,
        printable_url: `${baseUrl}/view/${quotationToken}?layout=a4`,
        seda
      });
    }

    res.json({ success: true, customer, invoices });
  } catch (err) {
    console.error('[CustomerPortal] Failed to load customer portal:', err);
    res.status(500).json({ success: false, error: 'Failed to load customer data.' });
  } finally {
    client.release();
  }
});

const PAYMENT_PROOF_MIME_EXT = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif'
};

// Public payment submission — the existing POST /api/v1/invoices/:bubbleId/payment
// (paymentRoutes.js) requires a staff `requireAuth` cookie, so it can't be reused
// here. This writes to the same `submitted_payment` table (status: 'pending')
// using the same shape/attachment pipeline, distinguished by created_by so
// Finance can tell a customer-submitted payment apart from a staff one. There
// is no verify/approve endpoint anywhere in this codebase (see research notes
// in the PR/commit history) — a submitted payment only becomes "paid" once
// Finance creates a row in `payment` through whatever external process they
// already use today; this endpoint does not change that.
router.post('/api/v1/customer-portal/invoice/:bubbleId/submit-payment', upload.single('proof'), async (req, res) => {
  const { bubbleId } = req.params;
  const { amount, payment_date: paymentDate, payment_method: paymentMethod, reference_no: referenceNo, remark: customerRemark } = req.body;

  const finalAmount = parseFloat(amount);
  if (!finalAmount || finalAmount <= 0) {
    return res.status(400).json({ success: false, error: 'A valid payment amount is required.' });
  }
  if (!paymentDate) {
    return res.status(400).json({ success: false, error: 'Payment date is required.' });
  }

  const client = await pool.connect();
  try {
    const invoiceRes = await client.query(
      `SELECT bubble_id, linked_customer, linked_agent
       FROM invoice
       WHERE bubble_id = $1 OR share_token = $1
       LIMIT 1`,
      [bubbleId]
    );
    const invoice = invoiceRes.rows[0];
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found.' });
    }

    let attachmentUrl = null;
    if (req.file) {
      const mimeType = (req.file.mimetype || '').toLowerCase();
      if (!PAYMENT_PROOF_MIME_EXT[mimeType]) {
        return res.status(400).json({ success: false, error: `Unsupported file type: ${mimeType || 'unknown'}. Please upload a PDF or image.` });
      }
      const filename = `payment_${invoice.bubble_id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${PAYMENT_PROOF_MIME_EXT[mimeType]}`;
      const stored = await storageDriver.put(req.file.buffer, {
        subdir: 'uploaded_payment',
        filename,
        mimeType,
        req
      });
      attachmentUrl = stored.url;
    }

    const remark = `${customerRemark || ''} [Ref: ${referenceNo || 'N/A'}]`.trim();
    const newPaymentBubbleId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const standardMethod = (paymentMethod || 'Bank Transfer').slice(0, 100);

    await client.query(
      `INSERT INTO submitted_payment (
          bubble_id, amount, payment_date, attachment, remark,
          linked_invoice, created_by, status, payment_method,
          payment_method_v2, linked_agent, linked_customer,
          created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
      [
        newPaymentBubbleId,
        finalAmount,
        paymentDate,
        attachmentUrl ? [attachmentUrl] : [],
        remark,
        invoice.bubble_id,
        `customer-portal:${invoice.linked_customer || 'unknown'}`,
        'pending',
        standardMethod,
        standardMethod,
        invoice.linked_agent || null,
        invoice.linked_customer || null
      ]
    );

    await writeInvoiceAuditEntry(client, {
      invoiceBubbleId: invoice.bubble_id,
      entityType: 'submitted_payment',
      actionType: 'insert',
      entityId: newPaymentBubbleId,
      changes: [
        { field: 'Amount', after: finalAmount },
        { field: 'Method', after: standardMethod },
        { field: 'Date', after: paymentDate },
        { field: 'Status', after: 'pending' }
      ],
      actorRole: 'customer',
      sourceApp: 'customer-portal'
    });

    res.json({
      success: true,
      payment: { bubble_id: newPaymentBubbleId, amount: finalAmount, payment_date: paymentDate, status: 'pending' }
    });
  } catch (err) {
    console.error('[CustomerPortal] Payment submission failed:', err);
    res.status(500).json({ success: false, error: 'Failed to submit payment. Please try again.' });
  } finally {
    client.release();
  }
});

module.exports = router;
