const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const tariffPool = require('../../../core/database/tariffPool');
const invoiceRepo = require('../services/invoiceRepo');
const invoiceHtmlGenerator = require('../services/invoiceHtmlGenerator');
const invoiceHtmlGeneratorV2 = require('../services/invoiceHtmlGeneratorV2');
const invoiceHtmlGeneratorV3 = require('../services/invoiceHtmlGeneratorV3');
const { loadPreviewSnapshot } = require('../services/invoicePreviewStore');
const { normalizeV3Locale } = require('../services/invoiceV3Content');
const externalPdfService = require('../services/externalPdfService');
const { normalizeSolarEstimateFields } = require('../services/solarEstimateValues');
const { calculateSolarSavings } = require('../../SolarCalculator/services/solarCalculatorService');
const { getBillCycleMetrics, normalizeBillCycleMode } = require('../../SolarCalculator/services/billCycleModeService');

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

function buildPublicSolarEstimateResponse(calculationResult, averageBill, morningUsage, sunPeakHour, billCycleMode) {
  const resolvedBillCycleMode = normalizeBillCycleMode(billCycleMode);
  const cycleMetrics = getBillCycleMetrics(calculationResult, resolvedBillCycleMode);
  const normalizedEstimate = normalizeSolarEstimateFields({
    requestedBillAmount: averageBill,
    customerAverageTnb: calculationResult.details?.billBefore,
    estimatedSaving: cycleMetrics.selected?.estimated_saving ?? calculationResult.monthlySavings,
    billAfterSolarBeforeExport: cycleMetrics.selected?.bill_after_solar_before_export ?? calculationResult.details?.billAfter,
    exportEarning: cycleMetrics.selected?.export_earning ?? calculationResult.details?.exportSaving,
    payableAfterSolar: cycleMetrics.selected?.estimated_new_bill_amount ?? calculationResult.details?.estimatedPayableAfterSolar
  });

  return {
    requested_bill_amount: normalizedEstimate.requestedBillAmount,
    customer_average_tnb: normalizedEstimate.beforeSolarBill,
    estimated_saving: normalizedEstimate.estimatedSaving,
    estimated_new_bill_amount: normalizedEstimate.estimatedNewBillAmount,
    bill_after_solar_before_export: normalizedEstimate.billAfterSolarBeforeExport,
    export_earning: normalizedEstimate.exportEarning,
    bill_cycle_modes: cycleMetrics.modes,
    selected_bill_cycle_mode: resolvedBillCycleMode,
    day_usage_share: Number.isFinite(Number(morningUsage)) ? Number(morningUsage) : DEFAULT_PUBLIC_SOLAR_ESTIMATE.morningUsage,
    charts: calculationResult.charts || null,
    assumptions: {
      sunPeakHour: Number.isFinite(Number(sunPeakHour)) ? Number(sunPeakHour) : DEFAULT_PUBLIC_SOLAR_ESTIMATE.sunPeakHour,
      offsetPercent: Number.isFinite(Number(morningUsage)) ? Number(morningUsage) : DEFAULT_PUBLIC_SOLAR_ESTIMATE.morningUsage,
      billCycleMode: resolvedBillCycleMode,
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
    const requestedSunPeakHour = Number(req.body?.sunPeakHour);
    const requestedMorningUsage = Number(req.body?.morningUsage);
    const requestedBillCycleMode = normalizeBillCycleMode(req.body?.billCycleMode);

    if (!Number.isFinite(averageBill) || averageBill <= 0) {
      return res.status(400).json({ success: false, error: 'Average bill amount must be greater than 0.' });
    }

    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      const storedSunPeakHour = Number(invoice?.solar_sun_peak_hour);
      const storedMorningUsage = Number(invoice?.solar_morning_usage_percent);
      const sunPeakHour = Number.isFinite(requestedSunPeakHour)
        ? requestedSunPeakHour
        : (Number.isFinite(storedSunPeakHour)
          ? storedSunPeakHour
          : DEFAULT_PUBLIC_SOLAR_ESTIMATE.sunPeakHour);
      const morningUsage = Number.isFinite(requestedMorningUsage)
        ? requestedMorningUsage
        : (Number.isFinite(storedMorningUsage)
          ? storedMorningUsage
          : DEFAULT_PUBLIC_SOLAR_ESTIMATE.morningUsage);

      if (!Number.isFinite(sunPeakHour) || sunPeakHour < 3.0 || sunPeakHour > 4.5) {
        return res.status(400).json({ success: false, error: 'Sun Peak Hour must be between 3.0 and 4.5.' });
      }
      if (!Number.isFinite(morningUsage) || morningUsage < 1 || morningUsage > 100) {
        return res.status(400).json({ success: false, error: 'Day usage share must be between 1 and 100.' });
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
        sunPeakHour,
        panelType: panelRating,
        overridePanels: panelQty,
        morningUsage
      });

      const estimate = buildPublicSolarEstimateResponse(
        calculationResult,
        averageBill,
        morningUsage,
        sunPeakHour,
        requestedBillCycleMode
      );

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
               solar_sun_peak_hour = $4,
               solar_morning_usage_percent = $5,
               updated_at = NOW()
           WHERE bubble_id = $6`,
          [
            estimate.customer_average_tnb,
            estimate.estimated_saving,
            estimate.estimated_new_bill_amount,
            Number(sunPeakHour.toFixed(2)),
            Number(morningUsage.toFixed(2)),
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

function isLocalV3PreviewRequest(req) {
  const previewFlag = String(req.query.preview || req.query.source || '').toLowerCase();
  return previewFlag === 'local' || req.path.startsWith('/view-v3-preview/');
}

function resolveV3Locale(req, source) {
  return normalizeV3Locale(
    req.query.lang
    || req.query.locale
    || source?.meta?.locale
    || source?.invoice?.locale
    || 'en'
  );
}

function buildV3PreviewUrls(tokenOrId, previewMode, locale) {
  const encodedToken = encodeURIComponent(tokenOrId);
  const basePath = previewMode === 'local'
    ? `/view-v3-preview/${encodedToken}`
    : `/view-v3/${encodedToken}`;
  const buildUrl = (targetLocale) => {
    const query = new URLSearchParams();
    if (previewMode === 'local') {
      query.set('preview', 'local');
    }
    if (targetLocale && targetLocale !== 'en') {
      query.set('lang', targetLocale);
    }
    const queryString = query.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };
  return {
    currentViewUrl: buildUrl(locale),
    pdfUrl: buildUrl(locale).replace(basePath, `${basePath}/pdf`),
    languageSwitchUrls: {
      en: buildUrl('en'),
      'zh-Hans': buildUrl('zh-Hans'),
      'ms-MY': buildUrl('ms-MY')
    }
  };
}

async function loadV3InvoiceForRequest(client, tokenOrId, previewMode) {
  if (previewMode === 'local') {
    const snapshot = loadPreviewSnapshot(tokenOrId);
    if (snapshot && snapshot.invoice) {
      return {
        invoice: snapshot.invoice,
        template: snapshot.template || snapshot.invoice.template || {},
        meta: snapshot.meta || null,
        previewMode: 'local'
      };
    }
  }

  const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);
  if (!invoice) {
    return null;
  }

  return {
    invoice,
    template: invoice.template || {},
    meta: null,
    previewMode: 'live'
  };
}

async function renderV3Invoice(req, res, { forPdf = false } = {}) {
  const { tokenOrId } = req.params;
  const layout = String(req.query.layout || '').toLowerCase();
  const previewMode = isLocalV3PreviewRequest(req) ? 'local' : 'live';
  const client = await pool.connect();

  try {
    const source = await loadV3InvoiceForRequest(client, tokenOrId, previewMode);

    if (!source) {
      if (previewMode === 'local') {
        return res.status(404).send('Local V3 preview snapshot not found');
      }
      return res.status(404).send('Invoice not found');
    }

    const locale = resolveV3Locale(req, source);
    const urls = buildV3PreviewUrls(tokenOrId, source.previewMode, locale);
    const html = invoiceHtmlGeneratorV3.generateInvoiceHtmlV3(source.invoice, source.template, {
      layout,
      forPdf,
      previewMode: source.previewMode,
      locale,
      currentViewUrl: urls.currentViewUrl,
      pdfUrl: urls.pdfUrl,
      languageSwitchUrls: urls.languageSwitchUrls
    });

    if (forPdf) {
      return html;
    }

    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    return res.send(html);
  } finally {
    client.release();
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
    console.error('[SIGNATURE-V3] Critical error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/view/:tokenOrId/solar-estimate', handlePublicSolarEstimate);
router.post('/view2/:tokenOrId/solar-estimate', handlePublicSolarEstimate);
router.post('/view-v3/:tokenOrId/solar-estimate', handlePublicSolarEstimate);

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
