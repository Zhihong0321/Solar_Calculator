/**
 * Checks that regrouping the TNC (docs/INVOICE_TNC_REGROUPED_DRAFT.txt, SQL: update_invoice_template_tnc_regrouped.sql)
 * keeps every term intact, and that the render-time rules work on BOTH the stored (old) text and the regrouped text.
 *
 * Fixture scripts/fixtures/invoice_template_terms_2026-10-20.txt is the production invoice_template row 1 as it was on
 * 2026-10-20 (md5 db391435889ba60333dbe8b0d8d29461, 7252 chars).
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { applyInvoiceTnc } = require('../src/modules/Invoicing/services/invoiceTncService');

const ROOT = path.join(__dirname, '..');
const OLD_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'invoice_template_terms_2026-10-20.txt'), 'utf8');
const NEW_TEXT = fs.readFileSync(path.join(ROOT, 'docs', 'INVOICE_TNC_REGROUPED_DRAFT.txt'), 'utf8').replace(/\r/g, '').trim();
const SQL_TEXT = fs.readFileSync(path.join(__dirname, 'update_invoice_template_tnc_regrouped.sql'), 'utf8');

const REFUND_NEW = 'The refund amount will be the amount paid minus RM1500.';
const OVERDUE = 'Overdue Payment: For overdue payment there will be a 2%/month interest.';
const ROOF_1Y = 'During the 1-year warranty period where Eternalgy Sdn Bhd’s workmanship has resulted in a Roof Leakage';

function render(text, invoice = {}) {
  const out = applyInvoiceTnc({
    bubble_id: 'x',
    invoice_date: '2026-11-24',
    template: { terms_and_conditions: text },
    ...invoice
  });
  return out.template.terms_and_conditions;
}

function lineList(text) {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean);
}

function countOf(text, needle) {
  return String(text).split(needle).length - 1;
}

function sortedCounts(lines) {
  const m = new Map();
  lines.forEach((l) => m.set(l, (m.get(l) || 0) + 1));
  return m;
}

function testFixtureIsTheProductionText() {
  assert.equal(OLD_TEXT.length, 7252);
  assert.equal(crypto.createHash('md5').update(OLD_TEXT, 'utf8').digest('hex'), 'db391435889ba60333dbe8b0d8d29461');
}

function testSqlCarriesTheDraftText() {
  const literals = SQL_TEXT.match(/\$tnc\$[\s\S]*?\$tnc\$/g) || [];
  assert.equal(literals.length, 1);
  assert.equal(literals[0].slice(5, -5), NEW_TEXT);
}

function testRegroupedTextOnlyChangesTwoHeadings() {
  const before = render(OLD_TEXT);
  const afterLines = sortedCounts(lineList(NEW_TEXT));
  const beforeLines = sortedCounts(lineList(before));

  const missing = [...beforeLines].filter(([line, n]) => (afterLines.get(line) || 0) < n).map(([line]) => line);
  const added = [...afterLines].filter(([line, n]) => (beforeLines.get(line) || 0) < n).map(([line]) => line);

  assert.deepEqual(missing.sort(), ['Our Payment Terms:', 'Our Refund Policy:']);
  assert.deepEqual(added.sort(), ['PAYMENT TERMS', 'Refund Rules:']);
  assert.equal(lineList(before).length, lineList(NEW_TEXT).length);
}

function testRulesLeaveRegroupedTextUnchanged() {
  // Nothing added, nothing removed, nothing duplicated once the stored text is the regrouped text.
  assert.equal(render(NEW_TEXT), NEW_TEXT);
}

function testEachLatestTermAppearsOnceEverywhere() {
  for (const [label, text] of [['stored text', render(OLD_TEXT)], ['regrouped text', render(NEW_TEXT)]]) {
    assert.equal(countOf(text, REFUND_NEW), 1, `${label}: refund wording`);
    assert.equal(countOf(text, OVERDUE), 1, `${label}: overdue line`);
    assert.equal(countOf(text, ROOF_1Y), 1, `${label}: roof leak 1 year`);
    assert.equal(countOf(text, 'Warranty Repairs and Unauthorised Works\nAll defects'), 1, `${label}: warranty repairs clause`);
    assert.equal(countOf(text, 'PAYMENT TERMS\n') + countOf(text, 'Our Payment Terms:'), 1, `${label}: one payment terms block`);
    assert.doesNotMatch(text, /subject to deductions/, `${label}: old refund deductions gone`);
    assert.equal(countOf(text, 'During the period of the warranty where Eternalgy Sdn Bhd’s workmanship has resulted in a Roof Leakage'), 0, `${label}: old roof wording gone`);
    assert.equal(countOf(text, 'During the period of the warranty where Eternalgy Sdn Bhd’s workmanship has resulted in a defective installation'), 1, `${label}: workmanship warranty untouched`);
  }
}

function testRegroupedSectionOrderAndPlacement() {
  const text = render(NEW_TEXT);
  const at = (s) => text.indexOf(s);
  const payment = at('PAYMENT TERMS\n');
  const overdue = at(OVERDUE);
  const refund = at('\nREFUND POLICY\n');
  const warranty = at('\nWARRANTY POLICY\n');
  const clause = at('Warranty Repairs and Unauthorised Works\nAll defects');
  const coverage = at('Warranty Coverage:');
  const privacy = at('\nPRIVACY POLICY\n');
  assert.ok(payment === 0 && payment < overdue && overdue < refund, 'overdue line sits at the end of PAYMENT TERMS');
  assert.ok(refund < warranty && warranty < clause && clause < coverage && coverage < privacy, 'warranty items stay inside WARRANTY POLICY');
  assert.ok(at('Refund Rules:') > refund && at('Refund Rules:') < warranty, 'refund rules sit inside REFUND POLICY');
  assert.ok(at('Refund Request Process:') > refund && at('Refund Request Process:') < warranty);
}

function testRulesPlaceMissingClausesInRegroupedLayout() {
  // If a hand edit removes the warranty clause / overdue line from the regrouped text, the rules put them back in place.
  const stripped = NEW_TEXT
    .replace(/\n\nWarranty Repairs and Unauthorised Works\nAll defects[^\n]*/, '')
    .replace(`\n\n${OVERDUE}`, '');
  assert.equal(countOf(stripped, 'Warranty Repairs and Unauthorised Works'), 0);
  assert.equal(countOf(stripped, OVERDUE), 0);

  const text = render(stripped);
  assert.equal(countOf(text, OVERDUE), 1);
  assert.equal(countOf(text, 'Warranty Repairs and Unauthorised Works\nAll defects'), 1);
  assert.ok(text.indexOf(OVERDUE) > text.indexOf('20% After Installation Complete:'));
  assert.ok(text.indexOf(OVERDUE) < text.indexOf('\nREFUND POLICY\n'));
  assert.ok(text.indexOf('Warranty Repairs and Unauthorised Works\nAll defects') < text.indexOf('\nPRIVACY POLICY\n'));
  assert.ok(text.indexOf('Warranty Repairs and Unauthorised Works\nAll defects') > text.indexOf('\nWARRANTY POLICY\n'));
}

function testOlderInvoicesStillGetOldPercentages() {
  // Invoices dated before 1 Jul 2026 keep 60% / 35% on the regrouped text, same as on the stored text.
  for (const text of [OLD_TEXT, NEW_TEXT]) {
    const out = render(text, { invoice_date: '2026-06-30' });
    assert.match(out, /60% Upon SEDA Approved \+ Before Installation/);
    // Existing behaviour on the stored text too: the "The remaining N%" sentence follows the date (35%),
    // while the "20% After Installation Complete:" heading of the stored text is not rewritten for old invoices.
    assert.match(out, /The remaining 35% of the total project cost/);
    assert.match(out, /5% \+ 60% Refund \(After SEDA Application\)/);
    assert.match(out, /subsequent 60% fee/);
    assert.equal(countOf(out, 'PAYMENT TERMS\n') + countOf(out, 'Our Payment Terms:'), 1);
  }
}

function testSignedDocumentsSeeTheSameText() {
  const unsigned = render(NEW_TEXT);
  assert.equal(render(NEW_TEXT, { customer_signature: 'sig', invoice_date: '2026-11-24' }), unsigned);
  assert.equal(render(OLD_TEXT, { customer_signature: 'sig', invoice_date: '2026-11-24' }), render(OLD_TEXT));
}

testFixtureIsTheProductionText();
testSqlCarriesTheDraftText();
testRegroupedTextOnlyChangesTwoHeadings();
testRulesLeaveRegroupedTextUnchanged();
testEachLatestTermAppearsOnceEverywhere();
testRegroupedSectionOrderAndPlacement();
testRulesPlaceMissingClausesInRegroupedLayout();
testOlderInvoicesStillGetOldPercentages();
testSignedDocumentsSeeTheSameText();

console.log('Invoice TNC regrouped structure checks passed.');
