/**
 * src/modules/ClaimReceipt/ocrService.js
 *
 * Calls Xiaomi MiMo's vision endpoint to read a receipt image and extract structured fields.
 * Ported from the original v2 prototype (E:\003-claim-system) — same prompt, same two-key
 * round-robin + 429 retry, same buyer-guard rule.
 */

'use strict';

const { rasterizePdfFirstPage } = require('./pdfRasterize');

const MIMO_MIME = new Set(['image/bmp', 'image/gif', 'image/png', 'image/jpeg', 'image/webp']);
const ACCEPTED_MIME = new Set([...MIMO_MIME, 'application/pdf']);

const BUYER_NAME = 'Eternalgy Sdn Bhd';
const BUYER_PATTERN = /eternalgy/i;

const CATEGORIES = [
  'Transport / Fuel',
  'Toll & Parking',
  'Meals & Refreshments',
  'Accommodation / Lodging',
  'Tools & Hardware',
  'Site Consumables / Materials',
  'Courier & Postage',
  'Printing & Stationery',
  'Equipment Rental',
  'Others'
];

const EMPTY_DRAFT = {
  vendor: null,
  receipt_date: null,
  receipt_id: null,
  amount: null,
  currency: 'MYR',
  category_hint: null,
  item: null,
  description: null
};

function toNullableText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Mimo sometimes writes the literal string "null" instead of the JSON null it was asked
  // for — treat that the same as an actual null rather than storing the word "null".
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}

function parseDraft(payload) {
  const first = payload.indexOf('{');
  const last = payload.lastIndexOf('}');
  if (first < 0 || last < 0 || last <= first) return EMPTY_DRAFT;

  try {
    const parsed = JSON.parse(payload.slice(first, last + 1));
    const vendor = toNullableText(parsed.vendor);
    return {
      vendor: vendor && !BUYER_PATTERN.test(vendor) ? vendor : null,
      receipt_date: parsed.receipt_date ?? null,
      receipt_id: toNullableText(parsed.receipt_id),
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      currency: parsed.currency ?? 'MYR',
      category_hint: CATEGORIES.includes(parsed.category_hint) ? parsed.category_hint : null,
      item: toNullableText(parsed.item),
      description: toNullableText(parsed.description)
    };
  } catch (_) {
    return EMPTY_DRAFT;
  }
}

/**
 * Two Mimo Token Plan keys, round-robined per call. Each key has its own rate limit; splitting
 * calls across both is what lets the client run several receipts concurrently without one
 * key's limit throttling every other receipt.
 */
const API_KEYS = [process.env.MIMO_API_KEY, process.env.MIMO_API_KEY_2].filter(Boolean);
let keyRotation = 0;
function nextApiKey() {
  if (API_KEYS.length === 0) return undefined;
  const key = API_KEYS[keyRotation % API_KEYS.length];
  keyRotation += 1;
  return key;
}

function buildPrompt() {
  return [
    'You are reading a retail receipt (often Malaysian, RM/MYR).',
    `The buyer on this receipt is always ${BUYER_NAME} — it is never the vendor. If the receipt` +
      ' mentions Eternalgy at all, that is the buyer, not who issued the receipt.',
    'Respond with ONLY this JSON:',
    '{',
    '  "vendor": "the shop/supplier who issued the receipt (never the buyer, never Eternalgy), or null",',
    '  "receipt_date": "YYYY-MM-DD or null",',
    '  "receipt_id": "receipt/invoice/bill number or null",',
    '  "amount": number (grand total, no currency symbol) or null,',
    '  "currency": "MYR",',
    `  "category_hint": "one of [${CATEGORIES.join(', ')}] or null",`,
    '  "item": "the main item(s) or service purchased, short, e.g. \'Petrol (RON95), 30L\' or \'A4 paper, 2 reams\', or null",',
    '  "description": "one short sentence on the purpose of this expense for a reviewer, or null"',
    '}',
    'Rules: amount = final total paid. Strip commas. If unreadable, use null.'
  ].join('\n');
}

/**
 * Reads a receipt image or PDF (as a Buffer) and returns { draft, status, model }.
 * Throws on missing config or unsupported mime type — caller maps those to HTTP responses.
 */
async function readReceipt({ bytes, mimeType }) {
  const baseUrl = (process.env.MIMO_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1').replace(/\/$/, '');
  const model = process.env.MIMO_MODEL || 'mimo-v2.5';

  const apiKey = nextApiKey();
  if (!apiKey) {
    const err = new Error('No MIMO_API_KEY / MIMO_API_KEY_2 configured');
    err.status = 500;
    throw err;
  }

  if (!ACCEPTED_MIME.has(mimeType)) {
    const err = new Error(`${mimeType} isn't supported. Use one of: ${[...ACCEPTED_MIME].join(', ')}.`);
    err.status = 400;
    throw err;
  }

  let visionBytes = bytes;
  let visionMimeType = mimeType;
  if (mimeType === 'application/pdf') {
    try {
      visionBytes = await rasterizePdfFirstPage(bytes);
      visionMimeType = 'image/png';
    } catch (error) {
      const err = new Error(`Could not rasterize PDF: ${error.message}`);
      err.status = 422;
      throw err;
    }
  }

  const requestBody = JSON.stringify({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt() },
          { type: 'image_url', image_url: { url: `data:${visionMimeType};base64,${visionBytes.toString('base64')}` } }
        ]
      }
    ],
    temperature: 0
  });

  // Backs off and swaps to the other key on a 429 rather than failing the receipt outright —
  // the other key's slot has usually freed up by the time this one hasn't.
  let response;
  let usedKey = apiKey;
  let lastDetail = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${usedKey}`, 'Content-Type': 'application/json' },
      body: requestBody
    });
    if (response.status !== 429) break;
    lastDetail = await response.text().catch(() => '');
    if (attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    usedKey = nextApiKey() || apiKey;
  }

  if (!response.ok) {
    const detail = response.status === 429 ? lastDetail : await response.text().catch(() => '');
    const err = new Error(`Mimo request failed with status ${response.status}: ${detail.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || '';
  const draft = parseDraft(content);
  const readAnything = draft.amount != null || draft.receipt_date != null || draft.vendor != null;

  return { draft, status: readAnything ? 'ok' : 'failed', model };
}

module.exports = { readReceipt, BUYER_NAME, BUYER_PATTERN, CATEGORIES };
