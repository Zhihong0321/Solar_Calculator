/**
 * [AI-CONTEXT]
 * Domain: Invoicing Repository
 * Primary Responsibility: Low-level Database (PostgreSQL) operations for Invoices, Items, and Customers.
 * Architecture Rule: This file should contain PURE SQL logic and minimal business orchestration.
 * Architecture Rule: Complex business logic (validations, external service calls) belongs in 'invoiceService.js'.
 * Performance Note: Uses atomic updates for invoice number generation to prevent race conditions.
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
 * [AI-CONTEXT]
 * Intent: Atomically increment the global invoice counter.
 * Critical: Uses UPDATE...RETURNING for thread-safety.
 * Fallback: If 'invoice_count' parameter is missing, scans the 'invoice' table for the highest existing number.
 * Output Format: INV-XXXXXX (6 digits).
 * 
 * @param {object} client - Database client
 * @returns {Promise<string>} Invoice number
 */
async function generateInvoiceNumber(client) {
  try {
    // Atomically increment and get the new value
    const result = await client.query(
      `UPDATE system_parameter 
       SET value = (CAST(value AS INTEGER) + 1)::text, 
           updated_at = NOW() 
       WHERE key = 'invoice_count' 
       RETURNING value`
    );

    let nextNum;

    if (result.rows.length > 0) {
      nextNum = parseInt(result.rows[0].value);
    } else {
      // Fallback/Safety: If record missing, try to initialize based on max existing or start at 1
      // We'll lock table or just try insert. Since this is rare, we'll do a safe insert.
      
      // Get actual max from table just to be safe if parameter was missing
      const lastInvoiceResult = await client.query(
        `SELECT invoice_number
         FROM invoice
         WHERE invoice_number LIKE 'INV-%'
         ORDER BY invoice_number DESC
         LIMIT 1`
      );
      
      let maxExisting = 0;
      if (lastInvoiceResult.rows.length > 0) {
         try {
            maxExisting = parseInt(lastInvoiceResult.rows[0].invoice_number.replace('INV-', '')) || 0;
         } catch (e) {}
      }
      
      nextNum = maxExisting + 1;

      // Initialize the parameter for next time
      await client.query(
        `INSERT INTO system_parameter (key, value, description)
         VALUES ('invoice_count', $1, 'Current running number for invoices')
         ON CONFLICT (key) DO NOTHING`,
        [String(nextNum)]
      );
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
  const { name, phone, address, createdBy, profilePicture } = data;
  if (!name) return null;

  try {
    // 1. Try to find by name
    const findRes = await client.query(
      'SELECT id, customer_id, phone, address, profile_picture FROM customer WHERE name = $1 LIMIT 1',
      [name]
    );
    
    if (findRes.rows.length > 0) {
      const customer = findRes.rows[0];
      const id = customer.id;
      const bubbleId = customer.customer_id;
      
      // Update if details changed
      if (
        (phone && phone !== customer.phone) || 
        (address && address !== customer.address) ||
        (profilePicture && profilePicture !== customer.profile_picture)
      ) {
        await client.query(
          `UPDATE customer 
           SET phone = COALESCE($1, phone), 
               address = COALESCE($2, address),
               profile_picture = COALESCE($5, profile_picture),
               updated_at = NOW(),
               updated_by = $4
           WHERE id = $3`,
          [phone, address, id, String(createdBy), profilePicture]
        );
      }
      return { id, bubbleId };
    }

    // 2. Create new if not found
    const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;
    const insertRes = await client.query(
      `INSERT INTO customer (customer_id, name, phone, address, created_by, created_at, updated_at, profile_picture)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
       RETURNING id`,
      [customerBubbleId, name, phone, address, createdBy, profilePicture]
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
  const { userId, packageId, customerName, customerPhone, customerAddress, templateId, profilePicture } = data;

  // 0. Resolve Agent Profile
  let linkedAgent = null;
  try {
    const userRes = await client.query(
        'SELECT linked_agent_profile FROM "user" WHERE id::text = $1 OR bubble_id = $1',
        [String(userId)]
    );
    if (userRes.rows.length > 0) {
        linkedAgent = userRes.rows[0].linked_agent_profile;
    }
  } catch (e) {
    console.warn('[DB] Agent lookup failed during invoice creation for user', userId);
  }

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
    createdBy: userId,
    profilePicture: profilePicture
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

  return { pkg, internalCustomerId, customerBubbleId, template, linkedAgent };
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
 * Reconstruct viewable invoice from action details
 * @param {object} actionDetails - Action details
 * @returns {object|null} Reconstructed object or null
 */
function reconstructFromSnapshot(actionDetails) {
  return actionDetails || null;
}

/**
 * Get single invoice by bubble_id including items
 * @param {object} client - Database client
 * @param {string} bubbleId - Invoice bubble_id
 * @returns {Promise<object|null>} Invoice with items or null
 */
async function getInvoiceByBubbleId(client, bubbleId) {
  try {
    // Query 1: Get invoice with live customer and package data
    const invoiceResult = await client.query(
      `SELECT 
        i.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address as customer_address,
        c.profile_picture as profile_picture,
        pkg.package_name as package_name
       FROM invoice i 
       LEFT JOIN customer c ON i.linked_customer = c.customer_id
       LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id
       WHERE i.bubble_id = $1`,
      [bubbleId]
    );

    if (invoiceResult.rows.length === 0) return null;
    const invoice = invoiceResult.rows[0];

    // Query 2: Get items (Enhanced Retrieval)
    const itemIds = Array.isArray(invoice.linked_invoice_item) ? invoice.linked_invoice_item : [];
    const itemsResult = await client.query(
      `SELECT 
        ii.bubble_id,
        ii.linked_invoice as invoice_id,
        ii.description,
        ii.qty,
        ii.unit_price,
        ii.amount as total_price,
        ii.inv_item_type as item_type,
        ii.sort as sort_order,
        ii.created_at,
        ii.is_a_package,
        ii.linked_package as product_id,
        COALESCE(pkg.package_name, INITCAP(REPLACE(ii.inv_item_type, '_', ' ')), 'Item') as product_name
       FROM invoice_item ii
       LEFT JOIN package pkg ON ii.linked_package = pkg.bubble_id
       WHERE ii.linked_invoice = $1 
          OR ii.bubble_id = ANY($2::text[])
       ORDER BY ii.sort ASC, ii.created_at ASC`,
      [bubbleId, itemIds]
    );
    invoice.items = itemsResult.rows;

    // Derive SST Amount and Subtotal from items since columns are removed
    const sstItem = invoice.items.find(item => item.item_type === 'sst');
    invoice.sst_amount = sstItem ? parseFloat(sstItem.total_price) : 0;
    invoice.subtotal = (parseFloat(invoice.total_amount) || 0) - invoice.sst_amount;

    // Derive Discount and Voucher amounts from items
    invoice.discount_amount = invoice.items
        .filter(item => item.item_type === 'discount')
        .reduce((sum, item) => sum + Math.abs(parseFloat(item.total_price) || 0), 0);
    invoice.voucher_amount = invoice.items
        .filter(item => item.item_type === 'voucher')
        .reduce((sum, item) => sum + Math.abs(parseFloat(item.total_price) || 0), 0);

    // Queries 3-6: Run in parallel if possible
    const parallelQueries = [];

    // Query 3: Get package data for system size calculation
    if (invoice.linked_package) {
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
            [invoice.linked_package]
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
           WHERE u.bubble_id = $1 
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
 * Helper: Log invoice action
 * @param {object} client - Database client
 * @param {string} invoiceId - Invoice bubble_id
 * @param {string} actionType - Action type
 * @param {string} userId - User ID
 * @param {object} details - Action details
 */
async function logInvoiceAction(client, invoiceId, actionType, userId, details = {}) {
  try {
    await client.query(
      `INSERT INTO invoice_action (invoice_id, action_type, created_by, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [invoiceId, actionType, userId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Error logging invoice action:', err);
    // Non-blocking
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
  
  const { pkg, internalCustomerId, customerBubbleId, template, linkedAgent } = deps;
  const { validVoucherCodes, totalVoucherAmount } = voucherInfo;
  const { discountFixed = 0, discountPercent = 0, userId, customerName, customerAddress, customerPhone } = data;

  const invoiceNumber = await generateInvoiceNumber(client);
  const bubbleId = crypto.randomUUID().toString();
  const shareToken = generateShareToken();
  const shareExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const finalCreatedBy = String(userId);

    const query = `
      INSERT INTO invoice 
      (bubble_id, template_id, linked_customer, linked_agent, linked_package, invoice_number, 
       status, total_amount, paid_amount, balance_due, invoice_date, created_by, share_token, follow_up_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const values = [
      bubbleId, data.templateId || 'default', customerBubbleId, linkedAgent, 
      data.packageId, invoiceNumber, data.status || 'draft', 
      finalTotalAmount, 0, finalTotalAmount, data.invoiceDate || new Date(), 
      finalCreatedBy, shareToken, data.followUpDate || null
    ];

    const invoiceResult = await client.query(query, values);
    return invoiceResult.rows[0];
}

/**
 * Helper: Insert all line items (Refactored to use invoice_item)
 * @private
 */
async function _createLineItems(client, invoiceId, data, financials, deps, voucherInfo) {
  const { priceWithMarkup, percentDiscountVal } = financials;
  const { pkg } = deps;
  const { voucherItemsToCreate } = voucherInfo;
  const { discountFixed = 0, discountPercent = 0, eppFeeAmount = 0, eppFeeDescription = 'EPP Fee', paymentStructure } = data;

  const createdItemIds = [];

  // 1. Package Item
  const packageItemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
  await client.query(
    `INSERT INTO invoice_item
     (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package, linked_package)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9, $10)`,
    [
      packageItemBubbleId,
      invoiceId,
      pkg.invoice_desc || pkg.name || 'Solar Package',
      1,
      priceWithMarkup,
      priceWithMarkup,
      'package',
      0,
      true,
      pkg.bubble_id || null
    ]
  );
  createdItemIds.push(packageItemBubbleId);

  // 1.5 Extra Items
  if (Array.isArray(data.extraItems) && data.extraItems.length > 0) {
    let extraItemSortOrder = 50;
    for (const item of data.extraItems) {
        const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
        await client.query(
            `INSERT INTO invoice_item
             (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
            [
                itemBubbleId,
                invoiceId,
                item.description || 'Extra Item',
                item.qty || 1,
                item.unit_price || 0,
                item.total_price || 0,
                'extra',
                extraItemSortOrder++,
                false
            ]
        );
        createdItemIds.push(itemBubbleId);
    }
  }

  // 2. Discount Items
  let sortOrder = 100;
  if (discountFixed > 0) {
    const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        itemBubbleId,
        invoiceId,
        `Discount (RM ${discountFixed})`,
        1,
        -discountFixed,
        -discountFixed,
        'discount',
        sortOrder++,
        false
      ]
    );
    createdItemIds.push(itemBubbleId);
  }

  if (discountPercent > 0) {
    const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        itemBubbleId,
        invoiceId,
        `Discount (${discountPercent}%)`,
        1,
        -percentDiscountVal,
        -percentDiscountVal,
        'discount',
        sortOrder++,
        false
      ]
    );
    createdItemIds.push(itemBubbleId);
  }

  // 3. Voucher Items
  for (const vItem of voucherItemsToCreate) {
    const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        itemBubbleId,
        invoiceId,
        vItem.description,
        1,
        -vItem.amount,
        -vItem.amount,
        'voucher',
        101,
        false
      ]
    );
    createdItemIds.push(itemBubbleId);
  }

  // 4. EPP Fee Item
  if (eppFeeAmount > 0) {
    const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        itemBubbleId,
        invoiceId,
        `Bank Processing Fee (${eppFeeDescription})`,
        1,
        eppFeeAmount,
        eppFeeAmount,
        'epp_fee',
        200,
        false
      ]
    );
    createdItemIds.push(itemBubbleId);
  }

  // 5. Payment Structure Notice
  if (paymentStructure) {
    const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        itemBubbleId,
        invoiceId,
        paymentStructure,
        1,
        0,
        0,
        'notice',
        250,
        false
      ]
    );
    createdItemIds.push(itemBubbleId);
  }

  // 6. SST Line Item (Dynamic derivation support)
  if (financials.sstAmount > 0) {
    const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        itemBubbleId,
        invoiceId,
        `SST (6%)`,
        1,
        financials.sstAmount,
        financials.sstAmount,
        'sst',
        300,
        false
      ]
    );
    createdItemIds.push(itemBubbleId);
  }

  // Update Invoice with Linked Items (Legacy requirement)
  if (createdItemIds.length > 0) {
    await client.query(
        `UPDATE invoice SET linked_invoice_item = $1 WHERE bubble_id = $2`,
        [createdItemIds, invoiceId]
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
    // DB Trigger now handles extra persistence automatically

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
 * Get public invoice by share token OR bubble_id
 * @param {object} client - Database client
 * @param {string} tokenOrId - Share token or Invoice UID
 * @returns {Promise<object|null>} Invoice object with items or null
 */
async function getPublicInvoice(client, tokenOrId) {
  try {
    const invoiceResult = await client.query(
      `SELECT 
        i.*,
                COALESCE(c.name, 'Unknown Customer') as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                c.address as customer_address,
                c.profile_picture as profile_picture,
                pkg.package_name as package_name
               FROM invoice i 
               LEFT JOIN customer c ON i.linked_customer = c.customer_id
               LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id       WHERE (i.share_token = $1 OR i.bubble_id = $1)
         AND i.share_enabled = true
         AND (i.share_expires_at IS NULL OR i.share_expires_at > NOW())
       LIMIT 1`,
      [tokenOrId]
    );

    if (invoiceResult.rows.length === 0) {
      return null;
    }

    const invoice = invoiceResult.rows[0];

    // Get items (Enhanced Retrieval)
    const itemIds = Array.isArray(invoice.linked_invoice_item) ? invoice.linked_invoice_item : [];
    const itemsResult = await client.query(
      `SELECT 
        ii.bubble_id,
        ii.linked_invoice as invoice_id,
        ii.description,
        ii.qty,
        ii.unit_price,
        ii.amount as total_price,
        ii.inv_item_type as item_type,
        ii.sort as sort_order,
        ii.created_at,
        ii.is_a_package,
        ii.linked_package as product_id,
        COALESCE(pkg.package_name, INITCAP(REPLACE(ii.inv_item_type, '_', ' ')), 'Item') as product_name
       FROM invoice_item ii
       LEFT JOIN package pkg ON ii.linked_package = pkg.bubble_id
       WHERE ii.linked_invoice = $1 
          OR ii.bubble_id = ANY($2::text[])
       ORDER BY ii.sort ASC, ii.created_at ASC`,
      [invoice.bubble_id, itemIds]
    );
    invoice.items = itemsResult.rows;

    // Get package data for system size calculation
    if (invoice.linked_package) {
      const packageResult = await client.query(
        `SELECT p.panel_qty, p.panel, pr.solar_output_rating
         FROM package p
         LEFT JOIN product pr ON (
           CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
           OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
         )
         WHERE p.bubble_id = $1`,
        [invoice.linked_package]
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
             WHERE u.bubble_id = $1 
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
    console.error('Error fetching public invoice:', err);
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
 * Get invoices for an agent - REWRITTEN LOGIC
 * - Filters by linked_agent (current user's agent profile)
 * - Excludes deleted status
 * - Sorts by latest invoice_date
 * - Sums totals ONLY from verified 'payment' table
 * - Supports Date Range and Payment Status filtering
 * @param {object} client - Database client
 * @param {string} userId - User ID (to find linked agent)
 * @param {object} options - Query options
 * @returns {Promise<object>} { invoices: Array, total: number }
 */
async function getInvoicesByUserId(client, userId, options = {}) {
  const limit = parseInt(options.limit) || 100;
  const offset = parseInt(options.offset) || 0;
  const { startDate, endDate, paymentStatus } = options;

  // 1. Resolve Agent Profile from the 'agent' table linked to current user
  let agentProfileId = null;
  try {
    const userRes = await client.query(`
        SELECT a.bubble_id 
        FROM "user" u
        JOIN agent a ON u.linked_agent_profile = a.bubble_id
        WHERE u.id::text = $1 OR u.bubble_id = $1
    `, [userId]);
    
    if (userRes.rows.length > 0) {
      agentProfileId = userRes.rows[0].bubble_id;
    }
  } catch (e) {
    console.warn('[DB] Agent/User lookup failed for', userId);
  }

  if (!agentProfileId) {
    return { invoices: [], total: 0, limit, offset };
  }

  let filterClause = '';
  const params = [agentProfileId, paymentStatus];
  let paramIdx = 3;

  if (startDate) {
    filterClause += ` AND i.invoice_date >= $${paramIdx++}::date`;
    params.push(startDate);
  }

  if (endDate) {
    filterClause += ` AND i.invoice_date <= $${paramIdx++}::date`;
    params.push(endDate);
  }

  const baseCTE = `
    WITH invoice_data AS (
        SELECT 
            i.bubble_id,
            i.invoice_number,
            i.invoice_date,
            i.created_at,
            -- LIVE DATA JOINS
            COALESCE(c.name, 'Unknown Customer') as customer_name,
            COALESCE(c.email, '') as customer_email,
            COALESCE(c.phone, '') as customer_phone,
            COALESCE(c.profile_picture, '') as profile_picture,
            COALESCE(pkg.package_name, 'Unknown Package') as package_name,
            i.total_amount,
            i.status,
            i.share_token,
            i.share_enabled,
            i.version,
            i.follow_up_date,
            COALESCE(
                i.linked_seda_registration, 
                (SELECT s.bubble_id FROM seda_registration s WHERE i.bubble_id = ANY(s.linked_invoice) LIMIT 1)
            ) as linked_seda_registration,
            
            -- Verified Paid Amount
            COALESCE((SELECT SUM(p.amount) FROM payment p WHERE p.linked_invoice = i.bubble_id OR p.bubble_id = ANY(COALESCE(i.linked_payment, ARRAY[]::text[]))), 0) as total_received,

            -- Pending Verification List
            (
                SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('amount', sp.amount)), '[]') 
                FROM submitted_payment sp 
                WHERE sp.linked_invoice = i.bubble_id AND sp.status = 'pending'
            ) as pending_payments

        FROM invoice i
        LEFT JOIN customer c ON i.linked_customer = c.customer_id
        LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id
        WHERE i.linked_agent = $1 
        AND i.is_latest = true 
        AND (i.status != 'deleted' OR i.status IS NULL OR $2 = 'deleted')
    )
  `;

  // Payment Status Filtering logic based on calculated total_received
  if (paymentStatus) {
    if (paymentStatus === 'unpaid') {
        filterClause += ` AND (total_received IS NULL OR total_received <= 0) AND i.status != 'deleted'`;
    } else if (paymentStatus === 'partial') {
        filterClause += ` AND total_received > 0 AND total_received < total_amount AND i.status != 'deleted'`;
    } else if (paymentStatus === 'paid') {
        filterClause += ` AND total_received >= total_amount AND total_amount > 0 AND i.status != 'deleted'`;
    } else if (paymentStatus === 'deleted') {
        filterClause += ` AND i.status = 'deleted'`;
    }
  }

  const query = `
    ${baseCTE}
    SELECT * FROM invoice_data
    WHERE 1=1 ${filterClause}
    ORDER BY invoice_date DESC, created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx}
  `;

  params.push(limit, offset);

  const countQuery = `
    ${baseCTE}
    SELECT COUNT(*) as total FROM invoice_data
    WHERE 1=1 ${filterClause}
  `;

  const countParams = params.slice(0, params.length - 2);

  try {
      const [result, countResult] = await Promise.all([
        client.query(query, params),
        client.query(countQuery, countParams)
      ]);

      return {
        invoices: result.rows,
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset
      };
  } catch (err) {
      console.error('Error fetching invoices:', err);
      throw err;
  }
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
 * Update an existing invoice in place (Standard SQL UPDATE)
 * @param {object} client - Database client
 * @param {object} data - Update data
 * @returns {Promise<object>} Updated invoice
 */
async function updateInvoiceTransaction(client, data) {
  if (!data.userId) throw new Error('User ID is required.');
  if (!data.originalBubbleId) throw new Error('Invoice ID is required for update.');

  const bubbleId = data.originalBubbleId;

  try {
    await client.query('BEGIN');

    // 1. Fetch current record
    const currentRes = await client.query(
        'SELECT id, bubble_id, total_amount, status, linked_customer, linked_package, linked_agent, version, paid_amount FROM invoice WHERE bubble_id = $1',
        [bubbleId]
    );
    const currentData = currentRes.rows[0];
    if (!currentData) throw new Error('Invoice not found');

    // 2. Resolve Dependencies
    const pkg = await getPackageById(client, data.packageId || currentData.linked_package);
    if (!pkg) throw new Error(`Package not found`);

    let linkedAgent = currentData.linked_agent;
    if (!linkedAgent) {
        const userRes = await client.query('SELECT linked_agent_profile FROM "user" WHERE id::text = $1 OR bubble_id = $1', [String(data.userId)]);
        if (userRes.rows.length > 0) linkedAgent = userRes.rows[0].linked_agent_profile;
    }

    // Resolve Customer
    let customerBubbleId = currentData.linked_customer;

    if (data.customerName) {
        const custResult = await findOrCreateCustomer(client, {
            name: data.customerName,
            phone: data.customerPhone,
            address: data.customerAddress,
            profilePicture: data.profilePicture || null,
            createdBy: data.userId
        });
        if (custResult) {
            customerBubbleId = custResult.bubbleId;
        }
    }

    // 4. Calculate Financials
    const packagePrice = parseFloat(pkg.price) || 0;
    const voucherInfo = await _processVouchers(client, data, packagePrice);
    const financials = _calculateFinancials(data, packagePrice, voucherInfo.totalVoucherAmount);

    const { finalTotalAmount } = financials;

    // 5. Standard SQL UPDATE
    const updateQuery = `
        UPDATE invoice SET 
            template_id = $1,
            linked_package = $2,
            linked_customer = $3,
            total_amount = $4,
            balance_due = $4 - COALESCE(paid_amount, 0),
            status = $5,
            follow_up_date = $6,
            updated_at = NOW()
        WHERE bubble_id = $7
    `;
    const updateValues = [
        data.templateId || 'default',
        data.packageId || currentData.linked_package,
        customerBubbleId,
        finalTotalAmount,
        data.status || currentData.status,
        data.followUpDate || null,
        bubbleId
    ];
    await client.query(updateQuery, updateValues);

    // 6. Item Update (Smart: Delete old and insert new for consistency)
    // We stick to delete/insert here but ensure they keep the same linked_invoice (UID)
    await client.query('DELETE FROM invoice_item WHERE linked_invoice = $1', [bubbleId]);
    await _createLineItems(client, bubbleId, data, financials, { pkg, linkedAgent }, voucherInfo);

    await client.query('COMMIT');

    // Return the updated state
    const result = await getInvoiceByBubbleId(client, bubbleId);
    return {
        ...result,
        customerBubbleId: customerBubbleId
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/**
 * Helper: Insert the VERSIONED invoice record
 * @private
 */
async function _createInvoiceVersionRecord(client, org, data, financials, voucherInfo, customerData, linkedAgent) {
  const {
    taxableSubtotal, markupAmount, sstRate, sstAmount, 
    percentDiscountVal, finalTotalAmount 
  } = financials;
  
  const { validVoucherCodes, totalVoucherAmount } = voucherInfo;
  const { id: customerId, bubbleId: customerBubbleId, name: customerName, address: customerAddress, phone: customerPhone } = customerData;

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
  const finalCreatedBy = String(data.userId);
  const version = (org.version || 1) + 1;
  const rootId = org.root_id || org.bubble_id;

  const invoiceResult = await client.query(
    `INSERT INTO invoice
     (bubble_id, template_id, linked_customer, linked_agent, linked_package, invoice_number,
      invoice_date, agent_markup,
      discount_fixed, discount_percent, voucher_code,
      total_amount, status, share_token, share_enabled,
      share_expires_at, created_by, version, root_id, parent_id, is_latest, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
     RETURNING *`,
    [
      bubbleId,
      org.template_id,
      customerBubbleId,
      linkedAgent,
      org.linked_package,
      newInvoiceNumber,
      new Date().toISOString().split('T')[0],
      markupAmount,
      (data.discountFixed || 0),
      (data.discountPercent || 0),
      validVoucherCodes.join(', ') || null,
      finalTotalAmount,
      'draft',
      shareToken,
      true,
      shareExpiresAt.toISOString(),
      finalCreatedBy,
      version,
      rootId,
      org.bubble_id,
      true
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

    // 1. Find target invoices (created by user)
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
      WHERE ${whereClause}
    `;
    
    const targets = await client.query(findQuery, params);
    
    if (targets.rows.length === 0) {
      await client.query('ROLLBACK');
      return 0;
    }

    const bubbleIds = targets.rows.map(r => r.bubble_id);

    // Perform soft delete (status = 'deleted')
    await client.query(`UPDATE invoice SET status = 'deleted', updated_at = NOW() WHERE bubble_id = ANY($1)`, [bubbleIds]);

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

/**
 * Verify if a user owns or is assigned to a resource
 * Checks: User ID, User Bubble ID, and Linked Agent ID
 * @param {object} client - Database client
 * @param {string} userId - ID of the user attempting access
 * @param {string} resourceCreatedBy - ID stored in the resource's created_by field
 * @param {string} [resourceLinkedAgent] - ID stored in the resource's linked_agent field
 * @returns {Promise<boolean>}
 */
async function verifyOwnership(client, userId, resourceCreatedBy, resourceLinkedAgent = null) {
  // 1. Direct match check on creator (fastest)
  if (resourceCreatedBy && String(resourceCreatedBy) === String(userId)) return true;

  // 2. Fetch user details to check aliases and assigned agent profile
  try {
      const userRes = await client.query('SELECT bubble_id, linked_agent_profile FROM "user" WHERE id::text = $1 OR bubble_id = $1', [String(userId)]);
      if (userRes.rows.length === 0) return false;
      
      const user = userRes.rows[0];
      const userBubbleId = user.bubble_id;
      const userAgentProfile = user.linked_agent_profile;

      // Check if User's Bubble ID matches the creator
      if (userBubbleId && resourceCreatedBy && String(resourceCreatedBy) === String(userBubbleId)) return true;
      
      // Check if User's Agent Profile matches the creator (Legacy support)
      if (userAgentProfile && resourceCreatedBy && String(resourceCreatedBy) === String(userAgentProfile)) return true;

      // CRITICAL: Check if User's Agent Profile matches the assigned agent on the invoice
      if (userAgentProfile && resourceLinkedAgent && String(resourceLinkedAgent) === String(userAgentProfile)) return true;
      
      return false;
  } catch (err) {
      console.error('Error verifying ownership:', err);
      return false;
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
  getInvoiceByShareToken: getPublicInvoice, // Alias for backward compatibility
  getPublicInvoice,
  recordInvoiceView,
  getInvoicesByUserId,
  getPublicVouchers,
  updateInvoiceTransaction,
  getInvoiceByBubbleId,
  getInvoiceHistory,
  getInvoiceActionById,
  logInvoiceAction,
  deleteSampleInvoices,
  verifyOwnership
};
