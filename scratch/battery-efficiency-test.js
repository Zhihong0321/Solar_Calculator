// Test script to trace battery efficiency impact on savings
// Uses the same calculation logic as the app

const DEFAULT_BATTERY_LOSS_PERCENT = 0;
const DEFAULT_BATTERY_DOD_PERCENT = 5;

const clampPercent = (value, min, max, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
};

function calculateBatteryFlow({
    monthlySolarGeneration,
    morningUsageKwh,
    dailyNightUsageKwh = 0,
    batterySizeVal,
    batteryLossPercent = DEFAULT_BATTERY_LOSS_PERCENT,
    batteryDodPercent = DEFAULT_BATTERY_DOD_PERCENT
}) {
    const nonOffsetSolarKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh);
    const dailyNonOffsetSolarKwh = nonOffsetSolarKwh / 30;
    const roundTripEfficiency = Math.max(0, 1 - (batteryLossPercent / 100));
    const oneWayEfficiency = roundTripEfficiency > 0 ? Math.sqrt(roundTripEfficiency) : 0;
    const usableBatteryCapacityKwh = Math.max(0, batterySizeVal * (1 - (batteryDodPercent / 100)));
    const dailyInputNeededForFullBatteryKwh = oneWayEfficiency > 0 ? (usableBatteryCapacityKwh / oneWayEfficiency) : 0;
    const dailyInputNeededForNightLoadKwh = roundTripEfficiency > 0 ? (dailyNightUsageKwh / roundTripEfficiency) : 0;
    const dailySolarToBatteryInputKwh = Math.min(
        dailyNonOffsetSolarKwh,
        dailyInputNeededForFullBatteryKwh,
        dailyInputNeededForNightLoadKwh
    );
    const dailyStoredInternalKwh = dailySolarToBatteryInputKwh * oneWayEfficiency;
    const dailyBatteryDeliveredKwh = Math.min(dailyStoredInternalKwh * oneWayEfficiency, dailyNightUsageKwh);
    const monthlySolarToBatteryInputKwh = dailySolarToBatteryInputKwh * 30;
    const monthlyBatteryStoredKwh = dailyBatteryDeliveredKwh * 30;

    return {
        nonOffsetSolarKwh,
        dailyNonOffsetSolarKwh,
        roundTripEfficiency,
        chargeEfficiency: oneWayEfficiency,
        dischargeEfficiency: oneWayEfficiency,
        batteryLossPercent,
        batteryDodPercent,
        usableBatteryCapacityKwh,
        dailySolarToBatteryInputKwh,
        monthlySolarToBatteryInputKwh,
        dailyStoredInternalKwh,
        dailyBatteryDeliveredKwh,
        monthlyBatteryStoredKwh,
    };
}

// Simplified tariff: ~RM 0.50/kWh for usage, with some fixed charges
function simpleBill(usageKwh) {
    if (usageKwh <= 0) return 3.0; // minimum charge
    // Approximate TNB domestic tariff structure
    let cost = 3.0; // fixed
    if (usageKwh <= 200) cost += usageKwh * 0.218;
    else if (usageKwh <= 300) cost += 200 * 0.218 + (usageKwh - 200) * 0.334;
    else if (usageKwh <= 600) cost += 200 * 0.218 + 100 * 0.334 + (usageKwh - 300) * 0.516;
    else if (usageKwh <= 900) cost += 200 * 0.218 + 100 * 0.334 + 300 * 0.516 + (usageKwh - 600) * 0.546;
    else cost += 200 * 0.218 + 100 * 0.334 + 300 * 0.516 + 300 * 0.546 + (usageKwh - 900) * 0.571;
    // Add network, capacity, SST roughly
    cost += 10 + (usageKwh * 0.05) + (cost * 0.06);
    return cost;
}

function calculateSavings(billAmount, sunPeakHour, morningUsagePercent, panelWattage, batterySize, batteryLossPercent, batteryDodPercent, smpPrice) {
    // 1. Estimate monthly usage from bill
    // Binary search for usage that produces the bill
    let low = 0, high = 5000;
    let monthlyUsageKwh = 0;
    for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        if (simpleBill(mid) < billAmount) low = mid;
        else high = mid;
    }
    monthlyUsageKwh = (low + high) / 2;

    // 2. Panel recommendation
    const recommendedPanels = Math.max(1, Math.floor(monthlyUsageKwh / sunPeakHour / 30 / 0.62));
    const actualPanelQty = recommendedPanels;

    // 3. Solar generation
    const dailySolarGeneration = (actualPanelQty * panelWattage * sunPeakHour) / 1000;
    const monthlySolarGeneration = dailySolarGeneration * 30;

    // 4. Consumption split
    const morningUsageKwh = (monthlySolarGeneration * morningUsagePercent) / 100;
    const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);
    const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;

    // 5. Battery
    const batteryFlow = calculateBatteryFlow({
        monthlySolarGeneration,
        morningUsageKwh,
        dailyNightUsageKwh: dailyNightUsage,
        batterySizeVal: batterySize,
        batteryLossPercent,
        batteryDodPercent
    });
    const monthlyMaxDischarge = batteryFlow.monthlyBatteryStoredKwh;

    // 6. Baseline (no battery)
    const netUsageBaseline = Math.max(0, monthlyUsageKwh - morningSelfConsumption);
    const potentialExportBaseline = Math.max(0, monthlySolarGeneration - morningUsageKwh);
    const exportKwhBaseline = Math.min(potentialExportBaseline, netUsageBaseline);
    const netImportBaselineKwh = Math.max(0, netUsageBaseline - exportKwhBaseline);

    // 7. With battery
    const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption - monthlyMaxDischarge);
    const potentialExport = Math.max(0, monthlySolarGeneration - morningUsageKwh - batteryFlow.monthlySolarToBatteryInputKwh);
    const exportKwh = Math.min(potentialExport, netUsageKwh);
    const netImportKwh = Math.max(0, netUsageKwh - exportKwh);

    // 8. Bills
    const beforeBill = simpleBill(monthlyUsageKwh);
    const afterBillBaseline = simpleBill(netImportBaselineKwh);
    const afterBill = simpleBill(netImportKwh);

    // 9. Savings
    const exportRate = netUsageKwh > 1500 ? 0.3703 : smpPrice;
    const exportRateBaseline = netUsageBaseline > 1500 ? 0.3703 : smpPrice;
    const exportSavingBaselineRaw = exportKwhBaseline * exportRateBaseline;
    const exportSavingRaw = exportKwh * exportRate;
    const exportSavingBaseline = Math.min(exportSavingBaselineRaw, afterBillBaseline);
    const exportSaving = Math.min(exportSavingRaw, afterBill);

    const billReductionBaseline = Math.max(0, beforeBill - afterBillBaseline);
    const billReduction = Math.max(0, beforeBill - afterBill);

    const totalSavingsBaseline = billReductionBaseline + exportSavingBaseline;
    const totalSavings = billReduction + exportSaving;

    return {
        monthlyUsageKwh: monthlyUsageKwh.toFixed(1),
        monthlySolarGeneration: monthlySolarGeneration.toFixed(1),
        morningUsageKwh: morningUsageKwh.toFixed(1),
        dailyNightUsage: dailyNightUsage.toFixed(2),
        batterySize,
        batteryLossPercent,
        batteryDodPercent,
        monthlyMaxDischarge: monthlyMaxDischarge.toFixed(1),
        monthlySolarToBatteryInputKwh: batteryFlow.monthlySolarToBatteryInputKwh.toFixed(1),
        netUsageBaseline: netUsageBaseline.toFixed(1),
        netUsageKwh: netUsageKwh.toFixed(1),
        exportKwhBaseline: exportKwhBaseline.toFixed(1),
        exportKwh: exportKwh.toFixed(1),
        beforeBill: beforeBill.toFixed(2),
        afterBillBaseline: afterBillBaseline.toFixed(2),
        afterBill: afterBill.toFixed(2),
        billReductionBaseline: billReductionBaseline.toFixed(2),
        billReduction: billReduction.toFixed(2),
        exportSavingBaseline: exportSavingBaseline.toFixed(2),
        exportSaving: exportSaving.toFixed(2),
        totalSavingsBaseline: totalSavingsBaseline.toFixed(2),
        totalSavings: totalSavings.toFixed(2),
        batteryValueAdd: (totalSavings - totalSavingsBaseline).toFixed(2),
        limitingFactor: batteryFlow.dailySolarToBatteryInputKwh === batteryFlow.dailyNonOffsetSolarKwh ? 'solar' :
                         batteryFlow.dailySolarToBatteryInputKwh === (batteryFlow.usableBatteryCapacityKwh / batteryFlow.chargeEfficiency) ? 'battery_capacity' : 'night_load'
    };
}

// Test scenarios
console.log("=== Battery Efficiency Impact Test ===\n");

const scenarios = [
    { bill: 500, peakHour: 3.5, morning: 30, panels: 650, battery: 16, smp: 0.25 },
    { bill: 800, peakHour: 3.5, morning: 30, panels: 650, battery: 32, smp: 0.25 },
    { bill: 300, peakHour: 3.5, morning: 50, panels: 650, battery: 16, smp: 0.25 },
    { bill: 1200, peakHour: 4.0, morning: 20, panels: 650, battery: 48, smp: 0.25 },
    { bill: 500, peakHour: 3.5, morning: 30, panels: 650, battery: 16, smp: 0.25 }, // low morning usage
];

for (const s of scenarios) {
    console.log(`\n--- Scenario: Bill RM ${s.bill}, ${s.battery}kWh battery, ${s.peakHour}h peak, ${s.morning}% morning ---`);
    console.log("Loss% | MaxDischarge | InputToBatt | NetUsage | Export | BillAfter | TotalSavings | LimitingFactor");
    for (const loss of [0, 5, 10, 15, 20]) {
        const r = calculateSavings(s.bill, s.peakHour, s.morning, s.panels, s.battery, loss, 5, s.smp);
        console.log(`  ${loss.toString().padStart(2)}%  | ${r.monthlyMaxDischarge.padStart(10)} | ${r.monthlySolarToBatteryInputKwh.padStart(11)} | ${r.netUsageKwh.padStart(8)} | ${r.exportKwh.padStart(6)} | ${r.afterBill.padStart(9)} | ${r.totalSavings.padStart(12)} | ${r.limitingFactor}`);
    }
}
