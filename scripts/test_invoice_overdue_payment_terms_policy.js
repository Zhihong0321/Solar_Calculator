const assert = require('assert');

const {
  OVERDUE_PAYMENT_CLAUSE,
  applyOverduePaymentPolicy,
  applyOverduePaymentToText,
  hasOverduePaymentClause
} = require('../src/modules/Invoicing/services/invoiceOverduePaymentTermsPolicy');
const { CURRENT_PAYMENT_TERMS_TEXT } = require('../src/modules/Invoicing/services/invoicePaymentTermsPolicy');

const LAST_PAYMENT = '20% After Installation Complete: The remaining 20% of the total project cost is due upon the completion of the installation.';
const TERMS = [
  'REFUND POLICY',
  'Our Payment Terms:',
  '5% Downpayment upon Signing Up: x',
  '',
  LAST_PAYMENT,
  '',
  'Our Refund Policy:',
  '5% Downpayment Refund (Before SEDA Application): y'
].join('\n');

function testClauseInsertedAtEndOfPaymentTerms() {
  const out = applyOverduePaymentToText(TERMS);
  assert.ok(out.includes(`${LAST_PAYMENT}\n\n${OVERDUE_PAYMENT_CLAUSE}\n\nOur Refund Policy:`));
  assert.match(OVERDUE_PAYMENT_CLAUSE, /2%\/month interest/);
}

function testIdempotent() {
  const once = applyOverduePaymentToText(TERMS);
  assert.equal(applyOverduePaymentToText(once), once);
  assert.equal(once.split('Overdue Payment:').length - 1, 1);
}

function testHandEditedClauseNotDuplicated() {
  const edited = TERMS.replace('Our Refund Policy:', 'Late payment: 2% / month interest applies.\n\nOur Refund Policy:');
  assert.equal(hasOverduePaymentClause(edited), true);
  assert.equal(applyOverduePaymentToText(edited), edited);
}

function testFallbackWithoutRefundHeading() {
  const out = applyOverduePaymentToText(CURRENT_PAYMENT_TERMS_TEXT);
  assert.ok(out.endsWith(`\n\n${OVERDUE_PAYMENT_CLAUSE}`));
  assert.equal(applyOverduePaymentToText(out), out);
}

function testNoPaymentTermsLeavesTextAndStillWorks() {
  assert.equal(applyOverduePaymentToText('1. Goods once sold are not returnable.'), '1. Goods once sold are not returnable.');
  assert.equal(applyOverduePaymentToText(''), '');
  assert.equal(applyOverduePaymentToText(null), '');
}

function testAppliesToUnsignedAndSignedDocuments() {
  for (const invoice of [
    { invoice_date: '2026-04-01' },
    { invoice_date: '2026-03-01', customer_signature: 'data:image/png;base64,abc' },
    { invoice_date: '2026-11-24', signature_date: '2026-11-24' }
  ]) {
    const out = applyOverduePaymentPolicy(invoice, { terms_and_conditions: TERMS });
    assert.ok(out.terms_and_conditions.includes(OVERDUE_PAYMENT_CLAUSE));
  }
}

function testNoTemplateDoesNotCrash() {
  assert.deepEqual(applyOverduePaymentPolicy({}, undefined), {});
  assert.deepEqual(applyOverduePaymentPolicy(undefined, null), {});
}

testClauseInsertedAtEndOfPaymentTerms();
testIdempotent();
testHandEditedClauseNotDuplicated();
testFallbackWithoutRefundHeading();
testNoPaymentTermsLeavesTextAndStillWorks();
testAppliesToUnsignedAndSignedDocuments();
testNoTemplateDoesNotCrash();

console.log('Invoice overdue payment terms policy checks passed.');
