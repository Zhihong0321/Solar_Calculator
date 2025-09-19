const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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

// Debug endpoint to test panel filtering
app.get('/api/debug-panel-filter', async (req, res) => {
  try {
    const { panelQty = 1, panelType = 620 } = req.query;
    const client = await pool.connect();

    // Test the exact query that's failing
    const debugQuery = `
      SELECT p.*, pr.solar_output_rating, pr.solar_output_rating AS rating_type
      FROM package p
      JOIN product pr ON p.panel = pr.id
      WHERE p.panel_qty = $1
        AND p.active = true
      ORDER BY p.price ASC
      LIMIT 5
    `;
    const debugResult = await client.query(debugQuery, [parseInt(panelQty)]);

    // Also check what solar_output_rating values exist
    const ratingQuery = `
      SELECT DISTINCT solar_output_rating, pg_typeof(solar_output_rating) as data_type
      FROM product
      WHERE solar_output_rating IS NOT NULL
      ORDER BY solar_output_rating
    `;
    const ratingResult = await client.query(ratingQuery);

    client.release();
    res.json({
      testQuery: debugResult.rows,
      availableRatings: ratingResult.rows,
      searchParams: { panelQty: parseInt(panelQty), panelType: panelType.toString() }
    });
  } catch (err) {
    console.error('Debug panel filter error:', err);
    res.status(500).json({ error: 'Debug query failed', details: err.message });
  }
});

// API endpoint to calculate bill breakdown based on input amount
app.get('/api/calculate-bill', async (req, res) => {
  try {
    const inputAmount = parseFloat(req.query.amount);

    if (!inputAmount || inputAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bill amount provided' });
    }

    const client = await pool.connect();

    // Find the closest tariff record with bill_total_normal <= inputAmount
    // Order by bill_total_normal DESC to get the highest value that's still <= input
    const query = `
      SELECT * FROM tnb_tariff_2025
      WHERE bill_total_normal <= $1
      ORDER BY bill_total_normal DESC
      LIMIT 1
    `;

    const result = await client.query(query, [inputAmount]);

    if (result.rows.length === 0) {
      // If no record found (input is lower than all records), get the lowest record
      const fallbackQuery = `
        SELECT * FROM tnb_tariff_2025
        ORDER BY bill_total_normal ASC
        LIMIT 1
      `;
      const fallbackResult = await client.query(fallbackQuery);

      if (fallbackResult.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'No tariff data found in database' });
      }

      client.release();
      return res.json({
        tariff: fallbackResult.rows[0],
        inputAmount: inputAmount,
        message: 'Used lowest available tariff (input amount below all records)'
      });
    }

    client.release();
    res.json({
      tariff: result.rows[0],
      inputAmount: inputAmount,
      message: 'Found closest matching tariff'
    });

  } catch (err) {
    console.error('Calculate bill error:', err);
    res.status(500).json({ error: 'Failed to calculate bill breakdown', details: err.message });
  }
});

// API endpoint for solar savings calculation
app.get('/api/solar-calculation', async (req, res) => {
  try {
    const {
      amount,
      sunPeakHour,
      morningUsage,
      panelType,
      smpPrice,
      below19Discount,
      above19Discount
    } = req.query;

    // Validate inputs
    const billAmount = parseFloat(amount);
    const peakHour = parseFloat(sunPeakHour);
    const morningPercent = parseFloat(morningUsage);
    const panelWattage = parseInt(panelType) || 620; // Default to 620W
    const smp = parseFloat(smpPrice);
    const discount19Below = parseFloat(below19Discount) || 0;
    const discount19Above = parseFloat(above19Discount) || 0;

    if (!billAmount || billAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bill amount' });
    }

    if (!peakHour || peakHour < 3.0 || peakHour > 4.5) {
      return res.status(400).json({ error: 'Sun Peak Hour must be between 3.0 and 4.5' });
    }

    if (!morningPercent || morningPercent < 1 || morningPercent > 100) {
      return res.status(400).json({ error: 'Morning Usage must be between 1% and 100%' });
    }

    if (!smp || smp < 0.19 || smp > 0.27) {
      return res.status(400).json({ error: 'SMP price must be between RM 0.19 and RM 0.27' });
    }

    // First get the TNB tariff data for the bill amount
    const client = await pool.connect();
    const query = `
      SELECT * FROM tnb_tariff_2025
      WHERE bill_total_normal <= $1
      ORDER BY bill_total_normal DESC
      LIMIT 1
    `;
    const result = await client.query(query, [billAmount]);

    if (result.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'No tariff data found for calculation' });
    }

    const tariff = result.rows[0];
    const monthlyUsageKwh = tariff.usage_kwh || 0;

    // NEW PANEL RECOMMENDATION FORMULA
    // Formula: usage_kwh / sun_peak_hour / 30 / 0.62 = X, then floor(X)
    const recommendedPanels = Math.floor(monthlyUsageKwh / peakHour / 30 / 0.62);

    // Ensure minimum of 1 panel
    const numberOfPanels = Math.max(1, recommendedPanels);

    // Search for package with matching panel_qty, panel type, and lowest price
    // Temporary: Remove panel type filter to debug
    const packageQuery = `
      SELECT p.*, pr.solar_output_rating
      FROM package p
      JOIN product pr ON p.panel = pr.id
      WHERE p.panel_qty = $1
        AND p.active = true
      ORDER BY p.price ASC
      LIMIT 1
    `;
    const packageResult = await client.query(packageQuery, [numberOfPanels]);

    // Filter by panel type in JavaScript if needed
    let selectedPackage = null;
    if (packageResult.rows.length > 0) {
      const matchingPackage = packageResult.rows.find(pkg =>
        pkg.solar_output_rating == panelWattage.toString() ||
        pkg.solar_output_rating == panelWattage ||
        parseInt(pkg.solar_output_rating) == panelWattage
      );
      selectedPackage = matchingPackage || packageResult.rows[0]; // Fallback to first package
    }

    client.release();

    // Calculate solar generation using selected panel wattage
    const panelWatts = panelWattage;
    const dailySolarGeneration = (numberOfPanels * panelWatts * peakHour) / 1000; // kWh per day
    const monthlySolarGeneration = dailySolarGeneration * 30;

    // Calculate morning vs afternoon usage split
    const morningUsageKwh = (monthlyUsageKwh * morningPercent) / 100;
    const afternoonUsageKwh = monthlyUsageKwh - morningUsageKwh;

    // Solar generation typically happens during afternoon
    const solarDirectUsage = Math.min(afternoonUsageKwh, monthlySolarGeneration);
    const excessSolar = Math.max(0, monthlySolarGeneration - afternoonUsageKwh);
    const remainingBillUsage = monthlyUsageKwh - solarDirectUsage;

    // Calculate savings
    const avgTariffRate = tariff.bill_total_normal / monthlyUsageKwh; // RM per kWh
    const directUsageSavings = solarDirectUsage * avgTariffRate;
    const exportEarnings = excessSolar * smp;
    const totalMonthlySavings = directUsageSavings + exportEarnings;

    // Calculate system cost (rough estimate: RM 4.50 per watt)
    const costPerWatt = 4.50;
    const systemCostBeforeDiscount = numberOfPanels * panelWatts * costPerWatt;

    // Apply discount based on panel count
    const applicableDiscount = numberOfPanels >= 19 ? discount19Above : discount19Below;
    const finalSystemCost = systemCostBeforeDiscount - applicableDiscount;

    // Calculate payback period
    const paybackPeriod = totalMonthlySavings > 0 ?
      (finalSystemCost / (totalMonthlySavings * 12)).toFixed(1) : 'N/A';

    res.json({
      config: {
        sunPeakHour: peakHour,
        morningUsage: morningPercent,
        panelType: panelWattage,
        smpPrice: smp
      },
      // PANEL RECOMMENDATION RESULTS
      recommendedPanels: numberOfPanels,
      selectedPackage: selectedPackage ? {
        packageName: selectedPackage.package_name,
        panelQty: selectedPackage.panel_qty,
        price: selectedPackage.price,
        panelWattage: selectedPackage.solar_output_rating,
        id: selectedPackage.id
      } : null,

      solarConfig: `${numberOfPanels} x ${panelWattage}W panels (${(numberOfPanels * panelWatts / 1000).toFixed(1)} kW system)`,
      monthlySavings: totalMonthlySavings.toFixed(2),
      systemCostBeforeDiscount: systemCostBeforeDiscount.toFixed(2),
      discount: applicableDiscount.toFixed(2),
      finalSystemCost: finalSystemCost.toFixed(2),
      paybackPeriod: paybackPeriod,
      details: {
        monthlyUsageKwh: monthlyUsageKwh,
        monthlySolarGeneration: monthlySolarGeneration.toFixed(2),
        directUsageSavings: directUsageSavings.toFixed(2),
        exportEarnings: exportEarnings.toFixed(2),
        excessSolar: excessSolar.toFixed(2)
      }
    });

  } catch (err) {
    console.error('Solar calculation error:', err);
    res.status(500).json({ error: 'Failed to calculate solar savings', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});