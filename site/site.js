/* ==========================================================================
   Kezdőlap: élő "szabad pályák" tábla, programok, árak, edzők, GYIK
   Minden adat a közös Store-ból jön, így az adminban módosított árak,
   edzők és programok azonnal megjelennek a weboldalon is.
   ========================================================================== */
(function () {
  'use strict';

  const { esc, $, $$, I } = UI;
  const S = () => Store.settings();
  const hh = (t) => String(Number(t.slice(0, 2)));
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ======================================================================
  // ÉLŐ TÁBLA – szabad pályák óránként
  // ======================================================================
  const board = $('#board');
  let bDate = null;

  function dayList() {
    const today = Store.todayYmd();
    return Array.from({ length: 7 }, (_, i) => Store.shiftYmd(today, i)).filter((d) => !Store.isClosed(d)).slice(0, 6);
  }
  function dayLabel(d, i) {
    if (d === Store.todayYmd()) return 'Ma';
    if (d === Store.shiftYmd(Store.todayYmd(), 1)) return 'Holnap';
    return UI.cap(UI.DAYS[Store.dowOf(d) - 1]).slice(0, 3) + '.';
  }

  function renderBoard(animate = true) {
    const days = dayList();
    if (!bDate || !days.includes(bDate)) {
      // ha ma már alig van hátra időpont, a holnapi nappal nyitunk
      const today = Store.todayYmd();
      bDate = (days[0] === today && Store.freeCount(today) >= 4) ? today : (days.find((d) => d !== today && Store.freeCount(d) > 0) || days[0]);
    }
    const grid = Store.slotGrid(bDate);
    const courts = grid.map((r) => r.court);
    const rows = grid[0] ? grid[0].cells.map((c, i) => ({ start: c.start, end: c.end, price: c.price, tier: c.tier, cells: grid.map((r) => r.cells[i]) })) : [];
    const shown = rows.filter((r) => r.cells.some((c) => c.state !== 'past'));
    const free = shown.reduce((n, r) => n + r.cells.filter((c) => c.state === 'free').length, 0);

    board.innerHTML = `
      <div class="bd-top">
        <span class="bd-live"><i></i>ÉLŐ</span>
        <span class="bd-title">Szabad pályák</span>
        <span class="bd-clock js-clock">--:--</span>
      </div>
      <div class="bd-days" role="tablist">
        ${days.map((d, i) => {
          const n = Store.freeCount(d);
          return `<button class="bd-day ${d === bDate ? 'on' : ''}" data-d="${d}" role="tab" aria-selected="${d === bDate}">
            <span>${dayLabel(d, i)}</span><b>${esc(UI.dateShort(d))}</b><small>${n ? `${n} szabad` : 'betelt'}</small></button>`;
        }).join('')}
      </div>
      <div class="bd-grid" style="--cols:${courts.length}">
        <div class="bd-head"><span>IDŐ</span>${courts.map((c) => `<span>${c.no}</span>`).join('')}<span>ÁR/ÓRA</span></div>
        <div class="bd-rows">
          ${shown.length ? shown.map((r, ri) => `
            <div class="bd-row">
              <span class="bd-time">${r.start.split('').map((ch, ci) => `<span class="fl" style="--r:${animate ? ri : 0};--c:${ci}">${ch}</span>`).join('')}</span>
              ${r.cells.map((c, ci) => (c.state === 'free'
                ? `<button class="lamp free" data-c="${courts[ci].id}" data-t="${c.start}" style="--r:${animate ? ri : 0};--c:${ci}" aria-label="${courts[ci].name}, ${c.start}–${c.end} szabad – foglalás">${courts[ci].no}</button>`
                : `<span class="lamp ${c.state === 'past' ? 'past' : ''}" style="--r:${animate ? ri : 0};--c:${ci}" aria-label="foglalt"></span>`)).join('')}
              <span class="bd-price ${r.tier === 'peak' ? 'peak' : ''}">${UI.money(r.price)}</span>
            </div>`).join('')
          : `<div class="bd-empty"><b>${Store.isClosed(bDate) ? 'Ünnepnap – zárva' : 'Erre a napra már nincs időpont'}</b>Válassz másik napot fent.</div>`}
        </div>
      </div>
      <div class="bd-foot">
        <span class="bd-legend"><span><i class="lf"></i>szabad · ${free}</span><span><i class="lb"></i>foglalt</span></span>
        <a class="bd-link" href="foglalas/index.html?d=${bDate}">Teljes naptár ${arrow}</a>
      </div>`;
    tickClock();
    // a következő órához görgetünk
    const rowsEl = $('.bd-rows', board);
    const firstFree = $('.lamp.free', rowsEl);
    if (firstFree && rowsEl.scrollHeight > rowsEl.clientHeight) {
      rowsEl.scrollTop = Math.max(0, firstFree.closest('.bd-row').offsetTop - rowsEl.offsetTop - 4);
    }
  }
  function tickClock() {
    const c = $('.js-clock', board); if (!c) return;
    const d = new Date();
    c.innerHTML = `${String(d.getHours()).padStart(2, '0')}<span style="opacity:${d.getSeconds() % 2 ? 0.25 : 1}">:</span>${String(d.getMinutes()).padStart(2, '0')}`;
  }
  board.addEventListener('click', (e) => {
    const day = e.target.closest('.bd-day');
    if (day) { bDate = day.dataset.d; renderBoard(true); return; }
    const lamp = e.target.closest('.lamp.free');
    if (lamp) location.href = `foglalas/index.html?d=${bDate}&c=${lamp.dataset.c}&t=${lamp.dataset.t}`;
  });
  setInterval(tickClock, 1000);
  let lastMin = new Date().getMinutes();
  setInterval(() => { const m = new Date().getMinutes(); if (m !== lastMin) { lastMin = m; renderBoard(false); } }, 5000);

  // ======================================================================
  // TÉNYEK, FUTÓSZALAG, LÉPÉSEK
  // ======================================================================
  function renderFacts() {
    const s = S();
    $$('.js-hours').forEach((x) => { x.textContent = `${hh(s.open)}–${hh(s.close)}`; });
    $$('.js-cancel').forEach((x) => { x.textContent = s.booking.cancelHours; });
    const students = Store.students().filter((x) => x.active !== false).length;
    $('#facts').innerHTML = [
      [Store.activeCourts().length, 'beltéri pálya'],
      [`${hh(s.open)}–${hh(s.close)}`, 'nyitva minden nap'],
      [Store.coaches().filter((c) => c.active !== false).length, 'képzett edző'],
      [`${students}+`, 'diák edz nálunk'],
    ].map(([b, t]) => `<li><b>${esc(b)}</b><span>${esc(t)}</span></li>`).join('');
    const today = Store.todayYmd();
    $('#free-today').textContent = Store.freeCount(today) || 'nincs';
  }
  const words = ['Pályafoglalás', 'Ovitenisz', 'Versenytenisz', 'Pickleball', 'Tennis&Fun', 'Felnőtt csoportok', 'Nyári táborok', 'Junior hobbi'];
  const mq = words.map((w) => `<span>${esc(w)}<i class="mq-ball"></i></span>`).join('');
  $('#marquee').innerHTML = mq + mq;
  $('#ic-1').innerHTML = I.cal; $('#ic-2').innerHTML = I.mail; $('#ic-3').innerHTML = I.card;

  // ======================================================================
  // PROGRAMOK
  // ======================================================================
  const light = (hex) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16; const g = (n >> 8) & 255; const b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 165; };
  const EXTRA = [
    ['Nyári táborok', 'Napközis teniszes táborok nyáron, 6–14 éveseknek.', 'NYÁR'],
    ['Születésnap', 'Teniszes szülinapi zsúr a csarnokban, edzővel és játékokkal.', 'BULI'],
    ['Csapatépítő', 'Céges tenisz- és pickleball-délután, igény szerint szervezve.', 'CÉG'],
  ];
  function renderPrograms() {
    $('#progs').innerHTML = Store.programs().map((p, i) => `
      <article class="prog rv ${light(p.color) ? 'lightc' : ''}" style="--c:${esc(p.color)};--d:${i % 4}">
        <div class="prog-top"><span class="prog-age">${esc(p.ages || '')}</span><span class="prog-short">${esc(p.short)}</span></div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.desc || '')}</p>
        <div class="prog-foot"><span>${esc(p.perWeek || 'havidíj')}</span><b>${UI.money(p.fee)}<small style="font-size:11px;opacity:.6"> /hó</small></b></div>
      </article>`).join('') + EXTRA.map(([n, d, s], i) => `
      <article class="prog extra rv" style="--d:${(Store.programs().length + i) % 4}">
        <div class="prog-top"><span class="prog-age">Egyedi ajánlat</span><span class="prog-short">${s}</span></div>
        <h3>${esc(n)}</h3><p>${esc(d)}</p>
        <div class="prog-foot"><span>Érdeklődj</span><a href="mailto:${esc(S().venue.email)}?subject=${encodeURIComponent(n)}" style="font-weight:700">Írj nekünk →</a></div>
      </article>`).join('');
    $('#more-svc').innerHTML = `<span>A házban még</span>${['Masszázs', 'Jóga', 'Stretching', 'Kismama torna', 'Baba–Mama torna', 'Kozmetika', 'B.Method'].map((x) => `<b>${x}</b>`).join('')}`;
  }

  // ======================================================================
  // ÁRAK
  // ======================================================================
  const TIER_COLOR = { off: '#7FB6CF', peak: '#2E5D8C', weekend: '#121211' };
  const daysText = (days) => {
    const s = [...days].sort();
    if (s.join() === '1,2,3,4,5') return 'Hétfő–péntek';
    if (s.join() === '6,7') return 'Szombat–vasárnap';
    if (s.length === 7) return 'Minden nap';
    return s.map((d) => UI.DAYS_SHORT[d - 1]).join(', ');
  };
  function renderPrices() {
    const s = S();
    const rules = Store.priceRules();
    const open = Store.toMin(s.open); const close = Store.toMin(s.close);
    const wd = rules.filter((r) => r.days.includes(1)).sort((a, b) => Store.toMin(a.from) - Store.toMin(b.from));
    $('#price-court').innerHTML = `
      <h3>Pályabérlés</h3>
      <p>Bruttó óradíj pályánként, a csarnokban minden pálya beltéri.</p>
      <div class="tier-bar" aria-hidden="true">${wd.map((r) => `<i style="flex:${Store.toMin(r.to) - Store.toMin(r.from)};background:${TIER_COLOR[r.tier] || '#555'}">${esc(r.from)}–${esc(r.to)}</i>`).join('')}</div>
      <div class="tier-axis"><span>${esc(s.open)}</span><span>hétköznap</span><span>${esc(s.close)}</span></div>
      <div class="price-rows">
        ${rules.map((r) => `<div class="price-row"><i class="sw" style="background:${TIER_COLOR[r.tier] || '#555'}"></i>
          <span><b>${esc(r.name)}</b><small>${esc(daysText(r.days))} · ${esc(r.from)}–${esc(r.to)}</small></span>
          <span class="amt">${UI.money(r.price)}<small>/ óra</small></span></div>`).join('')}
      </div>
      <p class="price-note">Online foglalásnál bankkártyával, bérlettel vagy a helyszínen is fizethetsz. Lemondás ${s.booking.cancelHours} órával a kezdés előtt díjmentes. Ünnepnapokon zárva tartunk.</p>`;
    const passes = Store.products('pass').filter((p) => p.active !== false);
    const gift = Store.products('giftcard').find((p) => p.active !== false);
    $('#passes').innerHTML = passes.map((p, i) => `
      <div class="ticket rv" style="--d:${i}">
        <span class="tk-kind">Bérlet · ${p.credits} alkalom</span>
        <h4>${esc(p.name)}</h4>
        <span class="tk-price">${UI.money(p.price)}<small>${UI.money(Math.round(p.price / p.credits))}/óra</small></span>
        <p>${esc(p.desc || '')} · ${p.validDays} napig érvényes</p>
      </div>`).join('') + (gift ? `
      <div class="ticket gift rv" style="--d:${passes.length}">
        <span class="tk-kind">Ajándékkártya</span>
        <h4>Tenisz ajándékba</h4>
        <span class="tk-price">bármilyen<small>összegben</small></span>
        <p>${esc(gift.desc || '')}</p>
      </div>` : '') + `<a class="btn-xl primary rv" style="--d:3" href="foglalas/index.html#/fiok">Bérletet veszek ${arrow}</a>`;
  }

  // ======================================================================
  // EDZŐK
  // ======================================================================
  function renderCoaches() {
    $('#coaches').innerHTML = Store.coaches().filter((c) => c.active !== false).map((c, i) => `
      <article class="coach rv" style="--d:${i % 3}">
        <div class="coach-mono" style="--c:${esc(c.color)}"><span>${esc(c.short || UI.initials(c.name))}</span></div>
        <div><h3>${esc(c.name)}</h3><p>${esc(c.bio || 'Teniszedző')}</p></div>
      </article>`).join('');
  }

  // ======================================================================
  // GYIK + KAPCSOLAT
  // ======================================================================
  function renderFaq() {
    const s = S();
    const qa = [
      ['Kezdő vagyok – hol érdemes elkezdeni?', 'Felnőtteknek a csoportos teniszórákat ajánljuk, gyerekeknek korosztálytól függően az Ovitenisz vagy a Junior hobbi programot. Írj vagy hívj, és segítünk kiválasztani a megfelelő csoportot.'],
      ['Hogyan tudok pályát foglalni?', `A Foglalási naptárban kiválasztod a napot, a pályát és az órát, majd egy e-mail címmel belépsz, és bankkártyával, bérlettel vagy a helyszínen fizetsz. Legfeljebb ${s.booking.maxDaysAhead} nappal előre lehet foglalni.`],
      ['Le tudom mondani a foglalásomat?', `Igen: a kezdés előtt legalább ${s.booking.cancelHours} órával a Fiókomban egy kattintással lemondhatod. A kártyás fizetést automatikusan visszautaljuk, a bérletes alkalmat jóváírjuk.`],
      ['Kapok számlát?', 'Igen, minden fizetésről automatikusan elektronikus számlát küldünk e-mailben. Cégnévre szóló számlához add meg az adószámot a fiókodban.'],
      ['Mit hozzon magával a gyermekem az edzésre?', 'Kényelmes sportruházatot, beltéri (nem nyomot hagyó talpú) sportcipőt és kulacsot. Kezdőknek ütőt az első alkalmakra tudunk adni.'],
      ['Hogyan fizethetem a havi tandíjat?', 'A havi díjról e-mailben értesítünk; átutalással, bankkártyával vagy a recepción is rendezhető, a számlát automatikusan kiállítjuk.'],
    ];
    $('#faq').innerHTML = qa.map(([q, a], i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(q)}<i></i></summary><p>${esc(a)}</p></details>`).join('');
  }
  function renderContact() {
    const s = S();
    const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.venue.address)}`;
    $('#contact').innerHTML = `
      <div class="contact-info">
        <div class="ci rv"><span class="eyebrow">Telefon</span><a href="tel:${esc(s.venue.phone.replace(/\s/g, ''))}">${esc(s.venue.phone)}</a><small>Hívj bátran nyitvatartási időben</small></div>
        <div class="ci rv" style="--d:1"><span class="eyebrow">E-mail</span><a href="mailto:${esc(s.venue.email)}">${esc(s.venue.email)}</a><small>Általában egy napon belül válaszolunk</small></div>
        <div class="ci rv" style="--d:2"><span class="eyebrow">Cím</span><b>${esc(s.venue.address)}</b><small>Beltéri teniszcsarnok</small></div>
        <div class="ci rv" style="--d:3"><span class="eyebrow">Nyitvatartás</span><b>Minden nap ${esc(s.open)}–${esc(s.close)}</b><small>Ünnepnapokon zárva</small></div>
        <div class="ci wide rv"><div><span class="eyebrow">Pályafoglalás</span><b>Online, a nap 24 órájában</b></div><a class="btn-xl ball" href="foglalas/index.html">Foglalok ${arrow}</a></div>
      </div>
      <div class="map rv" style="--d:1">
        <svg viewBox="0 0 600 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="600" height="420" fill="#E5E2D9"/>
          <path d="M-20 90 C 120 120, 220 40, 380 70 S 560 30, 640 60" stroke="#fff" stroke-width="16" fill="none"/>
          <path d="M120 -20 C 140 120, 90 260, 150 440" stroke="#fff" stroke-width="12" fill="none"/>
          <path d="M-20 300 C 160 270, 320 330, 640 280" stroke="#fff" stroke-width="20" fill="none"/>
          <path d="M440 -20 L 400 440" stroke="#fff" stroke-width="10" fill="none"/>
          <path d="M240 120 L 560 160" stroke="#F4F2EC" stroke-width="7" fill="none"/>
          <path d="M200 380 L 520 220" stroke="#F4F2EC" stroke-width="7" fill="none"/>
          <rect x="40" y="150" width="70" height="110" rx="10" fill="#D3DCC8"/>
          <rect x="470" y="300" width="110" height="80" rx="10" fill="#D3DCC8"/>
          <g transform="translate(300 200) rotate(-8)">
            <rect x="-62" y="-40" width="124" height="80" rx="6" fill="#74787C"/>
            <rect x="-48" y="-30" width="96" height="60" fill="#2E5D8C"/>
            <g stroke="#F3F1EA" stroke-width="1.6" fill="none"><rect x="-48" y="-30" width="96" height="60"/><line x1="-48" y1="-23" x2="48" y2="-23"/><line x1="-48" y1="23" x2="48" y2="23"/><line x1="-24" y1="-23" x2="-24" y2="23"/><line x1="24" y1="-23" x2="24" y2="23"/><line x1="-24" y1="0" x2="24" y2="0"/></g>
            <line x1="0" y1="-36" x2="0" y2="36" stroke="#121211" stroke-width="2"/>
          </g>
          <text x="40" y="70" font-family="Geist Mono, monospace" font-size="11" letter-spacing="2" fill="#8B887F">DUNAKESZI</text>
        </svg>
        <div class="map-pin"><b>Volvex Tennis</b><i></i><u></u></div>
        <a class="btn dark" href="${maps}" target="_blank" rel="noopener">${I.pin}Útvonaltervezés</a>
      </div>`;
  }

  // ======================================================================
  // MEGJELENÉS GÖRGETÉSRE
  // ======================================================================
  let io = null;
  function observe() {
    const els = $$('.rv:not(.in)');
    if (!('IntersectionObserver' in window) || UI.reduceMotion()) { els.forEach((x) => x.classList.add('in')); return; }
    io = io || new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((x) => io.observe(x));
  }

  function renderAll(first) {
    renderFacts();
    renderPrograms();
    renderPrices();
    renderCoaches();
    renderFaq();
    renderContact();
    if (first) renderBoard(true);
    observe();
    if (!first) $$('.rv').forEach((x) => x.classList.add('in'));
  }
  UI.makeNoise();
  renderAll(true);
  // másik fülön történt módosítás (pl. közben valaki foglalt) → frissítés
  Store.on(() => { renderAll(false); renderBoard(false); });
})();
