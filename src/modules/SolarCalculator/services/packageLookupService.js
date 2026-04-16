const getResidentialPackagePhasePrefix = (systemPhase) => {
  const parsedPhase = parseInt(systemPhase, 10);
  if (parsedPhase === 1) return '[1P]';
  if (parsedPhase === 3) return '[3P]';
  return null;
};

const RESIDENTIAL_PACKAGE_TEXT_SQL = `LOWER(CONCAT_WS(' ', COALESCE(p.package_name, ''), COALESCE(p.invoice_desc, '')))\n`;

const normalizeResidentialInverterType = (value = 'string') => (
  String(value || '').trim().toLowerCase() === 'hybrid' ? 'hybrid' : 'string'
);

const buildResidentialPackageInverterFilterSql = (paramIndex) => `
  AND (
    $${paramIndex}::text IS NULL
    OR (
      $${paramIndex}::text = 'hybrid'
      AND (
        ${RESIDENTIAL_PACKAGE_TEXT_SQL.trim()} LIKE '%hybrid%'
        OR ${RESIDENTIAL_PACKAGE_TEXT_SQL.trim()} LIKE '%hybird%'
      )
    )
    OR (
      $${paramIndex}::text = 'string'
      AND NOT (
        ${RESIDENTIAL_PACKAGE_TEXT_SQL.trim()} LIKE '%hybrid%'
        OR ${RESIDENTIAL_PACKAGE_TEXT_SQL.trim()} LIKE '%hybird%'
      )
    )
  )
`;

const resolveLookupPackageType = (requestedType = '') => {
  const normalizedType = String(requestedType || '').trim().toLowerCase();
  return normalizedType === 'tariff b&d low voltage' || normalizedType === 'commercial'
    ? 'Tariff B&D Low Voltage'
    : 'Residential';
};

const buildPackageLookupFilters = ({
  params,
  resolvedPackageType,
  residentialPhasePrefix,
  residentialInverterType,
  panelBubbleId,
  panelWattage
}) => {
  let sql = `
    SELECT p.*, COALESCE(p.bubble_id, p.id::text) AS resolved_package_id,
           COALESCE(p.bubble_id, p.id::text) AS bubble_id,
           pr.id AS product_id, pr.bubble_id AS product_bubble_id, pr.solar_output_rating
    FROM package p
    JOIN product pr ON (
      CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
      OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
    )
    WHERE p.active = true
      AND (p.special IS FALSE OR p.special IS NULL)
      AND p.type = $2
  `;

  if (panelBubbleId) {
    params.push(panelBubbleId);
    sql += ` AND pr.bubble_id = $${params.length}`;
  } else {
    params.push(panelWattage);
    sql += ` AND pr.solar_output_rating = $${params.length}`;
  }

  if (resolvedPackageType === 'Residential' && residentialPhasePrefix) {
    params.push(`${residentialPhasePrefix}%`);
    sql += ` AND p.package_name ILIKE $${params.length}`;
  }

  if (resolvedPackageType === 'Residential' && residentialInverterType) {
    params.push(residentialInverterType);
    sql += buildResidentialPackageInverterFilterSql(params.length);
  }

  sql += `
    ORDER BY ABS(p.panel_qty - $1) ASC, p.price ASC
    LIMIT 1
  `;

  return sql;
};

async function lookupBestPackage(client, {
  panelQty,
  panelBubbleId = null,
  panelType = null,
  type = 'Residential',
  systemPhase = null,
  inverterType = null
}) {
  const resolvedPackageType = resolveLookupPackageType(type);
  const residentialPhasePrefix = resolvedPackageType === 'Residential'
    ? getResidentialPackagePhasePrefix(systemPhase)
    : null;
  const residentialInverterType = resolvedPackageType === 'Residential' && inverterType !== undefined && inverterType !== null && inverterType !== ''
    ? normalizeResidentialInverterType(inverterType)
    : null;

  const qty = parseInt(panelQty, 10);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('panelQty is required');
  }

  const params = [qty, resolvedPackageType];
  const sql = buildPackageLookupFilters({
    params,
    resolvedPackageType,
    residentialPhasePrefix,
    residentialInverterType,
    panelBubbleId: panelBubbleId || null,
    panelWattage: panelType !== null && panelType !== undefined ? parseInt(panelType, 10) : null
  });

  const result = await client.query(sql, params);
  return {
    resolvedPackageType,
    residentialInverterType,
    systemPhase: systemPhase ? parseInt(systemPhase, 10) || null : null,
    package: result.rows[0] || null
  };
}

module.exports = {
  lookupBestPackage,
  normalizeResidentialInverterType,
  getResidentialPackagePhasePrefix
};
