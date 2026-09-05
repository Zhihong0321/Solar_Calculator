const express = require('express');
const pool = require('../../../core/database/pool');
const tariffPool = require('../../../core/database/tariffPool');
const { findClosestTariff, calculateSolarSavings } = require('../services/solarCalculatorService');
const { calculateEeiOptimizer } = require('../services/eeiOptimizerService');
const { buildBillCycleModes } = require('../services/billCycleModeService');
const { lookupBestPackage } = require('../services/packageLookupService');
const { writeActivity } = require('../../../core/activityLog/writeActivity');
const { attachAuthenticatedUser } = require('../../../core/middleware/auth');

const router = express.Router();

const AFA_MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatAfaLabel(year, month, rateValue) {
  const sen = rateValue * 100;
  const sign = sen >= 0 ? '+' : '';
  return `${AFA_MONTH_LABELS[month - 1]} ${year} (${sign}${sen.toFixed(2)} sen)`;
}

// Guards POST /api/afa-rates. Unset AFA_UPDATE_PASSKEY (the default) = route
// refuses every request, same fail-closed pattern as UploadBackfill's key check.
function requireAfaPasskey(req, res, next) {
  const configured = process.env.AFA_UPDATE_PASSKEY;
  if (!configured) {
    return res.status(404).json({ success: false, error: 'not found' });
  }
  if (req.headers['x-afa-passkey'] !== configured) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  return next();
}

// Public: AFA rate options for the "AFA Bill Month" dropdown on the solar calculator
router.get('/api/afa-rates', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT period_year, period_month, rate_value FROM afa_rates ORDER BY period_year DESC, period_month DESC LIMIT 60`
    );
    const options = result.rows.map((row) => ({
      value: Number(row.rate_value),
      label: formatAfaLabel(row.period_year, row.period_month, Number(row.rate_value)),
      year: row.period_year,
      month: row.period_month
    }));
    res.json({ options, current: options[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch AFA rates', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// Protected: add or update a single month's AFA rate. Guarded by AFA_UPDATE_PASSKEY,
// set as a Railway variable and sent back as the x-afa-passkey header.
router.post('/api/afa-rates', requireAfaPasskey, async (req, res) => {
  let client;
  try {
    const year = parseInt(req.body?.year, 10);
    const month = parseInt(req.body?.month, 10);
    const rateValue = parseFloat(req.body?.rateValue);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be a valid integer, e.g. 2026' });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be an integer between 1 and 12' });
    }
    if (!Number.isFinite(rateValue)) {
      return res.status(400).json({ error: 'rateValue must be a number, e.g. 0.0376 for +3.76 sen' });
    }

    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO afa_rates (period_year, period_month, rate_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (period_year, period_month)
       DO UPDATE SET rate_value = EXCLUDED.rate_value, updated_at = NOW()
       RETURNING period_year, period_month, rate_value`,
      [year, month, rateValue]
    );
    const row = result.rows[0];
    res.json({
      success: true,
      rate: {
        value: Number(row.rate_value),
        label: formatAfaLabel(row.period_year, row.period_month, Number(row.rate_value)),
        year: row.period_year,
        month: row.period_month
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update AFA rate', details: err.message });
  } finally {
    if (client) client.release();
  }
});

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
    client = await pool.connect();
    const lookup = await lookupBestPackage(client, {
      panelQty: req.query.panelQty,
      panelBubbleId: req.query.panelBubbleId || null,
      panelType: req.query.panelType,
      type: req.query.type,
      systemPhase: req.query.systemPhase,
      inverterType: req.query.inverterType
    });

    return res.json({
      searchParams: {
        panelQty: parseInt(req.query.panelQty, 10),
        panelBubbleId: req.query.panelBubbleId || null,
        type: lookup.resolvedPackageType,
        systemPhase: lookup.systemPhase,
        inverterType: lookup.residentialInverterType
      },
      count: lookup.package ? 1 : 0,
      package: lookup.package,
      packages: lookup.package ? [lookup.package] : []
    });
  } catch (err) {
    const statusCode = err.message === 'panelQty is required' ? 400 : 500;
    return res.status(statusCode).json({ error: 'Failed to lookup packages', details: err.message });
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
router.get('/api/solar-calculation', attachAuthenticatedUser, async (req, res) => {
  try {
    const result = await calculateSolarSavings(pool, tariffPool, req.query);
    res.json({
      ...result,
      billCycleModes: buildBillCycleModes(result)
    });

    // Slider-driven recalculations pass logActivity=0 so dragging a slider
    // does not burst the activity_log with one row per tick.
    if (req.query.logActivity !== '0') {
      writeActivity({
        req,
        action: 'calculate',
        entityType: 'residential_roi_calculation',
        description: 'generated a residential solar ROI calculation',
        metadata: {
          billAmount: req.query.amount,
          sunPeakHour: req.query.sunPeakHour,
          batterySize: req.query.batterySize,
          monthlySavings: result.monthlySavings
        }
      });
    }
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
router.get('/api/commercial/lookup-by-usage', attachAuthenticatedUser, async (req, res) => {
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

    // Slider-driven recalculations pass logActivity=0 so dragging a slider
    // does not burst the activity_log with one row per tick.
    const shouldLogActivity = req.query.logActivity !== '0';

    if (result.rows.length === 0) {
      const fallbackResult = await tariffPool.query('SELECT * FROM bill_simulation_lookup WHERE tariff_group = \'LV_COMMERCIAL\' ORDER BY usage_kwh ASC LIMIT 1');
      if (fallbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'No tariff data found in database' });
      }
      res.json({ tariff: fallbackResult.rows[0], matched: false });
      if (shouldLogActivity) {
        writeActivity({
          req,
          action: 'calculate',
          entityType: 'commercial_roi_lookup',
          description: `ran a commercial bill lookup (usage ${usageKwh} kWh)`,
          metadata: { usageKwh, matched: false }
        });
      }
      return;
    }

    res.json({ tariff: result.rows[0], matched: true });
    if (shouldLogActivity) {
      writeActivity({
        req,
        action: 'calculate',
        entityType: 'commercial_roi_lookup',
        description: `ran a commercial bill lookup (usage ${usageKwh} kWh)`,
        metadata: { usageKwh, matched: true }
      });
    }
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
      SELECT p.id, p.bubble_id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special, p.max_discount, p.nett_price, p.invoice_desc,
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
