const assert = require('assert/strict');

const {
  fetchInvoiceDependencies,
  findOrCreateCustomer,
  resolveLinkedReferral,
  syncReferralInvoiceLink
} = require('../src/modules/Invoicing/services/invoiceDependencySupport');

async function testFindOrCreateCustomerInsertsNewCustomer() {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (/FROM customer WHERE name =/.test(sql) || /FROM customer WHERE customer_id =/.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO customer/.test(sql)) {
        return { rows: [{ id: 17 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  const result = await findOrCreateCustomer(client, {
    name: 'Alice',
    phone: '123',
    address: 'Street',
    createdBy: 'u1'
  });

  assert.equal(result.id, 17);
  assert.match(result.bubbleId, /^cust_/);
  assert.equal(calls.length, 2);
}

async function testResolveLinkedReferralReturnsNullWithoutReferral() {
  const result = await resolveLinkedReferral({}, 'u1', null, { referralRepo: {} });
  assert.equal(result, null);
}

async function testSyncReferralInvoiceLinkExecutesExpectedQueries() {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [] };
    }
  };

  await syncReferralInvoiceLink(client, 'inv-1', 'ref-1');
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE referral/);
  assert.match(calls[1].sql, /UPDATE referral/);
}

async function testFetchInvoiceDependenciesUsesProvidedHelpers() {
  const client = {
    async query() {
      return { rows: [{ linked_agent_profile: 'agent-1' }] };
    }
  };

  const result = await fetchInvoiceDependencies(client, {
    userId: 'u1',
    packageId: 'pkg-1',
    customerName: 'Alice',
    customerPhone: '123',
    customerAddress: 'Street'
  }, {
    getPackageById: async () => ({ bubble_id: 'pkg-1' }),
    getTemplateById: async () => null,
    getDefaultTemplate: async () => ({ bubble_id: 'default' }),
    findOrCreateCustomer: async () => ({ id: 9, bubbleId: 'cust-9' })
  });

  assert.equal(result.linkedAgent, 'agent-1');
  assert.equal(result.internalCustomerId, 9);
  assert.equal(result.customerBubbleId, 'cust-9');
  assert.equal(result.pkg.bubble_id, 'pkg-1');
}

async function main() {
  await testFindOrCreateCustomerInsertsNewCustomer();
  await testResolveLinkedReferralReturnsNullWithoutReferral();
  await testSyncReferralInvoiceLinkExecutesExpectedQueries();
  await testFetchInvoiceDependenciesUsesProvidedHelpers();
  console.log('Invoice dependency support checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
