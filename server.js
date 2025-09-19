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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});