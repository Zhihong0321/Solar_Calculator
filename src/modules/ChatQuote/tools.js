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
const eeAuto = require('./eeAuto');

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

// ── Business intelligence (ee-auto) ───────────────────────────────────────

function trimText(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Ranked company list from Google Maps. */
async function businessSearch(input, { requesterId, onProgress } = {}) {
  let keyword = trimText(input && input.keyword, 120);
  const place = trimText(input && input.place, 120);

  // Place-only search is allowed: "all businesses in Bandar Puteri Puchong".
  // The upstream API requires a keyword, so a generic one stands in for "any".
  if (!keyword && place) keyword = 'businesses';
  if (!keyword) {
    const err = new Error('I need a place or a business type to search for.');
    err.code = 'NEEDS_KEYWORD';
    throw err;
  }

  const max = Math.min(Math.max(parseInt(input && input.max, 10) || 20, 1), 100);

  const job = await eeAuto.searchJob({ keyword, place, max, requesterId }, { onProgress });
  const companies = (job.data && job.data.companies) || [];

  return {
    type: 'leads',
    state: job.state,
    query: { keyword, place, max },
    reportId: job.report && job.report.id,
    status: job.report && job.report.status,
    viewUrl: (job.report && job.report.view_url) || null,
    error: (job.report && job.report.error) || null,
    total: companies.length,
    companies: companies.slice(0, 25).map((c) => ({
      id: c.id,
      name: c.name,
      rating: c.rating,
      reviews: c.reviews,
      category: trimText(c.category, 60),
      address: trimText(c.address, 120),
      phone: c.phone || null,
      website: c.website || null,
      mapsUrl: c.maps_url || null,
      rank: c.rank
    }))
  };
}

/** Evidence-guarded deep research on one company from a previous search. */
async function companyResearch(input, { requesterId, onProgress } = {}) {
  const companyId = input && (input.companyId || input.company_id);
  if (!companyId) {
    const err = new Error('I need a company from a search result first.');
    err.code = 'NEEDS_COMPANY';
    throw err;
  }

  const job = await eeAuto.researchJob({ companyId: String(companyId), requesterId }, { onProgress });
  const data = job.data || {};

  return {
    type: 'research',
    state: job.state,
    companyId: String(companyId),
    companyName: trimText(input && input.companyName, 120),
    reportId: job.report && job.report.id,
    status: job.report && job.report.status,
    title: (job.report && job.report.title) || null,
    viewUrl: (job.report && job.report.view_url) || null,
    error: (job.report && job.report.error) || null,
    // The report body is rendered by ee-auto's own mobile page; the card links
    // out rather than trying to reproduce a long-form research document.
    final: data.final || null
  };
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
}, {
  type: 'function',
  function: {
    name: 'business_search',
    description: 'Find real businesses on Google Maps, ranked, with rating, reviews, address, phone and website. Two ways to use it: a keyword plus place ("solar installers in Puchong", "kilang di Shah Alam"), or a PLACE ALONE to list all businesses in that location ("semua business kat Bandar Puteri", "what companies are in Taman Perindustrian Subang"). At least one of keyword or place is needed.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Business category, service or keyword. Omit for an all-businesses-in-a-location search.' },
        place: { type: 'string', description: 'City, district, industrial park, state or country.' },
        max: { type: 'number', description: 'How many results to return, 1-100. Default 20.' }
      },
      required: []
    }
  }
}, {
  type: 'function',
  function: {
    name: 'company_research',
    description: 'Run evidence-backed deep research on ONE company that appeared in a previous business_search result. Use when the agent asks to know more about, investigate, or research a specific company from the list. Requires the company id from that list — never invent one.',
    parameters: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'The id of the company, taken from a previous business_search result' },
        companyName: { type: 'string', description: 'The company name, for display while the research runs' }
      },
      required: ['companyId']
    }
  }
}];

module.exports = {
  calculateSavings,
  businessSearch,
  companyResearch,
  buildParams,
  TOOL_SCHEMA,
  DEFAULTS,
  ALLOWED_BATTERY
};
