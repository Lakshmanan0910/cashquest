// app.js - code shared by every page: API helper, navbar, toasts, formatting, the "add transaction" form.

// ---------------------------------------------------------------- small helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Escape text before putting it into HTML (stops anyone injecting <script> through a note/title)
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 3200 -> ₹3,200   |   -1372.5 -> -₹1,372.50
function inr(n) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : '') + '₹' + s;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------- talking to the back-end
async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('Cannot reach the server. Is it running? (npm start)');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}
const GET = url => api('GET', url);
const POST = (url, body) => api('POST', url, body || {});
const PUT = (url, body) => api('PUT', url, body);
const DEL = url => api('DELETE', url);

// ---------------------------------------------------------------- "is the server running?" check
// If someone double-clicks index.html or opens it with Live Server, there is no CashQuest back-end
// behind the page. Instead of a broken page, show clear instructions.
(function checkServer() {
  function show() {
    if (document.getElementById('serverHelp')) return;
    const box = document.createElement('div');
    box.id = 'serverHelp';
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(5,6,20,.96);color:#eef1ff;font-family:system-ui,Segoe UI,sans-serif;overflow:auto';
    box.innerHTML = `
      <div style="max-width:560px;background:#12163a;border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:28px">
        <h2 style="margin:0 0 10px;font-size:1.4rem">⚠️ Start the CashQuest server first</h2>
        <p style="color:#c3cbf2;line-height:1.6">This page needs its back-end (Node.js + database) to work. It cannot be opened by double-clicking the file or with Live Server.</p>
        <ol style="color:#eef1ff;line-height:1.9;margin:14px 0 14px 20px">
          <li>In VS Code open the <b>cashquest</b> folder, then open the terminal (<b>Ctrl + \`</b>)</li>
          <li>Run <code style="background:#000;padding:2px 8px;border-radius:6px">npm install</code> (first time only)</li>
          <li>Run <code style="background:#000;padding:2px 8px;border-radius:6px">npm start</code></li>
          <li>Open <b>http://localhost:3000</b> in your browser</li>
        </ol>
        <a href="http://localhost:3000/" style="display:inline-block;padding:11px 22px;border-radius:999px;background:linear-gradient(120deg,#22e4ff,#8b5cf6);color:#04101c;font-weight:700;text-decoration:none">Open http://localhost:3000 →</a>
      </div>`;
    (document.body || document.documentElement).appendChild(box);
  }
  fetch('/api/auth/me')
    .then(r => { if (!(r.headers.get('content-type') || '').includes('json')) show(); })
    .catch(show);
})();

// ---------------------------------------------------------------- toasts
function toast(message, kind = 'info', icon = '') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = (icon ? `<span class="t-ico">${icon}</span>` : '') + `<span>${message}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3800);
}

// Show the rewards the server sends back after an action (XP, level up, badges, challenges)
function celebrate(r) {
  if (!r) return;
  let delay = 0;
  const later = fn => { setTimeout(fn, delay); delay += 450; };
  if (r.xpGained > 0) later(() => toast(`<b>+${r.xpGained} XP</b>`, 'xp', '✨'));
  if (r.levelUp) later(() => toast(`<b>LEVEL UP!</b> You are now Level ${r.level} · ${esc(r.title)}`, 'level', '🚀'));
  (r.completedChallenges || []).forEach(c => later(() => toast(`Challenge complete: <b>${esc(c.title)}</b> (+${c.xp} XP)`, 'success', c.icon)));
  (r.newBadges || []).forEach(b => later(() => toast(`New badge: <b>${esc(b.name)}</b><br><small>${esc(b.desc)}</small>`, 'success', b.icon)));
}

// ---------------------------------------------------------------- navbar
const NAV = [
  ['dashboard', '/dashboard.html', '🏠 Dashboard'],
  ['money', '/transactions.html', '💸 Money'],
  ['goals', '/goals.html', '🎯 Goals'],
  ['reports', '/reports.html', '📊 Reports'],
  ['challenges', '/challenges.html', '🏆 Quests'],
];

function logoHTML() {
  return '<a class="logo" href="/index.html"><span class="coin">₹</span><span class="logo-text">Laksh <span class="grad-text">Quest</span></span></a>';
}
function bindMenu() {
  const nav = $('.nav');
  const btn = $('.menu-btn', nav);
  if (btn) btn.addEventListener('click', () => nav.classList.toggle('open'));
}

function renderAppNav(active, user) {
  const links = NAV.map(([k, href, label]) => `<a href="${href}" class="${k === active ? 'active' : ''}">${label}</a>`).join('');
  $('#nav').innerHTML = `
    <nav class="nav"><div class="container nav-inner">
      ${logoHTML()}
      <div class="nav-links">${links}<a href="#" class="mobile-only" id="logoutLinkM">🚪 Log out</a></div>
      <div class="nav-right">
        <a class="lvl-pill" href="/challenges.html" title="Your level">
          <span class="lvl-num" id="navLvl">${user.level}</span>
          <span class="lvl-meta"><b>${esc(user.name)}</b><span id="navTitle">${esc(user.title)} · ${user.xp} XP</span></span>
        </a>
        <button class="btn btn-ghost btn-sm" id="logoutBtn">Log out</button>
      </div>
      <button class="menu-btn" aria-label="Menu">☰</button>
    </div></nav>`;
  bindMenu();
  const out = async e => { e && e.preventDefault(); try { await POST('/api/auth/logout'); } catch (_) {} location.href = '/index.html'; };
  $('#logoutBtn').addEventListener('click', out);
  $('#logoutLinkM').addEventListener('click', out);
}

async function renderPublicNav(active) {
  let user = null;
  try { user = (await GET('/api/auth/me')).user; } catch (_) {}
  const right = user
    ? `<a class="btn btn-primary btn-sm" href="/dashboard.html">Open dashboard →</a>`
    : `<a class="btn btn-ghost btn-sm" href="/login.html">Log in</a><a class="btn btn-primary btn-sm" href="/register.html">Sign up free</a>`;
  const mobile = user
    ? `<a href="/dashboard.html" class="mobile-only">Open dashboard</a>`
    : `<a href="/login.html" class="mobile-only">Log in</a><a href="/register.html" class="mobile-only">Sign up free</a>`;
  $('#nav').innerHTML = `
    <nav class="nav"><div class="container nav-inner">
      ${logoHTML()}
      <div class="nav-links">
        <a href="/index.html#features" class="${active === 'features' ? 'active' : ''}">Features</a>
        <a href="/index.html#how">How it works</a>${mobile}
      </div>
      <div class="nav-right">${right}</div>
      <button class="menu-btn" aria-label="Menu">☰</button>
    </div></nav>`;
  bindMenu();
  return user;
}

// Call at the top of every logged-in page. Redirects to login if there is no session.
async function bootApp(active) {
  try {
    const { user } = await GET('/api/auth/me');
    renderAppNav(active, user);
    return user;
  } catch (e) {
    if (e.status === 401) { location.replace('/login.html'); } else { document.body.insertAdjacentHTML('afterbegin', `<p style="padding:20px;color:#ff5470">${esc(e.message)}</p>`); }
    return new Promise(() => {}); // never resolves: the page stops here
  }
}

// keep the little level pill in the navbar fresh after XP changes
async function refreshNavLevel() {
  try {
    const { user } = await GET('/api/auth/me');
    const a = $('#navLvl'), b = $('#navTitle');
    if (a) a.textContent = user.level;
    if (b) b.textContent = `${user.title} · ${user.xp} XP`;
  } catch (_) {}
}

// ---------------------------------------------------------------- shared: categories + "add transaction" form
let _cats = null;
async function getCategories() {
  if (!_cats) _cats = (await GET('/api/categories')).categories;
  return _cats;
}

// Builds the add income/expense form inside `container`. onSaved() runs after a successful save.
async function buildTxnForm(container, onSaved) {
  const cats = await getCategories();
  let type = 'expense';
  container.innerHTML = `
    <div class="seg" role="tablist">
      <button type="button" data-t="expense" class="on expense">💸 Expense</button>
      <button type="button" data-t="income">💰 Income</button>
    </div>
    <form novalidate>
      <label>Amount (₹)</label>
      <input name="amount" type="number" min="1" step="0.01" inputmode="decimal" placeholder="e.g. 150" required />
      <label>Category</label>
      <select name="category_id"></select>
      <label>Note <span class="muted">(optional)</span></label>
      <input name="note" type="text" maxlength="80" placeholder="What was it for?" />
      <label>Date</label>
      <input name="date" type="date" required />
      <p class="form-error"></p>
      <button class="btn btn-primary btn-block" type="submit">Add expense</button>
    </form>`;
  const form = $('form', container), sel = form.category_id, err = $('.form-error', form), submit = $('button[type=submit]', form);
  form.date.value = todayISO(); form.date.max = todayISO();

  function fillCats() {
    sel.innerHTML = cats.filter(c => c.type === type).map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
    submit.textContent = type === 'expense' ? 'Add expense' : 'Add income';
  }
  fillCats();

  $$('.seg button', container).forEach(b => b.addEventListener('click', () => {
    type = b.dataset.t;
    $$('.seg button', container).forEach(x => { x.className = x === b ? 'on ' + type : ''; });
    fillCats();
  }));

  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    submit.disabled = true;
    try {
      const res = await POST('/api/transactions', {
        type, amount: form.amount.value, category_id: sel.value, note: form.note.value, date: form.date.value,
      });
      toast(type === 'expense' ? 'Expense added' : 'Income added', 'success', type === 'expense' ? '💸' : '💰');
      celebrate(res.rewards);
      form.amount.value = ''; form.note.value = '';
      refreshNavLevel();
      if (onSaved) await onSaved();
    } catch (ex) { err.textContent = ex.message; }
    submit.disabled = false;
  });
}

// ---------------------------------------------------------------- shared: Chart.js look
function setupCharts() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#c3cbf2';
  Chart.defaults.font.family = "'Poppins', system-ui, sans-serif";
  Chart.defaults.borderColor = 'rgba(255,255,255,.08)';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.maintainAspectRatio = false;
}
const CHART_COLORS = ['#22e4ff', '#8b5cf6', '#ff3d9a', '#2cffa5', '#ffc23d', '#ff7a59', '#6ea8ff', '#c084fc'];

// animate a progress bar fill after the page paints
function fillBars(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.bar > i[data-w]', root).forEach(i => { i.style.width = i.dataset.w + '%'; });
  }));
}
