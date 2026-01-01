/**
 * Invoice Service Module
 * Business logic for invoice creation
 */
const invoiceRepo = require('./invoiceRepo');

/**
 * Parse discount_given string into discount_fixed and discount_percent
 * @param {string} discountGiven - String like "500 10%", "500", or "10%"
 * @returns {object} { discountFixed, discountPercent }
 */
function parseDiscountString(discountGiven) {
  const result = {
    discountFixed: 0,
    discountPercent: 0
  };

  if (!discountGiven) {
    return result;
  }

  try {
    const parts = discountGiven
      .replace('+', ' ')
      .replace(',', ' ')
      .split()
      .filter(part => part.trim().length > 0);

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('%')) {
        // Percentage discount
        result.discountPercent = parseFloat(trimmed.replace('%', '').trim()) || 0;
      } else {
        // Fixed amount discount (remove RM, currency symbols)
        const value = trimmed
          .replace(/RM/gi, '')
          .replace(/[^\d.-]/g, '')
          .trim();
        result.discountFixed = parseFloat(value) || 0;
      }
    }
  } catch (err) {
    console.error('Error parsing discount string:', err);
  }

  return result;
}

/**
 * Validate invoice request data
 * @param {object} data - Invoice data
 * @returns {object} { valid, errors }
 */
function validateInvoiceData(data) {
  const errors = [];

  // CRITICAL: userId is required - no fallback allowed
  if (!data.userId || (typeof data.userId !== 'number' && typeof data.userId !== 'string')) {
    errors.push('User ID is required. Authentication failed - please login again.');
  }

  if (!data.packageId || data.packageId.trim().length === 0) {
    errors.push('package_id is required');
  }

  if (data.discountFixed && data.discountFixed < 0) {
    errors.push('discount_fixed must be non-negative');
  }

  if (data.discountPercent && (data.discountPercent < 0 || data.discountPercent > 100)) {
    errors.push('discount_percent must be between 0 and 100');
  }

  if (data.agentMarkup && data.agentMarkup < 0) {
    errors.push('agent_markup must be non-negative');
  }

  if (data.eppFeeAmount && data.eppFeeAmount < 0) {
    errors.push('epp_fee_amount must be non-negative');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create invoice with validation and error handling
 * @param {object} pool - Database pool
 * @param {object} data - Invoice data
 * @returns {Promise<object>} Result with success, data or error
 */
async function createInvoice(pool, data) {
  const client = await pool.connect();

  try {
    // Validate data
    const validation = validateInvoiceData(data);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', ')
      };
    }

    // Parse discount string if provided
    let discountFixed = data.discountFixed || 0;
    let discountPercent = data.discountPercent || 0;

    if (data.discountGiven) {
      const parsed = parseDiscountString(data.discountGiven);
      discountFixed = parsed.discountFixed;
      discountPercent = parsed.discountPercent;
    }

    // Create invoice using repository (transaction handled inside repo)
    // userId is required - no fallback allowed
    const invoice = await invoiceRepo.createInvoiceOnTheFly(client, {
      userId: data.userId,
      packageId: data.packageId,
      discountFixed,
      discountPercent,
      applySst: data.applySst || false,
      templateId: data.templateId,
      voucherCode: data.voucherCode,
      agentMarkup: data.agentMarkup || 0,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      eppFeeAmount: data.eppFeeAmount,
      eppFeeDescription: data.eppFeeDescription
    });

    return {
      success: true,
      data: {
        bubbleId: invoice.bubble_id,
        invoiceNumber: invoice.invoice_number,
        totalAmount: invoice.total_amount,
        subtotal: invoice.subtotal,
        sstAmount: invoice.sst_amount,
        shareToken: invoice.share_token
      }
    };
  } catch (err) {
    console.error('Error in invoice service:', err);
    return {
      success: false,
      error: err.message
    };
  } finally {
    client.release();
  }
}

module.exports = {
  parseDiscountString,
  validateInvoiceData,
  createInvoice
};
