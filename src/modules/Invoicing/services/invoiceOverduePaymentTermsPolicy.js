/**
 * [AI-CONTEXT]
 * Domain: Invoicing Overdue Payment Terms Policy
 * Primary Responsibility: Add the "Overdue Payment" clause (2%/month interest on overdue payment) to the
 *   payment terms of invoice_template.terms_and_conditions at render time.
 * Placement: just before the "Our Refund Policy:" heading, i.e. at the end of "Our Payment Terms:".
 *   If that heading is missing, it goes right after the last-installation-payment paragraph
 *   ("... After Installation Complete: ...") instead; if neither is found the text is returned untouched.
 * Stability: Applies to every document (unsigned and signed, any date) so every place that shows the TNC
 *   shows the same wording. The stored DB copy is never mutated here; the SQL for invoice_template row 1 is
 *   scripts/update_invoice_template_roof_leak_and_overdue.sql. Idempotent: the clause is added once.
 */

const OVERDUE_PAYMENT_CLAUSE = 'Overdue Payment: For overdue payment there will be a 2%/month interest.';

// Present already (heading, or the rate wording), so a hand-edited DB row does not get a second copy.
const CLAUSE_PRESENT_PATTERNS = [
  /Overdue\s+Payment\s*:/i,
  /2%\s*\/\s*month\s+interest/i
];

const REFUND_POLICY_LIST_HEADING_PATTERN = /^[ \t]*Our\s+Refund\s+Policy\s*:[ \t]*$/im;
const LAST_PAYMENT_LINE_PATTERN = /^[ \t]*(?:20|35)%\s+(?:After|Upon)\s+Installation\s+Complete\s*:[^\n]*$/im;

function hasOverduePaymentClause(termsText) {
  const text = String(termsText || '');
  return CLAUSE_PRESENT_PATTERNS.some((pattern) => pattern.test(text));
}

function applyOverduePaymentToText(termsText) {
  const text = String(termsText || '');
  if (!text.trim()) return text;
  if (hasOverduePaymentClause(text)) return text;

  const refundHeading = text.match(REFUND_POLICY_LIST_HEADING_PATTERN);
  if (refundHeading) {
    return `${text.slice(0, refundHeading.index)}${OVERDUE_PAYMENT_CLAUSE}\n\n${text.slice(refundHeading.index)}`;
  }

  const lastPayment = text.match(LAST_PAYMENT_LINE_PATTERN);
  if (lastPayment) {
    const end = lastPayment.index + lastPayment[0].length;
    return `${text.slice(0, end)}\n\n${OVERDUE_PAYMENT_CLAUSE}${text.slice(end)}`;
  }

  return text;
}

function applyOverduePaymentPolicy(_invoice = {}, template = {}) {
  const templateData = { ...(template || {}) };
  const originalTerms = templateData.terms_and_conditions || '';

  if (originalTerms) {
    templateData.terms_and_conditions = applyOverduePaymentToText(originalTerms);
  }

  return templateData;
}

function applyOverduePaymentPolicyToInvoice(invoice = {}) {
  if (!invoice || typeof invoice !== 'object') return invoice;

  return {
    ...invoice,
    template: applyOverduePaymentPolicy(invoice, invoice.template || {})
  };
}

module.exports = {
  OVERDUE_PAYMENT_CLAUSE,
  applyOverduePaymentPolicy,
  applyOverduePaymentPolicyToInvoice,
  applyOverduePaymentToText,
  hasOverduePaymentClause
};
