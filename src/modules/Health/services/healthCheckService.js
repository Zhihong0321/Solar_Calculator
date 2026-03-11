const pool = require('../../../core/database/pool');
const tariffPool = require('../../../core/database/tariffPool');
const { calculateSolarSavings } = require('../../SolarCalculator/services/solarCalculatorService');

const HOURLY_INTERVAL_MS = 60 * 60 * 1000;
const HISTORY_LIMIT = 48;
const MONEY_TOLERANCE = 0.01;

// Golden regression snapshots captured from the production-backed calculator on 2026-03-11.
const CALCULATOR_SCENARIOS = [
  {
    key: 'bill-300',
    label: 'Residential RM300',
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
    },
    expected: {
      actualPanels: 11,
      monthlySavings: 270.81,
      billReduction: 137.61,
      exportSaving: 133.20,
      billAfter: 162.11,
      estimatedPayableAfterSolar: 28.91
    }
  },
  {
    key: 'bill-600',
    label: 'Residential RM600',
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
    },
    expected: {
      actualPanels: 19,
      monthlySavings: 429.33,
      billReduction: 192.25,
      exportSaving: 237.08,
      billAfter: 407.38,
      estimatedPayableAfterSolar: 170.30
    }
  },
  {
    key: 'bill-900',
    label: 'Residential RM900',
    params: {
      amount: 900,
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
    },
    expected: {
      actualPanels: 24,
      monthlySavings: 678.07,
      billReduction: 387.82,
      exportSaving: 290.25,
      billAfter: 511.97,
      estimatedPayableAfterSolar: 221.72
    }
  }
];

const state = {
  initializedAt: new Date().toISOString(),
  intervalMs: HOURLY_INTERVAL_MS,
  isRunning: false,
  lastRunStartedAt: null,
  lastRunCompletedAt: null,
  nextRunAt: null,
  checks: {
    calculatorLogic: {
      key: 'calculatorLogic',
      title: 'Calculator Logic',
      status: 'unknown',
      summary: 'Awaiting first run',
      lastRunAt: null,
      durationMs: null,
      details: {
        scenarios: []
      }
    },
    billDatabase: {
      key: 'billDatabase',
      title: 'Bill Database',
      status: 'unknown',
      summary: 'Awaiting first run',
      lastRunAt: null,
      durationMs: null,
      details: {
        queries: []
      }
    }
  },
  history: []
};

let schedulerHandle = null;
let inFlightRun = null;

if (!process.env.DATABASE_URL_TARIFF) {
  state.checks.calculatorLogic.summary = 'Hourly health checks are disabled until DATABASE_URL_TARIFF is configured on the server.';
  state.checks.billDatabase.summary = 'Bill database health checks are disabled until DATABASE_URL_TARIFF is configured on the server.';
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMoney(value) {
  const numeric = toNumber(value);
  return numeric === null ? null : Number(numeric.toFixed(2));
}

function nearlyEqual(a, b, tolerance = MONEY_TOLERANCE) {
  if (a === null || b === null) {
    return false;
  }
  return Math.abs(a - b) <= tolerance;
}

function isoNow() {
  return new Date().toISOString();
}

function formatError(error) {
  if (!error) {
    return 'Unknown error';
  }
  return error.message || String(error);
}

function createAssertion(label, actual, expected, tolerance = MONEY_TOLERANCE) {
  const passed = typeof expected === 'number'
    ? nearlyEqual(actual, expected, tolerance)
    : actual === expected;

  return {
    label,
    status: passed ? 'pass' : 'fail',
    actual,
    expected
  };
}

async function runCalculatorLogicCheck() {
  const startedAt = Date.now();

  try {
    const scenarios = [];

    for (const scenario of CALCULATOR_SCENARIOS) {
      const result = await calculateSolarSavings(pool, tariffPool, scenario.params);
      const monthlySavings = roundMoney(result.monthlySavings);
      const billReduction = roundMoney(result.details?.billReduction);
      const exportSaving = roundMoney(result.details?.exportSaving);
      const billAfter = roundMoney(result.details?.billAfter);
      const estimatedPayableAfterSolar = roundMoney(Math.max(0, toNumber(result.details?.billAfter || 0) - toNumber(result.details?.exportSaving || 0)));
      const actualPanels = toNumber(result.actualPanels);
      const savingsBreakdownTotal = roundMoney(result.savingsBreakdown?.total);

      const assertions = [
        createAssertion('Actual Panels', actualPanels, scenario.expected.actualPanels, 0),
        createAssertion('Monthly Savings', monthlySavings, scenario.expected.monthlySavings),
        createAssertion('Bill Reduction', billReduction, scenario.expected.billReduction),
        createAssertion('Export Savings', exportSaving, scenario.expected.exportSaving),
        createAssertion('Bill After Solar', billAfter, scenario.expected.billAfter),
        createAssertion('Estimated Payable', estimatedPayableAfterSolar, scenario.expected.estimatedPayableAfterSolar),
        createAssertion('Formula: billReduction + exportSaving', monthlySavings, roundMoney((billReduction || 0) + (exportSaving || 0))),
        createAssertion('Formula: billAfter - exportSaving', estimatedPayableAfterSolar, roundMoney(Math.max(0, (billAfter || 0) - (exportSaving || 0)))),
        createAssertion('Savings Breakdown Total', savingsBreakdownTotal, monthlySavings)
      ];

      const failedAssertions = assertions.filter((assertion) => assertion.status === 'fail');

      scenarios.push({
        key: scenario.key,
        label: scenario.label,
        status: failedAssertions.length === 0 ? 'pass' : 'fail',
        params: scenario.params,
        expected: scenario.expected,
        actual: {
          actualPanels,
          monthlySavings,
          billReduction,
          exportSaving,
          billAfter,
          estimatedPayableAfterSolar
        },
        assertions
      });
    }

    const failedScenarios = scenarios.filter((scenario) => scenario.status === 'fail');

    return {
      key: 'calculatorLogic',
      title: 'Calculator Logic',
      status: failedScenarios.length === 0 ? 'pass' : 'fail',
      summary: failedScenarios.length === 0
        ? `${scenarios.length}/${scenarios.length} regression scenarios passed`
        : `${failedScenarios.length} of ${scenarios.length} regression scenarios failed`,
      lastRunAt: isoNow(),
      durationMs: Date.now() - startedAt,
      details: {
        scenarios
      }
    };
  } catch (error) {
    return {
      key: 'calculatorLogic',
      title: 'Calculator Logic',
      status: 'fail',
      summary: `Regression runner failed: ${formatError(error)}`,
      lastRunAt: isoNow(),
      durationMs: Date.now() - startedAt,
      details: {
        scenarios: [],
        error: formatError(error)
      }
    };
  }
}

async function runBillDatabaseCheck() {
  const startedAt = Date.now();

  try {
    const nowResult = await tariffPool.query('SELECT NOW() AS checked_at');
    const domesticResult = await tariffPool.query('SELECT COUNT(*)::int AS row_count, MIN(total_bill) AS min_bill, MAX(total_bill) AS max_bill FROM domestic_am_tariff');
    const commercialResult = await tariffPool.query(`
      SELECT COUNT(*)::int AS row_count, MIN(total_bill) AS min_bill, MAX(total_bill) AS max_bill
      FROM bill_simulation_lookup
      WHERE tariff_group = 'LV_COMMERCIAL'
    `);

    const domestic = domesticResult.rows[0] || {};
    const commercial = commercialResult.rows[0] || {};

    const queries = [
      {
        label: 'Tariff DB Clock',
        status: 'pass',
        value: nowResult.rows[0]?.checked_at || null
      },
      {
        label: 'Domestic Tariff Read',
        status: domestic.row_count > 0 ? 'pass' : 'fail',
        rowCount: domestic.row_count || 0,
        minBill: roundMoney(domestic.min_bill),
        maxBill: roundMoney(domestic.max_bill)
      },
      {
        label: 'Commercial Bill Lookup Read',
        status: commercial.row_count > 0 ? 'pass' : 'fail',
        rowCount: commercial.row_count || 0,
        minBill: roundMoney(commercial.min_bill),
        maxBill: roundMoney(commercial.max_bill)
      }
    ];

    const failedQueries = queries.filter((query) => query.status === 'fail');

    return {
      key: 'billDatabase',
      title: 'Bill Database',
      status: failedQueries.length === 0 ? 'pass' : 'fail',
      summary: failedQueries.length === 0
        ? 'Tariff and bill lookup tables responded normally'
        : `${failedQueries.length} database read checks failed`,
      lastRunAt: isoNow(),
      durationMs: Date.now() - startedAt,
      details: {
        queries
      }
    };
  } catch (error) {
    return {
      key: 'billDatabase',
      title: 'Bill Database',
      status: 'fail',
      summary: `Database read failed: ${formatError(error)}`,
      lastRunAt: isoNow(),
      durationMs: Date.now() - startedAt,
      details: {
        queries: [],
        error: formatError(error)
      }
    };
  }
}

function snapshotState() {
  return JSON.parse(JSON.stringify(state));
}

async function runHealthChecks({ trigger = 'scheduler' } = {}) {
  if (inFlightRun) {
    return inFlightRun;
  }

  state.isRunning = true;
  state.lastRunStartedAt = isoNow();

  inFlightRun = (async () => {
    const [calculatorLogic, billDatabase] = await Promise.all([
      runCalculatorLogicCheck(),
      runBillDatabaseCheck()
    ]);

    state.checks.calculatorLogic = calculatorLogic;
    state.checks.billDatabase = billDatabase;
    state.lastRunCompletedAt = isoNow();
    state.nextRunAt = new Date(Date.now() + HOURLY_INTERVAL_MS).toISOString();
    state.isRunning = false;

    const overallStatus = [calculatorLogic, billDatabase].every((check) => check.status === 'pass')
      ? 'pass'
      : 'fail';

    state.history.unshift({
      trigger,
      status: overallStatus,
      startedAt: state.lastRunStartedAt,
      completedAt: state.lastRunCompletedAt,
      checks: {
        calculatorLogic: {
          status: calculatorLogic.status,
          summary: calculatorLogic.summary
        },
        billDatabase: {
          status: billDatabase.status,
          summary: billDatabase.summary
        }
      }
    });

    if (state.history.length > HISTORY_LIMIT) {
      state.history.length = HISTORY_LIMIT;
    }

    return snapshotState();
  })();

  try {
    return await inFlightRun;
  } finally {
    inFlightRun = null;
  }
}

function startHealthCheckScheduler() {
  if (schedulerHandle) {
    return;
  }

  if (!process.env.DATABASE_URL_TARIFF) {
    state.nextRunAt = null;
    return;
  }

  state.nextRunAt = new Date(Date.now() + HOURLY_INTERVAL_MS).toISOString();
  runHealthChecks({ trigger: 'startup' }).catch((error) => {
    console.error('[Health Check] Initial run failed:', error);
  });

  schedulerHandle = setInterval(() => {
    runHealthChecks({ trigger: 'scheduler' }).catch((error) => {
      console.error('[Health Check] Scheduled run failed:', error);
    });
  }, HOURLY_INTERVAL_MS);
}

function getHealthCheckState() {
  return snapshotState();
}

module.exports = {
  getHealthCheckState,
  runHealthChecks,
  startHealthCheckScheduler
};
