const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.use({ channel: 'chrome' });

const html = fs.readFileSync(path.join(__dirname, '../public/templates/seda_register.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/css/tailwind.css'), 'utf8');

for (const width of [390, 1280]) {
    for (const entry of ['/seda-register?id=test-seda', '/seda-public/test-share']) {
        test(`${width}px ${entry}: add five ownership files individually and replace one`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            let files = [];
            let uploadRequests = 0;
            await page.addInitScript(() => {
                window.Swal = { fire: async () => ({ isConfirmed: true }) };
            });
            await page.route('**/*', async route => {
                const request = route.request();
                const pathname = new URL(request.url()).pathname;
                if (pathname === '/seda-register' || pathname.startsWith('/seda-public/')) {
                    return route.fulfill({ contentType: 'text/html', body: html });
                }
                if (pathname === '/css/tailwind.css') {
                    return route.fulfill({ contentType: 'text/css', body: css });
                }
                if (pathname.includes('/upload/property_proof')) {
                    uploadRequests++;
                    const url = `/uploads/ownership-${uploadRequests}.pdf`;
                    files.push(url);
                    return route.fulfill({ json: { success: true, url } });
                }
                if (pathname.includes('/file/property_proof')) {
                    const { url } = request.postDataJSON();
                    files = files.filter(file => file !== url);
                    return route.fulfill({ json: { success: true } });
                }
                if (pathname.startsWith('/api/v1/seda')) {
                    return route.fulfill({ json: { success: true, data: { property_ownership_prove: files } } });
                }
                return route.fulfill({ body: '' });
            });

            await page.goto(`http://ownership.test${entry}`);
            const button = page.locator('#addPropertyProof');
            const count = page.locator('#propertyProofCount');
            const cards = page.locator('#previewPropertyProof .file-preview-card');
            async function addFile(number) {
                await expect(page.locator('#loading')).toBeHidden();
                await expect(button).toBeVisible();
                await expect(button).toBeEnabled();
                const picker = page.waitForEvent('filechooser');
                await button.click();
                const chooser = await picker;
                expect(chooser.isMultiple()).toBe(true);
                await chooser.setFiles({ name: `title-${number}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.0 test') });
                await expect(count).toHaveText(`${number} of 5 files uploaded`);
                await expect(cards).toHaveCount(number);
            }
            for (let number = 1; number <= 5; number++) {
                await addFile(number);
                if (number < 5) await expect(button).toHaveText('Add more ownership files');
            }
            await expect(button).toBeDisabled();
            expect(uploadRequests).toBe(5);
            await page.reload();
            await expect(count).toHaveText('5 of 5 files uploaded');
            await expect(cards).toHaveCount(5);
            await expect(button).toBeDisabled();
            await expect(page.locator('#loading')).toBeHidden();
            await cards.first().getByRole('button', { name: 'Delete', exact: true }).click();
            await expect(count).toHaveText('4 of 5 files uploaded');
            await addFile(5);
            expect(uploadRequests).toBe(6);
            expect(errors).toEqual([]);
        });
    }
}
