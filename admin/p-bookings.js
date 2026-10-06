/* ==========================================================================
   Admin – Foglalások listája + Állandó (heti) foglalások
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const TYPE_LABEL = { single: 'Egyszeri', regular: 'Állandó', training: 'Edzés', block: 'Lezárás' };

  // ======================================================================
  // FOGLALÁSOK
  // ======================================================================
  const f = { period: 'next14', custom: {}, type: 'customer', pay: '', source: '', q: '' };

  function collect() {
    const p = Admin.periodOf(f.period, f.custom);
    const rows = [];
    Store.eachDate(p.from, p.to, (d) => { Store.itemsOn(d).forEach((it) => rows.push(it)); });
    Store.bookings({ from: p.from, to: p.to, status: 'cancelled' }).forEach((b) => rows.push(Store.itemByKey(`b:${b.id}`)));
    return { p, rows };
  }

  function renderBookings(el) {
    const { p, rows: all } = collect();
    const q = Store.norm(f.q);
    const rows = all.filter((it) => {
      if (f.type === 'customer' && !(it.type === 'single' || it.type === 'regular')) return false;
      if (f.type && f.type !== 'customer' && it.type !== f.type) return false;
      if (f.pay === 'due' && (it.paid || it.status === 'cancelled' || !(it.type === 'single' || it.type === 'regular'))) return false;
      if (f.pay === 'paid' && (!it.paid || it.status === 'cancelled' || !(it.type === 'single' || it.type === 'regular'))) return false;
      if (f.pay === 'cx' && it.status !== 'cancelled') return false;
      if (f.pay !== 'cx' && f.pay && it.status === 'cancelled') return false;
      if (f.source && it.source !== f.source) return false;
      if (q) {
        const c = it.customerId ? Store.customer(it.customerId) : null; const co = it.coachId ? Store.coach(it.coachId) : null;
        if (![c && c.name, c && c.email, co && co.name, it.title, it.id.slice(-6)].some((x) => Store.norm(x).includes(q))) return false;
      }
      return true;
    });
    const live = rows.filter((r) => r.status !== 'cancelled');
    const total = live.reduce((a, r) => a + (r.price || 0), 0);
    const due = live.filter((r) => !r.paid).reduce((a, r) => a + (r.price || 0), 0);
    const web = live.filter((r) => r.source === 'web').length;

    el.innerHTML = `
      <div class="toolbar">
        ${Admin.periodPicker(f.period, [['today', 'Ma'], ['week', 'Ez a hét'], ['next14', 'Köv. 14 nap'], ['30', 'Utolsó 30 nap'], ['month', 'Ez a hónap'], ['custom', 'Egyedi']], f.custom)}
      </div>
      <div class="toolbar">
        <label class="search">${I.search}<input id="bk-q" type="search" placeholder="Név, e-mail, foglalási kód…" value="${esc(f.q)}"></label>
        <select class="inp sm" data-f="type"><option value="customer" ${f.type === 'customer' ? 'selected' : ''}>Ügyfélfoglalások</option><option value="single" ${f.type === 'single' ? 'selected' : ''}>Csak egyszeri</option><option value="regular" ${f.type === 'regular' ? 'selected' : ''}>Csak állandó</option><option value="training" ${f.type === 'training' ? 'selected' : ''}>Edzések</option><option value="block" ${f.type === 'block' ? 'selected' : ''}>Lezárások</option><option value="" ${!f.type ? 'selected' : ''}>Minden bejegyzés</option></select>
        <select class="inp sm" data-f="pay"><option value="">Minden állapot</option><option value="due" ${f.pay === 'due' ? 'selected' : ''}>Fizetésre vár</option><option value="paid" ${f.pay === 'paid' ? 'selected' : ''}>Fizetve</option><option value="cx" ${f.pay === 'cx' ? 'selected' : ''}>Lemondva</option></select>
        <select class="inp sm" data-f="source"><option value="">Minden forrás</option><option value="web" ${f.source === 'web' ? 'selected' : ''}>Weboldal</option><option value="admin" ${f.source === 'admin' ? 'selected' : ''}>Admin / telefon</option></select>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="csv">${I.download}CSV</button>
        <button class="btn dark sm" data-act="new">${I.plus}Foglalás</button>
      </div>
      <div class="sumbar"><span><b>${live.length}</b> foglalás</span><span><b>${money(total)}</b> érték</span><span><b class="${due ? 'warn-t' : ''}">${money(due)}</b> fizetésre vár</span><span><b>${web}</b> online</span><span class="muted">${esc(p.label)} · ${esc(UI.dateShort(p.from))} – ${esc(UI.dateShort(p.to))}</span></div>
      <div class="js-t"></div>`;

    Admin.table($('.js-t', el), {
      rows,
      rowKey: (r) => r.key,
      sort: { key: 'date', dir: 1 },
      rowCls: (r) => (r.status === 'cancelled' ? 'is-cx' : ''),
      onRow: (r) => Admin.actions.openItem(r.key),
      cols: [
        { key: 'date', label: 'Dátum', sort: (r) => r.date + r.start, render: (r) => `<b>${esc(UI.dateShort(r.date))}</b><span class="t-sub">${esc(UI.DAYS[Store.dowOf(r.date) - 1])}</span>` },
        { key: 'start', label: 'Idő', cls: 'num', render: (r) => `${r.start}–${r.end}` },
        { key: 'court', label: 'Pálya', sort: (r) => r.courtId, render: (r) => esc((Store.court(r.courtId) || {}).name || '') },
        { key: 'who', label: 'Ki', sort: (r) => whoName(r), render: (r) => whoCell(r) },
        { key: 'type', label: 'Típus', sort: (r) => r.type, render: (r) => `<span class="tdot ty-${r.type}"></span>${TYPE_LABEL[r.type]}` },
        { key: 'price', label: 'Ár', align: 'r', cls: 'num', sort: (r) => r.price, render: (r) => (r.price ? money(r.price) : '<span class="dim">—</span>') },
        { key: 'status', label: 'Fizetés', sort: (r) => (r.status === 'cancelled' ? 3 : r.paid ? 1 : 2), render: (r) => Admin.payStatus(r) },
        { key: 'source', label: 'Forrás', render: (r) => (r.source === 'web' ? '<span class="chip-s">Web</span>' : '<span class="chip-s dim">Admin</span>') },
        { key: 'code', label: 'Kód', cls: 'num dim', render: (r) => (r.src === 'booking' ? esc(r.id.slice(-6).toUpperCase()) : '<span title="heti sorozat">↻</span>') },
      ],
      empty: 'Ebben az időszakban nincs a szűrésnek megfelelő foglalás.',
    });

    bindFilters(el, f, () => renderBookings(el));
    el.querySelector('[data-act="new"]').addEventListener('click', () => Admin.actions.newBooking());
    el.querySelector('[data-act="csv"]').addEventListener('click', () => Admin.csv(`foglalasok-${p.from}_${p.to}.csv`, [
      { label: 'Dátum', get: (r) => r.date }, { label: 'Kezdés', get: (r) => r.start }, { label: 'Vége', get: (r) => r.end },
      { label: 'Pálya', get: (r) => (Store.court(r.courtId) || {}).name }, { label: 'Ki', get: whoName }, { label: 'Típus', get: (r) => TYPE_LABEL[r.type] },
      { label: 'Ár (Ft)', get: (r) => r.price || 0 }, { label: 'Állapot', get: (r) => (r.status === 'cancelled' ? 'Lemondva' : r.paid ? 'Fizetve' : 'Fizetendő') },
      { label: 'Forrás', get: (r) => (r.source === 'web' ? 'Weboldal' : 'Admin') }, { label: 'Kód', get: (r) => (r.src === 'booking' ? r.id.slice(-6).toUpperCase() : '') },
    ], rows));
  }
  function whoName(r) {
    if (r.customerId) { const c = Store.customer(r.customerId); return c ? c.name : ''; }
    if (r.coachId) { const c = Store.coach(r.coachId); return `${c ? c.name : ''} · ${r.title}`; }
    return r.title || '';
  }
  function whoCell(r) {
    if (r.customerId) { const c = Store.customer(r.customerId); return c ? `<button class="lnk" data-open="customer:${c.id}">${esc(c.name)}</button>` : ''; }
    if (r.coachId) { const c = Store.coach(r.coachId); return `${esc(c ? c.name : '')}<span class="t-sub">${esc(r.title)}</span>`; }
    return `<span class="dim">${esc(r.title || '')}</span>`;
  }

  /** Közös szűrő-kötés: időszak-gombok, select-ek, keresőmező. */
  function bindFilters(el, st, rerender) {
    el.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
      st.period = b.dataset.period;
      if (st.period === 'custom' && !st.custom.from) { const p = Admin.periodOf('30'); st.custom = { from: p.from, to: p.to }; }
      rerender();
    }));
    const pf = el.querySelector('[data-pfrom]'); const pt = el.querySelector('[data-pto]');
    if (pf) pf.addEventListener('change', () => { st.custom.from = pf.value; rerender(); });
    if (pt) pt.addEventListener('change', () => { st.custom.to = pt.value; rerender(); });
    el.querySelectorAll('select[data-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; rerender(); }));
    const q = el.querySelector('input[type="search"][id]');
    if (q) { let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; rerender(); const n = document.getElementById(q.id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); }); }
  }
  Admin.bindFilters = bindFilters;

  Admin.page('foglalasok', {
    title: 'Foglalások',
    sub: 'Egyszeri és állandó pályafoglalások, edzések és lezárások – szűrés, fizetési állapot, export',
    render: renderBookings,
  });

  // ======================================================================
  // ÁLLANDÓ FOGLALÁSOK
  // ======================================================================
  const sf = { tab: 'regular', month: null, q: '' };
  function renderSeries(el) {
    if (!sf.month) sf.month = Store.monthOf(Store.todayYmd());
    const mr = Store.monthRange(sf.month);
    const today = Store.todayYmd();
    const q = Store.norm(sf.q);
    const list = Store.series(sf.tab).filter((s) => (!s.to || s.to >= Store.shiftYmd(today, -60)))
      .filter((s) => { if (!q) return true; const c = s.customerId ? Store.customer(s.customerId) : null; const co = s.coachId ? Store.coach(s.coachId) : null; return [c && c.name, co && co.name, s.title].some((x) => Store.norm(x).includes(q)); });
    const rows = list.map((s) => {
      const dates = Store.seriesDates(s, mr.from, mr.to);
      const unpaid = dates.filter((d) => !(s.paid || {})[d]);
      return { ...s, n: dates.length, unpaidN: unpaid.length, due: unpaid.length * (s.price || 0), monthTotal: dates.length * (s.price || 0) };
    });
    const counts = { regular: Store.series('regular').length, training: Store.series('training').length, block: Store.series('block').length };
    const dueTotal = rows.reduce((a, r) => a + r.due, 0);

    el.innerHTML = `
      <div class="toolbar">
        <div class="seg-ctl">${[['regular', 'Ügyfelek'], ['training', 'Edzésblokkok'], ['block', 'Lezárások']].map(([k, l]) => `<button data-tab="${k}" class="${sf.tab === k ? 'on' : ''}">${l} · ${counts[k]}</button>`).join('')}</div>
        <label class="search">${I.search}<input id="ser-q" type="search" placeholder="Keresés…" value="${esc(sf.q)}"></label>
        <span class="grow"></span>
        <div class="month-nav"><button class="icon-btn sm" data-m="-1">${I.prev}</button><b>${esc(UI.monthLabel(sf.month))}</b><button class="icon-btn sm" data-m="1">${I.next}</button></div>
        <button class="btn dark sm" data-act="new">${I.plus}Új heti sorozat</button>
      </div>
      ${sf.tab === 'regular' ? `<div class="sumbar"><span><b>${rows.length}</b> állandó ügyfél-időpont</span><span><b>${money(rows.reduce((a, r) => a + r.monthTotal, 0))}</b> havi érték</span><span><b class="${dueTotal ? 'warn-t' : ''}">${money(dueTotal)}</b> még fizetendő (${esc(UI.monthLabel(sf.month))})</span></div>` : ''}
      ${sf.tab === 'training' ? `<div class="note info" style="margin-bottom:14px">${I.layers}<span>Az edzésblokkok a <b>pályafoglalási naptárban</b> foglalják le a pályákat (edzők, magánórák). A gyerekek jelenléte ettől függetlenül, az <a class="lnk" href="#/orarend">Órarendben</a> megadott idősávok szerint működik.</span></div>` : ''}
      <div class="js-t"></div>`;

    const cols = [
      { key: 'day', label: 'Nap', sort: (r) => r.day * 10000 + Store.toMin(r.start), render: (r) => `<b>${esc(UI.cap(UI.DAYS[r.day - 1]))}</b>` },
      { key: 'start', label: 'Idő', cls: 'num', render: (r) => `${r.start}–${r.end}` },
      { key: 'court', label: 'Pálya', sort: (r) => r.courtId, render: (r) => esc((Store.court(r.courtId) || {}).name || '') },
      { key: 'who', label: sf.tab === 'regular' ? 'Ügyfél' : sf.tab === 'training' ? 'Edző' : 'Megnevezés', sort: (r) => whoName(r), render: (r) => whoCell(r) },
      { key: 'period', label: 'Időszak', render: (r) => `<span class="nowrap">${esc(UI.dateShort(r.from))} – ${esc(r.to ? UI.dateShort(r.to) : '…')}</span>${r.to && r.to < today ? '<span class="t-sub">lezárult</span>' : ''}` },
    ];
    if (sf.tab === 'regular') {
      cols.push(
        { key: 'price', label: 'Ár / alkalom', align: 'r', cls: 'num', sort: (r) => r.price, render: (r) => money(r.price) },
        { key: 'n', label: 'Alkalom', align: 'r', cls: 'num', render: (r) => `${r.n}` },
        { key: 'due', label: 'Havi állapot', sort: (r) => r.due, render: (r) => (!r.n ? '<span class="dim">—</span>' : r.unpaidN ? `<span class="pill warn">${money(r.due)} fizetendő</span>` : `<span class="pill ok">${I.check}Rendezve</span>`) },
        { key: 'act', label: '', align: 'r', render: (r) => (r.unpaidN ? `<button class="btn sm soft" data-pay="${r.id}">${I.cash}Havi díj</button>` : '') },
      );
    } else cols.push({ key: 'n', label: `Alkalom (${UI.MONTHS_SHORT[Number(sf.month.slice(5)) - 1]})`, align: 'r', cls: 'num', render: (r) => `${r.n}` });

    Admin.table($('.js-t', el), { rows, cols, sort: { key: 'day', dir: 1 }, onRow: (r) => Admin.actions.editSeries(r.id), empty: 'Nincs ilyen heti sorozat.' });

    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { sf.tab = b.dataset.tab; renderSeries(el); }));
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { sf.month = Store.shiftMonth(sf.month, Number(b.dataset.m)); renderSeries(el); }));
    el.querySelector('[data-act="new"]').addEventListener('click', () => Admin.actions.newBooking({ repeat: 'weekly', kind: sf.tab === 'regular' ? 'customer' : sf.tab }));
    bindFilters(el, sf, () => renderSeries(el));
    el.querySelector('.js-t').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pay]'); if (!b) return;
      e.stopPropagation();
      const m = await Admin.actions.pickMethod(`${UI.monthLabel(sf.month)} – havi díj fizetési módja`);
      if (!m) return;
      const p = Store.paySeriesMonth(b.dataset.pay, sf.month, m);
      if (p) UI.toast(`Rögzítve: ${money(p.amount)} · számla kiállítva`);
    }, true);
  }

  Admin.page('allando', {
    title: 'Állandó foglalások',
    sub: 'Heti ismétlődő pályabérlések, edzésblokkok és lezárások – havi díjak rögzítése',
    render: renderSeries,
  });
})();
