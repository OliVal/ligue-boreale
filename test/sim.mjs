// Test sans affichage : matchs IA contre IA, vérifie l'absence de NaN et affiche des statistiques
import { Match } from '../js/sim/match.js';
import { getTeams } from '../js/data/teams.js';
import { DEFAULT_SETTINGS, DT } from '../js/core/config.js';
import { R } from '../js/core/util.js';

const N = +(process.argv[2] || 6);
const mode = process.argv[3] || 'game';
const teams = getTeams();
const agg = { goals: 0, shots: 0, hits: 0, pim: 0, ot: 0, so: 0, ev: {}, wh: {}, ppg: 0, ppo: 0, steps: 0, blk: 0 };
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  R.seed(1234 + g * 77);
  const settings = { ...DEFAULT_SETTINGS, periodMin: 4, skaters: +(process.argv[4] || 5) };
  const m = new Match({ home: teams[g % 16], away: teams[(g * 5 + 3) % 16], settings, mode });
  m.on((type, d) => {
    agg.ev[type] = (agg.ev[type] || 0) + 1;
    if (type === 'whistle') agg.wh[d.reason] = (agg.wh[d.reason] || 0) + 1;
  });
  let steps = 0;
  while (m.state !== 'final' && steps < 120 * 60 * 40) {
    m.step(DT); steps++;
    if (steps % 240 === 0) {
      const p = m.puck;
      if (![p.x, p.y, p.z, p.vx, p.vy, p.vz].every(Number.isFinite)) throw new Error('NaN rondelle au pas ' + steps);
      if (Math.abs(p.x) > 31 || Math.abs(p.z) > 13.5) throw new Error(`Rondelle hors glace ${p.x},${p.z} état ${m.state}`);
      for (const t of m.teams) for (const b of [...t.skaters, t.goalie]) {
        if (b.active && !(Number.isFinite(b.x) && Number.isFinite(b.z))) throw new Error('NaN joueur');
        if (b.active && !b.p) throw new Error('corps sans joueur');
      }
    }
  }
  if (m.state !== 'final') throw new Error('Match non terminé : état ' + m.state + ' période ' + m.period + ' horloge ' + m.clock);
  const [a, b] = m.teams;
  agg.goals += a.score + b.score; agg.shots += a.stats.shots + b.stats.shots; agg.hits += a.stats.hits + b.stats.hits;
  agg.pim += a.stats.pim + b.stats.pim; agg.ppg += a.stats.ppg + b.stats.ppg; agg.ppo += a.stats.ppo + b.stats.ppo;
  agg.blk += a.stats.blk + b.stats.blk;
  if (m.period === 4) agg.ot++; if (m.period === 5) agg.so++;
  agg.steps += steps;
  console.log(`${a.data.abbr} ${a.score} - ${b.score} ${b.data.abbr}  tirs ${a.stats.shots}-${b.stats.shots}  MJ ${a.stats.fow}-${b.stats.fow}  P${m.period}  étoiles: ${m.stars.map((s) => s.pl.name).join(', ')}`);
}
const per = (v) => (v / N).toFixed(1);
console.log(`\n${N} matchs en ${((Date.now() - t0) / 1000).toFixed(1)} s (${(agg.steps / (Date.now() - t0) * 1000 / 120).toFixed(0)}x temps réel)`);
console.log(`par match — buts ${per(agg.goals)}, tirs ${per(agg.shots)}, mises en échec ${per(agg.hits)}, tirs bloqués ${per(agg.blk)}, PIM ${per(agg.pim)}, AN ${agg.ppg}/${agg.ppo}, prol. ${agg.ot}, TB ${agg.so}`);
console.log('arrêts de jeu:', JSON.stringify(agg.wh));
console.log('événements:', JSON.stringify(agg.ev));
