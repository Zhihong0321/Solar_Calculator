/**
 * Client for the EE Business Intelligence API (ee-auto).
 *
 * Both endpoints are start-then-poll: the POST returns 202 with a durable
 * report id, and a worker fills it in. The worker deadline runs to ten minutes,
 * which no chat turn can sit on, so runJob() polls only until its own deadline
 * and then hands back a `pending` result carrying the report id. The caller
 * renders that as a card the agent can refresh.
 */

const DEFAULT_BASE_URL = 'https://ee-auto.up.railway.app';
const POLL_INTERVAL_MS = 3000;
const DEFAULT_DEADLINE_MS = 55000;
const TERMINAL = new Set(['completed', 'partial', 'failed']);

function baseUrl() {
  return (process.env.EE_AUTO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function token() {
  const value = process.env.EE_AUTO_TOKEN;
  if (!value) {
    const err = new Error('No EE_AUTO_TOKEN configured');
    err.code = 'NO_EE_AUTO_TOKEN';
    throw err;
  }
  return value;
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(
      `ee-auto ${res.status}: ${(payload && payload.error) || JSON.stringify(payload || {}).slice(0, 160)}`
    );
    err.code = res.status === 401 ? 'EE_AUTO_UNAUTHORIZED' : 'EE_AUTO_ERROR';
    err.status = res.status;
    throw err;
  }
  return payload;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts a job and polls to a deadline of our choosing.
 * Resolves { state: 'done' | 'pending', report, data }.
 */
async function runJob({ startPath, pollPath, body, deadlineMs = DEFAULT_DEADLINE_MS, onProgress }) {
  const started = await call(startPath, { method: 'POST', body });
  const report = started && started.report;
  if (!report || !report.id) {
    const err = new Error('ee-auto did not return a report id');
    err.code = 'EE_AUTO_ERROR';
    throw err;
  }

  const giveUpAt = Date.now() + deadlineMs;
  let latest = report;

  while (Date.now() < giveUpAt) {
    if (TERMINAL.has(latest.status)) {
      const polled = await call(`${pollPath}/${encodeURIComponent(report.id)}`);
      return { state: 'done', report: polled.report || latest, data: polled.data || null };
    }

    await sleep(POLL_INTERVAL_MS);
    const elapsed = Math.round((Date.now() - (giveUpAt - deadlineMs)) / 1000);
    if (onProgress) onProgress({ seconds: elapsed, status: latest.status });

    const polled = await call(`${pollPath}/${encodeURIComponent(report.id)}`);
    latest = polled.report || latest;
    if (TERMINAL.has(latest.status)) {
      return { state: 'done', report: latest, data: polled.data || null };
    }
  }

  return { state: 'pending', report: latest, data: null };
}

function searchJob({ keyword, place, max, requesterId }, options = {}) {
  return runJob({
    startPath: '/api/business-search',
    pollPath: '/api/business-search',
    body: { keyword, place: place || undefined, max: max || 20, requesterId },
    ...options
  });
}

function researchJob({ companyId, requesterId }, options = {}) {
  return runJob({
    startPath: '/api/company-research',
    pollPath: '/api/company-research',
    body: { companyId: String(companyId), requesterId },
    // Deep research runs longer than a list search; give it the full turn.
    deadlineMs: options.deadlineMs || 75000,
    ...options
  });
}

/** Polls an existing report without starting a new job (the Refresh button). */
async function fetchReport(kind, reportId) {
  const path = kind === 'research' ? '/api/company-research' : '/api/business-search';
  return call(`${path}/${encodeURIComponent(reportId)}`);
}

function isConfigured() {
  return Boolean(process.env.EE_AUTO_TOKEN);
}

module.exports = { searchJob, researchJob, fetchReport, isConfigured };
