/**
 * WHAT:    Public self-describing docs for the solar calculator APIs.
 * WHY:     Hosted HTML already exposes /api/hosted-html/docs for AI/humans.
 *          The result-page API needs the same pass-this-URL contract.
 * OWNS:    Manifest, HTML docs page, text summary, and the GET handler.
 * NOT:     Does not run calculations (→ resultPageService.js / routes.js).
 * DANGER:  Keep this public (no auth). Do not require a login cookie here —
 *          the calculator APIs themselves are public.
 */

const { PAGE_DEFAULTS, SURIA_REBATE_AMOUNT } = require('../services/resultPageService');

function requestBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function buildSolarCalculationDocs(baseUrl) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const pagePath = '/api/solar-calculation/page';
  const jsonPath = '/api/solar-calculation';
  const billPath = '/api/calculate-bill';
  const docsPath = '/api/solar-calculation/docs';

  return {
    name: 'Eternalgy — Domestic Solar Calculator API',
    version: '1.0',
    base_url: base,
    purpose: 'One API call returns a complete HTML result page for a domestic solar ROI calculation. The same engine as /domestic.',
    auth: 'none — public. Optional login cookie is attached when present, for activity logging only.',
    docs: {
      method: 'GET',
      path: docsPath,
      formats: {
        html: 'Browser default, or ?format=html',
        json: 'curl default, or ?format=json, or Accept: application/json',
        text: 'Accept: text/plain or ?format=txt'
      }
    },
    defaults: {
      ...PAGE_DEFAULTS,
      suriaRebateAmount: SURIA_REBATE_AMOUNT,
      note: 'A call with only `amount` uses these defaults, matching public/domestic-v4.html. suriaRebate=true adds RM 3000 into fixedDiscount.'
    },
    endpoints: [
      {
        method: 'GET',
        path: docsPath,
        auth: 'none',
        purpose: 'THIS endpoint. Self-describing API docs. Show this URL to an AI agent or open it in a browser.'
      },
      {
        method: 'GET',
        path: billPath,
        auth: 'none',
        purpose: 'Match a monthly TNB bill to the closest domestic tariff row. Returns usage_kwh used by the solar calc.',
        query: {
          amount: 'number (required) — monthly bill in RM',
          afaRate: 'number (optional) — historical AFA used only to match the current bill'
        },
        returns: '{ tariff, inputAmount, afaRate }',
        curl: `curl -G "${base}${billPath}" --data-urlencode "amount=500" --data-urlencode "afaRate=-0.0047"`
      },
      {
        method: 'GET',
        path: jsonPath,
        auth: 'none (optional user cookie for activity log)',
        purpose: 'JSON calculator. Same math as /domestic. Caller must send validated fields; this route does not apply page defaults.',
        query: {
          amount: 'number (required)',
          sunPeakHour: '3.0–4.5',
          morningUsage: '1–100 (percent of solar generation used in the morning)',
          panelType: 'wattage, e.g. 650',
          smpPrice: '0.19–0.2703',
          afaRate: 'projected AFA for the after-solar bill',
          historicalAfaRate: 'AFA used to match the current bill',
          percentDiscount: 'number',
          fixedDiscount: 'RM, already including SuRIA if the client added it',
          systemPhase: '1 or 3',
          inverterType: 'string | hybrid',
          batterySize: '0 | 16 | 32 | 48',
          overridePanels: 'optional integer ≥ 1'
        },
        returns: '{ config, monthlySavings, details, selectedPackage, billCycleModes, ... }',
        curl: `curl -G "${base}${jsonPath}" --data-urlencode "amount=500" --data-urlencode "sunPeakHour=3.4" --data-urlencode "morningUsage=30" --data-urlencode "panelType=650" --data-urlencode "smpPrice=0.2703" --data-urlencode "afaRate=0" --data-urlencode "historicalAfaRate=-0.0047" --data-urlencode "percentDiscount=0" --data-urlencode "fixedDiscount=3000" --data-urlencode "systemPhase=3" --data-urlencode "inverterType=string" --data-urlencode "batterySize=0"`
      },
      {
        method: 'GET',
        path: pagePath,
        auth: 'none (optional user cookie for activity log)',
        purpose: 'Return a complete HTML result page. Applies live-planner defaults so `amount` alone is enough.',
        query: {
          amount: 'number (required) — monthly bill in RM. Also accepts billAmount.',
          sunPeakHour: `number, default ${PAGE_DEFAULTS.sunPeakHour}`,
          morningUsage: `percent, default ${PAGE_DEFAULTS.morningUsage}`,
          panelType: `watts, default ${PAGE_DEFAULTS.panelType}`,
          smpPrice: `default ${PAGE_DEFAULTS.smpPrice}`,
          afaRate: `projected AFA, default ${PAGE_DEFAULTS.afaRate}`,
          historicalAfaRate: `bill-match AFA, default ${PAGE_DEFAULTS.historicalAfaRate}`,
          percentDiscount: `default ${PAGE_DEFAULTS.percentDiscount}`,
          fixedDiscount: `RM extra discount, default ${PAGE_DEFAULTS.fixedDiscount}`,
          suriaRebate: `true|false, default ${PAGE_DEFAULTS.suriaRebate} (adds RM ${SURIA_REBATE_AMOUNT} to fixedDiscount)`,
          systemPhase: `1 or 3, default ${PAGE_DEFAULTS.systemPhase}`,
          inverterType: `string|hybrid, default ${PAGE_DEFAULTS.inverterType}`,
          batterySize: `0|16|32|48, default ${PAGE_DEFAULTS.batterySize}`,
          batteryLossPercent: `0–20, default ${PAGE_DEFAULTS.batteryLossPercent}`,
          batteryDodPercent: `0–10, default ${PAGE_DEFAULTS.batteryDodPercent}`,
          overridePanels: 'optional integer ≥ 1',
          cycle: 'fullMonth | under28Days, default fullMonth',
          format: 'html (default) | json',
          logActivity: 'set to 0 to skip activity_log'
        },
        returns_html: 'text/html result page (Step 4 cards: savings, before/after, energy flow, breakdown, 25-year forecast, package)',
        returns_json: '{ success, html, result, billCycleModes, inputs, cycle }',
        curl: `curl -G "${base}${pagePath}" --data-urlencode "amount=500"`
      },
      {
        method: 'POST',
        path: pagePath,
        auth: 'none (optional user cookie for activity log)',
        purpose: 'Same as GET page, with a JSON body. Body fields override query string.',
        body: {
          amount: 'number (required)',
          sunPeakHour: 'number',
          morningUsage: 'number',
          panelType: 'number',
          batterySize: '0 | 16 | 32 | 48',
          suriaRebate: 'boolean',
          cycle: 'fullMonth | under28Days',
          format: 'html | json'
        },
        curl: `curl -X POST "${base}${pagePath}" -H "Content-Type: application/json" -d "{\\"amount\\":500}"`
      }
    ],
    validation: {
      amount: '> 0',
      sunPeakHour: '3.0–4.5',
      morningUsage: '1–100',
      smpPrice: '0.19–0.2703',
      batterySize: '0, 16, 32, or 48 kWh'
    },
    related_ui: '/domestic',
    quickstart_for_ai: [
      `1. GET ${base}${docsPath}  ← this endpoint`,
      `2. Open ${base}${pagePath}?amount=500 in a browser — that is the result page.`,
      `3. Minimum body/query is { "amount": 500 }. Defaults match the live /domestic planner, including SuRIA RM ${SURIA_REBATE_AMOUNT}.`,
      `4. For raw numbers instead of a page, GET ${base}${jsonPath} (no defaults — send every required field) or ${base}${pagePath}?amount=500&format=json.`,
      '5. Do not add SuRIA into fixedDiscount yourself when suriaRebate is true — the page API already folds it in.',
      '6. morningUsage is a percent of monthly solar generation, not of household load.',
      '7. Invalid inputs return 400. HTML callers get an HTML error page; JSON callers get { error, details }.'
    ]
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderDocsText(manifest) {
  const lines = [
    manifest.name,
    '='.repeat(manifest.name.length),
    '',
    `Base URL:  ${manifest.base_url}`,
    `Auth:      ${manifest.auth}`,
    '',
    manifest.purpose,
    '',
    'Quickstart:',
    ...manifest.quickstart_for_ai.map((line) => `  ${line}`),
    '',
    'Endpoints:',
    ...manifest.endpoints.map((endpoint) => {
      const parts = [`  ${endpoint.method.padEnd(6)} ${endpoint.path}`, `    ${endpoint.purpose}`];
      if (endpoint.curl) parts.push(`    ${endpoint.curl}`);
      return parts.join('\n');
    }),
    '',
    'Validation:',
    ...Object.entries(manifest.validation).map(([key, value]) => `  ${key}: ${value}`),
    '',
    `Related UI: ${manifest.related_ui}`
  ];
  return lines.join('\n');
}

function renderFieldTable(fields) {
  if (!fields) return '';
  return Object.entries(fields).map(([key, value]) => `
    <tr>
      <td><code>${escapeHtml(key)}</code></td>
      <td>${escapeHtml(value)}</td>
    </tr>`).join('');
}

function renderDocsHtml(manifest) {
  const endpoints = manifest.endpoints.map((endpoint) => `
    <article class="card">
      <div class="method">${escapeHtml(endpoint.method)} <span>${escapeHtml(endpoint.path)}</span></div>
      <p>${escapeHtml(endpoint.purpose)}</p>
      ${endpoint.query ? `<h3>Query</h3><table>${renderFieldTable(endpoint.query)}</table>` : ''}
      ${endpoint.body ? `<h3>JSON body</h3><table>${renderFieldTable(endpoint.body)}</table>` : ''}
      ${endpoint.curl ? `<pre><code>${escapeHtml(endpoint.curl)}</code></pre>` : ''}
    </article>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(manifest.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #bbf7d0; color: #111827; }
    main { max-width: 760px; margin: 0 auto; padding: 28px 16px 48px; }
    h1 { font-size: 26px; font-weight: 800; line-height: 1.2; overflow-wrap: break-word; }
    .sub { color: #6b7280; margin: 8px 0 20px; line-height: 1.5; overflow-wrap: break-word; }
    .card { background: #fff; border-radius: 16px; padding: 18px 16px; margin-bottom: 12px; overflow-wrap: break-word; }
    .method { font-size: 13px; font-weight: 800; color: #16a34a; margin-bottom: 8px; }
    .method span { color: #111827; }
    p { font-size: 14px; line-height: 1.5; color: #374151; }
    h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin: 14px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 6px 0; vertical-align: top; border-top: 1px solid #f3f4f6; }
    td:first-child { width: 180px; color: #14532d; }
    pre { background: #0d1f0f; color: #dcfce7; border-radius: 12px; padding: 12px; overflow-x: auto; font-size: 12px; margin-top: 12px; white-space: pre-wrap; word-break: break-word; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .hero { background: #0d1f0f; color: #fff; border-radius: 20px; padding: 22px 20px; margin-bottom: 16px; }
    .hero p { color: #86efac; }
    a { color: #16a34a; }
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#86efac">API docs</div>
      <h1>${escapeHtml(manifest.name)}</h1>
      <p class="sub" style="color:#86efac">${escapeHtml(manifest.purpose)}</p>
      <p style="color:#9ca3af;font-size:12px">${escapeHtml(manifest.auth)}</p>
    </div>
    <div class="card">
      <h3>Quickstart</h3>
      ${manifest.quickstart_for_ai.map((line) => `<p style="margin-bottom:6px">${escapeHtml(line)}</p>`).join('')}
    </div>
    ${endpoints}
    <div class="card">
      <h3>Also</h3>
      <p>JSON machine copy: <a href="${escapeHtml(manifest.docs.path)}?format=json">${escapeHtml(manifest.docs.path)}?format=json</a></p>
      <p>Related UI: <a href="${escapeHtml(manifest.related_ui)}">${escapeHtml(manifest.related_ui)}</a></p>
    </div>
  </main>
</body>
</html>`;
}

function wantsHtmlDocs(req) {
  const format = String(req.query?.format || '').toLowerCase();
  if (format === 'html') return true;
  if (format === 'json' || format === 'txt' || format === 'text') return false;
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html')) return true;
  return false;
}

function wantsTextDocs(req) {
  const format = String(req.query?.format || '').toLowerCase();
  if (format === 'txt' || format === 'text') return true;
  const accept = String(req.headers.accept || '');
  return accept.includes('text/plain') && !accept.includes('text/html');
}

function handleSolarCalculationDocs(req, res) {
  const manifest = buildSolarCalculationDocs(requestBaseUrl(req));
  if (wantsHtmlDocs(req)) {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderDocsHtml(manifest));
  }
  if (wantsTextDocs(req)) {
    return res.type('text/plain').send(renderDocsText(manifest));
  }
  return res.json(manifest);
}

module.exports = {
  buildSolarCalculationDocs,
  renderDocsHtml,
  renderDocsText,
  handleSolarCalculationDocs
};
