const LOCALE_ALIASES = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  cn: 'zh-Hans',
  ms: 'ms-MY',
  my: 'ms-MY',
  'ms-my': 'ms-MY',
  bm: 'ms-MY'
};

const COPY = {
  en: {
    htmlLang: 'en',
    app: {
      name: 'Invoice View V3',
      workspace: 'Workspace',
      mode: 'Mini app mode',
      languageSwitch: 'Language',
      previewLocal: 'Local preview',
      previewLive: 'Live preview',
      languages: [
        { code: 'en', label: 'English' },
        { code: 'zh-Hans', label: '中文' },
        { code: 'ms-MY', label: 'Melayu' }
      ],
      quickMap: 'Use the bottom navigation to jump between sections.'
    },
    nav: [
      { id: 'home', label: 'HOME', icon: 'home' },
      { id: 'spec', label: 'SPEC', icon: 'description' },
      { id: 'quotation', label: 'QUOTATION', icon: 'payments' },
      { id: 'slide', label: 'SLIDE', icon: 'auto_stories' },
      { id: 'tnc', label: 'TNC', icon: 'draw' }
    ],
    hero: {
      eyebrow: 'Proposal',
      documentKind: {
        invoice: 'INVOICE',
        quotation: 'QUOTATION'
      },
      titleLines: ['SOLAR ENERGY', 'QUOTATION'],
      subtitle: 'Premium Quotation View',
      verifiedAsset: 'Verified Asset',
      referenceTag: 'Reference style',
      referenceBody: 'A cover-first quotation view with app-like controls.',
      preparedFor: 'Prepared for',
      projectReference: 'Project Reference',
      issuedDate: 'Issued Date',
      proposedBy: 'Proposed By',
      viewProposal: 'View Proposal',
      openDeck: 'Open Deck',
      downloadPdf: 'Download PDF'
    },
    stats: {
      systemCapacity: 'System Capacity',
      estimatedSaving: 'Estimated Saving',
      quotationTotal: 'Quotation Total',
      panelQty: 'Panel Qty',
      peakPvOutput: 'Peak PV output',
      monthlyBenefit: 'Monthly benefit',
      finalAmount: 'Final amount',
      installedModules: 'Installed modules'
    },
    sections: {
      systemSpec: {
        eyebrow: '01. System Spec',
        title: 'System Spec Summary',
        description: 'Key details about your solar installation.',
        summaryTitle: 'Package Overview',
        componentsTitle: 'Hardware Components',
        componentsDescription: 'Detailed information and warranties for your system components.'
      },
      warranty: {
        eyebrow: '02. Warranty',
        title: 'Coverage Summary',
        description: 'Peace of mind with industry-leading warranties.'
      },
      savings: {
        eyebrow: '03. Savings',
        title: 'Savings Estimation',
        description: 'Estimated monthly bill savings based on your usage.'
      },
      quotation: {
        eyebrow: '04. Commercial',
        title: 'Quotation Details',
        description: 'Itemized pricing and payment information.'
      },
      presentation: {
        eyebrow: '05. Presentation',
        title: 'Product Information',
        description: 'Supporting details for the components in your package.'
      },
      tnc: {
        eyebrow: '06. Terms',
        title: 'Terms & Conditions',
        description: 'Legal and policy information for this quotation.'
      }
    },
    cards: {
      package: 'Package',
      systemSize: 'System Size',
      panelQty: 'Panel Qty',
      panelType: 'Panel Type',
      inverterType: 'Inverter Type',
      panelRating: 'Panel Rating',
      calcHint: 'Calculated from configuration',
      panelQtyHint: 'Not set',
      pulledHint: 'From package',
      estimateHint: 'For savings estimate',
      warrantyLine: 'Warranty',
      noWarranty: 'Warranty details not attached.',
      noItems: 'No items found.',
      payment: {
        title: 'Payment Details',
        bank: 'Bank',
        account: 'Account Number',
        name: 'Account Name',
        ref: 'Reference'
      },
      signature: {
        title: 'Confirmation',
        noSignature: 'Awaiting signature.',
        openSignature: 'Sign Online',
        signedOnPrefix: 'Signed on'
      },
      module: {
        title: 'Component Details',
        statusIncluded: 'Included',
        statusPending: 'Pending',
        linkedPackage: 'Package link',
        warranty: 'Warranty',
        warrantyPending: 'Info pending',
        specs: 'Specifications',
        model: 'Model',
        detailsPending: 'Details pending',
        summaryPanel: 'High-performance solar modules.',
        summaryInverter: 'Advanced power conversion.',
        summaryCable: 'Premium electrical infra.'
      }
    },
    savings: {
      headline: 'Estimated monthly saving',
      fromTo: 'From {{before}} to {{after}}',
      noEstimate: 'Saving estimate pending refresh.',
      cards: {
        averageBill: 'Current Bill',
        estimatedNewBill: 'New Bill',
        sunPeakHour: 'Sun Hours',
        morningUsage: 'Day Usage',
        savingStatus: 'Status',
        packageType: 'Type'
      }
    },
    quotation: {
      table: {
        number: '#',
        description: 'Description',
        qty: 'Qty',
        unit: 'Unit Price',
        amount: 'Total'
      },
      adjustments: {
        discount: 'Discount',
        voucher: 'Voucher',
        cnyPromo: 'CNY Promo',
        holidayBoost: 'Holiday Boost',
        earnNowRebate: 'Earn Now Rebate',
        earthMonthBonus: 'Earth Month Bonus',
        tax: 'Tax (6%)'
      }
    },
    totals: {
      title: 'Final Summary',
      subtotal: 'Subtotal',
      total: 'Total Amount'
    },
    footer: {
      createdBy: 'Created by',
      companyFallback: 'Solar Provider'
    },
    terms: {
      paragraphs: [
        'All pricing is subject to final site verification.',
        'Quotation valid for a limited time.',
        'Payment terms as per agreement.',
        'Site condition changes may affect pricing.',
        'By proceeding, you accept these terms.'
      ]
    }
  },
  'zh-Hans': {
    htmlLang: 'zh-Hans',
    app: {
      name: '报价视图 V3',
      workspace: '工作区',
      mode: '迷你应用',
      languageSwitch: '语言',
      previewLocal: '本地预览',
      previewLive: '在线预览',
      languages: [
        { code: 'en', label: 'English' },
        { code: 'zh-Hans', label: '中文' },
        { code: 'ms-MY', label: 'Melayu' }
      ],
      quickMap: '使用底部导航切换页面。'
    },
    nav: [
      { id: 'home', label: '首页', icon: 'home' },
      { id: 'spec', label: '规格', icon: 'description' },
      { id: 'quotation', label: '报价', icon: 'payments' },
      { id: 'slide', label: '展示', icon: 'auto_stories' },
      { id: 'tnc', label: '条款', icon: 'draw' }
    ],
    hero: {
      eyebrow: '方案建议',
      documentKind: {
        invoice: '发票',
        quotation: '报价单'
      },
      titleLines: ['太阳能', '报价单'],
      subtitle: '高级报价视图',
      verifiedAsset: '已验证',
      referenceTag: '参考风格',
      referenceBody: '应用式控制的报价视图。',
      preparedFor: '客户姓名',
      projectReference: '项目编号',
      issuedDate: '发日期',
      proposedBy: '提案商',
      viewProposal: '查看方案',
      openDeck: '打开演示',
      downloadPdf: '下载 PDF'
    },
    stats: {
      systemCapacity: '系统容量',
      estimatedSaving: '预计节省',
      quotationTotal: '报价总额',
      panelQty: '面板数量',
      peakPvOutput: '峰值功率',
      monthlyBenefit: '每月收益',
      finalAmount: '最终金额',
      installedModules: '安装组件'
    },
    sections: {
      systemSpec: {
        eyebrow: '01. 系统规格',
        title: '系统规格说明',
        description: '您的太阳能系统核心细节。',
        summaryTitle: '方案概览',
        componentsTitle: '硬件组件',
        componentsDescription: '系统组件的详细信息和保修。'
      },
      warranty: {
        eyebrow: '02. 保修',
        title: '保修项目摘要',
        description: '行业领先的质量保障。'
      },
      savings: {
        eyebrow: '03. 节省',
        title: '节省估算',
        description: '根据您的用量估算的每月节省。'
      },
      quotation: {
        eyebrow: '04. 商业',
        title: '报价明细',
        description: '明细定价和付款信息。'
      },
      presentation: {
        eyebrow: '05. 展示',
        title: '产品信息',
        description: '方案中组件的配套说明。'
      },
      tnc: {
        eyebrow: '06. 条款',
        title: '条款与条件',
        description: '法律和政策信息。'
      }
    },
    cards: {
      package: '方案',
      systemSize: '系统容量',
      panelQty: '面板数量',
      panelType: '面板类型',
      inverterType: '逆变器类型',
      panelRating: '面板功率',
      calcHint: '根据配置计算',
      panelQtyHint: '未设置',
      pulledHint: '来自方案',
      estimateHint: '用于节省估算',
      warrantyLine: '保修',
      noWarranty: '未附带保修细节。',
      noItems: '未找到项目。',
      payment: {
        title: '付款详情',
        bank: '银行',
        account: '账号',
        name: '户名',
        ref: '参考'
      },
      signature: {
        title: '确认',
        noSignature: '等待签名。',
        openSignature: '在线签名',
        signedOnPrefix: '签署日期'
      },
      module: {
        title: '组件详情',
        statusIncluded: '已包含',
        statusPending: '待定',
        linkedPackage: '方案链接',
        warranty: '保修',
        warrantyPending: '信息待定',
        specs: '技术规格',
        model: '型号',
        detailsPending: '细节待定',
        summaryPanel: '高性能太阳能组件。',
        summaryInverter: '先进的电源转换技术。',
        summaryCable: '高级电力基础设施。'
      }
    },
    savings: {
      headline: '预计每月节省',
      fromTo: '从 {{before}} 到 {{after}}',
      noEstimate: '保存的估算待更新。',
      cards: {
        averageBill: '当前账单',
        estimatedNewBill: '预计新账单',
        sunPeakHour: '光照时间',
        morningUsage: '白天用量',
        savingStatus: '状态',
        packageType: '类型'
      }
    },
    quotation: {
      table: {
        number: '#',
        description: '描述',
        qty: '数量',
        unit: '单价',
        amount: '总额'
      },
      adjustments: {
        discount: '折扣',
        voucher: '代金券',
        cnyPromo: '新春促销',
        holidayBoost: '节日加值',
        earnNowRebate: '即得返利',
        earthMonthBonus: '地球月奖金',
        tax: '税金 (6%)'
      }
    },
    totals: {
      title: '最终汇总',
      subtotal: '小计',
      total: '总计金额'
    },
    footer: {
      createdBy: '报价由创建',
      companyFallback: '太阳能提供商'
    },
    terms: {
      paragraphs: [
        '所有价格以现场核实为准。',
        '报价在限定时间内有效。',
        '付款方式按协议执行。',
        '现场条件变化或影响价格。',
        '继续操作即视为接受条款。'
      ]
    }
  },
  'ms-MY': {
    htmlLang: 'ms',
    app: {
      name: 'Paparan Sebut Harga V3',
      workspace: 'Ruang Kerja',
      mode: 'Aplikasi mini',
      languageSwitch: 'Bahasa',
      previewLocal: 'Pratonton Tempatan',
      previewLive: 'Pratonton Langsung',
      languages: [
        { code: 'en', label: 'English' },
        { code: 'zh-Hans', label: '中文' },
        { code: 'ms-MY', label: 'Melayu' }
      ],
      quickMap: 'Gunakan navigasi bawah untuk menukar skrin.'
    },
    nav: [
      { id: 'home', label: 'UTAMA', icon: 'home' },
      { id: 'spec', label: 'SPES', icon: 'description' },
      { id: 'quotation', label: 'SEBUT HARGA', icon: 'payments' },
      { id: 'slide', label: 'SLAID', icon: 'auto_stories' },
      { id: 'tnc', label: 'TERMA', icon: 'draw' }
    ],
    hero: {
      eyebrow: 'Cadangan',
      documentKind: {
        invoice: 'INVOIS',
        quotation: 'SEBUT HARGA'
      },
      titleLines: ['TENAGA SURIA', 'SEBUT HARGA'],
      subtitle: 'Paparan Sebut Harga Premium',
      verifiedAsset: 'Aset Disahkan',
      referenceTag: 'Gaya Rujukan',
      referenceBody: 'Paparan sebut harga dengan kawalan seperti aplikasi.',
      preparedFor: 'Disediakan untuk',
      projectReference: 'Rujukan Projek',
      issuedDate: 'Tarikh Dikeluarkan',
      proposedBy: 'Dicadangkan Oleh',
      viewProposal: 'Lihat Cadangan',
      openDeck: 'Buka Slaid',
      downloadPdf: 'Muat Turun PDF'
    },
    stats: {
      systemCapacity: 'Kapasiti Sistem',
      estimatedSaving: 'Jimat Anggaran',
      quotationTotal: 'Jumlah Sebut Harga',
      panelQty: 'Kuantiti Panel',
      peakPvOutput: 'Output PV Puncak',
      monthlyBenefit: 'Faedah Bulanan',
      finalAmount: 'Jumlah Akhir',
      installedModules: 'Modul Dipasang'
    },
    sections: {
      systemSpec: {
        eyebrow: '01. Spesifikasi',
        title: 'Ringkasan Spesifikasi Sistem',
        description: 'Butiran utama pemasangan solar anda.',
        summaryTitle: 'Gambaran Pakej',
        componentsTitle: 'Komponen Perkakasan',
        componentsDescription: 'Maklumat terperinci dan waranti untuk komponen sistem anda.'
      },
      warranty: {
        eyebrow: '02. Waranti',
        title: 'Ringkasan Liputan',
        description: 'Ketenangan minda dengan waranti teraju industri.'
      },
      savings: {
        eyebrow: '03. Penjimatan',
        title: 'Anggaran Penjimatan',
        description: 'Anggaran penjimatan bil bulanan berdasarkan penggunaan anda.'
      },
      quotation: {
        eyebrow: '04. Komersial',
        title: 'Butiran Sebut Harga',
        description: 'Harga baris demi baris dan maklumat bayaran.'
      },
      presentation: {
        eyebrow: '05. Persembahan',
        title: 'Maklumat Produk',
        description: 'Butiran sokongan untuk komponen dalam pakej anda.'
      },
      tnc: {
        eyebrow: '06. Terma',
        title: 'Terma & Syarat',
        description: 'Maklumat undang-undang dan polisi untuk sebut harga ini.'
      }
    },
    cards: {
      package: 'Pakej',
      systemSize: 'Saiz Sistem',
      panelQty: 'Kuantiti Panel',
      panelType: 'Jenis Panel',
      inverterType: 'Jenis Inverter',
      panelRating: 'Penarafan Panel',
      calcHint: 'Dikira daripada konfigurasi',
      panelQtyHint: 'Tidak ditetapkan',
      pulledHint: 'Dari pakej',
      estimateHint: 'Untuk anggaran jimat',
      warrantyLine: 'Waranti',
      noWarranty: 'Butiran waranti belum dilampirkan.',
      noItems: 'Tiada item ditemui.',
      payment: {
        title: 'Butiran Bayaran',
        bank: 'Bank',
        account: 'Nombor Akaun',
        name: 'Nama Akaun',
        ref: 'Rujukan'
      },
      signature: {
        title: 'Pengesahan',
        noSignature: 'Menunggu tandatangan.',
        openSignature: 'Tandatangan Online',
        signedOnPrefix: 'Ditandatangani pada'
      },
      module: {
        title: 'Butiran Komponen',
        statusIncluded: 'Termasuk',
        statusPending: 'Belum lengkap',
        linkedPackage: 'Pautan pakej',
        warranty: 'Waranti',
        warrantyPending: 'Maklumat belum lengkap',
        specs: 'Spesifikasi Teknikal',
        model: 'Model',
        detailsPending: 'Butiran belum lengkap',
        summaryPanel: 'Modul solar berprestasi tinggi.',
        summaryInverter: 'Penukaran kuasa canggih.',
        summaryCable: 'Infrastruktur elektrik premium.'
      }
    },
    savings: {
      headline: 'Anggaran jimat bulanan',
      fromTo: 'Dari {{before}} ke {{after}}',
      noEstimate: 'Anggaran jimat perlu dikemas kini.',
      cards: {
        averageBill: 'Bil Semasa',
        estimatedNewBill: 'Bil Baharu',
        sunPeakHour: 'Jam Cahaya',
        morningUsage: 'Guna Siang',
        savingStatus: 'Status',
        packageType: 'Jenis'
      }
    },
    quotation: {
      table: {
        number: '#',
        description: 'Penerangan',
        qty: 'Kuantiti',
        unit: 'Harga Unit',
        amount: 'Jumlah'
      },
      adjustments: {
        discount: 'Diskaun',
        voucher: 'Baucar',
        cnyPromo: 'Promosi CNY',
        holidayBoost: 'Holiday Boost',
        earnNowRebate: 'Rebat Earn Now',
        earthMonthBonus: 'Bonus Bulan Bumi',
        tax: 'Cukai (6%)'
      }
    },
    totals: {
      title: 'Ringkasan Akhir',
      subtotal: 'Jumlah Kecil',
      total: 'Jumlah Keseluruhan'
    },
    footer: {
      createdBy: 'Dicipta oleh',
      companyFallback: 'Pembekal Solar'
    },
    terms: {
      paragraphs: [
        'Semua harga tertakluk kepada pengesahan tapak akhir.',
        'Sebut harga sah untuk tempoh terhad.',
        'Terma bayaran seperti perjanjian.',
        'Perubahan keadaan tapak boleh menjejaskan harga.',
        'Dengan meneruskan, anda menerima terma ini.'
      ]
    }
  }
};

function normalizeV3Locale(input) {
  const normalized = String(input || '').trim().toLowerCase();
  return LOCALE_ALIASES[normalized] || 'en';
}

function getV3Copy(input) {
  const locale = normalizeV3Locale(input);
  return COPY[locale] || COPY.en;
}

module.exports = {
  COPY,
  getV3Copy,
  normalizeV3Locale,
  LOCALE_ALIASES
};
