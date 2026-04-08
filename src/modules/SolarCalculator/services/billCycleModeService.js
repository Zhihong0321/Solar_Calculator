const SHORT_BILL_CYCLE_SST_RATE = 0.08;

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundCurrency(value) {
  return Number(toFiniteNumber(value).toFixed(2));
}

function normalizeBillCycleMode(mode) {
  return mode === 'under28Days' ? 'under28Days' : 'fullMonth';
}

function buildBillCycleModes(calculationResult) {
  const details = calculationResult?.details || {};
  const afterBreakdown = calculationResult?.billBreakdownComparison?.after || details?.billBreakdown?.after || null;
  const beforeBreakdown = calculationResult?.billBreakdownComparison?.before || details?.billBreakdown?.before || null;
  const billBefore = toFiniteNumber(details.billBefore, toFiniteNumber(beforeBreakdown?.total));
  const fullBillAfter = toFiniteNumber(details.billAfter, toFiniteNumber(afterBreakdown?.total));
  const actualEeiSaving = toFiniteNumber(details.actualEeiSaving, toFiniteNumber(calculationResult?.savingsBreakdown?.eeiSaving));
  const exportSaving = toFiniteNumber(details.exportSaving);
  const fullBillReduction = toFiniteNumber(details.billReduction, toFiniteNumber(calculationResult?.savingsBreakdown?.billReduction));
  const fullTotalSavings = toFiniteNumber(calculationResult?.monthlySavings);
  const fullPayableAfterSolar = Number.isFinite(Number(details.estimatedPayableAfterSolar))
    ? toFiniteNumber(details.estimatedPayableAfterSolar)
    : Math.max(0, fullBillAfter - exportSaving);
  const currentSst = toFiniteNumber(afterBreakdown?.sst);
  const shortCycleSstBase = toFiniteNumber(afterBreakdown?.usage)
    + toFiniteNumber(afterBreakdown?.network)
    + toFiniteNumber(afterBreakdown?.capacity);
  const recalculatedSst = shortCycleSstBase * SHORT_BILL_CYCLE_SST_RATE;
  const under28BillAfter = Math.max(0, fullBillAfter - currentSst + recalculatedSst);
  const under28GrossBillReduction = Math.max(0, billBefore - under28BillAfter);
  const under28BillReduction = Math.max(0, under28GrossBillReduction - actualEeiSaving);
  const under28TotalSavings = under28BillReduction + actualEeiSaving + exportSaving;
  const under28PayableAfterSolar = Math.max(0, under28BillAfter - exportSaving);

  return {
    fullMonth: {
      key: 'fullMonth',
      label: 'Full Month Bill Cycle',
      billAfter: roundCurrency(fullBillAfter),
      billReduction: roundCurrency(fullBillReduction),
      totalSavings: roundCurrency(fullTotalSavings),
      payableAfterSolar: roundCurrency(fullPayableAfterSolar),
      currentSst: roundCurrency(currentSst),
      recalculatedSst: roundCurrency(currentSst),
      shortCycleSstBase: roundCurrency(shortCycleSstBase),
      exportEarning: roundCurrency(exportSaving),
      actualEeiSaving: roundCurrency(actualEeiSaving),
      estimated_saving: roundCurrency(fullTotalSavings),
      estimated_new_bill_amount: roundCurrency(fullPayableAfterSolar),
      bill_after_solar_before_export: roundCurrency(fullBillAfter),
      export_earning: roundCurrency(exportSaving)
    },
    under28Days: {
      key: 'under28Days',
      label: '<28 Days Bill Cycle',
      billAfter: roundCurrency(under28BillAfter),
      billReduction: roundCurrency(under28BillReduction),
      totalSavings: roundCurrency(under28TotalSavings),
      payableAfterSolar: roundCurrency(under28PayableAfterSolar),
      currentSst: roundCurrency(currentSst),
      recalculatedSst: roundCurrency(recalculatedSst),
      shortCycleSstBase: roundCurrency(shortCycleSstBase),
      exportEarning: roundCurrency(exportSaving),
      actualEeiSaving: roundCurrency(actualEeiSaving),
      estimated_saving: roundCurrency(under28TotalSavings),
      estimated_new_bill_amount: roundCurrency(under28PayableAfterSolar),
      bill_after_solar_before_export: roundCurrency(under28BillAfter),
      export_earning: roundCurrency(exportSaving)
    }
  };
}

function getBillCycleMetrics(calculationResult, mode) {
  const normalizedMode = normalizeBillCycleMode(mode);
  const modes = buildBillCycleModes(calculationResult);
  return {
    mode: normalizedMode,
    modes,
    selected: modes[normalizedMode] || modes.fullMonth
  };
}

module.exports = {
  SHORT_BILL_CYCLE_SST_RATE,
  normalizeBillCycleMode,
  buildBillCycleModes,
  getBillCycleMetrics
};
