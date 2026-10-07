const crypto = require('crypto');
const express = require('express');
const pool = require('../../../core/database/pool');

const router = express.Router();
const ATS_ADDON_PRICE_KEY = 'ats_addon_price';
const DEFAULT_ATS_ADDON_PRICE = 1200;
const MAX_ATS_ADDON_PRICE = 1000000;

function parseAtsPrice(raw) {
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const price = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(price) || price <= 0 || price > MAX_ATS_ADDON_PRICE) return null;
  return Math.round(price * 100) / 100;
}

function pricePayload(price, updatedAt) {
  return {
    key: ATS_ADDON_PRICE_KEY,
    price,
    currency: 'MYR',
    updatedAt: updatedAt || null
  };
}

function requireCalculatorApiKey(req, res, next) {
  const expected = String(process.env.CALCULATOR_API_KEY || '');
  const provided = String(req.get('x-api-key') || '').trim();
  const actual = Buffer.from(expected);
  const candidate = Buffer.from(provided);
  if (!actual.length) {
    return res.status(503).json({ success: false, error: 'CALCULATOR_API_KEY is not configured.' });
  }
  if (!candidate.length || candidate.length !== actual.length || !crypto.timingSafeEqual(candidate, actual)) {
    return res.status(401).json({ success: false, error: 'Invalid API key. Send CALCULATOR_API_KEY in the X-Api-Key header.' });
  }
  return next();
}

async function readAtsPrice(client) {
  const result = await client.query(
    'SELECT value, updated_at FROM system_parameter WHERE key = $1',
    [ATS_ADDON_PRICE_KEY]
  );
  if (!result.rows.length) {
    return { price: DEFAULT_ATS_ADDON_PRICE, updatedAt: null };
  }
  const price = parseAtsPrice(result.rows[0].value);
  return {
    price: price == null ? DEFAULT_ATS_ADDON_PRICE : price,
    updatedAt: result.rows[0].updated_at
  };
}

router.get('/api/v1/settings/ats-addon-price', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const current = await readAtsPrice(client);
    return res.json({ success: true, data: pricePayload(current.price, current.updatedAt) });
  } catch (err) {
    console.error('[ATS price] read failed:', err);
    return res.status(500).json({ success: false, error: 'Unable to read the ADD ON ATS price.' });
  } finally {
    if (client) client.release();
  }
});

async function updateAtsPrice(req, res) {
  const price = parseAtsPrice(req.body && req.body.price);
  if (price == null) {
    return res.status(400).json({
      success: false,
      error: 'price must be a number greater than 0 and at most 1000000.'
    });
  }

  const stored = Number.isInteger(price) ? String(price) : price.toFixed(2);
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO system_parameter (key, value, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             description = EXCLUDED.description,
             updated_at = NOW()
       RETURNING value, updated_at`,
      [ATS_ADDON_PRICE_KEY, stored, 'ADD ON ATS unit price in RM']
    );
    const saved = parseAtsPrice(result.rows[0].value);
    return res.json({ success: true, data: pricePayload(saved, result.rows[0].updated_at) });
  } catch (err) {
    console.error('[ATS price] update failed:', err);
    return res.status(500).json({ success: false, error: 'Unable to update the ADD ON ATS price.' });
  } finally {
    if (client) client.release();
  }
}

router.put('/api/v1/settings/ats-addon-price', requireCalculatorApiKey, updateAtsPrice);
router.post('/api/v1/settings/ats-addon-price', requireCalculatorApiKey, updateAtsPrice);

module.exports = router;
