// Test sans affichage du mode Franchise : plusieurs saisons simulées, séries, intersaison, échanges, puis un vrai match
import * as F from '../js/franchise/franchise.js';
import { Match } from '../js/sim/match.js';
import { DEFAULT_SETTINGS, DT } from '../js/core/config.js';
import { R } from '../js/core/util.js';

const ok = (c, msg) => { if (!c) throw new Error('ÉCHEC : ' + msg); };
F.seedFranchise(42);
const f = F.newFranchise(3);
const check = () => {
  for (const t of f.teams) {
    const ids = F.lineupIds(t);
    ok(ids.length === 20 && new Set(ids).size === 20, 'alignement de 20 joueurs distincts ' + t.abbr);
    for (const id of ids) { const p = F.byId(t, id); ok(p && p.inj <= 0, 'joueur aligné présent et en santé ' + t.abbr); }
    ok(new Set(t.players.map((p) => p.num)).size === t.players.length, 'numéros uniques ' + t.abbr);
    ok(t.players.length <= F.MAX_ROSTER + 4, 'taille effectif ' + t.abbr + ' ' + t.players.length);
  }
};
console.log(`plafond ${f.cap} M$, masses : ${f.teams.map((t) => Math.round(F.payroll(t))).join(' ')}`);
// échanges : une offre ridicule doit être refusée, une offre généreuse acceptée
const U = f.teams[f.user], O = f.teams[9];
const worst = [...U.players].filter((p) => F.isF(p)).sort((a, b) => a.ovr - b.ovr)[0], bestO = [...O.players].filter((p) => F.isF(p)).sort((a, b) => b.ovr - a.ovr)[0];
const t1 = F.proposeTrade(f, 9, [worst.id], [bestO.id]);
ok(!t1.ok, 'offre ridicule refusée'); console.log('échange 1 :', t1.why);
const bestU = [...U.players].filter((p) => F.isF(p)).sort((a, b) => b.ovr - a.ovr)[0], midO = [...O.players].filter((p) => F.isF(p)).sort((a, b) => b.ovr - a.ovr)[6];
const t2 = F.proposeTrade(f, 9, [bestU.id], [midO.id]);
console.log('échange 2 :', t2.ok, t2.why, `(${bestU.ovr} contre ${midO.ovr}, salaires ${bestU.con.sal} / ${midO.con.sal})`);
check();

for (let y = 0; y < 6; y++) {
  let guard = 0;
  while (f.phase === 'season' && guard++ < 100) { F.advance(f); if (guard % 10 === 0) check(); }
  const top = F.leaders(f, 'pts', 3).map((x) => `${x.p.name} ${x.v}`).join(', '), gk = F.leaders(f, 'svp', 1)[0];
  const inj = f.teams.reduce((s, t) => s + t.players.filter((p) => p.inj > 0).length, 0);
  const me = f.table[f.user];
  console.log(`an ${f.year} : ${U.abbr} ${me.w}-${me.l}-${me.otl} rang ${F.rankOf(f, f.user)} · meneurs ${top} · gardien ${gk.p.name} ${gk.v.toFixed(3)} · blessés ${inj} · moral moyen ${Math.round(U.players.reduce((s, p) => s + p.morale, 0) / U.players.length)}`);
  while (f.phase === 'playoffs' && guard++ < 200) F.advance(f);
  ok(f.phase === 'awards', 'trophées après les séries');
  const h = f.history[0];
  console.log(`  ${F.CUP} : ${h.champName} · ${h.awards.map((a) => `${a.k}=${a.name}`).join(', ')}`);
  F.beginOffseason(f);
  const exp = F.expiring(f);
  let kept = 0;
  for (const p of exp) if (p.ovr >= 68 && F.resign(f, p.id, 2)) kept++;
  F.endResign(f);
  let picks = 0;
  while (f.phase === 'draft') { ok(F.onClock(f), 'au tour du joueur'); const best = [...f.draft].sort((a, b) => F.estimate(b).pot[0] - F.estimate(a).pot[0])[0]; F.draftPick(f, best.id); picks++; }
  ok(f.phase === 'fa' && picks === 2, 'deux choix au repêchage');
  let signed = 0;
  for (const p of [...f.fa].sort((a, b) => b.ovr - a.ovr).slice(0, 3)) if (!F.signFA(f, p.id)) signed++;
  console.log(`  retraites ${f.retired.length} (Temple ${f.retired.filter((r) => r.hof).length}) · échus ${exp.length}, gardés ${kept} · AL signés ${signed} · masse ${F.payroll(U)} / ${f.cap} · effectif ${U.players.length} · agents libres ${f.fa.length}`);
  F.newSeason(f);
  check();
  ok(JSON.stringify(f).length < 2_500_000, 'taille de sauvegarde');
}
console.log(`cotes des équipes an ${f.year} : ${f.teams.map((t) => F.teamRating(t)).join(' ')}`);
console.log(`Temple de la renommée : ${f.hof.length} membres · sauvegarde ${(JSON.stringify(f).length / 1024).toFixed(0)} Ko`);

// vrai match avec les équipes de la Franchise
R.seed(5);
const mt = F.matchTeams(f);
const m = new Match({ home: mt.home, away: mt.away, settings: { ...DEFAULT_SETTINGS, periodMin: 2 }, user: mt.userHome ? 0 : 1, autoUser: true });
let steps = 0; while (m.state !== 'final' && steps++ < 120 * 60 * 30) m.step(DT);
ok(m.state === 'final', 'match terminé');
const before = U.players.reduce((s, p) => s + p.st.g, 0), res = F.fromMatch(f, m);
F.advance(f, res);
console.log(`match joué : ${res.gf}-${res.ga}, buts crédités ${U.players.reduce((s, p) => s + p.st.g, 0) - before}, fiche ${JSON.stringify(f.table[f.user])}`);
console.log('OK');
