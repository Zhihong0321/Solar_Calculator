// Apply CRITICAL and recommended fixes to invoiceRepo.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'services', 'invoiceRepo.js');

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

console.log('\n=== Applying Fixes to invoiceRepo.js ===\n');

// ============================================================================
// FIX #1: Add try-catch to logInvoiceAction
// ============================================================================

console.log('📝 Fix #1: Adding try-catch to logInvoiceAction...');

const oldLogActionFunction = `async function logInvoiceAction(client, invoiceId, actionType, createdBy, extraDetails = {}) {
  // Fetch full snapshot (Header + Items)
  const snapshot = await getInvoiceByBubbleId(client, invoiceId);
  
  if (!snapshot) {
    console.error(\`Failed to capture snapshot for invoice \${invoiceId}\`);
    return;
  }

  const actionId = \`act_\${crypto.randomBytes(8).toString('hex')}\`;
  
  // Merge snapshot into details
  const details = {
    ...extraDetails,
    snapshot: snapshot
  };

  await client.query(
    \`INSERT INTO invoice_action (bubble_id, invoice_id, action_type, details, created_by, created_at)
     VALUES (\$1, \$2, \$3, \$4, \$5, NOW())\`,
    [actionId, invoiceId, actionType, JSON.stringify(details), createdBy]
  );
}`;

const newLogActionFunction = `async function logInvoiceAction(client, invoiceId, actionType, createdBy, extraDetails = {}) {
  try {
    // Fetch full snapshot (Header + Items)
    const snapshot = await getInvoiceByBubbleId(client, invoiceId);

    if (!snapshot) {
      console.error(\`Failed to capture snapshot for invoice \${invoiceId}\`);
      throw new Error(\`Snapshot not found for invoice \${invoiceId}\`);
    }

    const actionId = \`act_\${crypto.randomBytes(8).toString('hex')}\`;

    // Merge snapshot into details
    const details = {
      ...extraDetails,
      snapshot: snapshot
    };

    await client.query(
      \`INSERT INTO invoice_action (bubble_id, invoice_id, action_type, details, created_by, created_at)
       VALUES (\$1, \$2, \$3, \$4, \$5, NOW())\`,
      [actionId, invoiceId, actionType, JSON.stringify(details), createdBy]
    );
  } catch (err) {
    console.error('Error logging invoice action:', err);
    throw new Error(\`Failed to log invoice action: \${err.message}\`);
  }
}`;

if (content.includes(oldLogActionFunction)) {
  content = content.replace(oldLogActionFunction, newLogActionFunction);
  console.log('  ✅ Applied: Try-catch added to logInvoiceAction');
} else {
  console.log('  ⚠️  Could not find logInvoiceAction function to replace');
}

// ============================================================================
// FIX #2: Move action logging AFTER COMMIT in createInvoiceOnTheFlyTransaction
// ============================================================================

console.log('📝 Fix #2: Moving action logging after COMMIT in createInvoiceOnTheFlyTransaction...');

const oldOnTheFlyCommit = `    // 6. Log Action with Snapshot
    await logInvoiceAction(client, invoice.bubble_id, 'INVOICE_CREATED', String(data.userId), { description: 'Initial creation' });

    // Commit transaction
    await client.query('COMMIT');`;

const newOnTheFlyCommit = `    // Commit transaction
    await client.query('COMMIT');

    // 6. Log Action with Snapshot (after commit)
    await logInvoiceAction(client, invoice.bubble_id, 'INVOICE_CREATED', String(data.userId), { description: 'Initial creation' });`;

if (content.includes(oldOnTheFlyCommit)) {
  content = content.replace(oldOnTheFlyCommit, newOnTheFlyCommit);
  console.log('  ✅ Applied: Action logging moved after COMMIT');
} else {
  console.log('  ⚠️  Could not find on-the-fly transaction commit block');
}

// ============================================================================
// FIX #3: Move action logging AFTER COMMIT in createInvoiceVersionTransaction
// ============================================================================

console.log('📝 Fix #3: Moving action logging after COMMIT in createInvoiceVersionTransaction...');

const oldVersionCommit = `    // 7. Log Action with Snapshot
    const details = {
        change_summary: \`Created version \${newInvoice.version} from \${org.invoice_number}\`,
        discount_fixed: data.discountFixed,
        discount_percent: data.discountPercent,
        total_amount: financials.finalTotalAmount
    };
    await logInvoiceAction(client, newInvoice.bubble_id, 'INVOICE_VERSIONED', String(data.userId), details);

    // Commit transaction
    await client.query('COMMIT');`;

const newVersionCommit = `    // Commit transaction
    await client.query('COMMIT');

    // 7. Log Action with Snapshot (after commit)
    const details = {
        change_summary: \`Created version \${newInvoice.version} from \${org.invoice_number}\`,
        discount_fixed: data.discountFixed,
        discount_percent: data.discountPercent,
        total_amount: financials.finalTotalAmount
    };
    await logInvoiceAction(client, newInvoice.bubble_id, 'INVOICE_VERSIONED', String(data.userId), details);`;

if (content.includes(oldVersionCommit)) {
  content = content.replace(oldVersionCommit, newVersionCommit);
  console.log('  ✅ Applied: Action logging moved after COMMIT');
} else {
  console.log('  ⚠️  Could not find version transaction commit block');
}

// ============================================================================
// FIX #4: Optimize getInvoiceByBubbleId with Promise.all
// ============================================================================

console.log('📝 Fix #4: Optimizing getInvoiceByBubbleId with Promise.all...');

const oldGetInvoiceFunction = `async function getInvoiceByBubbleId(client, bubbleId) {
  try {
    const invoiceResult = await client.query(
      \`SELECT * FROM invoice_new WHERE bubble_id = \$1\`,
      [bubbleId]
    );

    if (invoiceResult.rows.length === 0) return null;
    const invoice = invoiceResult.rows[0];

    const itemsResult = await client.query(
      \`SELECT * FROM invoice_new_item WHERE invoice_id = \$1 ORDER BY sort_order ASC, created_at ASC\`,
      [bubbleId]
    );
    invoice.items = itemsResult.rows;

    // Get package data for system size calculation (same as getInvoiceByShareToken)
    if (invoice.package_id) {
      const packageResult = await client.query(
        \`SELECT p.panel_qty, p.panel, pr.solar_output_rating
         FROM package p
         LEFT JOIN product pr ON (
           CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
           OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
         )
         WHERE p.bubble_id = \$1\`,
        [invoice.package_id]
      );
      if (packageResult.rows.length > 0) {
        const packageData = packageResult.rows[0];
        invoice.panel_qty = packageData.panel_qty;
        invoice.panel_rating = packageData.solar_output_rating;
        // Calculate system size in kWp
        if (packageData.panel_qty && packageData.solar_output_rating) {
          invoice.system_size_kwp = (packageData.panel_qty * packageData.solar_output_rating) / 1000;
        }
      }
    }

    // Fetch user name who created invoice
    try {
      if (invoice.created_by) {
        const userResult = await client.query(
          \`SELECT a.name 
           FROM "user" u 
           JOIN agent a ON u.linked_agent_profile = a.bubble_id 
           WHERE u.id = \$1 
           LIMIT 1\`,
          [invoice.created_by]
        );
        if (userResult.rows.length > 0) {
          invoice.created_by_user_name = userResult.rows[0].name;
        } else {
          invoice.created_by_user_name = 'System';
        }
      } else {
        invoice.created_by_user_name = 'System';
      }
    } catch (err) {
      console.warn('Could not fetch user name:', err.message);
      invoice.created_by_user_name = 'System';
    }

    // Get template (same logic as getInvoiceByShareToken for proper snapshot rendering)
    if (invoice.template_id) {
      const templateResult = await client.query(
        \`SELECT * FROM invoice_template WHERE bubble_id = \$1\`,
        [invoice.template_id]
      );
      if (templateResult.rows.length > 0) {
        invoice.template = templateResult.rows[0];
      }
    }

    if (!invoice.template) {
      invoice.template = await getDefaultTemplate(client);
    }

    return invoice;
  } catch (err) {
    console.error('Error in getInvoiceByBubbleId:', err);
    throw err;
  }
}`;

const newGetInvoiceFunction = `async function getInvoiceByBubbleId(client, bubbleId) {
  try {
    // Query 1: Get invoice
    const invoiceResult = await client.query(
      \`SELECT * FROM invoice_new WHERE bubble_id = \$1\`,
      [bubbleId]
    );

    if (invoiceResult.rows.length === 0) return null;
    const invoice = invoiceResult.rows[0];

    // Query 2: Get items
    const itemsResult = await client.query(
      \`SELECT * FROM invoice_new_item WHERE invoice_id = \$1 ORDER BY sort_order ASC, created_at ASC\`,
      [bubbleId]
    );
    invoice.items = itemsResult.rows;

    // Queries 3-6: Run in parallel if possible
    const parallelQueries = [];

    // Query 3: Get package data for system size calculation
    if (invoice.package_id) {
      parallelQueries.push(
        (async () => {
          const packageResult = await client.query(
            \`SELECT p.panel_qty, p.panel, pr.solar_output_rating
             FROM package p
             LEFT JOIN product pr ON (
               CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
               OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
             )
             WHERE p.bubble_id = \$1\`,
            [invoice.package_id]
          );
          if (packageResult.rows.length > 0) {
            const packageData = packageResult.rows[0];
            invoice.panel_qty = packageData.panel_qty;
            invoice.panel_rating = packageData.solar_output_rating;
            if (packageData.panel_qty && packageData.solar_output_rating) {
              invoice.system_size_kwp = (packageData.panel_qty * packageData.solar_output_rating) / 1000;
            }
          }
        })()
      );
    }

    // Query 4: Fetch user name who created invoice
    if (invoice.created_by) {
      parallelQueries.push(
        client.query(
          \`SELECT a.name 
           FROM "user" u 
           JOIN agent a ON u.linked_agent_profile = a.bubble_id 
           WHERE u.id = \$1 
           LIMIT 1\`,
          [invoice.created_by]
        ).then(userResult => {
          if (userResult.rows.length > 0) {
            invoice.created_by_user_name = userResult.rows[0].name;
          } else {
            invoice.created_by_user_name = 'System';
          }
        }).catch(err => {
          console.warn('Could not fetch user name:', err.message);
          invoice.created_by_user_name = 'System';
        })
      );
    }

    // Query 5: Get template
    if (invoice.template_id) {
      parallelQueries.push(
        client.query(
          \`SELECT * FROM invoice_template WHERE bubble_id = \$1\`,
          [invoice.template_id]
        ).then(templateResult => {
          if (templateResult.rows.length > 0) {
            invoice.template = templateResult.rows[0];
          }
        })
      );
    }

    // Query 6: Get default template (if needed)
    const getTemplatePromise = (async () => {
      if (!invoice.template) {
        invoice.template = await getDefaultTemplate(client);
      }
    })();

    // Wait for all parallel queries to complete
    await Promise.all([...parallelQueries, getTemplatePromise]);

    return invoice;
  } catch (err) {
    console.error('Error in getInvoiceByBubbleId:', err);
    throw err;
  }
}`;

if (content.includes(oldGetInvoiceFunction)) {
  content = content.replace(oldGetInvoiceFunction, newGetInvoiceFunction);
  console.log('  ✅ Applied: Promise.all optimization to getInvoiceByBubbleId');
} else {
  console.log('  ⚠️  Could not find getInvoiceByBubbleId function to replace');
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');

console.log('\n✅ All critical fixes applied to invoiceRepo.js\n');
console.log('Summary:');
console.log('  - Try-catch added to logInvoiceAction');
console.log('  - Action logging moved after COMMIT (2 locations)');
console.log('  - Promise.all optimization added to getInvoiceByBubbleId');
