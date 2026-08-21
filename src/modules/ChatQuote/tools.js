/**
 * The tool layer for /lab/chat.
 *
 * Every number the chat shows comes from here, never from the model. The model
 * only ever chooses which tool to call and with what arguments; the card is
 * rendered from this module's return value.
 */

const pool = require('../../core/database/pool');
const tariffPool = require('../../core/database/tariffPool');
const { calculateSolarSavings } = require('../SolarCalculator/services/solarCalculatorService');
const { buildBillCycleModes } = require('../SolarCalculator/services/billCycleModeService');

// Mirrors the defaults the live calculator ships with (public/domestic-v4.html).
// Keeping them here means the chat needs exactly one input from the agent: the bill.
const DEFAULTS = {
  sunPeakHour: 3.4,
  morningUsage: 30,
  smpPrice: 0.2703,
  panelType: 650,
  batterySize: 0,
  percentDiscount: 0,
  fixedDiscount: 0
};

const ALLOWED_BATTERY = [0, 16, 32, 48];

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalizes whatever the model (or a chip) supplied into calculator params. */
function buildParams(input = {}, previous = null) {
  const base = previous ? { ...previous } : { ...DEFAULTS };
  const merged = { ...base };

  const amount = num(input.amount);
  if (amount !== null) merged.amount = amount;

  const sunPeakHour = num(input.sunPeakHour);
  if (sunPeakHour !== null) merged.sunPeakHour = sunPeakHour;

  const morningUsage = num(input.morningUsage);
  if (morningUsage !== null) merged.morningUsage = morningUsage;

  const smpPrice = num(input.smpPrice);
  if (smpPrice !== null) merged.smpPrice = smpPrice;

  const panelType = num(input.panelType);
  if (panelType !== null) merged.panelType = panelType;

  const batterySize = num(input.batterySize);
  if (batterySize !== null && ALLOWED_BATTERY.includes(batterySize)) merged.batterySize = batterySize;

  const percentDiscount = num(input.percentDiscount);
  if (percentDiscount !== null) merged.percentDiscount = percentDiscount;

  const fixedDiscount = num(input.fixedDiscount);
  if (fixedDiscount !== null) merged.fixedDiscount = fixedDiscount;

  const overridePanels = num(input.overridePanels);
  if (overridePanels !== null && overridePanels >= 1) merged.overridePanels = overridePanels;
  if (input.overridePanels === null) delete merged.overridePanels;

  return merged;
}

/** Flattens the calculator's large response into the fields the card renders. */
function toCard(params, result) {
  const details = result.details || {};
  const pkg = result.selectedPackage;

  return {
    type: 'savings',
    params,
    bill: {
      before: details.billBefore,
      after: details.billAfter,
      payable: details.estimatedPayableAfterSolar,
      usageKwh: details.monthlyUsageKwh,
      savings: result.monthlySavings
    },
    system: {
      panels: result.actualPanels,
      recommendedPanels: result.recommendedPanels,
      panelWattage: params.panelType,
      sizeKwp: result.systemSizeKwp,
      config: result.solarConfig,
      batterySize: params.batterySize,
      phase: result.config ? result.config.systemPhase : null,
      gate: result.panelQuantityGate || null
    },
    package: pkg ? {
      name: pkg.packageName,
      panelQty: pkg.panelQty,
      price: pkg.price,
      nettPrice: pkg.nettPrice,
      maxDiscount: pkg.maxDiscount,
      linkedPackage: pkg.linked_package,
      invoiceDesc: pkg.invoiceDesc
    } : null,
    cost: {
      beforeDiscount: result.systemCostBeforeDiscount,
      discountAmount: result.totalDiscountAmount,
      final: result.finalSystemCost,
      requiresSedaFee: result.requiresSedaFee
    },
    payback: result.paybackPeriod,
    confidence: result.confidenceLevel
  };
}

/**
 * calculate_savings — the only tool wired in phase 1.
 * `previous` carries the last calculation's params so chips can patch one field.
 */
async function calculateSavings(input, previous = null) {
  const params = buildParams(input, previous);

  if (!params.amount || params.amount <= 0) {
    const err = new Error('Invalid bill amount');
    err.code = 'NEEDS_AMOUNT';
    throw err;
  }

  // logActivity 0: chip-driven recalculations should not flood activity_log,
  // matching how the existing calculator treats slider drags.
  const result = await calculateSolarSavings(pool, tariffPool, { ...params, logActivity: '0' });
  const card = toCard(params, result);
  card.billCycleModes = buildBillCycleModes(result);
  return card;
}

// OpenAI-format tool schema handed to the router.
const TOOL_SCHEMA = [{
  type: 'function',
  function: {
    name: 'calculate_savings',
    description: 'Calculate solar savings, system size, package and payback for a Malaysian residential customer from their average monthly TNB bill. Call this whenever the agent supplies or changes a bill amount, battery size, discount or panel count.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Average monthly TNB bill in RM' },
        batterySize: { type: 'number', enum: ALLOWED_BATTERY, description: 'Battery capacity in kWh. 0 means no battery.' },
        percentDiscount: { type: 'number', description: 'Percentage discount on system price, 0-100' },
        fixedDiscount: { type: 'number', description: 'Fixed discount in RM' },
        overridePanels: { type: 'number', description: 'Override the recommended panel quantity' },
        sunPeakHour: { type: 'number', description: 'Sun peak hours, 3.0 to 4.5. Default 3.4.' },
        morningUsage: { type: 'number', description: 'Percentage of usage during daylight, 1-100. Default 30.' }
      },
      required: ['amount']
    }
  }
}];

module.exports = { calculateSavings, buildParams, TOOL_SCHEMA, DEFAULTS, ALLOWED_BATTERY };
