/**
 * src/modules/ClaimReceipt/ocrService.js
 *
 * Calls the Eternalgy router's vision endpoint to read a receipt image and extract structured
 * fields. Was Xiaomi MiMo originally; MiMo's token plan is retired, so this now talks to the
 * router (OpenAI-shaped, gpt-5.6-luna). Same prompt, same buyer-guard rule.
 */

'use strict';

const { rasterizePdfFirstPage } = require('./pdfRasterize');
const { fitVisionImage } = require('./fitVisionImage');

const VISION_MIME = new Set(['image/bmp', 'image/gif', 'image/png', 'image/jpeg', 'image/webp']);
const ACCEPTED_MIME = new Set([...VISION_MIME, 'application/pdf']);

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
  // The model sometimes writes the literal string "null" instead of the JSON null it was asked
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

const DEFAULT_BASE_URL = 'https://e-router.up.railway.app/v1';
const DEFAULT_MODEL = 'gpt-5.6-luna';

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
  const baseUrl = (process.env.AI_ROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = process.env.AI_ROUTER_MODEL || DEFAULT_MODEL;

  const apiKey = process.env.AI_ROUTER_API_KEY;
  if (!apiKey) {
    const err = new Error('No AI_ROUTER_API_KEY configured');
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

  const startedAt = Date.now();
  const fitted = await fitVisionImage(visionBytes, visionMimeType);
  visionBytes = fitted.bytes;
  visionMimeType = fitted.mimeType;

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

  // Retries rate limits, and Railway's cold-start 502 ("Application failed to respond") which the
  // router throws on the first request after it has been idle.
  const RETRY_STATUS = new Set([429, 502, 503, 504]);
  let response;
  let lastDetail = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: requestBody
    });
    if (!RETRY_STATUS.has(response.status)) break;
    lastDetail = await response.text().catch(() => '');
    if (attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }

  if (!response.ok) {
    const detail = lastDetail || (await response.text().catch(() => ''));
    const err = new Error(`Router request failed with status ${response.status}: ${detail.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || '';
  const draft = parseDraft(content);
  const readAnything = draft.amount != null || draft.receipt_date != null || draft.vendor != null;

  // A dead extraction returns HTTP 200 with an all-null draft, which the UI renders as a green
  // "Saved" over an empty form — indistinguishable from success. Log the raw reply when that
  // happens so the failure is diagnosable from prod logs instead of by re-running it locally.
  if (!readAnything) {
    console.error('[ClaimReceipt] OCR extracted nothing', JSON.stringify({
      model: payload.model || model,
      finish_reason: payload.choices?.[0]?.finish_reason,
      latency_ms: Date.now() - startedAt,
      sent_bytes: visionBytes.length,
      sent_mime: visionMimeType,
      raw_reply: content.slice(0, 600)
    }));
  } else {
    console.log(`[ClaimReceipt] OCR ok model=${payload.model || model} latency=${Date.now() - startedAt}ms sent=${visionBytes.length}B`);
  }

  return { draft, status: readAnything ? 'ok' : 'failed', model };
}

// buildPrompt/parseDraft are exported for scripts/debug_claim_ocr.js, which has to reproduce the
// exact prompt and the exact parse to show where an extraction died.
module.exports = { readReceipt, buildPrompt, parseDraft, BUYER_NAME, BUYER_PATTERN, CATEGORIES };
