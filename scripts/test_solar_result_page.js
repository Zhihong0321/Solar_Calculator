/**
 * test_solar_result_page.js
 *
 * Spec for GET/POST /api/solar-calculation/page:
 *   - HTML renderer emits a complete result page from calculator output
 *   - Live calculation (when DB is available) returns HTML with savings figures
 *   - format=json wraps the same HTML plus the calculator payload
 *
 * Run: node scripts/test_solar_result_page.js
 */

'use strict';

require('dotenv').config();
// The repo .env pins NODE_ENV=production. This test process must not
// process.exit(1) when the local preview database is down.
process.env.NODE_ENV = 'development';

const http = require('http');
const express = require('express');

const { renderSolarResultPage, buildDisplayModel } = require('../src/modules/SolarCalculator/services/resultPageHtml');
const { applyPageDefaults, generateSolarResultPage } = require('../src/modules/SolarCalculator/services/resultPageService');
const { buildBillCycleModes } = require('../src/modules/SolarCalculator/services/billCycleModeService');
const { buildSolarCalculationDocs, handleSolarCalculationDocs } = require('../src/modules/SolarCalculator/api/solarCalculationDocs');

const TEST_PORT = 3098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let passed = 0;
let failed = 0;

function pass(name, detail) {
  passed += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name, condition, detail) {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

const FIXTURE_RESULT = {
  confidenceLevel: '90.0',
  monthlySavings: '312.40',
  actualPanels: 8,
  recommendedPanels: 8,
  systemSizeKwp: '5.2',
  solarConfig: '8 x 650W panels (5.2 kW system)',
  paybackPeriod: '6.1',
  finalSystemCost: '22800.00',
  systemCostBeforeDiscount: '25800.00',
  totalDiscountAmount: '3000.00',
  requiresSedaFee: false,
  selectedPackage: {
    packageName: 'Residential 8pcs 650W',
    price: '25800.00'
  },
  config: {
    sunPeakHour: 3.4,
    morningUsage: 30,
    panelType: 650,
    afaRate: 0,
    batterySize: 0,
    systemPhase: 3,
    inverterType: 'string'
  },
  details: {
    monthlyUsageKwh: 850,
    monthlySolarGeneration: '867.00',
    exportKwh: '180.00',
    backupGenerationKwh: '12.00',
    actualUsageForEeiKwh: '320.00',
    netUsageKwh: '320.00',
    afterUsageKwh: '320.00',
    billBefore: '504.67',
    billAfter: '210.00',
    estimatedPayableAfterSolar: '192.27',
    exportSaving: '48.65',
    actualEei: '-18.40',
    actualEeiSaving: '22.10',
    actualEeiRatePerKwh: '-0.057500',
    effectiveExportRate: '0.2703',
    battery: { monthlyStoredKwh: '0.00' }
  },
  savingsBreakdown: {
    billReduction: 241.65,
    eeiSaving: 22.10,
    exportCredit: 48.65,
    total: 312.40,
    payableAfterSolar: 192.27
  },
  billBreakdownComparison: {
    before: {
      usage: 280.10,
      network: 90.20,
      capacity: 40.00,
      sst: 32.80,
      kwtbb: 8.10,
      retail: 10.00,
      eei: -40.50,
      afa: 0,
      total: 504.67,
      totalBase: 504.67
    },
    after: {
      usage: 110.00,
      network: 40.00,
      capacity: 18.00,
      sst: 14.00,
      kwtbb: 4.00,
      retail: 10.00,
      eei: -18.40,
      afa: 0,
      total: 210.00
    },
    items: [
      { key: 'usage', label: 'Usage', before: 280.10, after: 110.00, delta: 170.10 },
      { key: 'network', label: 'Network', before: 90.20, after: 40.00, delta: 50.20 }
    ],
    totals: { before: 504.67, after: 210.00, delta: 294.67 }
  }
};

async function checkDbAvailable() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_TARIFF) return false;
  const pool = require('../src/core/database/pool');
  const tariffPool = require('../src/core/database/tariffPool');
  try {
    await Promise.race([
      Promise.all([pool.query('SELECT 1'), tariffPool.query('SELECT 1')]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
    ]);
    return true;
  } catch (err) {
    return false;
  }
}

function testDocs() {
  console.log('\nAPI docs');
  const manifest = buildSolarCalculationDocs('https://example.test');
  assert('docs name is set', manifest.name.includes('Solar Calculator'));
  assert('docs lists the page endpoint', manifest.endpoints.some((item) => item.path === '/api/solar-calculation/page' && item.method === 'GET'));
  assert('docs lists POST page', manifest.endpoints.some((item) => item.path === '/api/solar-calculation/page' && item.method === 'POST'));
  assert('docs lists JSON calc', manifest.endpoints.some((item) => item.path === '/api/solar-calculation'));
  assert('quickstart mentions amount=500', manifest.quickstart_for_ai.some((line) => line.includes('amount=500')));
}

async function testDocsHttp() {
  console.log('\nAPI docs HTTP');
  const app = express();
  app.get('/api/solar-calculation/docs', handleSolarCalculationDocs);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  try {
    const jsonRes = await fetch(`${BASE_URL}/api/solar-calculation/docs?format=json`);
    const json = await jsonRes.json();
    assert('GET docs JSON 200', jsonRes.status === 200 && json.base_url.includes('127.0.0.1'));
    assert('JSON includes page curl', json.endpoints.some((item) => String(item.curl || '').includes('/api/solar-calculation/page')));

    const htmlRes = await fetch(`${BASE_URL}/api/solar-calculation/docs`, { headers: { Accept: 'text/html' } });
    const html = await htmlRes.text();
    assert('browser Accept returns HTML docs', htmlRes.headers.get('content-type').includes('text/html') && html.includes('API docs') && html.includes('curl'));

    const textRes = await fetch(`${BASE_URL}/api/solar-calculation/docs?format=txt`);
    const text = await textRes.text();
    assert('format=txt returns plain text', textRes.headers.get('content-type').includes('text/plain') && text.includes('Quickstart:'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function testDefaults() {
  console.log('\nDefaults');
  const prepared = applyPageDefaults({ amount: 500 });
  assert('amount is required and kept', prepared.params.amount === 500);
  assert('sun peak defaults to 3.4', prepared.params.sunPeakHour === 3.4);
  assert('historical AFA defaults to -0.0047', prepared.params.historicalAfaRate === -0.0047);
  assert('Suria default adds RM 3000', prepared.params.fixedDiscount === 3000 && prepared.suriaRebate === true);
  const noSuria = applyPageDefaults({ amount: 500, suriaRebate: false, fixedDiscount: 100 });
  assert('suriaRebate=false does not add 3000', noSuria.params.fixedDiscount === 100);
}

function testRenderer() {
  console.log('\nHTML renderer');
  const cycles = buildBillCycleModes(FIXTURE_RESULT);
  const html = renderSolarResultPage(FIXTURE_RESULT, cycles, {
    cycle: 'fullMonth',
    afaRate: 0,
    requestedBill: 500
  });
  const model = buildDisplayModel(FIXTURE_RESULT, cycles, { cycle: 'fullMonth', afaRate: 0, requestedBill: 500 });

  assert('emits a full HTML document', html.startsWith('<!DOCTYPE html>') && html.includes('</html>'));
  assert('shows monthly savings', html.includes('RM') && html.includes('Monthly Savings'));
  assert('shows energy flow labels', html.includes('Total Solar Generation') && html.includes('Offset by Solar'));
  assert('shows package name', html.includes('Residential 8pcs 650W'));
  assert('escapes nothing from fixture numbers', html.includes(model.solarConfig.split('(')[0].trim()) || html.includes('8 x 650W'));
  assert('does not include interactive quotation CTA', !html.includes('Create Quotation Link'));

  const xss = renderSolarResultPage({
    ...FIXTURE_RESULT,
    selectedPackage: { packageName: '<script>alert(1)</script>', price: '1' },
    solarConfig: '<img src=x onerror=alert(1)>'
  }, cycles, { requestedBill: 500 });
  assert('escapes package HTML', xss.includes('&lt;script&gt;') && !xss.includes('<script>alert(1)</script>'));
}

async function testLiveService(dbAvailable) {
  console.log('\nLive calculator page');
  if (!dbAvailable) {
    pass('live calculation skipped', 'DATABASE_URL / DATABASE_URL_TARIFF not reachable');
    return;
  }

  const pool = require('../src/core/database/pool');
  const tariffPool = require('../src/core/database/tariffPool');
  const payload = await generateSolarResultPage(pool, tariffPool, { amount: 500, logActivity: '0' });
  assert('live HTML is a document', payload.html.startsWith('<!DOCTYPE html>'));
  assert('live HTML contains savings figure', payload.html.includes('RM') && payload.html.includes(String(payload.result.monthlySavings).split('.')[0]));
  assert('live result has billBefore', Number(payload.result.details.billBefore) > 0);
  assert('live result has package or explicit null', payload.result.selectedPackage === null || Boolean(payload.result.selectedPackage.packageName));
}

async function testHttp(dbAvailable) {
  console.log('\nHTTP endpoint');
  if (!dbAvailable) {
    pass('HTTP page endpoint skipped', 'database not reachable');
    return;
  }

  const SolarCalculator = require('../src/modules/SolarCalculator');
  const app = express();
  app.use(express.json());
  app.use(SolarCalculator.router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    const htmlRes = await fetch(`${BASE_URL}/api/solar-calculation/page?amount=500&logActivity=0`);
    const html = await htmlRes.text();
    assert('GET returns 200 HTML', htmlRes.status === 200 && htmlRes.headers.get('content-type').includes('text/html'));
    assert('GET HTML contains Step 4', html.includes('Step 4') && html.includes('Monthly Savings'));

    const jsonRes = await fetch(`${BASE_URL}/api/solar-calculation/page?amount=500&format=json&logActivity=0`);
    const json = await jsonRes.json();
    assert('format=json returns html + result', json.success === true && typeof json.html === 'string' && json.result && json.billCycleModes);
    assert('JSON html matches a result page', json.html.includes('<!DOCTYPE html>') && json.html.includes('Energy Flow'));

    const postRes = await fetch(`${BASE_URL}/api/solar-calculation/page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, suriaRebate: false, logActivity: '0' })
    });
    const postHtml = await postRes.text();
    assert('POST JSON body returns HTML', postRes.status === 200 && postHtml.includes('Monthly Savings'));

    const badRes = await fetch(`${BASE_URL}/api/solar-calculation/page?amount=0`);
    assert('invalid amount returns HTML error page', badRes.status === 400 && (await badRes.text()).includes('Could not build result page'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  console.log('Solar result page API');
  testDefaults();
  testRenderer();
  testDocs();
  await testDocsHttp();
  const dbAvailable = await checkDbAvailable();
  await testLiveService(dbAvailable);
  await testHttp(dbAvailable);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
