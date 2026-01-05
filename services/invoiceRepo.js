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
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
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
 * Find or create a customer
 * @param {object} client - Database client
 * @param {object} data - Customer data
 * @returns {Promise<number|null>} Internal customer ID
 */
async function findOrCreateCustomer(client, data) {
  const { name, phone, address, createdBy } = data;
  if (!name) return null;

  try {
    // 1. Try to find by name
    const findRes = await client.query(
      'SELECT id FROM customer WHERE name = $1 LIMIT 1',
      [name]
    );
    if (findRes.rows.length > 0) {
      return findRes.rows[0].id;
    }

    // 2. Create new if not found
    const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;
    const insertRes = await client.query(
      `INSERT INTO customer (customer_id, name, phone, address, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [customerBubbleId, name, phone, address, createdBy]
    );
    return insertRes.rows[0].id;
  } catch (err) {
    console.error('Error in findOrCreateCustomer:', err);
    return null;
  }
}

/**
 * Create invoice on the fly
 * @param {object} client - Database client
 * @param {object} data - Invoice data (must include userId)
 * @returns {Promise<object>} Created invoice with share token
 */
async function createInvoiceOnTheFly(client, data) {
  const {
    userId, 
    packageId,
    discountFixed = 0,
    discountPercent = 0,
    applySst = false,
    templateId,
    voucherCode,       // Legacy single voucher
    voucherCodes = [], // New multiple vouchers
    agentMarkup = 0,
    customerName,
    customerPhone,
    customerAddress,
    eppFeeAmount = 0,
    eppFeeDescription = 'EPP Fee',
    paymentStructure = null
  } = data;

  // Validate userId exists
  if (!userId) {
    throw new Error('User ID is required.');
  }

  try {
    // Start transaction
    await client.query('BEGIN');

    // Store userId directly from JWT token (created_by is VARCHAR, no FK constraint)
    // This ensures invoices are properly linked to the user who created them
    const finalCreatedBy = String(userId);

    // 1. Get package details
    const package = await getPackageById(client, packageId);
    if (!package) {
      throw new Error(`Package with ID '${packageId}' not found`);
    }

    // 2. Handle Customer
    const internalCustomerId = await findOrCreateCustomer(client, {
      name: customerName,
      phone: customerPhone,
      address: customerAddress,
      createdBy: userId
    });

    // 3. Get template
    let template;
    if (templateId) {
      template = await getTemplateById(client, templateId);
    }
    if (!template) {
      template = await getDefaultTemplate(client);
    }

    // 4. Calculate prices
    const packagePrice = parseFloat(package.price) || 0;
    const markupAmount = parseFloat(agentMarkup) || 0;
    const priceWithMarkup = packagePrice + markupAmount;

    // 5. Check vouchers (Multiple)
    // Consolidate codes: prefer voucherCodes array, fallback to voucherCode string
    let finalVoucherCodes = [];
    if (Array.isArray(voucherCodes) && voucherCodes.length > 0) {
      finalVoucherCodes = [...voucherCodes];
    } else if (voucherCode) {
      finalVoucherCodes = [voucherCode];
    }

    // Remove duplicates
    finalVoucherCodes = [...new Set(finalVoucherCodes)];

    let totalVoucherAmount = 0;
    const voucherItemsToCreate = [];
    const validVoucherCodes = [];

    for (const code of finalVoucherCodes) {
      const voucher = await getVoucherByCode(client, code);
      if (voucher) {
        let amount = 0;
        let desc = '';
        
        if (voucher.discount_amount) {
          amount = parseFloat(voucher.discount_amount) || 0;
          desc = voucher.invoice_description || `Voucher: ${code}`;
        } else if (voucher.discount_percent) {
          amount = (packagePrice * parseFloat(voucher.discount_percent)) / 100;
          desc = voucher.invoice_description || `Voucher: ${code}`;
        }
        
        if (amount > 0) {
          totalVoucherAmount += amount;
          validVoucherCodes.push(code);
          voucherItemsToCreate.push({
            description: desc,
            amount: amount,
            code: code
          });
        }
      }
    }

    // 6. Base items subtotal (package + markup)
    let runningSubtotal = priceWithMarkup;

    // 7. Calculate discount amount from percent
    let percentDiscountVal = 0;
    if (discountPercent > 0) {
      percentDiscountVal = (packagePrice * discountPercent) / 100;
    }
    
    // Subtotal after ALL adjustments (discounts, vouchers, epp fees)
    // taxable subtotal = package + markup - discounts - vouchers
    const taxableSubtotal = Math.max(0, priceWithMarkup - discountFixed - percentDiscountVal - totalVoucherAmount);
    
    // 8. Calculate SST (6% rate)
    const sstRate = applySst ? 6.0 : 0;
    const sstAmount = applySst ? (taxableSubtotal * sstRate) / 100 : 0;

    // 9. Total amount including SST and EPP fees
    const finalTotalAmount = taxableSubtotal + sstAmount + parseFloat(eppFeeAmount);

    // 10. Generate basic invoice info
    const invoiceNumber = await generateInvoiceNumber(client);
    const bubbleId = crypto.randomUUID().toString();
    const shareToken = generateShareToken();
    const shareExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 11. Insert invoice header
    const invoiceResult = await client.query(
      `INSERT INTO invoice_new
       (bubble_id, template_id, customer_id, customer_name_snapshot, customer_address_snapshot,
        customer_phone_snapshot, package_id, package_name_snapshot, invoice_number,
        invoice_date, subtotal, agent_markup, sst_rate, sst_amount,
        discount_amount, discount_fixed, discount_percent, voucher_code,
        voucher_amount, total_amount, status, share_token, share_enabled,
        share_expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
       RETURNING *`,
      [
        bubbleId,
        templateId || null,
        internalCustomerId,
        customerName || "Sample Quotation",
        customerAddress || null,
        customerPhone || null,
        packageId,
        package.name || null,
        invoiceNumber,
        new Date().toISOString().split('T')[0],
        taxableSubtotal, // subtotal in DB is taxable subtotal
        markupAmount,
        sstRate,
        sstAmount,
        discountFixed + percentDiscountVal, // discount_amount is sum
        discountFixed,
        discountPercent,
        validVoucherCodes.join(', ') || null,
        totalVoucherAmount,
        finalTotalAmount,
        'draft',
        shareToken,
        true,
        shareExpiresAt.toISOString(),
        finalCreatedBy
      ]
    );

    const invoice = invoiceResult.rows[0];

    // 12. Insert package item
    const packageItemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_new_item
       (bubble_id, invoice_id, product_id, product_name_snapshot, description,
        qty, unit_price, discount_percent, total_price, item_type, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        packageItemBubbleId,
        bubbleId,
        package.panel || null,
        package.name || null,
        package.invoice_desc || package.name || 'Solar Package',
        1,
        priceWithMarkup,
        0, // discount is handled as separate item
        priceWithMarkup,
        'package',
        0
      ]
    );

    // 13. Insert discount items
    let sortOrder = 100;
    if (discountFixed > 0) {
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          `item_${crypto.randomBytes(8).toString('hex')}`,
          bubbleId,
          `Discount (RM ${discountFixed})`,
          1,
          -discountFixed,
          0,
          -discountFixed,
          'discount',
          sortOrder++
        ]
      );
    }

    if (discountPercent > 0) {
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          `item_${crypto.randomBytes(8).toString('hex')}`,
          bubbleId,
          `Discount (${discountPercent}%)`,
          1,
          -percentDiscountVal,
          discountPercent,
          -percentDiscountVal,
          'discount',
          sortOrder++
        ]
      );
    }

    // 14. Insert voucher items (Loop)
    for (const vItem of voucherItemsToCreate) {
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          `item_${crypto.randomBytes(8).toString('hex')}`,
          bubbleId,
          vItem.description,
          1,
          -vItem.amount,
          0,
          -vItem.amount,
          'voucher',
          101 // We keep same sort order or increment? Keeping same groups them.
        ]
      );
    }

    // 15. Insert EPP fee item
    if (eppFeeAmount > 0) {
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          `item_${crypto.randomBytes(8).toString('hex')}`,
          bubbleId,
          `Bank Processing Fee (${eppFeeDescription})`,
          1,
          eppFeeAmount,
          0,
          eppFeeAmount,
          'epp_fee',
          200
        ]
      );
    }

    // 16. Insert Payment Structure Notice (RM0)
    if (paymentStructure) {
      await client.query(
        `INSERT INTO invoice_new_item
         (bubble_id, invoice_id, description, qty, unit_price,
          discount_percent, total_price, item_type, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          `item_${crypto.randomBytes(8).toString('hex')}`,
          bubbleId,
          paymentStructure,
          1,
          0,
          0,
          0,
          'notice',
          250
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

    // Get package data for system size calculation
    if (invoice.package_id) {
      const packageResult = await client.query(
        `SELECT p.panel_qty, p.panel, pr.solar_output_rating
         FROM package p
         LEFT JOIN product pr ON (
           CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
           OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
         )
         WHERE p.bubble_id = $1`,
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

    // Fetch user name who created the invoice
    try {
      if (invoice.created_by) {
        // Try to fetch from users table (if exists) or fallback
        try {
            const userResult = await client.query(
            `SELECT name FROM users WHERE id = $1 LIMIT 1`,
            [invoice.created_by]
            );
            if (userResult.rows.length > 0) {
            invoice.created_by_user_name = userResult.rows[0].name;
            } else {
                invoice.created_by_user_name = 'System';
            }
        } catch (tableErr) {
            console.warn('Could not fetch user name (users table might be missing):', tableErr.message);
            invoice.created_by_user_name = 'System';
        }
      } else {
        invoice.created_by_user_name = 'System';
      }
    } catch (err) {
      console.warn('Error setting created_by_user_name:', err);
      invoice.created_by_user_name = 'System';
    }

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

/**
 * Get invoices by user ID (created_by) - DIRECT POSTGRESQL QUERY
 * @param {object} client - Database client
 * @param {string} userId - User ID (VARCHAR/UUID string from JWT)
 * @param {object} options - Query options (limit, offset)
 * @returns {Promise<object>} { invoices: Array, total: number }
 */
async function getInvoicesByUserId(client, userId, options = {}) {
  const limit = parseInt(options.limit) || 100;
  const offset = parseInt(options.offset) || 0;

  // DIRECT POSTGRESQL QUERY - created_by is VARCHAR, userId is string from JWT
  const query = `
    SELECT 
      bubble_id,
      invoice_number,
      invoice_date,
      customer_name_snapshot,
      package_name_snapshot,
      subtotal,
      sst_amount,
      total_amount,
      status,
      share_token,
      share_enabled,
      created_at,
      updated_at,
      viewed_at,
      share_access_count
    FROM invoice_new
    WHERE created_by = $1::varchar
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const countQuery = `
    SELECT COUNT(*) as total 
    FROM invoice_new 
    WHERE created_by = $1::varchar
  `;

  const [result, countResult] = await Promise.all([
    client.query(query, [String(userId), limit, offset]),
    client.query(countQuery, [String(userId)])
  ]);

  return {
    invoices: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit,
    offset
  };
}

/**
 * Get all public, active vouchers
 * @param {object} client - Database client
 * @returns {Promise<Array>} List of vouchers
 */
async function getPublicVouchers(client) {
  try {
    const result = await client.query(
      `SELECT * FROM voucher 
       WHERE public = true 
         AND active = true 
         AND (delete = false OR delete IS NULL)
       ORDER BY sort_order ASC, created_at DESC`
    );
    return result.rows;
  } catch (err) {
    // If sort_order doesn't exist, try without it
    try {
        const result = await client.query(
            `SELECT * FROM voucher 
             WHERE public = true 
               AND active = true 
               AND (delete = false OR delete IS NULL)
             ORDER BY created_at DESC`
          );
          return result.rows;
    } catch (retryErr) {
        console.error('Error fetching public vouchers:', retryErr);
        return [];
    }
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
  recordInvoiceView,
  getInvoicesByUserId,
  getPublicVouchers
};
