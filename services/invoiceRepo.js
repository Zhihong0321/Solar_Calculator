/**
 * Invoice Repository Module
 * Handles all database operations for invoice creation
 */
const crypto = require('crypto');

/**
 * Generate a unique share token
 * @returns {string} Share token
 */
function generateShareToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate next invoice number
 * @param {object} client - Database client
 * @returns {Promise<string>} Invoice number
 */
async function generateInvoiceNumber(client) {
  try {
    // Get last invoice number
    const lastInvoiceResult = await client.query(
      `SELECT invoice_number
       FROM invoice_new
       WHERE invoice_number LIKE 'INV-%'
       ORDER BY invoice_number DESC
       LIMIT 1`
    );

    let nextNum = 1;
    if (lastInvoiceResult.rows.length > 0) {
      try {
        const lastNum = parseInt(lastInvoiceResult.rows[0].invoice_number.replace('INV-', ''));
        nextNum = lastNum + 1;
      } catch (err) {
        nextNum = 1;
      }
    }

    // Pad with zeros (6 digits)
    const numStr = nextNum.toString().padStart(6, '0');
    return `INV-${numStr}`;
  } catch (err) {
    console.error('Error generating invoice number:', err);
    throw new Error('Failed to generate invoice number');
  }
}

/**
 * Get package by bubble_id
 * @param {object} client - Database client
 * @param {string} packageId - Package bubble_id
 * @returns {Promise<object|null>} Package object or null
 */
async function getPackageById(client, packageId) {
  try {
    const result = await client.query(
      `SELECT bubble_id, name, price, panel, panel_qty, invoice_desc, type
       FROM package
       WHERE bubble_id = $1`,
      [packageId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error fetching package:', err);
    return null;
  }
}

/**
 * Get default invoice template
 * @param {object} client - Database client
 * @returns {Promise<object>} Default template data
 */
async function getDefaultTemplate(client) {
  try {
    const result = await client.query(
      `SELECT * FROM invoice_template WHERE is_default = true LIMIT 1`
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Return default template structure if none found
    return {
      company_name: 'Atap Solar',
      company_address: 'Your Company Address',
      company_phone: '+60 1-234-56789',
      sst_registration_no: 'SSR123456789',
      apply_sst: false,
      terms_and_conditions: '1. Payment is due within 30 days.\n2. Goods once sold are not returnable.\n3. Prices are in Malaysian Ringgit.'
    };
  } catch (err) {
    console.error('Error fetching default template:', err);
    return {};
  }
}

/**
 * Get template by bubble_id
 * @param {object} client - Database client
 * @param {string} templateId - Template bubble_id
 * @returns {Promise<object|null>} Template object or null
 */
async function getTemplateById(client, templateId) {
  try {
    const result = await client.query(
      `SELECT * FROM invoice_template WHERE bubble_id = $1`,
      [templateId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error fetching template:', err);
    return null;
  }
}

/**
 * Get voucher by code
 * @param {object} client - Database client
 * @param {string} voucherCode - Voucher code
 * @returns {Promise<object|null>} Voucher object or null
 */
async function getVoucherByCode(client, voucherCode) {
  try {
    const result = await client.query(
      `SELECT * FROM voucher
       WHERE voucher_code = $1 AND active = true
       LIMIT 1`,
      [voucherCode]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error fetching voucher:', err);
    return null;
  }
}

/**
 * Create invoice on the fly
 * @param {object} client - Database client
 * @param {object} data - Invoice data
 * @returns {Promise<object>} Created invoice with share token
 */
async function createInvoiceOnTheFly(client, data) {
  const {
    packageId,
    discountFixed = 0,
    discountPercent = 0,
    applySst = false,
    templateId,
    voucherCode,
    agentMarkup = 0,
    customerName,
    customerPhone,
    customerAddress,
    eppFeeAmount = 0,
    eppFeeDescription = 'EPP Fee'
  } = data;

  try {
    // Start transaction
    await client.query('BEGIN');

    // Get package details
    const package = await getPackageById(client, packageId);
    if (!package) {
      throw new Error(`Package with ID '${packageId}' not found`);
    }

    // Get template (use provided or default)
    let template;
    if (templateId) {
      template = await getTemplateById(client, templateId);
    }
    if (!template) {
      template = await getDefaultTemplate(client);
    }

    // Calculate package price with markup
    const packagePrice = parseFloat(package.price) || 0;
    const markupAmount = parseFloat(agentMarkup) || 0;
    const priceWithMarkup = packagePrice + markupAmount;

    // Calculate discounts
    let discountAmount = 0;
    if (discountFixed > 0) {
      discountAmount += discountFixed;
    }
    if (discountPercent > 0) {
      discountAmount += (priceWithMarkup * discountPercent) / 100;
    }

    // Check and apply voucher
    let voucherAmount = 0;
    let voucherDescription = '';
    if (voucherCode) {
      const voucher = await getVoucherByCode(client, voucherCode);
      if (voucher) {
        if (voucher.discount_amount) {
          voucherAmount = parseFloat(voucher.discount_amount) || 0;
          voucherDescription = voucher.invoice_description || `Voucher: ${voucherCode}`;
        }
        if (voucher.discount_percent) {
          voucherAmount = (priceWithMarkup * (parseFloat(voucher.discount_percent) || 0)) / 100;
          voucherDescription = voucher.invoice_description || `Voucher: ${voucherCode}`;
        }
      }
    }

    // Calculate subtotal (price with markup - discounts)
    const subtotal = Math.max(0, priceWithMarkup - discountAmount - voucherAmount);

    // Calculate SST
    const sstRate = template.apply_sst ? (parseFloat(template.sst_registration_no) || 8) : 0;
    const sstAmount = applySst ? (subtotal * sstRate) / 100 : 0;

    // Calculate total
    const totalAmount = subtotal + sstAmount;

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(client);
    const bubbleId = crypto.randomUUID().toString();

    // Generate share token
    const shareToken = generateShareToken();
    const shareExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Insert invoice
    const invoiceResult = await client.query(
      `INSERT INTO invoice_new
       (bubble_id, template_id, customer_name_snapshot, customer_address_snapshot,
        customer_phone_snapshot, package_id, package_name_snapshot, invoice_number,
        invoice_date, subtotal, agent_markup, sst_rate, sst_amount,
        discount_amount, discount_fixed, discount_percent, voucher_code,
        voucher_amount, total_amount, status, share_token, share_enabled,
        share_expires_at, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
               $25, NOW())
       RETURNING *`,
      [
        bubbleId,
        templateId || null,
        customerName || package.name || 'Customer',
        customerAddress || null,
        customerPhone || null,
        packageId,
        package.name || null,
        invoiceNumber,
        new Date().toISOString().split('T')[0],
        subtotal,
        markupAmount,
        sstRate,
        sstAmount,
        discountAmount,
        discountFixed,
        discountPercent,
        voucherCode || null,
        voucherAmount,
        totalAmount,
        'draft',
        shareToken,
        true,
        shareExpiresAt.toISOString(),
        null // created_by - set to current user if auth is available
      ]
    );

    const invoice = invoiceResult.rows[0];

    // Insert package item
    const packageItemBubbleId = crypto.randomUUID().toString();
    await client.query(
      `INSERT INTO invoice_new_item
       (bubble_id, invoice_id, product_id, product_name_snapshot, description,
        qty, unit_price, discount_percent, total_price, item_type, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 10, NOW())`,
      [
        packageItemBubbleId,
        bubbleId,
        package.panel || null,
        package.name || null,
        package.invoice_desc || package.name || 'Solar Package',
        1,
        priceWithMarkup,
        discountPercent,
        priceWithMarkup,
        'package',
        0
      ]
    );

    // Insert discount item (if any)
    if (discountAmount > 0) {
      const discountItemBubbleId = crypto.randomUUID().toString();
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 20, NOW())`,
        [
          discountItemBubbleId,
          bubbleId,
          'Discount',
          1,
          -discountAmount,
          0,
          -discountAmount,
          'discount',
          20
        ]
      );
    }

    // Insert voucher item (if any)
    if (voucherAmount > 0) {
      const voucherItemBubbleId = crypto.randomUUID().toString();
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 30, NOW())`,
        [
          voucherItemBubbleId,
          bubbleId,
          voucherDescription || 'Voucher',
          1,
          -voucherAmount,
          0,
          -voucherAmount,
          'voucher',
          30
        ]
      );
    }

    // Insert EPP fee item (if any)
    if (eppFeeAmount > 0) {
      const eppItemBubbleId = crypto.randomUUID().toString();
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 40, NOW())`,
        [
          eppItemBubbleId,
          bubbleId,
          eppFeeDescription || 'EPP Fee',
          1,
          eppFeeAmount,
          0,
          eppFeeAmount,
          'epp_fee',
          40
        ]
      );
    }

    // Commit transaction
    await client.query('COMMIT');

    return {
      ...invoice,
      items: [],
      template: template
    };
  } catch (err) {
    // Rollback on error
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating invoice:', err);
    throw err;
  }
}

/**
 * Get invoice by share token
 * @param {object} client - Database client
 * @param {string} shareToken - Share token
 * @returns {Promise<object|null>} Invoice object with items or null
 */
async function getInvoiceByShareToken(client, shareToken) {
  try {
    const invoiceResult = await client.query(
      `SELECT * FROM invoice_new
       WHERE share_token = $1
         AND share_enabled = true
         AND (share_expires_at IS NULL OR share_expires_at > NOW())
       LIMIT 1`,
      [shareToken]
    );

    if (invoiceResult.rows.length === 0) {
      return null;
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsResult = await client.query(
      `SELECT * FROM invoice_new_item
       WHERE invoice_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [invoice.bubble_id]
    );

    invoice.items = itemsResult.rows;

    // Get template
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

    return invoice;
  } catch (err) {
    console.error('Error fetching invoice by share token:', err);
    return null;
  }
}

/**
 * Record invoice view
 * @param {object} client - Database client
 * @param {string} invoiceId - Invoice bubble_id
 */
async function recordInvoiceView(client, invoiceId) {
  try {
    await client.query(
      `UPDATE invoice_new
       SET viewed_at = NOW(),
           share_access_count = COALESCE(share_access_count, 0) + 1
       WHERE bubble_id = $1`,
      [invoiceId]
    );
  } catch (err) {
    console.error('Error recording invoice view:', err);
  }
}

module.exports = {
  generateShareToken,
  generateInvoiceNumber,
  getPackageById,
  getDefaultTemplate,
  getTemplateById,
  getVoucherByCode,
  createInvoiceOnTheFly,
  getInvoiceByShareToken,
  recordInvoiceView
};
