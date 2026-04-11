const { findClosestTariff } = require('./solarCalculatorService');

const DEFAULT_PANEL_RATING = 650;
const DEFAULT_SUN_PEAK_HOUR = 3.4;
const DEFAULT_MORNING_OFFSET_PERCENT = 30;
const DEFAULT_EXPORT_RATE = 0.2703;
const HIGH_USAGE_EXPORT_RATE = 0.3703;

const parseNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundMoney = (value) => Number(parseNumber(value).toFixed(2));

const lookupTariffByUsage = async (client, usageValue) => {
  const safeUsage = Math.max(0, Math.floor(parseNumber(usageValue)));

  if (safeUsage <= 0) {
    const lowestQuery = `
      SELECT * FROM domestic_am_tariff
      ORDER BY usage_kwh ASC
      LIMIT 1
    `;
    const lowestResult = await client.query(lowestQuery);
    return lowestResult.rows[0] || null;
  }

  const query = `
    SELECT * FROM domestic_am_tariff
    WHERE usage_kwh <= $1
    ORDER BY usage_kwh DESC
    LIMIT 1
  `;
  const result = await client.query(query, [safeUsage]);

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const fallbackQuery = `
    SELECT * FROM domestic_am_tariff
    ORDER BY usage_kwh ASC
    LIMIT 1
  `;
  const fallbackResult = await client.query(fallbackQuery);
  return fallbackResult.rows[0] || null;
};

const buildBreakdown = (tariffRow, overrideEei = undefined) => {
  if (!tariffRow) {
    return null;
  }

  const usage = parseNumber(tariffRow.energy_charge ?? tariffRow.usage_normal);
  const network = parseNumber(tariffRow.network_charge ?? tariffRow.network);
  const capacity = parseNumber(tariffRow.capacity_charge ?? tariffRow.capacity);
  const sst = parseNumber(tariffRow.sst_tax ?? tariffRow.sst_normal);
  const originalEei = parseNumber(tariffRow.energy_efficiency_incentive ?? tariffRow.eei);
  const eei = overrideEei === undefined || overrideEei === null
    ? originalEei
    : parseNumber(overrideEei, originalEei);
  const usageKwh = parseNumber(tariffRow.usage_kwh);
  const fuelAdjustment = parseNumber(tariffRow.fuel_adjustment);
  const hasStoredTotal = tariffRow.total_bill !== null && tariffRow.total_bill !== undefined;
  const baseTotal = hasStoredTotal
    ? (parseNumber(tariffRow.total_bill) - fuelAdjustment - originalEei + eei)
    : (usage + network + capacity + sst + eei);

  return {
    usage,
    network,
    capacity,
    sst,
    eei,
    eeiOriginal: originalEei,
    usageKwh,
    total: baseTotal
  };
};

const resolveActualEeiValue = (tariffRow, netImportKwh) => {
  if (netImportKwh <= 0) {
    return 0;
  }

  const candidate = tariffRow?.energy_efficiency_incentive ?? tariffRow?.eei ?? 0;
  const numeric = parseNumber(candidate, 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const calculateSuggestedMaxPanelQty = (usageKwh, panelRating, sunPeakHour) => {
  const perPanelGeneration = (parseNumber(panelRating) * parseNumber(sunPeakHour) * 30) / 1000;
  const safeUsageKwh = parseNumber(usageKwh);

  if (!(perPanelGeneration > 0) || !(safeUsageKwh > 0)) {
    return 0;
  }

  return Math.max(0, Math.ceil(safeUsageKwh / perPanelGeneration) - 1);
};

async function calculateEeiOptimizer(tariffPool, params) {
  const amount = parseNumber(params.amount);
  const sunPeakHour = parseNumber(params.sunPeakHour, DEFAULT_SUN_PEAK_HOUR);
  const morningOffsetPercent = parseNumber(params.morningOffsetPercent ?? params.morningUsage, DEFAULT_MORNING_OFFSET_PERCENT);
  const panelType = parseNumber(params.panelType, DEFAULT_PANEL_RATING);
  const historicalAfaRate = parseNumber(params.historicalAfaRate, 0);

  let requestedPanelQty = null;
  if (params.panelQty !== undefined && params.panelQty !== null && String(params.panelQty).trim() !== '') {
    const parsedQty = parseInt(params.panelQty, 10);
    if (!Number.isNaN(parsedQty) && parsedQty > 0) {
      requestedPanelQty = parsedQty;
    }
  }

  if (!amount || amount <= 0) {
    throw new Error('Invalid bill amount');
  }
  if (!sunPeakHour || sunPeakHour < 3.0 || sunPeakHour > 4.5) {
    throw new Error('Sun Peak Hour must be between 3.0 and 4.5');
  }
  if (!morningOffsetPercent || morningOffsetPercent < 1 || morningOffsetPercent > 100) {
    throw new Error('Morning Offset must be between 1% and 100%');
  }
  if (!panelType || panelType <= 0) {
    throw new Error('Panel Rating must be greater than 0');
  }

  const tariffClient = await tariffPool.connect();

  try {
    const originalTariff = await findClosestTariff(tariffClient, amount, historicalAfaRate);
    if (!originalTariff) {
      throw new Error('No tariff data found');
    }

    const originalUsageKwh = parseNumber(originalTariff.usage_kwh);
    const originalEei = parseNumber(originalTariff.energy_efficiency_incentive ?? originalTariff.eei);
    const monthlySolarGenerationPerPanel = (panelType * sunPeakHour * 30) / 1000;
    const suggestedMaxPanelQty = calculateSuggestedMaxPanelQty(originalUsageKwh, panelType, sunPeakHour);
    const actualPanels = requestedPanelQty !== null
      ? requestedPanelQty
      : (suggestedMaxPanelQty > 0 ? suggestedMaxPanelQty : 1);
    const safePanels = Math.max(1, actualPanels);

    const monthlySolarGeneration = safePanels * monthlySolarGenerationPerPanel;
    const morningOffsetKwh = monthlySolarGeneration * (morningOffsetPercent / 100);
    const totalExportKwh = Math.max(0, monthlySolarGeneration - morningOffsetKwh);
    const importAfterSolarKwh = Math.max(0, originalUsageKwh - morningOffsetKwh);
    const netImportKwh = Math.max(0, importAfterSolarKwh - totalExportKwh);
    const importAfterSolarLookupKwh = Math.max(0, Math.floor(importAfterSolarKwh));
    const netImportLookupKwh = Math.max(0, Math.floor(netImportKwh));

    const importTariff = await lookupTariffByUsage(tariffClient, importAfterSolarLookupKwh);
    const netImportTariff = netImportKwh > 0
      ? await lookupTariffByUsage(tariffClient, netImportLookupKwh)
      : null;

    const actualEei = resolveActualEeiValue(netImportTariff, netImportKwh);
    const exportRate = importAfterSolarKwh > 1500 ? HIGH_USAGE_EXPORT_RATE : DEFAULT_EXPORT_RATE;
    const exportEarning = totalExportKwh * exportRate;

    const originalBreakdown = buildBreakdown(originalTariff);
    const billAfterSolarAmountBreakdown = buildBreakdown(importTariff, originalEei);
    const billAfterSolarEeiBreakdown = buildBreakdown(importTariff, actualEei);

    const originalBill = originalBreakdown?.total ?? amount;
    const billAfterSolarAmount = billAfterSolarAmountBreakdown?.total ?? originalBill;
    const billAfterSolarEei = billAfterSolarEeiBreakdown?.total ?? billAfterSolarAmount;
    const originalBillReduction = Math.max(0, originalBill - billAfterSolarAmount);
    const eeiImpact = billAfterSolarAmount - billAfterSolarEei;

    return {
      config: {
        amount,
        sunPeakHour,
        morningOffsetPercent,
        panelType
      },
      suggestion: {
        suggestedMaxPanelQty,
        suggestedPanelQty: safePanels,
        sliderMax: Math.max(20, suggestedMaxPanelQty * 2, safePanels + 10)
      },
      original: {
        billAmount: roundMoney(originalBill),
        usageKwh: roundMoney(originalUsageKwh),
        eei: roundMoney(originalEei),
        breakdown: originalBreakdown
      },
      solar: {
        panelQty: safePanels,
        solarGenerationKwh: roundMoney(monthlySolarGeneration),
        morningOffsetKwh: roundMoney(morningOffsetKwh),
        importAfterSolarKwh: roundMoney(importAfterSolarKwh),
        netImportKwh: roundMoney(netImportKwh),
        exportKwh: roundMoney(totalExportKwh),
        exportRate: roundMoney(exportRate),
        exportEarning: roundMoney(exportEarning),
        billAfterSolarAmount: roundMoney(billAfterSolarAmount),
        billAfterSolarEei: roundMoney(billAfterSolarEei),
        actualEei: roundMoney(actualEei),
        billReduction: roundMoney(originalBillReduction),
        eeiImpact: roundMoney(eeiImpact),
        billAfterSolarAmountBreakdown: billAfterSolarAmountBreakdown,
        billAfterSolarEeiBreakdown: billAfterSolarEeiBreakdown,
        actualEeiTariff: netImportTariff
      },
      report: {
        originalBill: roundMoney(originalBill),
        originalEei: roundMoney(originalEei),
        billAfterSolarAmount: roundMoney(billAfterSolarAmount),
        billAfterSolarEei: roundMoney(billAfterSolarEei),
        totalExportKwh: roundMoney(totalExportKwh),
        exportEarning: roundMoney(exportEarning),
        actualEeiAfterDeductExport: roundMoney(actualEei),
        netImportKwh: roundMoney(netImportKwh)
      }
    };
  } finally {
    tariffClient.release();
  }
}

module.exports = {
  calculateEeiOptimizer
};
