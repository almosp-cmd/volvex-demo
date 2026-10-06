/* ==========================================================================
   Pályafoglalás: naptár → belépés (e-mail) → fizetés → visszaigazolás
   + Fiókom: foglalások, lemondás, bérletek, számlák, adatok
   Útvonalak:  #/            foglalási naptár   (?d=&c=&t= előválasztás)
               #/fiok        fiókom
               #/siker/<id>  visszaigazolás
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const root = $('#bk');
  const arrow = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const S = () => Store.settings();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const me = () => { const id = Store.customerId(); return id ? Store.customer(id) : null; };
  const METHOD_LABEL = { card: 'Bankkártyával fizetve', pass: 'Bérlettel', onsite: 'Fizetés a helyszínen' };

  // ---------- állapot ----------
  const qs = new URLSearchParams(location.search);
  const st = {
    date: qs.get('d') || Store.todayYmd(),
    sel: null, // { courtId, start, end }
    method: 'card',
    loginStep: 'email', // email | register
    email: '',
    consent: false,
  };
  if (st.date < Store.todayYmd()) st.date = Store.todayYmd();
  // ha ma már nincs szabad időpont (pl. este), a következő foglalható nappal nyitunk
  if (!qs.get('d') && !Store.freeCount(st.date)) {
    for (let i = 1; i <= S().booking.maxDaysAhead; i++) { const d = Store.shiftYmd(st.date, i); if (Store.freeCount(d)) { st.date = d; break; } }
  }
  if (qs.get('c') && qs.get('t')) {
    const t = qs.get('t');
    const end = Store.fromMin(Store.toMin(t) + S().booking.slotMin);
    const row = Store.slotGrid(st.date).find((r) => r.court.id === qs.get('c'));
    const cell = row && row.cells.find((c) => c.start === t);
    if (cell && cell.state === 'free') st.sel = { courtId: qs.get('c'), start: t, end };
  }
  if (qs.toString()) history.replaceState(null, '', location.pathname + location.hash);

  // ======================================================================
  // ÚTVÁLASZTÁS
  // ======================================================================
  let view = null;
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b] = h.split('/');
    if (a === 'fiok') { view = 'acct'; renderAccount(); } else if (a === 'siker' && b) { view = 'ok'; renderSuccess(b); } else { view = 'book'; renderBooking(); }
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  addEventListener('hashchange', route);

  // ======================================================================
  // FOGLALÁSI NAPTÁR
  // ======================================================================
  function renderBooking() {
    root.innerHTML = `
      <section class="wrap bk-top">
        <div>
          <p class="eyebrow"><span class="dot-live"></span><span><b>Élő foglaltság</b> · ${Store.activeCourts().length} beltéri pálya</span></p>
          <h1 class="h2 bk-title">Pályafoglalás</h1>
        </div>
        <div class="bk-legend">
          <span><i class="lg free"></i>Szabad</span><span><i class="lg sel"></i>Kiválasztva</span><span><i class="lg busy"></i>Foglalt</span>
        </div>
      </section>
      <div class="wrap bk-days-wrap"><div class="bk-days" id="days"></div></div>
      <div class="wrap bk-main">
        <div class="bk-grid" id="grid"></div>
        <aside class="bk-side" id="side"></aside>
      </div>
      <div class="bk-mbar" id="mbar" hidden></div>`;
    renderDays(); renderGrid(); renderSide();
    const sel = $('.dpill.on', root);
    if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function renderDays() {
    const s = S();
    const today = Store.todayYmd();
    const days = Array.from({ length: s.booking.maxDaysAhead + 1 }, (_, i) => Store.shiftYmd(today, i));
    const total = Store.activeCourts().length * ((Store.toMin(s.close) - Store.toMin(s.open)) / s.booking.slotMin);
    $('#days').innerHTML = days.map((d, i) => {
      const closed = Store.isClosed(d);
      const free = closed ? 0 : Store.freeCount(d);
      const dt = Store.parseYmd(d);
      const first = i === 0 || dt.getDate() === 1;
      return `<button class="dpill ${d === st.date ? 'on' : ''} ${closed ? 'is-closed' : ''} ${Store.dowOf(d) >= 6 ? 'is-we' : ''}" data-d="${d}" ${closed ? 'disabled' : ''}>
        <span class="dp-dow">${i === 0 ? 'MA' : UI.DAYS_SHORT[Store.dowOf(d) - 1].toUpperCase()}</span>
        <b class="dp-n">${dt.getDate()}</b>
        <span class="dp-m">${first ? esc(UI.MONTHS_SHORT[dt.getMonth()]) : '&nbsp;'}</span>
        <span class="dp-bar"><i style="--w:${closed ? 0 : Math.round((free / total) * 100)}%"></i></span>
        <small>${closed ? 'zárva' : free ? `${free} szabad` : 'betelt'}</small>
      </button>`;
    }).join('');
  }

  function cellsAt() { return Store.slotGrid(st.date); }
  function renderGrid() {
    const grid = cellsAt();
    const s = S();
    const courts = grid.map((r) => r.court);
    const n = grid[0] ? grid[0].cells.length : 0;
    const sel = st.sel;
    const inSel = (cid, start) => sel && sel.courtId === cid && Store.toMin(start) >= Store.toMin(sel.start) && Store.toMin(start) < Store.toMin(sel.end);
    const closed = Store.isClosed(st.date);
    let html = `<div class="g-head" style="--n:${courts.length}"><span class="g-day">IDŐ</span>${courts.map((c) => `<span class="g-court">${Court.mini(c)}<b>${esc(c.name)}</b></span>`).join('')}</div>`;
    if (closed) html += `<div class="g-closed">${Court.ballSVG(30)}<b>Ünnepnap – a csarnok zárva tart.</b><span>Válassz másik napot.</span></div>`;
    else {
      html += `<div class="g-body" style="--n:${courts.length}">`;
      for (let i = 0; i < n; i++) {
        const c0 = grid[0].cells[i];
        html += `<span class="g-time"><b>${c0.start}</b></span>`;
        grid.forEach((row) => {
          const c = row.cells[i];
          const on = inSel(row.court.id, c.start);
          const first = on && c.start === sel.start;
          const last = on && c.end === sel.end;
          if (on) html += `<button class="cell sel ${first ? 'f' : ''} ${last ? 'l' : ''}" data-c="${row.court.id}" data-t="${c.start}" aria-pressed="true" aria-label="${esc(row.court.name)} ${c.start} kiválasztva">${first ? `<span class="c-t">${sel.start}–${sel.end}</span>` : ''}<span class="c-ic">${I.check}</span></button>`;
          else if (c.state === 'free') html += `<button class="cell free t-${c.tier}" data-c="${row.court.id}" data-t="${c.start}" aria-label="${esc(row.court.name)} ${c.start}–${c.end}, ${money(c.price)}"><span class="c-p">${money(c.price)}</span><span class="c-ps">${Math.round(c.price / 1000)}e</span><span class="c-plus">${I.plus}</span></button>`;
          else html += `<span class="cell ${c.state}">${c.state === 'busy' ? '<span class="c-b">Foglalt</span>' : ''}</span>`;
        });
      }
      html += '</div>';
      html += `<p class="g-note">${I.clock}<span>Egy kattintás = ${s.booking.slotMin} perc. Ugyanazon a pályán legfeljebb ${s.booking.maxHours} egymást követő órát jelölhetsz ki.</span></p>`;
    }
    $('#grid').innerHTML = html;
    renderMbar();
  }

  function clickCell(courtId, start) {
    const max = S().booking.maxHours * 60;
    const step = S().booking.slotMin;
    const grid = cellsAt();
    const row = grid.find((r) => r.court.id === courtId);
    const s = st.sel;
    const m = Store.toMin(start);
    const free = (t) => { const c = row.cells.find((x) => x.start === t); return c && c.state === 'free'; };
    if (s && s.courtId === courtId) {
      const a = Store.toMin(s.start); const b = Store.toMin(s.end);
      if (m >= a && m < b) {
        if (b - a === step) st.sel = null;
        else if (m === a) s.start = Store.fromMin(a + step);
        else if (m + step === b) s.end = Store.fromMin(b - step);
        else st.sel = { courtId, start, end: Store.fromMin(m + step) };
        return update();
      }
      if ((m === b || m + step === a)) {
        if (b - a + step > max) { UI.toast(`Egyszerre legfeljebb ${S().booking.maxHours} óra foglalható`); return; }
        if (m === b) s.end = Store.fromMin(m + step); else s.start = start;
        return update();
      }
    }
    if (!free(start)) return;
    st.sel = { courtId, start, end: Store.fromMin(m + step) };
    update();
  }
  function update() { renderGrid(); renderSide(); }

  // ---------- jobb oldali összesítő ----------
  function renderSide() {
    const side = $('#side');
    const s = S();
    if (!st.sel) {
      side.innerHTML = `
        <div class="side-card">
          <div class="side-court">${Court.card({ id: 'x', no: 0, surface: 'hard' }, { chip: 'VÁLASSZ IDŐPONTOT', label: esc(UI.dateShort(st.date).toUpperCase()), brand: 'VOLVEX' })}</div>
          <h3 class="side-h">Válassz egy szabad órát</h3>
          <p class="side-p">Kattints a naptárban egy szabad időpontra. Ha tovább játszanál, kattints a következő órára is ugyanazon a pályán.</p>
          <div class="side-tiers">
            ${Store.priceRules().map((r) => `<div><i class="tier-dot t-${esc(r.tier)}"></i><span>${esc(r.name)}<small>${esc(r.from)}–${esc(r.to)}</small></span><b>${money(r.price)}</b></div>`).join('')}
          </div>
          <p class="side-fine">${I.check} Lemondás ${s.booking.cancelHours} óráig díjmentes · ${I.check} Számla e-mailben</p>
        </div>`;
      return;
    }
    const court = Store.court(st.sel.courtId);
    const price = Store.priceFor(st.date, st.sel.start, st.sel.end);
    const mins = Store.toMin(st.sel.end) - Store.toMin(st.sel.start);
    const u = me();
    const pass = u ? Store.usablePass(u.id, st.date, st.sel.start, st.sel.end) : null;
    if (st.method === 'pass' && !pass) st.method = 'card';
    if (st.method === 'onsite' && !s.booking.allowOnsite) st.method = 'card';
    const methods = [
      { id: 'card', t: 'Bankkártya', d: 'Online, azonnal · számla e-mailben', ic: I.card },
      { id: 'pass', t: 'Bérlet', d: pass ? `${pass.name} · még ${pass.credits - pass.used} alkalom` : u ? 'Nincs erre az időpontra érvényes bérleted' : 'Belépés után választható', ic: I.ticket, off: !pass },
    ];
    if (s.booking.allowOnsite) methods.push({ id: 'onsite', t: 'Helyszínen', d: 'Kártyával vagy készpénzzel a recepción', ic: I.cash });
    const btnLabel = st.method === 'card' ? `Fizetés · ${money(price)}` : st.method === 'pass' ? `Foglalás bérlettel · ${mins / 60} alkalom` : 'Foglalás, fizetés a helyszínen';

    side.innerHTML = `
      <div class="side-card">
        <div class="side-court">${Court.card(court, { chip: `${esc(UI.dateShort(st.date).toUpperCase())} · ${st.sel.start}`, label: `${st.sel.start}&#8239;–&#8239;${st.sel.end}`, brand: `PÁLYA ${court.no}` })}</div>
        <dl class="sum">
          <div><dt>Nap</dt><dd>${esc(UI.cap(UI.dateLong(st.date)))}</dd></div>
          <div><dt>Időpont</dt><dd class="mono">${st.sel.start}–${st.sel.end} <small>(${UI.hours(mins)})</small></dd></div>
          <div><dt>Pálya</dt><dd>${esc(court.name)} · beltéri</dd></div>
        </dl>
        <div class="sum-total"><span>Fizetendő</span><b class="mono">${st.method === 'pass' ? `<s>${money(price)}</s> 0 Ft` : money(price)}</b></div>

        <div class="side-step">
          <span class="ss-n">1</span><b>Ki foglal?</b>
          ${u ? `<div class="who">${UI.avatar(u)}<span><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span><button class="link-s" data-act="logout">Nem te vagy?</button></div>`
            : loginForm()}
        </div>

        <div class="side-step ${u ? '' : 'is-dim'}">
          <span class="ss-n">2</span><b>Fizetés módja</b>
          <div class="pay-opts">
            ${methods.map((m) => `<label class="pay-opt ${m.off ? 'is-off' : ''}">
              <input type="radio" name="pm" value="${m.id}" ${st.method === m.id ? 'checked' : ''} ${m.off || !u ? 'disabled' : ''}>
              <span class="po-ic">${m.ic}</span><span class="po-t"><b>${m.t}</b><small>${esc(m.d)}</small></span><i class="po-r"></i></label>`).join('')}
          </div>
          <label class="consent"><input type="checkbox" class="js-consent" ${st.consent ? 'checked' : ''} ${u ? '' : 'disabled'}><i>${I.check}</i><span>Elfogadom az <a href="#" onclick="return false">ÁSZF-et</a> és a lemondási feltételeket (${s.booking.cancelHours} óráig díjmentes).</span></label>
          <button class="btn-xl primary pay-btn" data-act="pay" ${u ? '' : 'disabled'}>${btnLabel} ${arrow}</button>
        </div>
      </div>`;
    renderMbar();
  }

  function loginForm() {
    if (st.loginStep === 'register') {
      return `<form class="login-f js-reg" autocomplete="on">
        <p class="lf-note">Új vagy nálunk – <b>${esc(st.email)}</b>. Csak a neved és a telefonszámod kell.</p>
        <label class="fld"><span>Teljes név</span><input name="name" required autocomplete="name" placeholder="pl. Kovács Anna"></label>
        <label class="fld"><span>Telefonszám</span><input name="phone" required autocomplete="tel" inputmode="tel" placeholder="+36 30 123 4567"></label>
        <div class="lf-row"><button type="button" class="link-s" data-act="back-email">Másik e-mail</button><button class="btn dark">Fiók létrehozása</button></div>
      </form>`;
    }
    return `<form class="login-f js-email" autocomplete="on">
      <label class="fld"><span>E-mail cím</span><input type="email" name="email" required autocomplete="email" placeholder="nev@email.hu" value="${esc(st.email)}"></label>
      <button class="btn dark">Tovább</button>
      <p class="lf-note">Jelszó nem kell. ${Store.isDemo ? '<span class="demo-flag">demó</span> Élesben egy belépő kódot küldünk e-mailben.' : 'Egy belépő kódot küldünk e-mailben.'}</p>
    </form>`;
  }

  function renderMbar() {
    const bar = $('#mbar'); if (!bar) return;
    if (!st.sel) { bar.hidden = true; return; }
    const price = Store.priceFor(st.date, st.sel.start, st.sel.end);
    const court = Store.court(st.sel.courtId);
    bar.hidden = false;
    bar.innerHTML = `<span><b>${esc(court.name)} · ${st.sel.start}–${st.sel.end}</b><small>${esc(UI.dateShort(st.date))} · ${money(price)}</small></span><button class="btn ball" data-act="to-side">Tovább ${I.next}</button>`;
  }

  // ---------- fizetés (demó fizetőoldal) ----------
  function paymentGateway(amount) {
    return new Promise((resolve) => {
      let done = false;
      const sh = UI.sheet({
        cls: 'is-dialog pg-sheet',
        body: `<div class="pg">
          <div class="pg-head">${I.lock}<span>Biztonságos fizetés</span>${Store.isDemo ? '<span class="demo-flag">Demó</span>' : ''}</div>
          <div class="pg-merchant">${esc(S().company.name)}</div>
          <div class="pg-amount">${money(amount)}</div>
          <div class="pg-card"><span>${I.card}</span><span>Bankkártyás fizetés</span></div>
          <p class="pg-note">Élesben itt a bank (pl. Barion vagy SimplePay) biztonságos fizetőoldala nyílik meg – a kártyaadatok soha nem kerülnek hozzánk. A demóban nem kell kártyaadatot megadni.</p>
        </div>`,
        footer: '<button class="btn ghost" data-v="0">Mégse</button><button class="btn dark" data-v="1">Sikeres fizetés szimulálása</button>',
        onClose: () => { if (!done) resolve(false); },
      });
      sh.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        done = true;
        if (b.dataset.v === '0') { sh.close(); resolve(false); return; }
        sh.set(`<div class="pg pg-busy"><div class="pg-spin"></div><b>Fizetés feldolgozása…</b><small>Ne zárd be az ablakot</small></div>`);
        $('.sheet-foot', sh.el).remove();
        wait(UI.reduceMotion() ? 200 : 1300).then(() => { sh.close(); resolve(true); });
      });
    });
  }

  async function pay() {
    const u = me(); if (!u || !st.sel) return;
    if (!st.consent) { UI.toast('A foglaláshoz fogadd el a feltételeket'); $('.consent', root).classList.add('shake'); setTimeout(() => $('.consent', root) && $('.consent', root).classList.remove('shake'), 500); return; }
    const price = Store.priceFor(st.date, st.sel.start, st.sel.end);
    if (!Store.isFree(st.sel.courtId, st.date, st.sel.start, st.sel.end)) { UI.toast('Sajnos ezt az időpontot közben lefoglalták'); st.sel = null; update(); return; }
    if (st.method === 'card') { const ok = await paymentGateway(price); if (!ok) return; }
    const sel = st.sel;
    st.sel = null; // a saját foglalásunk ne váltsa ki a "közben lefoglalták" jelzést
    try {
      const r = Store.bookOnline({ customerId: u.id, courtId: sel.courtId, date: st.date, start: sel.start, end: sel.end, method: st.method });
      st.consent = false;
      location.hash = `#/siker/${r.booking.id}`;
    } catch (err) { UI.toast(err.message); update(); }
  }

  // ---------- belépés / regisztráció ----------
  function onEmail(form, after) {
    const email = form.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { UI.toast('Adj meg egy érvényes e-mail címet'); return; }
    st.email = email;
    const c = Store.customerByEmail(email);
    if (c) { Store.setCustomer(c.id); UI.toast(`Szia, ${UI.firstName(c.name)}! Beléptél.`); after(); return; }
    st.loginStep = 'register'; after();
  }
  function onRegister(form, after) {
    const name = form.name.value.trim(); const phone = form.phone.value.trim();
    if (name.length < 3) { UI.toast('Add meg a teljes neved'); return; }
    try {
      const id = Store.upsertCustomer({ name, email: st.email, phone, billing: { name, zip: '', city: '', street: '', taxNumber: '' } });
      Store.setCustomer(id); st.loginStep = 'email';
      UI.toast('Fiók létrehozva – üdv a Volvexben!'); after();
    } catch (err) { UI.toast(err.message); }
  }

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const after = () => (view === 'acct' ? renderAccount() : renderSide());
    if (e.target.matches('.js-email')) onEmail(e.target, after);
    if (e.target.matches('.js-reg')) onRegister(e.target, after);
    if (e.target.matches('.js-profile')) saveProfile(e.target);
  });
  root.addEventListener('change', (e) => {
    if (e.target.name === 'pm') { st.method = e.target.value; renderSide(); }
    if (e.target.matches('.js-consent')) st.consent = e.target.checked;
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], .dpill, .cell[data-c]'); if (!b) return;
    if (b.classList.contains('dpill')) { st.date = b.dataset.d; st.sel = null; $$('.dpill', root).forEach((x) => x.classList.toggle('on', x === b)); renderGrid(); renderSide(); return; }
    if (b.matches('.cell[data-c]')) { clickCell(b.dataset.c, b.dataset.t); return; }
    const act = b.dataset.act;
    if (act === 'pay') pay();
    if (act === 'logout') { Store.setCustomer(null); st.loginStep = 'email'; view === 'acct' ? renderAccount() : renderSide(); }
    if (act === 'back-email') { st.loginStep = 'email'; renderSide(); }
    if (act === 'to-side') $('#side').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (act === 'cancel') cancelBooking(b.dataset.id);
    if (act === 'ics') icsFor(b.dataset.id);
    if (act === 'inv') { const inv = Store.invoice(b.dataset.id); if (inv) Invoice.open(inv); }
    if (act === 'buy') buyPass(b.dataset.id);
    if (act === 'tab') { acctTab = b.dataset.tab; renderAccount(); }
  });

  // ======================================================================
  // VISSZAIGAZOLÁS
  // ======================================================================
  function renderSuccess(id) {
    const b = Store.booking(id);
    if (!b) { location.hash = '#/'; return; }
    const court = Store.court(b.courtId);
    const pay = b.paymentId ? Store.payment(b.paymentId) : null;
    const inv = pay && pay.invoiceId ? Store.invoice(pay.invoiceId) : null;
    const code = b.id.slice(-6).toUpperCase();
    root.innerHTML = `
      <section class="wrap ok-wrap">
        <div class="ok-stage">
          <div class="ok-persp"><div class="ok-plane">${Court.card(court, { chip: 'LEFOGLALVA ✓', label: `${b.start}&#8239;–&#8239;${b.end}`, brand: `PÁLYA ${court.no}` })}</div></div>
          <div class="ok-ball"><span class="ball"></span></div>
          <div class="ok-shadow"></div>
        </div>
        <div class="ok-body">
          <p class="eyebrow"><span class="dot-live"></span>Foglalás visszaigazolva</p>
          <h1 class="h2">Lefoglalva<em>!</em></h1>
          <p class="ok-lead">${esc(UI.cap(UI.dateLong(b.date)))}, <b>${b.start}–${b.end}</b> · ${esc(court.name)}. A visszaigazolást${inv ? ' és a számlát' : ''} elküldtük e-mailben.</p>
          <div class="ok-receipt">
            <div class="rc-row"><span>Foglalási kód</span><b class="mono">${code}</b></div>
            <div class="rc-row"><span>Fizetés</span><b>${esc(METHOD_LABEL[b.payMethod] || '')}</b></div>
            <div class="rc-row"><span>Összeg</span><b class="mono">${b.payMethod === 'pass' ? '1 bérletalkalom' : money(b.price)}</b></div>
            ${inv ? `<div class="rc-row"><span>Számla</span><b class="mono">${esc(inv.no)}</b></div>` : ''}
            <div class="rc-row"><span>Lemondható</span><b>${S().booking.cancelHours} órával előtte, a Fiókomban</b></div>
          </div>
          <div class="ok-actions">
            <button class="btn-xl primary" data-act="ics" data-id="${b.id}">${I.cal} Naptárba</button>
            ${inv ? `<button class="btn-xl ghost" data-act="inv" data-id="${inv.id}">${I.receipt} Számla</button>` : ''}
            <a class="btn-xl ghost" href="#/fiok">Foglalásaim</a>
            <a class="btn-xl ghost" href="#/">Új foglalás</a>
          </div>
        </div>
      </section>`;
  }

  function icsFor(id) {
    const b = Store.booking(id); if (!b) return;
    const c = Store.court(b.courtId);
    UI.ics({ uid: b.id, date: b.date, start: b.start, end: b.end, title: `Tenisz – ${c.name} (Volvex)`, location: S().venue.address, desc: `Foglalási kód: ${b.id.slice(-6).toUpperCase()}` });
  }

  // ======================================================================
  // FIÓKOM
  // ======================================================================
  let acctTab = 'foglalasok';
  function renderAccount() {
    const u = me();
    if (!u) {
      root.innerHTML = `
        <section class="wrap acct-login">
          <div class="al-card">
            <p class="eyebrow">Fiókom</p>
            <h1 class="h2">Belépés</h1>
            <p class="side-p">Add meg az e-mail címed – ha még nincs fiókod, egy perc alatt létrehozzuk.</p>
            <div class="al-form">${loginForm()}</div>
          </div>
          <div class="al-art">${Court.card({ id: 'a', no: 0, surface: 'hard' }, { chip: 'VOLVEX FIÓK', label: 'FOGLALÁSOK · BÉRLETEK · SZÁMLÁK', brand: 'VOLVEX' })}</div>
        </section>`;
      return;
    }
    const today = Store.todayYmd();
    const all = Store.bookings({ customerId: u.id });
    const upcoming = all.filter((b) => b.status !== 'cancelled' && b.date >= today).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
    const past = all.filter((b) => b.status === 'cancelled' || b.date < today).sort((a, b) => (a.date + a.start > b.date + b.start ? -1 : 1));
    const passes = Store.passesOf(u.id);
    const regular = Store.series('regular').filter((s) => s.customerId === u.id);
    const pays = Store.paymentsOf('customer', u.id);
    const invs = pays.map((p) => p.invoiceId && Store.invoice(p.invoiceId)).filter(Boolean);
    const sum = Store.customerSummary(u.id);
    const TABS = [['foglalasok', 'Foglalások', upcoming.length], ['berletek', 'Bérletek', passes.filter((p) => p.validUntil >= today && p.used < p.credits).length], ['szamlak', 'Számlák', invs.length], ['adatok', 'Adataim', 0]];

    const bkRow = (b) => {
      const c = Store.court(b.courtId);
      const canCancel = Store.canCustomerCancel(b);
      const inv = b.paymentId ? Store.invoiceOfPayment(b.paymentId) : null;
      const status = b.status === 'cancelled' ? '<span class="pill miss">Lemondva</span>'
        : b.payMethod === 'pass' ? '<span class="pill soft">Bérlet</span>'
          : b.paymentId ? `<span class="pill ok">${I.check}Fizetve</span>` : '<span class="pill warn">Helyszínen fizetendő</span>';
      const d = Store.parseYmd(b.date);
      return `<div class="bk-row ${b.status === 'cancelled' ? 'is-cx' : ''}">
        <div class="br-date"><b>${d.getDate()}</b><span>${esc(UI.MONTHS_SHORT[d.getMonth()])}</span></div>
        <div class="br-main"><b>${b.start}–${b.end} · ${esc(c ? c.name : '')}</b><small>${esc(UI.cap(UI.DAYS[Store.dowOf(b.date) - 1]))} · ${money(b.price)}</small></div>
        ${status}
        <div class="br-act">
          ${b.status !== 'cancelled' && b.date >= today ? `<button class="icon-btn sm" data-act="ics" data-id="${b.id}" title="Naptárba">${I.cal}</button>` : ''}
          ${inv ? `<button class="icon-btn sm" data-act="inv" data-id="${inv.id}" title="Számla">${I.receipt}</button>` : ''}
          ${b.status !== 'cancelled' && b.date >= today ? (canCancel ? `<button class="btn sm danger-ghost" data-act="cancel" data-id="${b.id}">Lemondás</button>` : `<span class="br-lock" title="${S().booking.cancelHours} órán belül már nem mondható le online">${I.lock}</span>`) : ''}
        </div>
      </div>`;
    };

    let body = '';
    if (acctTab === 'foglalasok') {
      body = `
        <div class="acct-sec"><div class="as-head"><h3>Következő foglalásaim</h3><a class="btn dark sm" href="#/">${I.plus}Új foglalás</a></div>
          <div class="list-card">${upcoming.map(bkRow).join('') || `<div class="empty-state">${Court.ballSVG(30)}<b>Nincs közelgő foglalásod</b><small>Nézd meg a szabad időpontokat a naptárban.</small></div>`}</div></div>
        ${regular.length ? `<div class="acct-sec"><div class="as-head"><h3>Állandó időpontjaim</h3></div><div class="list-card">${regular.map((s) => { const c = Store.court(s.courtId); return `<div class="bk-row"><div class="br-date reg"><b>${UI.DAYS_SHORT[s.day - 1]}</b><span>hetente</span></div><div class="br-main"><b>${s.start}–${s.end} · ${esc(c.name)}</b><small>${esc(UI.dateShort(s.from))} – ${esc(s.to ? UI.dateShort(s.to) : '')} · ${money(s.price)}/alkalom</small></div><span class="pill soft">Állandó</span><div class="br-act"></div></div>`; }).join('')}</div>
          ${sum.unpaid ? `<p class="acct-warn">${I.warn} Rendezetlen egyenleg: <b>${money(sum.unpaid)}</b> – a recepción vagy átutalással rendezhető.</p>` : ''}</div>` : ''}
        <div class="acct-sec"><div class="as-head"><h3>Korábbi foglalások</h3><small>${past.length} db</small></div>
          <div class="list-card">${past.slice(0, 12).map(bkRow).join('') || '<div class="empty-row">Még nincs korábbi foglalásod.</div>'}</div></div>`;
    } else if (acctTab === 'berletek') {
      const prods = Store.products('pass').filter((p) => p.active !== false);
      body = `
        <div class="acct-sec"><div class="as-head"><h3>Bérleteim</h3></div>
          <div class="pass-grid">${passes.map((p) => {
            const left = p.credits - p.used; const valid = p.validUntil >= today;
            return `<div class="pass-card ${!valid || !left ? 'is-old' : ''}">
              <span class="tk-kind">${valid && left ? 'Aktív bérlet' : !valid ? 'Lejárt' : 'Elhasználva'}</span>
              <h4>${esc(p.name)}</h4>
              <div class="pc-dots">${Array.from({ length: p.credits }, (_, i) => `<i class="${i < p.used ? 'u' : ''}"></i>`).join('')}</div>
              <div class="pc-foot"><span><b>${left}</b> / ${p.credits} alkalom maradt</span><span>Érvényes: ${esc(UI.dateShort(p.validUntil))}</span></div>
            </div>`;
          }).join('') || '<div class="list-card"><div class="empty-row">Még nincs bérleted.</div></div>'}</div></div>
        <div class="acct-sec"><div class="as-head"><h3>Bérlet vásárlása</h3><small>bankkártyával, azonnal</small></div>
          <div class="buy-grid">${prods.map((p) => `<div class="buy-card">
            <span class="tk-kind">${p.credits} alkalom · ${p.validDays} nap</span><h4>${esc(p.name)}</h4><p>${esc(p.desc || '')}</p>
            <div class="bc-foot"><b class="mono">${money(p.price)}</b><button class="btn dark sm" data-act="buy" data-id="${p.id}">Megveszem</button></div></div>`).join('')}</div></div>`;
    } else if (acctTab === 'szamlak') {
      body = `<div class="acct-sec"><div class="as-head"><h3>Számláim</h3><small>${invs.length} db</small></div>
        <div class="list-card">${invs.map((inv) => `<button class="row inv-row" data-act="inv" data-id="${inv.id}">
          <span class="ir-ic">${I.receipt}</span>
          <span class="row-main"><b class="mono">${esc(inv.no)}</b><small>${esc(UI.dateNum(inv.issuedAt))} · ${esc(inv.items[0] ? inv.items[0].name : '')}</small></span>
          ${inv.status === 'storno' ? '<span class="pill miss">Sztornó</span>' : inv.status === 'stornoed' ? '<span class="pill soft">Sztornózva</span>' : ''}
          <b class="mono ir-amt">${money(inv.total)}</b></button>`).join('') || '<div class="empty-row">Még nincs számlád.</div>'}</div></div>`;
    } else {
      const bl = u.billing || {};
      body = `<div class="acct-sec"><div class="as-head"><h3>Adataim</h3></div>
        <form class="profile js-profile">
          <div class="fld-row"><label class="fld"><span>Név</span><input name="name" value="${esc(u.name)}" required></label>
          <label class="fld"><span>Telefon</span><input name="phone" value="${esc(u.phone || '')}"></label></div>
          <label class="fld"><span>E-mail</span><input name="email" type="email" value="${esc(u.email)}" required></label>
          <h4 class="pf-h">Számlázási adatok</h4>
          <label class="fld"><span>Számlázási név (cég esetén cégnév)</span><input name="bname" value="${esc(bl.name || u.name)}"></label>
          <div class="fld-row three"><label class="fld"><span>Irányítószám</span><input name="zip" value="${esc(bl.zip || '')}"></label>
          <label class="fld"><span>Település</span><input name="city" value="${esc(bl.city || '')}"></label>
          <label class="fld"><span>Adószám (cégnek)</span><input name="tax" value="${esc(bl.taxNumber || '')}"></label></div>
          <label class="fld"><span>Utca, házszám</span><input name="street" value="${esc(bl.street || '')}"></label>
          <label class="toggle"><input type="checkbox" name="marketing" ${u.marketing ? 'checked' : ''}><i></i><span>Kérek hírlevelet (akciók, versenyek, táborok)</span></label>
          <div class="pf-foot"><button class="btn dark">Mentés</button></div>
        </form></div>`;
    }

    root.innerHTML = `
      <section class="wrap acct">
        <div class="acct-head">
          <div class="ah-me">${UI.avatar(u, 'xl')}<div><p class="eyebrow">Fiókom</p><h1 class="h2">Szia, ${esc(UI.firstName(u.name))}!</h1></div></div>
          <div class="ah-stats">
            <div><b>${sum.upcoming}</b><span>közelgő foglalás</span></div>
            <div><b>${passes.reduce((n, p) => n + (p.validUntil >= today ? p.credits - p.used : 0), 0)}</b><span>bérletalkalom</span></div>
            <div><b>${sum.bookings}</b><span>összes játék</span></div>
          </div>
          <button class="btn ghost sm ah-out" data-act="logout">${I.logout}Kilépés</button>
        </div>
        <nav class="acct-tabs">${TABS.map(([k, t, n]) => `<button class="${acctTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${t}${n ? `<i>${n}</i>` : ''}</button>`).join('')}</nav>
        ${body}
      </section>`;
  }

  async function cancelBooking(id) {
    const b = Store.booking(id); if (!b) return;
    const refund = b.paymentId ? 'A kártyás fizetést automatikusan visszautaljuk, a számlát sztornózzuk.' : b.passId ? 'A bérletalkalmat jóváírjuk.' : '';
    const ok = await UI.confirmBox('Lemondod a foglalást?', { ok: 'Lemondás', danger: true, sub: `${UI.cap(UI.dateLong(b.date))}, ${b.start}–${b.end}. ${refund}` });
    if (!ok) return;
    try { Store.cancelBooking(id, { by: 'customer' }); UI.toast('Foglalás lemondva'); renderAccount(); } catch (err) { UI.toast(err.message); }
  }
  async function buyPass(pid) {
    const p = Store.product(pid); const u = me(); if (!p || !u) return;
    const ok = await paymentGateway(p.price);
    if (!ok) return;
    const r = Store.buyPass({ customerId: u.id, productId: pid, method: 'card', by: 'web' });
    UI.toast(`${p.name} megvásárolva – a számlát e-mailben küldtük (${r.invoice.no})`);
    acctTab = 'berletek'; renderAccount();
  }
  function saveProfile(f) {
    const u = me();
    Store.upsertCustomer({
      id: u.id, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), marketing: f.marketing.checked,
      billing: { name: f.bname.value.trim() || f.name.value.trim(), zip: f.zip.value.trim(), city: f.city.value.trim(), street: f.street.value.trim(), taxNumber: f.tax.value.trim() },
    });
    UI.toast('Adatok elmentve');
  }

  // ---------- élő frissítés (másik fülön foglaltak / admin módosított) ----------
  Store.on(() => {
    if (view === 'book') {
      if (st.sel && !Store.isFree(st.sel.courtId, st.date, st.sel.start, st.sel.end)) { st.sel = null; UI.toast('A kiválasztott időpontot közben lefoglalták'); }
      renderDays(); renderGrid(); renderSide();
    }
  });

  UI.makeNoise();
  route();
})();
