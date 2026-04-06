function parseQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
        invoiceId: params.get('id') || '',
        nextUrl: params.get('next') || '',
        sourceInvoiceId: params.get('source_invoice_id') || ''
    };
}

function resolveNextUrl(nextUrl, invoiceId) {
    if (nextUrl) return nextUrl;
    if (invoiceId) return `/invoice-office?id=${encodeURIComponent(invoiceId)}`;
    return '/my-invoice';
}

document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('invoiceVoucherStepRoot');
    if (!root || !window.InvoiceVoucherStep) return;

    const { invoiceId, nextUrl, sourceInvoiceId } = parseQuery();
    const voucherStep = window.InvoiceVoucherStep.create(root, {
        title: 'Edit Vouchers',
        subtitle: 'This fallback page stays available, but the same voucher editor is now shared with create and edit quotation.',
        applyLabel: 'Apply and Continue',
        skipLabel: 'Skip',
        onApplied: () => {
            window.location.href = resolveNextUrl(nextUrl, invoiceId);
        },
        onSkipped: () => {
            window.location.href = resolveNextUrl(nextUrl, invoiceId);
        }
    });

    await voucherStep.load({ invoiceId, nextUrl, sourceInvoiceId });
});
