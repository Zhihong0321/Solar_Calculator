(function () {
  'use strict';

  const config = window.EternalgyInvoiceTracker || {};
  const invoiceIdentifier = String(config.invoiceIdentifier || '').trim();
  const pageType = String(config.pageType || 'invoice').trim() || 'invoice';
  const endpoint = String(config.endpoint || '/api/invoice-view-activity').trim();
  const storageKey = 'eternalgy_viewer_device_id';
  const cookieName = 'eg_viewer_device';
  const sessionStartedAt = Date.now();
  let deviceHashPromise = null;
  let sessionEnded = false;

  if (!invoiceIdentifier || !endpoint) return;

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }

  function getOrCreateDeviceId() {
    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
      const next = randomId();
      window.localStorage.setItem(storageKey, next);
      return next;
    } catch (err) {
      return randomId();
    }
  }

  async function sha256(value) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      const encoded = new TextEncoder().encode(value);
      const digest = await window.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  function getDeviceHash() {
    if (!deviceHashPromise) {
      deviceHashPromise = sha256(getOrCreateDeviceId()).then((hash) => {
        document.cookie = `${cookieName}=${hash}; max-age=31536000; path=/; SameSite=Lax`;
        return hash;
      });
    }
    return deviceHashPromise;
  }

  function eventName(kind) {
    if (pageType === 'tiger_neo_3_proposal' || pageType === 'proposal') {
      return `proposal_${kind}`;
    }
    return `invoice_${kind}`;
  }

  function metadata(extra) {
    return Object.assign({
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: window.screen ? `${window.screen.width}x${window.screen.height}` : '',
      title: document.title || ''
    }, extra || {});
  }

  function post(payload, preferBeacon) {
    return getDeviceHash().then((deviceHash) => {
      const body = JSON.stringify(Object.assign({
        invoice_identifier: invoiceIdentifier,
        page_type: pageType,
        device_hash: deviceHash
      }, payload));

      if (preferBeacon && navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, blob)) return true;
      }

      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body
      }).catch(() => null);
    });
  }

  function readableClickName(element) {
    if (!element) return 'unknown_click';
    return String(
      element.getAttribute('data-track-button')
      || element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.innerText
      || element.textContent
      || element.href
      || 'unknown_click'
    ).replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function trackClick(event) {
    const target = event.target && event.target.closest
      ? event.target.closest('button, a, [role="button"], [data-track-button]')
      : null;
    if (!target) return;

    post({
      event_type: eventName('button_clicked'),
      button_name: readableClickName(target),
      metadata: metadata({
        tag: target.tagName || '',
        href: target.href || '',
        id: target.id || '',
        class_name: target.className || ''
      })
    }, true);
  }

  function endSession() {
    if (sessionEnded) return;
    sessionEnded = true;
    const durationSeconds = Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000));
    post({
      event_type: eventName('session_ended'),
      duration_seconds: durationSeconds,
      metadata: metadata()
    }, true);
  }

  document.addEventListener('click', trackClick, true);
  window.addEventListener('pagehide', endSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') endSession();
  });

  post({
    event_type: eventName('viewed'),
    metadata: metadata()
  }, false);
})();
