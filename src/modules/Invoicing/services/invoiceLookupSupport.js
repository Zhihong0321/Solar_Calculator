/**
 * [AI-CONTEXT]
 * Domain: Invoicing Lookup Support
 * Primary Responsibility: Stable package, template, and voucher lookup helpers for invoicing flows.
 * Stability: Keep simple read-side lookup queries here so invoiceRepo can focus on orchestration and persistence transitions.
 */
async function getPackageById(client, packageId) {
  try {
    const result = await client.query(
      `SELECT COALESCE(bubble_id, id::text) AS bubble_id, id, package_name as name, price, panel, panel_qty, invoice_desc, type, max_discount
       FROM package
       WHERE bubble_id = $1 OR id::text = $1
       LIMIT 1`,
      [packageId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error fetching package:', err);
    return null;
  }
}

async function getDefaultTemplate(client) {
  try {
    const result = await client.query(
      `SELECT * FROM invoice_template WHERE is_default = true LIMIT 1`
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

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

module.exports = {
  getDefaultTemplate,
  getPackageById,
  getTemplateById,
  getVoucherByCode,
  getVoucherById
};
