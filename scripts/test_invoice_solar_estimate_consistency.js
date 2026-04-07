const assert = require('assert/strict');

const { normalizeSolarEstimateFields } = require('../src/modules/Invoicing/services/solarEstimateValues');
const { generateInvoiceHtml } = require('../src/modules/Invoicing/services/invoiceHtmlGenerator');
const { generateInvoiceHtmlV2 } = require('../src/modules/Invoicing/services/invoiceHtmlGeneratorV2');

const SNAPSHOT_SCENARIOS = [
  {
    label: 'Production snapshot RM300 low day usage',
    estimate: {
      beforeSolarBill: 299.72,
      estimatedSaving: 270.81,
      estimatedNewBillAmount: 28.91
    }
  },
  {
    label: 'Production snapshot RM600 low day usage',
    estimate: {
      beforeSolarBill: 599.63,
      estimatedSaving: 429.33,
      estimatedNewBillAmount: 170.30
    }
  },
  {
    label: 'Production snapshot RM900 low day usage',
    estimate: {
      beforeSolarBill: 899.79,
      estimatedSaving: 678.07,
      estimatedNewBillAmount: 221.72
    }
  },
  {
    label: 'Preview bug screenshot scenario',
    estimate: {
      beforeSolarBill: 299.68,
      estimatedSaving: 286.77,
      estimatedNewBillAmount: 12.91
    }
  },
  {
    label: 'Saved estimate overrides derived fallback',
    estimate: {
      beforeSolarBill: 420.00,
      estimatedSaving: 260.00,
      estimatedNewBillAmount: 95.50
    }
  },
  {
    label: 'Legacy fallback without stored payable amount',
    input: {
      customerAverageTnb: 450.00,
      estimatedSaving: 180.25
    },
    expected: {
      beforeSolarBill: 450.00,
      estimatedSaving: 180.25,
      estimatedNewBillAmount: 269.75
    }
  }
];

const LIVE_CALCULATOR_SCENARIOS = [
  {
    label: 'Live auto-size RM300 low day usage',
    params: {
      amount: 300,
      sunPeakHour: 3.4,
      morningUsage: 30,
      panelType: 650,
      smpPrice: 0.2703,
      afaRate: 0,
      historicalAfaRate: 0,
      percentDiscount: 0,
      fixedDiscount: 0,
      batterySize: 0,
      overridePanels: '',
      systemPhase: 3
    }
  },
  {
    label: 'Live auto-size RM600 low day usage',
    params: {
      amount: 600,
      sunPeakHour: 3.4,
      morningUsage: 30,
      panelType: 650,
      smpPrice: 0.2703,
      afaRate: 0,
      historicalAfaRate: 0,
      percentDiscount: 0,
      fixedDiscount: 0,
      batterySize: 0,
      overridePanels: '',
      systemPhase: 3
    }
  }
];

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function createInvoiceFixture(estimate, scenarioLabel) {
  return {
    items: [],
    customer_average_tnb: estimate.beforeSolarBill,
    estimated_saving: estimate.estimatedSaving,
    estimated_new_bill_amount: estimate.estimatedNewBillAmount,
    package_type: 'residential',
    status: 'draft',
    panel_qty: 12,
    panel_rating: 650,
    bubble_id: `consistency-${scenarioLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    invoice_number: 'Q-TEST',
    invoice_date: '2026-04-07',
    customer_name: 'Test Customer',
    customer_address: 'Address',
    total_amount: 0,
    sst_amount: 0,
    discount_amount: 0,
    voucher_amount: 0,
    cny_promo_amount: 0,
    holiday_boost_amount: 0,
    earn_now_rebate_amount: 0,
    earth_month_go_green_bonus_amount: 0
  };
}

function assertPreviewHtmlMatches(html, estimate) {
  const beforeText = `RM ${estimate.beforeSolarBill.toFixed(2)}`;
  const afterText = `RM ${estimate.estimatedNewBillAmount.toFixed(2)}`;
  const savingText = `RM ${estimate.estimatedSaving.toFixed(2)}`;

  assert.ok(html.includes(beforeText), `Preview is missing before-solar bill ${beforeText}`);
  assert.ok(html.includes(afterText), `Preview is missing after-solar bill ${afterText}`);
  assert.ok(html.includes(savingText), `Preview is missing monthly saving ${savingText}`);
}

function assertEstimateRendering(label, estimate) {
  const invoice = createInvoiceFixture(estimate, label);
  const htmlV1 = generateInvoiceHtml(invoice, {}, {});
  const htmlV2 = generateInvoiceHtmlV2(invoice, {}, {});

  assertPreviewHtmlMatches(htmlV1, estimate);
  assertPreviewHtmlMatches(htmlV2, estimate);
}

function runSnapshotScenarios() {
  const results = [];

  for (const scenario of SNAPSHOT_SCENARIOS) {
    const normalizedEstimate = normalizeSolarEstimateFields(
      scenario.input || {
        customerAverageTnb: scenario.estimate.beforeSolarBill,
        estimatedSaving: scenario.estimate.estimatedSaving,
        estimatedNewBillAmount: scenario.estimate.estimatedNewBillAmount
      }
    );

    const expected = scenario.expected || scenario.estimate;

    assert.equal(
      normalizedEstimate.beforeSolarBill,
      expected.beforeSolarBill,
      `${scenario.label}: before-solar bill drifted`
    );
    assert.equal(
      normalizedEstimate.estimatedSaving,
      expected.estimatedSaving,
      `${scenario.label}: monthly saving drifted`
    );
    assert.equal(
      normalizedEstimate.estimatedNewBillAmount,
      expected.estimatedNewBillAmount,
      `${scenario.label}: payable-after-solar drifted`
    );

    assertEstimateRendering(scenario.label, normalizedEstimate);

    results.push({
      label: scenario.label,
      beforeSolarBill: normalizedEstimate.beforeSolarBill,
      estimatedSaving: normalizedEstimate.estimatedSaving,
      estimatedNewBillAmount: normalizedEstimate.estimatedNewBillAmount
    });
  }

  return results;
}

async function runLiveCalculatorScenarios() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_TARIFF) {
    return {
      skipped: true,
      reason: 'DATABASE_URL and DATABASE_URL_TARIFF are required for live calculator checks.'
    };
  }

  const pool = require('../src/core/database/pool');
  const tariffPool = require('../src/core/database/tariffPool');
  const { calculateSolarSavings } = require('../src/modules/SolarCalculator/services/solarCalculatorService');
  const results = [];

  try {
    for (const scenario of LIVE_CALCULATOR_SCENARIOS) {
      const calculationResult = await calculateSolarSavings(pool, tariffPool, scenario.params);
      const normalizedEstimate = normalizeSolarEstimateFields({
        requestedBillAmount: scenario.params.amount,
        customerAverageTnb: calculationResult.details?.billBefore,
        estimatedSaving: calculationResult.monthlySavings,
        billAfterSolarBeforeExport: calculationResult.details?.billAfter,
        exportEarning: calculationResult.details?.exportSaving,
        payableAfterSolar: calculationResult.details?.estimatedPayableAfterSolar
      });

      assert.equal(
        normalizedEstimate.estimatedSaving,
        roundMoney(calculationResult.monthlySavings),
        `${scenario.label}: normalized monthly saving drifted from calculator output`
      );
      assert.equal(
        normalizedEstimate.estimatedNewBillAmount,
        roundMoney(calculationResult.details?.estimatedPayableAfterSolar),
        `${scenario.label}: payable-after-solar drifted from calculator output`
      );

      assertEstimateRendering(scenario.label, normalizedEstimate);

      results.push({
        label: scenario.label,
        beforeSolarBill: normalizedEstimate.beforeSolarBill,
        estimatedSaving: normalizedEstimate.estimatedSaving,
        estimatedNewBillAmount: normalizedEstimate.estimatedNewBillAmount
      });
    }

    return {
      skipped: false,
      results
    };
  } finally {
    await Promise.allSettled([pool.end(), tariffPool.end()]);
  }
}

async function main() {
  const snapshotResults = runSnapshotScenarios();
  const liveRun = await runLiveCalculatorScenarios();

  console.log('Solar estimate consistency checks passed.');
  console.log('Snapshot scenarios:');
  for (const result of snapshotResults) {
    console.log(
      `- ${result.label}: before RM ${result.beforeSolarBill.toFixed(2)}, saving RM ${result.estimatedSaving.toFixed(2)}, after RM ${result.estimatedNewBillAmount.toFixed(2)}`
    );
  }

  if (liveRun.skipped) {
    console.log(`Live calculator scenarios skipped: ${liveRun.reason}`);
    return;
  }

  console.log('Live calculator scenarios:');
  for (const result of liveRun.results) {
    console.log(
      `- ${result.label}: before RM ${result.beforeSolarBill.toFixed(2)}, saving RM ${result.estimatedSaving.toFixed(2)}, after RM ${result.estimatedNewBillAmount.toFixed(2)}`
    );
  }
}

main().catch((error) => {
  console.error('Solar estimate consistency checks failed.');
  console.error(error);
  process.exitCode = 1;
});
