const assert = require('assert');

const {
  WARRANTY_REPAIRS_CLAUSE_TITLE,
  applyWarrantyTermsPolicy,
  applyWarrantyTermsToText,
  hasWarrantyRepairsClause,
  shouldApplyWarrantyRepairsClause
} = require('../src/modules/Invoicing/services/invoiceWarrantyTermsPolicy');

// Trimmed shape of the production invoice_template.terms_and_conditions row.
const PRODUCTION_TERMS_TEXT = [
  'PRIVACY POLICY',
  '1. Collection of Personal Information:',
  'We may collect the following types of personal information from you.',
  '',
  'WARRANTY POLICY',
  'Solar Panel Product Warranty',
  'Panel manufactorer warrants that the Module will be free from material defects in workmanship.',
  '',
  'Workmanship Warranty',
  'Eternalgy Sdn Bhd will, at its absolute discretion, carry out any repairs or replacements necessary.',
  '',
  'Roof Leaking Warranty',
  'The covered cost of Roof Repair shall not exceed 20% of the project final price.',
  '',
  'REFUND POLICY',
  'Eternalgy Sdn Bhd is committed to providing high-quality solar PV installation services in Malaysia.',
  '',
  'Our Payment Terms:',
  '5% Downpayment upon Signing Up: Customers are required to make a 5% downpayment.'
].join('\n');

const SIGNED = { customer_signature: '//cdn.example/sig.png', signature_date: '2026-05-02' };

function testUnsignedQuotationsAlwaysCarryTheClause() {
  // The whole live pipeline predates the effective date; those offers still go out today.
  assert.equal(shouldApplyWarrantyRepairsClause({ invoice_date: '2026-04-01' }), true);
  assert.equal(shouldApplyWarrantyRepairsClause({ invoice_date: '2026-07-31' }), true);
  assert.equal(shouldApplyWarrantyRepairsClause({}), true);
  // An empty signature column must not count as signed.
  assert.equal(shouldApplyWarrantyRepairsClause({ invoice_date: '2026-04-01', customer_signature: '   ' }), true);
}

function testSignedDocumentsStayFrozenAtTheirEffectiveDate() {
  assert.equal(shouldApplyWarrantyRepairsClause({ ...SIGNED, invoice_date: '2026-07-31' }), false);
  assert.equal(shouldApplyWarrantyRepairsClause({ ...SIGNED, invoice_date: '2026-08-01' }), true);
  assert.equal(shouldApplyWarrantyRepairsClause({ ...SIGNED, invoice_date: '2026-09-15' }), true);
  // Signature date alone is enough to treat the document as signed.
  assert.equal(shouldApplyWarrantyRepairsClause({ signature_date: '2026-05-02', invoice_date: '2026-04-01' }), false);
}

function testClauseLandsInsideWarrantySection() {
  const template = applyWarrantyTermsPolicy(
    { invoice_date: '2026-08-01' },
    { terms_and_conditions: PRODUCTION_TERMS_TEXT }
  );
  const text = template.terms_and_conditions;

  assert.match(text, /Warranty Repairs and Unauthorised Works/);
  assert.match(text, /shall not be claimable or reimbursable from the Company/);

  // Placed after the last warranty sub-section and before the REFUND POLICY heading.
  const roofIndex = text.indexOf('Roof Leaking Warranty');
  const clauseIndex = text.indexOf(WARRANTY_REPAIRS_CLAUSE_TITLE);
  const refundIndex = text.indexOf('REFUND POLICY');
  assert.ok(roofIndex < clauseIndex, 'clause must follow the existing warranty sub-sections');
  assert.ok(clauseIndex < refundIndex, 'clause must stay inside the WARRANTY POLICY section');

  // Heading keeps its own line so pre-wrap rendering shows it as a sub-section.
  assert.match(text, /\n\nWarranty Repairs and Unauthorised Works\nAll defects or issues/);

  // Nothing else in the stored document is disturbed.
  assert.match(text, /PRIVACY POLICY/);
  assert.match(text, /Roof Repair shall not exceed 20%/);
  assert.match(text, /5% Downpayment upon Signing Up/);
}

function testPreEffectiveSignedDocumentsAreUntouched() {
  const template = applyWarrantyTermsPolicy(
    { ...SIGNED, invoice_date: '2026-07-31' },
    { terms_and_conditions: PRODUCTION_TERMS_TEXT }
  );

  assert.equal(template.terms_and_conditions, PRODUCTION_TERMS_TEXT);
  assert.doesNotMatch(template.terms_and_conditions, /Warranty Repairs and Unauthorised Works/);
}

function testInsertionIsIdempotent() {
  const once = applyWarrantyTermsToText(PRODUCTION_TERMS_TEXT, true);
  const twice = applyWarrantyTermsToText(once, true);

  assert.equal(once, twice, 'applying the policy twice must not duplicate the clause');
  assert.equal(once.match(/Warranty Repairs and Unauthorised Works/g).length, 1);
  assert.equal(hasWarrantyRepairsClause(once), true);
  assert.equal(hasWarrantyRepairsClause(PRODUCTION_TERMS_TEXT), false);
}

function testDatabaseRowThatAlreadyCarriesTheClauseIsLeftAlone() {
  // Once the DB row is updated by hand the render-time insert must become a no-op, including when
  // the heading is worded slightly differently ("Unauthorized" spelling).
  const manualText = `${PRODUCTION_TERMS_TEXT}\n\nWarranty Repairs and Unauthorized Works\nAll defects shall be reported promptly.`;

  assert.equal(applyWarrantyTermsToText(manualText, true), manualText);
}

function testMissingWarrantySectionFallsBackToAppend() {
  const noRefundHeading = applyWarrantyTermsToText('WARRANTY POLICY\nWorkmanship Warranty\nSome text.', true);
  assert.match(noRefundHeading, /Some text\.\n\nWarranty Repairs and Unauthorised Works\n/);

  const genericTerms = applyWarrantyTermsToText('1. Payment is due within 30 days.', true);
  assert.match(genericTerms, /Payment is due within 30 days/);
  assert.match(genericTerms, /\nWARRANTY POLICY\n\nWarranty Repairs and Unauthorised Works\n/);
}

function testEmptyTemplateStillShowsClauseForNewDocuments() {
  const template = applyWarrantyTermsPolicy({ invoice_date: '2026-08-02' }, {});

  assert.match(template.terms_and_conditions, /WARRANTY POLICY/);
  assert.match(template.terms_and_conditions, /Warranty Repairs and Unauthorised Works/);
}

testUnsignedQuotationsAlwaysCarryTheClause();
testSignedDocumentsStayFrozenAtTheirEffectiveDate();
testClauseLandsInsideWarrantySection();
testPreEffectiveSignedDocumentsAreUntouched();
testInsertionIsIdempotent();
testDatabaseRowThatAlreadyCarriesTheClauseIsLeftAlone();
testMissingWarrantySectionFallsBackToAppend();
testEmptyTemplateStillShowsClauseForNewDocuments();

console.log('Invoice warranty terms policy checks passed.');
