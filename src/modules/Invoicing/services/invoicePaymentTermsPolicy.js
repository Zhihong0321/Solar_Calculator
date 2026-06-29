const EFFECTIVE_DATE_KEY = '2026-07-01';

const LEGACY_TERMS = Object.freeze({
  sedaPercent: '60%',
  installationPercent: '35%'
});

const CURRENT_TERMS = Object.freeze({
  sedaPercent: '75%',
  installationPercent: '20%'
});

const CURRENT_PAYMENT_TERMS_TEXT = [
  'Our Payment Terms:',
  '5% Downpayment upon Signing Up: Customers are required to make a 5% downpayment of the total project cost upon signing up for our solar PV installation services.',
  '',
  '75% Upon SEDA Approved + Before Installation: Upon approval by the Sustainable Energy Development Authority (SEDA) Malaysia and before installation starts, customers are required to make an additional payment of 75% of the total project cost.',
  '',
  '20% After Installation Complete: The remaining 20% of the total project cost is due after the completion of the installation.'
].join('\n');

function buildPaymentTermsSchedule(terms) {
  return [
    {
      percent: '5%',
      title: 'Downpayment',
      description: 'Upon signing up'
    },
    {
      percent: terms.sedaPercent,
      title: 'SEDA approved + before installation',
      description: 'After SEDA approval, before installation starts'
    },
    {
      percent: terms.installationPercent,
      title: 'Installation completion',
      description: 'After installation complete'
    }
  ];
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getDateKey(value) {
  if (!value) return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

function getInvoicePolicyDateKey(invoice = {}) {
  return getDateKey(
    invoice.invoice_date
    || invoice.created_at
    || invoice.created_date
    || invoice.createdDate
  );
}

function shouldUseCurrentPaymentTerms(invoice = {}) {
  if (invoice.payment_terms_preview_after_effective_date === true) {
    return true;
  }

  const dateKey = getInvoicePolicyDateKey(invoice);
  return Boolean(dateKey && dateKey >= EFFECTIVE_DATE_KEY);
}

function getPaymentTermsSchedule(invoice = {}) {
  const forceCurrentPreview = invoice.payment_terms_preview_after_effective_date === true;
  const dateKey = getInvoicePolicyDateKey(invoice);
  const useCurrentByDate = Boolean(dateKey && dateKey >= EFFECTIVE_DATE_KEY);
  const useCurrentTerms = forceCurrentPreview || useCurrentByDate;

  return {
    effectiveLabel: forceCurrentPreview && !useCurrentByDate
      ? 'After 1 Jul 2026 preview'
      : (useCurrentTerms ? 'Applies from 1 Jul 2026' : 'Applies before 1 Jul 2026'),
    canPreviewCurrentTerms: !useCurrentTerms,
    isAfterEffectivePreview: forceCurrentPreview && !useCurrentByDate,
    rows: buildPaymentTermsSchedule(useCurrentTerms ? CURRENT_TERMS : LEGACY_TERMS)
  };
}

function replacePaymentPercentages(source, terms) {
  if (!source) return source;
  const seda = terms.sedaPercent;
  const installation = terms.installationPercent;

  return String(source)
    .replace(/\b(?:60|75)%\s+Upon\s+SEDA\s+Approval\b/gi, `${seda} Upon SEDA Approved + Before Installation`)
    .replace(/\b(?:60|75)%\s+Upon\s+SEDA\s+Approved\s+\+\s+Before\s+Installation\b/gi, `${seda} Upon SEDA Approved + Before Installation`)
    .replace(/\bUpon\s+approval\s+by\s+the\s+Sustainable\s+Energy\s+Development\s+Authority\s+\(SEDA\)\s+Malaysia\s+for\s+residential\s+PV\s+installations,\s+customers\s+are\s+required\s+to\s+make\b/gi, 'Upon approval by the Sustainable Energy Development Authority (SEDA) Malaysia and before installation starts, customers are required to make')
    .replace(/\badditional\s+payment\s+of\s+(?:60|75)%/gi, `additional payment of ${seda}`)
    .replace(/\b5%\s*\+\s*(?:60|75)%\s+Refund\b/gi, `5% + ${seda} Refund`)
    .replace(/\bsubsequent\s+(?:60|75)%\s+fee\b/gi, `subsequent ${seda} fee`)
    .replace(/\b(?:35|20)%\s+Upon\s+Installation\s+Complete\b/gi, `${installation} After Installation Complete`)
    .replace(/\bThe\s+remaining\s+(?:35|20)%/gi, `The remaining ${installation}`)
    .replace(/\b(?:35|20)%\s+Payment\s+After\s+Installation\s+Complete\b/gi, `${installation} Payment After Installation Complete`)
    .replace(/\bThe\s+(?:35|20)%\s+payment\s+made\b/gi, `The ${installation} payment made`);
}

function hasPaymentTermsBlock(termsText) {
  return /Our\s+Payment\s+Terms\s*:/i.test(String(termsText || ''));
}

function applyPaymentTermsToText(termsText, useCurrentTerms) {
  const text = String(termsText || '').trim();
  const terms = useCurrentTerms ? CURRENT_TERMS : LEGACY_TERMS;

  if (text) {
    const updatedText = replacePaymentPercentages(text, terms);
    if (useCurrentTerms && !hasPaymentTermsBlock(updatedText)) {
      return `${updatedText}\n\n${CURRENT_PAYMENT_TERMS_TEXT}`;
    }
    return updatedText;
  }

  return useCurrentTerms ? CURRENT_PAYMENT_TERMS_TEXT : text;
}

function withPaymentTermsPolicyOptions(invoice = {}, options = {}) {
  if (options.forceCurrentTerms === true) {
    return {
      ...(invoice || {}),
      payment_terms_preview_after_effective_date: true
    };
  }

  return invoice || {};
}

function applyPaymentTermsPolicy(invoice = {}, template = {}, options = {}) {
  const policyInvoice = withPaymentTermsPolicyOptions(invoice, options);
  const templateData = { ...(template || {}) };
  const useCurrentTerms = shouldUseCurrentPaymentTerms(policyInvoice);
  const originalTerms = templateData.terms_and_conditions || '';

  if (originalTerms || useCurrentTerms) {
    templateData.terms_and_conditions = applyPaymentTermsToText(originalTerms, useCurrentTerms);
  }

  return templateData;
}

function applyPaymentTermsPolicyToInvoice(invoice = {}, options = {}) {
  if (!invoice || typeof invoice !== 'object') return invoice;
  const policyInvoice = withPaymentTermsPolicyOptions(invoice, options);
  return {
    ...policyInvoice,
    template: applyPaymentTermsPolicy(policyInvoice, policyInvoice.template || {})
  };
}

module.exports = {
  EFFECTIVE_DATE_KEY,
  CURRENT_PAYMENT_TERMS_TEXT,
  applyPaymentTermsPolicy,
  applyPaymentTermsPolicyToInvoice,
  applyPaymentTermsToText,
  getPaymentTermsSchedule,
  getInvoicePolicyDateKey,
  hasPaymentTermsBlock,
  shouldUseCurrentPaymentTerms,
  withPaymentTermsPolicyOptions
};
