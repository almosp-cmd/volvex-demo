/* ==========================================================================
   Admin – Ügyfelek (pályabérlők) + Bérletek
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;

  // ======================================================================
  // ÜGYFELEK LISTA
  // ======================================================================
  const f = { q: '', show: '' };
  function renderList(el) {
    const today = Store.todayYmd();
    const q = Store.norm(f.q);
    const rows = Store.customers().map((c) => {
      const s = Store.customerSummary(c.id);
      const ps = Store.passesOf(c.id).filter((p) => p.validUntil >= today && p.used < p.credits);
      return { ...c, s, passLeft: ps.reduce((a, p) => a + p.credits - p.used, 0), regularN: s.regular.length };
    }).filter((c) => {
      if (q && ![c.name, c.email, c.phone, (c.billing || {}).name].some((x) => Store.norm(x).includes(q))) return false;
      if (f.show === 'debt' && !c.s.unpaid) return false;
      if (f.show === 'pass' && !c.passLeft) return false;
      if (f.show === 'regular' && !c.regularN) return false;
      if (f.show === 'company' && !((c.billing || {}).taxNumber)) return false;
      return true;
    });
    const debt = rows.reduce((a, r) => a + r.s.unpaid, 0);

    el.innerHTML = `
      <div class="toolbar">
        <label class="search">${I.search}<input id="cu-q" type="search" placeholder="Név, e-mail, telefon, cégnév…" value="${esc(f.q)}"></label>
        <select class="inp sm" data-f="show"><option value="">Minden ügyfél</option><option value="debt" ${f.show === 'debt' ? 'selected' : ''}>Tartozással</option><option value="pass" ${f.show === 'pass' ? 'selected' : ''}>Aktív bérlettel</option><option value="regular" ${f.show === 'regular' ? 'selected' : ''}>Állandó időponttal</option><option value="company" ${f.show === 'company' ? 'selected' : ''}>Céges számlázás</option></select>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="csv">${I.download}CSV</button>
        <button class="btn dark sm" data-act="new">${I.plus}Új ügyfél</button>
      </div>
      <div class="sumbar"><span><b>${rows.length}</b> ügyfél</span><span><b>${rows.filter((r) => r.passLeft).length}</b> aktív bérlettel</span><span><b>${rows.filter((r) => r.regularN).length}</b> állandó időponttal</span><span><b class="${debt ? 'warn-t' : ''}">${money(debt)}</b> tartozás összesen</span></div>
      <div class="js-t"></div>`;

    Admin.table($('.js-t', el), {
      rows,
      sort: { key: 'name', dir: 1 },
      onRow: (r) => openCustomer(r.id),
      cols: [
        { key: 'name', label: 'Ügyfél', sort: (r) => r.name, render: (r) => `<div class="t-person">${UI.avatar(r)}<span><b>${esc(r.name)}</b><small>${esc(r.email || '')}</small></span></div>` },
        { key: 'phone', label: 'Telefon', cls: 'num dim', render: (r) => esc(r.phone || '') },
        { key: 'bk', label: 'Foglalás', align: 'r', cls: 'num', sort: (r) => r.s.bookings, render: (r) => `${r.s.bookings}${r.s.upcoming ? ` <span class="t-sub">${r.s.upcoming} közelgő</span>` : ''}` },
        { key: 'pass', label: 'Bérlet', align: 'r', cls: 'num', sort: (r) => r.passLeft, render: (r) => (r.passLeft ? `${r.passLeft} alk.` : '<span class="dim">—</span>') },
        { key: 'reg', label: 'Állandó', align: 'c', sort: (r) => r.regularN, render: (r) => (r.regularN ? `<span class="chip-s">${r.regularN}×/hét</span>` : '') },
        { key: 'spent', label: 'Költés', align: 'r', cls: 'num', sort: (r) => r.s.spent, render: (r) => money(r.s.spent) },
        { key: 'debt', label: 'Tartozás', align: 'r', cls: 'num', sort: (r) => r.s.unpaid, render: (r) => (r.s.unpaid ? `<b class="warn-t">${money(r.s.unpaid)}</b>` : '<span class="dim">—</span>') },
        { key: 'last', label: 'Utolsó játék', cls: 'num dim', sort: (r) => r.s.lastAt, render: (r) => esc(r.s.lastAt ? UI.dateShort(r.s.lastAt) : '—') },
      ],
      empty: 'Nincs a keresésnek megfelelő ügyfél.',
    });
    Admin.bindFilters(el, f, () => renderList(el));
    el.querySelector('[data-act="new"]').addEventListener('click', () => editCustomer());
    el.querySelector('[data-act="csv"]').addEventListener('click', () => Admin.csv('ugyfelek.csv', [
      { label: 'Név', get: (r) => r.name }, { label: 'E-mail', get: (r) => r.email }, { label: 'Telefon', get: (r) => r.phone },
      { label: 'Számlázási név', get: (r) => (r.billing || {}).name }, { label: 'Adószám', get: (r) => (r.billing || {}).taxNumber },
      { label: 'Cím', get: (r) => { const b = r.billing || {}; return [b.zip, b.city, b.street].filter(Boolean).join(' '); } },
      { label: 'Foglalások', get: (r) => r.s.bookings }, { label: 'Költés (Ft)', get: (r) => r.s.spent }, { label: 'Tartozás (Ft)', get: (r) => r.s.unpaid },
      { label: 'Hírlevél', get: (r) => (r.marketing ? 'igen' : 'nem') },
    ], rows));
  }

  Admin.page('ugyfelek', {
    title: 'Ügyfelek',
    sub: 'Pályabérlők: elérhetőség, számlázási adatok, foglalások, bérletek, egyenleg',
    render: renderList,
  });

  // ======================================================================
  // ÜGYFÉL PANEL
  // ======================================================================
  function openCustomer(id) {
    const c = Store.customer(id); if (!c) return;
    const today = Store.todayYmd();
    const s = Store.customerSummary(id);
    const bks = Store.bookings({ customerId: id });
    const upcoming = bks.filter((b) => b.status !== 'cancelled' && b.date >= today);
    const past = bks.filter((b) => b.date < today || b.status === 'cancelled').reverse();
    const passes = Store.passesOf(id);
    const pays = Store.paymentsOf('customer', id);
    const bl = c.billing || {};
    const bkLi = (b) => `<button class="li" data-key="b:${b.id}"><span><b>${esc(UI.dateShort(b.date))} · ${b.start}–${b.end}</b><small>${esc((Store.court(b.courtId) || {}).name || '')} · ${b.source === 'web' ? 'online' : 'admin'}</small></span>${Admin.payStatus(Store.itemByKey(`b:${b.id}`))}<span class="num">${money(b.price)}</span></button>`;

    const sh = Admin.drawer({
      wide: true,
      title: c.name,
      sub: `Ügyfél ${esc(UI.dateShort(c.createdAt.slice(0, 10)))} óta${c.marketing ? ' · hírlevél ✓' : ''}`,
      body: `
        <div class="dw-stats">
          <div><b>${s.bookings}</b><span>foglalás</span></div>
          <div><b>${money(s.spent)}</b><span>összes befizetés</span></div>
          <div class="${s.unpaid ? 'bad' : ''}"><b>${money(s.unpaid)}</b><span>tartozás</span></div>
        </div>
        <div class="dw-sec dw-actions">
          <button class="btn dark sm" data-act="book">${I.cal}Foglalás neki</button>
          <button class="btn ghost sm" data-act="series">${I.redo}Állandó időpont</button>
          <button class="btn ghost sm" data-act="pass">${I.ticket}Bérlet eladása</button>
          <button class="btn ghost sm" data-act="sale">${I.cash}Eladás</button>
          <button class="btn ghost sm" data-act="edit">${I.edit}Adatok</button>
          ${c.email ? `<a class="btn ghost sm" href="mailto:${esc(c.email)}">${I.mail}E-mail</a>` : ''}
          ${c.phone ? `<a class="btn ghost sm" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${I.phone}Hívás</a>` : ''}
        </div>
        <div class="dw-sec dw-kv">
          <div><small>E-mail</small><b>${esc(c.email || '—')}</b></div>
          <div><small>Telefon</small><b class="mono">${esc(c.phone || '—')}</b></div>
          <div><small>Számlázási név</small><b>${esc(bl.name || c.name)}</b></div>
          <div><small>Adószám</small><b class="mono">${esc(bl.taxNumber || '—')}</b></div>
          <div class="full"><small>Számlázási cím</small><b>${esc([bl.zip, bl.city, bl.street].filter(Boolean).join(' ') || '—')}</b></div>
          ${c.note ? `<div class="full"><small>Megjegyzés</small><b>${esc(c.note)}</b></div>` : ''}
        </div>
        ${s.unpaidList.length ? `<div class="dw-sec"><h4>Kifizetetlen foglalások <small>${money(s.unpaidList.reduce((a, b) => a + b.price, 0))}</small></h4><div class="dw-card dw-list">${s.unpaidList.map(bkLi).join('')}</div></div>` : ''}
        ${s.regular.length ? `<div class="dw-sec"><h4>Állandó időpontok</h4><div class="dw-card dw-list">${s.regular.map((r) => {
          const mr = Store.monthRange(Store.monthOf(today)); const un = Store.seriesDates(r, mr.from, mr.to).filter((d) => !(r.paid || {})[d]).length;
          return `<button class="li" data-ser="${r.id}"><span><b>Minden ${esc(UI.DAYS[r.day - 1])} ${r.start}–${r.end}</b><small>${esc((Store.court(r.courtId) || {}).name || '')} · ${esc(UI.dateShort(r.from))} – ${esc(r.to ? UI.dateShort(r.to) : '…')}</small></span>${un ? `<span class="pill warn">${un} alk. fizetendő</span>` : '<span class="pill ok">rendezve</span>'}<span class="num">${money(r.price)}/alk.</span></button>`;
        }).join('')}</div></div>` : ''}
        <div class="dw-sec"><h4>Közelgő foglalások <small>${upcoming.length} db</small></h4><div class="dw-card dw-list">${upcoming.map(bkLi).join('') || '<p class="empty-s">Nincs közelgő foglalás.</p>'}</div></div>
        <div class="dw-sec"><h4>Bérletek</h4><div class="dw-card dw-list">${passes.map((p) => `<div class="li"><span><b>${esc(p.name)}</b><small>Vásárolva ${esc(UI.dateShort(p.boughtAt))} · érvényes ${esc(UI.dateShort(p.validUntil))}-ig</small></span>${p.validUntil < today ? '<span class="pill soft">Lejárt</span>' : ''}<span class="num">${p.credits - p.used}/${p.credits}</span></div>`).join('') || '<p class="empty-s">Nincs bérlete.</p>'}</div></div>
        <div class="dw-sec"><h4>Befizetések és számlák <small>${pays.length} db</small></h4><div class="dw-card dw-list">${pays.slice(0, 15).map((p) => `<button class="li" ${p.invoiceId ? `data-inv="${p.invoiceId}"` : ''}><span><b>${esc(Store.CATEGORIES[p.category])}</b><small>${esc(UI.dateTime(p.at))} · ${p.invoiceId ? esc((Store.invoice(p.invoiceId) || {}).no || '') : 'számla nélkül'}</small></span>${Admin.methodPill(p.method)}<span class="num ${p.amount < 0 ? 'amt-neg' : ''}">${money(p.amount)}</span></button>`).join('') || '<p class="empty-s">Még nincs befizetés.</p>'}</div></div>
        <div class="dw-sec"><h4>Korábbi foglalások <small>${past.length} db</small></h4><div class="dw-card dw-list">${past.slice(0, 12).map(bkLi).join('') || '<p class="empty-s">Nincs korábbi foglalás.</p>'}</div></div>`,
      footer: '<button class="btn danger-ghost l" data-act="del">Ügyfél törlése</button><button class="btn ghost" data-close>Bezárás</button>',
    });
    sh.el.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-key]'); if (k) { Admin.actions.openItem(k.dataset.key); return; }
      const sr = e.target.closest('[data-ser]'); if (sr) { Admin.actions.editSeries(sr.dataset.ser); return; }
      const iv = e.target.closest('[data-inv]'); if (iv) { Admin.openInvoice(iv.dataset.inv); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'book') Admin.actions.newBooking({ customerId: id });
      if (act === 'series') Admin.actions.newBooking({ customerId: id, repeat: 'weekly' });
      if (act === 'pass') sellPass(id);
      if (act === 'sale') Admin.actions.newSale({ payer: { kind: 'customer', id } });
      if (act === 'edit') { sh.close(); editCustomer(id); }
      if (act === 'del') {
        if (bks.length || pays.length) { UI.toast('Foglalással vagy befizetéssel rendelkező ügyfél nem törölhető (könyvelési okból)'); return; }
        const ok = await UI.confirmBox(`Törlöd: ${c.name}?`, { ok: 'Törlés', danger: true }); if (ok) { Store.deleteCustomer(id); sh.close(); }
      }
    });
  }

  function editCustomer(id) {
    const c = id ? Store.customer(id) : { name: '', email: '', phone: '', billing: {}, note: '', marketing: false };
    const bl = c.billing || {};
    const sh = Admin.drawer({
      title: id ? 'Ügyfél adatai' : 'Új ügyfél',
      body: `<form class="cu-form">
        <div class="fld-row"><label class="fld"><span>Név</span><input name="name" value="${esc(c.name)}" required></label><label class="fld"><span>Telefon</span><input name="phone" value="${esc(c.phone || '')}"></label></div>
        <label class="fld"><span>E-mail</span><input name="email" type="email" value="${esc(c.email || '')}"></label>
        <h4 class="form-h">Számlázás</h4>
        <label class="fld"><span>Számlázási név (cégnév)</span><input name="bname" value="${esc(bl.name || '')}" placeholder="ha üres, az ügyfél neve"></label>
        <div class="fld-row three"><label class="fld"><span>Irsz.</span><input name="zip" value="${esc(bl.zip || '')}"></label><label class="fld"><span>Település</span><input name="city" value="${esc(bl.city || '')}"></label><label class="fld"><span>Adószám</span><input name="tax" value="${esc(bl.taxNumber || '')}"></label></div>
        <label class="fld"><span>Utca, házszám</span><input name="street" value="${esc(bl.street || '')}"></label>
        <label class="fld"><span>Belső megjegyzés</span><textarea name="note" rows="3">${esc(c.note || '')}</textarea></label>
        <label class="toggle"><input type="checkbox" name="marketing" ${c.marketing ? 'checked' : ''}><i></i><span>Hírlevél-hozzájárulás</span></label>
      </form>`,
      footer: '<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>',
    });
    $('.js-save', sh.el).addEventListener('click', () => {
      const fm = $('.cu-form', sh.el);
      const name = fm.name.value.trim(); if (name.length < 2) { UI.toast('Add meg a nevet'); return; }
      try {
        const nid = Store.upsertCustomer({ ...(id ? { id } : {}), name, phone: fm.phone.value.trim(), email: fm.email.value.trim(), note: fm.note.value.trim(), marketing: fm.marketing.checked, billing: { name: fm.bname.value.trim() || name, zip: fm.zip.value.trim(), city: fm.city.value.trim(), street: fm.street.value.trim(), taxNumber: fm.tax.value.trim() } });
        sh.close(); UI.toast('Ügyfél mentve'); openCustomer(nid);
      } catch (err) { UI.toast(err.message); }
    });
  }

  function sellPass(customerId, productId) {
    const prods = Store.products('pass').filter((p) => p.active !== false);
    let cust = customerId;
    const sh = Admin.drawer({
      title: 'Bérlet eladása',
      body: `<form class="sp-form">
        <div class="fld"><span>Ügyfél</span><div class="js-cp"></div></div>
        <div class="fld"><span>Bérlet</span><div class="opt-list">${prods.map((p, i) => `<label class="opt"><input type="radio" name="prod" value="${p.id}" ${(productId ? p.id === productId : i === 0) ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(p.desc || '')} · ${p.validDays} nap</small></span><b class="mono">${money(p.price)}</b></label>`).join('')}</div></div>
        <label class="fld"><span>Fizetési mód</span><select name="method">${Admin.PAY_OPTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <p class="sheet-note">A bérletről automatikusan számla készül, és az ügyfél fiókjában azonnal megjelenik.</p>
      </form>`,
      footer: '<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Eladás rögzítése</button>',
    });
    Admin.customerPicker($('.js-cp', sh.el), { value: cust, onChange: (v) => { cust = v; } });
    $('.js-save', sh.el).addEventListener('click', () => {
      const fm = $('.sp-form', sh.el);
      if (!cust) { UI.toast('Válassz ügyfelet'); return; }
      const r = Store.buyPass({ customerId: cust, productId: fm.prod.value, method: fm.method.value });
      sh.close(); UI.toast(`${r.pass.name} eladva · számla: ${r.invoice.no}`);
    });
  }

  // ======================================================================
  // BÉRLETEK
  // ======================================================================
  const pf = { show: 'active', q: '' };
  function renderPasses(el) {
    const today = Store.todayYmd();
    const q = Store.norm(pf.q);
    const rows = Store.passes().map((p) => ({ ...p, left: p.credits - p.used, expired: p.validUntil < today, cust: Store.customer(p.customerId) }))
      .filter((p) => (pf.show === 'active' ? !p.expired && p.left > 0 : pf.show === 'old' ? p.expired || p.left <= 0 : true))
      .filter((p) => !q || Store.norm(p.cust && p.cust.name).includes(q));
    const soon = rows.filter((p) => !p.expired && p.left > 0 && Store.daysBetween(today, p.validUntil) <= 14).length;
    const prods = Store.products('pass');
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg-ctl">${[['active', 'Aktív'], ['old', 'Lejárt / elhasznált'], ['all', 'Mind']].map(([k, l]) => `<button data-show="${k}" class="${pf.show === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="search">${I.search}<input id="ps-q" type="search" placeholder="Ügyfél neve…" value="${esc(pf.q)}"></label>
        <span class="grow"></span>
        <button class="btn dark sm" data-act="sell">${I.plus}Bérlet eladása</button>
      </div>
      <div class="sumbar">${prods.map((p) => { const n = Store.passes().filter((x) => x.productId === p.id && x.validUntil >= today && x.used < x.credits).length; return `<span>${esc(p.name)}: <b>${n}</b> aktív</span>`; }).join('')}<span><b class="${soon ? 'warn-t' : ''}">${soon}</b> lejár 14 napon belül</span></div>
      <div class="js-t"></div>`;
    Admin.table($('.js-t', el), {
      rows, sort: { key: 'valid', dir: 1 },
      onRow: (r) => r.cust && openCustomer(r.cust.id),
      cols: [
        { key: 'cust', label: 'Ügyfél', sort: (r) => r.cust && r.cust.name, render: (r) => (r.cust ? `<div class="t-person">${UI.avatar(r.cust)}<span><b>${esc(r.cust.name)}</b><small>${esc(r.cust.email)}</small></span></div>` : '—') },
        { key: 'name', label: 'Bérlet', sort: (r) => r.name, render: (r) => esc(r.name) },
        { key: 'left', label: 'Felhasználás', sort: (r) => r.left, render: (r) => `<div class="usage"><i style="--w:${Math.round((r.used / r.credits) * 100)}%"></i></div><span class="t-sub">${r.used}/${r.credits} · ${r.left} maradt</span>` },
        { key: 'bought', label: 'Vásárolva', cls: 'num dim', sort: (r) => r.boughtAt, render: (r) => esc(UI.dateShort(r.boughtAt)) },
        { key: 'valid', label: 'Érvényes', cls: 'num', sort: (r) => r.validUntil, render: (r) => `${esc(UI.dateShort(r.validUntil))}${r.expired ? ' <span class="pill soft">lejárt</span>' : Store.daysBetween(today, r.validUntil) <= 14 && r.left ? ' <span class="pill warn">hamarosan</span>' : ''}` },
      ],
      empty: 'Nincs ilyen bérlet.',
    });
    el.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { pf.show = b.dataset.show; renderPasses(el); }));
    el.querySelector('[data-act="sell"]').addEventListener('click', () => sellPass(null));
    Admin.bindFilters(el, pf, () => renderPasses(el));
  }
  Admin.page('berletek', { title: 'Bérletek', sub: 'Eladott pályabérletek, felhasználás és lejárat', render: renderPasses });

  Object.assign(Admin.actions, { openCustomer, editCustomer, sellPass });
})();
