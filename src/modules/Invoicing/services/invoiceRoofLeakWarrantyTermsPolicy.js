/**
 * [AI-CONTEXT]
 * Domain: Invoicing Roof Leaking Warranty Terms Policy
 * Primary Responsibility: Make the "Roof Leaking Warranty" paragraph of
 *   invoice_template.terms_and_conditions state its period (1 year) at render time.
 *   "During the period of the warranty where ..." becomes "During the 1-year warranty period where ...".
 *   An earlier stated period (e.g. "During the 6-month warranty period where ...", from an older SQL
 *   script) is also rewritten to 1 year.
 * Stability: Applies to every document (unsigned and signed, any date) so every place that shows the
 *   TNC shows the same wording. The stored DB copy is never mutated here; the SQL that updates
 *   invoice_template row 1 is scripts/update_invoice_template_tnc_regrouped.sql.
 *   Idempotent. If the paragraph is not found the text is returned untouched (document still renders).
 *   NOTE: the "Warranty" box on the document comes from product.product_warranty_desc, not from this text.
 */

const ROOF_LEAK_WARRANTY_PERIOD_LABEL = '1-year';

// Group 1 = heading line + start of the sentence, group 2 = what follows the replaced words.
// Matches the original wording ("period of the warranty") and any stated period ("6-month warranty period").
const ROOF_LEAK_PERIOD_PATTERN = /(^[ \t]*Roof\s+Leaking\s+Warranty[ \t]*\r?\n[ \t]*During\s+the\s+)(?:period\s+of\s+the\s+warranty|[0-9]+-(?:month|year)\s+warranty\s+period)(\s+where\b)/im;

function applyRoofLeakWarrantyToText(termsText) {
  const text = String(termsText || '');
  if (!text) return text;

  return text.replace(
    ROOF_LEAK_PERIOD_PATTERN,
    (_match, head, tail) => `${head}${ROOF_LEAK_WARRANTY_PERIOD_LABEL} warranty period${tail}`
  );
}

function applyRoofLeakWarrantyPolicy(_invoice = {}, template = {}) {
  const templateData = { ...(template || {}) };
  const originalTerms = templateData.terms_and_conditions || '';

  if (originalTerms) {
    templateData.terms_and_conditions = applyRoofLeakWarrantyToText(originalTerms);
  }

  return templateData;
}

function applyRoofLeakWarrantyPolicyToInvoice(invoice = {}) {
  if (!invoice || typeof invoice !== 'object') return invoice;

  return {
    ...invoice,
    template: applyRoofLeakWarrantyPolicy(invoice, invoice.template || {})
  };
}

module.exports = {
  ROOF_LEAK_WARRANTY_PERIOD_LABEL,
  applyRoofLeakWarrantyPolicy,
  applyRoofLeakWarrantyPolicyToInvoice,
  applyRoofLeakWarrantyToText
};
