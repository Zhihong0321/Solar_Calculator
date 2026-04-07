function parseOptionalCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundCurrency(value) {
  const numeric = parseOptionalCurrency(value);
  return numeric === null ? null : Number(numeric.toFixed(2));
}

function normalizeSolarEstimateFields({
  requestedBillAmount = null,
  customerAverageTnb = null,
  estimatedSaving = null,
  estimatedNewBillAmount = null,
  billAfterSolarBeforeExport = null,
  exportEarning = null,
  payableAfterSolar = null
} = {}) {
  const normalizedRequestedBillAmount = roundCurrency(requestedBillAmount);
  const beforeSolarBill = roundCurrency(customerAverageTnb) ?? normalizedRequestedBillAmount;
  const monthlySaving = roundCurrency(estimatedSaving);
  const storedAfterSolarBill = roundCurrency(estimatedNewBillAmount);
  const normalizedBillAfterSolar = parseOptionalCurrency(billAfterSolarBeforeExport);
  const normalizedExportEarning = parseOptionalCurrency(exportEarning);
  const normalizedPayableAfterSolar = roundCurrency(payableAfterSolar);

  const fallbackAfterSolarBill = normalizedBillAfterSolar !== null && normalizedExportEarning !== null
    ? Number(Math.max(0, normalizedBillAfterSolar - normalizedExportEarning).toFixed(2))
    : (beforeSolarBill !== null && monthlySaving !== null
      ? Number(Math.max(0, beforeSolarBill - monthlySaving).toFixed(2))
      : null);

  return {
    requestedBillAmount: normalizedRequestedBillAmount,
    beforeSolarBill,
    estimatedSaving: monthlySaving,
    estimatedNewBillAmount: normalizedPayableAfterSolar ?? storedAfterSolarBill ?? fallbackAfterSolarBill,
    billAfterSolarBeforeExport: roundCurrency(billAfterSolarBeforeExport),
    exportEarning: roundCurrency(exportEarning),
    payableAfterSolar: normalizedPayableAfterSolar
  };
}

module.exports = {
  parseOptionalCurrency,
  normalizeSolarEstimateFields
};
