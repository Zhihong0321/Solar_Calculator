/* /lab/chat — thread list.
   Each quotation is its own conversation, the way an agent juggles customers. */
(() => {
  const list = document.getElementById('list');
  const stage = document.getElementById('stage');
  const subtitle = document.getElementById('subtitle');
  const newBtn = document.getElementById('new-btn');

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  /** "14:32" today, "Yesterday", then "12 Aug". */
  function when(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const KIND = {
    quotation: {
      glyph: '☀',
      label: 'Quotation',
      fallbackTitle: 'New quotation',
      hint: 'Tap to open — then type the customer’s TNB bill'
    },
    business: {
      glyph: '⌕',
      label: 'Business search',
      fallbackTitle: 'New business search',
      hint: 'Tap to open — then name a place or business type'
    }
  };

  function row(thread) {
    const kind = KIND[thread.kind] || KIND.quotation;
    const link = el('a', 'thread-row');
    link.href = '/lab/chat/t/' + encodeURIComponent(thread.thread_key);

    // A draft must still read as a conversation, never as a "+" control —
    // an add-glyph here is indistinguishable from the New Quotation button.
    const avatar = el('span', 'thread-avatar', kind.glyph);
    avatar.classList.add(thread.kind === 'business' ? 'business' : 'quotation');
    if (thread.status === 'quoted' || thread.status === 'searched') avatar.classList.add('done');

    const copy = el('span', 'row-copy');
    copy.appendChild(el('strong', null, thread.title || kind.fallbackTitle));
    const sub = el('small', null, thread.preview || kind.hint);
    copy.appendChild(sub);
    const tag = el('span', 'kind-tag', kind.label);
    tag.classList.add(thread.kind === 'business' ? 'business' : 'quotation');
    copy.appendChild(tag);

    const meta = el('span', 'row-meta');
    meta.appendChild(el('time', null, when(thread.updated_at)));
    meta.appendChild(el('span', 'thread-chevron', '›'));

    const remove = el('button', 'row-delete', '✕');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Delete ' + (thread.title || 'quotation'));
    remove.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      del(thread, link);
    });
    meta.appendChild(remove);

    link.appendChild(avatar);
    link.appendChild(copy);
    link.appendChild(meta);
    return link;
  }

  function renderEmpty() {
    const wrap = el('div', 'empty-state');
    wrap.appendChild(el('span', 'empty-icon', '☀'));
    wrap.appendChild(el('strong', null, 'Nothing here yet'));
    wrap.appendChild(el('p', null, 'New Quotation works out solar savings from a TNB bill. Business Search finds companies on Google Maps and researches them.'));
    list.appendChild(wrap);
  }

  async function load() {
    list.innerHTML = '';
    list.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch('/lab/chat/api/threads');
      if (res.status === 401) {
        list.appendChild(el('p', 'list-status', 'Your session expired. Reload to sign in again.'));
        return;
      }
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed');

      const threads = payload.threads || [];
      subtitle.textContent = threads.length
        ? threads.length + (threads.length === 1 ? ' thread' : ' threads')
        : 'Quotations & business searches';

      if (!threads.length) {
        renderEmpty();
        return;
      }
      threads.forEach((thread) => list.appendChild(row(thread)));
    } catch (err) {
      list.appendChild(el('p', 'list-status', 'Could not load your quotations.'));
      console.error(err);
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  async function del(thread, node) {
    if (!confirm('Delete "' + (thread.title || 'this quotation') + '"?')) return;
    try {
      const res = await fetch('/lab/chat/api/threads/' + encodeURIComponent(thread.thread_key), { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      node.remove();
      if (!list.querySelector('.thread-row')) {
        list.innerHTML = '';
        renderEmpty();
        subtitle.textContent = 'Quotations & business searches';
      }
    } catch (err) {
      console.error(err);
      alert('Could not delete that quotation.');
    }
  }

  async function startThread(button, kind, originalLabel) {
    button.disabled = true;
    const wasText = button.textContent;
    button.textContent = 'Starting…';
    try {
      const res = await fetch('/lab/chat/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed');
      location.href = '/lab/chat/t/' + encodeURIComponent(payload.thread.thread_key);
    } catch (err) {
      console.error(err);
      button.disabled = false;
      button.innerHTML = originalLabel || wasText;
      alert('Could not start that. Please try again.');
    }
  }

  newBtn.addEventListener('click', () =>
    startThread(newBtn, 'quotation', '<span aria-hidden="true">+</span> New Quotation'));

  const searchBtn = document.getElementById('new-search-btn');
  searchBtn.addEventListener('click', () =>
    startThread(searchBtn, 'business', '<span aria-hidden="true">⌕</span> Business Search'));

  document.getElementById('theme-btn').addEventListener('click', () => {
    const dark = stage.classList.toggle('dark');
    localStorage.setItem('labChatTheme', dark ? 'dark' : 'light');
    document.getElementById('theme-btn').innerHTML = dark ? '&#9788;' : '&#9790;';
  });

  if (localStorage.getItem('labChatTheme') === 'dark') {
    stage.classList.add('dark');
    document.getElementById('theme-btn').innerHTML = '&#9788;';
  }

  load();
})();
