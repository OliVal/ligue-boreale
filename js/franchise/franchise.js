// Mode Franchise : logique pure (aucun affichage), testable avec Node.
// Saison, séries, statistiques, blessures, moral, échanges, plafond salarial, contrats, agents libres, repêchage, retraites.
import { getTeams, calcOvr, ATTRS, randomName, STYLE_MOD, F_STYLES, D_STYLES } from '../data/teams.js';
import { makeRng, clamp } from '../core/util.js';

const rnd = makeRng((Date.now() ^ 0x2f6e2b1) >>> 0);
export const seedFranchise = (n) => rnd.seed(n);
const poisson = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd.f(); } while (p > L); return k - 1; };
const r2 = (x) => Math.round(x * 100) / 100;
const wpick = (arr, w) => { let s = 0; for (const x of arr) s += w(x); let r = rnd.f() * s; for (const x of arr) { r -= w(x); if (r <= 0) return x; } return arr[arr.length - 1]; };

export const MAX_ROSTER = 26;
export const REGIONS = ['Cantons de l\'Est', 'Plaines de l\'Ouest', 'Grand Nord', 'Outre-mer'];
export const TROPHIES = { mvp: 'Trophée Aurore (joueur le plus utile)', pts: 'Trophée Comète (meilleur pointeur)', gk: 'Trophée Rempart (meilleur gardien)',
  def: 'Trophée Bastion (meilleur défenseur)', rook: 'Trophée Étincelle (recrue de l\'année)' };
export const CUP = 'Coupe Boréale';
export const isF = (p) => p.pos !== 'D' && p.pos !== 'G';
export const group = (p) => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');
const zeroSt = () => ({ gp: 0, g: 0, a: 0, sog: 0, pim: 0, pm: 0, hits: 0, gs: 0, w: 0, sa: 0, ga: 0, so: 0 });
const ST_KEYS = Object.keys(zeroSt());

// ---------- joueurs ----------
export function salFor(ovr, age) {
  const s = 0.8 + Math.pow(Math.max(0, ovr - 66), 1.25) * 0.14;
  return r2(clamp(s * (age >= 33 ? 0.8 : 1), 0.8, 14));
}
export const ask = (p) => r2(salFor(p.ovr, p.age) * (p.morale < 35 ? 1.25 : 1) * (p.age <= 22 && p.pot - p.ovr > 6 ? 1.15 : 1));

function mkPlayer(f, pos, base, age) {
  const style = pos === 'G' ? 'Gardien' : pos === 'D' ? rnd.pick(D_STYLES) : rnd.pick(F_STYLES), mod = STYLE_MOD[style], a = {};
  for (const k of ATTRS) {
    let v = base + rnd.g() * 4 + (mod[k] || 0);
    if (pos === 'D' && (k === 'chk' || k === 'sns')) v += 4;
    if (pos === 'D' && (k === 'accu' || k === 'hnd')) v -= 4;
    a[k] = Math.round(clamp(v, 35, 99));
  }
  a.ref = Math.round(clamp(pos === 'G' ? base + 2 + rnd.g() * 3 : 30, 30, 99));
  a.pos = Math.round(clamp(pos === 'G' ? base + 2 + rnd.g() * 3 : 30, 30, 99));
  const p = { id: 'f' + (f.nextId++), name: randomName(rnd), num: rnd.i(2, 98), pos, style, hand: rnd.chance(0.62) ? -1 : 1, a, age };
  p.ovr = calcOvr(p);
  return ext(p);
}
// Ajoute les champs propres à la Franchise
function ext(p) {
  p.pot = Math.round(clamp(p.ovr + Math.max(0, 27 - p.age) * rnd.r(0.2, 1.5), p.ovr, 97));
  p.morale = 65; p.inj = 0; p.st = zeroSt(); p.aw = []; p.hist = [];
  p.con = { sal: r2(salFor(p.ovr, p.age) * rnd.r(0.9, 1.1)), yrs: rnd.i(1, 4) };
  // carrière antérieure plausible pour les vétérans
  const yrs = Math.max(0, p.age - 20), gp = yrs * 28, ppg = clamp((p.ovr - 62) * 0.045, 0.05, 1.3) * (p.pos === 'D' ? 0.55 : 1);
  p.car = zeroSt();
  if (p.pos === 'G') { p.car.gp = p.car.gs = Math.round(gp * 0.6); p.car.w = Math.round(p.car.gs * clamp(0.3 + (p.ovr - 70) * 0.02, 0.2, 0.7)); p.car.sa = p.car.gs * 29; p.car.ga = Math.round(p.car.sa * clamp(0.1 - (p.ovr - 75) * 0.002, 0.06, 0.13)); }
  else { p.car.gp = gp; p.car.g = Math.round(gp * ppg * 0.4); p.car.a = Math.round(gp * ppg * 0.6); }
  return p;
}
function fixNum(t, p) {
  const used = new Set(t.players.filter((q) => q !== p).map((q) => q.num));
  while (used.has(p.num)) p.num = p.num % 98 + 1;
}

// ---------- création ----------
export function newFranchise(userTeam) {
  const f = { v: 1, year: 1, user: userTeam, nextId: 1, phase: 'season', news: [], history: [], hof: [], fa: [], scouts: [0, 1, 2], po: null, trades: 0 };
  f.teams = JSON.parse(JSON.stringify(getTeams().slice(0, 16)));
  f.teams.forEach((t, i) => {
    t.id = i;
    const old = t.lines, P = t.players;
    for (const p of P) ext(p);
    t.lines = { F: old.F.map((l) => l.map((x) => P[x].id)), D: old.D.map((l) => l.map((x) => P[x].id)), G: old.G.map((x) => P[x].id) };
    for (const [pos, d] of [['C', 13], ['RW', 14], ['D', 13], ['G', 12]]) { const p = mkPlayer(f, pos, t.rating - d, rnd.i(19, 30)); t.players.push(p); fixNum(t, p); }
  });
  for (let i = 0; i < 24; i++) f.fa.push(mkPlayer(f, rnd.pick(['C', 'LW', 'RW', 'D', 'D', 'G']), rnd.r(60, 73), rnd.i(22, 34)));
  f.cap = Math.ceil(Math.max(...f.teams.map(payroll)) * 1.03);
  startSeason(f);
  note(f, `Tu prends les commandes des ${f.teams[userTeam].name} de ${f.teams[userTeam].city}. Plafond salarial : ${f.cap} M$.`);
  return f;
}
export function note(f, txt) { f.news.unshift(txt); if (f.news.length > 14) f.news.length = 14; }
export const payroll = (t) => r2(t.players.reduce((s, p) => s + p.con.sal, 0));
export const capRoom = (f, t) => r2(f.cap - payroll(t));
export const byId = (t, id) => t.players.find((p) => p.id === id);
export const lineupIds = (t) => [...t.lines.F.flat(), ...t.lines.D.flat(), ...t.lines.G];

// ---------- alignement ----------
// keep = true : garde les choix existants et ne remplace que les joueurs blessés ou partis
export function setLines(f, t, keep = false) {
  const ok = (p) => p && p.inj <= 0;
  for (const g of ['F', 'D', 'G']) {
    const need = { F: 12, D: 6, G: 2 }[g];
    while (t.players.filter((p) => group(p) === g && ok(p)).length < need) { // rappel d'urgence
      const p = mkPlayer(f, g === 'F' ? rnd.pick(['C', 'LW', 'RW']) : g, 58, rnd.i(20, 27));
      p.con = { sal: 0.8, yrs: 1 }; p.pot = p.ovr + 2; t.players.push(p); fixNum(t, p);
    }
  }
  const pool = (g) => t.players.filter((p) => group(p) === g && ok(p)).sort((x, y) => y.ovr - x.ovr);
  if (!keep) {
    const fw = pool('F').slice(0, 12), take = (pos) => { const i = fw.findIndex((p) => p.pos === pos); return fw.splice(i >= 0 ? i : 0, 1)[0]; };
    const F = [];
    for (let l = 0; l < 4; l++) F.push([take('LW'), take('C'), take('RW')].map((p) => p.id));
    const d = pool('D'), gk = pool('G');
    t.lines = { F, D: [0, 1, 2].map((l) => [d[l * 2].id, d[l * 2 + 1].id]), G: [gk[0].id, gk[1].id] };
    return;
  }
  const used = new Set(lineupIds(t).filter((id) => ok(byId(t, id))));
  const fill = (arr, g) => arr.forEach((id, i) => {
    if (ok(byId(t, id))) return;
    const rep = pool(g).find((p) => !used.has(p.id));
    arr[i] = rep.id; used.add(rep.id);
  });
  t.lines.F.forEach((l) => fill(l, 'F')); t.lines.D.forEach((l) => fill(l, 'D')); fill(t.lines.G, 'G');
}
// Échange deux joueurs dans l'alignement (ou un joueur aligné et un réserviste)
export function swapLine(t, idA, idB) {
  const a = byId(t, idA), b = byId(t, idB);
  if (!a || !b || group(a) !== group(b) || a.inj > 0 || b.inj > 0) return false;
  const all = [...t.lines.F, ...t.lines.D, t.lines.G];
  for (const l of all) for (let i = 0; i < l.length; i++) l[i] = l[i] === idA ? idB : l[i] === idB ? idA : l[i];
  return true;
}
const moraleAdj = (p) => clamp(Math.round((p.morale - 60) / 15), -3, 2);

// Équipe au format du moteur de match : 20 joueurs alignés, attributs ajustés par le moral
export function matchTeam(t) {
  const ids = lineupIds(t);
  const players = ids.map((id) => {
    const p = byId(t, id), adj = moraleAdj(p), a = { ...p.a };
    for (const k of ATTRS) a[k] = clamp(a[k] + adj, 30, 99);
    // season : statistiques de la saison en cours (bandeau d'un but, carte du gardien de la cérémonie)
    return { id: p.id, name: p.name, num: p.num, pos: p.pos, style: p.style, hand: p.hand, a, ovr: p.ovr, age: p.age, season: p.st ? { ...p.st } : null };
  });
  const { players: _p, lines: _l, ...rest } = t;
  return { ...rest, players, lines: { F: [0, 1, 2, 3].map((l) => [l * 3, l * 3 + 1, l * 3 + 2]), D: [0, 1, 2].map((l) => [12 + l * 2, 13 + l * 2]), G: [18, 19] } };
}

function strength(t) {
  const o = (id) => { const p = byId(t, id); return p ? p.ovr + moraleAdj(p) : 58; }; // à l'intersaison, un joueur aligné peut être parti
  const avg = (l) => l.reduce((s, id) => s + o(id), 0) / l.length;
  const F = [0.34, 0.28, 0.22, 0.16].reduce((s, w, i) => s + w * avg(t.lines.F[i]), 0);
  const D = [0.4, 0.35, 0.25].reduce((s, w, i) => s + w * avg(t.lines.D[i]), 0);
  return { off: F * 0.7 + D * 0.3, def: D * 0.4 + o(t.lines.G[0]) * 0.45 + F * 0.15 };
}
export const teamRating = (t) => { const s = strength(t); return Math.round((s.off + s.def) / 2); };

// ---------- calendrier et classement ----------
function roundRobin(n) {
  const ids = [...Array(n).keys()], out = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) { const x = ids[i], y = ids[n - 1 - i]; round.push((r + i) % 2 ? [x, y] : [y, x]); }
    out.push(round); ids.splice(1, 0, ids.pop());
  }
  return out;
}
function startSeason(f) {
  const rr = roundRobin(16);
  f.rounds = rr.concat(rr.map((r) => r.map(([h, a]) => [a, h])));
  f.round = 0; f.po = null; f.phase = 'season'; f.log = [];
  f.table = f.teams.map(() => ({ gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0 }));
  for (const t of f.teams) { for (const p of t.players) { p.st = zeroSt(); p.inj = 0; } setLines(f, t, t.id === f.user); }
  genDraftClass(f);
}
export function standings(f, conf = null) {
  return f.table.map((r, i) => ({ ...r, i, team: f.teams[i], me: i === f.user }))
    .filter((r) => !conf || r.team.conf === conf)
    .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}
export const rankOf = (f, i) => standings(f).findIndex((r) => r.i === i) + 1;

export function nextGame(f) {
  if (f.phase === 'season') {
    const pair = f.rounds[f.round].find((p) => p.includes(f.user));
    return { home: pair[0] === f.user, opp: pair[0] === f.user ? pair[1] : pair[0] };
  }
  if (f.phase === 'playoffs') {
    const s = f.po.series.find((q) => !q.done && (q.a === f.user || q.b === f.user));
    if (!s) return null;
    const home = seriesHome(s) === f.user;
    return { home, opp: s.a === f.user ? s.b : s.a, series: s };
  }
  return null;
}
export function matchTeams(f) {
  const g = nextGame(f), me = f.teams[f.user], opp = f.teams[g.opp];
  setLines(f, me, true); setLines(f, opp, false);
  const a = matchTeam(me), b = matchTeam(opp);
  return { home: g.home ? a : b, away: g.home ? b : a, userHome: g.home };
}

// ---------- simulation d'un match ----------
function simScore(h, a) {
  const sh = strength(h), sa = strength(a);
  let gh = poisson(Math.max(0.8, 3.0 + (sh.off - sa.def) * 0.09 + 0.12)), ga = poisson(Math.max(0.8, 2.95 + (sa.off - sh.def) * 0.09)), ot = false;
  if (gh === ga) { ot = true; if (rnd.chance(0.5)) gh++; else ga++; }
  return { gh, ga, ot, shH: Math.max(gh + 12, poisson(29 + (sh.off - sa.def) * 0.4)), shA: Math.max(ga + 12, poisson(28 + (sa.off - sh.def) * 0.4)) };
}
const FW = [0.38, 0.28, 0.2, 0.14], DW = [0.42, 0.35, 0.23];
const pickLine = (W) => { let r = rnd.f(); for (let i = 0; i < W.length; i++) { r -= W[i]; if (r <= 0) return i; } return W.length - 1; };
// Feuille de match estimée : buts, aides, tirs et +/- répartis selon les trios
function box(t, opp, gf, shots, soGoal) {
  const P = (id) => byId(t, id);
  for (let k = 0; k < gf - (soGoal ? 1 : 0); k++) {
    const fl = t.lines.F[pickLine(FW)].map(P), dl = t.lines.D[pickLine(DW)].map(P), on = [...fl, ...dl];
    const sc = rnd.chance(0.82) ? wpick(fl, (p) => p.a.sht + p.a.accu - 90) : rnd.pick(dl);
    sc.st.g++; sc.st.sog++;
    const others = on.filter((p) => p !== sc);
    if (rnd.chance(0.9)) { const a1 = wpick(others, (p) => p.a.pas - 40); a1.st.a++; if (rnd.chance(0.65)) wpick(others.filter((p) => p !== a1), (p) => p.a.pas - 40).st.a++; }
    for (const p of on) p.st.pm++;
    for (const id of [...opp.lines.F[pickLine(FW)], ...opp.lines.D[pickLine(DW)]]) byId(opp, id).st.pm--;
  }
  for (let k = 0; k < shots - gf; k++) (rnd.chance(0.75) ? P(rnd.pick(t.lines.F[pickLine(FW)])) : P(rnd.pick(t.lines.D[pickLine(DW)]))).st.sog++;
  for (let k = poisson(1.6); k > 0; k--) P(rnd.pick(lineupIds(t).slice(0, 18))).st.pim += 2;
  for (const id of lineupIds(t).slice(0, 18)) P(id).st.hits += poisson(P(id).a.chk / 55);
}
function goalieLine(t, shots, ga, win) {
  const g = byId(t, t.lines.G[rnd.chance(0.85) ? 0 : 1]).st;
  g.gs++; g.gp++; g.sa += shots; g.ga += ga; if (win) g.w++; if (!ga) g.so++;
}
// Après chaque match : présences, blessures, moral
function postGame(f, t, win, playoff) {
  const ids = new Set(lineupIds(t)), top = t.players.filter((p) => group(p) !== 'G').sort((x, y) => y.ovr - x.ovr).slice(0, 9);
  for (const p of t.players) {
    if (ids.has(p.id) && p.pos !== 'G' && !playoff) p.st.gp++;
    if (p.inj > 0) { p.inj--; if (!p.inj && t.id === f.user) note(f, `${p.name} est rétabli et peut revenir au jeu.`); continue; }
    let d = win ? 0.8 : -0.8;
    if (!ids.has(p.id) && p.ovr >= 68) d -= 0.9;                                    // laissé de côté
    if (top.includes(p) && (t.lines.F[3].includes(p.id) || !ids.has(p.id))) d -= 1; // vedette mal utilisée
    if (t.lines.F[0].includes(p.id) || t.lines.D[0].includes(p.id)) d += 0.3;
    p.morale = clamp(p.morale + d + (65 - p.morale) * 0.02, 0, 100);
    if (ids.has(p.id) && rnd.chance(0.006)) {
      p.inj = rnd.chance(0.3) ? rnd.i(8, 20) : rnd.i(1, 6);
      if (t.id === f.user) note(f, `Blessure : ${p.name} ratera ${p.inj} match${p.inj > 1 ? 's' : ''}.`);
    }
  }
  setLines(f, t, t.id === f.user);
}
function tableAdd(f, h, a, gh, ga, ot) {
  const H = f.table[h], A = f.table[a];
  H.gp++; A.gp++; H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
  const W = gh > ga ? H : A, L = gh > ga ? A : H;
  W.w++; W.pts += 2; if (ot) { L.otl++; L.pts++; } else L.l++;
}
function simGame(f, h, a, playoff) {
  const H = f.teams[h], A = f.teams[a], r = simScore(H, A);
  if (!playoff) {
    box(H, A, r.gh, r.shH, r.ot && r.gh > r.ga && rnd.chance(0.4)); box(A, H, r.ga, r.shA, r.ot && r.ga > r.gh && rnd.chance(0.4));
    goalieLine(H, r.shA, r.ga, r.gh > r.ga); goalieLine(A, r.shH, r.gh, r.ga > r.gh);
    tableAdd(f, h, a, r.gh, r.ga, r.ot);
  }
  postGame(f, H, r.gh > r.ga, playoff); postGame(f, A, r.ga > r.gh, playoff);
  return r;
}
// Résultat d'un match joué avec le vrai moteur (m : Match terminé)
export function fromMatch(f, m) {
  const g = nextGame(f), playoff = f.phase === 'playoffs';
  const ui = g.home ? 0 : 1, U = m.teams[ui], O = m.teams[1 - ui];
  if (!playoff) for (const [mt, t] of [[U, f.teams[f.user]], [O, f.teams[g.opp]]]) {
    for (const pl of mt.roster) {
      const p = byId(t, pl.d.id), s = pl.st; if (!p) continue;
      if (p.pos === 'G') { if (s.sa > 0) { p.st.gs++; p.st.gp++; p.st.sa += s.sa; p.st.ga += s.ga; if (m.winner === mt) p.st.w++; if (!s.ga) p.st.so++; } continue; }
      p.st.g += s.g; p.st.a += s.a; p.st.sog += s.sog; p.st.pim += s.pim; p.st.hits += s.hits;
    }
  }
  return { gf: U.score, ga: O.score, ot: m.period > 3 };
}

// Joue la journée (saison) ou le prochain match de chaque série; mine = { gf, ga, ot } si le joueur a joué son match
export function advance(f, mine = null) {
  const g = nextGame(f);
  let res = null;
  if (f.phase === 'season') {
    for (const [h, a] of f.rounds[f.round]) {
      if (mine && (h === f.user || a === f.user)) {
        const home = h === f.user, gh = home ? mine.gf : mine.ga, ga = home ? mine.ga : mine.gf;
        tableAdd(f, h, a, gh, ga, mine.ot);
        postGame(f, f.teams[h], gh > ga, false); postGame(f, f.teams[a], ga > gh, false);
        res = { gf: mine.gf, ga: mine.ga, ot: mine.ot };
      } else {
        const r = simGame(f, h, a, false);
        if (h === f.user || a === f.user) res = h === f.user ? { gf: r.gh, ga: r.ga, ot: r.ot } : { gf: r.ga, ga: r.gh, ot: r.ot };
      }
    }
    f.log.push({ opp: f.teams[g.opp].abbr, home: g.home, ...res });
    f.round++;
    for (const p of f.draft) p.seen += f.scouts.filter((s) => s === p.region).length;
    if (f.round >= f.rounds.length) startPlayoffs(f);
  } else if (f.phase === 'playoffs') {
    for (const s of f.po.series) {
      if (s.done) continue;
      const h = seriesHome(s), a = h === s.a ? s.b : s.a;
      let wa;
      if (mine && (s.a === f.user || s.b === f.user)) {
        wa = (mine.gf > mine.ga) === (s.a === f.user);
        postGame(f, f.teams[s.a], wa, true); postGame(f, f.teams[s.b], !wa, true);
        res = { gf: mine.gf, ga: mine.ga, ot: mine.ot };
      } else {
        const r = simGame(f, h, a, true); wa = (r.gh > r.ga) === (h === s.a);
        if (s.a === f.user || s.b === f.user) res = h === f.user ? { gf: r.gh, ga: r.ga, ot: r.ot } : { gf: r.ga, ga: r.gh, ot: r.ot };
      }
      if (wa) s.wa++; else s.wb++;
      if (s.wa === 3 || s.wb === 3) s.done = true;
    }
    if (f.po.series.every((s) => s.done)) nextPlayoffRound(f);
  }
  return res;
}

// ---------- séries éliminatoires (3 de 5) ----------
const seriesHome = (s) => ([0, 1, 4].includes(s.wa + s.wb) ? s.a : s.b);
export const PO_ROUNDS = ['Demi-finales d\'association', 'Finales d\'association', `Finale de la ${CUP}`];
function startPlayoffs(f) {
  f.finalRank = standings(f).map((r) => r.i);
  const series = [];
  for (const conf of ['Est', 'Ouest']) {
    const s = standings(f, conf).map((r) => r.i);
    series.push({ a: s[0], b: s[3], wa: 0, wb: 0, done: false }, { a: s[1], b: s[2], wa: 0, wb: 0, done: false });
  }
  f.po = { round: 0, series, past: [] };
  f.phase = 'playoffs';
  for (const t of f.teams) for (const p of t.players) if (p.inj > 3) p.inj = 3;
  note(f, `La saison est terminée. ${f.po.series.some((s) => s.a === f.user || s.b === f.user) ? 'Ton équipe participe aux séries !' : 'Ton équipe rate les séries.'}`);
}
const winner = (s) => (s.wa > s.wb ? s.a : s.b);
function nextPlayoffRound(f) {
  const po = f.po, w = po.series.map(winner);
  po.past.push(po.series);
  if (w.length === 1) { f.champ = w[0]; makeAwards(f); return; }
  const better = (x, y) => (f.finalRank.indexOf(x) < f.finalRank.indexOf(y) ? [x, y] : [y, x]);
  po.series = [];
  for (let i = 0; i < w.length; i += 2) { const [a, b] = better(w[i], w[i + 1]); po.series.push({ a, b, wa: 0, wb: 0, done: false }); }
  po.round++;
}

// ---------- meneurs et trophées ----------
export function allPlayers(f) { return f.teams.flatMap((t) => t.players.map((p) => ({ p, t }))); }
export function leaders(f, key, n = 10) {
  const val = { pts: (p) => p.st.g + p.st.a, g: (p) => p.st.g, a: (p) => p.st.a, pm: (p) => p.st.pm, hits: (p) => p.st.hits, w: (p) => p.st.w,
    svp: (p) => (p.st.sa ? 1 - p.st.ga / p.st.sa : 0), so: (p) => p.st.so }[key];
  const minGs = Math.max(1, f.round * 0.3);
  return allPlayers(f).filter(({ p }) => (key === 'svp' || key === 'w' || key === 'so' ? p.pos === 'G' && p.st.gs >= (key === 'svp' ? minGs : 1) : p.pos !== 'G' && p.st.gp > 0))
    .map((x) => ({ ...x, v: val(x.p) })).sort((x, y) => y.v - x.v).slice(0, n);
}
function makeAwards(f) {
  const all = allPlayers(f), sk = all.filter((x) => x.p.pos !== 'G' && x.p.st.gp > 0), pts = (p) => p.st.g + p.st.a;
  const best = (list, score) => list.reduce((b, x) => (!b || score(x) > score(b) ? x : b), null);
  const rk = (t) => 17 - (f.finalRank.indexOf(t.id) + 1);
  const win = {
    mvp: best(sk, (x) => pts(x.p) + rk(x.t) * 0.6 + x.p.st.pm * 0.2),
    pts: best(sk, (x) => pts(x.p) + x.p.st.g * 0.01),
    gk: best(all.filter((x) => x.p.pos === 'G' && x.p.st.gs >= 10), (x) => (1 - x.p.st.ga / x.p.st.sa) * 100 + x.p.st.w * 0.05),
    def: best(sk.filter((x) => x.p.pos === 'D'), (x) => pts(x.p) + x.p.st.pm * 0.4 + x.p.ovr * 0.2),
    rook: best(sk.filter((x) => x.p.car.gp === 0 && x.p.age <= 22), (x) => pts(x.p)),
  };
  const list = [];
  for (const k of Object.keys(TROPHIES)) {
    const x = win[k]; if (!x) continue;
    x.p.aw.push(`${TROPHIES[k].split(' (')[0]} (an ${f.year})`);
    list.push({ k, name: x.p.name, team: x.t.abbr, mine: x.t.id === f.user,
      line: x.p.pos === 'G' ? `${x.p.st.w} V, ${(1 - x.p.st.ga / x.p.st.sa).toFixed(3).slice(1)}` : `${x.p.st.g} B, ${x.p.st.a} A` });
  }
  const c = f.teams[f.champ];
  for (const p of c.players) p.aw.push(`${CUP} (an ${f.year})`);
  f.history.unshift({ year: f.year, champ: c.abbr, champName: `${c.city} ${c.name}`, mine: f.champ === f.user, awards: list, rank: f.finalRank.indexOf(f.user) + 1 });
  note(f, `Les ${c.name} de ${c.city} remportent la ${CUP} !`);
  f.phase = 'awards';
}

// ---------- intersaison ----------
function develop(p) {
  const room = p.pot - p.ovr;
  let d = p.age <= 22 ? rnd.r(0.5, 4) * (room > 0 ? 1 : 0.2) : p.age <= 26 ? rnd.r(0, 2.2) * (room > 0 ? 1 : 0.3) : p.age <= 30 ? rnd.r(-1, 1) : -rnd.r(0.3, 3) * (p.age >= 34 ? 1.4 : 1);
  if (d > room && d > 0) d = Math.max(room, 0.3);
  const keys = p.pos === 'G' ? ['ref', 'pos'] : ATTRS;
  for (const k of keys) p.a[k] = Math.round(clamp(p.a[k] + d + rnd.g() * 0.7 + (p.age >= 31 && (k === 'spd' || k === 'acc') ? -0.6 : 0), 35, 99));
  p.ovr = calcOvr(p); p.pot = Math.max(p.pot, p.ovr);
}
function archive(p, year, abbr) {
  if (p.st.gp > 0) {
    p.hist.push({ y: year, t: abbr, gp: p.st.gp, g: p.st.g, a: p.st.a, pm: p.st.pm, pim: p.st.pim, w: p.st.w, sa: p.st.sa, ga: p.st.ga });
    for (const k of ST_KEYS) p.car[k] += p.st[k];
  }
}
function hofWorthy(p) {
  const solo = p.aw.filter((x) => !x.startsWith(CUP)).length;
  return solo >= 2 || (p.pos === 'G' ? p.car.w >= 230 : p.car.g + p.car.a >= (p.pos === 'D' ? 270 : 440));
}
// Lance l'intersaison : carrières, progression, retraites, contrats échus
export function beginOffseason(f) {
  f.retired = [];
  for (const t of f.teams) {
    for (const p of t.players) { archive(p, f.year, t.abbr); p.age++; develop(p); p.inj = 0; p.con.yrs--; }
    const gone = t.players.filter((p) => (p.age >= 35 && rnd.chance((p.age - 33) * 0.22)) || (p.age >= 31 && p.ovr < 63));
    for (const p of gone) {
      const hof = hofWorthy(p);
      f.retired.push({ name: p.name, team: t.abbr, age: p.age, pos: p.pos, mine: t.id === f.user, hof });
      if (hof) f.hof.unshift({ name: p.name, pos: p.pos, team: t.abbr, year: f.year, gp: p.car.gp, g: p.car.g, a: p.car.a, w: p.car.w, aw: p.aw.length });
    }
    t.players = t.players.filter((p) => !gone.includes(p));
    if (t.id === f.user) continue;
    // DG adverses : ils gardent leurs bons joueurs si le plafond le permet
    for (const p of t.players.filter((q) => q.con.yrs <= 0).sort((x, y) => y.ovr - x.ovr)) {
      const sal = ask(p), others = payroll(t) - p.con.sal;
      if (p.ovr >= 66 && others + sal <= f.cap - 4) p.con = { sal, yrs: rnd.i(1, 4) };
      else { t.players = t.players.filter((q) => q !== p); p.con = { sal, yrs: 0 }; f.fa.push(p); }
    }
  }
  for (const p of f.fa) { p.age++; develop(p); }
  f.fa = f.fa.filter((p) => p.age < 36 && p.ovr >= 58);
  f.phase = 'resign';
}
export const expiring = (f) => f.teams[f.user].players.filter((p) => p.con.yrs <= 0);
export function resign(f, id, yrs) {
  const t = f.teams[f.user], p = byId(t, id), sal = ask(p);
  if (!p || payroll(t) - p.con.sal + sal > f.cap) return false;
  p.con = { sal, yrs }; p.morale = clamp(p.morale + 10, 0, 100);
  return true;
}
export function release(f, id) {
  const t = f.teams[f.user], p = byId(t, id);
  if (!p) return false;
  t.players = t.players.filter((q) => q !== p); p.con = { sal: ask(p), yrs: 0 }; f.fa.push(p);
  if (f.phase === 'season' || f.phase === 'playoffs') setLines(f, t, true);
  return true;
}
export function endResign(f) {
  for (const p of expiring(f)) release(f, p.id);
  // ordre du repêchage : inverse du classement, deux rondes
  const order = [...f.finalRank].reverse();
  f.dr = { order: [...order, ...order], pick: 0, log: [] };
  f.phase = 'draft';
  draftAuto(f);
}

// ---------- repêchage et dépisteurs ----------
function genDraftClass(f) {
  f.draft = [];
  for (let i = 0; i < 40; i++) {
    const p = mkPlayer(f, rnd.pick(['C', 'LW', 'RW', 'D', 'D', 'G']), rnd.r(52, 66) - i * 0.12, 18);
    p.pot = Math.round(clamp(p.ovr + rnd.r(6, 26), 60, 96)); p.con = { sal: 0.9, yrs: 3 }; p.car = zeroSt();
    p.region = rnd.i(0, 3); p.seen = 0; p.bias = rnd.r(-1, 1);
    f.draft.push(p);
  }
}
// Fourchette estimée par les dépisteurs : elle se resserre à mesure que la région est suivie
export function estimate(p) {
  const err = Math.max(1, Math.round(9 - p.seen * 0.3));
  const mid = (v) => Math.round(v + p.bias * err * 0.6);
  return { ovr: [mid(p.ovr) - err, mid(p.ovr) + err], pot: [mid(p.pot) - err, mid(p.pot) + err], err };
}
const aiDraftScore = (p) => p.pot * 0.65 + p.ovr * 0.35 + rnd.g() * 3;
function doPick(f, teamIdx, p) {
  const t = f.teams[teamIdx];
  f.draft = f.draft.filter((q) => q !== p);
  const { region, seen, bias, ...pl } = p;
  t.players.push(pl); fixNum(t, pl);
  f.dr.log.push({ n: f.dr.pick + 1, team: t.abbr, name: p.name, pos: p.pos, mine: teamIdx === f.user });
  f.dr.pick++;
}
// Les autres équipes choisissent jusqu'au tour du joueur
function draftAuto(f) {
  const d = f.dr;
  while (d.pick < d.order.length && d.order[d.pick] !== f.user) doPick(f, d.order[d.pick], f.draft.reduce((b, p) => (aiDraftScore(p) > aiDraftScore(b) ? p : b)));
  if (d.pick >= d.order.length) f.phase = 'fa';
}
export const onClock = (f) => f.phase === 'draft' && f.dr.order[f.dr.pick] === f.user;
export function draftPick(f, id) {
  const p = f.draft.find((q) => q.id === id);
  if (!onClock(f) || !p) return false;
  doPick(f, f.user, p); draftAuto(f);
  return true;
}

// ---------- agents libres ----------
export function signFA(f, id) {
  const t = f.teams[f.user], p = f.fa.find((q) => q.id === id);
  if (!p) return 'Joueur introuvable.';
  if (t.players.length >= MAX_ROSTER) return `Effectif complet (${MAX_ROSTER} joueurs).`;
  const sal = ask(p);
  if (payroll(t) + sal > f.cap) return 'Pas assez d\'espace sous le plafond salarial.';
  p.con = { sal, yrs: p.age >= 32 ? 1 : 2 }; p.morale = 70;
  f.fa = f.fa.filter((q) => q !== p); t.players.push(p); fixNum(t, p);
  if (f.phase === 'season') setLines(f, t, true);
  return null;
}
function aiFreeAgency(f) {
  f.fa.sort((x, y) => y.ovr - x.ovr);
  for (let pass = 0; pass < 3; pass++) for (const t of f.teams) {
    if (t.id === f.user) continue;
    const need = ['F', 'D', 'G'].find((g) => t.players.filter((p) => group(p) === g).length < { F: 14, D: 7, G: 3 }[g]);
    const cand = f.fa.find((p) => (need ? group(p) === need : p.ovr >= 72) && payroll(t) + ask(p) <= f.cap && t.players.length < MAX_ROSTER);
    if (!cand) continue;
    cand.con = { sal: ask(cand), yrs: rnd.i(1, 3) }; f.fa = f.fa.filter((q) => q !== cand); t.players.push(cand); fixNum(t, cand);
  }
}
// Termine l'intersaison et lance la saison suivante
export function newSeason(f) {
  aiFreeAgency(f);
  for (const t of f.teams) {
    while (t.players.length > MAX_ROSTER) { const w = [...t.players].sort((x, y) => x.ovr - y.ovr)[0]; t.players = t.players.filter((p) => p !== w); f.fa.push(w); }
    while (t.id !== f.user && payroll(t) > f.cap) { const w = [...t.players].sort((x, y) => y.con.sal - x.con.sal)[0]; t.players = t.players.filter((p) => p !== w); w.con.yrs = 0; f.fa.push(w); }
    for (const p of t.players) p.morale = clamp(p.morale + (65 - p.morale) * 0.4, 0, 100);
  }
  f.fa = f.fa.sort((x, y) => y.ovr - x.ovr).slice(0, 40);
  while (f.fa.length < 16) f.fa.push(mkPlayer(f, rnd.pick(['C', 'LW', 'RW', 'D', 'D', 'G']), rnd.r(58, 68), rnd.i(22, 31)));
  for (const p of f.fa) p.con = { sal: ask(p), yrs: 0 };
  f.year++; f.dr = null; f.retired = null;
  startSeason(f);
  note(f, `Début de la saison ${f.year}. Plafond salarial : ${f.cap} M$.`);
}
export const overCap = (f) => payroll(f.teams[f.user]) > f.cap;

// ---------- échanges : IA de directeur général ----------
// Valeur d'un joueur pour une équipe donnée : les aspirants paient pour le présent, les équipes en reconstruction pour l'avenir
export function tradeValue(f, p, t) {
  const rk = rankOf(f, t.id), contender = rk <= 6, rebuild = rk >= 11;
  const ageF = p.age <= 24 ? 1.15 : p.age <= 29 ? 1 : p.age <= 32 ? 0.8 : 0.5;
  let v = Math.pow(Math.max(0, p.ovr - 60), 1.5) * ageF * (contender ? 1.15 : rebuild && p.age >= 29 ? 0.7 : 1);
  v += Math.max(0, p.pot - p.ovr) * (p.age <= 23 ? 2.2 : 0.6) * (rebuild ? 1.5 : contender ? 0.7 : 1);
  v -= Math.max(0, p.con.sal - salFor(p.ovr, p.age)) * 6 * Math.max(1, p.con.yrs); // contrat trop cher
  if (p.con.yrs <= 1 && rebuild) v *= 0.85;
  const depth = t.players.filter((q) => group(q) === group(p) && q.ovr > p.ovr).length;
  if (depth < { F: 3, D: 2, G: 1 }[group(p)]) v *= 1.12; // comble un besoin
  if (p.inj > 5) v *= 0.8;
  return Math.max(0, v);
}
export function proposeTrade(f, other, give, get) {
  const U = f.teams[f.user], O = f.teams[other];
  const G = give.map((id) => byId(U, id)).filter(Boolean), R = get.map((id) => byId(O, id)).filter(Boolean);
  if (!G.length || !R.length) return { ok: false, why: 'Choisis au moins un joueur de chaque côté.' };
  const sum = (l) => l.reduce((s, p) => s + p.con.sal, 0);
  const after = (t, out, inn) => t.players.filter((p) => !out.includes(p)).concat(inn);
  const fits = (list) => ['F', 'D', 'G'].every((g) => list.filter((p) => group(p) === g).length >= { F: 12, D: 6, G: 2 }[g]) && list.length <= MAX_ROSTER;
  if (!fits(after(U, G, R))) return { ok: false, why: 'Ton effectif ne serait plus valide (12 attaquants, 6 défenseurs, 2 gardiens, 26 joueurs au plus).' };
  if (!fits(after(O, R, G))) return { ok: false, why: `L'effectif de ${O.city} ne serait plus valide.` };
  if (payroll(U) - sum(G) + sum(R) > f.cap) return { ok: false, why: 'Cet échange te ferait dépasser le plafond salarial.' };
  if (payroll(O) - sum(R) + sum(G) > f.cap) return { ok: false, why: `${O.city} dépasserait le plafond salarial.` };
  const vin = G.reduce((s, p) => s + tradeValue(f, p, O), 0), vout = R.reduce((s, p) => s + tradeValue(f, p, O), 0);
  if (vin < vout * 1.06 + 2) {
    const gap = vout ? vin / vout : 0;
    return { ok: false, why: gap > 0.85 ? `Le DG de ${O.city} hésite : il veut un petit quelque chose de plus.` : gap > 0.5 ? `Le DG de ${O.city} refuse : il estime perdre au change.` : `Le DG de ${O.city} refuse net : l'offre est loin du compte.` };
  }
  U.players = after(U, G, R); O.players = after(O, R, G);
  for (const p of R) { p.morale = 62; fixNum(U, p); } for (const p of G) { p.morale = 60; fixNum(O, p); }
  setLines(f, U, true); setLines(f, O, false);
  f.trades++;
  note(f, `Échange conclu avec ${O.city} : ${G.map((p) => p.name).join(', ')} contre ${R.map((p) => p.name).join(', ')}.`);
  return { ok: true, why: `Le DG de ${O.city} accepte l'échange.` };
}
