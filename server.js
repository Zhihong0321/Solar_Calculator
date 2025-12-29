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
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

// Helper function to find the closest tariff based on adjusted total (bill + afa)
const findClosestTariff = async (client, targetAmount, afaRate) => {
  const query = `
    SELECT *, (COALESCE(bill_total_normal, 0)::numeric + (COALESCE(usage_kwh, 0)::numeric * $2::numeric)) as adjusted_total
    FROM tnb_tariff_2025
    WHERE (COALESCE(bill_total_normal, 0)::numeric + (COALESCE(usage_kwh, 0)::numeric * $2::numeric)) <= $1::numeric
    ORDER BY adjusted_total DESC
    LIMIT 1
  `;
  const result = await client.query(query, [targetAmount, afaRate]);

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Fallback to lowest
  const fallbackQuery = `
    SELECT *, (COALESCE(bill_total_normal, 0)::numeric + (COALESCE(usage_kwh, 0)::numeric * $1::numeric)) as adjusted_total
    FROM tnb_tariff_2025
    ORDER BY adjusted_total ASC
    LIMIT 1
  `;
  const fallbackResult = await client.query(fallbackQuery, [afaRate]);
  return fallbackResult.rows.length > 0 ? fallbackResult.rows[0] : null;
};

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
    const {
      amount,
      sunPeakHour,
      morningUsage,
      panelType,
      panelBubbleId,
      smpPrice,
      percentDiscount,
      fixedDiscount,
      afaRate: afaRateRaw,
      historicalAfaRate: historicalAfaRateRaw
    } = req.query;

    // Validate inputs
    const billAmount = parseFloat(amount);
    const peakHour = parseFloat(sunPeakHour);
    const morningPercent = parseFloat(morningUsage);
    const panelWattage = parseInt(panelType) || 620; // Default to 620W
    const selectedPanelBubbleId = typeof panelBubbleId === 'string' && panelBubbleId.trim().length > 0
      ? panelBubbleId.trim()
      : null;
    const smp = parseFloat(smpPrice);
    const discountPercent = parseFloat(percentDiscount) || 0;
    const discountFixed = parseFloat(fixedDiscount) || 0;
    const afaRate = parseFloat(afaRateRaw) || 0;
    const historicalAfaRate = parseFloat(historicalAfaRateRaw) || 0;
    const batterySizeVal = parseFloat(req.query.batterySize) || 0;
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

    if (!smp || smp < 0.19 || smp > 0.2703) {
      return res.status(400).json({ error: 'SMP price must be between RM 0.19 and RM 0.2703' });
    }

    // First get the TNB tariff data for the bill amount
    const client = await pool.connect();
    
    try {
        const tariff = await findClosestTariff(client, billAmount, historicalAfaRate);

        if (!tariff) {
          return res.status(404).json({ error: 'No tariff data found for calculation' });
        }

        const monthlyUsageKwh = tariff.usage_kwh || 0;

        // NEW PANEL RECOMMENDATION FORMULA
        // Formula: usage_kwh / sun_peak_hour / 30 / 0.62 = X, then floor(X)
        const recommendedPanelsRaw = Math.floor(monthlyUsageKwh / peakHour / 30 / 0.62);

        // Ensure minimum of 1 panel for recommendation
        const recommendedPanels = Math.max(1, recommendedPanelsRaw);
        const actualPanelQty = overridePanels !== null ? overridePanels : recommendedPanels;

        // Search for Residential package within filtered product pool
        // Rule: Always filter by selected product type
        // - If panelBubbleId provided: match product bubble_id
        // - Else: match product wattage (solar_output_rating)
        let packageResult = { rows: [] };
        if (selectedPanelBubbleId) {
          const packageByBubbleQuery = `
            SELECT p.*
            FROM package p
            JOIN product pr ON (
              CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
              OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
            )
            WHERE p.panel_qty = $1
              AND p.active = true
              AND (p.special IS FALSE OR p.special IS NULL)
              AND p.type = $2
              AND pr.bubble_id = $3
            ORDER BY p.price ASC
            LIMIT 1
          `;
          packageResult = await client.query(packageByBubbleQuery, [actualPanelQty, 'Residential', selectedPanelBubbleId]);
        } else {
          const packageByWattQuery = `
            SELECT p.*
            FROM package p
            JOIN product pr ON (
              CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
              OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
            )
            WHERE p.panel_qty = $1
              AND p.active = true
              AND (p.special IS FALSE OR p.special IS NULL)
              AND p.type = $2
              AND pr.solar_output_rating = $3
            ORDER BY p.price ASC
            LIMIT 1
          `;
          packageResult = await client.query(packageByWattQuery, [actualPanelQty, 'Residential', panelWattage]);
        }

        let selectedPackage = null;
        if (packageResult.rows.length > 0) {
          selectedPackage = packageResult.rows[0];
        } else {
          // No package in filtered pool; do NOT fallback across products
          selectedPackage = null;
        }

        // Calculate solar generation using selected panel wattage
        const panelWatts = panelWattage;
        const dailySolarGeneration = (actualPanelQty * panelWatts * peakHour) / 1000; // kWh per day
        const monthlySolarGeneration = dailySolarGeneration * 30;

        // Calculate morning usage split
        const morningUsageKwh = (monthlyUsageKwh * morningPercent) / 100;

        const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);
        
        // --- Battery Logic Start ---
        // Hard Cap 1: Daily Excess Solar Energy
        const dailyExcessSolar = Math.max(0, monthlySolarGeneration - morningUsageKwh) / 30;
        
        // Hard Cap 2: Daily Grid Import (Night Usage)
        const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;
        
        // Hard Cap 3: Battery Capacity
        const dailyBatteryCap = batterySizeVal;

        // Max Discharge = Lowest of the 3 caps
        const dailyMaxDischarge = Math.min(dailyExcessSolar, dailyNightUsage, dailyBatteryCap);
        const monthlyMaxDischarge = dailyMaxDischarge * 30;

        // Step 1: New Total Import from Grid (after solar & battery)
        // Original logic: netUsageKwh = monthlyUsageKwh - morningSelfConsumption
        // New logic: netUsageKwh = (monthlyUsageKwh - morningSelfConsumption) - monthlyMaxDischarge
        
        // --- Baseline Logic (No Battery) ---
        // We calculate the baseline separately to preserve "After Solar (No Battery)" values for comparison
        const netUsageBaseline = Math.max(0, monthlyUsageKwh - morningSelfConsumption);
        const netUsageBaselineForLookup = Math.max(0, Math.floor(netUsageBaseline));
        const exportKwhBaseline = Math.max(0, monthlySolarGeneration - morningUsageKwh);
        
        // --- Battery Logic (With Battery) ---
        const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption - monthlyMaxDischarge);
        const netUsageForLookup = Math.max(0, Math.floor(netUsageKwh));

        // Step 3 (Calc Prep): Export Energy
        // Original: monthlySolarGeneration - morningUsageKwh
        // New: (monthlySolarGeneration - morningUsageKwh) - monthlyMaxDischarge
        const exportKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh - monthlyMaxDischarge);
        // --- Battery Logic End ---

        // Calculate the post-solar bill using the reduced usage (excluding export)
        let afterTariff = null;
        let baselineTariff = null;

        // Helper function to lookup tariff
        const lookupTariff = async (usageValue) => {
             if (usageValue <= 0) {
                const lowestUsageQuery = `
                    SELECT * FROM tnb_tariff_2025
                    ORDER BY usage_kwh ASC
                    LIMIT 1
                `;
                const res = await client.query(lowestUsageQuery);
                return res.rows.length > 0 ? res.rows[0] : null;
             } else {
                const tariffQuery = `
                  SELECT * FROM tnb_tariff_2025
                  WHERE usage_kwh <= $1
                  ORDER BY usage_kwh DESC
                  LIMIT 1
                `;
                const res = await client.query(tariffQuery, [usageValue]);
                if (res.rows.length > 0) return res.rows[0];
                
                // Fallback
                const fallbackQuery = `
                  SELECT * FROM tnb_tariff_2025
                  ORDER BY usage_kwh ASC
                  LIMIT 1
                `;
                const fallbackRes = await client.query(fallbackQuery);
                return fallbackRes.rows.length > 0 ? fallbackRes.rows[0] : null;
             }
        };

        baselineTariff = await lookupTariff(netUsageBaselineForLookup);
        afterTariff = await lookupTariff(netUsageForLookup);

        // NEW SAVING FORMULA
        // 1. Morning usage saving: morning_kwh * (RM 0.4869 + AFA)
        const morningUsageRate = 0.4869; // RM per kWh for morning usage
        const morningSaving = morningUsageKwh * (morningUsageRate + afaRate);

        // 2. Export calculation
        const exportRate = smp; // RM per kWh for export (SMP price)
        const exportSaving = exportKwh * exportRate;
        const exportSavingBaseline = exportKwhBaseline * exportRate;

        // 3. Total saving
        const totalMonthlySavings = morningSaving + exportSaving;
        const totalMonthlySavingsBaseline = morningSaving + exportSavingBaseline;

        const parseCurrencyValue = (value, fallback = 0) => {
          if (value === null || value === undefined) {
            return fallback;
          }
          const numeric = Number(value);
          return Number.isNaN(numeric) ? fallback : numeric;
        };

        const buildBillBreakdown = (tariffRow) => {
          if (!tariffRow) {
            return null;
          }

          const usage = parseCurrencyValue(tariffRow.usage_normal);
          const network = parseCurrencyValue(tariffRow.network);
          const capacity = parseCurrencyValue(tariffRow.capacity);
          const sst = parseCurrencyValue(tariffRow.sst_normal);
          const eei = parseCurrencyValue(tariffRow.eei);
          const usageKwh = parseCurrencyValue(tariffRow.usage_kwh);
          const afa = usageKwh * afaRate;
          const total = parseCurrencyValue(
            tariffRow.bill_total_normal,
            usage + network + capacity + sst + eei
          ) + afa;

          return {
            usage,
            network,
            capacity,
            sst,
            eei,
            afa,
            total,
            totalBase: total - afa
          };
        };

        const beforeBreakdown = buildBillBreakdown(tariff);
        const afterBreakdown = buildBillBreakdown(afterTariff);
        const baselineBreakdown = buildBillBreakdown(baselineTariff);

        const billBefore = beforeBreakdown ? beforeBreakdown.total : 0;
        const billBeforeBase = beforeBreakdown ? beforeBreakdown.totalBase : 0;
        
        // Baseline Bills (No Battery)
        const afterBillBaseline = baselineBreakdown ? baselineBreakdown.total : null;
        const afterBillBaselineBase = baselineBreakdown ? baselineBreakdown.totalBase : null;
        const afterUsageMatchedBaseline = baselineTariff && baselineTariff.usage_kwh !== null 
           ? parseFloat(baselineTariff.usage_kwh) 
           : null;
        const billReductionBaseline = afterBillBaseline !== null 
           ? Math.max(0, billBefore - afterBillBaseline) 
           : morningSaving;

        // With Battery Bills
        const afterBill = afterBreakdown ? afterBreakdown.total : null;
        const afterBillBase = afterBreakdown ? afterBreakdown.totalBase : null;
        const afterUsageMatched = afterTariff && afterTariff.usage_kwh !== null
          ? parseFloat(afterTariff.usage_kwh)
          : null;

        const billReduction = afterBill !== null ? Math.max(0, billBefore - afterBill) : morningSaving;

        // AFA Impact Calculation
        const usageReduction = monthlyUsageKwh - (afterUsageMatched !== null ? afterUsageMatched : netUsageKwh);
        const afaSaving = usageReduction * afaRate;
        const baseBillReduction = billReduction - afaSaving;

        const calculateBreakdownDelta = (beforeValue, afterValue) => {
          const before = parseCurrencyValue(beforeValue);
          if (afterValue === null || afterValue === undefined) {
            return before;
          }
          const after = parseCurrencyValue(afterValue);
          return before - after;
        };

        const breakdownItems = [
          { key: 'usage', label: 'Usage' },
          { key: 'network', label: 'Network' },
          { key: 'capacity', label: 'Capacity Fee' },
          { key: 'sst', label: 'SST' },
          { key: 'eei', label: 'EEI' },
          { key: 'afa', label: 'AFA Charge' }
        ].map((item) => {
          const beforeValue = beforeBreakdown ? beforeBreakdown[item.key] : 0;
          const afterValue = afterBreakdown ? afterBreakdown[item.key] : null;
          return {
            ...item,
            before: beforeValue,
            after: afterValue,
            delta: calculateBreakdownDelta(beforeValue, afterValue)
          };
        });

        const totals = {
          before: beforeBreakdown ? beforeBreakdown.total : billBefore,
          after: afterBreakdown ? afterBreakdown.total : afterBill,
          delta: calculateBreakdownDelta(
            beforeBreakdown ? beforeBreakdown.total : billBefore,
            afterBreakdown ? afterBreakdown.total : afterBill
          )
        };

        const savingsBreakdown = {
          billReduction: Number(billReduction.toFixed(2)),
          exportCredit: Number(exportSaving.toFixed(2)),
          afaImpact: Number(afaSaving.toFixed(2)),
          baseBillReduction: Number(baseBillReduction.toFixed(2)),
          total: Number((billReduction + exportSaving).toFixed(2))
        };

        // Use actual package price if available, otherwise fallback to calculation
        let systemCostBeforeDiscount = null;
        let finalSystemCost = null;
        let percentDiscountAmount = null;
        let fixedDiscountAmount = null;
        let totalDiscountAmount = null;
        let paybackPeriod = null;

        if (selectedPackage && selectedPackage.price) {
          // Use actual package price from database
          systemCostBeforeDiscount = parseFloat(selectedPackage.price);
          
          // Apply discount logic: Percent discount first, then fixed amount discount
          // Step 1: Apply percentage discount
          percentDiscountAmount = (systemCostBeforeDiscount * discountPercent) / 100;
          const priceAfterPercent = systemCostBeforeDiscount - percentDiscountAmount;
          
          // Step 2: Apply fixed amount discount
          fixedDiscountAmount = discountFixed;
          
          // Calculate final system cost
          finalSystemCost = Math.max(0, priceAfterPercent - fixedDiscountAmount);
          totalDiscountAmount = systemCostBeforeDiscount - finalSystemCost;

          // Calculate payback period only when system cost is available
          if (totalMonthlySavings > 0 && finalSystemCost > 0) {
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
            smpPrice: smp,
            afaRate: afaRate,
            batterySize: batterySizeVal
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
          percentDiscountAmount: percentDiscountAmount !== null ? percentDiscountAmount.toFixed(2) : null,
          fixedDiscountAmount: fixedDiscountAmount !== null ? fixedDiscountAmount.toFixed(2) : null,
          totalDiscountAmount: totalDiscountAmount !== null ? totalDiscountAmount.toFixed(2) : null,
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
            billReduction: billReduction.toFixed(2),
            billBreakdown: {
              before: beforeBreakdown,
              after: afterBreakdown,
              items: breakdownItems,
              totals
            },
            savingsBreakdown: savingsBreakdown,
            battery: {
              size: batterySizeVal,
              dailyDischarge: dailyMaxDischarge.toFixed(2),
              monthlyDischarge: monthlyMaxDischarge.toFixed(2),
              caps: {
                 excessSolar: dailyExcessSolar.toFixed(2),
                 nightUsage: dailyNightUsage.toFixed(2),
                 batterySize: dailyBatteryCap.toFixed(2)
              },
              baseline: {
                 billReduction: billReductionBaseline.toFixed(2),
                 exportCredit: exportSavingBaseline.toFixed(2),
                 afaImpact: ((monthlyUsageKwh - (afterUsageMatchedBaseline || netUsageBaseline)) * afaRate).toFixed(2),
                 baseBillReduction: (billReductionBaseline - ((monthlyUsageKwh - (afterUsageMatchedBaseline || netUsageBaseline)) * afaRate)).toFixed(2),
                 totalSavings: totalMonthlySavingsBaseline.toFixed(2),
                 billAfter: afterBillBaseline !== null ? afterBillBaseline.toFixed(2) : null,
                 usageAfter: afterUsageMatchedBaseline !== null ? afterUsageMatchedBaseline.toFixed(2) : null,
                 billBreakdown: {
                    before: beforeBreakdown,
                    after: baselineBreakdown,
                    items: [
                      { key: 'usage', label: 'Usage' },
                      { key: 'network', label: 'Network' },
                      { key: 'capacity', label: 'Capacity Fee' },
                      { key: 'sst', label: 'SST' },
                      { key: 'eei', label: 'EEI' },
                      { key: 'afa', label: 'AFA Charge' }
                    ].map((item) => {
                      const beforeValue = beforeBreakdown ? beforeBreakdown[item.key] : 0;
                      const afterValue = baselineBreakdown ? baselineBreakdown[item.key] : null;
                      return {
                        ...item,
                        before: beforeValue,
                        after: afterValue,
                        delta: calculateBreakdownDelta(beforeValue, afterValue)
                      };
                    }),
                    totals: {
                      before: beforeBreakdown ? beforeBreakdown.total : billBefore,
                      after: baselineBreakdown ? baselineBreakdown.total : null,
                      delta: calculateBreakdownDelta(
                        beforeBreakdown ? beforeBreakdown.total : billBefore,
                        baselineBreakdown ? baselineBreakdown.total : null
                      )
                    }
                 }
              }
            }
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
            lookupUsageKwh: netUsageForLookup,
            actualNetUsageKwh: parseFloat(netUsageKwh.toFixed(2))
          },
          billBreakdownComparison: {
            before: beforeBreakdown,
            after: afterBreakdown,
            items: breakdownItems,
            totals
          },
          savingsBreakdown: savingsBreakdown,
          charts: {
            electricityUsagePattern: electricityUsagePattern,
            solarGenerationPattern: solarGenerationPattern
          }
        });
    } finally {
        client.release();
    }

  } catch (err) {
    console.error('Solar calculation error:', err);
    res.status(500).json({ error: 'Failed to calculate solar savings', details: err.message });
  }
});

app.get('/api/all-data', async (req, res) => {
  try {
    const client = await pool.connect();
    const tariffs = await client.query('SELECT usage_kwh, usage_normal, network, capacity, sst_normal, eei, bill_total_normal, retail, kwtbb_normal FROM tnb_tariff_2025 ORDER BY usage_kwh ASC');
    const packages = await client.query(`
      SELECT p.id, p.package_name, p.panel_qty, p.price, p.panel, p.type, p.active, p.special, p.max_discount, p.invoice_desc,
             pr.bubble_id, pr.solar_output_rating
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