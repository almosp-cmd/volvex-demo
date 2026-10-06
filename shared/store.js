/* ==========================================================================
   Közös adatréteg – Volvex rendszer
   (weboldal + pályafoglalás + munkatársi jelenléti app + admin)

   Demó módban a böngésző localStorage-ában tárol, így ugyanabban a
   böngészőben a weboldalon leadott foglalás azonnal látszik az adminban is.
   Minden olvasás/írás ezen a modulon megy át: élesítéskor egy közös
   adatbázisra (pl. Supabase) cserélhető anélkül, hogy a felületek változnának.
   ========================================================================== */
(function () {
  'use strict';

  const KEY = 'volvex.data.v4'; // új demóadatoknál a verziót emeljük, így a böngésző automatikusan újratölti
  const K_STAFF = 'volvex.staff';
  const K_ADMIN = 'volvex.admin';
  const K_CUSTOMER = 'volvex.customer';

  // ---------- dátum / idő segédek ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const isoDow = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = hétfő … 7 = vasárnap
  const dowOf = (date) => isoDow(parseYmd(date));
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const shiftYmd = (date, n) => ymd(addDays(parseYmd(date), n));
  const todayYmd = () => ymd(new Date());
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const nowIso = () => new Date().toISOString();
  const monthOf = (date) => date.slice(0, 7);
  const monthRange = (month) => {
    const [y, m] = month.split('-').map(Number);
    return { from: `${month}-01`, to: ymd(new Date(y, m, 0)) };
  };
  const shiftMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
  const weekStart = (date) => shiftYmd(date, -(dowOf(date) - 1));
  /** Szűrési időszakok: week | lastweek | month | lastmonth (a mai naphoz képest). */
  function periodRange(kind, ref = ymd(new Date())) {
    if (kind === 'week' || kind === 'lastweek') {
      const from = shiftYmd(weekStart(ref), kind === 'lastweek' ? -7 : 0);
      return { from, to: shiftYmd(from, 6) };
    }
    const m = kind === 'lastmonth' ? shiftMonth(monthOf(ref), -1) : monthOf(ref);
    return monthRange(m);
  }
  const overlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
  const eachDate = (from, to, fn) => { for (let d = from; d <= to; d = shiftYmd(d, 1)) fn(d); };

  const uid = (p) => `${p}_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`;
  const sessionKey = (trainingId, date) => `${trainingId}|${date}`;
  const absenceKey = (trainingId, date, sid) => `${trainingId}|${date}|${sid}`;
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const COACH_COLORS = ['#1F4E79', '#B4532A', '#3E6B4F', '#6B4E8A', '#8A6A1F', '#2A6F73', '#9C3D54', '#4A5A1E', '#5B4636', '#33507A'];

  const PAY_METHODS = {
    card: 'Bankkártya (online)',
    pos: 'Bankkártya (helyszínen)',
    cash: 'Készpénz',
    transfer: 'Átutalás',
    szep: 'SZÉP-kártya',
  };
  const BOOKING_TYPES = {
    single: 'Egyszeri foglalás',
    regular: 'Állandó foglalás',
    training: 'Edzés / magánóra',
    block: 'Pálya lezárva',
  };
  const CATEGORIES = { court: 'Pályabérlés', pass: 'Bérlet', tuition: 'Tandíj', other: 'Egyéb', refund: 'Visszatérítés' };

  // ======================================================================
  // DEMÓ ADATOK
  // ======================================================================
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function defaultTrainingSlots() {
    const weekday = [13, 14, 15, 16, 17, 18, 19].map((h) => ({ start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` }));
    return {
      1: weekday, 2: clone(weekday), 3: clone(weekday), 4: clone(weekday), 5: clone(weekday),
      6: [{ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:30' }, { start: '11:30', end: '12:30' }],
      7: [],
    };
  }

  function baseSettings() {
    return {
      clubName: 'Volvex Tennis',
      tagline: 'Több mint tenisz',
      company: {
        name: 'Volvex Kereskedelmi Kft.',
        address: '1139 Budapest, Rozsnyay utca 31.',
        taxNumber: '12536366-2-41',
        regNumber: '01-09-736271',
        bank: '',
      },
      venue: {
        address: '2120 Dunakeszi, Berek u. 5.',
        phone: '+36 70 794 7979',
        email: 'info@volvextennis.hu',
      },
      open: '07:00',
      close: '22:00',
      holidays: ['2026-10-23', '2026-11-01', '2026-12-24', '2026-12-25', '2026-12-26', '2027-01-01'],
      booking: { slotMin: 60, maxDaysAhead: 21, cancelHours: 24, leadMin: 30, allowOnsite: true, maxHours: 3 },
      // edzés-idősávok a jelenléti naplóhoz (hét napja → idősávok); a klub kérése szerint
      trainingSlots: defaultTrainingSlots(),
      invoice: { prefix: 'VT', vat: 27, dueDays: 8, seq: {} },
      integrations: {
        payment: { provider: '', status: 'demo' },
        invoicing: { provider: '', status: 'demo' },
        email: { provider: '', status: 'demo' },
      },
      adminPin: '0000',
    };
  }

  function buildDemo() {
    const rnd = mulberry32(20261001);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const chance = (p) => rnd() < p;
    const now = new Date();
    const today = ymd(now);
    const nm = now.getHours() * 60 + now.getMinutes();
    // időbélyeg a demóhoz – sosem a jövőben (a mai napon a jelenlegi időpont előtt)
    const iso = (date, hhmm) => {
      const d = parseYmd(date); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, Math.floor(rnd() * 59), 0);
      return (d > now ? new Date(now.getTime() - 60000 - Math.floor(rnd() * 3 * 3600000)) : d).toISOString();
    };
    const settings = baseSettings();
    let seq = 0;
    const id = (p) => `${p}${(++seq).toString(36)}`;

    // ---------- pályák, árak, termékek, programok ----------
    const courts = ['1-es', '2-es', '3-as', '4-es'].map((n, i) => ({
      id: `p${i + 1}`, no: i + 1, name: `${n} pálya`, sport: 'tennis', surface: 'hard', indoor: true, active: true,
    }));
    const thisMonth = monthOf(today);
    const prevMonth = shiftMonth(thisMonth, -1);
    const priceRules = [
      { id: 'pr1', name: 'Hétköznap délelőtt', tier: 'off', days: [1, 2, 3, 4, 5], from: '07:00', to: '16:00', price: 8000 },
      { id: 'pr2', name: 'Hétköznap csúcsidő', tier: 'peak', days: [1, 2, 3, 4, 5], from: '16:00', to: '22:00', price: 12000 },
      { id: 'pr3', name: 'Hétvége', tier: 'weekend', days: [6, 7], from: '07:00', to: '22:00', price: 10000 },
    ];
    const products = [
      { id: 'pk_off10', kind: 'pass', name: '10 alkalmas délelőtti bérlet', desc: 'Hétköznap 7–16 óra között, 10 × 1 óra', price: 70000, credits: 10, validDays: 120, tier: 'off', vat: 27, active: true },
      { id: 'pk_any10', kind: 'pass', name: '10 alkalmas bérlet', desc: 'Bármikor felhasználható, 10 × 1 óra', price: 105000, credits: 10, validDays: 120, tier: '', vat: 27, active: true },
      { id: 'pk_gift', kind: 'giftcard', name: 'Ajándékkártya', desc: 'Szabadon választható értékben, 1 évig érvényes', price: 0, vat: 27, active: true },
      { id: 'pk_ball', kind: 'other', name: 'Labdabérlés (3 db)', desc: '', price: 1000, vat: 27, active: true },
      { id: 'pk_racket', kind: 'other', name: 'Ütőbérlés', desc: '', price: 1500, vat: 27, active: true },
    ];
    const programs = [
      { id: 'ovi', name: 'Ovitenisz', short: 'OVI', ages: '4–6 év', fee: 24000, color: '#E8A13A', perWeek: '1–2 × 60 perc', desc: 'Játékos mozgásfejlesztés és az első ütések puha labdákkal, kisebb pályán.' },
      { id: 'jh', name: 'Junior hobbi tenisz', short: 'JUNIOR', ages: '7–14 év', fee: 32000, color: '#2DC3E6', perWeek: '2 × 90 perc', desc: 'Kiscsoportos edzés: technika, játékhelyzetek és sok-sok meccs.' },
      { id: 'vt', name: 'Versenytenisz', short: 'VERSENY', ages: '8–18 év', fee: 68000, color: '#2E5D8C', perWeek: '5 × 90 perc', desc: 'Versenyfelkészítés, erőnlét és taktika – versenyzői múltú edzőkkel.' },
      { id: 'tf', name: 'Tennis&Fun', short: 'T&F', ages: '6–12 év', fee: 26000, color: '#9DB82A', perWeek: 'szombat 90 perc', desc: 'Szombat délelőtti tenisz és csapatjátékok – a mozgás öröméért.' },
      { id: 'sztm', name: 'SZTM Kids', short: 'SZTM', ages: '5–10 év', fee: 18000, color: '#B4532A', perWeek: '2 × 60 perc', desc: 'Szenzomotoros tréning: koordináció, egyensúly, természetes mozgásminták.' },
      { id: 'fc', name: 'Felnőtt csoportos tenisz', short: 'FELNŐTT', ages: '18+', fee: 36000, color: '#6B4E8A', perWeek: '2 × 90 perc', desc: 'Kezdő és haladó csoportok esténként és vasárnap délelőtt.' },
      { id: 'pb', name: 'Felnőtt pickleball', short: 'PICKLE', ages: '18+', fee: 22000, color: '#3E6B4F', perWeek: '2 × 60 perc', desc: 'A leggyorsabban megtanulható ütős sport: kisebb pálya, könnyű ütő, műanyag labda.' },
    ];

    // ---------- edzők ----------
    const coaches = [
      ['Marosi Katalin', 'MK', 'Egykori WTA-játékos, olimpiai negyeddöntős párosban, sportpszichológus.'],
      ['Lukács Vanda', 'LV', 'Többszörös magyar bajnok, volt Fed-kupa-kerettag, nemzetközi (ATP-minősítésű) edző.'],
      ['Oláh Attila', 'OA', 'Tenisz szakedző és MTSZ Play & Stay edző – fő profilja az utánpótlás-nevelés.'],
      ['Borvendégh Áhim', 'BÁ', 'Testnevelő tanár és tenisz szakedző, gyerekeknek és felnőtteknek egyaránt.'],
      ['Barta Boglárka', 'BB', 'TF-es teniszedző, SZTM Kids tréner, Play & Stay minősítésű edző és játékvezető.'],
      ['Tóth Csongor Kristóf', 'TCS', '20-szoros utánpótlás magyar bajnok, TF-es szakedző – a taktika specialistája.'],
      ['Hornung Gábor', 'HG', 'TF-es sportedző, MTSZ „C” licenc és Play & Stay végzettség, három teniszező gyerek apja.'],
      ['Darvasi Áron', 'DÁ', 'Volt versenyző, edzősködött Új-Zélandon és Ausztráliában – szívügye az utánpótlás.'],
      ['Bánrévi Bernadett', 'BE', 'Volt ritmikus gimnaszta, csapatbajnoki játékos, MTSZ-játékvezető – a legkisebbek edzője.'],
    ].map(([name, short, bio], i) => ({
      id: `c${i + 1}`, name, short, bio, pin: String(i + 1).repeat(4), color: COACH_COLORS[i],
      phone: `+36 30 555 ${pad(10 + i)}${pad(20 + i * 3)}`, email: '', rate: 6000 + (i % 3) * 1000, active: true,
    }));
    const coachBy = (short) => coaches.find((c) => c.short === short);

    // ---------- nevek ----------
    const lastNames = ['Tóth', 'Horváth', 'Varga', 'Kiss', 'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Takács', 'Juhász', 'Lakatos',
      'Mészáros', 'Simon', 'Rácz', 'Fekete', 'Szilágyi', 'Török', 'Fehér', 'Balázs', 'Gál', 'Kocsis', 'Pintér', 'Vass', 'Bíró', 'Hegedűs',
      'Szűcs', 'Kun', 'Lengyel', 'Orbán', 'Boros', 'Sipos', 'Szalai', 'Magyar', 'Illés', 'Antal', 'Halász', 'Bogdán', 'Fodor', 'Jakab'];
    const female = ['Hanna', 'Luca', 'Zoé', 'Léna', 'Emma', 'Lili', 'Boglárka', 'Jázmin', 'Réka', 'Anna', 'Dorka', 'Flóra', 'Nóra', 'Panna', 'Villő', 'Eszter', 'Judit', 'Andrea', 'Krisztina', 'Márta', 'Zsófia', 'Petra', 'Kata', 'Dóra'];
    const male = ['Máté', 'Levente', 'Bence', 'Olivér', 'Dominik', 'Noel', 'Zalán', 'Botond', 'Marcell', 'Ádám', 'Kristóf', 'Áron', 'Milán', 'Gergő', 'Péter', 'Gábor', 'Tamás', 'Zoltán', 'András', 'László', 'Balázs', 'Dávid', 'Attila', 'Csaba'];
    const adultF = ['Andrea', 'Krisztina', 'Judit', 'Eszter', 'Katalin', 'Mónika', 'Anita', 'Ildikó', 'Szilvia', 'Erika', 'Orsolya', 'Ágnes'];
    const adultM = ['Gábor', 'Tamás', 'Zoltán', 'András', 'László', 'Péter', 'Attila', 'Csaba', 'Balázs', 'Róbert', 'Norbert', 'Sándor'];
    const used = new Set();
    const uniq = (fn) => { for (;;) { const n = fn(); if (!used.has(n)) { used.add(n); return n; } } };
    const kidName = (last) => uniq(() => `${last || pick(lastNames)} ${chance(0.5) ? pick(female) : pick(male)}`);
    const adultName = () => uniq(() => `${pick(lastNames)} ${chance(0.5) ? pick(adultF) : pick(adultM)}`);
    const slug = (s) => norm(s).replace(/[^a-z]+/g, '.');
    const phone = () => `+36 ${pick(['20', '30', '70'])} 555 ${pad(Math.floor(rnd() * 100))}${pad(Math.floor(rnd() * 100))}`;
    const cities = [['2120', 'Dunakeszi'], ['2131', 'Göd'], ['2151', 'Fót'], ['1043', 'Budapest'], ['2600', 'Vác'], ['2146', 'Mogyoród'], ['2111', 'Szada']];
    const streets = ['Fő út', 'Kossuth Lajos utca', 'Petőfi Sándor utca', 'Béke utca', 'Rákóczi út', 'Szent István utca', 'Alagi út', 'Barát utca', 'Klapka utca', 'Toldi utca'];
    const address = () => { const [zip, city] = pick(cities); return { zip, city, street: `${pick(streets)} ${1 + Math.floor(rnd() * 80)}.` }; };

    // ---------- ügyfelek ----------
    const customers = [];
    for (let i = 0; i < 84; i++) {
      const name = adultName();
      const a = address();
      const company = chance(0.12);
      customers.push({
        id: id('u'), name, email: `${slug(name)}@example.com`, phone: phone(),
        createdAt: iso(shiftYmd(today, -40 - Math.floor(rnd() * 400)), '12:00'),
        billing: company
          ? { name: `${name.split(' ')[0]} és Társa Kft.`, zip: a.zip, city: a.city, street: a.street, taxNumber: `${10000000 + Math.floor(rnd() * 89999999)}-2-13` }
          : { name, zip: a.zip, city: a.city, street: a.street, taxNumber: '' },
        note: '', marketing: chance(0.4),
      });
    }

    // ---------- csoportok (az idősávokon belül, mindegyik saját névsorral) ----------
    // [név, napok, kezdés, program, beosztott edző, pályaigény a foglalási naptárban, létszám]
    // A csoport vége az idősávból jön (settings.trainingSlots). Mintaadatok – a valós névsorokat a klub küldi.
    const MW = [1, 3]; const KT = [2, 4]; const ALL5 = [1, 2, 3, 4, 5];
    const GROUPS = [
      ['Verseny – magántanulók', ALL5, '13:00', 'vt', 'TCS', 1, 6],
      ['Verseny 1', ALL5, '14:00', 'vt', 'TCS', 1, 8],
      ['Verseny 2', ALL5, '14:00', 'vt', 'LV', 1, 8],
      ['Junior 1', MW, '15:00', 'jh', 'OA', 1, 8],
      ['Junior 3', MW, '15:00', 'jh', 'BÁ', 1, 8],
      ['Ovi 1', MW, '15:00', 'ovi', 'BB', 1, 6],
      ['Junior 2', KT, '15:00', 'jh', 'OA', 1, 8],
      ['Junior 4', KT, '15:00', 'jh', 'BÁ', 1, 7],
      ['SZTM Kids 1', KT, '15:00', 'sztm', 'BB', 0, 8],
      ['Junior 5', [5], '15:00', 'jh', 'OA', 1, 8],
      ['Ovi 2', [5], '15:00', 'ovi', 'BB', 1, 6],
      ['Junior 6', MW, '16:00', 'jh', 'OA', 1, 8],
      ['Junior 7', MW, '16:00', 'jh', 'HG', 1, 8],
      ['Ovi 3', MW, '16:00', 'ovi', 'BE', 1, 7],
      ['SZTM Kids 2', MW, '16:00', 'sztm', 'BB', 0, 8],
      ['Verseny 3', ALL5, '16:00', 'vt', 'MK', 1, 6],
      ['Junior 8', KT, '16:00', 'jh', 'HG', 1, 8],
      ['Junior 9', KT, '16:00', 'jh', 'OA', 1, 8],
      ['Ovi 4', KT, '16:00', 'ovi', 'BE', 1, 7],
      ['Junior 10', [5], '16:00', 'jh', 'HG', 1, 8],
      ['Ovi 5', [5], '16:00', 'ovi', 'BE', 1, 6],
      ['Junior 11', MW, '17:00', 'jh', 'HG', 1, 8],
      ['Junior 12', MW, '17:00', 'jh', 'BÁ', 1, 8],
      ['Haladó junior 1', MW, '17:00', 'jh', 'OA', 1, 6],
      ['Junior 13', KT, '17:00', 'jh', 'HG', 1, 8],
      ['Junior 14', KT, '17:00', 'jh', 'BÁ', 1, 8],
      ['Haladó junior 2', KT, '17:00', 'jh', 'OA', 1, 6],
      ['Verseny 4', ALL5, '17:00', 'vt', 'MK', 1, 6],
      ['Junior 15', [5], '17:00', 'jh', 'BÁ', 1, 8],
      ['Verseny 5', ALL5, '18:00', 'vt', 'TCS', 1, 8],
      ['Felnőtt kezdő 1', MW, '18:00', 'fc', 'DÁ', 1, 6],
      ['Felnőtt kezdő 2', KT, '18:00', 'fc', 'DÁ', 1, 6],
      ['Junior esti', [1, 2, 3, 4], '18:00', 'jh', 'MK', 1, 7],
      ['Felnőtt péntek', [5], '18:00', 'fc', 'DÁ', 1, 6],
      ['Felnőtt haladó 1', MW, '19:00', 'fc', 'LV', 1, 8],
      ['Felnőtt középhaladó', MW, '19:00', 'fc', 'DÁ', 1, 6],
      ['Felnőtt haladó 2', KT, '19:00', 'fc', 'LV', 1, 8],
      ['Pickleball', KT, '19:00', 'pb', 'DÁ', 1, 8],
      ['Felnőtt vegyes', [5], '19:00', 'fc', 'LV', 1, 7],
      ['Ovi szombat', [6], '09:00', 'ovi', 'BB', 1, 7],
      ['SZTM szombat', [6], '09:00', 'sztm', 'BE', 1, 7],
      ['Tennis&Fun', [6], '10:00', 'tf', 'OA', 2, 9],
      ['Junior szombat 1', [6], '10:00', 'jh', 'HG', 1, 8],
      ['Junior szombat 2', [6], '11:30', 'jh', 'HG', 1, 8],
      ['Felnőtt szombat', [6], '11:30', 'fc', 'DÁ', 1, 6],
    ];
    const slotEnd = (day, start) => ((settings.trainingSlots[day] || []).find((x) => x.start === start) || {}).end || fromMin(toMin(start) + 60);
    const trainings = GROUPS.map(([name, days, start, prog, co], i) => ({
      id: `t${i + 1}`, name, days: [...days], start, end: slotEnd(days[0], start), programId: prog,
      coachIds: [coachBy(co).id], studentIds: [], note: '',
    }));

    // ---------- diákok ----------
    const students = [];
    const AGE = { ovi: [4, 6], jh: [7, 14], vt: [9, 17], sztm: [5, 9], tf: [6, 11], fc: [25, 68], pb: [30, 66] };
    function addStudent(prog) {
      const [a0, a1] = AGE[prog];
      const age = a0 + Math.floor(rnd() * (a1 - a0 + 1));
      const adult = age >= 18;
      const last = pick(lastNames);
      const name = adult ? adultName() : kidName(last);
      const parent = adult ? '' : uniq(() => `${last} ${chance(0.55) ? pick(adultF) : pick(adultM)}`);
      const a = address();
      const st = {
        id: id('s'), name, birthYear: now.getFullYear() - age, programId: prog,
        parentName: parent, phone: phone(), email: `${slug(parent || name)}@example.com`,
        billing: { name: parent || name, zip: a.zip, city: a.city, street: a.street, taxNumber: '' },
        discount: chance(0.08) ? 10 : 0, active: true, note: '',
        joined: shiftYmd(today, -60 - Math.floor(rnd() * 700)),
      };
      students.push(st);
      return st;
    }
    trainings.forEach((t, i) => { for (let k = 0; k < GROUPS[i][6]; k++) t.studentIds.push(addStudent(t.programId).id); });
    // néhányan két csoportba is járnak (pl. junior + szombati Tennis&Fun)
    const tfGroup = trainings.find((t) => t.programId === 'tf');
    students.filter((s) => s.programId === 'jh' && s.birthYear >= now.getFullYear() - 11).slice(0, 4).forEach((s) => tfGroup.studentIds.push(s.id));

    // ---------- pályanaptár: ismétlődő edzésblokkok és állandó foglalások ----------
    const series = [];
    const SEASON = { from: `${prevMonth}-01`, to: monthRange(shiftMonth(thisMonth, 7)).to };
    const seriesOn = (s, date, dow) => s.day === dow && s.from <= date && (!s.to || date <= s.to) && !(s.skip || []).includes(date);
    const busy = (courtId, day, start, end) => series.some((s) => s.courtId === courtId && s.day === day
      && overlap(toMin(start), toMin(end), toMin(s.start), toMin(s.end)));
    trainings.forEach((t, i) => {
      const need = GROUPS[i][5];
      t.days.forEach((day) => {
        let got = 0;
        courts.forEach((c) => {
          if (got >= need || busy(c.id, day, t.start, t.end)) return;
          series.push({ id: id('r'), type: 'training', courtId: c.id, day, start: t.start, end: t.end, from: SEASON.from, to: SEASON.to, title: t.name, coachId: t.coachIds[0], customerId: null, price: 0, skip: [], paid: {} });
          got++;
        });
      });
    });
    // magánórák (az edzők foglalják, a jelenléti naplóban nem szerepelnek)
    [[1, '10:00', 'OA'], [1, '11:00', 'OA'], [2, '08:00', 'HG'], [3, '10:00', 'MK'], [3, '12:00', 'LV'], [4, '09:00', 'TCS'], [4, '12:00', 'HG'],
      [5, '10:00', 'BÁ'], [5, '12:00', 'OA'], [6, '13:00', 'TCS'], [6, '14:00', 'MK'], [7, '11:00', 'LV'], [2, '20:00', 'BB'], [1, '20:00', 'DÁ']].forEach(([day, start, sh], k) => {
      const end = fromMin(toMin(start) + 60);
      const c = courts.find((cc) => !busy(cc.id, day, start, end) && (k % 2 ? cc.no >= 3 : true));
      if (c) series.push({ id: id('r'), type: 'training', courtId: c.id, day, start, end, from: SEASON.from, to: SEASON.to, title: 'Magánóra', coachId: coachBy(sh).id, customerId: null, price: 0, skip: [], paid: {} });
    });

    const ruleAt = (date, min) => { const dow = dowOf(date); return priceRules.find((r) => r.days.includes(dow) && toMin(r.from) <= min && min < toMin(r.to)); };
    const priceOf = (date, start, end) => { let t = 0; for (let m = toMin(start); m < toMin(end); m += 30) { const r = ruleAt(date, m); t += r ? r.price / 2 : 0; } return Math.round(t); };

    // állandó (bérelt) időpontok a szezonra
    const regularCust = customers.slice(0, 13);
    const regularSpots = [[2, '07:00'], [4, '07:00'], [1, '08:00'], [3, '08:00'], [1, '20:00'], [2, '21:00'], [3, '21:00'], [4, '21:00'], [5, '19:00'], [5, '20:00'], [6, '08:00'], [7, '17:00'], [7, '18:00']];
    regularSpots.forEach(([day, start], k) => {
      const end = fromMin(toMin(start) + 60);
      const c = [...courts].reverse().find((cc) => !busy(cc.id, day, start, end));
      if (!c) return;
      // a hét napjához tartozó első dátum az árhoz
      let d = SEASON.from; while (dowOf(d) !== day) d = shiftYmd(d, 1);
      series.push({ id: id('r'), type: 'regular', courtId: c.id, day, start, end, from: SEASON.from, to: SEASON.to, title: '', coachId: null, customerId: regularCust[k].id, price: priceOf(d, start, end), skip: [], paid: {} });
    });

    // ---------- bérletek ----------
    const passes = [];
    const payments = [];
    const invoices = [];
    const charges = [];
    const bookings = [];

    const buyerOf = (b) => ({ name: b.name, address: `${b.zip} ${b.city}, ${b.street}`, taxNumber: b.taxNumber || '' });
    function pay({ amount, method, category, payer, refs, at, by = 'admin', note = '', invoice = true, item }) {
      const p = { id: id('pay'), at, amount, method, category, payer, refs, by, note, invoiceId: null };
      payments.push(p);
      if (invoice && amount > 0) {
        const person = payer.kind === 'customer' ? customers.find((c) => c.id === payer.id) : students.find((s) => s.id === payer.id);
        const inv = {
          id: id('inv'), no: '', issuedAt: at.slice(0, 10), fulfilledAt: at.slice(0, 10), dueAt: at.slice(0, 10),
          method, buyer: { ...buyerOf(person.billing), email: person.email },
          items: [{ name: item, qty: 1, unit: 'db', gross: amount, vat: 27 }], total: amount, status: 'issued', paymentId: p.id, stornoOf: null,
        };
        invoices.push(inv); p.invoiceId = inv.id;
      }
      return p;
    }

    customers.slice(13, 29).forEach((c, k) => {
      const prod = k % 3 === 0 ? products[1] : products[0];
      const bought = shiftYmd(today, -5 - Math.floor(rnd() * 70));
      const ps = { id: id('ps'), customerId: c.id, productId: prod.id, name: prod.name, tier: prod.tier, credits: prod.credits, used: 0, boughtAt: bought, validUntil: shiftYmd(bought, prod.validDays), paymentId: null };
      const p = pay({ amount: prod.price, method: chance(0.6) ? 'card' : 'transfer', category: 'pass', payer: { kind: 'customer', id: c.id }, refs: [{ type: 'pass', id: ps.id }], at: iso(bought, '10:00'), by: chance(0.6) ? 'web' : 'admin', item: prod.name });
      ps.paymentId = p.id;
      passes.push(ps);
    });

    // állandó foglalások havi díja (szeptember fizetve, október részben)
    series.filter((s) => s.type === 'regular').forEach((s, k) => {
      [prevMonth, thisMonth].forEach((month) => {
        if (month === thisMonth && k % 3 !== 0) return;
        const { from, to } = monthRange(month);
        const dates = [];
        eachDate(from, to, (d) => { if (seriesOn(s, d, dowOf(d)) && !settings.holidays.includes(d)) dates.push(d); });
        if (month === prevMonth && k === 4) return; // egy tartozás az előző hónapból
        const amount = dates.length * s.price;
        const at = iso(month === prevMonth ? `${prevMonth}-0${2 + (k % 6)}` : today, '09:30');
        if (at.slice(0, 10) > today) return;
        const p = pay({ amount, method: pick(['transfer', 'transfer', 'card', 'pos']), category: 'court', payer: { kind: 'customer', id: s.customerId }, refs: [{ type: 'series', id: s.id, month }], at, item: `Állandó pályabérlés – ${month.replace('-', '. ')}. (${dates.length} alkalom)` });
        dates.forEach((d) => { s.paid[d] = p.id; });
      });
    });

    // ---------- egyszeri foglalások (≈5 hét vissza, 2 hét előre) ----------
    const occ = {}; // `${date}|${court}` → [[a,b]]
    const isTaken = (date, courtId, a, b) => {
      const dow = dowOf(date);
      if (series.some((s) => s.courtId === courtId && seriesOn(s, date, dow) && overlap(a, b, toMin(s.start), toMin(s.end)))) return true;
      return (occ[`${date}|${courtId}`] || []).some(([x, y]) => overlap(a, b, x, y));
    };
    const take = (date, courtId, a, b) => { (occ[`${date}|${courtId}`] = occ[`${date}|${courtId}`] || []).push([a, b]); };

    // egyszeri lezárások: karbantartás és verseny
    const blk = (date, courtId, start, end, title) => {
      bookings.push({ id: id('b'), type: 'block', courtId, date, start, end, title, customerId: null, coachId: null, price: 0, status: 'confirmed', source: 'admin', createdAt: iso(shiftYmd(today, -10), '08:00'), paymentId: null, passId: null, payMethod: '', note: '' });
      take(date, courtId, toMin(start), toMin(end));
    };
    let sat = shiftYmd(today, 8); while (dowOf(sat) !== 6) sat = shiftYmd(sat, 1);
    courts.forEach((c) => { blk(sat, c.id, '13:00', '20:00', 'Volvex Kupa – felnőtt páros verseny'); });
    blk(shiftYmd(today, 5), 'p4', '07:00', '10:00', 'Pályakarbantartás');
    blk(shiftYmd(today, -12), 'p2', '07:00', '09:00', 'Pályakarbantartás');

    const passOf = (custId, date, a, b) => passes.find((ps) => ps.customerId === custId && ps.boughtAt <= date && date <= ps.validUntil && ps.used + (b - a) / 60 <= ps.credits
      && (!ps.tier || (() => { for (let m = a; m < b; m += 30) { const r = ruleAt(date, m); if (!r || r.tier !== ps.tier) return false; } return true; })()));

    const casual = customers.slice(13);
    for (let back = -35; back <= 14; back++) {
      const date = shiftYmd(today, back);
      if (settings.holidays.includes(date)) continue;
      const dow = dowOf(date);
      const weekend = dow >= 6;
      const fade = back > 0 ? Math.max(0.15, 1 - back / 16) : 1;
      for (let h = 7; h < 22; h++) {
        let p;
        if (weekend) p = h < 8 ? 0.15 : h < 13 ? 0.62 : h < 18 ? 0.45 : 0.3;
        else p = h < 9 ? 0.42 : h < 12 ? 0.22 : h < 16 ? 0.18 : h < 20 ? 0.72 : 0.62;
        courts.forEach((c) => {
          if (!chance(p * fade)) return;
          const a = h * 60;
          let b = a + 60;
          if (isTaken(date, c.id, a, b)) return;
          if (chance(0.18) && h < 21 && !isTaken(date, c.id, b, b + 60)) b += 60;
          const cust = pick(casual);
          const start = fromMin(a); const end = fromMin(b);
          const price = priceOf(date, start, end);
          const createdDate = shiftYmd(date, -Math.floor(rnd() * 9));
          const createdAt = iso(createdDate > today ? today : createdDate, `${pad(8 + Math.floor(rnd() * 13))}:${pad(Math.floor(rnd() * 60))}`);
          const bk = { id: id('b'), type: 'single', courtId: c.id, date, start, end, title: '', customerId: cust.id, coachId: null, price, status: 'confirmed', source: chance(0.8) ? 'web' : 'admin', createdAt, paymentId: null, passId: null, payMethod: '', note: '' };
          const ps = chance(0.55) ? passOf(cust.id, date, a, b) : null;
          const r = rnd();
          if (ps) {
            ps.used += (b - a) / 60; bk.passId = ps.id; bk.payMethod = 'pass';
          } else if (r < 0.68) {
            bk.payMethod = 'card'; bk.source = 'web';
            const pmt = pay({ amount: price, method: 'card', category: 'court', payer: { kind: 'customer', id: cust.id }, refs: [{ type: 'booking', id: bk.id }], at: createdAt, by: 'web', item: `Pályabérlés – ${c.name}, ${date} ${start}–${end}` });
            bk.paymentId = pmt.id;
          } else {
            bk.payMethod = 'onsite';
            const played = date < today || (date === today && b <= nm);
            if (played && chance(0.88)) {
              const pmt = pay({ amount: price, method: pick(['pos', 'pos', 'cash', 'szep']), category: 'court', payer: { kind: 'customer', id: cust.id }, refs: [{ type: 'booking', id: bk.id }], at: iso(date, end), item: `Pályabérlés – ${c.name}, ${date} ${start}–${end}` });
              bk.paymentId = pmt.id;
            }
          }
          // néhány lemondott foglalás (visszatérítéssel)
          if (chance(0.035) && back > -30) {
            bk.status = 'cancelled'; bk.cancelledAt = createdAt; bk.cancelledBy = 'customer';
            if (bk.passId) { const pp = passes.find((x) => x.id === bk.passId); pp.used -= (b - a) / 60; }
            if (bk.paymentId) {
              const orig = payments.find((x) => x.id === bk.paymentId);
              const ref = pay({ amount: -orig.amount, method: orig.method, category: 'refund', payer: orig.payer, refs: orig.refs, at: createdAt, by: 'web', invoice: false });
              ref.refOf = orig.id;
              const inv = invoices.find((x) => x.id === orig.invoiceId);
              if (inv) {
                inv.status = 'stornoed';
                const st = { ...clone(inv), id: id('inv'), status: 'storno', stornoOf: inv.id, total: -inv.total, items: inv.items.map((it) => ({ ...it, gross: -it.gross })), paymentId: ref.id };
                invoices.push(st); ref.invoiceId = st.id;
              }
            }
          } else take(date, c.id, a, b);
          bookings.push(bk);
        });
      }
    }

    // ---------- tandíjak: előző hónap (nagyrészt fizetve), aktuális hónap (frissen kiírva) ----------
    [prevMonth, thisMonth].forEach((month) => {
      students.forEach((s) => {
        const prog = programs.find((p) => p.id === s.programId);
        const amount = Math.round(prog.fee * (1 - (s.discount || 0) / 100));
        const ch = { id: id('ch'), studentId: s.id, month, programId: prog.id, name: `${prog.name} – tandíj`, amount, due: `${month}-10`, status: 'open', paymentId: null, createdAt: iso(`${month}-01`, '08:00') };
        charges.push(ch);
        const paid = month === prevMonth ? chance(0.9) : chance(0.18);
        if (paid) {
          let d = `${month}-${pad(1 + Math.floor(rnd() * (month === prevMonth ? 14 : 1)))}`;
          if (d > today) d = today;
          const p = pay({ amount, method: pick(['transfer', 'transfer', 'card', 'cash', 'szep']), category: 'tuition', payer: { kind: 'student', id: s.id }, refs: [{ type: 'charge', id: ch.id }], at: iso(d, '11:00'), item: `${prog.name} tandíj – ${month.replace('-', '. ')}.` });
          ch.status = 'paid'; ch.paymentId = p.id;
        }
      });
    });

    // ---------- egyéb eladások (labda-, ütőbérlés) ----------
    for (let back = 30; back >= 0; back--) {
      const date = shiftYmd(today, -back);
      if (!chance(0.45)) continue;
      const prod = chance(0.6) ? products[3] : products[4];
      const cust = pick(casual);
      pay({ amount: prod.price, method: chance(0.5) ? 'cash' : 'pos', category: 'other', payer: { kind: 'customer', id: cust.id }, refs: [], at: iso(date, '18:30'), item: prod.name });
    }

    // ---------- jelenlét: az előző hónap elejétől máig ----------
    // Csoportonként és alkalmanként: ki tartotta (edző), ki volt jelen.
    // Akit nem pipáltak be, az hiányzó → automatikusan pótlásra vár.
    const sessions = {}; const resolved = {};
    const owedQueue = [];
    let skipCounter = 0;
    eachDate(`${prevMonth}-01`, today, (date) => {
      if (settings.holidays.includes(date)) return;
      const dow = dowOf(date);
      const dayGroups = trainings.filter((t) => t.days.includes(dow)).sort((a, b) => toMin(a.start) - toMin(b.start));
      const held = {}; // kezdés → az adott idősávban már edzést tartó edzők
      dayGroups.forEach((t) => {
        if (date === today) {
          if (toMin(t.end) > nm - 90) return; // a legutóbb véget ért edzések még kitöltendők
        } else if (++skipCounter % 41 === 0) return; // néha kimarad a rögzítés
        // néha helyettesítő edző tartja a csoportot
        let coachId = t.coachIds[0];
        if (rnd() < 0.06) {
          const taken = new Set([...dayGroups.filter((x) => x.start === t.start).map((x) => x.coachIds[0]), ...(held[t.start] || [])]);
          const free = coaches.filter((c) => !taken.has(c.id));
          if (free.length) coachId = pick(free).id;
        }
        (held[t.start] = held[t.start] || []).push(coachId);
        const marks = {};
        t.studentIds.forEach((sid) => {
          const absent = rnd() < 0.075;
          marks[sid] = absent ? 'absent' : 'present';
          if (absent) owedQueue.push({ sid, date });
        });
        const makeups = [];
        for (let k = 0; k < 2; k++) {
          if (rnd() > (k ? 0.15 : 0.36)) break;
          const i = owedQueue.findIndex((o) => o.date < date && !t.studentIds.includes(o.sid) && !makeups.includes(o.sid));
          if (i >= 0) { makeups.push(owedQueue[i].sid); owedQueue.splice(i, 1); }
        }
        sessions[sessionKey(t.id, date)] = {
          trainingId: t.id, date, start: t.start, end: t.end, name: t.name,
          coachId, by: coachId, at: iso(date, fromMin(toMin(t.end) + 4)), marks, makeups,
        };
      });
    });
    Object.values(sessions).forEach((s) => {
      if (s.date >= shiftYmd(today, -14)) return;
      Object.entries(s.marks).forEach(([sid, m]) => { if (m === 'absent' && rnd() < 0.25) resolved[absenceKey(s.trainingId, s.date, sid)] = { at: s.at }; });
    });

    // számlaszámok kiosztása időrendben
    invoices.sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : a.issuedAt > b.issuedAt ? 1 : 0));
    invoices.forEach((inv) => {
      const y = inv.issuedAt.slice(0, 4);
      settings.invoice.seq[y] = (settings.invoice.seq[y] || 0) + 1;
      inv.no = `${settings.invoice.prefix}-${y}-${String(settings.invoice.seq[y]).padStart(5, '0')}`;
      const due = inv.method === 'transfer' ? shiftYmd(inv.issuedAt, settings.invoice.dueDays) : inv.issuedAt;
      inv.dueAt = due;
    });
    payments.sort((a, b) => (a.at < b.at ? -1 : 1));

    return {
      version: 1,
      demo: true,
      seededAt: today,
      settings, courts, priceRules, products, programs,
      customers, bookings, series, passes, payments, invoices, charges,
      coaches, students, trainings, sessions, resolved,
    };
  }

  // ======================================================================
  // ÁLLAPOT
  // ======================================================================
  let state;
  let rev = 0;
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { state = JSON.parse(raw); migrate(); return; }
    } catch (e) { /* sérült vagy nem elérhető tároló */ }
    state = buildDemo();
    persist();
  }
  // régebbi mentésekből: idősáv-beállítás, csoportnév és napok tömb
  function migrate() {
    if (!state.settings.trainingSlots) state.settings.trainingSlots = defaultTrainingSlots();
    (state.trainings || []).forEach((t) => {
      if (!Array.isArray(t.days)) { t.days = t.day ? [t.day] : []; delete t.day; }
      if (t.name == null) { t.name = t.label || ''; delete t.label; }
    });
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Mentés sikertelen', e); }
  }
  function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
  function commit() {
    rev++;
    statsCache = null;
    persist();
    notify();
    schedulePush();
  }
  // másik fülön történt módosítás (pl. weboldalon foglaltak, közben nyitva az admin)
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { state = JSON.parse(e.newValue); migrate(); rev++; statsCache = null; notify(); } catch (err) { /* */ }
  });

  // ======================================================================
  // KÖZÖS ADATTÁR – ha az oldal claude.ai artifactként fut, az adatok egy
  // közös adatbázisba kerülnek, így amit bárki módosít, mindenkinél megjelenik.
  // Az állapotot kulcsonként (nagy listáknál azonosító szerinti vödrökben)
  // tároljuk, hogy egy módosítás csak a kis érintett részt írja felül.
  // Belépések (edző, admin, ügyfél) eszközönként maradnak.
  // ======================================================================
  // Supabase (GitHub Pages-en futó példányhoz): a projekt URL-je és a publikus „anon” kulcsa.
  // Üresen hagyva csak helyben (vagy claude.ai-on az ottani közös tárban) működik.
  const SUPABASE = { url: '', key: '', table: 'vx_docs' };
  const BUCKET = 50000; // ~ennyi karakter fér egy vödörbe (a dokumentum-korlát 256 KiB)
  const SYNC = { be: null, layout: null, last: new Map(), remote: new Map(), timer: null, busy: false, again: false, ro: false, warned: false };
  const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const toastSafe = (msg) => { try { window.UI && window.UI.toast(msg); } catch (e) { /* */ } };

  function makeLayout(st) {
    const L = {};
    Object.entries(st).forEach(([k, v]) => {
      const kind = Array.isArray(v) ? 'array' : v && typeof v === 'object' ? 'map' : 'value';
      const size = JSON.stringify(v).length;
      L[k] = kind !== 'value' && size > BUCKET ? { kind, n: Math.ceil(size / BUCKET) + 1 } : { kind: 'value' };
    });
    return L;
  }
  const docIds = (k, spec) => (spec.kind === 'value' ? [`v~${k}`] : Array.from({ length: spec.n }, (_, i) => `b~${k}~${i}`));
  function docsOfKey(k, spec, v) {
    if (spec.kind === 'value') return [[`v~${k}`, { v: v === undefined ? null : v }]];
    const parts = Array.from({ length: spec.n }, () => (spec.kind === 'array' ? [] : {}));
    if (spec.kind === 'array') (v || []).forEach((it) => parts[fnv(String(it && it.id != null ? it.id : JSON.stringify(it))) % spec.n].push(it));
    else Object.entries(v || {}).forEach(([kk, vv]) => { parts[fnv(kk) % spec.n][kk] = vv; });
    return parts.map((p, i) => [`b~${k}~${i}`, spec.kind === 'array' ? { items: p } : { map: p }]);
  }
  function assembleKey(spec, bodies) {
    if (spec.kind === 'value') return bodies[0] ? bodies[0].v : null;
    if (spec.kind === 'array') return bodies.flatMap((b) => (b && b.items) || []);
    return Object.assign({}, ...bodies.map((b) => (b && b.map) || {}));
  }
  // az állapot új kulcsai (pl. egy későbbi verzióból) egyszerű értékként kerülnek a közös tárba
  function ensureLayout() {
    let added = false;
    Object.keys(state).forEach((k) => { if (!SYNC.layout[k]) { SYNC.layout[k] = { kind: 'value' }; added = true; } });
    return added;
  }

  // teljes betöltés a közös tárból (első csatlakozáskor)
  function adoptRemote(docs) {
    const meta = docs.get('meta');
    if (!meta || !meta.layout) return false;
    SYNC.layout = JSON.parse(JSON.stringify(meta.layout));
    docs.forEach((body, id) => { SYNC.remote.set(id, body); SYNC.last.set(id, JSON.stringify(body)); });
    const next = {};
    Object.entries(SYNC.layout).forEach(([k, spec]) => { next[k] = assembleKey(spec, docIds(k, spec).map((id) => docs.get(id))); });
    state = next; migrate(); rev++; statsCache = null; persist(); notify();
    return true;
  }

  // mások módosításai: csak az érintett kulcsokat építjük újra; a még fel nem töltött saját vödrök maradnak
  function applyChanges(changed) {
    if (!changed.length) return;
    if (changed.some(([id]) => id === 'meta')) {
      const meta = changed.find(([id]) => id === 'meta')[1];
      if (meta && meta.layout) SYNC.layout = { ...SYNC.layout, ...JSON.parse(JSON.stringify(meta.layout)) };
    }
    const changedIds = new Set(changed.map(([id]) => id));
    changed.forEach(([id, body]) => SYNC.remote.set(id, body));
    const keys = new Set(changed.filter(([id]) => id !== 'meta').map(([id]) => id.split('~')[1]));
    if (!keys.size) return;
    keys.forEach((k) => {
      const spec = SYNC.layout[k]; if (!spec) return;
      const local = new Map(docsOfKey(k, spec, state[k]));
      const bodies = docIds(k, spec).map((id) => {
        const loc = local.get(id);
        const dirty = JSON.stringify(loc) !== SYNC.last.get(id);
        if (dirty && !changedIds.has(id)) return loc;
        const rem = SYNC.remote.get(id);
        if (rem) { SYNC.last.set(id, JSON.stringify(rem)); return rem; }
        return loc;
      });
      state[k] = assembleKey(spec, bodies);
    });
    migrate(); rev++; statsCache = null; persist(); notify();
  }

  function schedulePush() {
    if (!SYNC.be || SYNC.ro) return;
    clearTimeout(SYNC.timer);
    SYNC.timer = setTimeout(push, 250);
  }
  async function push() {
    SYNC.timer = null;
    if (!SYNC.be || SYNC.ro) return;
    if (SYNC.busy) { SYNC.again = true; return; }
    SYNC.busy = true;
    try {
      do {
        SYNC.again = false;
        if (ensureLayout()) await SYNC.be.set('meta', { layout: SYNC.layout, at: nowIso() });
        for (const [k, spec] of Object.entries(SYNC.layout)) {
          for (const [id, body] of docsOfKey(k, spec, state[k])) {
            const s = JSON.stringify(body);
            if (s === SYNC.last.get(id)) continue;
            if (s.length > 250000) { if (!SYNC.warned) { SYNC.warned = true; toastSafe('A közös tár egyik része megtelt – a módosítás csak ebben a böngészőben látszik.'); } continue; }
            await SYNC.be.set(id, body);
            SYNC.last.set(id, s); SYNC.remote.set(id, body);
          }
        }
      } while (SYNC.again);
    } catch (e) {
      if (e && e.code === 'invalid_argument') { SYNC.ro = true; toastSafe('Csak megtekintési jogod van – a módosításaid nem mentődnek a közös adatokba.'); } else if (e && e.code === 'quota_exceeded') toastSafe('A közös tár megtelt – a módosítás nem mentődött.');
      else if (e && e.code === 'unavailable') setTimeout(schedulePush, 1500 + Math.random() * 1500);
      else console.warn('Közös mentés sikertelen', e);
    } finally { SYNC.busy = false; }
  }

  async function seedRemote() {
    SYNC.layout = makeLayout(state);
    for (const [k, spec] of Object.entries(SYNC.layout)) {
      for (const [id, body] of docsOfKey(k, spec, state[k])) {
        await SYNC.be.set(id, body);
        SYNC.last.set(id, JSON.stringify(body)); SYNC.remote.set(id, body);
      }
    }
    // a meta kerül fel utoljára: a többiek csak ekkortól tekintik késznek
    await SYNC.be.set('meta', { layout: SYNC.layout, at: nowIso() });
  }

  // ---------- háttértárak: claude.ai artifact-adatbázis vagy Supabase ----------
  // Mindkettő ugyanazt tudja: összes dokumentum lekérése, egy dokumentum írása,
  // mások változásainak figyelése, és a kezdő feltöltés zárolása.
  async function claudeBackend() {
    let c = null;
    try { c = window.claude && window.claude.use ? window.claude : null; } catch (e) { /* */ }
    if (!c) { try { if (window.parent !== window && window.parent.claude && window.parent.claude.use) c = window.parent.claude; } catch (e) { /* más eredetű keret */ } }
    if (!c) return null;
    let db = null;
    try { db = await c.use('db'); } catch (e) { db = null; }
    if (!db) return null;
    const coll = db.collection('vx');
    return {
      async getAll() { const snap = await coll.get(); return new Map(snap.docs.map((d) => [d.id, d.data()])); },
      set: (id, body) => coll.doc(id).set(body),
      subscribe(cb) {
        coll.onSnapshot((snap) => cb(snap.docChanges().filter((ch) => ch.type !== 'removed').map((ch) => [ch.doc.id, ch.doc.data()])),
          (err) => console.warn('Közös adatok figyelése leállt', err));
      },
      async lockSeed() { return (await db.doc('lock/seed').acquire({ holder: uid('h'), ttlMs: 120000 })).acquired; },
    };
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = rej; document.head.appendChild(el); });
  }
  async function supabaseBackend() {
    if (!SUPABASE.url || !SUPABASE.key || typeof document === 'undefined') return null;
    if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
    const sb = window.supabase.createClient(SUPABASE.url, SUPABASE.key, { auth: { persistSession: false } });
    const T_ = SUPABASE.table;
    const LOCK = 'lock:seed';
    const fail = (r) => { if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code === '42501' ? 'invalid_argument' : 'unavailable' }); return r; };
    let seen = new Map(); // id → updated_at (a tartalék lekérdezéshez)
    const fetchIds = async (ids) => {
      const r = fail(await sb.from(T_).select('id, body, updated_at').in('id', ids));
      r.data.forEach((row) => seen.set(row.id, row.updated_at));
      return r.data.filter((row) => row.id !== LOCK).map((row) => [row.id, row.body]);
    };
    return {
      async getAll() {
        const r = fail(await sb.from(T_).select('id, body, updated_at').neq('id', LOCK).limit(1000));
        r.data.forEach((row) => seen.set(row.id, row.updated_at));
        return new Map(r.data.map((row) => [row.id, row.body]));
      },
      async set(id, body) {
        const at = new Date().toISOString();
        fail(await sb.from(T_).upsert({ id, body, updated_at: at }));
        seen.set(id, at);
      },
      subscribe(cb) {
        // élő értesítés: csak az azonosítót használjuk, a tartalmat újra lekérjük (nagy sorok is épen jönnek)
        sb.channel('vx-docs')
          .on('postgres_changes', { event: '*', schema: 'public', table: T_ }, (p) => {
            const id = (p.new && p.new.id) || (p.old && p.old.id);
            if (id && id !== LOCK) fetchIds([id]).then(cb).catch(() => {});
          })
          .subscribe();
        // tartalék: 20 másodpercenként megnézzük, változott-e valami (ha az élő kapcsolat megszakad)
        setInterval(async () => {
          try {
            const r = await sb.from(T_).select('id, updated_at').neq('id', LOCK);
            if (r.error) return;
            const ids = r.data.filter((row) => seen.get(row.id) !== row.updated_at).map((row) => row.id);
            if (ids.length) cb(await fetchIds(ids));
          } catch (e) { /* */ }
        }, 20000);
      },
      async lockSeed() {
        const r = await sb.from(T_).insert({ id: LOCK, body: { at: nowIso() }, updated_at: nowIso() });
        if (!r.error) return true;
        // beragadt zár (pl. félbeszakadt feltöltés): 3 perc után átvehető
        const cur = await sb.from(T_).select('body').eq('id', LOCK).maybeSingle();
        const at = cur.data && cur.data.body && cur.data.body.at;
        if (at && Date.now() - new Date(at).getTime() > 180000) {
          await sb.from(T_).update({ body: { at: nowIso() }, updated_at: nowIso() }).eq('id', LOCK);
          return true;
        }
        return false;
      },
    };
  }

  async function connect() {
    let be = null;
    try { be = (await claudeBackend()) || (await supabaseBackend()); } catch (e) { console.warn('A közös adattár nem érhető el – helyi mód', e); }
    if (!be) return;
    try {
      let docs = await be.getAll();
      if (!docs.has('meta') && await be.lockSeed()) {
        docs = await be.getAll();
        if (!docs.has('meta')) { SYNC.be = be; SYNC.busy = true; try { await seedRemote(); } finally { SYNC.busy = false; } }
      }
      if (!SYNC.layout && docs.has('meta')) adoptRemote(docs);
      be.subscribe((pairs) => {
        if (!SYNC.layout) {
          // valaki más épp feltölti a kezdő adatokat – megvárjuk, amíg kész
          pairs.forEach(([id, body]) => SYNC.remote.set(id, body));
          if (SYNC.remote.has('meta') && adoptRemote(new Map(SYNC.remote))) { SYNC.be = be; notify(); }
          return;
        }
        applyChanges(pairs.filter(([id, body]) => JSON.stringify(body) !== (id === 'meta' ? '' : SYNC.last.get(id))));
      });
      if (SYNC.layout) { SYNC.be = be; notify(); schedulePush(); }
      else if (!SYNC.remote.size) docs.forEach((b, id) => SYNC.remote.set(id, b));
    } catch (e) {
      console.warn('A közös adattár nem érhető el – helyi mód', e);
    }
  }

  const byId = (arr, id) => arr.find((x) => x.id === id);
  const byName = (a, b) => a.name.localeCompare(b.name, 'hu');
  const byStart = (a, b) => toMin(a.start) - toMin(b.start);

  // ======================================================================
  // NAPTÁR / FOGLALTSÁG
  // ======================================================================
  const settings = () => state.settings;
  const isClosed = (date) => state.settings.holidays.includes(date);
  const activeCourts = () => state.courts.filter((c) => c.active !== false).sort((a, b) => a.no - b.no);

  function seriesActive(s, date, dow = dowOf(date)) {
    return s.day === dow && s.from <= date && (!s.to || date <= s.to) && !(s.skip || []).includes(date);
  }
  function bookingItem(b) {
    return {
      key: `b:${b.id}`, src: 'booking', id: b.id, seriesId: null, courtId: b.courtId, date: b.date, start: b.start, end: b.end,
      type: b.type, title: b.title, customerId: b.customerId, coachId: b.coachId, price: b.price,
      payMethod: b.payMethod, paymentId: b.paymentId, passId: b.passId,
      paid: b.price === 0 || !!b.paymentId || !!b.passId, status: b.status, source: b.source, note: b.note || '',
    };
  }
  function seriesItem(s, date) {
    const pid = (s.paid || {})[date] || null;
    return {
      key: `s:${s.id}:${date}`, src: 'series', id: s.id, seriesId: s.id, courtId: s.courtId, date, start: s.start, end: s.end,
      type: s.type, title: s.title, customerId: s.customerId, coachId: s.coachId, price: s.type === 'regular' ? s.price : 0,
      payMethod: '', paymentId: pid, passId: null, paid: s.type !== 'regular' || !!pid, status: 'confirmed', source: 'admin', note: s.note || '',
    };
  }

  let occCache = { rev: -1, map: new Map() };
  function itemsOn(date) {
    if (occCache.rev !== rev) occCache = { rev, map: new Map() };
    let r = occCache.map.get(date);
    if (r) return r;
    const dow = dowOf(date);
    r = [];
    state.bookings.forEach((b) => { if (b.date === date && b.status !== 'cancelled') r.push(bookingItem(b)); });
    if (!isClosed(date)) state.series.forEach((s) => { if (seriesActive(s, date, dow)) r.push(seriesItem(s, date)); });
    r.sort((a, b) => byStart(a, b) || a.courtId.localeCompare(b.courtId));
    occCache.map.set(date, r);
    return r;
  }
  function itemByKey(key) {
    const [src, id, date] = key.split(':');
    if (src === 'b') { const b = byId(state.bookings, id); return b ? bookingItem(b) : null; }
    const s = byId(state.series, id); return s && date ? seriesItem(s, date) : null;
  }
  function conflictsAt(courtId, date, start, end, ignoreKey) {
    const a = toMin(start); const b = toMin(end);
    return itemsOn(date).filter((it) => it.courtId === courtId && it.key !== ignoreKey
      && !(ignoreKey && ignoreKey.startsWith('s:') && it.seriesId === ignoreKey.split(':')[1])
      && overlap(a, b, toMin(it.start), toMin(it.end)));
  }
  const isFree = (courtId, date, start, end, ignoreKey) => !conflictsAt(courtId, date, start, end, ignoreKey).length;

  // ---------- árazás ----------
  function ruleAt(date, min) {
    const dow = dowOf(date);
    return state.priceRules.find((r) => r.days.includes(dow) && toMin(r.from) <= min && min < toMin(r.to)) || null;
  }
  function priceFor(date, start, end) {
    let t = 0;
    for (let m = toMin(start); m < toMin(end); m += 30) { const r = ruleAt(date, m); t += r ? r.price / 2 : 0; }
    return Math.round(t);
  }

  // ---------- nyilvános idősáv-rács ----------
  function slotGrid(date, { lead = true } = {}) {
    const s = state.settings; const step = s.booking.slotMin;
    const open = toMin(s.open); const close = toMin(s.close);
    const today = todayYmd(); const nmin = nowMin() + (lead ? s.booking.leadMin : 0);
    const tooFar = daysBetween(today, date) > s.booking.maxDaysAhead;
    const items = itemsOn(date);
    const closed = isClosed(date);
    return activeCourts().map((court) => {
      const cells = [];
      for (let m = open; m + step <= close; m += step) {
        const start = fromMin(m); const end = fromMin(m + step);
        let st = 'free';
        if (closed) st = 'closed';
        else if (date < today || (date === today && m < nmin)) st = 'past';
        else if (items.some((it) => it.courtId === court.id && overlap(m, m + step, toMin(it.start), toMin(it.end)))) st = 'busy';
        else if (tooFar) st = 'closed';
        const rule = ruleAt(date, m);
        cells.push({ start, end, state: st, price: priceFor(date, start, end), tier: rule ? rule.tier : '' });
      }
      return { court, cells };
    });
  }
  function freeCount(date, { from } = {}) {
    let n = 0;
    slotGrid(date).forEach((row) => row.cells.forEach((c) => { if (c.state === 'free' && (!from || c.start >= from)) n++; }));
    return n;
  }

  // ======================================================================
  // FIZETÉSEK ÉS SZÁMLÁK
  // ======================================================================
  function nextInvoiceNo(date) {
    const inv = state.settings.invoice;
    const y = date.slice(0, 4);
    inv.seq[y] = (inv.seq[y] || 0) + 1;
    return `${inv.prefix}-${y}-${String(inv.seq[y]).padStart(5, '0')}`;
  }
  function buyerFor(payer) {
    if (!payer) return { name: 'Magánszemély', address: '', taxNumber: '', email: '' };
    const p = payer.kind === 'customer' ? byId(state.customers, payer.id) : byId(state.students, payer.id);
    if (!p) return { name: 'Magánszemély', address: '', taxNumber: '', email: '' };
    const b = p.billing || {};
    const addr = [b.zip && b.city ? `${b.zip} ${b.city}` : b.city, b.street].filter(Boolean).join(', ');
    return { name: b.name || p.name, address: addr, taxNumber: b.taxNumber || '', email: p.email || '' };
  }
  function issueInvoice({ buyer, items, method, paymentId = null, date = todayYmd() }) {
    const total = items.reduce((s, it) => s + it.gross * (it.qty || 1), 0);
    const inv = {
      id: uid('inv'), no: nextInvoiceNo(date), issuedAt: date, fulfilledAt: date,
      dueAt: method === 'transfer' ? shiftYmd(date, state.settings.invoice.dueDays) : date,
      method, buyer, items: items.map((it) => ({ qty: 1, unit: 'db', vat: state.settings.invoice.vat, ...it })),
      total, status: 'issued', paymentId, stornoOf: null,
    };
    state.invoices.push(inv);
    return inv;
  }
  function addPayment({ amount, method, category, payer = null, refs = [], by = 'admin', note = '', invoice = true, itemName = '', at = nowIso() }) {
    const p = { id: uid('pay'), at, amount, method, category, payer, refs, by, note, invoiceId: null };
    state.payments.push(p);
    if (invoice && amount > 0) {
      const inv = issueInvoice({ buyer: buyerFor(payer), items: [{ name: itemName || CATEGORIES[category], qty: 1, unit: 'db', gross: amount }], method, paymentId: p.id, date: at.slice(0, 10) });
      p.invoiceId = inv.id;
    }
    return p;
  }
  function stornoInvoiceInternal(invId, paymentId = null) {
    const inv = byId(state.invoices, invId);
    if (!inv || inv.status !== 'issued') return null;
    inv.status = 'stornoed';
    const date = todayYmd();
    const st = {
      ...clone(inv), id: uid('inv'), no: nextInvoiceNo(date), issuedAt: date, fulfilledAt: inv.fulfilledAt, dueAt: date,
      status: 'storno', stornoOf: inv.id, total: -inv.total, items: inv.items.map((it) => ({ ...it, gross: -it.gross })), paymentId,
    };
    state.invoices.push(st);
    return st;
  }
  function refundPaymentInternal(paymentId, { note = '', amount } = {}) {
    const p = byId(state.payments, paymentId);
    if (!p || p.amount <= 0 || p.refundedBy) return null;
    const r = { id: uid('pay'), at: nowIso(), amount: -(amount || p.amount), method: p.method, category: 'refund', payer: p.payer, refs: p.refs, by: 'admin', note, invoiceId: null, refOf: p.id };
    state.payments.push(r);
    p.refundedBy = r.id;
    if (p.invoiceId) { const st = stornoInvoiceInternal(p.invoiceId, r.id); if (st) r.invoiceId = st.id; }
    return r;
  }

  // ======================================================================
  // BÉRLETEK
  // ======================================================================
  function passFits(ps, date, start, end) {
    const a = toMin(start); const b = toMin(end);
    if (!(ps.boughtAt <= date && date <= ps.validUntil)) return false;
    if (ps.used + (b - a) / 60 > ps.credits) return false;
    if (!ps.tier) return true;
    for (let m = a; m < b; m += 30) { const r = ruleAt(date, m); if (!r || r.tier !== ps.tier) return false; }
    return true;
  }
  const passesOf = (customerId) => state.passes.filter((p) => p.customerId === customerId).sort((a, b) => (a.boughtAt < b.boughtAt ? 1 : -1));
  const usablePass = (customerId, date, start, end) => passesOf(customerId).find((p) => passFits(p, date, start, end)) || null;

  // ======================================================================
  // EDZÉSEK / JELENLÉT segédek
  // ======================================================================
  // Egy csoport = adott idősávban (kezdés–vége) edző társaság, egy vagy több napon (pl. hétfő + szerda).
  const daysOf = (t) => (Array.isArray(t.days) ? t.days : t.day ? [t.day] : []);
  const groupName = (t) => (t && (t.name || t.label)) || 'Csoport';
  const byGroupName = (a, b) => groupName(a).localeCompare(groupName(b), 'hu', { numeric: true });
  function trainingsOn(date, coachId) {
    if (isClosed(date)) return [];
    const dow = dowOf(date);
    return state.trainings
      .filter((t) => daysOf(t).includes(dow) && (!coachId || (t.coachIds || []).includes(coachId)))
      .sort((a, b) => byStart(a, b) || toMin(a.end) - toMin(b.end) || byGroupName(a, b));
  }
  const slotsOfDow = (dow) => ((state.settings.trainingSlots || {})[dow] || []).map((x) => ({ start: x.start, end: x.end }));
  /** A nap idősávjai a csoportjaikkal (a beállított idősávok + ha egy csoport más időben van, az is). */
  function slotsOn(date) {
    if (isClosed(date)) return [];
    const map = new Map();
    slotsOfDow(dowOf(date)).forEach((x) => map.set(`${x.start}-${x.end}`, { ...x, groups: [] }));
    trainingsOn(date).forEach((t) => {
      const k = `${t.start}-${t.end}`;
      if (!map.has(k)) map.set(k, { start: t.start, end: t.end, groups: [], extra: true });
      map.get(k).groups.push(t);
    });
    return [...map.values()].sort((a, b) => byStart(a, b) || toMin(a.end) - toMin(b.end));
  }
  function isPast(date, t) {
    const today = todayYmd();
    if (date < today) return true;
    if (date > today) return false;
    return nowMin() >= toMin(t.start);
  }
  function rosterFor(trainingId, date) {
    const t = byId(state.trainings, trainingId);
    const s = state.sessions[sessionKey(trainingId, date)];
    const ids = s ? Object.keys(s.marks) : [];
    (t ? t.studentIds : []).forEach((sid) => { const st = byId(state.students, sid); if (!ids.includes(sid) && st && st.active !== false) ids.push(sid); });
    return ids.filter((sid) => byId(state.students, sid));
  }

  // ki tartotta az edzést: a jelenlétnél kiválasztott edző (régi rögzítésnél a rögzítő)
  const sessionCoach = (s) => (s && (s.coachId || (s.by && s.by !== 'admin' ? s.by : null))) || null;

  let statsCache = null;
  function allStats() {
    if (statsCache) return statsCache;
    const map = {};
    state.students.forEach((s) => { map[s.id] = { present: 0, absent: 0, makeups: 0, resolved: 0, absences: [], makeupList: [] }; });
    const sessions = Object.values(state.sessions).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    sessions.forEach((s) => {
      Object.entries(s.marks).forEach(([sid, m]) => {
        const st = map[sid]; if (!st) return;
        if (m === 'present') st.present++;
        else if (m === 'absent') {
          st.absent++;
          const key = absenceKey(s.trainingId, s.date, sid);
          const r = !!state.resolved[key];
          if (r) st.resolved++;
          st.absences.push({ key, trainingId: s.trainingId, date: s.date, start: s.start, name: s.name, manual: r });
        }
      });
      (s.makeups || []).forEach((sid) => {
        const st = map[sid]; if (!st) return;
        st.makeups++;
        st.makeupList.push({ trainingId: s.trainingId, date: s.date, start: s.start, name: s.name });
      });
    });
    Object.values(map).forEach((st) => {
      let cover = st.makeups;
      st.absences.forEach((a) => {
        if (a.manual) a.status = 'manual';
        else if (cover > 0) { a.status = 'makeup'; cover--; } else a.status = 'open';
      });
      st.owed = st.absences.filter((a) => a.status === 'open').length;
      const total = st.present + st.absent;
      st.rate = total ? st.present / total : null;
    });
    statsCache = map;
    return map;
  }

  // ======================================================================
  // PUBLIKUS API
  // ======================================================================
  const Store = {
    // segédek
    pad, ymd, parseYmd, isoDow, dowOf, addDays, shiftYmd, todayYmd, toMin, fromMin, nowMin, monthOf, monthRange, shiftMonth,
    daysBetween, overlap, eachDate, sessionKey, absenceKey, norm, weekStart, periodRange,
    COACH_COLORS, PAY_METHODS, BOOKING_TYPES, CATEGORIES,
    get rev() { return rev; },
    get state() { return state; },
    get isDemo() { return !!state.demo; },
    /** Igaz, ha az adatok a közös (claude.ai) tárban vannak – mindenki ugyanazt látja. */
    get isShared() { return !!SYNC.be; },
    get isReadOnly() { return SYNC.ro; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // ---------- belépések (eszközönként megjegyezve) ----------
    staffAuth() { try { return JSON.parse(localStorage.getItem(K_STAFF)); } catch (e) { return null; } },
    setStaffAuth(a) { try { a ? localStorage.setItem(K_STAFF, JSON.stringify(a)) : localStorage.removeItem(K_STAFF); } catch (e) { /* */ } },
    adminAuth() { try { return JSON.parse(localStorage.getItem(K_ADMIN)); } catch (e) { return null; } },
    setAdminAuth(a) { try { a ? localStorage.setItem(K_ADMIN, JSON.stringify(a)) : localStorage.removeItem(K_ADMIN); } catch (e) { /* */ } },
    customerId() { try { const id = localStorage.getItem(K_CUSTOMER); return id && byId(state.customers, id) ? id : null; } catch (e) { return null; } },
    setCustomer(id) { try { id ? localStorage.setItem(K_CUSTOMER, id) : localStorage.removeItem(K_CUSTOMER); } catch (e) { /* */ } notify(); },
    checkCoachPin: (id, pin) => { const c = byId(state.coaches, id); return !!c && c.pin === pin; },
    checkAdminPin: (pin) => pin === state.settings.adminPin,

    // ---------- beállítások, pályák, árak ----------
    settings,
    updateSettings(patch) {
      const deep = (t, p) => Object.entries(p).forEach(([k, v]) => {
        if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') deep(t[k], v); else t[k] = v;
      });
      deep(state.settings, patch); commit();
    },
    isClosed,
    courts: () => [...state.courts].sort((a, b) => a.no - b.no),
    activeCourts,
    court: (id) => byId(state.courts, id),
    upsertCourt(data) {
      if (data.id && byId(state.courts, data.id)) Object.assign(byId(state.courts, data.id), data);
      else { data.id = uid('p'); data.no = data.no || state.courts.length + 1; state.courts.push({ sport: 'tennis', surface: 'hard', indoor: true, active: true, ...data }); }
      commit(); return data.id;
    },
    priceRules: () => state.priceRules,
    upsertPriceRule(data) {
      if (data.id && byId(state.priceRules, data.id)) Object.assign(byId(state.priceRules, data.id), data);
      else { data.id = uid('pr'); state.priceRules.push(data); }
      commit(); return data.id;
    },
    deletePriceRule(id) { state.priceRules = state.priceRules.filter((r) => r.id !== id); commit(); },
    ruleAt, priceFor,
    products: (kind) => state.products.filter((p) => !kind || p.kind === kind),
    product: (id) => byId(state.products, id),
    upsertProduct(data) {
      if (data.id && byId(state.products, data.id)) Object.assign(byId(state.products, data.id), data);
      else { data.id = uid('pk'); state.products.push({ vat: state.settings.invoice.vat, active: true, ...data }); }
      commit(); return data.id;
    },
    deleteProduct(id) { state.products = state.products.filter((p) => p.id !== id); commit(); },
    programs: () => state.programs,
    program: (id) => byId(state.programs, id),
    upsertProgram(data) {
      if (data.id && byId(state.programs, data.id)) Object.assign(byId(state.programs, data.id), data);
      else { data.id = uid('pg'); state.programs.push(data); }
      commit(); return data.id;
    },
    deleteProgram(id) { state.programs = state.programs.filter((p) => p.id !== id); commit(); },

    // ---------- foglaltság ----------
    itemsOn, itemByKey, conflictsAt, isFree, slotGrid, freeCount, seriesActive,

    // ---------- foglalások ----------
    booking: (id) => byId(state.bookings, id),
    bookings({ from, to, customerId, status, type } = {}) {
      return state.bookings.filter((b) => (!from || b.date >= from) && (!to || b.date <= to)
        && (!customerId || b.customerId === customerId) && (!status || b.status === status) && (!type || b.type === type))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byStart(a, b)));
    },
    /** Admin / belső foglalás. Hibát dob, ha ütközik. */
    createBooking(d) {
      if (isClosed(d.date)) throw new Error('Ezen a napon zárva tartunk.');
      if (toMin(d.end) <= toMin(d.start)) throw new Error('A befejezés a kezdés után legyen.');
      if (!isFree(d.courtId, d.date, d.start, d.end)) throw new Error('Ez az időpont ezen a pályán már foglalt.');
      const type = d.type || 'single';
      const b = {
        id: uid('b'), type, courtId: d.courtId, date: d.date, start: d.start, end: d.end, title: d.title || '',
        customerId: d.customerId || null, coachId: d.coachId || null,
        price: type === 'single' ? (d.price != null ? d.price : priceFor(d.date, d.start, d.end)) : 0,
        status: 'confirmed', source: d.source || 'admin', createdAt: nowIso(),
        paymentId: null, passId: null, payMethod: d.payMethod || (type === 'single' ? 'onsite' : ''), note: d.note || '',
      };
      state.bookings.push(b);
      commit();
      return b;
    },
    updateBooking(id, patch) {
      const b = byId(state.bookings, id); if (!b) return;
      const next = { ...b, ...patch };
      if (!isFree(next.courtId, next.date, next.start, next.end, `b:${id}`)) throw new Error('Az új időpont ütközik egy másik foglalással.');
      Object.assign(b, patch);
      commit();
    },
    /** Nyilvános (weboldalas) foglalás fizetéssel. */
    bookOnline({ customerId, courtId, date, start, end, method }) {
      const s = state.settings;
      const cust = byId(state.customers, customerId);
      if (!cust) throw new Error('Jelentkezz be a foglaláshoz.');
      if (isClosed(date)) throw new Error('Ezen a napon zárva tartunk.');
      if (toMin(start) < toMin(s.open) || toMin(end) > toMin(s.close)) throw new Error('Nyitvatartáson kívüli időpont.');
      if (date < todayYmd() || (date === todayYmd() && toMin(start) < nowMin() + s.booking.leadMin)) throw new Error('Ez az időpont már elmúlt.');
      if (daysBetween(todayYmd(), date) > s.booking.maxDaysAhead) throw new Error(`Legfeljebb ${s.booking.maxDaysAhead} nappal előre lehet foglalni.`);
      if (!isFree(courtId, date, start, end)) throw new Error('Sajnos ezt az időpontot közben valaki lefoglalta.');
      if (method === 'onsite' && !s.booking.allowOnsite) throw new Error('Helyszíni fizetés nem választható.');
      const court = byId(state.courts, courtId);
      const price = priceFor(date, start, end);
      const b = {
        id: uid('b'), type: 'single', courtId, date, start, end, title: '', customerId, coachId: null, price,
        status: 'confirmed', source: 'web', createdAt: nowIso(), paymentId: null, passId: null, payMethod: method, note: '',
      };
      let payment = null; let invoice = null;
      if (method === 'pass') {
        const ps = usablePass(customerId, date, start, end);
        if (!ps) throw new Error('Nincs erre az időpontra felhasználható bérleted.');
        ps.used += (toMin(end) - toMin(start)) / 60;
        b.passId = ps.id;
      }
      state.bookings.push(b);
      if (method === 'card') {
        payment = addPayment({ amount: price, method: 'card', category: 'court', payer: { kind: 'customer', id: customerId }, refs: [{ type: 'booking', id: b.id }], by: 'web', itemName: `Pályabérlés – ${court.name}, ${date} ${start}–${end}` });
        b.paymentId = payment.id;
        invoice = byId(state.invoices, payment.invoiceId);
      }
      commit();
      return { booking: b, payment, invoice };
    },
    canCustomerCancel(b) {
      if (!b || b.status === 'cancelled') return false;
      const start = parseYmd(b.date); const [h, m] = b.start.split(':').map(Number); start.setHours(h, m, 0, 0);
      return (start - new Date()) / 3600000 >= state.settings.booking.cancelHours;
    },
    /** Lemondás – kártyás fizetésnél visszatérítés + sztornó számla, bérletnél jóváírás. */
    cancelBooking(id, { by = 'admin', refund = true, note = '' } = {}) {
      const b = byId(state.bookings, id);
      if (!b || b.status === 'cancelled') return null;
      if (by === 'customer' && !Store.canCustomerCancel(b)) throw new Error(`Lemondani legkésőbb ${state.settings.booking.cancelHours} órával előtte lehet.`);
      b.status = 'cancelled'; b.cancelledAt = nowIso(); b.cancelledBy = by; b.cancelNote = note;
      if (b.passId) { const ps = byId(state.passes, b.passId); if (ps) ps.used = Math.max(0, ps.used - (toMin(b.end) - toMin(b.start)) / 60); }
      let r = null;
      if (b.paymentId && refund) r = refundPaymentInternal(b.paymentId, { note: 'Foglalás lemondva' });
      commit();
      return r;
    },
    deleteBooking(id) { state.bookings = state.bookings.filter((b) => b.id !== id); commit(); },
    markBookingPaid(id, method, { invoice = true } = {}) {
      const b = byId(state.bookings, id); if (!b || b.paymentId) return null;
      const c = byId(state.courts, b.courtId);
      const p = addPayment({ amount: b.price, method, category: 'court', payer: b.customerId ? { kind: 'customer', id: b.customerId } : null, refs: [{ type: 'booking', id: b.id }], invoice, itemName: `Pályabérlés – ${c ? c.name : ''}, ${b.date} ${b.start}–${b.end}` });
      b.paymentId = p.id;
      commit();
      return p;
    },

    // ---------- ismétlődő foglalások (állandó, edzés, lezárás) ----------
    series: (type) => state.series.filter((s) => !type || s.type === type),
    seriesById: (id) => byId(state.series, id),
    seriesDates(s, from, to) {
      const out = []; eachDate(from, to, (d) => { if (seriesActive(s, d) && !isClosed(d)) out.push(d); }); return out;
    },
    /** Ütközések a sorozat jövőbeli alkalmaival (max. 1 év). */
    seriesConflicts(s) {
      const out = [];
      const from = s.from > todayYmd() ? s.from : todayYmd();
      const to = s.to || shiftYmd(from, 365);
      eachDate(from, to, (d) => {
        if (dowOf(d) !== s.day || isClosed(d) || (s.skip || []).includes(d)) return;
        const c = itemsOn(d).filter((it) => it.courtId === s.courtId && it.seriesId !== s.id && overlap(toMin(s.start), toMin(s.end), toMin(it.start), toMin(it.end)));
        if (c.length) out.push({ date: d, items: c });
      });
      return out;
    },
    upsertSeries(data) {
      if (data.id && byId(state.series, data.id)) Object.assign(byId(state.series, data.id), data);
      else { data.id = uid('r'); state.series.push({ skip: [], paid: {}, price: 0, title: '', customerId: null, coachId: null, ...data }); }
      commit(); return data.id;
    },
    skipSeriesDate(id, date, on = true) {
      const s = byId(state.series, id); if (!s) return;
      s.skip = (s.skip || []).filter((d) => d !== date);
      if (on) s.skip.push(date);
      commit();
    },
    endSeries(id, lastDate) {
      const s = byId(state.series, id); if (!s) return;
      if (lastDate < s.from) state.series = state.series.filter((x) => x.id !== id); else s.to = lastDate;
      commit();
    },
    deleteSeries(id) { state.series = state.series.filter((s) => s.id !== id); commit(); },
    /** Egy állandó foglalás adott havi (még nem fizetett) alkalmainak kifizetése. */
    paySeriesMonth(id, month, method) {
      const s = byId(state.series, id); if (!s) return null;
      const { from, to } = monthRange(month);
      const dates = Store.seriesDates(s, from, to).filter((d) => !(s.paid || {})[d]);
      if (!dates.length) return null;
      const c = byId(state.courts, s.courtId);
      const p = addPayment({
        amount: dates.length * s.price, method, category: 'court', payer: s.customerId ? { kind: 'customer', id: s.customerId } : null,
        refs: [{ type: 'series', id: s.id, month }],
        itemName: `Állandó pályabérlés – ${c ? c.name : ''}, ${month.replace('-', '. ')}. (${dates.length} alkalom)`,
      });
      s.paid = s.paid || {};
      dates.forEach((d) => { s.paid[d] = p.id; });
      commit();
      return p;
    },
    paySeriesDate(id, date, method) {
      const s = byId(state.series, id); if (!s || (s.paid || {})[date]) return null;
      const c = byId(state.courts, s.courtId);
      const p = addPayment({ amount: s.price, method, category: 'court', payer: s.customerId ? { kind: 'customer', id: s.customerId } : null, refs: [{ type: 'series', id: s.id, date }], itemName: `Pályabérlés – ${c ? c.name : ''}, ${date} ${s.start}–${s.end}` });
      s.paid = s.paid || {}; s.paid[date] = p.id;
      commit();
      return p;
    },

    // ---------- ügyfelek ----------
    customers: () => [...state.customers].sort(byName),
    customer: (id) => byId(state.customers, id),
    customerByEmail: (email) => state.customers.find((c) => norm(c.email) === norm(email)) || null,
    upsertCustomer(data) {
      if (data.id && byId(state.customers, data.id)) Object.assign(byId(state.customers, data.id), data);
      else {
        if (data.email && Store.customerByEmail(data.email)) throw new Error('Ezzel az e-mail címmel már van fiók.');
        data.id = uid('u');
        state.customers.push({ createdAt: nowIso(), billing: { name: data.name, zip: '', city: '', street: '', taxNumber: '' }, note: '', marketing: false, ...data });
      }
      commit(); return data.id;
    },
    deleteCustomer(id) { state.customers = state.customers.filter((c) => c.id !== id); commit(); },
    passesOf, usablePass, passFits,
    pass: (id) => byId(state.passes, id),
    passes: () => state.passes,
    buyPass({ customerId, productId, method, by = 'admin' }) {
      const prod = byId(state.products, productId);
      if (!prod) throw new Error('Ismeretlen bérlet');
      const today = todayYmd();
      const ps = { id: uid('ps'), customerId, productId, name: prod.name, tier: prod.tier || '', credits: prod.credits, used: 0, boughtAt: today, validUntil: shiftYmd(today, prod.validDays || 120), paymentId: null };
      const p = addPayment({ amount: prod.price, method, category: 'pass', payer: { kind: 'customer', id: customerId }, refs: [{ type: 'pass', id: ps.id }], by, itemName: prod.name });
      ps.paymentId = p.id;
      state.passes.push(ps);
      commit();
      return { pass: ps, payment: p, invoice: byId(state.invoices, p.invoiceId) };
    },
    customerSummary(id) {
      const bs = state.bookings.filter((b) => b.customerId === id);
      const pays = state.payments.filter((p) => p.payer && p.payer.kind === 'customer' && p.payer.id === id);
      const today = todayYmd();
      const unpaid = bs.filter((b) => b.status !== 'cancelled' && b.type === 'single' && b.price > 0 && !b.paymentId && !b.passId && b.date <= today);
      const regular = state.series.filter((s) => s.customerId === id && s.type === 'regular');
      let regularDue = 0;
      regular.forEach((s) => { Store.seriesDates(s, s.from, today < s.to ? today : s.to).forEach((d) => { if (!(s.paid || {})[d]) regularDue += s.price; }); });
      return {
        bookings: bs.filter((b) => b.status !== 'cancelled').length,
        upcoming: bs.filter((b) => b.status !== 'cancelled' && b.date >= today).length,
        spent: pays.reduce((s, p) => s + p.amount, 0),
        unpaid: unpaid.reduce((s, b) => s + b.price, 0) + regularDue,
        unpaidList: unpaid, regular, lastAt: bs.reduce((m, b) => (b.date > m ? b.date : m), ''),
      };
    },

    // ---------- fizetések, számlák ----------
    payments({ from, to, category, method } = {}) {
      return state.payments.filter((p) => (!from || p.at.slice(0, 10) >= from) && (!to || p.at.slice(0, 10) <= to)
        && (!category || p.category === category) && (!method || p.method === method))
        .sort((a, b) => (a.at < b.at ? 1 : -1));
    },
    payment: (id) => byId(state.payments, id),
    paymentsOf: (kind, id) => state.payments.filter((p) => p.payer && p.payer.kind === kind && p.payer.id === id).sort((a, b) => (a.at < b.at ? 1 : -1)),
    invoices({ from, to } = {}) {
      return state.invoices.filter((i) => (!from || i.issuedAt >= from) && (!to || i.issuedAt <= to))
        .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : (a.no < b.no ? 1 : -1)));
    },
    invoice: (id) => byId(state.invoices, id),
    invoiceOfPayment: (pid) => { const p = byId(state.payments, pid); return p && p.invoiceId ? byId(state.invoices, p.invoiceId) : null; },
    buyerFor,
    /** Kézi eladás (pl. ajándékkártya, labdabérlés, egyedi tétel). */
    recordSale({ payer = null, items, method, invoice = true, buyer = null, category = 'other', note = '' }) {
      const amount = items.reduce((s, it) => s + it.gross * (it.qty || 1), 0);
      const p = { id: uid('pay'), at: nowIso(), amount, method, category, payer, refs: [], by: 'admin', note, invoiceId: null };
      state.payments.push(p);
      if (invoice) { const inv = issueInvoice({ buyer: buyer || buyerFor(payer), items, method, paymentId: p.id }); p.invoiceId = inv.id; }
      commit();
      return p;
    },
    issueInvoiceForPayment(pid) {
      const p = byId(state.payments, pid); if (!p || p.invoiceId || p.amount <= 0) return null;
      const inv = issueInvoice({ buyer: buyerFor(p.payer), items: [{ name: CATEGORIES[p.category] || 'Szolgáltatás', gross: p.amount }], method: p.method, paymentId: p.id, date: p.at.slice(0, 10) });
      p.invoiceId = inv.id; commit(); return inv;
    },
    stornoInvoice(id) { const st = stornoInvoiceInternal(id); commit(); return st; },
    refundPayment(id, opts) { const r = refundPaymentInternal(id, opts); commit(); return r; },

    // ---------- tandíjak ----------
    charges({ month, studentId, status } = {}) {
      return state.charges.filter((c) => (!month || c.month === month) && (!studentId || c.studentId === studentId) && (!status || c.status === status));
    },
    charge: (id) => byId(state.charges, id),
    /** Havi tandíjak kiírása minden aktív diáknak, akinek még nincs. */
    generateCharges(month) {
      let n = 0;
      state.students.forEach((s) => {
        if (s.active === false || !s.programId) return;
        if (state.charges.some((c) => c.studentId === s.id && c.month === month && c.status !== 'void')) return;
        const prog = byId(state.programs, s.programId); if (!prog) return;
        state.charges.push({
          id: uid('ch'), studentId: s.id, month, programId: prog.id, name: `${prog.name} – tandíj`,
          amount: Math.round(prog.fee * (1 - (s.discount || 0) / 100)), due: `${month}-10`, status: 'open', paymentId: null, createdAt: nowIso(),
        });
        n++;
      });
      commit();
      return n;
    },
    payCharge(id, method) {
      const c = byId(state.charges, id); if (!c || c.status !== 'open') return null;
      const prog = byId(state.programs, c.programId);
      const p = addPayment({ amount: c.amount, method, category: 'tuition', payer: { kind: 'student', id: c.studentId }, refs: [{ type: 'charge', id: c.id }], itemName: `${prog ? prog.name : 'Edzés'} tandíj – ${c.month.replace('-', '. ')}.` });
      c.status = 'paid'; c.paymentId = p.id;
      commit();
      return p;
    },
    voidCharge(id) { const c = byId(state.charges, id); if (c && c.status === 'open') { c.status = 'void'; commit(); } },
    remindCharge(id) { const c = byId(state.charges, id); if (c) { c.remindedAt = nowIso(); commit(); } },

    // ---------- kimutatások ----------
    /** Napi bevétel kategóriánként (a fizetésekből, visszatérítéssel csökkentve). */
    revenueByDay(from, to) {
      const map = {};
      eachDate(from, to, (d) => { map[d] = { date: d, court: 0, pass: 0, tuition: 0, other: 0, total: 0 }; });
      state.payments.forEach((p) => {
        const d = p.at.slice(0, 10); const row = map[d]; if (!row) return;
        let cat = p.category;
        if (cat === 'refund') { const o = byId(state.payments, p.refOf); cat = o ? o.category : 'court'; }
        row[cat] = (row[cat] || 0) + p.amount; row.total += p.amount;
      });
      return Object.values(map);
    },
    /** Pályakihasználtság: foglalt perc / nyitvatartási perc, típusonként és óránként. */
    occupancy(from, to) {
      const s = state.settings; const open = toMin(s.open); const close = toMin(s.close);
      const courts = activeCourts();
      const byType = { single: 0, regular: 0, training: 0, block: 0 };
      const grid = {}; // dow → hour → [booked, total]
      let total = 0; let booked = 0;
      eachDate(from, to, (d) => {
        if (isClosed(d)) return;
        const dow = dowOf(d);
        grid[dow] = grid[dow] || {};
        total += (close - open) * courts.length;
        for (let h = open / 60; h < close / 60; h++) { grid[dow][h] = grid[dow][h] || [0, 0]; grid[dow][h][1] += courts.length * 60; }
        itemsOn(d).forEach((it) => {
          if (!courts.find((c) => c.id === it.courtId)) return;
          const a = Math.max(open, toMin(it.start)); const b = Math.min(close, toMin(it.end));
          if (b <= a) return;
          booked += b - a; byType[it.type] = (byType[it.type] || 0) + (b - a);
          for (let m = a; m < b; m += 30) { const h = Math.floor(m / 60); if (grid[dow][h]) grid[dow][h][0] += Math.min(30, b - m); }
        });
      });
      return { rate: total ? booked / total : 0, booked, total, byType, grid };
    },
    /** Kintlévőségek: lejátszott, de ki nem fizetett foglalások, állandó alkalmak és lejárt tandíjak. */
    receivables() {
      const today = todayYmd();
      const out = [];
      state.bookings.forEach((b) => {
        if (b.status === 'cancelled' || b.type !== 'single' || !b.price || b.paymentId || b.passId) return;
        if (b.date > today) return;
        out.push({ kind: 'booking', id: b.id, date: b.date, amount: b.price, who: { kind: 'customer', id: b.customerId }, label: `Pályabérlés ${b.start}–${b.end}`, key: `b:${b.id}` });
      });
      state.series.forEach((s) => {
        if (s.type !== 'regular') return;
        const to = s.to && s.to < today ? s.to : today;
        Store.seriesDates(s, s.from, to).forEach((d) => {
          if ((s.paid || {})[d]) return;
          out.push({ kind: 'series', id: s.id, date: d, amount: s.price, who: { kind: 'customer', id: s.customerId }, label: `Állandó foglalás ${s.start}–${s.end}`, key: `s:${s.id}:${d}` });
        });
      });
      state.charges.forEach((c) => {
        if (c.status !== 'open' || c.due >= today) return;
        out.push({ kind: 'charge', id: c.id, date: c.due, amount: c.amount, who: { kind: 'student', id: c.studentId }, label: c.name });
      });
      return out.sort((a, b) => (a.date < b.date ? -1 : 1));
    },

    // ---------- edzők ----------
    coaches: () => [...state.coaches].sort(byName),
    coach: (id) => byId(state.coaches, id),
    upsertCoach(data) {
      if (data.id && byId(state.coaches, data.id)) Object.assign(byId(state.coaches, data.id), data);
      else { data.id = uid('c'); state.coaches.push({ active: true, ...data }); }
      commit(); return data.id;
    },
    deleteCoach(id) {
      state.coaches = state.coaches.filter((c) => c.id !== id);
      state.trainings.forEach((t) => { t.coachIds = (t.coachIds || []).filter((x) => x !== id); });
      commit();
    },
    /**
     * Edző ledolgozott órái egy időszakban – a rögzített jelenlétekből, ahol az edző
     * kiválasztotta magát a csoportnál. Ha egy idősávban egyszerre két csoportot vitt,
     * az időt csak egyszer számoljuk.
     */
    coachHours(coachId, from, to) {
      const items = Object.values(state.sessions)
        .filter((s) => s.date >= from && s.date <= to && sessionCoach(s) === coachId)
        .map((s) => { const t = byId(state.trainings, s.trainingId); return { ...s, start: s.start || (t && t.start), end: s.end || (t && t.end), name: s.name || groupName(t) }; })
        .filter((s) => s.start && s.end)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byStart(a, b)));
      let minutes = 0; const days = new Set();
      const byDate = {};
      items.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push([toMin(s.start), toMin(s.end)]); days.add(s.date); });
      Object.values(byDate).forEach((iv) => {
        iv.sort((a, b) => a[0] - b[0]);
        let [a0, a1] = iv[0];
        iv.slice(1).forEach(([b0, b1]) => { if (b0 <= a1) a1 = Math.max(a1, b1); else { minutes += a1 - a0; a0 = b0; a1 = b1; } });
        minutes += a1 - a0;
      });
      const privates = [];
      state.series.forEach((s) => {
        if (s.type !== 'training' || s.coachId !== coachId || s.title !== 'Magánóra') return;
        const end = to < todayYmd() ? to : todayYmd();
        if (end >= from) Store.seriesDates(s, from, end).forEach((d) => privates.push({ date: d, start: s.start, end: s.end }));
      });
      return { items, groups: items.length, minutes, days: days.size, privates: privates.length, privateList: privates };
    },
    /** Kompatibilitás: havi összesítő. */
    coachMonth(coachId, month) {
      const { from, to } = monthRange(month);
      const h = Store.coachHours(coachId, from, to);
      return { sessions: h.groups, minutes: h.minutes, privates: h.privates };
    },
    sessionCoach,

    // ---------- diákok ----------
    students: () => [...state.students].sort(byName),
    student: (id) => byId(state.students, id),
    upsertStudent(data) {
      if (data.id && byId(state.students, data.id)) Object.assign(byId(state.students, data.id), data);
      else { data.id = uid('s'); state.students.push({ active: true, discount: 0, joined: todayYmd(), billing: { name: data.parentName || data.name, zip: '', city: '', street: '', taxNumber: '' }, ...data }); }
      commit(); return data.id;
    },
    addStudents(list, { programId, trainingIds = [] } = {}) {
      const ids = list.map((d) => {
        const id = uid('s');
        state.students.push({ id, programId: programId || '', phone: '', email: '', parentName: '', note: '', active: true, discount: 0, joined: todayYmd(), billing: { name: d.name, zip: '', city: '', street: '', taxNumber: '' }, ...d });
        return id;
      });
      trainingIds.forEach((tid) => { const t = byId(state.trainings, tid); if (t) t.studentIds.push(...ids); });
      commit();
      return ids;
    },
    deleteStudent(id) {
      state.students = state.students.filter((s) => s.id !== id);
      state.trainings.forEach((t) => { t.studentIds = t.studentIds.filter((x) => x !== id); });
      commit();
    },
    setStudentTrainings(sid, tids) {
      state.trainings.forEach((t) => {
        const has = t.studentIds.includes(sid); const want = tids.includes(t.id);
        if (want && !has) t.studentIds.push(sid);
        if (!want && has) t.studentIds = t.studentIds.filter((x) => x !== sid);
      });
      commit();
    },

    // ---------- edzés-idősávok, csoportok és jelenlét ----------
    /** A hét adott napjára beállított idősávok, pl. hétköznap 13–20 óránként. */
    trainingSlots: slotsOfDow,
    setTrainingSlots(dow, list) {
      state.settings.trainingSlots = state.settings.trainingSlots || {};
      state.settings.trainingSlots[dow] = list.map((x) => ({ start: x.start, end: x.end })).sort((a, b) => byStart(a, b));
      commit();
    },
    slotsOn,
    daysOf, groupName,
    trainings: () => [...state.trainings].sort((a, b) => (daysOf(a)[0] || 9) - (daysOf(b)[0] || 9) || byStart(a, b) || byGroupName(a, b)),
    training: (id) => byId(state.trainings, id),
    trainingsOn,
    trainingsOfStudent: (sid) => state.trainings.filter((t) => t.studentIds.includes(sid)).sort((a, b) => (daysOf(a)[0] || 9) - (daysOf(b)[0] || 9) || byStart(a, b)),
    upsertTraining(data) {
      const d = { ...data };
      if (d.day != null && !d.days) { d.days = [d.day]; }
      delete d.day;
      if (d.days) d.days = [...new Set(d.days.map(Number))].sort((x, y) => x - y);
      if (d.id && byId(state.trainings, d.id)) { const t = byId(state.trainings, d.id); delete t.day; delete t.label; Object.assign(t, d); }
      else { d.id = uid('t'); state.trainings.push({ name: '', days: [], programId: '', coachIds: [], studentIds: [], note: '', ...d }); }
      commit(); return d.id;
    },
    deleteTraining(id) { state.trainings = state.trainings.filter((t) => t.id !== id); commit(); },
    /** A csoport programja (szín, tandíj) – ha nincs megadva, a diákok leggyakoribb programja. */
    programOfGroup(t) {
      if (!t) return null;
      if (t.programId) return byId(state.programs, t.programId) || null;
      const cnt = {};
      t.studentIds.forEach((sid) => { const p = (byId(state.students, sid) || {}).programId; if (p) cnt[p] = (cnt[p] || 0) + 1; });
      const top = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0];
      return top ? byId(state.programs, top[0]) : null;
    },
    programsOfTraining(t) {
      const ids = new Set(t.studentIds.map((sid) => (byId(state.students, sid) || {}).programId).filter(Boolean));
      return [...ids].map((id) => byId(state.programs, id)).filter(Boolean);
    },
    /**
     * Névsor beillesztése egy csoportba: soronként egy név (Excelből is).
     * A meglévő diákokat név alapján megtalálja, az újakat felveszi.
     */
    importRoster(groupId, lines, { programId } = {}) {
      const t = byId(state.trainings, groupId); if (!t) return { matched: 0, created: 0 };
      let matched = 0; let created = 0;
      lines.map((l) => String(l).split(/\t|;/)[0].trim()).filter((n) => n.length > 1).forEach((name) => {
        let st = state.students.find((x) => norm(x.name) === norm(name));
        if (st) matched++;
        else {
          st = { id: uid('s'), name, birthYear: '', programId: programId || t.programId || '', parentName: '', phone: '', email: '', note: '', active: true, discount: 0, joined: todayYmd(), billing: { name, zip: '', city: '', street: '', taxNumber: '' } };
          state.students.push(st); created++;
        }
        if (st.active === false) st.active = true;
        if (!t.studentIds.includes(st.id)) t.studentIds.push(st.id);
      });
      commit();
      return { matched, created };
    },
    session: (tid, date) => state.sessions[sessionKey(tid, date)] || null,
    sessions: () => Object.values(state.sessions),
    rosterFor, isPast,
    stats: (sid) => allStats()[sid],
    allStats,
    isResolved: (key) => !!state.resolved[key],
    missingSessions({ coachId, days = 14 } = {}) {
      const out = [];
      const today = todayYmd();
      for (let back = days; back >= 0; back--) {
        const date = shiftYmd(today, -back);
        trainingsOn(date, coachId).forEach((t) => {
          if (back === 0 && nowMin() < toMin(t.end)) return;
          if (!state.sessions[sessionKey(t.id, date)]) out.push({ training: t, date });
        });
      }
      return out;
    },
    /**
     * Jelenlét mentése egy csoport egy alkalmára.
     * coachId: aki az edzést tartotta (a legördülő listából), by: aki rögzítette.
     * A be nem pipált diákok 'absent' jelölést kapnak → automatikusan pótlásra várnak.
     */
    saveSession({ trainingId, date, coachId, marks, makeups = [], by }) {
      const t = byId(state.trainings, trainingId);
      state.sessions[sessionKey(trainingId, date)] = {
        trainingId, date, start: t ? t.start : '', end: t ? t.end : '', name: groupName(t),
        coachId: coachId || null, by, at: nowIso(), marks, makeups,
      };
      commit();
    },
    deleteSession(tid, date) { delete state.sessions[sessionKey(tid, date)]; commit(); },
    setResolved(key, on) {
      if (on) state.resolved[key] = { at: nowIso() }; else delete state.resolved[key];
      commit();
    },

    // ---------- karbantartás ----------
    exportJSON() { return JSON.stringify(state, null, 2); },
    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.students) || !Array.isArray(data.bookings)) throw new Error('Érvénytelen mentésfájl');
      state = data; migrate(); commit();
    },
    resetDemo() { state = buildDemo(); commit(); },
    wipe() {
      const keep = state.settings;
      state = {
        version: 1, demo: false, seededAt: todayYmd(),
        settings: { ...keep, invoice: { ...keep.invoice, seq: {} } },
        courts: state.courts, priceRules: state.priceRules, products: state.products, programs: state.programs,
        customers: [], bookings: [], series: [], passes: [], payments: [], invoices: [], charges: [],
        coaches: [], students: [], trainings: [], sessions: {}, resolved: {},
      };
      commit();
    },
  };

  load();
  window.Store = Store;
  connect();
})();
