/**
 * [AI-CONTEXT]
 * Domain: Invoicing Customer Segment Support
 * Primary Responsibility: Normalize the invoice.customer_segment value (Residential / Commercial / Factory)
 *   and map it into invoice insert / update statements.
 * Stability: The create and edit invoice screens make the agent pick one segment. This module never throws
 *   and never blocks a save: an empty or unknown value is stored as NULL ("not picked yet") and logged.
 */
// Stored lowercase: production rows already hold 'residential'.
const CUSTOMER_SEGMENTS = ['residential', 'commercial', 'factory'];

/** Returns the canonical segment name, or null when the value is empty or not one of the three. */
function normalizeCustomerSegment(value) {
  if (value === null || value === undefined) return null;
  const wanted = String(value).trim().toLowerCase();
  if (!wanted) return null;
  return CUSTOMER_SEGMENTS.find((segment) => segment === wanted) || null;
}

function appendInvoiceSegmentInsertField(invoiceColumns, data, insertColumns, values) {
  if (!invoiceColumns.has('customer_segment')) return;
  const segment = normalizeCustomerSegment(data.customerSegment);
  if (!segment && data.customerSegment) {
    console.warn('[InvoiceSegment] Unknown customer segment ignored (stored as NULL):', data.customerSegment);
  }
  insertColumns.push('customer_segment');
  values.push(segment);
}

/** Edit: a value that was not sent keeps the stored segment. A sent value replaces it. */
function appendInvoiceSegmentUpdateField(invoiceColumns, data, currentData, updateAssignments, updateValues, startIndex) {
  if (!invoiceColumns.has('customer_segment')) return startIndex;

  let segment;
  if (data.customerSegment === undefined) {
    segment = normalizeCustomerSegment(currentData && currentData.customer_segment);
  } else {
    segment = normalizeCustomerSegment(data.customerSegment);
    if (!segment && data.customerSegment) {
      console.warn('[InvoiceSegment] Unknown customer segment ignored (kept as NULL):', data.customerSegment);
    }
  }

  updateAssignments.push(`customer_segment = $${startIndex}`);
  updateValues.push(segment);
  return startIndex + 1;
}

module.exports = {
  CUSTOMER_SEGMENTS,
  normalizeCustomerSegment,
  appendInvoiceSegmentInsertField,
  appendInvoiceSegmentUpdateField
};
