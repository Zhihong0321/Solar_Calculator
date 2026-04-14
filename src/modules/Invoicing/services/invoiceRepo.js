/**
 * [AI-CONTEXT]
 * Domain: Invoicing Repository
 * Primary Responsibility: Low-level Database (PostgreSQL) operations for Invoices, Items, and Customers.
 * Architecture Rule: This file should contain PURE SQL logic and minimal business orchestration.
 * Architecture Rule: Complex business logic (validations, external service calls) belongs in 'invoiceService.js'.
 * Performance Note: Uses atomic updates for invoice number generation to prevent race conditions.
 */
const crypto = require('crypto');
const { beginAgentAuditTransaction } = require('./agentAuditContext');
const tablePresenceCache = new Map();

// Tiered manual discount policy based on package price
const MANUAL_DISCOUNT_POLICY = [
  { minPrice: 40000, maxPercent: 7 },
  { minPrice: 30000, maxPercent: 6 },
  { minPrice: 18000, maxPercent: 5 }
];

function getManualDiscountPolicy(packagePrice) {
  const normalizedPrice = parseFloat(packagePrice) || 0;
  const matchedTier = MANUAL_DISCOUNT_POLICY.find((tier) => normalizedPrice >= tier.minPrice);
  const maxPercent = matchedTier ? matchedTier.maxPercent : 0;

  return {
    maxPercent,
    maxAmount: normalizedPrice * (maxPercent / 100)
  };
}

function validateManualDiscountLimit(packagePrice, totalDiscountValue) {
  const { maxPercent, maxAmount } = getManualDiscountPolicy(packagePrice);

  if (totalDiscountValue > (maxAmount + 0.01)) {
    throw new Error(
      `Manual discount (RM ${totalDiscountValue.toFixed(2)}) exceeds the maximum allowed for this package tier of ${maxPercent}% of package price (RM ${maxAmount.toFixed(2)}). Vouchers are not subject to this limit.`
    );
  }
}

const APRIL_2026_PROMO_END = new Date('2026-05-01T00:00:00');

function isApril2026PromotionActive() {
  return new Date() < APRIL_2026_PROMO_END;
}

function getEarnNowRebateDiscount(panelQty) {
  if (!isApril2026PromotionActive()) return 0;

  const qty = parseInt(panelQty, 10) || 0;
  if (qty >= 11 && qty <= 18) return 1000;
  if (qty >= 19 && qty <= 25) return 1500;
  if (qty >= 26 && qty <= 30) return 2000;
  if (qty >= 31 && qty <= 36) return 2500;
  return 0;
}

function getEarthMonthGoGreenBonusDiscount(panelQty) {
  if (!isApril2026PromotionActive()) return 0;

  const qty = parseInt(panelQty, 10) || 0;
  if (qty >= 11 && qty <= 17) return 600;
  if (qty >= 18 && qty <= 24) return 1200;
  if (qty >= 25 && qty <= 36) return 1500;
  return 0;
}

/**
 * Generate a unique share token
 * @returns {string} Share token
 */
function generateShareToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function getInvoiceColumns(client) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoice'`
  );

  return new Set(result.rows.map((row) => row.column_name));
}

async function hasTable(client, tableName) {
  if (tablePresenceCache.has(tableName)) {
    return tablePresenceCache.get(tableName);
  }

  const result = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  );

  const exists = result.rows.length > 0;
  tablePresenceCache.set(tableName, exists);
  return exists;
}

async function getTableColumns(client, tableName) {
  const cacheKey = `${tableName}:columns`;
  if (tablePresenceCache.has(cacheKey)) {
    return tablePresenceCache.get(cacheKey);
  }

  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  tablePresenceCache.set(cacheKey, columns);
  return columns;
}

function normalizeNullableNumber(value, { integer = false } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  const parsed = integer ? Math.round(numericValue) : parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
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
async function _fetchWarrantyInfo(client, packageId) {
  try {
    // 1. Get Package Details
    const pkgRes = await client.query(
      `SELECT panel, inverter_1, inverter_2, inverter_3, inverter_4, linked_package_item 
       FROM package 
       WHERE bubble_id = $1`,
      [packageId]
    );

    if (pkgRes.rows.length === 0) return [];
    const pkg = pkgRes.rows[0];

    // 2. Collect Product IDs
    const productIds = [];
    if (pkg.panel) productIds.push(pkg.panel);
    if (pkg.inverter_1) productIds.push(pkg.inverter_1);
    if (pkg.inverter_2) productIds.push(pkg.inverter_2);
    if (pkg.inverter_3) productIds.push(pkg.inverter_3);
    if (pkg.inverter_4) productIds.push(pkg.inverter_4);

    // 3. Check Package Items for more products
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

    if (productIds.length === 0) return [];

    // 4. Fetch Product Warranties
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

/**
 * Get package by bubble_id
 * @param {object} client - Database client
 * @param {string} packageId - Package bubble_id
 * @returns {Promise<object|null>} Package object or null
 */
async function getPackageById(client, packageId) {
  try {
    const result = await client.query(
      `SELECT bubble_id, package_name as name, price, panel, panel_qty, invoice_desc, type, max_discount
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
        p.bubble_id,
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
     WHERE p.bubble_id = $1
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
       WHERE voucher_code = $1 AND active = TRUE AND ("delete" IS NULL OR "delete" = FALSE)
       LIMIT 1`,
      [voucherCode]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error fetching voucher:', err);
    return null;
  }
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

async function getVoucherById(client, voucherId) {
  try {
    const result = await client.query(
      `SELECT *
       FROM voucher
       WHERE bubble_id = $1 OR id::text = $1
       LIMIT 1`,
      [voucherId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Error fetching voucher by ID:', err);
    throw err;
  }
}

function _buildVoucherInfoFromRows(voucherRows, packagePrice) {
  const seenCodes = new Set();
  let totalVoucherAmount = 0;
  const voucherItemsToCreate = [];
  const validVoucherCodes = [];
  const selectedVoucherIds = [];

  for (const voucher of voucherRows) {
    if (!voucher) continue;

    const code = String(voucher.voucher_code || '').trim();
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);

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
      selectedVoucherIds.push(voucher.bubble_id || String(voucher.id || ''));
      voucherItemsToCreate.push({
        description: desc,
        amount,
        code,
        voucherId: voucher.bubble_id || String(voucher.id || ''),
        categoryId: voucher.linked_voucher_category || null
      });
    }
  }

  return { totalVoucherAmount, voucherItemsToCreate, validVoucherCodes, selectedVoucherIds };
}

async function _getInvoiceSelectedVoucherRows(client, invoiceId, fallbackVoucherCode) {
  const hasSelectionTable = await hasTable(client, 'invoice_voucher_selection');
  if (hasSelectionTable) {
    const selectionColumns = await getTableColumns(client, 'invoice_voucher_selection');
    const linkedVoucherCategorySelect = selectionColumns.has('linked_voucher_category')
      ? 'ivs.linked_voucher_category as selected_category_id,'
      : 'NULL::text as selected_category_id,';

    const result = await client.query(
      `SELECT
          v.*,
          ${linkedVoucherCategorySelect}
          ivs.bubble_id as selection_id
       FROM invoice_voucher_selection ivs
       LEFT JOIN voucher v ON ivs.linked_voucher = v.bubble_id OR ivs.linked_voucher = v.id::text
       WHERE ivs.linked_invoice = $1
       ORDER BY ivs.created_at ASC`,
      [invoiceId]
    );

    const rows = result.rows.filter((row) => row?.voucher_code);
    if (rows.length > 0) {
      return rows;
    }
  }

  const codes = String(fallbackVoucherCode || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

  const rows = [];
  for (const code of codes) {
    const voucher = await getVoucherByCode(client, code);
    if (voucher) rows.push(voucher);
  }
  return rows;
}

/**
 * Find or create a customer
 * @param {object} client - Database client
 * @param {object} data - Customer data
 * @returns {Promise<object|null>} { id: number, bubbleId: string } or null
 */
async function findOrCreateCustomer(client, data) {
  const { name, phone, address, createdBy, profilePicture, leadSource, remark, existingCustomerBubbleId } = data;
  if (!name) return null;

  try {
    // 0. If we have an existing customer ID, update that customer directly (including name change)
    if (existingCustomerBubbleId) {
      const existingRes = await client.query(
        'SELECT id, customer_id, name, phone, address, profile_picture, lead_source, remark FROM customer WHERE customer_id = $1 LIMIT 1',
        [existingCustomerBubbleId]
      );

      if (existingRes.rows.length > 0) {
        const customer = existingRes.rows[0];
        const id = customer.id;
        const bubbleId = customer.customer_id;

        // Update customer (including name change)
        await client.query(
          `UPDATE customer 
           SET name = COALESCE($1, name),
               phone = COALESCE($2, phone), 
               address = COALESCE($3, address),
               profile_picture = COALESCE($6, profile_picture),
               lead_source = COALESCE($7, lead_source),
               remark = COALESCE($8, remark),
               updated_at = NOW(),
               updated_by = $5
           WHERE id = $4`,
          [name, phone, address, id, String(createdBy), profilePicture, leadSource, remark]
        );
        return { id, bubbleId };
      }
    }

    // 1. Try to find by name (only if no existing customer ID or not found)
    const findRes = await client.query(
      'SELECT id, customer_id, phone, address, profile_picture, lead_source, remark FROM customer WHERE name = $1 LIMIT 1',
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
        (profilePicture && profilePicture !== customer.profile_picture) ||
        (leadSource && leadSource !== customer.lead_source) ||
        (remark && remark !== customer.remark)
      ) {
        await client.query(
          `UPDATE customer 
           SET phone = COALESCE($1, phone), 
               address = COALESCE($2, address),
               profile_picture = COALESCE($5, profile_picture),
               lead_source = COALESCE($6, lead_source),
               remark = COALESCE($7, remark),
               updated_at = NOW(),
               updated_by = $4
           WHERE id = $3`,
          [phone, address, id, String(createdBy), profilePicture, leadSource, remark]
        );
      }
      return { id, bubbleId };
    }

    // 2. Create new if not found
    const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;
    const insertRes = await client.query(
      `INSERT INTO customer (customer_id, name, phone, address, created_by, created_at, updated_at, profile_picture, lead_source, remark)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $7, $8)
       RETURNING id`,
      [customerBubbleId, name, phone, address, createdBy, profilePicture, leadSource, remark]
    );
    return { id: insertRes.rows[0].id, bubbleId: customerBubbleId };
  } catch (err) {
    console.error('Error in findOrCreateCustomer:', err);
    return null;
  }
}

async function _resolveLinkedReferral(client, userId, referralBubbleId, currentInvoiceBubbleId = null) {
  if (!referralBubbleId) {
    return null;
  }

  const referralRepo = require('../../Referral/services/referralRepo');
  const referral = await referralRepo.getReferralByBubbleId(client, referralBubbleId);

  if (!referral) {
    throw new Error('Selected referral was not found.');
  }

  const identifiers = await referralRepo.resolveAgentIdentifiers(client, userId);
  const currentAssignment = referral.assigned_agent || referral.linked_agent;

  if (!currentAssignment || !identifiers.includes(String(currentAssignment))) {
    throw new Error('Selected referral is not assigned to you.');
  }

  if (referral.linked_invoice && referral.linked_invoice !== currentInvoiceBubbleId) {
    const invoiceCheck = await client.query(
      `SELECT bubble_id FROM invoice WHERE bubble_id = $1 LIMIT 1`,
      [referral.linked_invoice]
    );

    if (invoiceCheck.rows.length > 0) {
      throw new Error('Selected referral is already linked to another quotation.');
    }
  }

  if (referral.linked_customer_profile) {
    const referrerResult = await client.query(
      `SELECT name
       FROM customer
       WHERE customer_id = $1
       LIMIT 1`,
      [referral.linked_customer_profile]
    );

    referral.referrer_customer_name = referrerResult.rows[0]?.name || null;
  }

  return referral;
}

async function _syncReferralInvoiceLink(client, invoiceBubbleId, referralBubbleId) {
  await client.query(
    `UPDATE referral
     SET linked_invoice = NULL,
         updated_at = NOW()
     WHERE linked_invoice = $1
       AND ($2::text IS NULL OR bubble_id <> $2)`,
    [invoiceBubbleId, referralBubbleId || null]
  );

  if (!referralBubbleId) {
    return;
  }

  await client.query(
    `UPDATE referral
     SET linked_invoice = $1,
         updated_at = NOW()
     WHERE bubble_id = $2`,
    [invoiceBubbleId, referralBubbleId]
  );
}

/**
 * Helper: Fetch all necessary dependencies for invoice creation
 * @private
 */
async function _fetchDependencies(client, data) {
  const { userId, packageId, customerName, customerPhone, customerAddress, templateId, profilePicture, leadSource, remark } = data;

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
    profilePicture: profilePicture,
    leadSource: leadSource,
    remark: remark
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

  return _buildVoucherInfoFromRows(voucherRows, packagePrice);
}

async function _processExistingInvoiceVouchers(client, invoiceId, fallbackVoucherCode, packagePrice) {
  const voucherRows = await _getInvoiceSelectedVoucherRows(client, invoiceId, fallbackVoucherCode);
  return _buildVoucherInfoFromRows(voucherRows, packagePrice);
}

function normalizeVoucherCategoryPackageType(rawType) {
  const value = String(rawType || '').trim().toLowerCase();
  if (!value) return 'all';
  if (value === 'all') return 'all';
  if (value === 'resi' || value === 'residential') return 'resi';
  if (value === 'non-resi' || value === 'non_resi' || value === 'non residential' || value === 'non-residential' || value === 'commercial') {
    return 'non-resi';
  }
  return value.includes('residential') ? 'resi' : 'non-resi';
}

function isVoucherCategoryEligible(category, invoiceSummary) {
  if (!category || !invoiceSummary) return false;
  if (!category.active || category.disabled) return false;

  const minPackageAmount = parseFloat(category.min_package_amount);
  if (Number.isFinite(minPackageAmount) && invoiceSummary.packagePrice < minPackageAmount) {
    return false;
  }

  const maxPackageAmount = parseFloat(category.max_package_amount);
  if (Number.isFinite(maxPackageAmount) && invoiceSummary.packagePrice > maxPackageAmount) {
    return false;
  }

  const minPanelQuantity = parseInt(category.min_panel_quantity, 10);
  if (Number.isFinite(minPanelQuantity) && invoiceSummary.panelQty < minPanelQuantity) {
    return false;
  }

  const maxPanelQuantity = parseInt(category.max_panel_quantity, 10);
  if (Number.isFinite(maxPanelQuantity) && invoiceSummary.panelQty > maxPanelQuantity) {
    return false;
  }

  const requiredScope = normalizeVoucherCategoryPackageType(category.package_type_scope);
  if (requiredScope !== 'all' && requiredScope !== invoiceSummary.packageTypeScope) {
    return false;
  }

  return true;
}

async function _getInvoiceVoucherStepSummary(client, invoiceId) {
  const result = await client.query(
    `SELECT
        i.bubble_id,
        i.invoice_number,
        i.total_amount,
        i.voucher_code,
        i.linked_package,
        COALESCE(c.name, 'Valued Customer') AS customer_name,
        pkg.price AS package_price,
        pkg.panel_qty,
        pkg.type AS package_type
     FROM invoice i
     LEFT JOIN customer c ON i.linked_customer = c.customer_id
     LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id
     WHERE i.bubble_id = $1
     LIMIT 1`,
    [invoiceId]
  );

  const invoice = result.rows[0];
  if (!invoice) return null;

  return {
    ...invoice,
    packagePrice: parseFloat(invoice.package_price) || 0,
    panelQty: parseInt(invoice.panel_qty, 10) || 0,
    packageTypeScope: normalizeVoucherCategoryPackageType(invoice.package_type)
  };
}

async function getVoucherStepData(client, invoiceId) {
  const invoiceSummary = await _getInvoiceVoucherStepSummary(client, invoiceId);
  if (!invoiceSummary) {
    throw new Error('Invoice not found');
  }

  const categoriesExist = await hasTable(client, 'voucher_category');
  const selectionsExist = await hasTable(client, 'invoice_voucher_selection');
  if (!categoriesExist) {
    return {
      invoice: invoiceSummary,
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

  const selectionRows = selectionsExist
    ? await client.query(
      `SELECT linked_voucher
       FROM invoice_voucher_selection
       WHERE linked_invoice = $1`,
      [invoiceId]
    )
    : { rows: [] };

  const selectedVoucherIds = new Set(selectionRows.rows.map((row) => String(row.linked_voucher)));
  const legacySelected = await _getInvoiceSelectedVoucherRows(client, invoiceId, invoiceSummary.voucher_code);
  legacySelected.forEach((voucher) => {
    if (voucher?.bubble_id) selectedVoucherIds.add(String(voucher.bubble_id));
    if (voucher?.id !== undefined && voucher?.id !== null) selectedVoucherIds.add(String(voucher.id));
  });

  const categories = [];
  for (const category of categoryRows.rows) {
    const eligible = isVoucherCategoryEligible(category, invoiceSummary);
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
      vouchers: vouchers.rows.map((voucher) => ({
        ...voucher,
        is_selected: selectedVoucherIds.has(String(voucher.bubble_id)) || selectedVoucherIds.has(String(voucher.id))
      }))
    });
  }

  return {
    invoice: invoiceSummary,
    categories,
    selectedVoucherIds: legacySelected
      .map((voucher) => voucher.bubble_id || String(voucher.id || ''))
      .filter(Boolean),
    selectedVoucherCodes: legacySelected.map((voucher) => voucher.voucher_code).filter(Boolean)
  };
}

/**
 * Helper: Calculate all financial totals
 * @private
 */
function _calculateFinancials(data, packagePrice, totalVoucherAmount, panelQty = 0) {
  const {
    agentMarkup = 0,
    discountFixed = 0,
    discountPercent = 0,
    applySst = false,
    eppFeeAmount = 0,
    extraItems = [],
    applyEarnNowRebate = false,
    applyEarthMonthGoGreenBonus = false
  } = data;

  const markupAmount = parseFloat(agentMarkup) || 0;
  const priceWithMarkup = packagePrice + markupAmount;

  // Calculate total of extra items
  let extraItemsTotal = 0;
  let extraItemsNegativeTotal = 0;
  if (Array.isArray(extraItems)) {
    extraItems.forEach(item => {
      const tp = parseFloat(item.total_price) || 0;
      extraItemsTotal += tp;
      if (tp < 0) extraItemsNegativeTotal += tp;
    });
  }

  // Security: Cap negative extra items at 5% of package price
  const maxNegative = -(packagePrice * 0.05);
  if (extraItemsNegativeTotal < maxNegative && packagePrice > 0) {
    throw new Error(`Additional items discount (RM ${Math.abs(extraItemsNegativeTotal).toFixed(2)}) exceeds the maximum allowed 5% of package price (RM ${Math.abs(maxNegative).toFixed(2)}).`);
  }

  // Calculate discount amount from percent
  let percentDiscountVal = 0;
  if (discountPercent > 0) {
    percentDiscountVal = (packagePrice * discountPercent) / 100;
  }

  const earnNowRebateDiscount = applyEarnNowRebate ? getEarnNowRebateDiscount(panelQty) : 0;
  const earthMonthGoGreenBonusDiscount = applyEarthMonthGoGreenBonus ? getEarthMonthGoGreenBonusDiscount(panelQty) : 0;

  // Subtotal after ALL adjustments (discounts, vouchers, epp fees, extra items)
  // taxable subtotal = package + markup + extra items - discounts - vouchers - promo
  const trueSubtotal = priceWithMarkup
    + extraItemsTotal
    - discountFixed
    - percentDiscountVal
    - totalVoucherAmount
    - earnNowRebateDiscount
    - earthMonthGoGreenBonusDiscount;

  if (trueSubtotal <= 0) {
    throw new Error('Total amount cannot be zero or negative after applying discounts and vouchers.');
  }

  const taxableSubtotal = Math.max(0, trueSubtotal);

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
    finalTotalAmount,
    earnNowRebateDiscount,
    earthMonthGoGreenBonusDiscount
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
       LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id
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
             WHERE p.bubble_id = $1`,
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
    if (invoice.linked_package) {
      parallelQueries.push(
        _fetchWarrantyInfo(client, invoice.linked_package)
          .then(warranties => {
            invoice.warranties = warranties;
          })
          .catch(err => {
            console.warn('Failed to fetch warranties:', err);
            invoice.warranties = [];
          })
      );
    }

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
  const customerAverageTnb = normalizeNullableNumber(data.customerAverageTnb);
  const estimatedSaving = normalizeNullableNumber(data.estimatedSaving);
  const estimatedNewBillAmount = normalizeNullableNumber(data.estimatedNewBillAmount);
  const solarSunPeakHour = normalizeNullableNumber(data.solarSunPeakHour);
  const solarMorningUsagePercent = normalizeNullableNumber(data.solarMorningUsagePercent);

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

  if (invoiceColumns.has('customer_average_tnb')) {
    insertColumns.push('customer_average_tnb');
    values.push(customerAverageTnb);
  }

  if (invoiceColumns.has('estimated_saving')) {
    insertColumns.push('estimated_saving');
    values.push(estimatedSaving);
  }

  if (invoiceColumns.has('estimated_new_bill_amount')) {
    insertColumns.push('estimated_new_bill_amount');
    values.push(estimatedNewBillAmount);
  }

  if (invoiceColumns.has('solar_sun_peak_hour')) {
    insertColumns.push('solar_sun_peak_hour');
    values.push(solarSunPeakHour);
  }

  if (invoiceColumns.has('solar_morning_usage_percent')) {
    insertColumns.push('solar_morning_usage_percent');
    values.push(solarMorningUsagePercent);
  }

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

  if (financials.earnNowRebateDiscount > 0) {
    const earnNowItemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        earnNowItemBubbleId,
        invoiceId,
        `Earn Now Rebate (Panel Qty: ${pkg.panel_qty})`,
        1,
        -financials.earnNowRebateDiscount,
        -financials.earnNowRebateDiscount,
        'discount',
        5,
        false
      ]
    );
    createdItemIds.push(earnNowItemBubbleId);
  }

  if (financials.earthMonthGoGreenBonusDiscount > 0) {
    const earthMonthItemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [
        earthMonthItemBubbleId,
        invoiceId,
        `Earth Month Go Green Bonus (Panel Qty: ${pkg.panel_qty})`,
        1,
        -financials.earthMonthGoGreenBonusDiscount,
        -financials.earthMonthGoGreenBonusDiscount,
        'discount',
        6,
        false
      ]
    );
    createdItemIds.push(earthMonthItemBubbleId);
  }

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

    const linkedReferral = await _resolveLinkedReferral(client, data.userId, data.linkedReferral || null);
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
    const deps = await _fetchDependencies(client, data);

    // 2. Process Vouchers
    const packagePrice = parseFloat(deps.pkg.price) || 0;
    const voucherInfo = await _processVouchers(client, data, packagePrice);

    // 3. Calculate Financials
    const financials = _calculateFinancials(data, packagePrice, voucherInfo.totalVoucherAmount, deps.pkg ? deps.pkg.panel_qty : 0);

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

    await _syncReferralInvoiceLink(client, invoice.bubble_id, data.linkedReferral || null);

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
        LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id
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

    const linkedReferral = await _resolveLinkedReferral(
      client,
      data.userId,
      data.linkedReferral || null,
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
    const financials = _calculateFinancials(data, packagePrice, voucherInfo.totalVoucherAmount, pkg.panel_qty);

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

    if (invoiceColumns.has('customer_average_tnb')) {
      updateAssignments.push(`customer_average_tnb = $${updateParamIdx++}`);
      updateValues.push(
        data.customerAverageTnb !== undefined
          ? normalizeNullableNumber(data.customerAverageTnb)
          : currentData.customer_average_tnb
      );
    }

    if (invoiceColumns.has('estimated_saving')) {
      updateAssignments.push(`estimated_saving = $${updateParamIdx++}`);
      updateValues.push(
        data.estimatedSaving !== undefined
          ? normalizeNullableNumber(data.estimatedSaving)
          : currentData.estimated_saving
      );
    }

    if (invoiceColumns.has('estimated_new_bill_amount')) {
      updateAssignments.push(`estimated_new_bill_amount = $${updateParamIdx++}`);
      updateValues.push(
        data.estimatedNewBillAmount !== undefined
          ? normalizeNullableNumber(data.estimatedNewBillAmount)
          : currentData.estimated_new_bill_amount
      );
    }

    if (invoiceColumns.has('solar_sun_peak_hour')) {
      updateAssignments.push(`solar_sun_peak_hour = $${updateParamIdx++}`);
      updateValues.push(
        data.solarSunPeakHour !== undefined
          ? normalizeNullableNumber(data.solarSunPeakHour)
          : currentData.solar_sun_peak_hour
      );
    }

    if (invoiceColumns.has('solar_morning_usage_percent')) {
      updateAssignments.push(`solar_morning_usage_percent = $${updateParamIdx++}`);
      updateValues.push(
        data.solarMorningUsagePercent !== undefined
          ? normalizeNullableNumber(data.solarMorningUsagePercent)
          : currentData.solar_morning_usage_percent
      );
    }

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

    await _syncReferralInvoiceLink(client, bubbleId, data.linkedReferral);

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
      const itemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO invoice_item
         (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
         VALUES ($1, $2, $3, 1, $4, $5, 'voucher', $6, NOW(), NOW(), FALSE)`,
        [itemBubbleId, invoiceId, vItem.description, -vItem.amount, -vItem.amount, sortOrder++]
      );
      newItemIds.push(itemBubbleId);
    }

    if (sstAmount > 0) {
      const sstItemBubbleId = `item_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO invoice_item
         (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
         VALUES ($1, $2, 'SST (6%)', 1, $3, $3, 'sst', 300, NOW(), NOW(), FALSE)`,
        [sstItemBubbleId, invoiceId, sstAmount]
      );
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
