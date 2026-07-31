# Removed Route Handlers

This file documents the route handlers removed from `src/modules/Invoicing/api/invoiceViewRoutes.js`

## Legacy View Routes (Lines 874-924)

```javascript
/**
 * GET /legacy-view/:tokenOrId
 * Legacy public or private view of an invoice (V1)
 */
router.get('/legacy-view/:tokenOrId', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);
      if (invoice) {
        const policyInvoice = applyPaymentTermsPolicyToInvoice(invoice, getPaymentTermsPolicyOptions(req));
        const html = invoiceHtmlGenerator.generateInvoiceHtml(policyInvoice, policyInvoice.template);
        res.send(html);
      } else {
        res.status(404).send('Invoice not found');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error viewing legacy invoice:', err);
    res.status(500).send('Error loading invoice');
  }
});

/**
 * GET /legacy-view/:tokenOrId/pdf
 * Legacy PDF generator (V1)
 */
router.get('/legacy-view/:tokenOrId/pdf', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);
      if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
      const policyInvoice = applyPaymentTermsPolicyToInvoice(invoice, getPaymentTermsPolicyOptions(req));
      const html = invoiceHtmlGenerator.generateInvoiceHtml(policyInvoice, policyInvoice.template, { isPdf: true });
      const pdfResult = await externalPdfService.generatePdf(html);
      res.json(pdfResult);
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

## V3 View Routes (Lines 1157-1270)

```javascript
/**
 * GET /view-v3/:tokenOrId
 * Long-form public or private view of an invoice (V3)
 */
router.get('/view-v3/:tokenOrId', async (req, res) => {
  try {
    await renderV3Invoice(req, res);
  } catch (err) {
    console.error('Error viewing invoice V3:', err);
    res.status(500).send('Error loading invoice');
  }
});

router.get('/view-v3-preview/:tokenOrId', async (req, res) => {
  try {
    req.query.preview = 'local';
    await renderV3Invoice(req, res);
  } catch (err) {
    console.error('Error viewing local invoice V3 preview:', err);
    res.status(500).send('Error loading local invoice preview');
  }
});

/**
 * GET /view-v3/:tokenOrId/pdf
 * Generate PDF for an invoice using V3 template
 */
router.get('/view-v3/:tokenOrId/pdf', async (req, res) => {
  try {
    const html = await renderV3Invoice(req, res, { forPdf: true });
    if (!html) {
      return;
    }
    const pdfResult = await externalPdfService.generatePdf(html);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.json(pdfResult);
  } catch (err) {
    console.error('Error generating PDF for V3:', err);
    res.status(500).json({ success: false, error: 'Error generating PDF: ' + err.message });
  }
});

router.get('/view-v3-preview/:tokenOrId/pdf', async (req, res) => {
  try {
    req.query.preview = 'local';
    const html = await renderV3Invoice(req, res, { forPdf: true });
    if (!html) {
      return;
    }
    const pdfResult = await externalPdfService.generatePdf(html);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.json(pdfResult);
  } catch (err) {
    console.error('Error generating local PDF for V3:', err);
    res.status(500).json({ success: false, error: 'Error generating local PDF: ' + err.message });
  }
});

/**
 * POST /view-v3/:tokenOrId/signature
 * Save customer signature for an invoice (v3 route)
 */
router.post('/view-v3/:tokenOrId/signature', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({ success: false, error: 'Signature data is required' });
    }

    const client = await pool.connect();
    try {
      const bubbleId = await invoiceRepo.resolveInvoiceBubbleId(client, tokenOrId);
      if (!bubbleId) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      await client.query(
        `UPDATE invoice
         SET customer_signature = $1,
             signature_date = NOW(),
             updated_at = NOW()
         WHERE bubble_id = $2`,
        [signature, bubbleId]
      );

      res.json({ success: true, message: 'Signature saved successfully' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error saving v3 signature:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lines 1260, 1267, 1270 - V3 route registrations for shared handlers
router.post('/view-v3/:tokenOrId/solar-estimate', handlePublicSolarEstimate);
router.post('/view-v3/:tokenOrId/activity', handleViewerActivity);
router.get('/view-v3/:tokenOrId/tiger-neo-3-proposal', openTigerNeo3Proposal);
```

## Proposal Route (Lines 1272-1324)

```javascript
/**
 * GET /proposal/:shareToken
 * Public view of a proposal
 */
router.get('/proposal/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);

      if (invoice) {
        const policyInvoice = applyPaymentTermsPolicyToInvoice(invoice, getPaymentTermsPolicyOptions(req));
        // Use generateProposalHtml to inject data into the portable-proposal template
        const html = invoiceHtmlGenerator.generateProposalHtml(policyInvoice);
        res.send(html);
      } else {
        res.status(404).send('Proposal not found');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error viewing proposal:', err);
    res.status(500).send('Error loading proposal');
  }
});

/**
 * GET /proposal/:shareToken/pdf
 */
router.get('/proposal/:shareToken/pdf', async (req, res) => {
  try {
    const { shareToken } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);
      if (!invoice) return res.status(404).json({ success: false, error: 'Proposal not found' });
      const policyInvoice = applyPaymentTermsPolicyToInvoice(invoice, getPaymentTermsPolicyOptions(req));
      const html = invoiceHtmlGenerator.generateInvoiceHtml(policyInvoice, policyInvoice.template, { isPdf: true });
      const pdfResult = await externalPdfService.generatePdf(html);
      res.json(pdfResult);
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

## Removed Imports

From the top of `invoiceViewRoutes.js`:

```javascript
const invoiceHtmlGenerator = require('../services/invoiceHtmlGenerator');
const invoiceHtmlGeneratorV3 = require('../services/invoiceHtmlGeneratorV3');
```

## Helper Function Removed

The `renderV3Invoice` helper function (lines ~796-870) was also removed as it was only used by V3 routes.
