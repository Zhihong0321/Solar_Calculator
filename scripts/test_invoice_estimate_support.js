const assert = require('assert/strict');

const {
  appendInvoiceEstimateInsertFields,
  appendInvoiceEstimateUpdateFields,
  normalizeInvoiceEstimateInput,
  normalizeNullableNumber
} = require('../src/modules/Invoicing/services/invoiceEstimateSupport');

function testNormalizeNullableNumber() {
  assert.equal(normalizeNullableNumber('12.5'), 12.5);
  assert.equal(normalizeNullableNumber(''), null);
  assert.equal(normalizeNullableNumber('abc'), null);
}

function testNormalizeInvoiceEstimateInput() {
  const normalized = normalizeInvoiceEstimateInput({
    customerAverageTnb: '450.55',
    estimatedSaving: '180.25',
    estimatedNewBillAmount: '',
    solarSunPeakHour: '3.4',
    solarMorningUsagePercent: '30'
  });

  assert.deepEqual(normalized, {
    customerAverageTnb: 450.55,
    estimatedSaving: 180.25,
    estimatedNewBillAmount: null,
    solarSunPeakHour: 3.4,
    solarMorningUsagePercent: 30
  });
}

function testAppendInvoiceEstimateInsertFields() {
  const insertColumns = [];
  const values = [];
  appendInvoiceEstimateInsertFields(
    new Set(['customer_average_tnb', 'estimated_saving', 'solar_sun_peak_hour']),
    {
      customerAverageTnb: '500',
      estimatedSaving: '200',
      solarSunPeakHour: '3.5'
    },
    insertColumns,
    values
  );

  assert.deepEqual(insertColumns, ['customer_average_tnb', 'estimated_saving', 'solar_sun_peak_hour']);
  assert.deepEqual(values, [500, 200, 3.5]);
}

function testAppendInvoiceEstimateUpdateFields() {
  const updateAssignments = [];
  const updateValues = [];
  const nextIndex = appendInvoiceEstimateUpdateFields(
    new Set(['customer_average_tnb', 'estimated_saving', 'estimated_new_bill_amount']),
    {
      customerAverageTnb: '600',
      estimatedSaving: undefined,
      estimatedNewBillAmount: ''
    },
    {
      customer_average_tnb: 450,
      estimated_saving: 190,
      estimated_new_bill_amount: 75
    },
    updateAssignments,
    updateValues,
    4
  );

  assert.equal(nextIndex, 7);
  assert.deepEqual(updateAssignments, [
    'customer_average_tnb = $4',
    'estimated_saving = $5',
    'estimated_new_bill_amount = $6'
  ]);
  assert.deepEqual(updateValues, [600, 190, null]);
}

function main() {
  testNormalizeNullableNumber();
  testNormalizeInvoiceEstimateInput();
  testAppendInvoiceEstimateInsertFields();
  testAppendInvoiceEstimateUpdateFields();
  console.log('Invoice estimate support checks passed.');
}

main();
