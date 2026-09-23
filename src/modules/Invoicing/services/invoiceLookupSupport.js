/**
 * [AI-CONTEXT]
 * Domain: Invoicing Lookup Support
 * Primary Responsibility: Stable package, template, and voucher lookup helpers for invoicing flows.
 * Stability: Keep simple read-side lookup queries here so invoiceRepo can focus on orchestration and persistence transitions.
 */
const EV_CHARGER_ADDON_NAME = /(site visit|extra cable|upgrade cable|conceal|ceiling open|wall crossing|isolator)/i;
const EV_CHARGER_CATEGORY_ORDER = { charger: 0, installation: 1, bundle: 2 };

function categorizeEvChargerPackage(name) {
  const value = String(name || '').toLowerCase();
  if (value.includes('with installation')) return 'bundle';
  if (value.includes('installation')) return 'installation';
  return 'charger';
}

function shortEvChargerDescription(invoiceDesc) {
  const text = String(invoiceDesc || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const sentence = text.split(/(?<=\.)\s/)[0];
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
}

/**
 * Active EV Charger packages that can be the main quotation package.
 * Add-on fees (site visit, extra cable, and similar) stay off this list;
 * the EV quote page already offers those as optional extra lines.
 */
async function listEvChargerQuotePackages(client) {
  const result = await client.query(
    `SELECT COALESCE(bubble_id, id::text) AS bubble_id,
            package_name,
            price,
            invoice_desc
     FROM package
     WHERE active IS TRUE
       AND lower(trim(type)) = 'ev charger'
     ORDER BY price ASC, package_name ASC`
  );

  return result.rows
    .filter((row) => !EV_CHARGER_ADDON_NAME.test(row.package_name || ''))
    .map((row) => ({
      bubble_id: row.bubble_id,
      name: row.package_name,
      price: parseFloat(row.price) || 0,
      category: categorizeEvChargerPackage(row.package_name),
      desc: shortEvChargerDescription(row.invoice_desc)
    }))
    .sort((a, b) => {
      const categoryDelta = (EV_CHARGER_CATEGORY_ORDER[a.category] ?? 9) - (EV_CHARGER_CATEGORY_ORDER[b.category] ?? 9);
      if (categoryDelta !== 0) return categoryDelta;
      if (a.price !== b.price) return a.price - b.price;
      return String(a.name).localeCompare(String(b.name));
    });
}

async function getPackageById(client, packageId) {
  try {
    const result = await client.query(
      `SELECT COALESCE(bubble_id, id::text) AS bubble_id, id, package_name as name, price, panel, panel_qty, invoice_desc, type, max_discount, nett_price
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
  getVoucherById,
  listEvChargerQuotePackages
};
