/* /lab/chat front end.
   The card is rendered from the server's tool result, never from model prose. */
(() => {
  const feed = document.getElementById('feed');
  const input = document.getElementById('input');
  const composer = document.getElementById('composer');
  const sendBtn = document.getElementById('send');
  const stage = document.getElementById('stage');
  const statusLine = document.getElementById('agent-status');

  // The thread is the URL: /lab/chat/t/th_xxxxxxxx
  const THREAD_KEY = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const API = '/lab/chat/api/threads/' + encodeURIComponent(THREAD_KEY);
  let busy = false;
  let latestCardEl = null;

  // ── helpers ──────────────────────────────────────────────────────────────
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const clock = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const money = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const scroll = () => { feed.scrollTop = feed.scrollHeight; };

  // ── bubbles ──────────────────────────────────────────────────────────────
  function addUser(text) {
    const bubble = el('div', 'user-bubble');
    bubble.appendChild(el('p', null, text));
    bubble.appendChild(el('time', null, clock()));
    feed.appendChild(bubble);
    scroll();
  }

  function addAgent(text, { error = false } = {}) {
    const wrap = el('div', 'bubble agent-bubble' + (error ? ' error' : ''));
    wrap.appendChild(el('span', 'mini-agent', '✦'));
    const body = el('div');
    if (text) body.appendChild(el('p', null, text));
    body.appendChild(el('time', null, clock()));
    wrap.appendChild(body);
    feed.appendChild(wrap);
    scroll();
    return body;
  }

  function showTyping(label) {
    const wrap = el('div', 'bubble agent-bubble');
    wrap.id = 'typing';
    wrap.appendChild(el('span', 'mini-agent', '✦'));
    const body = el('div');
    const dots = el('div', 'typing');
    dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
    dots.appendChild(el('span', null, label || 'Thinking…'));
    body.appendChild(dots);
    wrap.appendChild(body);
    feed.appendChild(wrap);
    scroll();
    return wrap;
  }

  function updateTyping(label) {
    const node = document.querySelector('#typing .typing span');
    if (node) node.textContent = label;
  }

  function clearTyping() {
    const node = document.getElementById('typing');
    if (node) node.remove();
  }

  // ── card dispatch ────────────────────────────────────────────────────────
  function buildCard(card) {
    if (!card) return el('div');
    if (card.type === 'leads') return buildLeadsCard(card);
    if (card.type === 'research') return buildResearchCard(card);
    return buildSavingsCard(card);
  }

  /** Shown while an ee-auto report is still being worked on. */
  function pendingBlock(card, kind, label) {
    const wrap = el('div', 'pending-block');
    wrap.appendChild(el('span', 'pending-dot'));
    wrap.appendChild(el('small', null, label));
    const refresh = el('button', 'refresh-btn', 'Refresh');
    refresh.type = 'button';
    refresh.addEventListener('click', () => refreshReport(card, kind, refresh));
    wrap.appendChild(refresh);
    return wrap;
  }

  function reportLink(card, text) {
    if (!card.viewUrl) return null;
    const link = el('a', 'report-link', text);
    link.href = card.viewUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  // ── leads card ───────────────────────────────────────────────────────────
  function buildLeadsCard(card) {
    const root = el('div', 'rich-card leads-card');

    const title = el('div', 'card-title');
    title.appendChild(el('span', null, '⌕'));
    const text = el('div');
    const isPlaceOnly = card.query.keyword === 'businesses' && card.query.place;
    text.appendChild(el('strong', null, isPlaceOnly ? 'All businesses · ' + card.query.place : (card.query.keyword || 'Business search')));
    text.appendChild(el('small', null, isPlaceOnly ? 'Google Maps' : (card.query.place ? 'Google Maps · ' + card.query.place : 'Google Maps')));
    title.appendChild(text);
    if (card.total) title.appendChild(el('b', null, card.total + ' found'));
    root.appendChild(title);

    if (card.state === 'pending') {
      root.appendChild(pendingBlock(card, 'leads', 'Still searching Google Maps…'));
    }

    if (card.error) root.appendChild(el('div', 'pkg-missing', card.error));

    (card.companies || []).forEach((company) => root.appendChild(companyRow(company, card)));

    if (!card.companies || !card.companies.length) {
      if (card.state !== 'pending') root.appendChild(el('div', 'pkg-missing', 'No businesses matched that search.'));
    }

    const link = reportLink(card, 'Open full report ↗');
    if (link) root.appendChild(link);
    return root;
  }

  function companyRow(company, card) {
    const row = el('div', 'company-row');

    const rank = el('span', 'company-rank', company.rank != null ? company.rank : '·');
    row.appendChild(rank);

    const copy = el('div', 'company-copy');
    copy.appendChild(el('strong', null, company.name || 'Unnamed'));

    const bits = [];
    if (company.rating) bits.push('★ ' + company.rating);
    if (company.reviews) bits.push(company.reviews + ' reviews');
    if (company.category) bits.push(company.category);
    copy.appendChild(el('small', null, bits.join(' · ') || '—'));
    if (company.address) copy.appendChild(el('small', 'company-addr', company.address));
    row.appendChild(copy);

    const actions = el('div', 'company-actions');
    if (company.phone) {
      const call = el('a', 'company-chip', '☏');
      call.href = 'tel:' + company.phone;
      call.title = company.phone;
      actions.appendChild(call);
    }
    if (company.website) {
      const site = el('a', 'company-chip', '⌂');
      site.href = company.website;
      site.target = '_blank';
      site.rel = 'noopener noreferrer';
      site.title = company.website;
      actions.appendChild(site);
    }
    const dig = el('button', 'company-chip dig', '⌕+');
    dig.type = 'button';
    dig.title = 'Research this company';
    dig.addEventListener('click', () => send('Research ' + company.name));
    actions.appendChild(dig);
    row.appendChild(actions);

    return row;
  }

  // ── research card ────────────────────────────────────────────────────────
  function buildResearchCard(card) {
    const root = el('div', 'rich-card research-card');

    const title = el('div', 'card-title');
    title.appendChild(el('span', null, '❋'));
    const text = el('div');
    text.appendChild(el('strong', null, card.companyName || card.title || 'Company research'));
    text.appendChild(el('small', null, 'Evidence-backed deep research'));
    title.appendChild(text);
    if (card.status) {
      const pill = el('b', null, card.status);
      if (card.status === 'partial') pill.classList.add('warn');
      title.appendChild(pill);
    }
    root.appendChild(title);

    if (card.state === 'pending') {
      root.appendChild(pendingBlock(card, 'research', 'Research still running…'));
    }

    if (card.error) root.appendChild(el('div', 'pkg-missing', card.error));

    if (card.final) {
      const summary = typeof card.final === 'string' ? card.final : (card.final.summary || card.final.overview || null);
      if (summary) root.appendChild(el('p', 'research-summary', String(summary).slice(0, 600)));
    }

    const link = reportLink(card, 'Read the full report ↗');
    if (link) root.appendChild(link);
    else if (card.state !== 'pending') root.appendChild(el('p', 'card-note', 'No report link was returned.'));

    return root;
  }

  // ── savings card ─────────────────────────────────────────────────────────
  function buildSavingsCard(card) {
    const root = el('div', 'rich-card savings-card');

    const title = el('div', 'card-title');
    title.appendChild(el('span', null, '☀'));
    const titleText = el('div');
    titleText.appendChild(el('strong', null, 'Solar savings estimate'));
    titleText.appendChild(el('small', null, 'Residential · ' + (card.system.config || '')));
    title.appendChild(titleText);
    if (card.confidence) title.appendChild(el('b', null, card.confidence + '% confidence'));
    root.appendChild(title);

    const hero = el('div', 'savings-hero');
    hero.appendChild(el('span', null, 'Saves every month'));
    hero.appendChild(el('strong', null, money(card.bill.savings)));
    hero.appendChild(el('em', null, 'about ' + money(Number(card.bill.savings) * 12) + ' a year'));
    root.appendChild(hero);

    const bills = el('div', 'bill-row');
    const before = el('div');
    before.appendChild(el('small', null, 'Bill now'));
    before.appendChild(el('strong', null, money(card.bill.before)));
    const arrow = el('div', 'arrow', '→');
    const after = el('div', 'after');
    after.appendChild(el('small', null, 'After solar'));
    after.appendChild(el('strong', null, money(card.bill.payable != null ? card.bill.payable : card.bill.after)));
    bills.appendChild(before); bills.appendChild(arrow); bills.appendChild(after);
    root.appendChild(bills);

    const specs = el('div', 'spec-grid');
    const spec = (label, value) => {
      const box = el('div');
      box.appendChild(el('small', null, label));
      box.appendChild(el('strong', null, value));
      specs.appendChild(box);
    };
    spec('System', (card.system.sizeKwp || '—') + ' kWp');
    spec('Panels', (card.system.panels || '—') + ' × ' + (card.system.panelWattage || '—') + 'W');
    spec('Payback', card.payback && card.payback !== 'N/A' ? card.payback + ' years' : '—');
    spec('Battery', card.system.batterySize ? card.system.batterySize + ' kWh' : 'None');
    root.appendChild(specs);

    if (card.package) {
      const pkg = el('div', 'pkg');
      const left = el('div');
      left.appendChild(el('small', null, 'Package'));
      left.appendChild(el('strong', null, card.package.name || '—'));
      pkg.appendChild(left);
      pkg.appendChild(el('b', null, money(card.cost.final != null ? card.cost.final : card.package.price)));
      root.appendChild(pkg);
    } else {
      root.appendChild(el('div', 'pkg-missing', 'No matching package for this panel count. Adjust the panels or check the catalogue.'));
    }

    root.appendChild(buildChips(card));

    const cta = el('button', 'card-cta', 'Create Quotation');
    cta.type = 'button';
    cta.disabled = true;
    root.appendChild(cta);
    root.appendChild(el('p', 'card-note', 'Quotation creation arrives in the next phase.'));

    return root;
  }

  function buildChips(card) {
    const chips = el('div', 'chips');
    const current = card.params || {};

    [0, 16, 32, 48].forEach((size) => {
      const btn = el('button', Number(current.batterySize) === size ? 'on' : null,
        size === 0 ? 'No battery' : size + ' kWh');
      btn.type = 'button';
      btn.addEventListener('click', () => adjust({ batterySize: size }));
      chips.appendChild(btn);
    });

    const maxDiscount = card.package && Number(card.package.maxDiscount);
    if (Number.isFinite(maxDiscount) && maxDiscount > 0) {
      const btn = el('button', Number(current.fixedDiscount) === maxDiscount ? 'on' : null,
        'Max discount ' + money(maxDiscount));
      btn.type = 'button';
      btn.addEventListener('click', () => adjust({
        fixedDiscount: Number(current.fixedDiscount) === maxDiscount ? 0 : maxDiscount
      }));
      chips.appendChild(btn);
    }

    const panels = Number(card.system.panels);
    if (Number.isFinite(panels)) {
      const minus = el('button', null, '− panel');
      minus.type = 'button';
      minus.disabled = panels <= 1;
      minus.addEventListener('click', () => adjust({ overridePanels: panels - 1 }));
      const plus = el('button', null, '+ panel');
      plus.type = 'button';
      plus.addEventListener('click', () => adjust({ overridePanels: panels + 1 }));
      chips.appendChild(minus);
      chips.appendChild(plus);
    }

    return chips;
  }

  function renderCard(card, container) {
    const node = buildCard(card);
    container.insertBefore(node, container.querySelector('time'));
    // Only the savings card is adjustable, so only it is tracked for in-place
    // replacement when a chip fires.
    if (card.type === 'savings' || !card.type) latestCardEl = node;
    scroll();
    return node;
  }

  // ── quick starters ───────────────────────────────────────────────────────
  // Each thread kind shows only what it can actually do here. A starter the
  // thread would refuse is worse than no starter at all.
  const STARTERS = {
    quotation: [
      ['TYPE A BILL AMOUNT', ['450', 'bil customer 1200, ada battery 16kwh']]
    ],
    business: [
      ['FIND BY PLACE', ['semua business kat Bandar Puteri Puchong', 'list all companies in Kulim Hi-Tech Park']],
      ['FIND BY TYPE + PLACE', ['find solar installers in Puchong', 'cari kilang makanan di Shah Alam']],
      ['THEN RESEARCH', ['tap ⌕+ on any company in the result']]
    ]
  };

  function showStarters(kind) {
    const wrap = el('div', 'quick-actions');
    wrap.id = 'starters';
    const groups = STARTERS[kind] || STARTERS.quotation;
    groups.forEach(([label, items]) => {
      wrap.appendChild(el('small', null, label));
      items.forEach((text) => {
        const isHint = text.startsWith('tap ');
        const btn = el('button', isHint ? 'hint' : null, text);
        btn.type = 'button';
        if (!isHint) btn.addEventListener('click', () => { removeStarters(); send(text); });
        wrap.appendChild(btn);
      });
    });
    feed.appendChild(wrap);
    scroll();
  }

  function removeStarters() {
    const node = document.getElementById('starters');
    if (node) node.remove();
  }

  // ── network ──────────────────────────────────────────────────────────────
  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    input.disabled = state;
    document.querySelectorAll('.chips button').forEach((b) => { b.disabled = state; });
    if (!state) input.focus();
  }

  async function send(text) {
    if (busy) return;
    const message = (text || input.value).trim();
    if (!message) return;

    removeStarters();
    addUser(message);
    input.value = '';
    setBusy(true);
    showTyping('Thinking…');

    try {
      const res = await fetch(API + '/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message })
      });

      if (res.status === 401) {
        clearTyping();
        addAgent('Your session expired. Reload the page to sign in again.', { error: true });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop();

        for (const frame of frames) {
          const evtMatch = /^event: (.+)$/m.exec(frame);
          const dataMatch = /^data: (.+)$/m.exec(frame);
          if (!evtMatch || !dataMatch) continue;

          let payload;
          try { payload = JSON.parse(dataMatch[1]); } catch { continue; }

          if (evtMatch[1] === 'status') {
            updateTyping(payload.label);
          } else if (evtMatch[1] === 'reply') {
            clearTyping();
            const body = addAgent(payload.reply, { error: Boolean(payload.error) });
            if (payload.card) renderCard(payload.card, body);
            if (payload.totalMs) {
              statusLine.textContent = (payload.route === 'fast' ? 'Direct' : 'AI') + ' · ' + payload.totalMs + 'ms';
            }
          }
        }
      }
    } catch (err) {
      clearTyping();
      addAgent('Connection problem. Please try again.', { error: true });
      console.error(err);
    } finally {
      clearTyping();
      setBusy(false);
    }
  }

  async function refreshReport(card, kind, button) {
    if (!card.reportId) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Checking…';
    try {
      const res = await fetch(API + '/report/' + kind + '/' + encodeURIComponent(card.reportId));
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'refresh failed');
      replaceCardNode(button.closest('.rich-card'), payload.card);
    } catch (err) {
      console.error(err);
      button.disabled = false;
      button.textContent = original;
    }
  }

  function replaceCardNode(node, card) {
    if (!node || !node.parentNode) return;
    const fresh = buildCard(card);
    node.parentNode.replaceChild(fresh, node);
    if (card.type === 'savings') latestCardEl = fresh;
    scroll();
  }

  async function adjust(patch) {
    if (busy) return;
    setBusy(true);
    showTyping('Recalculating…');
    try {
      const res = await fetch(API + '/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch })
      });
      const payload = await res.json();
      clearTyping();

      if (!res.ok) {
        addAgent(payload.error || 'Could not recalculate.', { error: true });
        return;
      }

      // Replace the card in place — an adjustment is not a new conversation turn.
      if (latestCardEl && latestCardEl.parentNode) {
        const fresh = buildCard(payload.card);
        latestCardEl.parentNode.replaceChild(fresh, latestCardEl);
        latestCardEl = fresh;
        scroll();
      } else {
        const body = addAgent('Updated.');
        renderCard(payload.card, body);
      }
      statusLine.textContent = 'Direct · ' + payload.totalMs + 'ms';
    } catch (err) {
      clearTyping();
      addAgent('Could not recalculate.', { error: true });
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  // ── wiring ───────────────────────────────────────────────────────────────
  composer.addEventListener('submit', (event) => { event.preventDefault(); send(); });

  document.getElementById('theme-btn').addEventListener('click', () => {
    const dark = stage.classList.toggle('dark');
    localStorage.setItem('labChatTheme', dark ? 'dark' : 'light');
    document.getElementById('theme-btn').innerHTML = dark ? '&#9788;' : '&#9790;';
  });

  if (localStorage.getItem('labChatTheme') === 'dark') {
    stage.classList.add('dark');
    document.getElementById('theme-btn').innerHTML = '&#9788;';
  }

  /** Replays the stored thread, or greets when it is brand new. */
  async function openThread() {
    feed.appendChild(el('div', 'day-pill', 'Today'));

    let payload = null;
    try {
      const res = await fetch(API);
      if (res.status === 404) {
        addAgent('That thread no longer exists.', { error: true });
        return;
      }
      if (res.status === 401) {
        addAgent('Your session expired. Reload the page to sign in again.', { error: true });
        return;
      }
      payload = await res.json();
    } catch (err) {
      console.error(err);
      addAgent('Could not load this thread.', { error: true });
      return;
    }

    const kind = (payload.thread && payload.thread.kind) === 'business' ? 'business' : 'quotation';
    document.body.dataset.kind = kind;

    if (payload.thread && payload.thread.title) {
      document.getElementById('thread-title').textContent = payload.thread.title;
    }
    if (kind === 'business') {
      document.querySelector('.agent-avatar').firstChild.nodeValue = '⌕';
      input.placeholder = 'Name a place, or a business type + place…';
    }

    const messages = payload.messages || [];
    if (!messages.length) {
      let name = null;
      try {
        const res = await fetch('/lab/chat/api/me');
        if (res.ok) name = (await res.json()).name;
      } catch { /* greeting is cosmetic */ }
      const hello = name ? 'Hi ' + String(name).split(' ')[0] + '.' : 'Hi.';
      addAgent(kind === 'business'
        ? hello + ' Tell me a place and I’ll list every business there — or add a business type to narrow it. Then tap ⌕+ on any result to research that company.'
        : hello + ' What’s the customer’s average monthly TNB bill?');
      showStarters(kind);
      return;
    }

    messages.forEach((message) => {
      if (message.role === 'user') {
        addUser(message.content);
      } else {
        const body = addAgent(message.content);
        if (message.card) renderCard(message.card, body);
      }
    });
    scroll();
  }

  // The ?sample=1 preview is gone: with threads backed by Postgres there is a
  // real card to look at, and invented figures on prod are a hazard.
  openThread();
  input.focus();
})();
