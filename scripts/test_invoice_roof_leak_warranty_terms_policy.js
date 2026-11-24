const assert = require('assert');

const {
  applyRoofLeakWarrantyPolicy,
  applyRoofLeakWarrantyToText
} = require('../src/modules/Invoicing/services/invoiceRoofLeakWarrantyTermsPolicy');

const ROOF_PARAGRAPH = 'During the period of the warranty where Eternalgy Sdn Bhd’s workmanship has resulted in a Roof Leakage then Eternalgy Sdn Bhd will, at its absolute discretion, either carry out any repairs to fix the roof condition. The covered cost of Roof Repair shall not exceed 20% of the project final price.';
const WORKMANSHIP_PARAGRAPH = 'During the period of the warranty where Eternalgy Sdn Bhd’s workmanship has resulted in a defective installation then Eternalgy Sdn Bhd will, at its absolute discretion, either carry out any repairs or replacements necessary to allow proper functioning of the Solar PV system.';

const TERMS = [
  'WARRANTY POLICY',
  'Workmanship Warranty',
  WORKMANSHIP_PARAGRAPH,
  '',
  'Roof Leaking Warranty',
  ROOF_PARAGRAPH,
  '',
  'Backup Power During Power Outage',
  'x'
].join('\n');

function testRoofLeakPeriodAdded() {
  const out = applyRoofLeakWarrantyToText(TERMS);
  assert.match(out, /Roof Leaking Warranty\nDuring the 6-month warranty period where Eternalgy Sdn Bhd’s workmanship has resulted in a Roof Leakage/);
  assert.match(out, /shall not exceed 20% of the project final price\./);
}

function testWorkmanshipParagraphUntouched() {
  const out = applyRoofLeakWarrantyToText(TERMS);
  assert.ok(out.includes(WORKMANSHIP_PARAGRAPH));
}

function testIdempotent() {
  const once = applyRoofLeakWarrantyToText(TERMS);
  assert.equal(applyRoofLeakWarrantyToText(once), once);
}

function testWindowsLineEndings() {
  const out = applyRoofLeakWarrantyToText(TERMS.replace(/\n/g, '\r\n'));
  assert.match(out, /During the 6-month warranty period where/);
}

function testMissingParagraphLeavesTextAndStillWorks() {
  assert.equal(applyRoofLeakWarrantyToText('1. Payment is due within 30 days.'), '1. Payment is due within 30 days.');
  assert.equal(applyRoofLeakWarrantyToText(''), '');
  assert.equal(applyRoofLeakWarrantyToText(null), '');
}

function testAppliesToUnsignedAndSignedDocuments() {
  for (const invoice of [
    { invoice_date: '2026-04-01' },
    { invoice_date: '2026-03-01', customer_signature: 'data:image/png;base64,abc' },
    { invoice_date: '2026-11-24', signature_date: '2026-11-24' }
  ]) {
    const out = applyRoofLeakWarrantyPolicy(invoice, { terms_and_conditions: TERMS });
    assert.match(out.terms_and_conditions, /6-month warranty period where Eternalgy Sdn Bhd’s workmanship has resulted in a Roof Leakage/);
  }
}

function testNoTemplateDoesNotCrash() {
  assert.deepEqual(applyRoofLeakWarrantyPolicy({}, undefined), {});
  assert.deepEqual(applyRoofLeakWarrantyPolicy(undefined, null), {});
}

testRoofLeakPeriodAdded();
testWorkmanshipParagraphUntouched();
testIdempotent();
testWindowsLineEndings();
testMissingParagraphLeavesTextAndStillWorks();
testAppliesToUnsignedAndSignedDocuments();
testNoTemplateDoesNotCrash();

console.log('Invoice roof leak warranty terms policy checks passed.');
