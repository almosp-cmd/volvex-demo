/* ==========================================================================
   Közös felület-segédek: formázás, ikonok, lapok (sheet), párbeszédek, toast
   ========================================================================== */
(function () {
  'use strict';

  const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
  const MONTHS_SHORT = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
  const DAYS = ['hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap'];
  const DAYS_SHORT = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function dateLong(ymd) { // "szeptember 29., kedd"
    const d = Store.parseYmd(ymd);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}., ${DAYS[Store.isoDow(d) - 1]}`;
  }
  function dateShort(ymd) { // "szept. 29."
    const d = Store.parseYmd(ymd);
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}.`;
  }
  function dayName(dow) { return DAYS[dow - 1]; }
  function relDay(ymd) {
    const t = Store.todayYmd();
    if (ymd === t) return 'ma';
    if (ymd === Store.ymd(Store.addDays(new Date(), -1))) return 'tegnap';
    if (ymd === Store.ymd(Store.addDays(new Date(), 1))) return 'holnap';
    return null;
  }

  // ---------- pénz, hónap, idő ----------
  const NB = '\u00a0';
  function money(n, { sign = false } = {}) {
    const v = Math.round(Number(n) || 0);
    const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${abs}${NB}Ft`;
  }
  function moneyShort(n) {
    const v = Math.round(Number(n) || 0); const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace('.', ',').replace(/,?0+$/, '')}${NB}M`;
    if (a >= 1e3) return `${Math.round(v / 1e3)}${NB}e`;
    return String(v);
  }
  function monthLabel(month) { const [y, m] = month.split('-').map(Number); return `${y}. ${MONTHS[m - 1]}`; }
  function timeOf(isoStr) { const d = new Date(isoStr); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  function dateTime(isoStr) { const d = new Date(isoStr); return `${dateShort(Store.ymd(d))} ${timeOf(isoStr)}`; }
  function dateNum(ymd) { return ymd.replace(/-/g, '. ') + '.'; }
  function hours(min) { const h = Math.floor(min / 60); const m = min % 60; return m ? `${h}${NB}ó ${m}${NB}p` : `${h}${NB}óra`; }

  function initials(name) {
    const p = String(name).trim().split(/\s+/);
    return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase();
  }
  const AV = ['#E5DCCB', '#D6E0D2', '#D5DDE6', '#E6D6CF', '#DDD6E4', '#E4E0C8', '#CFE0DD'];
  function avatarBg(id) {
    let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AV[h % AV.length];
  }
  function avatar(person, extra = '') {
    return `<span class="av ${extra}" style="--av:${person.color || avatarBg(person.id)}">${esc(initials(person.name))}</span>`;
  }
  function firstName(name) { const p = String(name).trim().split(/\s+/); return p.length > 1 ? p.slice(1).join(' ') : p[0]; }

  // ---------- ikonok ----------
  const I = {
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    del: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    swap: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h13l-4-4M20 15H7l4 4"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.8a3.5 3.5 0 010 6.4M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/></svg>',
    layers: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    whistle: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="14" r="5"/><path d="M12 10h9v4h-5M9 14h.01"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    redo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5"/><path d="M20 12a8 8 0 10-2.3 5.7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    card: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>',
    cash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    chart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    court: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16M6 4v16M18 4v16M6 12h12"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4-6.5 8-6.5s7 2.3 8 6.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 005 5L15 12l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    print: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V3h10v6M7 17H4v-7a1 1 0 011-1h14a1 1 0 011 1v7h-3"/><rect x="7" y="14" width="10" height="7"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V9M7 14l5-5 5 5M5 4h14"/></svg>',
  };

  // ---------- zaj textúra (egyszer generáljuk, CSS háttérként használjuk) ----------
  function makeNoise() {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 140;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(140, 140);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      document.documentElement.style.setProperty('--noise', `url(${c.toDataURL()})`);
    } catch (e) { /* nem kritikus */ }
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, kind = '') {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.className = `toast ${kind}`;
    el.innerHTML = esc(msg);
    requestAnimationFrame(() => el.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2400);
  }

  // ---------- alsó lap (mobil) / oldalsó panel (asztali) ----------
  function sheet({ title = '', sub = '', body = '', footer = '', cls = '', onMount, onClose } = {}) {
    const root = document.createElement('div');
    root.className = `sheet-root ${cls}`;
    root.innerHTML = `
      <div class="sheet-backdrop" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-grip" data-close></div>
        ${title ? `<div class="sheet-head"><div><h3>${esc(title)}</h3>${sub ? `<p class="sheet-sub">${sub}</p>` : ''}</div><button class="icon-btn ghost" data-close aria-label="Bezárás">${I.x}</button></div>` : ''}
        <div class="sheet-body">${body}</div>
        ${footer ? `<div class="sheet-foot">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(root);
    const api = {
      el: root,
      body: $('.sheet-body', root),
      close() {
        if (root.classList.contains('is-closing')) return;
        root.classList.add('is-closing');
        root.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => root.remove(), 320);
        onClose && onClose();
      },
      set(html) { $('.sheet-body', root).innerHTML = html; },
    };
    const onKey = (e) => { if (e.key === 'Escape') api.close(); };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
    // lehúzással zárható (mobil)
    const sh = $('.sheet', root);
    let y0 = null; let dy = 0;
    $('.sheet-grip', root).addEventListener('pointerdown', (e) => { y0 = e.clientY; sh.style.transition = 'none'; e.target.setPointerCapture(e.pointerId); });
    $('.sheet-grip', root).addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
    $('.sheet-grip', root).addEventListener('pointerup', () => { sh.style.transition = ''; sh.style.transform = ''; if (dy > 90) api.close(); y0 = null; dy = 0; });
    onMount && onMount(api);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
    return api;
  }

  function confirmBox(text, { ok = 'Rendben', cancel = 'Mégse', danger = false, sub = '' } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const s = sheet({
        cls: 'is-dialog',
        body: `<div class="dlg"><h3>${esc(text)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`,
        footer: `<button class="btn ghost" data-v="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'dark'}" data-v="1">${esc(ok)}</button>`,
        onClose: () => { if (!done) resolve(false); },
      });
      s.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        done = true; resolve(b.dataset.v === '1'); s.close();
      });
    });
  }

  function download(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // naptárfájl (.ics) egy eseményhez
  function ics({ uid, date, start, end, title, location = '', desc = '' }) {
    const d = date.replace(/-/g, '');
    const t = (x) => `${x.replace(':', '')}00`;
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Volvex Tennis//Foglalas//HU', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${uid}@volvextennis.hu`, `DTSTAMP:${now}`, `DTSTART:${d}T${t(start)}`, `DTEND:${d}T${t(end)}`,
      `SUMMARY:${title}`, `LOCATION:${location}`, `DESCRIPTION:${desc}`, 'END:VEVENT', 'END:VCALENDAR'];
    download(`volvex-${date}-${start.replace(':', '')}.ics`, lines.join('\r\n'), 'text/calendar');
  }

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.UI = {
    esc, $, $$, cap, I, DAYS, DAYS_SHORT, MONTHS, MONTHS_SHORT,
    money, moneyShort, monthLabel, timeOf, dateTime, dateNum, hours,
    dateLong, dateShort, dayName, relDay, initials, avatar, avatarBg, firstName,
    makeNoise, toast, sheet, confirmBox, download, reduceMotion, ics,
  };
})();
