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
      .split(/\s+/)
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
 * @typedef {Object} InvoiceCreationPayload
 * @property {number|string} userId - The unique identifier of the user creating the invoice.
 * @property {string} packageId - The bubble_id of the selected solar package.
 * @property {number} [discountFixed] - Fixed currency discount amount.
 * @property {number} [discountPercent] - Percentage discount (0-100).
 * @property {string} [discountGiven] - Raw string input for discount (e.g. "10%").
 * @property {boolean} [applySst] - Whether to apply Sales and Service Tax.
 * @property {string} [templateId] - Optional specific template ID.
 * @property {string} [voucherCode] - Single voucher code (legacy).
 * @property {string[]} [voucherCodes] - Array of voucher codes.
 * @property {number} [agentMarkup] - Markup added by the agent.
 * @property {string} [customerName] - Customer's full name.
 * @property {string} [customerPhone] - Customer's contact number.
 * @property {string} [customerAddress] - Customer's physical address.
 * @property {number} [eppFeeAmount] - Extra processing fee amount.
 * @property {string} [eppFeeDescription] - Description for the extra fee.
 * @property {string} [paymentStructure] - Payment terms text.
 */

/**
 * Validate invoice request data
 * @param {InvoiceCreationPayload} invoiceRequestPayload - The raw input data from the controller
 * @returns {object} { valid, errors }
 */
function validateInvoiceData(invoiceRequestPayload) {
  const errors = [];
  const p = invoiceRequestPayload; // Alias for brevity in validation checks

  // CRITICAL: userId is required - no fallback allowed
  if (!p.userId || (typeof p.userId !== 'number' && typeof p.userId !== 'string')) {
    errors.push('User ID is required. Authentication failed - please login again.');
  }

  if (!p.packageId || p.packageId.trim().length === 0) {
    errors.push('package_id is required');
  }

  if (p.discountFixed && p.discountFixed < 0) {
    errors.push('discount_fixed must be non-negative');
  }

  if (p.discountPercent && (p.discountPercent < 0 || p.discountPercent > 100)) {
    errors.push('discount_percent must be between 0 and 100');
  }

  if (p.agentMarkup && p.agentMarkup < 0) {
    errors.push('agent_markup must be non-negative');
  }

  if (p.eppFeeAmount && p.eppFeeAmount < 0) {
    errors.push('epp_fee_amount must be non-negative');
  }

  if (p.extraItems && !Array.isArray(p.extraItems)) {
    errors.push('extra_items must be an array');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create invoice with validation and error handling
 * Acts as the Anti-Corruption Layer between the HTTP Controller and the Data Repository.
 * 
 * @param {object} pool - Database pool
 * @param {InvoiceCreationPayload} invoiceRequestPayload - Normalized data from the route
 * @returns {Promise<object>} Result with success, data or error
 */
async function createInvoice(pool, invoiceRequestPayload) {
  const client = await pool.connect();

  try {
    // 1. Validation Layer
    const validation = validateInvoiceData(invoiceRequestPayload);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', ')
      };
    }

    // 2. Data Normalization Layer
    // [AI Context] We map inputs to explicit variables to avoid "mystery data" passing.
    let discountFixed = invoiceRequestPayload.discountFixed || 0;
    let discountPercent = invoiceRequestPayload.discountPercent || 0;

    // Logic: If a raw string was provided (e.g. from a text input), parse it to override numbers
    if (invoiceRequestPayload.discountGiven) {
      const parsed = parseDiscountString(invoiceRequestPayload.discountGiven);
      discountFixed = parsed.discountFixed;
      discountPercent = parsed.discountPercent;
    }

    // 3. Repository Delegation
    // We construct a pure object for the repo, ensuring it only gets what it needs.
    const repoPayload = {
      userId: invoiceRequestPayload.userId,
      packageId: invoiceRequestPayload.packageId,
      discountFixed: discountFixed,
      discountPercent: discountPercent,
      applySst: invoiceRequestPayload.applySst || false,
      templateId: invoiceRequestPayload.templateId,
      voucherCode: invoiceRequestPayload.voucherCode,
      voucherCodes: invoiceRequestPayload.voucherCodes,
      agentMarkup: invoiceRequestPayload.agentMarkup || 0,
      customerName: invoiceRequestPayload.customerName,
      customerPhone: invoiceRequestPayload.customerPhone,
      customerAddress: invoiceRequestPayload.customerAddress,
      eppFeeAmount: invoiceRequestPayload.eppFeeAmount,
      eppFeeDescription: invoiceRequestPayload.eppFeeDescription,
      paymentStructure: invoiceRequestPayload.paymentStructure,
      extraItems: invoiceRequestPayload.extraItems || []
    };

    // Transaction handled inside repo
    const invoice = await invoiceRepo.createInvoiceOnTheFly(client, repoPayload);

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

/**
 * Create a new version of an existing invoice
 * @param {object} pool - Database pool
 * @param {string} originalBubbleId - The bubble_id of the invoice to version
 * @param {InvoiceCreationPayload} invoiceRequestPayload - Normalized data
 * @returns {Promise<object>} Result
 */
async function createInvoiceVersion(pool, originalBubbleId, invoiceRequestPayload) {
  const client = await pool.connect();

  try {
    // 1. Validation (Same as createInvoice but packageId is optional as we fetch from original)
    // We relax packageId check here as it comes from original invoice
    if (!invoiceRequestPayload.userId) {
      return { success: false, error: 'User ID is required.' };
    }

    // 2. Data Normalization
    let discountFixed = invoiceRequestPayload.discountFixed || 0;
    let discountPercent = invoiceRequestPayload.discountPercent || 0;

    if (invoiceRequestPayload.discountGiven) {
      const parsed = parseDiscountString(invoiceRequestPayload.discountGiven);
      discountFixed = parsed.discountFixed;
      discountPercent = parsed.discountPercent;
    }

    const repoPayload = {
      userId: invoiceRequestPayload.userId,
      originalBubbleId: originalBubbleId, // CRITICAL: This triggers version logic
      // packageId: We don't pass packageId, repo fetches from original
      discountFixed: discountFixed,
      discountPercent: discountPercent,
      applySst: invoiceRequestPayload.applySst || false,
      // templateId: We reuse original
      voucherCode: invoiceRequestPayload.voucherCode,
      voucherCodes: invoiceRequestPayload.voucherCodes,
      agentMarkup: invoiceRequestPayload.agentMarkup || 0,
      customerName: invoiceRequestPayload.customerName, // Updates name if provided
      customerPhone: invoiceRequestPayload.customerPhone,
      customerAddress: invoiceRequestPayload.customerAddress,
      eppFeeAmount: invoiceRequestPayload.eppFeeAmount,
      eppFeeDescription: invoiceRequestPayload.eppFeeDescription,
      paymentStructure: invoiceRequestPayload.paymentStructure,
      extraItems: invoiceRequestPayload.extraItems || []
    };

    // 3. Repository Delegation
    const invoice = await invoiceRepo.createInvoiceVersionTransaction(client, repoPayload);

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
    console.error('Error in createInvoiceVersion service:', err);
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
  createInvoice,
  createInvoiceVersion
};
