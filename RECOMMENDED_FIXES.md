// Fixes for identified issues in invoiceRepo.js

// CRITICAL FIX 1: Move action logging AFTER commit
// In createInvoiceOnTheFlyTransaction (around line 690-700)
// In createInvoiceVersionTransaction (around line 990-1000)

// BEFORE (BROKEN):
await _createLineItems(...);
await _logInvoiceAction(...);  // ❌ Logged before commit
await client.query('COMMIT');  // ❌ Orphaned action if commit fails

// AFTER (FIXED):
await _createLineItems(...);
await client.query('COMMIT');  // ✅ Commit first
await _logInvoiceAction(...);  // ✅ Then log (in new query outside transaction)

// OR: Wrap action logging in transaction (preferred):
await client.query(`BEGIN`);
// ... create invoice ...
// ... create items ...
await _logInvoiceAction(...);  // ✅ Part of same transaction
await client.query('COMMIT');  // ✅ All or nothing

// CRITICAL FIX 2: Add try-catch to _logInvoiceAction
// In invoiceRepo.js (line 414)

// BEFORE (BROKEN):
async function _logInvoiceAction(client, invoiceId, actionType, createdBy, extraDetails = {}) {
  const snapshot = await getInvoiceByBubbleId(client, invoiceId);
  if (!snapshot) return;
  const actionId = `act_${crypto.randomBytes(8).toString('hex')}`;
  await client.query(`INSERT INTO invoice_action ...`);  // ❌ No error handling
}

// AFTER (FIXED):
async function _logInvoiceAction(client, invoiceId, actionType, createdBy, extraDetails = {}) {
  try {  // ✅ Add try-catch
    const snapshot = await getInvoiceByBubbleId(client, invoiceId);
    if (!snapshot) {
      console.error(`Failed to capture snapshot for invoice ${invoiceId}`);
      throw new Error(`Snapshot not found for invoice ${invoiceId}`);
    }

    const actionId = `act_${crypto.randomBytes(8).toString('hex')}`;
    const details = {
      ...extraDetails,
      snapshot: snapshot
    };

    await client.query(
      `INSERT INTO invoice_action (bubble_id, invoice_id, action_type, details, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [actionId, invoiceId, actionType, JSON.stringify(details), createdBy]
    );
  } catch (err) {  // ✅ Catch errors
    console.error('Error logging invoice action:', err);
    throw new Error(`Failed to log invoice action: ${err.message}`);
  }
}

// PERFORMANCE FIX 3: Use Promise.all for independent queries
// In getInvoiceByBubbleId (line 325)

// BEFORE (SLOW):
async function getInvoiceByBubbleId(client, bubbleId) {
  const invoiceResult = await client.query(...);  // Wait
  const itemsResult = await client.query(...);  // Wait
  const packageResult = await client.query(...);  // Wait
  // ... total 5-6 sequential queries
}

// AFTER (FAST):
async function getInvoiceByBubbleId(client, bubbleId) {
  try {
    // Query 1: Get invoice
    const invoiceResult = await client.query(...);
    if (invoiceResult.rows.length === 0) return null;
    const invoice = invoiceResult.rows[0];

    // Query 2: Get items
    const itemsResult = await client.query(...);
    invoice.items = itemsResult.rows;

    // Queries 3,4,5: Run in parallel if independent
    const queryPromises = [];

    if (invoice.package_id) {
      queryPromises.push(
        client.query(`SELECT p.panel_qty, p.panel, pr.solar_output_rating
         FROM package p
         LEFT JOIN product pr ON (
           CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
           OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
         )
         WHERE p.bubble_id = $1`,
        [invoice.package_id]
        ).then(res => {
          if (res.rows.length > 0) {
            const packageData = res.rows[0];
            invoice.panel_qty = packageData.panel_qty;
            invoice.panel_rating = packageData.solar_output_rating;
            if (packageData.panel_qty && packageData.solar_output_rating) {
              invoice.system_size_kwp = (packageData.panel_qty * packageData.solar_output_rating) / 1000;
            }
          }
        })
      );
    }

    queryPromises.push(
      client.query(
        `SELECT a.name
         FROM "user" u
         JOIN agent a ON u.linked_agent_profile = a.bubble_id
         WHERE u.id = $1
         LIMIT 1`,
        [invoice.created_by]
      ).then(res => {
        invoice.created_by_user_name = res.rows.length > 0 ? res.rows[0].name : 'System';
      }).catch(() => {
        invoice.created_by_user_name = 'System';
      })
    );

    queryPromises.push(
      (async () => {
        if (invoice.template_id) {
          const templateResult = await client.query(
            `SELECT * FROM invoice_template WHERE bubble_id = $1`,
            [invoice.template_id]
          );
          if (templateResult.rows.length > 0) {
            invoice.template = templateResult.rows[0];
          }
        }
        if (!invoice.template) {
          invoice.template = await getDefaultTemplate(client);
        }
      })()
    );

    await Promise.all(queryPromises);  // ✅ Run all in parallel

    return invoice;
  } catch (err) {
    console.error('Error in getInvoiceByBubbleId:', err);
    throw err;
  }
}

// WORKFLOW FIX 4: Improve redirect UX
// In edit_invoice.html (form submission handler)

// BEFORE (CONFUSING):
alert('Quotation updated successfully! New version saved with action logging.');
window.location.href = result.invoice_link;  // ❌ Redirects to new version

// AFTER OPTION A: Stay on page
alert('Quotation updated successfully! Version ' + newVersion + ' created.');
// Show success message, reload data from API
await fetchUpdatedInvoiceData();  // Reload invoice data
// Don't redirect - user stays on same URL

// AFTER OPTION B: Redirect to My Quotations
alert('Quotation updated successfully! Version ' + newVersion + ' created.');
window.location.href = '/my-invoice';  // ✅ Clear UX: back to list

// AFTER OPTION C: Inform then redirect
alert('Creating new version ' + newVersion + ' of your quotation...\n\nYou will be redirected to the new version.');
setTimeout(() => {
  window.location.href = result.invoice_link;  // ✅ Clear UX: redirect after delay
}, 2000);
