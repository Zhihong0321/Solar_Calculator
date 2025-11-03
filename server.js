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
    const overridePanelsRaw = req.query.overridePanels;
    let overridePanels = null;
    if (overridePanelsRaw !== undefined) {
      const parsedOverride = parseInt(overridePanelsRaw, 10);
      if (!Number.isNaN(parsedOverride) && parsedOverride >= 1) {
        overridePanels = parsedOverride;
      }
    }

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
    const recommendedPanelsRaw = Math.floor(monthlyUsageKwh / peakHour / 30 / 0.62);

    // Ensure minimum of 1 panel for recommendation
    const recommendedPanels = Math.max(1, recommendedPanelsRaw);
    const actualPanelQty = overridePanels !== null ? overridePanels : recommendedPanels;

    // Search for Residential package with matching panel_qty that is active, non-special, and lowest price
    const packageQuery = `
      SELECT * FROM package
      WHERE panel_qty = $1 AND active = true AND special = false AND type = $2
      ORDER BY price ASC
      LIMIT 1
    `;
    const packageResult = await client.query(packageQuery, [actualPanelQty, 'Residential']);

    let selectedPackage = null;
    if (packageResult.rows.length > 0) {
      selectedPackage = packageResult.rows[0];
    }

    // Calculate solar generation using selected panel wattage
    const panelWatts = panelWattage;
    const dailySolarGeneration = (actualPanelQty * panelWatts * peakHour) / 1000; // kWh per day
    const monthlySolarGeneration = dailySolarGeneration * 30;

    // Calculate morning usage split
    const morningUsageKwh = (monthlyUsageKwh * morningPercent) / 100;

    const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);
    const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption);

    // Calculate the post-solar bill using the reduced usage (excluding export)
    let afterTariff = null;
    const afterTariffQuery = `
      SELECT * FROM tnb_tariff_2025
      WHERE usage_kwh <= $1
      ORDER BY usage_kwh DESC
      LIMIT 1
    `;

    if (netUsageKwh === 0) {
      const lowestUsageQuery = `
        SELECT * FROM tnb_tariff_2025
        ORDER BY usage_kwh ASC
        LIMIT 1
      `;
      const lowestUsageResult = await client.query(lowestUsageQuery);
      if (lowestUsageResult.rows.length > 0) {
        afterTariff = lowestUsageResult.rows[0];
      }
    } else {
      const afterTariffResult = await client.query(afterTariffQuery, [netUsageKwh]);
      if (afterTariffResult.rows.length > 0) {
        afterTariff = afterTariffResult.rows[0];
      } else {
        const fallbackAfterQuery = `
          SELECT * FROM tnb_tariff_2025
          ORDER BY usage_kwh ASC
          LIMIT 1
        `;
        const fallbackAfterResult = await client.query(fallbackAfterQuery);
        if (fallbackAfterResult.rows.length > 0) {
          afterTariff = fallbackAfterResult.rows[0];
        }
      }
    }

    client.release();

    // NEW SAVING FORMULA
    // 1. Morning usage saving: morning_kwh * RM 0.4869
    const morningUsageRate = 0.4869; // RM per kWh for morning usage
    const morningSaving = morningUsageKwh * morningUsageRate;

    // 2. Export calculation: total solar generation - morning_kwh, then multiply by export rate
    const exportKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh);
    const exportRate = smp; // RM per kWh for export (SMP price)
    const exportSaving = exportKwh * exportRate;

    // 3. Total saving = morning saving + export saving
    const totalMonthlySavings = morningSaving + exportSaving;

    const billBefore = tariff.bill_total_normal !== null ? parseFloat(tariff.bill_total_normal) : 0;
    const afterBill = afterTariff && afterTariff.bill_total_normal !== null
      ? parseFloat(afterTariff.bill_total_normal)
      : null;
    const afterUsageMatched = afterTariff && afterTariff.usage_kwh !== null
      ? parseFloat(afterTariff.usage_kwh)
      : null;

    const billReduction = afterBill !== null ? Math.max(0, billBefore - afterBill) : morningSaving;

    // Use actual package price if available, otherwise fallback to calculation
    let systemCostBeforeDiscount = null;
    let finalSystemCost = null;
    let discountAmount = null;
    let paybackPeriod = null;

    // Calculate discount based on panel count (used when a package is available)
    const applicableDiscount = actualPanelQty >= 19 ? discount19Above : discount19Below;

    if (selectedPackage && selectedPackage.price) {
      // Use actual package price from database
      systemCostBeforeDiscount = parseFloat(selectedPackage.price);
      discountAmount = applicableDiscount;
      finalSystemCost = systemCostBeforeDiscount - discountAmount;

      // Calculate payback period only when system cost is available
      if (totalMonthlySavings > 0) {
        paybackPeriod = (finalSystemCost / (totalMonthlySavings * 12)).toFixed(1);
      } else {
        paybackPeriod = 'N/A';
      }
    }

    // Generate 24-hour electricity usage pattern
    const dailyUsageKwh = monthlyUsageKwh / 30;
    const electricityUsagePattern = [];
    for (let hour = 0; hour < 24; hour++) {
      let usageMultiplier;

      // Human activity pattern - higher usage in morning and evening
      if (hour >= 6 && hour <= 9) {
        // Morning peak (considering morning usage %)
        usageMultiplier = 1.8 * (morningPercent / 100);
      } else if (hour >= 18 && hour <= 22) {
        // Evening peak
        usageMultiplier = 2.2;
      } else if (hour >= 10 && hour <= 17) {
        // Day time (lower if high morning usage)
        usageMultiplier = 0.8 * (1 - (morningPercent / 100) * 0.3);
      } else {
        // Night time
        usageMultiplier = 0.3;
      }

      electricityUsagePattern.push({
        hour: hour,
        usage: (dailyUsageKwh * usageMultiplier / 10).toFixed(3) // Divide by 10 to normalize
      });
    }

    // Generate 24-hour solar generation pattern
    const solarGenerationPattern = [];

    for (let hour = 0; hour < 24; hour++) {
      let generationMultiplier = 0;

      // Solar generation follows bell curve around peak sun hours
      const sunriseHour = 7;
      const sunsetHour = 19;
      const peakHour = 12; // Noon

      if (hour >= sunriseHour && hour <= sunsetHour) {
        // Bell curve calculation
        const hoursFromPeak = Math.abs(hour - peakHour);
        const maxHoursFromPeak = 5; // 5 hours from peak (7am to 7pm range)
        generationMultiplier = Math.cos((hoursFromPeak / maxHoursFromPeak) * (Math.PI / 2));
        generationMultiplier = Math.max(0, generationMultiplier);
      }

      solarGenerationPattern.push({
        hour: hour,
        generation: (dailySolarGeneration * generationMultiplier / 8).toFixed(3) // Divide by 8 to normalize
      });
    }

    res.json({
      config: {
        sunPeakHour: peakHour,
        morningUsage: morningPercent,
        panelType: panelWattage,
        smpPrice: smp
      },
      // PANEL RECOMMENDATION RESULTS
      recommendedPanels: recommendedPanels,
      actualPanels: actualPanelQty,
      panelAdjustment: actualPanelQty - recommendedPanels,
      overrideApplied: overridePanels !== null,
      packageSearchQty: actualPanelQty,
      selectedPackage: selectedPackage ? {
        packageName: selectedPackage.package_name,
        panelQty: selectedPackage.panel_qty,
        price: selectedPackage.price,
        panelWattage: panelWattage, // Use selected panel wattage instead of DB value
        type: selectedPackage.type,
        maxDiscount: selectedPackage.max_discount,
        special: selectedPackage.special,
        invoiceDesc: selectedPackage.invoice_desc,
        id: selectedPackage.id
      } : null,

      solarConfig: `${actualPanelQty} x ${panelWattage}W panels (${(actualPanelQty * panelWatts / 1000).toFixed(1)} kW system)`,
      monthlySavings: totalMonthlySavings.toFixed(2),
      systemCostBeforeDiscount: systemCostBeforeDiscount !== null ? systemCostBeforeDiscount.toFixed(2) : null,
      discount: discountAmount !== null ? discountAmount.toFixed(2) : null,
      finalSystemCost: finalSystemCost !== null ? finalSystemCost.toFixed(2) : null,
      paybackPeriod: paybackPeriod,
      details: {
        monthlyUsageKwh: monthlyUsageKwh,
        monthlySolarGeneration: monthlySolarGeneration.toFixed(2),
        morningUsageKwh: morningUsageKwh.toFixed(2),
        morningSaving: morningSaving.toFixed(2),
        exportKwh: exportKwh.toFixed(2),
        exportSaving: exportSaving.toFixed(2),
        morningUsageRate: morningUsageRate,
        exportRate: exportRate,
        netUsageKwh: netUsageKwh.toFixed(2),
        afterUsageKwh: (afterUsageMatched !== null ? afterUsageMatched : netUsageKwh).toFixed(2),
        billBefore: billBefore.toFixed(2),
        billAfter: afterBill !== null ? afterBill.toFixed(2) : null,
        billReduction: billReduction.toFixed(2)
      },
      billComparison: {
        before: {
          usageKwh: monthlyUsageKwh,
          billAmount: billBefore
        },
        after: afterBill !== null ? {
          usageKwh: afterUsageMatched !== null ? afterUsageMatched : netUsageKwh,
          billAmount: afterBill
        } : null,
        lookupUsageKwh: netUsageKwh
      },
      charts: {
        electricityUsagePattern: electricityUsagePattern,
        solarGenerationPattern: solarGenerationPattern
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