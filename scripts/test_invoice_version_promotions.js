const assert = require('assert');

const invoiceService = require('../src/modules/Invoicing/services/invoiceService');
const invoiceRepo = require('../src/modules/Invoicing/services/invoiceRepo');
const sedaService = require('../src/modules/Invoicing/services/sedaService');

async function runCase(payload) {
  let capturedRepoPayload = null;

  const originalUpdateInvoiceTransaction = invoiceRepo.updateInvoiceTransaction;
  const originalEnsureSedaRegistration = sedaService.ensureSedaRegistration;

  invoiceRepo.updateInvoiceTransaction = async (_client, repoPayload) => {
    capturedRepoPayload = repoPayload;
    return {
      bubble_id: 'inv_test_001',
      invoice_number: 'INV-TEST-001',
      total_amount: 1000,
      subtotal: 1000,
      sst_amount: 0,
      discount_amount: 0,
      voucher_amount: 0,
      share_token: 'share-token-test',
      customerBubbleId: 'cust_test_001'
    };
  };

  sedaService.ensureSedaRegistration = async () => {};

  try {
    const pool = {
      connect: async () => ({
        release() {}
      })
    };

    const result = await invoiceService.createInvoiceVersion(pool, 'inv_original_001', {
      userId: 'user_test_001',
      auditActor: {
        contact: '0123456789'
      },
      ...payload
    });

    assert.strictEqual(result.success, true, 'Expected version save to succeed');
    return capturedRepoPayload;
  } finally {
    invoiceRepo.updateInvoiceTransaction = originalUpdateInvoiceTransaction;
    sedaService.ensureSedaRegistration = originalEnsureSedaRegistration;
  }
}

(async () => {
  const snakeCasePayload = await runCase({
    apply_earn_now_rebate: true,
    apply_earth_month_go_green_bonus: true
  });

  assert.strictEqual(snakeCasePayload.applyEarnNowRebate, true, 'Snake-case Earn Now flag should reach repo payload');
  assert.strictEqual(
    snakeCasePayload.applyEarthMonthGoGreenBonus,
    true,
    'Snake-case Earth Month flag should reach repo payload'
  );

  const camelCasePayload = await runCase({
    applyEarnNowRebate: false,
    applyEarthMonthGoGreenBonus: true
  });

  assert.strictEqual(camelCasePayload.applyEarnNowRebate, false, 'Camel-case Earn Now flag should reach repo payload');
  assert.strictEqual(
    camelCasePayload.applyEarthMonthGoGreenBonus,
    true,
    'Camel-case Earth Month flag should reach repo payload'
  );

  console.log('Invoice version promotion flag regression test passed.');
})().catch((error) => {
  console.error('Invoice version promotion flag regression test failed.');
  console.error(error);
  process.exit(1);
});
