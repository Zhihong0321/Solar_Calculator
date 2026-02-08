/**
 * Solar Calculator Service
 * Handles the core business logic for solar savings calculations,
 * tariff lookups, and system sizing.
 */

// Helper function to find the closest tariff based on adjusted total (bill + afa)
const findClosestTariff = async (client, targetAmount, afaRate) => {
  const query = `
    SELECT *,
      (
        (COALESCE(total_bill, bill_total_normal, 0)::numeric - COALESCE(fuel_adjustment, 0)::numeric)
        + (COALESCE(usage_kwh, 0)::numeric * $2::numeric)
      ) as adjusted_total
    FROM domestic_am_tariff
    WHERE (
      (COALESCE(total_bill, bill_total_normal, 0)::numeric - COALESCE(fuel_adjustment, 0)::numeric)
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
        (COALESCE(total_bill, bill_total_normal, 0)::numeric - COALESCE(fuel_adjustment, 0)::numeric)
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

const buildBillBreakdown = (tariffRow, afaRate) => {
  if (!tariffRow) {
    return null;
  }

  const usage = parseCurrencyValue(tariffRow.energy_charge ?? tariffRow.usage_normal);
  const network = parseCurrencyValue(tariffRow.network_charge ?? tariffRow.network);
  const capacity = parseCurrencyValue(tariffRow.capacity_charge ?? tariffRow.capacity);
  const sst = parseCurrencyValue(tariffRow.sst_tax ?? tariffRow.sst_normal);
  const eei = parseCurrencyValue(tariffRow.energy_efficiency_incentive ?? tariffRow.eei);
  const usageKwh = parseCurrencyValue(tariffRow.usage_kwh);
  const fuelAdjustment = parseCurrencyValue(tariffRow.fuel_adjustment);
  const afa = usageKwh * afaRate;
  const baseTotal = parseCurrencyValue(
    tariffRow.total_bill ?? tariffRow.bill_total_normal,
    usage + network + capacity + sst + eei
  ) - fuelAdjustment;
  const total = baseTotal + afa;

  return {
    usage,
    network,
    capacity,
    sst,
    eei,
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
      overridePanels
    } = params;

    // Validate inputs
    const billAmount = parseFloat(amount);
    const peakHour = parseFloat(sunPeakHour);
    const morningPercent = parseFloat(morningUsage);
    const panelWattage = parseInt(panelType) || 620; 
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

    const tariffClient = await tariffPool.connect();
    const mainClient = await mainPool.connect();
    
    try {
        const tariff = await findClosestTariff(tariffClient, billAmount, historicalAfaRate);

        if (!tariff) {
          throw new Error('No tariff data found for calculation');
        }

        const monthlyUsageKwh = tariff.usage_kwh || 0;

        // NEW PANEL RECOMMENDATION FORMULA
        const recommendedPanelsRaw = Math.floor(monthlyUsageKwh / peakHour / 30 / 0.62);
        const recommendedPanels = Math.max(1, recommendedPanelsRaw);
        const actualPanelQty = overridePanelsVal !== null ? overridePanelsVal : recommendedPanels;

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
            ORDER BY p.price ASC
            LIMIT 1
          `;
          packageResult = await mainClient.query(packageByBubbleQuery, [actualPanelQty, 'Residential', selectedPanelBubbleId]);
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
            ORDER BY p.price ASC
            LIMIT 1
          `;
          packageResult = await mainClient.query(packageByWattQuery, [actualPanelQty, 'Residential', panelWattage]);
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

        // Calculate morning usage split
        const morningUsageKwh = (monthlyUsageKwh * morningPercent) / 100;
        const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);
        
        // --- Battery Logic ---
        const dailyExcessSolar = Math.max(0, monthlySolarGeneration - morningUsageKwh) / 30;
        const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;
        const dailyBatteryCap = batterySizeVal;
        const dailyMaxDischarge = Math.min(dailyExcessSolar, dailyNightUsage, dailyBatteryCap);
        const monthlyMaxDischarge = dailyMaxDischarge * 30;

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

        const baselineTariff = await lookupTariffByUsage(tariffClient, netUsageBaselineForLookup);
        const afterTariff = await lookupTariffByUsage(tariffClient, netUsageForLookup);

        // Savings
        const morningUsageRate = 0.4869;
        const morningSaving = morningUsageKwh * (morningUsageRate + afaRate);

        const exportRate = netUsageKwh > 1500 ? 0.3703 : smp;
        const exportRateBaseline = netUsageBaseline > 1500 ? 0.3703 : smp;
        
        const exportSaving = exportKwh * exportRate;
        const backupGenerationSaving = backupGenerationKwh * exportRate;
        const exportSavingBaseline = exportKwhBaseline * exportRateBaseline;

        const totalMonthlySavings = morningSaving + exportSaving;
        const totalMonthlySavingsBaseline = morningSaving + exportSavingBaseline;

        const beforeBreakdown = buildBillBreakdown(tariff, afaRate);
        const afterBreakdown = buildBillBreakdown(afterTariff, afaRate);
        const baselineBreakdown = buildBillBreakdown(baselineTariff, afaRate);

        const billBefore = beforeBreakdown ? beforeBreakdown.total : 0;
        
        const afterBillBaseline = baselineBreakdown ? baselineBreakdown.total : null;
        const afterUsageMatchedBaseline = baselineTariff && baselineTariff.usage_kwh !== null 
           ? parseFloat(baselineTariff.usage_kwh) 
           : null;
        const billReductionBaseline = afterBillBaseline !== null 
           ? Math.max(0, billBefore - afterBillBaseline) 
           : morningSaving;

        const afterBill = afterBreakdown ? afterBreakdown.total : null;
        const afterUsageMatched = afterTariff && afterTariff.usage_kwh !== null
          ? parseFloat(afterTariff.usage_kwh)
          : null;

        const billReduction = afterBill !== null ? Math.max(0, billBefore - afterBill) : morningSaving;

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
          exportCredit: Number(exportSaving.toFixed(2)),
          afaImpact: Number(afaSaving.toFixed(2)),
          baseBillReduction: Number(baseBillReduction.toFixed(2)),
          total: Number((billReduction + exportSaving).toFixed(2))
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
        const electricityUsagePattern = [];
        for (let hour = 0; hour < 24; hour++) {
          let usageMultiplier;
          if (hour >= 6 && hour <= 9) {
            usageMultiplier = 1.8 * (morningPercent / 100);
          } else if (hour >= 18 && hour <= 22) {
            usageMultiplier = 2.2;
          } else if (hour >= 10 && hour <= 17) {
            usageMultiplier = 0.8 * (1 - (morningPercent / 100) * 0.3);
          } else {
            usageMultiplier = 0.3;
          }
          electricityUsagePattern.push({
            hour: hour,
            usage: (dailyUsageKwh * usageMultiplier / 10).toFixed(3)
          });
        }

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

        return {
          config: {
            sunPeakHour: peakHour,
            morningUsage: morningPercent,
            panelType: panelWattage,
            smpPrice: smp,
            afaRate: afaRate,
            batterySize: batterySizeVal
          },
          recommendedPanels: recommendedPanels,
          actualPanels: actualPanelQty,
          panelAdjustment: actualPanelQty - recommendedPanels,
          overrideApplied: overridePanelsVal !== null,
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
            id: selectedPackage.id
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
            monthlySolarGeneration: monthlySolarGeneration.toFixed(2),
            morningUsageKwh: morningUsageKwh.toFixed(2),
            morningSaving: morningSaving.toFixed(2),
            exportKwh: exportKwh.toFixed(2),
            backupGenerationKwh: backupGenerationKwh.toFixed(2),
            backupGenerationSaving: backupGenerationSaving.toFixed(2),
            donatedKwh: donatedKwh.toFixed(2),
            exportSaving: exportSaving.toFixed(2),
            morningUsageRate: morningUsageRate,
            exportRate: exportRate,
            netUsageKwh: netUsageKwh.toFixed(2),
            afterUsageKwh: (afterUsageMatched !== null ? afterUsageMatched : netUsageKwh).toFixed(2),
            billBefore: billBefore.toFixed(2),
            billAfter: afterBill !== null ? afterBill.toFixed(2) : null,
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
              dailyDischarge: dailyMaxDischarge.toFixed(2),
              monthlyDischarge: monthlyMaxDischarge.toFixed(2),
              caps: {
                 excessSolar: dailyExcessSolar.toFixed(2),
                 nightUsage: dailyNightUsage.toFixed(2),
                 batterySize: dailyBatteryCap.toFixed(2)
              },
              baseline: {
                 billReduction: billReductionBaseline.toFixed(2),
                 exportCredit: exportSavingBaseline.toFixed(2),
                 afaImpact: ((monthlyUsageKwh - (afterUsageMatchedBaseline || netUsageBaseline)) * afaRate).toFixed(2),
                 baseBillReduction: (billReductionBaseline - ((monthlyUsageKwh - (afterUsageMatchedBaseline || netUsageBaseline)) * afaRate)).toFixed(2),
                 totalSavings: totalMonthlySavingsBaseline.toFixed(2),
                 billAfter: afterBillBaseline !== null ? afterBillBaseline.toFixed(2) : null,
                 usageAfter: afterUsageMatchedBaseline !== null ? afterUsageMatchedBaseline.toFixed(2) : null,
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
