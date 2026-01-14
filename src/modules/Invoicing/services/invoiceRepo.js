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
       FROM invoice
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
      `SELECT bubble_id, package_name as name, price, panel, panel_qty, invoice_desc, type
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
 * @returns {Promise<object|null>} { id: number, bubbleId: string } or null
 */
async function findOrCreateCustomer(client, data) {
  const { name, phone, address, createdBy } = data;
  if (!name) return null;

  try {
    // 1. Try to find by name
    const findRes = await client.query(
      'SELECT id, customer_id, phone, address FROM customer WHERE name = $1 LIMIT 1',
      [name]
    );
    
    if (findRes.rows.length > 0) {
      const customer = findRes.rows[0];
      const id = customer.id;
      const bubbleId = customer.customer_id;
      
      // Update if phone or address changed
      if ((phone && phone !== customer.phone) || (address && address !== customer.address)) {
        await client.query(
          `UPDATE customer 
           SET phone = COALESCE($1, phone), 
               address = COALESCE($2, address),
               updated_at = NOW(),
               updated_by = $4
           WHERE id = $3`,
          [phone, address, id, String(createdBy)]
        );
      }
      return { id, bubbleId };
    }

    // 2. Create new if not found
    const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;
    const insertRes = await client.query(
      `INSERT INTO customer (customer_id, name, phone, address, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [customerBubbleId, name, phone, address, createdBy]
    );
    return { id: insertRes.rows[0].id, bubbleId: customerBubbleId };
  } catch (err) {
    console.error('Error in findOrCreateCustomer:', err);
    return null;
  }
}

/**
 * Helper: Fetch all necessary dependencies for invoice creation
 * @private
 */
async function _fetchDependencies(client, data) {
  const { userId, packageId, customerName, customerPhone, customerAddress, templateId } = data;

  // 1. Get package details
  const pkg = await getPackageById(client, packageId);
  if (!pkg) {
    throw new Error(`Package with ID '${packageId}' not found`);
  }

  // 2. Handle Customer
  const customerResult = await findOrCreateCustomer(client, {
    name: customerName,
    phone: customerPhone,
    address: customerAddress,
    createdBy: userId
  });
  
  const internalCustomerId = customerResult ? customerResult.id : null;
  const customerBubbleId = customerResult ? customerResult.bubbleId : null;

  // 3. Get template
  let template;
  if (templateId) {
    template = await getTemplateById(client, templateId);
  }
  if (!template) {
    template = await getDefaultTemplate(client);
  }

  return { pkg, internalCustomerId, customerBubbleId, template };
}

/**
 * Helper: Process vouchers and calculate total voucher amount
 * @private
 */
async function _processVouchers(client, { voucherCodes, voucherCode }, packagePrice) {
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

  return { totalVoucherAmount, voucherItemsToCreate, validVoucherCodes };
}

/**
 * Helper: Calculate all financial totals
 * @private
 */
function _calculateFinancials(data, packagePrice, totalVoucherAmount) {
  const { agentMarkup = 0, discountFixed = 0, discountPercent = 0, applySst = false, eppFeeAmount = 0, extraItems = [] } = data;

  const markupAmount = parseFloat(agentMarkup) || 0;
  const priceWithMarkup = packagePrice + markupAmount;

  // Calculate total of extra items
  let extraItemsTotal = 0;
  if (Array.isArray(extraItems)) {
      extraItemsTotal = extraItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
  }

  // Calculate discount amount from percent
  let percentDiscountVal = 0;
  if (discountPercent > 0) {
    percentDiscountVal = (packagePrice * discountPercent) / 100;
  }
  
  // Subtotal after ALL adjustments (discounts, vouchers, epp fees, extra items)
  // taxable subtotal = package + markup + extra items - discounts - vouchers
  const taxableSubtotal = Math.max(0, priceWithMarkup + extraItemsTotal - discountFixed - percentDiscountVal - totalVoucherAmount);
  
  // Calculate SST (6% rate)
  const sstRate = applySst ? 6.0 : 0;
  const sstAmount = applySst ? (taxableSubtotal * sstRate) / 100 : 0;

  // Total amount including SST and EPP fees
  const finalTotalAmount = taxableSubtotal + sstAmount + parseFloat(eppFeeAmount);

  return {
    markupAmount,
    priceWithMarkup,
    percentDiscountVal,
    taxableSubtotal,
    sstRate,
    sstAmount,
    finalTotalAmount
  };
}

/**
 * Reconstruct viewable invoice from action snapshot
 * @param {object} actionDetails - The JSON object stored in invoice_action.details
 * @returns {object} The viewable invoice object
 */
function reconstructInvoiceFromSnapshot(actionDetails) {
  if (!actionDetails || !actionDetails.snapshot) {
    return null;
  }
  return actionDetails.snapshot;
}

/**
 * Get single invoice by bubble_id including items
 * @param {object} client - Database client
 * @param {string} bubbleId - Invoice bubble_id
 * @returns {Promise<object|null>} Invoice with items or null
 */
async function getInvoiceByBubbleId(client, bubbleId) {
  try {
    // Query 1: Get invoice
    const invoiceResult = await client.query(
      `SELECT * FROM invoice WHERE bubble_id = $1`,
      [bubbleId]
    );

    if (invoiceResult.rows.length === 0) return null;
    const invoice = invoiceResult.rows[0];

    // Query 2: Get items
    const itemsResult = await client.query(
      `SELECT * FROM invoice_new_item WHERE invoice_id = $1 ORDER BY sort_order ASC, created_at ASC`,
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
          `SELECT a.name 
           FROM "user" u 
           JOIN agent a ON u.linked_agent_profile = a.bubble_id 
           WHERE u.id = $1 
           LIMIT 1`,
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
          `SELECT * FROM invoice_template WHERE bubble_id = $1`,
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
}

/**
 * Helper: Log invoice action with full snapshot
 * @public
 */
async function logInvoiceAction(client, invoiceId, actionType, createdBy, extraDetails = {}) {
  try {
    // Fetch full snapshot (Header + Items)
    const snapshot = await getInvoiceByBubbleId(client, invoiceId);

    if (!snapshot) {
      console.error(`Failed to capture snapshot for invoice ${invoiceId}`);
      throw new Error(`Snapshot not found for invoice ${invoiceId}`);
    }

    const actionId = `act_${crypto.randomBytes(8).toString('hex')}`;

    // 1. Log to legacy invoice_action (existing logic)
    const details = {
      ...extraDetails,
      snapshot: snapshot
    };

    await client.query(
      `INSERT INTO invoice_action (bubble_id, invoice_id, action_type, details, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [actionId, invoiceId, actionType, JSON.stringify(details), createdBy]
    );

    // 2. Log to NEW invoice_snapshot table (New Architecture)
    // We get the real integer ID from the snapshot
    const invoiceIntId = snapshot.id;
    const version = snapshot.version || 1;

    await client.query(
      `INSERT INTO invoice_snapshot (invoice_id, version, snapshot_data, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [invoiceIntId, version, JSON.stringify(snapshot), createdBy]
    );

  } catch (err) {
    console.error('Error logging invoice action:', err);
    throw new Error(`Failed to log invoice action: ${err.message}`);
  }
}

/**
 * Helper: Insert the main invoice record
 * @private
 */
async function _createInvoiceRecord(client, data, financials, deps, voucherInfo) {
  const {
    taxableSubtotal, markupAmount, sstRate, sstAmount, 
    percentDiscountVal, finalTotalAmount 
  } = financials;
  
  const { pkg, internalCustomerId, template } = deps;
  const { validVoucherCodes, totalVoucherAmount } = voucherInfo;
  const { discountFixed = 0, discountPercent = 0, userId, customerName, customerAddress, customerPhone } = data;

  const invoiceNumber = await generateInvoiceNumber(client);
  const bubbleId = crypto.randomUUID().toString();
  const shareToken = generateShareToken();
  const shareExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const finalCreatedBy = String(userId);

  const invoiceResult = await client.query(
    `INSERT INTO invoice
     (bubble_id, template_id, customer_id, customer_name_snapshot, customer_address_snapshot,
      customer_phone_snapshot, package_id, package_name_snapshot, invoice_number,
      invoice_date, subtotal, agent_markup, sst_rate, sst_amount,
      discount_amount, discount_fixed, discount_percent, voucher_code,
      voucher_amount, total_amount, status, share_token, share_enabled,
      share_expires_at, created_by, version, root_id, is_latest, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 1, $1, true, NOW(), NOW())
     RETURNING *`,
    [
      bubbleId,
      template.bubble_id || null, // Use template.bubble_id, not templateId passed in
      internalCustomerId,
      customerName || "Sample Quotation",
      customerAddress || null,
      customerPhone || null,
      pkg.bubble_id,
      pkg.name || null,
      invoiceNumber,
      new Date().toISOString().split('T')[0],
      taxableSubtotal,
      markupAmount,
      sstRate,
      sstAmount,
      discountFixed + percentDiscountVal,
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

  return invoiceResult.rows[0];
}

/**
 * Helper: Insert all line items
 * @private
 */
async function _createLineItems(client, invoiceId, data, financials, deps, voucherInfo) {
  const { priceWithMarkup, percentDiscountVal } = financials;
  const { pkg } = deps;
  const { voucherItemsToCreate } = voucherInfo;
  const { discountFixed = 0, discountPercent = 0, eppFeeAmount = 0, eppFeeDescription = 'EPP Fee', paymentStructure } = data;

  // 1. Package Item
  const packageItemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
  await client.query(
    `INSERT INTO invoice_new_item
     (bubble_id, invoice_id, product_id, product_name_snapshot, description,
      qty, unit_price, discount_percent, total_price, item_type, sort_order, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      packageItemBubbleId,
      invoiceId,
      pkg.panel || null,
      pkg.name || null,
      pkg.invoice_desc || pkg.name || 'Solar Package',
      1,
      priceWithMarkup,
      0,
      priceWithMarkup,
      'package',
      0
    ]
  );

  // 1.5 Extra Items
  if (Array.isArray(data.extraItems) && data.extraItems.length > 0) {
    let extraItemSortOrder = 50;
    for (const item of data.extraItems) {
        const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
        await client.query(
            `INSERT INTO invoice_new_item
             (bubble_id, invoice_id, description, qty, unit_price,
              discount_percent, total_price, item_type, sort_order, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
                itemBubbleId,
                invoiceId,
                item.description || 'Extra Item',
                item.qty || 1,
                item.unit_price || 0,
                0, // discount_percent
                item.total_price || 0,
                'extra',
                extraItemSortOrder++
            ]
        );
    }
  }

  // 2. Discount Items
  let sortOrder = 100;
  if (discountFixed > 0) {
    await client.query(
      `INSERT INTO invoice_new_item
       (bubble_id, invoice_id, description, qty, unit_price,
        discount_percent, total_price, item_type, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        `item_${crypto.randomBytes(8).toString('hex')}`,
        invoiceId,
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
        invoiceId,
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

  // 3. Voucher Items
  for (const vItem of voucherItemsToCreate) {
    await client.query(
      `INSERT INTO invoice_new_item
       (bubble_id, invoice_id, description, qty, unit_price,
        discount_percent, total_price, item_type, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        `item_${crypto.randomBytes(8).toString('hex')}`,
        invoiceId,
        vItem.description,
        1,
        -vItem.amount,
        0,
        -vItem.amount,
        'voucher',
        101 
      ]
    );
  }

  // 4. EPP Fee Item
  if (eppFeeAmount > 0) {
    await client.query(
      `INSERT INTO invoice_new_item
       (bubble_id, invoice_id, description, qty, unit_price,
        discount_percent, total_price, item_type, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        `item_${crypto.randomBytes(8).toString('hex')}`,
        invoiceId,
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

  // 5. Payment Structure Notice
  if (paymentStructure) {
    await client.query(
      `INSERT INTO invoice_new_item
       (bubble_id, invoice_id, description, qty, unit_price,
        discount_percent, total_price, item_type, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        `item_${crypto.randomBytes(8).toString('hex')}`,
        invoiceId,
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
}

/**
 * Create invoice on the fly
 * @param {object} client - Database client
 * @param {object} data - Invoice data (must include userId)
 * @returns {Promise<object>} Created invoice with share token
 */
async function createInvoiceOnTheFly(client, data) {
  // Validate userId exists
  if (!data.userId) {
    throw new Error('User ID is required.');
  }

  try {
    // Start transaction
    await client.query('BEGIN');

    // 1. Fetch Dependencies (Package, Customer, Template)
    const deps = await _fetchDependencies(client, data);

    // 2. Process Vouchers
    const packagePrice = parseFloat(deps.pkg.price) || 0;
    const voucherInfo = await _processVouchers(client, data, packagePrice);

    // 3. Calculate Financials
    const financials = _calculateFinancials(data, packagePrice, voucherInfo.totalVoucherAmount);

    // 4. Create Invoice Header
    const invoice = await _createInvoiceRecord(client, data, financials, deps, voucherInfo);

    // 5. Create Line Items
    await _createLineItems(client, invoice.bubble_id, data, financials, deps, voucherInfo);

    // Commit transaction
    await client.query('COMMIT');

    // 6. Log Action with Snapshot (after commit)
    await logInvoiceAction(client, invoice.bubble_id, 'INVOICE_CREATED', String(data.userId), { description: 'Initial creation' });

    return {
      ...invoice,
      items: [],
      template: deps.template,
      customerBubbleId: deps.customerBubbleId // Return customer Bubble ID for SEDA service
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
      `SELECT * FROM invoice
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
        // Fetch name from agent table linked to user table
        // user.id -> user.linked_agent_profile (bubble_id) -> agent.bubble_id -> agent.name
        try {
            const userResult = await client.query(
            `SELECT a.name 
             FROM "user" u 
             JOIN agent a ON u.linked_agent_profile = a.bubble_id 
             WHERE u.id = $1 
             LIMIT 1`,
            [invoice.created_by]
            );
            if (userResult.rows.length > 0) {
            invoice.created_by_user_name = userResult.rows[0].name;
            } else {
                invoice.created_by_user_name = 'System';
            }
        } catch (tableErr) {
            console.warn('Could not fetch user name:', tableErr.message);
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
      `UPDATE invoice
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

  // 1. Fetch the user's Bubble ID and Agent Profile
  let userBubbleId = null;
  let linkedAgentId = null;
  try {
    const userRes = await client.query('SELECT bubble_id, linked_agent_profile FROM "user" WHERE id = $1', [userId]);
    if (userRes.rows.length > 0) {
      userBubbleId = userRes.rows[0].bubble_id;
      linkedAgentId = userRes.rows[0].linked_agent_profile;
    }
  } catch (e) {
    console.warn('Could not fetch user details for user', userId);
  }

  // 2. Build Query to check ALL possible IDs
  const params = [String(userId)];
  let whereClause = `(i.created_by = $1::varchar`;
  let paramIndex = 2;

  if (userBubbleId) {
    whereClause += ` OR i.created_by = $${paramIndex}::varchar`;
    params.push(userBubbleId);
    paramIndex++;
  }

  if (linkedAgentId) {
    whereClause += ` OR i.created_by = $${paramIndex}::varchar`;
    params.push(linkedAgentId);
    paramIndex++;
  }
  
  whereClause += `)`;

  // DIRECT POSTGRESQL QUERY
  // Filter by is_latest = true
  const query = `
    SELECT 
      i.bubble_id,
      i.invoice_number,
      i.invoice_date,
      i.customer_name_snapshot,
      i.package_name_snapshot,
      i.subtotal,
      i.agent_markup,
      i.sst_rate,
      i.sst_amount,
      i.discount_amount,
      i.discount_fixed,
      i.discount_percent,
      i.voucher_code,
      i.voucher_amount,
      i.total_amount,
      i.status,
      i.share_token,
      i.share_enabled,
      i.created_at,
      i.updated_at,
      i.viewed_at,
      i.share_access_count,
      i.version,
      i.linked_seda_registration,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payment p WHERE p.linked_invoice = i.bubble_id) as total_received,
      (SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', sp.bubble_id, 'amount', sp.amount)), '[]') FROM submitted_payment sp WHERE sp.linked_invoice = i.bubble_id AND sp.status = 'pending') as pending_payments
    FROM invoice i
    WHERE ${whereClause} AND i.is_latest = true
    ORDER BY i.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const countQuery = `
    SELECT COUNT(*) as total 
    FROM invoice i
    WHERE ${whereClause} AND i.is_latest = true
  `;

  // Add limit/offset to params for the main query
  const queryParams = [...params, limit, offset];

  const [result, countResult] = await Promise.all([
    client.query(query, queryParams),
    client.query(countQuery, params)
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

/**
 * Log customer history before update
 */
async function logCustomerHistory(client, customerId, oldData, userId) {
  try {
    // Get max version
    const verRes = await client.query('SELECT MAX(version) as max_v FROM customer_history WHERE customer_id = $1', [customerId]);
    const nextVer = (verRes.rows[0].max_v || 0) + 1;

    await client.query(
      `INSERT INTO customer_history 
       (customer_id, name, phone, address, version, changed_by, changed_at, change_operation)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'UPDATE')`,
      [customerId, oldData.name, oldData.phone, oldData.address, nextVer, String(userId)]
    );
  } catch (err) {
    console.error('Error logging customer history:', err);
    // Non-blocking
  }
}

/**
 * Create invoice version transaction
 * @param {object} client - Database client
 * @param {object} data - Invoice data
 * @returns {Promise<object>} Created invoice
 */
async function createInvoiceVersionTransaction(client, data) {
  // Validate userId exists
  if (!data.userId) {
    throw new Error('User ID is required.');
  }

  if (!data.originalBubbleId) {
    throw new Error('Original Invoice ID is required for versioning.');
  }

  try {
    // Start transaction
    await client.query('BEGIN');

    // 1. Fetch original invoice to get package & base details
    const orgResult = await client.query(
      `SELECT * FROM invoice WHERE bubble_id = $1`,
      [data.originalBubbleId]
    );
    if (orgResult.rows.length === 0) throw new Error('Original invoice not found');
    const org = orgResult.rows[0];

    // Mark OLD versions as not latest
    const rootId = org.root_id || org.bubble_id;
    await client.query(
        `UPDATE invoice SET is_latest = false WHERE root_id = $1`,
        [rootId]
    );

    // 2. Fetch Dependencies (Package from Original)
    const pkg = await getPackageById(client, org.package_id);
    if (!pkg) throw new Error(`Original package ${org.package_id} not found`);

    // 2.5 Resolve Customer
    // Use new data if provided, otherwise fallback to original
    // IMPORTANT: If user clears the name, data.customerName might be null, but we usually keep original if not provided.
    // However, the service layer passes what it gets.
    
    let customerName = data.customerName;
    if (customerName === undefined) customerName = org.customer_name_snapshot;
    
    let customerPhone = data.customerPhone;
    if (customerPhone === undefined) customerPhone = org.customer_phone_snapshot;

    let customerAddress = data.customerAddress;
    if (customerAddress === undefined) customerAddress = org.customer_address_snapshot;

    // Resolve internal ID and update record if needed
    let internalCustomerId = org.customer_id;
    let customerBubbleId = null;

    if (internalCustomerId) {
        // Fetch existing customer
        const custRes = await client.query('SELECT * FROM customer WHERE id = $1', [internalCustomerId]);
        if (custRes.rows.length > 0) {
            const existingCust = custRes.rows[0];
            customerBubbleId = existingCust.customer_id;

            // Check if update needed
            // Use new values if provided, else keep existing (passed in data or fallback to snapshot was done above)
            // But 'data.customerName' might be undefined if not in payload.
            // Earlier: let customerName = data.customerName; if undefined ... = org.snapshot
            // So customerName holds the INTENDED name for this version.
            
            const newName = customerName; 
            const newPhone = customerPhone; 
            const newAddress = customerAddress;

            // Only update master profile if values differ
            if (newName !== existingCust.name || newPhone !== existingCust.phone || newAddress !== existingCust.address) {
                // Log History
                await logCustomerHistory(client, internalCustomerId, existingCust, data.userId);
                
                // Update Master Profile
                await client.query(
                    `UPDATE customer 
                     SET name = $1, phone = $2, address = $3, updated_at = NOW(), updated_by = $4 
                     WHERE id = $5`,
                    [newName, newPhone, newAddress, String(data.userId), internalCustomerId]
                );
            }
        }
    } else if (customerName) {
        // Fallback for legacy invoices without linked customer ID
        const custResult = await findOrCreateCustomer(client, {
            name: customerName,
            phone: customerPhone,
            address: customerAddress,
            createdBy: data.userId
        });
        if (custResult) {
            internalCustomerId = custResult.id;
            customerBubbleId = custResult.bubbleId;
        }
    }

    const customerData = {
        id: internalCustomerId,
        name: customerName,
        phone: customerPhone,
        address: customerAddress
    };

    // 3. Process Vouchers (New or empty)
    const packagePrice = parseFloat(pkg.price) || 0;
    const voucherInfo = await _processVouchers(client, data, packagePrice);

    // 4. Calculate Financials
    const financials = _calculateFinancials(data, packagePrice, voucherInfo.totalVoucherAmount);

    // 5. Create Invoice Header (Versioned)
    const newInvoice = await _createInvoiceVersionRecord(client, org, data, financials, voucherInfo, customerData);

    // 6. Create Line Items
    await _createLineItems(client, newInvoice.bubble_id, data, financials, { pkg }, voucherInfo);

    // Commit transaction
    await client.query('COMMIT');

    // 7. Log Action with Snapshot (after commit)
    const details = {
        change_summary: `Created version ${newInvoice.version} from ${org.invoice_number}`,
        discount_fixed: data.discountFixed,
        discount_percent: data.discountPercent,
        total_amount: financials.finalTotalAmount
    };
    await logInvoiceAction(client, newInvoice.bubble_id, 'INVOICE_VERSIONED', String(data.userId), details);

    return {
      ...newInvoice,
      items: [],
      customerBubbleId: customerBubbleId // Return customer Bubble ID for SEDA service
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating invoice version:', err);
    throw err;
  }
}

/**
 * Helper: Insert the VERSIONED invoice record
 * @private
 */
async function _createInvoiceVersionRecord(client, org, data, financials, voucherInfo, customerData) {
  const {
    taxableSubtotal, markupAmount, sstRate, sstAmount, 
    percentDiscountVal, finalTotalAmount 
  } = financials;
  
  const { validVoucherCodes, totalVoucherAmount } = voucherInfo;
  const { discountFixed = 0, discountPercent = 0, userId } = data;
  const { id: customerId, name: customerName, address: customerAddress, phone: customerPhone } = customerData;

  // Versioning Logic
  let newInvoiceNumber = org.invoice_number;
  const revMatch = newInvoiceNumber.match(/-R(\d+)$/);
  if (revMatch) {
    const currentRev = parseInt(revMatch[1]);
    newInvoiceNumber = newInvoiceNumber.replace(/-R\d+$/, `-R${currentRev + 1}`);
  } else {
    newInvoiceNumber = `${newInvoiceNumber}-R1`;
  }

  const bubbleId = crypto.randomUUID().toString();
  const shareToken = generateShareToken();
  const shareExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 
  const finalCreatedBy = String(userId);
  const version = (org.version || 1) + 1;
  const rootId = org.root_id || org.bubble_id;

  const invoiceResult = await client.query(
    `INSERT INTO invoice
     (bubble_id, template_id, customer_id, customer_name_snapshot, customer_address_snapshot,
      customer_phone_snapshot, package_id, package_name_snapshot, invoice_number,
      invoice_date, subtotal, agent_markup, sst_rate, sst_amount,
      discount_amount, discount_fixed, discount_percent, voucher_code,
      voucher_amount, total_amount, status, share_token, share_enabled,
      share_expires_at, created_by, created_at, updated_at, version, root_id, parent_id, is_latest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW(), NOW(), $26, $27, $28, true)
     RETURNING *`,
    [
      bubbleId,
      org.template_id,
      customerId,
      customerName || "Sample Quotation",
      customerAddress || null,
      customerPhone || null,
      org.package_id,
      org.package_name_snapshot,
      newInvoiceNumber,
      new Date().toISOString().split('T')[0],
      taxableSubtotal,
      markupAmount,
      sstRate,
      sstAmount,
      discountFixed + percentDiscountVal,
      discountFixed,
      discountPercent,
      validVoucherCodes.join(', ') || null,
      totalVoucherAmount,
      finalTotalAmount,
      'draft',
      shareToken,
      true,
      shareExpiresAt.toISOString(),
      finalCreatedBy,
      version,
      rootId,
      org.bubble_id
    ]
  );

  return invoiceResult.rows[0];
}

/**
 * Get full history of actions for an invoice family
 * @param {object} client - Database client
 * @param {string} bubbleId - Invoice bubble_id
 * @returns {Promise<Array>} List of actions
 */
async function getInvoiceHistory(client, bubbleId) {
  try {
    // 1. Get root_id of the requested invoice
    const invoiceRes = await client.query(
      `SELECT root_id, bubble_id FROM invoice WHERE bubble_id = $1`,
      [bubbleId]
    );
    
    if (invoiceRes.rows.length === 0) return [];
    
    const rootId = invoiceRes.rows[0].root_id || invoiceRes.rows[0].bubble_id;

    // 2. Fetch actions for all invoices in this family (sharing root_id)
    // We join with invoice to get the version number for context
    const query = `
      SELECT 
        ia.bubble_id as action_id,
        ia.action_type,
        ia.details,
        ia.created_by,
        ia.created_at,
        inv.invoice_number,
        inv.version
      FROM invoice_action ia
      JOIN invoice inv ON ia.invoice_id = inv.bubble_id
      WHERE inv.root_id = $1 OR inv.bubble_id = $1
      ORDER BY ia.created_at DESC
    `;
    
    const result = await client.query(query, [rootId]);
    return result.rows;
  } catch (err) {
    console.error('Error getting invoice history:', err);
    return [];
  }
}

/**
 * Delete all "Sample Quotation" invoices for a user
 * @param {object} client - Database client
 * @param {string} userId - User ID
 * @returns {Promise<number>} Count of deleted invoices
 */
async function deleteSampleInvoices(client, userId) {
  try {
    await client.query('BEGIN');

    // 1. Find target invoices (created by user AND named 'Sample Quotation')
    // We also check for linked_agent_profile to be thorough
    let userBubbleId = null;
    try {
      const userRes = await client.query('SELECT linked_agent_profile FROM "user" WHERE id = $1', [userId]);
      if (userRes.rows.length > 0) userBubbleId = userRes.rows[0].linked_agent_profile;
    } catch (e) {}

    const params = [String(userId)];
    let whereClause = `(created_by = $1::varchar`;
    if (userBubbleId) {
      whereClause += ` OR created_by = $2::varchar`;
      params.push(userBubbleId);
    }
    whereClause += `)`;

    // Find IDs first
    const findQuery = `
      SELECT bubble_id, id 
      FROM invoice 
      WHERE ${whereClause} AND customer_name_snapshot = 'Sample Quotation'
    `;
    
    const targets = await client.query(findQuery, params);
    
    if (targets.rows.length === 0) {
      await client.query('ROLLBACK');
      return 0;
    }

    const bubbleIds = targets.rows.map(r => r.bubble_id);
    const intIds = targets.rows.map(r => r.id);

    // 2. Delete Linked Items (invoice_new_item)
    await client.query(`DELETE FROM invoice_new_item WHERE invoice_id = ANY($1)`, [bubbleIds]);

    // 3. Delete Snapshots (invoice_snapshot)
    await client.query(`DELETE FROM invoice_snapshot WHERE invoice_id = ANY($1)`, [intIds]);

    // 4. Delete Actions (invoice_action)
    await client.query(`DELETE FROM invoice_action WHERE invoice_id = ANY($1)`, [bubbleIds]);

    // 5. Delete Invoices
    await client.query(`DELETE FROM invoice WHERE bubble_id = ANY($1)`, [bubbleIds]);

    await client.query('COMMIT');
    return targets.rows.length;

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting sample invoices:', err);
    throw err;
  }
}

/**
 * Get specific invoice action by ID
 * @param {object} client - Database client
 * @param {string} actionId - Action bubble_id
 * @returns {Promise<object|null>} Action record
 */
async function getInvoiceActionById(client, actionId) {
  try {
    const result = await client.query(
      `SELECT * FROM invoice_action WHERE bubble_id = $1`,
      [actionId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error getting invoice action:', err);
    return null;
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
  getPublicVouchers,
  createInvoiceVersionTransaction,
  getInvoiceByBubbleId,
  reconstructInvoiceFromSnapshot,
  getInvoiceHistory,
  getInvoiceActionById,
  logInvoiceAction,
  deleteSampleInvoices
};
