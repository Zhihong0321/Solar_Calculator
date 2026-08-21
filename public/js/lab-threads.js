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

  function row(thread) {
    const link = el('a', 'thread-row');
    link.href = '/lab/chat/t/' + encodeURIComponent(thread.thread_key);

    // A draft must still read as a conversation, never as a "+" control —
    // an add-glyph here is indistinguishable from the New Quotation button.
    const avatar = el('span', 'thread-avatar', thread.status === 'quoted' ? '☀' : 'Q');
    if (thread.status === 'quoted') avatar.classList.add('quoted');

    const copy = el('span', 'row-copy');
    copy.appendChild(el('strong', null, thread.title || 'New quotation'));
    copy.appendChild(el('small', null, thread.preview || 'Tap to open — then type the customer’s TNB bill'));

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
    wrap.appendChild(el('strong', null, 'No quotations yet'));
    wrap.appendChild(el('p', null, 'Start one and tell me the customer’s monthly TNB bill. I’ll work out the savings.'));
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
        ? threads.length + (threads.length === 1 ? ' quotation' : ' quotations')
        : 'Your quotations';

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
        subtitle.textContent = 'Your quotations';
      }
    } catch (err) {
      console.error(err);
      alert('Could not delete that quotation.');
    }
  }

  newBtn.addEventListener('click', async () => {
    newBtn.disabled = true;
    newBtn.textContent = 'Starting…';
    try {
      const res = await fetch('/lab/chat/api/threads', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed');
      location.href = '/lab/chat/t/' + encodeURIComponent(payload.thread.thread_key);
    } catch (err) {
      console.error(err);
      newBtn.disabled = false;
      newBtn.innerHTML = '<span aria-hidden="true">+</span> New Quotation';
      alert('Could not start a new quotation.');
    }
  });

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
