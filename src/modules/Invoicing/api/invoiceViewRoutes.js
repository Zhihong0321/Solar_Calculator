const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const tariffPool = require('../../../core/database/tariffPool');
const invoiceRepo = require('../services/invoiceRepo');
const invoiceHtmlGenerator = require('../services/invoiceHtmlGenerator');
const invoiceHtmlGeneratorV2 = require('../services/invoiceHtmlGeneratorV2');
const externalPdfService = require('../services/externalPdfService');
const { calculateSolarSavings } = require('../../SolarCalculator/services/solarCalculatorService');

const router = express.Router();

const DEFAULT_PUBLIC_SOLAR_ESTIMATE = Object.freeze({
  sunPeakHour: 3.4,
  morningUsage: 30,
  smpPrice: 0.2703,
  afaRate: 0,
  historicalAfaRate: 0,
  percentDiscount: 0,
  fixedDiscount: 0,
  batterySize: 0,
  systemPhase: 3
});

function buildPublicSolarEstimateResponse(calculationResult, averageBill, morningUsage) {
  const requestedBillAmount = Number(averageBill);
  const matchedBillAmount = Number(calculationResult.details?.billBefore);
  const beforeSolarBill = Number.isFinite(matchedBillAmount) ? matchedBillAmount : requestedBillAmount;
  const monthlySaving = Number(calculationResult.monthlySavings);
  const billAfterSolar = Number(calculationResult.details?.billAfter);
  const exportSaving = Number(calculationResult.details?.exportSaving);
  const payableAfterSolar = Number(calculationResult.details?.estimatedPayableAfterSolar);
  const estimatedNewBillAmount = Number.isFinite(payableAfterSolar)
    ? payableAfterSolar
    : (Number.isFinite(billAfterSolar) && Number.isFinite(exportSaving)
      ? Math.max(0, billAfterSolar - exportSaving)
    : (Number.isFinite(beforeSolarBill) && Number.isFinite(monthlySaving)
      ? Math.max(0, beforeSolarBill - monthlySaving)
      : null));

  return {
    requested_bill_amount: Number.isFinite(requestedBillAmount) ? Number(requestedBillAmount.toFixed(2)) : null,
    customer_average_tnb: Number.isFinite(beforeSolarBill) ? Number(beforeSolarBill.toFixed(2)) : null,
    estimated_saving: Number.isFinite(monthlySaving) ? Number(monthlySaving.toFixed(2)) : null,
    estimated_new_bill_amount: Number.isFinite(estimatedNewBillAmount) ? Number(estimatedNewBillAmount.toFixed(2)) : null,
    bill_after_solar_before_export: Number.isFinite(billAfterSolar) ? Number(billAfterSolar.toFixed(2)) : null,
    export_earning: Number.isFinite(exportSaving) ? Number(exportSaving.toFixed(2)) : null,
    day_usage_share: Number.isFinite(Number(morningUsage)) ? Number(morningUsage) : DEFAULT_PUBLIC_SOLAR_ESTIMATE.morningUsage,
    charts: calculationResult.charts || null,
    assumptions: {
      sunPeakHour: DEFAULT_PUBLIC_SOLAR_ESTIMATE.sunPeakHour,
      offsetPercent: Number.isFinite(Number(morningUsage)) ? Number(morningUsage) : DEFAULT_PUBLIC_SOLAR_ESTIMATE.morningUsage,
      batterySize: DEFAULT_PUBLIC_SOLAR_ESTIMATE.batterySize,
      systemPhase: DEFAULT_PUBLIC_SOLAR_ESTIMATE.systemPhase
    }
  };
}

async function handlePublicSolarEstimate(req, res) {
  try {
    const { tokenOrId } = req.params;
    const averageBill = Number(req.body?.averageBill);
    const shouldSave = Boolean(req.body?.save);
    const requestedMorningUsage = Number(req.body?.morningUsage);
    const morningUsage = Number.isFinite(requestedMorningUsage)
      ? requestedMorningUsage
      : DEFAULT_PUBLIC_SOLAR_ESTIMATE.morningUsage;

    if (!Number.isFinite(averageBill) || averageBill <= 0) {
      return res.status(400).json({ success: false, error: 'Average bill amount must be greater than 0.' });
    }
    if (!Number.isFinite(morningUsage) || morningUsage < 1 || morningUsage > 100) {
      return res.status(400).json({ success: false, error: 'Day usage share must be between 1 and 100.' });
    }

    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      const panelQty = parseInt(invoice.panel_qty, 10);
      const panelRating = parseInt(invoice.panel_rating, 10);

      if (!Number.isFinite(panelQty) || panelQty <= 0 || !Number.isFinite(panelRating) || panelRating <= 0) {
        return res.status(400).json({
          success: false,
          error: 'This quotation package does not have enough panel details for public solar estimation.'
        });
      }

      const calculationResult = await calculateSolarSavings(pool, tariffPool, {
        ...DEFAULT_PUBLIC_SOLAR_ESTIMATE,
        amount: averageBill,
        panelType: panelRating,
        overridePanels: panelQty,
        morningUsage
      });

      const estimate = buildPublicSolarEstimateResponse(calculationResult, averageBill, morningUsage);

      if (shouldSave) {
        const bubbleId = await invoiceRepo.resolveInvoiceBubbleId(client, tokenOrId);
        if (!bubbleId) {
          return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        await client.query(
          `UPDATE invoice
           SET customer_average_tnb = $1,
               estimated_saving = $2,
               estimated_new_bill_amount = $3,
               updated_at = NOW()
           WHERE bubble_id = $4`,
          [
            estimate.customer_average_tnb,
            estimate.estimated_saving,
            estimate.estimated_new_bill_amount,
            bubbleId
          ]
        );
      }

      res.json({
        success: true,
        saved: shouldSave,
        data: estimate
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error recalculating public solar estimate:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to recalculate solar estimate' });
  }
}

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
        const html = invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template);
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
      const html = invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template, { isPdf: true });
      const pdfResult = await externalPdfService.generatePdf(html);
      res.json(pdfResult);
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /view/:tokenOrId
 * Public or private view of an invoice
 */
router.get('/view/:tokenOrId', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const layout = String(req.query.layout || '').toLowerCase();
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);

      if (invoice) {
        const html = invoiceHtmlGeneratorV2.generateInvoiceHtmlV2(invoice, invoice.template, { layout });
        res.send(html);
      } else {
        res.status(404).send('Invoice not found');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error viewing invoice:', err);
    res.status(500).send('Error loading invoice');
  }
});

/**
 * GET /view2/:tokenOrId
 * Public or private view of an invoice using V2 template
 */
router.get('/view2/:tokenOrId', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const layout = String(req.query.layout || '').toLowerCase();
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);

      if (invoice) {
        const html = invoiceHtmlGeneratorV2.generateInvoiceHtmlV2(invoice, invoice.template, { layout });
        res.send(html);
      } else {
        res.status(404).send('Invoice not found');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error viewing invoice schema v2:', err);
    res.status(500).send('Error loading invoice');
  }
});

/**
 * GET /view/:tokenOrId/pdf
 * Generate PDF for an invoice
 */
router.get('/view/:tokenOrId/pdf', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);

      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      const html = invoiceHtmlGeneratorV2.generateInvoiceHtmlV2(invoice, invoice.template, { forPdf: true });
      // This returns { success: true, downloadUrl: ... }, NOT a buffer
      const pdfResult = await externalPdfService.generatePdf(html);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.json(pdfResult);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ success: false, error: 'Error generating PDF: ' + err.message });
  }
});

/**
 * GET /view2/:tokenOrId/pdf
 * Generate PDF for an invoice using V2 template
 */
router.get('/view2/:tokenOrId/pdf', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);

      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      const html = invoiceHtmlGeneratorV2.generateInvoiceHtmlV2(invoice, invoice.template, { isPdf: true });
      // This returns { success: true, downloadUrl: ... }, NOT a buffer
      const pdfResult = await externalPdfService.generatePdf(html);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.json(pdfResult);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error generating PDF for V2:', err);
    res.status(500).json({ success: false, error: 'Error generating PDF: ' + err.message });
  }
});

/**
 * POST /view/:tokenOrId/signature
 * Save customer signature for an invoice
 */
router.post('/view/:tokenOrId/signature', async (req, res) => {
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
        console.error('[SIGNATURE] Could not resolve bubbleId for token:', tokenOrId);
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      console.log('[SIGNATURE] Saving for bubbleId:', bubbleId);

      await client.query(
        `UPDATE invoice 
         SET customer_signature = $1, 
             signature_date = NOW(),
             updated_at = NOW()
         WHERE bubble_id = $2`,
        [signature, bubbleId]
      );

      res.json({ success: true, message: 'Signature saved successfully' });
    } catch (dbErr) {
      console.error('[SIGNATURE] Database error:', dbErr);
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[SIGNATURE] Critical error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /view2/:tokenOrId/signature
 * Save customer signature for an invoice (v2 route)
 */
router.post('/view2/:tokenOrId/signature', async (req, res) => {
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
        console.error('[SIGNATURE-V2] Could not resolve bubbleId for token:', tokenOrId);
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
    } catch (dbErr) {
      console.error('[SIGNATURE-V2] Database error:', dbErr);
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[SIGNATURE-V2] Critical error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/view/:tokenOrId/solar-estimate', handlePublicSolarEstimate);
router.post('/view2/:tokenOrId/solar-estimate', handlePublicSolarEstimate);

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
        // Use generateProposalHtml to inject data into the portable-proposal template
        const html = invoiceHtmlGenerator.generateProposalHtml(invoice);
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

      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Proposal not found' });
      }

      // If generateProposalHtml is missing, fallback to generateInvoiceHtml
      const html = invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template, { isPdf: true });
      // This returns { success: true, downloadUrl: ... }, NOT a buffer
      const pdfResult = await externalPdfService.generatePdf(html);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.json(pdfResult);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error generating Proposal PDF:', err);
    res.status(500).json({ success: false, error: 'Error generating PDF: ' + err.message });
  }
});

module.exports = router;
