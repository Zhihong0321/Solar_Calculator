/**
 * [AI-CONTEXT]
 * Domain: Invoicing Warranty Terms Policy
 * Primary Responsibility: Insert the "Warranty Repairs and Unauthorised Works" clause into the
 *   WARRANTY POLICY section of invoice_template.terms_and_conditions at render time.
 * Stability: Mirrors invoicePaymentTermsPolicy.js on purpose. The stored DB copy is never mutated,
 *   and documents dated before EFFECTIVE_DATE_KEY keep the exact wording the customer signed.
 *   Insertion is idempotent, so updating the DB row later will not produce a duplicate clause.
 */
const { getInvoicePolicyDateKey } = require('./invoicePaymentTermsPolicy');

const EFFECTIVE_DATE_KEY = '2026-08-01';

const WARRANTY_POLICY_HEADING = 'WARRANTY POLICY';
const REFUND_POLICY_HEADING_PATTERN = /^[ \t]*REFUND POLICY[ \t]*$/mi;
const WARRANTY_POLICY_HEADING_PATTERN = /^[ \t]*WARRANTY POLICY[ \t]*$/mi;

const WARRANTY_REPAIRS_CLAUSE_TITLE = 'Warranty Repairs and Unauthorised Works';

const WARRANTY_REPAIRS_CLAUSE_BODY = 'All defects or issues arising during the warranty period shall be reported to the Company promptly, and all inspection and rectification works shall be carried out solely by the Company or its authorised contractors. Any inspection, repair, modification, or dismantling works carried out by the Customer or any third party without the Company\'s prior written consent shall not be claimable or reimbursable from the Company under any circumstances, shall void the warranty in respect of the affected works, and the Company shall bear no liability for any costs, damages, or losses arising therefrom.';

const WARRANTY_REPAIRS_CLAUSE = `${WARRANTY_REPAIRS_CLAUSE_TITLE}\n${WARRANTY_REPAIRS_CLAUSE_BODY}`;

// Matches either the clause heading or a phrase unique to its body, so a hand-edited DB row that
// words the heading slightly differently still counts as "already present".
const CLAUSE_PRESENT_PATTERNS = [
  /Warranty\s+Repairs\s+and\s+Unauthori[sz]ed\s+Works/i,
  /shall\s+not\s+be\s+claimable\s+or\s+reimbursable/i
];

function shouldApplyWarrantyRepairsClause(invoice = {}) {
  const dateKey = getInvoicePolicyDateKey(invoice);
  return Boolean(dateKey && dateKey >= EFFECTIVE_DATE_KEY);
}

function hasWarrantyRepairsClause(termsText) {
  const text = String(termsText || '');
  return CLAUSE_PRESENT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * The WARRANTY POLICY section runs until the REFUND POLICY heading, so the new sub-section is
 * placed immediately before that heading. Without a REFUND POLICY heading the warranty section
 * runs to the end of the document and the clause is appended there instead.
 */
function insertWarrantyRepairsClause(termsText) {
  const text = String(termsText || '').trim();

  if (!text) {
    return `${WARRANTY_POLICY_HEADING}\n\n${WARRANTY_REPAIRS_CLAUSE}`;
  }

  const refundHeading = text.match(REFUND_POLICY_HEADING_PATTERN);
  if (refundHeading) {
    const head = text.slice(0, refundHeading.index).replace(/\s+$/, '');
    const tail = text.slice(refundHeading.index);
    return `${head}\n\n${WARRANTY_REPAIRS_CLAUSE}\n\n${tail}`;
  }

  if (WARRANTY_POLICY_HEADING_PATTERN.test(text)) {
    return `${text}\n\n${WARRANTY_REPAIRS_CLAUSE}`;
  }

  return `${text}\n\n${WARRANTY_POLICY_HEADING}\n\n${WARRANTY_REPAIRS_CLAUSE}`;
}

function applyWarrantyTermsToText(termsText, applyClause) {
  const text = String(termsText || '');

  if (!applyClause) return text;
  if (hasWarrantyRepairsClause(text)) return text;

  return insertWarrantyRepairsClause(text);
}

function applyWarrantyTermsPolicy(invoice = {}, template = {}) {
  const templateData = { ...(template || {}) };
  const applyClause = shouldApplyWarrantyRepairsClause(invoice);
  const originalTerms = templateData.terms_and_conditions || '';

  if (originalTerms || applyClause) {
    templateData.terms_and_conditions = applyWarrantyTermsToText(originalTerms, applyClause);
  }

  return templateData;
}

function applyWarrantyTermsPolicyToInvoice(invoice = {}) {
  if (!invoice || typeof invoice !== 'object') return invoice;

  return {
    ...invoice,
    template: applyWarrantyTermsPolicy(invoice, invoice.template || {})
  };
}

module.exports = {
  EFFECTIVE_DATE_KEY,
  WARRANTY_REPAIRS_CLAUSE,
  WARRANTY_REPAIRS_CLAUSE_TITLE,
  WARRANTY_REPAIRS_CLAUSE_BODY,
  applyWarrantyTermsPolicy,
  applyWarrantyTermsPolicyToInvoice,
  applyWarrantyTermsToText,
  hasWarrantyRepairsClause,
  shouldApplyWarrantyRepairsClause
};
