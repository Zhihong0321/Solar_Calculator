const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const navScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'navigation.js'), 'utf8');
const navCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'navigation-shell.css'), 'utf8');

test.use({
    viewport: { width: 390, height: 844 }
});

function buildPageHtml(url) {
    const pathname = url.pathname;

    const routeBodies = {
        '/agent/home': `
            <header class="md:hidden">Legacy dashboard header</header>
            <nav class="mobile-bottom-nav">Legacy dashboard nav</nav>
            <main>
                <a id="quick-invoices" href="/my-invoice">Open invoices</a>
                <a id="quick-seda" href="/my-seda">Open seda</a>
            </main>
        `,
        '/my-customers': `
            <nav>Legacy customers nav</nav>
            <main>
                <p>Customers page</p>
            </main>
        `,
        '/my-invoice': `
            <nav>Legacy invoices nav</nav>
            <div class="bg-white border-b border-slate-200 w-full sticky">Legacy filters</div>
            <main>
                <a id="open-office" href="/invoice-office?id=inv-1">Open office</a>
            </main>
            <div class="fixed bottom-0 left-0 right-0 z-50">Legacy floating panel</div>
        `,
        '/invoice-office': `
            <header>Legacy invoice office header</header>
            <main>
                <a id="open-chat" href="/invoice-chat?id=inv-1">Open chat</a>
            </main>
        `,
        '/invoice-chat': `
            <header>Legacy invoice chat header</header>
            <main>Chat body</main>
        `,
        '/my-seda': `
            <nav class="top-nav">Legacy seda top nav</nav>
            <main>
                <a id="open-check-seda" href="/check-seda">Check seda</a>
            </main>
        `,
        '/check-seda': `
            <nav class="top-nav">Legacy check seda nav</nav>
            <main>Check seda body</main>
        `,
        '/activity-report': `
            <header class="md:hidden">Legacy activity header</header>
            <nav class="mobile-bottom-nav">Legacy activity nav</nav>
            <main>Activity body</main>
        `,
        '/domestic': `
            <main id="domestic-landing">Signed out</main>
        `
    };

    const body = routeBodies[pathname] || `<main>${pathname}</main>`;

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <title>${pathname}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; }
            main { padding: 1rem; min-height: 100vh; }
            header, nav, div { box-sizing: border-box; }
        </style>
    </head>
    <body>
        ${body}
        <script>
            window.__actionLog = [];
            window.openModal = () => window.__actionLog.push('openModal');
            window.openSubmitModal = () => window.__actionLog.push('openSubmitModal');
            window.showComposeModal = () => window.__actionLog.push('showComposeModal');
            window.showCreateModal = () => window.__actionLog.push('showCreateModal');
        </script>
        <script src="/js/navigation.js"></script>
    </body>
    </html>`;
}

async function mockApp(page, roles = []) {
    await page.context().route('https://nav.test/**', async (route) => {
        const url = new URL(route.request().url());

        if (url.pathname === '/js/navigation.js') {
            await route.fulfill({ status: 200, contentType: 'application/javascript', body: navScript });
            return;
        }

        if (url.pathname === '/css/navigation-shell.css') {
            await route.fulfill({ status: 200, contentType: 'text/css', body: navCss });
            return;
        }

        if (url.pathname === '/api/agent/me') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ name: 'Mobile Agent', access_level: roles })
            });
            return;
        }

        if (url.pathname === '/api/admin/logout') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
            return;
        }

        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: buildPageHtml(url)
        });
    });
}

test('renders shared mobile shell and switches root tabs', async ({ page }) => {
    await mockApp(page, ['kc']);
    await page.goto('https://nav.test/agent/home');

    await expect(page.locator('#agent-mobile-shell-top')).toBeVisible();
    await expect(page.locator('header.md\\:hidden')).toBeHidden();

    await page.click('button[data-agent-nav-target="/my-customers"]');
    await expect(page).toHaveURL(/\/my-customers$/);

    await page.click('button[data-agent-nav-target="/activity-report"]');
    await expect(page).toHaveURL(/\/activity-report$/);
});

test('keeps invoice stack back behavior stable', async ({ page }) => {
    await mockApp(page, []);
    await page.goto('https://nav.test/agent/home');

    await page.click('#quick-invoices');
    await expect(page).toHaveURL(/\/my-invoice$/);

    await page.click('#open-office');
    await expect(page).toHaveURL(/\/invoice-office\?id=inv-1$/);

    await page.click('#open-chat');
    await expect(page).toHaveURL(/\/invoice-chat\?id=inv-1$/);

    await page.click('button[data-agent-nav-back]');
    await expect(page).toHaveURL(/\/invoice-office\?id=inv-1$/);

    await page.click('button[data-agent-nav-back]');
    await expect(page).toHaveURL(/\/my-invoice$/);
});

test('falls back to parent page on deep linked invoice office', async ({ page }) => {
    await mockApp(page, []);
    await page.goto('https://nav.test/invoice-office?id=inv-1');

    await page.click('button[data-agent-nav-back]');
    await expect(page).toHaveURL(/\/my-invoice$/);
});

test('tools sheet supports role-aware visibility and seda fallback', async ({ page }) => {
    await mockApp(page, ['kc']);
    await page.goto('https://nav.test/agent/home');

    await page.click('button[data-agent-nav-tools]');
    await expect(page.locator('.agent-shell-tool-item', { hasText: 'Vouchers' })).toBeVisible();
    await expect(page.locator('.agent-shell-tool-item', { hasText: 'Sales KPI' })).toBeVisible();
    await expect(page.locator('.agent-shell-tool-item', { hasText: 'Team Management' })).toHaveCount(0);

    const externalLink = page.locator('.agent-shell-tool-item[href="https://solar-analysis-app-production.up.railway.app/"]');
    await expect(externalLink).toHaveAttribute('target', '_blank');

    await page.locator('.agent-shell-tool-item', { hasText: 'SEDA' }).click();
    await expect(page).toHaveURL(/\/my-seda$/);

    await page.click('#open-check-seda');
    await expect(page).toHaveURL(/\/check-seda$/);

    await page.click('button[data-agent-nav-back]');
    await expect(page).toHaveURL(/\/my-seda$/);
});

test('logout uses shared session flow', async ({ page }) => {
    await mockApp(page, []);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('https://nav.test/my-customers');

    await page.click('button[data-agent-nav-tools]');
    await page.click('button[data-agent-nav-logout]');
    await expect(page).toHaveURL(/\/domestic$/);
    await expect(page.locator('#domestic-landing')).toBeVisible();
});
