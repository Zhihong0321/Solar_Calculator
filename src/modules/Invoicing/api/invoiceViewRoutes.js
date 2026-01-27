const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const invoiceRepo = require('../services/invoiceRepo');
const invoiceHtmlGenerator = require('../services/invoiceHtmlGenerator');
const externalPdfService = require('../services/externalPdfService');

const router = express.Router();

/**
 * GET /view/:tokenOrId
 * Public or private view of an invoice
 */
router.get('/view/:tokenOrId', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);

      if (invoice) {
        const html = await invoiceHtmlGenerator.generateInvoiceHtml(client, invoice);
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
 * GET /view/:tokenOrId/pdf
 * Generate PDF for an invoice
 */
router.get('/view/:tokenOrId/pdf', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const client = await pool.connect();
    try {
      const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);

      if (invoice) {

      if (!invoice) {
        return res.status(404).send('Invoice not found');
      }

      const html = await invoiceHtmlGenerator.generateInvoiceHtml(client, invoice, { isPdf: true });
      const pdfBuffer = await externalPdfService.generatePdf(html);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=Invoice-${invoice.invoice_number || 'INV'}.pdf`);
      res.send(pdfBuffer);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).send('Error generating PDF');
  }
});

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
        res.sendFile(path.join(__dirname, '../../../../portable-proposal/index.html'));
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
        return res.status(404).send('Proposal not found');
      }

      const html = await invoiceHtmlGenerator.generateProposalHtml(client, invoice, { isPdf: true });
      const pdfBuffer = await externalPdfService.generatePdf(html);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=Proposal-${invoice.invoice_number || 'PRO'}.pdf`);
      res.send(pdfBuffer);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error generating Proposal PDF:', err);
    res.status(500).send('Error generating PDF');
  }
});

module.exports = router;
