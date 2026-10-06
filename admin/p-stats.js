/* ==========================================================================
   Admin – Statisztika: Áttekintés, Bevétel, Pályakihasználtság,
   Edzések és jelenlét, Ügyfélkör.
   Minden oldal a fejlécben választott időszakra szűr (Admin.statRange), és ahol
   van korábbi adat, az előző azonos időszakhoz hasonlít. Itt csak nézni lehet –
   a rögzítés, szerkesztés a Munka felületen történik.
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I, money } = UI;
  const T = Store.toMin;
  // a szín a kategóriát követi (rögzített sorrend), nem a rangot
  const REV = [
    { key: 'court', label: 'Pályabérlés', color: '#2a78d6' },
    { key: 'pass', label: 'Bérlet', color: '#eb6834' },
    { key: 'tuition', label: 'Tandíj', color: '#1baf7a' },
    { key: 'other', label: 'Egyéb', color: '#eda100' },
  ];
  const TYPES = [
    { key: 'single', label: 'Egyszeri', color: '#2a78d6' },
    { key: 'regular', label: 'Állandó', color: '#eb6834' },
    { key: 'training', label: 'Edzés', color: '#1baf7a' },
    { key: 'block', label: 'Lezárás', color: '#eda100' },
  ];
  const FREE = '#E6E3DC';
  const ACCENT = '#2a78d6';
  const TIER_LABEL = { peak: 'Csúcsidő', off: 'Kedvezményes', weekend: 'Hétvége', none: 'Ár nélküli órák' };
  const LEAD = ['Aznap', 'Előző nap', '2–3 nappal előtte', '4–7 nappal előtte', 'Több mint egy héttel'];
  const GRAN = { day: 'naponta', week: 'hetente', month: 'havonta' };

  const num = (v) => Math.round(v).toLocaleString('hu-HU');
  const pct = (v, d = 0) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d).replace('.', ',')}%`);
  const hrs = (min) => String(Math.round(min / 6) / 10).replace('.', ',');
  const sum = (rows, k = 'total') => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const ratio = (a, b) => (b ? a / b : null);
  const rel = (a, b) => (b ? a / b - 1 : null);
  const pp = (a, b) => (a != null && b != null ? a - b : null); // arányok különbsége (százalékpont)
  const dot = (c) => `<i class="dotc" style="background:${c}"></i>`;
  const mmdd = (d) => `${d.slice(5, 7)}.${d.slice(8)}.`;
  const autoGran = (days) => (days <= 45 ? 'day' : days <= 200 ? 'week' : 'month');
  const subOf = (what) => () => { const R = Admin.statRange(); return `${R.range}${R.days > 1 ? ` · ${R.days} nap` : ''} · ${what}`; };
  const vsNote = (ok, R) => (ok ? `vs. ${R.prevLabel}` : 'korábbi időszakra nincs adat');

  // ---------- számítások (Store-változásig gyorsítótárazva) ----------
  let memo = { rev: -1 };
  function cached(key, fn) {
    if (memo.rev !== Store.rev) memo = { rev: Store.rev };
    if (!(key in memo)) memo[key] = fn();
    return memo[key];
  }
  /**
   * Mióta van folyamatos adat – az összevetés csak akkor értelmes, ha az előző időszak is lefedett.
   * A rendszer „indulását” az első egyszeri pályafoglalás jelzi (a korábbi bérletvásárlás vagy
   * a visszamenőleg felvett heti sorozat még nem jelent teljes adatot).
   */
  function since() {
    return cached('since', () => {
      const min = (a, b) => (b && (!a || b < a) ? b : a);
      const max = (a, b) => (a && b ? (a > b ? a : b) : a || b);
      let single = ''; Store.bookings({ type: 'single' }).forEach((b) => { single = min(single, b.date); });
      let pay = ''; Store.payments().forEach((p) => { pay = min(pay, p.at.slice(0, 10)); });
      let sess = ''; Store.sessions().forEach((s) => { sess = min(sess, s.date); });
      return { pay: max(pay, single), book: single, sess };
    });
  }
  const covered = (kind, R) => { const s = since()[kind]; return !!s && R.prev.from >= s; };

  function revenue(from, to) {
    return cached(`rev|${from}|${to}`, () => {
      const days = Store.revenueByDay(from, to);
      const by = {}; REV.forEach((c) => { by[c.key] = sum(days, c.key); });
      return { days, total: sum(days), by };
    });
  }
  function bucket(days, gran) {
    if (gran === 'day') return days.map((d) => ({ x: String(Number(d.date.slice(8))), title: UI.cap(UI.dateLong(d.date)), values: d }));
    const map = new Map();
    days.forEach((d) => {
      const k = gran === 'week' ? Store.weekStart(d.date) : d.date.slice(0, 7);
      if (!map.has(k)) map.set(k, { k, from: d.date, to: d.date, values: { court: 0, pass: 0, tuition: 0, other: 0, total: 0 } });
      const b = map.get(k); b.to = d.date;
      REV.forEach((c) => { b.values[c.key] += d[c.key] || 0; }); b.values.total += d.total;
    });
    return [...map.values()].map((b) => (gran === 'week'
      ? { x: mmdd(b.from), title: `${UI.dateShort(b.from)} – ${UI.dateShort(b.to)}`, values: b.values }
      : { x: UI.MONTHS_SHORT[Number(b.k.slice(5)) - 1], title: UI.cap(UI.monthLabel(b.k)), values: b.values }));
  }

  /** Pályakihasználtság: foglalt / nyitvatartási pályaperc – típusonként, pályánként, napszakonként, árszintenként. */
  function occ(from, to) {
    return cached(`occ|${from}|${to}`, () => {
      const s = Store.settings(); const open = T(s.open); const close = T(s.close);
      const courts = Store.activeCourts();
      const zero = () => ({ single: 0, regular: 0, training: 0, block: 0 });
      const o = { total: 0, booked: 0, byType: zero(), courts: courts.map((c) => ({ c, total: 0, booked: 0, byType: zero() })), grid: {}, days: [], byDow: {}, byTier: {} };
      const cIdx = new Map(o.courts.map((x) => [x.c.id, x]));
      Store.eachDate(from, to, (d) => {
        if (Store.isClosed(d)) return;
        const dow = Store.dowOf(d);
        const g = o.grid[dow] = o.grid[dow] || {};
        const day = { date: d, booked: 0, total: (close - open) * courts.length };
        const w = o.byDow[dow] = o.byDow[dow] || [0, 0];
        o.total += day.total; w[1] += day.total;
        o.courts.forEach((x) => { x.total += close - open; });
        const tierAt = {};
        for (let m = open; m < close; m += 30) {
          const r = Store.ruleAt(d, m); const k = r ? r.tier : 'none'; tierAt[m] = k;
          (o.byTier[k] = o.byTier[k] || [0, 0])[1] += 30 * courts.length;
          const h = Math.floor(m / 60); (g[h] = g[h] || [0, 0])[1] += 30 * courts.length;
        }
        Store.itemsOn(d).forEach((it) => {
          const x = cIdx.get(it.courtId); if (!x) return;
          const a = Math.max(open, T(it.start)); const b = Math.min(close, T(it.end)); if (b <= a) return;
          const mins = b - a;
          o.booked += mins; o.byType[it.type] += mins; x.booked += mins; x.byType[it.type] += mins; day.booked += mins; w[0] += mins;
          for (let m = a; m < b; m += 30) {
            const seg = Math.min(30, b - m);
            o.byTier[tierAt[m - ((m - open) % 30)] || 'none'][0] += seg;
            g[Math.floor(m / 60)][0] += seg;
          }
        });
        o.days.push(day);
      });
      o.rate = ratio(o.booked, o.total);
      return o;
    });
  }

  /** Edzések: a rögzített jelenlétekből (ki volt jelen, ki hiányzott, pótlások). */
  function att(from, to) {
    const now = Math.floor(Store.nowMin() / 15);
    return cached(`att|${from}|${to}|${now}`, () => {
      const today = Store.todayYmd(); const nm = Store.nowMin();
      const list = Store.sessions().filter((x) => x.date >= from && x.date <= to);
      const o = { n: list.length, present: 0, absent: 0, makeups: 0, byProg: {}, byGroup: {}, byWeek: {}, byDay: {}, scheduled: 0 };
      list.forEach((x) => {
        let p = 0; let a = 0;
        Object.values(x.marks).forEach((m) => { if (m === 'present') p++; else if (m === 'absent') a++; });
        o.present += p; o.absent += a; o.makeups += (x.makeups || []).length;
        const t = Store.training(x.trainingId);
        const pr = t ? Store.programOfGroup(t) : null;
        const P = o.byProg[pr ? pr.id : '_'] = o.byProg[pr ? pr.id : '_'] || { prog: pr, n: 0, present: 0, absent: 0 };
        P.n++; P.present += p; P.absent += a;
        const G = o.byGroup[x.trainingId] = o.byGroup[x.trainingId] || { id: x.trainingId, t, name: x.name || (t ? Store.groupName(t) : 'Törölt csoport'), prog: pr, n: 0, present: 0, absent: 0 };
        G.n++; G.present += p; G.absent += a;
        const W = o.byWeek[Store.weekStart(x.date)] = o.byWeek[Store.weekStart(x.date)] || [0, 0]; W[0] += p; W[1] += p + a;
        const D = o.byDay[x.date] = o.byDay[x.date] || [0, 0]; D[0] += p; D[1] += p + a;
      });
      Store.eachDate(from, to, (d) => { Store.trainingsOn(d).forEach((t) => { if (d > today || (d === today && nm < T(t.end))) return; o.scheduled++; }); });
      o.rate = ratio(o.present, o.present + o.absent);
      return o;
    });
  }

  /** Ügyfelek: ki játszott, mennyit, hogyan foglalt és fizetett. */
  function cust(from, to) {
    return cached(`cust|${from}|${to}`, () => {
      const per = new Map();
      const of = (id) => { if (!per.has(id)) per.set(id, { id, n: 0, min: 0, spent: 0 }); return per.get(id); };
      let items = 0;
      Store.eachDate(from, to, (d) => Store.itemsOn(d).forEach((it) => {
        if (!it.customerId || (it.type !== 'single' && it.type !== 'regular')) return;
        const x = of(it.customerId); x.n++; x.min += T(it.end) - T(it.start); items++;
      }));
      const singles = Store.bookings({ from, to, type: 'single' });
      const live = singles.filter((b) => b.status !== 'cancelled');
      const lead = [0, 0, 0, 0, 0];
      const pm = { card: 0, onsite: 0, pass: 0 };
      let web = 0;
      live.forEach((b) => {
        const dd = Store.daysBetween(b.createdAt.slice(0, 10), b.date);
        lead[dd <= 0 ? 0 : dd === 1 ? 1 : dd <= 3 ? 2 : dd <= 7 ? 3 : 4]++;
        if (b.source === 'web') web++;
        pm[b.passId ? 'pass' : b.payMethod === 'card' ? 'card' : 'onsite']++;
      });
      Store.payments({ from, to }).forEach((p) => { if (p.payer && p.payer.kind === 'customer') of(p.payer.id).spent += p.amount; });
      const rows = [...per.values()];
      const active = rows.filter((x) => x.n > 0);
      return {
        rows, items, active: active.length, returning: active.filter((x) => x.n >= 2).length,
        fresh: Store.customers().filter((c) => c.createdAt && c.createdAt.slice(0, 10) >= from && c.createdAt.slice(0, 10) <= to).length,
        singles: singles.length, live: live.length, cancelled: singles.length - live.length, lead, pm, web,
        spend: rows.reduce((a, x) => a + x.spent, 0), payers: rows.filter((x) => x.spent > 0).length,
      };
    });
  }

  // ---------- közös kártya-elemek ----------
  const kpiRow = (tiles) => `<div class="kpis st-kpis" style="--n:${tiles.length - 1}">${tiles.join('')}</div>`;
  // a cím linkként a részletes oldalra visz (href), a jobb oldalon kapcsolók (tools)
  const card = (title, small, body, tools = '', href = '') => `<div class="card"><div class="card-h"><div><h3>${href ? `<a class="h-link" href="${href}">${title}${I.next}</a>` : title}</h3>${small ? `<small>${small}</small>` : ''}</div>${tools ? `<div class="card-tools">${tools}</div>` : ''}</div><div class="card-b">${body}</div></div>`;
  const more = (href, label = 'Részletek') => `<a class="btn sm ghost" href="${href}">${label} ${I.next}</a>`;
  const legend = (list) => `<div class="legend">${list.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.label)}${x.value != null ? ` · ${x.value}` : ''}</span>`).join('')}</div>`;

  function revChart(host, rv, gran, asTable) {
    const data = bucket(rv.days, gran);
    if (asTable) {
      host.innerHTML = `<div class="data-scroll"><table class="data-tbl"><thead><tr><th>${gran === 'day' ? 'Nap' : gran === 'week' ? 'Hét' : 'Hónap'}</th>${REV.map((x) => `<th>${x.label}</th>`).join('')}<th>Összesen</th></tr></thead><tbody>${[...data].reverse().map((d) => `<tr><td>${esc(d.title)}</td>${REV.map((x) => `<td>${money(d.values[x.key])}</td>`).join('')}<td><b>${money(d.values.total)}</b></td></tr>`).join('')}</tbody></table></div>`;
    } else Admin.stackedColumns(host, { data, series: REV, height: 250 });
  }
  function heat(host, o) {
    const s = Store.settings();
    const hours = []; for (let h = T(s.open) / 60; h < T(s.close) / 60; h++) hours.push(h);
    Admin.heatmap(host, {
      rows: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ key: String(d), label: UI.DAYS_SHORT[d - 1] })),
      cols: hours.map((h) => ({ key: String(h), label: h % 2 ? '' : String(h) })),
      value: (r, c) => { const g = o.grid[r.key] && o.grid[r.key][c.key]; return g && g[1] ? g[0] / g[1] : null; },
      tipFor: (rk, ck) => { const g = o.grid[rk] && o.grid[rk][ck]; return `<b>${UI.cap(UI.DAYS[rk - 1])} ${ck}:00–${Number(ck) + 1}:00</b><div class="tr"><span>Kihasználtság</span><b>${g && g[1] ? pct(g[0] / g[1]) : 'nincs adat'}</b></div>${g && g[1] ? `<div class="tr"><span>Foglalt</span><b>${hrs(g[0])} / ${hrs(g[1])} óra</b></div>` : ''}`; },
    });
  }
  function progRows(a) {
    return Object.values(a.byProg).map((P) => ({ ...P, rate: ratio(P.present, P.present + P.absent) })).filter((P) => P.rate != null)
      .sort((x, y) => y.rate - x.rate)
      .map((P) => ({ label: P.prog ? P.prog.name : 'Program nélkül', lead: dot(P.prog ? P.prog.color : '#B3AFA6'), sub: `${num(P.n)} edzés · ${num(P.present + P.absent)} részvétel`, v: P.rate, text: pct(P.rate, 1) }));
  }

  // ======================================================================
  // ÁTTEKINTÉS
  // ======================================================================
  const ov = { table: false };
  function renderOverview(el) {
    const R = Admin.statRange();
    const rv = revenue(R.from, R.to); const okPay = covered('pay', R); const rvP = okPay ? revenue(R.prev.from, R.prev.to) : null;
    const o = occ(R.from, R.to); const okBook = covered('book', R); const oP = okBook ? occ(R.prev.from, R.prev.to) : null;
    const cu = cust(R.from, R.to); const cuP = okBook ? cust(R.prev.from, R.prev.to) : null;
    const a = att(R.from, R.to); const okSess = covered('sess', R); const aP = okSess ? att(R.prev.from, R.prev.to) : null;
    const recv = Store.receivables();
    const students = Store.students().filter((x) => x.active !== false);
    const gran = autoGran(R.days);
    const byMethod = {}; Store.payments({ from: R.from, to: R.to }).forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; });
    const mTot = Object.values(byMethod).reduce((x, v) => x + Math.max(0, v), 0);

    el.innerHTML = `
      ${kpiRow([
        Admin.kpi({ label: 'Bevétel', value: money(rv.total), delta: rvP ? rel(rv.total, rvP.total) : null, sub: vsNote(okPay, R), spark: rv.days.length > 1 ? rv.days.map((d) => d.total) : null, tone: 'hero' }),
        Admin.kpi({ label: 'Pályakihasználtság', value: pct(o.rate), delta: oP ? pp(o.rate, oP.rate) : null, pp: true, sub: `${hrs(o.booked)} pályaóra foglalt` }),
        Admin.kpi({ label: 'Pályafoglalások', value: num(cu.items), delta: cuP ? rel(cu.items, cuP.items) : null, sub: `${pct(ratio(cu.web, cu.live))} online foglalva` }),
        Admin.kpi({ label: 'Edzésjelenlét', value: pct(a.rate, 1), delta: aP ? pp(a.rate, aP.rate) : null, pp: true, sub: `${num(a.n)} edzés rögzítve` }),
        Admin.kpi({ label: 'Aktív diákok', value: num(students.length), sub: 'jelenleg' }),
        Admin.kpi({ label: 'Kintlévőség', value: money(recv.reduce((x, r) => x + r.amount, 0)), sub: `${recv.length} tétel · jelenleg`, tone: recv.length ? 'alert' : '', href: '#/kintlevoseg' }),
      ])}

      <div class="dash-a">
        ${card('Bevétel kategóriánként', `${GRAN[gran]} · visszatérítésekkel csökkentve`,
          `${legend(REV.map((x) => ({ ...x, value: money(rv.by[x.key]) })))}<div class="js-rev chart-h"></div>`,
          `<div class="seg-ctl"><button class="${ov.table ? '' : 'on'}" data-view="chart">Grafikon</button><button class="${ov.table ? 'on' : ''}" data-view="table">Táblázat</button></div>`, '#/bevetel')}
        ${card('Miből és hogyan?', 'a bevétel megoszlása az időszakban',
          `${Admin.shareBar(REV.map((x) => ({ label: x.label, v: rv.by[x.key], color: x.color })))}
           <h4 class="st-h">Fizetési módok</h4>
           ${Admin.barList(Object.entries(byMethod).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([m, v]) => ({ label: Admin.METHOD_SHORT[m] || m, v, text: money(v), sub: pct(v / mTot) })))}`)}
      </div>

      <div class="dash-b">
        ${card('Mikor foglaltak a pályák?', `kihasználtság napszak szerint, mind a ${Store.activeCourts().length} pályán`, '<div class="js-heat"></div>', '', '#/kihasznaltsag')}
        ${card('Jelenlét programonként', `${num(a.n)} rögzített edzés alapján`, Admin.barList(progRows(a), { max: 1, track: true, empty: 'Ebben az időszakban nincs rögzített edzés.' }), '', '#/edzesek')}
      </div>`;

    revChart($('.js-rev', el), rv, gran, ov.table);
    heat($('.js-heat', el), o);
    $$('[data-view]', el).forEach((b) => b.addEventListener('click', () => { ov.table = b.dataset.view === 'table'; renderOverview(el); }));
  }
  Admin.page('attekintes', { mode: 'stat', title: 'Áttekintés', sub: subOf('a legfontosabb számok egy helyen'), render: renderOverview });

  // ======================================================================
  // BEVÉTEL
  // ======================================================================
  const rs = { gran: null, table: false };
  function renderRevenue(el) {
    const R = Admin.statRange();
    const rv = revenue(R.from, R.to); const ok = covered('pay', R); const rvP = ok ? revenue(R.prev.from, R.prev.to) : null;
    const pays = Store.payments({ from: R.from, to: R.to });
    const pos = pays.filter((p) => p.amount > 0); const refunds = pays.filter((p) => p.amount < 0);
    const refundSum = -refunds.reduce((x, p) => x + p.amount, 0);
    const posSum = pos.reduce((x, p) => x + p.amount, 0);
    const byMethod = {}; pays.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; });
    const mTot = Object.values(byMethod).reduce((x, v) => x + Math.max(0, v), 0);
    const web = pays.filter((p) => p.by === 'web').reduce((x, p) => x + p.amount, 0);
    const cnt = {}; pos.forEach((p) => { cnt[p.category] = (cnt[p.category] || 0) + 1; });
    const prevPos = rvP ? Store.payments({ from: R.prev.from, to: R.prev.to }).filter((p) => p.amount > 0).length : 0;
    const gran = rs.gran || autoGran(R.days);
    const maxCat = Math.max(1, ...REV.map((x) => rv.by[x.key]));

    el.innerHTML = `
      ${kpiRow([
        Admin.kpi({ label: 'Bevétel', value: money(rv.total), delta: rvP ? rel(rv.total, rvP.total) : null, sub: vsNote(ok, R), spark: rv.days.length > 1 ? rv.days.map((d) => d.total) : null, tone: 'hero' }),
        Admin.kpi({ label: 'Napi átlag', value: money(rv.total / R.days), sub: `${R.days} nap alapján` }),
        Admin.kpi({ label: 'Befizetések', value: num(pos.length), delta: rvP ? rel(pos.length, prevPos) : null, sub: `átlagosan ${money(pos.length ? posSum / pos.length : 0)}` }),
        Admin.kpi({ label: 'Online kártyás', value: pct(ratio(byMethod.card || 0, rv.total)), sub: `${money(byMethod.card || 0)} a weboldalon` }),
        Admin.kpi({ label: 'Visszatérítések', value: money(refundSum), sub: `${refunds.length} tétel` }),
      ])}

      ${card('Bevétel kategóriánként', `${money(rv.total)} · ${GRAN[gran]}, visszatérítésekkel csökkentve`,
        `${legend(REV.map((x) => ({ ...x, value: money(rv.by[x.key]) })))}<div class="js-rev chart-h"></div>`,
        `<div class="seg-ctl">${[['day', 'Nap'], ['week', 'Hét'], ['month', 'Hónap']].map(([k, l]) => `<button class="${gran === k ? 'on' : ''}" data-gran="${k}">${l}</button>`).join('')}</div>
         <div class="seg-ctl"><button class="${rs.table ? '' : 'on'}" data-view="chart">Grafikon</button><button class="${rs.table ? 'on' : ''}" data-view="table">Táblázat</button></div>`)}

      <div class="dash-a" style="margin-top:16px">
        ${card('Kategóriák', rvP ? `összevetve: ${esc(R.prevLabel)}` : 'az időszak bevétele forrásonként',
          `<div class="tbl-x"><table class="st-tbl"><thead><tr><th>Kategória</th><th class="w"></th><th class="r">Összeg</th><th class="r">Arány</th><th class="r">Befizetés</th>${rvP ? '<th class="r">Változás</th>' : ''}</tr></thead><tbody>
            ${REV.map((x) => { const v = rv.by[x.key]; const d = rvP ? rel(v, rvP.by[x.key]) : null; return `<tr>
              <td>${dot(x.color)}<b>${x.label}</b></td>
              <td class="w"><span class="st-bar"><i style="width:${Math.max(0, (v / maxCat) * 100).toFixed(1)}%;background:${x.color}"></i></span></td>
              <td class="r num">${money(v)}</td>
              <td class="r num">${pct(ratio(v, rv.total))}</td>
              <td class="r num">${num(cnt[x.key] || 0)}</td>
              ${rvP ? `<td class="r num ${d == null ? 'dim' : d >= 0 ? 'up' : 'down'}">${d == null ? '—' : `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))}%`}</td>` : ''}
            </tr>`; }).join('')}
          </tbody><tfoot><tr><td>Összesen</td><td class="w"></td><td class="r num">${money(rv.total)}</td><td class="r num">100%</td><td class="r num">${num(pos.length)}</td>${rvP ? `<td class="r num">${rel(rv.total, rvP.total) == null ? '—' : `${rel(rv.total, rvP.total) >= 0 ? '+' : '−'}${Math.abs(Math.round(rel(rv.total, rvP.total) * 100))}%`}</td>` : ''}</tr></tfoot></table></div>`)}
        ${card('Fizetési módok', 'a befizetések megoszlása, visszatérítésekkel',
          `${Admin.barList(Object.entries(byMethod).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([m, v]) => ({ label: Admin.METHOD_SHORT[m] || m, v, text: money(v), sub: pct(v / mTot) })))}
           <h4 class="st-h">Honnan jön a pénz?</h4>
           ${Admin.shareBar([{ label: 'Weboldal (online)', v: web, color: '#2a78d6' }, { label: 'Recepció / admin', v: rv.total - web, color: '#eb6834' }])}`,
          more('#/befizetesek', 'Befizetések'))}
      </div>`;

    revChart($('.js-rev', el), rv, gran, rs.table);
    $$('[data-gran]', el).forEach((b) => b.addEventListener('click', () => { rs.gran = b.dataset.gran; renderRevenue(el); }));
    $$('[data-view]', el).forEach((b) => b.addEventListener('click', () => { rs.table = b.dataset.view === 'table'; renderRevenue(el); }));
  }
  Admin.page('bevetel', { mode: 'stat', title: 'Bevétel', sub: subOf('befizetések kategóriánként és módonként'), render: renderRevenue });

  // ======================================================================
  // PÁLYAKIHASZNÁLTSÁG
  // ======================================================================
  function renderOccupancy(el) {
    const R = Admin.statRange();
    const o = occ(R.from, R.to); const ok = covered('book', R); const oP = ok ? occ(R.prev.from, R.prev.to) : null;
    const cu = cust(R.from, R.to); const cuP = ok ? cust(R.prev.from, R.prev.to) : null;
    const tiers = ['peak', 'off', 'weekend'].filter((k) => o.byTier[k] && o.byTier[k][1]);
    const tierRate = (x, k) => (x && x.byTier[k] && x.byTier[k][1] ? x.byTier[k][0] / x.byTier[k][1] : null);
    const tierSub = { peak: 'csúcsidős árú órák', off: 'kedvezményes árú órák', weekend: 'szombat, vasárnap' };

    // trend: rövid időszaknál naponta, hosszabbnál hetente
    const daily = R.days <= 14;
    const trend = [];
    if (daily) o.days.forEach((d) => trend.push({ x: String(Number(d.date.slice(8))), title: UI.cap(UI.dateLong(d.date)), v: ratio(d.booked, d.total) }));
    else {
      const wk = new Map();
      o.days.forEach((d) => { const k = Store.weekStart(d.date); if (!wk.has(k)) wk.set(k, { from: d.date, to: d.date, b: 0, t: 0 }); const x = wk.get(k); x.to = d.date; x.b += d.booked; x.t += d.total; });
      wk.forEach((x) => trend.push({ x: mmdd(x.from), title: `${UI.dateShort(x.from)} – ${UI.dateShort(x.to)}`, v: ratio(x.b, x.t), note: x.from === x.to || Store.daysBetween(x.from, x.to) < 6 ? 'nem teljes hét' : '' }));
    }
    const dowData = [1, 2, 3, 4, 5, 6, 7].map((d) => { const w = o.byDow[d]; return { x: UI.DAYS_SHORT[d - 1], title: UI.cap(UI.DAYS[d - 1]), values: { v: w && w[1] ? w[0] / w[1] : 0 }, note: w && w[1] ? '' : 'nincs adat az időszakban' }; });

    el.innerHTML = `
      ${kpiRow([
        Admin.kpi({ label: 'Kihasználtság', value: pct(o.rate), delta: oP ? pp(o.rate, oP.rate) : null, pp: true, sub: vsNote(ok, R), spark: o.days.length > 1 ? o.days.map((d) => ratio(d.booked, d.total) || 0) : null, tone: 'hero' }),
        Admin.kpi({ label: 'Foglalt pályaórák', value: hrs(o.booked), delta: oP ? rel(o.booked, oP.booked) : null, sub: `${hrs(o.total)} nyitvatartási pályaórából` }),
        ...tiers.map((k) => Admin.kpi({ label: TIER_LABEL[k], value: pct(tierRate(o, k)), delta: oP ? pp(tierRate(o, k), tierRate(oP, k)) : null, pp: true, sub: tierSub[k] })),
        Admin.kpi({ label: 'Lemondások', value: num(cu.cancelled), delta: cuP ? rel(cu.cancelled, cuP.cancelled) : null, good: false, sub: `${pct(ratio(cu.cancelled, cu.singles), 1)} az egyszeri foglalásokból` }),
      ])}

      <div class="dash-a">
        ${card('Mikor foglaltak a pályák?', 'kihasználtság a hét napjai és napszakok szerint', '<div class="js-heat"></div>')}
        ${card('Mivel telnek a pályák?', 'a nyitvatartási idő megoszlása',
          Admin.shareBar([...TYPES.map((t) => ({ label: t.label, v: o.byType[t.key], color: t.color })), { label: 'Szabad', v: Math.max(0, o.total - o.booked), color: FREE }], { fmt: (v) => `${hrs(v)} óra` }))}
      </div>

      <div class="dash-b">
        ${card(daily ? 'Kihasználtság naponta' : 'Kihasználtság hetente', 'a foglalt idő aránya', '<div class="js-trend chart-h"></div>')}
        ${card('A hét napjai', 'átlagos kihasználtság', '<div class="js-dow chart-h"></div>')}
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-h"><div><h3>Pályánként</h3><small>a nyitvatartási idő hány százaléka volt foglalt, és mire</small></div>${more('#/naptar', 'Naptár')}</div>
        <div class="card-b">
          ${legend([...TYPES, { label: 'Szabad', color: FREE }])}
          <div class="tbl-x"><table class="st-tbl comp-tbl"><thead><tr><th>Pálya</th><th class="w">Foglaltság</th>${TYPES.map((t) => `<th class="r">${t.label}</th>`).join('')}<th class="r">Összesen</th></tr></thead><tbody>
            ${o.courts.map((x) => `<tr>
              <td><span class="t-court">${Court.mini(x.c)}<b>${esc(x.c.name)}</b></span></td>
              <td class="w"><span class="comp">${TYPES.filter((t) => x.byType[t.key] > 0).map((t) => `<i style="width:${((x.byType[t.key] / x.total) * 100).toFixed(2)}%;background:${t.color}" data-tip="${esc(`${x.c.name} · ${t.label}`)}" data-tip-l="${pct(x.byType[t.key] / x.total, 1)}" data-tip-v="${hrs(x.byType[t.key])} óra"></i>`).join('')}<i class="free" data-tip="${esc(`${x.c.name} · szabad`)}" data-tip-l="${pct(1 - x.booked / x.total, 1)}" data-tip-v="${hrs(x.total - x.booked)} óra"></i></span></td>
              ${TYPES.map((t) => `<td class="r num">${pct(ratio(x.byType[t.key], x.total))}</td>`).join('')}
              <td class="r num"><b>${pct(ratio(x.booked, x.total))}</b></td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;

    heat($('.js-heat', el), o);
    Admin.lineChart($('.js-trend', el), { data: trend, fmt: (v) => pct(v), tick: (v) => pct(v), minSpan: 0.2, clamp: [0, 1], name: 'Kihasználtság' });
    Admin.stackedColumns($('.js-dow', el), { data: dowData, series: [{ key: 'v', label: 'Kihasználtság', color: ACCENT }], fmt: (v) => pct(v), tick: (v) => pct(v), max: 1, height: 220 });
  }
  Admin.page('kihasznaltsag', { mode: 'stat', title: 'Pályakihasználtság', sub: subOf('mikor, mennyire és mivel foglaltak a pályák'), render: renderOccupancy });

  // ======================================================================
  // EDZÉSEK ÉS JELENLÉT
  // ======================================================================
  function renderTraining(el) {
    const R = Admin.statRange();
    const a = att(R.from, R.to); const ok = covered('sess', R); const aP = ok ? att(R.prev.from, R.prev.to) : null;
    const owed = Object.values(Store.allStats()).reduce((x, s) => x + (s.owed || 0), 0);
    const students = Store.students().filter((x) => x.active !== false);
    const coaches = Store.coaches().map((c) => ({ c, h: Store.coachHours(c.id, R.from, R.to) })).filter((x) => x.h.minutes || x.h.privates).sort((x, y) => y.h.minutes - x.h.minutes);
    const coachMin = coaches.reduce((x, c) => x + c.h.minutes, 0);
    const prevCoachMin = aP ? Store.coaches().reduce((x, c) => x + Store.coachHours(c.id, R.prev.from, R.prev.to).minutes, 0) : 0;
    const daily = R.days <= 14;
    const trend = [];
    if (daily) Store.eachDate(R.from, R.to, (d) => { const x = a.byDay[d]; if (Store.trainingsOn(d).length || x) trend.push({ x: String(Number(d.slice(8))), title: UI.cap(UI.dateLong(d)), v: x && x[1] ? x[0] / x[1] : null }); });
    else Object.keys(a.byWeek).sort().forEach((k) => { const x = a.byWeek[k]; const to = Store.shiftYmd(k, 6); trend.push({ x: mmdd(k < R.from ? R.from : k), title: `${UI.dateShort(k < R.from ? R.from : k)} – ${UI.dateShort(to > R.to ? R.to : to)}`, v: x[1] ? x[0] / x[1] : null }); });
    const byProgN = {}; students.forEach((x) => { byProgN[x.programId || '_'] = (byProgN[x.programId || '_'] || 0) + 1; });
    const months = []; for (let m = Store.monthOf(R.from); m <= Store.monthOf(R.to); m = Store.shiftMonth(m, 1)) months.push(m);
    const groups = Object.values(a.byGroup).map((g) => ({ ...g, rate: ratio(g.present, g.present + g.absent), avg: g.n ? g.present / g.n : 0 }));

    el.innerHTML = `
      ${kpiRow([
        Admin.kpi({ label: 'Jelenléti arány', value: pct(a.rate, 1), delta: aP ? pp(a.rate, aP.rate) : null, pp: true, sub: vsNote(ok, R), tone: 'hero' }),
        Admin.kpi({ label: 'Megtartott edzések', value: num(a.n), delta: aP ? rel(a.n, aP.n) : null, sub: `${pct(ratio(a.n, a.scheduled))} a tervezettből rögzítve` }),
        Admin.kpi({ label: 'Hiányzások', value: num(a.absent), delta: aP ? rel(a.absent, aP.absent) : null, good: false, sub: `${num(a.makeups)} pótló részvétel` }),
        Admin.kpi({ label: 'Pótlásra vár', value: num(owed), sub: 'alkalom · jelenleg', href: '#/jelenlet' }),
        Admin.kpi({ label: 'Edzői órák', value: hrs(coachMin), delta: aP ? rel(coachMin, prevCoachMin) : null, sub: `${coaches.filter((x) => x.h.minutes).length} edző dolgozott` }),
        Admin.kpi({ label: 'Aktív diákok', value: num(students.length), sub: `${Store.trainings().length} csoportban · jelenleg` }),
      ])}

      <div class="dash-a">
        ${card(daily ? 'Jelenlét naponta' : 'Jelenlét hetente', 'a jelen lévők aránya a névsorhoz képest', '<div class="js-trend chart-h"></div>')}
        ${card('Programonként', 'jelenléti arány', Admin.barList(progRows(a), { max: 1, track: true, empty: 'Ebben az időszakban nincs rögzített edzés.' }))}
      </div>

      <div class="dash-a">
        <div class="card">
          <div class="card-h"><div><h3>Csoportok</h3><small>a leggyengébb jelenlétű csoportok elöl · kattints a csoport megnyitásához</small></div>${more('#/orarend', 'Órarend')}</div>
          <div class="js-groups"></div>
        </div>
        ${card('Edzői órák', 'a jelenléti naplóból: ki tartotta az edzést', Admin.barList(coaches.map((x) => ({ label: x.c.name, lead: UI.avatar(x.c), v: x.h.minutes, text: `${hrs(x.h.minutes)} óra`, sub: `${x.h.groups} alkalom · ${x.h.days} nap${x.h.privates ? ` · ${x.h.privates} magánóra` : ''}` })), { empty: 'Ebben az időszakban nincs rögzített edzői óra.' }), more('#/edzok', 'Bérszámfejtés'))}
      </div>

      <div class="dash-b">
        ${card('Diákok programonként', 'aktív diákok jelenleg',
          Admin.barList(Store.programs().filter((p) => byProgN[p.id]).sort((x, y) => byProgN[y.id] - byProgN[x.id]).map((p) => ({ label: p.name, lead: dot(p.color), v: byProgN[p.id], text: `${byProgN[p.id]} fő`, sub: `${money(p.fee)}/hó` })), { empty: 'Nincs aktív diák.' }),
          more('#/diakok', 'Diákok'))}
        ${card('Tandíj-befizetés', 'a kiírt havidíjak hány százaléka folyt be',
          months.map((m) => {
            const ch = Store.charges({ month: m }).filter((c) => c.status !== 'void');
            const tot = ch.reduce((x, c) => x + c.amount, 0); const paid = ch.filter((c) => c.status === 'paid'); const paidSum = paid.reduce((x, c) => x + c.amount, 0);
            return ch.length
              ? Admin.meter(ratio(paidSum, tot), { label: esc(UI.cap(UI.monthLabel(m))), right: `<b>${pct(ratio(paidSum, tot))}</b> befizetve`, sub: `${money(paidSum)} / ${money(tot)} · ${paid.length} / ${ch.length} diák` })
              : `<div class="mt"><div class="mt-h"><b>${esc(UI.cap(UI.monthLabel(m)))}</b><span class="dim">nincs kiírva</span></div></div>`;
          }).join(''),
          more('#/tandijak', 'Tandíjak'))}
      </div>`;

    Admin.lineChart($('.js-trend', el), { data: trend, fmt: (v) => pct(v, 1), tick: (v) => pct(v), minSpan: 0.2, clamp: [0, 1], name: 'Jelenléti arány' });
    Admin.table($('.js-groups', el), {
      rows: groups, sort: { key: 'rate', dir: 1 }, pageSize: 10,
      onRow: (g) => { if (Store.training(g.id)) Admin.actions.editTraining(g.id); },
      cols: [
        { key: 'name', label: 'Csoport', sort: (g) => g.name, render: (g) => `${dot(g.prog ? g.prog.color : '#B3AFA6')}<b>${esc(g.name)}</b><span class="t-sub">${esc(g.prog ? g.prog.name : '')}</span>` },
        { key: 'n', label: 'Edzés', align: 'r', cls: 'num', sort: (g) => g.n, render: (g) => g.n },
        { key: 'avg', label: 'Átl. létszám', align: 'r', cls: 'num', sort: (g) => g.avg, render: (g) => String(Math.round(g.avg * 10) / 10).replace('.', ',') },
        { key: 'rate', label: 'Jelenlét', sort: (g) => g.rate, render: (g) => `<span class="rate"><i style="--w:${Math.round((g.rate || 0) * 100)}%" class="${(g.rate || 0) < 0.85 ? 'lo' : ''}"></i></span><span class="t-sub">${pct(g.rate, 1)}</span>` },
      ],
      empty: 'Ebben az időszakban nincs rögzített edzés.',
    });
  }
  Admin.page('edzesek', { mode: 'stat', title: 'Edzések és jelenlét', sub: subOf('jelenlét, hiányzás, pótlás, edzői órák, tandíj'), render: renderTraining });

  // ======================================================================
  // ÜGYFÉLKÖR
  // ======================================================================
  function renderCustomers(el) {
    const R = Admin.statRange();
    const ok = covered('book', R);
    const cu = cust(R.from, R.to); const cuP = ok ? cust(R.prev.from, R.prev.to) : null;
    const leadTot = cu.lead.reduce((x, v) => x + v, 0);
    const top = cu.rows.filter((x) => x.n || x.spent > 0).map((x) => ({ ...x, c: Store.customer(x.id) })).filter((x) => x.c);

    el.innerHTML = `
      ${kpiRow([
        Admin.kpi({ label: 'Aktív ügyfelek', value: num(cu.active), delta: cuP ? rel(cu.active, cuP.active) : null, sub: vsNote(ok, R), tone: 'hero' }),
        Admin.kpi({ label: 'Visszatérők', value: pct(ratio(cu.returning, cu.active)), delta: cuP ? pp(ratio(cu.returning, cu.active), ratio(cuP.returning, cuP.active)) : null, pp: true, sub: `${num(cu.returning)} ügyfél legalább 2× játszott` }),
        Admin.kpi({ label: 'Új ügyfelek', value: num(cu.fresh), sub: 'regisztrált az időszakban' }),
        Admin.kpi({ label: 'Átlagos költés', value: money(cu.payers ? cu.spend / cu.payers : 0), sub: `${num(cu.payers)} fizető ügyfélre` }),
        Admin.kpi({ label: 'Online foglalás', value: pct(ratio(cu.web, cu.live)), delta: cuP ? pp(ratio(cu.web, cu.live), ratio(cuP.web, cuP.live)) : null, pp: true, sub: `${num(cu.web)} a weboldalon` }),
        Admin.kpi({ label: 'Lemondási arány', value: pct(ratio(cu.cancelled, cu.singles), 1), delta: cuP ? pp(ratio(cu.cancelled, cu.singles), ratio(cuP.cancelled, cuP.singles)) : null, pp: true, good: false, sub: `${num(cu.cancelled)} lemondás` }),
      ])}

      <div class="dash-b">
        ${card('Mennyivel előre foglalnak?', `${num(leadTot)} egyszeri foglalás alapján`,
          Admin.barList(LEAD.map((l, i) => ({ label: l, v: cu.lead[i], text: pct(ratio(cu.lead[i], leadTot)), sub: `${num(cu.lead[i])} foglalás` })), { empty: 'Ebben az időszakban nincs foglalás.' }))}
        ${card('Hogyan foglalnak és fizetnek?', 'egyszeri foglalások',
          `${Admin.shareBar([{ label: 'Weboldalon', v: cu.web, color: '#2a78d6' }, { label: 'Telefonon / recepción', v: cu.live - cu.web, color: '#eb6834' }], { fmt: (v) => `${num(v)} db` })}
           <h4 class="st-h">Fizetés módja</h4>
           ${Admin.shareBar([{ label: 'Online kártya', v: cu.pm.card, color: '#2a78d6' }, { label: 'Helyszínen', v: cu.pm.onsite, color: '#eb6834' }, { label: 'Bérlettel', v: cu.pm.pass, color: '#1baf7a' }], { fmt: (v) => `${num(v)} db` })}`)}
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-h"><div><h3>Legjobb ügyfelek</h3><small>költés szerint az időszakban · kattints az adatlaphoz</small></div>${more('#/ugyfelek', 'Ügyfelek')}</div>
        <div class="js-top"></div>
      </div>`;

    Admin.table($('.js-top', el), {
      rows: top, sort: { key: 'spent', dir: -1 }, pageSize: 10,
      onRow: (x) => Admin.actions.openCustomer(x.id),
      cols: [
        { key: 'name', label: 'Ügyfél', sort: (x) => x.c.name, render: (x) => `<div class="t-person">${UI.avatar(x.c)}<span><b>${esc(x.c.name)}</b><small>${esc(x.c.email || '')}</small></span></div>` },
        { key: 'n', label: 'Foglalás', align: 'r', cls: 'num', sort: (x) => x.n, render: (x) => x.n },
        { key: 'min', label: 'Játszott óra', align: 'r', cls: 'num', sort: (x) => x.min, render: (x) => hrs(x.min) },
        { key: 'spent', label: 'Költés', align: 'r', cls: 'num', sort: (x) => x.spent, render: (x) => `<b>${money(x.spent)}</b>` },
      ],
      empty: 'Ebben az időszakban nem volt ügyfélforgalom.',
    });
  }
  Admin.page('ugyfelkor', { mode: 'stat', title: 'Ügyfélkör', sub: subOf('kik játszanak, milyen gyakran, hogyan foglalnak'), render: renderCustomers });
})();
