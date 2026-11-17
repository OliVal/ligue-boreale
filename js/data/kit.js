// Apparence d'une équipe : motif du chandail, uniformes (domicile, visiteur, rétro), logo généré, couleurs de l'aréna
export const LOOK_OPTS = {
  stripes: { none: 'Aucune', simple: 'Simple', double: 'Double', triple: 'Triple' },
  shoulders: { none: 'Unies', yoke: 'Contrastées' },
  panels: { none: 'Aucun', sides: 'Côtés', sleeves: 'Manches' },
  numStyle: { bloc: 'Bloc', contour: 'Contour', italique: 'Italique', rond: 'Arrondi' },
  logoShape: { cercle: 'Cercle', ecu: 'Écu', losange: 'Losange', hexagone: 'Hexagone', etoile: 'Étoile' },
  logoMotif: { aucun: 'Aucun', anneau: 'Anneau', chevron: 'Chevron', bande: 'Bande' },
  logoText: { abbr: 'Abréviation', initiale: 'Initiale' },
};
export const LOOK_LABELS = { stripes: 'Bandes', shoulders: 'Épaules', panels: 'Empiècements', numStyle: 'Style des numéros',
  logoShape: 'Forme', logoMotif: 'Motif', logoText: 'Lettres' };
export const DEFAULT_LOOK = { stripes: 'simple', shoulders: 'yoke', panels: 'none', numStyle: 'bloc',
  logoShape: 'cercle', logoMotif: 'anneau', logoText: 'abbr', ice: '#f3f8fc', boards: '#d9dee6' };
export const KIT_NAMES = { home: 'Domicile', away: 'Visiteur', retro: 'Rétro' };
// ancien réglage unique « style de chandail », conservé pour les sauvegardes existantes
export const JERSEY_STYLES = { classique: 'Classique', bandes: 'À bandes', contraste: 'Manches contrastées' };

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const cdist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const lum = (h) => { const c = rgb(h); return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; };

// Valide une apparence lue d'une sauvegarde ou d'un fichier importé
export function sanitizeLook(raw, legacyJersey) {
  const l = { ...DEFAULT_LOOK };
  if (!raw || typeof raw !== 'object') {
    if (legacyJersey === 'bandes') l.stripes = 'double';
    if (legacyJersey === 'contraste') l.panels = 'sleeves';
    return l;
  }
  for (const k of Object.keys(LOOK_OPTS)) if (typeof raw[k] === 'string' && LOOK_OPTS[k][raw[k]]) l[k] = raw[k];
  for (const k of ['ice', 'boards']) if (typeof raw[k] === 'string' && HEX.test(raw[k])) l[k] = raw[k].toLowerCase();
  return l;
}
export const getLook = (team) => team.look || sanitizeLook(null, team.jersey);

// Apparence de départ, variée d'une équipe à l'autre
export function defaultLook(idx) {
  const pick = (k, n) => Object.keys(LOOK_OPTS[k])[n % Object.keys(LOOK_OPTS[k]).length];
  return { ...DEFAULT_LOOK, stripes: pick('stripes', idx + 1), shoulders: idx % 3 === 1 ? 'none' : 'yoke', panels: pick('panels', idx * 2),
    numStyle: pick('numStyle', idx >> 1), logoShape: pick('logoShape', idx), logoMotif: pick('logoMotif', idx * 3 + 1) };
}

// kit = { jersey, trim, accent, pants, helmet, number, stripes, shoulders, panels, numStyle }
// variant : 'home', 'away' ou 'retro' (true / false acceptés pour domicile / visiteur)
export function kitFor(team, variant, oppPrimary) {
  const v = variant === true ? 'home' : variant === false ? 'away' : variant;
  const [c1, c2, c3] = team.colors, L = getLook(team);
  const pat = { stripes: L.stripes, shoulders: L.shoulders, panels: L.panels, numStyle: L.numStyle };
  if (v === 'retro') { // chandail crème d'époque, larges bandes
    const dark = lum(c1) < 170 ? c1 : lum(c3) < 170 ? c3 : '#2a2a2a';
    return { jersey: '#efe6cf', trim: dark, accent: lum(c2) < 215 && cdist(c2, dark) > 60 ? c2 : c3, pants: dark, helmet: dark, number: dark,
      stripes: 'triple', shoulders: 'none', panels: 'none', numStyle: 'bloc' };
  }
  // chandails spéciaux à débloquer
  if (v === 'black') { const t = lum(c1) > 70 ? c1 : lum(c2) > 70 ? c2 : c3; return { jersey: '#16161a', trim: t, accent: '#8a8f99', pants: '#16161a', helmet: '#16161a', number: '#f2f2f2', ...pat }; }
  if (v === 'gold') return { jersey: '#d4a92a', trim: '#1a1a1e', accent: '#f7f0dc', pants: '#1a1a1e', helmet: '#d4a92a', number: '#1a1a1e', ...pat };
  if (v === 'champion') { const d = lum(c1) < 170 ? c1 : '#1a1a1e'; return { jersey: '#f7f3e6', trim: '#c9a227', accent: d, pants: d, helmet: '#c9a227', number: d, ...pat, shoulders: 'yoke' }; }
  if (v === 'home') {
    const trim = lum(c2) > 60 ? c2 : c3;
    return { jersey: c1, trim, accent: cdist(c3, c1) > 60 ? c3 : trim, pants: '#1c1c22', helmet: c1, number: lum(c2) > lum(c1) ? c2 : '#ffffff', ...pat };
  }
  // visiteur : chandail blanc avec la couleur de l'équipe la plus distincte de l'adversaire
  const dk = [c1, c2, c3].filter((c) => lum(c) < 200).sort((a, b) => cdist(b, oppPrimary || '#ffffff') - cdist(a, oppPrimary || '#ffffff'));
  const main = dk[0] || c1;
  return { jersey: '#f4f4f4', trim: main, accent: dk[1] || main, pants: main, helmet: main, number: lum(main) < 150 ? main : '#111111', ...pat };
}

// ---------- logo généré avec des formes et des lettres ----------
function shapePath(ctx, shape, cx, cy, r) {
  ctx.beginPath();
  const poly = (n, rot, inner) => {
    for (let i = 0; i < n; i++) {
      const rr = inner && i % 2 ? r * inner : r, a = rot + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  };
  if (shape === 'ecu') {
    ctx.moveTo(cx - r * 0.86, cy - r * 0.9); ctx.lineTo(cx + r * 0.86, cy - r * 0.9); ctx.lineTo(cx + r * 0.86, cy + r * 0.1);
    ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.75, cx, cy + r); ctx.quadraticCurveTo(cx - r * 0.8, cy + r * 0.75, cx - r * 0.86, cy + r * 0.1);
    ctx.closePath();
  } else if (shape === 'losange') poly(4, -Math.PI / 2);
  else if (shape === 'hexagone') poly(6, 0);
  else if (shape === 'etoile') poly(16, -Math.PI / 2, 0.8);
  else ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

export function drawLogo(ctx, team, cx, cy, r) {
  const [c1, c2, c3] = team.colors, L = getLook(team);
  ctx.save();
  ctx.lineJoin = 'round';
  shapePath(ctx, L.logoShape, cx, cy, r);
  ctx.fillStyle = c1; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = c3; ctx.strokeStyle = c3;
  if (L.logoMotif === 'chevron') {
    ctx.lineWidth = r * 0.22; ctx.beginPath();
    ctx.moveTo(cx - r * 1.1, cy + r * 0.15); ctx.lineTo(cx, cy + r * 0.85); ctx.lineTo(cx + r * 1.1, cy + r * 0.15); ctx.stroke();
  } else if (L.logoMotif === 'bande') {
    ctx.translate(cx, cy); ctx.rotate(-0.5); ctx.fillRect(-r * 1.5, r * 0.34, r * 3, r * 0.26); ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else if (L.logoMotif === 'anneau') {
    ctx.lineWidth = r * 0.07; shapePath(ctx, L.logoShape, cx, cy, r * 0.8); ctx.stroke();
  }
  ctx.restore();
  shapePath(ctx, L.logoShape, cx, cy, r);
  ctx.lineWidth = r * 0.11; ctx.strokeStyle = cdist(c2, c1) > 70 ? c2 : '#ffffff'; ctx.stroke();
  const text = L.logoText === 'initiale' ? (team.name || '?').charAt(0).toUpperCase() : team.abbr;
  const size = r * (text.length <= 1 ? 1.15 : text.length === 2 ? 0.82 : text.length === 3 ? 0.62 : 0.5);
  ctx.font = `italic 900 ${size}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.14; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(text, cx, cy + size * 0.04);
  ctx.fillStyle = cdist(c2, c1) > 70 ? c2 : '#ffffff'; ctx.fillText(text, cx, cy + size * 0.04);
  ctx.restore();
}

const logoCache = new Map();
const logoKey = (t) => [t.colors.join(''), t.abbr, (t.name || '').charAt(0), getLook(t).logoShape, getLook(t).logoMotif, getLook(t).logoText].join('|');
export function logoCanvas(team) {
  const k = logoKey(team);
  let c = logoCache.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 160;
    drawLogo(c.getContext('2d'), team, 80, 80, 70);
    c.url = c.toDataURL();
    if (logoCache.size > 80) logoCache.clear();
    logoCache.set(k, c);
  }
  return c;
}
export const logoUrl = (team) => logoCanvas(team).url;
export const logoImg = (team, cls = 'lg-s') => `<img class="${cls}" src="${logoUrl(team)}" alt="">`;

// Aperçu 2D d'un uniforme (vue de dos) pour les menus
export function jerseySvg(kit, num) {
  const sleeve = kit.panels === 'sleeves' ? kit.trim : kit.jersey;
  const n = { none: 0, simple: 1, double: 2, triple: 3 }[kit.stripes] || 0;
  let bands = '';
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? kit.accent : kit.trim, y = 58 - i * 9;
    bands += `<rect x="6" y="${y}" width="20" height="6" fill="${col}"/><rect x="94" y="${y}" width="20" height="6" fill="${col}"/><rect x="28" y="${97 - i * 9}" width="64" height="6" fill="${col}"/>`;
  }
  const sides = kit.panels === 'sides' ? `<rect x="28" y="36" width="9" height="68" fill="${kit.trim}"/><rect x="83" y="36" width="9" height="68" fill="${kit.trim}"/>` : '';
  const yoke = kit.shoulders === 'yoke' ? `<rect x="6" y="22" width="108" height="13" rx="6" fill="${kit.trim}"/>` : '';
  return `<svg viewBox="0 0 120 150" width="96" height="120" aria-hidden="true">
    <rect x="38" y="104" width="44" height="34" rx="4" fill="${kit.pants}" stroke="#000" stroke-opacity=".4"/>
    <rect x="6" y="24" width="20" height="54" rx="5" fill="${sleeve}" stroke="#000" stroke-opacity=".4"/>
    <rect x="94" y="24" width="20" height="54" rx="5" fill="${sleeve}" stroke="#000" stroke-opacity=".4"/>
    <rect x="28" y="24" width="64" height="82" rx="6" fill="${kit.jersey}" stroke="#000" stroke-opacity=".4"/>
    ${sides}${yoke}${bands}
    <circle cx="60" cy="12" r="11" fill="${kit.helmet}" stroke="#000" stroke-opacity=".4"/>
    <text x="60" y="76" text-anchor="middle" font-family="Arial" font-weight="700" font-size="32" fill="${kit.number}">${num}</text></svg>`;
}
