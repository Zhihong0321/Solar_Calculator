const fs = require('fs');
const path = require('path');
const { normalizeSolarEstimateFields } = require('./solarEstimateValues');
const { getV3Copy } = require('./invoiceV3Content');

const TIGER_NEO_3_BANNER_DATA_URI = (() => {
  try {
    const filePath = path.join(process.cwd(), 'v3-quotation-view', 'module-card-reference', 'tiger-neo-3-banner.jpg');
    const fileBuffer = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;
  } catch (err) {
    return '';
  }
})();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `RM ${numeric.toFixed(2)}` : 'RM 0.00';
}

function formatSignedMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'RM 0.00';
  return `${numeric < 0 ? '-' : ''}RM ${Math.abs(numeric).toFixed(2)}`;
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '-';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function normalizeInvoicePackageType(...rawValues) {
  const values = rawValues.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (values.length === 0) return '';
  if (values.some((value) => value === 'commercial' || value.includes('commercial') || value.includes('non-domestic') || value.includes('non domestic') || value.includes('tariff b&d') || value.includes('low voltage'))) {
    return 'commercial';
  }
  if (values.some((value) => value === 'residential' || value.includes('residential'))) {
    return 'residential';
  }
  return values[0];
}

function buildTigerNeoPresentationUrl(invoice) {
  const params = new URLSearchParams();
  if (invoice.customer_name) params.set('customer_name', invoice.customer_name);
  if (invoice.customer_address) params.set('customer_address', invoice.customer_address);
  const panelQty = parseFloat(invoice.panel_qty) || 0;
  const panelRating = parseFloat(invoice.panel_rating) || 0;
  const systemSizeKwp = parseFloat(invoice.system_size_kwp) || (panelQty && panelRating ? (panelQty * panelRating) / 1000 : 0);
  if (panelQty > 0) params.set('panel_qty', String(panelQty));
  if (panelRating > 0) params.set('panel_rating', String(panelRating));
  if (systemSizeKwp > 0) params.set('system_size_kwp', systemSizeKwp.toFixed(2));
  try {
    const presentationPath = path.join(process.cwd(), 'mobile_html_output', 'solar-proposal-2026-tiger-neo-3', 'index.html');
    const presentationStat = fs.statSync(presentationPath);
    params.set('v', String(presentationStat.mtimeMs));
  } catch (err) {
    params.set('v', String(invoice.updated_at || invoice.last_synced_at || Date.now()));
  }
  const query = params.toString();
  return query ? `/t3_html_presentation/solar-proposal-2026-tiger-neo-3/?${query}` : '/t3_html_presentation/solar-proposal-2026-tiger-neo-3/';
}

function findItemText(items, keyword) {
  const needle = String(keyword || '').toLowerCase();
  const match = items.find((item) => `${item.product_name || ''} ${item.description || ''}`.toLowerCase().includes(needle));
  return match ? String(match.product_name || match.description || '').trim() : '';
}

function normalizeSearchText(...values) {
  return values
    .flat(Infinity)
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ');
}

function containsKeyword(source, keyword) {
  return normalizeSearchText(source).includes(String(keyword || '').toLowerCase());
}

function getV3UiText(locale) {
  const lang = String(locale || 'en').toLowerCase();
  const isZh = lang.startsWith('zh');
  const isMs = lang.startsWith('ms') || lang === 'my' || lang === 'bm';

  const copy = {
    systemSpecLinkedSummary: 'The summary below is based on the linked package in this invoice.',
    linkedComponentCards: 'Linked component cards',
    cardsAppearOnlyWhen: 'Cards appear only when the linked package includes the component.',
    included: 'Included',
    tigerNeoCardTitle: 'Tiger Neo 3 Module Card',
    mainPvModule: 'Main PV module',
    durability: 'Durability',
    lowLight: 'Low Light',
    hotWeather: 'Hot Weather',
    degradation: 'Degradation',
    tigerNeoSummary: 'Built for durability, stronger low-light production, and better hot-weather performance across the main array.',
    tigerNeoDurability: 'Excellent module reliability with 3x IEC reliability testing and outdoor performance focus.',
    tigerNeoLowLight: 'Keeps producing in morning, late-afternoon, and cloudy conditions with 95-98% low-irradiance performance at 200W/m².',
    tigerNeoHotWeather: 'Optimized temperature coefficient of about -0.26%/°C helps limit summer power loss.',
    tigerNeoDegradation: 'Annual degradation is around -0.35%, supporting long-term yield stability.',
    tigerNeoNote1: 'Strong low-light response matters for Malaysian roofs where mornings, late afternoons, and overcast periods make up a meaningful part of daily generation time.',
    tigerNeoNote2: 'The hotter the roof gets, the more the lower temperature coefficient helps protect output. That is why this card is centered on summer performance.',
    tigerNeoNote3: 'Use this card as the main product story inside the SPEC tab when the linked package contains Tiger Neo 3.',
    inverterCardTitle: 'SAJ Inverter Card',
    inverterSummary: 'Three-phase string inverter tied to the linked package for stable AC conversion and system control.',
    phase: 'Phase',
    function: 'Function',
    cableCardTitle: 'MasterTec Cable Card',
    cableSummary: 'Electrical cable support for the linked package, covering safe routing, durable installation, and cleaner site execution.',
    cableDetail: 'Show this card when the linked package references MasterTec cable or equivalent cable items in the invoice data.',
    noLinkedComponents: 'No linked component cards found for this package.',
    monthlyPaymentSnapshot: 'Monthly payment snapshot',
    baselineMonthlyBill: 'Baseline monthly bill',
    projectedMonthlyBill: 'Projected monthly bill',
    estimatedDifference: 'Estimated difference',
    qtyUnitPrice: 'Qty / Unit Price',
    quotationSummary: 'Quotation summary'
  };

  if (isZh) {
    return {
      systemSpecLinkedSummary: '下方摘要基于此发票中的关联套装。',
      linkedComponentCards: '关联组件卡片',
      cardsAppearOnlyWhen: '仅当关联套装包含该组件时才会显示卡片。',
      included: '已包含',
      tigerNeoCardTitle: 'Tiger Neo 3 组件卡',
      mainPvModule: '主光伏组件',
      durability: '耐久性',
      lowLight: '弱光表现',
      hotWeather: '高温表现',
      degradation: '衰减',
      tigerNeoSummary: '专为耐久性、更强的弱光发电表现，以及更好的高温性能而设计，覆盖主阵列。',
      tigerNeoDurability: '通过 3x IEC 可靠性测试，强调户外表现，具备出色的组件可靠性。',
      tigerNeoLowLight: '在早晨、傍晚和多云条件下持续发电，在 200W/m² 时保持 95-98% 的低辐照表现。',
      tigerNeoHotWeather: '约 -0.26%/°C 的优化温度系数有助于减少夏季功率损失。',
      tigerNeoDegradation: '年衰减约为 -0.35%，有助于长期发电稳定。',
      tigerNeoNote1: '对马来西亚屋顶来说，早晨、傍晚和阴天时段占日发电时间的重要部分，因此弱光响应非常关键。',
      tigerNeoNote2: '屋顶温度越高，更低的温度系数就越能保护输出，因此这张卡片聚焦夏季性能。',
      tigerNeoNote3: '当关联套装包含 Tiger Neo 3 时，请将此卡片作为 SPEC 页面的主产品说明。',
      inverterCardTitle: 'SAJ 逆变器卡片',
      inverterSummary: '三相串式逆变器，配合关联套装实现稳定交流转换与系统控制。',
      phase: '相位',
      function: '功能',
      cableCardTitle: 'MasterTec 电缆卡片',
      cableSummary: '为关联套装提供电缆支持，覆盖安全布线、耐久安装与更整洁的现场执行。',
      cableDetail: '当关联套装在发票数据中引用 MasterTec 电缆或同类电缆项时显示此卡片。',
      noLinkedComponents: '此套装未找到关联组件卡片。',
      monthlyPaymentSnapshot: '每月付款概览',
      baselineMonthlyBill: '基准月账单',
      projectedMonthlyBill: '预计月账单',
      estimatedDifference: '预计差额',
      qtyUnitPrice: '数量 / 单价',
      quotationSummary: '报价摘要'
    };
  }

  if (isMs) {
    return {
      systemSpecLinkedSummary: 'Ringkasan di bawah adalah berdasarkan pakej yang dipautkan dalam invois ini.',
      linkedComponentCards: 'Kad komponen dipautkan',
      cardsAppearOnlyWhen: 'Kad hanya muncul apabila pakej dipautkan mengandungi komponen tersebut.',
      included: 'Termasuk',
      tigerNeoCardTitle: 'Kad Modul Tiger Neo 3',
      mainPvModule: 'Modul PV utama',
      durability: 'Ketahanan',
      lowLight: 'Cahaya Rendah',
      hotWeather: 'Cuaca Panas',
      degradation: 'Penyusutan',
      tigerNeoSummary: 'Dibina untuk ketahanan, pengeluaran cahaya rendah yang lebih kuat, dan prestasi cuaca panas yang lebih baik pada tatasusunan utama.',
      tigerNeoDurability: 'Kebolehpercayaan modul yang sangat baik dengan ujian kebolehpercayaan IEC 3x dan fokus prestasi luar.',
      tigerNeoLowLight: 'Terus menjana tenaga pada waktu pagi, lewat petang, dan keadaan mendung dengan prestasi 95-98% pada 200W/m².',
      tigerNeoHotWeather: 'Pekali suhu yang dioptimumkan sekitar -0.26%/°C membantu mengurangkan kehilangan kuasa pada musim panas.',
      tigerNeoDegradation: 'Penyusutan tahunan sekitar -0.35%, menyokong kestabilan hasil jangka panjang.',
      tigerNeoNote1: 'Respons cahaya rendah amat penting untuk bumbung di Malaysia kerana waktu pagi, lewat petang, dan cuaca mendung menyumbang bahagian penting kepada penjanaan harian.',
      tigerNeoNote2: 'Semakin panas bumbung, semakin pekali suhu yang lebih rendah membantu melindungi output. Sebab itu kad ini menumpukan prestasi musim panas.',
      tigerNeoNote3: 'Gunakan kad ini sebagai cerita produk utama dalam tab SPEC apabila pakej dipautkan mengandungi Tiger Neo 3.',
      inverterCardTitle: 'Kad Inverter SAJ',
      inverterSummary: 'Inverter string tiga fasa yang dipautkan dengan pakej untuk penukaran AC yang stabil dan kawalan sistem.',
      phase: 'Fasa',
      function: 'Fungsi',
      cableCardTitle: 'Kad Kabel MasterTec',
      cableSummary: 'Sokongan kabel elektrik untuk pakej dipautkan, meliputi laluan selamat, pemasangan tahan lama, dan pelaksanaan tapak yang lebih kemas.',
      cableDetail: 'Tunjukkan kad ini apabila pakej dipautkan merujuk kabel MasterTec atau item kabel yang setara dalam data invois.',
      noLinkedComponents: 'Tiada kad komponen dipautkan ditemui untuk pakej ini.',
      monthlyPaymentSnapshot: 'Ringkasan bayaran bulanan',
      baselineMonthlyBill: 'Bil bulanan asas',
      projectedMonthlyBill: 'Bil bulanan dijangka',
      estimatedDifference: 'Perbezaan anggaran',
      qtyUnitPrice: 'Kuantiti / Harga Seunit',
      quotationSummary: 'Ringkasan sebut harga'
    };
  }

  return copy;
}

function renderSummaryTile(label, value, { note = '', valueClass = 'text-sm', allowHtml = false } = {}) {
  return `
    <div class="bg-surface-container-low p-4">
      <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${escapeHtml(label)}</p>
      <p class="${valueClass} font-black text-primary leading-tight">${allowHtml ? value : escapeHtml(value)}</p>
      ${note ? `<p class="text-[10px] mt-1 text-on-surface-variant leading-snug">${escapeHtml(note)}</p>` : ''}
    </div>
  `;
}

function generateInvoiceHtmlV3(invoice, template, options = {}) {
  const items = invoice.items || [];
  const templateData = template || {};
  const layoutMode = String(options.layout || options.viewMode || '').toLowerCase();
  const isPrintLayout = layoutMode === 'a4' || layoutMode === 'a4-preview' || layoutMode === 'print';
  const locale = options.locale || 'en';
  const copy = getV3Copy(locale);

  const invoiceStatus = String(invoice.status || '').toLowerCase();
  const isConfirmed = invoiceStatus === 'confirmed' || invoiceStatus === 'paid';
  const titleLabel = isConfirmed ? copy.hero.documentKind.invoice : copy.hero.documentKind.quotation;
  const normalizedPackageType = normalizeInvoicePackageType(invoice.package_type, invoice.type, invoice.package_name);
  const ui = getV3UiText(locale);
  const bodyLocaleClass = locale.startsWith('zh') ? 'lang-zh' : '';
  const packageSearchText = normalizeSearchText(
    invoice.package_name,
    invoice.package_name_snapshot,
    invoice.panel_name,
    invoice.inverter_name,
    items.map((item) => `${item.product_name || ''} ${item.description || ''}`)
  );
  const hasTigerNeo3 = containsKeyword(packageSearchText, 'tiger neo 3')
    || containsKeyword(packageSearchText, 'tigerneo3')
    || containsKeyword(packageSearchText, 'jinko solar tiger neo')
    || containsKeyword(packageSearchText, 'jinkosolar tiger neo');
  const hasSajInverter = containsKeyword(packageSearchText, 'saj');
  const hasMasterTecCable = containsKeyword(packageSearchText, 'mastertec')
    || containsKeyword(packageSearchText, 'master tec')
    || containsKeyword(packageSearchText, 'master-tec');
  const presentationLabel = hasTigerNeo3 ? 'TigerNeo 3 Presentation' : 'Tiger Neo Presentation';
  const presentationUrl = buildTigerNeoPresentationUrl(invoice);

  const token = invoice.share_token || invoice.bubble_id || '';
  const currentViewUrl = options.currentViewUrl || `/view-v3/${encodeURIComponent(token)}`;
  const pdfUrl = options.pdfUrl || `/view-v3/${encodeURIComponent(token)}/pdf`;
  
  const panelQty = parseFloat(invoice.panel_qty) || 0;
  const panelRating = parseFloat(invoice.panel_rating) || 0;
  const systemSizeKwp = parseFloat(invoice.system_size_kwp) || (panelQty && panelRating ? (panelQty * panelRating) / 1000 : 0);
  const packageName = invoice.package_name || 'Solar Package';
  const panelName = invoice.panel_name || findItemText(items, 'panel') || 'Panel Type Not Set';
  const inverterName = invoice.inverter_name || findItemText(items, 'inverter') || 'Inverter Type Not Set';
  const packageTypeLabel = normalizedPackageType ? normalizedPackageType.charAt(0).toUpperCase() + normalizedPackageType.slice(1).toLowerCase() : '-';
  const visibleComponentCount = [hasTigerNeo3, hasSajInverter, hasMasterTecCable].filter(Boolean).length;
  const customerName = invoice.customer_name || 'Valued Customer';
  const customerAddress = invoice.customer_address || '';
  const customerPhone = invoice.customer_phone || '';
  const customerEmail = invoice.customer_email || '';
  const invoiceDate = formatDate(invoice.invoice_date || invoice.created_at);
  const createdBy = invoice.created_by_user_name || copy.footer.companyFallback;

  const estimate = normalizeSolarEstimateFields({
    customerAverageTnb: invoice.customer_average_tnb,
    estimatedSaving: invoice.estimated_saving,
    estimatedNewBillAmount: invoice.estimated_new_bill_amount
  });

  const totalAmount = parseFloat(invoice.total_amount) || 0;
  const sstAmount = parseFloat(invoice.sst_amount) || 0;
  const discountAmount = parseFloat(invoice.discount_amount) || 0;
  const voucherAmount = parseFloat(invoice.voucher_amount) || 0;
  const cnyPromoAmount = parseFloat(invoice.cny_promo_amount) || 0;
  const holidayBoostAmount = parseFloat(invoice.holiday_boost_amount) || 0;
  const earnNowRebateAmount = parseFloat(invoice.earn_now_rebate_amount) || 0;
  const earthMonthGoGreenBonusAmount = parseFloat(invoice.earth_month_go_green_bonus_amount) || 0;
  const subtotal = totalAmount - sstAmount + discountAmount + voucherAmount + cnyPromoAmount + holidayBoostAmount + earnNowRebateAmount + earthMonthGoGreenBonusAmount;

  const renderLanguageSwitch = () => {
    if (!options.languageSwitchUrls) return '';
    return `
      <div class="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        ${copy.app.languages.map(lang => `
          <a href="${options.languageSwitchUrls[lang.code] || '#'}" class="transition-colors hover:text-primary ${lang.code === locale ? 'text-primary underline underline-offset-4 decoration-2' : ''}">
            ${lang.label}
          </a>
        `).join('<span class="text-outline-variant/40">/</span>')}
      </div>
    `;
  };

  const navHtml = copy.nav.map(navItem => `
    <a href="#${navItem.id}" onclick="switchTab('${navItem.id}'); event.preventDefault();" id="nav-${navItem.id}" class="nav-btn flex flex-col items-center justify-center h-full w-full hover:text-white transition-all active:bg-black duration-75 text-slate-500">
      <span class="material-symbols-outlined mb-1" style="font-size:1.25rem">${navItem.icon}</span>
      <span class="font-['Inter'] text-[9px] font-bold uppercase tracking-widest leading-none">${navItem.label}</span>
    </a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>${escapeHtml(titleLabel)} ${escapeHtml(invoice.invoice_number || invoice.bubble_id || '')}</title>
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "primary": "#003527",
            "on-primary": "#ffffff",
            "primary-container": "#131b2e",
            "on-primary-container": "#7c9e8f",
            "secondary": "#515f74",
            "on-secondary": "#ffffff",
            "surface": "#fff8f5",
            "on-surface": "#1f1b17",
            "surface-variant": "#eae1da",
            "on-surface-variant": "#45464d",
            "surface-container-lowest": "#ffffff",
            "surface-container-low": "#fcf2eb",
            "surface-container": "#f6ece6",
            "surface-container-high": "#f0e6e0",
            "surface-container-highest": "#eae1da",
            "outline": "#76777d",
            "outline-variant": "#c6c6cd",
            "inverse-surface": "#342f2b",
            "primary-fixed-dim": "#95d3ba"
          },
          fontFamily: { sans: ["Inter", "sans-serif"] },
          borderRadius: {
            "DEFAULT": "0px",
            "sm": "0px",
            "md": "0px",
            "lg": "0px",
            "xl": "0px",
            "2xl": "0px",
            "3xl": "0px",
            "full": "9999px"
          }
        }
      }
    };
  </script>
  <style>
    body { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; min-height: max(884px, 100dvh); background: #fff8f5; }
    .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; display: inline-block; line-height: 1; }
    section.tab-panel { display: none; }
    section.tab-panel.active { display: block; animation: fadeIn 0.25s ease forwards; }
    .nav-btn.active { color: white !important; background-color: #131b2e; }
    .nav-btn.active .material-symbols-outlined { font-variation-settings: 'FILL' 1; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .ledger-divider { border-bottom: 1px solid rgba(198,198,205,0.2); }
    .component-card { background: #fcf2eb; }
    .component-card-label { background: #eae1da; }
    body.lang-zh .text-xs { font-size: 0.875rem !important; line-height: 1.55; }
    body.lang-zh .text-sm { font-size: 1rem !important; line-height: 1.55; }
    body.lang-zh [class*="text-[9px]"] { font-size: 0.75rem !important; line-height: 1.25; }
    body.lang-zh [class*="text-[10px]"] { font-size: 0.8125rem !important; line-height: 1.35; }
  </style>
</head>
<body class="bg-surface text-on-surface min-h-screen flex flex-col ${bodyLocaleClass} ${isPrintLayout ? 'print-layout' : ''}">

  <!-- STICKY DARK HEADER — Stitch "Solar Archive" style -->
  <header class="bg-[#0F172A] text-white sticky top-0 z-50 w-full">
    <div class="flex justify-between items-center px-5 h-14 w-full">
      <div class="flex items-center min-w-0">
        <img src="/logo.png" alt="Eternalgy logo" class="block h-9 w-auto object-contain shrink-0" loading="eager">
      </div>
      <div class="flex items-center gap-1">
        ${renderLanguageSwitch()}
        <button onclick="downloadPdf()" class="hover:bg-slate-800 transition-colors p-2 active:scale-95 duration-100 ml-2">
          <span class="material-symbols-outlined text-white" style="font-size:1.1rem">picture_as_pdf</span>
        </button>
      </div>
    </div>
    <div class="bg-[#131b2e] h-px w-full"></div>
  </header>

  <main class="flex-grow pb-24" id="main-container">

    <!-- HOME TAB -->
    <section id="home" class="tab-panel active w-full">
      <!-- Edge-to-edge hero — dark gradient overlay like Stitch -->
      <div class="relative w-full min-h-[50vw] max-h-[55vh] bg-[#0F172A] overflow-hidden">
        <img alt="Solar installation" class="absolute inset-0 w-full h-full object-cover filter contrast-125 grayscale opacity-60" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCe6zxkDkDoOvrWoPApnTbNpWROgYsccxjdqIAcFo1an4QF__sLBW4cOA4u-WFsKlHSvDYjxBsdE0AS0CsoXz3HIAcosB7bACXZcXomITY2drC_MCZYpJk9WrTWZCwAojbEaahot4yFRpb7UY-q6PTXokEPh3jdAuX8pqXYo9ezS0e833SC_-QFtEwbrkBbFhp-po7tjjEoUNJUy45CoRec5OSz19D5zGc7vrJi62QeBVqPYk4NTb3bZ9zKbaBQ2plIrE8uzIC8Okg">
        <div class="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/40 to-transparent"></div>
        <!-- Verified chip -->
        <div class="absolute top-4 left-4 flex items-center gap-2 bg-primary px-3 py-1.5 z-10">
          <span class="w-1.5 h-1.5 bg-primary-fixed-dim"></span>
          <span class="text-[10px] font-bold text-white tracking-[0.15em] uppercase">${copy.hero.verifiedAsset}</span>
        </div>
        <!-- Hero text pinned to bottom of image -->
        <div class="absolute bottom-0 left-0 right-0 px-5 pb-5">
          <p class="text-[9px] font-bold tracking-[0.3em] text-white/40 uppercase mb-1">${copy.hero.eyebrow}</p>
          <h2 class="text-[2.2rem] font-black tracking-tighter text-white leading-[0.95] uppercase">${copy.hero.titleLines.join('<br>')}</h2>
        </div>
      </div>

      <!-- Executive summary header — border-bottom ledger style -->
      <div class="border-b border-outline-variant/15 px-5 py-5">
        <div class="grid grid-cols-2 gap-0">
          <div class="pr-5 border-r border-outline-variant/15">
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.hero.preparedFor}</p>
            <p class="text-sm font-black tracking-tight text-on-surface uppercase leading-snug">${escapeHtml(customerName)}</p>
          </div>
          <div class="pl-5">
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.hero.projectReference}</p>
            <p class="text-sm font-black font-mono text-on-surface">${escapeHtml(invoice.invoice_number || invoice.bubble_id || 'N/A')}</p>
          </div>
        </div>
      </div>

      <!-- Full-bleed bento stats — no gaps, tonal backgrounds -->
      <div class="grid grid-cols-2 gap-0">
        <div class="bg-surface-container-low p-5 border-r border-b border-outline-variant/15">
          <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${copy.stats.systemCapacity}</p>
          <p class="text-3xl font-black tracking-tighter text-primary">${systemSizeKwp > 0 ? `${systemSizeKwp.toFixed(2)} <span class="text-base font-medium">kWp</span>` : '-'}</p>
        </div>
        <div class="bg-primary-container p-5 border-b border-outline-variant/15">
          <p class="text-[9px] font-bold uppercase tracking-widest text-on-primary-container mb-2">${copy.stats.estimatedSaving}</p>
          <p class="text-3xl font-black tracking-tighter text-white">${estimate.estimatedSaving !== null ? formatMoney(estimate.estimatedSaving) : '-'}</p>
        </div>
        <div class="bg-surface-container-highest p-5 border-r border-outline-variant/15">
          <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${copy.hero.issuedDate}</p>
          <p class="text-sm font-bold text-on-surface">${escapeHtml(invoiceDate)}</p>
        </div>
        <div class="bg-surface-container-low p-5">
          <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${copy.hero.proposedBy}</p>
          <p class="text-sm font-bold text-on-surface">${escapeHtml(createdBy)}</p>
        </div>
      </div>

      <!-- CTA row -->
      <div class="px-5 py-5 flex gap-3">
        <button onclick="switchTab('quotation')" class="flex-1 bg-primary-container text-white py-4 text-[11px] font-bold uppercase tracking-widest active:scale-95 transition-transform flex justify-center items-center gap-2 hover:bg-black transition-colors">
          ${copy.hero.viewProposal} <span class="material-symbols-outlined" style="font-size:1rem">arrow_forward</span>
        </button>
        <button onclick="switchTab('spec')" class="px-5 py-4 bg-surface-container-highest text-on-surface text-[11px] font-bold uppercase tracking-widest active:scale-95 transition-transform hover:bg-surface-container-high transition-colors">
          <span class="material-symbols-outlined" style="font-size:1rem">description</span>
        </button>
      </div>
    </section>

    <!-- SPEC TAB -->
    <section id="spec" class="tab-panel w-full pb-10">
      <!-- Section header — ledger style with border-bottom -->
      <div class="border-b border-outline-variant/15 px-5 pt-6 pb-5">
        <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.sections.systemSpec.eyebrow}</p>
        <h2 class="text-[2rem] font-black tracking-tighter text-primary uppercase leading-[0.95]">${copy.sections.systemSpec.title}</h2>
        <p class="text-xs mt-2 text-on-surface-variant">${copy.sections.systemSpec.description}</p>
      </div>

      <!-- Linked package summary — pulled from the invoice package -->
      <div class="pt-5 pb-4">
        <div class="component-card -mx-5 overflow-hidden">
          <div class="component-card-label px-5 py-1.5 flex justify-between items-center">
            <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${copy.cards.module.linkedPackage}</span>
            <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${escapeHtml(packageTypeLabel)}</span>
          </div>
          <div class="px-5 py-4 border-b border-outline-variant/15">
            <h3 class="text-xl font-black tracking-tighter text-primary uppercase leading-tight">${escapeHtml(packageName)}</h3>
            <p class="text-xs leading-relaxed text-on-surface-variant mt-2">
              ${escapeHtml(`${copy.sections.systemSpec.description} ${ui.systemSpecLinkedSummary}`)}
            </p>
          </div>
          <div class="grid grid-cols-2 gap-px bg-outline-variant/15">
            ${renderSummaryTile(copy.stats.systemCapacity, systemSizeKwp > 0 ? `${systemSizeKwp.toFixed(2)} kWp` : '-', {
              valueClass: 'text-3xl tracking-tighter',
              note: copy.cards.calcHint
            })}
            ${renderSummaryTile(copy.cards.panelQty, panelQty > 0 ? formatNumber(panelQty) : '-', {
              valueClass: 'text-2xl tracking-tighter',
              note: copy.cards.pulledHint
            })}
            ${renderSummaryTile(copy.cards.panelRating, panelRating > 0 ? `${formatNumber(panelRating)} W` : '-', {
              valueClass: 'text-2xl tracking-tighter',
              note: copy.cards.pulledHint
            })}
            ${renderSummaryTile('Package Type', packageTypeLabel, {
              valueClass: 'text-2xl tracking-tighter'
            })}
            ${renderSummaryTile(copy.cards.panelType, panelName, {
              valueClass: 'text-sm uppercase'
            })}
            ${renderSummaryTile(copy.cards.inverterType, inverterName, {
              valueClass: 'text-sm uppercase'
            })}
          </div>
          <div class="px-5 py-3 bg-surface-container-low border-t border-outline-variant/15 flex items-center justify-between gap-3">
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary">${ui.linkedComponentCards}</p>
            <p class="text-sm font-black text-primary">${visibleComponentCount} / 3</p>
          </div>
        </div>
      </div>

      <!-- Components — rendered only when the linked package contains them -->
      <div class="pt-2 pb-2">
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.sections.systemSpec.componentsTitle}</p>
            <p class="text-[10px] mt-1 text-on-surface-variant leading-relaxed">${ui.cardsAppearOnlyWhen}</p>
      </div>
      <div class="space-y-4">
        ${hasTigerNeo3 ? `
          <div class="component-card -mx-5 overflow-hidden">
            <div class="component-card-label px-5 py-1.5 flex justify-between items-center">
              <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${ui.tigerNeoCardTitle || 'Tiger Neo 3 Module Card'}</span>
              <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${ui.included}</span>
            </div>
            <div class="relative">
              <img src="${TIGER_NEO_3_BANNER_DATA_URI}" alt="Tiger Neo 3 banner" class="w-full h-[240px] object-cover">
              <div class="absolute inset-0 bg-gradient-to-t from-[#0F172A]/90 via-[#0F172A]/25 to-transparent"></div>
              <div class="absolute bottom-0 left-0 right-0 px-5 pb-5">
                <p class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-1">${ui.mainPvModule}</p>
                <h3 class="text-2xl font-black tracking-tighter text-white uppercase leading-[0.92]">Jinko Tiger Neo 3</h3>
                <p class="text-xs text-white/75 mt-2 leading-relaxed">${ui.tigerNeoSummary}</p>
              </div>
            </div>
            <div class="px-5 py-5 space-y-5">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="bg-surface-container-low p-4">
                  <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${ui.durability}</p>
                  <p class="text-sm font-black text-primary leading-snug">${ui.tigerNeoDurability}</p>
                </div>
                <div class="bg-surface-container-low p-4">
                  <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${ui.lowLight}</p>
                  <p class="text-sm font-black text-primary leading-snug">${ui.tigerNeoLowLight}</p>
                </div>
                <div class="bg-surface-container-low p-4">
                  <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${ui.hotWeather}</p>
                  <p class="text-sm font-black text-primary leading-snug">${ui.tigerNeoHotWeather}</p>
                </div>
                <div class="bg-surface-container-low p-4">
                  <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-2">${ui.degradation}</p>
                  <p class="text-sm font-black text-primary leading-snug">${ui.tigerNeoDegradation}</p>
                </div>
              </div>
              <div class="space-y-3">
                <div class="flex gap-3">
                  <span class="w-1.5 h-1.5 bg-primary mt-2 shrink-0"></span>
                  <p class="text-xs leading-relaxed text-on-surface-variant">${ui.tigerNeoNote1}</p>
                </div>
                <div class="flex gap-3">
                  <span class="w-1.5 h-1.5 bg-primary mt-2 shrink-0"></span>
                  <p class="text-xs leading-relaxed text-on-surface-variant">${ui.tigerNeoNote2}</p>
                </div>
                <div class="flex gap-3">
                  <span class="w-1.5 h-1.5 bg-primary mt-2 shrink-0"></span>
                  <p class="text-xs leading-relaxed text-on-surface-variant">${ui.tigerNeoNote3}</p>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        ${hasSajInverter ? `
          <div class="component-card -mx-5 overflow-hidden">
            <div class="component-card-label px-5 py-1.5 flex justify-between items-center">
              <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${ui.inverterCardTitle}</span>
              <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${ui.included}</span>
            </div>
            <div class="px-5 py-4 flex justify-between items-start gap-4">
              <div class="w-14 h-14 bg-primary-container flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-white" style="font-size:1.3rem">electric_bolt</span>
              </div>
              <div class="flex-1">
                <h4 class="font-black text-lg text-primary uppercase leading-tight">${escapeHtml(inverterName)}</h4>
                <p class="text-xs leading-relaxed text-on-surface-variant mt-2">${ui.inverterSummary}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-px bg-outline-variant/15">
              ${renderSummaryTile(ui.phase, '3P', { valueClass: 'text-2xl tracking-tighter' })}
              ${renderSummaryTile(ui.function, 'String inverter', { valueClass: 'text-2xl tracking-tighter' })}
            </div>
          </div>
        ` : ''}

        ${hasMasterTecCable ? `
          <div class="component-card -mx-5 overflow-hidden">
            <div class="component-card-label px-5 py-1.5 flex justify-between items-center">
              <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${ui.cableCardTitle}</span>
              <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${ui.included}</span>
            </div>
            <div class="px-5 py-4 flex justify-between items-start gap-4">
              <div class="w-14 h-14 bg-surface-container-highest flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-primary" style="font-size:1.3rem">cable</span>
              </div>
              <div class="flex-1">
                <h4 class="font-black text-lg text-primary uppercase leading-tight">MasterTec Cable</h4>
                <p class="text-xs leading-relaxed text-on-surface-variant mt-2">${ui.cableSummary}</p>
              </div>
            </div>
            <div class="px-5 pb-5">
              <p class="text-xs leading-relaxed text-on-surface-variant">${ui.cableDetail}</p>
            </div>
          </div>
        ` : ''}

        ${!visibleComponentCount ? `
          <div class="mx-0 p-5 bg-surface-container-low border border-dashed border-outline-variant/30 text-center text-xs font-medium text-secondary">
            ${ui.noLinkedComponents}
          </div>
        ` : ''}
      </div>

      <!-- Warranty — same ledger pattern -->
      <div class="px-5 pt-4 pb-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.sections.warranty.title}</p>
      </div>
      <div class="space-y-0">
        ${(invoice.warranties || []).length ? invoice.warranties.map((w, i) => `
          <div class="component-card -mx-5">
            <div class="component-card-label px-5 py-1.5 flex items-center gap-2">
              <span class="material-symbols-outlined text-primary" style="font-size:0.9rem;font-variation-settings:'FILL' 1">verified_user</span>
              <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${escapeHtml(w.name || `Warranty ${i + 1}`)}</span>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs leading-relaxed text-on-surface-variant whitespace-pre-wrap">${escapeHtml(w.terms)}</p>
            </div>
          </div>
          <div class="h-4 bg-surface"></div>
        `).join('') : `
          <div class="mx-0 p-5 bg-surface-container-low border border-dashed border-outline-variant/30 text-center text-xs font-medium text-secondary">
            ${copy.cards.noWarranty}
          </div>
        `}
      </div>
    </section>

    <!-- QUOTATION TAB -->
    <section id="quotation" class="tab-panel w-full pb-10">
      <!-- Section header -->
      <div class="border-b border-outline-variant/15 px-5 pt-6 pb-5">
        <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.sections.quotation.eyebrow}</p>
        <h2 class="text-[2rem] font-black tracking-tighter text-primary uppercase leading-[0.95]">${copy.sections.quotation.title}</h2>
      </div>

      <!-- Savings summary — formal quote snapshot -->
      <div class="overflow-hidden border border-outline-variant/20 bg-surface-container-low">
        <div class="flex items-center justify-between gap-4 border-b border-outline-variant/15 px-5 py-4">
          <div>
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.sections.savings.title}</p>
            <p class="text-sm font-black uppercase tracking-[0.18em] text-on-surface">${ui.monthlyPaymentSnapshot}</p>
          </div>
          <span class="material-symbols-outlined text-outline-variant/60" style="font-size:1.2rem">account_balance</span>
        </div>
        <div class="grid grid-cols-1 gap-px bg-outline-variant/15 sm:grid-cols-3">
          <div class="bg-surface-container-lowest px-5 py-4">
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.savings.cards ? copy.savings.cards.averageBill || 'Current Bill' : 'Current Bill'}</p>
            <p class="text-sm font-medium uppercase tracking-[0.12em] text-on-surface-variant">${ui.baselineMonthlyBill}</p>
            <p class="mt-3 text-2xl font-black tracking-tighter text-on-surface-variant line-through decoration-1">${estimate.beforeSolarBill !== null ? formatMoney(estimate.beforeSolarBill) : '-'}</p>
          </div>
          <div class="bg-surface-container-lowest px-5 py-4">
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.savings.cards ? copy.savings.cards.estimatedNewBill || copy.savings.cards.newBill || 'Solar Bill' : 'Solar Bill'}</p>
            <p class="text-sm font-medium uppercase tracking-[0.12em] text-on-surface-variant">${ui.projectedMonthlyBill}</p>
            <p class="mt-3 text-2xl font-black tracking-tighter text-primary">${estimate.estimatedNewBillAmount !== null ? formatMoney(estimate.estimatedNewBillAmount) : '-'}</p>
          </div>
          <div class="bg-surface-container-lowest px-5 py-4">
            <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.stats.estimatedSaving}</p>
            <p class="text-sm font-medium uppercase tracking-[0.12em] text-on-surface-variant">${ui.estimatedDifference}</p>
            <p class="mt-3 text-2xl font-black tracking-tighter text-primary">${estimate.estimatedSaving !== null ? formatMoney(estimate.estimatedSaving) : '-'}</p>
          </div>
        </div>
      </div>

      <!-- Line items — standardized quotation table -->
      <div class="px-5 pt-6 pb-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.quotation.table.description}</p>
      </div>
      <div class="overflow-hidden border border-outline-variant/20 bg-surface-container-lowest">
        <div class="grid gap-2 border-b border-outline-variant/15 bg-surface-container-low px-5 py-3" style="grid-template-columns:minmax(0,1.2fr) minmax(96px,0.8fr) minmax(78px,0.6fr)">
          <span class="min-w-0 text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.quotation.table.description}</span>
          <span class="text-right text-[9px] font-bold uppercase tracking-widest text-secondary">${ui.qtyUnitPrice}</span>
          <span class="text-right text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.quotation.table.amount}</span>
        </div>
        ${items.map((item) => {
          const qty = parseFloat(item.qty) || 0;
          const total = parseFloat(item.total_price) || 0;
          const unit = qty > 0 ? total / qty : 0;
          return `
            <div class="grid gap-2 border-b border-outline-variant/10 px-5 py-4 last:border-b-0 items-start" style="grid-template-columns:minmax(0,1.2fr) minmax(96px,0.8fr) minmax(78px,0.6fr)">
              <div class="min-w-0">
                <p class="text-[11px] font-semibold leading-[1.35] tracking-tight text-on-surface break-words whitespace-normal hyphens-auto">${escapeHtml(item.description || item.product_name)}</p>
              </div>
              <div class="text-right min-w-0">
                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">${formatNumber(qty)} x</p>
                <p class="mt-1 text-[11px] font-semibold text-on-surface-variant whitespace-nowrap">${formatSignedMoney(unit)}</p>
              </div>
              <p class="text-right text-[11px] font-black text-primary whitespace-nowrap">${formatSignedMoney(total)}</p>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Financial totals — formal summary block -->
      <div class="overflow-hidden border border-outline-variant/20 bg-surface-container-lowest">
        <div class="border-b border-outline-variant/15 px-5 py-4">
          <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.totals.title}</p>
          <p class="text-sm font-black uppercase tracking-[0.18em] text-on-surface">${ui.quotationSummary}</p>
        </div>
        <div class="px-5 py-4 space-y-3">
          ${[
            [copy.totals.subtotal, formatMoney(subtotal), false],
            [copy.quotation.adjustments.discount, discountAmount > 0 ? formatSignedMoney(-Math.abs(discountAmount)) : null, true],
            [copy.quotation.adjustments.voucher, voucherAmount > 0 ? formatSignedMoney(-Math.abs(voucherAmount)) : null, true],
            [copy.quotation.adjustments.tax, sstAmount > 0 ? formatSignedMoney(sstAmount) : null, false],
          ].filter(r => r[1] !== null).map((row) => `
            <div class="flex items-center justify-between gap-4 text-sm ${row[2] ? 'text-red-600' : 'text-on-surface-variant'}">
              <span class="font-semibold">${escapeHtml(row[0])}</span>
              <span class="font-semibold">${escapeHtml(row[1])}</span>
            </div>
          `).join('')}
          <div class="flex items-end justify-between gap-4 border-t border-outline-variant/15 pt-3">
            <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.totals.total}</span>
            <span class="text-4xl font-black tracking-tighter text-primary">${formatMoney(totalAmount)}</span>
          </div>
        </div>
      </div>

      <!-- Payment details -->
      <div class="px-5 pt-6 pb-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.cards.payment.title}</p>
      </div>
      <div class="overflow-hidden border border-outline-variant/20 bg-surface-container-lowest">
        <div class="border-b border-outline-variant/15 px-5 py-3 bg-surface-container-low">
          <span class="text-[9px] font-bold tracking-widest uppercase text-secondary">${copy.cards.payment.bank}</span>
        </div>
        <div class="px-5 py-3 flex justify-between items-baseline border-b border-outline-variant/10">
          <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.cards.payment.bank}</span>
          <span class="text-sm font-bold text-on-surface">${escapeHtml(templateData.bank_name || '-')}</span>
        </div>
        <div class="px-5 py-3 flex justify-between items-baseline border-b border-outline-variant/10">
          <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.cards.payment.account}</span>
          <span class="text-sm font-black font-mono text-on-surface">${escapeHtml(templateData.bank_account_no || '-')}</span>
        </div>
        <div class="px-5 py-3 flex justify-between items-baseline">
          <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.cards.payment.name}</span>
          <span class="text-sm font-bold text-on-surface">${escapeHtml(templateData.bank_account_name || '-')}</span>
        </div>
      </div>

      <!-- Signature block -->
      <div class="px-5 pt-6 pb-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-secondary">${copy.cards.signature.title}</p>
      </div>
      <div class="component-card mx-0 text-center">
        ${invoice.customer_signature ? `
          <img src="${escapeHtml(invoice.customer_signature.startsWith('//') ? 'https:' + invoice.customer_signature : invoice.customer_signature)}" class="w-full max-w-[260px] h-28 object-contain bg-surface-container-low mx-auto mb-3 mt-4">
          <p class="font-black text-sm text-on-surface uppercase pb-4">${escapeHtml(customerName)}</p>
          ${invoice.signature_date ? `<p class="text-[9px] tracking-widest uppercase text-secondary pb-4">${copy.cards.signature.signedOnPrefix} ${escapeHtml(formatDate(invoice.signature_date))}</p>` : ''}
        ` : `
          <div class="py-8 flex flex-col items-center">
            <span class="material-symbols-outlined text-4xl text-outline-variant/40 mb-3">ink_pen</span>
            <p class="text-sm font-medium text-on-surface-variant mb-5">${copy.cards.signature.noSignature}</p>
            <button onclick="window.open('${currentViewUrl}')" class="bg-[#0F172A] text-white px-6 py-3 text-[10px] uppercase font-bold tracking-widest active:scale-95 transition-transform">${copy.cards.signature.openSignature}</button>
          </div>
        `}
      </div>
      <div class="h-6 bg-surface"></div>
    </section>

    <!-- SLIDE TAB -->
    <section id="slide" class="tab-panel w-full p-0 m-0">
      <iframe
        src="${presentationUrl}"
        title="${escapeHtml(presentationLabel)}"
        class="block w-full h-[100dvh] min-h-[100dvh] border-0"
        loading="eager"
        allowfullscreen
      ></iframe>
    </section>

    <!-- TNC TAB -->
    <section id="tnc" class="tab-panel w-full pb-16">
      <div class="border-b border-outline-variant/15 px-5 pt-6 pb-5">
        <p class="text-[9px] font-bold uppercase tracking-widest text-secondary mb-1">${copy.sections.tnc.eyebrow}</p>
        <h2 class="text-[2rem] font-black tracking-tighter text-primary uppercase leading-[0.95]">${copy.sections.tnc.title}</h2>
      </div>

      <!-- Terms — Stitch "Knowledge Hub" style: tonal block, no border -->
      <div class="bg-surface-container-low px-5 py-6 relative overflow-hidden">
        <div class="absolute top-0 right-0 p-4 pointer-events-none select-none">
          <span class="text-[5rem] font-black text-primary opacity-[0.025] leading-none">T&amp;C</span>
        </div>
        <div class="text-xs leading-loose text-on-surface-variant whitespace-pre-wrap relative z-10">
          ${escapeHtml(templateData.terms_and_conditions || copy.terms.paragraphs.join('\n\n'))}
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 pt-8 pb-4 border-t border-outline-variant/15 mt-6 flex flex-col gap-1.5 text-xs font-medium text-secondary text-center">
        <p>${copy.footer.createdBy} <strong class="text-on-surface font-black">${escapeHtml(createdBy)}</strong></p>
        <p>${escapeHtml(templateData.company_name || copy.footer.companyFallback)}</p>
      </div>
    </section>

  </main>

  <!-- BOTTOM NAV — Stitch dark nav bar -->
  ${!isPrintLayout ? `
  <nav id="bottom-nav" class="fixed bottom-0 left-0 w-full h-[72px] z-50 flex justify-around items-stretch bg-[#0F172A] border-t border-[#131b2e] shadow-[0_-8px_32px_rgba(0,0,0,0.3)]" style="padding-bottom: env(safe-area-inset-bottom)">
    ${navHtml}
  </nav>
  ` : ''}

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.style.animation = 'none';
        panel.offsetHeight;
        panel.style.animation = null;
      });
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      const tgt = document.getElementById(tabId);
      if (tgt) tgt.classList.add('active');
      const btn = document.getElementById('nav-' + tabId);
      if (btn) {
        btn.classList.add('active');
        btn.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
      }
      document.querySelectorAll('.nav-btn:not(.active) .material-symbols-outlined').forEach(icon => {
        icon.style.fontVariationSettings = "'FILL' 0";
      });
      window.scrollTo(0, 0);
    }

    async function downloadPdf() {
      try {
        const response = await fetch('${pdfUrl}');
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

    document.addEventListener('DOMContentLoaded', () => {
      const initialTab = window.location.hash.replace('#', '') || 'home';
      switchTab(initialTab);
    });
  </script>
</body>
</html>`;
}

module.exports = {
  generateInvoiceHtmlV3
};
