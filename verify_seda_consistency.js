const { Pool } = require('pg');
const invoiceService = require('./src/modules/Invoicing/services/invoiceService');
const invoiceRepo = require('./src/modules/Invoicing/services/invoiceRepo');
const sedaService = require('./src/modules/Invoicing/services/sedaService');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function runTest() {
    const client = await pool.connect();
    try {
        console.log('--- STARTING SEDA CONSISTENCY TEST ---');
        
        // 1. Setup Test Data
        const userId = '1743046333602x572201987825473600'; // Existing user ID from context
        // Fetch a valid package ID
        const pkgRes = await client.query("SELECT bubble_id FROM package LIMIT 1");
        const packageId = pkgRes.rows[0].bubble_id;
        
        console.log(`Using Package: ${packageId}`);

        // 2. Create Invoice
        const payload1 = {
            userId: userId,
            packageId: packageId,
            customerName: 'Test Customer A',
            customerPhone: '0123456789',
            customerAddress: '123 Test St'
        };

        const res1 = await invoiceService.createInvoice(pool, payload1); // Use pool as expected
        if (!res1.success) throw new Error(res1.error);
        
        const invId1 = res1.data.bubbleId;
        console.log(`Invoice 1 Created: ${invId1}`);

        // Verify SEDA 1
        const seda1Res = await client.query("SELECT * FROM seda_registration WHERE $1 = ANY(linked_invoice)", [invId1]);
        if (seda1Res.rows.length === 0) throw new Error('SEDA not created for Invoice 1');
        const seda1 = seda1Res.rows[0];
        console.log(`SEDA 1 Created: ${seda1.bubble_id}`);
        console.log(`SEDA 1 Customer: ${seda1.linked_customer}`);

        // Verify Links 1
        const inv1Res = await client.query("SELECT linked_seda_registration, linked_customer FROM invoice WHERE bubble_id = $1", [invId1]);
        if (inv1Res.rows[0].linked_seda_registration !== seda1.bubble_id) throw new Error('Invoice -> SEDA link broken');
        
        const cust1Id = inv1Res.rows[0].linked_customer;
        const cust1Res = await client.query("SELECT linked_seda_registration FROM customer WHERE customer_id = $1", [cust1Id]);
        if (cust1Res.rows[0].linked_seda_registration !== seda1.bubble_id) throw new Error('Customer -> SEDA link broken');
        
        console.log('Test 1 (Creation) PASSED');

        // 3. Update Invoice (Change Customer)
        // Simulate changing customer details which triggers finding/creating new customer
        const updatePayload = {
            userId: userId,
            originalBubbleId: invId1,
            customerName: 'Test Customer B', // Name change -> New Customer
            customerPhone: '9876543210'
        };

        const res2 = await invoiceService.createInvoiceVersion(pool, invId1, updatePayload);
        if (!res2.success) throw new Error(res2.error);
        
        // Note: createInvoiceVersion updates the SAME bubble_id row
        console.log(`Invoice Updated (Versioned)`);

        // Verify SEDA 2 (Should be same SEDA, updated Customer)
        const seda2Res = await client.query("SELECT * FROM seda_registration WHERE bubble_id = $1", [seda1.bubble_id]);
        const seda2 = seda2Res.rows[0];
        
        const inv2Res = await client.query("SELECT linked_customer FROM invoice WHERE bubble_id = $1", [invId1]);
        const cust2Id = inv2Res.rows[0].linked_customer;

        if (cust1Id === cust2Id) throw new Error('Customer ID did not change (Test setup failed)');
        
        console.log(`Old Customer: ${cust1Id}`);
        console.log(`New Customer: ${cust2Id}`);
        console.log(`SEDA Linked Customer: ${seda2.linked_customer}`);

        if (seda2.linked_customer !== cust2Id) throw new Error('SEDA linked_customer NOT updated to new customer!');

        // Verify New Customer -> SEDA Link
        const cust2Res = await client.query("SELECT linked_seda_registration FROM customer WHERE customer_id = $1", [cust2Id]);
        if (cust2Res.rows[0].linked_seda_registration !== seda1.bubble_id) throw new Error('New Customer -> SEDA link broken');

        console.log('Test 2 (Update Customer) PASSED');

    } catch (err) {
        console.error('TEST FAILED:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runTest();
