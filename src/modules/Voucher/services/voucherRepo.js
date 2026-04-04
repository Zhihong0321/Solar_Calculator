/**
 * Domain: Voucher Repository
 * Primary Responsibility: Low-level Database (PostgreSQL) operations for voucher categories,
 * vouchers, and invoice voucher selections.
 */
const crypto = require('crypto');

function _isNumericId(value) {
    return !Number.isNaN(Number(value));
}

function _resolveIdentifierColumn(id) {
    return _isNumericId(id) ? 'id' : 'bubble_id';
}

function _whereByStatus(status = 'all', alias = '') {
    const prefix = alias ? `${alias}.` : '';
    if (status === 'deleted') return `WHERE ${prefix}"delete" = TRUE`;
    if (status === 'active') return `WHERE ${prefix}active = TRUE AND (${prefix}"delete" IS NULL OR ${prefix}"delete" = FALSE)`;
    if (status === 'inactive') return `WHERE ${prefix}active = FALSE AND (${prefix}"delete" IS NULL OR ${prefix}"delete" = FALSE)`;
    return '';
}

function _normalizePackageTypeScope(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'resi' || raw === 'residential') return 'resi';
    if (raw === 'non-resi' || raw === 'non_resi' || raw === 'nonresidential' || raw === 'commercial') return 'non-resi';
    return 'all';
}

function _normalizeInvoicePackageType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'unknown';
    if (raw.includes('resi')) return 'resi';
    return 'non-resi';
}

function _validateCategoryRow(category) {
    const scope = _normalizePackageTypeScope(category.package_type_scope);
    const maxSelectable = parseInt(category.max_selectable, 10);
    const parsedMinPackageAmount = category.min_package_amount === null || category.min_package_amount === undefined
        ? null
        : parseFloat(category.min_package_amount);
    const parsedMaxPackageAmount = category.max_package_amount === null || category.max_package_amount === undefined
        ? null
        : parseFloat(category.max_package_amount);
    const parsedMinPanelQuantity = category.min_panel_quantity === null || category.min_panel_quantity === undefined
        ? null
        : parseInt(category.min_panel_quantity, 10);

    if (!Number.isInteger(maxSelectable) || maxSelectable <= 0) {
        throw new Error('max_selectable must be a positive integer');
    }

    if (!Number.isNaN(parsedMinPackageAmount) && !Number.isNaN(parsedMaxPackageAmount)
        && parsedMinPackageAmount !== null && parsedMaxPackageAmount !== null
        && parsedMaxPackageAmount < parsedMinPackageAmount) {
        throw new Error('max_package_amount must be greater than or equal to min_package_amount');
    }

    return {
        ...category,
        max_selectable: maxSelectable,
        package_type_scope: scope,
        min_package_amount: Number.isNaN(parsedMinPackageAmount) ? null : parsedMinPackageAmount,
        max_package_amount: Number.isNaN(parsedMaxPackageAmount) ? null : parsedMaxPackageAmount,
        min_panel_quantity: Number.isNaN(parsedMinPanelQuantity) ? null : parsedMinPanelQuantity
    };
}

function _evaluateCategoryEligibility(category, invoiceContext) {
    const minPackageAmount = category.min_package_amount;
    const maxPackageAmount = category.max_package_amount;
    const minPanelQty = category.min_panel_quantity;
    const scope = _normalizePackageTypeScope(category.package_type_scope);
    const invoicePackageType = _normalizeInvoicePackageType(invoiceContext.packageTypeRaw);

    const amountOk = minPackageAmount === null || invoiceContext.packageAmount >= minPackageAmount;
    const maxAmountOk = maxPackageAmount === null || invoiceContext.packageAmount <= maxPackageAmount;
    const panelOk = minPanelQty === null || invoiceContext.panelQty >= minPanelQty;
    const typeOk = scope === 'all' || scope === invoicePackageType;

    return {
        eligible: amountOk && maxAmountOk && panelOk && typeOk,
        checks: {
            packageAmount: {
                required: minPackageAmount,
                actual: invoiceContext.packageAmount,
                passed: amountOk
            },
            maxPackageAmount: {
                required: maxPackageAmount,
                actual: invoiceContext.packageAmount,
                passed: maxAmountOk
            },
            panelQty: {
                required: minPanelQty,
                actual: invoiceContext.panelQty,
                passed: panelOk
            },
            packageType: {
                required: scope,
                actual: invoicePackageType,
                passed: typeOk
            }
        }
    };
}

/**
 * Voucher category CRUD
 */
async function getAllVoucherCategories(pool, status = 'all') {
    const whereClause = _whereByStatus(status, 'c');
    const result = await pool.query(
        `SELECT
            c.*,
            COUNT(v.id)::int AS voucher_count
         FROM voucher_category c
         LEFT JOIN voucher v ON v.linked_voucher_category = c.bubble_id
         ${whereClause}
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.created_at DESC`
    );
    return result.rows;
}

async function getVoucherCategoryById(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `SELECT
            c.*,
            COUNT(v.id)::int AS voucher_count
         FROM voucher_category c
         LEFT JOIN voucher v ON v.linked_voucher_category = c.bubble_id
         WHERE c.${identifierColumn} = $1
         GROUP BY c.id
         LIMIT 1`,
        [id]
    );
    return result.rows[0] || null;
}

async function checkVoucherCategoryNameExists(pool, name, excludeId = null) {
    let query = `SELECT id FROM voucher_category WHERE LOWER(name) = LOWER($1) AND ("delete" IS NOT TRUE OR "delete" IS NULL)`;
    const params = [String(name || '').trim()];

    if (excludeId) {
        query += ` AND bubble_id != $2 AND id::text != $2`;
        params.push(String(excludeId));
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0;
}

async function createVoucherCategory(pool, data) {
    const normalized = _validateCategoryRow(data);
    const bubbleId = `voucher_category_${crypto.randomBytes(8).toString('hex')}`;

    const result = await pool.query(
        `INSERT INTO voucher_category (
            bubble_id, name, description, max_selectable,
            min_package_amount, max_package_amount, min_panel_quantity, package_type_scope,
            active, disabled, sort_order, created_by, created_at, updated_at
         ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12, NOW(), NOW()
         )
         RETURNING *`,
        [
            bubbleId,
            normalized.name,
            normalized.description || null,
            normalized.max_selectable,
            normalized.min_package_amount,
            normalized.max_package_amount,
            normalized.min_panel_quantity,
            normalized.package_type_scope,
            normalized.active !== undefined ? !!normalized.active : true,
            normalized.disabled !== undefined ? !!normalized.disabled : false,
            Number.isInteger(Number(normalized.sort_order)) ? Number(normalized.sort_order) : 0,
            normalized.created_by || null
        ]
    );

    return result.rows[0];
}

async function updateVoucherCategory(pool, id, data) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const current = await getVoucherCategoryById(pool, id);
    if (!current) return null;

    const merged = _validateCategoryRow({
        ...current,
        ...data
    });

    const result = await pool.query(
        `UPDATE voucher_category SET
            name = $1,
            description = $2,
            max_selectable = $3,
            min_package_amount = $4,
            max_package_amount = $5,
            min_panel_quantity = $6,
            package_type_scope = $7,
            active = $8,
            disabled = $9,
            sort_order = $10,
            updated_at = NOW()
         WHERE ${identifierColumn} = $11
         RETURNING *`,
        [
            merged.name,
            merged.description || null,
            merged.max_selectable,
            merged.min_package_amount,
            merged.max_package_amount,
            merged.min_panel_quantity,
            merged.package_type_scope,
            !!merged.active,
            !!merged.disabled,
            Number.isInteger(Number(merged.sort_order)) ? Number(merged.sort_order) : 0,
            id
        ]
    );

    return result.rows[0] || null;
}

async function toggleVoucherCategoryStatus(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `UPDATE voucher_category
         SET active = NOT active, updated_at = NOW()
         WHERE ${identifierColumn} = $1
         RETURNING active`,
        [id]
    );
    return result.rows.length > 0 ? result.rows[0].active : null;
}

async function setVoucherCategoryDisabled(pool, id, disabled) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `UPDATE voucher_category
         SET disabled = $2, updated_at = NOW()
         WHERE ${identifierColumn} = $1
         RETURNING *`,
        [id, !!disabled]
    );
    return result.rows[0] || null;
}

async function deleteVoucherCategory(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `UPDATE voucher_category
         SET "delete" = TRUE, updated_at = NOW()
         WHERE ${identifierColumn} = $1`,
        [id]
    );
    return result.rowCount > 0;
}

async function restoreVoucherCategory(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `UPDATE voucher_category
         SET "delete" = NULL, updated_at = NOW()
         WHERE ${identifierColumn} = $1`,
        [id]
    );
    return result.rowCount > 0;
}

/**
 * Voucher CRUD
 */
async function getAllVouchers(pool, status = 'all') {
    const whereClause = _whereByStatus(status, 'v');
    const result = await pool.query(
        `SELECT
            v.*,
            c.name AS category_name,
            c.active AS category_active,
            c.disabled AS category_disabled
         FROM voucher v
         LEFT JOIN voucher_category c ON c.bubble_id = v.linked_voucher_category
         ${whereClause}
         ORDER BY v.created_at DESC`
    );
    return result.rows;
}

async function getVoucherById(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `SELECT
            v.*,
            c.name AS category_name,
            c.active AS category_active,
            c.disabled AS category_disabled
         FROM voucher v
         LEFT JOIN voucher_category c ON c.bubble_id = v.linked_voucher_category
         WHERE v.${identifierColumn} = $1
         LIMIT 1`,
        [id]
    );
    return result.rows[0] || null;
}

async function checkVoucherCodeExists(pool, code, excludeId = null) {
    let query = `SELECT id FROM voucher WHERE voucher_code = $1 AND ("delete" IS NOT TRUE OR "delete" IS NULL)`;
    const params = [String(code || '').trim()];

    if (excludeId) {
        query += ` AND bubble_id != $2 AND id::text != $2`;
        params.push(String(excludeId));
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0;
}

async function _generateDuplicateVoucherIdentity(pool, originalVoucher) {
    const originalTitle = String(originalVoucher?.title || 'Voucher').trim() || 'Voucher';
    const originalCode = String(originalVoucher?.voucher_code || 'VOUCHER').trim().toUpperCase() || 'VOUCHER';
    const titleBase = `${originalTitle} - DUP`;
    const codeBase = `${originalCode}_DUP`;

    for (let index = 1; index <= 9999; index += 1) {
        const nextTitle = index === 1 ? titleBase : `${titleBase} ${index}`;
        const nextCode = index === 1 ? codeBase : `${codeBase}${index}`;
        const exists = await checkVoucherCodeExists(pool, nextCode);

        if (!exists) {
            return {
                title: nextTitle,
                voucher_code: nextCode
            };
        }
    }

    throw new Error('Unable to generate a unique duplicate voucher code.');
}

async function toggleVoucherStatus(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `UPDATE voucher
         SET active = NOT active, updated_at = NOW()
         WHERE ${identifierColumn} = $1
         RETURNING active`,
        [id]
    );
    return result.rows.length > 0 ? result.rows[0].active : null;
}

async function createVoucher(pool, data) {
    const bubbleId = `voucher_${crypto.randomBytes(8).toString('hex')}`;
    const safePercent = data.discount_percent ? parseInt(data.discount_percent, 10) : null;
    const safeAmount = data.discount_amount ? parseFloat(data.discount_amount) : null;
    const safeDeductable = data.deductable_from_commission ? parseFloat(data.deductable_from_commission) : 0;

    const result = await pool.query(
        `INSERT INTO voucher (
            bubble_id, title, voucher_code, voucher_type,
            discount_amount, discount_percent, active,
            voucher_availability, terms_conditions, available_until,
            public, created_by, deductable_from_commission, invoice_description, linked_voucher_category,
            created_at, updated_at, created_date
         ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13, $14, $15,
            NOW(), NOW(), NOW()
         ) RETURNING *`,
        [
            bubbleId,
            data.title,
            data.voucher_code,
            data.voucher_type,
            safeAmount,
            safePercent,
            data.active !== undefined ? !!data.active : true,
            data.voucher_availability || null,
            data.terms_conditions || null,
            data.available_until || null,
            data.public !== undefined ? !!data.public : true,
            data.created_by || null,
            safeDeductable,
            data.invoice_description || null,
            data.linked_voucher_category || null
        ]
    );

    return result.rows[0];
}

async function duplicateVoucher(pool, id, createdBy = null) {
    const originalVoucher = await getVoucherById(pool, id);
    if (!originalVoucher) {
        return null;
    }

    const duplicateIdentity = await _generateDuplicateVoucherIdentity(pool, originalVoucher);
    return createVoucher(pool, {
        title: duplicateIdentity.title,
        voucher_code: duplicateIdentity.voucher_code,
        voucher_type: originalVoucher.voucher_type,
        discount_amount: originalVoucher.discount_amount,
        discount_percent: originalVoucher.discount_percent,
        active: !!originalVoucher.active,
        voucher_availability: originalVoucher.voucher_availability,
        terms_conditions: originalVoucher.terms_conditions,
        available_until: originalVoucher.available_until,
        public: !!originalVoucher.public,
        created_by: createdBy,
        deductable_from_commission: originalVoucher.deductable_from_commission,
        invoice_description: originalVoucher.invoice_description,
        linked_voucher_category: originalVoucher.linked_voucher_category || null
    });
}

async function updateVoucher(pool, id, data) {
    const identifierColumn = _resolveIdentifierColumn(id);

    let safePercent = undefined;
    if (data.discount_percent !== undefined) {
        safePercent = data.discount_percent ? parseInt(data.discount_percent, 10) : null;
    }

    let safeAmount = undefined;
    if (data.discount_amount !== undefined) {
        safeAmount = data.discount_amount ? parseFloat(data.discount_amount) : null;
    }

    let safeDeductable = undefined;
    if (data.deductable_from_commission !== undefined) {
        safeDeductable = data.deductable_from_commission ? parseFloat(data.deductable_from_commission) : 0;
    }

    const result = await pool.query(
        `UPDATE voucher SET
            title = $1,
            voucher_code = $2,
            voucher_type = $3,
            discount_amount = $4,
            discount_percent = $5,
            active = $6,
            voucher_availability = $7,
            terms_conditions = $8,
            available_until = $9,
            public = $10,
            deductable_from_commission = $11,
            invoice_description = $12,
            linked_voucher_category = $13,
            updated_at = NOW(),
            modified_date = NOW()
         WHERE ${identifierColumn} = $14
         RETURNING *`,
        [
            data.title,
            data.voucher_code,
            data.voucher_type,
            safeAmount,
            safePercent,
            !!data.active,
            data.voucher_availability ?? null,
            data.terms_conditions ?? null,
            data.available_until ?? null,
            !!data.public,
            safeDeductable,
            data.invoice_description ?? null,
            data.linked_voucher_category ?? null,
            id
        ]
    );

    return result.rows[0] || null;
}

async function deleteVoucher(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `UPDATE voucher SET "delete" = TRUE, updated_at = NOW() WHERE ${identifierColumn} = $1`,
        [id]
    );
    return result.rowCount > 0;
}

async function restoreVoucher(pool, id) {
    const identifierColumn = _resolveIdentifierColumn(id);
    const result = await pool.query(
        `UPDATE voucher SET "delete" = NULL, updated_at = NOW() WHERE ${identifierColumn} = $1`,
        [id]
    );
    return result.rowCount > 0;
}

/**
 * Voucher step consumption APIs
 */
async function getInvoiceVoucherSelections(pool, invoiceId) {
    const result = await pool.query(
        `SELECT
            ivs.*,
            v.title AS voucher_title,
            v.voucher_code,
            v.voucher_type,
            v.discount_amount,
            v.discount_percent,
            c.name AS category_name
         FROM invoice_voucher_selection ivs
         LEFT JOIN voucher v ON v.bubble_id = ivs.linked_voucher
         LEFT JOIN voucher_category c ON c.bubble_id = ivs.linked_voucher_category
         WHERE ivs.linked_invoice = $1
         ORDER BY ivs.created_at ASC`,
        [invoiceId]
    );
    return result.rows;
}

async function _getInvoiceVoucherContext(client, invoiceId) {
    const result = await client.query(
        `SELECT
            i.bubble_id,
            i.linked_package,
            COALESCE(p.price, 0) AS package_amount,
            COALESCE(p.panel_qty, 0) AS panel_qty,
            COALESCE(p.type, i.package_type, '') AS package_type
         FROM invoice i
         LEFT JOIN package p ON p.bubble_id = i.linked_package
         WHERE i.bubble_id = $1
         LIMIT 1`,
        [invoiceId]
    );

    const row = result.rows[0];
    if (!row) {
        throw new Error('Invoice not found');
    }

    return {
        invoiceId: row.bubble_id,
        packageAmount: parseFloat(row.package_amount) || 0,
        panelQty: parseInt(row.panel_qty, 10) || 0,
        packageTypeRaw: row.package_type || ''
    };
}

async function getVoucherGroupsForInvoiceStep(pool, invoiceId) {
    const client = await pool.connect();
    try {
        const invoiceContext = await _getInvoiceVoucherContext(client, invoiceId);

        const categoryResult = await client.query(
            `SELECT *
             FROM voucher_category
             WHERE active = TRUE
               AND disabled = FALSE
               AND ("delete" IS NULL OR "delete" = FALSE)
             ORDER BY sort_order ASC, created_at ASC`
        );

        const categories = categoryResult.rows;
        if (!categories.length) {
            return {
                invoiceContext,
                categories: []
            };
        }

        const categoryIds = categories.map(c => c.bubble_id);
        const voucherResult = await client.query(
            `SELECT
                v.*,
                c.name AS category_name
             FROM voucher v
             INNER JOIN voucher_category c ON c.bubble_id = v.linked_voucher_category
             WHERE v.linked_voucher_category = ANY($1::text[])
               AND v.active = TRUE
               AND (v."delete" IS NULL OR v."delete" = FALSE)
               AND (v.available_until IS NULL OR v.available_until >= NOW())
               AND (v.voucher_availability IS NULL OR v.voucher_availability > 0)
             ORDER BY c.sort_order ASC, v.created_at DESC`,
            [categoryIds]
        );

        const vouchersByCategory = new Map();
        voucherResult.rows.forEach(v => {
            if (!vouchersByCategory.has(v.linked_voucher_category)) {
                vouchersByCategory.set(v.linked_voucher_category, []);
            }
            vouchersByCategory.get(v.linked_voucher_category).push(v);
        });

        const grouped = categories.map(category => {
            const eligibility = _evaluateCategoryEligibility(category, invoiceContext);
            return {
                ...category,
                package_type_scope: _normalizePackageTypeScope(category.package_type_scope),
                eligibility,
                vouchers: vouchersByCategory.get(category.bubble_id) || []
            };
        });

        return {
            invoiceContext,
            categories: grouped
        };
    } finally {
        client.release();
    }
}

async function replaceInvoiceVoucherSelections(pool, { invoiceId, voucherBubbleIds, createdBy }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const invoiceContext = await _getInvoiceVoucherContext(client, invoiceId);

        const nextVoucherIds = [...new Set((Array.isArray(voucherBubbleIds) ? voucherBubbleIds : [])
            .map(v => String(v || '').trim())
            .filter(Boolean))];

        const previousSelectionsResult = await client.query(
            `SELECT
                ivs.linked_voucher,
                v.voucher_availability
             FROM invoice_voucher_selection ivs
             INNER JOIN voucher v ON v.bubble_id = ivs.linked_voucher
             WHERE ivs.linked_invoice = $1
             FOR UPDATE`,
            [invoiceId]
        );
        const previousVoucherIds = previousSelectionsResult.rows.map(r => r.linked_voucher);

        let voucherRows = [];
        if (nextVoucherIds.length > 0) {
            const vouchersResult = await client.query(
                `SELECT
                    v.*,
                    c.name AS category_name,
                    c.max_selectable,
                    c.active AS category_active,
                    c.disabled AS category_disabled,
                    c."delete" AS category_deleted,
                    c.min_package_amount,
                    c.min_panel_quantity,
                    c.package_type_scope
                 FROM voucher v
                 LEFT JOIN voucher_category c ON c.bubble_id = v.linked_voucher_category
                 WHERE v.bubble_id = ANY($1::text[])
                 FOR UPDATE`,
                [nextVoucherIds]
            );
            voucherRows = vouchersResult.rows;
        }

        if (voucherRows.length !== nextVoucherIds.length) {
            throw new Error('One or more vouchers are invalid');
        }

        const voucherById = new Map(voucherRows.map(v => [v.bubble_id, v]));
        const perCategorySelections = new Map();

        for (const voucherId of nextVoucherIds) {
            const voucher = voucherById.get(voucherId);
            if (!voucher) {
                throw new Error(`Voucher not found: ${voucherId}`);
            }
            if (!voucher.linked_voucher_category) {
                throw new Error(`Voucher ${voucher.voucher_code || voucher.bubble_id} is not grouped under a voucher category`);
            }
            if (!voucher.active || voucher.delete === true) {
                throw new Error(`Voucher ${voucher.voucher_code || voucher.bubble_id} is not active`);
            }
            if (voucher.available_until && new Date(voucher.available_until).getTime() < Date.now()) {
                throw new Error(`Voucher ${voucher.voucher_code || voucher.bubble_id} has expired`);
            }

            const category = {
                max_selectable: voucher.max_selectable,
                active: voucher.category_active,
                disabled: voucher.category_disabled,
                deleted: voucher.category_deleted,
                min_package_amount: voucher.min_package_amount,
                min_panel_quantity: voucher.min_panel_quantity,
                package_type_scope: voucher.package_type_scope
            };

            if (!category.active || category.disabled || category.deleted === true) {
                throw new Error(`Voucher category is not available for ${voucher.voucher_code || voucher.bubble_id}`);
            }

            const eligibility = _evaluateCategoryEligibility(category, invoiceContext);
            if (!eligibility.eligible) {
                throw new Error(`Voucher category requirements are not met for ${voucher.voucher_code || voucher.bubble_id}`);
            }

            const count = (perCategorySelections.get(voucher.linked_voucher_category) || 0) + 1;
            if (count > parseInt(voucher.max_selectable, 10)) {
                throw new Error(`Category ${voucher.category_name || voucher.linked_voucher_category} exceeds max selectable limit`);
            }
            perCategorySelections.set(voucher.linked_voucher_category, count);
        }

        const previousSet = new Set(previousVoucherIds);
        const nextSet = new Set(nextVoucherIds);
        const allVoucherIds = [...new Set([...previousSet, ...nextSet])];

        if (allVoucherIds.length > 0) {
            const availabilityResult = await client.query(
                `SELECT bubble_id, voucher_availability
                 FROM voucher
                 WHERE bubble_id = ANY($1::text[])
                 FOR UPDATE`,
                [allVoucherIds]
            );
            const availabilityById = new Map(availabilityResult.rows.map(row => [row.bubble_id, row]));

            for (const voucherId of allVoucherIds) {
                const hadBefore = previousSet.has(voucherId);
                const hasNow = nextSet.has(voucherId);
                if (hadBefore === hasNow) continue;

                const voucherRow = availabilityById.get(voucherId);
                if (!voucherRow || voucherRow.voucher_availability === null || voucherRow.voucher_availability === undefined) {
                    continue;
                }

                const currentAvailability = parseInt(voucherRow.voucher_availability, 10);
                if (!Number.isInteger(currentAvailability)) {
                    continue;
                }

                if (!hadBefore && hasNow) {
                    if (currentAvailability <= 0) {
                        throw new Error('Voucher availability is exhausted');
                    }
                    await client.query(
                        `UPDATE voucher
                         SET voucher_availability = voucher_availability - 1, updated_at = NOW()
                         WHERE bubble_id = $1`,
                        [voucherId]
                    );
                } else if (hadBefore && !hasNow) {
                    await client.query(
                        `UPDATE voucher
                         SET voucher_availability = voucher_availability + 1, updated_at = NOW()
                         WHERE bubble_id = $1`,
                        [voucherId]
                    );
                }
            }
        }

        await client.query(
            `DELETE FROM invoice_voucher_selection WHERE linked_invoice = $1`,
            [invoiceId]
        );

        for (const voucherId of nextVoucherIds) {
            const voucher = voucherById.get(voucherId);
            await client.query(
                `INSERT INTO invoice_voucher_selection (
                    bubble_id, linked_invoice, linked_voucher, linked_voucher_category,
                    voucher_code_snapshot, voucher_title_snapshot, discount_amount_snapshot, discount_percent_snapshot,
                    created_by, created_at, updated_at
                 ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8,
                    $9, NOW(), NOW()
                 )`,
                [
                    `ivs_${crypto.randomBytes(8).toString('hex')}`,
                    invoiceId,
                    voucher.bubble_id,
                    voucher.linked_voucher_category,
                    voucher.voucher_code,
                    voucher.title || null,
                    voucher.discount_amount !== null && voucher.discount_amount !== undefined ? parseFloat(voucher.discount_amount) : null,
                    voucher.discount_percent !== null && voucher.discount_percent !== undefined ? parseFloat(voucher.discount_percent) : null,
                    createdBy || null
                ]
            );
        }

        await client.query('COMMIT');
        return await getInvoiceVoucherSelections(pool, invoiceId);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    getAllVouchers,
    getVoucherById,
    createVoucher,
    duplicateVoucher,
    updateVoucher,
    deleteVoucher,
    restoreVoucher,
    toggleVoucherStatus,
    checkVoucherCodeExists,
    getAllVoucherCategories,
    getVoucherCategoryById,
    createVoucherCategory,
    updateVoucherCategory,
    deleteVoucherCategory,
    restoreVoucherCategory,
    toggleVoucherCategoryStatus,
    setVoucherCategoryDisabled,
    checkVoucherCategoryNameExists,
    getVoucherGroupsForInvoiceStep,
    getInvoiceVoucherSelections,
    replaceInvoiceVoucherSelections
};
