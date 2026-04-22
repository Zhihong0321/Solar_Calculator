/**
 * [AI-CONTEXT]
 * Domain: Invoicing Voucher Support
 * Primary Responsibility: Voucher eligibility and voucher-step data helpers for invoicing flows.
 * Stability: Keep shared voucher rules and read-side query helpers here so invoiceRepo can stay focused on core invoice persistence.
 */
function buildVoucherInfoFromRows(voucherRows, packagePrice) {
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

function normalizeVoucherCategoryRow(row) {
  if (!row || typeof row !== 'object') return row;

  return {
    ...row,
    active: row.active ?? row._ai_active ?? true,
    disabled: row.disabled ?? row._ai_disabled ?? false,
    max_selectable: row.max_selectable ?? row._ai_max_selectable ?? 1,
    min_package_amount: row.min_package_amount ?? row._ai_min_package_amount ?? null,
    max_package_amount: row.max_package_amount ?? row._ai_max_package_amount ?? null,
    min_panel_quantity: row.min_panel_quantity ?? row._ai_min_panel_quantity ?? null,
    max_panel_quantity: row.max_panel_quantity ?? row._ai_max_panel_quantity ?? null,
    package_type_scope: row.package_type_scope ?? row._ai_package_type_scope ?? 'all'
  };
}

function normalizeVoucherRow(row) {
  if (!row || typeof row !== 'object') return row;

  return {
    ...row,
    active: row.active ?? row._ai_active ?? true,
    delete: row.delete ?? row._ai_deleted ?? false
  };
}

function buildVoucherCategoryOrderClause(columns) {
  const orderParts = [];
  if (columns.has('sort_order')) orderParts.push('sort_order ASC');
  if (columns.has('created_at')) orderParts.push('created_at ASC');
  if (columns.has('name')) orderParts.push('name ASC');
  if (columns.has('id')) orderParts.push('id ASC');
  return orderParts.length ? orderParts.join(', ') : '1';
}

function buildVoucherOrderClause(columns) {
  const orderParts = [];
  if (columns.has('created_at')) orderParts.push('created_at ASC');
  if (columns.has('title')) orderParts.push('title ASC');
  if (columns.has('id')) orderParts.push('id ASC');
  return orderParts.length ? orderParts.join(', ') : '1';
}

function buildVoucherAvailabilityClause(columns) {
  const clauses = [];

  if (columns.has('delete')) {
    clauses.push('("delete" IS NULL OR "delete" = FALSE)');
  }

  if (columns.has('available_until')) {
    clauses.push(`(
      available_until IS NULL
      OR NULLIF(TRIM(available_until::text), '') IS NULL
      OR NULLIF(TRIM(available_until::text), '')::timestamptz >= NOW()
    )`);
  }

  if (columns.has('voucher_availability')) {
    clauses.push('(voucher_availability IS NULL OR voucher_availability > 0)');
  }

  return clauses.length ? clauses.join('\n           AND ') : 'TRUE';
}

async function loadVoucherCategoriesForSummary(client, invoiceSummary, deps) {
  const { getTableColumns } = deps;
  const categoryColumns = await getTableColumns(client, 'voucher_category');
  const voucherColumns = await getTableColumns(client, 'voucher');
  const hasCategoryLink = voucherColumns.has('linked_voucher_category');

  const categoryResult = await client.query(
    `SELECT *,
        ${categoryColumns.has('active') ? 'active' : 'TRUE'} AS _ai_active,
        ${categoryColumns.has('disabled') ? 'COALESCE(disabled, FALSE)' : 'FALSE'} AS _ai_disabled,
        ${categoryColumns.has('max_selectable') ? 'max_selectable' : '1'} AS _ai_max_selectable,
        ${categoryColumns.has('min_package_amount') ? 'min_package_amount' : 'NULL::numeric'} AS _ai_min_package_amount,
        ${categoryColumns.has('max_package_amount') ? 'max_package_amount' : 'NULL::numeric'} AS _ai_max_package_amount,
        ${categoryColumns.has('min_panel_quantity') ? 'min_panel_quantity' : 'NULL::integer'} AS _ai_min_panel_quantity,
        ${categoryColumns.has('max_panel_quantity') ? 'max_panel_quantity' : 'NULL::integer'} AS _ai_max_panel_quantity,
        ${categoryColumns.has('package_type_scope') ? 'package_type_scope' : "'all'::text"} AS _ai_package_type_scope
     FROM voucher_category
     WHERE ${categoryColumns.has('active') ? 'active = TRUE' : 'TRUE'}
       AND ${categoryColumns.has('disabled') ? 'COALESCE(disabled, FALSE) = FALSE' : 'TRUE'}
       AND ${categoryColumns.has('delete') ? '("delete" IS NULL OR "delete" = FALSE)' : 'TRUE'}
     ORDER BY ${buildVoucherCategoryOrderClause(categoryColumns)}`
  );

  const categories = [];
  for (const rawCategory of categoryResult.rows) {
    const category = normalizeVoucherCategoryRow(rawCategory);
    const eligible = isVoucherCategoryEligible(category, invoiceSummary);
    const vouchers = hasCategoryLink
      ? await client.query(
        `SELECT *,
            ${voucherColumns.has('active') ? 'active' : 'TRUE'} AS _ai_active,
            ${voucherColumns.has('delete') ? 'COALESCE("delete", FALSE)' : 'FALSE'} AS _ai_deleted
         FROM voucher
         WHERE linked_voucher_category = $1
           AND ${voucherColumns.has('active') ? 'active = TRUE' : 'TRUE'}
           AND ${buildVoucherAvailabilityClause(voucherColumns)}
         ORDER BY ${buildVoucherOrderClause(voucherColumns)}`,
        [category.bubble_id]
      )
      : { rows: [] };

    if (!vouchers.rows.length) continue;

    categories.push({
      ...category,
      eligible,
      vouchers: vouchers.rows.map((voucher) => normalizeVoucherRow(voucher))
    });
  }

  return categories;
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

async function getInvoiceSelectedVoucherRows(client, invoiceId, fallbackVoucherCode, deps) {
  const { hasTable, getTableColumns, getVoucherByCode } = deps;
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

async function getInvoiceVoucherStepSummary(client, invoiceId) {
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
     LEFT JOIN package pkg ON i.linked_package = pkg.bubble_id OR i.linked_package = pkg.id::text
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

async function getVoucherStepData(client, invoiceId, deps) {
  const { hasTable, getTableColumns, getInvoiceSelectedVoucherRows } = deps;
  const invoiceSummary = await getInvoiceVoucherStepSummary(client, invoiceId);
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

  const selectionRows = selectionsExist
    ? await client.query(
      `SELECT linked_voucher
       FROM invoice_voucher_selection
       WHERE linked_invoice = $1`,
      [invoiceId]
    )
    : { rows: [] };

  const selectedVoucherIds = new Set(selectionRows.rows.map((row) => String(row.linked_voucher)));
  const legacySelected = await getInvoiceSelectedVoucherRows(client, invoiceId, invoiceSummary.voucher_code);
  legacySelected.forEach((voucher) => {
    if (voucher?.bubble_id) selectedVoucherIds.add(String(voucher.bubble_id));
    if (voucher?.id !== undefined && voucher?.id !== null) selectedVoucherIds.add(String(voucher.id));
  });

  const categories = await loadVoucherCategoriesForSummary(client, invoiceSummary, { getTableColumns });

  return {
    invoice: invoiceSummary,
    categories: categories.map((category) => ({
      ...category,
      vouchers: category.vouchers.map((voucher) => ({
        ...voucher,
        is_selected: selectedVoucherIds.has(String(voucher.bubble_id)) || selectedVoucherIds.has(String(voucher.id))
      }))
    })),
    selectedVoucherIds: legacySelected
      .map((voucher) => voucher.bubble_id || String(voucher.id || ''))
      .filter(Boolean),
    selectedVoucherCodes: legacySelected.map((voucher) => voucher.voucher_code).filter(Boolean)
  };
}

module.exports = {
  buildVoucherInfoFromRows,
  getInvoiceSelectedVoucherRows,
  getVoucherStepData,
  loadVoucherCategoriesForSummary,
  isVoucherCategoryEligible,
  normalizeVoucherCategoryPackageType
};
