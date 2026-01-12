const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true
}));

// Add headers for PDF generation compatibility
app.use((req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.use(cookieParser());
app.use(express.json());

// Import invoice routes
const invoiceRoutes = require('./routes/invoiceRoutes');
const customerRoutes = require('./routes/customerRoutes');

// Invoice routes (protected routes require authentication via requireAuth middleware)
app.use(invoiceRoutes);
app.use(customerRoutes);

// Static files (public routes)
app.use(express.static('public'));

// Portable proposal static files (serve images)
app.use('/proposal', express.static('portable-proposal'));

// Database connection
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

// Services
const { findClosestTariff, calculateSolarSavings } = require('./services/solarCalculatorService');

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to test database connection
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    res.json({ status: 'Database connected successfully', timestamp: new Date() });
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

// API endpoint to serve environment configuration to frontend
app.get('/api/config', (req, res) => {
  // Return local invoice creation URL
  const protocol = req.protocol;
  const host = req.get('host');
  res.json({
    invoiceBaseUrl: `${protocol}://${host}/create-invoice`
  });
});

// API endpoint to explore database schema and tables
app.get('/api/schema', async (req, res) => {
  try {
    const client = await pool.connect();

    // Get all tables
    const tablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    const tablesResult = await client.query(tablesQuery);

    // Get column info for each table
    const schema = {};
    for (const table of tablesResult.rows) {
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `;
      const columnsResult = await client.query(columnsQuery, [table.table_name]);
      schema[table.table_name] = columnsResult.rows;
    }

    client.release();
    res.json({ tables: tablesResult.rows.map(t => t.table_name), schema });
  } catch (err) {
    console.error('Schema query error:', err);
    res.status(500).json({ error: 'Failed to fetch schema', details: err.message });
  }
});

// API endpoint to get tnb_tariff_2025 data
app.get('/api/tnb-tariff', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM tnb_tariff_2025 LIMIT 10');
    client.release();
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    console.error('TNB tariff query error:', err);
    res.status(500).json({ error: 'Failed to fetch TNB tariff data', details: err.message });
  }
});

// API endpoint to explore package table schema and data
app.get('/api/package-info', async (req, res) => {
  try {
    const client = await pool.connect();

    // Get package table structure
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'package'
      ORDER BY ordinal_position;
    `;
    const schemaResult = await client.query(schemaQuery);

    // Get sample package data
    const dataQuery = 'SELECT * FROM package LIMIT 10';
    const dataResult = await client.query(dataQuery);

    client.release();
    res.json({
      schema: schemaResult.rows,
      sampleData: dataResult.rows,
      totalRecords: dataResult.rowCount
    });
  } catch (err) {
    console.error('Package info query error:', err);
    res.status(500).json({ error: 'Failed to fetch package information', details: err.message });
  }
});

// API endpoint to explore product table and package.Panel relationship
app.get('/api/product-info', async (req, res) => {
  try {
    const client = await pool.connect();

    // Get product table structure
    const productSchemaQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product'
      ORDER BY ordinal_position;
    `;
    const productSchemaResult = await client.query(productSchemaQuery);

    // Get sample product data
    const productDataQuery = 'SELECT * FROM product LIMIT 10';
    const productDataResult = await client.query(productDataQuery);

    // Test the relationship between package and product
    const relationshipQuery = `
      SELECT
        p.id as package_id,
        p.package_name,
        p.panel_qty,
        p.panel,
        pr.id as product_id,
        pr.solar_output_rating
      FROM package p
      LEFT JOIN product pr ON p.panel = pr.id
      WHERE p.active = true
      LIMIT 10;
    `;
    const relationshipResult = await client.query(relationshipQuery);

    client.release();
    res.json({
      productSchema: productSchemaResult.rows,
      productSampleData: productDataResult.rows,
      packageProductRelationship: relationshipResult.rows
    });
  } catch (err) {
    console.error('Product info query error:', err);
    res.status(500).json({ error: 'Failed to fetch product information', details: err.message });
  }
});

// READ-ONLY endpoints for schema and sample data investigation (safe for Railway)
// These endpoints do not mutate data and are intended to confirm actual structures
// and provide dropdown-friendly product options without assumptions.

// Get only the product table schema from information_schema
app.get('/readonly/schema/product', async (req, res) => {
  try {
    const client = await pool.connect();
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product'
      ORDER BY ordinal_position;
    `;
    const schemaResult = await client.query(schemaQuery);
    client.release();
    res.json({
      table: 'product',
      columns: schemaResult.rows
    });
  } catch (err) {
    console.error('Readonly product schema error:', err);
    res.status(500).json({ error: 'Failed to fetch product schema', details: err.message });
  }
});

// Get dropdown-friendly product options
// Label: product.name; Value: product.solar_output_rating (numeric)
// Filters: solar_output_rating > 0; active = true IF the column exists as boolean
app.get('/readonly/product/options', async (req, res) => {
  try {
    const client = await pool.connect();

    // Inspect product schema to build safe query dynamically
    const schemaQuery = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product';
    `;
    const schemaResult = await client.query(schemaQuery);
    const cols = schemaResult.rows;
    const hasActive = cols.some(c => c.column_name === 'active' && c.data_type.includes('boolean'));
    const hasName = cols.some(c => c.column_name === 'name');
    const hasWatt = cols.some(c => c.column_name === 'solar_output_rating');
    const hasBubble = cols.some(c => c.column_name === 'bubble_id');

    if (!hasWatt) {
      client.release();
      return res.status(400).json({
        error: 'solar_output_rating column not found on product table',
        schemaColumns: cols
      });
    }

    // Build query safely
    const selectFields = [];
    if (hasBubble) selectFields.push('bubble_id');
    if (hasName) selectFields.push('name');
    if (hasWatt) selectFields.push('solar_output_rating');

    const whereClauses = ['solar_output_rating > 0'];
    if (hasActive) {
      whereClauses.push('active = true');
    }

    const query = `
      SELECT ${selectFields.join(', ')}
      FROM product
      ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
      ORDER BY ${hasWatt ? 'solar_output_rating DESC' : (hasName ? 'name ASC' : (hasBubble ? 'bubble_id ASC' : '1'))}
      LIMIT 100;
    `;

    const result = await client.query(query);
    client.release();

    // Map to dropdown options
    const options = result.rows.map(row => ({
      bubble_id: hasBubble ? row.bubble_id : null,
      label: hasName && row.name ? row.name : `${row.solar_output_rating}W`,
      value: row.solar_output_rating
    })).filter(opt => opt.bubble_id); // exclude rows without bubble_id

    res.json({
      schemaFlags: { hasActive, hasName, hasWatt, hasBubble },
      recordCount: result.rowCount,
      options
    });
  } catch (err) {
    console.error('Readonly product options error:', err);
    res.status(500).json({ error: 'Failed to fetch product options', details: err.message });
  }
});

// Return limited product rows for verification/testing
app.get('/readonly/product/sample', async (req, res) => {
  try {
    const limitRaw = req.query.limit;
    let limit = parseInt(limitRaw, 10);
    if (Number.isNaN(limit) || limit <= 0 || limit > 100) {
      limit = 10;
    }

    const client = await pool.connect();
    const result = await client.query('SELECT * FROM product LIMIT $1', [limit]);
    client.release();
    res.json({ data: result.rows, count: result.rowCount, limit });
  } catch (err) {
    console.error('Readonly product sample error:', err);
    res.status(500).json({ error: 'Failed to fetch product sample', details: err.message });
  }
});

// Debug endpoint to test panel filtering
app.get('/api/debug-panel-filter', async (req, res) => {
  try {
    const { panelQty = 1, panelType = 620 } = req.query;
    const client = await pool.connect();

    // First, check basic package data
    const packageQuery = `SELECT * FROM package WHERE panel_qty = $1 AND active = true LIMIT 5`;
    const packageResult = await client.query(packageQuery, [parseInt(panelQty)]);

    // Check if package.panel values exist
    const panelCheckQuery = `SELECT DISTINCT panel FROM package WHERE panel IS NOT NULL LIMIT 10`;
    const panelCheckResult = await client.query(panelCheckQuery);

    // Check product table
    const productQuery = `SELECT id, solar_output_rating FROM product LIMIT 10`;
    const productResult = await client.query(productQuery);

    // Try the JOIN carefully
    let joinResult = { error: 'Not attempted' };
    try {
      const joinQuery = `
        SELECT p.id, p.panel_qty, p.panel, pr.id as product_id, pr.solar_output_rating
        FROM package p
        LEFT JOIN product pr ON p.panel = pr.id
        WHERE p.panel_qty = $1 AND p.active = true
        LIMIT 3
      `;
      const joinQueryResult = await client.query(joinQuery, [parseInt(panelQty)]);
      joinResult = joinQueryResult.rows;
    } catch (joinErr) {
      joinResult = { error: joinErr.message };
    }

    client.release();
    res.json({
      packages: packageResult.rows,
      panelValues: panelCheckResult.rows,
      products: productResult.rows,
      joinTest: joinResult,
      searchParams: { panelQty: parseInt(panelQty), panelType: panelType.toString() }
    });
  } catch (err) {
    console.error('Debug panel filter error:', err);
    res.status(500).json({ error: 'Debug query failed', details: err.message });
  }
});

// API endpoint to calculate bill breakdown based on input amount
app.get('/api/calculate-bill', async (req, res) => {
  let client;
  try {
    const inputAmount = parseFloat(req.query.amount);
    const historicalAfaRate = parseFloat(req.query.afaRate) || 0;

    if (!inputAmount || inputAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bill amount provided' });
    }

    client = await pool.connect();
    const tariff = await findClosestTariff(client, inputAmount, historicalAfaRate);

    if (!tariff) {
      return res.status(404).json({ error: 'No tariff data found in database' });
    }

    res.json({
      tariff: tariff,
      inputAmount: inputAmount,
      afaRate: historicalAfaRate,
      message: 'Found closest matching tariff'
    });

  } catch (err) {
    console.error('Calculate bill error:', err);
    res.status(500).json({ 
      error: 'Failed to calculate bill breakdown', 
      details: err.message,
      code: err.code
    });
  } finally {
    if (client) client.release();
  }
});

// API endpoint for solar savings calculation
app.get('/api/solar-calculation', async (req, res) => {
  try {
    const result = await calculateSolarSavings(pool, req.query);
    res.json(result);
  } catch (err) {
    console.error('Solar calculation error:', err);
    const status = err.message.includes('Invalid') || err.message.includes('must be') ? 400 : 500;
    res.status(status).json({ error: 'Failed to calculate solar savings', details: err.message });
  }
});

app.get('/api/all-data', async (req, res) => {
  try {
    const client = await pool.connect();
    const tariffs = await client.query('SELECT usage_kwh, usage_normal, network, capacity, sst_normal, eei, bill_total_normal, retail, kwtbb_normal FROM tnb_tariff_2025 ORDER BY usage_kwh ASC');
    const packages = await client.query(`
      SELECT p.id, p.bubble_id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special, p.max_discount, p.invoice_desc,
             pr.bubble_id as product_bubble_id, pr.solar_output_rating
      FROM package p
      JOIN product pr ON (
        CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
        OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
      )
      WHERE p.active = true AND p.type = 'Residential'
    `);
    client.release();
    res.json({
      tariffs: tariffs.rows,
      packages: packages.rows
    });
  } catch (err) {
    console.error('All data fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch all data', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Readonly lookup: verify package price by panel_qty and optional panel bubble_id
app.get('/readonly/package/lookup', async (req, res) => {
  try {
    const qtyRaw = req.query.panelQty;
    const bubbleIdRaw = req.query.panelBubbleId || null;

    if (!qtyRaw) {
      return res.status(400).json({ error: 'panelQty is required' });
    }
    const qty = parseInt(qtyRaw, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'panelQty must be a positive integer' });
    }

    const client = await pool.connect();
    let result;
    if (bubbleIdRaw) {
      const queryByBubble = `
        SELECT p.id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special,
               pr.id as product_id, pr.bubble_id, pr.solar_output_rating
        FROM package p
        JOIN product pr ON (
          CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
          OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
        )
        WHERE p.active = true
          AND (p.special IS FALSE OR p.special IS NULL)
          AND p.type = 'Residential'
          AND p.panel_qty = $1
          AND pr.bubble_id = $2
        ORDER BY p.price ASC
        LIMIT 10
      `;
      result = await client.query(queryByBubble, [qty, bubbleIdRaw]);
    } else {
      const queryByWatt = `
        SELECT p.id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special,
               pr.id as product_id, pr.bubble_id, pr.solar_output_rating
        FROM package p
        JOIN product pr ON (
          CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
          OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
        )
        WHERE p.active = true
          AND (p.special IS FALSE OR p.special IS NULL)
          AND p.type = 'Residential'
          AND p.panel_qty = $1
          AND pr.solar_output_rating = $2
        ORDER BY p.price ASC
        LIMIT 10
      `;
      const wattRaw = req.query.panelType;
      const watt = wattRaw ? parseInt(wattRaw, 10) : null;
      result = await client.query(queryByWatt, [qty, watt]);
    }
    client.release();

    return res.json({
      searchParams: { panelQty: qty, panelBubbleId: bubbleIdRaw },
      count: result.rowCount,
      packages: result.rows
    });
  } catch (err) {
    console.error('Readonly package lookup error:', err);
    return res.status(500).json({ error: 'Failed to lookup packages', details: err.message });
  }
});