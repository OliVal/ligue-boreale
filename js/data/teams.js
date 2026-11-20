// 16 équipes fictives réparties en 2 associations, avec alignements générés
import { makeRng, clamp } from '../core/util.js';
import { loadTeamData, saveTeamData } from '../save/storage.js';

import { sanitizeLook, defaultLook } from './kit.js';

const TEAM_DEFS = [
  // Association de l'Est
  ['Port-Boréal', 'Harfangs', 'PBO', '#12355b', '#f2f4f7', '#d9a441', 'Est', 82],
  ['Val-des-Glaces', 'Titans', 'VDG', '#7a1022', '#f5efe0', '#1b1b1f', 'Est', 79],
  ['Rivière-Noire', 'Loups', 'RNO', '#1d1f24', '#b8c0cc', '#c8102e', 'Est', 77],
  ['Cap-Tempête', 'Corsaires', 'CTE', '#0b6e6e', '#f1f1f1', '#f08a24', 'Est', 80],
  ['Mont-Acier', 'Forgerons', 'MAC', '#3d3f45', '#f2b705', '#f5f5f5', 'Est', 75],
  ['Baie-Saphir', 'Narvals', 'BSA', '#1456c8', '#ffffff', '#7fd4ff', 'Est', 78],
  ['Fort-Écarlate', 'Renards', 'FEC', '#c8281e', '#fff6e8', '#2a2a2a', 'Est', 81],
  ['Lac-Brume', 'Spectres', 'LBR', '#4b2a7b', '#e7e3f2', '#9be0c8', 'Est', 74],
  // Association de l'Ouest
  ['Nova-Cité', 'Comètes', 'NVC', '#0e1a40', '#ff7a1a', '#f4f4f4', 'Ouest', 83],
  ['Pic-du-Nord', 'Yétis', 'PDN', '#5aa9d6', '#ffffff', '#16324a', 'Ouest', 76],
  ['Sabledor', 'Scorpions', 'SBD', '#c79a2b', '#1c1c1c', '#f7efd9', 'Ouest', 78],
  ['Havre-Azur', 'Orques', 'HAZ', '#0a2a3c', '#19b5c8', '#f2f2f2', 'Ouest', 80],
  ['Roche-Tonnerre', 'Bisons', 'RTO', '#5a3317', '#f0d9a8', '#111111', 'Ouest', 77],
  ['Vallée-Cendre', 'Phénix', 'VCE', '#b8330f', '#ffc928', '#231f20', 'Ouest', 79],
  ['Ville-Givre', 'Lynx', 'VGI', '#1f6f4a', '#f3f3ee', '#c9c9c9', 'Ouest', 75],
  ['Côte-Émeraude', 'Dragons', 'CEM', '#0c8a55', '#111417', '#e8c547', 'Ouest', 81],
];

const FIRST = ['Alexis', 'Mathis', 'Émile', 'Noah', 'Félix', 'Tristan', 'Zachary', 'Loïc', 'Samuel', 'Olivier', 'Hugo', 'Cédric',
  'Jérémie', 'Raphaël', 'Antoine', 'Xavier', 'Liam', 'Owen', 'Cole', 'Tyler', 'Brady', 'Mason', 'Ethan', 'Lukas', 'Mikael',
  'Elias', 'Oskar', 'Viktor', 'Anton', 'Niko', 'Jonas', 'Erik', 'Dmitri', 'Pavel', 'Marek', 'Tomas', 'Jakub', 'Leo', 'Rasmus',
  'Kirill', 'Adam', 'Vincent', 'Simon', 'Thomas', 'Gabriel', 'Nathan', 'Julien', 'Marc-André', 'Philippe', 'Étienne'];
const LAST = ['Tremblay', 'Gagnon', 'Bouchard', 'Côté', 'Lavoie', 'Fortin', 'Gauthier', 'Morin', 'Pelletier', 'Bélanger', 'Lévesque',
  'Bergeron', 'Girard', 'Simard', 'Boucher', 'Caron', 'Beaulieu', 'Cloutier', 'Dubé', 'Poirier', 'Fournier', 'Lapointe', 'Leclerc',
  'Mercier', 'Deschênes', 'Savard', 'Nadeau', 'Hale', 'Whitlock', 'Mercer', 'Dawson', 'Prescott', 'Kessler', 'Brandt', 'Holloway',
  'Lindqvist', 'Sundberg', 'Halvorsen', 'Nyberg', 'Korhonen', 'Virtanen', 'Makarov', 'Sokolov', 'Novak', 'Dvorsky', 'Hradek',
  'Zelenka', 'Petrenko', 'Volkov', 'Aaltonen', 'Ekström', 'Laurin', 'Marchand-Roy', 'Desrosiers', 'Villeneuve', 'Rochon',
  'St-Onge', 'Lachance', 'Paquette', 'Thériault', 'Vaillancourt', 'Blackwood', 'Sterling', 'Ashford', 'Kovacs', 'Bjornsen'];

export const randomName = (rng) => rng.pick(FIRST) + ' ' + rng.pick(LAST);
export const F_STYLES = ['Marqueur', 'Fabricant de jeu', 'Joueur physique', 'Attaquant complet', 'Plombier'];
export const D_STYLES = ['Défenseur offensif', 'Défenseur défensif', 'Défenseur complet'];
export const G_STYLES = ['Gardien hybride', 'Gardien papillon', 'Gardien athlétique'];

// Modificateurs d'attributs par style
export const STYLE_MOD = {
  'Marqueur': { sht: 8, accu: 9, hnd: 3, pas: -3, chk: -8 },
  'Fabricant de jeu': { pas: 10, hnd: 7, sns: 6, sht: -5, chk: -9 },
  'Joueur physique': { chk: 13, sht: 3, end: 3, hnd: -7, pas: -5, spd: -3 },
  'Attaquant complet': { sns: 5, end: 4, chk: 2 },
  'Plombier': { chk: 8, end: 8, sns: 2, accu: -6, hnd: -6 },
  'Défenseur offensif': { pas: 8, sht: 6, spd: 4, hnd: 5, chk: -6 },
  'Défenseur défensif': { chk: 11, sns: 6, sht: -6, hnd: -7, pas: -3 },
  'Défenseur complet': { sns: 4, end: 3 },
  'Gardien': {},
  'Gardien hybride': { ref: 2, pos: 2 },
  'Gardien papillon': { pos: 6, ref: -1, acc: -3 },
  'Gardien athlétique': { ref: 6, pos: -2, acc: 4 },
};

function genPlayer(rng, pos, base, used, id) {
  let name;
  do { name = rng.pick(FIRST) + ' ' + rng.pick(LAST); } while (used.names.has(name));
  used.names.add(name);
  let num;
  do { num = pos === 'G' ? rng.pick([1, 29, 30, 31, 33, 35, 40, 41, 70, 72]) : rng.i(2, 98); } while (used.nums.has(num));
  used.nums.add(num);
  const style = pos === 'G' ? 'Gardien' : pos === 'D' ? rng.pick(D_STYLES) : rng.pick(F_STYLES);
  const mod = STYLE_MOD[style];
  const a = {};
  for (const k of ['spd', 'acc', 'sht', 'accu', 'hnd', 'pas', 'chk', 'end', 'sns']) {
    let v = base + rng.g() * 5 + (mod[k] || 0);
    if (pos === 'D' && (k === 'chk' || k === 'sns')) v += 4;
    if (pos === 'D' && (k === 'accu' || k === 'hnd')) v -= 4;
    a[k] = Math.round(clamp(v, 40, 99));
  }
  a.ref = Math.round(clamp(pos === 'G' ? base + 2 + rng.g() * 4 : 30, 30, 99));
  a.pos = Math.round(clamp(pos === 'G' ? base + 2 + rng.g() * 4 : 30, 30, 99));
  const ovr = pos === 'G' ? Math.round((a.ref + a.pos) / 2)
    : Math.round((a.spd + a.acc + a.sht + a.accu + a.hnd + a.pas + a.chk + a.end + a.sns) / 9);
  return { id, name, num, pos, style, hand: rng.chance(0.62) ? -1 : 1, a, ovr, age: rng.i(19, 36) };
}

export const ATTRS = ['spd', 'acc', 'sht', 'accu', 'hnd', 'pas', 'chk', 'end', 'sns'];
export const G_ATTRS = ['ref', 'pos'];
export const ATTR_LABELS = { spd: 'Vitesse', acc: 'Accélération', sht: 'Puissance du lancer', accu: 'Précision', hnd: 'Maniement',
  pas: 'Passes', chk: 'Mise en échec', end: 'Endurance', sns: 'Sens du jeu', ref: 'Réflexes', pos: 'Positionnement' };
export const SKATER_STYLES = [...F_STYLES, ...D_STYLES];
export const POS_LABELS = { LW: 'Ailier gauche', C: 'Centre', RW: 'Ailier droit', D: 'Défenseur', G: 'Gardien' };

export function calcOvr(p) {
  const a = p.a;
  return p.pos === 'G' ? Math.round((a.ref + a.pos) / 2) : Math.round(ATTRS.reduce((s, k) => s + a[k], 0) / ATTRS.length);
}
// Cote d'équipe : moyenne des joueurs, ramenée sur l'échelle des cotes d'origine
export const calcRating = (t) => Math.round(t.players.reduce((s, p) => s + p.ovr, 0) / t.players.length + RATING_OFFSET);
const RATING_OFFSET = 1;

export function generateTeam(def, idx, seed = 1000 + idx * 7919) {
  const [city, name, abbr, c1, c2, c3, conf, rating] = def;
  const rng = makeRng(seed);
  const used = { names: new Set(), nums: new Set() };
  const players = [];
  const mk = (pos, base) => { const p = genPlayer(rng, pos, base, used, `${abbr}-${players.length}`); players.push(p); return players.length - 1; };
  const F = [], D = [], Gk = [];
  for (let l = 0; l < 4; l++) {
    const b = rating + 4 - l * 4.5;
    F.push([mk('LW', b), mk('C', b + 1), mk('RW', b)]);
  }
  for (let l = 0; l < 3; l++) { const b = rating + 3 - l * 4.5; D.push([mk('D', b), mk('D', b)]); }
  Gk.push(mk('G', rating + 3), mk('G', rating - 5));
  return {
    id: idx, city, name, abbr, conf, rating,
    colors: [c1, c2, c3], jersey: 'classique', look: defaultLook(idx),
    players, lines: { F, D, G: Gk },
  };
}

// ---------- équipes modifiées et créées (éditeur d'équipe) ----------
const HEX = /^#[0-9a-f]{6}$/i;
const txt = (v, max, def) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);
const int = (v, a, b, def) => (Number.isFinite(+v) ? clamp(Math.round(+v), a, b) : def);

// Valide une équipe lue du stockage ou d'un fichier importé; renvoie null si elle est inutilisable
function sanitizeTeam(t, id, custom) {
  try {
    const L = t.lines;
    if (t.players.length !== 20 || L.F.length !== 4 || L.D.length !== 3 || L.G.length !== 2) return null;
    if (L.F.some((l) => l.length !== 3) || L.D.some((l) => l.length !== 2)) return null;
    const all = [...L.F.flat(), ...L.D.flat(), ...L.G];
    if (new Set(all).size !== 20 || all.some((i) => !Number.isInteger(i) || i < 0 || i > 19)) return null;
    const colors = [0, 1, 2].map((i) => (HEX.test(t.colors[i]) ? t.colors[i].toLowerCase() : null));
    if (colors.includes(null)) return null;
    const nums = new Set();
    const players = t.players.map((p, i) => {
      const isG = L.G.includes(i), a = {};
      for (const k of ATTRS) a[k] = int(p.a[k], 30, 99, 60);
      for (const k of G_ATTRS) a[k] = isG ? int(p.a[k], 30, 99, 70) : 30;
      let num = int(p.num, 1, 99, i + 1);
      while (nums.has(num)) num = num % 99 + 1;
      nums.add(num);
      const q = {
        id: `${id}-${i}`, name: txt(p.name, 26, 'Joueur ' + (i + 1)), num,
        pos: isG ? 'G' : ['LW', 'C', 'RW', 'D'].includes(p.pos) ? p.pos : 'C',
        style: isG ? 'Gardien' : SKATER_STYLES.includes(p.style) ? p.style : 'Attaquant complet',
        hand: p.hand === 1 ? 1 : -1, a, age: int(p.age, 17, 45, 25),
      };
      q.ovr = calcOvr(q);
      return q;
    });
    const out = {
      id, city: txt(t.city, 22, 'Ville'), name: txt(t.name, 18, 'Équipe'), abbr: txt(t.abbr, 4, 'EQP').toUpperCase(),
      conf: t.conf === 'Ouest' ? 'Ouest' : 'Est', colors, jersey: txt(t.jersey, 12, 'classique'), look: sanitizeLook(t.look, t.jersey),
      players, lines: { F: L.F.map((l) => [...l]), D: L.D.map((l) => [...l]), G: [...L.G] }, edited: true,
    };
    if (custom) out.custom = true;
    out.rating = calcRating(out);
    return out;
  } catch { return null; }
}

function sanitizeStore(raw) {
  const s = { edits: {}, custom: [] };
  if (!raw || typeof raw !== 'object') return s;
  for (const k of Object.keys(raw.edits || {})) {
    const id = +k;
    if (!Number.isInteger(id) || id < 0 || id >= TEAM_DEFS.length) continue;
    const t = sanitizeTeam(raw.edits[k], id, false);
    if (t) s.edits[id] = t;
  }
  for (const c of Array.isArray(raw.custom) ? raw.custom.slice(0, MAX_CUSTOM) : []) {
    const t = sanitizeTeam(c, 100 + s.custom.length, true);
    if (t) s.custom.push(t);
  }
  return s;
}

export const MAX_CUSTOM = 8;
let cache = null, store = null;
const getStore = () => store || (store = sanitizeStore(loadTeamData()));
const persist = () => saveTeamData(getStore());

export function getTeams() {
  if (!cache) {
    const s = getStore();
    cache = TEAM_DEFS.map((d, i) => s.edits[i] || withRating(generateTeam(d, i))).concat(s.custom);
  }
  return cache;
}
const withRating = (t) => { t.rating = calcRating(t); return t; };

// À appeler après toute modification d'une équipe : recalcule les cotes et sauvegarde
export function commitTeam(t) {
  for (const p of t.players) p.ovr = calcOvr(p);
  t.rating = calcRating(t); t.edited = true;
  if (!t.custom) getStore().edits[t.id] = t;
  return persist();
}

// Rend à une équipe d'origine son identité et son alignement de départ
export function resetTeam(t) {
  if (t.custom) return t;
  delete getStore().edits[t.id]; cache = null; persist();
  return getTeams()[t.id];
}

const NEW_COLORS = [['#1b3a6b', '#f4f4f4', '#e0a526'], ['#7b1e2b', '#f1e9d8', '#1c1c1c'], ['#14532d', '#f5f5f5', '#f2c230'],
  ['#3b1f6e', '#e9e4f5', '#58d0c0'], ['#0f172a', '#f97316', '#f8fafc'], ['#0e7490', '#f8fafc', '#facc15']];

export function createTeam() {
  const s = getStore();
  if (s.custom.length >= MAX_CUSTOM) return null;
  const n = s.custom.length + 1, c = NEW_COLORS[(n - 1) % NEW_COLORS.length];
  const t = generateTeam(['Nouvelle-Ville', 'Étoiles', 'NV' + n, ...c, 'Est', 78], 100 + s.custom.length, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  t.custom = true; t.edited = true; t.rating = calcRating(t);
  s.custom.push(t); cache = null; persist();
  return t;
}

export function deleteTeam(t) {
  const s = getStore(), i = s.custom.indexOf(t);
  if (i < 0) return;
  s.custom.splice(i, 1);
  s.custom.forEach((c, k) => { c.id = 100 + k; });
  cache = null; persist();
}

// Remplace l'alignement par 20 nouveaux joueurs générés autour de la force demandée
export function rerollRoster(t, base) {
  const g = generateTeam([t.city, t.name, t.abbr, ...t.colors, t.conf, base], t.id, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  t.players = g.players; t.lines = g.lines;
  return commitTeam(t);
}

// Reclasse les trios, les paires et les gardiens selon la cote des joueurs
export function autoLines(t) {
  const byOvr = (a, b) => t.players[b].ovr - t.players[a].ovr;
  const fw = t.lines.F.flat().sort(byOvr), df = t.lines.D.flat().sort(byOvr);
  const want = ['LW', 'C', 'RW'];
  t.lines.F = [0, 1, 2, 3].map((l) => {
    const three = fw.slice(l * 3, l * 3 + 3), line = [null, null, null];
    for (const i of three) { const k = want.indexOf(t.players[i].pos); if (k >= 0 && line[k] === null) line[k] = i; }
    for (const i of three) if (!line.includes(i)) line[line.indexOf(null)] = i;
    return line;
  });
  t.lines.D = [0, 1, 2].map((l) => df.slice(l * 2, l * 2 + 2));
  t.lines.G.sort(byOvr);
  return commitTeam(t);
}

export const exportTeams = () => JSON.stringify({ format: 'ligue-boreale-equipes', version: 1, ...getStore() });

// Importe un fichier d'équipes; renvoie le nombre d'équipes reconnues, ou -1 si le fichier est illisible
export function importTeams(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return -1; }
  if (!raw || raw.format !== 'ligue-boreale-equipes') return -1;
  const s = sanitizeStore(raw);
  store = s; cache = null; persist();
  return Object.keys(s.edits).length + s.custom.length;
}
