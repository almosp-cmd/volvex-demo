/* ==========================================================================
   Admin – Árak és termékek + Beállítások
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const TIERS = { off: ['Kedvezményes', '#7FB6CF'], peak: ['Csúcsidő', '#2E5D8C'], weekend: ['Hétvége', '#121211'] };
  const KIND = { pass: 'Bérlet', giftcard: 'Ajándékkártya', other: 'Egyéb termék / szolgáltatás' };
  const times = (from, to, step = 30) => { const out = []; for (let m = Store.toMin(from); m <= Store.toMin(to); m += step) out.push(Store.fromMin(m)); return out; };

  // ======================================================================
  // ÁRAK ÉS TERMÉKEK
  // ======================================================================
  function renderPrices(el) {
    const s = Store.settings();
    const rules = Store.priceRules();
    const open = Store.toMin(s.open); const close = Store.toMin(s.close);
    const hours = []; for (let m = open; m < close; m += 60) hours.push(m);
    let gaps = 0;
    const cov = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const date = (() => { let x = Store.todayYmd(); while (Store.dowOf(x) !== d) x = Store.shiftYmd(x, 1); return x; })();
      return `<span class="cv-d">${UI.DAYS_SHORT[d - 1]}</span>${hours.map((m) => { const r = Store.ruleAt(date, m); if (!r) gaps++; return `<i style="background:${r ? (TIERS[r.tier] || TIERS.peak)[1] : 'repeating-linear-gradient(135deg,#F8E1DB 0 3px,#fff 3px 6px)'}" title="${UI.DAYS_SHORT[d - 1]} ${Store.fromMin(m)} · ${r ? `${esc(r.name)} · ${money(r.price)}` : 'nincs ár!'}"></i>`; }).join('')}`;
    }).join('');

    el.innerHTML = `
      <div class="card">
        <div class="card-h"><div><h3>Pályabérlési árak</h3><small>bruttó óradíj pályánként · a weboldalon és a foglalásnál azonnal érvényes</small></div><button class="btn dark sm" data-act="add-rule">${I.plus}Árszabály</button></div>
        <div class="card-b">
          <div class="rules">${rules.map((r) => `<div class="rule" data-rid="${r.id}">
            <span class="sw" style="background:${(TIERS[r.tier] || TIERS.peak)[1]}"></span>
            <span class="rl-main"><b>${esc(r.name)}</b><small>${r.days.length === 7 ? 'Minden nap' : [...r.days].sort().map((d) => UI.DAYS_SHORT[d - 1]).join(', ')} · ${esc(r.from)}–${esc(r.to)} · ${esc((TIERS[r.tier] || ['—'])[0])}</small></span>
            <b class="mono rl-p">${money(r.price)}<small>/óra</small></b>
            <button class="icon-btn sm" data-edit-rule="${r.id}" title="Szerkesztés">${I.edit}</button></div>`).join('')}</div>
          <div class="cov-h"><b>Heti lefedettség</b>${gaps ? `<span class="pill miss">${gaps} órára nincs ár</span>` : `<span class="pill ok">${I.check}Minden nyitvatartási órára van ár</span>`}</div>
          <div class="cov" style="--h:${hours.length}"><span></span>${hours.map((m) => `<span class="cv-h">${m % 120 === 0 ? Store.fromMin(m).slice(0, 2) : ''}</span>`).join('')}${cov}</div>
          <div class="legend" style="margin-top:10px">${Object.values(TIERS).map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
        </div>
      </div>

      <div class="grid2" style="margin-top:16px">
        <div class="card">
          <div class="card-h"><div><h3>Bérletek és termékek</h3><small>online és a recepción is eladható</small></div><button class="btn dark sm" data-act="add-prod">${I.plus}Termék</button></div>
          <div class="dw-list">${Store.products().map((p) => `<button class="li" data-prod="${p.id}"><span><b>${esc(p.name)}${p.active === false ? ' <span class="pill soft">inaktív</span>' : ''}</b><small>${esc(KIND[p.kind] || p.kind)}${p.kind === 'pass' ? ` · ${p.credits} alkalom · ${p.validDays} nap${p.tier ? ` · csak ${esc((TIERS[p.tier] || [''])[0].toLowerCase())}` : ''}` : ''} · ÁFA ${p.vat}%</small></span><b class="num">${p.price ? money(p.price) : 'egyedi'}</b>${I.next}</button>`).join('')}</div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Programok és tandíjak</h3><small>havidíj · a weboldalon is így jelenik meg</small></div><button class="btn dark sm" data-act="add-prog">${I.plus}Program</button></div>
          <div class="dw-list">${Store.programs().map((p) => { const n = Store.students().filter((x) => x.programId === p.id && x.active !== false).length; return `<button class="li" data-prog="${p.id}"><i class="dotc" style="background:${p.color};width:12px;height:12px"></i><span><b>${esc(p.name)}</b><small>${esc(p.ages || '')} · ${esc(p.perWeek || '')} · ${n} aktív diák</small></span><b class="num">${money(p.fee)}<small class="dim">/hó</small></b>${I.next}</button>`; }).join('')}</div>
        </div>
      </div>`;

    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act], [data-edit-rule], [data-prod], [data-prog]'); if (!a) return;
      if (a.dataset.act === 'add-rule') editRule();
      if (a.dataset.editRule) editRule(a.dataset.editRule);
      if (a.dataset.act === 'add-prod') editProduct();
      if (a.dataset.prod) editProduct(a.dataset.prod);
      if (a.dataset.act === 'add-prog') editProgram();
      if (a.dataset.prog) editProgram(a.dataset.prog);
    });
  }
  Admin.page('arak', { title: 'Árak és termékek', sub: 'Pályabérlési árszabályok, bérletek, ajándékkártya, programok havidíja', render: renderPrices });

  function editRule(id) {
    const s = Store.settings();
    const r = id ? Store.priceRules().find((x) => x.id === id) : { name: '', tier: 'peak', days: [1, 2, 3, 4, 5], from: s.open, to: s.close, price: 10000 };
    const all = times(s.open, s.close);
    const sh = Admin.drawer({
      title: id ? 'Árszabály' : 'Új árszabály',
      body: `<form class="rl-form">
        <label class="fld"><span>Megnevezés</span><input name="name" value="${esc(r.name)}" placeholder="pl. Hétköznap csúcsidő" required></label>
        <div class="fld"><span>Napok</span><div class="day-pick">${UI.DAYS_SHORT.map((d, i) => `<label><input type="checkbox" value="${i + 1}" ${r.days.includes(i + 1) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div></div>
        <div class="fld-row"><label class="fld"><span>Ettől</span><select name="from">${all.slice(0, -1).map((t) => `<option ${t === r.from ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="fld"><span>Eddig</span><select name="to">${all.slice(1).map((t) => `<option ${t === r.to ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        <div class="fld-row"><label class="fld"><span>Óradíj (bruttó Ft)</span><input name="price" type="number" step="500" min="0" value="${r.price}"></label><label class="fld"><span>Kategória (bérletekhez, színhez)</span><select name="tier">${Object.entries(TIERS).map(([k, [l]]) => `<option value="${k}" ${r.tier === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <p class="sheet-note">Ha több szabály is illik egy időpontra, a listában előrébb álló érvényes. A már lefoglalt időpontok ára nem változik.</p>
      </form>`,
      footer: `${id ? '<button class="btn danger-ghost l" data-act="del">Törlés</button>' : ''}<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const f = $('.rl-form', sh.el);
    $('.js-save', sh.el).addEventListener('click', () => {
      const days = $$('.day-pick input:checked', f).map((x) => Number(x.value));
      if (!f.name.value.trim() || !days.length) { UI.toast('Adj meg nevet és legalább egy napot'); return; }
      if (Store.toMin(f.to.value) <= Store.toMin(f.from.value)) { UI.toast('Az időszak vége legyen a kezdete után'); return; }
      Store.upsertPriceRule({ ...(id ? { id } : {}), name: f.name.value.trim(), days, from: f.from.value, to: f.to.value, price: Number(f.price.value) || 0, tier: f.tier.value });
      sh.close(); UI.toast('Árszabály mentve – a weboldalon is frissült');
    });
    const del = sh.el.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', async () => { if (await UI.confirmBox('Törlöd az árszabályt?', { ok: 'Törlés', danger: true })) { Store.deletePriceRule(id); sh.close(); } });
  }

  function editProduct(id) {
    const p = id ? Store.product(id) : { kind: 'pass', name: '', desc: '', price: 0, credits: 10, validDays: 120, tier: '', vat: Store.settings().invoice.vat, active: true };
    const sh = Admin.drawer({
      title: id ? p.name : 'Új termék',
      body: `<form class="pd-form">
        <label class="fld"><span>Típus</span><select name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="fld"><span>Megnevezés</span><input name="name" value="${esc(p.name)}" required></label>
        <label class="fld"><span>Leírás</span><input name="desc" value="${esc(p.desc || '')}"></label>
        <div class="fld-row"><label class="fld"><span>Bruttó ár (Ft) <b>0 = egyedi összeg</b></span><input name="price" type="number" step="500" min="0" value="${p.price || 0}"></label><label class="fld"><span>ÁFA (%)</span><select name="vat">${[27, 18, 5, 0].map((v) => `<option ${Number(p.vat) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <div class="js-pass" ${p.kind === 'pass' ? '' : 'hidden'}>
          <div class="fld-row three"><label class="fld"><span>Alkalmak (óra)</span><input name="credits" type="number" min="1" value="${p.credits || 10}"></label><label class="fld"><span>Érvényesség (nap)</span><input name="validDays" type="number" min="1" value="${p.validDays || 120}"></label>
          <label class="fld"><span>Felhasználható</span><select name="tier"><option value="">Bármikor</option>${Object.entries(TIERS).map(([k, [l]]) => `<option value="${k}" ${p.tier === k ? 'selected' : ''}>Csak ${l.toLowerCase()}</option>`).join('')}</select></label></div>
        </div>
        <label class="toggle"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}><i></i><span>Aktív (eladható, a weboldalon látszik)</span></label>
        <p class="sheet-note">Az ÁFA-kulcsot egyeztesd a könyvelővel (pl. sportlétesítmény-bérlés, tanfolyam, ajándékutalvány eltérhet).</p>
      </form>`,
      footer: `${id ? '<button class="btn danger-ghost l" data-act="del">Törlés</button>' : ''}<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const f = $('.pd-form', sh.el);
    f.kind.addEventListener('change', () => { $('.js-pass', f).hidden = f.kind.value !== 'pass'; });
    $('.js-save', sh.el).addEventListener('click', () => {
      if (!f.name.value.trim()) { UI.toast('Adj meg nevet'); return; }
      Store.upsertProduct({ ...(id ? { id } : {}), kind: f.kind.value, name: f.name.value.trim(), desc: f.desc.value.trim(), price: Number(f.price.value) || 0, vat: Number(f.vat.value), credits: Number(f.credits.value) || 10, validDays: Number(f.validDays.value) || 120, tier: f.tier.value, active: f.active.checked });
      sh.close(); UI.toast('Termék mentve');
    });
    const del = sh.el.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', async () => { if (await UI.confirmBox(`Törlöd: ${p.name}?`, { ok: 'Törlés', danger: true, sub: 'A már eladott bérletek megmaradnak.' })) { Store.deleteProduct(id); sh.close(); } });
  }

  function editProgram(id) {
    const p = id ? Store.program(id) : { name: '', short: '', ages: '', fee: 30000, color: '#2DC3E6', perWeek: '', desc: '' };
    const COLORS = ['#E8A13A', '#2DC3E6', '#2E5D8C', '#9DB82A', '#B4532A', '#6B4E8A', '#3E6B4F', '#9C3D54', '#121211'];
    const sh = Admin.drawer({
      title: id ? p.name : 'Új program',
      body: `<form class="pg-form">
        <div class="fld-row"><label class="fld"><span>Név</span><input name="name" value="${esc(p.name)}" required></label><label class="fld"><span>Rövid név (kártyán)</span><input name="short" maxlength="10" value="${esc(p.short || '')}"></label></div>
        <div class="fld-row three"><label class="fld"><span>Korosztály</span><input name="ages" value="${esc(p.ages || '')}" placeholder="7–14 év"></label><label class="fld"><span>Gyakoriság</span><input name="perWeek" value="${esc(p.perWeek || '')}" placeholder="2 × 90 perc"></label><label class="fld"><span>Havidíj (Ft)</span><input name="fee" type="number" step="1000" value="${p.fee}"></label></div>
        <label class="fld"><span>Leírás (weboldal)</span><textarea name="desc" rows="3">${esc(p.desc || '')}</textarea></label>
        <div class="fld"><span>Szín</span><div class="swatches">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === p.color ? 'checked' : ''}><i style="--c:${c}"></i></label>`).join('')}</div></div>
        <p class="sheet-note">A havidíj változása a következő kiírástól érvényes; a már kiírt díjak nem változnak.</p>
      </form>`,
      footer: `${id ? '<button class="btn danger-ghost l" data-act="del">Törlés</button>' : ''}<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const f = $('.pg-form', sh.el);
    $('.js-save', sh.el).addEventListener('click', () => {
      if (!f.name.value.trim()) { UI.toast('Adj meg nevet'); return; }
      Store.upsertProgram({ ...(id ? { id } : {}), name: f.name.value.trim(), short: (f.short.value.trim() || f.name.value.trim().split(' ')[0]).toUpperCase(), ages: f.ages.value.trim(), perWeek: f.perWeek.value.trim(), fee: Number(f.fee.value) || 0, desc: f.desc.value.trim(), color: (f.color.value || p.color) });
      sh.close(); UI.toast('Program mentve');
    });
    const del = sh.el.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', async () => {
      if (Store.students().some((s) => s.programId === id)) { UI.toast('Ehhez a programhoz még tartoznak diákok'); return; }
      if (await UI.confirmBox(`Törlöd: ${p.name}?`, { ok: 'Törlés', danger: true })) { Store.deleteProgram(id); sh.close(); }
    });
  }

  // ======================================================================
  // BEÁLLÍTÁSOK
  // ======================================================================
  const PROVIDERS = {
    payment: { t: 'Online fizetés', ic: I.card, opts: ['Barion', 'SimplePay (OTP)', 'Stripe'], d: 'Bankkártyás fizetés a weboldalon, automatikus visszatérítés lemondáskor.' },
    invoicing: { t: 'Számlázó', ic: I.receipt, opts: ['Számlázz.hu', 'Billingo'], d: 'Automatikus e-számla minden fizetésről, NAV Online Számla adatszolgáltatással.' },
    email: { t: 'E-mail küldés', ic: I.mail, opts: ['Brevo', 'Postmark', 'Mailgun'], d: 'Visszaigazolások, belépő kódok, tandíj-emlékeztetők, lemondások.' },
  };
  function renderSettings(el) {
    const s = Store.settings();
    const all = times('05:00', '24:00', 60).slice(0, -1).concat(['23:59']);
    el.innerHTML = `
      <div class="grid2 set-grid">
        <form class="card set-card" data-form="club">
          <div class="card-h"><h3>Klub és cégadatok</h3><small>a számlákon és a weboldalon jelenik meg</small></div>
          <div class="card-b">
            <div class="fld-row"><label class="fld"><span>Klub neve</span><input name="clubName" value="${esc(s.clubName)}"></label><label class="fld"><span>Szlogen</span><input name="tagline" value="${esc(s.tagline || '')}"></label></div>
            <label class="fld"><span>Cégnév</span><input name="cname" value="${esc(s.company.name)}"></label>
            <label class="fld"><span>Székhely</span><input name="caddr" value="${esc(s.company.address)}"></label>
            <div class="fld-row"><label class="fld"><span>Adószám</span><input name="ctax" value="${esc(s.company.taxNumber)}"></label><label class="fld"><span>Cégjegyzékszám</span><input name="creg" value="${esc(s.company.regNumber || '')}"></label></div>
            <label class="fld"><span>Bankszámlaszám (átutaláshoz, számlára)</span><input name="cbank" value="${esc(s.company.bank || '')}" placeholder="12345678-12345678-12345678"></label>
            <h4 class="form-h">Csarnok</h4>
            <label class="fld"><span>Cím</span><input name="vaddr" value="${esc(s.venue.address)}"></label>
            <div class="fld-row"><label class="fld"><span>Telefon</span><input name="vphone" value="${esc(s.venue.phone)}"></label><label class="fld"><span>E-mail</span><input name="vemail" value="${esc(s.venue.email)}"></label></div>
            <div class="set-foot"><button class="btn dark sm">Mentés</button></div>
          </div>
        </form>

        <div class="set-col">
          <form class="card set-card" data-form="booking">
            <div class="card-h"><h3>Nyitvatartás és foglalási szabályok</h3></div>
            <div class="card-b">
              <div class="fld-row"><label class="fld"><span>Nyitás</span><select name="open">${all.map((t) => `<option ${t === s.open ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="fld"><span>Zárás</span><select name="close">${all.map((t) => `<option ${t === s.close ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
              <div class="fld-row"><label class="fld"><span>Max. előre foglalás (nap)</span><input name="maxDaysAhead" type="number" min="1" max="120" value="${s.booking.maxDaysAhead}"></label><label class="fld"><span>Ingyenes lemondás (óra)</span><input name="cancelHours" type="number" min="0" max="168" value="${s.booking.cancelHours}"></label></div>
              <div class="fld-row"><label class="fld"><span>Max. egybefüggő órák</span><input name="maxHours" type="number" min="1" max="6" value="${s.booking.maxHours}"></label><label class="fld"><span>Legkésőbb ennyivel előtte (perc)</span><input name="leadMin" type="number" min="0" step="15" value="${s.booking.leadMin}"></label></div>
              <label class="toggle"><input type="checkbox" name="allowOnsite" ${s.booking.allowOnsite ? 'checked' : ''}><i></i><span>Online foglalásnál választható a helyszíni fizetés</span></label>
              <div class="set-foot"><button class="btn dark sm">Mentés</button></div>
            </div>
          </form>

          <div class="card set-card">
            <div class="card-h"><h3>Zárva tartás / ünnepnapok</h3><small>ezeken a napokon nem lehet foglalni, edzés sincs</small></div>
            <div class="card-b">
              <div class="chips hol">${[...s.holidays].sort().map((h) => `<button class="chip-s ${h < Store.todayYmd() ? 'dim' : ''}" data-hol="${h}">${esc(UI.dateShort(h))} ${h.slice(0, 4)} ${I.x}</button>`).join('')}</div>
              <div class="hol-add"><input type="date" class="inp sm js-hol"><button class="btn sm ghost" data-act="hol-add">${I.plus}Hozzáadás</button></div>
            </div>
          </div>
        </div>

        <div class="card set-card">
          <div class="card-h"><h3>Pályák</h3><button class="btn ghost sm" data-act="court-add">${I.plus}Pálya</button></div>
          <div class="dw-list">${Store.courts().map((c) => `<div class="li court-li">${Court.mini(c)}<span><input class="inp sm" data-court-name="${c.id}" value="${esc(c.name)}"></span><select class="inp sm" data-court-sport="${c.id}"><option value="tennis" ${c.sport === 'tennis' ? 'selected' : ''}>Tenisz</option><option value="pickleball" ${c.sport === 'pickleball' ? 'selected' : ''}>Pickleball</option></select><label class="toggle" title="Foglalható"><input type="checkbox" data-court-active="${c.id}" ${c.active !== false ? 'checked' : ''}><i></i></label></div>`).join('')}</div>
        </div>

        <form class="card set-card" data-form="invoice">
          <div class="card-h"><h3>Számlázás</h3></div>
          <div class="card-b">
            <div class="fld-row three"><label class="fld"><span>Sorszám előtag</span><input name="prefix" value="${esc(s.invoice.prefix)}"></label><label class="fld"><span>Alap ÁFA (%)</span><input name="vat" type="number" value="${s.invoice.vat}"></label><label class="fld"><span>Átutalási határidő (nap)</span><input name="dueDays" type="number" value="${s.invoice.dueDays}"></label></div>
            <p class="sheet-note">Következő számla: <b class="mono">${esc(s.invoice.prefix)}-${new Date().getFullYear()}-${String(((s.invoice.seq || {})[new Date().getFullYear()] || 0) + 1).padStart(5, '0')}</b></p>
            <div class="set-foot"><button class="btn dark sm">Mentés</button></div>
          </div>
        </form>
      </div>

      <div class="sec-t"><h2>Integrációk</h2><small>az éles működéshez – a kulcsokat soha nem itt, hanem biztonságosan a szerveren tároljuk</small></div>
      <div class="grid3">${Object.entries(PROVIDERS).map(([k, p]) => { const cur = s.integrations[k] || {}; return `
        <div class="card integ">
          <div class="ig-top"><span class="ig-ic">${p.ic}</span><span><b>${p.t}</b><small>${p.d}</small></span></div>
          <div class="ig-st">${cur.provider ? `<span class="pill ok">${I.check}${esc(cur.provider)} kiválasztva</span>` : '<span class="pill soft">Demó mód</span>'}</div>
          <select class="inp sm" data-integ="${k}"><option value="">— válassz szolgáltatót —</option>${p.opts.map((o) => `<option ${cur.provider === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </div>`; }).join('')}
        <div class="card integ">
          <div class="ig-top"><span class="ig-ic">${Admin.X.globe}</span><span><b>Közös adatbázis és tárhely</b><small>Hogy a weboldal, az edzők telefonja és az admin ugyanazt lássa (pl. Supabase + Netlify).</small></span></div>
          <div class="ig-st"><span class="pill ${Store.isShared ? 'ok' : 'warn'}">${Store.isShared ? 'Most: közös demó-tár (claude.ai)' : 'Most: csak ez a böngésző'}</span></div>
        </div>
      </div>

      <div class="grid2" style="margin-top:16px">
        <form class="card set-card" data-form="pin">
          <div class="card-h"><h3>Admin belépés</h3><small>élesben: e-mail + jelszó, kétlépcsős azonosítás, több admin felhasználó</small></div>
          <div class="card-b"><div class="fld-row"><label class="fld"><span>Új admin PIN</span><input name="pin" type="password" inputmode="numeric" minlength="4" maxlength="8" class="mono"></label><div class="fld"><span>&nbsp;</span><button class="btn dark sm" style="height:48px">PIN módosítása</button></div></div></div>
        </form>
        <div class="card set-card">
          <div class="card-h"><h3>Adatok</h3><small>mentés, visszatöltés, demó</small></div>
          <div class="card-b dw-actions">
            <button class="btn ghost sm" data-act="export">${I.download}Teljes mentés (JSON)</button>
            <label class="btn ghost sm">${I.upload}Visszatöltés<input type="file" accept="application/json" class="js-import" hidden></label>
            <button class="btn ghost sm" data-act="reset">${I.redo}Demó adatok újratöltése</button>
            <button class="btn danger-ghost sm" data-act="wipe">${I.del}Üres rendszer indítása</button>
          </div>
        </div>
      </div>`;

    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target; const k = f.dataset.form;
      if (k === 'club') Store.updateSettings({ clubName: f.clubName.value.trim(), tagline: f.tagline.value.trim(), company: { name: f.cname.value.trim(), address: f.caddr.value.trim(), taxNumber: f.ctax.value.trim(), regNumber: f.creg.value.trim(), bank: f.cbank.value.trim() }, venue: { address: f.vaddr.value.trim(), phone: f.vphone.value.trim(), email: f.vemail.value.trim() } });
      if (k === 'booking') {
        if (Store.toMin(f.close.value) <= Store.toMin(f.open.value)) { UI.toast('A zárás legyen a nyitás után'); return; }
        Store.updateSettings({ open: f.open.value, close: f.close.value, booking: { maxDaysAhead: Number(f.maxDaysAhead.value), cancelHours: Number(f.cancelHours.value), maxHours: Number(f.maxHours.value), leadMin: Number(f.leadMin.value), allowOnsite: f.allowOnsite.checked } });
      }
      if (k === 'invoice') Store.updateSettings({ invoice: { prefix: f.prefix.value.trim() || 'VT', vat: Number(f.vat.value), dueDays: Number(f.dueDays.value) } });
      if (k === 'pin') { if (!/^\d{4,8}$/.test(f.pin.value)) { UI.toast('A PIN 4–8 számjegy legyen'); return; } Store.updateSettings({ adminPin: f.pin.value }); }
      UI.toast('Beállítások mentve');
    });
    el.addEventListener('change', (e) => {
      const x = e.target;
      if (x.dataset.courtName) { Store.upsertCourt({ id: x.dataset.courtName, name: x.value.trim() }); UI.toast('Pálya átnevezve'); }
      if (x.dataset.courtSport) Store.upsertCourt({ id: x.dataset.courtSport, sport: x.value });
      if (x.dataset.courtActive) { Store.upsertCourt({ id: x.dataset.courtActive, active: x.checked }); UI.toast(x.checked ? 'Pálya foglalható' : 'Pálya kivéve a foglalásból'); }
      if (x.dataset.integ) {
        Store.updateSettings({ integrations: { [x.dataset.integ]: { provider: x.value, status: x.value ? 'pending' : 'demo' } } });
        if (x.value) UI.toast(`${x.value} kiválasztva – az élesítéskor kötjük be (API-kulcs a szerveren)`);
      }
      if (x.matches('.js-import') && x.files[0]) {
        const rd = new FileReader();
        rd.onload = async () => { const ok = await UI.confirmBox('Visszatöltöd a mentést?', { ok: 'Visszatöltés', danger: true, sub: 'A jelenlegi adatok felülíródnak.' }); if (!ok) return; try { Store.importJSON(rd.result); UI.toast('Mentés visszatöltve'); } catch (err) { UI.toast(err.message); } };
        rd.readAsText(x.files[0]);
      }
    });
    el.addEventListener('click', async (e) => {
      const h = e.target.closest('[data-hol]'); if (h) { Store.updateSettings({ holidays: Store.settings().holidays.filter((x) => x !== h.dataset.hol) }); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'hol-add') { const v = $('.js-hol', el).value; if (!v) { UI.toast('Válassz dátumot'); return; } if (!Store.settings().holidays.includes(v)) Store.updateSettings({ holidays: [...Store.settings().holidays, v] }); }
      if (act === 'court-add') Store.upsertCourt({ name: `${Store.courts().length + 1}. pálya` });
      if (act === 'export') UI.download(`volvex-mentes-${Store.todayYmd()}.json`, Store.exportJSON());
      if (act === 'reset') { if (await UI.confirmBox('Újratöltöd a demó adatokat?', { ok: 'Újratöltés', danger: true, sub: `Minden jelenlegi adat elvész (a weboldalas foglalások is)${Store.isShared ? ' – a link minden használójánál' : ''}.` })) { Store.resetDemo(); UI.toast('Demó adatok újratöltve'); } }
      if (act === 'wipe') { if (await UI.confirmBox('Üres rendszert indítasz?', { ok: 'Mindent törlök', danger: true, sub: `Ügyfelek, foglalások, diákok, edzők, befizetések és számlák törlődnek. A beállítások, árak és pályák megmaradnak. Előtte készíts mentést!${Store.isShared ? ' A link minden használójánál törlődik.' : ''}` })) { Store.wipe(); UI.toast('Üres rendszer – kezdheted a valós adatokkal'); } }
    });
  }
  Admin.page('beallitasok', { title: 'Beállítások', sub: 'Cégadatok, nyitvatartás, foglalási szabályok, pályák, integrációk, adatmentés', render: renderSettings });
})();
