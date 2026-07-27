#!/usr/bin/env node
/**
 * scripts/debug_claim_ocr.js
 *
 * Observability for the claim-receipt OCR path (src/modules/ClaimReceipt).
 *
 * This path is silent by design: the raw model reply is never logged, the model name is never
 * stored, and the server's `status: "failed"` is discarded by the client — so a receipt that
 * extracted NOTHING renders exactly like one that worked ("Saved" + an empty form). That makes
 * every failure look identical and forces guesswork. This script is the missing instrument.
 *
 * It reports four things, in order, and never hides a stage:
 *   1. API HEALTHY   — is the router reachable, which models does it serve, how slow is it
 *   2. RECEIVED      — the exact bytes that arrived: size, mime, md5, PDF page count
 *   3. PROCESSED     — rasterize -> fit -> prompt -> request body, with the size at every hop
 *   4. HAPPENED      — HTTP status, the RAW model reply, the parsed draft, and which field died
 *
 * Usage:
 *   node scripts/debug_claim_ocr.js --health
 *   node scripts/debug_claim_ocr.js --file "C:/path/receipt.pdf"
 *   node scripts/debug_claim_ocr.js --url "https://pub-....r2.dev/claim_receipt_uploads/x.pdf"
 *   node scripts/debug_claim_ocr.js --claim 17          # pulls file_url from the DB
 *   node scripts/debug_claim_ocr.js --md5 fd7abc4435...  # same, by md5
 *   node scripts/debug_claim_ocr.js --recent 5           # replay the last N stored claims
 *
 * Flags: --keep (write the rasterized/fitted images to debug_out/ for eyeballing)
 *        --json (machine-readable report only)
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { rasterizePdfFirstPage } = require('../src/modules/ClaimReceipt/pdfRasterize');
const { fitVisionImage, MAX_IMAGE_BYTES } = require('../src/modules/ClaimReceipt/fitVisionImage');
const ocrService = require('../src/modules/ClaimReceipt/ocrService');

const OUT_DIR = path.join(__dirname, '..', 'debug_out');

// ── arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args.flags.add(key);
    else { args[key] = next; i += 1; }
  }
  return args;
}

// ── output helpers ────────────────────────────────────────────────────────────

const C = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' };
let QUIET = false;

function say(line = '') { if (!QUIET) console.log(line); }
function head(n, title) { say(`\n${C.bold}${n}. ${title}${C.off}`); }
function row(label, value, colour) {
  const pad = String(label).padEnd(22);
  say(`   ${C.dim}${pad}${C.off}${colour ? colour + value + C.off : value}`);
}
function ok(v) { return `${C.green}${v}${C.off}`; }
function bad(v) { return `${C.red}${v}${C.off}`; }
function warn(v) { return `${C.yellow}${v}${C.off}`; }
function kb(n) { return `${(n / 1024).toFixed(1)} KB`; }

function config() {
  return {
    baseUrl: (process.env.AI_ROUTER_BASE_URL || 'https://e-router.up.railway.app/v1').replace(/\/$/, ''),
    model: process.env.AI_ROUTER_MODEL || 'gpt-5.6-luna',
    apiKey: process.env.AI_ROUTER_API_KEY || ''
  };
}

// ── 1. API HEALTHY ────────────────────────────────────────────────────────────

async function checkHealth(report) {
  const { baseUrl, model, apiKey } = config();
  head(1, 'API HEALTHY');
  row('base url', baseUrl);
  row('model (configured)', model);
  row('AI_ROUTER_API_KEY', apiKey ? ok(`set (${apiKey.slice(0, 6)}…${apiKey.length} chars)`) : bad('MISSING — every OCR call will 500'));

  report.health = { baseUrl, model, keySet: Boolean(apiKey) };
  if (!apiKey) { report.health.reachable = false; return report.health; }

  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const ms = Date.now() - started;
    const body = await res.text();
    report.health.status = res.status;
    report.health.latencyMs = ms;
    row('GET /models', res.ok ? ok(`${res.status} in ${ms}ms`) : bad(`${res.status} in ${ms}ms`));

    if (res.ok) {
      const served = (JSON.parse(body).data || []).map((m) => m.id);
      report.health.models = served;
      report.health.reachable = true;
      row('models served', served.join(', ') || bad('none'));
      if (!served.includes(model)) {
        row('MISMATCH', bad(`configured model "${model}" is NOT served — requests will fail`));
        report.health.modelMismatch = true;
      }
    } else {
      report.health.reachable = false;
      row('body', bad(body.slice(0, 200)));
    }
  } catch (err) {
    report.health.reachable = false;
    report.health.error = err.message;
    row('GET /models', bad(`threw: ${err.message}`));
  }
  return report.health;
}

// ── 2. RECEIVED ───────────────────────────────────────────────────────────────

const MIME_BY_EXT = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp'
};

function sniffMime(bytes, name) {
  if (bytes.slice(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (bytes.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (bytes.slice(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (bytes.slice(0, 4).toString('latin1') === 'RIFF') return 'image/webp';
  if (bytes.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (bytes.slice(0, 2).toString('latin1') === 'BM') return 'image/bmp';
  return MIME_BY_EXT[path.extname(name || '').toLowerCase()] || 'application/octet-stream';
}

async function loadSource(args) {
  if (args.file) {
    const bytes = fs.readFileSync(args.file);
    return { bytes, label: args.file, origin: 'local file' };
  }
  if (args.url) {
    const res = await fetch(args.url);
    if (!res.ok) throw new Error(`fetch ${args.url} -> HTTP ${res.status}`);
    return { bytes: Buffer.from(await res.arrayBuffer()), label: args.url, origin: 'r2 url' };
  }
  throw new Error('no source: pass --file, --url, --claim, --md5 or --recent');
}

async function reportReceived(bytes, label, origin, report) {
  head(2, 'RECEIVED');
  const mime = sniffMime(bytes, label);
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  row('source', `${origin} — ${label}`);
  row('bytes', kb(bytes.length));
  row('sniffed mime', mime === 'application/octet-stream' ? bad(mime) : mime);
  row('md5', md5);

  if (bytes.length > 15 * 1024 * 1024) {
    row('UPLOAD LIMIT', bad('over multer 15MB cap — server rejects before OCR'));
  }
  if (mime === 'application/pdf') {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      const doc = await task.promise;
      row('pdf pages', `${doc.numPages}${doc.numPages > 1 ? warn('  (only page 1 is read)') : ''}`);
      report.pdfPages = doc.numPages;
      await task.destroy();
    } catch (err) {
      row('pdf parse', bad(err.message));
    }
  }
  Object.assign(report, { md5, mime, inputBytes: bytes.length });
  return mime;
}

// ── 3. PROCESSED ──────────────────────────────────────────────────────────────

async function reportProcessed(bytes, mime, keep, report) {
  head(3, 'PROCESSED');
  const stages = [];
  let visionBytes = bytes;
  let visionMime = mime;

  if (mime === 'application/pdf') {
    const t = Date.now();
    visionBytes = await rasterizePdfFirstPage(bytes);
    visionMime = 'image/png';
    stages.push({ stage: 'rasterize page 1', bytes: visionBytes.length, ms: Date.now() - t });
    row('rasterize page 1', `${kb(bytes.length)} pdf -> ${kb(visionBytes.length)} png  ${C.dim}(${Date.now() - t}ms)${C.off}`);
    if (keep) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `${report.md5}.raster.png`), visionBytes);
      row('wrote', path.join('debug_out', `${report.md5}.raster.png`));
    }
  }

  const t2 = Date.now();
  const before = visionBytes.length;
  const fitted = await fitVisionImage(visionBytes, visionMime);
  const shrank = fitted.bytes.length !== before;
  stages.push({ stage: 'fit for vision', bytes: fitted.bytes.length, ms: Date.now() - t2 });
  row('fit for vision', shrank
    ? `${kb(before)} -> ${kb(fitted.bytes.length)} ${fitted.mimeType}  ${C.dim}(budget ${kb(MAX_IMAGE_BYTES)})${C.off}`
    : `${kb(before)} ${C.dim}(under ${kb(MAX_IMAGE_BYTES)} budget, untouched)${C.off}`);
  if (keep) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const ext = fitted.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    fs.writeFileSync(path.join(OUT_DIR, `${report.md5}.sent.${ext}`), fitted.bytes);
    row('wrote', path.join('debug_out', `${report.md5}.sent.${ext}`) + `  ${C.dim}<- this is what the model actually sees${C.off}`);
  }

  const b64Len = Math.ceil(fitted.bytes.length / 3) * 4;
  row('base64 inflation', `${kb(fitted.bytes.length)} -> ${kb(b64Len)}`);
  const bodyEstimate = b64Len + 1500;
  const overLimit = bodyEstimate > 1024 * 1024;
  row('est. request body', overLimit ? bad(`${kb(bodyEstimate)} — over the router's ~1MB cap, expect 413`) : ok(kb(bodyEstimate)));

  report.processed = { stages, sentBytes: fitted.bytes.length, sentMime: fitted.mimeType, bodyEstimate, overLimit };
  return fitted;
}

// ── 4. WHAT HAPPENED ──────────────────────────────────────────────────────────

const DRAFT_FIELDS = ['vendor', 'receipt_date', 'receipt_id', 'amount', 'currency', 'category_hint', 'item', 'description'];

async function reportHappened(bytes, mime, report) {
  head(4, 'WHAT HAPPENED');
  const { baseUrl, model, apiKey } = config();

  // Re-issue the call the way ocrService does, but keep the raw reply — which is the one thing
  // production throws away and the reason a dead extraction is indistinguishable from a good one.
  const fitted = await fitVisionImage(
    mime === 'application/pdf' ? await rasterizePdfFirstPage(bytes) : bytes,
    mime === 'application/pdf' ? 'image/png' : mime
  );

  const t = Date.now();
  let res;
  let raw = '';
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: ocrService.buildPrompt() },
            { type: 'image_url', image_url: { url: `data:${fitted.mimeType};base64,${fitted.bytes.toString('base64')}` } }
          ]
        }],
        temperature: 0
      })
    });
    raw = await res.text();
  } catch (err) {
    row('transport', bad(`threw: ${err.message}`));
    report.happened = { error: err.message };
    return;
  }
  const ms = Date.now() - t;
  row('HTTP', res.ok ? ok(`${res.status} in ${ms}ms`) : bad(`${res.status} in ${ms}ms`));

  if (!res.ok) {
    row('body', bad(raw.slice(0, 400)));
    if (res.status === 413) row('meaning', bad('payload too large — the image never reached the model'));
    if (res.status === 401) row('meaning', bad('key rejected — AI_ROUTER_API_KEY is wrong or revoked'));
    if (res.status === 502) row('meaning', warn('Railway cold start — ocrService retries this'));
    report.happened = { status: res.status, body: raw.slice(0, 400) };
    return;
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { row('response', bad('not JSON: ' + raw.slice(0, 200))); return; }

  const content = parsed.choices?.[0]?.message?.content ?? '';
  const finish = parsed.choices?.[0]?.finish_reason;
  row('model returned', parsed.model || '(none)');
  row('finish_reason', finish === 'stop' ? ok(finish) : bad(`${finish} — reply was cut off`));
  row('tokens', `prompt ${parsed.usage?.prompt_tokens} / completion ${parsed.usage?.completion_tokens}`);
  say(`\n   ${C.dim}RAW MODEL REPLY (what production silently discards)${C.off}`);
  say(content ? content.split('\n').map((l) => '   | ' + l).join('\n') : `   | ${bad('(empty)')}`);

  const draft = ocrService.parseDraft(content);
  const filled = DRAFT_FIELDS.filter((f) => draft[f] !== null && draft[f] !== undefined);
  const empty = DRAFT_FIELDS.filter((f) => !filled.includes(f));
  const status = (draft.amount != null || draft.receipt_date != null || draft.vendor != null) ? 'ok' : 'failed';

  say('');
  row('parsed draft', JSON.stringify(draft));
  row('fields filled', filled.length ? ok(filled.join(', ')) : bad('none'));
  row('fields empty', empty.length ? warn(empty.join(', ')) : ok('none'));
  row('server status', status === 'ok' ? ok('ok') : bad('failed'));
  if (status === 'failed') {
    row('UI CONSEQUENCE', bad('card still shows green "Saved" with a blank form — the failure is invisible'));
  }
  if (content && filled.length === 0) {
    row('DIAGNOSIS', bad('model replied but parseDraft salvaged nothing — prompt/JSON-shape problem, not transport'));
  }

  report.happened = { status: res.status, latencyMs: ms, model: parsed.model, finish, content, draft, filled, empty, serverStatus: status };
}

// ── DB lookups ────────────────────────────────────────────────────────────────

async function resolveFromDb(args) {
  const pool = require('../src/core/database/pool');
  let sql;
  let params;
  if (args.claim) { sql = 'SELECT id, md5, file_url, vendor, amount, currency, created_at FROM claim_receipt WHERE id = $1'; params = [args.claim]; }
  else if (args.md5) { sql = 'SELECT id, md5, file_url, vendor, amount, currency, created_at FROM claim_receipt WHERE md5 = $1 AND file_url IS NOT NULL ORDER BY created_at DESC LIMIT 1'; params = [args.md5]; }
  else { sql = 'SELECT id, md5, file_url, vendor, amount, currency, created_at FROM claim_receipt WHERE file_url IS NOT NULL ORDER BY created_at DESC LIMIT $1'; params = [Number(args.recent) || 5]; }

  const { rows } = await pool.query(sql, params);
  await pool.end().catch(() => {});
  if (!rows.length) throw new Error('no claim rows matched (rows with file_url IS NULL have no file to replay)');
  return rows;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function runOne(bytes, label, origin, args, report) {
  const mime = await reportReceived(bytes, label, origin, report);
  await reportProcessed(bytes, mime, args.flags.has('keep'), report);
  await reportHappened(bytes, mime, report);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  QUIET = args.flags.has('json');
  const report = { generatedAt: new Date().toISOString() };

  const health = await checkHealth(report);
  // process.exitCode, not process.exit(): pdfjs/canvas keep libuv handles open and a hard exit
  // trips an assertion on Windows before the report finishes flushing.
  if (args.flags.has('health')) {
    if (QUIET) console.log(JSON.stringify(report, null, 2));
    process.exitCode = health.reachable ? 0 : 1;
    return;
  }
  if (!health.reachable) {
    say(`\n${bad('Router unreachable — skipping the rest; fix config first.')}`);
    process.exitCode = 1;
    return;
  }

  try {
    if (args.claim || args.md5 || args.recent) {
      const rows = await resolveFromDb(args);
      report.claims = [];
      for (const r of rows) {
        say(`\n${C.bold}══ claim id=${r.id} stored: vendor=${r.vendor ?? 'NULL'} amount=${r.amount ?? 'NULL'} ${r.currency} (${r.created_at.toISOString?.() ?? r.created_at}) ══${C.off}`);
        const sub = {};
        const res = await fetch(r.file_url);
        if (!res.ok) { say(bad(`   file_url -> HTTP ${res.status}`)); continue; }
        await runOne(Buffer.from(await res.arrayBuffer()), r.file_url, `claim id=${r.id}`, args, sub);
        report.claims.push({ id: r.id, stored: { vendor: r.vendor, amount: r.amount }, ...sub });
      }
    } else {
      const src = await loadSource(args);
      // The blank-form failure is intermittent — the same file has both extracted correctly and
      // come back empty. --repeat re-runs stage 4 against identical bytes so an unstable model
      // reply gets caught in the act instead of inferred.
      const runs = Math.max(1, Number(args.repeat) || 1);
      const mime = await reportReceived(src.bytes, src.label, src.origin, report);
      await reportProcessed(src.bytes, mime, args.flags.has('keep'), report);
      report.runs = [];
      for (let n = 1; n <= runs; n += 1) {
        if (runs > 1) say(`\n${C.bold}── run ${n}/${runs} ──${C.off}`);
        const sub = {};
        await reportHappened(src.bytes, mime, sub);
        report.runs.push(sub.happened);
      }
      if (runs > 1) {
        const failed = report.runs.filter((r) => r?.serverStatus !== 'ok').length;
        say(`\n${C.bold}STABILITY${C.off}  ${failed ? bad(`${failed}/${runs} runs returned an empty draft`) : ok(`${runs}/${runs} runs extracted cleanly`)}`);
        const latencies = report.runs.map((r) => r?.latencyMs).filter(Boolean);
        if (latencies.length) row('latency ms', `min ${Math.min(...latencies)} / max ${Math.max(...latencies)}`);
      }
    }
  } catch (err) {
    say(`\n${bad('ERROR: ' + err.message)}`);
    if (QUIET) console.log(JSON.stringify({ ...report, error: err.message }, null, 2));
    process.exitCode = 1;
    return;
  }

  if (QUIET) console.log(JSON.stringify(report, null, 2));
  say('');
})();
