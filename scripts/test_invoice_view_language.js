const assert = require('assert');
const path = require('path');
const { chromium } = require('@playwright/test');
const { generateInvoiceHtmlV2 } = require('../src/modules/Invoicing/services/invoiceHtmlGeneratorV2');

(async () => {
  const html = generateInvoiceHtmlV2({ bubble_id: 'test', customer_name: 'Before', items: [], total_amount: 12000 }, {});
  assert.ok(!html.includes('onclick="downloadPdf()"'));
  assert.ok(!html.includes('onclick="downloadInvoicePdf('));
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://invoice.test/view/test?payment_terms_preview=current');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: path.resolve(__dirname, '../public/js/invoice-view-language.js') });
    await page.locator('.nav-lang').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-Hans');
    assert.equal(await page.locator('.pkg-l').textContent(), '推荐方案');
    assert.ok((await page.locator('.meta-v').allTextContents()).includes('Before'));
    assert.ok(page.url().includes('payment_terms_preview=current'));
    await page.locator('.pkg-l').evaluate(el => { el.textContent = 'Recommended Package'; });
    await page.waitForFunction(() => document.querySelector('.pkg-l').textContent === '推荐方案');
    await page.locator('.nav-lang').click();
    assert.equal(await page.locator('.pkg-l').textContent(), 'Recommended Package');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.evaluate(() => history.replaceState(null, '', '?lang=zh-Hans'));
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: path.resolve(__dirname, '../public/js/invoice-view-language.js') });
    assert.equal(await page.locator('.pkg-l').textContent(), '推荐方案');
    console.log('Invoice language toggle and PDF removal browser checks passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
