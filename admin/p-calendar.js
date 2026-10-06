/* ==========================================================================
   Admin – Foglalási naptár + foglalás / sorozat szerkesztő panelek
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const SLOT = 30; // perc
  const PX = 26; // px / 30 perc
  const TYPE_LABEL = { single: 'Egyszeri', regular: 'Állandó', training: 'Edzés', block: 'Lezárás' };
  const PAY_OPTS = [['pos', 'POS kártya'], ['cash', 'Készpénz'], ['szep', 'SZÉP-kártya'], ['transfer', 'Átutalás'], ['card', 'Online kártya']];
  const times = (from, to, step = SLOT) => { const out = []; for (let m = Store.toMin(from); m <= Store.toMin(to); m += step) out.push(Store.fromMin(m)); return out; };

  let view = { mode: 'day', date: null, court: null };

  // ======================================================================
  // NAPTÁR OLDAL
  // ======================================================================
  function render(el, r) {
    const s = Store.settings();
    if (r && r.q && r.q.d) view.date = r.q.d;
    if (!view.date) view.date = Store.todayYmd();
    const courts = Store.activeCourts();
    if (!view.court || !courts.find((c) => c.id === view.court)) view.court = courts[0] && courts[0].id;
    const open = Store.toMin(s.open); const close = Store.toMin(s.close);
    const H = ((close - open) / SLOT) * PX;
    const d = view.date;
    const monday = Store.shiftYmd(d, -(Store.dowOf(d) - 1));
    const cols = view.mode === 'day'
      ? courts.map((c) => ({ key: c.id, courtId: c.id, date: d, head: `${Court.mini(c)}<span><b>${esc(c.name)}</b><small>${occPct(c.id, d)}% foglalt</small></span>` }))
      : Array.from({ length: 7 }, (_, i) => { const dd = Store.shiftYmd(monday, i); return { key: dd, courtId: view.court, date: dd, head: `<span class="wd ${dd === Store.todayYmd() ? 'is-today' : ''}"><small>${UI.DAYS_SHORT[i]}</small><b>${Number(dd.slice(8))}</b></span><span><small>${occPct(view.court, dd)}% foglalt</small></span>` }; });
    const title = view.mode === 'day' ? UI.cap(UI.dateLong(d)) : `${UI.dateShort(monday)} – ${UI.dateShort(Store.shiftYmd(monday, 6))}`;

    el.innerHTML = `
      <div class="toolbar cal-tb">
        <div class="cal-nav">
          <button class="icon-btn sm" data-nav="-1" aria-label="Előző">${I.prev}</button>
          <button class="btn sm ghost" data-nav="0">Ma</button>
          <button class="icon-btn sm" data-nav="1" aria-label="Következő">${I.next}</button>
          <h2 class="cal-title">${esc(title)}</h2>
          <input type="date" class="inp sm" id="cal-date" value="${d}">
        </div>
        <span class="grow"></span>
        <div class="seg-ctl"><button data-mode="day" class="${view.mode === 'day' ? 'on' : ''}">Nap</button><button data-mode="week" class="${view.mode === 'week' ? 'on' : ''}">Hét</button></div>
        ${view.mode === 'week' ? `<select class="inp sm" id="cal-court">${courts.map((c) => `<option value="${c.id}" ${c.id === view.court ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
        <button class="btn dark sm" data-act="new">${I.plus}Foglalás</button>
      </div>
      <div class="cal-legend legend"><span><i class="ty-single"></i>Egyszeri · fizetve</span><span><i class="ty-single unpaid"></i>Fizetésre vár</span><span><i class="ty-regular"></i>Állandó</span><span><i class="ty-training"></i>Edzés / magánóra</span><span><i class="ty-block"></i>Lezárás</span></div>
      <div class="cal card ${Store.isClosed(d) && view.mode === 'day' ? 'is-closed' : ''}" style="--cols:${cols.length}">
        <div class="cal-head"><span></span>${cols.map((c) => `<div class="ch">${c.head}</div>`).join('')}</div>
        <div class="cal-body" style="height:${H}px">
          <div class="cal-times">${times(s.open, Store.fromMin(close - 60), 60).map((t) => `<span style="top:${((Store.toMin(t) - open) / SLOT) * PX}px">${t}</span>`).join('')}</div>
          ${cols.map((c) => colHtml(c, open, close)).join('')}
        </div>
      </div>`;

    // események
    el.querySelector('.cal-tb').addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav], [data-mode], [data-act]'); if (!b) return;
      if (b.dataset.nav) { const n = Number(b.dataset.nav); view.date = n === 0 ? Store.todayYmd() : Store.shiftYmd(view.date, n * (view.mode === 'week' ? 7 : 1)); go(); }
      if (b.dataset.mode) { view.mode = b.dataset.mode; go(); }
      if (b.dataset.act === 'new') newBooking({ date: view.date, courtId: view.mode === 'week' ? view.court : undefined });
    });
    $('#cal-date', el).addEventListener('change', (e) => { if (e.target.value) { view.date = e.target.value; go(); } });
    const cc = $('#cal-court', el); if (cc) cc.addEventListener('change', () => { view.court = cc.value; go(); });
    $('.cal-body', el).addEventListener('click', (e) => {
      const it = e.target.closest('[data-key]');
      if (it) { openItem(it.dataset.key); return; }
      const col = e.target.closest('.cal-col'); if (!col || col.classList.contains('closed')) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const m = open + Math.floor(y / PX) * SLOT;
      const start = Store.fromMin(Math.min(m, close - 60));
      newBooking({ courtId: col.dataset.court, date: col.dataset.date, start, end: Store.fromMin(Math.min(close, Store.toMin(start) + 60)) });
    });
    // mostani idő vonal görgetése
    const now = $('.cal-now', el);
    if (now && !render.scrolled) { render.scrolled = true; setTimeout(() => now.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); }
  }
  function go() { const q = `naptar?d=${view.date}`; if (location.hash !== `#/${q}`) location.hash = `#/${q}`; else Admin.refresh(); }

  function occPct(courtId, date) {
    const s = Store.settings();
    const tot = Store.toMin(s.close) - Store.toMin(s.open);
    const b = Store.itemsOn(date).filter((it) => it.courtId === courtId).reduce((a, it) => a + Store.toMin(it.end) - Store.toMin(it.start), 0);
    return Math.round((b / tot) * 100);
  }

  function colHtml(c, open, close) {
    const closed = Store.isClosed(c.date);
    const items = closed ? [] : Store.itemsOn(c.date).filter((it) => it.courtId === c.courtId);
    const today = Store.todayYmd();
    const nm = Store.nowMin();
    return `<div class="cal-col ${closed ? 'closed' : ''} ${c.date < today ? 'past' : ''}" data-court="${c.courtId}" data-date="${c.date}">
      ${closed ? '<span class="cal-closed">Ünnepnap – zárva</span>' : ''}
      ${items.map((it) => {
        const top = ((Store.toMin(it.start) - open) / SLOT) * PX; const h = ((Store.toMin(it.end) - Store.toMin(it.start)) / SLOT) * PX;
        const cu = it.customerId ? Store.customer(it.customerId) : null; const co = it.coachId ? Store.coach(it.coachId) : null;
        const name = it.type === 'training' ? `${co ? co.short : ''} · ${it.title}` : it.type === 'block' ? it.title : (cu ? cu.name : 'Vendég');
        const ic = it.type === 'single' && it.passId ? I.ticket : it.src === 'series' ? I.redo : '';
        return `<button class="ci ty-${it.type} ${(it.type === 'single' || it.type === 'regular') && !it.paid ? 'unpaid' : ''} ${h < 40 ? 'short' : ''}" style="top:${top + 1}px;height:${h - 2}px;${co ? `--cc:${co.color}` : ''}" data-key="${esc(it.key)}">
          <span class="ci-t">${it.start}–${it.end}${ic ? `<i>${ic}</i>` : ''}</span><b>${esc(name)}</b>
          ${it.price ? `<span class="ci-p">${money(it.price)}${(it.type === 'single' || it.type === 'regular') && !it.paid ? ' · fizetendő' : ''}</span>` : ''}
        </button>`;
      }).join('')}
      ${c.date === today && nm > open && nm < close ? `<i class="cal-now" style="top:${((nm - open) / SLOT) * PX}px"></i>` : ''}
    </div>`;
  }

  Admin.page('naptar', {
    title: 'Foglalási naptár',
    sub: () => `${Store.activeCourts().length} pálya · ${Store.settings().open}–${Store.settings().close} · kattints egy üres sávra új foglaláshoz`,
    render,
  });

  // ======================================================================
  // ÜGYFÉLVÁLASZTÓ (keresés + új ügyfél)
  // ======================================================================
  function customerPicker(host, { value = null, onChange = () => {} } = {}) {
    let sel = value; let newMode = false;
    function draw() {
      const c = sel && Store.customer(sel);
      if (c) {
        host.innerHTML = `<div class="cp-sel">${UI.avatar(c)}<span><b>${esc(c.name)}</b><small>${esc(c.email || '')} ${esc(c.phone || '')}</small></span><button type="button" class="icon-btn ghost sm" data-cp="clear" aria-label="Másik ügyfél">${I.x}</button></div>`;
        return;
      }
      if (newMode) {
        host.innerHTML = `<div class="cp-new">
          <div class="fld-row"><label class="fld"><span>Név</span><input data-cn="name" required></label><label class="fld"><span>Telefon</span><input data-cn="phone"></label></div>
          <label class="fld"><span>E-mail</span><input data-cn="email" type="email"></label>
          <div class="cp-row"><button type="button" class="link-s" data-cp="cancel-new">Mégse</button><button type="button" class="btn sm dark" data-cp="create">Ügyfél létrehozása</button></div></div>`;
        return;
      }
      host.innerHTML = `<div class="cp"><label class="search">${I.search}<input type="search" data-cp-q placeholder="Ügyfél keresése (név, e-mail, telefon)" autocomplete="off"></label><div class="cp-list"></div></div>`;
      list('');
      const q = $('[data-cp-q]', host);
      q.addEventListener('input', () => list(q.value));
    }
    function list(qs) {
      const q = Store.norm(qs);
      const res = Store.customers().filter((c) => !q || [c.name, c.email, c.phone].some((x) => Store.norm(x).includes(q))).slice(0, 7);
      $('.cp-list', host).innerHTML = res.map((c) => `<button type="button" data-cp-pick="${c.id}">${UI.avatar(c)}<span><b>${esc(c.name)}</b><small>${esc(c.email)}</small></span></button>`).join('')
        + `<button type="button" class="cp-add" data-cp="new">${I.plus}<span><b>Új ügyfél${qs ? `: „${esc(qs)}”` : ''}</b><small>telefonos / helyszíni foglaláshoz</small></span></button>`;
    }
    host.addEventListener('click', (e) => {
      const p = e.target.closest('[data-cp-pick]');
      if (p) { sel = p.dataset.cpPick; draw(); onChange(sel); return; }
      const b = e.target.closest('[data-cp]'); if (!b) return;
      const a = b.dataset.cp;
      if (a === 'clear') { sel = null; draw(); onChange(null); }
      if (a === 'new') { const q = $('[data-cp-q]', host); const pre = q ? q.value : ''; newMode = true; draw(); if (pre) $('[data-cn="name"]', host).value = pre; $('[data-cn="name"]', host).focus(); }
      if (a === 'cancel-new') { newMode = false; draw(); }
      if (a === 'create') {
        const name = $('[data-cn="name"]', host).value.trim();
        if (name.length < 2) { UI.toast('Add meg az ügyfél nevét'); return; }
        try {
          sel = Store.upsertCustomer({ name, phone: $('[data-cn="phone"]', host).value.trim(), email: $('[data-cn="email"]', host).value.trim() });
          newMode = false; draw(); onChange(sel); UI.toast('Ügyfél létrehozva');
        } catch (err) { UI.toast(err.message); }
      }
    });
    draw();
    return { get value() { return sel; } };
  }

  // ======================================================================
  // ÚJ FOGLALÁS / SOROZAT
  // ======================================================================
  function newBooking(pre = {}) {
    const s = Store.settings();
    const courts = Store.activeCourts();
    const st = {
      kind: pre.kind || 'customer', // customer | training | block
      repeat: pre.repeat || 'once', // once | weekly
      courtId: pre.courtId || (courts[0] && courts[0].id),
      date: pre.date || Store.todayYmd(),
      start: pre.start || '17:00',
      end: pre.end || Store.fromMin(Store.toMin(pre.start || '17:00') + 60),
      to: pre.to || '',
      customerId: pre.customerId || null,
      coachId: pre.coachId || (Store.coaches()[0] || {}).id,
      title: pre.title || '',
      priceOverride: null,
      payNow: '',
      note: '',
    };
    const seasonEnd = () => { const y = Number(st.date.slice(0, 4)); const m = Number(st.date.slice(5, 7)); return `${m >= 6 ? y + 1 : y}-05-31`; };
    if (!st.to) st.to = seasonEnd();
    const allTimes = times(s.open, s.close);
    let picker;

    const sh = Admin.drawer({
      title: 'Új foglalás',
      sub: 'Egyszeri vagy heti ismétlődő · ügyfél, edzés vagy lezárás',
      body: '<form class="bk-form" autocomplete="off"></form>',
      footer: '<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>',
    });
    const f = $('.bk-form', sh.el);

    function price() {
      if (st.kind !== 'customer') return 0;
      if (st.priceOverride != null) return st.priceOverride;
      return Store.priceFor(st.date, st.start, st.end);
    }
    function conflicts() {
      if (Store.toMin(st.end) <= Store.toMin(st.start)) return { bad: 'A befejezés legyen a kezdés után.' };
      if (st.repeat === 'once') {
        if (Store.isClosed(st.date)) return { bad: 'Ezen a napon zárva tartunk (ünnepnap).' };
        const c = Store.conflictsAt(st.courtId, st.date, st.start, st.end);
        return c.length ? { list: c.map((it) => ({ date: st.date, it })) } : null;
      }
      const tmp = { id: '__new', courtId: st.courtId, day: Store.dowOf(st.date), start: st.start, end: st.end, from: st.date, to: st.to, skip: [] };
      const c = Store.seriesConflicts(tmp);
      return c.length ? { list: c.flatMap((x) => x.items.map((it) => ({ date: x.date, it }))), dates: c.map((x) => x.date) } : null;
    }
    function itemLabel(it) {
      const cu = it.customerId ? Store.customer(it.customerId) : null; const co = it.coachId ? Store.coach(it.coachId) : null;
      return `${it.start}–${it.end} · ${it.type === 'training' ? `${it.title} (${co ? co.name : ''})` : it.type === 'block' ? it.title : (cu ? cu.name : '')}`;
    }

    function draw() {
      const cf = conflicts();
      const p = price();
      const occ = st.repeat === 'weekly' ? Store.seriesDates({ day: Store.dowOf(st.date), from: st.date, to: st.to, skip: [] }, st.date, st.to).length : 1;
      f.innerHTML = `
        <div class="seg-ctl wide">${[['customer', 'Ügyfél foglal'], ['training', 'Edzés / magánóra'], ['block', 'Pálya lezárása']].map(([k, l]) => `<button type="button" data-kind="${k}" class="${st.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>

        ${st.kind === 'customer' ? '<div class="fld"><span>Ügyfél</span><div class="js-cp"></div></div>' : ''}
        ${st.kind === 'training' ? `<div class="fld-row"><label class="fld"><span>Edző</span><select data-f="coachId">${Store.coaches().map((c) => `<option value="${c.id}" ${c.id === st.coachId ? 'selected' : ''}>${esc(c.name)} (${esc(c.short || '')})</option>`).join('')}</select></label>
          <label class="fld"><span>Megnevezés</span><input data-f="title" list="tr-titles" value="${esc(st.title || 'Magánóra')}"><datalist id="tr-titles"><option>Magánóra</option>${Store.programs().map((pg) => `<option>${esc(pg.name)}</option>`).join('')}</datalist></label></div>` : ''}
        ${st.kind === 'block' ? `<label class="fld"><span>Ok / megnevezés</span><input data-f="title" list="bl-titles" value="${esc(st.title || 'Pályakarbantartás')}"><datalist id="bl-titles"><option>Pályakarbantartás</option><option>Verseny</option><option>Rendezvény</option><option>Csapatépítő</option></datalist></label>` : ''}

        <div class="fld"><span>Pálya</span><div class="court-pick">${courts.map((c) => `<label><input type="radio" name="court" value="${c.id}" ${c.id === st.courtId ? 'checked' : ''}><span>${Court.mini(c)}<b>${esc(c.name)}</b></span></label>`).join('')}</div></div>
        <div class="fld-row three">
          <label class="fld"><span>${st.repeat === 'weekly' ? 'Első alkalom' : 'Nap'}</span><input type="date" data-f="date" value="${st.date}"></label>
          <label class="fld"><span>Kezdés</span><select data-f="start">${allTimes.slice(0, -1).map((t) => `<option ${t === st.start ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="fld"><span>Befejezés</span><select data-f="end">${allTimes.slice(1).map((t) => `<option ${t === st.end ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
        <div class="fld"><span>Ismétlődés</span><div class="seg-ctl wide">${[['once', 'Egyszeri'], ['weekly', `Hetente (${UI.DAYS[Store.dowOf(st.date) - 1]})`]].map(([k, l]) => `<button type="button" data-repeat="${k}" class="${st.repeat === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${st.repeat === 'weekly' ? `<div class="fld-row"><label class="fld"><span>Utolsó alkalom legkésőbb</span><input type="date" data-f="to" value="${st.to}"></label><div class="fld"><span>Alkalmak</span><div class="ro">${occ} alkalom</div></div></div>` : ''}

        ${st.kind === 'customer' ? `<div class="fld-row">
          <label class="fld"><span>Ár ${st.repeat === 'weekly' ? '/ alkalom' : ''} <b>${st.priceOverride == null ? 'árlista szerint' : 'egyedi'}</b></span><input type="number" min="0" step="500" data-f="price" value="${p}"></label>
          ${st.repeat === 'once' ? `<label class="fld"><span>Fizetés</span><select data-f="payNow"><option value="">Később / helyszínen</option>${PAY_OPTS.map(([k, l]) => `<option value="${k}" ${st.payNow === k ? 'selected' : ''}>Most fizetve – ${l}</option>`).join('')}</select></label>` : `<div class="fld"><span>Összesen</span><div class="ro mono">${money(p * occ)}</div></div>`}
        </div>` : ''}
        <label class="fld"><span>Megjegyzés</span><input data-f="note" value="${esc(st.note)}" placeholder="pl. telefonon foglalt, ütőt kér"></label>

        ${cf ? (cf.bad ? `<div class="conflict">${I.warn}<span>${esc(cf.bad)}</span></div>` : `<div class="conflict">${I.warn}<span><b>${st.repeat === 'weekly' ? `${cf.dates.length} alkalom ütközik` : 'Ütközés'}</b><br>${cf.list.slice(0, 4).map((x) => `${esc(UI.dateShort(x.date))} ${esc(itemLabel(x.it))}`).join('<br>')}${cf.list.length > 4 ? `<br>… és még ${cf.list.length - 4}` : ''}${st.repeat === 'weekly' ? '<br><small>Mentéskor az ütköző alkalmak kimaradnak.</small>' : ''}</span></div>`) : ''}`;
      if (st.kind === 'customer') picker = customerPicker($('.js-cp', f), { value: st.customerId, onChange: (v) => { st.customerId = v; } });
    }

    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind], [data-repeat]'); if (!b) return;
      if (b.dataset.kind) { st.kind = b.dataset.kind; st.title = ''; }
      if (b.dataset.repeat) st.repeat = b.dataset.repeat;
      draw();
    });
    f.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'court') st.courtId = t.value;
      const k = t.dataset.f; if (!k) return;
      if (k === 'price') { st.priceOverride = Number(t.value) || 0; draw(); return; }
      st[k] = t.value;
      if (k === 'start' && Store.toMin(st.end) <= Store.toMin(st.start)) st.end = Store.fromMin(Store.toMin(st.start) + 60);
      if (['date', 'start', 'end', 'to', 'payNow'].includes(k) || t.name === 'court') { if (k !== 'payNow') st.priceOverride = st.priceOverride; draw(); }
    });
    f.addEventListener('input', (e) => { const k = e.target.dataset.f; if (k === 'title' || k === 'note') st[k] = e.target.value; });
    f.addEventListener('submit', (e) => e.preventDefault());
    draw();

    $('.js-save', sh.el).addEventListener('click', () => {
      try {
        if (st.kind === 'customer' && !st.customerId) { UI.toast('Válassz ügyfelet (vagy hozz létre újat)'); return; }
        const cf = conflicts();
        if (cf && cf.bad) { UI.toast(cf.bad); return; }
        if (st.repeat === 'once') {
          if (cf) { UI.toast('Az időpont ütközik egy másik foglalással'); return; }
          const type = st.kind === 'customer' ? 'single' : st.kind;
          const b = Store.createBooking({
            type, courtId: st.courtId, date: st.date, start: st.start, end: st.end, customerId: st.kind === 'customer' ? st.customerId : null,
            coachId: st.kind === 'training' ? st.coachId : null, title: st.kind === 'customer' ? '' : (st.title || (st.kind === 'training' ? 'Magánóra' : 'Lezárva')),
            price: st.kind === 'customer' ? price() : 0, note: st.note, source: 'admin', payMethod: st.kind === 'customer' ? 'onsite' : '',
          });
          if (st.kind === 'customer' && st.payNow && b.price > 0) Store.markBookingPaid(b.id, st.payNow);
          UI.toast('Foglalás rögzítve');
        } else {
          const type = st.kind === 'customer' ? 'regular' : st.kind;
          let to = st.to;
          const id = Store.upsertSeries({
            type, courtId: st.courtId, day: Store.dowOf(st.date), start: st.start, end: st.end, from: st.date, to,
            customerId: st.kind === 'customer' ? st.customerId : null, coachId: st.kind === 'training' ? st.coachId : null,
            title: st.kind === 'customer' ? '' : (st.title || (st.kind === 'training' ? 'Magánóra' : 'Lezárva')), price: st.kind === 'customer' ? price() : 0, note: st.note,
          });
          if (cf && cf.dates) cf.dates.forEach((dd) => Store.skipSeriesDate(id, dd, true));
          UI.toast(`Heti sorozat rögzítve${cf && cf.dates ? ` (${cf.dates.length} ütköző alkalom kihagyva)` : ''}`);
        }
        sh.close();
      } catch (err) { UI.toast(err.message); }
    });
  }

  // ======================================================================
  // FOGLALÁS / ALKALOM RÉSZLETEI
  // ======================================================================
  function openItem(key) {
    const it = Store.itemByKey(key);
    if (!it) { UI.toast('A foglalás már nem létezik'); return; }
    const court = Store.court(it.courtId);
    const cu = it.customerId ? Store.customer(it.customerId) : null;
    const co = it.coachId ? Store.coach(it.coachId) : null;
    const b = it.src === 'booking' ? Store.booking(it.id) : null;
    const ser = it.seriesId ? Store.seriesById(it.seriesId) : null;
    const pay = it.paymentId ? Store.payment(it.paymentId) : null;
    const inv = pay && pay.invoiceId ? Store.invoice(pay.invoiceId) : null;
    const ps = b && b.passId ? Store.pass(b.passId) : null;
    const cancelled = b && b.status === 'cancelled';
    const canPay = (it.type === 'single' || it.type === 'regular') && !it.paid && it.price > 0 && !cancelled;
    const month = Store.monthOf(it.date);
    let monthDue = 0;
    if (ser && ser.type === 'regular') { const mr = Store.monthRange(month); monthDue = Store.seriesDates(ser, mr.from, mr.to).filter((x) => !(ser.paid || {})[x]).length; }

    const title = { single: 'Foglalás', regular: 'Állandó foglalás – alkalom', training: it.src === 'series' ? 'Edzésblokk – alkalom' : 'Edzés / magánóra', block: 'Pálya lezárva' }[it.type];
    const sh = Admin.drawer({
      title,
      sub: `${esc(UI.cap(UI.dateLong(it.date)))} · ${it.start}–${it.end} · ${esc(court ? court.name : '')}${b ? ` · kód: <b class="mono">${esc(b.id.slice(-6).toUpperCase())}</b>` : ''}`,
      body: `
        ${cancelled ? `<div class="note warn">${I.x}<span>Ez a foglalás le van mondva (${esc(b.cancelledBy === 'customer' ? 'az ügyfél' : 'admin')} · ${esc(b.cancelledAt ? UI.dateTime(b.cancelledAt) : '')}).</span></div>` : ''}
        <div class="dw-sec">
          ${cu ? `<button class="dw-card who-card" data-open="customer:${cu.id}">${UI.avatar(cu)}<span><b>${esc(cu.name)}</b><small>${esc(cu.email || '')} · ${esc(cu.phone || '')}</small></span>${I.next}</button>` : ''}
          ${co ? `<div class="dw-card who-card">${UI.avatar(co)}<span><b>${esc(co.name)}</b><small>${esc(it.title || '')}</small></span></div>` : ''}
          ${it.type === 'block' ? `<div class="dw-card who-card"><span class="rs-ic">${I.lock}</span><span><b>${esc(it.title || 'Lezárva')}</b><small>A pálya erre az időre nem foglalható</small></span></div>` : ''}
        </div>
        <div class="dw-sec dw-kv">
          <div><small>Típus</small><b>${TYPE_LABEL[it.type]}${it.src === 'series' ? ' (heti)' : ''}</b></div>
          <div><small>Pálya</small><b>${esc(court ? court.name : '')}</b></div>
          ${it.price ? `<div><small>Ár</small><b class="mono">${money(it.price)}</b></div><div><small>Fizetés</small><b>${Admin.payStatus(it)}</b></div>` : ''}
          ${b ? `<div><small>Forrás</small><b>${b.source === 'web' ? 'Weboldal (online)' : 'Admin / telefon'}</b></div><div><small>Létrehozva</small><b>${esc(UI.dateTime(b.createdAt))}</b></div>` : ''}
          ${pay ? `<div><small>Fizetési mód</small><b>${Admin.methodPill(pay.method)}</b></div><div><small>Fizetve</small><b>${esc(UI.dateTime(pay.at))}</b></div>` : ''}
          ${ps ? `<div class="full"><small>Bérlet</small><b>${esc(ps.name)} · ${ps.credits - ps.used}/${ps.credits} alkalom maradt</b></div>` : ''}
          ${ser ? `<div class="full"><small>Sorozat</small><b>Minden ${esc(UI.DAYS[ser.day - 1])} ${ser.start}–${ser.end} · ${esc(UI.dateShort(ser.from))} – ${esc(ser.to ? UI.dateShort(ser.to) : 'határozatlan')}</b></div>` : ''}
          ${(it.note || '') ? `<div class="full"><small>Megjegyzés</small><b>${esc(it.note)}</b></div>` : ''}
        </div>
        ${canPay ? `<div class="dw-sec"><h4>Fizetés rögzítése</h4>
          <div class="pay-row">${PAY_OPTS.filter(([k]) => k !== 'card').map(([k, l]) => `<button class="btn ghost sm" data-pay="${k}">${l}</button>`).join('')}</div>
          <label class="toggle" style="margin-top:12px"><input type="checkbox" class="js-inv" checked><i></i><span>Számla automatikus kiállítása</span></label>
          ${ser && monthDue > 1 ? `<button class="btn soft sm" style="margin-top:12px" data-act="paymonth">${I.cash}${esc(UI.monthLabel(month))}: mind a ${monthDue} alkalom kifizetése · ${money(monthDue * ser.price)}</button>` : ''}
        </div>` : ''}
        <div class="dw-sec"><h4>Műveletek</h4><div class="dw-actions">
          ${inv ? `<button class="btn ghost sm" data-act="inv">${I.receipt}Számla ${esc(inv.no)}</button>` : ''}
          ${b && !cancelled ? `<button class="btn ghost sm" data-act="move">${I.swap}Áthelyezés</button>` : ''}
          ${!cancelled && it.type !== 'block' ? `<button class="btn ghost sm" data-act="ics">${I.cal}Naptárba</button>` : ''}
          ${ser ? `<button class="btn ghost sm" data-act="skip">${I.x}Ez az alkalom elmarad</button><button class="btn ghost sm" data-act="series">${I.edit}Sorozat szerkesztése</button>` : ''}
          ${b && !cancelled && (it.type === 'single') ? `<button class="btn danger-ghost sm" data-act="cancel">Lemondás</button>` : ''}
          ${b && (it.type !== 'single' || cancelled) ? `<button class="btn danger-ghost sm" data-act="delete">${I.del}Törlés</button>` : ''}
        </div></div>
        <div class="js-move"></div>`,
    });

    sh.el.addEventListener('click', async (e) => {
      const p = e.target.closest('[data-pay]');
      if (p) {
        const withInv = $('.js-inv', sh.el).checked;
        if (b) Store.markBookingPaid(b.id, p.dataset.pay, { invoice: withInv });
        else Store.paySeriesDate(ser.id, it.date, p.dataset.pay);
        UI.toast(`Fizetés rögzítve – ${Store.PAY_METHODS[p.dataset.pay]}`); sh.close(); return;
      }
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'paymonth') { const pm = await pickMethod('Havi díj fizetési módja'); if (!pm) return; Store.paySeriesMonth(ser.id, month, pm); UI.toast('Havi díj rögzítve, számla kiállítva'); sh.close(); }
      if (act === 'inv') Admin.openInvoice(inv.id);
      if (act === 'ics') UI.ics({ uid: key.replace(/:/g, '-'), date: it.date, start: it.start, end: it.end, title: `Tenisz – ${court.name}${cu ? ` (${cu.name})` : ''}`, location: Store.settings().venue.address });
      if (act === 'skip') {
        const ok = await UI.confirmBox('Ez az alkalom elmarad?', { ok: 'Igen, elmarad', sub: `${UI.cap(UI.dateLong(it.date))} ${it.start}–${it.end}. A pálya erre az időre szabaddá válik.` });
        if (ok) { Store.skipSeriesDate(ser.id, it.date, true); UI.toast('Alkalom törölve a naptárból'); sh.close(); }
      }
      if (act === 'series') { sh.close(); editSeries(ser.id); }
      if (act === 'cancel') {
        const card = pay && pay.method === 'card';
        const ok = await UI.confirmBox('Lemondod a foglalást?', { ok: 'Lemondás', danger: true, sub: pay ? `${card ? 'Az online kártyás fizetést visszautaljuk' : 'A befizetést visszatérítésként rögzítjük'}, a számlát sztornózzuk.` : ps ? 'A bérletalkalmat jóváírjuk.' : 'A pálya újra foglalható lesz.' });
        if (ok) { Store.cancelBooking(b.id, { by: 'admin', refund: true }); UI.toast('Foglalás lemondva'); sh.close(); }
      }
      if (act === 'delete') { const ok = await UI.confirmBox('Törlöd a bejegyzést?', { ok: 'Törlés', danger: true }); if (ok) { Store.deleteBooking(b.id); sh.close(); } }
      if (act === 'move') moveForm($('.js-move', sh.el), b, sh);
    });
  }

  function moveForm(host, b, sh) {
    const s = Store.settings();
    const all = times(s.open, s.close);
    host.innerHTML = `<div class="dw-sec"><h4>Áthelyezés</h4><div class="dw-card" style="padding:14px">
      <div class="fld-row"><label class="fld"><span>Nap</span><input type="date" data-m="date" value="${b.date}"></label>
      <label class="fld"><span>Pálya</span><select data-m="courtId">${Store.activeCourts().map((c) => `<option value="${c.id}" ${c.id === b.courtId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      <div class="fld-row"><label class="fld"><span>Kezdés</span><select data-m="start">${all.slice(0, -1).map((t) => `<option ${t === b.start ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld"><span>Befejezés</span><select data-m="end">${all.slice(1).map((t) => `<option ${t === b.end ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="dw-actions" style="justify-content:flex-end"><button class="btn dark sm js-mv">Áthelyezés mentése</button></div></div></div>`;
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('.js-mv', host).addEventListener('click', () => {
      const patch = {}; $$('[data-m]', host).forEach((x) => { patch[x.dataset.m] = x.value; });
      try { Store.updateBooking(b.id, patch); UI.toast('Foglalás áthelyezve'); sh.close(); } catch (err) { UI.toast(err.message); }
    });
  }

  function pickMethod(title = 'Fizetési mód') {
    return new Promise((resolve) => {
      let done = false;
      const sh = UI.sheet({
        cls: 'is-dialog', body: `<div class="dlg"><h3>${esc(title)}</h3></div><div class="pm-list">${PAY_OPTS.map(([k, l]) => `<button class="btn ghost" data-pm="${k}">${l}</button>`).join('')}</div>`,
        footer: '<button class="btn ghost" data-close>Mégse</button>',
        onClose: () => { if (!done) resolve(null); },
      });
      sh.el.addEventListener('click', (e) => { const b = e.target.closest('[data-pm]'); if (!b) return; done = true; resolve(b.dataset.pm); sh.close(); });
    });
  }

  // ======================================================================
  // SOROZAT SZERKESZTÉSE
  // ======================================================================
  function editSeries(id) {
    const ser = Store.seriesById(id); if (!ser) return;
    const s = Store.settings();
    const all = times(s.open, s.close);
    const cu = ser.customerId ? Store.customer(ser.customerId) : null;
    const co = ser.coachId ? Store.coach(ser.coachId) : null;
    const sh = Admin.drawer({
      title: `${TYPE_LABEL[ser.type]} – heti sorozat`,
      sub: esc(cu ? cu.name : co ? `${co.name} · ${ser.title}` : ser.title),
      body: `<form class="ser-form">
        ${ser.type === 'training' ? `<div class="fld-row"><label class="fld"><span>Edző</span><select name="coachId">${Store.coaches().map((c) => `<option value="${c.id}" ${c.id === ser.coachId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label class="fld"><span>Megnevezés</span><input name="title" value="${esc(ser.title)}"></label></div>` : ''}
        ${ser.type === 'block' ? `<label class="fld"><span>Megnevezés</span><input name="title" value="${esc(ser.title)}"></label>` : ''}
        <div class="fld-row"><label class="fld"><span>Nap</span><select name="day">${UI.DAYS.map((d, i) => `<option value="${i + 1}" ${ser.day === i + 1 ? 'selected' : ''}>${UI.cap(d)}</option>`).join('')}</select></label>
        <label class="fld"><span>Pálya</span><select name="courtId">${Store.activeCourts().map((c) => `<option value="${c.id}" ${c.id === ser.courtId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="fld-row"><label class="fld"><span>Kezdés</span><select name="start">${all.slice(0, -1).map((t) => `<option ${t === ser.start ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="fld"><span>Befejezés</span><select name="end">${all.slice(1).map((t) => `<option ${t === ser.end ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        <div class="fld-row"><label class="fld"><span>Kezdő dátum</span><input type="date" name="from" value="${ser.from}"></label><label class="fld"><span>Utolsó dátum</span><input type="date" name="to" value="${ser.to || ''}"></label></div>
        ${ser.type === 'regular' ? `<label class="fld"><span>Ár / alkalom</span><input type="number" name="price" value="${ser.price}" step="500" min="0"></label>` : ''}
        <div class="js-cf"></div>
        ${(ser.skip || []).length ? `<div class="dw-sec"><h4>Elmaradó alkalmak <small>${ser.skip.length} db</small></h4><div class="chips">${ser.skip.sort().map((d) => `<button type="button" class="chip-s" data-unskip="${d}" title="Visszaállítás">${esc(UI.dateShort(d))} ${I.x}</button>`).join('')}</div></div>` : ''}
      </form>`,
      footer: `<button class="btn danger-ghost l" data-act="end">Sorozat befejezése</button><button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const f = $('.ser-form', sh.el);
    const read = () => ({ ...ser, coachId: f.coachId ? f.coachId.value : ser.coachId, title: f.title ? f.title.value : ser.title, day: Number(f.day.value), courtId: f.courtId.value, start: f.start.value, end: f.end.value, from: f.from.value, to: f.to.value, price: f.price ? Number(f.price.value) : ser.price });
    const check = () => { const c = Store.seriesConflicts(read()); $('.js-cf', sh.el).innerHTML = c.length ? `<div class="conflict">${I.warn}<span><b>${c.length} alkalom ütközik</b> – mentéskor ezek kimaradnak.<br>${c.slice(0, 3).map((x) => esc(UI.dateShort(x.date))).join(', ')}${c.length > 3 ? '…' : ''}</span></div>` : ''; return c; };
    f.addEventListener('change', check); check();
    f.addEventListener('click', (e) => { const u = e.target.closest('[data-unskip]'); if (u) { Store.skipSeriesDate(ser.id, u.dataset.unskip, false); sh.close(); editSeries(ser.id); } });
    $('.js-save', sh.el).addEventListener('click', () => {
      const data = read();
      if (Store.toMin(data.end) <= Store.toMin(data.start)) { UI.toast('A befejezés legyen a kezdés után'); return; }
      const c = check();
      Store.upsertSeries(data);
      c.forEach((x) => Store.skipSeriesDate(ser.id, x.date, true));
      UI.toast('Sorozat mentve'); sh.close();
    });
    sh.el.querySelector('[data-act="end"]').addEventListener('click', async () => {
      const ok = await UI.confirmBox('Befejezed a sorozatot?', { ok: 'Befejezés mától', danger: true, sub: 'A mai napot követő alkalmak törlődnek, a korábbiak (és a befizetések) megmaradnak.' });
      if (ok) { Store.endSeries(ser.id, Store.todayYmd()); UI.toast('Sorozat lezárva'); sh.close(); }
    });
  }

  Object.assign(Admin.actions, {
    newBooking, openItem, editSeries, pickMethod,
    newSeries: () => newBooking({ repeat: 'weekly' }),
  });
  Admin.customerPicker = customerPicker;
  Admin.PAY_OPTS = PAY_OPTS;
})();
