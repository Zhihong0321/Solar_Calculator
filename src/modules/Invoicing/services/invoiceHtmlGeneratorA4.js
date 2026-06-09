// invoiceHtmlGeneratorA4.js
//
// A redesigned A4 print preview for the V3 invoice view.
// Renders a true 210mm × 297mm A4 layout (3 pages) with a real
// @media print stylesheet and an on-screen toolbar. Designed to be
// opened via `?layout=a4` on /view-v3/.

const { normalizeSolarEstimateFields } = require('./solarEstimateValues');
const { getV3Copy } = require('./invoiceV3Content');

/* ----------------------------- helpers ----------------------------- */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `RM ${n.toFixed(2)}` : 'RM 0.00';
}

function formatSignedMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'RM 0.00';
  return `${n < 0 ? '−' : ''}RM ${Math.abs(n).toFixed(2)}`;
}

function formatNumber(value, digits = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function formatDate(value, locale = 'en-MY') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: '2-digit' });
}

function isTigerNeo3(text) {
  const t = String(text || '').toLowerCase();
  return t.includes('tiger neo 3') || t.includes('tigerneo3')
    || t.includes('jinko solar tiger neo') || t.includes('jinkosolar tiger neo');
}

function hasKeyword(text, keyword) {
  return String(text || '').toLowerCase().includes(String(keyword || '').toLowerCase());
}

/* --------------------------- copy helpers -------------------------- */

function getA4Copy(locale) {
  // Reuses getV3Copy where possible; adds A4-specific labels.
  const base = getV3Copy(locale) || getV3Copy('en');
  const isZh = String(locale || '').toLowerCase().startsWith('zh');
  const isMs = String(locale || '').toLowerCase().startsWith('ms');

  if (isZh) {
    return {
      ...base,
      a4: {
        backToMobile: '← 返回移动版',
        print: '打印',
        downloadPdf: '下载 PDF',
        monoToggle: '打印友好',
        colorToggle: '彩色',
        zoom: '缩放',
        pageLabel: '页',
        of: '共',
        monoBadge: '打印友好版本',
        preparedFor: '客户',
        quoteNumber: '编号',
        issueDate: '发日期',
        validUntil: '有效至',
        salesRep: '销售',
        systemOverview: '系统概览',
        systemSize: '系统容量',
        panelQty: '面板数量',
        panelRating: '面板功率',
        panelType: '面板类型',
        inverterType: '逆变器',
        packageType: '方案类型',
        packageName: '方案名称',
        lineItems: '明细',
        qty: '数量',
        unitPrice: '单价',
        total: '金额',
        subtotal: '小计',
        discount: '折扣',
        voucher: '优惠券',
        tax: '税 (SST)',
        totalDue: '应付总额',
        monthlyProjection: '电费节省预估',
        before: '现月费',
        after: '安装后月费',
        monthlySaving: '每月节省',
        annualReturn: '首年回报',
        paymentDetails: '付款信息',
        bank: '收款银行',
        accountNo: '账号',
        accountName: '账户名',
        reference: '参考号',
        components: '主要组件',
        warranty: '保修说明',
        included: '已包含',
        termsAndConditions: '条款与条件',
        customerAcknowledgement: '客户确认',
        signedOn: '签署于',
        awaitingSignature: '等待签署',
        certHeadline: '认证与资质',
        certSubline: 'Eternalgy Sdn Bhd · 马来西亚',
        cidbName: 'CIDB 注册承包商',
        cidbMeta: '0120250324-WP152634 · G3 · Cat B · CE · ME',
        sedaPvName: 'SEDA 太阳能服务商',
        sedaPvMeta: 'SEDA/RPVSP/2024/321',
        sedaInvName: 'SEDA 太阳能投资方',
        sedaInvMeta: 'Eternalgy Sdn Bhd',
        myHijauName: 'MyHijau 设备认证',
        myHijauMeta: 'SAJ 逆变器 · MyHS00025/25',
        pageFooter: 'Eternalgy Sdn Bhd · Solar PV Planner',
        simulationDisclaimer: '本估算仅供参考，实际表现受天气、阴影、屋顶朝向与用电习惯影响。',
        quotationIntro: '感谢您选择 Eternalgy。以下为本方案的明细、保修与付款信息。',
        subjectLabel: '主题',
        valueLabel: '系统方案',
        customerBlockTitle: '客户信息',
        billTo: '客户',
        projectInfo: '项目信息',
        signatureNote: '客户签署即代表同意本报价单所有条款。',
        packageBanner: '推荐方案',
        documentTag: '报价单 / 发票',
        notes: '备注',
        itemsEmpty: '暂无明细项目。',
        noPayment: '未提供付款信息。',
        noTerms: '未提供条款。'
      }
    };
  }

  if (isMs) {
    return {
      ...base,
      a4: {
        backToMobile: '← Mudah Alih',
        print: 'Cetak',
        downloadPdf: 'Muat Turun PDF',
        monoToggle: 'Cetak-Siap',
        colorToggle: 'Berwarna',
        zoom: 'Zum',
        pageLabel: 'Halaman',
        of: 'daripada',
        monoBadge: 'VERSI SIAP CETAK',
        preparedFor: 'Pelanggan',
        quoteNumber: 'No.',
        issueDate: 'Tarikh',
        validUntil: 'Sah Sehingga',
        salesRep: 'Wakil',
        systemOverview: 'Ringkasan Sistem',
        systemSize: 'Saiz Sistem',
        panelQty: 'Bilangan Panel',
        panelRating: 'Kadar Panel',
        panelType: 'Jenis Panel',
        inverterType: 'Inverter',
        packageType: 'Jenis Pakej',
        packageName: 'Nama Pakej',
        lineItems: 'Butiran',
        qty: 'Kuantiti',
        unitPrice: 'Harga Seunit',
        total: 'Jumlah',
        subtotal: 'Subjumlah',
        discount: 'Diskaun',
        voucher: 'Baucar',
        tax: 'Cukai (SST)',
        totalDue: 'Jumlah Perlu Dibayar',
        monthlyProjection: 'Jangkaan Penjimatan',
        before: 'Bil Sedia Ada',
        after: 'Bil Selepas Solar',
        monthlySaving: 'Penjimatan Bulanan',
        annualReturn: 'Pulangan Tahun 1',
        paymentDetails: 'Maklumat Pembayaran',
        bank: 'Bank',
        accountNo: 'No. Akaun',
        accountName: 'Nama Akaun',
        reference: 'Rujukan',
        components: 'Komponen Utama',
        warranty: 'Waranti',
        included: 'Termasuk',
        termsAndConditions: 'Terma & Syarat',
        customerAcknowledgement: 'Pengesahan Pelanggan',
        signedOn: 'Ditandatangani pada',
        awaitingSignature: 'Menunggu tandatangan',
        certHeadline: 'Pendaftaran & Persijilan',
        certSubline: 'Eternalgy Sdn Bhd · Malaysia',
        cidbName: 'Kontraktor Berdaftar CIDB',
        cidbMeta: '0120250324-WP152634 · G3 · Cat B · CE · ME',
        sedaPvName: 'Pembekal Solar PV SEDA',
        sedaPvMeta: 'SEDA/RPVSP/2024/321',
        sedaInvName: 'Pelabur Solar PV SEDA',
        sedaInvMeta: 'Eternalgy Sdn Bhd',
        myHijauName: 'Persijilan MyHijau',
        myHijauMeta: 'Inverter SAJ · MyHS00025/25',
        pageFooter: 'Eternalgy Sdn Bhd · Solar PV Planner',
        simulationDisclaimer: 'Anggaran sahaja. Prestasi sebenar bergantung pada cuaca, teduhan, orientasi bumbung, dan corak penggunaan.',
        quotationIntro: 'Terima kasih kerana memilih Eternalgy. Berikut adalah butiran sebut harga, waranti, dan maklumat pembayaran.',
        subjectLabel: 'Subjek',
        valueLabel: 'Sistem Solar',
        customerBlockTitle: 'Maklumat Pelanggan',
        billTo: 'Bill Kepada',
        projectInfo: 'Maklumat Projek',
        signatureNote: 'Tandatangan pelanggan bermakna persetujuan terhadap semua terma sebut harga.',
        packageBanner: 'Pakej Disyorkan',
        documentTag: 'Sebut Harga / Invois',
        notes: 'Nota',
        itemsEmpty: 'Tiada butiran item.',
        noPayment: 'Tiada maklumat pembayaran.',
        noTerms: 'Tiada terma.'
      }
    };
  }

  return {
    ...base,
    a4: {
      backToMobile: '← Mobile View',
      print: 'Print',
      downloadPdf: 'Download PDF',
      monoToggle: 'Print-friendly',
      colorToggle: 'Color',
      zoom: 'Zoom',
      pageLabel: 'Page',
      of: 'of',
      monoBadge: 'PRINTER FRIENDLY VERSION',
      preparedFor: 'Prepared for',
      quoteNumber: 'Quote #',
      issueDate: 'Issued',
      validUntil: 'Valid until',
      salesRep: 'Sales',
      systemOverview: 'System Overview',
      systemSize: 'System size',
      panelQty: 'Panels',
      panelRating: 'Panel rating',
      panelType: 'Panel type',
      inverterType: 'Inverter',
      packageType: 'Package type',
      packageName: 'Package',
      lineItems: 'Line Items',
      qty: 'Qty',
      unitPrice: 'Unit',
      total: 'Total',
      subtotal: 'Subtotal',
      discount: 'Discount',
      voucher: 'Voucher',
      tax: 'Tax (SST)',
      totalDue: 'Total Due',
      monthlyProjection: 'Monthly Bill Projection',
      before: 'Current Bill',
      after: 'After Solar',
      monthlySaving: 'Monthly Saving',
      annualReturn: 'Year 1 Return',
      paymentDetails: 'Payment Details',
      bank: 'Bank',
      accountNo: 'Account No',
      accountName: 'Account Name',
      reference: 'Reference',
      components: 'Key Components',
      warranty: 'Warranty',
      included: 'Included',
      termsAndConditions: 'Terms & Conditions',
      customerAcknowledgement: 'Customer Acknowledgement',
      signedOn: 'Signed on',
      awaitingSignature: 'Awaiting signature',
      certHeadline: 'Registered & Certified',
      certSubline: 'Eternalgy Sdn Bhd · Malaysia',
      cidbName: 'CIDB Registered Contractor',
      cidbMeta: '0120250324-WP152634 · G3 · Cat B · CE · ME',
      sedaPvName: 'SEDA Solar PV Service Provider',
      sedaPvMeta: 'SEDA/RPVSP/2024/321',
      sedaInvName: 'SEDA Solar PV Investor',
      sedaInvMeta: 'Eternalgy Sdn Bhd',
      myHijauName: 'MyHijau Equipment Cert',
      myHijauMeta: 'SAJ Inverter · MyHS00025/25',
      pageFooter: 'Eternalgy Sdn Bhd · Solar PV Planner',
      simulationDisclaimer: 'Estimates only. Actual performance depends on weather, shading, roof orientation, and usage patterns.',
      quotationIntro: 'Thank you for choosing Eternalgy. Below is the full breakdown of your solar system, warranty, and payment information.',
      subjectLabel: 'Subject',
      valueLabel: 'Solar PV System',
      customerBlockTitle: 'Customer Details',
      billTo: 'Bill To',
      projectInfo: 'Project Details',
      signatureNote: 'By signing, the customer agrees to all terms in this quotation.',
      packageBanner: 'Recommended Package',
      documentTag: 'Quotation / Invoice',
      notes: 'Notes',
      itemsEmpty: 'No items attached.',
      noPayment: 'No payment details provided.',
      noTerms: 'No terms provided.'
    }
  };
}

/* ----------------------------- sections ----------------------------- */

/* Brand bar — top of every page (different content per page) */
function renderBrandBar({ title, tag, docNo, pageIndex, totalPages, pageLabel }) {
  return `
    <div class="a4-brandbar">
      <div class="a4-brandbar-l">
        <div class="a4-brand-mark">E</div>
        <div class="a4-brand-text">
          <div class="a4-brand-name">ETERNALGY</div>
          <div class="a4-brand-sub">Solar PV Planner</div>
        </div>
      </div>
      <div class="a4-brandbar-c">
        <span class="a4-brandbar-tag">${escapeHtml(tag)}</span>
        <span class="a4-brandbar-sep">·</span>
        <span class="a4-brandbar-title">${escapeHtml(title)}</span>
      </div>
      <div class="a4-brandbar-r">
        <span class="a4-brandbar-docno">${escapeHtml(docNo)}</span>
        <span class="a4-brandbar-pg">${escapeHtml(pageLabel)} ${pageIndex} ${escapeHtml(pageLabel === 'Page' ? 'of' : (pageLabel === 'Halaman' ? 'daripada' : 'of'))} ${totalPages}</span>
      </div>
    </div>
  `;
}

function renderPageFooter({ leftText, rightText, monoBadge }) {
  return `
    <div class="a4-pagefooter">
      <span>${escapeHtml(leftText)}</span>
      ${monoBadge ? `<span class="a4-mono-badge">${escapeHtml(monoBadge)}</span>` : ''}
      <span>${escapeHtml(rightText)}</span>
    </div>
  `;
}

/* Page 1 — Cover + Quotation */
function renderCoverPage({ invoice, template, copy, ai4, components, monoBadge }) {
  const customerName = invoice.customer_name || 'Valued Customer';
  const customerAddress = invoice.customer_address || '';
  const customerPhone = invoice.customer_phone || '';
  const customerEmail = invoice.customer_email || '';
  const invoiceDate = formatDate(invoice.invoice_date || invoice.created_at);
  const dueDate = invoice.due_date ? formatDate(invoice.due_date) : '—';
  const docNo = invoice.invoice_number || invoice.bubble_id || '—';
  const title = (invoice.status || '').toLowerCase() === 'confirmed' ? 'INVOICE' : 'QUOTATION';
  const subtitle = title === 'INVOICE' ? ai4.subjectLabel : ai4.subjectLabel;
  const packageName = invoice.package_name || 'Solar PV System';

  const panelQty = Number(invoice.panel_qty) || 0;
  const panelRating = Number(invoice.panel_rating) || 0;
  const systemSizeKwp = Number(invoice.system_size_kwp)
    || (panelQty && panelRating ? (panelQty * panelRating) / 1000 : 0);
  const packageType = invoice.package_type || invoice.type || '—';
  const salesRep = invoice.created_by_user_name || 'Eternalgy';

  return `
    <section class="a4-page a4-page-cover">
      <div class="a4-page-inner">
        ${renderBrandBar({
          title: ai4.documentTag,
          tag: title,
          docNo: docNo,
          pageIndex: 1,
          totalPages: 3,
          pageLabel: ai4.pageLabel
        })}

        <!-- Hero -->
        <div class="a4-hero">
          <div class="a4-hero-l">
            <p class="a4-eyebrow">${escapeHtml(ai4.documentTag)}</p>
            <h1 class="a4-hero-title">${escapeHtml(title)}</h1>
            <p class="a4-hero-sub">${escapeHtml(ai4.quotationIntro)}</p>

            <div class="a4-hero-meta">
              <div>
                <p class="a4-meta-l">${escapeHtml(ai4.preparedFor)}</p>
                <p class="a4-meta-v">${escapeHtml(customerName)}</p>
              </div>
              <div>
                <p class="a4-meta-l">${escapeHtml(ai4.quoteNumber)}</p>
                <p class="a4-meta-v mono">${escapeHtml(docNo)}</p>
              </div>
            </div>
          </div>
          <div class="a4-hero-r">
            <div class="a4-hero-box">
              <div class="a4-hero-box-row">
                <span class="a4-hero-box-l">${escapeHtml(ai4.issueDate)}</span>
                <span class="a4-hero-box-v">${escapeHtml(invoiceDate)}</span>
              </div>
              <div class="a4-hero-box-row">
                <span class="a4-hero-box-l">${escapeHtml(ai4.validUntil)}</span>
                <span class="a4-hero-box-v">${escapeHtml(dueDate)}</span>
              </div>
              <div class="a4-hero-box-row">
                <span class="a4-hero-box-l">${escapeHtml(ai4.salesRep)}</span>
                <span class="a4-hero-box-v">${escapeHtml(salesRep)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Customer + Project -->
        <div class="a4-twocol">
          <div class="a4-block">
            <div class="a4-block-head">${escapeHtml(ai4.billTo)}</div>
            <div class="a4-block-body">
              <p class="a4-block-name">${escapeHtml(customerName)}</p>
              ${customerAddress ? `<p class="a4-block-text">${escapeHtml(customerAddress).replace(/\n/g, '<br>')}</p>` : ''}
              ${customerPhone ? `<p class="a4-block-text dim">${escapeHtml(customerPhone)}</p>` : ''}
              ${customerEmail ? `<p class="a4-block-text dim">${escapeHtml(customerEmail)}</p>` : ''}
            </div>
          </div>
          <div class="a4-block">
            <div class="a4-block-head">${escapeHtml(ai4.projectInfo)}</div>
            <div class="a4-block-body">
              <div class="a4-mini-grid">
                <div><span class="a4-mini-l">${escapeHtml(ai4.subjectLabel)}</span><span class="a4-mini-v">${escapeHtml(ai4.valueLabel)}</span></div>
                <div><span class="a4-mini-l">${escapeHtml(ai4.packageName)}</span><span class="a4-mini-v">${escapeHtml(packageName)}</span></div>
                <div><span class="a4-mini-l">${escapeHtml(ai4.packageType)}</span><span class="a4-mini-v">${escapeHtml(packageType)}</span></div>
                <div><span class="a4-mini-l">${escapeHtml(ai4.systemSize)}</span><span class="a4-mini-v mono">${systemSizeKwp > 0 ? systemSizeKwp.toFixed(2) + ' kWp' : '—'}</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- System Overview Strip -->
        <div class="a4-strip">
          <div class="a4-strip-item">
            <span class="a4-strip-l">${escapeHtml(ai4.systemSize)}</span>
            <span class="a4-strip-v">${systemSizeKwp > 0 ? systemSizeKwp.toFixed(2) + ' kWp' : '—'}</span>
          </div>
          <div class="a4-strip-item">
            <span class="a4-strip-l">${escapeHtml(ai4.panelQty)}</span>
            <span class="a4-strip-v">${panelQty > 0 ? formatNumber(panelQty) : '—'}</span>
          </div>
          <div class="a4-strip-item">
            <span class="a4-strip-l">${escapeHtml(ai4.panelRating)}</span>
            <span class="a4-strip-v">${panelRating > 0 ? formatNumber(panelRating) + ' W' : '—'}</span>
          </div>
          <div class="a4-strip-item">
            <span class="a4-strip-l">${escapeHtml(ai4.inverterType)}</span>
            <span class="a4-strip-v sm">${escapeHtml(components.inverterName || '—')}</span>
          </div>
        </div>

        <!-- Line Items -->
        <div class="a4-section">
          <div class="a4-section-head">
            <span class="a4-section-num">01</span>
            <span class="a4-section-title">${escapeHtml(ai4.lineItems)}</span>
            <span class="a4-section-rule"></span>
          </div>
          ${components.items.length === 0 ? `
            <p class="a4-empty">${escapeHtml(ai4.itemsEmpty)}</p>
          ` : `
            <table class="a4-tbl">
              <colgroup>
                <col style="width:55%">
                <col style="width:10%">
                <col style="width:15%">
                <col style="width:20%">
              </colgroup>
              <thead>
                <tr>
                  <th>${escapeHtml(ai4.lineItems)}</th>
                  <th class="num">${escapeHtml(ai4.qty)}</th>
                  <th class="num">${escapeHtml(ai4.unitPrice)}</th>
                  <th class="num">${escapeHtml(ai4.total)}</th>
                </tr>
              </thead>
              <tbody>
                ${components.items.map((item, i) => {
                  const qty = Number(item.qty) || 0;
                  const total = Number(item.total_price) || 0;
                  const unit = qty > 0 ? total / qty : 0;
                  const desc = (item.description || item.product_name || '').replace(/\\n/g, '\n');
                  const [main, ...rest] = desc.split('\n');
                  const sub = rest.join(' · ').trim();
                  return `
                    <tr class="${i % 2 ? 'odd' : 'even'}">
                      <td>
                        <div class="a4-tbl-name">${escapeHtml(main || '—')}</div>
                        ${sub ? `<div class="a4-tbl-sub">${escapeHtml(sub)}</div>` : ''}
                      </td>
                      <td class="num">${formatNumber(qty, 2)}</td>
                      <td class="num">${formatSignedMoney(unit)}</td>
                      <td class="num strong">${formatSignedMoney(total)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>

        <!-- Totals — right aligned summary -->
        <div class="a4-totals-wrap">
          <table class="a4-totals">
            <tbody>
              ${components.subtotalRow ? `
                <tr>
                  <td class="a4-totals-l">${escapeHtml(ai4.subtotal)}</td>
                  <td class="a4-totals-v">${formatMoney(components.subtotalRow)}</td>
                </tr>` : ''}
              ${components.discount > 0 ? `
                <tr>
                  <td class="a4-totals-l">${escapeHtml(ai4.discount)}</td>
                  <td class="a4-totals-v disc">${formatSignedMoney(-Math.abs(components.discount))}</td>
                </tr>` : ''}
              ${components.voucher > 0 ? `
                <tr>
                  <td class="a4-totals-l">${escapeHtml(ai4.voucher)}</td>
                  <td class="a4-totals-v disc">${formatSignedMoney(-Math.abs(components.voucher))}</td>
                </tr>` : ''}
              ${components.sst > 0 ? `
                <tr>
                  <td class="a4-totals-l">${escapeHtml(ai4.tax)}</td>
                  <td class="a4-totals-v">${formatMoney(components.sst)}</td>
                </tr>` : ''}
              <tr class="grand">
                <td class="a4-totals-l">${escapeHtml(ai4.totalDue)}</td>
                <td class="a4-totals-v grand-v">${formatMoney(components.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${renderPageFooter({
          leftText: ai4.pageFooter,
          rightText: `${ai4.pageLabel} 1 ${ai4.of} 3`,
          monoBadge
        })}
      </div>
    </section>
  `;
}

/* Page 2 — Components + Savings + Payment */
function renderDetailsPage({ invoice, template, copy, ai4, components, estimate, monoBadge }) {
  const items = components.items;
  const hasTigerNeo3 = components.hasTigerNeo3;
  const hasSaj = components.hasSajInverter;
  const hasMasterTec = components.hasMasterTecCable;
  const visibleCount = [hasTigerNeo3, hasSaj, hasMasterTec].filter(Boolean).length;
  const cardLayout = visibleCount === 3 ? 'a4-comp-grid-3' : 'a4-comp-grid-2';

  return `
    <section class="a4-page a4-page-details">
      <div class="a4-page-inner">
        ${renderBrandBar({
          title: ai4.documentTag,
          tag: '02 / Components & Savings',
          docNo: invoice.invoice_number || invoice.bubble_id || '—',
          pageIndex: 2,
          totalPages: 3,
          pageLabel: ai4.pageLabel
        })}

        <!-- Components -->
        <div class="a4-section">
          <div class="a4-section-head">
            <span class="a4-section-num">02</span>
            <span class="a4-section-title">${escapeHtml(ai4.components)}</span>
            <span class="a4-section-rule"></span>
          </div>

          <div class="${cardLayout}">
            ${hasTigerNeo3 ? `
              <div class="a4-comp-card">
                <div class="a4-comp-card-bar"></div>
                <div class="a4-comp-card-body">
                  <span class="a4-comp-card-tag">PV Module</span>
                  <h3 class="a4-comp-card-name">Jinko Tiger Neo 3</h3>
                  <p class="a4-comp-card-desc">Built for durability, stronger low-light production, and better hot-weather performance.</p>
                  <div class="a4-comp-specs">
                    <div><span>Durability</span><strong>3× IEC tested</strong></div>
                    <div><span>Low light</span><strong>95–98% @ 200 W/m²</strong></div>
                    <div><span>Temp coeff.</span><strong>−0.26 %/°C</strong></div>
                    <div><span>Degradation</span><strong>−0.35 %/yr</strong></div>
                  </div>
                  <span class="a4-comp-card-status">${escapeHtml(ai4.included)}</span>
                </div>
              </div>` : ''}
            ${hasSaj ? `
              <div class="a4-comp-card">
                <div class="a4-comp-card-bar alt"></div>
                <div class="a4-comp-card-body">
                  <span class="a4-comp-card-tag">Inverter</span>
                  <h3 class="a4-comp-card-name">${escapeHtml(components.inverterName || 'SAJ Inverter')}</h3>
                  <p class="a4-comp-card-desc">Three-phase string inverter tied to the linked package for stable AC conversion.</p>
                  <div class="a4-comp-specs">
                    <div><span>Phase</span><strong>3-Phase</strong></div>
                    <div><span>Function</span><strong>String inverter</strong></div>
                    <div><span>Brand</span><strong>SAJ</strong></div>
                    <div><span>Topology</span><strong>Transformerless</strong></div>
                  </div>
                  <span class="a4-comp-card-status">${escapeHtml(ai4.included)}</span>
                </div>
              </div>` : ''}
            ${hasMasterTec ? `
              <div class="a4-comp-card">
                <div class="a4-comp-card-bar amber"></div>
                <div class="a4-comp-card-body">
                  <span class="a4-comp-card-tag">Cabling</span>
                  <h3 class="a4-comp-card-name">MasterTec Cable</h3>
                  <p class="a4-comp-card-desc">Electrical cable support covering safe routing, durable installation, and clean site execution.</p>
                  <div class="a4-comp-specs">
                    <div><span>Type</span><strong>PV-rated DC</strong></div>
                    <div><span>Insulation</span><strong>XLPE / UV</strong></div>
                    <div><span>Routing</span><strong>Rooftop · Conduit</strong></div>
                    <div><span>Grade</span><strong>MasterTec</strong></div>
                  </div>
                  <span class="a4-comp-card-status">${escapeHtml(ai4.included)}</span>
                </div>
              </div>` : ''}
          </div>
        </div>

        <!-- Monthly projection -->
        <div class="a4-section">
          <div class="a4-section-head">
            <span class="a4-section-num">03</span>
            <span class="a4-section-title">${escapeHtml(ai4.monthlyProjection)}</span>
            <span class="a4-section-rule"></span>
          </div>
          <div class="a4-projection">
            <div class="a4-proj-col">
              <div class="a4-proj-card before">
                <span class="a4-proj-l">${escapeHtml(ai4.before)}</span>
                <span class="a4-proj-v">${estimate.beforeSolarBill !== null ? formatMoney(estimate.beforeSolarBill) : '—'}</span>
              </div>
              <div class="a4-proj-bar before">
                <div class="a4-proj-bar-fill" style="width:100%"></div>
              </div>
            </div>
            <div class="a4-proj-arrow" aria-hidden="true">→</div>
            <div class="a4-proj-col">
              <div class="a4-proj-card after">
                <span class="a4-proj-l">${escapeHtml(ai4.after)}</span>
                <span class="a4-proj-v">${estimate.estimatedNewBillAmount !== null ? formatMoney(estimate.estimatedNewBillAmount) : '—'}</span>
              </div>
              <div class="a4-proj-bar after">
                <div class="a4-proj-bar-fill" style="width:${(estimate.beforeSolarBill && estimate.estimatedNewBillAmount) ? Math.max(5, Math.round((estimate.estimatedNewBillAmount / estimate.beforeSolarBill) * 100)) : 30}%"></div>
              </div>
            </div>
            <div class="a4-proj-card saving">
              <span class="a4-proj-l">${escapeHtml(ai4.monthlySaving)}</span>
              <span class="a4-proj-v highlight">${estimate.estimatedSaving !== null ? formatMoney(estimate.estimatedSaving) : '—'}</span>
              <span class="a4-proj-foot">${escapeHtml(ai4.annualReturn)}: ${estimate.estimatedSaving !== null ? formatMoney(estimate.estimatedSaving * 12) : '—'}</span>
            </div>
          </div>
          <p class="a4-disc">${escapeHtml(ai4.simulationDisclaimer)}</p>
        </div>

        <!-- Payment details -->
        <div class="a4-section">
          <div class="a4-section-head">
            <span class="a4-section-num">04</span>
            <span class="a4-section-title">${escapeHtml(ai4.paymentDetails)}</span>
            <span class="a4-section-rule"></span>
          </div>
          ${(template.bank_name || template.bank_account_no || template.bank_account_name) ? `
            <table class="a4-pay">
              <tbody>
                ${template.bank_name ? `<tr><td>${escapeHtml(ai4.bank)}</td><td class="strong">${escapeHtml(template.bank_name)}</td></tr>` : ''}
                ${template.bank_account_name ? `<tr><td>${escapeHtml(ai4.accountName)}</td><td class="strong">${escapeHtml(template.bank_account_name)}</td></tr>` : ''}
                ${template.bank_account_no ? `<tr><td>${escapeHtml(ai4.accountNo)}</td><td class="strong mono">${escapeHtml(template.bank_account_no)}</td></tr>` : ''}
                <tr><td>${escapeHtml(ai4.reference)}</td><td class="strong mono accent">${escapeHtml(invoice.invoice_number || invoice.bubble_id || '—')}</td></tr>
              </tbody>
            </table>
          ` : `<p class="a4-empty">${escapeHtml(ai4.noPayment)}</p>`}
        </div>

        ${renderPageFooter({
          leftText: ai4.pageFooter,
          rightText: `${ai4.pageLabel} 2 ${ai4.of} 3`,
          monoBadge
        })}
      </div>
    </section>
  `;
}

/* Page 3 — Warranty + Terms + Signature + Certs */
function renderSignaturePage({ invoice, template, copy, ai4, components, monoBadge }) {
  const customerName = invoice.customer_name || 'Customer';
  const warranties = invoice.warranties || [];
  const rawTerms = (template.terms_and_conditions || copy.terms.paragraphs.join('\n\n') || '').trim();
  // For A4 print, cap the terms to a reasonable length so the signature page
  // fits on a single A4 sheet. The full terms are still readable on the mobile
  // view; the A4 preview highlights the headline clauses.
  const TERM_CHAR_BUDGET = 1100;
  const terms = rawTerms.length > TERM_CHAR_BUDGET
    ? `${rawTerms.slice(0, TERM_CHAR_BUDGET).trim()}…`
    : rawTerms;

  return `
    <section class="a4-page a4-page-sign">
      <div class="a4-page-inner">
        ${renderBrandBar({
          title: ai4.documentTag,
          tag: '03 / Sign-off',
          docNo: invoice.invoice_number || invoice.bubble_id || '—',
          pageIndex: 3,
          totalPages: 3,
          pageLabel: ai4.pageLabel
        })}

        <!-- Warranty -->
        <div class="a4-section">
          <div class="a4-section-head">
            <span class="a4-section-num">05</span>
            <span class="a4-section-title">${escapeHtml(ai4.warranty)}</span>
            <span class="a4-section-rule"></span>
          </div>
          ${warranties.length === 0 ? `
            <p class="a4-empty">${escapeHtml(copy.cards.noWarranty)}</p>
          ` : `
            <ul class="a4-warranty">
              ${warranties.map((w) => `
                <li>
                  <span class="a4-warranty-dot"></span>
                  <div>
                    <p class="a4-warranty-name">${escapeHtml(w.name || 'Warranty')}</p>
                    <p class="a4-warranty-text">${escapeHtml(w.terms || '')}</p>
                  </div>
                </li>
              `).join('')}
            </ul>
          `}
        </div>

        <!-- T&C -->
        <div class="a4-section">
          <div class="a4-section-head">
            <span class="a4-section-num">06</span>
            <span class="a4-section-title">${escapeHtml(ai4.termsAndConditions)}</span>
            <span class="a4-section-rule"></span>
          </div>
          <div class="a4-terms">${escapeHtml(terms || ai4.noTerms).replace(/\n/g, '<br>')}</div>
        </div>

        <!-- Signature -->
        <div class="a4-section a4-sig-section">
          <div class="a4-section-head">
            <span class="a4-section-num">07</span>
            <span class="a4-section-title">${escapeHtml(ai4.customerAcknowledgement)}</span>
            <span class="a4-section-rule"></span>
          </div>
          <p class="a4-sig-note">${escapeHtml(ai4.signatureNote)}</p>
          <div class="a4-sig-grid">
            <div class="a4-sig-box">
              ${invoice.customer_signature ? `
                <img src="${escapeHtml(invoice.customer_signature.startsWith('//') ? 'https:' + invoice.customer_signature : invoice.customer_signature)}" alt="Signature" class="a4-sig-img">
                <div class="a4-sig-name">${escapeHtml(customerName)}</div>
                ${invoice.signature_date ? `<div class="a4-sig-date">${escapeHtml(ai4.signedOn)} ${escapeHtml(formatDate(invoice.signature_date))}</div>` : ''}
              ` : `
                <div class="a4-sig-line"></div>
                <div class="a4-sig-placeholder">${escapeHtml(ai4.awaitingSignature)}</div>
                <div class="a4-sig-name">${escapeHtml(customerName)}</div>
              `}
            </div>
            <div class="a4-sig-meta">
              <div><span class="a4-mini-l">${escapeHtml(ai4.preparedFor)}</span><span class="a4-mini-v">${escapeHtml(customerName)}</span></div>
              <div><span class="a4-mini-l">${escapeHtml(ai4.quoteNumber)}</span><span class="a4-mini-v mono">${escapeHtml(invoice.invoice_number || invoice.bubble_id || '—')}</span></div>
              <div><span class="a4-mini-l">${escapeHtml(ai4.issueDate)}</span><span class="a4-mini-v">${escapeHtml(formatDate(invoice.invoice_date || invoice.created_at))}</span></div>
            </div>
          </div>
        </div>

        <!-- Certifications -->
        <div class="a4-cert">
          <div class="a4-cert-head">
            <span class="a4-cert-headline">${escapeHtml(ai4.certHeadline)}</span>
            <span class="a4-cert-subline">${escapeHtml(ai4.certSubline)}</span>
          </div>
          <div class="a4-cert-grid">
            <div class="a4-cert-card">
              <div class="a4-cert-name">${escapeHtml(ai4.cidbName)}</div>
              <div class="a4-cert-meta">${escapeHtml(ai4.cidbMeta)}</div>
            </div>
            <div class="a4-cert-card">
              <div class="a4-cert-name">${escapeHtml(ai4.sedaPvName)}</div>
              <div class="a4-cert-meta">${escapeHtml(ai4.sedaPvMeta)}</div>
            </div>
            <div class="a4-cert-card">
              <div class="a4-cert-name">${escapeHtml(ai4.sedaInvName)}</div>
              <div class="a4-cert-meta">${escapeHtml(ai4.sedaInvMeta)}</div>
            </div>
            <div class="a4-cert-card">
              <div class="a4-cert-name">${escapeHtml(ai4.myHijauName)}</div>
              <div class="a4-cert-meta">${escapeHtml(ai4.myHijauMeta)}</div>
            </div>
          </div>
        </div>

        ${renderPageFooter({
          leftText: ai4.pageFooter,
          rightText: `${ai4.pageLabel} 3 ${ai4.of} 3`,
          monoBadge
        })}
      </div>
    </section>
  `;
}

/* ------------------------------ styles ----------------------------- */

function renderStyles() {
  return `
    <style>
      /* ============ A4 Preview — full redesign ============ */

      :root {
        --a4-ink: #0b0f14;
        --a4-ink-soft: #2b323a;
        --a4-mute: #6b7280;
        --a4-line: #d6d8dc;
        --a4-line-soft: #ececec;
        --a4-cream: #fbf7f2;
        --a4-cream-2: #f4ede4;
        --a4-deep: #003527;     /* brand deep green */
        --a4-deep-2: #0a4a39;
        --a4-amber: #c68a2a;
        --a4-amber-2: #a86f1e;
        --a4-green: #16a34a;
        --a4-green-soft: #dcfce7;
        --a4-amber-soft: #fff1d6;
        --a4-red: #991b1b;
        --a4-shadow: 0 14px 40px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08);
      }

      /* ============ MONO / print-friendly palette ============ */
      body.a4-mono {
        --a4-ink: #000000;
        --a4-ink-soft: #1a1a1a;
        --a4-mute: #555555;
        --a4-line: #b8b8b8;
        --a4-line-soft: #e2e2e2;
        --a4-cream: #f4f4f4;
        --a4-cream-2: #ebebeb;
        --a4-deep: #000000;
        --a4-deep-2: #1a1a1a;
        --a4-amber: #000000;
        --a4-amber-2: #1a1a1a;
        --a4-green: #000000;
        --a4-green-soft: #ececec;
        --a4-amber-soft: #ececec;
        --a4-red: #000000;
        --a4-shadow: 0 0 0 1px #cfcfcf, 0 8px 24px rgba(0, 0, 0, 0.06);
        background: #dcdcdc;
      }
      body.a4-mono .a4-page {
        background: #fff;
      }
      body.a4-mono .a4-page-inner {
        /* remove brand-color eyebrow, all colors are already mono via vars */
      }

      /* Page reset for A4 mode */
      html, body { background: #e7e9ee; margin: 0; padding: 0; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: var(--a4-ink);
        font-size: 10pt;
        line-height: 1.4;
        -webkit-font-smoothing: antialiased;
        font-variant-numeric: tabular-nums;
      }
      * { box-sizing: border-box; }

      /* Toolbar — hidden in print */
      .a4-toolbar {
        position: sticky; top: 0; z-index: 50;
        background: rgba(11, 15, 20, 0.96);
        color: #fff;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 10px 18px;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        font-size: 11px;
      }
      .a4-toolbar-l, .a4-toolbar-r { display: flex; align-items: center; gap: 8px; }
      .a4-toolbar-title {
        font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; font-size: 10px;
        color: #cbd5e1;
      }
      .a4-toolbar-doc { font-weight: 800; letter-spacing: 0.04em; color: #fff; font-family: 'JetBrains Mono', monospace; }
      .a4-btn {
        display: inline-flex; align-items: center; gap: 6px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.12);
        padding: 7px 12px;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s, transform 0.1s;
      }
      .a4-btn:hover { background: rgba(255, 255, 255, 0.16); }
      .a4-btn:active { transform: scale(0.98); }
      .a4-btn.primary { background: var(--a4-green); border-color: transparent; }
      .a4-btn.primary:hover { background: #15803d; }
      .a4-btn.ghost { background: transparent; }
      .a4-btn svg { width: 14px; height: 14px; }

      /* Page stage */
      .a4-stage {
        padding: 28px 16px 56px;
        display: flex; flex-direction: column; align-items: center;
        gap: 24px;
      }

      /* The A4 page itself — exact ISO A4 (210mm × 297mm) */
      .a4-page {
        width: 210mm;
        min-height: 297mm;
        background: #fff;
        box-shadow: var(--a4-shadow);
        position: relative;
        overflow: hidden;
        color: var(--a4-ink);
      }
      .a4-page-inner {
        padding: 16mm 18mm 14mm;
        min-height: 297mm;
        display: flex; flex-direction: column;
      }
      .a4-page + .a4-page { margin-top: 0; }

      /* Brand bar (top of every page) */
      .a4-brandbar {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        padding-bottom: 8px;
        border-bottom: 2px solid var(--a4-deep);
        margin-bottom: 18px;
      }
      .a4-brandbar-l { display: flex; align-items: center; gap: 10px; }
      .a4-brand-mark {
        width: 30px; height: 30px;
        background: var(--a4-deep);
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-weight: 900; font-size: 14px;
        letter-spacing: 0.04em;
      }
      .a4-brand-name {
        font-weight: 900; letter-spacing: 0.08em; font-size: 12px; line-height: 1.1;
        color: var(--a4-deep);
      }
      .a4-brand-sub { font-size: 8.5px; color: var(--a4-mute); margin-top: 1px; letter-spacing: 0.04em; }
      .a4-brandbar-c { display: flex; align-items: center; gap: 8px; }
      .a4-brandbar-tag {
        background: var(--a4-deep);
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.18em;
        padding: 4px 8px;
        text-transform: uppercase;
      }
      .a4-brandbar-sep { color: var(--a4-line); font-size: 11px; }
      .a4-brandbar-title {
        font-size: 10px;
        font-weight: 700;
        color: var(--a4-ink-soft);
        letter-spacing: 0.04em;
      }
      .a4-brandbar-r { text-align: right; }
      .a4-brandbar-docno {
        display: block;
        font-family: 'JetBrains Mono', monospace;
        font-size: 9.5px;
        font-weight: 700;
        color: var(--a4-ink);
      }
      .a4-brandbar-pg {
        display: block;
        font-size: 8px;
        color: var(--a4-mute);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-top: 1px;
      }

      /* Hero */
      .a4-hero {
        display: grid;
        grid-template-columns: 1.5fr 1fr;
        gap: 16px;
        margin-bottom: 18px;
      }
      .a4-eyebrow {
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        color: var(--a4-amber);
        margin: 0 0 6px 0;
      }
      .a4-hero-title {
        font-size: 38pt;
        font-weight: 900;
        letter-spacing: -0.04em;
        line-height: 0.9;
        color: var(--a4-deep);
        margin: 0;
      }
      .a4-hero-sub {
        margin: 10px 0 14px;
        font-size: 9pt;
        color: var(--a4-ink-soft);
        max-width: 70mm;
        line-height: 1.45;
      }
      .a4-hero-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        padding-top: 10px;
        border-top: 1px solid var(--a4-line);
      }
      .a4-meta-l {
        display: block;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--a4-mute);
        margin-bottom: 2px;
      }
      .a4-meta-v { font-size: 10pt; font-weight: 800; color: var(--a4-ink); margin: 0; }
      .a4-meta-v.mono { font-family: 'JetBrains Mono', monospace; font-size: 9.5pt; }

      .a4-hero-box {
        background: var(--a4-cream);
        border: 1px solid var(--a4-line);
        border-left: 3px solid var(--a4-amber);
        padding: 12px 14px;
        align-self: start;
      }
      .a4-hero-box-row {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 6px 0;
        border-bottom: 1px dashed var(--a4-line);
      }
      .a4-hero-box-row:last-child { border-bottom: none; }
      .a4-hero-box-l { font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--a4-mute); }
      .a4-hero-box-v { font-size: 10pt; font-weight: 700; color: var(--a4-ink); }

      /* Two-column customer/project */
      .a4-twocol {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      .a4-block { border: 1px solid var(--a4-line); }
      .a4-block-head {
        background: var(--a4-cream-2);
        padding: 6px 12px;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--a4-deep);
        border-bottom: 1px solid var(--a4-line);
      }
      .a4-block-body { padding: 10px 12px; }
      .a4-block-name { font-size: 12pt; font-weight: 800; color: var(--a4-ink); margin: 0 0 4px; }
      .a4-block-text { font-size: 9pt; color: var(--a4-ink-soft); margin: 0; line-height: 1.45; }
      .a4-block-text.dim { color: var(--a4-mute); font-size: 8.5pt; }

      .a4-mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
      .a4-mini-grid > div { display: flex; flex-direction: column; gap: 1px; }
      .a4-mini-l { font-size: 7.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--a4-mute); }
      .a4-mini-v { font-size: 9.5pt; font-weight: 700; color: var(--a4-ink); }
      .a4-mini-v.mono { font-family: 'JetBrains Mono', monospace; font-size: 9pt; }

      /* Strip */
      .a4-strip {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        border: 1px solid var(--a4-line);
        border-left: 3px solid var(--a4-deep);
        margin-bottom: 20px;
      }
      .a4-strip-item {
        padding: 10px 14px;
        border-right: 1px solid var(--a4-line);
        display: flex; flex-direction: column; gap: 2px;
      }
      .a4-strip-item:last-child { border-right: none; }
      .a4-strip-l { font-size: 7.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--a4-mute); }
      .a4-strip-v { font-size: 14pt; font-weight: 900; color: var(--a4-deep); letter-spacing: -0.02em; line-height: 1.05; }
      .a4-strip-v.sm { font-size: 10pt; font-weight: 800; line-height: 1.15; }

      /* Section */
      .a4-section { margin-bottom: 16px; }
      .a4-section-head {
        display: flex; align-items: center; gap: 10px;
        margin-bottom: 10px;
      }
      .a4-section-num {
        font-family: 'JetBrains Mono', monospace;
        font-size: 9.5pt;
        font-weight: 800;
        color: var(--a4-amber);
      }
      .a4-section-title {
        font-size: 10.5pt;
        font-weight: 900;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--a4-deep);
      }
      .a4-section-rule { flex: 1; height: 1px; background: var(--a4-line); }

      /* Items table */
      .a4-tbl {
        width: 100%;
        border-collapse: collapse;
        font-size: 9pt;
      }
      .a4-tbl thead th {
        background: var(--a4-deep);
        color: #fff;
        text-align: left;
        font-size: 7.5pt;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        padding: 7px 10px;
      }
      .a4-tbl thead th.num { text-align: right; }
      .a4-tbl tbody td {
        padding: 9px 10px;
        border-bottom: 1px solid var(--a4-line-soft);
        vertical-align: top;
      }
      .a4-tbl tbody tr.odd td { background: var(--a4-cream); }
      .a4-tbl td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .a4-tbl td.strong, .a4-tbl td.num.strong { font-weight: 800; color: var(--a4-ink); }
      .a4-tbl-name { font-weight: 700; color: var(--a4-ink); line-height: 1.3; }
      .a4-tbl-sub { font-size: 8pt; color: var(--a4-mute); margin-top: 2px; line-height: 1.35; }

      /* Totals */
      .a4-totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
      .a4-totals {
        width: 60%;
        border-collapse: collapse;
        font-size: 9.5pt;
      }
      .a4-totals td { padding: 6px 10px; }
      .a4-totals-l { color: var(--a4-mute); font-weight: 600; }
      .a4-totals-v { text-align: right; font-weight: 700; color: var(--a4-ink); }
      .a4-totals-v.disc { color: var(--a4-red); }
      .a4-totals tr.grand td {
        background: var(--a4-deep);
        color: #fff;
        padding: 10px 12px;
        font-size: 12pt;
      }
      .a4-totals tr.grand .a4-totals-l { color: #fff; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; font-size: 9.5pt; }
      .a4-totals tr.grand .a4-totals-v { color: #fff; font-size: 16pt; font-weight: 900; letter-spacing: -0.02em; }

      /* Component cards */
      .a4-comp-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .a4-comp-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .a4-comp-card {
        border: 1px solid var(--a4-line);
        background: #fff;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .a4-comp-card-bar { height: 3px; background: var(--a4-deep); }
      .a4-comp-card-bar.alt { background: var(--a4-amber); }
      .a4-comp-card-bar.amber { background: var(--a4-amber-2); }
      .a4-comp-card-body { padding: 12px 14px 14px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
      .a4-comp-card-tag {
        font-size: 7.5px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--a4-mute);
      }
      .a4-comp-card-name {
        font-size: 13pt;
        font-weight: 900;
        color: var(--a4-deep);
        margin: 0;
        line-height: 1.1;
      }
      .a4-comp-card-desc {
        font-size: 8.5pt;
        color: var(--a4-ink-soft);
        line-height: 1.45;
        margin: 0;
      }
      .a4-comp-specs {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid var(--a4-line-soft);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px 10px;
      }
      .a4-comp-specs > div { display: flex; flex-direction: column; gap: 1px; }
      .a4-comp-specs span { font-size: 7px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--a4-mute); }
      .a4-comp-specs strong { font-size: 9pt; font-weight: 800; color: var(--a4-ink); }
      .a4-comp-card-status {
        margin-top: auto;
        align-self: flex-start;
        font-size: 7.5px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--a4-green);
        background: var(--a4-green-soft);
        padding: 3px 8px;
      }

      /* Monthly projection */
      .a4-projection {
        display: grid;
        grid-template-columns: 1fr auto 1fr auto;
        gap: 14px;
        align-items: stretch;
      }
      .a4-proj-col { display: flex; flex-direction: column; gap: 6px; }
      .a4-proj-card {
        background: #fff;
        border: 1px solid var(--a4-line);
        padding: 10px 14px;
        display: flex; flex-direction: column; gap: 2px;
      }
      .a4-proj-card.before { background: var(--a4-cream); }
      .a4-proj-card.after { background: var(--a4-green-soft); border-color: var(--a4-green); }
      .a4-proj-card.saving {
        background: var(--a4-deep);
        color: #fff;
        border: none;
        padding: 14px 16px;
        justify-content: center;
        min-width: 64mm;
      }
      .a4-proj-l { font-size: 7.5px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--a4-mute); }
      .a4-proj-card.saving .a4-proj-l { color: #95d3ba; }
      .a4-proj-v { font-size: 18pt; font-weight: 900; letter-spacing: -0.02em; line-height: 1.1; color: var(--a4-ink); }
      .a4-proj-v.highlight { color: #fff; font-size: 22pt; }
      .a4-proj-foot { font-size: 7.5px; color: #95d3ba; margin-top: 4px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
      .a4-proj-bar { height: 8px; background: var(--a4-line-soft); border-radius: 999px; overflow: hidden; }
      .a4-proj-bar-fill { height: 100%; background: var(--a4-ink-soft); }
      .a4-proj-bar.after .a4-proj-bar-fill { background: var(--a4-green); }
      .a4-proj-arrow { display: flex; align-items: center; justify-content: center; font-size: 22pt; color: var(--a4-amber); font-weight: 700; }
      .a4-disc { font-size: 7.5pt; color: var(--a4-mute); margin-top: 8px; line-height: 1.4; }

      /* Payment */
      .a4-pay {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid var(--a4-line);
        font-size: 9.5pt;
      }
      .a4-pay td {
        padding: 8px 14px;
        border-bottom: 1px solid var(--a4-line-soft);
      }
      .a4-pay tr:last-child td { border-bottom: none; }
      .a4-pay td:first-child { color: var(--a4-mute); font-weight: 700; font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; width: 38%; }
      .a4-pay td.strong { font-weight: 800; color: var(--a4-ink); }
      .a4-pay td.mono { font-family: 'JetBrains Mono', monospace; }
      .a4-pay td.accent { color: var(--a4-green); }

      /* Warranty list */
      .a4-warranty { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .a4-warranty li { display: flex; gap: 10px; align-items: flex-start; }
      .a4-warranty-dot {
        width: 6px; height: 6px; background: var(--a4-deep);
        margin-top: 7px; flex-shrink: 0;
      }
      .a4-warranty-name { font-size: 9.5pt; font-weight: 800; color: var(--a4-ink); margin: 0 0 2px; }
      .a4-warranty-text { font-size: 8.5pt; color: var(--a4-ink-soft); line-height: 1.45; margin: 0; white-space: pre-wrap; }

      /* Terms */
      .a4-terms {
        font-size: 8.5pt;
        line-height: 1.5;
        color: var(--a4-ink-soft);
        background: var(--a4-cream);
        border-left: 3px solid var(--a4-amber);
        padding: 10px 14px;
        column-count: 2;
        column-gap: 14px;
      }
      @media (max-width: 1100px) {
        .a4-terms { column-count: 1; }
      }

      /* Signature */
      .a4-sig-section { margin-top: auto; }
      .a4-sig-note { font-size: 8.5pt; color: var(--a4-mute); margin: 0 0 10px; font-style: italic; }
      .a4-sig-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }
      .a4-sig-box {
        border: 1px solid var(--a4-line);
        background: #fff;
        padding: 18px 16px 12px;
        min-height: 50mm;
        text-align: center;
        display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
      }
      .a4-sig-img { max-width: 60mm; max-height: 22mm; object-fit: contain; margin-bottom: 6px; }
      .a4-sig-line { height: 0; border-top: 1.5px solid var(--a4-ink); width: 70mm; margin-bottom: 8px; }
      .a4-sig-placeholder { font-size: 8.5pt; color: var(--a4-mute); margin-bottom: 6px; font-style: italic; }
      .a4-sig-name { font-size: 10pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--a4-ink); }
      .a4-sig-date { font-size: 8pt; color: var(--a4-mute); margin-top: 4px; font-weight: 600; }
      .a4-sig-meta { display: flex; flex-direction: column; gap: 6px; align-self: center; }

      /* Certifications */
      .a4-cert {
        border: 1px solid var(--a4-line);
        margin-top: 14px;
      }
      .a4-cert-head {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 7px 12px;
        background: var(--a4-cream-2);
        border-bottom: 1px solid var(--a4-line);
      }
      .a4-cert-headline { font-size: 9pt; font-weight: 800; color: var(--a4-deep); letter-spacing: 0.06em; }
      .a4-cert-subline { font-size: 7.5pt; color: var(--a4-mute); letter-spacing: 0.1em; text-transform: uppercase; }
      .a4-cert-grid { display: grid; grid-template-columns: repeat(2, 1fr); }
      .a4-cert-card { padding: 8px 12px; border-bottom: 1px solid var(--a4-line-soft); }
      .a4-cert-card:nth-child(odd) { border-right: 1px solid var(--a4-line-soft); }
      .a4-cert-card:nth-last-child(-n+2) { border-bottom: none; }
      .a4-cert-name { font-size: 9pt; font-weight: 800; color: var(--a4-ink); margin-bottom: 2px; }
      .a4-cert-meta { font-size: 8pt; color: var(--a4-mute); }

      /* Page footer */
      .a4-pagefooter {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--a4-line);
        display: flex; justify-content: space-between; align-items: center;
        font-size: 7.5pt;
        color: var(--a4-mute);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .a4-mono-badge {
        display: inline-block;
        padding: 2px 8px;
        border: 1.5px solid var(--a4-ink);
        background: #fff;
        color: var(--a4-ink);
        font-weight: 900;
        font-size: 7.5pt;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .a4-empty { font-size: 9pt; color: var(--a4-mute); font-style: italic; padding: 8px 0; }

      /* ============================
         PRINT — actual A4 output
         ============================ */
      @page { size: A4; margin: 0; }

      @media print {
        html, body { background: #fff !important; }
        body { margin: 0; padding: 0; }
        .a4-toolbar { display: none !important; }
        .a4-stage { padding: 0; gap: 0; }
        .a4-page {
          width: 210mm;
          height: 297mm;
          margin: 0;
          box-shadow: none !important;
          page-break-after: always;
          break-after: page;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
          overflow: hidden;
        }
        .a4-page:last-child { page-break-after: auto; break-after: auto; }
        .a4-page-inner {
          min-height: 297mm;
          height: 297mm;
          max-height: 297mm;
          overflow: hidden;
        }
        .a4-terms {
          column-count: 2;
          font-size: 7.5pt;
          line-height: 1.4;
          max-height: 64mm;
          overflow: hidden;
        }
        .a4-sig-box { min-height: 38mm; }
        .a4-cert { margin-top: 10px; }
        .a4-cert-card { padding: 6px 10px; }
      }
    </style>
  `;
}

/* ------------------------------ main fn ----------------------------- */

function generateInvoiceHtmlA4(invoice, template, options = {}) {
  const items = invoice.items || [];
  const tpl = template || {};
  const locale = options.locale || 'en';
  const copy = getV3Copy(locale);
  const ai4 = (getA4Copy(locale)).a4;
  const dateLocaleMap = { 'zh-Hans': 'zh-CN', 'ms-MY': 'ms-MY', en: 'en-GB' };
  const dateLocale = dateLocaleMap[locale] || 'en-GB';
  formatDate.locale = dateLocale; // not used (purely informational)

  // Recompute values needed by A4 (don't trust V3 generator internals)
  const panelQty = Number(invoice.panel_qty) || 0;
  const panelRating = Number(invoice.panel_rating) || 0;
  const systemSizeKwp = Number(invoice.system_size_kwp)
    || (panelQty && panelRating ? (panelQty * panelRating) / 1000 : 0);

  const packageSearchText = [
    invoice.package_name,
    invoice.package_name_snapshot,
    invoice.panel_name,
    invoice.inverter_name,
    ...items.map((it) => `${it.product_name || ''} ${it.description || ''}`)
  ].join(' ').toLowerCase();

  const hasTigerNeo3 = isTigerNeo3(packageSearchText);
  const hasSajInverter = hasKeyword(packageSearchText, 'saj');
  const hasMasterTecCable = hasKeyword(packageSearchText, 'mastertec')
    || hasKeyword(packageSearchText, 'master tec')
    || hasKeyword(packageSearchText, 'master-tec');

  const inverterName = invoice.inverter_name
    || items.find((it) => (it.product_name || it.description || '').toLowerCase().includes('inverter'))
    || items.find((it) => (it.product_name || it.description || '').toLowerCase().includes('saj'));
  const inverterNameText = inverterName
    ? (inverterName.product_name || inverterName.description || '').trim()
    : '';

  const totalAmount = Number(invoice.total_amount) || 0;
  const sstAmount = Number(invoice.sst_amount) || 0;
  const discountAmount = Number(invoice.discount_amount) || 0;
  const voucherAmount = Number(invoice.voucher_amount) || 0;
  const cnyPromoAmount = Number(invoice.cny_promo_amount) || 0;
  const holidayBoostAmount = Number(invoice.holiday_boost_amount) || 0;
  const earnNowRebateAmount = Number(invoice.earn_now_rebate_amount) || 0;
  const earthMonthGoGreenBonusAmount = Number(invoice.earth_month_go_green_bonus_amount) || 0;
  const subtotal = totalAmount - sstAmount + discountAmount + voucherAmount
    + cnyPromoAmount + holidayBoostAmount + earnNowRebateAmount + earthMonthGoGreenBonusAmount;

  const estimate = normalizeSolarEstimateFields({
    customerAverageTnb: invoice.customer_average_tnb,
    estimatedSaving: invoice.estimated_saving,
    estimatedNewBillAmount: invoice.estimated_new_bill_amount
  });

  const components = {
    items,
    hasTigerNeo3,
    hasSajInverter,
    hasMasterTecCable,
    inverterName: inverterNameText,
    subtotal,
    discount: discountAmount,
    voucher: voucherAmount,
    sst: sstAmount,
    total: totalAmount
  };

  // Toolbar — back/print/download. backTo uses referrer if available, else the canonical mobile URL.
  const token = invoice.share_token || invoice.bubble_id || '';
  const mobileViewUrl = options.mobileViewUrl
    || `/view-v3/${encodeURIComponent(token)}`;
  const pdfUrl = options.pdfUrl
    || `/view-v3/${encodeURIComponent(token)}/pdf`;

  return `<!DOCTYPE html>
<html lang="${copy.htmlLang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A4 Preview · ${escapeHtml(invoice.invoice_number || invoice.bubble_id || 'Invoice')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
${renderStyles()}
</head>
<body class="a4-mode${options.mono ? ' a4-mono' : ''}">

  <!-- Toolbar — hidden in print -->
  <div class="a4-toolbar no-print">
    <div class="a4-toolbar-l">
      <a href="${escapeHtml(mobileViewUrl)}" class="a4-btn ghost" title="${escapeHtml(ai4.backToMobile)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        ${escapeHtml(ai4.backToMobile)}
      </a>
      <span class="a4-toolbar-title">A4 ${escapeHtml(ai4.pageLabel)}</span>
      <span class="a4-toolbar-doc">${escapeHtml(invoice.invoice_number || invoice.bubble_id || '')}</span>
      <a href="?layout=a4${options.mono ? '' : '&mono=1'}" class="a4-btn" title="${escapeHtml(options.mono ? ai4.colorToggle : ai4.monoToggle)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>
        ${escapeHtml(options.mono ? ai4.colorToggle : ai4.monoToggle)}
      </a>
    </div>
    <div class="a4-toolbar-r">
      <button class="a4-btn" onclick="window.print()" title="${escapeHtml(ai4.print)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/></svg>
        ${escapeHtml(ai4.print)}
      </button>
      <button class="a4-btn primary" onclick="downloadPdf()" title="${escapeHtml(ai4.downloadPdf)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
        ${escapeHtml(ai4.downloadPdf)}
      </button>
    </div>
  </div>

  <div class="a4-stage">
    ${renderCoverPage({ invoice, template: tpl, copy, ai4, components, monoBadge: options.mono ? ai4.monoBadge : null })}
    ${renderDetailsPage({ invoice, template: tpl, copy, ai4, components, estimate, monoBadge: options.mono ? ai4.monoBadge : null })}
    ${renderSignaturePage({ invoice, template: tpl, copy, ai4, components, monoBadge: options.mono ? ai4.monoBadge : null })}
  </div>

  <script>
    async function downloadPdf() {
      try {
        const response = await fetch('${escapeHtml(pdfUrl)}');
        const data = await response.json();
        if (data && data.success && data.downloadUrl) {
          let url = data.downloadUrl;
          if (!/^https?:\\/\\//i.test(url)) url = 'https://' + url;
          window.open(url, '_blank', 'noopener');
          return;
        }
        alert('Failed to prepare PDF: ' + ((data && data.error) ? data.error : 'Unknown error'));
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  </script>
</body>
</html>`;
}

module.exports = {
  generateInvoiceHtmlA4
};
