const express = require('express');
const pool = require('../../../core/database/pool');
const { findClosestTariff, calculateSolarSavings } = require('../services/solarCalculatorService');

const router = express.Router();

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
  try {
    const client = await pool.connect();
    const tablesQuery = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`;
    const tablesResult = await client.query(tablesQuery);

    const schema = {};
    for (const table of tablesResult.rows) {
      const columnsQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position;`;
      const columnsResult = await client.query(columnsQuery, [table.table_name]);
      schema[table.table_name] = columnsResult.rows;
    }
    client.release();
    res.json({ tables: tablesResult.rows.map(t => t.table_name), schema });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch schema', details: err.message });
  }
});

// API endpoint to get tnb_tariff_2025 data
router.get('/api/tnb-tariff', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM tnb_tariff_2025 LIMIT 10');
    client.release();
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch TNB tariff data', details: err.message });
  }
});

// API endpoint to explore package table schema and data
router.get('/api/package-info', async (req, res) => {
  try {
    const client = await pool.connect();
    const schemaQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'package' ORDER BY ordinal_position;`;
    const schemaResult = await client.query(schemaQuery);
    const dataQuery = 'SELECT * FROM package LIMIT 10';
    const dataResult = await client.query(dataQuery);
    client.release();
    res.json({ schema: schemaResult.rows, sampleData: dataResult.rows, totalRecords: dataResult.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch package information', details: err.message });
  }
});

// READ-ONLY lookup: verify package price by panel_qty and optional panel bubble_id
router.get('/readonly/package/lookup', async (req, res) => {
  try {
    const qtyRaw = req.query.panelQty;
    const bubbleIdRaw = req.query.panelBubbleId || null;
    if (!qtyRaw) return res.status(400).json({ error: 'panelQty is required' });
    const qty = parseInt(qtyRaw, 10);
    const client = await pool.connect();
    let result;
    if (bubbleIdRaw) {
      const queryByBubble = `
        SELECT p.id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special,
               pr.id as product_id, pr.bubble_id, pr.solar_output_rating
        FROM package p
        JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
        WHERE p.active = true AND (p.special IS FALSE OR p.special IS NULL) AND p.type = 'Residential' AND p.panel_qty = $1 AND pr.bubble_id = $2
        ORDER BY p.price ASC LIMIT 10`;
      result = await client.query(queryByBubble, [qty, bubbleIdRaw]);
    } else {
      const queryByWatt = `
        SELECT p.id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special,
               pr.id as product_id, pr.bubble_id, pr.solar_output_rating
        FROM package p
        JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
        WHERE p.active = true AND (p.special IS FALSE OR p.special IS NULL) AND p.type = 'Residential' AND p.panel_qty = $1 AND pr.solar_output_rating = $2
        ORDER BY p.price ASC LIMIT 10`;
      const wattRaw = req.query.panelType;
      const watt = wattRaw ? parseInt(wattRaw, 10) : null;
      result = await client.query(queryByWatt, [qty, watt]);
    }
    client.release();
    return res.json({ searchParams: { panelQty: qty, panelBubbleId: bubbleIdRaw }, count: result.rowCount, packages: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to lookup packages', details: err.message });
  }
});

// API endpoint to explore product table and package.Panel relationship
router.get('/api/product-info', async (req, res) => {
  try {
    const client = await pool.connect();
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
    client.release();
    res.json({ productSchema: productSchemaResult.rows, productSampleData: productDataResult.rows, packageProductRelationship: relationshipResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product information', details: err.message });
  }
});

// READ-ONLY product schema
router.get('/readonly/schema/product', async (req, res) => {
  try {
    const client = await pool.connect();
    const schemaQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product' ORDER BY ordinal_position;`;
    const schemaResult = await client.query(schemaQuery);
    client.release();
    res.json({ table: 'product', columns: schemaResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product schema', details: err.message });
  }
});

// Get dropdown-friendly product options
router.get('/readonly/product/options', async (req, res) => {
  try {
    const client = await pool.connect();
    const schemaQuery = `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product';`;
    const schemaResult = await client.query(schemaQuery);
    const cols = schemaResult.rows;
    const hasActive = cols.some(c => c.column_name === 'active' && c.data_type.includes('boolean'));
    const hasName = cols.some(c => c.column_name === 'name');
    const hasWatt = cols.some(c => c.column_name === 'solar_output_rating');
    const hasBubble = cols.some(c => c.column_name === 'bubble_id');

    if (!hasWatt) {
      client.release();
      return res.status(400).json({ error: 'solar_output_rating column not found', schemaColumns: cols });
    }

    const selectFields = [];
    if (hasBubble) selectFields.push('bubble_id');
    if (hasName) selectFields.push('name');
    if (hasWatt) selectFields.push('solar_output_rating');

    const query = `SELECT ${selectFields.join(', ')} FROM product WHERE solar_output_rating > 0 ${hasActive ? 'AND active = true' : ''} ORDER BY solar_output_rating DESC LIMIT 100;`;
    const result = await client.query(query);
    client.release();

    const options = result.rows.map(row => ({
      bubble_id: hasBubble ? row.bubble_id : null,
      label: hasName && row.name ? row.name : `${row.solar_output_rating}W`,
      value: row.solar_output_rating
    })).filter(opt => opt.bubble_id);

    res.json({ options });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product options', details: err.message });
  }
});

// Return limited product rows for verification/testing
router.get('/readonly/product/sample', async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10) || 10;
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM product LIMIT $1', [limit]);
    client.release();
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product sample', details: err.message });
  }
});

// Debug endpoint to test panel filtering
router.get('/api/debug-panel-filter', async (req, res) => {
  try {
    const { panelQty = 1 } = req.query;
    const client = await pool.connect();
    const packageQuery = `SELECT * FROM package WHERE panel_qty = $1 AND active = true LIMIT 5`;
    const packageResult = await client.query(packageQuery, [parseInt(panelQty)]);
    client.release();
    res.json({ packages: packageResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Debug query failed', details: err.message });
  }
});

// API endpoint to calculate bill breakdown based on input amount
router.get('/api/calculate-bill', async (req, res) => {
  let client;
  try {
    const inputAmount = parseFloat(req.query.amount);
    const historicalAfaRate = parseFloat(req.query.afaRate) || 0;
    if (!inputAmount || inputAmount <= 0) return res.status(400).json({ error: 'Invalid bill amount' });
    client = await pool.connect();
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
    const result = await calculateSolarSavings(pool, req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate solar savings', details: err.message });
  }
});

router.get('/api/all-data', async (req, res) => {
  try {
    const client = await pool.connect();
    const tariffs = await client.query('SELECT usage_kwh, usage_normal, network, capacity, sst_normal, eei, bill_total_normal, retail, kwtbb_normal FROM tnb_tariff_2025 ORDER BY usage_kwh ASC');
    const packages = await client.query(`
      SELECT p.id, p.bubble_id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special, p.max_discount, p.invoice_desc,
             pr.bubble_id as product_bubble_id, pr.solar_output_rating
      FROM package p
      JOIN product pr ON (CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT) OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT))
      WHERE p.active = true AND p.type = 'Residential'
    `);
    client.release();
    res.json({ tariffs: tariffs.rows, packages: packages.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all data', details: err.message });
  }
});

module.exports = router;
