// Test sans affichage du gardien en Carrière : un vrai match où un « joueur » simulé contrôle le gardien au clavier
import * as C from '../js/career/career.js';
import { CareerTracker } from '../js/career/tracker.js';
import { Match } from '../js/sim/match.js';
import { updateHuman } from '../js/game/human.js';
import { DEFAULT_SETTINGS, DT, RINK } from '../js/core/config.js';
import { R, hyp } from '../js/core/util.js';

const ok = (cond, msg) => { if (!cond) throw new Error('ÉCHEC : ' + msg); };

// Clavier simulé : touches tenues et touches pressées pour un seul pas
function fakeInput() {
  const held = new Set(), once = new Set();
  return {
    held, once,
    down: (k) => held.has(k),
    pressed: (k) => once.has(k),
    end() { once.clear(); },
  };
}

// Stratégie simple : papillon quand la rondelle approche en zone, plongeon parfois, geler ou relancer quand il l'a
function bot(m, g, inp, basis, n) {
  const p = m.puck, s = -g.team.dir, nx = s * RINK.goalX;
  const d = hyp(p.x - nx, p.z);
  inp.held.clear();
  // papillon : tir bas qui arrive, ou porteur adverse tout près du filet
  const shotLow = !p.carrier && (p.vx * s) > 8 && p.y < 0.45 && d < 16;
  const close = p.carrier && p.carrier.team !== g.team && d < 3.5;
  if (shotLow || close) inp.held.add('slap');
  // sortir au-devant d'un tireur dans l'enclave (touche « haut » = vers le centre de la glace)
  if (p.carrier && p.carrier.team !== g.team && d > 5 && d < 11) inp.held.add('up');
  if (p.carrier === g) { if (n % 2) inp.once.add('pass'); else inp.once.add('wrist'); }
}

function play(seed, useBot) {
  C.seedCareer(seed); R.seed(seed * 13);
  const c = C.newCareer({ name: 'Test Gardien', num: 30, pos: 'G', style: 'Gardien hybride', hand: -1, look: null, team: 1 });
  c.tree.wall = 1; c.equip = 'wall';
  const mt = C.matchTeams(c);
  const settings = { ...DEFAULT_SETTINGS, periodMin: 3 };
  const user = mt.userHome ? 0 : 1;
  const m = new Match({ home: mt.home, away: mt.away, settings, user, lock: C.ME, autoUser: !useBot });
  ok(m.lockPl && m.lockPl.pos === 'G', 'gardien verrouillé trouvé');
  const tr = new CareerTracker(m, c, { toast() {}, say() {} }, settings);
  const inp = fakeInput(), basis = { rx: 0, rz: -1, fx: -1, fz: 0 };
  let steps = 0, ctrl = 0, holds = 0, used = 0, dives = 0, out = 0;
  while (m.state !== 'final' && steps < 120 * 60 * 40) {
    const g = m.teams[user].goalie;
    if (useBot && m.userBody) {
      ok(m.userBody === g && g.human, 'le corps contrôlé est le gardien');
      const s = -g.team.dir; basis.rz = -s; basis.fx = -s;
      bot(m, g, inp, basis, holds);
      if (m.puck.carrier === g && inp.once.size) holds++;
      if (steps % 3000 === 1500 && m.state === 'play' && m.useAbility(g)) used++;
      updateHuman(m, inp, basis);
      if (g.dive > 0.44) dives++;
      inp.end(); ctrl++;
      // il ne sort jamais trop loin et n'entre jamais dans son filet
      const fx = (g.x - s * RINK.goalX) * -s;
      if (hyp(fx, g.z) > 6.05 || (Math.abs(g.z) < RINK.netHW && fx < 0.1)) out++;
    }
    m.step(DT); steps++;
    if (steps % 2400 === 0) tr.html((k) => k);
  }
  ok(m.state === 'final', 'match terminé');
  ok(out === 0, 'le gardien reste devant son filet');
  const res = tr.result();
  return { res, ctrl: ctrl / steps, holds: `${tr.x.passes} passes, ${m.lockPl.st.fz} gels`, used, dives: dives / 2, c };
}

let sa = 0, sv = 0;
for (const seed of [1, 2, 3, 4]) {
  const r = play(seed, true);
  sa += r.res.st.sa; sv += r.res.st.sv;
  console.log(`gardien contrôlé : ${r.res.gf}-${r.res.ga}, ${r.res.st.sv}/${r.res.st.sa} arrêts, note ${r.res.rating.toFixed(1)}, contrôle ${(r.ctrl * 100).toFixed(0)} %, relances ${r.holds}, plongeons ${r.dives}, capacité ${r.used}`);
  console.log('  objectifs :', r.res.obj.map((o) => `${o.text} ${o.done ? '✓' : '✗'}`).join(' | '));
  const o = C.recordGame(r.c, r.res);
  ok(o.xp > 0 && r.c.season.st.sa === r.res.st.sa, 'match enregistré');
}
console.log(`% d'arrêts du gardien contrôlé : ${(sv / sa).toFixed(3)} (les gardiens de l'IA tournent autour de ,820)`);
const a = play(5, false);
console.log(`gardien IA (référence) : ${a.res.st.sv}/${a.res.st.sa}`);
console.log('OK');
