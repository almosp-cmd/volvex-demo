/* ==========================================================================
   Weboldal fejléc + lábléc (a kezdőlap és a foglalási oldal közösen használja)
   <html data-base="../"> jelzi, ha az oldal egy almappában van.
   ========================================================================== */
(function () {
  'use strict';

  const base = document.documentElement.dataset.base || '';
  const page = document.body.dataset.page || 'home';
  const { esc, I } = UI;
  // mindenhol kiírjuk az index.html-t, így fájlként megnyitva (file://) is működnek a linkek
  const home = page === 'home' ? '' : `${base}index.html`;

  const logoMark = `<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16.5" fill="none" stroke="currentColor" stroke-width="2.6"/>
      <path d="M9.2 8.6c6.2 5.6 6.2 17.2 0 22.8M30.8 8.6c-6.2 5.6-6.2 17.2 0 22.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  const logo = (cls = '') => `<a class="logo ${cls}" href="${base}index.html" aria-label="Volvex Tennis – kezdőlap">${logoMark}<span class="logo-t"><span class="logo-word">volvex</span><span class="logo-sub">tennis</span></span></a>`;

  const NAV = [
    ['Programok', `${home}#programok`],
    ['Pályafoglalás', `${base}foglalas/index.html`, 'booking'],
    ['Árak', `${home}#arak`],
    ['Edzőink', `${home}#edzok`],
    ['Kapcsolat', `${home}#kapcsolat`],
  ];

  function acctLabel() {
    const id = Store.customerId();
    const c = id && Store.customer(id);
    return c ? esc(UI.firstName(c.name)) : 'Belépés';
  }

  function header() {
    const el = document.getElementById('site-header');
    if (!el) return;
    el.className = 'sh';
    el.innerHTML = `
      <div class="wrap sh-in">
        ${logo()}
        <nav class="sh-nav" aria-label="Fő menü">
          ${NAV.map(([t, h, p]) => `<a href="${h}" ${p === page ? 'aria-current="page"' : ''}>${t}</a>`).join('')}
        </nav>
        <div class="sh-right">
          <a class="sh-acct" href="${base}foglalas/index.html#/fiok">${I.user}<span class="js-acct">${acctLabel()}</span></a>
          <a class="btn dark sh-book" href="${base}foglalas/index.html">Foglalás</a>
          <button class="sh-burger" aria-label="Menü" aria-expanded="false">${I.menu}</button>
        </div>
      </div>
      <div class="sh-menu" hidden>
        <nav>${NAV.map(([t, h], i) => `<a href="${h}" style="--i:${i}">${t}</a>`).join('')}
          <a href="${base}foglalas/index.html#/fiok" style="--i:${NAV.length}">Fiókom</a></nav>
        <div class="sh-menu-foot">
          <a href="tel:${esc(Store.settings().venue.phone.replace(/\s/g, ''))}">${I.phone}${esc(Store.settings().venue.phone)}</a>
          <a href="mailto:${esc(Store.settings().venue.email)}">${I.mail}${esc(Store.settings().venue.email)}</a>
        </div>
      </div>`;
    const burger = el.querySelector('.sh-burger');
    const menu = el.querySelector('.sh-menu');
    const setOpen = (on) => {
      menu.hidden = !on; burger.setAttribute('aria-expanded', on);
      document.body.classList.toggle('menu-open', on);
    };
    burger.addEventListener('click', () => setOpen(menu.hidden));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    const onScroll = () => el.classList.toggle('is-scrolled', window.scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    Store.on(() => { const a = el.querySelector('.js-acct'); if (a) a.innerHTML = acctLabel(); });
  }

  function footer() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    const s = Store.settings();
    el.className = 'sf';
    el.innerHTML = `
      <div class="wrap">
        <div class="sf-top">
          <div class="sf-brand">
            ${logo('inv')}
            <p>${esc(s.tagline)}. Beltéri teniszcsarnok négy REBOUND ACE® pályával – egész évben, minden nap.</p>
          </div>
          <div class="sf-col"><h4>Klub</h4>
            <a href="${home}#programok">Programok</a><a href="${home}#edzok">Edzőink</a><a href="${home}#gyik">Gyakori kérdések</a><a href="${home}#kapcsolat">Kapcsolat</a></div>
          <div class="sf-col"><h4>Foglalás</h4>
            <a href="${base}foglalas/index.html">Pályafoglalás</a><a href="${base}foglalas/index.html#/fiok">Fiókom</a><a href="${home}#arak">Árak és bérletek</a><a href="${home}#arak">Ajándékkártya</a></div>
          <div class="sf-col"><h4>Elérhetőség</h4>
            <a href="tel:${esc(s.venue.phone.replace(/\s/g, ''))}">${esc(s.venue.phone)}</a>
            <a href="mailto:${esc(s.venue.email)}">${esc(s.venue.email)}</a>
            <span>${esc(s.venue.address)}</span>
            <span>Minden nap ${esc(s.open)}–${esc(s.close)}</span></div>
        </div>
        <div class="sf-big" aria-hidden="true">volvex</div>
        <div class="sf-bottom">
          <span>© ${new Date().getFullYear()} ${esc(s.company.name)} · Adószám: ${esc(s.company.taxNumber)}</span>
          <span class="sf-legal"><a href="#">ÁSZF</a><a href="#">Adatkezelés</a><a href="#">Impresszum</a><a class="sf-staff" href="${base}munkatars/index.html">Munkatársaknak</a></span>
        </div>
      </div>`;
  }

  // bemutató példány: jól látható jelzés, hogy ez nem a klub éles oldala
  function demoStrip() {
    if (!Store.isDemo || document.querySelector('.demo-strip')) return;
    const el = document.createElement('div');
    el.className = 'demo-strip';
    el.innerHTML = '<b>DEMÓ</b><span>Bemutató változat – nem a klub hivatalos oldala, a foglalások és fizetések nem valódiak.</span>';
    document.body.prepend(el);
  }

  demoStrip();
  header();
  footer();
  window.Chrome = { logo, logoMark };
})();
