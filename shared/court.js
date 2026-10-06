/* ==========================================================================
   Teniszpálya "kártyák" – felülnézeti pálya SVG-ben, prémium kártya-kinézettel
   ========================================================================== */
(function () {
  'use strict';

  const SURF = {
    hard: { label: 'Kemény', out: '#74787C', in: '#2E5D8C', line: '#F3F1EA' },
    clay: { label: 'Salak', out: '#B65A33', in: '#C4653B', line: '#F6EFE6' },
  };
  const surfaceLabel = (s) => (SURF[s] || SURF.hard).label;

  let seq = 0;

  // Fekvő pálya, 340×214 (bankkártya arány). Méretarány: 1 m = 11 egység.
  function courtSVG(surface) {
    const c = SURF[surface] || SURF.hard;
    const id = `cg${++seq}`;
    const s = 11;
    const L = 23.77 * s; const W = 10.97 * s;
    const x0 = (340 - L) / 2; const y0 = (214 - W) / 2;
    const sg = 1.37 * s;
    const net = x0 + L / 2;
    const svc = 6.4 * s;
    const cy = y0 + W / 2;
    const lw = 1.5;
    const post = 0.914 * s;

    let sweeps = '';
    if (surface === 'clay') {
      // halvány seprűnyomok a salakon
      for (let i = 0; i < 7; i++) {
        const y = 18 + i * 30;
        sweeps += `<path d="M-10 ${y} C 90 ${y - 14}, 250 ${y + 16}, 350 ${y - 4}" stroke="#fff" stroke-opacity=".055" stroke-width="9" fill="none"/>`;
      }
    }

    return `<svg class="cc-svg" viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="${id}l" cx="22%" cy="8%" r="95%">
          <stop offset="0" stop-color="#fff" stop-opacity=".22"/>
          <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="${id}v" cx="50%" cy="50%" r="75%">
          <stop offset=".6" stop-color="#000" stop-opacity="0"/>
          <stop offset="1" stop-color="#000" stop-opacity=".28"/>
        </radialGradient>
      </defs>
      <rect width="340" height="214" fill="${c.out}"/>
      <rect x="${x0}" y="${y0}" width="${L}" height="${W}" fill="${c.in}"/>
      ${sweeps}
      <g stroke="${c.line}" stroke-width="${lw}" fill="none" stroke-linecap="square">
        <rect x="${x0}" y="${y0}" width="${L}" height="${W}"/>
        <line x1="${x0}" y1="${y0 + sg}" x2="${x0 + L}" y2="${y0 + sg}"/>
        <line x1="${x0}" y1="${y0 + W - sg}" x2="${x0 + L}" y2="${y0 + W - sg}"/>
        <line x1="${net - svc}" y1="${y0 + sg}" x2="${net - svc}" y2="${y0 + W - sg}"/>
        <line x1="${net + svc}" y1="${y0 + sg}" x2="${net + svc}" y2="${y0 + W - sg}"/>
        <line x1="${net - svc}" y1="${cy}" x2="${net + svc}" y2="${cy}"/>
        <line x1="${x0}" y1="${cy}" x2="${x0 + 4}" y2="${cy}"/>
        <line x1="${x0 + L - 4}" y1="${cy}" x2="${x0 + L}" y2="${cy}"/>
      </g>
      <line x1="${net + 2.6}" y1="${y0 - post}" x2="${net + 2.6}" y2="${y0 + W + post}" stroke="#000" stroke-opacity=".18" stroke-width="3.2"/>
      <line x1="${net}" y1="${y0 - post}" x2="${net}" y2="${y0 + W + post}" stroke="#1B1B1A" stroke-width="2.2"/>
      <line x1="${net}" y1="${y0 - post}" x2="${net}" y2="${y0 + W + post}" stroke="#fff" stroke-opacity=".75" stroke-width=".7"/>
      <circle cx="${net}" cy="${y0 - post}" r="2.4" fill="#1B1B1A"/>
      <circle cx="${net}" cy="${y0 + W + post}" r="2.4" fill="#1B1B1A"/>
      <rect width="340" height="214" fill="url(#${id}l)"/>
      <rect width="340" height="214" fill="url(#${id}v)"/>
    </svg>`;
  }

  const ballSVG = (size = 18) => `<svg class="ball-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#DDF247"/>
      <path d="M4.2 5.2c3.9 3.4 3.9 10.2 0 13.6M19.8 5.2c-3.9 3.4-3.9 10.2 0 13.6" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    </svg>`;

  /**
   * Pályakártya HTML.
   * rot: 0 = fekvő, 90 = álló (a körhintában)
   */
  function card(court, { rot = 0, shared = false, sharedKey = '', chip = '', cls = '', label = '', brand = '' } = {}) {
    const no = String(court.no).padStart(2, '0');
    const key = sharedKey || (shared ? `court:${court.id}` : '');
    return `<div class="court-card surface-${court.surface || 'hard'} ${cls}" data-court="${court.id}" data-rot="${rot}"${key ? ` data-shared="${key}"` : ''}>
      ${courtSVG(court.surface)}
      <div class="cc-grain"></div>
      <div class="cc-sheen"></div>
      ${chip ? `<div class="cc-chip">${chip}</div>` : ''}
      <div class="cc-ball">${ballSVG(20)}</div>
      <div class="cc-label">${label || `PÁLYA&nbsp;${no}`}</div>
      <div class="cc-brand">${brand || surfaceLabel(court.surface)}</div>
    </div>`;
  }

  // Kis négyzetes pályaikon a listákban
  function mini(court, cls = '') {
    const c = SURF[court.surface] || SURF.hard;
    return `<span class="court-mini ${cls}" data-court="${court.id}" style="--out:${c.out};--in:${c.in}">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <rect x="9" y="5" width="26" height="34" rx="1" fill="${c.in}"/>
        <g stroke="${c.line}" stroke-width="1.1" fill="none" opacity=".75">
          <rect x="9" y="5" width="26" height="34"/>
          <line x1="12.3" y1="5" x2="12.3" y2="39"/><line x1="31.7" y1="5" x2="31.7" y2="39"/>
          <line x1="12.3" y1="12.5" x2="31.7" y2="12.5"/><line x1="12.3" y1="31.5" x2="31.7" y2="31.5"/>
          <line x1="22" y1="12.5" x2="22" y2="31.5"/>
        </g>
        <line x1="6" y1="22" x2="38" y2="22" stroke="#161616" stroke-width="1.6"/>
      </svg>
      <b>${court.no}</b>
    </span>`;
  }

  window.Court = { card, mini, ballSVG, surfaceLabel, SURF };
})();
