(() => {
  const button = document.querySelector('.nav-lang');
  if (!button) return;
  const labels = {
    'Solar PV Planner': '太阳能系统规划', 'LIVE': '实时',
    'Quotation': '报价单', 'Invoice': '发票', 'QUOTATION': '报价单', 'INVOICE': '发票',
    'Panels': '太阳能板', 'System': '系统', 'Quoted': '报价',
    'Bill To': '客户', 'Issued': '开具日期', 'Due': '到期日期', 'Package': '方案', 'By': '经办人',
    'Recommended Package': '推荐方案', 'System Size': '系统容量', 'Panel Type': '太阳能板类型',
    'Sun Peak': '峰值日照', 'Monthly Bill Projection': '每月电费预估',
    'Total Solar Generation': '太阳能总发电量', 'Before Solar': '安装前', 'After Solar': '安装后',
    'Monthly Bill': '每月电费', 'Before': '安装前', 'After': '安装后',
    'Monthly Savings': '每月节省', 'Year 1 Return': '首年回报',
    'Use Recalculate to update this estimate.': '点击重新计算以更新预估。',
    'Recalculate': '重新计算', 'Full Month': '整月', '<28 Days': '少于28天',
    'Simulation Disclaimer': '模拟免责声明', 'Energy Flow · Monthly': '每月能源流向',
    'Where Solar Generation Goes': '太阳能发电用途', 'Offset by Solar': '太阳能抵扣',
    'Export to FiT': '输出至电网', 'Credit Next Month (Backup)': '结转下月（备用）',
    'FiT Income': '电网输出收益', 'Home Consumption': '家庭用电量', 'Grid Import': '电网供电',
    'Quotation Summary': '报价明细', 'Item': '项目', 'Qty': '数量', 'Unit': '单价', 'Total': '总额',
    'Includes SST': '包含SST', 'All prices as listed': '价格如上所列',
    'Subtotal (Goods)': '商品小计', 'Less: Promo Discount': '减：促销折扣', 'Voucher Credit': '优惠券抵扣',
    'CNY 2026 Reward': '2026新春奖励', 'Holiday Boost Reward': '假期奖励',
    'Earn Now Rebate': '即时回扣', 'Earth Month Go Green Bonus': '地球月环保奖励',
    'Total Due': '应付总额', 'Total Quoted': '报价总额',
    'Payment Terms': '付款条款', 'Payment Schedule': '付款安排',
    'Warranty & Guarantees': '保修与保障', 'Included Warranties': '包含的保修',
    'Payment Details': '付款信息', 'Bank Transfer': '银行转账', 'Bank': '银行',
    'Account Name': '账户名称', 'Account No': '账户号码', 'Reference': '付款备注',
    'Customer Acknowledgement': '客户确认', 'Digital Signature': '电子签名',
    'Sign this Quotation': '签署此报价单', 'Sign this Invoice': '签署此发票',
    'Sign this QUOTATION': '签署此报价单', 'Sign this INVOICE': '签署此发票',
    'No signature on file': '尚未签署', 'Re-sign': '重新签署', 'Terms & Conditions': '条款与条件',
    'Registered & Certified As': '注册与认证', 'CIDB Registered Contractor': 'CIDB注册承包商',
    'SEDA Solar PV Service Provider': 'SEDA太阳能服务商', 'SEDA Solar PV Investor': 'SEDA太阳能投资方',
    'MyHijau Equipment Cert': 'MyHijau设备认证', 'Share': '分享', 'Refer Program': '推荐计划',
    'SEDA Form': 'SEDA表格', 'View Proposal': '查看提案', 'A4 Print Preview': 'A4打印预览', 'PRINTABLE': '打印版',
    'GENERATE TIGER NEO 3 PROPOSAL': '生成Tiger Neo 3提案',
    'Generate Tiger Neo 3 Proposal →': '生成Tiger Neo 3提案 →',
    'Important Commercial Notice': '重要商业须知', 'Pre-Site-Visit Quotation': '现场勘察前报价',
    'Schedule Site Visit': '安排现场勘察',
    'This quotation is preliminary and the quoted price is not final. Final pricing is subject to site visit findings, technical assessment, and scope confirmation.': '此报价为初步报价。最终价格须视现场勘察结果、技术评估及工程范围确认而定。'
  };
  // Translate UI text nodes only; keep stored customer, product and legal text intact.
  const originals = new WeakMap();
  let chinese = new URL(window.location.href).searchParams.get('lang')?.startsWith('zh') || false;
  function applyLanguage() {
    observer.disconnect();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('script, style, [data-language-preserve], .nav-lang, .meta-v, .item-name, .item-sub, .pay-v, .pkg-n')) continue;
      const current = node.nodeValue;
      const prior = originals.get(node);
      const source = prior && current.trim() === labels[prior.trim()] ? prior : current;
      if (Object.prototype.hasOwnProperty.call(labels, source.trim())) {
        originals.set(node, source);
        node.nodeValue = chinese ? source.replace(source.trim(), labels[source.trim()]) : source;
      }
    }
    document.documentElement.lang = chinese ? 'zh-Hans' : 'en';
    button.textContent = chinese ? 'EN' : '中文';
    button.setAttribute('aria-label', chinese ? 'Switch to English' : 'Switch to Chinese');
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  const observer = new MutationObserver(applyLanguage);
  button.addEventListener('click', () => {
    chinese = !chinese;
    const url = new URL(window.location.href);
    url.searchParams.set('lang', chinese ? 'zh-Hans' : 'en');
    window.history.replaceState(null, '', url);
    applyLanguage();
  });
  applyLanguage();
})();
