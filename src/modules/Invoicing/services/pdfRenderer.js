/**
 * In-app HTML -> PDF renderer (headless Chromium via puppeteer-core).
 *
 * Replaces the old external pdf-gen service (pdf-gen-production-6c81.up.railway.app),
 * which no longer exists on Railway ("Application not found"), so every
 * "Download PDF" button on /view/:token pages was dead.
 *
 * Chromium location: PDF_CHROME_PATH (or PUPPETEER_EXECUTABLE_PATH), otherwise the first
 * known install path that exists (Linux container paths, then Windows Chrome/Edge).
 */

const fs = require('fs');
const puppeteer = require('puppeteer-core');

const CHROME_CANDIDATES = [
  process.env.PDF_CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);

let browserPromise = null;

function resolveChromePath() {
  return CHROME_CANDIDATES.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (_err) {
      return false;
    }
  }) || null;
}

async function launchBrowser() {
  const executablePath = resolveChromePath();
  if (!executablePath) {
    throw new Error('No Chromium/Chrome found for PDF rendering. Set PDF_CHROME_PATH.');
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
}

// One shared browser; a new one is launched on demand if it was closed or crashed.
function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser()
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Relative URLs (logo, fonts, images) in the invoice HTML resolve against the public origin.
function withBaseHref(html, baseUrl) {
  if (!baseUrl) return html;
  const baseTag = `<base href="${escapeAttr(String(baseUrl).replace(/\/+$/, ''))}/">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, (match) => `${match}${baseTag}`);
  }
  return `${baseTag}${html}`;
}

/**
 * Render an HTML document to an A4 PDF buffer.
 * @param {string} html - full HTML document
 * @param {object} [options]
 * @param {string} [options.baseUrl] - origin used to resolve relative URLs, e.g. https://calculator.atap.solar
 * @returns {Promise<Buffer>}
 */
async function renderHtmlToPdf(html, { baseUrl = null } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(withBaseHref(String(html || ''), baseUrl), {
      waitUntil: 'load',
      timeout: 60000
    });
    // Wait for web fonts so the PDF does not fall back to system fonts.
    await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
      preferCSSPageSize: false
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  renderHtmlToPdf
};
