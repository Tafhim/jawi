/* ============================================================
   Jawi Admin Panel — SPA (vanilla JS, hash routing)
   ============================================================ */

'use strict';

// ---------- API client ----------

const API = {
  async request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON response
    }
    if (!res.ok) {
      const msg = (data && data.error) || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get: (path) => API.request('GET', path),
  post: (path, body) => API.request('POST', path, body || {}),
  put: (path, body) => API.request('PUT', path, body || {}),
  del: (path, body) => API.request('DELETE', path, body),
};

// ---------- State ----------

const state = {
  authed: false,
  siteTitle: 'Jawi',
  version: '',
  tags: [], // all tags for autocomplete
};

// ---------- DOM helpers ----------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtTime(timeStr) {
  if (!timeStr) return '—';
  // "YYYY-MM-DD HH:MM:SS" UTC -> local display
  const d = new Date(timeStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return timeStr;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function timeToInputValue(timeStr) {
  if (!timeStr) return '';
  const d = new Date(timeStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  // datetime-local wants local time
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputValueToUTC(inputValue) {
  if (!inputValue) return null;
  const d = new Date(inputValue);
  if (isNaN(d.getTime())) return null;
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function nowUTC() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ---------- Toasts ----------

function toast(message, kind = 'info', timeout = 3500) {
  const node = el('div', { class: `toast toast-${kind}` }, message);
  $('#toasts').append(node);
  setTimeout(() => {
    node.style.transition = 'opacity 0.25s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 300);
  }, timeout);
}

// ---------- Modal ----------

function confirmModal({ title, message, detail, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const overlay = el('div', { class: 'modal-overlay' });
    const modal = el('div', { class: 'modal' },
      el('div', { class: 'modal-title' }, title),
      el('div', { class: 'modal-body' }, message, detail ? el('div', { class: 'modal-detail' }, detail) : null),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn btn-ghost', onclick: () => { overlay.remove(); resolve(false); } }, 'Cancel'),
        el('button', {
          class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
          onclick: () => { overlay.remove(); resolve(true); },
        }, confirmLabel),
      ),
    );
    overlay.append(modal);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
    $('#modal-root').append(overlay);
    modal.querySelector('.btn-primary, .btn-danger')?.focus();
  });
}

// ---------- Router ----------

const routes = [];

function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  }) + '$');
  routes.push({ regex, keys, handler });
}

function currentHash() {
  return location.hash.replace(/^#/, '') || '/';
}

async function navigate() {
  const rawHash = currentHash();
  // Split path and query string: "/items?type=post" -> path "/items", query "type=post"
  const qIdx = rawHash.indexOf('?');
  const hashPath = qIdx >= 0 ? rawHash.slice(0, qIdx) : rawHash;
  const hashQuery = qIdx >= 0 ? rawHash.slice(qIdx + 1) : '';
  const app = $('#app');

  if (!state.authed && hashPath !== '/login') {
    location.hash = '/login';
    return;
  }

  let matched = null;
  let params = {};
  for (const r of routes) {
    const m = hashPath.match(r.regex);
    if (m) {
      matched = r;
      params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      break;
    }
  }

  // Merge query-string params (e.g. ?type=post&draft=true&search=foo)
  if (hashQuery) {
    const qp = new URLSearchParams(hashQuery);
    for (const [k, v] of qp.entries()) params[k] = v;
  }

  app.innerHTML = '';
  if (!matched) {
    app.append(el('div', { class: 'main' },
      el('div', { class: 'empty-state' },
        el('span', { class: 'empty-icon' }, '∅'),
        'Not found: ', rawHash,
      ),
    ));
    return;
  }

  // Top bar (all views except login)
  if (hashPath !== '/login') {
    app.append(renderTopbar(hashPath));
  }

  try {
    await matched.handler(app, params);
  } catch (err) {
    app.append(el('div', { class: 'main' },
      el('div', { class: 'empty-state' },
        el('span', { class: 'empty-icon' }, '⚠'),
        `Failed to load: ${esc(err.message)}`,
      ),
    ));
  }
}

function renderTopbar(hash) {
  const link = (href, label) =>
    el('a', { href: `#${href}`, class: hash === href || (href !== '/' && hash.startsWith(href)) ? 'active' : '' }, label);

  const nav = el('nav', { class: 'topbar-nav' },
    link('/', 'Dashboard'),
    link('/items', 'Content'),
    link('/tags', 'Tags'),
    link('/images', 'Images'),
    link('/settings', 'Settings'),
    link('/trash', 'Trash'),
    link('/audit', 'Audit'),
  );

  return el('header', { class: 'topbar' },
    el('div', { class: 'topbar-logo' },
      el('span', { class: 'prompt' }, '>_'),
      'JAWI ADMIN',
      el('span', { class: 'caret' }),
    ),
    nav,
    el('div', { class: 'topbar-right' },
      el('span', { class: 'topbar-site', title: state.siteTitle }, state.siteTitle),
      el('button', {
        class: 'btn btn-sm btn-ghost',
        title: 'Log out',
        onclick: async () => {
          try { await API.post('/api/logout'); } catch { /* ignore */ }
          state.authed = false;
          location.hash = '/login';
        },
      }, 'logout'),
    ),
  );
}

// ---------- Tag chip input ----------

function createTagInput({ value = [], onChange, suggestions = [] } = {}) {
  const tags = [...value];
  const wrap = el('div', { class: 'tag-chips', style: 'position:relative' });
  const input = el('input', { type: 'text', placeholder: 'add tag… (Enter to add)' });
  let suggestionBox = null;
  let selectedSuggestion = -1;

  function render() {
    wrap.innerHTML = '';
    for (const t of tags) {
      wrap.append(el('span', { class: 'tag-chip' },
        esc(t),
        el('span', {
          class: 'tag-remove',
          title: 'Remove tag',
          onclick: () => {
            const i = tags.indexOf(t);
            if (i >= 0) tags.splice(i, 1);
            render();
            onChange(tags);
          },
        }, '×'),
      ));
    }
    wrap.append(input);
  }

  function addTag(raw) {
    const t = String(raw).trim().replace(/^#+/, '').toLowerCase();
    if (!t) return;
    if (!tags.includes(t)) {
      tags.push(t);
      render();
      onChange(tags);
    }
    input.value = '';
    hideSuggestions();
  }

  function showSuggestions() {
    hideSuggestions();
    const q = input.value.trim().toLowerCase();
    const matches = suggestions
      .filter(s => !tags.includes(s) && (!q || s.includes(q)))
      .slice(0, 8);
    if (matches.length === 0) return;
    selectedSuggestion = -1;
    suggestionBox = el('div', { class: 'tag-suggestions' });
    matches.forEach((s, i) => {
      suggestionBox.append(el('div', {
        class: 'suggestion',
        onclick: () => addTag(s),
        onmouseenter: () => { selectedSuggestion = i; paintSuggestions(); },
      }, esc(s)));
    });
    wrap.append(suggestionBox);
  }

  function paintSuggestions() {
    if (!suggestionBox) return;
    $$('.suggestion', suggestionBox).forEach((n, i) => n.classList.toggle('selected', i === selectedSuggestion));
  }

  function hideSuggestions() {
    if (suggestionBox) { suggestionBox.remove(); suggestionBox = null; }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (selectedSuggestion >= 0 && suggestionBox) {
        addTag($$('.suggestion', suggestionBox)[selectedSuggestion].textContent);
      } else {
        addTag(input.value);
      }
    } else if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
      tags.pop();
      render();
      onChange(tags);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggestion = Math.min(selectedSuggestion + 1, $$('.suggestion', suggestionBox || wrap).length - 1);
      paintSuggestions();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestion = Math.max(selectedSuggestion - 1, 0);
      paintSuggestions();
    }
  });
  input.addEventListener('input', () => showSuggestions());
  input.addEventListener('focus', () => showSuggestions());
  input.addEventListener('blur', () => setTimeout(hideSuggestions, 150));

  render();

  return {
    node: wrap,
    get value() { return [...tags]; },
    set value(v) { tags.length = 0; tags.push(...(v || [])); render(); },
    refreshSuggestions(list) { suggestions = list; },
  };
}

// ---------- Color picker (thoughts) ----------

const NAMED_COLORS = {
  black: 'hsl(0, 0%, 0%)', white: 'hsl(0, 0%, 100%)',
  red: 'hsl(0, 45%, 18%)', orange: 'hsl(25, 50%, 18%)', yellow: 'hsl(45, 45%, 18%)',
  green: 'hsl(120, 40%, 18%)', teal: 'hsl(170, 40%, 18%)', blue: 'hsl(210, 45%, 18%)',
  purple: 'hsl(270, 40%, 18%)', pink: 'hsl(320, 40%, 18%)', gray: 'hsl(0, 0%, 18%)',
};

function cssForColor(value) {
  if (!value) return '#1a1a1a';
  const v = String(value).trim().toLowerCase();
  if (v.startsWith('solid-')) {
    const c = v.slice(6);
    return c.startsWith('#') ? c : (NAMED_COLORS[c] || c);
  }
  if (v.startsWith('gradient-')) {
    const stops = (v.slice(9).match(/#[0-9a-fA-F]{3,8}|\b[a-zA-Z]+\b/g) || [])
      .map(t => (t.startsWith('#') ? t : (NAMED_COLORS[t] || t)));
    if (stops.length >= 2) return `linear-gradient(135deg, ${stops.join(', ')})`;
    return '#1a1a1a';
  }
  const legacy = {
    red: 'hsl(0, 45%, 18%), hsl(30, 40%, 14%)',
    orange: 'hsl(25, 50%, 18%), hsl(55, 45%, 14%)',
    yellow: 'hsl(45, 45%, 18%), hsl(75, 40%, 14%)',
    green: 'hsl(120, 40%, 18%), hsl(160, 35%, 14%)',
    teal: 'hsl(170, 40%, 18%), hsl(210, 35%, 14%)',
    blue: 'hsl(210, 45%, 18%), hsl(250, 40%, 14%)',
    purple: 'hsl(270, 40%, 18%), hsl(310, 35%, 14%)',
    pink: 'hsl(320, 40%, 18%), hsl(350, 35%, 14%)',
  };
  if (legacy[v]) return `linear-gradient(135deg, ${legacy[v]})`;
  return '#1a1a1a';
}

function createColorPicker({ value = '', onChange } = {}) {
  let current = value || '';
  const wrap = el('div', { class: 'color-picker' });

  const preview = el('div', { class: 'color-preview' }, 'preview');
  const input = el('input', { class: 'input', type: 'text', placeholder: 'solid-blue, gradient-red-purple, gradient-#000-#fff', value: current });
  const hexInput = el('input', { class: 'input', type: 'text', placeholder: 'custom hex, e.g. #1a2b3c' });

  function paint() {
    preview.style.background = cssForColor(current);
    input.value = current;
  }

  function set(v) {
    current = v || '';
    paint();
    onChange(current);
  }

  // Default swatch (no color)
  const defaultSwatch = el('div', {
    class: 'color-swatch' + (current === '' ? ' selected' : ''),
    style: 'background:#1a1a1a',
    title: 'Default (dark)',
    onclick: () => { selectSwatch(defaultSwatch); set(''); },
  });

  const swatchRow = el('div', { class: 'color-swatch-row' });
  swatchRow.append(defaultSwatch);
  for (const [name, css] of Object.entries(NAMED_COLORS)) {
    const sw = el('div', {
      class: 'color-swatch' + (current === `solid-${name}` ? ' selected' : ''),
      style: `background:${css}`,
      title: `solid-${name}`,
      onclick: () => { selectSwatch(sw); set(`solid-${name}`); },
    });
    swatchRow.append(sw);
  }

  // Gradient presets
  const gradRow = el('div', { class: 'color-swatch-row' });
  const gradPresets = [
    ['gradient-red-purple', 'red, purple'],
    ['gradient-blue-teal', 'blue, teal'],
    ['gradient-orange-yellow', 'orange, yellow'],
    ['gradient-pink-purple', 'pink, purple'],
    ['gradient-green-teal', 'green, teal'],
    ['gradient-#000-#333-#666', '#000, #333, #666'],
  ];
  for (const [val, label] of gradPresets) {
    const sw = el('div', {
      class: 'color-swatch' + (current === val ? ' selected' : ''),
      style: `background:${cssForColor(val)}`,
      title: val,
      onclick: () => { selectSwatch(sw); set(val); },
    });
    gradRow.append(sw);
  }

  function selectSwatch(sw) {
    $$('.color-swatch', wrap).forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
  }

  input.addEventListener('change', () => set(input.value.trim()));
  hexInput.addEventListener('change', () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) set(`solid-${v.toLowerCase()}`);
    else toast('Invalid hex color', 'error');
  });

  wrap.append(
    preview,
    swatchRow,
    gradRow,
    el('div', { class: 'input-row' }, input, hexInput),
  );
  paint();

  return { node: wrap, get value() { return current; }, set value(v) { set(v || ''); } };
}

// ---------- Image picker (posts) ----------

async function createImagePicker({ value = [], onChange } = {}) {
  let selected = [...value];
  const wrap = el('div', {});
  const grid = el('div', { class: 'image-grid' });
  const addRow = el('div', { class: 'flex mt-1' });

  async function render() {
    grid.innerHTML = '';
    let images = [];
    try {
      images = (await API.get('/api/images')).images;
    } catch { /* ignore */ }

    if (images.length === 0) {
      grid.append(el('div', { class: 'muted small' }, 'No images uploaded yet. Upload from the Images page.'));
    }

    for (const img of images) {
      const isSelected = selected.includes(img.url);
      const cell = el('div', { class: 'image-cell' + (isSelected ? ' selected' : '') },
        el('img', { class: 'image-thumb', src: `/api/images/preview?path=${encodeURIComponent(img.path)}`, alt: img.path, loading: 'lazy' }),
        el('div', { class: 'image-meta' },
          el('div', { class: 'image-name', title: img.url }, img.path),
          el('div', { class: 'flex-between' },
            el('span', { class: 'muted small' }, fmtBytes(img.size)),
            el('button', {
              class: 'btn btn-sm ' + (isSelected ? 'btn-danger' : 'btn-ghost'),
              onclick: () => {
                if (isSelected) {
                  selected = selected.filter(u => u !== img.url);
                } else {
                  selected.push(img.url);
                }
                render();
                onChange(selected);
              },
            }, isSelected ? 'Remove' : 'Add'),
          ),
        ),
      );
      grid.append(cell);
    }

    addRow.innerHTML = '';
    const urlInput = el('input', { class: 'input', type: 'text', placeholder: '…or paste an image URL, e.g. /images/2026-05/photo.jpg' });
    addRow.append(
      urlInput,
      el('button', {
        class: 'btn btn-sm',
        onclick: () => {
          const u = urlInput.value.trim();
          if (!u) return;
          if (!selected.includes(u)) {
            selected.push(u);
            render();
            onChange(selected);
          }
        },
      }, 'Add URL'),
    );
  }

  wrap.append(grid, addRow);
  await render();
  return { node: wrap, get value() { return [...selected]; }, set value(v) { selected = [...(v || [])]; render(); } };
}

// ============================================================
// Views
// ============================================================

// ---------- Login ----------

route('/login', async (app) => {
  const tokenInput = el('input', { class: 'input', type: 'password', placeholder: 'admin token', autocomplete: 'off' });
  const errorBox = el('div', { class: 'field-error' });

  async function submit() {
    errorBox.textContent = '';
    try {
      await API.post('/api/login', { token: tokenInput.value.trim() });
      state.authed = true;
      const me = await API.get('/api/me');
      state.siteTitle = me.siteTitle;
      state.version = me.version;
      location.hash = '/';
    } catch (err) {
      errorBox.textContent = err.message;
    }
  }

  tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  app.append(el('div', { class: 'login-wrap' },
    el('div', { class: 'login-card' },
      el('div', { class: 'login-logo' }, '>_ JAWI ADMIN'),
      el('div', { class: 'login-sub' }, 'Enter the admin token printed by `jawi admin` (or set via JAWI_ADMIN_TOKEN).'),
      el('div', { class: 'field' },
        el('label', { class: 'field-label' }, 'Token'),
        tokenInput,
        errorBox,
      ),
      el('button', { class: 'btn btn-primary', style: 'width:100%', onclick: submit }, 'Sign in'),
    ),
  ));
  tokenInput.focus();
});

// ---------- Dashboard ----------

route('/', async (app) => {
  const main = el('div', { class: 'main' });
  app.append(main);

  const stats = await API.get('/api/stats');

  const statCard = (label, value, href) =>
    el('div', { class: 'stat-card', onclick: () => { location.hash = href; } },
      el('div', { class: 'stat-value' }, String(value)),
      el('div', { class: 'stat-label' }, label),
    );

  const maxTag = Math.max(1, ...stats.topTags.map(t => t.count));

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' }, el('span', { class: 'prompt' }, '>'), 'Dashboard'),
        el('div', { class: 'page-subtitle' }, `${esc(state.siteTitle)} · @jawi/core v${esc(state.version)}`),
      ),
      el('div', { class: 'flex' },
        el('a', { class: 'btn btn-primary', href: '#/items/new/post' }, '+ New Post'),
        el('a', { class: 'btn', href: '#/items/new/thought' }, '+ Thought'),
        el('a', { class: 'btn', href: '#/items/new/code' }, '+ Code'),
      ),
    ),
    el('div', { class: 'stat-grid' },
      statCard('Posts', stats.counts.post, '#/items?type=post'),
      statCard('Thoughts', stats.counts.thought, '#/items?type=thought'),
      statCard('Codes', stats.counts.code, '#/items?type=code'),
      statCard('Drafts', stats.counts.drafts, '#/items?draft=true'),
      statCard('Tags', stats.counts.tags, '#/tags'),
      statCard('Trash', stats.counts.trash, '#/trash'),
    ),
    el('div', { class: 'editor-layout' },
      el('div', {},
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, 'Top tags'),
          stats.topTags.length === 0
            ? el('div', { class: 'muted small' }, 'No tags yet.')
            : stats.topTags.map(t =>
              el('div', { class: 'tag-bar-row' },
                el('span', { class: 'tag-bar-name', title: t.tag }, t.tag),
                el('div', { class: 'tag-bar-track' },
                  el('div', { class: 'tag-bar-fill', style: `width:${Math.round((t.count / maxTag) * 100)}%` }),
                ),
                el('span', { class: 'tag-bar-count' }, String(t.count)),
              ),
            ),
        ),
      ),
      el('div', {},
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, 'Recent items'),
          stats.recent.length === 0
            ? el('div', { class: 'muted small' }, 'Nothing here yet — create your first post.')
            : el('div', { class: 'table-wrap' },
              el('table', { class: 'data' },
                el('thead', {}, el('tr', {},
                  el('th', {}, 'Type'), el('th', {}, 'Title'), el('th', {}, 'Time'),
                )),
                el('tbody', {}, stats.recent.map(item =>
                  el('tr', { class: 'clickable', onclick: () => { location.hash = `#/items/${item.type}/${item.slug}`; } },
                    el('td', {}, el('span', { class: `badge badge-${item.type}` }, item.type)),
                    el('td', { class: 'cell-title' }, item.title, item.draft ? el('span', { class: 'badge badge-draft', style: 'margin-left:0.4rem' }, 'draft') : null),
                    el('td', { class: 'cell-dim' }, fmtTime(item.time)),
                  ),
                )),
              ),
            ),
      ),
    ),
  )
  );
});

// ---------- Items list ----------

route('/items', async (app, params) => {
  const main = el('div', { class: 'main' });
  app.append(main);

  const initialType = ['post', 'thought', 'code'].includes(params.type) ? params.type : '';
  const initialDraft = params.draft === 'true' ? 'true' : params.draft === 'false' ? 'false' : '';
  const initialSearch = params.search || '';

  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'Search title, content, tags…', value: initialSearch });
  const typeSelect = el('select', { class: 'select' },
    el('option', { value: '' }, 'All types'),
    el('option', { value: 'post' }, 'Posts'),
    el('option', { value: 'thought' }, 'Thoughts'),
    el('option', { value: 'code' }, 'Codes'),
  );
  typeSelect.value = initialType;
  const draftSelect = el('select', { class: 'select' },
    el('option', { value: '' }, 'Published + drafts'),
    el('option', { value: 'false' }, 'Published only'),
    el('option', { value: 'true' }, 'Drafts only'),
  );
  draftSelect.value = initialDraft;
  const sortSelect = el('select', { class: 'select' },
    el('option', { value: 'time-desc' }, 'Newest first'),
    el('option', { value: 'time-asc' }, 'Oldest first'),
    el('option', { value: 'title' }, 'Title A–Z'),
  );

  const listCard = el('div', { class: 'card' });

  let searchTimer = null;
  async function load() {
    const q = new URLSearchParams();
    if (typeSelect.value) q.set('type', typeSelect.value);
    if (draftSelect.value) q.set('draft', draftSelect.value);
    if (sortSelect.value !== 'time-desc') q.set('sort', sortSelect.value);
    const s = searchInput.value.trim();
    if (s) q.set('search', s);

    listCard.innerHTML = '<div class="muted small">Loading…</div>';
    try {
      const { items, total } = await API.get(`/api/items?${q.toString()}`);
      listCard.innerHTML = '';

      if (items.length === 0) {
        listCard.append(el('div', { class: 'empty-state' },
          el('span', { class: 'empty-icon' }, '∅'),
          'No items match.',
        ));
        return;
      }

      listCard.append(
        el('div', { class: 'flex-between mb-1' },
          el('span', { class: 'muted small' }, `${total} item${total === 1 ? '' : 's'}`),
          el('div', { class: 'flex' },
            el('a', { class: 'btn btn-sm btn-primary', href: '#/items/new/post' }, '+ Post'),
            el('a', { class: 'btn btn-sm', href: '#/items/new/thought' }, '+ Thought'),
            el('a', { class: 'btn btn-sm', href: '#/items/new/code' }, '+ Code'),
          ),
        ),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'data' },
            el('thead', {}, el('tr', {},
              el('th', {}, 'Type'), el('th', {}, 'Title'), el('th', {}, 'Tags'),
              el('th', {}, 'Time'), el('th', {}, ''),
            )),
            el('tbody', {}, items.map(item => {
              const row = el('tr', { class: 'clickable', onclick: () => { location.hash = `#/items/${item.type}/${item.slug}`; } },
                el('td', {},
                  el('span', { class: `badge badge-${item.type}` }, item.type),
                  item.mdx ? el('span', { class: 'badge badge-mdx', style: 'margin-left:0.3rem' }, 'mdx') : null,
                ),
                el('td', { class: 'cell-title' },
                  item.title || item.slug,
                  item.draft ? el('span', { class: 'badge badge-draft', style: 'margin-left:0.4rem' }, 'draft') : null,
                ),
                el('td', { class: 'cell-dim' }, (item.tags || []).slice(0, 4).map(t => `#${t}`).join(' ') || '—'),
                el('td', { class: 'cell-dim' }, fmtTime(item.time)),
                el('td', { class: 'cell-actions' },
                  el('button', {
                    class: 'btn btn-sm btn-ghost',
                    title: item.draft ? 'Publish' : 'Unpublish (make draft)',
                    onclick: async (e) => {
                      e.stopPropagation();
                      try {
                        await API.post(`/api/items/${item.type}/${item.slug}/toggle-draft`);
                        toast(item.draft ? 'Published' : 'Moved to drafts', 'success');
                        load();
                      } catch (err) { toast(err.message, 'error'); }
                    },
                  }, item.draft ? 'publish' : 'draft'),
                  el('button', {
                    class: 'btn btn-sm btn-ghost btn-danger',
                    title: 'Delete (moves to trash)',
                    onclick: async (e) => {
                      e.stopPropagation();
                      const ok = await confirmModal({
                        title: 'Delete item?',
                        message: `“${item.title || item.slug}” will be moved to the trash. You can restore it later.`,
                        confirmLabel: 'Delete',
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        await API.del(`/api/items/${item.type}/${item.slug}`);
                        toast('Moved to trash', 'success');
                        load();
                      } catch (err) { toast(err.message, 'error'); }
                    },
                  }, 'delete'),
                ),
              );
              return row;
            })),
          ),
        ),
      );
    } catch (err) {
      listCard.innerHTML = '';
      listCard.append(el('div', { class: 'empty-state' }, `Failed to load: ${esc(err.message)}`));
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  });
  typeSelect.addEventListener('change', load);
  draftSelect.addEventListener('change', load);
  sortSelect.addEventListener('change', load);

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' }, el('span', { class: 'prompt' }, '>'), 'Content'),
        el('div', { class: 'page-subtitle' }, 'All posts, thoughts, and code snippets — including drafts.'),
      ),
    ),
    el('div', { class: 'filter-bar' },
      searchInput, typeSelect, draftSelect, sortSelect,
    ),
    listCard,
  );

  await load();
});

// ---------- Item editor ----------

route('/items/new/:type', async (app, params) => {
  if (!['post', 'thought', 'code'].includes(params.type)) {
    location.hash = '/items';
    return;
  }
  await renderEditor(app, { type: params.type, slug: null });
});

route('/items/:type/:slug', async (app, params) => {
  if (!['post', 'thought', 'code'].includes(params.type)) {
    location.hash = '/items';
    return;
  }
  await renderEditor(app, { type: params.type, slug: params.slug });
});

async function renderEditor(app, { type, slug }) {
  const isNew = !slug;
  const main = el('div', { class: 'main' });
  app.append(main);

  let item = null;
  if (!isNew) {
    try {
      ({ item } = await API.get(`/api/items/${type}/${slug}`));
    } catch (err) {
      main.append(el('div', { class: 'empty-state' }, `Failed to load item: ${esc(err.message)}`));
      return;
    }
    if (!item) {
      main.append(el('div', { class: 'empty-state' }, 'Item not found.'));
      return;
    }
  } else {
    item = {
      type,
      title: '',
      time: nowUTC(),
      tags: [],
      draft: false,
      body: '',
      images: [],
      color: '',
      language: 'javascript',
      mdx: false,
    };
  }

  // Load tags for autocomplete
  let allTags = state.tags;
  if (allTags.length === 0) {
    try {
      allTags = (await API.get('/api/tags')).tags;
      state.tags = allTags;
    } catch { /* ignore */ }
  }

  // ----- Meta form -----
  const titleInput = el('input', { class: 'input', type: 'text', placeholder: 'Title', value: item.title || '' });
  const timeInput = el('input', { class: 'input', type: 'datetime-local', value: timeToInputValue(item.time) });
  const timeHint = el('div', { class: 'field-hint' });
  const draftToggle = el('label', { class: 'toggle' },
    el('input', { type: 'checkbox' }),
    el('span', { class: 'toggle-track' }),
    el('span', { class: 'toggle-label' }, 'Draft (hidden from site)'),
  );
  draftToggle.querySelector('input').checked = !!item.draft;

  const tagInput = createTagInput({ value: item.tags || [], suggestions: allTags });

  function updateTimeHint() {
    const utc = inputValueToUTC(timeInput.value);
    timeHint.textContent = utc ? `Stored as UTC: ${utc}` : 'Time is required.';
  }
  timeInput.addEventListener('input', updateTimeHint);
  updateTimeHint();

  const metaCard = el('div', { class: 'card editor-meta' });

  // Type-specific fields
  let colorPicker = null;
  let imagePicker = null;
  let languageSelect = null;
  let mdxToggle = null;

  if (type === 'post') {
    imagePicker = await createImagePicker({ value: item.images || [] });
    metaCard.append(
      el('div', { class: 'card-title' }, 'Post'),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Title'), titleInput),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Time'), timeInput, timeHint),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Tags'), tagInput.node),
      el('div', { class: 'field' }, draftToggle),
      el('div', { class: 'field' },
        el('label', { class: 'field-label' }, 'Images'),
        el('div', { class: 'field-hint mb-1' }, 'Shown as cards in the post. Pick from uploaded images or add URLs.'),
        imagePicker.node,
      ),
    );
  } else if (type === 'thought') {
    colorPicker = createColorPicker({ value: item.color || '' });
    metaCard.append(
      el('div', { class: 'card-title' }, 'Thought'),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Time'), timeInput, timeHint),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Tags'), tagInput.node),
      el('div', { class: 'field' },
        el('label', { class: 'field-label' }, 'Card color'),
        el('div', { class: 'field-hint mb-1' }, 'Background of the thought card on the site.'),
        colorPicker.node,
      ),
      el('div', { class: 'field' }, draftToggle),
    );
  } else {
    languageSelect = el('select', { class: 'select' });
    const langs = ['astro', 'bash', 'c', 'cpp', 'css', 'go', 'java', 'javascript', 'jsx', 'json', 'markdown', 'python', 'rust', 'typescript', 'tsx', 'xml-doc', 'yaml', 'zig'];
    for (const l of langs) {
      languageSelect.append(el('option', { value: l }, l));
    }
    languageSelect.value = item.language || 'javascript';
    if (!langs.includes(item.language)) {
      languageSelect.append(el('option', { value: item.language }, `${item.language} (custom)`));
      languageSelect.value = item.language;
    }
    mdxToggle = el('label', { class: 'toggle' },
      el('input', { type: 'checkbox' }),
      el('span', { class: 'toggle-track' }),
      el('span', { class: 'toggle-label' }, 'MDX (supports {<Link />} and {<CodeContent />} embeds)'),
    );
    mdxToggle.querySelector('input').checked = !!item.mdx;

    metaCard.append(
      el('div', { class: 'card-title' }, 'Code snippet'),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Title'), titleInput),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Language'), languageSelect),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Time'), timeInput, timeHint),
      el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Tags'), tagInput.node),
      el('div', { class: 'field' }, mdxToggle),
      el('div', { class: 'field' }, draftToggle),
    );
  }

  // ----- Body editor + preview -----
  const bodyArea = el('textarea', {
    class: 'textarea code-pane',
    spellcheck: 'false',
    placeholder: type === 'code' ? 'Paste your code here…' : 'Write markdown here…',
  });
  bodyArea.value = item.body || '';

  const previewPane = el('div', { class: 'preview-pane rendered' });
  let previewTimer = null;
  let previewSeq = 0;

  async function updatePreview() {
    const seq = ++previewSeq;
    try {
      const data = await API.post('/api/preview', {
        type,
        body: bodyArea.value,
        language: languageSelect ? languageSelect.value : undefined,
      });
      if (seq !== previewSeq) return; // stale
      previewPane.innerHTML = data.html || '<span class="preview-empty">Empty.</span>';
    } catch (err) {
      if (seq === previewSeq) {
        previewPane.innerHTML = `<span class="preview-empty">Preview error: ${esc(err.message)}</span>`;
      }
    }
  }

  bodyArea.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 350);
  });

  // Tab key inserts spaces
  bodyArea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = bodyArea.selectionStart;
      const end = bodyArea.selectionEnd;
      bodyArea.value = bodyArea.value.slice(0, start) + '  ' + bodyArea.value.slice(end);
      bodyArea.selectionStart = bodyArea.selectionEnd = start + 2;
      bodyArea.dispatchEvent(new Event('input'));
    }
  });

  // Toolbar actions
  function wrapSelection(before, after = before, placeholder = 'text') {
    const start = bodyArea.selectionStart;
    const end = bodyArea.selectionEnd;
    const selected = bodyArea.value.slice(start, end) || placeholder;
    bodyArea.value = bodyArea.value.slice(0, start) + before + selected + after + bodyArea.value.slice(end);
    bodyArea.focus();
    bodyArea.selectionStart = start + before.length;
    bodyArea.selectionEnd = start + before.length + selected.length;
    bodyArea.dispatchEvent(new Event('input'));
  }
  function insertAtCursor(text) {
    const start = bodyArea.selectionStart;
    bodyArea.value = bodyArea.value.slice(0, start) + text + bodyArea.value.slice(bodyArea.selectionEnd);
    bodyArea.focus();
    bodyArea.selectionStart = bodyArea.selectionEnd = start + text.length;
    bodyArea.dispatchEvent(new Event('input'));
  }

  const tb = (label, title, fn) =>
    el('button', { class: 'tb-btn', title, onclick: fn }, label);

  const toolbar = el('div', { class: 'editor-toolbar' });
  if (type !== 'code') {
    toolbar.append(
      tb('B', 'Bold', () => wrapSelection('**')),
      tb('I', 'Italic', () => wrapSelection('_')),
      tb('`code`', 'Inline code', () => wrapSelection('`', '`', 'code')),
      tb('## H2', 'Heading 2', () => insertAtCursor('\n## ')),
      tb('### H3', 'Heading 3', () => insertAtCursor('\n### ')),
      tb('—', 'Horizontal rule', () => insertAtCursor('\n\n---\n\n')),
      tb('link', 'Markdown link', () => wrapSelection('[', '](https://)', 'link text')),
      tb('img', 'Image', () => insertAtCursor('![](/images/2026-01/photo.jpg)')),
      tb(':smile:', 'Emoji shortcode', () => insertAtCursor(':smile:')),
      el('span', { class: 'tb-sep' }),
      tb('{<Link />}', 'Link preview card (MDX)', () => insertAtCursor('{<Link url="https://example.com" />}')),
      tb('{<CodeContent />}', 'Embed code snippet (MDX)', () => insertAtCursor('{<CodeContent slug="…" />}')),
    );
  } else {
    toolbar.append(
      tb('//', 'Comment', () => insertAtCursor('// ')),
      tb('```', 'Fence', () => wrapSelection('\n```\n', '\n```\n', 'code')),
    );
  }

  // View toggle
  let viewMode = window.innerWidth > 900 ? 'split' : 'edit';
  const viewToggle = el('div', { class: 'view-toggle' });
  function paintViewToggle() {
    viewToggle.innerHTML = '';
    for (const [mode, label] of [['edit', 'Edit'], ['split', 'Split'], ['preview', 'Preview']]) {
      viewToggle.append(el('button', {
        class: viewMode === mode ? 'active' : '',
        onclick: () => { viewMode = mode; paintViewToggle(); applyView(); },
      }, label));
    }
  }
  // editorBody is declared just below; applyView() is only ever called after
  // it is initialized, so it is safe to reference it here via closure.
  let editorBody = null;
  function applyView() {
    if (editorBody) editorBody.classList.toggle('split', viewMode === 'split');
    bodyArea.style.display = viewMode === 'preview' ? 'none' : '';
    previewPane.style.display = viewMode === 'edit' ? 'none' : '';
  }
  paintViewToggle();

  toolbar.append(el('span', { class: 'tb-right' }, viewToggle));

  editorBody = el('div', { class: 'editor-body' + (viewMode === 'split' ? ' split' : '') },
    bodyArea, previewPane,
  );
  applyView();

  // ----- Save / actions -----
  const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save');
  const saveHint = el('span', { class: 'muted small' }, ` <span class="kbd">Ctrl</span>+<span class="kbd">S</span> to save`);

  let dirty = false;
  function markDirty() { dirty = true; }
  bodyArea.addEventListener('input', markDirty);
  titleInput.addEventListener('input', markDirty);
  timeInput.addEventListener('input', markDirty);

  async function save() {
    const time = inputValueToUTC(timeInput.value);
    if (!time) {
      toast('Please set a valid time.', 'error');
      timeInput.focus();
      return;
    }
    const payload = {
      type,
      title: titleInput.value,
      time,
      tags: tagInput.value,
      draft: draftToggle.querySelector('input').checked,
      body: bodyArea.value,
    };
    if (type === 'post') payload.images = imagePicker.value;
    if (type === 'thought') payload.color = colorPicker.value;
    if (type === 'code') {
      payload.language = languageSelect.value;
      payload.mdx = mdxToggle.querySelector('input').checked;
    }

    saveBtn.disabled = true;
    try {
      let result;
      if (isNew) {
        result = await API.post('/api/items', payload);
        toast('Created', 'success');
        location.hash = `#/items/${type}/${result.item.slug}`;
      } else {
        result = await API.put(`/api/items/${type}/${slug}`, payload);
        toast('Saved', 'success');
        dirty = false;
      }
    } catch (err) {
      toast(err.message, 'error', 6000);
    } finally {
      saveBtn.disabled = false;
    }
  }

  document.addEventListener('keydown', function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });

  const actions = el('div', { class: 'flex flex-wrap mt-2' },
    saveBtn, saveHint,
    el('a', { class: 'btn btn-ghost', href: '#/items' }, 'Cancel'),
    !isNew ? el('div', { class: 'grow' }) : null,
    !isNew ? el('button', {
      class: 'btn',
      onclick: async () => {
        try {
          const { item: dup } = await API.post(`/api/items/${type}/${slug}/duplicate`);
          toast('Duplicated as draft', 'success');
          location.hash = `#/items/${type}/${dup.slug}`;
        } catch (err) { toast(err.message, 'error'); }
      },
    }, 'Duplicate') : null,
    !isNew ? el('button', {
      class: 'btn btn-danger',
      onclick: async () => {
        const ok = await confirmModal({
          title: 'Delete item?',
          message: `“${item.title || slug}” will be moved to the trash. You can restore it later.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        try {
          await API.del(`/api/items/${type}/${slug}`);
          toast('Moved to trash', 'success');
          location.hash = '/items';
        } catch (err) { toast(err.message, 'error'); }
      },
    }, 'Delete') : null,
  );

  const slugLine = isNew
    ? el('div', { class: 'muted small' }, 'A new slug (32-char UUID) will be generated on save.')
    : el('div', { class: 'muted small' },
      `slug: ${esc(item.slug)} · file: ${esc(item.filename)}${item.mdx ? ' · mdx' : ''}`,
    );

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' },
          el('span', { class: 'prompt' }, '>'),
          isNew ? `New ${type}` : `Edit ${type}`,
          el('span', { class: `badge badge-${type}`, style: 'margin-left:0.6rem; vertical-align:middle' }, type),
        ),
        slugLine,
      ),
    ),
    el('div', { class: 'editor-layout' },
      metaCard,
      el('div', {}, toolbar, editorBody, actions),
    ),
  );

  await updatePreview();
}

// ---------- Tags ----------

route('/tags', async (app) => {
  const main = el('div', { class: 'main' });
  app.append(main);

  const card = el('div', { class: 'card' });

  async function load() {
    card.innerHTML = '<div class="muted small">Loading…</div>';
    try {
      const { tags, counts, byType } = await API.get('/api/tags');
      state.tags = tags;
      card.innerHTML = '';

      if (tags.length === 0) {
        card.append(el('div', { class: 'empty-state' },
          el('span', { class: 'empty-icon' }, '∅'),
          'No tags yet. Add tags to your content.',
        ));
        return;
      }

      card.append(
        el('div', { class: 'flex-between mb-1' },
          el('span', { class: 'muted small' }, `${tags.length} tags`),
        ),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'data' },
            el('thead', {}, el('tr', {},
              el('th', {}, 'Tag'), el('th', {}, 'Posts'), el('th', {}, 'Thoughts'),
              el('th', {}, 'Codes'), el('th', {}, 'Total'), el('th', {}, ''),
            )),
            el('tbody', {}, tags.map(tag => {
              const renameInput = el('input', { class: 'input', type: 'text', value: tag, style: 'width:140px; display:none' });
              const renameBtn = el('button', { class: 'btn btn-sm' }, 'Rename');
              const row = el('tr', {},
                el('td', { class: 'cell-title' },
                  el('span', { style: 'color:var(--text-dim)' }, '#'),
                  el('span', { class: 'tag-name' }, tag),
                  renameInput,
                ),
                el('td', { class: 'cell-dim' }, String(byType.post[tag] || 0)),
                el('td', { class: 'cell-dim' }, String(byType.thought[tag] || 0)),
                el('td', { class: 'cell-dim' }, String(byType.code[tag] || 0)),
                el('td', {}, String(counts[tag])),
                el('td', { class: 'cell-actions' },
                  renameBtn,
                  el('button', {
                    class: 'btn btn-sm btn-ghost btn-danger',
                    onclick: async () => {
                      const ok = await confirmModal({
                        title: 'Remove tag?',
                        message: `“#${tag}” will be removed from ${counts[tag]} item${counts[tag] === 1 ? '' : 's'}.`,
                        confirmLabel: 'Remove tag',
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        const r = await API.del(`/api/tags/${encodeURIComponent(tag)}`);
                        toast(`Removed from ${r.updated} file(s)`, 'success');
                        load();
                      } catch (err) { toast(err.message, 'error'); }
                    },
                  }, 'Remove'),
                ),
              );

              renameBtn.addEventListener('click', async () => {
                const nameSpan = row.querySelector('.tag-name');
                if (renameInput.style.display === 'none') {
                  renameInput.style.display = '';
                  nameSpan.style.display = 'none';
                  renameBtn.style.display = 'none';
                  renameInput.focus();
                  renameInput.select();
                } else {
                  const newTag = renameInput.value.trim().replace(/^#+/, '').toLowerCase();
                  if (!newTag) { toast('Tag name cannot be empty.', 'error'); return; }
                  if (newTag === tag) {
                    renameInput.style.display = 'none';
                    nameSpan.style.display = '';
                    renameBtn.style.display = '';
                    return;
                  }
                  const ok = await confirmModal({
                    title: 'Rename tag?',
                    message: `Rename “#${tag}” to “#${newTag}” across all content?`,
                    confirmLabel: 'Rename',
                  });
                  if (!ok) return;
                  try {
                    const r = await API.post('/api/tags/rename', { from: tag, to: newTag });
                    toast(`Renamed in ${r.updated} file(s)`, 'success');
                    load();
                  } catch (err) { toast(err.message, 'error'); }
                }
              });

              renameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') renameBtn.click();
                if (e.key === 'Escape') {
                  renameInput.style.display = 'none';
                  nameSpan.style.display = '';
                  renameBtn.style.display = '';
                }
              });

              return row;
            })),
          ),
        ),
      );
    } catch (err) {
      card.innerHTML = '';
      card.append(el('div', { class: 'empty-state' }, `Failed to load: ${esc(err.message)}`));
    }
  }

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' }, el('span', { class: 'prompt' }, '>'), 'Tags'),
        el('div', { class: 'page-subtitle' }, 'Rename or remove tags across all content files.'),
      ),
    ),
    card,
  );

  await load();
});

// ---------- Images ----------

route('/images', async (app) => {
  const main = el('div', { class: 'main' });
  app.append(main);

  const grid = el('div', { class: 'image-grid' });
  const countLabel = el('span', { class: 'muted small' });

  const dropzone = el('div', { class: 'dropzone' },
    el('span', { class: 'dz-icon' }, '⇪'),
    'Drop images here or click to browse',
    el('div', { class: 'small mt-1' }, 'JPG, PNG, GIF, WebP, AVIF, SVG · max 10 MB each · stored in public/images/YYYY-MM/'),
  );
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple', style: 'display:none' });

  async function uploadFiles(files) {
    for (const file of files) {
      try {
        const dataBase64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result.split(',')[1] || ''));
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        const result = await API.post('/api/images', { filename: file.name, dataBase64 });
        toast(`Uploaded ${result.path}`, 'success');
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'error', 6000);
      }
    }
    load();
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) uploadFiles([...fileInput.files]);
    fileInput.value = '';
  });
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) uploadFiles([...e.dataTransfer.files]);
  });

  async function load() {
    try {
      const { images, total } = await API.get('/api/images');
      countLabel.textContent = `${total} image${total === 1 ? '' : 's'}`;
      grid.innerHTML = '';
      if (images.length === 0) {
        grid.append(el('div', { class: 'muted small' }, 'No images yet.'));
        return;
      }
      for (const img of images) {
        const name = img.path.split('/').pop();
        grid.append(el('div', { class: 'image-cell' },
          el('img', { class: 'image-thumb', src: `/api/images/preview?path=${encodeURIComponent(img.path)}`, alt: name, loading: 'lazy' }),
          el('div', { class: 'image-meta' },
            el('div', { class: 'image-name', title: img.url }, img.path),
            el('div', { class: 'flex-between' },
              el('span', { class: 'muted small' }, fmtBytes(img.size)),
              el('div', { class: 'flex' },
                el('button', {
                  class: 'btn btn-sm btn-ghost',
                  title: 'Copy URL',
                  onclick: async () => {
                    try {
                      await navigator.clipboard.writeText(img.url);
                      toast('URL copied', 'success');
                    } catch {
                      toast('Copy failed', 'error');
                    }
                  },
                }, 'copy'),
                el('button', {
                  class: 'btn btn-sm btn-ghost btn-danger',
                  title: 'Delete image',
                  onclick: async () => {
                    const ok = await confirmModal({
                      title: 'Delete image?',
                      message: `${img.path} will be permanently deleted. Posts referencing it will show a broken image.`,
                      confirmLabel: 'Delete',
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await API.del('/api/images', { path: img.path });
                      toast('Deleted', 'success');
                      load();
                    } catch (err) { toast(err.message, 'error'); }
                  },
                }, 'del'),
              ),
            ),
          ),
        ));
      }
    } catch (err) {
      grid.innerHTML = '';
      grid.append(el('div', { class: 'empty-state' }, `Failed to load: ${esc(err.message)}`));
    }
  }

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' }, el('span', { class: 'prompt' }, '>'), 'Images'),
        el('div', { class: 'page-subtitle' }, 'Upload, browse, and manage images in public/images/.'),
      ),
      countLabel,
    ),
    dropzone,
    grid,
  );

  await load();
});

// ---------- Settings ----------

route('/settings', async (app) => {
  const main = el('div', { class: 'main' });
  app.append(main);

  let data = null;
  try {
    data = await API.get('/api/config');
  } catch (err) {
    main.append(el('div', { class: 'empty-state' }, `Failed to load config: ${esc(err.message)}`));
    return;
  }
  const cfg = data.config;

  const titleInput = el('input', { class: 'input', type: 'text', value: cfg.site.title });
  const footerInput = el('input', { class: 'input', type: 'text', value: cfg.site.footer });
  const urlInput = el('input', { class: 'input', type: 'text', value: cfg.site.url, placeholder: 'https://example.com' });
  const wmTextInput = el('input', { class: 'input', type: 'text', value: cfg.site.watermark?.text || '', placeholder: '(empty = no watermark)' });
  const wmStyleSelect = el('select', { class: 'select' },
    el('option', { value: 'diagonal' }, 'diagonal'),
    el('option', { value: 'right' }, 'right'),
  );
  wmStyleSelect.value = cfg.site.watermark?.style || 'diagonal';

  const postsPerPage = el('input', { class: 'input', type: 'number', min: '1', max: '1000', value: cfg.content.postsPerPage });
  const thoughtsPerPage = el('input', { class: 'input', type: 'number', min: '1', max: '1000', value: cfg.content.thoughtsPerPage });
  const tagsPerPage = el('input', { class: 'input', type: 'number', min: '1', max: '1000', value: cfg.content.tagsPerPage });

  const tzInput = el('input', { class: 'input', type: 'text', value: cfg.display.timezone, list: 'tz-options' });
  const tzList = el('datalist', { id: 'tz-options' });
  const commonTZ = ['UTC', 'USER', 'Asia/Kuala_Lumpur', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];
  for (const tz of commonTZ) tzList.append(el('option', { value: tz }));

  const fmtSelect = el('select', { class: 'select' },
    ...['long', 'medium', 'short', 'compact', 'minimal', 'iso'].map(f => el('option', { value: f }, f)),
  );
  fmtSelect.value = cfg.display.dateFormat;
  const fmtPreview = el('div', { class: 'config-preview' });

  const sampleDate = new Date();
  function paintFmtPreview() {
    const d = new Date(sampleDate);
    const pad = (x) => String(x).padStart(2, '0');
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate(), month = d.getMonth() + 1, year = d.getFullYear();
    const hour = d.getHours(), minute = d.getMinutes();
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = String(hour % 12 || 12);
    const min = pad(minute);
    const dow = DAYS[d.getDay()];
    const ord = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
    const p = fmtSelect.value;
    let out;
    switch (p) {
      case 'long': out = `${dow}, ${ord(day)} ${MONTHS[month - 1]}, ${year} at ${h12}:${min} ${ampm}`; break;
      case 'medium': out = `${ord(day)} ${MONTHS[month - 1]}, ${year} at ${h12}:${min} ${ampm}`; break;
      case 'short': out = `${day} ${MONTHS_SHORT[month - 1]} ${year}, ${h12}:${min} ${ampm}`; break;
      case 'compact': out = `${MONTHS_SHORT[month - 1]} ${day}, ${year}`; break;
      case 'minimal': out = `${day}/${pad(month)}/${year}`; break;
      case 'iso': out = `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`; break;
      default: out = '';
    }
    fmtPreview.textContent = `Example: ${out}`;
  }
  fmtSelect.addEventListener('change', paintFmtPreview);
  paintFmtPreview();

  const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save settings');
  const statusLine = el('div', { class: 'field-hint' });

  async function save() {
    saveBtn.disabled = true;
    statusLine.textContent = '';
    try {
      await API.put('/api/config', {
        site: {
          title: titleInput.value,
          footer: footerInput.value,
          url: urlInput.value,
          watermark: { text: wmTextInput.value, style: wmStyleSelect.value },
        },
        content: {
          postsPerPage: Number(postsPerPage.value),
          thoughtsPerPage: Number(thoughtsPerPage.value),
          tagsPerPage: Number(tagsPerPage.value),
        },
        display: {
          timezone: tzInput.value,
          dateFormat: fmtSelect.value,
        },
      });
      statusLine.textContent = 'Saved. Changes take effect on the next build (or dev-server reload).';
      toast('Settings saved', 'success');
    } catch (err) {
      statusLine.textContent = err.message;
      statusLine.className = 'field-error';
      toast(err.message, 'error', 6000);
    } finally {
      saveBtn.disabled = false;
    }
  }

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' }, el('span', { class: 'prompt' }, '>'), 'Settings'),
        el('div', { class: 'page-subtitle' },
          `Edits ${data.fileExists ? 'jawi.config.mjs' : 'jawi.config.mjs (will be created)'} — a backup is kept before every save.`,
        ),
      ),
    ),
    el('div', { class: 'editor-layout' },
      el('div', {},
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, 'Site'),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Title'), titleInput,
            el('div', { class: 'field-hint' }, 'Header logo + browser tab.')),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Footer text'), footerInput),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Site URL'), urlInput,
            el('div', { class: 'field-hint' }, 'Optional. Used for canonical URLs.')),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Watermark text'), wmTextInput),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Watermark style'), wmStyleSelect),
        ),
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, 'Content'),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Posts per page'), postsPerPage),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Thoughts per page'), thoughtsPerPage),
          el('div', { class: 'field' }, el('label', { class: 'field-label' }, 'Tags per page'), tagsPerPage),
        ),
      ),
      el('div', {},
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, 'Display'),
          el('div', { class: 'field' },
            el('label', { class: 'field-label' }, 'Timezone'),
            tzInput, tzList,
            el('div', { class: 'field-hint' }, 'IANA timezone (e.g. Asia/Kuala_Lumpur) or USER for each visitor\'s local timezone.'),
          ),
          el('div', { class: 'field' },
            el('label', { class: 'field-label' }, 'Date format'),
            fmtSelect,
            fmtPreview,
          ),
        ),
        el('div', { class: 'flex mt-2' },
          saveBtn,
          el('span', { class: 'grow' }),
          el('span', { class: 'muted small' }, data.fileExists ? '' : 'No config file yet — saving creates one.'),
        ),
        statusLine,
      ),
    ),
  );
});

// ---------- Trash ----------

route('/trash', async (app) => {
  const main = el('div', { class: 'main' });
  app.append(main);
  const card = el('div', { class: 'card' });

  async function load() {
    card.innerHTML = '<div class="muted small">Loading…</div>';
    try {
      const { entries } = await API.get('/api/trash');
      card.innerHTML = '';
      if (entries.length === 0) {
        card.append(el('div', { class: 'empty-state' },
          el('span', { class: 'empty-icon' }, '🗑'),
          'Trash is empty.',
        ));
        return;
      }
      card.append(
        el('div', { class: 'table-wrap' },
          el('table', { class: 'data' },
            el('thead', {}, el('tr', {},
              el('th', {}, 'Type'), el('th', {}, 'Title'), el('th', {}, 'File'),
              el('th', {}, 'Trashed'), el('th', {}, ''),
            )),
            el('tbody', {}, entries.map(entry =>
              el('tr', {},
                el('td', {}, el('span', { class: `badge badge-${entry.type}` }, entry.type)),
                el('td', { class: 'cell-title' }, entry.title),
                el('td', { class: 'cell-dim' }, entry.filename),
                el('td', { class: 'cell-dim' }, new Date(entry.trashedAt).toLocaleString()),
                el('td', { class: 'cell-actions' },
                  el('button', {
                    class: 'btn btn-sm btn-success',
                    onclick: async () => {
                      try {
                        await API.post(`/api/trash/${encodeURIComponent(entry.trashId)}/restore`);
                        toast('Restored', 'success');
                        load();
                      } catch (err) { toast(err.message, 'error'); }
                    },
                  }, 'Restore'),
                  el('button', {
                    class: 'btn btn-sm btn-ghost btn-danger',
                    onclick: async () => {
                      const ok = await confirmModal({
                        title: 'Permanently delete?',
                        message: `“${entry.title}” will be deleted forever. This cannot be undone.`,
                        confirmLabel: 'Delete forever',
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        await API.del(`/api/trash/${encodeURIComponent(entry.trashId)}`);
                        toast('Deleted forever', 'success');
                        load();
                      } catch (err) { toast(err.message, 'error'); }
                    },
                  }, 'Purge'),
                ),
              ),
            )),
          ),
        ),
      );
    } catch (err) {
      card.innerHTML = '';
      card.append(el('div', { class: 'empty-state' }, `Failed to load: ${esc(err.message)}`));
    }
  }

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' }, el('span', { class: 'prompt' }, '>'), 'Trash'),
        el('div', { class: 'page-subtitle' }, 'Deleted items are kept here until purged.'),
      ),
    ),
    card,
  );

  await load();
});

// ---------- Audit ----------

route('/audit', async (app) => {
  const main = el('div', { class: 'main' });
  app.append(main);
  const card = el('div', { class: 'card' });

  async function load() {
    card.innerHTML = '<div class="muted small">Loading…</div>';
    try {
      const { entries } = await API.get('/api/audit?limit=200');
      card.innerHTML = '';
      if (entries.length === 0) {
        card.append(el('div', { class: 'empty-state' },
          el('span', { class: 'empty-icon' }, '∅'),
          'No activity recorded yet.',
        ));
        return;
      }
      card.append(entries.map(e => {
        const detail = Object.entries(e)
          .filter(([k]) => !['ts', 'action'].includes(k))
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' · ');
        return el('div', { class: 'audit-row' },
          el('span', { class: 'audit-ts' }, new Date(e.ts).toLocaleString()),
          el('span', { class: 'audit-action' }, e.action),
          el('span', { class: 'audit-detail' }, detail || '—'),
        );
      }));
    } catch (err) {
      card.innerHTML = '';
      card.append(el('div', { class: 'empty-state' }, `Failed to load: ${esc(err.message)}`));
    }
  }

  main.append(
    el('div', { class: 'page-header' },
      el('div', {},
        el('div', { class: 'page-title' }, el('span', { class: 'prompt' }, '>'), 'Audit log'),
        el('div', { class: 'page-subtitle' }, 'Every change made through the admin panel, newest first.'),
      ),
    ),
    card,
  );

  await load();
});

// ---------- Boot ----------

async function boot() {
  try {
    const me = await API.get('/api/me');
    state.authed = me.authed;
    state.siteTitle = me.siteTitle;
    state.version = me.version;
  } catch {
    state.authed = false;
  }
  window.addEventListener('hashchange', navigate);
  await navigate();
}

boot();
