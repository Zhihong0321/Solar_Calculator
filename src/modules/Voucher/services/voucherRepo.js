/**
 * Domain: Voucher Repository
 * Primary Responsibility: Low-level Database (PostgreSQL) operations for Vouchers.
 */
const crypto = require('crypto');

/**
 * Get all vouchers filtered by status
 * @param {object} pool - Database pool
 * @param {string} status - 'active' (default), 'inactive', or 'deleted'
 * @returns {Promise<Array>} List of vouchers
 */
async function getAllVouchers(pool, status = 'all') {
    try {
        let whereClause = '';

        // Only filter if explicitly requested
        if (status === 'deleted') {
            whereClause = `WHERE "delete" = TRUE`;
        } else if (status === 'active') {
            // Active AND Not Deleted
            whereClause = `WHERE active = TRUE AND ("delete" IS NULL OR "delete" = FALSE)`;
        } else if (status === 'inactive') {
            // Inactive AND Not Deleted
            whereClause = `WHERE active = FALSE AND ("delete" IS NULL OR "delete" = FALSE)`;
        }

        console.log(`[Repo] GetVouchers Status: ${status}, SQL: ${whereClause || 'ALL'}`);
        const result = await pool.query(
            `SELECT * FROM voucher ${whereClause} ORDER BY created_at DESC`
        );
        return result.rows;
    } catch (err) {
        console.error('Error fetching vouchers:', err);
        throw err;
    }
}

/**
 * Get voucher by ID
 * @param {object} pool - Database pool
 * @param {number|string} id - Voucher ID or bubble_id
 * @returns {Promise<object|null>} Voucher object
 */
async function getVoucherById(pool, id) {
    try {
        const isNumeric = !isNaN(id);
        const query = isNumeric
            ? 'SELECT * FROM voucher WHERE id = $1'
            : 'SELECT * FROM voucher WHERE bubble_id = $1';

        const result = await pool.query(query, [id]);
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
        console.error('Error fetching voucher by ID:', err);
        throw err;
    }
}

/**
 * Check if a voucher code already exists
 * @param {object} pool - Database pool
 * @param {string} code - Voucher code to check
 * @param {string} excludeId - Optional ID to exclude (for updates)
 * @returns {Promise<boolean>} True if exists, False otherwise
 */
async function checkVoucherCodeExists(pool, code, excludeId = null) {
    try {
        let query = `SELECT id FROM voucher WHERE voucher_code = $1 AND ("delete" IS NOT TRUE OR "delete" IS NULL)`;
        const params = [code];

        if (excludeId) {
            query += ` AND bubble_id != $2 AND id::text != $2`;
            params.push(String(excludeId));
        }

        const result = await pool.query(query, params);
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking voucher code:', err);
        return false;
    }
}

/**
 * Toggle voucher active status
 * @param {object} pool - Database pool
 * @param {number|string} id - Voucher ID or bubble_id
 * @returns {Promise<boolean>} New active status
 */
async function toggleVoucherStatus(pool, id) {
    const isNumeric = !isNaN(id);
    const identifierColumn = isNumeric ? 'id' : 'bubble_id';

    // Toggle the boolean value
    const query = `
        UPDATE voucher 
        SET active = NOT active, updated_at = NOW() 
        WHERE ${identifierColumn} = $1 
        RETURNING active
    `;

    try {
        const result = await pool.query(query, [id]);
        return result.rows.length > 0 ? result.rows[0].active : null;
    } catch (err) {
        console.error('Error toggling voucher status:', err);
        throw err;
    }
}


/**
 * Create a new voucher
 * @param {object} pool - Database pool
 * @param {object} data - Voucher data
 * @returns {Promise<object>} Created voucher
 */
async function createVoucher(pool, data) {
    const {
        title,
        voucher_code,
        voucher_type,
        discount_amount,
        discount_percent,
        active = true,
        voucher_availability,
        terms_conditions,
        available_until,
        public = true,
        created_by,
        deductable_from_commission
    } = data;

    const bubble_id = `voucher_${crypto.randomBytes(8).toString('hex')}`;

    // Safe Integer Parsing for Percent
    const safePercent = discount_percent ? parseInt(discount_percent, 10) : null;
    const safeAmount = discount_amount ? parseFloat(discount_amount) : null;
    const safeDeductable = deductable_from_commission ? parseFloat(deductable_from_commission) : 0;

    const query = `
    INSERT INTO voucher (
      bubble_id, title, voucher_code, voucher_type, 
      discount_amount, discount_percent, active, 
      voucher_availability, terms_conditions, available_until, 
      public, created_by, deductable_from_commission, created_at, updated_at, created_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW(), NOW()
    ) RETURNING *
  `;

    const values = [
        bubble_id, title, voucher_code, voucher_type,
        safeAmount, safePercent, active,
        voucher_availability || null, terms_conditions || null, available_until || null,
        public, created_by || null, safeDeductable
    ];

    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (err) {
        console.error('Error creating voucher:', err);
        throw err;
    }
}

/**
 * Update an existing voucher
 * @param {object} pool - Database pool
 * @param {number|string} id - Voucher ID or bubble_id
 * @param {object} data - Updated voucher data
 * @returns {Promise<object|null>} Updated voucher
 */
async function updateVoucher(pool, id, data) {
    const {
        title,
        voucher_code,
        voucher_type,
        discount_amount,
        discount_percent,
        active,
        voucher_availability,
        terms_conditions,
        available_until,
        public,
        deductable_from_commission
    } = data;

    const isNumeric = !isNaN(id);
    const identifierColumn = isNumeric ? 'id' : 'bubble_id';

    // Safe Integer Parsing for Percent
    let safePercent = undefined;
    if (discount_percent !== undefined) {
        safePercent = discount_percent ? parseInt(discount_percent, 10) : null;
    }

    let safeAmount = undefined;
    if (discount_amount !== undefined) {
        safeAmount = discount_amount ? parseFloat(discount_amount) : null;
    }

    let safeDeductable = undefined;
    if (deductable_from_commission !== undefined) {
        safeDeductable = deductable_from_commission ? parseFloat(deductable_from_commission) : 0;
    }

    // Dynamic query construction is hard with hardcoded indices.
    // However, since we are rewriting the whole function block, we can just update indices.
    // Param Indices:
    // 1: title, 2: code, 3: type, 4: amount, 5: percent, 6: active, 
    // 7: availability, 8: terms, 9: until, 10: public, 11: deductable, 12: id

    const query = `
    UPDATE voucher SET
      title = COALESCE($1, title),
      voucher_code = COALESCE($2, voucher_code),
      voucher_type = COALESCE($3, voucher_type),
      discount_amount = $4,
      discount_percent = $5,
      active = COALESCE($6, active),
      voucher_availability = COALESCE($7, voucher_availability),
      terms_conditions = COALESCE($8, terms_conditions),
      available_until = COALESCE($9, available_until),
      public = COALESCE($10, public),
      deductable_from_commission = COALESCE($11, deductable_from_commission),
      updated_at = NOW(),
      modified_date = NOW()
    WHERE ${identifierColumn} = $12
    RETURNING *
  `;

    const values = [
        title, voucher_code, voucher_type,
        safeAmount, safePercent, active,
        voucher_availability, terms_conditions, available_until,
        public, safeDeductable, id
    ];

    try {
        const result = await pool.query(query, values);
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
        console.error('Error updating voucher:', err);
        throw err;
    }
}

/**
 * Soft delete a voucher
 * @param {object} pool - Database pool
 * @param {number|string} id - Voucher ID or bubble_id
 * @returns {Promise<boolean>} Success status
 */
async function deleteVoucher(pool, id) {
    const isNumeric = !isNaN(id);
    const identifierColumn = isNumeric ? 'id' : 'bubble_id';

    const query = `UPDATE voucher SET "delete" = TRUE, updated_at = NOW() WHERE ${identifierColumn} = $1`;

    try {
        const result = await pool.query(query, [id]);
        return result.rowCount > 0;
    } catch (err) {
        console.error('Error deleting voucher:', err);
        throw err;
    }
}

/**
 * Restore a soft-deleted voucher
 * @param {object} pool - Database pool
 * @param {number|string} id - Voucher ID or bubble_id
 * @returns {Promise<boolean>} Success status
 */
async function restoreVoucher(pool, id) {
    const isNumeric = !isNaN(id);
    const identifierColumn = isNumeric ? 'id' : 'bubble_id';

    const query = `UPDATE voucher SET "delete" = NULL, updated_at = NOW() WHERE ${identifierColumn} = $1`;

    try {
        const result = await pool.query(query, [id]);
        return result.rowCount > 0;
    } catch (err) {
        console.error('Error restoring voucher:', err);
        throw err;
    }
}

module.exports = {
    getAllVouchers,
    getVoucherById,
    createVoucher,
    updateVoucher,
    deleteVoucher,
    restoreVoucher,
    toggleVoucherStatus,
    checkVoucherCodeExists
};
