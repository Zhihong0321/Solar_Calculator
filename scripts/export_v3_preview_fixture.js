#!/usr/bin/env node

require('dotenv').config();

const pool = require('../src/core/database/pool');
const invoiceRepo = require('../src/modules/Invoicing/services/invoiceRepo');
const { savePreviewSnapshot } = require('../src/modules/Invoicing/services/invoicePreviewStore');

async function main() {
  const tokenOrId = process.argv[2];

  if (!tokenOrId) {
    console.error('Usage: node scripts/export_v3_preview_fixture.js <tokenOrId>');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);

    if (!invoice) {
      throw new Error(`Invoice not found for token/id: ${tokenOrId}`);
    }

    const snapshot = {
      invoice,
      template: invoice.template || {},
      meta: {
        sourceTokenOrId: tokenOrId,
        exportedAt: new Date().toISOString(),
        previewMode: 'local'
      }
    };

    const filePath = savePreviewSnapshot(tokenOrId, snapshot);
    console.log(`Saved V3 preview fixture to ${filePath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed to export V3 preview fixture:', err);
  process.exit(1);
});
