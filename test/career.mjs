// Test sans affichage du mode Carrière : saisons simulées, repêchage, contrats, puis un vrai match avec joueur verrouillé
import * as C from '../js/career/career.js';
import { leagueTeams } from '../js/career/leagues.js';
import { CareerTracker } from '../js/career/tracker.js';
import { Match } from '../js/sim/match.js';
import { DEFAULT_SETTINGS, DT } from '../js/core/config.js';
import { R } from '../js/core/util.js';

const ok = (cond, msg) => { if (!cond) throw new Error('ÉCHEC : ' + msg); };
for (const [pos, style, seed] of [['C', 'Marqueur', 1], ['D', 'Défenseur offensif', 2], ['LW', 'Joueur physique', 3]]) {
  C.seedCareer(seed);
  const c = C.newCareer({ name: 'Test Joueur', num: 9, pos, style, hand: -1, look: { skin: '#e0ac84', tape: '#111111', h: 1, w: 1 }, team: 2 });
  ok(leagueTeams(0).length === 8 && leagueTeams(1).length === 16, 'ligues');
  let guard = 0;
  const line = [];
  while (c.year <= 8 && guard++ < 400) {
    if (c.phase === 'season' || c.phase === 'playoffs') {
      const t = C.withMe(C.myTeam(c), c);
      ok(t.players.filter((p) => p.id === C.ME).length === 1 && new Set(t.players.map((p) => p.num)).size === 20, 'alignement avec le joueur');
      C.recordGame(c, C.simMyGame(c));
      // dépense les points de compétence
      for (const b of C.TREE) for (const n of b.nodes) while (C.canBuy(c, n.id)) C.buy(c, n.id);
    } else if (c.phase === 'end') {
      const h = c.season.st, po = c.season.po;
      // séries : bracket complet, un champion, des séries trois de cinq terminées
      ok(po && po.champ != null, "séries jouées jusqu'au champion");
      for (const r of po.rounds) for (const x of r) ok(C.seriesDone(x) && Math.max(x.wa, x.wb) === C.PO_WINS && Math.min(x.wa, x.wb) < C.PO_WINS, 'série trois de cinq');
      ok(po.rounds.length === Math.log2(po.n) && po.rounds[po.rounds.length - 1].length === 1, 'nombre de rondes');
      if (po.out !== -1) ok(po.st.gp >= 3 && po.log.length === po.st.gp, 'matchs de séries du joueur');
      const aw = C.seasonAwards(c);
      ok(aw.length === 5 && aw.every((x) => x.winner && x.line), 'trophées de fin de saison');
      ok(C.seasonAwards(c) === aw, 'trophées calculés une seule fois');
      if (aw.some((x) => x.me)) line.push(`  trophées : ${aw.filter((x) => x.me).map((x) => x.name).join(', ')}`);
      line.push(`  séries : ${C.playoffResult(c.season)} (${po.st.gp} PJ, ${po.st.g} B ${po.st.a} A)`);
      line.push(`an ${c.year} (${c.age} ans) ${['JUN', 'MIN', 'GDE'][c.season.lg]} ${C.myTeam(c).abbr} ${h.gp} PJ ${h.g} B ${h.a} A note ${C.avgRating(c).toFixed(1)} rang ${C.myRank(c)} cote ${C.ovr(c)} niv ${c.level} ${C.lineName(c)}`);
      C.endSeason(c);
    } else if (c.phase === 'draft') { line.push(`  repêché : ronde ${c.draft.round}, ${c.draft.pick}e au total`); ok(c.draft.board.length === 80, 'tableau du repêchage'); C.signEntry(c); }
    else if (c.phase === 'contract') { line.push(`  offres : ${c.offers.map((o) => `${leagueTeams(2)[o.team].abbr} ${o.years} an(s) ${o.salary} M$`).join(' | ')}`); C.acceptOffer(c, 1); }
    ok(JSON.parse(JSON.stringify(c)).name === c.name, 'sérialisable');
  }
  console.log(`--- ${pos} ${style} ---\n` + line.join('\n'));
  ok(c.history.every((h) => h.po && h.po.res), "résultat des séries dans l'historique");
  console.log(`  capacités : ${C.unlocked(c).join(', ') || 'aucune'} · gains ${c.earned} M$ · total ${JSON.stringify(C.totals(c))}`);
}

// Vrai match : joueur verrouillé contrôlé par l'IA (autoUser) pour vérifier le suivi
C.seedCareer(7); R.seed(99);
const c = C.newCareer({ name: 'Test Verrou', num: 9, pos: 'C', style: 'Marqueur', hand: 1, look: null, team: 0 });
c.tree.snipe = 1; c.equip = 'snipe';
const mt = C.matchTeams(c);
const hudStub = { toast() {}, say() {} };
const settings = { ...DEFAULT_SETTINGS, periodMin: 3 };
const m = new Match({ home: mt.home, away: mt.away, settings, user: mt.userHome ? 0 : 1, lock: C.ME, autoUser: true });
ok(m.lockPl && m.lockPl.ability === 'snipe', 'joueur verrouillé trouvé');
const tr = new CareerTracker(m, c, hudStub, settings);
let steps = 0, onIce = 0, used = 0, moved = false;
while (m.state !== 'final' && steps < 120 * 60 * 40) {
  m.step(DT); steps++;
  if (m.userBody) { onIce++; ok(m.userBody.p === m.lockPl && m.userBody.human, 'le corps contrôlé est bien le joueur'); if (steps % 600 === 0 && m.useAbility(m.userBody)) used++; }
  if (!moved && m.period === 2) { moved = true; ok(m.moveLock(0), 'déplacement de trio'); }
  if (steps % 2400 === 0) tr.html((k) => k);
}
ok(m.state === 'final', 'match terminé');
const res = tr.result();
console.log(`match verrouillé : ${res.gf}-${res.ga}, présence sur la glace ${(onIce / steps * 100).toFixed(0)} %, TG ${Math.round(res.st.toi)} s, note ${res.rating.toFixed(1)}, capacité utilisée ${used} fois, passes ${tr.x.passes}`);
console.log('objectifs :', res.obj.map((o) => `${o.text} ${o.done ? '✓' : '✗'}`).join(' | '));
const out = C.recordGame(c, res);
console.log('après match :', JSON.stringify(out), 'niveau', c.level, 'confiance', Math.round(c.trust));
// Prolongation de séries : pas de tirs de barrage, on rejoue 20 minutes à 5 contre 5
{
  R.seed(5);
  const c2 = C.newCareer({ name: 'Test Series', num: 9, pos: 'C', style: 'Marqueur', hand: 1, look: null, team: 0 });
  const t2 = C.matchTeams(c2);
  const m2 = new Match({ home: t2.home, away: t2.away, settings: { ...DEFAULT_SETTINGS, periodMin: 1, playoff: true }, user: 0, lock: C.ME, autoUser: true });
  let n = 0;
  while (m2.state !== 'final' && n < 60 * 60 * 60) {
    if (m2.period === 3 && m2.clock < 2 && m2.state === 'play') m2.teams[1].score = m2.teams[0].score; // force l'égalité en fin de 3e
    m2.step(DT); n++;
  }
  ok(m2.otN >= 1 && m2.state === 'final' && !m2.so && m2.teams[0].score !== m2.teams[1].score, 'prolongation de séries sans tirs de barrage');
  console.log(`prolongation de séries : ${m2.teams[0].score}-${m2.teams[1].score}, prolongations ${m2.otN}, période ${m2.period}`);
}
console.log('OK');
