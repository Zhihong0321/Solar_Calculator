/**
 * Customer name change log panel (read-only).
 * Used by My Customers (customer edit modal) and Edit Invoice (customer name field).
 *
 * Expected markup (ids):
 *   customer:  #customerNameLogBox, #customerNameLogToggle, #customerNameLogPanel
 *   invoice:   #invoiceNameLogBox,  #invoiceNameLogToggle,  #invoiceNameLogPanel
 *
 * Usage:
 *   CustomerNameLog.forCustomer(customerInternalId)  // null hides the panel
 *   CustomerNameLog.forInvoice(invoiceBubbleId)      // null hides the panel
 */
(function () {
  'use strict';

  var SHOW_LABEL = 'Show name change log';
  var HIDE_LABEL = 'Hide name change log';

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLines(container, result) {
    if (!container) return;
    if (!result || !result.ok) {
      container.innerHTML = '<p class="text-rose-600">Could not load the name change log.</p>';
      return;
    }
    if (result.lines.length === 0) {
      container.innerHTML = '<p class="text-slate-400">No name changes recorded yet.</p>';
      return;
    }
    container.innerHTML = result.lines
      .map(function (line) {
        return '<p class="break-words border-b border-slate-200 pb-1">' + escapeHtml(line) + '</p>';
      })
      .join('');
  }

  async function load(url) {
    try {
      var res = await fetch(url, { credentials: 'same-origin' });
      var json = await res.json();
      if (json && json.success && json.data && Array.isArray(json.data.lines)) {
        return { ok: true, lines: json.data.lines };
      }
      return { ok: false, lines: [] };
    } catch (err) {
      return { ok: false, lines: [] };
    }
  }

  function wirePanel(ids, loaderOrNull) {
    var box = document.getElementById(ids.box);
    var toggle = document.getElementById(ids.toggle);
    var panel = document.getElementById(ids.panel);
    if (!box || !toggle || !panel) return;

    if (!loaderOrNull) {
      box.classList.add('hidden');
      return;
    }

    box.classList.remove('hidden');
    panel.classList.add('hidden');
    panel.innerHTML = '';
    toggle.textContent = SHOW_LABEL;

    toggle.onclick = async function () {
      if (!panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        toggle.textContent = SHOW_LABEL;
        return;
      }
      toggle.textContent = HIDE_LABEL;
      panel.classList.remove('hidden');
      panel.innerHTML = '<p class="text-slate-400">Loading...</p>';
      renderLines(panel, await loaderOrNull());
    };
  }

  window.CustomerNameLog = {
    forCustomer: function (customerId) {
      wirePanel(
        { box: 'customerNameLogBox', toggle: 'customerNameLogToggle', panel: 'customerNameLogPanel' },
        customerId
          ? function () { return load('/api/customers/' + encodeURIComponent(customerId) + '/name-log'); }
          : null
      );
    },
    forInvoice: function (invoiceBubbleId) {
      wirePanel(
        { box: 'invoiceNameLogBox', toggle: 'invoiceNameLogToggle', panel: 'invoiceNameLogPanel' },
        invoiceBubbleId
          ? function () { return load('/api/v1/invoices/' + encodeURIComponent(invoiceBubbleId) + '/customer-name-log'); }
          : null
      );
    }
  };
})();
