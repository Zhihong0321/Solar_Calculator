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

  // ── savings card ─────────────────────────────────────────────────────────
  function buildCard(card) {
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
    latestCardEl = node;
    scroll();
    return node;
  }

  // ── quick starters ───────────────────────────────────────────────────────
  function showStarters() {
    const wrap = el('div', 'quick-actions');
    wrap.id = 'starters';
    wrap.appendChild(el('small', null, 'QUICK START'));
    ['450', 'RM 780 sebulan', 'bil customer 1200, ada battery 16kwh'].forEach((text) => {
      const btn = el('button', null, text);
      btn.type = 'button';
      btn.addEventListener('click', () => { removeStarters(); send(text); });
      wrap.appendChild(btn);
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
        addAgent('That quotation no longer exists.', { error: true });
        return;
      }
      if (res.status === 401) {
        addAgent('Your session expired. Reload the page to sign in again.', { error: true });
        return;
      }
      payload = await res.json();
    } catch (err) {
      console.error(err);
      addAgent('Could not load this quotation.', { error: true });
      return;
    }

    if (payload.thread && payload.thread.title) {
      document.getElementById('thread-title').textContent = payload.thread.title;
    }

    const messages = payload.messages || [];
    if (!messages.length) {
      let name = null;
      try {
        const res = await fetch('/lab/chat/api/me');
        if (res.ok) name = (await res.json()).name;
      } catch { /* greeting is cosmetic */ }
      const hello = name ? 'Hi ' + String(name).split(' ')[0] + '.' : 'Hi.';
      addAgent(hello + " What's the customer's average monthly TNB bill?");
      showStarters();
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
