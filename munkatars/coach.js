/* ==========================================================================
   Edzői felület: belépés → napok → idősávok → csoportok (blokkok) → siker
   A klub kérése szerint:
   - belépés után a hét napjai jelennek meg; egy napra koppintva az idősávok
     (hétköznap 13–20 óránként, szombaton 9–10, 10–11:30, 11:30–12:30)
   - az idősávban minden csoport külön blokk, saját névsorral
   - a blokkban az edző a legördülő listából kiválasztja magát, majd bepipálja,
     ki volt jelen; akit nem pipál be, automatikusan pótlásra kerül
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, cap } = UI;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const norm = Store.norm;
  const nowMin = Store.nowMin;
  const T = Store.toMin;
  const EARLY_MIN = 15;
  const CHEV = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  // idősáv (vagy csoport) fázisa egy adott napon: past | live | future
  const phaseOf = (x, date) => {
    const today = Store.todayYmd();
    if (date < today) return 'past';
    if (date > today) return 'future';
    const nm = nowMin();
    if (nm >= T(x.end)) return 'past';
    if (nm >= T(x.start)) return 'live';
    return 'future';
  };
  const canRecord = (x, date) => {
    const today = Store.todayYmd();
    return date < today || (date === today && nowMin() >= T(x.start) - EARLY_MIN);
  };
  const openAt = (x) => Store.fromMin(T(x.start) - EARLY_MIN);
  const notYetMsg = (x, date) => (date > Store.todayYmd()
    ? 'Ez az edzés még nem kezdődött el – a jelenlétet az edzés napján lehet felvenni.'
    : `Ez az edzés ${x.start}-kor kezdődik – a jelenlét ${openAt(x)} után vehető fel.`);
  const progressOf = (x) => clamp(Math.round(((nowMin() - T(x.start)) / (T(x.end) - T(x.start))) * 100), 0, 100);
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* */ } };

  // ---------- megjelenítési segédek ----------
  const gName = (g) => Store.groupName(g);
  const gProg = (g) => Store.programOfGroup(g);
  const gColor = (g) => (gProg(g) || {}).color || '#2E5D8C';
  const slotText = (x) => `${x.start}–${x.end}`;
  const slotParam = (x) => x.start.replace(':', '');
  const coachName = (id) => (Store.coach(id) || {}).name || '';
  const firstOf = (id) => (id ? UI.firstName(coachName(id)) : '');
  const daysText = (g) => {
    const ds = Store.daysOf(g);
    if (ds.length >= 3 && ds[ds.length - 1] - ds[0] === ds.length - 1) return `${UI.DAYS_SHORT[ds[0] - 1]}–${UI.DAYS_SHORT[ds[ds.length - 1] - 1]}`;
    return ds.map((d) => UI.DAYS_SHORT[d - 1]).join(', ');
  };
  const brandText = (s) => { const t = String(s).toUpperCase(); return esc(t.length > 22 ? `${t.slice(0, 21)}…` : t); };
  const dayTitle = (date) => cap(UI.DAYS[Store.dowOf(date) - 1]);
  const hNum = (min) => String(Math.round(min / 6) / 10).replace('.', ',');

  function slotCard(x, date, { chip = '', shared = true, brand = '', cls = '', rot = 0 } = {}) {
    return Court.card({ id: `${date}-${x.start}`, no: 1, surface: 'hard' }, {
      chip, cls, rot, sharedKey: shared ? `slot:${date}:${x.start}` : '', label: `${x.start}&#8239;–&#8239;${x.end}`,
      brand: brand || brandText(UI.DAYS[Store.dowOf(date) - 1]),
    });
  }
  const timeTile = (x, { live = false, muted = false } = {}) => `<span class="mini-wrap"><span class="time-tile ${live ? 'is-live' : ''} ${muted ? 'is-muted' : ''}"><b class="mono">${x.start}</b><small class="mono">${x.end}</small></span>${live ? '<i class="live-dot"></i>' : ''}</span>`;

  // ---------- állapotok ----------
  function slotStatus(x, date) {
    const n = x.groups.length;
    const done = x.groups.filter((g) => Store.session(g.id, date)).length;
    return { n, done, ph: phaseOf(x, date), all: n > 0 && done === n };
  }
  function slotPill(x, date) {
    const s = slotStatus(x, date);
    if (!s.n) return '';
    if (s.all) return `<span class="pill ok">${I.check}${s.done}/${s.n}</span>`;
    if (s.ph === 'live') return `<span class="pill live">Most${s.done ? ` · ${s.done}/${s.n}` : ''}</span>`;
    if (s.ph === 'future') return '<span class="pill soft">Később</span>';
    return `<span class="pill todo">${s.done}/${s.n} kész</span>`;
  }
  function slotDot(x, date) {
    const s = slotStatus(x, date);
    if (!s.n) return 'none';
    if (s.all) return 'ok';
    if (s.ph === 'live') return 'live';
    if (s.ph === 'future') return 'plan';
    return 'miss';
  }
  function dayInfo(date) {
    const slots = Store.slotsOn(date);
    const groups = slots.flatMap((x) => x.groups);
    const done = groups.filter((g) => Store.session(g.id, date)).length;
    const due = groups.filter((g) => phaseOf(g, date) === 'past' && !Store.session(g.id, date)).length;
    return { slots, groups, n: groups.length, done, due, closed: Store.isClosed(date) };
  }
  function dayPill(date, d) {
    const today = Store.todayYmd();
    if (d.closed) return '<span class="pill soft">Zárva</span>';
    if (!d.n) return '<span class="pill soft">Nincs edzés</span>';
    if (d.done === d.n) return `<span class="pill ok">${I.check}Kész</span>`;
    if (date > today) return '<span class="pill soft">Később</span>';
    if (date < today) return `<span class="pill miss">${d.n - d.done} hiányzik</span>`;
    return `<span class="pill todo">${d.done}/${d.n} kész</span>`;
  }
  // az edző saját órái egy napon (ahol kiválasztotta magát)
  const myMinutesOn = (coachId, date) => Store.coachHours(coachId, date, date).minutes;

  // ---------- piszkozatok (a még nem mentett pipák csoportonként) ----------
  const drafts = {};
  function draftOf(g, date) {
    const k = Store.sessionKey(g.id, date);
    if (!drafts[k]) {
      const s = Store.session(g.id, date);
      drafts[k] = {
        coachId: s ? Store.sessionCoach(s) || '' : '',
        present: new Set(s ? Object.keys(s.marks).filter((sid) => s.marks[sid] === 'present') : []),
        makeups: s ? s.makeups.filter((sid) => Store.student(sid)) : [],
        dirty: false,
      };
    }
    return drafts[k];
  }
  const dropDraft = (g, date) => { delete drafts[Store.sessionKey(g.id, date)]; };

  // ======================================================================
  // PIN lap
  // ======================================================================
  function pinSheet({ title, person, check, onOk }) {
    let val = '';
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    const s = UI.sheet({
      cls: 'pin-sheet',
      body: `<div class="pin">
          ${person ? UI.avatar(person, 'xl') : `<span class="av xl av-admin">${I.gear}</span>`}
          <h3>${esc(title)}</h3>
          <p class="pin-help">Add meg a 4 jegyű PIN-kódot</p>
          <div class="pin-dots"><i></i><i></i><i></i><i></i></div>
          <div class="keypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button data-k="${k}">${k}</button>`).join('')}
            <span></span><button data-k="0">0</button>
            <button data-k="del" aria-label="Törlés" class="kp-del"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11v14H9l-6-7 6-7z"/><path d="M13 9.5l5 5M18 9.5l-5 5"/></svg></button>
          </div>
        </div>`,
      onClose: () => document.removeEventListener('keydown', onKey),
    });
    const dots = $$('.pin-dots i', s.el);
    const box = $('.pin-dots', s.el);
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < val.length));
    function press(k) {
      if (box.classList.contains('ok')) return;
      if (k === 'del') val = val.slice(0, -1);
      else if (val.length < 4) val += k;
      paint();
      if (val.length === 4) {
        if (check(val)) {
          box.classList.add('ok'); buzz(12);
          setTimeout(() => { s.close(); onOk(); }, 260);
        } else {
          box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); buzz([40, 40, 40]);
          setTimeout(() => { val = ''; paint(); }, 420);
        }
      }
    }
    s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    document.addEventListener('keydown', onKey);
  }

  // ======================================================================
  // Diákválasztó lap (pótló gyerek)
  // ======================================================================
  function pickStudent({ title = 'Pótló gyerek', exclude = [], onPick }) {
    const stats = Store.allStats();
    const taken = new Set(exclude);
    const cand = Store.students().filter((s) => s.active !== false && !taken.has(s.id))
      .sort((a, b) => ((stats[b.id] || {}).owed || 0) - ((stats[a.id] || {}).owed || 0) || a.name.localeCompare(b.name, 'hu'));
    const sh = UI.sheet({
      title,
      cls: 'tall',
      body: `<label class="search">${I.search}<input type="search" placeholder="Keresés név alapján" autocomplete="off"></label>
        <p class="sheet-note">Elöl azok, akiknek pótolnivalójuk van – ha felveszed, lekerülnek a pótlásra várók listájáról.</p>
        <div class="list-card pick-list">
          ${cand.map((s) => {
            const ow = (stats[s.id] || {}).owed || 0;
            const gs = Store.trainingsOfStudent(s.id).map((g) => `${gName(g)} (${daysText(g)} ${g.start})`).join(', ');
            return `<button class="row" data-sid="${s.id}" data-q="${esc(norm(s.name))}">
              ${UI.avatar(s)}<span class="row-main"><b>${esc(s.name)}</b><small>${esc(gs || 'Nincs csoportja')}</small></span>
              ${ow ? `<span class="pill warn">${ow} pótlandó</span>` : ''}
            </button>`;
          }).join('') || '<div class="empty-row">Nincs több diák.</div>'}
        </div>`,
    });
    const inp = $('input', sh.el);
    inp.addEventListener('input', () => {
      const q = norm(inp.value);
      $$('.pick-list .row', sh.el).forEach((row) => { row.hidden = q && !row.dataset.q.includes(q); });
    });
    sh.el.addEventListener('click', (e) => {
      const row = e.target.closest('.pick-list .row'); if (!row) return;
      sh.close();
      onPick(row.dataset.sid);
    });
  }

  // ======================================================================
  // Óráim (szűrhető: hét, előző hét, hónap, előző hónap)
  // ======================================================================
  const PERIODS = [['week', 'Ez a hét'], ['lastweek', 'Előző hét'], ['month', 'Ez a hónap'], ['lastmonth', 'Előző hónap']];
  function hoursSheet(coach, kind = 'week') {
    const sh = UI.sheet({ title: 'Óráim', sub: 'A jelenléti naplóból: ahol kiválasztottad magad edzőként', cls: 'tall hours-sheet', body: '<div class="hs"></div>' });
    const box = $('.hs', sh.el);
    function draw() {
      const { from, to } = Store.periodRange(kind);
      const h = Store.coachHours(coach.id, from, to);
      const byDate = {};
      h.items.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
      box.innerHTML = `
        <div class="seg hs-seg">${PERIODS.map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="hs-big"><b class="mono">${UI.hours(h.minutes)}</b><span>${esc(UI.dateShort(from))} – ${esc(UI.dateShort(to))}</span></div>
        <div class="hs-stats"><span><b>${h.groups}</b> csoport</span><span><b>${h.days}</b> nap</span>${h.privates ? `<span><b>${h.privates}</b> magánóra</span>` : ''}</div>
        ${Object.keys(byDate).length ? `<div class="list-card hs-list">${Object.entries(byDate).reverse().map(([d, list]) => `
          <div class="hs-day"><b>${esc(cap(UI.dateLong(d)))}</b>${list.map((s) => `<span class="hs-it"><span class="mono">${s.start}–${s.end}</span><span>${esc(s.name)}</span></span>`).join('')}</div>`).join('')}</div>`
          : `<div class="empty-state">${Court.ballSVG(30)}<b>Ebben az időszakban még nincs rögzített órád</b><small>Az órák akkor számítanak, ha a csoportnál kiválasztod magad és elmented a jelenlétet.</small></div>`}`;
    }
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { kind = b.dataset.k; draw(); } });
    draw();
  }

  // ======================================================================
  // BELÉPÉS
  // ======================================================================
  function login({ el }) {
    const s = Store.settings();
    const coaches = Store.coaches().filter((c) => c.active !== false);
    const today = Store.todayYmd();
    const fanCourts = [1, 2, 3, 4].map((no) => ({ id: `f${no}`, no, surface: 'hard' }));
    el.innerHTML = `
      <div class="scroll login">
        <header class="login-top">
          <div class="brand">${Court.ballSVG(18)}<span>${esc(s.clubName)} · munkatársak</span></div>
          <span class="login-date mono">${esc(UI.dateShort(today))}</span>
        </header>
        <div class="fan" aria-hidden="true">
          ${fanCourts.map((c, i) => `<div class="fan-card" style="--i:${i}">${Court.card(c)}</div>`).join('')}
        </div>
        <h1 class="display">Jelenléti<br><span>napló</span></h1>
        <p class="lead">Válaszd ki a neved, és add meg a PIN-kódodat.</p>
        <div class="list-card">
          ${coaches.map((c, i) => {
            const n = Store.trainingsOn(today, c.id).length;
            return `<button class="row" data-act="pick" data-id="${c.id}" style="--d:${i}">
              ${UI.avatar(c, 'lg')}
              <span class="row-main"><b>${esc(c.name)}</b><small>${n ? `Ma ${n} csoport a beosztásod szerint` : 'Ma nincs beosztásod'}</small></span>
              <span class="row-go">${I.next}</span>
            </button>`;
          }).join('') || '<div class="empty-row">Még nincs edző felvéve – az admin felületen adhatod hozzá.</div>'}
        </div>
        <a class="link-btn" href="../admin/index.html">${I.gear}<span>Admin felület</span>${I.next}</a>
        ${Store.isDemo ? `<p class="demo-hint"><b>Demó mód</b> · PIN-ek: ${coaches.map((c) => `${esc(UI.firstName(c.name))} ${esc(c.pin)}`).join(' · ')}</p>` : ''}
      </div>`;

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'pick') {
        const c = Store.coach(b.dataset.id);
        pinSheet({
          title: c.name, person: c,
          check: (pin) => Store.checkCoachPin(c.id, pin),
          onOk: () => { Store.setStaffAuth({ role: 'coach', id: c.id }); App.go('home', { replace: true }); },
        });
      }
    });
    return {};
  }

  // ======================================================================
  // KEZDŐLAP – a hét napjai
  // ======================================================================
  function home({ el, r }) {
    const auth = Store.staffAuth();
    const coach = Store.coach(auth.id);
    let week = Store.weekStart(r.week || Store.todayYmd());
    let sig = '';

    // a mai nap „most” idősávja: ami épp zajlik, különben a következő, különben a kitöltetlen
    function nowSlot() {
      const today = Store.todayYmd();
      const slots = Store.slotsOn(today).filter((x) => x.groups.length);
      return slots.find((x) => phaseOf(x, today) === 'live')
        || slots.find((x) => phaseOf(x, today) === 'past' && !slotStatus(x, today).all && T(x.end) > nowMin() - 120)
        || slots.find((x) => phaseOf(x, today) === 'future')
        || null;
    }
    const sigOf = () => { const x = nowSlot(); return x ? `${x.start}|${phaseOf(x, Store.todayYmd())}|${slotStatus(x, Store.todayYmd()).done}` : '-'; };

    function render() {
      const today = Store.todayYmd();
      const wk = Store.periodRange('week');
      const mo = Store.periodRange('month');
      const hWeek = Store.coachHours(coach.id, wk.from, wk.to);
      const hMonth = Store.coachHours(coach.id, mo.from, mo.to);
      const now = nowSlot();
      sig = sigOf();
      const days = Array.from({ length: 7 }, (_, i) => Store.shiftYmd(week, i)).filter((d) => Store.dowOf(d) <= 6 || Store.slotsOn(d).some((x) => x.groups.length));
      const missing = Store.missingSessions({ days: 14 }).filter((m) => m.date < today);
      const owed = Object.values(Store.allStats()).filter((s) => s.owed > 0);
      const owedN = owed.reduce((a, s) => a + s.owed, 0);
      const isThisWeek = week === Store.weekStart(today);

      let nowHtml = '';
      if (now) {
        const ph = phaseOf(now, today); const st = slotStatus(now, today);
        const chip = ph === 'live' ? '● MOST' : ph === 'future' ? 'KÖVETKEZŐ' : 'KITÖLTENDŐ';
        nowHtml = `<button class="now-card ph-${ph}" data-act="now" data-start="${now.start}">
          <span class="now-mini">${slotCard(now, today, { chip })}</span>
          <span class="now-txt">
            <small>${ph === 'live' ? 'Most zajlik' : ph === 'future' ? `Ma ${now.start}-kor` : 'Kitöltetlen csoport ma'}</small>
            <b class="mono">${slotText(now)}</b>
            <span>${st.n} csoport · ${ph === 'future' ? `${now.groups.reduce((a, g) => a + Store.rosterFor(g.id, today).length, 0)} gyerek` : `${st.done}/${st.n} rögzítve`}</span>
          </span>
          <span class="now-go">${I.next}</span>
          ${ph === 'live' ? `<span class="now-prog"><i style="--w:${progressOf(now)}%"></i></span>` : ''}
        </button>`;
      }

      el.innerHTML = `
        <div class="scroll home">
          <section class="hero hero-c">
            <div class="hero-top">
              <h1 class="hello"><span>Szia,</span> ${esc(UI.firstName(coach.name))}</h1>
              <button class="icon-btn inv" data-act="logout" aria-label="Kilépés">${I.logout}</button>
            </div>
            <button class="hours" data-act="hours" aria-label="Óráim megnyitása">
              <span class="hrs"><small>Ezen a héten</small><b class="mono">${hNum(hWeek.minutes)}<em>óra</em></b></span>
              <span class="hrs"><small>${esc(cap(UI.MONTHS[Number(mo.from.slice(5, 7)) - 1]))}ban</small><b class="mono">${hNum(hMonth.minutes)}<em>óra</em></b></span>
              <span class="hrs-go">Óráim ${I.next}</span>
            </button>
            ${nowHtml}
          </section>

          <section class="home-body">
            <div class="sec-head">
              <h2>Napok</h2>
              <div class="wk-switch">
                <button class="wk-nav" data-act="wk" data-n="-7" aria-label="Előző hét">${I.prev}</button>
                <span class="mono">${esc(UI.dateShort(week))} – ${esc(UI.dateShort(Store.shiftYmd(week, 6)))}</span>
                <button class="wk-nav" data-act="wk" data-n="7" aria-label="Következő hét">${I.next}</button>
              </div>
            </div>
            <div class="list-card days">
              ${days.map((d, i) => {
                const info = dayInfo(d);
                const mine = d <= today ? myMinutesOn(coach.id, d) : 0;
                const rel = UI.relDay(d);
                const dt = Store.parseYmd(d);
                const slotsN = info.slots.filter((x) => x.groups.length).length;
                return `<button class="row day-row ${d === today ? 'is-today' : ''} ${info.closed || !info.n ? 'is-off' : ''}" data-act="day" data-date="${d}" style="--d:${i}">
                  <span class="day-tile"><small>${UI.DAYS_SHORT[Store.dowOf(d) - 1]}</small><b class="mono">${dt.getDate()}</b></span>
                  <span class="row-main"><b>${esc(dayTitle(d))}${rel ? ` <em>${esc(rel)}</em>` : ''}</b>
                    <small>${info.closed ? 'Ünnepnap – zárva' : info.n ? `${info.n} csoport · ${mine ? `<span class="mine">te: ${UI.hours(mine)}</span>` : `${slotsN} idősáv`}` : 'Ezen a napon nincs edzés'}</small></span>
                  ${dayPill(d, info)}
                </button>`;
              }).join('')}
            </div>
            ${!isThisWeek ? `<button class="today-link" data-act="wk-today">Vissza az aktuális hétre</button>` : ''}
            ${missing.length ? `<button class="banner warn" data-act="day" data-date="${missing[0].date}">
                ${I.warn}<span><b>${missing.length} csoport jelenléte hiányzik</b><small>Legrégebbi: ${esc(UI.dateShort(missing[0].date))} · ${esc(missing[0].training.start)} ${esc(gName(missing[0].training))}</small></span>${I.next}</button>` : ''}
            <button class="banner owed-b" data-act="potlas">
              ${I.redo}<span><b>Pótlásra várók · ${owed.length} gyerek</b><small>${owedN} pótlandó alkalom – akit nem pipáltak be, automatikusan ide kerül</small></span>${I.next}</button>
            <p class="foot-hint">Koppints egy napra, válaszd ki az idősávot, majd a csoportodnál válaszd ki magad és pipáld be, ki volt ott.</p>
          </section>
        </div>`;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'day') App.go(`day/${b.dataset.date}`, { from: $('.day-tile', b) });
      if (act === 'now') App.go(`slot/${Store.todayYmd()}/${b.dataset.start.replace(':', '')}`, { from: $('.court-card', b) });
      if (act === 'wk') { week = Store.shiftYmd(week, Number(b.dataset.n)); history.replaceState(null, '', `#/home?week=${week}`); render(); animateDays(Number(b.dataset.n)); }
      if (act === 'wk-today') { week = Store.weekStart(Store.todayYmd()); history.replaceState(null, '', '#/home'); render(); animateDays(-1); }
      if (act === 'hours') hoursSheet(coach);
      if (act === 'potlas') App.go('potlas');
      if (act === 'logout') {
        UI.confirmBox('Kijelentkezel?', { ok: 'Kijelentkezés' }).then((ok) => {
          if (ok) { Store.setStaffAuth(null); App.go('login', { replace: true }); }
        });
      }
    });
    function animateDays(dir) {
      const list = $('.days', el); if (!list || UI.reduceMotion()) return;
      $$('.day-row', list).forEach((r) => { r.style.animation = 'none'; });
      list.animate([{ opacity: 0, transform: `translateX(${dir > 0 ? 28 : -28}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }

    render();
    const tick = setInterval(() => {
      if (sigOf() !== sig) { const y = $('.home', el).scrollTop; render(); $('.home', el).scrollTop = y; return; }
      $$('.now-prog i', el).forEach((i) => { const now = nowSlot(); if (now) i.style.setProperty('--w', `${progressOf(now)}%`); });
    }, 30000);
    return {
      update(r2) { week = Store.weekStart(r2.week || Store.todayYmd()); render(); },
      refresh() { const y = $('.home', el).scrollTop; render(); $('.home', el).scrollTop = y; },
      destroy() { clearInterval(tick); },
    };
  }

  // ======================================================================
  // NAP – az idősávok 3D lapozós pályakártyákon (a bankkártyás minta szerint)
  // ======================================================================
  const ASPECT_V = 214 / 340; // álló kártya szélesség/magasság
  function groupStatusPill(g, date) {
    const s = Store.session(g.id, date);
    if (s) {
      const v = Object.values(s.marks); const p = v.filter((m) => m === 'present').length;
      return `<span class="pill ok">${I.check}${p}/${v.length}${s.makeups.length ? ` <em>+${s.makeups.length}</em>` : ''}</span>`;
    }
    const ph = phaseOf(g, date);
    if (ph === 'future') return '<span class="pill soft">Később</span>';
    if (ph === 'live') return '<span class="pill live">Most</span>';
    return '<span class="pill todo">Kitöltendő</span>';
  }

  function day({ el, r }) {
    const me = Store.staffAuth().id;
    let date = r.date || Store.todayYmd();
    let all = []; let n = 0;
    let pos = 0; let vel = 0; let raf = 0; let gap = 200; let active = -1;
    let stage = null; let slides = []; let cards = []; let titles = []; let dots = []; let listEl = null; let btn = null;
    let sig = '';

    const kidsOf = (x) => x.groups.reduce((a, g) => a + Store.rosterFor(g.id, date).length, 0);
    const mineIn = (x) => x.groups.some((g) => (g.coachIds || []).includes(me) || Store.sessionCoach(Store.session(g.id, date)) === me);
    const subtitle = (x) => (x.groups.length
      ? `<b>${x.groups.length} csoport</b> / ${kidsOf(x)} gyerek${mineIn(x) ? ' · <em>a tiéd</em>' : ''}`
      : 'Nincs csoport ebben az idősávban');
    function cardChip(x) {
      if (!x.groups.length) return 'NINCS CSOPORT';
      const s = slotStatus(x, date);
      if (s.all) return 'RÖGZÍTVE ✓';
      if (s.ph === 'live') return '● MOST';
      if (s.ph === 'future') return date > Store.todayYmd() ? 'TERVEZETT' : `KEZDÉS ${x.start}`;
      return s.done ? `${s.done}/${s.n} KÉSZ` : 'KITÖLTENDŐ';
    }
    // melyik kártyán nyíljon: a kért idősáv, ma a mostani / következő, korábban az első kitöltetlen
    function startIndex(pref) {
      const ok = (i) => i >= 0;
      if (pref) { const i = all.findIndex((x) => x.start === pref); if (ok(i)) return i; }
      const today = Store.todayYmd();
      const has = (x) => x.groups.length;
      if (date === today) {
        let i = all.findIndex((x) => has(x) && phaseOf(x, date) === 'live'); if (ok(i)) return i;
        i = all.findIndex((x) => has(x) && phaseOf(x, date) === 'future'); if (ok(i)) return i;
      }
      if (date <= today) { const i = all.findIndex((x) => has(x) && !slotStatus(x, date).all); if (ok(i)) return i; }
      const i = all.findIndex(has); return ok(i) ? i : 0;
    }
    const sigOf = () => all.map((x) => slotDot(x, date)).join('');

    function build(pref) {
      cancelAnimationFrame(raf);
      all = Store.slotsOn(date); n = all.length;
      const rel = UI.relDay(date);
      const head = `<header class="bar">
          <button class="icon-btn" data-act="back" aria-label="Vissza">${I.back}</button>
          <span class="bar-title">${esc(dayTitle(date))}, ${esc(UI.dateShort(date))}${rel ? ` · ${esc(rel)}` : ''}</span>
          <span class="dv-nav">
            <button class="icon-btn sm" data-act="shift" data-n="-1" aria-label="Előző nap">${I.prev}</button>
            <button class="icon-btn sm" data-act="shift" data-n="1" aria-label="Következő nap">${I.next}</button>
          </span>
        </header>`;
      if (!n) {
        stage = null;
        el.innerHTML = `${head}<div class="scroll"><div class="empty-state">${Court.ballSVG(34)}<b>${Store.isClosed(date) ? 'Ünnepnap – zárva tartunk' : 'Ezen a napon nincs edzés'}</b><small>Válassz másik napot a nyilakkal.</small></div></div>`;
        return;
      }
      pos = startIndex(pref); vel = 0; active = -1;
      sig = sigOf();
      el.innerHTML = `${head}
        <div class="scroll crs">
          <div class="crs-titles">
            ${all.map((x, i) => `<div class="crs-title" data-i="${i}"><h2 class="mono-h">${slotText(x)}</h2><p>${subtitle(x)}</p></div>`).join('')}
          </div>
          <div class="crs-stage" tabindex="0" aria-label="Idősávok – lapozz jobbra vagy balra">
            ${all.map((x, i) => `<div class="crs-slide ${x.groups.length ? '' : 'is-empty'}" data-i="${i}"><div class="crs-box">${slotCard(x, date, { rot: 90, chip: esc(cardChip(x)), shared: false })}</div></div>`).join('')}
          </div>
          <div class="crs-times" role="tablist" aria-label="Idősávok">
            ${all.map((x, i) => `<button class="crs-t ${x.groups.length ? '' : 'is-empty'}" data-i="${i}" role="tab" aria-label="${slotText(x)}"><b class="mono">${x.start.replace(/:00$/, '')}</b><i class="dot ${slotDot(x, date)}"></i></button>`).join('')}
          </div>
          <div class="crs-list"></div>
        </div>
        <footer class="foot">
          <button class="pill-btn" data-act="choose"><span class="lbl">Tovább</span></button>
        </footer>`;
      stage = $('.crs-stage', el);
      slides = $$('.crs-slide', el);
      cards = slides.map((s) => $('.court-card', s));
      titles = $$('.crs-title', el);
      dots = $$('.crs-t', el);
      listEl = $('.crs-list', el);
      btn = $('[data-act="choose"]', el);
      bindStage();
      if (el.isConnected) { measure(); layout(); }
    }

    function measure() {
      if (!stage) return;
      const h = stage.clientHeight;
      const cw = Math.round(h * ASPECT_V);
      el.style.setProperty('--cw', `${cw}px`);
      el.style.setProperty('--ch', `${h}px`);
      gap = Math.min(cw * 1.1, stage.clientWidth * 0.62);
    }

    function layout() {
      if (!stage) return;
      slides.forEach((s, i) => {
        const d = i - pos; const ad = Math.abs(d);
        const x = d * gap;
        const ry = clamp(-d * 32, -50, 50);
        const z = -Math.min(ad, 1.6) * 110;
        const sc = 1 - Math.min(ad, 1) * 0.05;
        s.style.transform = `translate3d(${x}px,0,${z}px) rotateY(${ry}deg) scale(${sc})`;
        s.style.zIndex = String(100 - Math.round(ad * 10));
        s.style.opacity = String(clamp(1.5 - ad * 0.45, 0, 1));
        cards[i].style.setProperty('--sheen-x', `${clamp(d * 70, -140, 140)}%`);
      });
      titles.forEach((t, i) => {
        const d = i - pos;
        t.style.transform = `translateX(${d * 64}%)`;
        t.style.opacity = String(clamp(1 - Math.abs(d) * 0.7, 0, 1));
      });
      const a = clamp(Math.round(pos), 0, n - 1);
      if (a !== active) { active = a; onActive(); }
    }

    function onActive() {
      const x = all[active];
      cards.forEach((cd, i) => { if (i === active) cd.dataset.shared = `slot:${date}:${all[i].start}`; else cd.removeAttribute('data-shared'); });
      dots.forEach((d, i) => { d.classList.toggle('on', i === active); d.setAttribute('aria-selected', i === active); });
      titles.forEach((tt, i) => tt.classList.toggle('is-active', i === active));
      history.replaceState(null, '', `#/day/${date}?t=${slotParam(x)}`);
      const strip = $('.crs-times', el); const on = dots[active];
      if (strip && on) strip.scrollTo({ left: on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2, behavior: UI.reduceMotion() ? 'auto' : 'smooth' });
      renderList(true);
    }

    function renderList(animate) {
      const x = all[active];
      if (!x.groups.length) {
        listEl.innerHTML = `<div class="slot-panel"><div class="crs-empty">${Court.ballSVG(20)}<span>Ebben az idősávban nincs csoport.</span></div></div>`;
      } else {
        listEl.innerHTML = `
          <div class="slot-panel">
            <div class="tl-head"><h3>Csoportok</h3><span class="mono">${x.groups.length} csoport · ${kidsOf(x)} gyerek</span></div>
            <div class="list-card">
              ${x.groups.map((g, i) => {
                const held = Store.sessionCoach(Store.session(g.id, date));
                const who = held ? `edző: <b>${esc(firstOf(held))}</b>` : (g.coachIds || []).length ? `beosztva: ${esc(g.coachIds.map(firstOf).filter(Boolean).join(', '))}` : 'nincs beosztott edző';
                return `<button class="row grp-row ${(g.coachIds || []).includes(me) || held === me ? 'is-mine' : ''}" data-act="grp" data-gid="${g.id}" style="--gc:${gColor(g)};--d:${i}">
                  <span class="grp-bar"></span>
                  <span class="row-main"><b>${esc(gName(g))}</b><small>${Store.rosterFor(g.id, date).length} gyerek · ${who}</small></span>
                  ${groupStatusPill(g, date)}
                </button>`;
              }).join('')}
            </div>
          </div>`;
      }
      if (animate && !UI.reduceMotion()) listEl.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      updateBtn();
    }

    function updateBtn() {
      const x = all[active]; const lbl = $('.lbl', btn);
      btn.disabled = !x.groups.length;
      if (!x.groups.length) lbl.textContent = 'Nincs csoport ebben az idősávban';
      else if (!canRecord(x, date)) lbl.textContent = `Névsorok megtekintése · ${x.start}`;
      else if (slotStatus(x, date).all) lbl.textContent = `Megnyitás · ${x.start}`;
      else lbl.textContent = `Jelenlét felvétele · ${x.start}`;
    }

    // --- rugós animáció ---
    function snapTo(i) {
      const target = clamp(i, 0, n - 1);
      cancelAnimationFrame(raf);
      let v = vel * 16.7;
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min(34, now - last) / 16.7; last = now;
        v = (v + (target - pos) * 0.09 * dt) * Math.pow(0.68, dt);
        pos += v * dt;
        if (Math.abs(target - pos) < 0.0006 && Math.abs(v) < 0.0006) { pos = target; layout(); return; }
        layout();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      vel = 0;
    }
    const rubber = (x) => (0.35 * x) / (1 + 0.35 * x);

    // --- húzás, billentyűk, görgő (minden újraépítésnél az új elemre) ---
    function bindStage() {
      let drag = null;
      stage.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        cancelAnimationFrame(raf);
        drag = { x: e.clientX, y: e.clientY, p: pos, lx: e.clientX, lt: performance.now(), moved: false, id: e.pointerId };
      });
      stage.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
        if (!drag.moved) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          if (Math.abs(dy) > Math.abs(dx)) { drag = null; snapTo(Math.round(pos)); return; }
          drag.moved = true;
          try { stage.setPointerCapture(drag.id); } catch (err) { /* */ }
        }
        let p = drag.p - dx / gap;
        if (p < 0) p = -rubber(-p);
        if (p > n - 1) p = n - 1 + rubber(p - (n - 1));
        const now = performance.now();
        vel = ((drag.lx - e.clientX) / gap) / Math.max(1, now - drag.lt);
        drag.lx = e.clientX; drag.lt = now;
        pos = p; layout();
      });
      const end = (e) => {
        if (!drag) return;
        const d = drag; drag = null;
        if (!d.moved) {
          const slide = e.target.closest('.crs-slide');
          const i = slide ? Number(slide.dataset.i) : Math.round(pos);
          if (i === active) choose(); else snapTo(i);
          return;
        }
        const base = Math.round(d.p);
        const proj = Math.round(pos + vel * 200);
        snapTo(clamp(proj, base - 1, base + 1));
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
      stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') snapTo(Math.round(pos) + 1);
        if (e.key === 'ArrowLeft') snapTo(Math.round(pos) - 1);
        if (e.key === 'Enter') choose();
      });
      let wheelT;
      stage.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        cancelAnimationFrame(raf);
        pos = clamp(pos + e.deltaX / gap / 1.4, -0.3, n - 0.7);
        layout();
        clearTimeout(wheelT);
        wheelT = setTimeout(() => snapTo(Math.round(pos)), 90);
      }, { passive: false });
    }

    function choose(gid) {
      const x = all[active]; if (!x || !x.groups.length) return;
      App.go(`slot/${date}/${slotParam(x)}${gid ? `?g=${gid}` : ''}`, { from: cards[active] });
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act], .crs-t'); if (!b) return;
      if (b.classList.contains('crs-t')) { snapTo(Number(b.dataset.i)); return; }
      const act = b.dataset.act;
      if (act === 'back') App.back(`home?week=${Store.weekStart(date)}`);
      if (act === 'choose') choose();
      if (act === 'grp') choose(b.dataset.gid);
      if (act === 'shift') {
        const k = Number(b.dataset.n);
        let d = Store.shiftYmd(date, k);
        // a vasárnapot (ha nincs edzés) átugorjuk
        if (!Store.slotsOn(d).length && Store.dowOf(d) === 7) d = Store.shiftYmd(d, k);
        date = d;
        history.replaceState(null, '', `#/day/${date}`);
        build();
        const sc = $('.scroll', el);
        if (sc && !UI.reduceMotion()) sc.animate([{ opacity: 0, transform: `translateX(${k * 26}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });

    const onResize = () => { measure(); layout(); };
    const refreshCards = () => {
      cards.forEach((cd, i) => { const ch = $('.cc-chip', cd); if (ch) ch.textContent = cardChip(all[i]); });
      dots.forEach((d, i) => { $('.dot', d).className = `dot ${slotDot(all[i], date)}`; });
      titles.forEach((t, i) => { $('p', t).innerHTML = subtitle(all[i]); });
    };
    build(r.start);
    const tick = setInterval(() => {
      if (!stage || date !== Store.todayYmd()) return;
      all = Store.slotsOn(date);
      if (sigOf() !== sig) { sig = sigOf(); refreshCards(); renderList(false); }
    }, 30000);
    return {
      mount() { measure(); layout(); addEventListener('resize', onResize); },
      entered() { if (stage) stage.focus({ preventScroll: true }); },
      update(r2) { date = r2.date; build(r2.start); },
      refresh() {
        const cur = all[active];
        const next = Store.slotsOn(date);
        if (!stage || next.length !== n) { build(cur && cur.start); return; }
        all = next; sig = sigOf(); refreshCards(); renderList(false);
      },
      destroy() { cancelAnimationFrame(raf); clearInterval(tick); removeEventListener('resize', onResize); },
    };
  }

  // ======================================================================
  // IDŐSÁV – csoportok külön blokkokban, edzőválasztó + jelenlét
  // ======================================================================
  function slot({ el, r }) {
    const auth = Store.staffAuth();
    const me = Store.coach(auth.id);
    let date = r.date;
    let start = r.start;
    let openId = r.g || null;
    let busy = false;

    const slotsToday = () => Store.slotsOn(date);
    const cur = () => slotsToday().find((x) => x.start === start) || null;

    // melyik csoportot nyissuk ki magától: ahol én vagyok kiválasztva / beosztva, és még nincs kész
    function autoOpen(x) {
      if (openId && x.groups.some((g) => g.id === openId)) return openId;
      const mineSel = x.groups.find((g) => draftOf(g, date).coachId === me.id && !Store.session(g.id, date));
      const mineDef = x.groups.find((g) => (g.coachIds || []).includes(me.id) && !Store.session(g.id, date));
      const pick = mineSel || mineDef || (x.groups.length === 1 ? x.groups[0] : null);
      return pick ? pick.id : null;
    }
    // ki tartja még az idősáv többi csoportját (mentett vagy kiválasztott)
    function takenBy(x, exceptId) {
      const out = {};
      x.groups.forEach((g) => { if (g.id === exceptId) return; const c = draftOf(g, date).coachId; if (c) (out[c] = out[c] || []).push(gName(g)); });
      return out;
    }

    function coachSelect(g, d, x) {
      const taken = takenBy(x, g.id);
      const others = Store.coaches().filter((c) => c.active !== false && c.id !== me.id);
      const opt = (c, label) => `<option value="${c.id}" ${d.coachId === c.id ? 'selected' : ''}>${esc(label || c.name)}${taken[c.id] ? ` · ${esc(taken[c.id].join(', '))}` : ''}</option>`;
      const sel = d.coachId ? Store.coach(d.coachId) : null;
      const def = (g.coachIds || []).map(firstOf).filter(Boolean).join(', ');
      const locked = !canRecord(g, date);
      return `<label class="co-sel ${sel ? 'has' : ''} ${locked ? 'is-locked' : ''}">
        <span class="co-sel-l">Edző${def ? `<em>beosztva: ${esc(def)}</em>` : ''}</span>
        <span class="co-sel-v">
          ${sel ? UI.avatar(sel, 'co') : '<span class="av co av-q">?</span>'}
          <select data-act="coach" data-gid="${g.id}" ${locked ? 'disabled' : ''} aria-label="Edző kiválasztása">
            <option value="" ${!d.coachId ? 'selected' : ''}>Válaszd ki magad…</option>
            ${opt(me, `${me.name} (én)`)}
            <optgroup label="Többi edző">${others.map((c) => opt(c)).join('')}</optgroup>
          </select>
          <span class="co-caret">${CHEV}</span>
        </span>
      </label>
      ${d.coachId && taken[d.coachId] ? `<p class="co-warn">${I.warn}<span>${esc(firstOf(d.coachId))} ebben az idősávban a(z) ${esc(taken[d.coachId].join(', '))} csoportnál is szerepel – az óra csak egyszer számít.</span></p>` : ''}`;
    }

    function stRow(sid, d, stats, i) {
      const st = Store.student(sid); const on = d.present.has(sid); const ow = stats[sid] ? stats[sid].owed : 0;
      return `<button class="row st-row ${on ? 'is-on' : ''}" data-act="tick" data-sid="${sid}" style="--d:${Math.min(i, 14)}" aria-pressed="${on}">
        ${UI.avatar(st)}
        <span class="row-main"><b>${esc(st.name)}</b>${ow ? `<small><span class="owed">${ow} pótlandó alkalom</span></small>` : ''}</span>
        <span class="tick">${I.check}</span>
      </button>`;
    }
    function mkRow(sid) {
      const st = Store.student(sid);
      const gs = Store.trainingsOfStudent(sid).map(gName).join(', ');
      return `<div class="row st-row is-on is-makeup" data-sid="${sid}">
        ${UI.avatar(st)}
        <span class="row-main"><b>${esc(st.name)}</b><small><span class="tag">Pótlás</span> ${esc(gs)}</small></span>
        <button class="icon-btn ghost sm" data-act="rm" data-sid="${sid}" aria-label="Eltávolítás">${I.x}</button>
      </div>`;
    }

    function groupPill(g, d) {
      const s = Store.session(g.id, date);
      if (s && !d.dirty) {
        const v = Object.values(s.marks); const p = v.filter((m) => m === 'present').length;
        return `<span class="pill ok">${I.check}${p}/${v.length}${s.makeups.length ? ` <em>+${s.makeups.length}</em>` : ''}</span>`;
      }
      if (d.dirty) return '<span class="pill todo">Nincs mentve</span>';
      const ph = phaseOf(g, date);
      if (ph === 'future') return '<span class="pill soft">Később</span>';
      if (ph === 'live') return '<span class="pill live">Most</span>';
      return '<span class="pill todo">Kitöltendő</span>';
    }

    function groupHtml(g, x, i, { open = false, still = false } = {}) {
      const d = draftOf(g, date);
      const roster = Store.rosterFor(g.id, date);
      const stats = Store.allStats();
      const s = Store.session(g.id, date);
      const p = roster.filter((sid) => d.present.has(sid)).length;
      const locked = !canRecord(g, date);
      const held = Store.sessionCoach(s);
      const ordered = [...roster].sort((a, b) => Store.student(a).name.localeCompare(Store.student(b).name, 'hu'));
      return `<section class="grp ${open ? 'is-open' : ''} ${s && !d.dirty ? 'is-done' : ''} ${still ? 'is-still' : ''}" data-gid="${g.id}" style="--gc:${gColor(g)};--d:${i}">
        <button class="grp-head" data-act="open" aria-expanded="${open}">
          <span class="grp-bar"></span>
          <span class="grp-main">
            <b>${esc(gName(g))}</b>
            <small>${roster.length} gyerek${d.coachId ? ` · edző: <span class="grp-co">${esc(firstOf(d.coachId))}</span>` : ''}</small>
          </span>
          ${groupPill(g, d)}
          <span class="grp-caret">${CHEV}</span>
        </button>
        <div class="grp-more"><div class="grp-body"><div class="grp-in">
          ${coachSelect(g, d, x)}
          <div class="grp-tools">
            <div class="counter"><b class="js-cnt">${p}</b><span>/ ${roster.length} jelen</span></div>
            ${roster.length && !locked ? `<button class="chip-btn" data-act="all">${p === roster.length ? 'Kijelölés törlése' : 'Mindenki itt'}</button>` : ''}
          </div>
          <div class="grp-roster ${locked ? 'is-locked' : ''}">
            ${ordered.map((sid, k) => stRow(sid, d, stats, k)).join('') || '<div class="empty-row">Ebben a csoportban még nincs gyerek – az admin felületen adhatod hozzá a névsort.</div>'}
            <div class="mk-list">${d.makeups.map(mkRow).join('')}</div>
            ${locked ? '' : `<button class="row add-row" data-act="mk">${I.plus}<span>Pótló gyerek hozzáadása</span></button>`}
          </div>
          ${s ? `<p class="meta-note">Rögzítve ${esc(UI.dateShort(s.at.slice(0, 10)))} ${UI.timeOf(s.at)}${held ? ` · tartotta: ${esc(coachName(held))}` : ''}${s.by && s.by !== held ? ` · rögzítette: ${esc(coachName(s.by) || 'Admin')}` : ''}</p>` : ''}
        </div></div></div>
      </section>`;
    }

    function render(dir = 0) {
      const today = Store.todayYmd();
      const all = slotsToday();
      const x = cur();
      if (!x) {
        el.innerHTML = `<header class="bar"><button class="icon-btn" data-act="back" aria-label="Vissza">${I.back}</button><span class="bar-title">${esc(cap(UI.dateLong(date)))}</span><span class="icon-btn placeholder"></span></header>
          <div class="scroll"><div class="empty-state">${Court.ballSVG(34)}<b>Ez az idősáv nem található</b><small>Lehet, hogy közben módosult az órarend.</small></div></div>`;
        return;
      }
      openId = autoOpen(x);
      const ph = phaseOf(x, date);
      const st = slotStatus(x, date);
      const kids = x.groups.reduce((a, g) => a + Store.rosterFor(g.id, date).length, 0);
      const rel = UI.relDay(date);
      let chip = 'IDŐSÁV';
      if (st.all) chip = 'RÖGZÍTVE ✓';
      else if (ph === 'live') chip = '● MOST';
      else if (ph === 'future') chip = date > today ? 'TERVEZETT' : `KEZDÉS ${x.start}`;
      else chip = 'KITÖLTENDŐ';

      el.innerHTML = `
        <header class="bar">
          <button class="icon-btn" data-act="back" aria-label="Vissza">${I.back}</button>
          <span class="bar-title">${esc(cap(rel ? `${rel}, ${UI.dateShort(date)}` : `${UI.DAYS[Store.dowOf(date) - 1]}, ${UI.dateShort(date)}`))}</span>
          <span class="icon-btn placeholder"></span>
        </header>
        <div class="scroll sv">
          <div class="sv-head">
            <div class="sv-txt">
              <h1 class="title mono-h">${x.start}<span>–${x.end}</span></h1>
              <p class="sub">${x.groups.length} csoport · ${kids} gyerek</p>
              <p class="sv-st">${slotPill(x, date) || '<span class="pill soft">Nincs csoport</span>'}</p>
            </div>
            <div class="sv-card">${slotCard(x, date, { chip })}</div>
          </div>
          <div class="sv-groups">
            ${x.groups.map((g, i) => groupHtml(g, x, i, { open: g.id === openId })).join('')
              || `<div class="empty-state">${Court.ballSVG(34)}<b>Ebben az idősávban nincs csoport</b><small>Válassz másik idősávot fent.</small></div>`}
          </div>
          ${x.groups.length ? '<p class="sv-hint">Mindenki a saját csoportjánál válassza ki magát. A be nem pipált gyerekek automatikusan pótlásra kerülnek.</p>' : ''}
        </div>
        <footer class="foot">
          <button class="pill-btn js-save" data-act="save"><span class="lbl"></span><span class="ld"><i></i><i></i></span></button>
          <p class="foot-note js-note"></p>
        </footer>`;
      updateFoot();
      if (dir && !UI.reduceMotion()) {
        const kf = [{ opacity: 0, transform: `translateX(${dir * 30}px)` }, { opacity: 1, transform: 'none' }];
        const o = { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' };
        $('.sv-txt', el).animate(kf, o);
        $('.sv-groups', el).animate(kf, { ...o, delay: 40, fill: 'backwards' });
        $('.sv-card .court-card', el).animate([{ transform: `perspective(600px) rotateY(${dir * -24}deg) scale(.94)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
        $$('.grp', el).forEach((s) => s.classList.add('is-still'));
      }
    }

    const openGroup = () => (openId ? Store.training(openId) : null);

    function updateFoot() {
      const btn = $('.js-save', el); const note = $('.js-note', el);
      if (!btn) return;
      const lbl = $('.lbl', btn);
      const g = openGroup(); const x = cur();
      if (!x || !x.groups.length) { btn.hidden = true; note.textContent = ''; return; }
      btn.hidden = false;
      if (!g) {
        btn.disabled = true; lbl.textContent = 'Nyisd meg a csoportodat';
        note.textContent = 'Koppints a csoportodra, válaszd ki magad, és pipáld be a jelenlévőket.';
        return;
      }
      const d = draftOf(g, date);
      const roster = Store.rosterFor(g.id, date);
      const p = roster.filter((sid) => d.present.has(sid)).length;
      const s = Store.session(g.id, date);
      if (!canRecord(g, date)) {
        btn.disabled = true;
        lbl.textContent = date > Store.todayYmd() ? 'Még nem kezdődött el' : `Felvehető ${openAt(g)}-tól`;
        note.textContent = 'Addig csak a névsort látod.';
        return;
      }
      btn.disabled = false;
      lbl.textContent = `${s ? 'Módosítás mentése' : 'Mentés'} · ${gName(g)} · ${p}/${roster.length}${d.makeups.length ? ` +${d.makeups.length}` : ''}`;
      const miss = roster.length - p;
      note.textContent = !d.coachId ? 'Előbb válaszd ki, ki tartja az edzést.'
        : miss ? `${miss} gyerek nincs bepipálva → pótlásra kerül.` : 'Mindenki itt van.';
      note.classList.toggle('is-warn', !d.coachId);
    }

    // egyetlen csoport újrarajzolása (a nyitott állapot megtartásával, animáció nélkül)
    function redrawGroup(gid) {
      const x = cur(); const g = x && x.groups.find((y) => y.id === gid); if (!g) return;
      const old = $(`.grp[data-gid="${gid}"]`, el); if (!old) return;
      const i = x.groups.indexOf(g);
      old.outerHTML = groupHtml(g, x, i, { open: gid === openId, still: true });
      updateFoot();
    }
    function setOpen(gid) {
      openId = openId === gid ? null : gid;
      $$('.grp', el).forEach((s) => {
        const on = s.dataset.gid === openId;
        s.classList.toggle('is-open', on);
        $('.grp-head', s).setAttribute('aria-expanded', on);
      });
      history.replaceState(null, '', `#/slot/${date}/${start.replace(':', '')}${openId ? `?g=${openId}` : ''}`);
      updateFoot();
      const sec = openId && $(`.grp[data-gid="${openId}"]`, el);
      if (sec) setTimeout(() => sec.scrollIntoView({ behavior: UI.reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }), 200);
    }
    function counts(gid) {
      const g = Store.training(gid); const d = draftOf(g, date);
      const sec = $(`.grp[data-gid="${gid}"]`, el); if (!sec) return;
      const roster = Store.rosterFor(gid, date);
      const p = roster.filter((sid) => d.present.has(sid)).length;
      $('.js-cnt', sec).textContent = p;
      const all = $('[data-act="all"]', sec); if (all) all.textContent = p === roster.length ? 'Kijelölés törlése' : 'Mindenki itt';
      const pill = $('.grp-head .pill', sec); if (pill) pill.outerHTML = groupPill(g, d);
      sec.classList.toggle('is-done', !!Store.session(gid, date) && !d.dirty);
      updateFoot();
    }

    async function save() {
      const g = openGroup(); if (!g || busy) return;
      const d = draftOf(g, date);
      if (!canRecord(g, date)) { UI.toast(notYetMsg(g, date)); return; }
      const sec = $(`.grp[data-gid="${g.id}"]`, el);
      if (!d.coachId) {
        const cs = $('.co-sel', sec);
        cs.classList.remove('shake'); void cs.offsetWidth; cs.classList.add('shake');
        buzz([30, 30, 30]);
        UI.toast('Válaszd ki, ki tartotta az edzést');
        try { $('select', cs).focus(); } catch (e) { /* */ }
        return;
      }
      const roster = Store.rosterFor(g.id, date);
      const marks = {};
      roster.forEach((sid) => { marks[sid] = d.present.has(sid) ? 'present' : 'absent'; });
      const p = roster.filter((sid) => d.present.has(sid)).length;
      const btn = $('.js-save', el);
      busy = true;
      const w = btn.offsetWidth;
      btn.classList.add('is-loading');
      btn.animate([{ width: `${w}px` }, { width: '84px' }], { duration: 460, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
      $('.js-note', el).textContent = 'Jelenlét rögzítése…';
      Store.saveSession({ trainingId: g.id, date, coachId: d.coachId, marks, makeups: [...d.makeups], by: me.id });
      const mk = d.makeups.length;
      dropDraft(g, date);
      await wait(UI.reduceMotion() ? 200 : 1150);
      showSuccess({
        slot: cur(), group: g, date,
        counts: { present: p, absent: roster.length - p, makeups: mk },
        coachLabel: coachName(Store.sessionCoach(Store.session(g.id, date))),
        fromCard: $('.sv-card .court-card', el),
        onDone: () => { busy = false; openId = null; const y = $('.sv', el).scrollTop; render(); $('.sv', el).scrollTop = y; history.replaceState(null, '', `#/slot/${date}/${start.replace(':', '')}`); },
      });
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b || busy) return;
      const act = b.dataset.act;
      const sec = b.closest('.grp');
      const gid = sec && sec.dataset.gid;
      const g = gid && Store.training(gid);
      if (act === 'back') App.back(`day/${date}`);
      if (act === 'sw') {
        const ns = b.dataset.start; if (ns === start) return;
        const all = slotsToday();
        const dir = all.findIndex((s) => s.start === ns) > all.findIndex((s) => s.start === start) ? 1 : -1;
        start = ns; openId = null;
        history.replaceState(null, '', `#/slot/${date}/${ns.replace(':', '')}`);
        render(dir);
        $('.sv', el).scrollTop = 0;
      }
      if (act === 'open') setOpen(gid);
      if (act === 'tick') {
        if (!canRecord(g, date)) { UI.toast(notYetMsg(g, date)); return; }
        const d = draftOf(g, date); const sid = b.dataset.sid;
        if (d.present.has(sid)) d.present.delete(sid); else d.present.add(sid);
        d.dirty = true;
        b.classList.toggle('is-on', d.present.has(sid));
        b.setAttribute('aria-pressed', d.present.has(sid));
        buzz(6);
        counts(gid);
        if (!d.coachId && d.present.size === 1) {
          const cs = $('.co-sel', sec); cs.classList.remove('nudge'); void cs.offsetWidth; cs.classList.add('nudge');
        }
      }
      if (act === 'all') {
        const d = draftOf(g, date); const roster = Store.rosterFor(gid, date);
        const every = roster.every((sid) => d.present.has(sid));
        roster.forEach((sid) => (every ? d.present.delete(sid) : d.present.add(sid)));
        d.dirty = true;
        $$('.grp-roster .st-row:not(.is-makeup)', sec).forEach((row, i) => {
          setTimeout(() => row.classList.toggle('is-on', d.present.has(row.dataset.sid)), Math.min(i, 20) * 28);
        });
        counts(gid);
      }
      if (act === 'mk') {
        const d = draftOf(g, date);
        pickStudent({
          exclude: [...Store.rosterFor(gid, date), ...d.makeups],
          onPick: (sid) => {
            d.makeups.push(sid); d.dirty = true;
            const list = $(`.grp[data-gid="${gid}"] .mk-list`, el);
            list.insertAdjacentHTML('beforeend', mkRow(sid));
            list.lastElementChild.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
            counts(gid); buzz(8);
          },
        });
      }
      if (act === 'rm') {
        const d = draftOf(g, date); const sid = b.dataset.sid;
        d.makeups.splice(d.makeups.indexOf(sid), 1); d.dirty = true;
        const row = b.closest('.row');
        row.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(20px)' }], { duration: 200 }).finished.then(() => row.remove());
        counts(gid);
      }
      if (act === 'save') save();
    });
    const onCoach = (e) => {
      const s = e.target.closest('select[data-act="coach"]'); if (!s) return;
      const g = Store.training(s.dataset.gid); const d = draftOf(g, date);
      if (d.coachId === s.value) return;
      d.coachId = s.value; d.dirty = true;
      buzz(8);
      // a többi csoport legördülőjében is frissüljön, ki hol van
      cur().groups.forEach((y) => redrawGroup(y.id));
      const cs = $(`.grp[data-gid="${g.id}"] .co-sel`, el);
      if (cs && d.coachId) cs.animate([{ transform: 'scale(.98)' }, { transform: 'scale(1.01)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
    };
    el.addEventListener('change', onCoach);
    el.addEventListener('input', onCoach);

    render();
    const tick = setInterval(() => {
      if (busy || date !== Store.todayYmd()) return;
      const x = cur(); if (!x) return;
      updateFoot();
    }, 30000);
    return {
      update(r2) {
        const dir = r2.date !== date ? 0 : (r2.start > start ? 1 : r2.start < start ? -1 : 0);
        date = r2.date; start = r2.start; openId = r2.g || null; render(dir);
      },
      refresh() {
        if (busy) return;
        // más eszközön mentett változások: a nem módosított piszkozatokat újraolvassuk
        Object.keys(drafts).forEach((k) => { if (!drafts[k].dirty) delete drafts[k]; });
        const y = $('.sv', el) ? $('.sv', el).scrollTop : 0;
        render(); $$('.grp', el).forEach((s) => s.classList.add('is-still'));
        if ($('.sv', el)) $('.sv', el).scrollTop = y;
      },
      destroy() { clearInterval(tick); },
    };
  }

  // ======================================================================
  // PÓTLÁSRA VÁRÓK
  // ======================================================================
  function potlas({ el }) {
    let q = '';
    function render() {
      const stats = Store.allStats();
      const list = Store.students().map((s) => ({ s, st: stats[s.id] })).filter((x) => x.st && x.st.owed > 0)
        .sort((a, b) => b.st.owed - a.st.owed || a.s.name.localeCompare(b.s.name, 'hu'));
      const total = list.reduce((a, x) => a + x.st.owed, 0);
      el.innerHTML = `
        <header class="bar">
          <button class="icon-btn" data-act="back" aria-label="Vissza">${I.back}</button>
          <span class="bar-title">Pótlások</span>
          <span class="icon-btn placeholder"></span>
        </header>
        <div class="scroll pv">
          <div class="pv-head">
            <h1 class="title">Pótlásra<br>várók</h1>
            <p class="sub">Akit a jelenlétnél nem pipáltak be, automatikusan ide kerül. Ha eljön pótolni, vedd fel <b>pótló gyerekként</b> bármelyik csoportnál – onnantól lekerül a listáról.</p>
            <div class="dv-stats"><span><b>${list.length}</b> gyerek</span><span><b>${total}</b> pótlandó alkalom</span></div>
          </div>
          <label class="search pv-search">${I.search}<input type="search" placeholder="Név keresése" value="${esc(q)}" autocomplete="off"></label>
          <div class="list-card pv-list">
            ${list.map(({ s, st }, i) => {
              const gs = Store.trainingsOfStudent(s.id);
              const last = st.absences.filter((a) => a.status === 'open').slice(-1)[0];
              return `<button class="row" data-act="kid" data-sid="${s.id}" data-q="${esc(norm(s.name))}" style="--d:${Math.min(i, 16)}">
                ${UI.avatar(s)}
                <span class="row-main"><b>${esc(s.name)}</b><small>${esc(gs.map(gName).join(', ') || 'Nincs csoportja')}${last ? ` · hiányzott: ${esc(UI.dateShort(last.date))}` : ''}</small></span>
                <span class="pill warn">${st.owed} alkalom</span>
              </button>`;
            }).join('') || `<div class="empty-state">${Court.ballSVG(30)}<b>Nincs pótlásra váró gyerek</b></div>`}
          </div>
        </div>`;
      const inp = $('.pv-search input', el);
      inp.addEventListener('input', () => {
        q = inp.value; const n = norm(q);
        $$('.pv-list .row', el).forEach((row) => { row.hidden = n && !row.dataset.q.includes(n); });
      });
      if (q) inp.dispatchEvent(new Event('input'));
    }
    function kidSheet(sid) {
      const s = Store.student(sid); const st = Store.stats(sid);
      const open = st.absences.filter((a) => a.status === 'open').reverse();
      const done = st.absences.filter((a) => a.status !== 'open').reverse().slice(0, 6);
      const label = (a) => { const g = Store.training(a.trainingId); return `${a.start || (g && g.start) || ''} · ${a.name || gName(g)}`; };
      UI.sheet({
        title: s.name,
        sub: `${st.owed} pótlandó alkalom · ${st.makeups} pótolva`,
        body: `<div class="sec-label">Pótlandó alkalmak</div>
          <div class="list-card">${open.map((a) => `<div class="row kid-ab"><span class="row-main"><b>${esc(cap(UI.dateLong(a.date)))}</b><small>${esc(label(a))}</small></span><span class="pill warn">Pótlandó</span></div>`).join('')}</div>
          ${done.length ? `<div class="sec-label">Korábbi hiányzások</div><div class="list-card">${done.map((a) => `<div class="row kid-ab"><span class="row-main"><b>${esc(cap(UI.dateLong(a.date)))}</b><small>${esc(label(a))}</small></span><span class="pill ${a.status === 'makeup' ? 'ok' : 'soft'}">${a.status === 'makeup' ? 'Pótolva' : 'Lezárva'}</span></div>`).join('')}</div>` : ''}
          ${s.parentName || s.phone ? `<p class="sheet-note">${esc([s.parentName && `Szülő: ${s.parentName}`, s.phone].filter(Boolean).join(' · '))}</p>` : ''}`,
      });
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'back') App.back('home');
      if (b.dataset.act === 'kid') kidSheet(b.dataset.sid);
    });
    render();
    return { refresh() { const y = $('.pv', el).scrollTop; render(); $('.pv', el).scrollTop = y; } };
  }

  // ======================================================================
  // SIKER – a kártya "lefekszik", pattan a labda, kinyomtatódik a bizonylat
  // ======================================================================
  function showSuccess({ slot: x, group, date, counts, coachLabel, fromCard, onDone }) {
    const ov = document.createElement('div');
    ov.className = 'success';
    ov.innerHTML = `
      <div class="suc-bg"></div>
      <div class="suc-inner">
        <div class="suc-stage">
          <div class="suc-persp"><div class="suc-plane">${slotCard(x || group, date, { shared: false, brand: brandText(gName(group)), cls: gName(group).length > 11 ? 'long-brand' : '' })}</div></div>
          <div class="suc-shadow"></div>
          <div class="suc-fx"></div>
          <div class="suc-ball"><span class="ball"></span></div>
        </div>
        <div class="suc-printer">
          <div class="suc-slot"></div>
          <div class="suc-clip"><div class="receipt">
            <div class="rc-head">${Court.ballSVG(13)}<span>${esc(Store.settings().clubName)}</span></div>
            <div class="rc-title">Jelenléti bizonylat</div>
            <div class="rc-row rc-name"><span>${esc(gName(group))}</span></div>
            <div class="rc-row"><span>${esc(UI.dateShort(date))}</span><span>${group.start}–${group.end}</span></div>
            <div class="rc-row"><span>Edző</span><span>${esc(coachLabel)}</span></div>
            <hr>
            <div class="rc-row big"><span>Jelen</span><b>${counts.present}</b></div>
            <div class="rc-row big"><span>Pótlásra</span><b>${counts.absent}</b></div>
            ${counts.makeups ? `<div class="rc-row big"><span>Pótló gyerek</span><b>${counts.makeups}</b></div>` : ''}
            <hr>
            <div class="rc-row small"><span>${esc(UI.hours(T(group.end) - T(group.start)))} edzés</span><span>${UI.timeOf(new Date().toISOString())}</span></div>
            <div class="rc-stamp">${I.check}</div>
          </div></div>
        </div>
        <div class="suc-text">
          <h2>Jelenlét rögzítve</h2>
          <p>${counts.present} jelen${counts.absent ? ` · ${counts.absent} pótlásra került` : ' · mindenki itt volt'}${counts.makeups ? ` · ${counts.makeups} pótló` : ''}</p>
        </div>
        <button class="pill-btn suc-done">Kész</button>
      </div>`;
    document.body.appendChild(ov);

    const plane = $('.suc-plane', ov);
    const pcard = $('.court-card', plane);
    const ball = $('.suc-ball', ov);
    const shadow = $('.suc-shadow', ov);
    const fx = $('.suc-fx', ov);
    const receipt = $('.receipt', ov);
    const stamp = $('.rc-stamp', ov);
    const text = $('.suc-text', ov);
    const done = $('.suc-done', ov);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done.disabled = true;
      if (fromCard) fromCard.style.visibility = '';
      ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease-in', fill: 'forwards' }).finished.then(() => ov.remove());
      onDone && onDone();
    };
    done.addEventListener('click', finish);
    const started = performance.now();
    ov.addEventListener('click', (e) => {
      if (e.target.closest('.suc-done') || performance.now() - started < 700) return;
      finish();
    });

    const TILT = 'rotateX(56deg) rotateZ(-34deg)';
    if (UI.reduceMotion()) {
      plane.style.transform = `scale(.94) ${TILT}`;
      ov.classList.add('is-static');
      return;
    }

    const pw = pcard.offsetWidth;
    const k = pw / 340 * 0.94;
    const lx = 36; const ly = 22;
    const a = -34 * Math.PI / 180;
    const rx = lx * Math.cos(a) - ly * Math.sin(a);
    const ry = (lx * Math.sin(a) + ly * Math.cos(a)) * Math.cos(56 * Math.PI / 180);
    const land = { x: rx * k, y: ry * k };
    [ball, shadow, fx].forEach((x2) => { x2.style.setProperty('--lx', `${land.x}px`); x2.style.setProperty('--ly', `${land.y}px`); });

    $('.suc-bg', ov).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out', fill: 'backwards' });

    // 1) kártya átrepül és "lefekszik"
    if (fromCard && fromCard.isConnected) {
      const f = fromCard.getBoundingClientRect();
      const tr = pcard.getBoundingClientRect();
      const dx = (f.left + f.width / 2) - (tr.left + tr.width / 2);
      const dy = (f.top + f.height / 2) - (tr.top + tr.height / 2);
      const sc = f.width / tr.width;
      fromCard.style.visibility = 'hidden';
      plane.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotateX(0deg) rotateZ(0deg)` },
        { transform: 'translate(0px, 0px) scale(1) rotateX(0deg) rotateZ(0deg)', offset: 0.45, easing: 'cubic-bezier(.5,0,.2,1)' },
        { transform: `translate(0px, 0px) scale(.94) ${TILT}` },
      ], { duration: 1150, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    } else {
      plane.animate([{ transform: 'scale(.9) rotateX(0deg) rotateZ(0deg)', opacity: 0 }, { transform: `scale(.94) ${TILT}`, opacity: 1 }],
        { duration: 800, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    }

    // 2) labda pattanás
    const T0 = 1050; const DUR = 1300;
    const IN = 'cubic-bezier(.55,0,1,.45)'; const OUT = 'cubic-bezier(0,.55,.45,1)';
    ball.animate([
      { transform: 'translate(-50%, -340px) scale(.9)', opacity: 0, easing: IN },
      { opacity: 1, offset: 0.08, easing: IN },
      { transform: 'translate(-50%, 0px) scale(1.16, .8)', offset: 0.38, easing: OUT },
      { transform: 'translate(-50%, -104px) scale(.97, 1.03)', offset: 0.6, easing: IN },
      { transform: 'translate(-50%, 0px) scale(1.08, .9)', offset: 0.8, easing: OUT },
      { transform: 'translate(-50%, -26px) scale(1)', offset: 0.9, easing: IN },
      { transform: 'translate(-50%, 0px) scale(1)', opacity: 1 },
    ], { duration: DUR, delay: T0, fill: 'both' });
    shadow.animate([
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.5, offset: 0.38 },
      { transform: 'translate(-50%,-50%) scale(.55)', opacity: 0.22, offset: 0.6 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.45, offset: 0.8 },
      { transform: 'translate(-50%,-50%) scale(.85)', opacity: 0.38, offset: 0.9 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.45 },
    ], { duration: DUR, delay: T0, fill: 'both' });
    setTimeout(() => impact(1), T0 + DUR * 0.38);
    setTimeout(() => impact(0.45), T0 + DUR * 0.8);

    function impact(power) {
      buzz(power > 0.5 ? 18 : 8);
      const ring = document.createElement('i');
      ring.className = 'ripple';
      fx.appendChild(ring);
      ring.animate([
        { transform: 'translate(-50%,-50%) scale(.2, .11)', opacity: 0.9 },
        { transform: `translate(-50%,-50%) scale(${1.6 * power + 0.4}, ${(1.6 * power + 0.4) * 0.56})`, opacity: 0 },
      ], { duration: 620, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }).finished.then(() => ring.remove());
    }

    // 3) bizonylat nyomtatás
    const T1 = T0 + DUR - 80;
    $('.suc-slot', ov).animate([{ transform: 'scaleX(.2)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }],
      { duration: 380, delay: T1 - 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    receipt.animate([
      { transform: 'translateY(calc(-100% - 14px))' },
      { transform: 'translateY(-78%)', offset: 0.22 },
      { transform: 'translateY(-76%)', offset: 0.3 },
      { transform: 'translateY(-48%)', offset: 0.52 },
      { transform: 'translateY(-46%)', offset: 0.6 },
      { transform: 'translateY(-16%)', offset: 0.84 },
      { transform: 'translateY(0%)' },
    ], { duration: 1250, delay: T1, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' });

    // 4) pecsét + szöveg + gomb
    const T2 = T1 + 1300;
    stamp.animate([
      { transform: 'scale(2.2) rotate(-24deg)', opacity: 0 },
      { transform: 'scale(.92) rotate(-10deg)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1) rotate(-12deg)', opacity: 1 },
    ], { duration: 420, delay: T2, easing: 'cubic-bezier(.3,.7,.3,1.3)', fill: 'both' });
    setTimeout(() => buzz(10), T2 + 250);
    text.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 480, delay: T2 + 120, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    done.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: 480, delay: T2 + 320, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
  }

  window.Coach = { login, home, day, slot, potlas };
})();
