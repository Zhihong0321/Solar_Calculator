/**
 * [AI-CONTEXT]
 * Domain: Invoicing Refund Terms Policy
 * Primary Responsibility: Rewrite the "5% + N% Refund (After SEDA Application)" paragraph of
 *   invoice_template.terms_and_conditions at render time, so the refund after SEDA approval is
 *   "amount paid minus RM1500" instead of the itemised deductions.
 * Stability: Mirrors invoiceWarrantyTermsPolicy.js on purpose. The stored DB copy is never mutated.
 *   Unsigned quotations always carry the new wording; signed documents keep the exact wording the
 *   customer agreed to, gated on EFFECTIVE_DATE_KEY. Idempotent: running it twice gives the same text.
 *   If the paragraph is not found the text is returned untouched (the document is still produced).
 */
const { getInvoicePolicyDateKey } = require('./invoicePaymentTermsPolicy');

const EFFECTIVE_DATE_KEY = '2026-11-23';

const REFUND_AFTER_SEDA_AMOUNT = 'RM1500';

// Whole paragraph line: "5% + 75% Refund (After SEDA Application): ...".  Group 1 = heading incl. colon,
// group 2 = the second percentage (60% on old documents, 75% on new ones).
const REFUND_AFTER_SEDA_LINE_PATTERN = /^([ \t]*5%\s*\+\s*(\d+%)\s+Refund\s*\(After\s+SEDA\s+Application\)\s*:)[^\n]*$/gim;

function isSignedDocument(invoice = {}) {
  return Boolean(
    String(invoice.customer_signature || '').trim()
    || String(invoice.signature_date || '').trim()
  );
}

function shouldApplyRefundAfterSedaTerms(invoice = {}) {
  if (!isSignedDocument(invoice)) return true;

  const dateKey = getInvoicePolicyDateKey(invoice);
  return Boolean(dateKey && dateKey >= EFFECTIVE_DATE_KEY);
}

function applyRefundTermsToText(termsText, applyPolicy) {
  const text = String(termsText || '');
  if (!applyPolicy || !text) return text;

  return text.replace(
    REFUND_AFTER_SEDA_LINE_PATTERN,
    (_line, heading, percent) => `${heading} Customers who have paid the 5% downpayment and the subsequent ${percent} fee but wish to cancel their project after SEDA approval may request a refund. The refund amount will be the amount paid minus ${REFUND_AFTER_SEDA_AMOUNT}.`
  );
}

function applyRefundTermsPolicy(invoice = {}, template = {}) {
  const templateData = { ...(template || {}) };
  const originalTerms = templateData.terms_and_conditions || '';

  if (originalTerms) {
    templateData.terms_and_conditions = applyRefundTermsToText(originalTerms, shouldApplyRefundAfterSedaTerms(invoice));
  }

  return templateData;
}

function applyRefundTermsPolicyToInvoice(invoice = {}) {
  if (!invoice || typeof invoice !== 'object') return invoice;

  return {
    ...invoice,
    template: applyRefundTermsPolicy(invoice, invoice.template || {})
  };
}

module.exports = {
  EFFECTIVE_DATE_KEY,
  REFUND_AFTER_SEDA_AMOUNT,
  applyRefundTermsPolicy,
  applyRefundTermsPolicyToInvoice,
  applyRefundTermsToText,
  shouldApplyRefundAfterSedaTerms
};
