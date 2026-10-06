/* ==========================================================================
   Számla nézet + nyomtatás (az ügyfél fiókja és az admin is ezt használja)
   Demó módban vízjellel jelöljük, hogy nem valós számla. Élesben a számlát
   a számlázó szolgáltató (pl. Számlázz.hu / Billingo) állítja ki és küldi a
   NAV-nak – itt csak a megjelenítés és a letöltés marad.
   ========================================================================== */
(function () {
  'use strict';

  const { esc, money } = UI;
  const net = (gross, vat) => Math.round(gross / (1 + vat / 100));

  function html(inv) {
    const s = Store.settings();
    const c = s.company;
    const storno = inv.status === 'storno';
    const orig = storno && inv.stornoOf ? Store.invoice(inv.stornoOf) : null;
    const rows = inv.items.map((it) => {
      const qty = it.qty || 1;
      const g = it.gross * qty; const n = net(g, it.vat);
      return `<tr><td>${esc(it.name)}</td><td class="r">${qty} ${esc(it.unit || 'db')}</td><td class="r">${money(net(it.gross, it.vat))}</td><td class="r">${it.vat}%</td><td class="r">${money(n)}</td><td class="r">${money(g - n)}</td><td class="r b">${money(g)}</td></tr>`;
    }).join('');
    const totals = {};
    inv.items.forEach((it) => {
      const g = it.gross * (it.qty || 1);
      totals[it.vat] = totals[it.vat] || { g: 0, n: 0 };
      totals[it.vat].g += g; totals[it.vat].n += net(g, it.vat);
    });
    const tn = Object.values(totals).reduce((a, t) => a + t.n, 0);
    return `<div class="invoice ${storno ? 'is-storno' : ''} ${inv.status === 'stornoed' ? 'is-stornoed' : ''}">
      ${Store.isDemo ? '<div class="inv-wm" aria-hidden="true">DEMÓ · NEM VALÓS SZÁMLA</div>' : ''}
      <header class="inv-head">
        <div class="inv-brand"><svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="20" r="16.5" fill="none" stroke="#2DC3E6" stroke-width="2.6"/><path d="M9.2 8.6c6.2 5.6 6.2 17.2 0 22.8M30.8 8.6c-6.2 5.6-6.2 17.2 0 22.8" fill="none" stroke="#2DC3E6" stroke-width="2.2" stroke-linecap="round"/></svg><span>${esc(s.clubName)}</span></div>
        <div class="inv-title"><h2>${storno ? 'Sztornó számla' : 'Számla'}</h2><span>Sorszám: <b>${esc(inv.no)}</b></span>${inv.status === 'stornoed' ? '<em>Sztornózva</em>' : ''}</div>
      </header>
      <div class="inv-parties">
        <div><small>Eladó</small><b>${esc(c.name)}</b><span>${esc(c.address)}</span><span>Adószám: ${esc(c.taxNumber)}</span>${c.regNumber ? `<span>Cégjegyzékszám: ${esc(c.regNumber)}</span>` : ''}${c.bank ? `<span>Bankszámla: ${esc(c.bank)}</span>` : ''}</div>
        <div><small>Vevő</small><b>${esc(inv.buyer.name)}</b>${inv.buyer.address ? `<span>${esc(inv.buyer.address)}</span>` : ''}${inv.buyer.taxNumber ? `<span>Adószám: ${esc(inv.buyer.taxNumber)}</span>` : ''}${inv.buyer.email ? `<span>${esc(inv.buyer.email)}</span>` : ''}</div>
      </div>
      <div class="inv-meta">
        <div><small>Kelt</small><b>${esc(UI.dateNum(inv.issuedAt))}</b></div>
        <div><small>Teljesítés</small><b>${esc(UI.dateNum(inv.fulfilledAt || inv.issuedAt))}</b></div>
        <div><small>Fizetési határidő</small><b>${esc(UI.dateNum(inv.dueAt || inv.issuedAt))}</b></div>
        <div><small>Fizetési mód</small><b>${esc(Store.PAY_METHODS[inv.method] || inv.method || '—')}</b></div>
      </div>
      ${orig ? `<p class="inv-note">A(z) <b>${esc(orig.no)}</b> sorszámú számla sztornózása.</p>` : ''}
      <table class="inv-table">
        <thead><tr><th>Megnevezés</th><th class="r">Menny.</th><th class="r">Nettó egységár</th><th class="r">ÁFA</th><th class="r">Nettó</th><th class="r">ÁFA összeg</th><th class="r">Bruttó</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="inv-totals">
        <div><span>Nettó összesen</span><b>${money(tn)}</b></div>
        ${Object.entries(totals).map(([v, t]) => `<div><span>ÁFA ${v}%</span><b>${money(t.g - t.n)}</b></div>`).join('')}
        <div class="grand"><span>Fizetendő (bruttó)</span><b>${money(inv.total)}</b></div>
      </div>
      <footer class="inv-foot">${['card', 'pos', 'cash', 'szep'].includes(inv.method) && !storno ? 'A számla összege kiegyenlítve. ' : ''}A számla elektronikus úton készült, aláírás nélkül is érvényes.</footer>
    </div>`;
  }

  function print(inv) {
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = html(inv);
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }

  function open(inv, { actions = '' } = {}) {
    const sh = UI.sheet({
      title: inv.status === 'storno' ? 'Sztornó számla' : 'Számla',
      sub: esc(inv.no),
      cls: 'inv-sheet tall',
      body: html(inv),
      footer: `${actions}<button class="btn ghost" data-close>Bezárás</button><button class="btn dark js-print">${UI.I.print}Nyomtatás / PDF</button>`,
    });
    sh.el.querySelector('.js-print').addEventListener('click', () => print(inv));
    return sh;
  }

  window.Invoice = { html, open, print };
})();
