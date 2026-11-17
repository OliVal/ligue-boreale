// Mode Carrière : logique pure (aucun affichage), testable avec Node.
// Un joueur créé monte du junior à la grande ligue : saison, classement, XP, arbre de compétences, repêchage, contrats.
import { STYLE_MOD, ATTRS, calcOvr, randomName } from '../data/teams.js';
import { leagueTeams, teamStrength } from './leagues.js';
import { makeRng, clamp } from '../core/util.js';

const rnd = makeRng((Date.now() ^ 0x51ed27) >>> 0);
export const seedCareer = (n) => rnd.seed(n);
const poisson = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd.f(); } while (p > L); return k - 1; };

export const ME = 'moi';
export const SLOT = { LW: 0, C: 1, RW: 2 };
export const LINE_NAMES = { F: ['1er trio', '2e trio', '3e trio', '4e trio'], D: ['1er duo', '2e duo', '3e duo'] };
export const lineName = (c, l = c.line) => LINE_NAMES[c.pos === 'D' ? 'D' : 'F'][l];
export const maxLine = (c) => (c.pos === 'D' ? 2 : 3);

export const LOOKS = {
  skin: [['#f1c9a5', 'Clair'], ['#e0ac84', 'Doré'], ['#c68e63', 'Hâlé'], ['#9a6a45', 'Brun'], ['#6d4a31', 'Foncé']],
  tape: [['#111111', 'Noir'], ['#f2f2f2', 'Blanc'], ['#d63a2f', 'Rouge'], ['#2f7fd6', 'Bleu']],
  h: [[0.95, 'Petit'], [1, 'Moyen'], [1.06, 'Grand']],
  w: [[0.93, 'Élancé'], [1, 'Moyen'], [1.08, 'Costaud']],
};

// ---------- arbre de compétences ----------
export const ABILITIES = {
  snipe: { name: 'Tir précis', desc: 'Pendant 7 s, tes lancers sont plus rapides et presque parfaitement précis.' },
  vision: { name: 'Vision du jeu', desc: 'Pendant 7 s, tes passes sont plus vives et arrivent pile sur la palette.' },
  shield: { name: 'Bouclier humain', desc: 'Pendant 7 s, tu résistes aux mises en échec et aux harponnages, et tu frappes plus fort.' },
};
export const TREE = [
  { id: 'tir', name: 'Tireur d\'élite', nodes: [
    { id: 'tir1', name: 'Poignets d\'acier', eff: { sht: 2 }, max: 3 },
    { id: 'tir2', name: 'Œil de lynx', eff: { accu: 2 }, max: 3, req: 'tir1' },
    { id: 'tir3', name: 'Mains de soie', eff: { hnd: 2 }, max: 3, req: 'tir2' },
    { id: 'snipe', name: 'Tir précis', ability: 'snipe', max: 1, cost: 2 },
  ] },
  { id: 'jeu', name: 'Fabricant de jeu', nodes: [
    { id: 'jeu1', name: 'Coup de patin', eff: { spd: 2, acc: 2 }, max: 3 },
    { id: 'jeu2', name: 'Passes laser', eff: { pas: 2 }, max: 3, req: 'jeu1' },
    { id: 'jeu3', name: 'Lecture du jeu', eff: { sns: 2 }, max: 3, req: 'jeu2' },
    { id: 'vision', name: 'Vision du jeu', ability: 'vision', max: 1, cost: 2 },
  ] },
  { id: 'roc', name: 'Roc', nodes: [
    { id: 'roc1', name: 'Épaules solides', eff: { chk: 2 }, max: 3 },
    { id: 'roc2', name: 'Coffre', eff: { end: 2 }, max: 3, req: 'roc1' },
    { id: 'roc3', name: 'Équilibre', eff: { chk: 1, hnd: 1 }, max: 3, req: 'roc2' },
    { id: 'shield', name: 'Bouclier humain', ability: 'shield', max: 1, cost: 2 },
  ] },
];
export const ABILITY_NEED = 5; // points dans la branche avant de débloquer sa capacité
const NODES = Object.fromEntries(TREE.flatMap((b) => b.nodes.map((n) => [n.id, { ...n, branch: b }])));
export const rank = (c, id) => c.tree[id] || 0;
export const branchPts = (c, b) => b.nodes.reduce((s, n) => s + (n.ability ? 0 : rank(c, n.id)), 0);
export function canBuy(c, id) {
  const n = NODES[id];
  if (!n || rank(c, id) >= n.max || c.sp < (n.cost || 1)) return false;
  if (n.req && !rank(c, n.req)) return false;
  if (n.ability && branchPts(c, n.branch) < ABILITY_NEED) return false;
  return true;
}
export function buy(c, id) {
  if (!canBuy(c, id)) return false;
  const n = NODES[id];
  c.sp -= n.cost || 1; c.tree[id] = rank(c, id) + 1;
  if (n.ability && !c.equip) c.equip = n.ability;
  return true;
}
export const unlocked = (c) => Object.keys(ABILITIES).filter((a) => rank(c, a));

// Attributs effectifs : base (qui progresse) + bonus de l'arbre
export function effAttrs(c) {
  const a = { ...c.a };
  for (const id of Object.keys(c.tree)) {
    const n = NODES[id];
    if (n && n.eff) for (const k of Object.keys(n.eff)) a[k] += n.eff[k] * c.tree[id];
  }
  for (const k of ATTRS) a[k] = Math.round(clamp(a[k], 30, 99));
  return a;
}
export function playerDef(c) {
  const a = effAttrs(c);
  const p = { id: ME, name: c.name, num: c.num, pos: c.pos, style: c.style, hand: c.hand, a, age: c.age, look: c.look, ability: c.equip };
  p.ovr = calcOvr(p);
  return p;
}
export const ovr = (c) => playerDef(c).ovr;

// ---------- XP et niveaux ----------
export const xpNeed = (c) => 180 + 45 * c.level;
function gainXp(c, xp) {
  c.xp += xp;
  let ups = 0;
  const mod = STYLE_MOD[c.style] || {};
  const pool = ATTRS.flatMap((k) => Array(1 + Math.max(0, Math.round((mod[k] || 0) / 4))).fill(k));
  while (c.xp >= xpNeed(c)) {
    c.xp -= xpNeed(c); c.level++; c.sp++; ups++;
    for (let i = 0; i < 3; i++) { const k = rnd.pick(pool); c.a[k] = Math.min(95, c.a[k] + 1); } // progression naturelle
  }
  return ups;
}

// ---------- création ----------
export function newCareer(o) {
  const mod = STYLE_MOD[o.style] || {}, a = {};
  for (const k of ATTRS) {
    let v = 56 + (mod[k] || 0) * 0.8;
    if (o.pos === 'D' && (k === 'chk' || k === 'sns')) v += 3;
    if (o.pos === 'D' && (k === 'accu' || k === 'hnd')) v -= 3;
    a[k] = Math.round(v);
  }
  a.ref = 30; a.pos = 30;
  const c = {
    v: 1, name: o.name, num: o.num, pos: o.pos, style: o.style, hand: o.hand, look: o.look,
    age: 17, year: 1, a, tree: {}, equip: null, xp: 0, level: 1, sp: 1,
    line: 1, trust: 50, earned: 0, contract: { type: 'junior', team: null, years: 1, salary: 0 },
    drafted: null, draft: null, offers: null, phase: 'season', news: [], history: [], season: null,
  };
  startSeason(c, 0, o.team);
  note(c, `Tu te joins aux ${myTeam(c).name} de ${myTeam(c).city}, dans la ligue junior. Le repêchage a lieu en fin de saison.`);
  return c;
}
function note(c, txt) { c.news.unshift(txt); if (c.news.length > 8) c.news.length = 8; }

// ---------- saison, calendrier, classement ----------
function roundRobin(n) {
  const ids = [...Array(n).keys()], out = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) { const x = ids[i], y = ids[n - 1 - i]; round.push((r + i) % 2 ? [x, y] : [y, x]); }
    out.push(round); ids.splice(1, 0, ids.pop());
  }
  return out;
}
const zeroSt = () => ({ gp: 0, g: 0, a: 0, sog: 0, hits: 0, pim: 0, toi: 0, blk: 0, pm: 0, rat: 0 });

function startSeason(c, lg, team, fromRound = 0) {
  const teams = leagueTeams(lg), n = teams.length;
  let rounds = roundRobin(n);
  if (lg === 0) rounds = rounds.concat(rounds.map((r) => r.map(([h, a]) => [a, h]))); // aller-retour
  c.season = { lg, team, round: 0, rounds, table: teams.map(() => ({ gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0 })), log: [], st: zeroSt() };
  for (let i = 0; i < fromRound; i++) playRound(c, null);
}
export const myTeam = (c) => leagueTeams(c.season.lg)[c.season.team];
export const gamesLeft = (c) => c.season.rounds.length - c.season.round;

export function nextGame(c) {
  const s = c.season;
  if (s.round >= s.rounds.length) return null;
  const pair = s.rounds[s.round].find((p) => p.includes(s.team));
  const home = pair[0] === s.team, opp = home ? pair[1] : pair[0];
  return { home, opp, team: leagueTeams(s.lg)[opp] };
}

function simScore(sh, sa) {
  const d = (sh - sa) * 0.07;
  let h = poisson(Math.max(0.6, 3.05 + d)), a = poisson(Math.max(0.6, 2.9 - d)), ot = false;
  if (h === a) { ot = true; if (rnd.chance(0.5 + d * 0.3)) h++; else a++; }
  return { h, a, ot };
}
function apply(table, h, a, gh, ga, ot) {
  const H = table[h], A = table[a];
  H.gp++; A.gp++; H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
  const W = gh > ga ? H : A, L = gh > ga ? A : H;
  W.w++; W.pts += 2;
  if (ot) { L.otl++; L.pts++; } else L.l++;
}
// Joue une journée du calendrier; mine = { gf, ga, ot } pour le match du joueur (ou null : tout est simulé)
function playRound(c, mine) {
  const s = c.season, teams = leagueTeams(s.lg);
  for (const [h, a] of s.rounds[s.round]) {
    if (mine && (h === s.team || a === s.team)) {
      const home = h === s.team;
      apply(s.table, h, a, home ? mine.gf : mine.ga, home ? mine.ga : mine.gf, mine.ot);
    } else { const r = simScore(teamStrength(teams[h]), teamStrength(teams[a])); apply(s.table, h, a, r.h, r.a, r.ot); }
  }
  s.round++;
}
export function standings(c) {
  const s = c.season, teams = leagueTeams(s.lg);
  return s.table.map((r, i) => ({ ...r, i, team: teams[i], me: i === s.team }))
    .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}
export const myRank = (c) => standings(c).findIndex((r) => r.me) + 1;
export const avgRating = (c) => (c.season.st.gp ? c.season.st.rat / c.season.st.gp : 6);

// Équipes du prochain match, avec le joueur inséré à sa place dans l'alignement
export function withMe(team, c) {
  const t = JSON.parse(JSON.stringify(team)), me = playerDef(c);
  const idx = c.pos === 'D' ? t.lines.D[Math.min(c.line, 2)][c.hand < 0 ? 0 : 1] : t.lines.F[c.line][SLOT[c.pos]];
  const used = new Set(t.players.filter((p, i) => i !== idx).map((p) => p.num));
  for (const p of t.players) if (p.num === me.num && p !== t.players[idx]) { let n = 2; while (used.has(n) || n === me.num) n++; p.num = n; used.add(n); }
  t.players[idx] = me;
  return t;
}
export function matchTeams(c) {
  const g = nextGame(c), mine = withMe(myTeam(c), c);
  return { home: g.home ? mine : g.team, away: g.home ? g.team : mine, userHome: g.home };
}

// Match simulé : résultat et feuille de match du joueur estimés d'après sa cote et son temps de glace
export function simMyGame(c) {
  const s = c.season, g = nextGame(c), teams = leagueTeams(s.lg);
  const mineS = teamStrength(myTeam(c)), r = g.home ? simScore(mineS, teamStrength(g.team)) : simScore(teamStrength(g.team), mineS);
  const gf = g.home ? r.h : r.a, ga = g.home ? r.a : r.h;
  const isD = c.pos === 'D', lf = (isD ? [1.15, 0.9, 0.65] : [1.25, 1, 0.7, 0.45])[c.line];
  const avg = teams.reduce((x, t) => x + teamStrength(t), 0) / teams.length, o = ovr(c);
  const ex = clamp(0.7 + (o - avg) * 0.045, 0.1, 1.9) * lf * (isD ? 0.6 : 1);
  const goals = Math.min(gf, poisson(ex * (c.style === 'Marqueur' ? 0.55 : 0.4)));
  const ast = Math.min(Math.max(0, gf - goals), poisson(ex * 0.6));
  const st = { g: goals, a: ast, sog: goals + poisson(1.5 * lf), hits: poisson((STYLE_MOD[c.style].chk > 5 ? 2 : 0.9) * lf),
    pim: rnd.chance(0.07) ? 2 : 0, toi: (isD ? [22, 18, 13] : [19, 16, 12, 8])[c.line] * 60, blk: poisson(isD ? 0.9 : 0.3), pm: clamp(Math.round((gf - ga) * 0.35 * lf + rnd.g() * 0.6), -3, 3) };
  const rating = clamp(5.45 + 1.1 * goals + 0.7 * ast + 0.1 * st.sog + rnd.g() * 0.5 + (o - avg) * 0.04 - st.pim * 0.25, 2, 10);
  return { gf, ga, ot: r.ot, st, rating, obj: [], sim: true };
}

// Enregistre un match (joué ou simulé) : classement, statistiques, XP, confiance de l'entraîneur, rappel
export function recordGame(c, r) {
  const s = c.season, g = nextGame(c), win = r.gf > r.ga, done = r.obj.filter((q) => q.done).length;
  const xp = Math.round(r.sim ? 30 + r.rating * 9 + r.st.g * 20 + r.st.a * 12 + (win ? 15 : 0)
    : 60 + r.rating * 18 + r.st.g * 40 + r.st.a * 25 + done * 50 + (win ? 30 : 0));
  playRound(c, r);
  s.log.push({ opp: g.team.abbr, home: g.home, gf: r.gf, ga: r.ga, ot: r.ot, g: r.st.g, a: r.st.a, rating: +r.rating.toFixed(1), sim: !!r.sim });
  const T = s.st;
  T.gp++; T.rat += r.rating;
  for (const k of ['g', 'a', 'sog', 'hits', 'pim', 'toi', 'blk', 'pm']) T[k] += r.st[k] || 0;
  const out = { xp, levels: gainXp(c, xp), msgs: [], win };
  // temps de glace selon les performances
  c.trust = clamp(c.trust + (r.rating - 6) * 7 + done * 4, 0, 100);
  if (c.trust >= 80 && c.line > 0) { c.line--; c.trust = 50; out.msgs.push(`L'entraîneur est impressionné : tu montes sur le ${lineName(c)}.`); }
  else if (c.trust <= 20 && c.line < maxLine(c)) { c.line++; c.trust = 50; out.msgs.push(`L'entraîneur réduit ton temps de glace : tu descends sur le ${lineName(c)}.`); }
  // rappel dans la grande ligue en cours de saison
  if (s.lg === 1 && c.contract.team != null && T.gp >= 5 && gamesLeft(c) >= 3 && avgRating(c) >= 7.2 && ovr(c) >= 66) {
    const round = s.round;
    pushHistory(c);
    startSeason(c, 2, c.contract.team, round);
    c.line = maxLine(c); c.trust = 50;
    out.msgs.push(`RAPPEL ! Les ${myTeam(c).name} de ${myTeam(c).city} te font monter dans la grande ligue. Tu commences sur le ${lineName(c)}.`);
  } else if (gamesLeft(c) === 0) c.phase = 'end';
  for (const m of out.msgs) note(c, m);
  return out;
}

function pushHistory(c) {
  const s = c.season, T = s.st, t = myTeam(c);
  if (!T.gp) return;
  c.history.push({ year: c.year, age: c.age, lg: s.lg, team: t.abbr, gp: T.gp, g: T.g, a: T.a, pim: T.pim, pm: T.pm, sog: T.sog, hits: T.hits,
    rating: +(T.rat / T.gp).toFixed(2), rank: myRank(c) });
}
export function totals(c) {
  const rows = [...c.history];
  const T = c.season.st;
  if (T.gp && c.phase === 'season') rows.push({ gp: T.gp, g: T.g, a: T.a, pim: T.pim, pm: T.pm });
  return rows.reduce((s, r) => ({ gp: s.gp + r.gp, g: s.g + r.g, a: s.a + r.a, pim: s.pim + r.pim, pm: s.pm + r.pm }), { gp: 0, g: 0, a: 0, pim: 0, pm: 0 });
}

// ---------- fin de saison : repêchage, contrats, promotion ----------
export function endSeason(c) {
  const s = c.season;
  pushHistory(c);
  c.earned = +(c.earned + (s.lg === 2 ? c.contract.salary : s.lg === 1 ? 0.08 : 0)).toFixed(3);
  if (s.lg === 0 && !c.drafted) { c.draft = runDraft(c); c.phase = 'draft'; return; }
  c.contract.years--;
  if (c.contract.years <= 0) { c.offers = makeOffers(c); c.phase = 'contract'; return; }
  nextSeason(c);
}

function runDraft(c) {
  const big = leagueTeams(2), last = c.history[c.history.length - 1] || { gp: 1, g: 0, a: 0, rating: 6 };
  const ppg = (last.g + last.a) / Math.max(1, last.gp);
  const score = (ovr(c) - 56) * 2.2 + ppg * 14 + (last.rating - 6) * 7;
  const pick = clamp(Math.round(75 - score * 2 + rnd.r(-3, 3)), 1, 80);
  const order = big.map((t, i) => i).sort((x, y) => big[x].rating - big[y].rating);
  const board = [];
  for (let p = 1; p <= 80; p++) {
    board.push({ pick: p, round: Math.ceil(p / 16), team: order[(p - 1) % 16], me: p === pick,
      name: p === pick ? c.name : randomName(rnd), pos: p === pick ? c.pos : rnd.pick(['C', 'AG', 'AD', 'D', 'D', 'G']) });
  }
  return { pick, round: Math.ceil(pick / 16), team: order[(pick - 1) % 16], board };
}
export function signEntry(c) {
  const d = c.draft;
  c.drafted = { year: c.year, round: d.round, pick: d.pick, team: d.team };
  c.contract = { type: 'entry', team: d.team, years: 3, salary: [0.95, 0.9, 0.85, 0.8, 0.775][d.round - 1] };
  c.draft = null;
  nextSeason(c);
}

function lineFor(team, c) {
  const o = ovr(c), isD = c.pos === 'D';
  const better = team.players.filter((p) => (isD ? p.pos === 'D' : p.pos !== 'D' && p.pos !== 'G') && p.ovr > o).length;
  return clamp(Math.floor(better / (isD ? 2 : 3)), 0, maxLine(c));
}
function makeOffers(c) {
  const big = leagueTeams(2), last = c.history[c.history.length - 1], o = ovr(c);
  const ppg = last ? (last.g + last.a) / Math.max(1, last.gp) : 0.3;
  const base = Math.max(0.775, 0.8 + (o - 66) * 0.22 + ppg * 0.9);
  const cur = c.contract.team, others = big.map((t, i) => i).filter((i) => i !== cur);
  const pick = () => others.splice(rnd.i(0, others.length - 1), 1)[0];
  const mk = (team, mul, years) => ({ team, years, salary: +Math.max(0.775, base * mul).toFixed(2), line: lineFor(big[team], c) });
  const a = pick(), b = pick();
  const [rich, strong] = big[a].rating <= big[b].rating ? [a, b] : [b, a];
  return [mk(cur, 1, 2), mk(rich, 1.2, rnd.i(3, 4)), mk(strong, 0.88, rnd.i(1, 2))];
}
export function acceptOffer(c, i) {
  const o = c.offers[i];
  c.contract = { type: 'std', team: o.team, years: o.years, salary: o.salary, line: o.line, fresh: true };
  c.offers = null;
  nextSeason(c);
}

function nextSeason(c) {
  const last = c.history[c.history.length - 1], prev = last ? last.lg : 0;
  c.age++; c.year++;
  // progression des jeunes, déclin des vétérans
  const grow = c.age <= 20 ? 2 : c.age <= 24 ? 1 : 0;
  for (const k of ATTRS) c.a[k] = Math.min(95, c.a[k] + grow);
  if (c.age >= 32) for (const k of ['spd', 'acc', 'end']) c.a[k] = Math.max(40, c.a[k] - 1);
  const o = ovr(c), avg = last ? last.rating : 6;
  let lg;
  if (prev === 0) lg = o >= 72 ? 2 : 1;
  else if (prev === 1) lg = o >= 70 || (avg >= 6.8 && o >= 66) ? 2 : 1;
  else lg = avg < 4.8 && o < 70 ? 1 : 2;
  const moved = lg !== prev || c.contract.fresh;
  if (moved) { c.line = lg === 2 && c.contract.line != null ? c.contract.line : lg === 2 ? maxLine(c) : Math.min(2, maxLine(c)); }
  c.contract.fresh = false;
  c.trust = 50; c.phase = 'season';
  startSeason(c, lg, c.contract.team);
  const t = myTeam(c);
  note(c, lg === 2 ? (prev === 2 ? `Nouvelle saison avec les ${t.name} de ${t.city}.` : `Tu perces l'alignement des ${t.name} de ${t.city}, dans la grande ligue !`)
    : prev === 2 ? `Les dirigeants te renvoient au club-école, les ${t.name} de ${t.city}. À toi de regagner ta place.`
      : `Tu te rapportes au club-école, les ${t.name} de ${t.city}. Joue bien et le rappel viendra.`);
}
