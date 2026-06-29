// Standalone Battery V2 sanity test — does NOT require a database.
// It replicates the V2 formulas from solarCalculatorService.js.

function calculateBatteryFlowV2({
  monthlySolarGeneration,
  morningUsageKwh,
  batterySizeVal,
  batteryLossPercent = 0,
  batteryDodPercent = 5
}) {
  const nonOffsetSolarKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh);
  const dailyNonOffsetSolarKwh = nonOffsetSolarKwh / 30;
  const roundTripEfficiency = Math.max(0, 1 - (batteryLossPercent / 100));
  const oneWayEfficiency = roundTripEfficiency > 0 ? Math.sqrt(roundTripEfficiency) : 0;
  const usableBatteryCapacityKwh = Math.max(0, batterySizeVal * (1 - (batteryDodPercent / 100)));
  const effectiveStorageKwh = usableBatteryCapacityKwh * roundTripEfficiency;

  const dailyInputNeededForFullBatteryKwh = oneWayEfficiency > 0
    ? usableBatteryCapacityKwh / oneWayEfficiency
    : 0;
  const dailySolarToBatteryInputKwh = Math.min(dailyNonOffsetSolarKwh, dailyInputNeededForFullBatteryKwh);
  const dailyBatteryDischargeKwh = effectiveStorageKwh;
  const monthlySolarToBatteryInputKwh = dailySolarToBatteryInputKwh * 30;
  const monthlyBatteryDischargeKwh = dailyBatteryDischargeKwh * 30;

  const dailyStoredInternalKwh = dailySolarToBatteryInputKwh * oneWayEfficiency;
  const dailyChargeLossKwh = Math.max(0, dailySolarToBatteryInputKwh - dailyStoredInternalKwh);

  const dailyPotentialExportKwh = Math.max(0, dailyNonOffsetSolarKwh - dailySolarToBatteryInputKwh);
  const monthlyPotentialExportKwh = dailyPotentialExportKwh * 30;

  return {
    nonOffsetSolarKwh,
    dailyNonOffsetSolarKwh,
    roundTripEfficiency,
    oneWayEfficiency,
    usableBatteryCapacityKwh,
    effectiveStorageKwh,
    dailySolarToBatteryInputKwh,
    monthlySolarToBatteryInputKwh,
    dailyStoredInternalKwh,
    dailyChargeLossKwh,
    dailyBatteryDischargeKwh,
    monthlyBatteryDischargeKwh,
    dailyPotentialExportKwh,
    monthlyPotentialExportKwh
  };
}

function simpleBill(usageKwh) {
  if (usageKwh <= 0) return 3.0;
  let cost = 3.0;
  if (usageKwh <= 200) cost += usageKwh * 0.218;
  else if (usageKwh <= 300) cost += 200 * 0.218 + (usageKwh - 200) * 0.334;
  else if (usageKwh <= 600) cost += 200 * 0.218 + 100 * 0.334 + (usageKwh - 300) * 0.516;
  else if (usageKwh <= 900) cost += 200 * 0.218 + 100 * 0.334 + 300 * 0.516 + (usageKwh - 600) * 0.546;
  else cost += 200 * 0.218 + 100 * 0.334 + 300 * 0.516 + 300 * 0.546 + (usageKwh - 900) * 0.571;
  cost += 10 + (usageKwh * 0.05) + (cost * 0.06);
  return cost;
}

function calculateV2(billAmount, sunPeakHour, morningUsagePercent, panelWattage, batterySize, batteryLossPercent, batteryDodPercent, smpPrice, overrideExtraPanels = 0) {
  // Estimate monthly usage from bill
  let low = 0, high = 5000;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (simpleBill(mid) < billAmount) low = mid;
    else high = mid;
  }
  const monthlyUsageKwh = (low + high) / 2;

  // Panel recommendation, with optional override for high-export scenarios.
  const recommendedPanels = Math.max(1, Math.floor(monthlyUsageKwh / sunPeakHour / 30 / 0.62));
  const actualPanelQty = recommendedPanels + overrideExtraPanels;

  // Solar generation
  const dailySolarGeneration = (actualPanelQty * panelWattage * sunPeakHour) / 1000;
  const monthlySolarGeneration = dailySolarGeneration * 30;

  // Consumption split
  const morningUsageKwh = (monthlySolarGeneration * morningUsagePercent) / 100;
  const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);

  // Battery V2
  const batteryFlowV2 = calculateBatteryFlowV2({
    monthlySolarGeneration,
    morningUsageKwh,
    batterySizeVal: batterySize,
    batteryLossPercent,
    batteryDodPercent
  });

  const netUsageV2Kwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption - batteryFlowV2.monthlyBatteryDischargeKwh);
  const exportV2Kwh = Math.min(batteryFlowV2.monthlyPotentialExportKwh, netUsageV2Kwh);
  const exportRateV2 = netUsageV2Kwh >= 1501 ? 0.3703 : 0.2703;
  const exportEarningsV2Raw = exportV2Kwh * exportRateV2;

  const beforeBill = simpleBill(monthlyUsageKwh);
  const afterBillV2 = simpleBill(netUsageV2Kwh);

  const totalSavingsV2 = Math.max(0, beforeBill - afterBillV2) + exportEarningsV2Raw;
  const estimatedPayableV2 = Math.max(0, afterBillV2 - exportEarningsV2Raw);

  return {
    monthlyUsageKwh: monthlyUsageKwh.toFixed(1),
    monthlySolarGeneration: monthlySolarGeneration.toFixed(1),
    morningUsageKwh: morningUsageKwh.toFixed(1),
    usableCapacity: batteryFlowV2.usableBatteryCapacityKwh.toFixed(2),
    effectiveStorage: batteryFlowV2.effectiveStorageKwh.toFixed(2),
    dailyCharge: batteryFlowV2.dailySolarToBatteryInputKwh.toFixed(2),
    monthlyCharge: batteryFlowV2.monthlySolarToBatteryInputKwh.toFixed(1),
    dailyDischarge: batteryFlowV2.dailyBatteryDischargeKwh.toFixed(2),
    monthlyDischarge: batteryFlowV2.monthlyBatteryDischargeKwh.toFixed(1),
    potentialExport: batteryFlowV2.monthlyPotentialExportKwh.toFixed(1),
    exportKwh: exportV2Kwh.toFixed(1),
    exportRate: exportRateV2.toFixed(4),
    exportEarnings: exportEarningsV2Raw.toFixed(2),
    creditBank: (batteryFlowV2.monthlyPotentialExportKwh - exportV2Kwh).toFixed(1),
    beforeBill: beforeBill.toFixed(2),
    afterBillV2: afterBillV2.toFixed(2),
    totalSavingsV2: totalSavingsV2.toFixed(2),
    estimatedPayableV2: estimatedPayableV2.toFixed(2)
  };
}

console.log('=== Battery V2 Sanity Test ===\n');
const scenarios = [
  { bill: 500, peakHour: 3.5, morning: 30, panels: 650, battery: 16, loss: 0, dod: 5, smp: 0.25 },
  { bill: 500, peakHour: 3.5, morning: 30, panels: 650, battery: 16, loss: 10, dod: 5, smp: 0.25 },
  { bill: 800, peakHour: 3.5, morning: 30, panels: 650, battery: 32, loss: 0, dod: 5, smp: 0.25 },
  { bill: 1500, peakHour: 3.8, morning: 25, panels: 650, battery: 48, loss: 0, dod: 5, smp: 0.2703 },
  { bill: 2000, peakHour: 4.0, morning: 20, panels: 650, battery: 48, loss: 0, dod: 5, smp: 0.2703 },
  // High-export / low-import: small bill, oversized PV, big battery, low morning offset.
  // Solar >> load; battery charges to full every day; discharge zeros out grid import;
  // export cap (== newImport) collapses to 0; overflow sits in credit bank.
  { bill: 250, peakHour: 4.5, morning: 10, panels: 650, battery: 48, loss: 0, dod: 5, smp: 0.2703, extraPanels: 12 }
];

for (const s of scenarios) {
  const r = calculateV2(s.bill, s.peakHour, s.morning, s.panels, s.battery, s.loss, s.dod, s.smp, s.extraPanels || 0);
  console.log(`\nScenario: Bill RM ${s.bill}, ${s.battery}kWh battery, loss ${s.loss}%, DoD ${s.dod}%`);
  console.log(`  Usage: ${r.monthlyUsageKwh} kWh | Solar: ${r.monthlySolarGeneration} kWh | Morning: ${r.morningUsageKwh} kWh`);
  console.log(`  Effective storage: ${r.effectiveStorage} kWh | Monthly discharge: ${r.monthlyDischarge} kWh`);
  console.log(`  Charge: ${r.monthlyCharge} kWh | Potential export: ${r.potentialExport} kWh | Export: ${r.exportKwh} kWh @ RM ${r.exportRate}`);
  console.log(`  Export earnings: RM ${r.exportEarnings} | Credit bank: ${r.creditBank} kWh`);
  console.log(`  Before: RM ${r.beforeBill} | After V2: RM ${r.afterBillV2} | Total savings: RM ${r.totalSavingsV2} | Payable: RM ${r.estimatedPayableV2}`);
}
