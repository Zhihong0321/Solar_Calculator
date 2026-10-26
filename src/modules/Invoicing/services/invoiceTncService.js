/**
 * [AI-CONTEXT]
 * Domain: Invoicing Terms & Conditions Versions (render side)
 * Primary Responsibility: Decide which TNC version a quotation/invoice shows and apply its text and
 *   payment schedule to the invoice before HTML generation.
 * Rules: a signed document shows the version it is pinned to (invoice.tnc_version_id); an unsigned
 *   one has no pin and always shows the current version. `previewCurrent` lets staff view a pinned
 *   document with the current version, without changing the pin.
 * Stability: invoice.tnc_versions is loaded by invoiceRepo.getInvoiceByBubbleId. When it is absent
 *   (migration not applied yet) the legacy date-gated policies run instead, so output is unchanged.
 */
const {
  applyPaymentTermsPolicyToInvoice,
  getPaymentTermsSchedule
} = require('./invoicePaymentTermsPolicy');
const { applyWarrantyTermsPolicyToInvoice } = require('./invoiceWarrantyTermsPolicy');

const PREVIEW_QUERY_VALUE = 'current';

function normalizeScheduleRows(rows) {
  let list = rows;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (_) {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];

  return list
    .map((row) => ({
      percent: String(row?.percent ?? '').trim(),
      title: String(row?.title ?? '').trim(),
      description: String(row?.description ?? '').trim()
    }))
    .filter((row) => row.percent || row.title || row.description);
}

function applyLegacyTermsPolicies(invoice, previewCurrent) {
  const policyInvoice = applyWarrantyTermsPolicyToInvoice(
    applyPaymentTermsPolicyToInvoice(invoice, { forceCurrentTerms: previewCurrent })
  );
  return {
    ...policyInvoice,
    payment_terms_schedule: getPaymentTermsSchedule(policyInvoice)
  };
}

function applyInvoiceTnc(invoice, { previewCurrent = false } = {}) {
  if (!invoice || typeof invoice !== 'object') return invoice;

  const versions = invoice.tnc_versions;
  if (!versions || !versions.current) {
    return applyLegacyTermsPolicies(invoice, previewCurrent);
  }

  const { pinned, current } = versions;
  const pinnedDiffers = Boolean(pinned && pinned.id !== current.id);
  const preview = Boolean(previewCurrent && pinnedDiffers);
  const effective = preview ? current : (pinned || current);

  return {
    ...invoice,
    template: {
      ...(invoice.template || {}),
      terms_and_conditions: effective.terms_and_conditions || ''
    },
    tnc_effective_version_id: effective.id,
    payment_terms_schedule: {
      effectiveLabel: preview ? 'Current terms preview' : (effective.schedule_label || ''),
      canPreviewCurrentTerms: pinnedDiffers && !preview,
      isAfterEffectivePreview: preview,
      previewButtonLabel: 'Preview Current Terms',
      backButtonLabel: 'Back to Signed Terms',
      rows: normalizeScheduleRows(effective.payment_schedule)
    }
  };
}

/** Schedule for the payment card. Falls back to the legacy date policy for un-resolved invoices. */
function getInvoicePaymentSchedule(invoice = {}) {
  return invoice.payment_terms_schedule || getPaymentTermsSchedule(invoice);
}

/** Validate and normalise admin input for a draft version. Returns { data } or { error }. */
function normalizeTncVersionInput(body = {}) {
  const label = String(body.label || '').trim();
  const terms = String(body.terms_and_conditions || '').replace(/\r\n/g, '\n').trim();
  const paymentSchedule = normalizeScheduleRows(body.payment_schedule);

  if (!label) return { error: 'Label is required.' };
  if (label.length > 200) return { error: 'Label must be 200 characters or fewer.' };
  if (!terms) return { error: 'Terms & conditions text is required.' };
  if (paymentSchedule.length === 0) return { error: 'At least one payment schedule row is required.' };

  return {
    data: {
      label,
      terms_and_conditions: terms,
      payment_schedule: paymentSchedule,
      schedule_label: String(body.schedule_label || '').trim() || null,
      notes: String(body.notes || '').trim() || null
    }
  };
}

module.exports = {
  PREVIEW_QUERY_VALUE,
  applyInvoiceTnc,
  getInvoicePaymentSchedule,
  normalizeScheduleRows,
  normalizeTncVersionInput
};
