const express = require('express');
const pool = require('../../../core/database/pool');
const tariffPool = require('../../../core/database/tariffPool');
const { findClosestTariff, calculateSolarSavings } = require('../services/solarCalculatorService');
const { calculateEeiOptimizer } = require('../services/eeiOptimizerService');
const { buildBillCycleModes } = require('../services/billCycleModeService');

const router = express.Router();

const getResidentialPackagePhasePrefix = (systemPhase) => {
  const parsedPhase = parseInt(systemPhase, 10);
  if (parsedPhase === 1) return '[1P]';
  if (parsedPhase === 3) return '[3P]';
  return null;
};

const RESIDENTIAL_PACKAGE_TEXT_SQL = `LOWER(CONCAT_WS(' ', COALESCE(p.package_name, ''), COALESCE(p.invoice_desc, '')))`;

const normalizeResidentialInverterType = (value = 'string') => (
  String(value || '').trim().toLowerCase() === 'hybrid' ? 'hybrid' : 'string'
);

const buildResidentialPackageInverterFilterSql = (paramIndex) => `
  AND (
    $${paramIndex}::text IS NULL
    OR (
      $${paramIndex}::text = 'hybrid'
      AND (
        ${RESIDENTIAL_PACKAGE_TEXT_SQL} LIKE '%hybrid%'
        OR ${RESIDENTIAL_PACKAGE_TEXT_SQL} LIKE '%hybird%'
      )
    )
    OR (
      $${paramIndex}::text = 'string'
      AND NOT (
        ${RESIDENTIAL_PACKAGE_TEXT_SQL} LIKE '%hybrid%'
        OR ${RESIDENTIAL_PACKAGE_TEXT_SQL} LIKE '%hybird%'
      )
    )
  )
`;

// API endpoint to serve environment configuration to frontend
router.get('/api/config', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  res.json({
    invoiceBaseUrl: `${protocol}://${host}/create-invoice`
  });
});

// API endpoint to explore database schema and tables
router.get('/api/schema', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const tablesQuery = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`;
    const tablesResult = await client.query(tablesQuery);

    const schema = {};
    for (const table of tablesResult.rows) {
      const columnsQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position;`;
      const columnsResult = await client.query(columnsQuery, [table.table_name]);
      schema[table.table_name] = columnsResult.rows;
    }
    res.json({ tables: tablesResult.rows.map(t => t.table_name), schema });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch schema', details: err.message });
  } finally {
    if (client) client.release();
  }
});

router.get('/api/debug-tnb-schema', async (req, res) => {
  let client;
  try {
    client = await tariffPool.connect();
    const result = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    res.json({ tables: result.rows.map(r => r.table_name) });
  } catch (err) {
    res.status(500).json({ error: 'TNB Schema Error', message: err.message, stack: err.stack });
  } finally {
    if (client) client.release();
  }
});

// API endpoint to get tariff data
router.get('/api/tnb-tariff', async (req, res) => {
  let client;
  try {
    client = await tariffPool.connect();
    const result = await client.query('SELECT * FROM domestic_am_tariff LIMIT 10');
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch TNB tariff data', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// API endpoint to explore package table schema and data
router.get('/api/package-info', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const schemaQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'package' ORDER BY ordinal_position;`;
    const schemaResult = await client.query(schemaQuery);
    const dataQuery = 'SELECT * FROM package LIMIT 10';
    const dataResult = await client.query(dataQuery);
    res.json({ schema: schemaResult.rows, sampleData: dataResult.rows, totalRecords: dataResult.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch package information', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// READ-ONLY lookup: verify package price by panel_qty and optional panel bubble_id
router.get('/readonly/package/lookup', async (req, res) => {
  let client;
  try {
    const qtyRaw = req.query.panelQty;
    const bubbleIdRaw = req.query.panelBubbleId || null;
    const requestedType = String(req.query.type || '').trim();
    const requestedPhase = req.query.systemPhase;
    const resolvedPackageType = requestedType === 'Tariff B&D Low Voltage' || requestedType.toLowerCase() === 'commercial'
      ? 'Tariff B&D Low Voltage'
      : 'Residential';
    const residentialPhasePrefix = resolvedPackageType === 'Residential'
      ? getResidentialPackagePhasePrefix(requestedPhase)
      : null;
    const residentialInverterType = resolvedPackageType === 'Residential' && req.query.inverterType !== undefined
      ? normalizeResidentialInverterType(req.query.inverterType)
      : null;
    if (!qtyRaw) return res.status(400).json({ error: 'panelQty is required' });
    const qty = parseInt(qtyRaw, 10);
    client = await pool.connect();
    let result;
    if (bubbleIdRaw) {
      const bubbleQueryParams = [qty, bubbleIdRaw, resolvedPackageType];
      let bubbleFilters = '';
      if (residentialPhasePrefix) {
        bubbleQueryParams.push(`${residentialPhasePrefix}%`);
        bubbleFilters += ` AND p.package_name ILIKE $${bubbleQueryParams.length}`;
      }
      if (residentialInverterType) {
        bubbleQueryParams.push(residentialInverterType);
        bubbleFilters += buildResidentialPackageInverterFilterSql(bubbleQueryParams.length);
      }
      const queryByBubble = `
        SELECT p.id, COALESCE(p.bubble_id, p.id::text) AS bubble_id, p.package_name, p.package_name AS name, p.invoice_desc, p.panel_qty, p.price, p.panel, p.type, p.active, p.special,
               pr.id as product_id, pr.bubble_id, pr.solar_output_rating
        FROM package p
        JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
        WHERE p.active = true AND (p.special IS FALSE OR p.special IS NULL) AND p.type = $3 AND pr.bubble_id = $2
          ${bubbleFilters}
        ORDER BY ABS(p.panel_qty - $1) ASC, p.price ASC LIMIT 10`;
      result = await client.query(queryByBubble, bubbleQueryParams);
    } else {
      const wattQueryParams = [qty];
      const queryByWatt = `
        SELECT p.id, COALESCE(p.bubble_id, p.id::text) AS bubble_id, p.package_name, p.package_name AS name, p.invoice_desc, p.panel_qty, p.price, p.panel, p.type, p.active, p.special,
               pr.id as product_id, pr.bubble_id, pr.solar_output_rating
        FROM package p
        JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
        WHERE p.active = true AND (p.special IS FALSE OR p.special IS NULL) AND p.type = $3 AND pr.solar_output_rating = $2
        ORDER BY ABS(p.panel_qty - $1) ASC, p.price ASC LIMIT 10`;
      const wattRaw = req.query.panelType;
      const watt = wattRaw ? parseInt(wattRaw, 10) : null;
      wattQueryParams.push(watt, resolvedPackageType);
      let wattFilters = '';
      if (residentialPhasePrefix) {
        wattQueryParams.push(`${residentialPhasePrefix}%`);
        wattFilters += ` AND p.package_name ILIKE $${wattQueryParams.length}`;
      }
      if (residentialInverterType) {
        wattQueryParams.push(residentialInverterType);
        wattFilters += buildResidentialPackageInverterFilterSql(wattQueryParams.length);
      }
      const finalQueryByWatt = queryByWatt.replace(
        'ORDER BY ABS(p.panel_qty - $1) ASC, p.price ASC LIMIT 10',
        `${wattFilters}
        ORDER BY ABS(p.panel_qty - $1) ASC, p.price ASC LIMIT 10`
      );
      result = await client.query(finalQueryByWatt, wattQueryParams);
    }
    return res.json({
      searchParams: {
        panelQty: qty,
        panelBubbleId: bubbleIdRaw,
        type: resolvedPackageType,
        systemPhase: requestedPhase ? parseInt(requestedPhase, 10) || null : null,
        inverterType: residentialInverterType
      },
      count: result.rowCount,
      packages: result.rows
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to lookup packages', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// API endpoint to explore product table and package.Panel relationship
router.get('/api/product-info', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const productSchemaQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product' ORDER BY ordinal_position;`;
    const productSchemaResult = await client.query(productSchemaQuery);
    const productDataQuery = 'SELECT * FROM product LIMIT 10';
    const productDataResult = await client.query(productDataQuery);
    const relationshipQuery = `
      SELECT p.id as linked_package, p.package_name, p.panel_qty, p.panel, pr.id as product_id, pr.solar_output_rating
      FROM package p
      LEFT JOIN product pr ON p.panel = pr.id
      WHERE p.active = true LIMIT 10;`;
    const relationshipResult = await client.query(relationshipQuery);
    res.json({ productSchema: productSchemaResult.rows, productSampleData: productDataResult.rows, packageProductRelationship: relationshipResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product information', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// READ-ONLY product schema
router.get('/readonly/schema/product', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const schemaQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product' ORDER BY ordinal_position;`;
    const schemaResult = await client.query(schemaQuery);
    res.json({ table: 'product', columns: schemaResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product schema', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// Get dropdown-friendly product options
router.get('/readonly/product/options', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const schemaQuery = `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product';`;
    const schemaResult = await client.query(schemaQuery);
    const cols = schemaResult.rows;
    const hasActive = cols.some(c => c.column_name === 'active' && c.data_type.includes('boolean'));
    const hasName = cols.some(c => c.column_name === 'name');
    const hasWatt = cols.some(c => c.column_name === 'solar_output_rating');
    const hasBubble = cols.some(c => c.column_name === 'bubble_id');

    if (!hasWatt) {
      return res.status(400).json({ error: 'solar_output_rating column not found', schemaColumns: cols });
    }

    const selectFields = [];
    if (hasBubble) selectFields.push('bubble_id');
    if (hasName) selectFields.push('name');
    if (hasWatt) selectFields.push('solar_output_rating');

    const query = `SELECT ${selectFields.join(', ')} FROM product WHERE solar_output_rating > 0 ${hasActive ? 'AND active = true' : ''} ORDER BY solar_output_rating DESC LIMIT 100;`;
    const result = await client.query(query);

    const options = result.rows.map(row => ({
      bubble_id: hasBubble ? row.bubble_id : null,
      label: hasName && row.name ? row.name : `${row.solar_output_rating}W`,
      value: row.solar_output_rating
    })).filter(opt => opt.bubble_id);

    res.json({ options });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product options', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// Return limited product rows for verification/testing
router.get('/readonly/product/sample', async (req, res) => {
  let client;
  try {
    let limit = parseInt(req.query.limit, 10) || 10;
    client = await pool.connect();
    const result = await client.query('SELECT * FROM product LIMIT $1', [limit]);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product sample', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// Debug endpoint to test panel filtering
router.get('/api/debug-panel-filter', async (req, res) => {
  let client;
  try {
    const { panelQty = 1 } = req.query;
    client = await pool.connect();
    const packageQuery = `SELECT * FROM package WHERE panel_qty = $1 AND active = true LIMIT 5`;
    const packageResult = await client.query(packageQuery, [parseInt(panelQty)]);
    res.json({ packages: packageResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Debug query failed', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// API endpoint to calculate bill breakdown based on input amount
router.get('/api/calculate-bill', async (req, res) => {
  let client;
  try {
    const inputAmount = parseFloat(req.query.amount);
    const historicalAfaRate = parseFloat(req.query.afaRate) || 0;
    if (!inputAmount || inputAmount <= 0) return res.status(400).json({ error: 'Invalid bill amount' });
    client = await tariffPool.connect();
    const tariff = await findClosestTariff(client, inputAmount, historicalAfaRate);
    if (!tariff) return res.status(404).json({ error: 'No tariff data found' });
    res.json({ tariff, inputAmount, afaRate: historicalAfaRate });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate bill', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// API endpoint for solar savings calculation
router.get('/api/solar-calculation', async (req, res) => {
  try {
    const result = await calculateSolarSavings(pool, tariffPool, req.query);
    res.json({
      ...result,
      billCycleModes: buildBillCycleModes(result)
    });
  } catch (err) {
    const validationMessages = [
      'Invalid bill amount',
      'Sun Peak Hour must be between 3.0 and 4.5',
      'Morning Usage must be between 1% and 100%',
      'SMP price must be between RM 0.19 and RM 0.2703',
      'Battery size must be 0, 16, 32, or 48 kWh'
    ];
    const status = validationMessages.includes(err.message) ? 400 : 500;
    res.status(status).json({ error: 'Failed to calculate solar savings', details: err.message });
  }
});

// API endpoint for EEI Optimizer calculation
router.get('/api/eei-optimizer/calculate', async (req, res) => {
  try {
    const result = await calculateEeiOptimizer(pool, tariffPool, req.query);
    res.json(result);
  } catch (err) {
    const validationMessages = [
      'Invalid bill amount',
      'Sun Peak Hour must be between 3.0 and 4.5',
      'Morning Offset must be between 1% and 100%',
      'Panel Rating must be greater than 0'
    ];
    const status = validationMessages.includes(err.message) ? 400 : 500;
    res.status(status).json({ error: 'Failed to calculate EEI optimizer', details: err.message });
  }
});

// Import the shared TNB pool
const tnbPool = require('../../../core/database/tnbPool');

// API endpoint for Commercial Bill Breakdown from external DB (By Amount)
router.get('/api/commercial/calculate-bill', async (req, res) => {
  let client;
  try {
    const billAmount = parseFloat(req.query.amount);
    if (!billAmount) return res.status(400).json({ error: 'Amount is required' });

    client = await tariffPool.connect();

    const query = `
      SELECT * FROM bill_simulation_lookup 
      WHERE tariff_group = 'LV_COMMERCIAL' AND total_bill <= $1 
      ORDER BY total_bill DESC 
      LIMIT 1
    `;
    const result = await client.query(query, [billAmount]);
    client.release();

    if (result.rows.length === 0) {
      const fallbackResult = await tariffPool.query(`SELECT * FROM bill_simulation_lookup WHERE tariff_group = 'LV_COMMERCIAL' ORDER BY total_bill ASC LIMIT 1`);
      return res.json({ tariff: fallbackResult.rows[0], matched: false });
    }

    res.json({ tariff: result.rows[0], matched: true });
  } catch (err) {
    console.error('TNB DB Error:', err);
    if (client) client.release();
    res.status(500).json({ error: 'External DB error', details: err.message });
  }
});

// API endpoint for Commercial Bill Lookup from external DB (By Usage)
router.get('/api/commercial/lookup-by-usage', async (req, res) => {
  let client;
  try {
    const usageKwh = parseFloat(req.query.usage);
    if (usageKwh === undefined) return res.status(400).json({ error: 'Usage is required' });

    client = await tariffPool.connect();

    const query = `
      SELECT * FROM bill_simulation_lookup 
      WHERE tariff_group = 'LV_COMMERCIAL' AND usage_kwh <= $1 
      ORDER BY usage_kwh DESC 
      LIMIT 1
    `;
    const result = await client.query(query, [Math.floor(usageKwh)]);
    client.release();

    if (result.rows.length === 0) {
      const fallbackResult = await tariffPool.query('SELECT * FROM bill_simulation_lookup WHERE tariff_group = \'LV_COMMERCIAL\' ORDER BY usage_kwh ASC LIMIT 1');
      if (fallbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'No tariff data found in database' });
      }
      return res.json({ tariff: fallbackResult.rows[0], matched: false });
    }

    res.json({ tariff: result.rows[0], matched: true });
  } catch (err) {
    console.error('TNB DB Error:', err);
    if (client) client.release();
    res.status(500).json({ error: 'External DB error', details: err.message });
  }
});

// API endpoint to get packages by type
router.get('/api/packages', async (req, res) => {
  let client;
  try {
    const { type } = req.query;
    if (!type) return res.status(400).json({ error: 'Type is required' });

    client = await pool.connect();
    let dbType = type === 'Residential' ? 'Residential' : 'Tariff B&D Low Voltage';

    const query = `
      SELECT p.id, p.bubble_id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active,
             pr.solar_output_rating
      FROM package p
      LEFT JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
      WHERE p.active = true AND p.type = $1
      ORDER BY p.price ASC
    `;

    const result = await client.query(query, [dbType]);
    res.json({ success: true, packages: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch packages', details: err.message });
  } finally {
    if (client) client.release();
  }
});

router.get('/api/all-data', async (req, res) => {
  let tariffClient, mainClient;
  try {
    tariffClient = await tariffPool.connect();
    mainClient = await pool.connect();
    
    const tariffs = await tariffClient.query(`
      SELECT
        usage_kwh,
        energy_charge AS usage_normal,
        network_charge AS network,
        capacity_charge AS capacity,
        sst_tax AS sst_normal,
        energy_efficiency_incentive AS eei,
        total_bill AS bill_total_normal,
        retail_charge AS retail,
        kwtbb_fund AS kwtbb_normal,
        fuel_adjustment
      FROM domestic_am_tariff
      ORDER BY usage_kwh ASC
    `);
    
    const packages = await mainClient.query(`
      SELECT p.id, p.bubble_id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special, p.max_discount, p.invoice_desc,
             pr.bubble_id as product_bubble_id, pr.solar_output_rating
      FROM package p
      JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
      WHERE p.active = true
    `);
    
    tariffClient.release();
    mainClient.release();
    res.json({ tariffs: tariffs.rows, packages: packages.rows });
  } catch (err) {
    console.error('[all-data] ERROR:', err);
    if (tariffClient) tariffClient.release();
    if (mainClient) mainClient.release();
    res.status(500).json({ error: 'Failed to fetch all data', details: err.message });
  }
});

module.exports = router;
