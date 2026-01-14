// Apply fixes to invoiceRepo.js
// This file contains the complete fixed getInvoiceByBubbleId function

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'services', 'invoiceRepo.js');

// Read the file
let content = fs.readFileSync(filePath, 'utf-8');

// FIX 1: Replace getInvoiceByBubbleId function
const oldFunction = `async function getInvoiceByBubbleId(client, bubbleId) {
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

    return invoice;
  } catch (err) {
    console.error('Error in getInvoiceByBubbleId:', err);
    throw err;
  }
}`;

const newFunction = `async function getInvoiceByBubbleId(client, bubbleId) {
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

// Apply FIX 1
if (content.includes(oldFunction)) {
  console.log('✓ Applying FIX 1: Updating getInvoiceByBubbleId function...');
  content = content.replace(oldFunction, newFunction);
} else {
  console.log('✗ FIX 1: Could not find getInvoiceByBubbleId function to replace');
  console.log('  Checking if function exists:', content.includes('function getInvoiceByBubbleId'));
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');
console.log('✓ Applied all fixes to invoiceRepo.js');
