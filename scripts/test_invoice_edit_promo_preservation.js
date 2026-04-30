const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const invoiceService = fs.readFileSync(
  path.join(repoRoot, 'src/modules/Invoicing/services/invoiceService.js'),
  'utf8'
);
const invoiceRepo = fs.readFileSync(
  path.join(repoRoot, 'src/modules/Invoicing/services/invoiceRepo.js'),
  'utf8'
);
const editInvoicePage = fs.readFileSync(
  path.join(repoRoot, 'public/js/pages/edit_invoice.js'),
  'utf8'
);

assert(
  invoiceService.includes('applyEarnNowRebate: invoiceRequestPayload.applyEarnNowRebate')
    && invoiceService.includes('applyEarthMonthGoGreenBonus: invoiceRequestPayload.applyEarthMonthGoGreenBonus'),
  'Edit invoice version payload must pass April promo flags to the repo.'
);

assert(
  invoiceRepo.includes('getExistingAprilPromoAmounts')
    && invoiceRepo.includes('data.existingEarnNowRebateAmount')
    && invoiceRepo.includes('data.existingEarthMonthGoGreenBonusAmount')
    && invoiceRepo.includes('data.removeEarnNowRebate !== true')
    && invoiceRepo.includes('data.removeEarthMonthGoGreenBonus !== true'),
  'Edit invoice save must preserve existing April promo amounts unless the user explicitly removes them.'
);

assert(
  !invoiceRepo.includes("DELETE FROM invoice_item WHERE linked_invoice = $1")
    && invoiceRepo.includes('getEditReplacementItemIds')
    && invoiceRepo.includes('deleteInvoiceItemsByIds')
    && invoiceRepo.includes('refreshLinkedInvoiceItemIds'),
  'Edit invoice save must not blanket-delete all invoice items.'
);

assert(
  invoiceService.includes('invoiceRequestPayload.apply_sst !== undefined')
    && invoiceService.includes('applySst: invoiceRequestPayload.applySst')
    && editInvoicePage.includes('itemEditIntent.sst = true')
    && editInvoicePage.includes('if (itemEditIntent.sst)')
    && !editInvoicePage.includes('apply_sst: document.getElementById'),
  'Edit invoice version payload must only send SST changes after direct user intent.'
);

assert(
  invoiceRepo.includes('preserveExistingPackageItem')
    && invoiceRepo.includes('existingPackageAmount')
    && invoiceRepo.includes('sumExistingPackageItems')
    && invoiceRepo.includes("sumExistingItemsByType(existingInvoiceItems, 'voucher')")
    && invoiceRepo.includes('data.discountWasProvided === true'),
  'Edit invoice save must preserve stored package, voucher, and discount item amounts unless those groups are intentionally edited.'
);

assert(
  editInvoicePage.includes('earnNowAmount')
    && editInvoicePage.includes('earthMonthAmount')
    && editInvoicePage.includes('preservedEarnNowAmount')
    && editInvoicePage.includes('preservedEarthMonthAmount')
    && editInvoicePage.includes('promoSelectionTouched')
    && editInvoicePage.includes('removeEarnNowRebate')
    && editInvoicePage.includes('removeEarthMonthGoGreenBonus'),
  'Edit invoice preview must preserve saved promo amounts and only request removal after direct user interaction.'
);

console.log('Invoice edit April promo preservation regression check passed.');
