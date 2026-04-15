/**
 * Solar Calculator Service
 * Handles the core business logic for solar savings calculations,
 * tariff lookups, and system sizing.
 */

const ALLOWED_BATTERY_SIZES = new Set([0, 16, 32, 48]);
const BATTERY_CHARGING_EFFICIENCY = 0.95;

const calculateBatteryFlow = ({
  monthlySolarGeneration,
  morningUsageKwh,
  batterySizeVal
}) => {
  const nonOffsetSolarKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh);
  const dailyNonOffsetSolarKwh = nonOffsetSolarKwh / 30;
  const dailyChargeAvailableKwh = dailyNonOffsetSolarKwh * BATTERY_CHARGING_EFFICIENCY;
  const dailyBatteryStoredKwh = Math.min(dailyChargeAvailableKwh, batterySizeVal);
  const monthlyBatteryStoredKwh = dailyBatteryStoredKwh * 30;
  const dailyExcessExportKwh = Math.max(0, dailyChargeAvailableKwh - batterySizeVal);
  const monthlyExcessExportKwh = dailyExcessExportKwh * 30;

  return {
    nonOffsetSolarKwh,
    dailyNonOffsetSolarKwh,
    dailyChargeAvailableKwh,
    dailyBatteryStoredKwh,
    monthlyBatteryStoredKwh,
    dailyExcessExportKwh,
    monthlyExcessExportKwh
  };
};

// Helper function to find the closest tariff based on adjusted total (bill + afa)
const findClosestTariff = async (client, targetAmount, afaRate) => {
  const query = `
    SELECT *,
      (
        (COALESCE(total_bill, 0)::numeric - COALESCE(fuel_adjustment, 0)::numeric)
        + (COALESCE(usage_kwh, 0)::numeric * $2::numeric)
      ) as adjusted_total
    FROM domestic_am_tariff
    WHERE (
      (COALESCE(total_bill, 0)::numeric - COALESCE(fuel_adjustment, 0)::numeric)
      + (COALESCE(usage_kwh, 0)::numeric * $2::numeric)
    ) <= $1::numeric
    ORDER BY adjusted_total DESC
    LIMIT 1
  `;
  const result = await client.query(query, [targetAmount, afaRate]);

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Fallback to lowest
  const fallbackQuery = `
    SELECT *,
      (
        (COALESCE(total_bill, 0)::numeric - COALESCE(fuel_adjustment, 0)::numeric)
        + (COALESCE(usage_kwh, 0)::numeric * $1::numeric)
      ) as adjusted_total
    FROM domestic_am_tariff
    ORDER BY adjusted_total ASC
    LIMIT 1
  `;
  const fallbackResult = await client.query(fallbackQuery, [afaRate]);
  return fallbackResult.rows.length > 0 ? fallbackResult.rows[0] : null;
};

// Helper function to lookup tariff by usage Kwh
const lookupTariffByUsage = async (client, usageValue) => {
  if (usageValue <= 0) {
    const lowestUsageQuery = `
           SELECT * FROM domestic_am_tariff
           ORDER BY usage_kwh ASC
           LIMIT 1
       `;
    const res = await client.query(lowestUsageQuery);
    return res.rows.length > 0 ? res.rows[0] : null;
  } else {
    const tariffQuery = `
         SELECT * FROM domestic_am_tariff
         WHERE usage_kwh <= $1
         ORDER BY usage_kwh DESC
         LIMIT 1
       `;
    const res = await client.query(tariffQuery, [usageValue]);
    if (res.rows.length > 0) return res.rows[0];

    // Fallback
    const fallbackQuery = `
         SELECT * FROM domestic_am_tariff
         ORDER BY usage_kwh ASC
         LIMIT 1
       `;
    const fallbackRes = await client.query(fallbackQuery);
    return fallbackRes.rows.length > 0 ? fallbackRes.rows[0] : null;
  }
};

const parseCurrencyValue = (value, fallback = 0) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? fallback : numeric;
};

const resolveActualUsageKwh = (usageAfterOffsetKwh, exportKwh) =>
  Math.max(0, parseCurrencyValue(usageAfterOffsetKwh) - parseCurrencyValue(exportKwh));

const resolveActualEeiValue = (tariffRow, eeiTariffRow, actualUsageKwh) => {
  if (actualUsageKwh <= 0) {
    return 0;
  }

  return parseCurrencyValue(
    eeiTariffRow?.energy_efficiency_incentive
      ?? eeiTariffRow?.eei
      ?? tariffRow?.energy_efficiency_incentive
      ?? tariffRow?.eei
  );
};

const getResidentialPackagePhasePrefix = (systemPhase = 3) => (systemPhase === 1 ? '[1P]' : '[3P]');

const getResidentialPanelQuantityGate = (recommendedPanels, systemPhase = 3) => {
  const safeRecommendedPanels = Math.max(1, Math.floor(parseCurrencyValue(recommendedPanels, 1)));
  const baseMin = Math.max(1, safeRecommendedPanels - 2);

  return {
    min: systemPhase === 1 ? Math.min(baseMin, 10) : baseMin,
    max: safeRecommendedPanels + 20
  };
};

const clampPanelQuantity = (value, min, max) => Math.max(min, Math.min(max, value));

const buildBillBreakdown = (tariffRow, afaRate, options = {}) => {
  if (!tariffRow) {
    return null;
  }

  const usage = parseCurrencyValue(tariffRow.energy_charge ?? tariffRow.usage_normal);
  const network = parseCurrencyValue(tariffRow.network_charge ?? tariffRow.network);
  const capacity = parseCurrencyValue(tariffRow.capacity_charge ?? tariffRow.capacity);
  const sst = parseCurrencyValue(tariffRow.sst_tax ?? tariffRow.sst_normal);
  const originalEei = parseCurrencyValue(tariffRow.energy_efficiency_incentive ?? tariffRow.eei);
  const eei = options.overrideEei === null || options.overrideEei === undefined
    ? originalEei
    : parseCurrencyValue(options.overrideEei, originalEei);
  const usageKwh = parseCurrencyValue(tariffRow.usage_kwh);
  const fuelAdjustment = parseCurrencyValue(tariffRow.fuel_adjustment);
  const afa = usageKwh * afaRate;
  const hasStoredTotal = tariffRow.total_bill !== null && tariffRow.total_bill !== undefined;
  const baseTotal = hasStoredTotal
    ? (parseCurrencyValue(tariffRow.total_bill) - fuelAdjustment - originalEei + eei)
    : (usage + network + capacity + sst + eei);
  const total = baseTotal + afa;

  return {
    usage,
    network,
    capacity,
    sst,
    eei,
    eeiOriginal: originalEei,
    eeiUsageKwh: options.eeiUsageKwh ?? usageKwh,
    afa,
    total,
    totalBase: total - afa
  };
};

const calculateBreakdownDelta = (beforeValue, afterValue) => {
  const before = parseCurrencyValue(beforeValue);
  if (afterValue === null || afterValue === undefined) {
    return before;
  }
  const after = parseCurrencyValue(afterValue);
  return before - after;
};

const calculateEeiSaving = (beforeEei, afterEei) =>
  calculateBreakdownDelta(beforeEei, afterEei);

const DAY_USAGE_WEIGHTS = [
  0, 0, 0, 0, 0, 0, 0.35, 0.7, 0.95, 1.05, 1.12, 1.18,
  1.2, 1.14, 1.02, 0.92, 0.82, 0.72, 0.48, 0
];

const NIGHT_USAGE_WEIGHTS = [
  0.42, 0.38, 0.34, 0.3, 0.32, 0.44, 0.6, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0.58, 0.92, 1.08, 1.14, 1.02, 0.7
];

function buildUsagePattern(dailyUsageKwh, dayUsagePercent) {
  const safeDailyUsage = Number.isFinite(dailyUsageKwh) ? Math.max(0, dailyUsageKwh) : 0;
  const safeDayUsagePercent = Number.isFinite(dayUsagePercent)
    ? Math.min(100, Math.max(0, dayUsagePercent))
    : 30;

  const dayUsageKwh = safeDailyUsage * (safeDayUsagePercent / 100);
  const nightUsageKwh = Math.max(0, safeDailyUsage - dayUsageKwh);
  const dayWeightTotal = DAY_USAGE_WEIGHTS.reduce((sum, weight) => sum + weight, 0) || 1;
  const nightWeightTotal = NIGHT_USAGE_WEIGHTS.reduce((sum, weight) => sum + weight, 0) || 1;

  return Array.from({ length: 24 }, (_, hour) => {
    const dayPortion = DAY_USAGE_WEIGHTS[hour] > 0
      ? (dayUsageKwh * DAY_USAGE_WEIGHTS[hour]) / dayWeightTotal
      : 0;
    const nightPortion = NIGHT_USAGE_WEIGHTS[hour] > 0
      ? (nightUsageKwh * NIGHT_USAGE_WEIGHTS[hour]) / nightWeightTotal
      : 0;

    return {
      hour,
      usage: (dayPortion + nightPortion).toFixed(3)
    };
  });
}

/**
 * Main Calculation Logic
 * @param {object} pool - Database pool
 * @param {object} params - Input parameters
 */
async function calculateSolarSavings(mainPool, tariffPool, params) {
  const {
    amount,
    sunPeakHour,
    morningUsage,
    panelType,
    panelBubbleId,
    smpPrice,
    percentDiscount,
    fixedDiscount,
    afaRate: afaRateRaw,
    historicalAfaRate: historicalAfaRateRaw,
    batterySize,
    systemPhase,
    overridePanels,
    futureUsageKwh,
    usageKwhOverride,
    skipResidentialPanelGate
  } = params;

  // Validate inputs
  const billAmount = parseFloat(amount);
  const peakHour = parseFloat(sunPeakHour);
  const morningPercent = parseFloat(morningUsage);
  const panelWattage = parseInt(panelType) || 650;
  const selectedPanelBubbleId = typeof panelBubbleId === 'string' && panelBubbleId.trim().length > 0
    ? panelBubbleId.trim()
    : null;
  const smp = parseFloat(smpPrice);
  const discountPercent = parseFloat(percentDiscount) || 0;
  const discountFixed = parseFloat(fixedDiscount) || 0;
  const afaRate = parseFloat(afaRateRaw) || 0;
  const historicalAfaRate = parseFloat(historicalAfaRateRaw) || 0;
  const batterySizeVal = parseFloat(batterySize) || 0;
  const systemPhaseVal = parseInt(systemPhase) || 3;
  const packagePhasePrefix = getResidentialPackagePhasePrefix(systemPhaseVal);
  const futureUsageKwhRaw = futureUsageKwh ?? usageKwhOverride;
  const futureUsageKwhVal = parseFloat(futureUsageKwhRaw);
  const hasFutureUsageOverride = Number.isFinite(futureUsageKwhVal) && futureUsageKwhVal > 0;
  const bypassPanelGate = skipResidentialPanelGate === true || skipResidentialPanelGate === 'true';

  let overridePanelsVal = null;
  if (overridePanels !== undefined) {
    const parsedOverride = parseInt(overridePanels, 10);
    if (!Number.isNaN(parsedOverride) && parsedOverride >= 1) {
      overridePanelsVal = parsedOverride;
    }
  }

  if (!billAmount || billAmount <= 0) throw new Error('Invalid bill amount');
  if (!peakHour || peakHour < 3.0 || peakHour > 4.5) throw new Error('Sun Peak Hour must be between 3.0 and 4.5');
  if (!morningPercent || morningPercent < 1 || morningPercent > 100) throw new Error('Morning Usage must be between 1% and 100%');
  if (!smp || smp < 0.19 || smp > 0.2703) throw new Error('SMP price must be between RM 0.19 and RM 0.2703');
  if (!ALLOWED_BATTERY_SIZES.has(batterySizeVal)) throw new Error('Battery size must be 0, 16, 32, or 48 kWh');

  const tariffClient = await tariffPool.connect();
  const mainClient = await mainPool.connect();

  try {
    const tariff = hasFutureUsageOverride
      ? await lookupTariffByUsage(tariffClient, futureUsageKwhVal)
      : await findClosestTariff(tariffClient, billAmount, historicalAfaRate);

    if (!tariff) {
      throw new Error('No tariff data found for calculation');
    }

    const monthlyUsageKwh = hasFutureUsageOverride
      ? futureUsageKwhVal
      : (tariff.usage_kwh || 0);

    // NEW PANEL RECOMMENDATION FORMULA
    const recommendedPanelsRaw = Math.floor(monthlyUsageKwh / peakHour / 30 / 0.62);
    const recommendedPanels = Math.max(1, recommendedPanelsRaw);
    const panelQuantityGate = getResidentialPanelQuantityGate(recommendedPanels, systemPhaseVal);
    const actualPanelQty = overridePanelsVal !== null
      ? (bypassPanelGate
        ? overridePanelsVal
        : clampPanelQuantity(overridePanelsVal, panelQuantityGate.min, panelQuantityGate.max))
      : recommendedPanels;

    // Search for Residential package within filtered product pool
    let packageResult = { rows: [] };
    if (selectedPanelBubbleId) {
      const packageByBubbleQuery = `
            SELECT p.*
            FROM package p
            JOIN product pr ON (
              CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
              OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
            )
            WHERE p.panel_qty = $1
              AND p.active = true
              AND (p.special IS FALSE OR p.special IS NULL)
              AND p.type = $2
              AND pr.bubble_id = $3
              AND p.package_name ILIKE $4
            ORDER BY p.price ASC
            LIMIT 1
          `;
      packageResult = await mainClient.query(packageByBubbleQuery, [actualPanelQty, 'Residential', selectedPanelBubbleId, `${packagePhasePrefix}%`]);
    } else {
      const packageByWattQuery = `
            SELECT p.*
            FROM package p
            JOIN product pr ON (
              CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
              OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
            )
            WHERE p.panel_qty = $1
              AND p.active = true
              AND (p.special IS FALSE OR p.special IS NULL)
              AND p.type = $2
              AND pr.solar_output_rating = $3
              AND p.package_name ILIKE $4
            ORDER BY p.price ASC
            LIMIT 1
          `;
      packageResult = await mainClient.query(packageByWattQuery, [actualPanelQty, 'Residential', panelWattage, `${packagePhasePrefix}%`]);
    }

    let selectedPackage = null;
    if (packageResult.rows.length > 0) {
      selectedPackage = packageResult.rows[0];
    }

    // Calculate solar generation
    const panelWatts = panelWattage;
    const systemSizeKwp = (actualPanelQty * panelWatts) / 1000;
    const dailySolarGeneration = (actualPanelQty * panelWatts * peakHour) / 1000;
    const monthlySolarGeneration = dailySolarGeneration * 30;

    const sedaLimit = systemPhaseVal === 1 ? 5 : 15;
    const requiresSedaFee = systemSizeKwp > sedaLimit;

    // Morning offset is now based on total solar generation.
    const morningUsageKwh = (monthlySolarGeneration * morningPercent) / 100;
    const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);

    // --- Battery Logic ---
    const batteryFlow = calculateBatteryFlow({
      monthlySolarGeneration,
      morningUsageKwh,
      batterySizeVal
    });
    const dailyNonOffsetSolarKwh = batteryFlow.dailyNonOffsetSolarKwh;
    const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;
    const dailyBatteryCap = batterySizeVal;
    const dailyMaxDischarge = batteryFlow.dailyBatteryStoredKwh;
    const monthlyMaxDischarge = batteryFlow.monthlyBatteryStoredKwh;

    // --- Baseline Logic (No Battery) ---
    const netUsageBaseline = Math.max(0, monthlyUsageKwh - morningSelfConsumption);
    const netUsageBaselineForLookup = Math.max(0, Math.floor(netUsageBaseline));

    const potentialExportBaseline = Math.max(0, monthlySolarGeneration - morningUsageKwh);
    const exportKwhBaseline = Math.min(potentialExportBaseline, netUsageBaseline);
    const exceededGenerationBaseline = Math.max(0, potentialExportBaseline - exportKwhBaseline);
    const backupGenerationBaseline = Math.min(exceededGenerationBaseline, netUsageBaseline * 0.1);
    const donatedKwhBaseline = Math.max(0, exceededGenerationBaseline - backupGenerationBaseline);

    // --- With Battery Logic ---
    const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption - monthlyMaxDischarge);
    const netUsageForLookup = Math.max(0, Math.floor(netUsageKwh));

    const potentialExport = Math.max(0, monthlySolarGeneration - morningUsageKwh - monthlyMaxDischarge);
    const exportKwh = Math.min(potentialExport, netUsageKwh);

    const exceededGeneration = Math.max(0, potentialExport - exportKwh);
    const backupGenerationKwh = Math.min(exceededGeneration, netUsageKwh * 0.1);
    const donatedKwh = Math.max(0, exceededGeneration - backupGenerationKwh);

    const actualUsageBaselineKwh = resolveActualUsageKwh(netUsageBaseline, exportKwhBaseline);
    const actualUsageBaselineForLookup = Math.max(0, Math.floor(actualUsageBaselineKwh));
    const actualUsageKwh = resolveActualUsageKwh(netUsageKwh, exportKwh);
    const actualUsageForLookup = Math.max(0, Math.floor(actualUsageKwh));

    const baselineTariff = await lookupTariffByUsage(tariffClient, netUsageBaselineForLookup);
    const afterTariff = await lookupTariffByUsage(tariffClient, netUsageForLookup);
    const baselineEeiTariff = actualUsageBaselineKwh > 0
      ? await lookupTariffByUsage(tariffClient, actualUsageBaselineForLookup)
      : null;
    const afterEeiTariff = actualUsageKwh > 0
      ? await lookupTariffByUsage(tariffClient, actualUsageForLookup)
      : null;

    // Savings
    const morningUsageRate = 0.4869;
    const morningSaving = morningUsageKwh * (morningUsageRate + afaRate);

    const exportRate = netUsageKwh > 1500 ? 0.3703 : smp;
    const exportRateBaseline = netUsageBaseline > 1500 ? 0.3703 : smp;

    const exportSavingRaw = exportKwh * exportRate;
    const backupGenerationSaving = backupGenerationKwh * exportRate;
    const exportSavingBaselineRaw = exportKwhBaseline * exportRateBaseline;

    const beforeBreakdown = buildBillBreakdown(tariff, afaRate);
    const actualEeiBaseline = resolveActualEeiValue(baselineTariff, baselineEeiTariff, actualUsageBaselineKwh);
    const actualEei = resolveActualEeiValue(afterTariff, afterEeiTariff, actualUsageKwh);
    const afterBreakdown = buildBillBreakdown(afterTariff, afaRate, {
      overrideEei: actualEei,
      eeiUsageKwh: actualUsageForLookup
    });
    const baselineBreakdown = buildBillBreakdown(baselineTariff, afaRate, {
      overrideEei: actualEeiBaseline,
      eeiUsageKwh: actualUsageBaselineForLookup
    });

    const billBefore = beforeBreakdown ? beforeBreakdown.total : 0;

    const afterBillBaseline = baselineBreakdown ? baselineBreakdown.total : null;
    const afterUsageMatchedBaseline = baselineTariff && baselineTariff.usage_kwh !== null
      ? parseFloat(baselineTariff.usage_kwh)
      : null;
    const actualEeiSavingBaseline = calculateEeiSaving(
      beforeBreakdown ? beforeBreakdown.eei : 0,
      baselineBreakdown ? baselineBreakdown.eei : null
    );
    const grossBillReductionBaseline = afterBillBaseline !== null
      ? Math.max(0, billBefore - afterBillBaseline)
      : morningSaving;
    const billReductionBaseline = Math.max(0, grossBillReductionBaseline - actualEeiSavingBaseline);
    const exportSavingBaseline = afterBillBaseline !== null
      ? Math.min(exportSavingBaselineRaw, afterBillBaseline)
      : exportSavingBaselineRaw;
    const estimatedPayableAfterSolarBaseline = afterBillBaseline !== null
      ? Math.max(0, afterBillBaseline - exportSavingBaselineRaw)
      : Math.max(0, billBefore - (billReductionBaseline + actualEeiSavingBaseline + exportSavingBaseline));

    const afterBill = afterBreakdown ? afterBreakdown.total : null;
    const afterUsageMatched = afterTariff && afterTariff.usage_kwh !== null
      ? parseFloat(afterTariff.usage_kwh)
      : null;

    const actualEeiSaving = calculateEeiSaving(
      beforeBreakdown ? beforeBreakdown.eei : 0,
      afterBreakdown ? afterBreakdown.eei : null
    );
    const grossBillReduction = afterBill !== null ? Math.max(0, billBefore - afterBill) : morningSaving;
    const billReduction = Math.max(0, grossBillReduction - actualEeiSaving);
    const exportSaving = afterBill !== null
      ? Math.min(exportSavingRaw, afterBill)
      : exportSavingRaw;
    const estimatedPayableAfterSolar = afterBill !== null
      ? Math.max(0, afterBill - exportSavingRaw)
      : Math.max(0, billBefore - (billReduction + actualEeiSaving + exportSaving));

    const totalMonthlySavings = billReduction + actualEeiSaving + exportSaving;
    const totalMonthlySavingsBaseline = billReductionBaseline + actualEeiSavingBaseline + exportSavingBaseline;

    const usageReduction = monthlyUsageKwh - (afterUsageMatched !== null ? afterUsageMatched : netUsageKwh);
    const afaSaving = usageReduction * afaRate;
    const baseBillReduction = billReduction - afaSaving;

    const breakdownItems = [
      { key: 'usage', label: 'Usage' },
      { key: 'network', label: 'Network' },
      { key: 'capacity', label: 'Capacity Fee' },
      { key: 'sst', label: 'SST' },
      { key: 'eei', label: 'EEI' },
      { key: 'afa', label: 'AFA Charge' }
    ].map((item) => {
      const beforeValue = beforeBreakdown ? beforeBreakdown[item.key] : 0;
      const afterValue = afterBreakdown ? afterBreakdown[item.key] : null;
      return {
        ...item,
        before: beforeValue,
        after: afterValue,
        delta: calculateBreakdownDelta(beforeValue, afterValue)
      };
    });

    const totals = {
      before: beforeBreakdown ? beforeBreakdown.total : billBefore,
      after: afterBreakdown ? afterBreakdown.total : afterBill,
      delta: calculateBreakdownDelta(
        beforeBreakdown ? beforeBreakdown.total : billBefore,
        afterBreakdown ? afterBreakdown.total : afterBill
      )
    };

    const savingsBreakdown = {
      billReduction: Number(billReduction.toFixed(2)),
      eeiSaving: Number(actualEeiSaving.toFixed(2)),
      exportCredit: Number(exportSaving.toFixed(2)),
      exportCreditRaw: Number(exportSavingRaw.toFixed(2)),
      afaImpact: Number(afaSaving.toFixed(2)),
      baseBillReduction: Number(baseBillReduction.toFixed(2)),
      grossBillReduction: Number(grossBillReduction.toFixed(2)),
      total: Number((billReduction + actualEeiSaving + exportSaving).toFixed(2)),
      payableAfterSolar: Number(estimatedPayableAfterSolar.toFixed(2))
    };

    let systemCostBeforeDiscount = null;
    let finalSystemCost = null;
    let percentDiscountAmount = null;
    let fixedDiscountAmount = null;
    let totalDiscountAmount = null;
    let paybackPeriod = null;

    if (selectedPackage && selectedPackage.price) {
      systemCostBeforeDiscount = parseFloat(selectedPackage.price);
      percentDiscountAmount = (systemCostBeforeDiscount * discountPercent) / 100;
      const priceAfterPercent = systemCostBeforeDiscount - percentDiscountAmount;
      fixedDiscountAmount = discountFixed;
      finalSystemCost = Math.max(0, priceAfterPercent - fixedDiscountAmount);
      totalDiscountAmount = systemCostBeforeDiscount - finalSystemCost;

      if (totalMonthlySavings > 0 && finalSystemCost > 0) {
        paybackPeriod = (finalSystemCost / (totalMonthlySavings * 12)).toFixed(1);
      } else {
        paybackPeriod = 'N/A';
      }
    }

    // Patterns
    const dailyUsageKwh = monthlyUsageKwh / 30;
    const electricityUsagePattern = buildUsagePattern(dailyUsageKwh, morningPercent);

    const solarGenerationPattern = [];
    for (let hour = 0; hour < 24; hour++) {
      let generationMultiplier = 0;
      const sunriseHour = 7;
      const sunsetHour = 19;
      const peakHour = 12;

      if (hour >= sunriseHour && hour <= sunsetHour) {
        const hoursFromPeak = Math.abs(hour - peakHour);
        const maxHoursFromPeak = 5;
        generationMultiplier = Math.cos((hoursFromPeak / maxHoursFromPeak) * (Math.PI / 2));
        generationMultiplier = Math.max(0, generationMultiplier);
      }
      solarGenerationPattern.push({
        hour: hour,
        generation: (dailySolarGeneration * generationMultiplier / 8).toFixed(3)
      });
    }

    // Confidence Level: base 90%, -7% per 0.1h above 3.4h sun peak
    let confidenceLevel = 90;
    if (peakHour > 3.4) {
      const penalty = ((peakHour - 3.4) / 0.1) * 7;
      confidenceLevel = Math.max(0, 90 - penalty);
    }

    return {
      config: {
        sunPeakHour: peakHour,
        morningUsage: morningPercent,
        panelType: panelWattage,
        smpPrice: smp,
        afaRate: afaRate,
        batterySize: batterySizeVal,
        systemPhase: systemPhaseVal
      },
      confidenceLevel: confidenceLevel.toFixed(1),
      recommendedPanels: recommendedPanels,
      actualPanels: actualPanelQty,
      panelAdjustment: actualPanelQty - recommendedPanels,
      overrideApplied: overridePanelsVal !== null,
      panelQuantityGate,
      packageSearchQty: actualPanelQty,
      selectedPackage: selectedPackage ? {
        packageName: selectedPackage.package_name,
        panelQty: selectedPackage.panel_qty,
        price: selectedPackage.price,
        panelWattage: panelWattage,
        type: selectedPackage.type,
        maxDiscount: selectedPackage.max_discount,
        special: selectedPackage.special,
        invoiceDesc: selectedPackage.invoice_desc,
        id: selectedPackage.id,
        linked_package: selectedPackage.bubble_id  // used by generateInvoiceLink()
      } : null,
      solarConfig: `${actualPanelQty} x ${panelWattage}W panels (${systemSizeKwp.toFixed(1)} kW system)`,
      systemSizeKwp: systemSizeKwp.toFixed(1),
      requiresSedaFee: requiresSedaFee,
      monthlySavings: totalMonthlySavings.toFixed(2),
      systemCostBeforeDiscount: systemCostBeforeDiscount !== null ? systemCostBeforeDiscount.toFixed(2) : null,
      percentDiscountAmount: percentDiscountAmount !== null ? percentDiscountAmount.toFixed(2) : null,
      fixedDiscountAmount: fixedDiscountAmount !== null ? fixedDiscountAmount.toFixed(2) : null,
      totalDiscountAmount: totalDiscountAmount !== null ? totalDiscountAmount.toFixed(2) : null,
      finalSystemCost: finalSystemCost !== null ? finalSystemCost.toFixed(2) : null,
      paybackPeriod: paybackPeriod,
      details: {
        monthlyUsageKwh: monthlyUsageKwh,
        futureUsageKwh: hasFutureUsageOverride ? futureUsageKwhVal : null,
        monthlySolarGeneration: monthlySolarGeneration.toFixed(2),
        morningUsageKwh: morningUsageKwh.toFixed(2),
        morningSaving: morningSaving.toFixed(2),
        exportKwh: exportKwh.toFixed(2),
        backupGenerationKwh: backupGenerationKwh.toFixed(2),
        backupGenerationSaving: backupGenerationSaving.toFixed(2),
        donatedKwh: donatedKwh.toFixed(2),
        exportSaving: exportSaving.toFixed(2),
        exportSavingRaw: exportSavingRaw.toFixed(2),
        morningUsageRate: morningUsageRate,
        exportRate: exportRate,
        effectiveExportRate: exportRate.toFixed(4),
        netUsageKwh: netUsageKwh.toFixed(2),
        actualUsageForEeiKwh: actualUsageKwh.toFixed(2),
        actualUsageForEeiLookupKwh: actualUsageForLookup,
        actualEei: actualEei.toFixed(2),
        actualEeiSaving: actualEeiSaving.toFixed(2),
        afterUsageKwh: (afterUsageMatched !== null ? afterUsageMatched : netUsageKwh).toFixed(2),
        billBefore: billBefore.toFixed(2),
        billAfter: afterBill !== null ? afterBill.toFixed(2) : null,
        estimatedPayableAfterSolar: estimatedPayableAfterSolar.toFixed(2),
        billReduction: billReduction.toFixed(2),
        billBreakdown: {
          before: beforeBreakdown,
          after: afterBreakdown,
          items: breakdownItems,
          totals
        },
        savingsBreakdown: savingsBreakdown,
        battery: {
          size: batterySizeVal,
          efficiency: BATTERY_CHARGING_EFFICIENCY,
          nonOffsetSolarKwh: batteryFlow.nonOffsetSolarKwh.toFixed(2),
          dailyNonOffsetSolarKwh: batteryFlow.dailyNonOffsetSolarKwh.toFixed(2),
          dailyChargeAvailableKwh: batteryFlow.dailyChargeAvailableKwh.toFixed(2),
          dailyStoredKwh: batteryFlow.dailyBatteryStoredKwh.toFixed(2),
          monthlyStoredKwh: batteryFlow.monthlyBatteryStoredKwh.toFixed(2),
          dailyExcessExportKwh: batteryFlow.dailyExcessExportKwh.toFixed(2),
          monthlyExcessExportKwh: batteryFlow.monthlyExcessExportKwh.toFixed(2),
          dailyDischarge: dailyMaxDischarge.toFixed(2),
          monthlyDischarge: monthlyMaxDischarge.toFixed(2),
          caps: {
            nonOffsetSolar: dailyNonOffsetSolarKwh.toFixed(2),
            chargeAvailable: batteryFlow.dailyChargeAvailableKwh.toFixed(2),
            nightUsage: dailyNightUsage.toFixed(2),
            batterySize: dailyBatteryCap.toFixed(2)
          },
          miniReport: {
            monthlySolarSentToChargeBatteryKwh: batteryFlow.nonOffsetSolarKwh.toFixed(2),
            monthlyBatteryStoredAndDischargedKwh: batteryFlow.monthlyBatteryStoredKwh.toFixed(2),
            newBillAfterSolarBattery: afterBill !== null ? afterBill.toFixed(2) : null,
            newExportKwh: exportKwh.toFixed(2),
            newActualEei: actualEei.toFixed(2)
          },
          baseline: {
            billReduction: billReductionBaseline.toFixed(2),
            eeiSaving: actualEeiSavingBaseline.toFixed(2),
            exportCredit: exportSavingBaseline.toFixed(2),
            exportCreditRaw: exportSavingBaselineRaw.toFixed(2),
            afaImpact: ((monthlyUsageKwh - (afterUsageMatchedBaseline || netUsageBaseline)) * afaRate).toFixed(2),
            baseBillReduction: (billReductionBaseline - ((monthlyUsageKwh - (afterUsageMatchedBaseline || netUsageBaseline)) * afaRate)).toFixed(2),
            grossBillReduction: grossBillReductionBaseline.toFixed(2),
            totalSavings: totalMonthlySavingsBaseline.toFixed(2),
            billAfter: afterBillBaseline !== null ? afterBillBaseline.toFixed(2) : null,
            estimatedPayableAfterSolar: estimatedPayableAfterSolarBaseline.toFixed(2),
            usageAfter: afterUsageMatchedBaseline !== null ? afterUsageMatchedBaseline.toFixed(2) : null,
            actualUsageForEeiKwh: actualUsageBaselineKwh.toFixed(2),
            actualUsageForEeiLookupKwh: actualUsageBaselineForLookup,
            actualEei: actualEeiBaseline.toFixed(2),
            billBreakdown: {
              before: beforeBreakdown,
              after: baselineBreakdown,
              items: [
                { key: 'usage', label: 'Usage' },
                { key: 'network', label: 'Network' },
                { key: 'capacity', label: 'Capacity Fee' },
                { key: 'sst', label: 'SST' },
                { key: 'eei', label: 'EEI' },
                { key: 'afa', label: 'AFA Charge' }
              ].map((item) => {
                const beforeValue = beforeBreakdown ? beforeBreakdown[item.key] : 0;
                const afterValue = baselineBreakdown ? baselineBreakdown[item.key] : null;
                return {
                  ...item,
                  before: beforeValue,
                  after: afterValue,
                  delta: calculateBreakdownDelta(beforeValue, afterValue)
                };
              }),
              totals: {
                before: beforeBreakdown ? beforeBreakdown.total : billBefore,
                after: baselineBreakdown ? baselineBreakdown.total : null,
                delta: calculateBreakdownDelta(
                  beforeBreakdown ? beforeBreakdown.total : billBefore,
                  baselineBreakdown ? baselineBreakdown.total : null
                )
              }
            }
          }
        }
      },
      billComparison: {
        before: {
          usageKwh: monthlyUsageKwh,
          billAmount: billBefore
        },
        after: afterBill !== null ? {
          usageKwh: afterUsageMatched !== null ? afterUsageMatched : netUsageKwh,
          billAmount: afterBill
        } : null,
        lookupUsageKwh: netUsageForLookup,
        actualNetUsageKwh: parseFloat(netUsageKwh.toFixed(2))
      },
      billBreakdownComparison: {
        before: beforeBreakdown,
        after: afterBreakdown,
        items: breakdownItems,
        totals
      },
      savingsBreakdown: savingsBreakdown,
      charts: {
        electricityUsagePattern: electricityUsagePattern,
        solarGenerationPattern: solarGenerationPattern
      }
    };

  } finally {
    tariffClient.release();
    mainClient.release();
  }
}

module.exports = {
  findClosestTariff,
  calculateSolarSavings
};
