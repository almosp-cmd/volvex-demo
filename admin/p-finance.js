/* ==========================================================================
   Admin – Befizetések, Tandíjak, Kintlévőség, Számlák, Eladás rögzítése
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const CAT = Store.CATEGORIES;
  const net = (g, v = 27) => Math.round(g / (1 + v / 100));

  function refText(p) {
    const r = (p.refs || [])[0];
    if (!r) return p.note || '';
    if (r.type === 'booking') { const b = Store.booking(r.id); return b ? `${UI.dateShort(b.date)} ${b.start}–${b.end} · ${(Store.court(b.courtId) || {}).name || ''}` : 'foglalás'; }
    if (r.type === 'series') { const s = Store.seriesById(r.id); return s ? `Állandó: ${UI.DAYS_SHORT[s.day - 1]} ${s.start} · ${r.month ? UI.monthLabel(r.month) : UI.dateShort(r.date)}` : 'állandó foglalás'; }
    if (r.type === 'pass') { const ps = Store.pass(r.id); return ps ? ps.name : 'bérlet'; }
    if (r.type === 'charge') { const c = Store.charge(r.id); return c ? `${c.name} · ${UI.monthLabel(c.month)}` : 'tandíj'; }
    return '';
  }

  // ======================================================================
  // BEFIZETÉSEK
  // ======================================================================
  const pf = { period: 'month', custom: {}, category: '', method: '', q: '' };
  function renderPayments(el) {
    const p = Admin.periodOf(pf.period, pf.custom);
    const q = Store.norm(pf.q);
    const rows = Store.payments({ from: p.from, to: p.to, category: pf.category || undefined, method: pf.method || undefined })
      .filter((x) => !q || Store.norm(Admin.who(x.payer).name).includes(q) || Store.norm((Store.invoice(x.invoiceId) || {}).no).includes(q));
    const all = Store.payments({ from: p.from, to: p.to });
    const byMethod = {}; all.forEach((x) => { byMethod[x.method] = (byMethod[x.method] || 0) + x.amount; });
    const byCat = {}; all.forEach((x) => { const c = x.category === 'refund' ? 'refund' : x.category; byCat[c] = (byCat[c] || 0) + x.amount; });
    const total = all.reduce((a, x) => a + x.amount, 0);

    el.innerHTML = `
      <div class="toolbar">${Admin.periodPicker(pf.period, [['today', 'Ma'], ['week', 'Ez a hét'], ['month', 'Ez a hónap'], ['lastmonth', 'Előző hónap'], ['30', '30 nap'], ['custom', 'Egyedi']], pf.custom)}</div>
      <div class="sumbar"><span>Összesen <b>${money(total)}</b></span><span><b>${all.filter((x) => x.amount > 0).length}</b> befizetés</span>${Object.entries(CAT).filter(([k]) => byCat[k]).map(([k, l]) => `<span>${l} <b class="${byCat[k] < 0 ? 'amt-neg' : ''}">${money(byCat[k])}</b></span>`).join('')}<a class="lnk" href="#/bevetel">Bevételi statisztika ${I.next}</a></div>
      <div class="method-bar">${Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<span>${Admin.methodPill(m)}<b class="mono">${money(v)}</b></span>`).join('')}</div>
      <div class="toolbar">
        <label class="search">${I.search}<input id="pay-q" type="search" placeholder="Befizető, számlaszám…" value="${esc(pf.q)}"></label>
        <select class="inp sm" data-f="category"><option value="">Minden kategória</option>${Object.entries(CAT).map(([k, l]) => `<option value="${k}" ${pf.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="inp sm" data-f="method"><option value="">Minden fizetési mód</option>${Object.entries(Store.PAY_METHODS).map(([k, l]) => `<option value="${k}" ${pf.method === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="csv">${I.download}CSV</button>
        <button class="btn dark sm" data-act="sale">${I.plus}Eladás rögzítése</button>
      </div>
      <div class="js-t"></div>`;
    Admin.table($('.js-t', el), {
      rows, sort: { key: 'at', dir: -1 },
      onRow: (x) => openPayment(x.id),
      rowCls: (x) => (x.refundedBy ? 'is-ref' : ''),
      cols: [
        { key: 'at', label: 'Időpont', cls: 'num', sort: (x) => x.at, render: (x) => `${esc(UI.dateShort(x.at.slice(0, 10)))} <span class="dim">${esc(UI.timeOf(x.at))}</span>` },
        { key: 'who', label: 'Befizető', sort: (x) => Admin.who(x.payer).name, render: (x) => Admin.whoLink(x.payer) },
        { key: 'cat', label: 'Kategória', sort: (x) => x.category, render: (x) => `${esc(CAT[x.category] || x.category)}<span class="t-sub">${esc(refText(x))}</span>` },
        { key: 'method', label: 'Mód', sort: (x) => x.method, render: (x) => Admin.methodPill(x.method) },
        { key: 'src', label: 'Forrás', render: (x) => (x.by === 'web' ? '<span class="chip-s">Web</span>' : '<span class="chip-s dim">Admin</span>') },
        { key: 'inv', label: 'Számla', cls: 'num', render: (x) => (x.invoiceId ? `<button class="lnk mono" data-inv="${x.invoiceId}">${esc((Store.invoice(x.invoiceId) || {}).no || '')}</button>` : '<span class="dim">—</span>') },
        { key: 'amount', label: 'Összeg', align: 'r', cls: 'num', sort: (x) => x.amount, render: (x) => `<b class="${x.amount < 0 ? 'amt-neg' : ''}">${money(x.amount)}</b>${x.refundedBy ? '<span class="t-sub">visszatérítve</span>' : ''}` },
      ],
      foot: (rs) => `<tr><td colspan="6">Összesen (${rs.length} tétel)</td><td class="r num">${money(rs.reduce((a, x) => a + x.amount, 0))}</td></tr>`,
      empty: 'Ebben az időszakban nincs befizetés.',
    });
    $('.js-t', el).addEventListener('click', (e) => { const b = e.target.closest('[data-inv]'); if (b) { e.stopPropagation(); Admin.openInvoice(b.dataset.inv); } }, true);
    Admin.bindFilters(el, pf, () => renderPayments(el));
    el.querySelector('[data-act="sale"]').addEventListener('click', () => newSale());
    el.querySelector('[data-act="csv"]').addEventListener('click', () => Admin.csv(`befizetesek-${p.from}_${p.to}.csv`, [
      { label: 'Időpont', get: (x) => x.at.replace('T', ' ').slice(0, 16) }, { label: 'Befizető', get: (x) => Admin.who(x.payer).name },
      { label: 'Kategória', get: (x) => CAT[x.category] }, { label: 'Tétel', get: refText }, { label: 'Fizetési mód', get: (x) => Store.PAY_METHODS[x.method] },
      { label: 'Összeg (Ft)', get: (x) => x.amount }, { label: 'Számla', get: (x) => (Store.invoice(x.invoiceId) || {}).no || '' }, { label: 'Forrás', get: (x) => (x.by === 'web' ? 'weboldal' : 'admin') },
    ], rows));
  }
  Admin.page('befizetesek', { title: 'Befizetések', sub: 'Minden bevétel egy helyen: online kártya, helyszíni, átutalás, SZÉP-kártya – visszatérítéssel', render: renderPayments });

  function openPayment(id) {
    const p = Store.payment(id); if (!p) return;
    const inv = p.invoiceId ? Store.invoice(p.invoiceId) : null;
    const w = Admin.who(p.payer);
    const orig = p.refOf ? Store.payment(p.refOf) : null;
    const canRefund = p.amount > 0 && !p.refundedBy;
    const sh = Admin.drawer({
      title: p.amount < 0 ? 'Visszatérítés' : 'Befizetés',
      sub: `${esc(UI.dateTime(p.at))} · ${esc(CAT[p.category] || '')}`,
      body: `
        <div class="pay-amt ${p.amount < 0 ? 'neg' : ''}"><b class="mono">${money(p.amount)}</b>${Admin.methodPill(p.method)}</div>
        <div class="dw-sec dw-kv">
          <div><small>Befizető</small><b>${Admin.whoLink(p.payer)}</b></div>
          <div><small>Forrás</small><b>${p.by === 'web' ? 'Weboldal (online)' : 'Admin'}</b></div>
          <div class="full"><small>Tétel</small><b>${esc(refText(p) || CAT[p.category])}</b></div>
          <div><small>Számla</small><b class="mono">${inv ? esc(inv.no) : '—'}</b></div>
          <div><small>Állapot</small><b>${p.refundedBy ? 'Visszatérítve' : orig ? `Visszatérítés ehhez: ${esc(UI.dateShort(orig.at.slice(0, 10)))}` : 'Rendezve'}</b></div>
          ${p.note ? `<div class="full"><small>Megjegyzés</small><b>${esc(p.note)}</b></div>` : ''}
        </div>
        <div class="dw-sec dw-actions">
          ${inv ? `<button class="btn ghost sm" data-act="inv">${I.receipt}Számla megnyitása</button>` : p.amount > 0 ? `<button class="btn ghost sm" data-act="mkinv">${I.receipt}Számla kiállítása</button>` : ''}
          ${canRefund ? `<button class="btn danger-ghost sm" data-act="refund">${I.redo}Visszatérítés</button>` : ''}
        </div>
        ${canRefund && p.method === 'card' ? `<p class="sheet-note">Online kártyás fizetésnél élesben a visszatérítést a fizetési szolgáltató (pl. Barion / SimplePay) automatikusan visszautalja a kártyára.</p>` : ''}`,
    });
    sh.el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'inv') Admin.openInvoice(inv.id);
      if (a.dataset.act === 'mkinv') { const n = Store.issueInvoiceForPayment(p.id); UI.toast(`Számla kiállítva: ${n.no}`); sh.close(); }
      if (a.dataset.act === 'refund') {
        const ok = await UI.confirmBox(`Visszatérítesz ${money(p.amount)}-ot?`, { ok: 'Visszatérítés', danger: true, sub: 'A visszatérítés negatív tételként kerül a befizetések közé, a számlát sztornózzuk. A kapcsolódó foglalást a naptárban külön mondhatod le.' });
        if (ok) { Store.refundPayment(p.id, { note: 'Admin visszatérítés' }); UI.toast('Visszatérítés rögzítve'); sh.close(); }
      }
    });
  }

  // ======================================================================
  // ELADÁS RÖGZÍTÉSE
  // ======================================================================
  function newSale(pre = {}) {
    const prods = Store.products().filter((p) => p.kind !== 'pass' && p.active !== false);
    let payer = pre.payer || null; let guest = !payer;
    const lines = [{ name: prods[0] ? prods[0].name : '', gross: prods[0] ? prods[0].price : 0, qty: 1 }];
    const sh = Admin.drawer({
      title: 'Eladás rögzítése',
      sub: 'Ajándékkártya, labda- és ütőbérlés, rendezvény vagy bármilyen egyedi tétel',
      body: '<form class="sale-form"></form>',
      footer: '<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Rögzítés</button>',
    });
    const f = $('.sale-form', sh.el);
    function draw() {
      const total = lines.reduce((a, l) => a + (Number(l.gross) || 0) * (Number(l.qty) || 1), 0);
      f.innerHTML = `
        <div class="fld"><span>Vevő</span><div class="seg-ctl wide"><button type="button" data-g="1" class="${guest ? 'on' : ''}">Magánszemély / vendég</button><button type="button" data-g="0" class="${!guest ? 'on' : ''}">Meglévő ügyfél</button></div></div>
        ${guest ? '<label class="fld"><span>Vevő neve (számlán)</span><input data-buyer placeholder="pl. Kovács Anna"></label>' : '<div class="js-cp" style="margin-bottom:16px"></div>'}
        <div class="fld"><span>Tételek</span>
          <div class="sale-lines">${lines.map((l, i) => `<div class="sl"><input list="sale-p" data-l="${i}" data-k="name" value="${esc(l.name)}" placeholder="Megnevezés"><input type="number" data-l="${i}" data-k="qty" value="${l.qty}" min="1" class="q"><input type="number" data-l="${i}" data-k="gross" value="${l.gross}" step="100" class="p"><button type="button" class="icon-btn ghost sm" data-rm="${i}">${I.x}</button></div>`).join('')}</div>
          <datalist id="sale-p">${prods.map((p) => `<option value="${esc(p.name)}">${p.price ? money(p.price) : ''}</option>`).join('')}</datalist>
          <button type="button" class="btn sm ghost" data-add style="margin-top:8px">${I.plus}Tétel</button>
        </div>
        <div class="fld-row"><label class="fld"><span>Fizetési mód</span><select data-method>${Admin.PAY_OPTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><div class="fld"><span>Összesen</span><div class="ro mono">${money(total)}</div></div></div>
        <label class="toggle"><input type="checkbox" data-inv checked><i></i><span>Számla kiállítása</span></label>`;
      if (!guest) Admin.customerPicker($('.js-cp', f), { value: payer && payer.id, onChange: (v) => { payer = v ? { kind: 'customer', id: v } : null; } });
    }
    f.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]'); if (g) { guest = g.dataset.g === '1'; if (guest) payer = null; draw(); return; }
      if (e.target.closest('[data-add]')) { lines.push({ name: '', gross: 0, qty: 1 }); draw(); return; }
      const rm = e.target.closest('[data-rm]'); if (rm && lines.length > 1) { lines.splice(Number(rm.dataset.rm), 1); draw(); }
    });
    f.addEventListener('change', (e) => {
      const x = e.target; if (x.dataset.l == null) return;
      const l = lines[Number(x.dataset.l)];
      l[x.dataset.k] = x.dataset.k === 'name' ? x.value : Number(x.value) || 0;
      if (x.dataset.k === 'name') { const pr = prods.find((p) => p.name === x.value); if (pr && pr.price) l.gross = pr.price; }
      draw();
    });
    draw();
    $('.js-save', sh.el).addEventListener('click', () => {
      const items = lines.filter((l) => l.name && l.gross).map((l) => {
        const pr = prods.find((p) => p.name === l.name);
        const code = pr && pr.kind === 'giftcard' ? ` – kód: ${Math.random().toString(36).slice(2, 8).toUpperCase()}` : '';
        return { name: l.name + code, qty: l.qty || 1, unit: 'db', gross: l.gross, vat: pr ? pr.vat : Store.settings().invoice.vat };
      });
      if (!items.length) { UI.toast('Adj meg legalább egy tételt összeggel'); return; }
      if (!guest && !payer) { UI.toast('Válassz ügyfelet'); return; }
      const bn = $('[data-buyer]', f);
      const buyer = guest ? { name: (bn && bn.value.trim()) || 'Magánszemély', address: '', taxNumber: '', email: '' } : null;
      const p = Store.recordSale({ payer, items, method: $('[data-method]', f).value, invoice: $('[data-inv]', f).checked, buyer });
      sh.close(); UI.toast(`Eladás rögzítve: ${money(p.amount)}${p.invoiceId ? ` · ${Store.invoice(p.invoiceId).no}` : ''}`);
    });
  }

  // ======================================================================
  // TANDÍJAK
  // ======================================================================
  const tf = { month: null, status: '', prog: '', q: '' };
  function renderTuition(el, r) {
    const today = Store.todayYmd();
    if (!tf.month) tf.month = Store.monthOf(today);
    if (r && r.q && r.q.f === 'overdue' && !tf._init) { tf.status = 'overdue'; tf._init = true; }
    const all = Store.charges({ month: tf.month }).filter((c) => c.status !== 'void' || tf.status === 'void');
    const active = Store.students().filter((s) => s.active !== false && s.programId);
    const missing = active.filter((s) => !Store.charges({ month: tf.month, studentId: s.id }).some((c) => c.status !== 'void'));
    const paid = all.filter((c) => c.status === 'paid'); const open = all.filter((c) => c.status === 'open');
    const overdue = open.filter((c) => c.due < today);
    const q = Store.norm(tf.q);
    const rows = all.filter((c) => (tf.status === 'open' ? c.status === 'open' : tf.status === 'paid' ? c.status === 'paid' : tf.status === 'overdue' ? c.status === 'open' && c.due < today : tf.status === 'void' ? c.status === 'void' : true))
      .filter((c) => !tf.prog || c.programId === tf.prog)
      .map((c) => ({ ...c, s: Store.student(c.studentId), pay: c.paymentId ? Store.payment(c.paymentId) : null }))
      .filter((c) => !q || Store.norm(c.s && c.s.name).includes(q) || Store.norm(c.s && c.s.parentName).includes(q));
    const sumA = (xs) => xs.reduce((a, c) => a + c.amount, 0);

    el.innerHTML = `
      <div class="toolbar">
        <div class="month-nav"><button class="icon-btn sm" data-m="-1">${I.prev}</button><b>${esc(UI.monthLabel(tf.month))}</b><button class="icon-btn sm" data-m="1">${I.next}</button></div>
        <span class="grow"></span>
        ${missing.length ? `<button class="btn dark sm" data-act="gen">${I.plus}${all.length ? `${missing.length} hiányzó díj kiírása` : `Havi díjak kiírása (${missing.length} diák)`}</button>` : ''}
      </div>
      ${all.length ? `<div class="sumbar">
        <span>Kiírva <b>${money(sumA(all))}</b> · ${all.length} diák</span>
        <span class="sum-prog"><span class="usage"><i style="--w:${Math.round((paid.length / all.length) * 100)}%"></i></span><span>Befizetve <b>${money(sumA(paid))}</b> · ${paid.length} diák (${Math.round((paid.length / all.length) * 100)}%)</span></span>
        <span>Nyitott <b>${money(sumA(open))}</b> · ${open.length} diák</span>
        <span>Lejárt <b class="${overdue.length ? 'warn-t' : ''}">${money(sumA(overdue))}</b> · ${overdue.length} diák</span>
      </div>` : ''}
      ${!all.length ? `<div class="card empty-big">${Admin.X.coin}<h3>${esc(UI.monthLabel(tf.month))} tandíjai még nincsenek kiírva</h3><p>Egy kattintással minden aktív diáknak létrejön a havi díj a programja és a kedvezménye alapján. Utána egyenként vagy tömegesen rögzítheted a befizetéseket, és emlékeztetőt küldhetsz.</p>${missing.length ? `<button class="btn dark" data-act="gen">Díjak kiírása · ${missing.length} diák · ${money(missing.reduce((a, s) => a + Math.round(Store.program(s.programId).fee * (1 - (s.discount || 0) / 100)), 0))}</button>` : ''}</div>` : `
      <div class="toolbar">
        <label class="search">${I.search}<input id="tu-q" type="search" placeholder="Diák vagy szülő…" value="${esc(tf.q)}"></label>
        <select class="inp sm" data-f="status"><option value="">Minden állapot</option><option value="open" ${tf.status === 'open' ? 'selected' : ''}>Nyitott</option><option value="overdue" ${tf.status === 'overdue' ? 'selected' : ''}>Lejárt</option><option value="paid" ${tf.status === 'paid' ? 'selected' : ''}>Fizetve</option><option value="void" ${tf.status === 'void' ? 'selected' : ''}>Elengedve</option></select>
        <select class="inp sm" data-f="prog"><option value="">Minden program</option>${Store.programs().map((p) => `<option value="${p.id}" ${tf.prog === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <span class="grow"></span>
        ${open.length ? `<button class="btn ghost sm" data-act="remind-all">${I.mail}Emlékeztető minden nyitottnak (${open.length})</button>` : ''}
        <button class="btn ghost sm" data-act="csv">${I.download}CSV</button>
      </div>
      <div class="js-t"></div>`}`;

    if (all.length) {
      Admin.table($('.js-t', el), {
        rows, sort: { key: 'status', dir: 1 },
        onRow: (c) => c.s && Admin.actions.openStudent(c.s.id),
        rowCls: (c) => (c.status === 'void' ? 'is-cx' : ''),
        cols: [
          { key: 'name', label: 'Diák', sort: (c) => c.s && c.s.name, render: (c) => (c.s ? `<div class="t-person">${UI.avatar(c.s)}<span><b>${esc(c.s.name)}</b><small>${c.s.parentName ? `szülő: ${esc(c.s.parentName)}` : esc(c.s.email || '')}</small></span></div>` : '—') },
          { key: 'prog', label: 'Program', sort: (c) => c.programId, render: (c) => { const p = Store.program(c.programId); return p ? `<i class="dotc" style="background:${p.color}"></i>${esc(p.name)}` : ''; } },
          { key: 'amount', label: 'Összeg', align: 'r', cls: 'num', sort: (c) => c.amount, render: (c) => money(c.amount) },
          { key: 'due', label: 'Határidő', cls: 'num', sort: (c) => c.due, render: (c) => esc(UI.dateShort(c.due)) },
          { key: 'status', label: 'Állapot', sort: (c) => (c.status === 'open' ? (c.due < today ? 0 : 1) : c.status === 'paid' ? 2 : 3), render: (c) => (c.status === 'paid' ? `<span class="pill ok">${I.check}Fizetve</span><span class="t-sub">${esc(c.pay ? `${UI.dateShort(c.pay.at.slice(0, 10))} · ${Admin.METHOD_SHORT[c.pay.method]}` : '')}</span>` : c.status === 'void' ? '<span class="pill soft">Elengedve</span>' : c.due < today ? '<span class="pill miss">Lejárt</span>' : '<span class="pill todo">Nyitott</span>') },
          { key: 'rem', label: 'Emlékeztető', cls: 'dim', render: (c) => (c.remindedAt ? esc(UI.dateShort(c.remindedAt.slice(0, 10))) : '') },
          { key: 'act', label: '', align: 'r', render: (c) => (c.status === 'open' ? `<span class="row-acts"><button class="btn sm dark" data-pay="${c.id}">Befizetés</button><button class="icon-btn sm" data-rem="${c.id}" title="Emlékeztető">${I.mail}</button><button class="icon-btn sm" data-void="${c.id}" title="Elengedés">${I.x}</button></span>` : c.paymentId && c.pay && c.pay.invoiceId ? `<button class="icon-btn sm" data-inv="${c.pay.invoiceId}" title="Számla">${I.receipt}</button>` : '') },
        ],
        empty: 'Nincs a szűrésnek megfelelő tétel.',
      });
      $('.js-t', el).addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pay], [data-rem], [data-void], [data-inv]'); if (!b) return;
        e.stopPropagation();
        if (b.dataset.inv) Admin.openInvoice(b.dataset.inv);
        if (b.dataset.pay) { const m = await Admin.actions.pickMethod('Tandíj fizetési módja'); if (m) { Store.payCharge(b.dataset.pay, m); UI.toast('Befizetés rögzítve, számla kiállítva'); } }
        if (b.dataset.rem) { Store.remindCharge(b.dataset.rem); UI.toast(Store.isDemo ? 'Emlékeztető „elküldve” (demó – élesben e-mail megy a szülőnek)' : 'Emlékeztető elküldve'); }
        if (b.dataset.void) { const ok = await UI.confirmBox('Elengeded ezt a havidíjat?', { ok: 'Elengedés', sub: 'Pl. betegség, szünet vagy egyedi megállapodás miatt. Később nem kerül a kintlévőségek közé.' }); if (ok) Store.voidCharge(b.dataset.void); }
      }, true);
      Admin.bindFilters(el, tf, () => renderTuition(el));
      const ra = el.querySelector('[data-act="remind-all"]');
      if (ra) ra.addEventListener('click', async () => { const ok = await UI.confirmBox(`Emlékeztetőt küldesz ${open.length} szülőnek / diáknak?`, { ok: 'Küldés', sub: 'Az e-mail tartalmazza az összeget, a határidőt és a fizetési módokat.' }); if (ok) { open.forEach((c) => Store.remindCharge(c.id)); UI.toast(`${open.length} emlékeztető ${Store.isDemo ? '„elküldve” (demó)' : 'elküldve'}`); } });
      el.querySelector('[data-act="csv"]').addEventListener('click', () => Admin.csv(`tandijak-${tf.month}.csv`, [
        { label: 'Diák', get: (c) => c.s && c.s.name }, { label: 'Szülő', get: (c) => c.s && c.s.parentName }, { label: 'Program', get: (c) => (Store.program(c.programId) || {}).name },
        { label: 'Összeg (Ft)', get: (c) => c.amount }, { label: 'Határidő', get: (c) => c.due }, { label: 'Állapot', get: (c) => ({ open: 'nyitott', paid: 'fizetve', void: 'elengedve' })[c.status] },
        { label: 'Fizetve', get: (c) => (c.pay ? c.pay.at.slice(0, 10) : '') }, { label: 'Mód', get: (c) => (c.pay ? Store.PAY_METHODS[c.pay.method] : '') },
      ], rows));
    }
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { tf.month = Store.shiftMonth(tf.month, Number(b.dataset.m)); renderTuition(el); }));
    el.querySelectorAll('[data-act="gen"]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await UI.confirmBox(`Kiírod ${UI.monthLabel(tf.month)} tandíjait?`, { ok: 'Kiírás', sub: `${missing.length} aktív diák kap díjat a programja és a kedvezménye alapján. Határidő: ${tf.month}-10.` });
      if (ok) { const n = Store.generateCharges(tf.month); UI.toast(`${n} havidíj kiírva`); }
    }));
  }
  Admin.page('tandijak', { title: 'Tandíjak', sub: 'Havi edzésdíjak kiírása, befizetések rögzítése, emlékeztetők', render: renderTuition });

  // ======================================================================
  // KINTLÉVŐSÉG
  // ======================================================================
  function renderReceivables(el) {
    const recv = Store.receivables();
    const groups = {};
    recv.forEach((r) => {
      const k = `${r.who.kind}:${r.who.id}`;
      (groups[k] = groups[k] || { who: r.who, items: [], total: 0, oldest: r.date }).items.push(r);
      groups[k].total += r.amount; if (r.date < groups[k].oldest) groups[k].oldest = r.date;
    });
    const rows = Object.values(groups).map((g, i) => ({ ...g, id: String(i) }));
    const total = recv.reduce((a, r) => a + r.amount, 0);
    const byKind = { booking: 0, series: 0, charge: 0 }; recv.forEach((r) => { byKind[r.kind] += r.amount; });
    el.innerHTML = `
      <div class="sumbar"><span>Összesen <b class="${total ? 'warn-t' : ''}">${money(total)}</b></span><span><b>${rows.length}</b> adós · <b>${recv.length}</b> tétel</span><span>Lejátszott egyszeri foglalás <b>${money(byKind.booking)}</b></span><span>Állandó foglalás, elmúlt alkalmak <b>${money(byKind.series)}</b></span><span>Lejárt tandíj <b>${money(byKind.charge)}</b></span></div>
      <div class="js-t"></div>`;
    Admin.table($('.js-t', el), {
      rows, sort: { key: 'total', dir: -1 },
      cols: [
        { key: 'who', label: 'Adós', sort: (g) => Admin.who(g.who).name, render: (g) => `${Admin.whoLink(g.who)}<span class="t-sub">${g.who.kind === 'customer' ? 'ügyfél' : `diák${Admin.who(g.who).sub.startsWith('szülő') ? ` · ${esc(Admin.who(g.who).sub)}` : ''}`}</span>` },
        { key: 'items', label: 'Tételek', render: (g) => `<div class="recv-items">${g.items.slice(0, 4).map((r) => `<button class="recv-it" data-rk="${r.kind}" data-rid="${esc(r.key || r.id)}"><span>${esc(UI.dateShort(r.date))} · ${esc(r.label)}</span><b class="mono">${money(r.amount)}</b></button>`).join('')}${g.items.length > 4 ? `<span class="t-sub">+ még ${g.items.length - 4} tétel</span>` : ''}</div>` },
        { key: 'oldest', label: 'Legrégebbi', cls: 'num', sort: (g) => g.oldest, render: (g) => `${esc(UI.dateShort(g.oldest))}<span class="t-sub">${Store.daysBetween(g.oldest, Store.todayYmd())} napja</span>` },
        { key: 'total', label: 'Összesen', align: 'r', cls: 'num', sort: (g) => g.total, render: (g) => `<b class="warn-t">${money(g.total)}</b>` },
      ],
      empty: '🎾 Nincs kintlévőség – minden rendezve.',
    });
    $('.js-t', el).addEventListener('click', (e) => {
      const b = e.target.closest('.recv-it'); if (!b) return;
      if (b.dataset.rk === 'charge') { const c = Store.charge(b.dataset.rid); if (c) Admin.actions.openStudent(c.studentId); } else Admin.actions.openItem(b.dataset.rid);
    });
  }
  Admin.page('kintlevoseg', { title: 'Kintlévőség', sub: 'Lejátszott, de ki nem fizetett foglalások és lejárt tandíjak, adósonként', render: renderReceivables });

  // ======================================================================
  // SZÁMLÁK
  // ======================================================================
  const inf = { period: 'month', custom: {}, status: '', q: '' };
  function renderInvoices(el) {
    const p = Admin.periodOf(inf.period, inf.custom);
    const q = Store.norm(inf.q);
    const all = Store.invoices({ from: p.from, to: p.to });
    const rows = all.filter((i) => (!inf.status || (inf.status === 'storno' ? i.status === 'storno' || i.status === 'stornoed' : i.status === 'issued')))
      .filter((i) => !q || [i.no, i.buyer.name, i.buyer.taxNumber].some((x) => Store.norm(x).includes(q)));
    const gross = all.reduce((a, i) => a + i.total, 0);
    const vat = all.reduce((a, i) => a + i.items.reduce((s, it) => s + (it.gross * (it.qty || 1) - net(it.gross * (it.qty || 1), it.vat)), 0), 0);
    const integ = Store.settings().integrations.invoicing;
    el.innerHTML = `
      <div class="toolbar">${Admin.periodPicker(inf.period, [['month', 'Ez a hónap'], ['lastmonth', 'Előző hónap'], ['30', '30 nap'], ['custom', 'Egyedi']], inf.custom)}</div>
      <div class="note ${integ.provider ? 'info' : 'warn'}" style="margin-bottom:14px">${I.receipt}<span>${integ.provider ? `Számlázó: <b>${esc(integ.provider)}</b> – a számlák automatikusan a NAV Online Számla rendszerbe kerülnek.` : '<b>Demó számlázás.</b> Élesben a számlákat egy számlázó szolgáltató (pl. Számlázz.hu vagy Billingo) állítja ki és jelenti a NAV-nak – a <a class="lnk" href="#/beallitasok">Beállításokban</a> köthető be.'}</span></div>
      <div class="sumbar"><span><b>${all.length}</b> számla · ${all.filter((i) => i.status === 'storno').length} sztornó</span><span>Bruttó <b>${money(gross)}</b></span><span>Nettó <b>${money(gross - vat)}</b></span><span>ÁFA <b>${money(vat)}</b></span></div>
      <div class="toolbar">
        <label class="search">${I.search}<input id="inv-q" type="search" placeholder="Sorszám, vevő, adószám…" value="${esc(inf.q)}"></label>
        <select class="inp sm" data-f="status"><option value="">Minden számla</option><option value="issued" ${inf.status === 'issued' ? 'selected' : ''}>Érvényes</option><option value="storno" ${inf.status === 'storno' ? 'selected' : ''}>Sztornó / sztornózott</option></select>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="csv">${I.download}Export könyvelőnek (CSV)</button>
      </div>
      <div class="js-t"></div>`;
    Admin.table($('.js-t', el), {
      rows, sort: { key: 'no', dir: -1 },
      onRow: (i) => Admin.openInvoice(i.id),
      rowCls: (i) => (i.status === 'stornoed' ? 'is-cx' : ''),
      cols: [
        { key: 'no', label: 'Sorszám', cls: 'num', sort: (i) => i.no, render: (i) => `<b>${esc(i.no)}</b>` },
        { key: 'date', label: 'Kelt', cls: 'num dim', sort: (i) => i.issuedAt, render: (i) => esc(UI.dateShort(i.issuedAt)) },
        { key: 'buyer', label: 'Vevő', sort: (i) => i.buyer.name, render: (i) => `${esc(i.buyer.name)}${i.buyer.taxNumber ? `<span class="t-sub mono">${esc(i.buyer.taxNumber)}</span>` : ''}` },
        { key: 'item', label: 'Tétel', render: (i) => `<span class="clip">${esc(i.items.map((it) => it.name).join(', '))}</span>` },
        { key: 'method', label: 'Mód', render: (i) => Admin.methodPill(i.method) },
        { key: 'status', label: 'Állapot', render: (i) => (i.status === 'storno' ? '<span class="pill miss">Sztornó</span>' : i.status === 'stornoed' ? '<span class="pill soft">Sztornózva</span>' : '<span class="pill ok">Érvényes</span>') },
        { key: 'total', label: 'Bruttó', align: 'r', cls: 'num', sort: (i) => i.total, render: (i) => `<b class="${i.total < 0 ? 'amt-neg' : ''}">${money(i.total)}</b>` },
      ],
      empty: 'Ebben az időszakban nincs számla.',
    });
    Admin.bindFilters(el, inf, () => renderInvoices(el));
    el.querySelector('[data-act="csv"]').addEventListener('click', () => Admin.csv(`szamlak-${p.from}_${p.to}.csv`, [
      { label: 'Sorszám', get: (i) => i.no }, { label: 'Kelt', get: (i) => i.issuedAt }, { label: 'Teljesítés', get: (i) => i.fulfilledAt }, { label: 'Fizetési határidő', get: (i) => i.dueAt },
      { label: 'Vevő', get: (i) => i.buyer.name }, { label: 'Vevő címe', get: (i) => i.buyer.address }, { label: 'Vevő adószáma', get: (i) => i.buyer.taxNumber },
      { label: 'Tételek', get: (i) => i.items.map((it) => `${it.name} x${it.qty || 1}`).join(' | ') }, { label: 'Fizetési mód', get: (i) => Store.PAY_METHODS[i.method] },
      { label: 'Nettó (Ft)', get: (i) => i.items.reduce((a, it) => a + net(it.gross * (it.qty || 1), it.vat), 0) },
      { label: 'ÁFA (Ft)', get: (i) => i.items.reduce((a, it) => a + it.gross * (it.qty || 1) - net(it.gross * (it.qty || 1), it.vat), 0) },
      { label: 'Bruttó (Ft)', get: (i) => i.total }, { label: 'Állapot', get: (i) => ({ issued: 'érvényes', storno: 'sztornó', stornoed: 'sztornózott' })[i.status] },
    ], rows));
  }
  Admin.page('szamlak', { title: 'Számlák', sub: 'Kiállított és sztornó számlák, export a könyvelőnek', render: renderInvoices });

  Object.assign(Admin.actions, { newSale, openPayment });
})();
