/* ==========================================================================
   Router, képernyőváltás és "közös elem" (pályakártya) átrepülés
   ========================================================================== */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const layer = document.getElementById('layer');
  const ASPECT = 214 / 340;
  const DEPTH = { login: 0, home: 1, day: 2, potlas: 2, slot: 3 };

  let current = null;
  let pendingFrom = null;
  let pushed = 0; // hány lépést navigáltunk előre az appon belül (Vissza gombhoz)

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    return { parts: path.split('/').filter(Boolean), params: Object.fromEntries(new URLSearchParams(q || '')) };
  }

  const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const hhmm = (s) => (/^\d{4}$/.test(s || '') ? `${s.slice(0, 2)}:${s.slice(2)}` : /^\d{2}:\d{2}$/.test(s || '') ? s : null);

  function resolve({ parts, params }) {
    let auth = Store.staffAuth();
    if (auth && !Store.coach(auth.id)) { Store.setStaffAuth(null); auth = null; }
    if (!auth) return { screen: 'login' };
    const [a, b, c] = parts;
    if (a === 'slot' && isYmd(b) && hhmm(c)) return { screen: 'slot', date: b, start: hhmm(c), g: params.g || null };
    if (a === 'day' && isYmd(b)) return { screen: 'day', date: b, start: hhmm(params.t) };
    if (a === 'potlas') return { screen: 'potlas' };
    return { screen: 'home', week: isYmd(params.week) ? params.week : null };
  }

  function go(path, { from = null, replace = false } = {}) {
    pendingFrom = from;
    const target = `#/${path.replace(/^[#/]+/, '')}`;
    if (replace) { history.replaceState(null, '', target); route(); return; }
    pushed++;
    if (location.hash === target) route();
    else location.hash = target;
  }

  function back(fallback) {
    if (pushed > 0) { pushed--; history.back(); } else go(fallback, { replace: true });
  }

  const SCREENS = {
    login: (ctx) => Coach.login(ctx),
    home: (ctx) => Coach.home(ctx),
    day: (ctx) => Coach.day(ctx),
    slot: (ctx) => Coach.slot(ctx),
    potlas: (ctx) => Coach.potlas(ctx),
  };

  function route() {
    const r = resolve(parseHash());
    if (current && current.r.screen === r.screen && current.api.update) {
      current.r = r;
      current.api.update(r);
      pendingFrom = null;
      return;
    }
    const el = document.createElement('section');
    el.className = `screen scr-${r.screen}`;
    const api = SCREENS[r.screen]({ el, r }) || {};
    swap({ el, r, api });
  }

  function kill(s) {
    s.api.destroy && s.api.destroy();
    s.el.remove();
  }

  function visible(el) {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.bottom > 0 && b.top < innerHeight;
  }

  function swap(next) {
    const prev = current;
    app.appendChild(next.el);
    current = next;
    next.api.mount && next.api.mount();

    if (!prev || UI.reduceMotion()) {
      if (prev) kill(prev);
      pendingFrom = null;
      next.api.entered && next.api.entered();
      return;
    }

    const forward = (DEPTH[next.r.screen] ?? 1) >= (DEPTH[prev.r.screen] ?? 1);
    const target = next.el.querySelector('[data-shared]');
    let source = null;
    if (target) {
      const key = target.dataset.shared;
      source = pendingFrom && prev.el.contains(pendingFrom) ? pendingFrom : prev.el.querySelector(`[data-shared="${key}"]`);
    }
    pendingFrom = null;
    const morphing = !!(source && target && visible(source));
    if (morphing) morph(source, target);

    prev.el.style.pointerEvents = 'none';
    prev.el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${forward ? -10 : 10}px) scale(${forward ? 0.985 : 1})` }],
      { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
    ).finished.then(() => kill(prev));
    next.el.animate(
      [{ opacity: 0, transform: `translateY(${forward ? 16 : -12}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 460, delay: morphing ? 160 : 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
    ).finished.then(() => next.api.entered && next.api.entered());
  }

  // Egy elem geometriája "fekvő kártya" koordinátákban
  function geom(el) {
    const b = el.getBoundingClientRect();
    const rot = Number(el.dataset.rot || 0);
    return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: rot % 180 ? b.height : b.width, rot };
  }

  // A célkártya klónját a forrás helyéről a cél helyére repíti (forgatással)
  function morph(source, target, { duration = 720 } = {}) {
    const s = geom(source); const t = geom(target);
    if (!t.w || !s.w) return null;
    const clone = target.cloneNode(true);
    clone.removeAttribute('data-shared');
    clone.classList.add('is-morph');
    const tw = t.w; const th = t.w * ASPECT;
    Object.assign(clone.style, {
      position: 'fixed', left: `${t.cx - tw / 2}px`, top: `${t.cy - th / 2}px`,
      width: `${tw}px`, height: `${th}px`, margin: '0', zIndex: 60,
    });
    layer.appendChild(clone);
    const fromCard = source.classList.contains('court-card');
    target.style.visibility = 'hidden';
    source.style.visibility = 'hidden';
    const from = `translate(${s.cx - t.cx}px, ${s.cy - t.cy}px) rotate(${s.rot}deg) scale(${s.w / t.w})`;
    const to = `translate(0px, 0px) rotate(${t.rot}deg) scale(1)`;
    const kf = fromCard
      ? [{ transform: from }, { transform: to }]
      : [{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.22 }, { transform: to, opacity: 1 }];
    const a = clone.animate(kf, { duration, easing: 'cubic-bezier(.32,.72,0,1)' });
    a.finished.then(() => { target.style.visibility = ''; clone.remove(); });
    return a;
  }

  // ---------- indulás ----------
  UI.makeNoise();
  window.addEventListener('hashchange', route);
  Store.on(() => current && current.api.refresh && current.api.refresh());
  window.App = { go, back, morph, get current() { return current; } };
  route();

  // telepíthető webapp (csak http/https alatt)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
