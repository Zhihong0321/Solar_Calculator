const assert = require('assert');

const {
  applyPaymentTermsPolicy,
  shouldUseCurrentPaymentTerms
} = require('../src/modules/Invoicing/services/invoicePaymentTermsPolicy');

const LEGACY_TERMS_TEXT = [
  'REFUND POLICY',
  'Our Payment Terms:',
  '5% Downpayment upon Signing Up: Customers are required to make a 5% downpayment of the total project cost upon signing up for our solar PV installation services.',
  '',
  '60% Upon SEDA Approval: Upon approval by the Sustainable Energy Development Authority (SEDA) Malaysia for residential PV installations, customers are required to make an additional payment of 60% of the total project cost.',
  '',
  '35% Upon Installation Complete: The remaining 35% of the total project cost is due upon the completion of the installation.',
  '',
  'Our Refund Policy:',
  '5% + 60% Refund (After SEDA Application): Customers who have paid the 5% downpayment and the subsequent 60% fee may request a refund.',
  '',
  '35% Payment After Installation Complete (Non-Refundable): The 35% payment made upon the completion of the installation is non-refundable.'
].join('\n');

function testEffectiveDateBoundary() {
  assert.equal(shouldUseCurrentPaymentTerms({ invoice_date: '2026-06-30' }), false);
  assert.equal(shouldUseCurrentPaymentTerms({ invoice_date: '2026-07-01' }), true);
}

function testCurrentTermsAppliedForNewDocuments() {
  const template = applyPaymentTermsPolicy(
    { invoice_date: '2026-07-01' },
    { terms_and_conditions: LEGACY_TERMS_TEXT }
  );

  assert.match(template.terms_and_conditions, /75% Upon SEDA Approval/);
  assert.match(template.terms_and_conditions, /additional payment of 75%/);
  assert.match(template.terms_and_conditions, /20% Upon Installation Complete/);
  assert.match(template.terms_and_conditions, /The remaining 20%/);
  assert.match(template.terms_and_conditions, /5% \+ 75% Refund/);
  assert.match(template.terms_and_conditions, /subsequent 75% fee/);
  assert.doesNotMatch(template.terms_and_conditions, /60% Upon SEDA Approval/);
  assert.doesNotMatch(template.terms_and_conditions, /35% Upon Installation Complete/);
}

function testLegacyTermsRemainForPreviousInvoices() {
  const template = applyPaymentTermsPolicy(
    { invoice_date: '2026-06-30' },
    { terms_and_conditions: LEGACY_TERMS_TEXT.replace(/60%/g, '75%').replace(/35%/g, '20%') }
  );

  assert.match(template.terms_and_conditions, /60% Upon SEDA Approval/);
  assert.match(template.terms_and_conditions, /additional payment of 60%/);
  assert.match(template.terms_and_conditions, /35% Upon Installation Complete/);
  assert.match(template.terms_and_conditions, /The remaining 35%/);
  assert.match(template.terms_and_conditions, /5% \+ 60% Refund/);
  assert.match(template.terms_and_conditions, /subsequent 60% fee/);
}

function testMissingTermsStillShowsCurrentPolicyForNewDocuments() {
  const template = applyPaymentTermsPolicy(
    { invoice_date: '2026-07-02' },
    {}
  );

  assert.match(template.terms_and_conditions, /5% Downpayment/);
  assert.match(template.terms_and_conditions, /75% Upon SEDA Approval/);
  assert.match(template.terms_and_conditions, /20% Upon Installation Complete/);
}

function testGenericTermsReceiveCurrentPolicyForNewDocuments() {
  const template = applyPaymentTermsPolicy(
    { invoice_date: '2026-07-02' },
    { terms_and_conditions: '1. Payment is due within 30 days.' }
  );

  assert.match(template.terms_and_conditions, /Payment is due within 30 days/);
  assert.match(template.terms_and_conditions, /Our Payment Terms:/);
  assert.match(template.terms_and_conditions, /75% Upon SEDA Approval/);
  assert.match(template.terms_and_conditions, /20% Upon Installation Complete/);
}

testEffectiveDateBoundary();
testCurrentTermsAppliedForNewDocuments();
testLegacyTermsRemainForPreviousInvoices();
testMissingTermsStillShowsCurrentPolicyForNewDocuments();
testGenericTermsReceiveCurrentPolicyForNewDocuments();

console.log('Invoice payment terms policy checks passed.');
