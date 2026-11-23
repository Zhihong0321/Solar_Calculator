const assert = require('assert');

const {
  applyRefundTermsPolicy,
  applyRefundTermsToText
} = require('../src/modules/Invoicing/services/invoiceRefundTermsPolicy');

const BEFORE_SEDA_LINE = '5% Downpayment Refund (Before SEDA Application): Customers who have made the initial 5% downpayment may request a refund, excluding a non-refundable administrative fee of RM600. This refund request must be made before the SEDA application process commences.';
const AFTER_SEDA_LINE_75 = '5% + 75% Refund (After SEDA Application): Customers who have paid the 5% downpayment and the subsequent 75% fee but wish to cancel their project after SEDA approval may request a refund. This refund will be subject to deductions, including a non-refundable administrative fee of RM600 , RM600 site survey, engineering design fee and  SEDA application fee of RM300. (Total of RM1500 for completed project milestone)';
const AFTER_SEDA_LINE_60 = AFTER_SEDA_LINE_75.replace('5% + 75%', '5% + 60%').replace('subsequent 75%', 'subsequent 60%');
const LAST_LINE = '20% Payment After Installation Complete (Non-Refundable): The 20% payment made upon the completion of the installation is non-refundable.';

const TERMS = ['REFUND POLICY', 'Our Refund Policy:', BEFORE_SEDA_LINE, '', AFTER_SEDA_LINE_75, '', LAST_LINE].join('\n');

function testAfterSedaParagraphRewritten() {
  const out = applyRefundTermsToText(TERMS, true);
  assert.match(out, /5% \+ 75% Refund \(After SEDA Application\): Customers who have paid the 5% downpayment and the subsequent 75% fee/);
  assert.match(out, /The refund amount will be the amount paid minus RM1500\./);
  assert.doesNotMatch(out, /subject to deductions/);
  assert.doesNotMatch(out, /site survey/);
}

function testOtherParagraphsUntouched() {
  const out = applyRefundTermsToText(TERMS, true);
  assert.ok(out.includes(BEFORE_SEDA_LINE));
  assert.ok(out.includes(LAST_LINE));
}

function testKeepsOldPercentOnOldDocuments() {
  const out = applyRefundTermsToText(['x', AFTER_SEDA_LINE_60].join('\n'), true);
  assert.match(out, /5% \+ 60% Refund/);
  assert.match(out, /subsequent 60% fee/);
  assert.match(out, /minus RM1500\./);
}

function testIdempotent() {
  const once = applyRefundTermsToText(TERMS, true);
  assert.equal(applyRefundTermsToText(once, true), once);
}

function testMissingParagraphLeavesTextAndStillWorks() {
  assert.equal(applyRefundTermsToText('1. Payment is due within 30 days.', true), '1. Payment is due within 30 days.');
  assert.equal(applyRefundTermsToText('', true), '');
  assert.equal(applyRefundTermsToText(null, true), '');
}

function testUnsignedAlwaysGetsNewWording() {
  const out = applyRefundTermsPolicy({ invoice_date: '2026-04-01' }, { terms_and_conditions: TERMS });
  assert.match(out.terms_and_conditions, /minus RM1500\./);
}

function testSignedOldDocumentKeepsSignedWording() {
  const out = applyRefundTermsPolicy(
    { invoice_date: '2026-11-22', customer_signature: 'data:image/png;base64,abc' },
    { terms_and_conditions: TERMS }
  );
  assert.equal(out.terms_and_conditions, TERMS);
}

function testSignedNewDocumentGetsNewWording() {
  const out = applyRefundTermsPolicy(
    { invoice_date: '2026-11-23', customer_signature: 'data:image/png;base64,abc' },
    { terms_and_conditions: TERMS }
  );
  assert.match(out.terms_and_conditions, /minus RM1500\./);
}

function testNoTemplateDoesNotCrash() {
  assert.deepEqual(applyRefundTermsPolicy({}, undefined), {});
  assert.deepEqual(applyRefundTermsPolicy(undefined, null), {});
}

testAfterSedaParagraphRewritten();
testOtherParagraphsUntouched();
testKeepsOldPercentOnOldDocuments();
testIdempotent();
testMissingParagraphLeavesTextAndStillWorks();
testUnsignedAlwaysGetsNewWording();
testSignedOldDocumentKeepsSignedWording();
testSignedNewDocumentGetsNewWording();
testNoTemplateDoesNotCrash();

console.log('Invoice refund terms policy checks passed.');
