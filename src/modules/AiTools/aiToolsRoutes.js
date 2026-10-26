const path = require('path');
const express = require('express');
const pool = require('../../core/database/pool');
const { requireAuth } = require('../../core/middleware/auth');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

const router = express.Router();

function buildInvoiceCreationPrompt({ baseUrl, apiKey, agentPhone, agentName }) {
  return `# TASK: Create a solar quotation (invoice) for a customer

You can create a draft solar quotation by calling one HTTP API. The system picks the best solar package automatically from the customer's TNB bill.

## Who is creating the quotation
Agent: ${agentName || '(name not set)'}
Agent phone: ${agentPhone}
Always send this phone number as "agentPhone". Do not ask me for it.

## API
POST ${baseUrl}/api/external/v1/invoices
Headers:
  Content-Type: application/json
  X-Api-Key: ${apiKey}

## JSON body
- tnbBill (number, REQUIRED): customer's monthly TNB bill in RM, greater than 0.
- afa (number, REQUIRED): AFA rate in RM/kWh, between -0.5 and 0.5. Use 0 if I do not know it.
- customerName (string, REQUIRED): customer's full name.
- agentPhone (string, REQUIRED): ${agentPhone}
- customerPhone (string, optional): customer's phone number.
- discountFixed (number, optional): discount in RM.
- discountPercent (number, optional): discount in percent, 0 to 100.

Example:
curl -X POST ${baseUrl}/api/external/v1/invoices \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${apiKey}" \\
  -d '{"tnbBill":600,"afa":0,"customerName":"Mr. Example","agentPhone":"${agentPhone}"}'

## Rules
1. Ask me for the customer name and TNB bill if I have not given them. Use afa = 0 if I do not know it.
2. Never invent the customer name, bill amount or discount. Only send a discount if I gave one.
3. Create each quotation ONCE. Never retry a request that may have succeeded, because a retry creates a duplicate invoice. If the result is unclear, tell me and let me decide.
4. The invoice is created as a draft with the package chosen by the calculator.

## Reading the result
- 201: success. Tell me the invoice number (data.invoiceNumber), package name (data.packageName), panel count (data.panelQty), total (data.totalAmount), and the link: ${baseUrl}{data.invoiceLink}
- 400: input problem. Fix it or ask me.
- 401: API key rejected. Tell me; do not guess keys.
- 404: no user found for the agent phone above.
- 409: more than one user has that phone number.
- 422: the discount is above the package's allowed limit, or no package matches. Ask me for a lower discount.
- 500: report the error text to me. Do not retry.
`;
}

const HOSTED_HTML_PROMPT = `# TASK: Deploy Static Web App to HTML Host Engine

You are tasked with preparing, packaging, and publishing a web application to the HTML Host Engine service at https://ee-html.up.railway.app.

---

## Service Credentials & Overview
- Service Base URL: https://ee-html.up.railway.app
- API Key: eternalgy2026
- Auth Header: Authorization: Bearer eternalgy2026 (or x-api-key: eternalgy2026)
- Admin Console: https://ee-html.up.railway.app/admin (key: eternalgy2026)

---

## Strict Rules & Constraints
1. Static Files Only:
   - Only static assets: HTML, CSS, JavaScript, images, fonts, JSON, WASM, etc.
   - NO server-side runtime (no Node.js, Python, PHP, server routes, or database connections).
   - Any API calls must execute client-side in the browser.
   - NEVER embed the API key into client-side code (HTML, CSS, JS).

2. Zip Bundle Structure:
   - Must be uploaded as a .zip archive (max upload size: 145.4 MB).
   - index.html MUST be at the root of the archive (zip the contents of your build/dist folder, not the parent folder).

3. Asset Paths MUST Be Relative:
   - The app is served under the subpath https://ee-html.up.railway.app/app/<slug>/.
   - All links, CSS, and script tags must use relative paths (e.g. href="./style.css" or src="assets/app.js").
   - Do NOT use root-absolute paths like href="/style.css" or src="/app.js" as they will break under the subpath.

4. Slug Guidelines:
   - Lowercase a-z, digits 0-9, and hyphens - (1–63 characters).
   - Must start and end with an alphanumeric character.

5. Tags (sales-app):
   - If the app is intended for the Sales Agent OS / Dashboard ("Useful Tools"), include: tags=sales-app.
   - Untagged apps are accessible via direct link only and will not show up in the sales tools directory.

---

## Deployment Steps

### 1. Bundle into ZIP
Windows PowerShell:
Compress-Archive -Path "C:\\path\\to\\app\\*" -DestinationPath "build.zip" -Force

Linux / macOS:
cd /path/to/app-folder && zip -r ../build.zip . && cd ..

### 2. Deploy via API (POST /api/apps)
curl -X POST https://ee-html.up.railway.app/api/apps \\
  -H "Authorization: Bearer eternalgy2026" \\
  -F "bundle=@build.zip;type=application/zip" \\
  -F "slug=<your-app-slug>" \\
  -F "name=<Display Name>" \\
  -F "tags=sales-app"

(Omit tags=sales-app if private).

### 3. Update Existing App (PUT /api/apps/:slug)
curl -X PUT https://ee-html.up.railway.app/api/apps/<your-app-slug> \\
  -H "Authorization: Bearer eternalgy2026" \\
  -F "bundle=@build.zip;type=application/zip" \\
  -F "name=<Display Name>"

### 4. Delete App
curl -X DELETE https://ee-html.up.railway.app/api/apps/<your-app-slug> \\
  -H "Authorization: Bearer eternalgy2026"

---

## Expected Output
When deployment succeeds (HTTP 201 / 200), return the live URL:
https://ee-html.up.railway.app/app/<your-app-slug>/`;

router.get('/api/ai-tools/hosted-html-prompt', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, prompt: HOSTED_HTML_PROMPT });
});

router.get('/api/ai-tools/consent-letter', requireAuth, (req, res) => {
  res.download(
    path.join(__dirname, 'assets', 'seda-consent-letter-individual-to-individual.pdf'),
    'SEDA Consent Letter Ownership (Individual to Individual).pdf',
    err => {
      if (err && !res.headersSent) {
        console.error('[AI Tools] Failed to send consent letter:', err);
        res.status(500).json({ success: false, error: 'Failed to download the consent letter.' });
      }
    }
  );
});

router.get('/ai-tools', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', '..', 'public', 'templates', 'ai_tools.html'));
});

router.get('/api/ai-tools/invoice-creation-prompt', requireAuth, async (req, res) => {
  try {
    const identities = [getRequestUserBubbleId(req), getRequestLegacyUserId(req)].filter(Boolean);
    if (identities.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid session data.' });
    }

    const result = await pool.query(
      `SELECT name, contact
       FROM "user"
       WHERE bubble_id = ANY($1::text[]) OR id::text = ANY($1::text[])
       LIMIT 1`,
      [identities]
    );
    const agentPhone = String(result.rows[0]?.contact || '').replace(/\D/g, '');
    if (!agentPhone) {
      return res.status(409).json({
        success: false,
        error: 'Your account has no phone number. Add it in Settings first, then try again.'
      });
    }

    const apiKey = process.env.JWT_SECRET;
    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'API key is not configured on the server.' });
    }

    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;
    const prompt = buildInvoiceCreationPrompt({
      baseUrl,
      apiKey,
      agentPhone,
      agentName: result.rows[0]?.name
    });

    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, prompt });
  } catch (err) {
    console.error('[AI Tools] Failed to build invoice creation prompt:', err);
    return res.status(500).json({ success: false, error: 'Failed to build the prompt.' });
  }
});

module.exports = router;
