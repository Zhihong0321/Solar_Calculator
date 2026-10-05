/**
 * Read-time product resolution for legacy microinverter invoice lines without linked_product.
 * Only known SAJ models match; warranty wording remains owned by the product catalog.
 */
const MICRO_INVERTER_PRODUCTS = [
  { pattern: /^SAJ M2-1\.8K[- ]S4 MICRO INVERTER(?:\s*\(.*\))?$/i, productId: '1712027846244x376551508591509500' },
  { pattern: /^SAJ M2-1\.0K[- ]S2 MICRO INVERTER(?:\s*\(.*\))?$/i, productId: '1712027911264x544501973692448800' }
];

function resolveMicroInverterWarrantyProduct(item) {
  if (!item || item.linked_product) return null;
  const description = String(item.description || '').trim().replace(/\s+/g, ' ');
  return MICRO_INVERTER_PRODUCTS.find(({ pattern }) => pattern.test(description))?.productId || null;
}

module.exports = { resolveMicroInverterWarrantyProduct };
