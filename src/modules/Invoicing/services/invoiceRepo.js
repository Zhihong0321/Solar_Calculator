/**
 * [AI-CONTEXT]
 * Domain: Invoicing Repository
 * Primary Responsibility: Low-level Database (PostgreSQL) operations for Invoices, Items, and Customers.
 * Architecture Rule: This file should contain PURE SQL logic and minimal business orchestration.
 * Architecture Rule: Complex business logic (validations, external service calls) belongs in 'invoiceService.js'.
 * Performance Note: Uses atomic updates for invoice number generation to prevent race conditions.
 */
const crypto = require('crypto');
const {
  calculateInvoiceFinancials,
  validateManualDiscountLimit
} = require('./invoiceFinancials');
const {
  getInvoiceColumns,
  getTableColumns,
  hasTable
} = require('./invoiceSchemaSupport');
const {
  appendInvoiceEstimateInsertFields,
  appendInvoiceEstimateUpdateFields
} = require('./invoiceEstimateSupport');
const {
  insertInvoiceItem,
  syncLinkedInvoiceItems
} = require('./invoiceItemSupport');
const {
  fetchInvoiceDependencies,
  findOrCreateCustomer,
  resolveLinkedReferral,
  syncReferralInvoiceLink
} = require('./invoiceDependencySupport');
const {
  getDefaultTemplate,
  getPackageById,
  getTemplateById,
  getVoucherByCode,
  getVoucherById
} = require('./invoiceLookupSupport');
const {
  buildVoucherInfoFromRows,
  getInvoiceSelectedVoucherRows,
  getVoucherStepData: loadVoucherStepData,
  isVoucherCategoryEligible,
  normalizeVoucherCategoryPackageType
} = require('./invoiceVoucherSupport');

let beginAgentAuditTransaction = async (client) => {
  await client.query('BEGIN');
};

try {
  ({ beginAgentAuditTransaction } = require('./agentAuditContext'));
} catch (err) {
  if (err?.code !== 'MODULE_NOT_FOUND') {
    throw err;
  }
  console.warn('[InvoiceRepo] agentAuditContext unavailable, using basic transaction fallback.');
}

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
        } catch (e) { }
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
 * Fetch warranty info for a package
 * @private
 */
async function _fetchWarrantyInfo(client, packageId, invoiceItems = []) {
  try {
    const productIds = [];

    // 1. Collect product IDs from the main package when one exists.
    if (packageId) {
      const pkgRes = await client.query(
        `SELECT panel, inverter_1, inverter_2, inverter_3, inverter_4, linked_package_item 
         FROM package 
         WHERE bubble_id = $1 OR id::text = $1`,
        [packageId]
      );

      if (pkgRes.rows.length > 0) {
        const pkg = pkgRes.rows[0];
        if (pkg.panel) productIds.push(pkg.panel);
        if (pkg.inverter_1) productIds.push(pkg.inverter_1);
        if (pkg.inverter_2) productIds.push(pkg.inverter_2);
        if (pkg.inverter_3) productIds.push(pkg.inverter_3);
        if (pkg.inverter_4) productIds.push(pkg.inverter_4);

        const linkedItems = pkg.linked_package_item;
        if (Array.isArray(linkedItems) && linkedItems.length > 0) {
          const itemsRes = await client.query(
            `SELECT product FROM package_item WHERE bubble_id = ANY($1::text[])`,
            [linkedItems]
          );
          itemsRes.rows.forEach(item => {
            if (item.product) productIds.push(item.product);
          });
        }
      }
    }

    // 2. Collect directly linked product items such as batteries/accessories.
    if (Array.isArray(invoiceItems) && invoiceItems.length > 0) {
      invoiceItems.forEach((item) => {
        if (item?.linked_product) productIds.push(item.linked_product);
      });
    }

    if (productIds.length === 0) return [];

    const uniqueIds = [...new Set(productIds)];
    const productsRes = await client.query(
      `SELECT name, product_warranty_desc, warranty_name 
       FROM product 
       WHERE (bubble_id = ANY($1::text[]) OR id::text = ANY($1::text[]))
       AND (product_warranty_desc IS NOT NULL OR warranty_name IS NOT NULL)`,
      [uniqueIds]
    );

    return productsRes.rows.map(p => ({
      name: p.name,
      terms: p.product_warranty_desc || p.warranty_name || 'Standard Warranty'
    }));

  } catch (err) {
    console.error('Error fetching warranty info:', err);
    return [];
  }
}

function inferPhaseScopeFromProductName(productName) {
  const normalizedName = String(productName || '').toUpperCase();
  if (!normalizedName) return null;
  if (normalizedName.includes('[3P]') || normalizedName.includes('THREE PHASE')) return 'three_phase';
  if (normalizedName.includes('[1P]') || normalizedName.includes('SINGLE PHASE')) return 'single_phase';
  return null;
}

function inferInverterKind(productName) {
  const normalizedName = String(productName || '').toUpperCase();
  if (!normalizedName) return 'unknown';
  if (normalizedName.includes(' H2 ') || normalizedName.includes('HYBRID')) return 'hybrid';
  if (normalizedName.includes(' R5 ') || normalizedName.includes(' R6 ') || normalizedName.includes('STRING')) return 'string';
  return 'unknown';
}

function inferInverterModelCode(productName) {
  const normalizedName = String(productName || '').toUpperCase();
  if (!normalizedName) return null;

  if (normalizedName.includes('R5 5KW')) return 'R5-5K-S2';
  if (normalizedName.includes('R5 6KW')) return 'R5-6K-S2';
  if (normalizedName.includes('R5 7KW')) return 'R5-7K-S2';
  if (normalizedName.includes('R5 8KW')) return 'R5-8K-S2';
  if (normalizedName.includes('R6 8KW')) return 'R6-8K-T2';
  if (normalizedName.includes('R6 10KW')) return 'R6-10K-T2';
  if (normalizedName.includes('R6 12KW')) return 'R6-12K-T2';
  if (normalizedName.includes('R6 12.5KW') || normalizedName.includes('R6 15KW')) return 'R6-12.5/15K-T2-32';
  if (normalizedName.includes('R6 20KW')) return 'R6-20K-T2-32';
  if (normalizedName.includes('H2 5KW')) return 'H2-5K-LS2';
  if (normalizedName.includes('H2 6KW')) return 'H2-6K-LS2';
  if (normalizedName.includes('H2 8KW') && normalizedName.includes('THREE PHASE')) return 'H2-8K-LT2';
  if (normalizedName.includes('H2 8KW')) return 'H2-8K-LS2';
  if (normalizedName.includes('H2 10KW')) return 'H2-10K-LT2';
  if (normalizedName.includes('H2 12KW')) return 'H2-12K-LT2';
  if (normalizedName.includes('H2 15KW')) return 'H2-15K-LT2';
  if (normalizedName.includes('H2 20KW')) return 'H2-20K-LT2';

  return null;
}

function formatMoneyLabel(value) {
  return `RM ${(parseFloat(value) || 0).toFixed(2)}`;
}

function buildHybridUpgradePackageName(sourcePackageName, targetModelCode) {
  const baseName = String(sourcePackageName || 'Custom Solar Package').trim();
  const suffix = targetModelCode ? `Hybrid ${targetModelCode}` : 'Hybrid Upgrade';
  if (baseName.toUpperCase().includes('HYBRID')) {
    return baseName;
  }
  return `${baseName} (${suffix})`;
}

function buildHybridUpgradePackageDescription(sourceDescription, targetInverterName, topUpAmount) {
  const lines = String(sourceDescription || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let replacedInverterLine = false;
  const updatedLines = lines.map((line) => {
    if (!replacedInverterLine && /inverter/i.test(line)) {
      replacedInverterLine = true;
      return `1X ${targetInverterName}`;
    }
    return line;
  });

  if (!replacedInverterLine && targetInverterName) {
    updatedLines.push(`1X ${targetInverterName}`);
  }

  const upgradeNote = `Hybrid inverter upgrade included (${formatMoneyLabel(topUpAmount)} top-up)`;
  if (!updatedLines.some((line) => line.toLowerCase() === upgradeNote.toLowerCase())) {
    updatedLines.push(upgradeNote);
  }

  return updatedLines.join('\n');
}

async function getHybridUpgradeOptionsForPackage(client, packageId) {
  const rulesTableExists = await hasTable(client, 'hybrid_inverter_upgrade_rule');
  if (!rulesTableExists) {
    return {
      packageId,
      packageAlreadyHybrid: false,
      currentInverter: null,
      rules: []
    };
  }

  const packageColumns = await getTableColumns(client, 'package');
  const packageRes = await client.query(
    `SELECT
        COALESCE(p.bubble_id, p.id::text) AS bubble_id,
        p.id,
        p.package_name,
        p.price,
        p.invoice_desc,
        p.inverter_1,
        ${packageColumns.has('package_scope') ? 'p.package_scope' : "'system'::text AS package_scope"},
        ${packageColumns.has('source_package_bubble_id') ? 'p.source_package_bubble_id' : 'NULL::text AS source_package_bubble_id'},
        ${packageColumns.has('root_package_bubble_id') ? 'p.root_package_bubble_id' : 'NULL::text AS root_package_bubble_id'},
        ${packageColumns.has('linked_invoice_bubble_id') ? 'p.linked_invoice_bubble_id' : 'NULL::text AS linked_invoice_bubble_id'},
        ${packageColumns.has('created_from_reason') ? 'p.created_from_reason' : 'NULL::text AS created_from_reason'},
        pr.bubble_id AS inverter_product_bubble_id,
        pr.name AS inverter_name
     FROM package p
     LEFT JOIN product pr
       ON CAST(p.inverter_1 AS TEXT) = CAST(pr.bubble_id AS TEXT)
       OR CAST(p.inverter_1 AS TEXT) = CAST(pr.id AS TEXT)
     WHERE p.bubble_id = $1 OR p.id::text = $1
     LIMIT 1`,
    [packageId]
  );

  if (packageRes.rows.length === 0) {
    throw new Error('Package not found');
  }

  const pkg = packageRes.rows[0];
  const currentInverterName = pkg.inverter_name || null;
  const currentInverterProductId = pkg.inverter_1 || pkg.inverter_product_bubble_id || null;
  const phaseScope = inferPhaseScopeFromProductName(currentInverterName);
  const currentModelCode = inferInverterModelCode(currentInverterName);
  const inverterKind = inferInverterKind(currentInverterName);

  const currentInverter = currentInverterName
    ? {
      product_bubble_id: currentInverterProductId,
      name: currentInverterName,
      model_code: currentModelCode,
      phase_scope: phaseScope,
      inverter_kind: inverterKind
    }
    : null;

  if (!currentInverter || inverterKind === 'hybrid') {
    return {
      packageId,
      packageAlreadyHybrid: inverterKind === 'hybrid',
      currentInverter,
      rules: []
    };
  }

  const ruleRes = await client.query(
    `SELECT
        bubble_id,
        phase_scope,
        from_model_code,
        from_product_bubble_id,
        from_product_name_snapshot,
        to_model_code,
        to_product_bubble_id,
        to_product_name_snapshot,
        price_amount,
        currency_code,
        stock_ready,
        active,
        notes,
        sort_order
     FROM hybrid_inverter_upgrade_rule
     WHERE rule_type = 'inverter_upgrade'
       AND active = TRUE
       AND (
         ($1::text IS NOT NULL AND from_product_bubble_id = $1)
         OR ($2::text IS NOT NULL AND from_model_code = $2)
       )
       AND ($3::text IS NULL OR phase_scope = $3)
     ORDER BY sort_order ASC, id ASC`,
    [currentInverterProductId, currentModelCode, phaseScope]
  );

  const rules = ruleRes.rows.map((row) => ({
    ...row,
    price_amount: parseFloat(row.price_amount) || 0,
    is_selectable: Boolean(row.to_product_bubble_id)
  }));

  return {
    packageId,
    packageAlreadyHybrid: false,
    currentInverter,
    rules
  };
}

async function clonePackageWithHybridUpgrade(client, sourcePackageId, ruleBubbleId, userId, linkedInvoiceId = null) {
  const packageColumns = await getTableColumns(client, 'package');
  const context = await getHybridUpgradeOptionsForPackage(client, sourcePackageId);
  const selectedRule = context.rules.find((rule) => String(rule.bubble_id) === String(ruleBubbleId));

  if (!selectedRule) {
    throw new Error('Selected hybrid inverter upgrade rule is not valid for this package.');
  }

  if (!selectedRule.is_selectable) {
    throw new Error('Selected hybrid inverter upgrade rule is missing the target hybrid inverter mapping.');
  }

  const sourceRes = await client.query(`SELECT * FROM package WHERE bubble_id = $1 LIMIT 1`, [sourcePackageId]);
  if (sourceRes.rows.length === 0) {
    throw new Error('Source package not found for hybrid upgrade.');
  }

  const sourcePackage = sourceRes.rows[0];
  const customPackageId = `pkg_${crypto.randomBytes(10).toString('hex')}`;
  const rootPackageId = sourcePackage.root_package_bubble_id || sourcePackage.source_package_bubble_id || sourcePackage.bubble_id;

  const insertValues = [];
  const columnNames = [];
  const pushColumn = (columnName, value) => {
    columnNames.push(columnName);
    insertValues.push(value);
  };

  pushColumn('bubble_id', customPackageId);
  if (packageColumns.has('last_synced_at')) pushColumn('last_synced_at', new Date());
  if (packageColumns.has('created_at')) pushColumn('created_at', new Date());
  if (packageColumns.has('updated_at')) pushColumn('updated_at', new Date());
  if (packageColumns.has('special')) pushColumn('special', sourcePackage.special);
  if (packageColumns.has('panel_qty')) pushColumn('panel_qty', sourcePackage.panel_qty);
  if (packageColumns.has('created_date')) pushColumn('created_date', sourcePackage.created_date);
  if (packageColumns.has('price')) pushColumn('price', sourcePackage.price);
  if (packageColumns.has('invoice_desc')) pushColumn('invoice_desc', sourcePackage.invoice_desc);
  if (packageColumns.has('linked_package_item')) pushColumn('linked_package_item', sourcePackage.linked_package_item);
  if (packageColumns.has('created_by')) pushColumn('created_by', String(userId || sourcePackage.created_by || 'system'));
  if (packageColumns.has('package_name')) pushColumn('package_name', sourcePackage.package_name);
  if (packageColumns.has('panel')) pushColumn('panel', sourcePackage.panel);
  if (packageColumns.has('type')) pushColumn('type', sourcePackage.type);
  if (packageColumns.has('max_discount')) pushColumn('max_discount', sourcePackage.max_discount);
  if (packageColumns.has('need_approval')) pushColumn('need_approval', sourcePackage.need_approval);
  if (packageColumns.has('active')) pushColumn('active', false);
  if (packageColumns.has('modified_date')) pushColumn('modified_date', new Date());
  if (packageColumns.has('password')) pushColumn('password', null);
  if (packageColumns.has('creation_date')) pushColumn('creation_date', sourcePackage.creation_date);
  if (packageColumns.has('creator')) pushColumn('creator', sourcePackage.creator);
  if (packageColumns.has('slug')) pushColumn('slug', null);
  if (packageColumns.has('system_default')) pushColumn('system_default', null);
  if (packageColumns.has('inverter_1')) pushColumn('inverter_1', selectedRule.to_product_bubble_id);
  if (packageColumns.has('inverter_2')) pushColumn('inverter_2', sourcePackage.inverter_2);
  if (packageColumns.has('inverter_3')) pushColumn('inverter_3', sourcePackage.inverter_3);
  if (packageColumns.has('inverter_4')) pushColumn('inverter_4', sourcePackage.inverter_4);
  if (packageColumns.has('unique_id')) pushColumn('unique_id', customPackageId);
  if (packageColumns.has('package_scope')) pushColumn('package_scope', 'invoice_custom');
  if (packageColumns.has('source_package_bubble_id')) pushColumn('source_package_bubble_id', sourcePackage.bubble_id);
  if (packageColumns.has('root_package_bubble_id')) pushColumn('root_package_bubble_id', rootPackageId);
  if (packageColumns.has('linked_invoice_bubble_id')) pushColumn('linked_invoice_bubble_id', linkedInvoiceId);
  if (packageColumns.has('is_locked')) pushColumn('is_locked', false);
  if (packageColumns.has('created_from_reason')) pushColumn('created_from_reason', `hybrid_upgrade:${selectedRule.bubble_id}`);

  const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');
  const insertQuery = `
    INSERT INTO package (${columnNames.join(', ')})
    VALUES (${placeholders})
    RETURNING bubble_id, package_name AS name, price, panel, panel_qty, invoice_desc, type, max_discount
  `;

  const insertRes = await client.query(insertQuery, insertValues);
  return {
    package: insertRes.rows[0],
    selectedRule
  };
}

async function attachCustomPackageToInvoice(client, packageId, invoiceId) {
  const packageColumns = await getTableColumns(client, 'package');
  if (!packageColumns.has('linked_invoice_bubble_id')) {
    return;
  }

  await client.query(
    `UPDATE package
     SET linked_invoice_bubble_id = $1,
         updated_at = NOW()
     WHERE bubble_id = $2`,
    [invoiceId, packageId]
  );
}

/**
 * Get invoice payment state used by edit restrictions.
 * Counts both verified payments and submitted payments as "has payment".
 * @private
 */
async function _getInvoicePaymentState(client, invoiceBubbleId, linkedPaymentIds = []) {
  const paymentIds = Array.isArray(linkedPaymentIds) ? linkedPaymentIds : [];

  const result = await client.query(
    `SELECT
        EXISTS(
          SELECT 1
          FROM payment p
          WHERE p.linked_invoice = $1
             OR p.bubble_id = ANY($2::text[])
        ) AS has_verified_payment,
        EXISTS(
          SELECT 1
          FROM submitted_payment sp
          WHERE sp.linked_invoice = $1
        ) AS has_submitted_payment,
        (
          SELECT COUNT(*)
          FROM payment p
          WHERE p.linked_invoice = $1
             OR p.bubble_id = ANY($2::text[])
        )::int AS verified_payment_count,
        (
          SELECT COUNT(*)
          FROM submitted_payment sp
          WHERE sp.linked_invoice = $1
        )::int AS submitted_payment_count`,
    [invoiceBubbleId, paymentIds]
  );

  return result.rows[0] || {
    has_verified_payment: false,
    has_submitted_payment: false,
    verified_payment_count: 0,
    submitted_payment_count: 0
  };
}

async function getVoucherPreviewDataByPackage(client, packageId) {
  const pkg = await getPackageById(client, packageId);
  if (!pkg) {
    throw new Error('Package not found');
  }

  const packageSummary = {
    bubble_id: null,
    invoice_number: null,
    total_amount: null,
    voucher_code: null,
    linked_package: pkg.bubble_id,
    customer_name: 'Draft Quotation',
    package_price: pkg.price,
    panel_qty: pkg.panel_qty,
    package_type: pkg.type,
    packagePrice: parseFloat(pkg.price) || 0,
    panelQty: parseInt(pkg.panel_qty, 10) || 0,
    packageTypeScope: normalizeVoucherCategoryPackageType(pkg.type)
  };

  const categoriesExist = await hasTable(client, 'voucher_category');
  if (!categoriesExist) {
    return {
      invoice: packageSummary,
      categories: [],
      selectedVoucherIds: [],
      selectedVoucherCodes: []
    };
  }

  const voucherColumns = await getTableColumns(client, 'voucher');
  const hasCategoryLink = voucherColumns.has('linked_voucher_category');

  const categoryRows = await client.query(
    `SELECT *
     FROM voucher_category
     WHERE active = TRUE AND COALESCE(disabled, FALSE) = FALSE
     ORDER BY created_at ASC, name ASC`
  );

  const categories = [];
  for (const category of categoryRows.rows) {
    const eligible = isVoucherCategoryEligible(category, packageSummary);
    const vouchers = hasCategoryLink
      ? await client.query(
        `SELECT *
         FROM voucher
         WHERE linked_voucher_category = $1
           AND active = TRUE
           AND ("delete" IS NULL OR "delete" = FALSE)
         ORDER BY created_at ASC, title ASC`,
        [category.bubble_id]
      )
      : { rows: [] };

    if (!vouchers.rows.length) continue;

    categories.push({
      ...category,
      eligible,
      vouchers: vouchers.rows
    });
  }

  return {
    invoice: packageSummary,
    categories,
    selectedVoucherIds: [],
    selectedVoucherCodes: []
  };
}

/**
 * Find or create a customer
 * @param {object} client - Database client
 * @param {object} data - Customer data
 * @returns {Promise<object|null>} { id: number, bubbleId: string } or null
 */
/**
 * Helper: Process vouchers and calculate total voucher amount
 * @private
 */
async function _processVouchers(client, { voucherCodes, voucherCode, voucherIds }, packagePrice) {
  // Consolidate codes: prefer voucherCodes array, fallback to voucherCode string
  let finalVoucherCodes = [];
  if (Array.isArray(voucherCodes) && voucherCodes.length > 0) {
    finalVoucherCodes = [...voucherCodes];
  } else if (voucherCode) {
    finalVoucherCodes = [voucherCode];
  }

  const finalVoucherIds = [...new Set((Array.isArray(voucherIds) ? voucherIds : []).map((id) => String(id).trim()).filter(Boolean))];

  // Remove duplicates
  finalVoucherCodes = [...new Set(finalVoucherCodes)];

  const voucherRows = [];
  for (const voucherId of finalVoucherIds) {
    const voucher = await getVoucherById(client, voucherId);
    if (voucher) {
      voucherRows.push(voucher);
    }
  }

  for (const code of finalVoucherCodes) {
    const voucher = await getVoucherByCode(client, code);
    if (voucher) {
      voucherRows.push(voucher);
    }
  }

  return buildVoucherInfoFromRows(voucherRows, packagePrice);
}

async function _processExistingInvoiceVouchers(client, invoiceId, fallbackVoucherCode, packagePrice) {
  const voucherRows = await getInvoiceSelectedVoucherRows(client, invoiceId, fallbackVoucherCode, {
    hasTable,
    getTableColumns,
    getVoucherByCode
  });
  return buildVoucherInfoFromRows(voucherRows, packagePrice);
}

async function getVoucherStepData(client, invoiceId) {
  return loadVoucherStepData(client, invoiceId, {
    hasTable,
    getTableColumns,
    getInvoiceSelectedVoucherRows: (innerClient, innerInvoiceId, innerFallbackVoucherCode) => getInvoiceSelectedVoucherRows(
      innerClient,
      innerInvoiceId,
      innerFallbackVoucherCode,
      {
        hasTable,
        getTableColumns,
        getVoucherByCode
      }
    )
  });
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
    const invoiceColumns = await getInvoiceColumns(client);
    const linkedReferralSelect = invoiceColumns.has('linked_referral')
      ? 'i.linked_referral AS linked_referral,'
      : 'NULL::text AS linked_referral,';
    const referrerNameSelect = invoiceColumns.has('referrer_name')
      ? "NULLIF(TRIM(i.referrer_name), '') AS referrer_name,"
      : 'NULL::text AS referrer_name,';
    const referralJoin = invoiceColumns.has('linked_referral')
      ? 'LEFT JOIN referral r ON i.linked_referral = r.bubble_id'
      : '';
    const referralFieldSelect = invoiceColumns.has('linked_referral')
      ? `r.name as referral_name,
        r.mobile_number as referral_phone,
        r.status as referral_status,`
      : `NULL::text as referral_name,
        NULL::text as referral_phone,
        NULL::text as referral_status,`;

    // Query 1: Get invoice with live joins
    const invoiceResult = await client.query(
      `SELECT 
        i.*,
        ${linkedReferralSelect}
        ${referrerNameSelect}
        COALESCE(c.name, 'Valued Customer') as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address as customer_address,
        c.profile_picture as profile_picture,
        c.lead_source as lead_source,
        c.remark as remark,
        ${referralFieldSelect}
       pkg.package_name as package_name,
       pkg.type as package_type
       FROM invoice i 
       LEFT JOIN customer c ON i.linked_customer = c.customer_id
       ${referralJoin}
       LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id OR i.linked_package = pkg.id::text
       WHERE (i.bubble_id = $1 OR i.id::text = $1)`,
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
        ii.linked_package,
        ii.linked_product,
        COALESCE(ii.linked_product, ii.linked_package) as product_id,
        COALESCE(pr.name, pkg.package_name, INITCAP(REPLACE(ii.inv_item_type, '_', ' ')), 'Item') as product_name
       FROM invoice_item ii
       LEFT JOIN package pkg ON ii.linked_package = pkg.bubble_id OR ii.linked_package = pkg.id::text
       LEFT JOIN product pr ON ii.linked_product = pr.bubble_id OR ii.linked_product = pr.id::text
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
    invoice.cny_promo_amount = invoice.items
      .filter(item => item.description?.includes('CNY 2026 Promo'))
      .reduce((sum, item) => sum + Math.abs(parseFloat(item.total_price) || 0), 0);

    invoice.holiday_boost_amount = invoice.items
      .filter(item => item.description?.includes('Holiday Boost Reward'))
      .reduce((sum, item) => sum + Math.abs(parseFloat(item.total_price) || 0), 0);

    invoice.earn_now_rebate_amount = invoice.items
      .filter(item => item.description?.includes('Earn Now Rebate'))
      .reduce((sum, item) => sum + Math.abs(parseFloat(item.total_price) || 0), 0);

    invoice.earth_month_go_green_bonus_amount = invoice.items
      .filter(item => item.description?.includes('Earth Month Go Green Bonus'))
      .reduce((sum, item) => sum + Math.abs(parseFloat(item.total_price) || 0), 0);

    invoice.discount_amount = invoice.items
      .filter(item =>
        item.item_type === 'discount'
        && !item.description?.includes('CNY 2026 Promo')
        && !item.description?.includes('Holiday Boost Reward')
        && !item.description?.includes('Earn Now Rebate')
        && !item.description?.includes('Earth Month Go Green Bonus')
      )
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
            `SELECT
                p.panel_qty,
                p.panel,
                p.inverter_1,
                panel_product.name AS panel_name,
                inverter_product.name AS inverter_name,
                panel_product.solar_output_rating
             FROM package p
             LEFT JOIN product panel_product ON (
               CAST(p.panel AS TEXT) = CAST(panel_product.id AS TEXT)
               OR CAST(p.panel AS TEXT) = CAST(panel_product.bubble_id AS TEXT)
             )
             LEFT JOIN product inverter_product ON (
               CAST(p.inverter_1 AS TEXT) = CAST(inverter_product.id AS TEXT)
               OR CAST(p.inverter_1 AS TEXT) = CAST(inverter_product.bubble_id AS TEXT)
             )
             WHERE p.bubble_id = $1 OR p.id::text = $1`,
            [invoice.linked_package]
          );
          if (packageResult.rows.length > 0) {
            const packageData = packageResult.rows[0];
            invoice.panel_qty = packageData.panel_qty;
            invoice.panel_rating = packageData.solar_output_rating;
            invoice.panel_name = packageData.panel_name || invoice.panel_name || null;
            invoice.inverter_name = packageData.inverter_name || invoice.inverter_name || null;
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

    // Query 6.5: Payment state for package-change restriction
    const linkedPaymentIds = Array.isArray(invoice.linked_payment) ? invoice.linked_payment : [];
    parallelQueries.push(
      _getInvoicePaymentState(client, bubbleId, linkedPaymentIds)
        .then(paymentState => {
          const hasLegacyPaidAmount = (parseFloat(invoice.paid_amount) || 0) > 0;
          const hasAnyPayment = Boolean(
            paymentState.has_verified_payment
            || paymentState.has_submitted_payment
            || hasLegacyPaidAmount
          );

          invoice.has_verified_payment = Boolean(paymentState.has_verified_payment);
          invoice.has_submitted_payment = Boolean(paymentState.has_submitted_payment);
          invoice.verified_payment_count = paymentState.verified_payment_count || 0;
          invoice.submitted_payment_count = paymentState.submitted_payment_count || 0;
          invoice.has_any_payment = hasAnyPayment;
          invoice.can_change_package = !hasAnyPayment;
        })
        .catch(err => {
          console.warn('Failed to fetch payment state:', err);
          invoice.has_verified_payment = false;
          invoice.has_submitted_payment = false;
          invoice.verified_payment_count = 0;
          invoice.submitted_payment_count = 0;
          invoice.has_any_payment = (parseFloat(invoice.paid_amount) || 0) > 0;
          invoice.can_change_package = !invoice.has_any_payment;
        })
    );

    // Query 7: Fetch Warranty Info from Package
    parallelQueries.push(
      _fetchWarrantyInfo(client, invoice.linked_package, invoice.items)
        .then(warranties => {
          invoice.warranties = warranties;
        })
        .catch(err => {
          console.warn('Failed to fetch warranties:', err);
          invoice.warranties = [];
        })
    );

    // Wait for all parallel queries to complete
    await Promise.all([...parallelQueries, getTemplatePromise]);

    return invoice;
  } catch (err) {
    console.error('Error in getInvoiceByBubbleId:', err);
    throw err;
  }
}

/**
 * Helper: Insert the main invoice record
 * @private
 */
async function _createInvoiceRecord(client, data, financials, deps, voucherInfo) {
  const invoiceColumns = await getInvoiceColumns(client);
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

  const insertColumns = [
    'bubble_id',
    'template_id',
    'linked_customer',
    'linked_agent',
    'linked_package'
  ];
  const values = [
    bubbleId,
    data.templateId || 'default',
    customerBubbleId,
    linkedAgent,
    data.packageId
  ];

  if (invoiceColumns.has('linked_referral')) {
    insertColumns.push('linked_referral');
    values.push(data.linkedReferral || null);
  }

  if (invoiceColumns.has('referrer_name')) {
    insertColumns.push('referrer_name');
    values.push(data.referrerName || null);
  }

  appendInvoiceEstimateInsertFields(invoiceColumns, data, insertColumns, values);

  insertColumns.push(
    'invoice_number',
    'status',
    'total_amount',
    'paid_amount',
    'balance_due',
    'invoice_date',
    'created_by',
    'share_token',
    'follow_up_date',
    'voucher_code'
  );
  values.push(
    invoiceNumber,
    data.status || 'draft',
    finalTotalAmount,
    0,
    finalTotalAmount,
    data.invoiceDate || new Date(),
    finalCreatedBy,
    shareToken,
    data.followUpDate || null,
    validVoucherCodes.join(', ') || null
  );

  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  const query = `
      INSERT INTO invoice 
      (${insertColumns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

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
  const packageItemBubbleId = await insertInvoiceItem(client, invoiceId, {
    description: pkg.invoice_desc || pkg.name || 'Solar Package',
    qty: 1,
    unitPrice: priceWithMarkup,
    amount: priceWithMarkup,
    itemType: 'package',
    sort: 0,
    isPackage: true,
    linkedPackage: pkg.bubble_id || null
  });
  createdItemIds.push(packageItemBubbleId);

  if (financials.earnNowRebateDiscount > 0) {
    const earnNowItemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: `Earn Now Rebate (Panel Qty: ${pkg.panel_qty})`,
      qty: 1,
      unitPrice: -financials.earnNowRebateDiscount,
      amount: -financials.earnNowRebateDiscount,
      itemType: 'discount',
      sort: 5,
      isPackage: false
    });
    createdItemIds.push(earnNowItemBubbleId);
  }

  if (financials.earthMonthGoGreenBonusDiscount > 0) {
    const earthMonthItemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: `Earth Month Go Green Bonus (Panel Qty: ${pkg.panel_qty})`,
      qty: 1,
      unitPrice: -financials.earthMonthGoGreenBonusDiscount,
      amount: -financials.earthMonthGoGreenBonusDiscount,
      itemType: 'discount',
      sort: 6,
      isPackage: false
    });
    createdItemIds.push(earthMonthItemBubbleId);
  }

  // 1.5 Extra Items
  if (Array.isArray(data.extraItems) && data.extraItems.length > 0) {
    let extraItemSortOrder = 50;
    for (const item of data.extraItems) {
      const linkedProductId = item.linked_product || item.linkedProduct || null;
      const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
        description: item.description || 'Extra Item',
        qty: item.qty || 1,
        unitPrice: item.unit_price || 0,
        amount: item.total_price || 0,
        itemType: 'extra',
        sort: extraItemSortOrder++,
        isPackage: false,
        linkedProduct: linkedProductId
      });
      createdItemIds.push(itemBubbleId);
    }
  }

  // 2. Discount Items
  let sortOrder = 100;
  if (discountFixed > 0) {
    const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: `Discount (RM ${discountFixed})`,
      qty: 1,
      unitPrice: -discountFixed,
      amount: -discountFixed,
      itemType: 'discount',
      sort: sortOrder++,
      isPackage: false
    });
    createdItemIds.push(itemBubbleId);
  }

  if (discountPercent > 0) {
    const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: `Discount (${discountPercent}%)`,
      qty: 1,
      unitPrice: -percentDiscountVal,
      amount: -percentDiscountVal,
      itemType: 'discount',
      sort: sortOrder++,
      isPackage: false
    });
    createdItemIds.push(itemBubbleId);
  }

  // 3. Voucher Items
  for (const vItem of voucherItemsToCreate) {
    const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: vItem.description,
      qty: 1,
      unitPrice: -vItem.amount,
      amount: -vItem.amount,
      itemType: 'voucher',
      sort: 101,
      isPackage: false
    });
    createdItemIds.push(itemBubbleId);
  }

  // 4. EPP Fee Item
  if (eppFeeAmount > 0) {
    const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: `Bank Processing Fee (${eppFeeDescription})`,
      qty: 1,
      unitPrice: eppFeeAmount,
      amount: eppFeeAmount,
      itemType: 'epp_fee',
      sort: 200,
      isPackage: false
    });
    createdItemIds.push(itemBubbleId);
  }

  // 5. Payment Structure Notice
  if (paymentStructure) {
    const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: paymentStructure,
      qty: 1,
      unitPrice: 0,
      amount: 0,
      itemType: 'notice',
      sort: 250,
      isPackage: false
    });
    createdItemIds.push(itemBubbleId);
  }

  // 6. SST Line Item (Dynamic derivation support)
  if (financials.sstAmount > 0) {
    const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
      description: 'SST (6%)',
      qty: 1,
      unitPrice: financials.sstAmount,
      amount: financials.sstAmount,
      itemType: 'sst',
      sort: 300,
      isPackage: false
    });
    createdItemIds.push(itemBubbleId);
  }

  // Update Invoice with Linked Items (Legacy requirement)
  if (createdItemIds.length > 0) {
    await syncLinkedInvoiceItems(client, invoiceId, createdItemIds);
  }

  return { packageItemBubbleId };
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
    await beginAgentAuditTransaction(client, data.auditContext);

    const linkedReferral = await resolveLinkedReferral(
      client,
      data.userId,
      data.linkedReferral || null,
      { referralRepo: require('../../Referral/services/referralRepo') }
    );
    if (linkedReferral) {
      data.linkedReferral = linkedReferral.bubble_id;
      data.referrerName = data.referrerName || linkedReferral.referrer_customer_name || null;
      data.customerName = data.customerName || linkedReferral.name || null;
      data.customerPhone = data.customerPhone || linkedReferral.mobile_number || null;
      data.customerAddress = data.customerAddress || linkedReferral.address || null;
      data.leadSource = data.leadSource || 'referral';
      data.remark = data.remark || `Assigned referral lead selected: ${linkedReferral.name || linkedReferral.bubble_id}`;
    }

    if (data.hybridUpgradeRuleId) {
      const originalPackageId = data.packageId;
      const clonedPackage = await clonePackageWithHybridUpgrade(
        client,
        data.packageId,
        data.hybridUpgradeRuleId,
        data.userId
      );
      data.packageId = clonedPackage.package.bubble_id;
      data.createdCustomPackageId = clonedPackage.package.bubble_id;
      data._hybridAudit = {
        originalPackageId,
        newPackageId: clonedPackage.package.bubble_id,
        upgradeRuleId: data.hybridUpgradeRuleId,
        upgradePriceAmount: clonedPackage.selectedRule.price_amount
      };
    }

    // 1. Fetch Dependencies (Package, Customer, Template)
    const deps = await fetchInvoiceDependencies(client, data, {
      getPackageById,
      getTemplateById,
      getDefaultTemplate,
      findOrCreateCustomer
    });

    // 2. Process Vouchers
    const packagePrice = parseFloat(deps.pkg.price) || 0;
    const voucherInfo = await _processVouchers(client, data, packagePrice);

    // 3. Calculate Financials
    const financials = calculateInvoiceFinancials(data, packagePrice, voucherInfo.totalVoucherAmount, deps.pkg ? deps.pkg.panel_qty : 0);

    // 3.5 Validate tiered max discount policy (vouchers excluded)
    const totalDiscountValue = financials.percentDiscountVal + (parseFloat(data.discountFixed) || 0);
    validateManualDiscountLimit(packagePrice, totalDiscountValue);

    // 4. Create Invoice Header
    const invoice = await _createInvoiceRecord(client, data, financials, deps, voucherInfo);

    if (data.createdCustomPackageId) {
      await attachCustomPackageToInvoice(client, data.createdCustomPackageId, invoice.bubble_id);
    }

    // 5. Create Line Items
    const { packageItemBubbleId } = await _createLineItems(client, invoice.bubble_id, data, financials, deps, voucherInfo);

    // 5.5 Audit hybrid upgrade application
    if (data._hybridAudit && packageItemBubbleId) {
      const auditTableExists = await hasTable(client, 'hybrid_inverter_upgrade_application');
      if (auditTableExists) {
        const auditBubbleId = `hiua_${crypto.randomBytes(10).toString('hex')}`;
        await client.query(
          `INSERT INTO hybrid_inverter_upgrade_application
           (bubble_id, invoice_item_bubble_id, invoice_bubble_id, original_package_bubble_id,
            new_package_bubble_id, upgrade_rule_bubble_id, upgrade_price_amount, applied_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            auditBubbleId,
            packageItemBubbleId,
            invoice.bubble_id,
            data._hybridAudit.originalPackageId,
            data._hybridAudit.newPackageId,
            data._hybridAudit.upgradeRuleId,
            data._hybridAudit.upgradePriceAmount,
            String(data.userId)
          ]
        );
      }
    }

    await syncReferralInvoiceLink(client, invoice.bubble_id, data.linkedReferral || null);

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
    await client.query('ROLLBACK').catch(() => { });
    console.error('Error creating invoice:', err);
    throw err;
  }
}

/**
 * Resolve any identifier (id, bubble_id, or share_token) to a bubble_id
 * @param {object} client - Database client
 * @param {string} identifier - Any identifier
 * @returns {Promise<string|null>} bubble_id or null
 */
async function resolveInvoiceBubbleId(client, identifier) {
  try {
    const res = await client.query(
      `SELECT bubble_id FROM invoice WHERE bubble_id = $1 OR share_token = $1 OR id::text = $1 LIMIT 1`,
      [identifier]
    );
    return res.rows.length > 0 ? res.rows[0].bubble_id : null;
  } catch (err) {
    return null;
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
    const bubbleId = await resolveInvoiceBubbleId(client, tokenOrId);
    if (!bubbleId) return null;

    // Reuse the working logic from getInvoiceByBubbleId
    return await getInvoiceByBubbleId(client, bubbleId);
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
 * Get invoices for a user/agent - REWRITTEN LOGIC
 * - Filters by the same ownership aliases used elsewhere:
 *   user ID, user bubble ID, and linked agent profile
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
  const invoiceColumns = await getInvoiceColumns(client);
  const limit = parseInt(options.limit) || 100;
  const offset = parseInt(options.offset) || 0;
  const { startDate, endDate, paymentStatus } = options;

  // 1. Resolve all ownership aliases for the current user.
  let ownerIds = [];
  let agentProfileId = null;
  try {
    const userRes = await client.query(`
        SELECT u.id::text AS user_id,
               u.bubble_id,
               u.linked_agent_profile
        FROM "user" u
        WHERE u.id::text = $1 OR u.bubble_id = $1
        LIMIT 1
    `, [String(userId)]);

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      agentProfileId = user.linked_agent_profile || null;

      ownerIds = [];
      if (user.bubble_id) ownerIds.push(user.bubble_id);
      if (user.user_id) ownerIds.push(user.user_id);
      if (agentProfileId) ownerIds.push(agentProfileId);

      ownerIds = [...new Set(ownerIds.filter(Boolean).map(String))];
    }
  } catch (e) {
    console.warn('[DB] Agent/User lookup failed for', userId);
  }

  if (ownerIds.length === 0) {
    return { invoices: [], total: 0, limit, offset };
  }

  let filterClause = '';
  const params = [ownerIds, agentProfileId, paymentStatus];
  let paramIdx = 4;

  if (startDate) {
    filterClause += ` AND invoice_date >= $${paramIdx++}::date`;
    params.push(startDate);
  }

  if (endDate) {
    filterClause += ` AND invoice_date <= $${paramIdx++}::date`;
    params.push(endDate);
  }

  const linkedReferralSelect = invoiceColumns.has('linked_referral')
    ? 'i.linked_referral,'
    : 'NULL::text AS linked_referral,';
  const invoiceReferrerExpr = invoiceColumns.has('referrer_name')
    ? "NULLIF(TRIM(i.referrer_name), '')"
    : 'NULL';
  const referralJoin = invoiceColumns.has('linked_referral')
    ? `LEFT JOIN referral ref ON i.linked_referral = ref.bubble_id
        LEFT JOIN customer referrer ON ref.linked_customer_profile = referrer.customer_id`
    : '';
  const referralReferrerExpr = invoiceColumns.has('linked_referral')
    ? `COALESCE(
                ${invoiceReferrerExpr},
                NULLIF(TRIM(referrer.name), ''),
                NULLIF(TRIM(ref.linked_customer_profile), '')
            )`
    : invoiceReferrerExpr;

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
            ${linkedReferralSelect}
            COALESCE(
                i.linked_seda_registration, 
                (SELECT s.bubble_id FROM seda_registration s WHERE i.bubble_id = ANY(s.linked_invoice) LIMIT 1)
            ) as linked_seda_registration,
            ${referralReferrerExpr} as referral_referrer_name,
            
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
        LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id OR i.linked_package = pkg.id::text
        ${referralJoin}
        WHERE (
            i.created_by = ANY($1::text[])
            OR ($2::text IS NOT NULL AND i.linked_agent = $2)
        )
        AND i.is_latest = true 
        AND (i.status != 'deleted' OR i.status IS NULL OR $3 = 'deleted')
    )
  `;

  // Payment Status Filtering logic based on calculated total_received
  if (paymentStatus) {
    if (paymentStatus === 'unpaid') {
      filterClause += ` AND (total_received IS NULL OR total_received <= 0) AND status != 'deleted'`;
    } else if (paymentStatus === 'partial') {
      filterClause += ` AND total_received > 0 AND total_received < total_amount AND status != 'deleted'`;
    } else if (paymentStatus === 'paid') {
      filterClause += ` AND total_received >= total_amount AND total_amount > 0 AND status != 'deleted'`;
    } else if (paymentStatus === 'deleted') {
      filterClause += ` AND status = 'deleted'`;
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
  const invoiceColumns = await getInvoiceColumns(client);

  try {
    await beginAgentAuditTransaction(client, data.auditContext);

    // 1. Fetch current record
    const currentRes = await client.query(
      `SELECT id, bubble_id, total_amount, status, linked_customer, linked_package, linked_agent,
              ${invoiceColumns.has('linked_referral') ? 'linked_referral' : 'NULL::text AS linked_referral'},
              ${invoiceColumns.has('referrer_name') ? 'referrer_name' : 'NULL::text AS referrer_name'},
              ${invoiceColumns.has('customer_average_tnb') ? 'customer_average_tnb' : 'NULL::numeric AS customer_average_tnb'},
              ${invoiceColumns.has('estimated_saving') ? 'estimated_saving' : 'NULL::numeric AS estimated_saving'},
              ${invoiceColumns.has('estimated_new_bill_amount') ? 'estimated_new_bill_amount' : 'NULL::numeric AS estimated_new_bill_amount'},
              ${invoiceColumns.has('solar_sun_peak_hour') ? 'solar_sun_peak_hour' : 'NULL::numeric AS solar_sun_peak_hour'},
              ${invoiceColumns.has('solar_morning_usage_percent') ? 'solar_morning_usage_percent' : 'NULL::numeric AS solar_morning_usage_percent'},
              version, paid_amount, linked_payment
       FROM invoice
       WHERE bubble_id = $1`,
      [bubbleId]
    );
    const currentData = currentRes.rows[0];
    if (!currentData) throw new Error('Invoice not found');

    const linkedReferral = await resolveLinkedReferral(
      client,
      data.userId,
      data.linkedReferral || null,
      { referralRepo: require('../../Referral/services/referralRepo') },
      bubbleId
    );

    if (linkedReferral) {
      data.linkedReferral = linkedReferral.bubble_id;
      data.referrerName = data.referrerName || linkedReferral.referrer_customer_name || null;
      data.customerName = data.customerName || linkedReferral.name || null;
      data.customerPhone = data.customerPhone || linkedReferral.mobile_number || null;
      data.customerAddress = data.customerAddress || linkedReferral.address || null;
      data.leadSource = data.leadSource || 'referral';
      data.remark = data.remark || `Assigned referral lead selected: ${linkedReferral.name || linkedReferral.bubble_id}`;
    } else {
      data.linkedReferral = null;
      data.referrerName = data.referrerName ?? currentData.referrer_name ?? null;
    }

    const requestedSourcePackageId = data.packageId || currentData.linked_package || null;
    const currentPackageId = currentData.linked_package || null;
    const isPackageChange = Boolean(data.hybridUpgradeRuleId) || requestedSourcePackageId !== currentPackageId;

    if (isPackageChange) {
      const paymentState = await _getInvoicePaymentState(client, bubbleId, currentData.linked_payment);
      const hasLegacyPaidAmount = (parseFloat(currentData.paid_amount) || 0) > 0;
      const hasAnyPayment = Boolean(
        paymentState.has_verified_payment
        || paymentState.has_submitted_payment
        || hasLegacyPaidAmount
      );

      if (hasAnyPayment) {
        throw new Error('Package cannot be changed because this invoice already has payment records. Only invoices without any payment can change package.');
      }
    }

    // 2. Resolve Dependencies
    let requestedPackageId = requestedSourcePackageId;
    if (data.hybridUpgradeRuleId) {
      const clonedPackage = await clonePackageWithHybridUpgrade(
        client,
        requestedSourcePackageId,
        data.hybridUpgradeRuleId,
        data.userId,
        bubbleId
      );
      requestedPackageId = clonedPackage.package.bubble_id;
    }

    const pkg = await getPackageById(client, requestedPackageId);
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
        leadSource: data.leadSource,
        remark: data.remark,
        createdBy: data.userId,
        existingCustomerBubbleId: currentData.linked_customer // Pass existing customer to update instead of create new
      });
      if (custResult) {
        customerBubbleId = custResult.bubbleId;
      }
    }

    // 4. Calculate Financials
    const packagePrice = parseFloat(pkg.price) || 0;
    const voucherInfo = Array.isArray(data.voucherCodes) || data.voucherCode || (Array.isArray(data.voucherIds) && data.voucherIds.length > 0)
      ? await _processVouchers(client, data, packagePrice)
      : await _processExistingInvoiceVouchers(client, bubbleId, currentData.voucher_code, packagePrice);
    const financials = calculateInvoiceFinancials(data, packagePrice, voucherInfo.totalVoucherAmount, pkg.panel_qty);

    // Validate tiered max discount policy (vouchers excluded)
    const totalDiscountValue = financials.percentDiscountVal + (parseFloat(data.discountFixed) || 0);
    validateManualDiscountLimit(packagePrice, totalDiscountValue);

    const { finalTotalAmount } = financials;

    // 5. Standard SQL UPDATE
    const updateAssignments = [
      'template_id = $1',
      'linked_package = $2',
      'linked_customer = $3'
    ];
    const updateValues = [
      data.templateId || 'default',
      requestedPackageId,
      customerBubbleId
    ];
    let updateParamIdx = updateValues.length + 1;

    if (invoiceColumns.has('linked_referral')) {
      updateAssignments.push(`linked_referral = $${updateParamIdx++}`);
      updateValues.push(data.linkedReferral);
    }

    if (invoiceColumns.has('referrer_name')) {
      updateAssignments.push(`referrer_name = $${updateParamIdx++}`);
      updateValues.push(data.referrerName || null);
    }

    updateParamIdx = appendInvoiceEstimateUpdateFields(
      invoiceColumns,
      data,
      currentData,
      updateAssignments,
      updateValues,
      updateParamIdx
    );

    updateAssignments.push(
      `total_amount = $${updateParamIdx}`,
      `balance_due = $${updateParamIdx} - COALESCE(paid_amount, 0)`
    );
    updateValues.push(finalTotalAmount);
    updateParamIdx += 1;

    updateAssignments.push(
      `status = $${updateParamIdx++}`,
      `follow_up_date = $${updateParamIdx++}`,
      `voucher_code = $${updateParamIdx++}`,
      'updated_at = NOW()'
    );
    updateValues.push(
      data.status || currentData.status,
      data.followUpDate || null,
      voucherInfo.validVoucherCodes.join(', ') || null
    );
    updateValues.push(bubbleId);

    const updateQuery = `
        UPDATE invoice SET 
            ${updateAssignments.join(', ')}
        WHERE bubble_id = $${updateValues.length}
    `;
    await client.query(updateQuery, updateValues);

    // 6. Item Update (Smart: Delete old and insert new for consistency)
    // We stick to delete/insert here but ensure they keep the same linked_invoice (UID)
    await client.query('DELETE FROM invoice_item WHERE linked_invoice = $1', [bubbleId]);
    await _createLineItems(client, bubbleId, data, financials, { pkg, linkedAgent }, voucherInfo);

    await syncReferralInvoiceLink(client, bubbleId, data.linkedReferral);

    await client.query('COMMIT');

    // Return the updated state
    const result = await getInvoiceByBubbleId(client, bubbleId);
    return {
      ...result,
      customerBubbleId: customerBubbleId
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    throw err;
  }
}

async function _replaceInvoiceVoucherSelections(client, invoiceId, voucherRows, createdBy) {
  const hasSelectionTable = await hasTable(client, 'invoice_voucher_selection');
  if (!hasSelectionTable) return;

  const selectionColumns = await getTableColumns(client, 'invoice_voucher_selection');
  const previousSelections = await client.query(
    `SELECT linked_voucher
     FROM invoice_voucher_selection
     WHERE linked_invoice = $1`,
    [invoiceId]
  );

  const previousVoucherIds = new Set(previousSelections.rows.map((row) => String(row.linked_voucher)));
  const nextVoucherIds = new Set(
    voucherRows
      .map((voucher) => String(voucher.bubble_id || voucher.id || ''))
      .filter(Boolean)
  );

  const releasedIds = [...previousVoucherIds].filter((id) => !nextVoucherIds.has(id));
  const newlyAppliedIds = [...nextVoucherIds].filter((id) => !previousVoucherIds.has(id));

  if (releasedIds.length > 0) {
    await client.query(
      `UPDATE voucher
       SET voucher_availability = CASE
         WHEN voucher_availability IS NULL THEN NULL
         ELSE voucher_availability + 1
       END,
       updated_at = NOW()
       WHERE bubble_id = ANY($1::text[])`,
      [releasedIds]
    );
  }

  if (newlyAppliedIds.length > 0) {
    const locked = await client.query(
      `SELECT bubble_id, voucher_availability
       FROM voucher
       WHERE bubble_id = ANY($1::text[])
       FOR UPDATE`,
      [newlyAppliedIds]
    );

    for (const voucher of locked.rows) {
      if (voucher.voucher_availability !== null && parseInt(voucher.voucher_availability, 10) <= 0) {
        throw new Error(`Voucher ${voucher.bubble_id} is no longer available.`);
      }
    }

    await client.query(
      `UPDATE voucher
       SET voucher_availability = CASE
         WHEN voucher_availability IS NULL THEN NULL
         ELSE voucher_availability - 1
       END,
       updated_at = NOW()
       WHERE bubble_id = ANY($1::text[])`,
      [newlyAppliedIds]
    );
  }

  await client.query('DELETE FROM invoice_voucher_selection WHERE linked_invoice = $1', [invoiceId]);

  for (const voucher of voucherRows) {
    const selectionBubbleId = `ivs_${crypto.randomBytes(8).toString('hex')}`;
    const fields = ['bubble_id', 'linked_invoice', 'linked_voucher'];
    const values = [selectionBubbleId, invoiceId, voucher.bubble_id || String(voucher.id)];

    if (selectionColumns.has('linked_voucher_category')) {
      fields.push('linked_voucher_category');
      values.push(voucher.linked_voucher_category || null);
    }
    if (selectionColumns.has('voucher_code_snapshot')) {
      fields.push('voucher_code_snapshot');
      values.push(voucher.voucher_code || null);
    }
    if (selectionColumns.has('voucher_title_snapshot')) {
      fields.push('voucher_title_snapshot');
      values.push(voucher.title || null);
    }
    if (selectionColumns.has('voucher_amount_snapshot')) {
      fields.push('voucher_amount_snapshot');
      values.push(voucher.discount_amount || null);
    }
    if (selectionColumns.has('voucher_percent_snapshot')) {
      fields.push('voucher_percent_snapshot');
      values.push(voucher.discount_percent || null);
    }
    if (selectionColumns.has('created_by')) {
      fields.push('created_by');
      values.push(createdBy || null);
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    await client.query(
      `INSERT INTO invoice_voucher_selection (${fields.join(', ')}, created_at, updated_at)
       VALUES (${placeholders}, NOW(), NOW())`,
      values
    );
  }
}

async function applyInvoiceVoucherSelections(client, invoiceId, voucherIds, userId, auditContext) {
  try {
    await beginAgentAuditTransaction(client, auditContext);

    const invoice = await _getInvoiceVoucherStepSummary(client, invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const categoriesExist = await hasTable(client, 'voucher_category');
    const selectionExists = await hasTable(client, 'invoice_voucher_selection');
    if (!categoriesExist || !selectionExists) {
      throw new Error('Voucher category setup is not available yet.');
    }

    const categoryColumns = await getTableColumns(client, 'voucher_category');
    const voucherColumns = await getTableColumns(client, 'voucher');
    if (!voucherColumns.has('linked_voucher_category')) {
      throw new Error('Voucher category linkage is not available yet.');
    }

    const normalizedVoucherIds = [...new Set((Array.isArray(voucherIds) ? voucherIds : []).map((id) => String(id).trim()).filter(Boolean))];
    const selectedRows = [];
    for (const voucherId of normalizedVoucherIds) {
      const voucher = await getVoucherById(client, voucherId);
      if (!voucher) {
        throw new Error(`Voucher not found: ${voucherId}`);
      }
      selectedRows.push(voucher);
    }

    const categoryMap = new Map();
    const categoryIds = [...new Set(selectedRows.map((row) => row.linked_voucher_category).filter(Boolean))];
    if (categoryIds.length > 0) {
      const categories = await client.query(
        `SELECT *
         FROM voucher_category
         WHERE bubble_id = ANY($1::text[])`,
        [categoryIds]
      );
      categories.rows.forEach((category) => categoryMap.set(category.bubble_id, category));
    }

    const selectedByCategory = new Map();
    for (const voucher of selectedRows) {
      if (!voucher.linked_voucher_category) {
        throw new Error(`Voucher ${voucher.voucher_code} is not assigned to an active voucher group.`);
      }

      const category = categoryMap.get(voucher.linked_voucher_category);
      if (!category || !category.active || category.disabled) {
        throw new Error(`Voucher group for ${voucher.voucher_code} is not active.`);
      }

      if (!isVoucherCategoryEligible(category, invoice)) {
        throw new Error(`Invoice does not meet the requirements for voucher group "${category.name}".`);
      }

      if (!selectedByCategory.has(category.bubble_id)) {
        selectedByCategory.set(category.bubble_id, []);
      }
      selectedByCategory.get(category.bubble_id).push(voucher);
    }

    for (const [categoryId, vouchers] of selectedByCategory.entries()) {
      const category = categoryMap.get(categoryId);
      const maxSelectable = Math.max(1, parseInt(category.max_selectable, 10) || 1);
      if (vouchers.length > maxSelectable) {
        throw new Error(`Voucher group "${category.name}" allows only ${maxSelectable} voucher${maxSelectable === 1 ? '' : 's'}.`);
      }
    }

    await _replaceInvoiceVoucherSelections(client, invoiceId, selectedRows, userId);

    const allItemsResult = await client.query(
      `SELECT bubble_id, description, amount, inv_item_type, sort, created_at
       FROM invoice_item
       WHERE linked_invoice = $1
       ORDER BY sort ASC, created_at ASC`,
      [invoiceId]
    );

    const existingItems = allItemsResult.rows;
    const preservedItems = existingItems.filter((item) => item.inv_item_type !== 'voucher' && item.inv_item_type !== 'sst');
    const removedItemIds = existingItems
      .filter((item) => item.inv_item_type === 'voucher' || item.inv_item_type === 'sst')
      .map((item) => item.bubble_id);

    if (removedItemIds.length > 0) {
      await client.query(
        `DELETE FROM invoice_item
         WHERE bubble_id = ANY($1::text[])`,
        [removedItemIds]
      );
    }

    const baseTaxableWithoutVoucher = preservedItems
      .filter((item) => !['notice', 'epp_fee'].includes(item.inv_item_type))
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const eppFeeTotal = preservedItems
      .filter((item) => item.inv_item_type === 'epp_fee')
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    const voucherInfo = _buildVoucherInfoFromRows(selectedRows, invoice.packagePrice);
    const taxableSubtotal = baseTaxableWithoutVoucher - voucherInfo.totalVoucherAmount;
    if (taxableSubtotal <= 0) {
      throw new Error('Total amount cannot be zero or negative after applying discounts and vouchers.');
    }

    const hadSst = existingItems.some((item) => item.inv_item_type === 'sst');
    const sstAmount = hadSst ? (taxableSubtotal * 6) / 100 : 0;
    const finalTotalAmount = taxableSubtotal + sstAmount + eppFeeTotal;

    const newItemIds = preservedItems.map((item) => item.bubble_id);
    let sortOrder = 101;
    for (const vItem of voucherInfo.voucherItemsToCreate) {
      const itemBubbleId = await insertInvoiceItem(client, invoiceId, {
        description: vItem.description,
        qty: 1,
        unitPrice: -vItem.amount,
        amount: -vItem.amount,
        itemType: 'voucher',
        sort: sortOrder++,
        isPackage: false
      });
      newItemIds.push(itemBubbleId);
    }

    if (sstAmount > 0) {
      const sstItemBubbleId = await insertInvoiceItem(client, invoiceId, {
        description: 'SST (6%)',
        qty: 1,
        unitPrice: sstAmount,
        amount: sstAmount,
        itemType: 'sst',
        sort: 300,
        isPackage: false
      });
      newItemIds.push(sstItemBubbleId);
    }

    await client.query(
      `UPDATE invoice
       SET voucher_code = $1,
           total_amount = $2,
           balance_due = $2 - COALESCE(paid_amount, 0),
           linked_invoice_item = $3,
           updated_at = NOW()
       WHERE bubble_id = $4`,
      [voucherInfo.validVoucherCodes.join(', ') || null, finalTotalAmount, newItemIds, invoiceId]
    );

    await client.query('COMMIT');
    return getInvoiceByBubbleId(client, invoiceId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
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
     (bubble_id, template_id, linked_customer, linked_agent, linked_package, linked_referral, invoice_number,
      invoice_date, agent_markup,
      discount_fixed, discount_percent, voucher_code,
      total_amount, status, share_token, share_enabled,
      share_expires_at, created_by, version, root_id, parent_id, is_latest, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
     RETURNING *`,
    [
      bubbleId,
      org.template_id,
      customerBubbleId,
      linkedAgent,
      org.linked_package,
      data.linkedReferral || org.linked_referral || null,
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
  return [];
}

/**
 * Delete all "Sample Quotation" invoices for a user
 * @param {object} client - Database client
 * @param {string} userId - User ID
 * @returns {Promise<number>} Count of deleted invoices
 */
async function deleteSampleInvoices(client, userId, auditContext) {
  try {
    await beginAgentAuditTransaction(client, auditContext);

    // 1. Find target invoices (created by user)
    let legacyUserId = null;
    let userBubbleId = null;
    let userAgentProfile = null;
    try {
      const userRes = await client.query(
        `SELECT id::text AS user_id, bubble_id, linked_agent_profile
         FROM "user"
         WHERE id::text = $1 OR bubble_id = $1`,
        [String(userId)]
      );
      if (userRes.rows.length > 0) {
        legacyUserId = userRes.rows[0].user_id || null;
        userBubbleId = userRes.rows[0].bubble_id || null;
        userAgentProfile = userRes.rows[0].linked_agent_profile || null;
      }
    } catch (e) { }

    const ownerIdentifiers = [...new Set([userBubbleId, String(userId), legacyUserId].filter(Boolean))];
    const params = [ownerIdentifiers];
    let whereClause = `(created_by = ANY($1::text[])`;
    if (userAgentProfile) {
      whereClause += ` OR created_by = $2::varchar`;
      params.push(userAgentProfile);
    }
    if (userAgentProfile) {
      const agentParamIndex = params.length + 1;
      whereClause += ` OR linked_agent = $${agentParamIndex}::varchar`;
      params.push(userAgentProfile);
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
  return null;
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
  getHybridUpgradeOptionsForPackage,
  clonePackageWithHybridUpgrade,
  attachCustomPackageToInvoice,
  getDefaultTemplate,
  getTemplateById,
  getVoucherByCode,
  createInvoiceOnTheFly,
  resolveInvoiceBubbleId,
  getInvoiceByShareToken: getPublicInvoice, // Alias for backward compatibility
  getPublicInvoice,
  recordInvoiceView,
  getInvoicesByUserId,
  getPublicVouchers,
  updateInvoiceTransaction,
  getInvoiceByBubbleId,
  getVoucherPreviewDataByPackage,
  getVoucherStepData,
  applyInvoiceVoucherSelections,
  getInvoiceHistory,
  getInvoiceActionById,
  deleteSampleInvoices,
  verifyOwnership,
  hasTable
};
