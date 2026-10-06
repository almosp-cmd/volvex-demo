/* ==========================================================================
   Admin – keret: belépés, oldalsáv két felülettel (Munka | Statisztika),
   útválasztás, keresés, a statisztika közös időszaka, közös elemek
   (táblázat, oldalsó panel, KPI csempe, grafikonok, CSV export)
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const X = {
    list: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    tag: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>',
    coin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>',
    phoneApp: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    caret: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14l5-5 5 5"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg>',
    grid: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    today: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.5" r="2" fill="currentColor" stroke="none"/></svg>',
    work: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M9 12.5l2 2 4-4.5"/></svg>',
    tick: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  // A felület két része: Munka (napi teendők, rögzítés) és Statisztika (kimutatások).
  // Minden oldal pontosan az egyikhez tartozik (Admin.page(..., { mode: 'stat' })).
  const NAV = {
    work: [
      ['', [['ma', 'Mai nap', X.today]]],
      ['Pályák', [['naptar', 'Foglalási naptár', I.cal], ['foglalasok', 'Foglalások', X.list], ['allando', 'Állandó foglalások', I.redo]]],
      ['Ügyfelek', [['ugyfelek', 'Ügyfelek', I.users], ['berletek', 'Bérletek', I.ticket]]],
      ['Edzések', [['orarend', 'Órarend', I.layers], ['jelenlet', 'Jelenlét', I.check], ['diakok', 'Diákok', I.user], ['edzok', 'Edzők', I.whistle]]],
      ['Pénzügy', [['befizetesek', 'Befizetések', I.cash], ['tandijak', 'Tandíjak', X.coin], ['kintlevoseg', 'Kintlévőség', X.alert], ['szamlak', 'Számlák', I.receipt]]],
      ['Rendszer', [['arak', 'Árak és termékek', X.tag], ['beallitasok', 'Beállítások', I.gear]]],
    ],
    stat: [
      ['', [['attekintes', 'Áttekintés', X.grid]]],
      ['Részletek', [['bevetel', 'Bevétel', I.cash], ['kihasznaltsag', 'Pályakihasználtság', I.court], ['edzesek', 'Edzések és jelenlét', I.whistle], ['ugyfelkor', 'Ügyfélkör', I.users]]],
    ],
  };
  const HOME = { work: 'ma', stat: 'attekintes' };

  const pages = {};
  const actions = {};
  let shell = null;
  let current = null;
  const lastPath = {}; // felületenként az utoljára megnyitott oldal (visszaváltáskor oda térünk vissza)

  // ======================================================================
  // BELÉPÉS
  // ======================================================================
  function renderLogin() {
    shell = null;
    const root = $('#admin');
    root.innerHTML = `
      <div class="ad-login">
        <form class="al-box" autocomplete="off">
          <div class="al-logo"><svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="16.5" fill="none" stroke="#2DC3E6" stroke-width="2.6"/><path d="M9.2 8.6c6.2 5.6 6.2 17.2 0 22.8M30.8 8.6c-6.2 5.6-6.2 17.2 0 22.8" fill="none" stroke="#2DC3E6" stroke-width="2.2" stroke-linecap="round"/></svg><span>volvex<small>admin</small></span></div>
          <h1>Vezérlőpult</h1>
          <p>Foglalások, ügyfelek, edzések, befizetések és számlák – egy helyen.</p>
          <label class="fld"><span>Admin PIN-kód</span><input class="pin-inp" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" required autofocus></label>
          <button class="btn dark al-btn">Belépés ${I.next}</button>
          ${Store.isDemo ? `<p class="al-demo"><span class="demo-flag">Demó</span> PIN: <b>${esc(Store.settings().adminPin)}</b> · Élesben e-mail + jelszó és kétlépcsős azonosítás.</p>` : ''}
        </form>
        <div class="al-art" aria-hidden="true">${Court.card({ id: 'adm', no: 1, surface: 'hard' }, { chip: '● ÉLŐ', label: 'VEZÉRLŐPULT', brand: 'VOLVEX' })}</div>
      </div>`;
    const f = $('.al-box', root);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('.pin-inp', f).value.trim();
      if (Store.checkAdminPin(v)) { Store.setAdminAuth({ role: 'admin', at: new Date().toISOString() }); route(); } else {
        f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); $('.pin-inp', f).value = ''; UI.toast('Hibás PIN-kód');
      }
    });
  }

  // ======================================================================
  // KERET
  // ======================================================================
  function badges() {
    const today = Store.todayYmd();
    const missing = Store.missingSessions({ days: 14 }).filter((m) => m.date < today || Store.nowMin() >= Store.toMin(m.training.end)).length;
    const recv = Store.receivables().length;
    const todayN = Store.itemsOn(today).filter((it) => it.type === 'single' || it.type === 'regular').length;
    return { jelenlet: missing, kintlevoseg: recv, naptar: todayN };
  }

  function ensureShell() {
    if (shell) return;
    const root = $('#admin');
    root.innerHTML = `
      <div class="ad">
        <aside class="ad-side">
          <a class="ad-brand" href="#/ma"><svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="20" r="16.5" fill="none" stroke="#2DC3E6" stroke-width="2.6"/><path d="M9.2 8.6c6.2 5.6 6.2 17.2 0 22.8M30.8 8.6c-6.2 5.6-6.2 17.2 0 22.8" fill="none" stroke="#2DC3E6" stroke-width="2.2" stroke-linecap="round"/></svg><span>volvex<small>admin</small></span></a>
          <div class="ad-mode" role="tablist" aria-label="Felület">
            <button type="button" role="tab" data-face="work">${X.work}<span>Munka</span></button>
            <button type="button" role="tab" data-face="stat">${I.chart}<span>Statisztika</span></button>
          </div>
          <nav class="ad-nav"></nav>
          <div class="ad-side-foot">
            <a href="../index.html" target="_blank" rel="noopener">${X.globe}<span>Weboldal</span>${I.ext}</a>
            <a href="../munkatars/index.html" target="_blank" rel="noopener">${X.phoneApp}<span>Edzői app</span>${I.ext}</a>
            <button data-act="logout">${I.logout}<span>Kijelentkezés</span></button>
          </div>
        </aside>
        <div class="ad-scrim" data-act="nav-close"></div>
        <div class="ad-main">
          <header class="ad-top">
            <button class="icon-btn ad-burger" data-act="nav-open" aria-label="Menü">${I.menu}</button>
            <div class="ad-title"><h1 id="ad-h1"></h1><p id="ad-sub"></p></div>
            <div class="ad-search">
              ${I.search}<input id="ad-q" type="search" placeholder="Keresés: ügyfél, diák, számla, foglalási kód…" autocomplete="off">
              <div class="ad-results" hidden></div>
            </div>
            <div class="ad-new">
              <button class="btn dark" data-act="new-menu">${I.plus}<span>Új</span></button>
              <div class="ad-menu" hidden>
                <button data-new="booking">${I.cal}Foglalás</button>
                <button data-new="series">${I.redo}Állandó foglalás / edzésblokk</button>
                <button data-new="customer">${I.users}Ügyfél</button>
                <button data-new="student">${I.user}Diák</button>
                <button data-new="training">${I.layers}Csoport (órarend)</button>
                <button data-new="sale">${I.cash}Eladás rögzítése</button>
              </div>
            </div>
            <div class="ad-range"></div>
          </header>
          <div class="ad-demo" hidden><span class="demo-flag">Demó</span><span class="js-demo-t"></span></div>
          <main class="ad-page" id="ad-page"></main>
        </div>
      </div>`;
    shell = root.querySelector('.ad');
    renderNav();
    demoBanner();

    shell.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act], [data-new]');
      const menu = $('.ad-menu', shell);
      if (!e.target.closest('.ad-new')) menu.hidden = true;
      if (!e.target.closest('.ad-search')) $('.ad-results', shell).hidden = true;
      if (!e.target.closest('.rg')) rangeOpen(false);
      if (!b) return;
      if (b.dataset.new) { menu.hidden = true; const fn = { booking: 'newBooking', series: 'newSeries', customer: 'editCustomer', student: 'editStudent', training: 'editTraining', sale: 'newSale' }[b.dataset.new]; actions[fn] && actions[fn](); return; }
      const act = b.dataset.act;
      if (act === 'new-menu') menu.hidden = !menu.hidden;
      if (act === 'logout') UI.confirmBox('Kijelentkezel az adminból?', { ok: 'Kijelentkezés' }).then((ok) => { if (ok) { Store.setAdminAuth(null); renderLogin(); } });
      if (act === 'nav-open') shell.classList.add('nav-open');
      if (act === 'nav-close') shell.classList.remove('nav-open');
    });
    $('.ad-nav', shell).addEventListener('click', (e) => { if (e.target.closest('a')) shell.classList.remove('nav-open'); });
    // felület-váltó: a másik felület legutóbb nyitott oldalára (vagy a kezdőlapjára) visz
    $('.ad-mode', shell).addEventListener('click', (e) => {
      const f = e.target.closest('[data-face]'); if (!f || (current && current.mode === f.dataset.face)) return;
      location.hash = `#/${lastPath[f.dataset.face] || HOME[f.dataset.face]}`;
    });
    initSearch();
    initRange();
  }

  // a demó-sáv szövege attól függ, hogy az adatok közösek-e (claude.ai artifact) vagy csak helyiek
  function demoBanner() {
    const bar = shell && $('.ad-demo', shell); if (!bar) return;
    bar.hidden = !Store.isDemo && !Store.isShared;
    $('.js-demo-t', bar).textContent = Store.isShared
      ? (Store.isReadOnly ? 'Közös adatok – csak megtekintési jogod van, a módosításaid nem mentődnek.' : 'Közös adatok: amit itt vagy az edzői appban módosítasz, a link többi használója is látja.')
      : 'Az adatok csak ebben a böngészőben tárolódnak. A weboldalon leadott foglalások itt azonnal megjelennek (ugyanebben a böngészőben).';
  }

  function renderNav(anim = '') {
    if (!shell) return;
    const mode = current ? current.mode : 'work';
    const b = mode === 'work' ? badges() : {};
    const cur = current ? current.id : '';
    const nav = $('.ad-nav', shell);
    nav.innerHTML = NAV[mode].map(([g, items]) => `
      ${g ? `<h6>${g}</h6>` : ''}
      ${items.map(([id, t, ic]) => `<a href="#/${id}" class="${cur === id ? 'on' : ''}">${ic}<span>${t}</span>${b[id] ? `<i class="${id === 'naptar' ? 'n' : ''}">${b[id]}</i>` : ''}</a>`).join('')}`).join('');
    $$('[data-face]', shell).forEach((x) => { const on = x.dataset.face === mode; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
    if (anim) { nav.classList.remove('nav-in-work', 'nav-in-stat'); void nav.offsetWidth; nav.classList.add(`nav-in-${anim}`); }
  }

  // ---------- globális keresés ----------
  function initSearch() {
    const inp = $('#ad-q'); const box = $('.ad-results', shell);
    let t;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
    inp.addEventListener('focus', () => { if (inp.value.trim()) run(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inp.value = ''; box.hidden = true; inp.blur(); } if (e.key === 'Enter') { const f = $('[data-go]', box); f && f.click(); } });
    function run() {
      const q = Store.norm(inp.value);
      if (q.length < 2) { box.hidden = true; return; }
      const has = (...xs) => xs.some((x) => Store.norm(x).includes(q));
      const cust = Store.customers().filter((c) => has(c.name, c.email, c.phone, (c.billing || {}).name)).slice(0, 6);
      const studs = Store.students().filter((s) => has(s.name, s.parentName, s.email)).slice(0, 6);
      const invs = Store.invoices().filter((i) => has(i.no, i.buyer.name)).slice(0, 5);
      const bks = q.length >= 4 ? Store.bookings().filter((b) => Store.norm(b.id.slice(-6)) === q).slice(0, 3) : [];
      const grp = (title, rows) => (rows.length ? `<h6>${title}</h6>${rows.join('')}` : '');
      box.innerHTML = grp('Ügyfelek', cust.map((c) => `<button data-go="cust:${c.id}">${UI.avatar(c)}<span><b>${esc(c.name)}</b><small>${esc(c.email)}</small></span></button>`))
        + grp('Diákok', studs.map((s) => `<button data-go="stud:${s.id}">${UI.avatar(s)}<span><b>${esc(s.name)}</b><small>${esc((Store.program(s.programId) || {}).name || '')}${s.parentName ? ` · szülő: ${esc(s.parentName)}` : ''}</small></span></button>`))
        + grp('Foglalások', bks.map((b) => `<button data-go="bk:b:${b.id}"><span class="rs-ic">${I.cal}</span><span><b>${esc(b.id.slice(-6).toUpperCase())} · ${esc(b.date)} ${b.start}</b><small>${esc((Store.customer(b.customerId) || {}).name || '')}</small></span></button>`))
        + grp('Számlák', invs.map((i) => `<button data-go="inv:${i.id}"><span class="rs-ic">${I.receipt}</span><span><b class="mono">${esc(i.no)}</b><small>${esc(i.buyer.name)} · ${money(i.total)}</small></span></button>`))
        || '<p class="rs-empty">Nincs találat</p>';
      box.hidden = false;
    }
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const [kind, ...rest] = b.dataset.go.split(':'); const id = rest.join(':');
      box.hidden = true; inp.value = '';
      if (kind === 'cust') actions.openCustomer(id);
      if (kind === 'stud') actions.openStudent(id);
      if (kind === 'inv') openInvoice(id);
      if (kind === 'bk') actions.openItem(id);
    });
  }

  // ======================================================================
  // ÚTVÁLASZTÁS
  // ======================================================================
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    return { page: parts[0] || HOME.work, parts: parts.slice(1), q: Object.fromEntries(new URLSearchParams(q || '')) };
  }
  function route() {
    if (!Store.adminAuth()) { renderLogin(); return; }
    ensureShell();
    const r = parse();
    const id = pages[r.page] ? r.page : HOME.work;
    const p = pages[id];
    const mode = p.mode || 'work';
    const prevMode = current ? current.mode : null;
    const same = current && current.id === id;
    current = { id, r, p, mode };
    lastPath[mode] = location.hash.replace(/^#\/?/, '') || id;
    shell.classList.toggle('is-stat', mode === 'stat');
    $('#ad-h1').textContent = p.title;
    setSub();
    document.title = `${p.title} · Volvex Admin`;
    renderNav(prevMode && prevMode !== mode ? mode : '');
    if (mode === 'stat') renderRange();
    const el = freshPage();
    el.className = `ad-page pg-${id} mode-${mode}`;
    p.render(el, r);
    if (!same) $('.ad-main', shell).scrollTop = 0;
  }
  function setSub() { const p = current.p; $('#ad-sub').textContent = typeof p.sub === 'function' ? p.sub(current.r) : (p.sub || ''); }
  // minden rendernél új oldal-elem, így a korábbi eseménykezelők nem halmozódnak
  function freshPage() {
    const old = $('#ad-page');
    const el = old.cloneNode(false);
    old.replaceWith(el);
    return el;
  }
  let refreshT;
  function refresh() {
    if (!shell || !current) return;
    clearTimeout(refreshT);
    refreshT = setTimeout(() => {
      const main = $('.ad-main', shell);
      const y = main.scrollTop;
      const act = document.activeElement;
      const keep = act && act.id && $('#ad-page').contains(act) ? { id: act.id, s: act.selectionStart, e: act.selectionEnd } : null;
      renderNav();
      demoBanner();
      setSub();
      if (current.p.refresh) current.p.refresh();
      else { const el = freshPage(); el.className = `ad-page pg-${current.id} mode-${current.mode}`; current.p.render(el, current.r); }
      main.scrollTop = y;
      if (keep) { const n = document.getElementById(keep.id); if (n) { n.focus(); try { n.setSelectionRange(keep.s, keep.e); } catch (e) { /* */ } } }
    }, 30);
  }

  // ======================================================================
  // KÖZÖS ELEMEK
  // ======================================================================
  function drawer(opts) { return UI.sheet({ ...opts, cls: `side ${opts.wide ? 'wide' : ''} ${opts.cls || ''}` }); }
  function openInvoice(id) {
    const inv = Store.invoice(id); if (!inv) return;
    const can = inv.status === 'issued';
    const sh = Invoice.open(inv, { actions: can ? '<button class="btn danger-ghost js-storno">Sztornó</button>' : '' });
    const b = $('.js-storno', sh.el);
    if (b) {
      b.addEventListener('click', async () => {
        const ok = await UI.confirmBox(`Sztornózod a(z) ${inv.no} számlát?`, { ok: 'Sztornó számla kiállítása', danger: true, sub: 'Ez nem utalja vissza a pénzt – visszatérítést a Befizetéseknél indíthatsz.' });
        if (!ok) return;
        const st = Store.stornoInvoice(inv.id); sh.close(); UI.toast(`Sztornó számla: ${st.no}`);
      });
    }
  }

  const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'hu'));
  /** Rendezhető, lapozós táblázat. */
  function table(host, o) {
    let sort = o.sort || null; let limit = o.pageSize || 80;
    const rk = o.rowKey || ((r) => r.id);
    function draw() {
      let rows = [...o.rows];
      if (sort) {
        const c = o.cols.find((x) => x.key === sort.key);
        const v = c && (c.sort || ((r) => r[c.key]));
        if (v) rows.sort((a, b) => cmp(v(a), v(b)) * sort.dir);
      }
      const shown = rows.slice(0, limit);
      host.innerHTML = `<div class="tbl-wrap"><table class="tbl ${o.cls || ''}">
        <thead><tr>${o.cols.map((c) => `<th class="${c.align || ''} ${c.sort ? 'srt' : ''} ${sort && sort.key === c.key ? 'on' : ''}" ${c.width ? `style="width:${c.width}"` : ''} ${c.sort ? `data-sort="${c.key}"` : ''}>${c.label}${c.sort ? `<span class="caret">${sort && sort.key === c.key ? (sort.dir > 0 ? X.up : X.down) : X.caret}</span>` : ''}</th>`).join('')}</tr></thead>
        <tbody>${shown.map((r) => `<tr data-k="${esc(rk(r))}" class="${o.onRow ? 'click' : ''} ${o.rowCls ? o.rowCls(r) : ''}">${o.cols.map((c) => `<td class="${c.align || ''} ${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key] == null ? '' : r[c.key])}</td>`).join('')}</tr>`).join('')
          || `<tr><td colspan="${o.cols.length}" class="tbl-empty">${o.empty || 'Nincs találat'}</td></tr>`}</tbody>
        ${o.foot ? `<tfoot>${o.foot(rows)}</tfoot>` : ''}
      </table></div>
      ${rows.length > limit ? `<button class="tbl-more">Továbbiak mutatása (${rows.length - limit})</button>` : ''}`;
    }
    host.onclick = (e) => {
      const th = e.target.closest('th[data-sort]');
      if (th) { const k = th.dataset.sort; sort = sort && sort.key === k ? { key: k, dir: -sort.dir } : { key: k, dir: o.sortDir || 1 }; draw(); return; }
      if (e.target.closest('.tbl-more')) { limit += 120; draw(); return; }
      const tr = e.target.closest('tr[data-k]');
      if (tr && o.onRow && !e.target.closest('button, a, input, label, select')) {
        const r = o.rows.find((x) => String(rk(x)) === tr.dataset.k); if (r) o.onRow(r, tr);
      }
    };
    draw();
    return { draw, get rows() { return o.rows; }, setRows(r) { o.rows = r; draw(); } };
  }

  /**
   * KPI csempe. delta: relatív változás (0,12 = +12%), vagy pp: true esetén
   * arányok különbsége százalékpontban (0,021 = +2,1 %-pont). href: a csempe link.
   */
  function kpi({ label, value, delta, good = true, pp = false, sub = '', spark = null, tone = '', href = '' }) {
    let d = '';
    if (delta != null && isFinite(delta)) {
      const up = delta >= 0;
      const ok = up === good;
      const flat = Math.abs(delta) < (pp ? 0.0005 : 0.005);
      const txt = pp ? `${String(Math.round(Math.abs(delta) * 1000) / 10).replace('.', ',')} %-pont` : `${Math.abs(Math.round(delta * 100))}%`;
      d = `<span class="k-delta ${flat ? '' : ok ? 'good' : 'bad'}">${up ? X.up : X.down}${txt}</span>`;
    }
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi ${tone} ${href ? 'link' : ''}" ${href ? `href="${href}"` : ''}>
      <span class="k-label">${label}${href ? I.next : ''}</span>
      <b class="k-val">${value}</b>
      <span class="k-sub">${d}${sub}</span>
      ${spark ? sparkline(spark) : ''}
    </${tag}>`;
  }
  function sparkline(vals) {
    const w = 120; const h = 34; const max = Math.max(1, ...vals); const min = Math.min(0, ...vals);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`);
    const last = pts[pts.length - 1].split(',');
    return `<svg class="k-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="#B3AFA6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="#2a78d6" stroke="#fff" stroke-width="2"/></svg>`;
  }

  // ---------- tooltip ----------
  let tipEl = null;
  function tip(html, x, y) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'viz-tip'; document.body.appendChild(tipEl); }
    if (html == null) { tipEl.classList.remove('on'); return; }
    tipEl.innerHTML = html;
    tipEl.classList.add('on');
    const r = tipEl.getBoundingClientRect();
    let left = x + 14; let top = y - r.height - 12;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top < 8) top = y + 16;
    tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  /** Halmozott oszlopdiagram (pl. napi bevétel kategóriánként); egy adatsorral sima oszlopdiagram. */
  function stackedColumns(host, { data, series, height = 240, fmt = money, tick = UI.moneyShort, max: fixedMax = null, label = (d) => d.x }) {
    const w = Math.max(320, host.clientWidth || 640);
    const pad = { l: 52, r: 8, t: 10, b: 26 };
    const iw = w - pad.l - pad.r; const ih = height - pad.t - pad.b;
    const totals = data.map((d) => series.reduce((s, se) => s + Math.max(0, d.values[se.key] || 0), 0));
    const rawMax = fixedMax || Math.max(1, ...totals);
    const step = niceStep(rawMax / 4);
    const max = fixedMax || Math.ceil(rawMax / step) * step;
    const band = iw / data.length;
    const bw = Math.min(24, Math.max(4, band - 6));
    const y = (v) => pad.t + ih - (v / max) * ih;
    let grid = '';
    for (let i = 0; i * step <= max + step / 2; i++) {
      const v = i * step;
      grid += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}" class="v-grid"/><text x="${pad.l - 8}" y="${y(v) + 4}" class="v-tick" text-anchor="end">${esc(tick(v))}</text>`;
    }
    let bars = '';
    data.forEach((d, i) => {
      const cx = pad.l + band * i + band / 2;
      let acc = 0;
      const segs = series.map((se) => ({ se, v: Math.max(0, d.values[se.key] || 0) })).filter((s) => s.v > 0);
      segs.forEach((s, k) => {
        const y0 = y(acc); const y1 = y(acc + s.v);
        const top = k === segs.length - 1;
        const hh = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0)); // 2px felületi rés a szegmensek között
        const yy = y1;
        if (hh > 0.5) {
          bars += top
            ? `<path d="${roundTop(cx - bw / 2, yy, bw, hh, Math.min(4, hh))}" fill="${s.se.color}"/>`
            : `<rect x="${cx - bw / 2}" y="${yy}" width="${bw}" height="${hh}" fill="${s.se.color}"/>`;
        }
        acc += s.v;
      });
      bars += `<rect class="v-hit" x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ih}" data-i="${i}"/>`;
      if (data.length <= 16 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) {
        bars += `<text x="${cx}" y="${height - 8}" class="v-tick" text-anchor="middle">${esc(label(d))}</text>`;
      }
    });
    host.innerHTML = `<svg class="viz" viewBox="0 0 ${w} ${height}" width="${w}" height="${height}" role="img" aria-label="Oszlopdiagram">${grid}<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(0)}" y2="${y(0)}" class="v-base"/>${bars}<line class="v-cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" style="opacity:0"/></svg>`;
    const svg = $('svg', host); const cross = $('.v-cross', svg);
    svg.addEventListener('mousemove', (e) => {
      const h = e.target.closest('.v-hit'); if (!h) { tip(null); cross.style.opacity = 0; return; }
      const d = data[Number(h.dataset.i)];
      const cx = pad.l + band * Number(h.dataset.i) + band / 2;
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.opacity = 1;
      const tot = series.reduce((s, se) => s + (d.values[se.key] || 0), 0);
      tip(`<b>${esc(d.title || label(d))}</b>${series.map((se) => `<div class="tr"><i style="background:${se.color}"></i><span>${esc(se.label)}</span><b>${fmt(d.values[se.key] || 0)}</b></div>`).join('')}${series.length > 1 ? `<div class="tr tot"><span>Összesen</span><b>${fmt(tot)}</b></div>` : ''}${d.note ? `<div class="tr tot"><span>${esc(d.note)}</span></div>` : ''}`, e.clientX, e.clientY);
    });
    svg.addEventListener('mouseleave', () => { tip(null); cross.style.opacity = 0; });
  }
  function roundTop(x, y, w, h, r) {
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  /** Hőtérkép (kihasználtság nap × óra), egy színárnyalatú skálával. */
  const RAMP = ['#F2F0EB', '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281'];
  function rampColor(v) { return RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))))]; }
  function heatmap(host, { rows, cols, value, tipFor }) {
    host.innerHTML = `<div class="hm" style="--cols:${cols.length}">
      <span></span>${cols.map((c) => `<span class="hm-c">${esc(c.label)}</span>`).join('')}
      ${rows.map((r) => `<span class="hm-r">${esc(r.label)}</span>${cols.map((c) => { const v = value(r, c); return `<i class="hm-cell" style="background:${v == null ? 'transparent' : rampColor(v)}" data-r="${esc(r.key)}" data-c="${esc(c.key)}"></i>`; }).join('')}`).join('')}
    </div>
    <div class="hm-leg"><span>0%</span><i style="background:linear-gradient(90deg, ${RAMP.join(',')})"></i><span>100%</span></div>`;
    const hm = $('.hm', host);
    hm.addEventListener('mousemove', (e) => {
      const c = e.target.closest('.hm-cell'); if (!c) { tip(null); return; }
      tip(tipFor(c.dataset.r, c.dataset.c), e.clientX, e.clientY);
    });
    hm.addEventListener('mouseleave', () => tip(null));
  }

  /**
   * Egysoros vonaldiagram időbeli trendhez (pl. kihasználtság hetente).
   * Nem nulláról induló tengely is lehet (min/max/minSpan) – vonalnál ez megengedett, oszlopnál nem.
   */
  function lineChart(host, { data, height = 220, fmt = (v) => v, tick = fmt, min = null, max = null, minSpan = 0, clamp = null, color = '#2a78d6', name = '', label = (d) => d.x }) {
    const vals = data.map((d) => d.v).filter((v) => v != null);
    if (!vals.length) { host.innerHTML = '<p class="empty-s">Ebben az időszakban nincs adat.</p>'; return; }
    const w = Math.max(320, host.clientWidth || 640);
    const pad = { l: 48, r: 56, t: 12, b: 26 };
    const iw = w - pad.l - pad.r; const ih = height - pad.t - pad.b;
    let lo = min != null ? min : Math.min(...vals); let hi = max != null ? max : Math.max(...vals);
    if (hi - lo < minSpan) { const c = (hi + lo) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
    if (clamp) {
      if (lo < clamp[0]) { hi += clamp[0] - lo; lo = clamp[0]; }
      if (hi > clamp[1]) { lo = Math.max(clamp[0], lo - (hi - clamp[1])); hi = clamp[1]; }
    }
    if (hi <= lo) hi = lo + 1;
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step + 1e-9) * step; hi = Math.ceil(hi / step - 1e-9) * step;
    const n = data.length;
    const x = (i) => pad.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
    const y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
    let grid = '';
    for (let k = 0; lo + k * step <= hi + step / 2; k++) {
      const v = lo + k * step;
      grid += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}" class="${k ? 'v-grid' : 'v-base'}"/><text x="${pad.l - 8}" y="${y(v) + 4}" class="v-tick" text-anchor="end">${esc(tick(v))}</text>`;
    }
    // a hiányzó pontoknál megszakad a vonal
    let line = ''; let area = ''; let seg = []; let dots = '';
    const P = (i) => `${x(i).toFixed(1)},${y(data[i].v).toFixed(1)}`;
    const flush = () => {
      if (seg.length > 1) {
        line += `M${seg.map(P).join('L')}`;
        area += `M${x(seg[0]).toFixed(1)},${y(lo)}L${seg.map(P).join('L')}L${x(seg[seg.length - 1]).toFixed(1)},${y(lo)}Z`;
      } else if (seg.length === 1) dots += `<circle cx="${x(seg[0])}" cy="${y(data[seg[0]].v)}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>`;
      seg = [];
    };
    data.forEach((d, i) => { if (d.v == null) flush(); else seg.push(i); }); flush();
    let li = n - 1; while (data[li].v == null) li--;
    let xl = ''; const every = Math.ceil(n / 9);
    data.forEach((d, i) => { if (n <= 12 || i % every === 0 || i === n - 1) xl += `<text x="${x(i)}" y="${height - 8}" class="v-tick" text-anchor="middle">${esc(label(d))}</text>`; });
    host.innerHTML = `<svg class="viz" viewBox="0 0 ${w} ${height}" width="${w}" height="${height}" role="img" aria-label="${esc(name || 'Vonaldiagram')}">${grid}
      <path d="${area}" fill="${color}" fill-opacity=".1"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}
      <circle cx="${x(li)}" cy="${y(data[li].v)}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/><text x="${x(li) + 10}" y="${y(data[li].v) + 4}" class="v-end">${esc(fmt(data[li].v))}</text>
      ${xl}<line class="v-cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" style="opacity:0"/><circle class="v-hov" r="5" fill="${color}" stroke="#fff" stroke-width="2" style="opacity:0"/>
      <rect class="v-hit" x="${pad.l - 12}" y="${pad.t}" width="${iw + 24}" height="${ih}"/></svg>`;
    const svg = $('svg', host); const cross = $('.v-cross', svg); const hov = $('.v-hov', svg);
    svg.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * w;
      const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((sx - pad.l) / iw) * (n - 1))));
      const d = data[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.opacity = 1;
      if (d.v == null) hov.style.opacity = 0; else { hov.setAttribute('cx', x(i)); hov.setAttribute('cy', y(d.v)); hov.style.opacity = 1; }
      tip(`<b>${esc(d.title || label(d))}</b><div class="tr"><i class="ln" style="background:${color}"></i><span>${esc(name)}</span><b>${d.v == null ? 'nincs adat' : esc(fmt(d.v))}</b></div>${d.note ? `<div class="tr tot"><span>${esc(d.note)}</span></div>` : ''}`, e.clientX, e.clientY);
    });
    svg.addEventListener('mouseleave', () => { tip(null); cross.style.opacity = 0; hov.style.opacity = 0; });
  }

  /**
   * Vízszintes sávlista: egy adatsor, egy szín, az érték a sáv végén (közvetlen címke).
   * rows: [{ label, sub?, v, text?, lead?, href? }] – a label szöveg, a sub/lead kész HTML.
   * track: arányoknál (0–1) halvány sín mutatja a 100%-ot.
   */
  function barList(rows, { max = null, fmt = (v) => v, track = false, color = '#2a78d6', empty = 'Ebben az időszakban nincs adat.' } = {}) {
    if (!rows.length) return `<p class="empty-s">${esc(empty)}</p>`;
    const m = max != null ? max : Math.max(1e-9, ...rows.map((r) => r.v));
    return `<div class="bl ${track ? 'has-track' : ''}">${rows.map((r) => {
      const tag = r.href ? 'a' : 'div';
      return `<${tag} class="bl-r ${r.href ? 'click' : ''}" ${r.href ? `href="${r.href}"` : ''}>
        <span class="bl-l">${r.lead || ''}<span><b>${esc(r.label)}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</span></span>
        <span class="bl-t"><i style="width:${Math.max(0, Math.min(100, (r.v / m) * 100)).toFixed(2)}%;background:${r.color || color}"></i></span>
        <b class="bl-v">${r.text != null ? r.text : esc(fmt(r.v))}</b>
      </${tag}>`;
    }).join('')}</div>`;
  }

  /** Megoszlás egyetlen 100%-os sávon (rész az egészhez), alatta jelmagyarázat értékkel és aránnyal. */
  function shareBar(parts, { fmt = money } = {}) {
    const tot = parts.reduce((a, p) => a + Math.max(0, p.v), 0);
    if (!tot) return '<p class="empty-s">Ebben az időszakban nincs adat.</p>';
    const pc = (v) => `${Math.round((Math.max(0, v) / tot) * 100)}%`;
    return `<div class="sb">
      <div class="sb-bar">${parts.filter((p) => p.v > 0).map((p) => `<i style="flex:${p.v} 1 0;background:${p.color}" data-tip="${esc(p.label)}" data-tip-l="${esc(pc(p.v))}" data-tip-v="${esc(fmt(p.v))}"></i>`).join('')}</div>
      <div class="sb-leg">${parts.map((p) => `<span><i style="background:${p.color}"></i><span>${esc(p.label)}</span><b>${esc(fmt(p.v))}</b><em>${pc(p.v)}</em></span>`).join('')}</div>
    </div>`;
  }

  /** Mérősáv (arány egy célhoz / az egészhez): ugyanannak a skálának világosabb sínje. */
  function meter(rate, { label = '', sub = '', right = '' } = {}) {
    const w = Math.max(0, Math.min(1, rate || 0)) * 100;
    return `<div class="mt"><div class="mt-h"><b>${label}</b><span>${right}</span></div><div class="mt-t"><i style="width:${w.toFixed(1)}%"></i></div>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }

  // egyszerű tooltip bármilyen data-tip attribútumú elemhez (pl. megoszlás-sáv szeletei)
  let attrTip = false;
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { if (attrTip) { attrTip = false; tip(null); } return; }
    attrTip = true;
    tip(`<b>${esc(t.dataset.tip)}</b>${t.dataset.tipV ? `<div class="tr"><span>${esc(t.dataset.tipL || '')}</span><b>${esc(t.dataset.tipV)}</b></div>` : ''}`, e.clientX, e.clientY);
  });

  // ---------- CSV (Excelhez: pontosvessző, BOM) ----------
  function csv(filename, cols, rows) {
    const q = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = [cols.map((c) => q(c.label)).join(';'), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(';'))].join('\r\n');
    UI.download(filename, `﻿${text}`, 'text/csv;charset=utf-8');
  }

  // ---------- személyek, címkék ----------
  function who(payer) {
    if (!payer) return { name: 'Vendég', sub: '' };
    if (payer.kind === 'customer') { const c = Store.customer(payer.id); return { name: c ? c.name : 'Törölt ügyfél', sub: 'ügyfél', obj: c }; }
    const s = Store.student(payer.id); return { name: s ? (s.parentName ? `${s.name}` : s.name) : 'Törölt diák', sub: s && s.parentName ? `szülő: ${s.parentName}` : 'diák', obj: s };
  }
  function whoLink(payer) {
    const w = who(payer);
    if (!payer || !w.obj) return esc(w.name);
    return `<button class="lnk" data-open="${payer.kind}:${payer.id}">${esc(w.name)}</button>`;
  }
  const METHOD_SHORT = { card: 'Online kártya', pos: 'POS kártya', cash: 'Készpénz', transfer: 'Átutalás', szep: 'SZÉP', pass: 'Bérlet', onsite: 'Helyszínen' };
  function methodPill(m) { return `<span class="mpill m-${esc(m)}">${esc(METHOD_SHORT[m] || m || '—')}</span>`; }
  function payStatus(it) {
    if (it.type === 'training' || it.type === 'block') return '<span class="pill soft">—</span>';
    if (it.status === 'cancelled') return '<span class="pill miss">Lemondva</span>';
    if (it.passId) return '<span class="pill soft">Bérlet</span>';
    if (it.paid) return `<span class="pill ok">${I.check}Fizetve</span>`;
    return it.date < Store.todayYmd() ? '<span class="pill warn">Tartozás</span>' : '<span class="pill todo">Fizetendő</span>';
  }
  // táblázatokban a nevekre kattintva a megfelelő panel nyílik
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]'); if (!b || !$('#admin').contains(b) && !b.closest('.sheet-root')) return;
    const [k, id] = b.dataset.open.split(':');
    if (k === 'customer') actions.openCustomer(id);
    if (k === 'student') actions.openStudent(id);
  });

  // ---------- időszak-választó ----------
  function periodOf(key, custom = {}) {
    const t = Store.todayYmd(); const d = Store.parseYmd(t);
    const mon = Store.ymd(Store.addDays(d, -(Store.isoDow(d) - 1)));
    const m = Store.monthOf(t);
    switch (key) {
      case 'today': return { from: t, to: t, label: 'Ma' };
      case 'yesterday': return { from: Store.shiftYmd(t, -1), to: Store.shiftYmd(t, -1), label: 'Tegnap' };
      case 'week': return { from: mon, to: Store.shiftYmd(mon, 6), label: 'Ez a hét' };
      case 'lastweek': return { from: Store.shiftYmd(mon, -7), to: Store.shiftYmd(mon, -1), label: 'Múlt hét' };
      case 'month': return { ...Store.monthRange(m), label: 'Ez a hónap' };
      case 'lastmonth': return { ...Store.monthRange(Store.shiftMonth(m, -1)), label: 'Előző hónap' };
      case '30': return { from: Store.shiftYmd(t, -29), to: t, label: 'Utolsó 30 nap' };
      case 'next14': return { from: t, to: Store.shiftYmd(t, 14), label: 'Következő 14 nap' };
      case 'custom': return { from: custom.from || t, to: custom.to || t, label: 'Egyedi' };
      default: return { from: Store.shiftYmd(t, -29), to: t, label: 'Utolsó 30 nap' };
    }
  }
  function periodPicker(cur, keys, custom = {}) {
    return `<div class="period">
      <div class="seg-ctl">${keys.map(([k, l]) => `<button data-period="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${cur === 'custom' ? `<span class="period-c"><input type="date" class="inp sm" data-pfrom value="${custom.from || ''}"><span>–</span><input type="date" class="inp sm" data-pto value="${custom.to || ''}"></span>` : ''}
    </div>`;
  }

  // ======================================================================
  // STATISZTIKA – közös időszak a fejlécben; minden kimutatás erre szűr
  // (kind: days = utolsó n nap · week = naptári hét · month = naptári hónap · range = egyedi)
  // ======================================================================
  let SP = { kind: 'days', n: 30 };
  const PRESETS = [
    ['d7', 'Utolsó 7 nap', () => ({ kind: 'days', n: 7 })],
    ['d30', 'Utolsó 30 nap', () => ({ kind: 'days', n: 30 })],
    ['d90', 'Utolsó 90 nap', () => ({ kind: 'days', n: 90 })],
    ['w0', 'Ez a hét', () => ({ kind: 'week', from: Store.weekStart(Store.todayYmd()) })],
    ['w1', 'Múlt hét', () => ({ kind: 'week', from: Store.shiftYmd(Store.weekStart(Store.todayYmd()), -7) })],
    ['m0', 'Ez a hónap', () => ({ kind: 'month', month: Store.monthOf(Store.todayYmd()) })],
    ['m1', 'Előző hónap', () => ({ kind: 'month', month: Store.shiftMonth(Store.monthOf(Store.todayYmd()), -1) })],
  ];
  const sameSP = (a) => JSON.stringify(a) === JSON.stringify(SP);

  /**
   * A kiválasztott időszak (a jövőbeli napok nélkül) és az összevetési időszak:
   * az előző ugyanolyan hosszú szakasz; folyó hétnél / hónapnál az előző hét / hónap azonos napjai.
   */
  function statRange() {
    const t = Store.todayYmd();
    let from; let to; let label; let prev; let prevLabel;
    if (SP.kind === 'days') {
      to = t; from = Store.shiftYmd(t, -(SP.n - 1)); label = `Utolsó ${SP.n} nap`;
    } else if (SP.kind === 'week') {
      from = SP.from; to = Store.shiftYmd(from, 6);
      const cw = Store.weekStart(t);
      label = from === cw ? 'Ez a hét' : from === Store.shiftYmd(cw, -7) ? 'Múlt hét' : 'Hét';
    } else if (SP.kind === 'month') {
      ({ from, to } = Store.monthRange(SP.month));
      label = SP.month === Store.monthOf(t) ? 'Ez a hónap' : UI.cap(UI.monthLabel(SP.month));
    } else { from = SP.from; to = SP.to; label = 'Egyedi időszak'; }
    if (from > t) from = t;
    const end = to > t ? t : to;
    const days = Store.daysBetween(from, end) + 1;
    if (SP.kind === 'week') {
      prev = { from: Store.shiftYmd(from, -7), to: Store.shiftYmd(end, -7) };
      prevLabel = end < to ? `előző hét ${UI.DAYS_SHORT[0]}–${UI.DAYS_SHORT[Store.dowOf(end) - 1]}` : 'előző hét';
    } else if (SP.kind === 'month') {
      const pm = Store.shiftMonth(SP.month, -1); const pr = Store.monthRange(pm);
      const last = Number(pr.to.slice(8));
      prev = { from: pr.from, to: end < to ? `${pm}-${Store.pad(Math.min(Number(end.slice(8)), last))}` : pr.to };
      prevLabel = end < to ? `${UI.MONTHS_SHORT[Number(pm.slice(5)) - 1]} 1–${Number(prev.to.slice(8))}.` : UI.MONTHS[Number(pm.slice(5)) - 1];
    } else {
      prev = { from: Store.shiftYmd(from, -days), to: Store.shiftYmd(from, -1) };
      prevLabel = `előző ${days} nap`;
    }
    return { from, to: end, end: to, days, label, range: from === end ? UI.dateShort(from) : `${UI.dateShort(from)} – ${UI.dateShort(end)}`, prev, prevLabel, partial: end < to, kind: SP.kind };
  }
  function setStatPeriod(next) { SP = next; rangeOpen(false); renderRange(); refresh(); }
  function stepStatPeriod(dir) {
    const r = statRange(); const t = Store.todayYmd();
    if (SP.kind === 'week') setStatPeriod({ kind: 'week', from: Store.shiftYmd(SP.from, 7 * dir) });
    else if (SP.kind === 'month') setStatPeriod({ kind: 'month', month: Store.shiftMonth(SP.month, dir) });
    else {
      let from = Store.shiftYmd(r.from, r.days * dir); let to = Store.shiftYmd(r.to, r.days * dir);
      if (to >= t) { to = t; from = Store.shiftYmd(t, -(r.days - 1)); }
      const n = [7, 30, 90].find((x) => x === r.days);
      setStatPeriod(to === t && n ? { kind: 'days', n } : { kind: 'range', from, to });
    }
  }
  function renderRange() {
    const box = shell && $('.ad-range', shell); if (!box) return;
    const r = statRange(); const t = Store.todayYmd();
    box.innerHTML = `
      <button class="icon-btn sm" data-rg-step="-1" aria-label="Előző időszak" title="Előző időszak">${I.prev}</button>
      <div class="rg">
        <button class="rg-btn" data-rg-open aria-haspopup="dialog" aria-expanded="false">${I.cal}<span><b>${esc(r.label)}</b><small>${esc(r.range)}</small></span>${X.caret}</button>
        <div class="rg-pop" role="dialog" aria-label="Időszak választása" hidden>
          ${PRESETS.map(([k, l, f], i) => `${i === 3 || i === 5 ? '<hr>' : ''}<button class="rg-opt ${sameSP(f()) ? 'on' : ''}" data-rg="${k}">${X.tick}<span>${l}</span></button>`).join('')}
          <div class="rg-custom">
            <small>Egyedi időszak</small>
            <div class="rg-dates"><input type="date" class="inp sm" data-rg-from value="${r.from}" max="${t}"><span>–</span><input type="date" class="inp sm" data-rg-to value="${r.to}" max="${t}"></div>
            <button class="btn dark sm" data-rg-apply>Alkalmaz</button>
          </div>
        </div>
      </div>
      <button class="icon-btn sm" data-rg-step="1" aria-label="Következő időszak" title="Következő időszak" ${r.end >= t ? 'disabled' : ''}>${I.next}</button>`;
  }
  function rangeOpen(on) {
    const pop = shell && $('.rg-pop', shell); if (!pop) return;
    pop.hidden = !on;
    const b = $('[data-rg-open]', shell); if (b) b.setAttribute('aria-expanded', String(on));
  }
  function initRange() {
    const box = $('.ad-range', shell);
    box.addEventListener('click', (e) => {
      const st = e.target.closest('[data-rg-step]'); if (st) { stepStatPeriod(Number(st.dataset.rgStep)); return; }
      if (e.target.closest('[data-rg-open]')) { rangeOpen($('.rg-pop', box).hidden); return; }
      const o = e.target.closest('[data-rg]'); if (o) { const p = PRESETS.find((x) => x[0] === o.dataset.rg); if (p) setStatPeriod(p[2]()); return; }
      if (e.target.closest('[data-rg-apply]')) {
        let from = $('[data-rg-from]', box).value; let to = $('[data-rg-to]', box).value;
        if (!from || !to) { UI.toast('Add meg mindkét dátumot'); return; }
        if (from > to) [from, to] = [to, from];
        setStatPeriod({ kind: 'range', from, to });
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shell && !$('.rg-pop', shell).hidden) rangeOpen(false); });
  }

  // ======================================================================
  window.Admin = {
    X, page(id, def) { pages[id] = def; }, actions, go(path) { location.hash = `#/${path}`; },
    drawer, table, kpi, sparkline, stackedColumns, lineChart, barList, shareBar, meter, heatmap, rampColor, tip, csv, who, whoLink, methodPill, payStatus, openInvoice,
    METHOD_SHORT, periodOf, periodPicker, statRange, refresh,
    get current() { return current; },
    start() {
      addEventListener('hashchange', route);
      Store.on(refresh);
      UI.makeNoise();
      route();
    },
  };
})();
