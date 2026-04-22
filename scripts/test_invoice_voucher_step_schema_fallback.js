const assert = require('assert/strict');

const {
  getVoucherStepData,
  loadVoucherCategoriesForSummary
} = require('../src/modules/Invoicing/services/invoiceVoucherSupport');

function createMockClient() {
  return {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from invoice i')) {
        return {
          rows: [{
            bubble_id: 'inv-1',
            invoice_number: 'INV-001',
            total_amount: 15000,
            voucher_code: null,
            linked_package: 'pkg-1',
            customer_name: 'Draft Customer',
            package_price: 15000,
            panel_qty: 12,
            package_type: 'Residential'
          }]
        };
      }

      if (normalized.includes('from invoice_voucher_selection')) {
        return { rows: [] };
      }

      if (normalized.includes('from voucher_category')) {
        return {
          rows: [{
            bubble_id: 'cat-1',
            name: 'Starter Offers',
            description: 'Legacy schema category',
            active: true,
            created_at: '2026-04-01T00:00:00.000Z'
          }]
        };
      }

      if (normalized.includes('from voucher') && Array.isArray(params) && params[0] === 'cat-1') {
        return {
          rows: [{
            bubble_id: 'voucher-1',
            linked_voucher_category: 'cat-1',
            title: 'RM100 Off',
            voucher_code: 'SAVE100',
            discount_amount: 100,
            discount_percent: null,
            created_at: '2026-04-01T00:00:00.000Z'
          }]
        };
      }

      throw new Error(`Unexpected query in schema fallback test: ${sql}`);
    }
  };
}

function createDeps() {
  return {
    async hasTable(_client, tableName) {
      return tableName === 'voucher_category';
    },
    async getTableColumns(_client, tableName) {
      if (tableName === 'voucher_category') {
        return new Set(['bubble_id', 'name', 'description', 'active', 'created_at']);
      }

      if (tableName === 'voucher') {
        return new Set([
          'bubble_id',
          'linked_voucher_category',
          'title',
          'voucher_code',
          'discount_amount',
          'discount_percent',
          'created_at'
        ]);
      }

      return new Set();
    },
    async getInvoiceSelectedVoucherRows() {
      return [];
    }
  };
}

async function testLoadVoucherCategoriesForSummarySupportsLegacySchema() {
  const client = createMockClient();
  const deps = createDeps();
  const invoiceSummary = {
    packagePrice: 15000,
    panelQty: 12,
    packageTypeScope: 'resi'
  };

  const categories = await loadVoucherCategoriesForSummary(client, invoiceSummary, deps);

  assert.equal(categories.length, 1);
  assert.equal(categories[0].disabled, false);
  assert.equal(categories[0].max_selectable, 1);
  assert.equal(categories[0].package_type_scope, 'all');
  assert.equal(categories[0].eligible, true);
  assert.equal(categories[0].vouchers.length, 1);
  assert.equal(categories[0].vouchers[0].active, true);
  assert.equal(categories[0].vouchers[0].delete, false);
}

async function testGetVoucherStepDataSupportsLegacySchema() {
  const client = createMockClient();
  const deps = createDeps();

  const result = await getVoucherStepData(client, 'inv-1', deps);

  assert.equal(result.invoice.bubble_id, 'inv-1');
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].vouchers[0].voucher_code, 'SAVE100');
  assert.deepEqual(result.selectedVoucherIds, []);
  assert.deepEqual(result.selectedVoucherCodes, []);
}

async function main() {
  await testLoadVoucherCategoriesForSummarySupportsLegacySchema();
  await testGetVoucherStepDataSupportsLegacySchema();
  console.log('Invoice voucher step schema fallback checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
