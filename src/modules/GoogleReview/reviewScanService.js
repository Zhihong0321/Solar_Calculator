const pool = require('../../core/database/pool');
const campaign = require('./campaignService');

/**
 * Scans our own Google Maps profile for the newest reviews (scraper.tech Google Maps API) and keeps them in
 * google_review_scanned. The Reviews page lists everything posted since REVIEWS_SINCE, each with an image card.
 * Nothing here stops anything else: a failed scan is recorded and labelled on the page, and the next scan tries again.
 */

const BUSINESS_ID = '0x31da6db9f2e0d68f:0xe30f21260dcdbc70'; // Eternalgy Sdn Bhd on Google Maps
const REVIEWS_SINCE = '2026-11-11T16:00:00Z'; // 12 Nov 2026, 00:00 Malaysia time
const SCRAPER_URL = 'https://mcp.scraper.tech';
const SCAN_EVERY_MS = 60 * 60 * 1000; // hourly: the free plan allows 1,000 requests a month
const FIRST_SCAN_DELAY_MS = 90 * 1000;
const MAX_PAGES = 12;
const REQUEST_TIMEOUT_MS = 60 * 1000;

/** The scraper credential: pasted on the Reviews page (kept in the database), else the SCRAPER_TECH_KEY variable if one exists. */
async function getKey() {
  try {
    const { rows } = await pool.query('SELECT api_key FROM google_review_scan_state WHERE id = 1');
    const stored = String((rows[0] && rows[0].api_key) || '').trim();
    if (stored) return stored;
  } catch (err) {
    console.error('[ReviewScan] could not read the saved key:', err.message);
  }
  return String(process.env.SCRAPER_TECH_KEY || '').trim();
}

async function mcpCall(name, args) {
  const key = await getKey();
  if (!key) throw new Error('no scraper key saved yet');
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${SCRAPER_URL}/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
        signal: controller.signal
      });
      const raw = await res.text();
      const line = raw.match(/data: (.*)/);
      const body = JSON.parse(line ? line[1] : raw);
      const text = body && body.result && body.result.content && body.result.content[0] && body.result.content[0].text;
      if (!text) throw new Error(`scraper returned no data (HTTP ${res.status})`);
      return JSON.parse(text);
    } catch (err) {
      lastErr = err.name === 'AbortError' ? new Error('scraper timed out') : err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(String(lastErr && lastErr.message).replace(key, '<key>'));
}

async function saveState(ok, note, added) {
  try {
    await pool.query(
      `UPDATE google_review_scan_state SET last_run_at = NOW(), last_ok = $1, last_note = $2, last_added = $3 WHERE id = 1`,
      [ok, String(note || '').slice(0, 300), added]
    );
  } catch (err) {
    console.error('[ReviewScan] could not save state:', err.message);
  }
}

let scanning = false;

/** One scan: newest reviews first, page by page, until a page brings nothing new or is older than REVIEWS_SINCE. */
async function scan() {
  if (scanning) return { skipped: true, note: 'A scan is already running' };
  scanning = true;
  try {
    await campaign.ensureSchema();
    if (!(await getKey())) {
      await saveState(false, 'Scanner needs its key: paste it on the Reviews page', 0);
      return { ok: false, added: 0, note: 'Scanner needs its key: paste it on the Reviews page' };
    }
    let cursor = null;
    let added = 0;
    let pages = 0;
    let oldPagesInARow = 0; // Google's "newest" order is not perfectly strict, so stop only after two old pages in a row
    const sinceMs = new Date(REVIEWS_SINCE).getTime();
    for (; pages < MAX_PAGES; pages += 1) {
      const args = { business_id: BUSINESS_ID, limit: '5', sort: 'newest', country: 'my' };
      if (cursor) args.cursor = cursor;
      const out = await mcpCall('reviews', args);
      const reviews = (out && out.data && Array.isArray(out.data.reviews)) ? out.data.reviews : [];
      let newInPage = 0;
      let newestOldEnough = true;
      for (const r of reviews) {
        if (!r || !r.review_id) continue;
        const posted = r.iso_date ? new Date(`${String(r.iso_date).replace(' ', 'T')}Z`) : null;
        const postedOk = posted && !Number.isNaN(posted.getTime()) ? posted : null;
        if (!postedOk || postedOk.getTime() >= sinceMs) newestOldEnough = false;
        const ins = await pool.query(
          `INSERT INTO google_review_scanned
             (review_id, reviewer_name, reviewer_link, reviewer_reviews, rating, review_text, review_text_en, posted_at, review_link, photos)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (review_id) DO NOTHING`,
          [r.review_id, r.user_name || null, r.user_link || null, Number.isFinite(Number(r.user_total_reviews)) ? Number(r.user_total_reviews) : null,
            Number.isFinite(Number(r.review_rate)) ? Number(r.review_rate) : null, r.review_text || null,
            (r.translations && r.translations.en) || null, postedOk, r.review_link || null, JSON.stringify(Array.isArray(r.review_photos) ? r.review_photos : [])]
        );
        newInPage += ins.rowCount;
      }
      added += newInPage;
      cursor = out && out.cursor;
      oldPagesInARow = newestOldEnough ? oldPagesInARow + 1 : 0;
      if (!reviews.length || !cursor || oldPagesInARow >= 2 || newInPage === 0) break;
    }
    await saveState(true, `Scanned ${pages + 1} page(s), ${added} new review(s)`, added);
    return { ok: true, added, note: `${added} new review(s)` };
  } catch (err) {
    console.error('[ReviewScan] scan failed:', err.message);
    await saveState(false, `Scan failed: ${err.message}`, 0);
    return { ok: false, added: 0, note: err.message };
  } finally {
    scanning = false;
  }
}

let timer = null;
function startWorker() {
  if (timer) return;
  setTimeout(() => { scan(); }, FIRST_SCAN_DELAY_MS).unref();
  timer = setInterval(() => { scan(); }, SCAN_EVERY_MS);
  if (timer.unref) timer.unref();
}

// ---------- reading ----------

const NAME_NOISE = /\((atap|ecn|ec)\)|[^a-z一-鿿 ]/gi;
const normName = (s) => String(s || '').toLowerCase().replace(NAME_NOISE, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => normName(s).split(' ').filter((t) => t.length > 1);

/** Customers we messaged whose name looks like the reviewer's name. A hint only: a person still confirms. */
function possibleCustomers(reviewerName, customers) {
  const a = tokens(reviewerName);
  if (!a.length) return [];
  const hits = [];
  for (const c of customers) {
    const b = tokens(c.customer_name);
    if (!b.length) continue;
    const [small, big] = a.length <= b.length ? [a, b] : [b, a];
    const overlap = small.filter((t) => big.includes(t)).length;
    if (overlap >= 2 || (small.length === 1 && overlap === 1 && big.length <= 2) || normName(reviewerName) === normName(c.customer_name)) {
      hits.push({ name: c.customer_name, sent_at: c.sent_at });
    }
    if (hits.length >= 2) break;
  }
  return hits;
}

async function list() {
  await campaign.ensureSchema();
  const [rows, state, customers] = await Promise.all([
    pool.query(
      `SELECT id, review_id, reviewer_name, reviewer_link, reviewer_reviews, rating, review_text, review_text_en, posted_at, review_link, photos, first_seen_at
         FROM google_review_scanned WHERE posted_at >= $1 ORDER BY posted_at DESC`, [REVIEWS_SINCE]),
    pool.query('SELECT last_run_at, last_ok, last_note, last_added FROM google_review_scan_state WHERE id = 1'),
    pool.query(`SELECT customer_name, sent_at FROM google_review_campaign_message WHERE is_test = FALSE AND status = 'Sent'`)
  ]);
  const reviews = rows.rows.map((r) => ({ ...r, possible_customers: possibleCustomers(r.reviewer_name, customers.rows) }));
  const rated = reviews.filter((r) => Number.isFinite(r.rating));
  return {
    since: REVIEWS_SINCE,
    scanner: { last_run_at: (state.rows[0] || {}).last_run_at, last_ok: (state.rows[0] || {}).last_ok, last_note: (state.rows[0] || {}).last_note, last_added: (state.rows[0] || {}).last_added, key_present: Boolean(await getKey()) },
    total: reviews.length,
    average_rating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating, 0) / rated.length) * 10) / 10 : null,
    reviews
  };
}

// ---------- image card ("screenshot") ----------

const xml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const isWide = (ch) => /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch);

function wrap(text, maxWidth, fontSize, maxLines) {
  const lines = [];
  let line = '';
  let width = 0;
  const widthOf = (ch) => (isWide(ch) ? fontSize : fontSize * 0.54);
  for (const ch of String(text || '').replace(/\r/g, '')) {
    if (ch === '\n') { lines.push(line); line = ''; width = 0; continue; }
    const w = widthOf(ch);
    if (width + w > maxWidth) {
      // break at the last space for latin text when possible
      const sp = line.lastIndexOf(' ');
      if (sp > 10 && !isWide(ch)) { lines.push(line.slice(0, sp)); line = line.slice(sp + 1); width = [...line].reduce((a, c) => a + widthOf(c), 0); }
      else { lines.push(line); line = ''; width = 0; }
    }
    line += ch;
    width += w;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = `${cut[maxLines - 1].slice(0, -1)}…`; return cut; }
  return lines;
}

function renderCardSvg(r) {
  const W = 640;
  const pad = 28;
  const textLines = wrap(r.review_text || '(no comment)', W - pad * 2, 17, 9);
  const enLines = r.review_text_en && r.review_text_en !== r.review_text ? wrap(r.review_text_en, W - pad * 2, 14, 4) : [];
  const stars = Number.isFinite(r.rating) ? Math.max(0, Math.min(5, r.rating)) : 0;
  const when = r.posted_at ? new Date(r.posted_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const initial = (String(r.reviewer_name || '?').trim()[0] || '?').toUpperCase();
  const hue = [...String(r.reviewer_name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  let y = 136;
  const body = textLines.map((l) => { const t = `<text x="${pad}" y="${y}" font-size="17" fill="#202124">${xml(l)}</text>`; y += 25; return t; }).join('');
  let y2 = y + 8;
  const en = enLines.length ? `<text x="${pad}" y="${y2}" font-size="12" fill="#80868b">Translated</text>${(y2 += 18, '')}` + enLines.map((l) => { const t = `<text x="${pad}" y="${y2}" font-size="14" fill="#5f6368">${xml(l)}</text>`; y2 += 20; return t; }).join('') : '';
  const bottom = (enLines.length ? y2 : y) + 14;
  const H = bottom + 46;
  const star = (i) => `<text x="${pad + 56 + i * 22}" y="98" font-size="20" fill="${i < stars ? '#fbbc04' : '#dadce0'}">★</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Arial, 'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC', sans-serif">
<rect width="${W}" height="${H}" rx="16" fill="#ffffff"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="#dadce0"/>
<circle cx="${pad + 20}" cy="${pad + 22}" r="22" fill="hsl(${hue},55%,45%)"/><text x="${pad + 20}" y="${pad + 29}" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">${xml(initial)}</text>
<text x="${pad + 56}" y="${pad + 18}" font-size="17" font-weight="700" fill="#202124">${xml(r.reviewer_name || 'Google user')}</text>
<text x="${pad + 56}" y="${pad + 37}" font-size="12" fill="#5f6368">${r.reviewer_reviews ? `${xml(r.reviewer_reviews)} review${r.reviewer_reviews === 1 ? '' : 's'} · ` : ''}Google Maps review</text>
${[0, 1, 2, 3, 4].map(star).join('')}<text x="${pad + 56 + 5 * 22 + 8}" y="97" font-size="13" fill="#5f6368">${xml(when)}</text>
${body}${en}
<line x1="${pad}" y1="${H - 38}" x2="${W - pad}" y2="${H - 38}" stroke="#e8eaed"/>
<text x="${pad}" y="${H - 15}" font-size="12" fill="#80868b">Eternalgy Sdn Bhd · Google review recorded ${xml(r.first_seen_at ? new Date(r.first_seen_at).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric' }) : '')}</text>
</svg>`;
}

async function getCardSvg(id) {
  await campaign.ensureSchema();
  const { rows } = await pool.query('SELECT * FROM google_review_scanned WHERE id = $1', [Number(id) || 0]);
  return rows[0] ? renderCardSvg(rows[0]) : null;
}

/** Saves the key pasted on the Reviews page, then scans straight away. The key is never sent back to any page. */
async function saveKeyAndScan(key) {
  const clean = String(key || '').trim().replace(/^https?:\/\/mcp\.scraper\.tech\//i, '');
  if (clean.length < 16 || /\s/.test(clean)) return { ok: false, note: 'That does not look like the scraper key' };
  await campaign.ensureSchema();
  await pool.query('UPDATE google_review_scan_state SET api_key = $1 WHERE id = 1', [clean]);
  return scan();
}

module.exports = { scan, startWorker, list, getCardSvg, saveKeyAndScan, REVIEWS_SINCE };
