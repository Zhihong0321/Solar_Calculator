/**
 * WHAT:    One-shot API orchestration: inputs → calculateSolarSavings → HTML page.
 * WHY:     External callers should not have to drive /domestic or stitch JSON
 *          into a UI. This is the page-returning calculator service.
 * OWNS:    Page-API defaults (matching domestic-v4.html), Suria rebate folding,
 *          cycle selection, HTML/JSON payload assembly.
 * NOT:     Does not change /api/solar-calculation JSON behavior.
 *          Does not persist hosted URLs (→ HostedHtml).
 * DANGER:  Defaults must match public/domestic-v4.html DEFAULT_INPUTS so a
 *          call with only `amount` produces the same result as the live planner.
 *          Suria is folded into fixedDiscount here — do not also add it in the
 *          route, or payback will be double-discounted.
 */

const { calculateSolarSavings } = require('./solarCalculatorService');
const { buildBillCycleModes, normalizeBillCycleMode } = require('./billCycleModeService');
const { renderSolarResultPage, renderErrorPage } = require('./resultPageHtml');

const SURIA_REBATE_AMOUNT = 3000;

const PAGE_DEFAULTS = {
  sunPeakHour: 3.4,
  morningUsage: 30,
  panelType: 650,
  smpPrice: 0.2703,
  afaRate: 0,
  historicalAfaRate: -0.0047,
  percentDiscount: 0,
  fixedDiscount: 0,
  suriaRebate: true,
  systemPhase: 3,
  inverterType: 'string',
  batterySize: 0,
  batteryLossPercent: 0,
  batteryDodPercent: 5
};

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return undefined;
}

function applyPageDefaults(raw = {}) {
  const suriaRebate = parseBoolean(firstDefined(raw, ['suriaRebate', 'suria_rebate']), PAGE_DEFAULTS.suriaRebate);
  const fixedDiscountInput = toNumber(firstDefined(raw, ['fixedDiscount', 'fixed_discount']), PAGE_DEFAULTS.fixedDiscount);
  const suriaAmount = suriaRebate ? SURIA_REBATE_AMOUNT : 0;

  const params = {
    amount: toNumber(firstDefined(raw, ['amount', 'billAmount', 'bill_amount'])),
    sunPeakHour: toNumber(firstDefined(raw, ['sunPeakHour', 'sun_peak_hour']), PAGE_DEFAULTS.sunPeakHour),
    morningUsage: toNumber(firstDefined(raw, ['morningUsage', 'morning_usage']), PAGE_DEFAULTS.morningUsage),
    panelType: toNumber(firstDefined(raw, ['panelType', 'panel_type']), PAGE_DEFAULTS.panelType),
    smpPrice: toNumber(firstDefined(raw, ['smpPrice', 'smp_price']), PAGE_DEFAULTS.smpPrice),
    afaRate: toNumber(firstDefined(raw, ['afaRate', 'afa_rate']), PAGE_DEFAULTS.afaRate),
    historicalAfaRate: toNumber(firstDefined(raw, ['historicalAfaRate', 'historical_afa_rate']), PAGE_DEFAULTS.historicalAfaRate),
    percentDiscount: toNumber(firstDefined(raw, ['percentDiscount', 'percent_discount']), PAGE_DEFAULTS.percentDiscount),
    fixedDiscount: fixedDiscountInput + suriaAmount,
    systemPhase: toNumber(firstDefined(raw, ['systemPhase', 'system_phase']), PAGE_DEFAULTS.systemPhase),
    inverterType: firstDefined(raw, ['inverterType', 'inverter_type']) || PAGE_DEFAULTS.inverterType,
    batterySize: toNumber(firstDefined(raw, ['batterySize', 'battery_size']), PAGE_DEFAULTS.batterySize),
    batteryLossPercent: toNumber(firstDefined(raw, ['batteryLossPercent', 'battery_loss_percent']), PAGE_DEFAULTS.batteryLossPercent),
    batteryDodPercent: toNumber(firstDefined(raw, ['batteryDodPercent', 'battery_dod_percent']), PAGE_DEFAULTS.batteryDodPercent)
  };

  const panelBubbleId = firstDefined(raw, ['panelBubbleId', 'panel_bubble_id']);
  if (panelBubbleId) params.panelBubbleId = String(panelBubbleId).trim();

  const overridePanels = toNumber(firstDefined(raw, ['overridePanels', 'override_panels', 'panelQty', 'panel_qty']));
  if (overridePanels !== null && overridePanels >= 1) params.overridePanels = overridePanels;

  const futureUsageKwh = toNumber(firstDefined(raw, ['futureUsageKwh', 'future_usage_kwh', 'usageKwhOverride']));
  if (futureUsageKwh !== null && futureUsageKwh > 0) params.futureUsageKwh = futureUsageKwh;

  const skipResidentialPanelGate = parseBoolean(firstDefined(raw, ['skipResidentialPanelGate', 'skip_residential_panel_gate']), null);
  if (skipResidentialPanelGate !== null) params.skipResidentialPanelGate = skipResidentialPanelGate;

  return {
    params,
    suriaRebate,
    suriaAmount,
    cycle: normalizeBillCycleMode(firstDefined(raw, ['cycle', 'billCycleMode', 'bill_cycle_mode'])),
    format: String(firstDefined(raw, ['format']) || '').toLowerCase() === 'json' ? 'json' : 'html'
  };
}

function wantsJson(req, format) {
  if (format === 'json') return true;
  const accept = String(req.headers.accept || '');
  return accept.includes('application/json') && !accept.includes('text/html');
}

async function generateSolarResultPage(mainPool, tariffPool, rawInput = {}) {
  const prepared = applyPageDefaults(rawInput);
  const result = await calculateSolarSavings(mainPool, tariffPool, prepared.params);
  const billCycleModes = buildBillCycleModes(result);
  const html = renderSolarResultPage(result, billCycleModes, {
    cycle: prepared.cycle,
    afaRate: prepared.params.afaRate,
    requestedBill: prepared.params.amount
  });

  return {
    html,
    result,
    billCycleModes,
    inputs: prepared.params,
    suriaRebate: prepared.suriaRebate,
    cycle: prepared.cycle,
    format: prepared.format
  };
}

module.exports = {
  PAGE_DEFAULTS,
  SURIA_REBATE_AMOUNT,
  applyPageDefaults,
  wantsJson,
  generateSolarResultPage,
  renderErrorPage
};
