/* ==========================================================================
   Admin – Órarend (idősávok és csoportok), Jelenlét, Diákok, Edzők
   A klub kérése szerint:
   - napok → idősávok (hétköznap 13–20 óránként, szombaton 9–10, 10–11:30, 11:30–12:30)
   - egy idősávban több csoport, mindegyik saját névsorral
   - a jelenlétnél az edző kiválasztja magát a csoportnál; a be nem pipált gyerek pótlásra kerül
   - az edzők óraszáma szűrhető (hét, hónap, egyedi időszak)
   A pályák lefoglalása ettől független (foglalási naptár, heti edzésblokkok).
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const T = Store.toMin;
  const times = (from, to, step = 15) => { const out = []; for (let m = T(from); m <= T(to); m += step) out.push(Store.fromMin(m)); return out; };
  const gName = (t) => Store.groupName(t);
  const gColor = (t) => (Store.programOfGroup(t) || {}).color || '#2E5D8C';
  const daysText = (t) => {
    const ds = Store.daysOf(t);
    if (ds.length >= 3 && ds[ds.length - 1] - ds[0] === ds.length - 1) return `${UI.DAYS_SHORT[ds[0] - 1]}–${UI.DAYS_SHORT[ds[ds.length - 1] - 1]}`;
    return ds.map((d) => UI.DAYS_SHORT[d - 1]).join(', ');
  };
  const slotLabel = (t) => `${daysText(t)} ${t.start}–${t.end}`;
  const coachFirst = (id) => { const c = Store.coach(id); return c ? UI.firstName(c.name) : ''; };
  const coachesText = (ids) => (ids || []).map(coachFirst).filter(Boolean).join(', ');
  const byGroup = (a, b) => gName(a).localeCompare(gName(b), 'hu', { numeric: true });
  const hoursNum = (min) => (Math.round(min / 6) / 10).toString().replace('.', ',');

  // ======================================================================
  // ÓRAREND – napok × idősávok, bennük a csoportok
  // ======================================================================
  const tf = { prog: '' };
  function renderTimetable(el) {
    const all = Store.trainings();
    const list = tf.prog ? all.filter((t) => (Store.programOfGroup(t) || {}).id === tf.prog) : all;
    const hasSun = Store.trainingSlots(7).length || all.some((t) => Store.daysOf(t).includes(7));
    const days = [1, 2, 3, 4, 5, 6, ...(hasSun ? [7] : [])];
    const rowsMap = new Map();
    days.forEach((d) => Store.trainingSlots(d).forEach((s) => rowsMap.set(`${s.start}-${s.end}`, s)));
    all.forEach((t) => rowsMap.set(`${t.start}-${t.end}`, { start: t.start, end: t.end }));
    const rows = [...rowsMap.values()].sort((a, b) => T(a.start) - T(b.start) || T(a.end) - T(b.end));
    const configured = (d, s) => Store.trainingSlots(d).some((x) => x.start === s.start && x.end === s.end);
    const at = (d, s) => list.filter((t) => Store.daysOf(t).includes(d) && t.start === s.start && t.end === s.end).sort(byGroup);
    const weeklyMin = all.reduce((a, t) => a + Store.daysOf(t).length * (T(t.end) - T(t.start)), 0);
    const students = new Set(all.flatMap((t) => t.studentIds)).size;
    const noGroup = Store.students().filter((s) => s.active !== false && !Store.trainingsOfStudent(s.id).length).length;

    el.innerHTML = `
      <div class="toolbar">
        <div class="chips prog-chips"><button class="chip-s ${!tf.prog ? 'on' : ''}" data-prog="">Minden program</button>${Store.programs().map((p) => `<button class="chip-s ${tf.prog === p.id ? 'on' : ''}" data-prog="${p.id}"><i class="dotc" style="background:${p.color}"></i>${esc(p.name)}</button>`).join('')}</div>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="slots">${I.clock}Idősávok</button>
        <button class="btn dark sm" data-act="new">${I.plus}Új csoport</button>
      </div>
      <div class="sumbar"><span><b>${all.length}</b> csoport</span><span><b>${students}</b> diák beosztva</span><span><b>${Math.round(weeklyMin / 60)}</b> edzésóra / hét</span>${noGroup ? `<a class="lnk" href="#/diakok?f=nogroup">${noGroup} aktív diák nincs csoportban</a>` : ''}</div>
      <div class="og card" style="--cols:${days.length}">
        <div class="og-row og-head"><span></span>${days.map((d) => `<b>${UI.cap(UI.DAYS[d - 1])}<small>${list.filter((t) => Store.daysOf(t).includes(d)).length} csoport</small></b>`).join('')}</div>
        ${rows.map((s) => `<div class="og-row">
          <span class="og-time"><b class="mono">${s.start}</b><small class="mono">${s.end}</small></span>
          ${days.map((d) => {
            const gs = at(d, s); const on = configured(d, s) || gs.length;
            return `<div class="og-cell ${on ? '' : 'is-off'}" data-day="${d}" data-start="${s.start}" data-end="${s.end}">
              ${gs.map((t) => `<button class="og-g" data-gid="${t.id}" style="--pc:${gColor(t)}" title="${esc(`${gName(t)} · ${slotLabel(t)}`)}"><b>${esc(gName(t))}</b><small>${t.studentIds.length} fő${t.coachIds && t.coachIds.length ? ` · ${esc(coachesText(t.coachIds))}` : ''}</small></button>`).join('')}
              ${on ? `<button class="og-add" data-add aria-label="Új csoport ide">${I.plus}</button>` : ''}
            </div>`;
          }).join('')}
        </div>`).join('')}
      </div>
      <div class="note" style="margin-top:14px">${I.layers}<span><b>Hogyan működik?</b> Az edző a jelenléti appban kiválasztja a napot, majd az idősávot – ott minden csoport külön blokkban jelenik meg a saját névsorával. A csoportjánál a legördülő listából kiválasztja magát, és bepipálja, ki volt ott; akit nem pipál be, automatikusan pótlásra kerül. A „beosztott edző” csak tájékoztató. A pályák lefoglalása ettől független, a <a class="lnk" href="#/allando">heti edzésblokkoknál</a> kezelhető.</span></div>`;

    el.querySelectorAll('[data-prog]').forEach((b) => b.addEventListener('click', () => { tf.prog = b.dataset.prog; renderTimetable(el); }));
    $('[data-act="new"]', el).addEventListener('click', () => editTraining());
    $('[data-act="slots"]', el).addEventListener('click', editSlots);
    const grid = $('.og', el);
    grid.addEventListener('click', (e) => {
      const g = e.target.closest('[data-gid]'); if (g) { editTraining(g.dataset.gid); return; }
      const add = e.target.closest('[data-add]'); if (!add) return;
      const c = add.closest('.og-cell');
      editTraining(null, { days: [Number(c.dataset.day)], start: c.dataset.start, end: c.dataset.end });
    });
    // ugyanaz a csoport a többi napon is kiemelődik
    grid.addEventListener('mouseover', (e) => {
      const g = e.target.closest('[data-gid]');
      $$('.og-g.hl', grid).forEach((x) => { if (!g || x.dataset.gid !== g.dataset.gid) x.classList.remove('hl'); });
      if (g) $$(`.og-g[data-gid="${g.dataset.gid}"]`, grid).forEach((x) => x.classList.add('hl'));
    });
    grid.addEventListener('mouseleave', () => $$('.og-g.hl', grid).forEach((x) => x.classList.remove('hl')));
  }
  Admin.page('orarend', { title: 'Órarend', sub: 'Napok, idősávok és csoportok a jelenléti naplóhoz – névsorok, beosztott edzők', render: renderTimetable });

  // ---------- idősávok beállítása ----------
  function editSlots() {
    const st = {}; for (let d = 1; d <= 7; d++) st[d] = Store.trainingSlots(d);
    const tms = times('06:00', '23:00');
    const sh = Admin.drawer({
      wide: true,
      title: 'Edzés-idősávok',
      sub: 'A jelenléti naplóban naponként ezek az idősávok jelennek meg',
      body: '<div class="sl-form"></div>',
      footer: '<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>',
    });
    const box = $('.sl-form', sh.el);
    function draw() {
      box.innerHTML = `${[1, 2, 3, 4, 5, 6, 7].map((d) => `
        <div class="sl-day">
          <div class="sl-h"><b>${UI.cap(UI.DAYS[d - 1])}</b><small>${st[d].length ? `${st[d].length} idősáv` : 'nincs edzés'}</small>
            ${d === 1 ? '<button type="button" class="btn sm soft" data-act="copy">Másolás keddtől péntekig</button>' : ''}</div>
          <div class="sl-list">${st[d].map((s, i) => `<div class="sl-it">
              <select class="inp sm" data-d="${d}" data-i="${i}" data-k="start">${tms.map((x) => `<option ${x === s.start ? 'selected' : ''}>${x}</option>`).join('')}</select><span>–</span>
              <select class="inp sm" data-d="${d}" data-i="${i}" data-k="end">${tms.map((x) => `<option ${x === s.end ? 'selected' : ''}>${x}</option>`).join('')}</select>
              <button type="button" class="icon-btn ghost sm" data-rm="${d}:${i}" aria-label="Törlés">${I.x}</button></div>`).join('')}
            <button type="button" class="btn sm ghost" data-addslot="${d}">${I.plus}Idősáv</button></div>
        </div>`).join('')}
        <p class="sheet-note">A csoportok az idősávjukban jelennek meg. Ha egy csoport időpontja nem egyezik egyik idősávval sem, külön sávként akkor is látszik.</p>`;
    }
    box.addEventListener('change', (e) => {
      const x = e.target; if (!x.dataset.d) return;
      const s = st[x.dataset.d][Number(x.dataset.i)]; s[x.dataset.k] = x.value;
      if (x.dataset.k === 'start' && T(s.end) <= T(s.start)) s.end = Store.fromMin(T(s.start) + 60);
      st[x.dataset.d].sort((a, b) => T(a.start) - T(b.start)); draw();
    });
    box.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]'); if (rm) { const [d, i] = rm.dataset.rm.split(':'); st[d].splice(Number(i), 1); draw(); return; }
      const ad = e.target.closest('[data-addslot]');
      if (ad) { const d = ad.dataset.addslot; const last = st[d][st[d].length - 1]; const s0 = last ? last.end : (d >= 6 ? '09:00' : '13:00'); st[d].push({ start: s0, end: Store.fromMin(Math.min(T(s0) + 60, 23 * 60)) }); draw(); return; }
      if (e.target.closest('[data-act="copy"]')) { [2, 3, 4, 5].forEach((d) => { st[d] = st[1].map((s) => ({ ...s })); }); draw(); UI.toast('Hétfő idősávjai átmásolva keddtől péntekig'); }
    });
    draw();
    $('.js-save', sh.el).addEventListener('click', () => {
      for (let d = 1; d <= 7; d++) if (st[d].some((s) => T(s.end) <= T(s.start))) { UI.toast('Minden idősáv vége legyen a kezdés után'); return; }
      Store.updateSettings({ trainingSlots: st });
      UI.toast('Idősávok mentve'); sh.close();
    });
  }

  // ---------- csoport szerkesztése ----------
  function editTraining(id, pre = {}) {
    const t = id ? Store.training(id) : { name: '', days: pre.days || [1], start: pre.start || '16:00', end: pre.end || '17:00', programId: '', coachIds: [], studentIds: [] };
    const st = {
      name: id ? (t.name || '') : '', days: [...Store.daysOf(t)], start: t.start, end: t.end, programId: t.programId || '',
      coachIds: [...(t.coachIds || [])], studentIds: [...t.studentIds], newNames: [], q: '', prog: '', paste: false, custom: false,
    };
    const tms = times('06:00', '23:00');
    const sh = Admin.drawer({
      wide: true,
      title: id ? gName(t) : 'Új csoport',
      sub: id ? `${slotLabel(t)} · ${t.studentIds.length} gyerek` : 'Név, napok, idősáv, beosztott edző és a névsor',
      body: '<div class="tr-form"></div>',
      footer: `${id ? '<button class="btn danger-ghost l" data-act="del">Törlés</button>' : ''}<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const box = $('.tr-form', sh.el);
    const sameTime = (x) => st.days.some((d) => Store.daysOf(x).includes(d)) && Store.overlap(T(st.start), T(st.end), T(x.start), T(x.end));
    const overlaps = (sid) => Store.trainings().filter((x) => x.id !== id && x.studentIds.includes(sid) && sameTime(x));
    const coachBusy = (cid) => Store.trainings().filter((x) => x.id !== id && (x.coachIds || []).includes(cid) && sameTime(x));
    function slotOptions() {
      const m = new Map();
      st.days.forEach((d) => Store.trainingSlots(d).forEach((s) => m.set(`${s.start}-${s.end}`, s)));
      return [...m.values()].sort((a, b) => T(a.start) - T(b.start));
    }
    function draw() {
      const q = Store.norm(st.q);
      const studs = Store.students().filter((s) => s.active !== false || st.studentIds.includes(s.id));
      const shown = studs.filter((s) => (!st.prog || s.programId === st.prog) && (!q || Store.norm(s.name).includes(q)))
        .sort((a, b) => (st.studentIds.includes(b.id) - st.studentIds.includes(a.id)) || a.name.localeCompare(b.name, 'hu'));
      const opts = slotOptions();
      const cur = `${st.start}-${st.end}`;
      const inList = opts.some((s) => `${s.start}-${s.end}` === cur);
      const custom = st.custom || !inList;
      const total = st.studentIds.length + st.newNames.length;
      box.innerHTML = `
        <div class="fld-row">
          <label class="fld"><span>Csoport neve</span><input data-f="name" value="${esc(st.name)}" placeholder="pl. Junior 3, Ovi 1, Felnőtt haladó"></label>
          <label class="fld"><span>Program <em>szín és tandíj</em></span><select data-f="programId"><option value="">— vegyes / nincs —</option>${Store.programs().map((p) => `<option value="${p.id}" ${st.programId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        </div>
        <div class="fld"><span>Napok <em>ugyanaz a névsor minden kiválasztott napon</em></span>
          <div class="day-pick">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label><input type="checkbox" value="${d}" data-day ${st.days.includes(d) ? 'checked' : ''}><span>${UI.DAYS_SHORT[d - 1]}</span></label>`).join('')}</div></div>
        <div class="fld-row">
          <label class="fld"><span>Idősáv</span><select data-f="slot">
            ${opts.map((s) => `<option value="${s.start}-${s.end}" ${!custom && `${s.start}-${s.end}` === cur ? 'selected' : ''}>${s.start}–${s.end}</option>`).join('')}
            <option value="custom" ${custom ? 'selected' : ''}>Egyéni időpont…</option></select></label>
          ${custom ? `<div class="fld-row tight"><label class="fld"><span>Kezdés</span><select data-f="start">${tms.map((x) => `<option ${x === st.start ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label class="fld"><span>Vége</span><select data-f="end">${tms.map((x) => `<option ${x === st.end ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>` : '<div></div>'}
        </div>
        <div class="fld"><span>Beosztott edző <em>tájékoztató – a jelenlétnél mindenki maga választja ki magát</em></span><div class="coach-pick">${Store.coaches().filter((c) => c.active !== false).map((c) => { const b = coachBusy(c.id); return `<label class="${b.length ? 'busy' : ''}" title="${b.length ? `Ugyanekkor: ${esc(b.map(gName).join(', '))}` : ''}"><input type="checkbox" value="${c.id}" ${st.coachIds.includes(c.id) ? 'checked' : ''}><span>${UI.avatar(c)}${esc(c.name)}</span></label>`; }).join('')}</div></div>
        <div class="fld"><span>Névsor <b>${total} gyerek</b></span>
          <div class="toolbar tight">
            <label class="search">${I.search}<input data-f="q" type="search" placeholder="Név…" value="${esc(st.q)}"></label>
            <select class="inp sm" data-f="prog"><option value="">Minden program</option>${Store.programs().map((p) => `<option value="${p.id}" ${st.prog === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
            <button type="button" class="btn sm ${st.paste ? 'dark' : 'soft'}" data-act="paste">${I.upload}Névsor beillesztése</button>
            ${st.studentIds.length ? '<button type="button" class="btn sm ghost" data-act="clear">Kijelölés törlése</button>' : ''}
          </div>
          ${st.paste ? `<div class="paste-box">
            <textarea class="inp mono" rows="6" placeholder="Soronként egy név (Excelből is másolhatod)&#10;Kiss Anna&#10;Nagy Bence"></textarea>
            <div class="paste-f"><small>A meglévő diákokat név alapján megtalálja, az újakat felveszi${st.programId ? ` (${esc((Store.program(st.programId) || {}).name || '')} programmal)` : ''}.</small><button type="button" class="btn sm dark" data-act="paste-go">Hozzáadás a névsorhoz</button></div>
          </div>` : ''}
          ${st.newNames.length ? `<div class="new-names">${st.newNames.map((n, i) => `<span class="chip-s nn">${I.plus}${esc(n)}<button type="button" data-nn="${i}" aria-label="Eltávolítás">${I.x}</button></span>`).join('')}<small>új diák – mentéskor jön létre</small></div>` : ''}
          <div class="chk-list tight">${shown.map((s) => {
            const on = st.studentIds.includes(s.id); const ov = on ? overlaps(s.id) : [];
            const pr = Store.program(s.programId);
            const other = Store.trainingsOfStudent(s.id).filter((x) => x.id !== id).map(gName).join(', ');
            return `<label class="chk"><input type="checkbox" value="${s.id}" data-stud ${on ? 'checked' : ''}><span class="box">${I.check}</span>${UI.avatar(s)}<span class="chk-t"><b>${esc(s.name)}</b><small>${pr ? `<i class="dotc" style="background:${pr.color}"></i>${esc(pr.name)}` : ''}${other ? ` · ${esc(other)}` : ' · nincs más csoportja'}</small></span>${ov.length ? `<span class="pill warn" title="Ugyanekkor: ${esc(ov.map(gName).join(', '))}">ütközik</span>` : ''}</label>`;
          }).join('') || '<p class="empty-s">Nincs találat.</p>'}</div>
        </div>`;
    }
    box.addEventListener('change', (e) => {
      const x = e.target;
      if (x.matches('[data-stud]')) { if (x.checked) st.studentIds.push(x.value); else st.studentIds = st.studentIds.filter((v) => v !== x.value); draw(); return; }
      if (x.matches('[data-day]')) { st.days = $$('[data-day]:checked', box).map((i) => Number(i.value)); draw(); return; }
      if (x.closest('.coach-pick')) { st.coachIds = $$('.coach-pick input:checked', box).map((i) => i.value); return; }
      const k = x.dataset.f; if (!k || k === 'q' || k === 'name') return;
      if (k === 'slot') {
        if (x.value === 'custom') st.custom = true;
        else { const [a, b] = x.value.split('-'); st.start = a; st.end = b; st.custom = false; }
      } else st[k] = x.value;
      if (k === 'start' && T(st.end) <= T(st.start)) st.end = Store.fromMin(T(st.start) + 60);
      draw();
    });
    let qt;
    box.addEventListener('input', (e) => {
      if (e.target.dataset.f === 'q') { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value; draw(); const n = $('[data-f="q"]', box); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 150); }
      if (e.target.dataset.f === 'name') st.name = e.target.value;
    });
    box.addEventListener('click', (e) => {
      const nn = e.target.closest('[data-nn]'); if (nn) { st.newNames.splice(Number(nn.dataset.nn), 1); draw(); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'clear') { st.studentIds = []; st.newNames = []; draw(); }
      if (a.dataset.act === 'paste') { st.paste = !st.paste; draw(); if (st.paste) $('.paste-box textarea', box).focus(); }
      if (a.dataset.act === 'paste-go') {
        const names = $('.paste-box textarea', box).value.split('\n').map((l) => l.split(/\t|;/)[0].trim()).filter((n) => n.length > 1);
        let found = 0; let fresh = 0;
        names.forEach((n) => {
          const s = Store.students().find((x) => Store.norm(x.name) === Store.norm(n));
          if (s) { if (!st.studentIds.includes(s.id)) { st.studentIds.push(s.id); found++; } } else if (!st.newNames.some((x) => Store.norm(x) === Store.norm(n))) { st.newNames.push(n); fresh++; }
        });
        st.paste = false; draw();
        UI.toast(names.length ? `${found} meglévő diák hozzáadva${fresh ? `, ${fresh} új név` : ''}` : 'Nincs beolvasható név');
      }
    });
    draw();
    $('.js-save', sh.el).addEventListener('click', () => {
      if (!st.days.length) { UI.toast('Válassz legalább egy napot'); return; }
      if (T(st.end) <= T(st.start)) { UI.toast('A vége legyen a kezdés után'); return; }
      const name = st.name.trim() || ((Store.program(st.programId) || {}).name ? `${Store.program(st.programId).name} csoport` : 'Csoport');
      const newIds = st.newNames.length ? Store.addStudents(st.newNames.map((n) => ({ name: n, billing: { name: n, zip: '', city: '', street: '', taxNumber: '' } })), { programId: st.programId }) : [];
      Store.upsertTraining({ ...(id ? { id } : {}), name, days: st.days, start: st.start, end: st.end, programId: st.programId, coachIds: st.coachIds, studentIds: [...st.studentIds, ...newIds] });
      UI.toast(id ? 'Csoport mentve' : 'Csoport létrehozva'); sh.close();
    });
    const del = sh.el.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirmBox(`Törlöd: ${gName(t)}?`, { ok: 'Törlés', danger: true, sub: 'A már rögzített jelenlétek és az edzői órák megmaradnak.' });
      if (ok) { Store.deleteTraining(id); sh.close(); }
    });
  }

  // ======================================================================
  // JELENLÉT
  // ======================================================================
  const jf = { tab: 'naplo', week: null, onlyMissing: false, q: '' };
  function renderAttendance(el, r) {
    if (r && r.q && r.q.f === 'missing' && jf.week == null) { jf.onlyMissing = true; }
    const today = Store.todayYmd();
    if (!jf.week) jf.week = Store.weekStart(today);
    const missingAll = Store.missingSessions({ days: 21 }).filter((m) => m.date < today || Store.nowMin() >= T(m.training.end));
    const stats = Store.allStats();
    const owedN = Object.values(stats).filter((s) => s.owed > 0).length;

    el.innerHTML = `
      <div class="toolbar">
        <div class="seg-ctl"><button data-tab="naplo" class="${jf.tab === 'naplo' ? 'on' : ''}">Napló</button><button data-tab="potlas" class="${jf.tab === 'potlas' ? 'on' : ''}">Pótlásra várók · ${owedN}</button></div>
        <span class="grow"></span>
        ${jf.tab === 'naplo' ? `<label class="toggle"><input type="checkbox" class="js-miss" ${jf.onlyMissing ? 'checked' : ''}><i></i><span>Csak hiányzó rögzítések (${missingAll.length})</span></label>
        <div class="month-nav"><button class="icon-btn sm" data-w="-7">${I.prev}</button><b>${esc(UI.dateShort(jf.week))} – ${esc(UI.dateShort(Store.shiftYmd(jf.week, 6)))}</b><button class="icon-btn sm" data-w="7">${I.next}</button></div>` : `<label class="search">${I.search}<input id="pt-q" type="search" placeholder="Diák neve…" value="${esc(jf.q)}"></label>`}
      </div>
      <div class="js-body"></div>`;
    const body = $('.js-body', el);

    if (jf.tab === 'naplo') {
      let html = '';
      if (jf.onlyMissing) {
        html = missingAll.length ? `<div class="card att-day"><div class="card-h"><h3>Hiányzó jelenléti rögzítések</h3><small>utolsó 3 hét</small></div>${missingAll.map((m) => attRow(m.training, m.date, true)).join('')}</div>` : `<div class="card"><p class="empty-s">${I.check} Minden csoport jelenléte rögzítve van.</p></div>`;
      } else {
        for (let i = 0; i < 7; i++) {
          const d = Store.shiftYmd(jf.week, i);
          const slots = Store.slotsOn(d).filter((s) => s.groups.length);
          if (!slots.length && !Store.isClosed(d)) continue;
          const n = slots.reduce((a, s) => a + s.groups.length, 0);
          const done = slots.reduce((a, s) => a + s.groups.filter((g) => Store.session(g.id, d)).length, 0);
          html += `<div class="card att-day ${d === today ? 'is-today' : ''}"><div class="card-h"><h3>${esc(UI.cap(UI.dateLong(d)))}${d === today ? ' <span class="pill live">Ma</span>' : ''}</h3><small>${Store.isClosed(d) ? 'Ünnepnap – zárva' : `${n} csoport · ${done} rögzítve`}</small></div>
            ${slots.map((s) => `<div class="att-slot"><b class="mono">${s.start}–${s.end}</b><small>${s.groups.length} csoport · ${s.groups.filter((g) => Store.session(g.id, d)).length} rögzítve</small></div>${s.groups.map((g) => attRow(g, d)).join('')}`).join('')}</div>`;
        }
      }
      body.innerHTML = html || '<div class="card"><p class="empty-s">Ezen a héten nincs edzés.</p></div>';
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-att]'); if (b) { const [tid, d] = b.dataset.att.split('|'); openAttendance(tid, d); } });
    } else {
      const q = Store.norm(jf.q);
      const rows = Store.students().map((s) => ({ ...s, st: stats[s.id] })).filter((s) => s.st && s.st.owed > 0).filter((s) => !q || Store.norm(s.name).includes(q));
      body.innerHTML = `<div class="note info" style="margin-bottom:12px">${I.redo}<span>Akit a jelenlétnél nem pipáltak be, automatikusan ide kerül. Ha eljön pótolni egy másik csoportba, az edző „pótló gyerekként” veszi fel – onnantól lekerül a listáról. Egyedileg a diák adatlapján is lezárható.</span></div><div class="js-t"></div>`;
      Admin.table($('.js-t', body), {
        rows, sort: { key: 'owed', dir: -1 },
        onRow: (s) => openStudent(s.id),
        cols: [
          { key: 'name', label: 'Diák', sort: (s) => s.name, render: (s) => `<div class="t-person">${UI.avatar(s)}<span><b>${esc(s.name)}</b><small>${esc(Store.trainingsOfStudent(s.id).map(gName).join(', ') || 'nincs csoportja')}</small></span></div>` },
          { key: 'last', label: 'Utolsó hiányzás', sort: (s) => (s.st.absences.filter((a) => a.status === 'open').slice(-1)[0] || {}).date, render: (s) => { const a = s.st.absences.filter((x) => x.status === 'open').slice(-1)[0]; return a ? `${esc(UI.dateShort(a.date))}<span class="t-sub">${esc(a.start || '')} ${esc(a.name || '')}</span>` : ''; } },
          { key: 'abs', label: 'Hiányzás', align: 'r', cls: 'num', sort: (s) => s.st.absent, render: (s) => s.st.absent },
          { key: 'mk', label: 'Pótolva', align: 'r', cls: 'num', sort: (s) => s.st.makeups, render: (s) => s.st.makeups },
          { key: 'owed', label: 'Pótlandó', align: 'r', sort: (s) => s.st.owed, render: (s) => `<span class="pill warn">${s.st.owed} alkalom</span>` },
          { key: 'phone', label: 'Kapcsolat', render: (s) => `<span class="t-sub">${esc(s.parentName || '')}</span>${s.phone ? `<span class="mono dim">${esc(s.phone)}</span>` : ''}` },
        ],
        empty: 'Nincs pótlásra váró diák.',
      });
      Admin.bindFilters(el, jf, () => renderAttendance(el));
    }
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { jf.tab = b.dataset.tab; renderAttendance(el); }));
    el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { jf.week = Store.shiftYmd(jf.week, Number(b.dataset.w)); jf.onlyMissing = false; renderAttendance(el); }));
    const mc = $('.js-miss', el); if (mc) mc.addEventListener('change', () => { jf.onlyMissing = mc.checked; renderAttendance(el); });
  }
  function rateBar(rate) {
    if (rate == null) return '<span class="dim">—</span>';
    const p = Math.round(rate * 100);
    return `<span class="rate"><i style="--w:${p}%" class="${p < 75 ? 'lo' : ''}"></i></span><span class="t-sub">${p}%</span>`;
  }
  function attRow(t, d, withDate = false) {
    const s = Store.session(t.id, d);
    const today = Store.todayYmd();
    const future = d > today || (d === today && Store.nowMin() < T(t.start));
    const live = d === today && !future && Store.nowMin() < T(t.end);
    const held = Store.sessionCoach(s);
    let st;
    if (s) { const v = Object.values(s.marks); const p = v.filter((m) => m === 'present').length; st = `<span class="pill ok">${I.check}${p}/${v.length} jelen${s.makeups.length ? ` +${s.makeups.length}` : ''}</span><span class="t-sub">${esc(UI.timeOf(s.at))}</span>`; } else if (future) st = '<span class="pill soft">Később</span>';
    else if (live) st = '<span class="pill live">Folyamatban</span>';
    else st = '<span class="pill miss">Nincs rögzítve</span>';
    const sub = s ? (held ? `edző: <b>${esc(Store.coach(held) ? Store.coach(held).name : '')}</b>${(t.coachIds || []).length && !(t.coachIds || []).includes(held) ? ' <span class="tag-s">helyettesítés</span>' : ''}` : '<span class="warn-t">nincs edző megadva</span>')
      : `${t.studentIds.length} gyerek${t.coachIds && t.coachIds.length ? ` · beosztva: ${esc(coachesText(t.coachIds))}` : ''}`;
    return `<button class="att-row" data-att="${t.id}|${d}">
      <span class="att-time mono">${withDate ? `${esc(UI.dateShort(d))}<small>${t.start}</small>` : `<i class="dotc" style="background:${gColor(t)}"></i>`}</span>
      <span class="att-main"><b>${withDate ? `<i class="dotc" style="background:${gColor(t)}"></i>` : ''}${esc(gName(t))}</b><small>${sub}</small></span>
      <span class="att-st">${st}</span>${I.next}</button>`;
  }

  function openAttendance(tid, date) {
    const t = Store.training(tid); if (!t) return;
    const ex = Store.session(tid, date);
    const roster = Store.rosterFor(tid, date);
    const present = new Set(ex ? Object.keys(ex.marks).filter((k) => ex.marks[k] === 'present') : []);
    const makeups = ex ? [...ex.makeups] : [];
    let coachId = ex ? Store.sessionCoach(ex) || '' : '';
    const stats = Store.allStats();
    const sh = Admin.drawer({
      title: `Jelenlét – ${gName(t)}`,
      sub: `${esc(UI.cap(UI.dateLong(date)))} · ${t.start}–${t.end}${ex ? ` · rögzítette: ${esc((Store.coach(ex.by) || {}).name || 'Admin')}` : ''}`,
      body: '<div class="att-ed"></div>',
      footer: `${ex ? '<button class="btn danger-ghost l" data-act="delsess">Rögzítés törlése</button>' : ''}<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const box = $('.att-ed', sh.el);
    function draw() {
      const p = roster.filter((x) => present.has(x)).length;
      box.innerHTML = `
        <label class="fld att-coach ${coachId ? '' : 'need'}"><span>Ki tartotta az edzést? <em>${t.coachIds && t.coachIds.length ? `beosztva: ${esc(coachesText(t.coachIds))}` : ''}</em></span>
          <select class="js-coach"><option value="">— válassz edzőt —</option>${Store.coaches().map((c) => `<option value="${c.id}" ${c.id === coachId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <div class="toolbar tight"><b class="att-cnt mono">${p}<small>/${roster.length} jelen</small></b><span class="grow"></span><button class="btn sm soft" data-act="all">${p === roster.length ? 'Kijelölés törlése' : 'Mindenki itt'}</button></div>
        <div class="dw-card dw-list">${roster.map((sid) => { const s = Store.student(sid); const on = present.has(sid); return `<button class="li att-li ${on ? 'on' : ''}" data-sid="${sid}">${UI.avatar(s)}<span><b>${esc(s.name)}</b><small>${on ? 'jelen' : 'pótlásra kerül'}${stats[sid] && stats[sid].owed ? ` · ${stats[sid].owed} pótlandó` : ''}</small></span><i class="tick">${I.check}</i></button>`; }).join('') || '<p class="empty-s">Nincs gyerek ebben a csoportban.</p>'}</div>
        <div class="dw-sec"><h4>Pótló gyerekek <small>${makeups.length} fő</small></h4>
          <div class="dw-card dw-list">${makeups.map((sid) => { const s = Store.student(sid); return s ? `<div class="li">${UI.avatar(s)}<span><b>${esc(s.name)}</b><small>${esc(Store.trainingsOfStudent(sid).map(gName).join(', '))}</small></span><button class="icon-btn ghost sm" data-rm="${sid}">${I.x}</button></div>` : ''; }).join('')}
          <div class="li"><select class="inp sm js-mk" style="flex:1"><option value="">+ Pótló gyerek hozzáadása…</option>${Store.students().filter((s) => s.active !== false && !roster.includes(s.id) && !makeups.includes(s.id)).sort((a, b) => ((stats[b.id] || {}).owed || 0) - ((stats[a.id] || {}).owed || 0) || a.name.localeCompare(b.name, 'hu')).map((s) => `<option value="${s.id}">${esc(s.name)}${stats[s.id] && stats[s.id].owed ? ` (${stats[s.id].owed} pótlandó)` : ''}</option>`).join('')}</select></div></div></div>`;
    }
    box.addEventListener('click', (e) => {
      const li = e.target.closest('.att-li'); if (li) { const sid = li.dataset.sid; if (present.has(sid)) present.delete(sid); else present.add(sid); draw(); return; }
      const rm = e.target.closest('[data-rm]'); if (rm) { makeups.splice(makeups.indexOf(rm.dataset.rm), 1); draw(); return; }
      const a = e.target.closest('[data-act="all"]'); if (a) { const all = roster.every((x) => present.has(x)); roster.forEach((x) => (all ? present.delete(x) : present.add(x))); draw(); }
    });
    box.addEventListener('change', (e) => {
      if (e.target.matches('.js-mk') && e.target.value) { makeups.push(e.target.value); draw(); }
      if (e.target.matches('.js-coach')) { coachId = e.target.value; draw(); }
    });
    draw();
    $('.js-save', sh.el).addEventListener('click', () => {
      if (!coachId) { UI.toast('Válaszd ki, ki tartotta az edzést'); $('.att-coach', box).classList.add('need', 'shake'); return; }
      const marks = {}; roster.forEach((sid) => { marks[sid] = present.has(sid) ? 'present' : 'absent'; });
      Store.saveSession({ trainingId: tid, date, coachId, marks, makeups, by: ex ? ex.by : 'admin' });
      UI.toast('Jelenlét mentve'); sh.close();
    });
    const del = sh.el.querySelector('[data-act="delsess"]');
    if (del) del.addEventListener('click', async () => { const ok = await UI.confirmBox('Törlöd ezt a jelenléti rögzítést?', { ok: 'Törlés', danger: true, sub: 'Az edző órája és a hiányzások is lekerülnek.' }); if (ok) { Store.deleteSession(tid, date); sh.close(); } });
  }

  Admin.page('jelenlet', { title: 'Jelenlét', sub: 'Csoportonként: ki tartotta, ki volt jelen – hiányzó rögzítések és pótlásra várók', render: renderAttendance });

  // ======================================================================
  // DIÁKOK
  // ======================================================================
  const sf = { q: '', prog: '', show: 'active' };
  const groupPick = (selected = [], { compact = false } = {}) => `<div class="slot-pick ${compact ? 'compact' : ''}">${Store.trainings().map((t) => `<label class="${selected.includes(t.id) ? 'on' : ''}"><input type="checkbox" value="${t.id}" ${selected.includes(t.id) ? 'checked' : ''}><span><b><i class="dotc" style="background:${gColor(t)}"></i>${esc(gName(t))}</b><small>${esc(slotLabel(t))} · ${t.studentIds.length} fő</small></span></label>`).join('') || '<p class="empty-s">Még nincs csoport – az Órarendben hozhatsz létre.</p>'}</div>`;
  function renderStudents(el, r) {
    if (r && r.q && r.q.f === 'nogroup') { sf.show = 'notraining'; history.replaceState(null, '', '#/diakok'); }
    const month = Store.monthOf(Store.todayYmd());
    const stats = Store.allStats();
    const q = Store.norm(sf.q);
    const charges = Store.charges({ month });
    const rows = Store.students().map((s) => ({ ...s, st: stats[s.id], ch: charges.find((c) => c.studentId === s.id && c.status !== 'void'), ts: Store.trainingsOfStudent(s.id) }))
      .filter((s) => (sf.show === 'active' ? s.active !== false : sf.show === 'inactive' ? s.active === false : sf.show === 'unpaid' ? s.ch && s.ch.status === 'open' : sf.show === 'notraining' ? !s.ts.length && s.active !== false : sf.show === 'owed' ? s.st && s.st.owed > 0 : true))
      .filter((s) => !sf.prog || s.programId === sf.prog)
      .filter((s) => !q || [s.name, s.parentName, s.email, s.phone].some((x) => Store.norm(x).includes(q)));

    el.innerHTML = `
      <div class="toolbar">
        <label class="search">${I.search}<input id="st-q" type="search" placeholder="Diák, szülő, e-mail…" value="${esc(sf.q)}"></label>
        <select class="inp sm" data-f="prog"><option value="">Minden program</option>${Store.programs().map((p) => `<option value="${p.id}" ${sf.prog === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <select class="inp sm" data-f="show"><option value="active" ${sf.show === 'active' ? 'selected' : ''}>Aktív diákok</option><option value="owed" ${sf.show === 'owed' ? 'selected' : ''}>Pótlásra vár</option><option value="unpaid" ${sf.show === 'unpaid' ? 'selected' : ''}>Havidíj nincs fizetve</option><option value="notraining" ${sf.show === 'notraining' ? 'selected' : ''}>Nincs csoportja</option><option value="inactive" ${sf.show === 'inactive' ? 'selected' : ''}>Inaktív</option><option value="all" ${sf.show === 'all' ? 'selected' : ''}>Mind</option></select>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="csv">${I.download}CSV</button>
        <button class="btn ghost sm" data-act="bulk">${I.upload}Lista beillesztése</button>
        <button class="btn dark sm" data-act="new">${I.plus}Új diák</button>
      </div>
      <div class="sumbar"><span><b>${rows.length}</b> diák</span>${Store.programs().map((p) => { const n = rows.filter((x) => x.programId === p.id).length; return n ? `<span><i class="dotc" style="background:${p.color}"></i>${esc(p.short)} <b>${n}</b></span>` : ''; }).join('')}</div>
      <div class="js-t"></div>`;
    Admin.table($('.js-t', el), {
      rows, sort: { key: 'name', dir: 1 },
      rowCls: (s) => (s.active === false ? 'is-cx' : ''),
      onRow: (s) => openStudent(s.id),
      cols: [
        { key: 'name', label: 'Diák', sort: (s) => s.name, render: (s) => `<div class="t-person">${UI.avatar(s)}<span><b>${esc(s.name)}</b><small>${s.parentName ? `szülő: ${esc(s.parentName)}` : esc(s.email || '')}</small></span></div>` },
        { key: 'age', label: 'Kor', align: 'r', cls: 'num dim', sort: (s) => -s.birthYear, render: (s) => (s.birthYear ? `${new Date().getFullYear() - s.birthYear}` : '') },
        { key: 'prog', label: 'Program', sort: (s) => (Store.program(s.programId) || {}).name, render: (s) => { const p = Store.program(s.programId); return p ? `<i class="dotc" style="background:${p.color}"></i>${esc(p.name)}` : '<span class="dim">—</span>'; } },
        { key: 'ts', label: 'Csoport', render: (s) => (s.ts.length ? `<span class="chips">${s.ts.map((t) => `<span class="chip-s" title="${esc(slotLabel(t))}">${esc(gName(t))} <span class="dim">${esc(daysText(t))} ${t.start}</span></span>`).join('')}</span>` : '<span class="pill warn">nincs</span>') },
        { key: 'rate', label: 'Jelenlét', sort: (s) => (s.st ? s.st.rate : null), render: (s) => rateBar(s.st && s.st.rate) },
        { key: 'owed', label: 'Pótlandó', align: 'r', sort: (s) => (s.st ? s.st.owed : 0), render: (s) => (s.st && s.st.owed ? `<span class="pill warn">${s.st.owed}</span>` : '<span class="dim">—</span>') },
        { key: 'fee', label: `Havidíj (${UI.MONTHS_SHORT[Number(month.slice(5)) - 1]})`, sort: (s) => (s.ch ? (s.ch.status === 'paid' ? 1 : 2) : 0), render: (s) => (!s.ch ? '<span class="dim">nincs kiírva</span>' : s.ch.status === 'paid' ? `<span class="pill ok">${I.check}Fizetve</span>` : `<span class="pill ${s.ch.due < Store.todayYmd() ? 'miss' : 'todo'}">${money(s.ch.amount)}</span>`) },
      ],
      empty: 'Nincs a szűrésnek megfelelő diák.',
    });
    Admin.bindFilters(el, sf, () => renderStudents(el));
    el.querySelector('[data-act="new"]').addEventListener('click', () => editStudent());
    el.querySelector('[data-act="bulk"]').addEventListener('click', bulkImport);
    el.querySelector('[data-act="csv"]').addEventListener('click', () => Admin.csv('diakok.csv', [
      { label: 'Név', get: (s) => s.name }, { label: 'Születési év', get: (s) => s.birthYear }, { label: 'Program', get: (s) => (Store.program(s.programId) || {}).name },
      { label: 'Csoport', get: (s) => s.ts.map((t) => `${gName(t)} (${slotLabel(t)})`).join(', ') }, { label: 'Szülő', get: (s) => s.parentName }, { label: 'Telefon', get: (s) => s.phone }, { label: 'E-mail', get: (s) => s.email },
      { label: 'Jelenlét %', get: (s) => (s.st && s.st.rate != null ? Math.round(s.st.rate * 100) : '') }, { label: 'Pótlandó', get: (s) => (s.st ? s.st.owed : 0) },
      { label: 'Havidíj', get: (s) => (s.ch ? s.ch.amount : '') }, { label: 'Havidíj állapot', get: (s) => (s.ch ? (s.ch.status === 'paid' ? 'fizetve' : 'nyitott') : 'nincs kiírva') },
    ], rows));
  }
  Admin.page('diakok', { title: 'Diákok', sub: 'Edzésre járó gyerekek és felnőttek – program, csoport, jelenlét, tandíj', render: renderStudents });

  function openStudent(id) {
    const s = Store.student(id); if (!s) return;
    const st = Store.stats(id) || { present: 0, absent: 0, owed: 0, absences: [], rate: null, makeups: 0 };
    const pr = Store.program(s.programId);
    const ts = Store.trainingsOfStudent(id);
    const charges = Store.charges({ studentId: id }).sort((a, b) => (a.month < b.month ? 1 : -1));
    const bl = s.billing || {};
    const absLabel = (a) => { const t = Store.training(a.trainingId); return `${a.start || (t && t.start) || ''} ${a.name || (t ? gName(t) : 'törölt csoport')}`; };
    const sh = Admin.drawer({
      wide: true,
      title: s.name,
      sub: `${pr ? esc(pr.name) : 'Nincs program'}${s.birthYear ? ` · ${new Date().getFullYear() - s.birthYear} éves` : ''}${s.active === false ? ' · <b>inaktív</b>' : ''}`,
      body: `
        <div class="dw-stats">
          <div><b>${st.rate == null ? '—' : `${Math.round(st.rate * 100)}%`}</b><span>jelenlét (${st.present + st.absent} edzés)</span></div>
          <div><b>${st.absent}</b><span>hiányzás · ${st.makeups} pótolva</span></div>
          <div class="${st.owed ? 'bad' : ''}"><b>${st.owed}</b><span>pótlásra vár</span></div>
        </div>
        <div class="dw-sec dw-actions">
          <button class="btn ghost sm" data-act="edit">${I.edit}Adatok</button>
          ${charges.find((c) => c.status === 'open') ? `<button class="btn dark sm" data-act="pay">${I.cash}Tandíj befizetése</button>` : ''}
          ${s.email ? `<a class="btn ghost sm" href="mailto:${esc(s.email)}">${I.mail}E-mail</a>` : ''}
          ${s.phone ? `<a class="btn ghost sm" href="tel:${esc(s.phone.replace(/\s/g, ''))}">${I.phone}Hívás</a>` : ''}
        </div>
        <div class="dw-sec dw-kv">
          <div><small>Szülő / kapcsolattartó</small><b>${esc(s.parentName || '—')}</b></div>
          <div><small>Telefon</small><b class="mono">${esc(s.phone || '—')}</b></div>
          <div><small>E-mail</small><b>${esc(s.email || '—')}</b></div>
          <div><small>Havidíj</small><b class="mono">${pr ? money(Math.round(pr.fee * (1 - (s.discount || 0) / 100))) : '—'}${s.discount ? ` <small>(${s.discount}% kedvezmény)</small>` : ''}</b></div>
          <div class="full"><small>Számlázás</small><b>${esc(bl.name || s.parentName || s.name)}${[bl.zip, bl.city, bl.street].filter(Boolean).length ? ` · ${esc([bl.zip, bl.city, bl.street].filter(Boolean).join(' '))}` : ''}</b></div>
          ${s.note ? `<div class="full"><small>Megjegyzés</small><b>${esc(s.note)}</b></div>` : ''}
        </div>
        <div class="dw-sec"><h4>Csoportok <small>pipáld be, melyik csoportba jár</small></h4>${groupPick(ts.map((x) => x.id))}</div>
        <div class="dw-sec"><h4>Tandíjak</h4><div class="dw-card dw-list">${charges.map((c) => `<div class="li"><span><b>${esc(UI.monthLabel(c.month))}</b><small>${esc(c.name)} · határidő ${esc(UI.dateShort(c.due))}</small></span>${c.status === 'paid' ? `<span class="pill ok">${I.check}Fizetve</span>` : c.status === 'void' ? '<span class="pill soft">Elengedve</span>' : `<button class="btn sm soft" data-paych="${c.id}">Befizetés</button>`}<span class="num">${money(c.amount)}</span></div>`).join('') || '<p class="empty-s">Még nincs kiírt tandíj.</p>'}</div></div>
        <div class="dw-sec"><h4>Hiányzások <small>${st.absences.length} db</small></h4><div class="dw-card dw-list">${[...st.absences].reverse().slice(0, 20).map((a) => `<div class="li"><span><b>${esc(UI.dateShort(a.date))} · ${esc(absLabel(a))}</b><small>${a.status === 'makeup' ? 'pótolva másik csoportban' : a.status === 'manual' ? 'elengedve / kézzel lezárva' : 'pótlásra vár'}</small></span>${a.status === 'makeup' ? '<span class="pill ok">Pótolva</span>' : `<label class="toggle sm" title="Elengedve / pótolva jelölés"><input type="checkbox" data-res="${esc(a.key)}" ${a.status === 'manual' ? 'checked' : ''}><i></i></label>`}</div>`).join('') || '<p class="empty-s">Nincs hiányzás.</p>'}</div></div>`,
      footer: `<button class="btn danger-ghost l" data-act="active">${s.active === false ? 'Újra aktív' : 'Inaktiválás'}</button><button class="btn ghost" data-close>Bezárás</button>`,
    });
    sh.el.addEventListener('change', (e) => {
      const x = e.target;
      if (x.closest('.slot-pick')) { Store.setStudentTrainings(id, $$('.slot-pick input:checked', sh.el).map((i) => i.value)); x.closest('label').classList.toggle('on', x.checked); UI.toast('Csoportok mentve'); }
      if (x.dataset.res) { Store.setResolved(x.dataset.res, x.checked); UI.toast(x.checked ? 'Hiányzás lezárva' : 'Hiányzás újra pótlásra vár'); }
    });
    sh.el.addEventListener('click', async (e) => {
      const pc = e.target.closest('[data-paych]');
      if (pc) { const m = await Admin.actions.pickMethod('Tandíj fizetési módja'); if (m) { Store.payCharge(pc.dataset.paych, m); UI.toast('Tandíj befizetve, számla kiállítva'); sh.close(); openStudent(id); } return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'edit') { sh.close(); editStudent(id); }
      if (a.dataset.act === 'pay') { const c = charges.find((x) => x.status === 'open'); const m = await Admin.actions.pickMethod('Tandíj fizetési módja'); if (m) { Store.payCharge(c.id, m); UI.toast('Tandíj befizetve, számla kiállítva'); sh.close(); openStudent(id); } }
      if (a.dataset.act === 'active') { Store.upsertStudent({ id, active: s.active === false }); sh.close(); UI.toast(s.active === false ? 'Diák újra aktív' : 'Diák inaktiválva (a jelenléti naplóban nem jelenik meg)'); }
    });
  }

  function editStudent(id) {
    const s = id ? Store.student(id) : { name: '', birthYear: '', programId: '', parentName: '', phone: '', email: '', discount: 0, note: '', billing: {}, active: true };
    const bl = s.billing || {};
    const sh = Admin.drawer({
      title: id ? 'Diák adatai' : 'Új diák',
      body: `<form class="st-form">
        <div class="fld-row"><label class="fld"><span>Név</span><input name="name" value="${esc(s.name)}" required></label><label class="fld"><span>Születési év</span><input name="birthYear" type="number" min="1940" max="2030" value="${esc(s.birthYear || '')}"></label></div>
        <div class="fld-row"><label class="fld"><span>Program (tandíj alapja)</span><select name="programId"><option value="">— nincs —</option>${Store.programs().map((p) => `<option value="${p.id}" ${p.id === s.programId ? 'selected' : ''}>${esc(p.name)} · ${money(p.fee)}/hó</option>`).join('')}</select></label>
        <label class="fld"><span>Kedvezmény (%)</span><input name="discount" type="number" min="0" max="100" value="${esc(s.discount || 0)}"></label></div>
        <h4 class="form-h">Kapcsolattartó</h4>
        <label class="fld"><span>Szülő neve (gyereknél)</span><input name="parentName" value="${esc(s.parentName || '')}"></label>
        <div class="fld-row"><label class="fld"><span>Telefon</span><input name="phone" value="${esc(s.phone || '')}"></label><label class="fld"><span>E-mail</span><input name="email" type="email" value="${esc(s.email || '')}"></label></div>
        <h4 class="form-h">Számlázás</h4>
        <label class="fld"><span>Számlázási név</span><input name="bname" value="${esc(bl.name || '')}" placeholder="ha üres, a szülő / diák neve"></label>
        <div class="fld-row three"><label class="fld"><span>Irsz.</span><input name="zip" value="${esc(bl.zip || '')}"></label><label class="fld"><span>Település</span><input name="city" value="${esc(bl.city || '')}"></label><label class="fld"><span>Utca, házszám</span><input name="street" value="${esc(bl.street || '')}"></label></div>
        <label class="fld"><span>Megjegyzés</span><textarea name="note" rows="2">${esc(s.note || '')}</textarea></label>
        ${!id ? `<div class="fld"><span>Csoport</span>${groupPick([], { compact: true })}</div>` : ''}
      </form>`,
      footer: `${id ? '<button class="btn danger-ghost l" data-act="del">Törlés</button>' : ''}<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const fm = $('.st-form', sh.el);
    fm.addEventListener('change', (e) => { if (e.target.closest('.slot-pick')) e.target.closest('label').classList.toggle('on', e.target.checked); });
    $('.js-save', sh.el).addEventListener('click', () => {
      const name = fm.name.value.trim(); if (name.length < 2) { UI.toast('Add meg a nevet'); return; }
      const data = {
        ...(id ? { id } : {}), name, birthYear: Number(fm.birthYear.value) || '', programId: fm.programId.value, discount: Number(fm.discount.value) || 0,
        parentName: fm.parentName.value.trim(), phone: fm.phone.value.trim(), email: fm.email.value.trim(), note: fm.note.value.trim(),
        billing: { name: fm.bname.value.trim() || fm.parentName.value.trim() || name, zip: fm.zip.value.trim(), city: fm.city.value.trim(), street: fm.street.value.trim(), taxNumber: '' },
      };
      const nid = Store.upsertStudent(data);
      if (!id) { const tids = $$('.slot-pick input:checked', fm).map((i) => i.value); if (tids.length) Store.setStudentTrainings(nid, tids); }
      sh.close(); UI.toast('Diák mentve'); openStudent(nid);
    });
    const del = sh.el.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', async () => {
      const pays = Store.paymentsOf('student', id);
      if (pays.length) { UI.toast('Befizetéssel rendelkező diák nem törölhető – inaktiváld helyette'); return; }
      const ok = await UI.confirmBox(`Törlöd: ${s.name}?`, { ok: 'Törlés', danger: true }); if (ok) { Store.deleteStudent(id); sh.close(); }
    });
  }

  function bulkImport() {
    const sh = Admin.drawer({
      wide: true,
      title: 'Diáklista beillesztése',
      sub: 'Excelből vagy szövegből – soronként egy diák',
      body: `<form class="bulk-form">
        <p class="sheet-note">Formátum: <span class="mono">Név ; születési év ; szülő neve ; telefon ; e-mail</span> – csak a név kötelező. Tabulátorral elválasztott (Excelből másolt) sorokat is elfogad. Egy csoport névsorát a csoportnál is beillesztheted (Órarend → csoport → Névsor beillesztése).</p>
        <label class="fld"><textarea name="txt" rows="9" class="mono" placeholder="Kiss Anna; 2015; Kiss Péter; +36 30 123 4567&#10;Nagy Bence; 2013"></textarea></label>
        <div class="fld-row"><label class="fld"><span>Program</span><select name="programId"><option value="">— később —</option>${Store.programs().map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><div class="fld"><span>Előnézet</span><div class="ro js-prev">0 diák</div></div></div>
        <div class="fld"><span>Csoport (mindenkinek)</span>${groupPick([], { compact: true })}</div>
      </form>`,
      footer: '<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Importálás</button>',
    });
    const fm = $('.bulk-form', sh.el);
    const parse = () => fm.txt.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const p = l.split(/\t|;/).map((x) => x.trim()); return { name: p[0], birthYear: Number(p[1]) || '', parentName: p[2] || '', phone: p[3] || '', email: p[4] || '' }; }).filter((x) => x.name && x.name.length > 1);
    fm.addEventListener('input', () => { $('.js-prev', fm).textContent = `${parse().length} diák`; });
    fm.addEventListener('change', (e) => { if (e.target.closest('.slot-pick')) e.target.closest('label').classList.toggle('on', e.target.checked); });
    $('.js-save', sh.el).addEventListener('click', () => {
      const list = parse(); if (!list.length) { UI.toast('Nincs beolvasható sor'); return; }
      const ids = Store.addStudents(list.map((x) => ({ ...x, billing: { name: x.parentName || x.name, zip: '', city: '', street: '', taxNumber: '' } })), { programId: fm.programId.value, trainingIds: $$('.slot-pick input:checked', fm).map((i) => i.value) });
      sh.close(); UI.toast(`${ids.length} diák importálva`);
    });
  }

  // ======================================================================
  // EDZŐK – óraszám szűrhetően (hét, hónap, egyedi időszak)
  // ======================================================================
  const cf = { mode: 'month', ref: null, custom: { from: '', to: '' } };
  function coachRange() {
    const ref = cf.ref || Store.todayYmd();
    if (cf.mode === 'week') { const from = Store.weekStart(ref); const to = Store.shiftYmd(from, 6); return { from, to, label: `${UI.dateShort(from)} – ${UI.dateShort(to)}`, title: 'hét' }; }
    if (cf.mode === 'custom') { const from = cf.custom.from || Store.periodRange('month').from; const to = cf.custom.to || Store.todayYmd(); return { from, to, label: `${UI.dateShort(from)} – ${UI.dateShort(to)}`, title: 'időszak' }; }
    const r = Store.monthRange(Store.monthOf(ref)); return { ...r, label: UI.monthLabel(Store.monthOf(ref)), title: 'hónap' };
  }
  function renderCoaches(el) {
    const rg = coachRange();
    const rows = Store.coaches().map((c) => {
      const h = Store.coachHours(c.id, rg.from, rg.to);
      const pay = Math.round((h.minutes / 60) * (c.rate || 0) + h.privates * (c.rate || 0));
      return { ...c, h, pay, groups: Store.trainings().filter((t) => (t.coachIds || []).includes(c.id)) };
    });
    const maxMin = Math.max(60, ...rows.map((r) => r.h.minutes));
    const isNow = !cf.ref || (cf.mode === 'week' ? Store.weekStart(cf.ref) === Store.weekStart(Store.todayYmd()) : Store.monthOf(cf.ref) === Store.monthOf(Store.todayYmd()));
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg-ctl">${[['week', 'Hét'], ['month', 'Hónap'], ['custom', 'Egyedi']].map(([k, l]) => `<button data-mode="${k}" class="${cf.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${cf.mode === 'custom'
          ? `<span class="period-c"><input type="date" class="inp sm" data-cfrom value="${rg.from}"><span>–</span><input type="date" class="inp sm" data-cto value="${rg.to}"></span>`
          : `<div class="month-nav"><button class="icon-btn sm" data-shift="-1" aria-label="Előző">${I.prev}</button><b>${esc(rg.label)}</b><button class="icon-btn sm" data-shift="1" aria-label="Következő">${I.next}</button></div>${isNow ? '' : `<button class="btn sm ghost" data-act="now">${cf.mode === 'week' ? 'Ez a hét' : 'Ez a hónap'}</button>`}`}
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="csv">${I.download}Óraösszesítő (CSV)</button>
        <button class="btn ghost sm" data-act="csvd">${I.download}Részletes (CSV)</button>
        <button class="btn dark sm" data-act="new">${I.plus}Új edző</button>
      </div>
      <div class="sumbar"><span><b>${rows.filter((r) => r.h.minutes).length}</b> / ${rows.length} edző dolgozott</span><span><b>${hoursNum(rows.reduce((a, r) => a + r.h.minutes, 0))}</b> óra összesen</span><span><b>${rows.reduce((a, r) => a + r.h.groups, 0)}</b> csoport-alkalom</span><span><b>${rows.reduce((a, r) => a + r.h.privates, 0)}</b> magánóra</span><span><b>${money(rows.reduce((a, r) => a + r.pay, 0))}</b> becsült edzői díj</span></div>
      <div class="js-t"></div>
      <p class="note" style="margin-top:14px">${I.clock}<span>Az órák a <b>jelenléti naplóból</b> számolódnak: ahol az edző a csoportnál kiválasztotta magát és a jelenlét el lett mentve. Ha egy idősávban egyszerre két csoportnál is szerepel, az idő csak egyszer számít. A magánórák a pályanaptár heti edzésblokkjaiból jönnek.</span></p>`;
    Admin.table($('.js-t', el), {
      rows, sort: { key: 'hours', dir: -1 },
      rowCls: (c) => (c.active === false ? 'is-cx' : ''),
      onRow: (c) => coachDetail(c.id),
      cols: [
        { key: 'name', label: 'Edző', sort: (c) => c.name, render: (c) => `<div class="t-person">${UI.avatar(c)}<span><b>${esc(c.name)}</b><small>${c.groups.length ? `${c.groups.length} csoport beosztva` : 'nincs beosztás'}</small></span></div>` },
        { key: 'hours', label: 'Órák', sort: (c) => c.h.minutes, width: '30%', render: (c) => `<span class="hbar"><i style="--w:${(c.h.minutes / maxMin) * 100}%;--c:${c.color || 'var(--ink)'}"></i></span><b class="mono hnum">${hoursNum(c.h.minutes)}</b>` },
        { key: 'groups', label: 'Csoport-alkalom', align: 'r', cls: 'num', sort: (c) => c.h.groups, render: (c) => c.h.groups },
        { key: 'days', label: 'Nap', align: 'r', cls: 'num', sort: (c) => c.h.days, render: (c) => c.h.days },
        { key: 'priv', label: 'Magánóra', align: 'r', cls: 'num', sort: (c) => c.h.privates, render: (c) => c.h.privates || '<span class="dim">—</span>' },
        { key: 'rate', label: 'Óradíj', align: 'r', cls: 'num dim', sort: (c) => c.rate || 0, render: (c) => money(c.rate || 0) },
        { key: 'pay', label: 'Becsült díj', align: 'r', cls: 'num', sort: (c) => c.pay, render: (c) => `<b>${money(c.pay)}</b>` },
      ],
      empty: 'Még nincs edző.',
    });
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      cf.mode = b.dataset.mode;
      if (cf.mode === 'custom' && !cf.custom.from) cf.custom = { from: Store.periodRange('month').from, to: Store.todayYmd() };
      renderCoaches(el);
    }));
    el.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.shift); const ref = cf.ref || Store.todayYmd();
      cf.ref = cf.mode === 'week' ? Store.shiftYmd(ref, n * 7) : `${Store.shiftMonth(Store.monthOf(ref), n)}-01`;
      renderCoaches(el);
    }));
    const now = $('[data-act="now"]', el); if (now) now.addEventListener('click', () => { cf.ref = null; renderCoaches(el); });
    const cfrom = $('[data-cfrom]', el); const cto = $('[data-cto]', el);
    if (cfrom) cfrom.addEventListener('change', () => { cf.custom.from = cfrom.value; renderCoaches(el); });
    if (cto) cto.addEventListener('change', () => { cf.custom.to = cto.value; renderCoaches(el); });
    $('[data-act="new"]', el).addEventListener('click', () => editCoach());
    $('[data-act="csv"]', el).addEventListener('click', () => Admin.csv(`edzoi-orak-${rg.from}_${rg.to}.csv`, [
      { label: 'Edző', get: (c) => c.name }, { label: 'Időszak kezdete', get: () => rg.from }, { label: 'Időszak vége', get: () => rg.to },
      { label: 'Órák', get: (c) => hoursNum(c.h.minutes) }, { label: 'Csoport-alkalmak', get: (c) => c.h.groups }, { label: 'Napok', get: (c) => c.h.days },
      { label: 'Magánórák', get: (c) => c.h.privates }, { label: 'Óradíj (Ft)', get: (c) => c.rate || 0 }, { label: 'Becsült díj (Ft)', get: (c) => c.pay },
    ], rows));
    $('[data-act="csvd"]', el).addEventListener('click', () => {
      const items = rows.flatMap((c) => c.h.items.map((s) => ({ c, s })));
      Admin.csv(`edzoi-orak-reszletes-${rg.from}_${rg.to}.csv`, [
        { label: 'Edző', get: (x) => x.c.name }, { label: 'Dátum', get: (x) => x.s.date }, { label: 'Kezdés', get: (x) => x.s.start }, { label: 'Vége', get: (x) => x.s.end },
        { label: 'Csoport', get: (x) => x.s.name }, { label: 'Perc', get: (x) => T(x.s.end) - T(x.s.start) },
        { label: 'Jelen', get: (x) => Object.values(x.s.marks).filter((m) => m === 'present').length }, { label: 'Létszám', get: (x) => Object.keys(x.s.marks).length },
      ], items.sort((a, b) => (a.s.date < b.s.date ? -1 : a.s.date > b.s.date ? 1 : a.c.name.localeCompare(b.c.name, 'hu'))));
    });
  }
  Admin.page('edzok', { title: 'Edzők', sub: 'Ki hány órát dolgozott – hét, hónap vagy egyedi időszak szerint', render: renderCoaches });

  function coachDetail(id) {
    const c = Store.coach(id); if (!c) return;
    const rg = coachRange();
    const h = Store.coachHours(id, rg.from, rg.to);
    const pay = Math.round((h.minutes / 60) * (c.rate || 0) + h.privates * (c.rate || 0));
    const byDate = {};
    h.items.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    const groups = Store.trainings().filter((t) => (t.coachIds || []).includes(id));
    const sh = Admin.drawer({
      wide: true,
      title: c.name,
      sub: `${esc(rg.label)} · ${money(c.rate || 0)}/óra`,
      body: `
        <div class="dw-stats four">
          <div><b>${hoursNum(h.minutes)}</b><span>óra</span></div>
          <div><b>${h.groups}</b><span>csoport-alkalom · ${h.days} nap</span></div>
          <div><b>${h.privates}</b><span>magánóra</span></div>
          <div><b>${money(pay)}</b><span>becsült díj</span></div>
        </div>
        <div class="dw-sec dw-actions"><button class="btn ghost sm" data-act="edit">${I.edit}Adatok, PIN, óradíj</button></div>
        <div class="dw-sec"><h4>Megtartott edzések <small>${esc(rg.label)}</small></h4>
          <div class="dw-card dw-list">${Object.keys(byDate).length ? Object.entries(byDate).reverse().map(([d, list]) => `<div class="li cd-day"><span><b>${esc(UI.cap(UI.dateLong(d)))}</b>${list.map((s) => { const t = Store.training(s.trainingId); const sub = t && (t.coachIds || []).length && !(t.coachIds || []).includes(id); const p = Object.values(s.marks).filter((m) => m === 'present').length; return `<small class="cd-it"><span class="mono">${s.start}–${s.end}</span><span>${esc(s.name)}${sub ? ' <span class="tag-s">helyettesítés</span>' : ''}</span><span class="dim">${p}/${Object.keys(s.marks).length} jelen</span></small>`; }).join('')}</span></div>`).join('') : '<p class="empty-s">Ebben az időszakban nincs rögzített edzése.</p>'}</div></div>
        <div class="dw-sec"><h4>Heti beosztás <small>${groups.length} csoport</small></h4><div class="chips">${groups.map((t) => `<span class="chip-s"><i class="dotc" style="background:${gColor(t)}"></i>${esc(gName(t))} <span class="dim">${esc(slotLabel(t))}</span></span>`).join('') || '<span class="dim">Nincs beosztott csoportja</span>'}</div></div>`,
      footer: '<button class="btn ghost" data-close>Bezárás</button>',
    });
    sh.el.addEventListener('click', (e) => { if (e.target.closest('[data-act="edit"]')) { sh.close(); editCoach(id); } });
  }

  function editCoach(id) {
    const c = id ? Store.coach(id) : { name: '', short: '', pin: String(Math.floor(1000 + Math.random() * 9000)), color: Store.COACH_COLORS[Store.coaches().length % Store.COACH_COLORS.length], phone: '', email: '', rate: 6000, bio: '', active: true };
    const sh = Admin.drawer({
      title: id ? c.name : 'Új edző',
      body: `<form class="co-form">
        <div class="fld-row"><label class="fld"><span>Név</span><input name="name" value="${esc(c.name)}" required></label><label class="fld"><span>Rövidítés (naptárban)</span><input name="short" maxlength="4" value="${esc(c.short || '')}"></label></div>
        <div class="fld-row"><label class="fld"><span>PIN-kód (jelenléti app)</span><input name="pin" inputmode="numeric" maxlength="4" value="${esc(c.pin)}" class="mono"></label><label class="fld"><span>Óradíj (Ft)</span><input name="rate" type="number" step="500" value="${esc(c.rate || 0)}"></label></div>
        <div class="fld-row"><label class="fld"><span>Telefon</span><input name="phone" value="${esc(c.phone || '')}"></label><label class="fld"><span>E-mail</span><input name="email" type="email" value="${esc(c.email || '')}"></label></div>
        <div class="fld"><span>Szín</span><div class="swatches">${Store.COACH_COLORS.map((col) => `<label><input type="radio" name="color" value="${col}" ${col === c.color ? 'checked' : ''}><i style="--c:${col}"></i></label>`).join('')}</div></div>
        <label class="fld"><span>Bemutatkozás (a weboldalon jelenik meg)</span><textarea name="bio" rows="3">${esc(c.bio || '')}</textarea></label>
        <label class="toggle"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}><i></i><span>Aktív (megjelenik a weboldalon és a jelenléti appban)</span></label>
      </form>`,
      footer: `${id ? '<button class="btn danger-ghost l" data-act="del">Törlés</button>' : ''}<button class="btn ghost" data-close>Mégse</button><button class="btn dark js-save">Mentés</button>`,
    });
    const fm = $('.co-form', sh.el);
    $('.js-save', sh.el).addEventListener('click', () => {
      const name = fm.name.value.trim(); if (name.length < 2) { UI.toast('Add meg a nevet'); return; }
      if (!/^\d{4}$/.test(fm.pin.value)) { UI.toast('A PIN 4 számjegy legyen'); return; }
      if (Store.coaches().some((x) => x.id !== id && x.pin === fm.pin.value)) { UI.toast('Ez a PIN már foglalt egy másik edzőnél'); return; }
      Store.upsertCoach({ ...(id ? { id } : {}), name, short: fm.short.value.trim().toUpperCase() || UI.initials(name), pin: fm.pin.value, rate: Number(fm.rate.value) || 0, phone: fm.phone.value.trim(), email: fm.email.value.trim(), color: fm.color.value, bio: fm.bio.value.trim(), active: fm.active.checked });
      sh.close(); UI.toast('Edző mentve');
    });
    const del = sh.el.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', async () => { const ok = await UI.confirmBox(`Törlöd: ${c.name}?`, { ok: 'Törlés', danger: true, sub: 'A csoportok beosztásáról is lekerül. Inkább inaktiváld, ha később visszajöhet.' }); if (ok) { Store.deleteCoach(id); sh.close(); } });
  }

  Object.assign(Admin.actions, { editTraining, openStudent, editStudent, openAttendance, editCoach, coachDetail });
})();
