/**
 * Invoice Service Module
 * Business logic for invoice creation
 */
const invoiceRepo = require('./invoiceRepo');
const sedaService = require('./sedaService');

/**
 * Parse discount_given string into discount_fixed and discount_percent
 * @param {string} discountGiven - String like "500 10%", "500", or "10%"
 * @returns {object} { discountFixed, discountPercent }
 *
 * @ai_context
 * BUSINESS RULE: Hybrid Discount Parsing
 * Allows sales agents to input "500 10%" to apply BOTH fixed amount and percentage.
 * - Priority: Parses all parts; sums fixed amounts, takes last valid percentage.
 * - Sanitization: Strips 'RM', commas, and '+' signs before parsing.
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
    console.warn('[InvoiceService] Validation Failed: Package ID is missing/empty. Payload:', JSON.stringify(p, null, 2));
    errors.push('Package selection is required');
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
    // 0. Normalize Data (Handle field name variations from frontend)
    if (invoiceRequestPayload.linked_package && !invoiceRequestPayload.packageId) {
        invoiceRequestPayload.packageId = invoiceRequestPayload.linked_package;
    }
    if (invoiceRequestPayload.template_id && !invoiceRequestPayload.templateId) {
        invoiceRequestPayload.templateId = invoiceRequestPayload.template_id;
    }
    if (invoiceRequestPayload.discount_given && !invoiceRequestPayload.discountGiven) {
        invoiceRequestPayload.discountGiven = invoiceRequestPayload.discount_given;
    }
    if (invoiceRequestPayload.epp_fee_amount && !invoiceRequestPayload.eppFeeAmount) {
        invoiceRequestPayload.eppFeeAmount = invoiceRequestPayload.epp_fee_amount;
    }
    if (invoiceRequestPayload.epp_fee_description && !invoiceRequestPayload.eppFeeDescription) {
        invoiceRequestPayload.eppFeeDescription = invoiceRequestPayload.epp_fee_description;
    }
    if (invoiceRequestPayload.extra_items && !invoiceRequestPayload.extraItems) {
        invoiceRequestPayload.extraItems = invoiceRequestPayload.extra_items;
    }
    if (invoiceRequestPayload.voucher_codes && !invoiceRequestPayload.voucherCodes) {
        invoiceRequestPayload.voucherCodes = invoiceRequestPayload.voucher_codes;
    }
    if (invoiceRequestPayload.customer_name && !invoiceRequestPayload.customerName) {
        invoiceRequestPayload.customerName = invoiceRequestPayload.customer_name;
    }
    if (invoiceRequestPayload.customer_phone && !invoiceRequestPayload.customerPhone) {
        invoiceRequestPayload.customerPhone = invoiceRequestPayload.customer_phone;
    }
    if (invoiceRequestPayload.customer_address && !invoiceRequestPayload.customerAddress) {
        invoiceRequestPayload.customerAddress = invoiceRequestPayload.customer_address;
    }
    if (invoiceRequestPayload.lead_source && !invoiceRequestPayload.leadSource) {
        invoiceRequestPayload.leadSource = invoiceRequestPayload.lead_source;
    }

    // 1. Validation Layer Layer
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

    // 2.5 Follow-up Logic
    let followUpDate = null;
    if (invoiceRequestPayload.customerName && invoiceRequestPayload.customerName.trim() !== "") {
        const days = parseInt(invoiceRequestPayload.followUpDays); // expected 3, 7, or 0/null for none
        if (days && days > 0) {
            const date = new Date();
            date.setDate(date.getDate() + days);
            followUpDate = date.toISOString();
        } else if (invoiceRequestPayload.followUpDays === undefined || invoiceRequestPayload.followUpDays === null) {
            // Default to 7 days if customer name is present and no explicit choice made
            const date = new Date();
            date.setDate(date.getDate() + 7);
            followUpDate = date.toISOString();
        }
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
      profilePicture: invoiceRequestPayload.profilePicture,
      leadSource: invoiceRequestPayload.leadSource,
      remark: invoiceRequestPayload.remark,
      eppFeeAmount: invoiceRequestPayload.eppFeeAmount,
      eppFeeDescription: invoiceRequestPayload.eppFeeDescription,
      paymentStructure: invoiceRequestPayload.paymentStructure,
      extraItems: invoiceRequestPayload.extraItems || [],
      followUpDate: followUpDate
    };

    // Transaction handled inside repo
    const invoice = await invoiceRepo.createInvoiceOnTheFly(client, repoPayload);

    console.log('[InvoiceService] Invoice Created:', invoice.bubble_id);
    console.log('[InvoiceService] Customer Bubble ID:', invoice.customerBubbleId);

    // [New Requirement] Create SEDA Registration if customer info is present
    if (invoice.customerBubbleId) {
        try {
            console.log('[InvoiceService] Attempting SEDA creation...');
            await sedaService.ensureSedaRegistration(
                client, 
                invoice.bubble_id, 
                invoice.customerBubbleId, 
                String(repoPayload.userId)
            );
            console.log('[InvoiceService] SEDA creation success/ensured.');
        } catch (sedaErr) {
            console.error('Failed to auto-create SEDA registration:', sedaErr);
            // Non-blocking: We don't fail the invoice creation if SEDA fails
        }
    } else {
        console.log('[InvoiceService] No Customer Bubble ID, skipping SEDA.');
    }

    return {
      success: true,
      data: {
        bubbleId: invoice.bubble_id,
        invoiceNumber: invoice.invoice_number,
        totalAmount: invoice.total_amount,
        subtotal: invoice.subtotal,
        sstAmount: invoice.sst_amount,
        discountAmount: invoice.discount_amount,
        voucherAmount: invoice.voucher_amount,
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
    // 0. Normalize Data
    if (invoiceRequestPayload.linked_package && !invoiceRequestPayload.packageId) {
        invoiceRequestPayload.packageId = invoiceRequestPayload.linked_package;
    }
    if (invoiceRequestPayload.template_id && !invoiceRequestPayload.templateId) {
        invoiceRequestPayload.templateId = invoiceRequestPayload.template_id;
    }
    if (invoiceRequestPayload.discount_given && !invoiceRequestPayload.discountGiven) {
        invoiceRequestPayload.discountGiven = invoiceRequestPayload.discount_given;
    }
    if (invoiceRequestPayload.epp_fee_amount && !invoiceRequestPayload.eppFeeAmount) {
        invoiceRequestPayload.eppFeeAmount = invoiceRequestPayload.epp_fee_amount;
    }
    if (invoiceRequestPayload.epp_fee_description && !invoiceRequestPayload.eppFeeDescription) {
        invoiceRequestPayload.eppFeeDescription = invoiceRequestPayload.epp_fee_description;
    }
    if (invoiceRequestPayload.extra_items && !invoiceRequestPayload.extraItems) {
        invoiceRequestPayload.extraItems = invoiceRequestPayload.extra_items;
    }
    if (invoiceRequestPayload.voucher_codes && !invoiceRequestPayload.voucherCodes) {
        invoiceRequestPayload.voucherCodes = invoiceRequestPayload.voucher_codes;
    }
    if (invoiceRequestPayload.customer_name && !invoiceRequestPayload.customerName) {
        invoiceRequestPayload.customerName = invoiceRequestPayload.customer_name;
    }
    if (invoiceRequestPayload.customer_phone && !invoiceRequestPayload.customerPhone) {
        invoiceRequestPayload.customerPhone = invoiceRequestPayload.customer_phone;
    }
    if (invoiceRequestPayload.customer_address && !invoiceRequestPayload.customerAddress) {
        invoiceRequestPayload.customerAddress = invoiceRequestPayload.customer_address;
    }
    if (invoiceRequestPayload.lead_source && !invoiceRequestPayload.leadSource) {
        invoiceRequestPayload.leadSource = invoiceRequestPayload.lead_source;
    }

    // 1. Validation Layer (Same as createInvoice but packageId is optional as we fetch from original)
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

    // 2.5 Follow-up Logic
    let followUpDate = null;
    if (invoiceRequestPayload.customerName && invoiceRequestPayload.customerName.trim() !== "") {
        const days = parseInt(invoiceRequestPayload.followUpDays);
        if (days && days > 0) {
            const date = new Date();
            date.setDate(date.getDate() + days);
            followUpDate = date.toISOString();
        }
        // For versioning, if days is 0 or explicit choice is made to have no reminder, followUpDate remains null.
        // If not provided, we might want to preserve or recalculate, but the prompt implies setting it during flow.
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
      profilePicture: invoiceRequestPayload.profilePicture,
      leadSource: invoiceRequestPayload.leadSource,
      remark: invoiceRequestPayload.remark,
      eppFeeAmount: invoiceRequestPayload.eppFeeAmount,
      eppFeeDescription: invoiceRequestPayload.eppFeeDescription,
      paymentStructure: invoiceRequestPayload.paymentStructure,
      extraItems: invoiceRequestPayload.extraItems || [],
      followUpDate: followUpDate
    };

    // 3. Repository Delegation
    const invoice = await invoiceRepo.updateInvoiceTransaction(client, repoPayload);

    // [New Requirement] Ensure SEDA Registration exists for updated invoice
    if (invoice.customerBubbleId) {
        try {
            await sedaService.ensureSedaRegistration(
                client, 
                invoice.bubble_id, 
                invoice.customerBubbleId, 
                String(repoPayload.userId)
            );
        } catch (sedaErr) {
            console.error('Failed to ensure SEDA registration for updated invoice:', sedaErr);
        }
    }

    return {
      success: true,
      data: {
        bubbleId: invoice.bubble_id,
        invoiceNumber: invoice.invoice_number,
        totalAmount: invoice.total_amount,
        subtotal: invoice.subtotal,
        sstAmount: invoice.sst_amount,
        discountAmount: invoice.discount_amount,
        voucherAmount: invoice.voucher_amount,
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
