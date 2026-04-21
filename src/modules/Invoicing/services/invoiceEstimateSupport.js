/**
 * [AI-CONTEXT]
 * Domain: Invoicing Estimate Support
 * Primary Responsibility: Normalize optional solar estimate inputs and map them into invoice persistence fields.
 * Stability: Keep estimate-field wiring here so invoiceRepo can focus on the persistence flow instead of repeated field plumbing.
 */
const ESTIMATE_FIELD_CONFIG = [
  {
    column: 'customer_average_tnb',
    dataKey: 'customerAverageTnb',
    currentKey: 'customer_average_tnb'
  },
  {
    column: 'estimated_saving',
    dataKey: 'estimatedSaving',
    currentKey: 'estimated_saving'
  },
  {
    column: 'estimated_new_bill_amount',
    dataKey: 'estimatedNewBillAmount',
    currentKey: 'estimated_new_bill_amount'
  },
  {
    column: 'solar_sun_peak_hour',
    dataKey: 'solarSunPeakHour',
    currentKey: 'solar_sun_peak_hour'
  },
  {
    column: 'solar_morning_usage_percent',
    dataKey: 'solarMorningUsagePercent',
    currentKey: 'solar_morning_usage_percent'
  }
];

function normalizeNullableNumber(value, { integer = false } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  const parsed = integer ? Math.round(numericValue) : parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeInvoiceEstimateInput(data) {
  return ESTIMATE_FIELD_CONFIG.reduce((acc, field) => {
    acc[field.dataKey] = normalizeNullableNumber(data[field.dataKey]);
    return acc;
  }, {});
}

function appendInvoiceEstimateInsertFields(invoiceColumns, data, insertColumns, values) {
  const normalized = normalizeInvoiceEstimateInput(data);

  for (const field of ESTIMATE_FIELD_CONFIG) {
    if (!invoiceColumns.has(field.column)) continue;
    insertColumns.push(field.column);
    values.push(normalized[field.dataKey]);
  }
}

function appendInvoiceEstimateUpdateFields(invoiceColumns, data, currentData, updateAssignments, updateValues, startIndex) {
  let nextIndex = startIndex;

  for (const field of ESTIMATE_FIELD_CONFIG) {
    if (!invoiceColumns.has(field.column)) continue;

    updateAssignments.push(`${field.column} = $${nextIndex++}`);
    updateValues.push(
      data[field.dataKey] !== undefined
        ? normalizeNullableNumber(data[field.dataKey])
        : currentData[field.currentKey]
    );
  }

  return nextIndex;
}

module.exports = {
  appendInvoiceEstimateInsertFields,
  appendInvoiceEstimateUpdateFields,
  normalizeInvoiceEstimateInput,
  normalizeNullableNumber
};
