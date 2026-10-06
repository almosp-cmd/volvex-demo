/* ==========================================================================
   Admin – Mai nap: a Munka felület kezdőlapja.
   Csak az, amivel ma dolgozni kell: pályák, edzések, helyszíni fizetések,
   teendők, friss események. (A számok és grafikonok a Statisztikában vannak.)
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, I, money } = UI;
  const T = Store.toMin;
  const TYPE_CLS = { single: 'ty-single', regular: 'ty-regular', training: 'ty-training', block: 'ty-block' };

  function render(el) {
    const today = Store.todayYmd();
    const s = Store.settings();
    const closed = Store.isClosed(today);
    const items = Store.itemsOn(today);
    const custItems = items.filter((it) => it.type === 'single' || it.type === 'regular');
    const free = closed ? 0 : Store.freeCount(today);
    const due = items.filter((it) => it.type === 'single' && !it.paid && it.price > 0);
    const slots = Store.slotsOn(today).filter((x) => x.groups.length);
    const groupsN = slots.reduce((a, x) => a + x.groups.length, 0);
    const doneN = slots.reduce((a, x) => a + x.groups.filter((g) => Store.session(g.id, today)).length, 0);

    el.innerHTML = `
      <div class="card">
        <div class="card-h"><div><h3>Ma a pályákon</h3><small>${closed ? 'Ünnepnap – zárva' : `${custItems.length} foglalás · még ${free} szabad pályaóra ma · üres sávra kattintva új foglalás`}</small></div>
          <div class="card-tools"><button class="btn sm dark" data-act="book">${I.plus}Foglalás</button><a class="btn sm ghost" href="#/naptar">Naptár ${I.next}</a></div></div>
        <div class="card-b js-tl"></div>
      </div>

      <div class="today-grid">
        <div class="card">
          <div class="card-h"><div><h3>Mai edzések</h3><small>${slots.length ? `${groupsN} csoport · ${doneN} jelenlét rögzítve` : 'Ma nincs csoportos edzés'}</small></div><a class="btn sm ghost" href="#/jelenlet">Jelenlét ${I.next}</a></div>
          <div class="card-b js-tr"></div>
        </div>
        <div class="today-side">
          <div class="card">
            <div class="card-h"><div><h3>Helyszínen fizetendő – ma</h3><small>${due.length ? `${due.length} foglalás · ${money(due.reduce((a, it) => a + it.price, 0))}` : 'minden mai foglalás rendezve'}</small></div></div>
            <div class="js-due"></div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Teendők</h3></div>
            <div class="card-b js-todo"></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-h"><div><h3>Legutóbbi események</h3><small>online foglalások, lemondások, befizetések – utolsó 7 nap</small></div><a class="btn sm ghost" href="#/befizetesek">Befizetések ${I.next}</a></div>
        <div class="js-feed"></div>
      </div>`;

    $('[data-act="book"]', el).addEventListener('click', () => Admin.actions.newBooking({ date: today }));
    timeline($('.js-tl', el), today, items, closed, s);
    trainings($('.js-tr', el), today, slots);
    dueList($('.js-due', el), due);
    todos($('.js-todo', el), today, s);
    feed($('.js-feed', el), today);
  }

  // ---------- mai pályák: idővonal pályánként, kattintható ----------
  function timeline(host, today, items, closed, s) {
    if (closed) { host.innerHTML = '<p class="empty-s">Ma ünnepnap – zárva.</p>'; return; }
    const open = T(s.open); const close = T(s.close);
    const pct = (m) => ((m - open) / (close - open)) * 100;
    const nm = Store.nowMin();
    const hours = []; for (let h = Math.ceil(open / 60); h <= close / 60; h++) hours.push(h);
    host.innerHTML = `<div class="tl-scroll"><div class="tl-inner">
      <div class="tl-axis">${hours.map((h) => `<span class="${(h - hours[0]) % 3 ? 'minor' : ''}" style="left:${pct(h * 60)}%">${String(h).padStart(2, '0')}</span>`).join('')}</div>
      ${Store.activeCourts().map((c) => `<div class="tl-row"><span class="tl-c">${Court.mini(c)}</span><div class="tl-track" data-court="${c.id}" style="--hours:${(close - open) / 60}">
        ${items.filter((it) => it.courtId === c.id).map((it) => {
          const cu = it.customerId ? Store.customer(it.customerId) : null; const co = it.coachId ? Store.coach(it.coachId) : null;
          const main = it.type === 'training' ? (co ? co.short : 'Edzés') : it.type === 'block' ? (it.title || 'Zárva') : (cu ? cu.name : 'Vendég');
          const sub = it.type === 'training' ? (it.title || '') : `${it.start}–${it.end}`;
          const tipTxt = `${it.start}–${it.end} · ${it.type === 'training' ? `${it.title} (${co ? co.name : ''})` : it.type === 'block' ? it.title : (cu ? cu.name : '')}${(it.type === 'single' || it.type === 'regular') && !it.paid ? ' · fizetésre vár' : ''}`;
          return `<button class="tl-it ${TYPE_CLS[it.type]} ${(it.type === 'single' || it.type === 'regular') && !it.paid ? 'unpaid' : ''} ${T(it.end) <= nm ? 'past' : ''}" style="left:${pct(T(it.start))}%;width:${pct(T(it.end)) - pct(T(it.start))}%;${co ? `--cc:${co.color}` : ''}" data-key="${esc(it.key)}" title="${esc(tipTxt)}"><b>${esc(main)}</b><small>${esc(sub)}</small></button>`;
        }).join('')}
        ${nm > open && nm < close ? `<i class="tl-now" style="left:${pct(nm)}%"></i>` : ''}
      </div></div>`).join('')}
      </div></div>
      <div class="legend tl-leg"><span><i class="ty-single"></i>Egyszeri</span><span><i class="ty-single unpaid"></i>Fizetésre vár</span><span><i class="ty-regular"></i>Állandó</span><span><i class="ty-training"></i>Edzés</span><span><i class="ty-block"></i>Lezárás</span></div>`;
    // keskeny kijelzőn az idővonal görgethető – induláskor a mostani időpont látszik
    const sc = $('.tl-scroll', host);
    if (sc.scrollWidth > sc.clientWidth && nm > open && nm < close) sc.scrollLeft = Math.max(0, (pct(nm) / 100) * sc.scrollWidth - sc.clientWidth * 0.45);
    host.addEventListener('click', (e) => {
      const it = e.target.closest('[data-key]'); if (it) { Admin.actions.openItem(it.dataset.key); return; }
      const tr = e.target.closest('.tl-track'); if (!tr) return;
      const r = tr.getBoundingClientRect();
      const m = open + Math.floor(((e.clientX - r.left) / r.width) * (close - open) / 60) * 60;
      const start = Store.fromMin(Math.max(open, Math.min(m, close - 60)));
      Admin.actions.newBooking({ courtId: tr.dataset.court, date: today, start, end: Store.fromMin(Math.min(close, T(start) + 60)) });
    });
  }

  // ---------- mai edzések: idősávonként a csoportok, a jelenlét állapotával ----------
  function trainings(host, today, slots) {
    if (!slots.length) { host.innerHTML = '<p class="empty-s">Ma nincs csoportos edzés.</p>'; return; }
    const nm = Store.nowMin();
    host.innerHTML = `<div class="tr-slots">${slots.map((x) => {
      const now = nm >= T(x.start) && nm < T(x.end);
      return `<div class="tr-slot ${now ? 'now' : ''}"><span class="tr-time mono">${x.start}<small>${x.end}</small></span><div class="tr-groups">${x.groups.map((g) => chip(g, today, nm)).join('')}</div></div>`;
    }).join('')}</div>
    <div class="legend tr-leg"><span><i class="tg-k done"></i>Rögzítve (jelen / létszám)</span><span><i class="tg-k live"></i>Most zajlik</span><span><i class="tg-k miss"></i>Véget ért, nincs rögzítve</span><span><i class="tg-k later"></i>Később</span></div>`;
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-att]'); if (b) Admin.actions.openAttendance(b.dataset.att, today); });
  }
  function chip(g, today, nm) {
    const ses = Store.session(g.id, today);
    const pc = (Store.programOfGroup(g) || {}).color || '#2E5D8C';
    let cls; let st = '';
    if (ses) { const v = Object.values(ses.marks); cls = 'done'; st = `${I.check}${v.filter((m) => m === 'present').length}/${v.length}`; } else if (nm < T(g.start)) cls = 'later';
    else if (nm < T(g.end)) { cls = 'live'; st = 'most'; } else { cls = 'miss'; st = 'rögzítendő'; }
    const co = (g.coachIds || []).map((id) => (Store.coach(id) || {}).name).filter(Boolean).join(', ');
    return `<button class="tg ${cls}" data-att="${g.id}" style="--pc:${pc}" title="${esc(`${Store.groupName(g)} · ${g.start}–${g.end}${co ? ` · ${co}` : ''} · ${g.studentIds.length} gyerek`)}"><i></i><b>${esc(Store.groupName(g))}</b>${st ? `<span>${st}</span>` : ''}</button>`;
  }

  // ---------- helyszínen fizetendő mai foglalások ----------
  function dueList(host, due) {
    host.innerHTML = due.length ? `<div class="dw-list due-list">${due.map((it) => {
      const c = Store.customer(it.customerId); const ct = Store.court(it.courtId);
      return `<button class="li" data-key="${esc(it.key)}"><span class="due-t mono">${it.start}</span><span><b>${esc(c ? c.name : 'Vendég')}</b><small>${esc(ct ? ct.name : '')} · ${it.start}–${it.end}</small></span><span class="num">${money(it.price)}</span>${I.next}</button>`;
    }).join('')}</div>` : '<p class="empty-s">Nincs helyszínen fizetendő foglalás ma.</p>';
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) Admin.actions.openItem(b.dataset.key); });
  }

  // ---------- teendők ----------
  function todos(host, today, s) {
    const month = Store.monthOf(today);
    const recv = Store.receivables();
    const missing = Store.missingSessions({ days: 14 }).filter((m) => m.date < today || Store.nowMin() >= T(m.training.end));
    const unpaidB = recv.filter((r) => r.kind !== 'charge');
    const overdueC = recv.filter((r) => r.kind === 'charge');
    const blocks = Store.bookings({ from: today, to: Store.shiftYmd(today, 14), type: 'block' }).filter((b) => b.status !== 'cancelled');
    const holidays = s.holidays.filter((h) => h >= today && h <= Store.shiftYmd(today, 30));
    const todo = [];
    if (!Store.charges({ month }).length) todo.push({ ic: Admin.X.coin, t: `A(z) ${UI.MONTHS[Number(month.slice(5)) - 1]}i tandíjak még nincsenek kiírva`, s: 'Egy kattintással kiírható minden aktív diáknak', go: '#/tandijak', tone: 'warn' });
    if (missing.length) todo.push({ ic: I.check, t: `${missing.length} csoport jelenléte hiányzik`, s: `Legrégebbi: ${UI.dateShort(missing[0].date)} ${missing[0].training.start}`, go: '#/jelenlet?f=missing', tone: 'warn' });
    if (unpaidB.length) todo.push({ ic: Admin.X.alert, t: `${unpaidB.length} kifizetetlen pályafoglalás`, s: money(unpaidB.reduce((a, r) => a + r.amount, 0)), go: '#/kintlevoseg', tone: 'bad' });
    if (overdueC.length) todo.push({ ic: Admin.X.coin, t: `${overdueC.length} lejárt tandíj`, s: money(overdueC.reduce((a, r) => a + r.amount, 0)), go: '#/tandijak?f=overdue', tone: 'bad' });
    blocks.slice(0, 3).forEach((b) => todo.push({ ic: I.lock, t: b.title || 'Pálya lezárva', s: `${UI.dateShort(b.date)} ${b.start}–${b.end} · ${(Store.court(b.courtId) || {}).name || ''}`, go: `#/naptar?d=${b.date}` }));
    holidays.forEach((h) => todo.push({ ic: I.cal, t: 'Ünnepnap – zárva', s: UI.cap(UI.dateLong(h)), go: '#/beallitasok' }));
    host.innerHTML = todo.length ? `<div class="todo">${todo.map((t) => `<a class="td ${t.tone || ''}" href="${t.go}"><span class="td-ic">${t.ic}</span><span><b>${esc(t.t)}</b><small>${esc(t.s)}</small></span>${I.next}</a>`).join('')}</div>` : '<p class="empty-s">Minden rendben – nincs teendő. 🎾</p>';
  }

  // ---------- friss események ----------
  function feed(host, today) {
    const evs = [];
    // az online foglalás kártyás fizetése a foglalás eseményében látszik, nem duplán
    Store.payments({ from: Store.shiftYmd(today, -7) }).filter((p) => !(p.by === 'web' && p.category === 'court' && p.amount > 0)).slice(0, 40).forEach((p) => evs.push({ at: p.at, kind: p.amount < 0 ? 'refund' : 'pay', p }));
    Store.bookings({ from: Store.shiftYmd(today, -30) }).filter((b) => b.source === 'web' && b.createdAt >= Store.shiftYmd(today, -7)).forEach((b) => evs.push({ at: b.createdAt, kind: 'book', b }));
    Store.bookings({}).filter((b) => b.status === 'cancelled' && b.cancelledAt && b.cancelledAt >= Store.shiftYmd(today, -7)).forEach((b) => evs.push({ at: b.cancelledAt, kind: 'cancel', b }));
    evs.sort((a, b) => (a.at < b.at ? 1 : -1));
    host.innerHTML = `<div class="feed">${evs.slice(0, 14).map((e) => {
      if (e.kind === 'pay' || e.kind === 'refund') {
        const w = Admin.who(e.p.payer);
        return `<div class="fd"><span class="fd-ic ${e.kind}">${e.kind === 'refund' ? I.redo : I.cash}</span><span class="fd-t"><b>${e.kind === 'refund' ? 'Visszatérítés' : Store.CATEGORIES[e.p.category]} · ${esc(w.name)}</b><small>${Admin.methodPill(e.p.method)} ${e.p.by === 'web' ? 'weboldal' : 'admin'}</small></span><b class="fd-amt ${e.p.amount < 0 ? 'amt-neg' : ''}">${money(e.p.amount, { sign: true })}</b><span class="fd-at">${esc(UI.dateTime(e.at))}</span></div>`;
      }
      const c = Store.customer(e.b.customerId); const ct = Store.court(e.b.courtId);
      return `<button class="fd" data-key="b:${e.b.id}"><span class="fd-ic ${e.kind}">${e.kind === 'cancel' ? I.x : I.cal}</span><span class="fd-t"><b>${e.kind === 'cancel' ? 'Lemondott foglalás' : 'Új online foglalás'} · ${esc(c ? c.name : '')}</b><small>${e.kind === 'book' ? Admin.methodPill(e.b.payMethod) : ''} ${esc(UI.dateShort(e.b.date))} ${e.b.start}–${e.b.end} · ${esc(ct ? ct.name : '')}</small></span><b class="fd-amt">${money(e.b.price)}</b><span class="fd-at">${esc(UI.dateTime(e.at))}</span></button>`;
    }).join('') || '<p class="empty-s">Nincs friss esemény.</p>'}</div>`;
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) Admin.actions.openItem(b.dataset.key); });
  }

  Admin.page('ma', {
    title: 'Mai nap',
    sub: () => `${UI.cap(UI.dateLong(Store.todayYmd()))} · ${Store.settings().clubName}`,
    render,
  });
})();
