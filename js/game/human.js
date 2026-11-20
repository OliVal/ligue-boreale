// Contrôle du joueur humain : traduit les touches en actions sur le corps contrôlé
// side : équipe contrôlée (par défaut celle de l'utilisateur local; en ligne, l'hôte contrôle aussi celle de l'invité)
import { hyp, clamp } from '../core/util.js';
import { interceptPoint } from '../sim/ai.js';
import { goalieFreeze, goalieDive } from '../sim/goalie.js';
import { RINK } from '../core/config.js';

// direction demandée : joystick tactile (analogique) ou touches
const stickOf = (input) => (input.stick ? input.stick()
  : [(input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0), (input.down('up') ? 1 : 0) - (input.down('down') ? 1 : 0)]);

// assist : aide tactile (au doigt seulement) — on préfère un coéquipier démarqué, sans adversaire sur la trajectoire
function pickPassTarget(m, b, mx, mz, assist = false) {
  const has = hyp(mx, mz) > 0.3;
  const dx = has ? mx : Math.cos(b.face), dz = has ? mz : Math.sin(b.face);
  let best = null, bs = -1e9;
  for (const o of b.team.skaters) {
    if (!o.active || o === b || o.stun > 0) continue;
    const d = hyp(o.x - b.x, o.z - b.z) || 1;
    const dot = ((o.x - b.x) * dx + (o.z - b.z) * dz) / d;
    let s = dot * 1.5 - d * 0.015 - (has && dot < 0.15 ? 2 : 0);
    if (assist) s += (dot > 0.35 ? 0.6 : 0) - 1.6 * laneBlock(m, b, o);
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

// 1 si un adversaire coupe la ligne de passe (à moins de 1,3 m), moins s'il en est plus loin
function laneBlock(m, b, o) {
  const ax = o.x - b.x, az = o.z - b.z, L2 = ax * ax + az * az || 1;
  let worst = 0;
  for (const e of m.other(b.team).skaters) {
    if (!e.active) continue;
    const u = ((e.x - b.x) * ax + (e.z - b.z) * az) / L2;
    if (u <= 0.05 || u >= 0.95) continue;
    const dd = hyp(b.x + ax * u - e.x, b.z + az * u - e.z);
    worst = Math.max(worst, clamp((1.9 - dd) / 0.6, 0, 1));
  }
  return worst;
}

// Aide à la visée (tactile) : vise le côté du filet que le gardien couvre le moins, sans la pénalité de précision du tir « automatique »
function assistAim(m, b) {
  const p = m.puck, og = m.other(b.team).goalie, gx = b.team.dir * RINK.goalX;
  if (!og || !og.active) return 0;
  const k = (og.x - p.x) / ((gx - p.x) || 1e-6), lineZ = p.z + (0 - p.z) * k;
  return (og.z > lineZ ? -1 : 1) * 0.8;
}

export function switchPlayer(m, t = m.teams[m.userTeam]) {
  if (m.lockPl || !t) return;
  const p = m.puck;
  if (p.carrier && p.carrier.team === t && !p.carrier.isGoalie) { m.setUser(p.carrier); return; }
  const list = t.skaters.filter((b) => b.active && b.stun <= 0 && b !== t.ub)
    .sort((a, b) => hyp(a.x - p.x, a.z - p.z) - hyp(b.x - p.x, b.z - p.z));
  if (list.length) m.setUser(list[0]);
}

export function updateHuman(m, input, basis, side = m.userTeam) {
  if (side == null || m.autoUser) return;
  const t = m.teams[side];
  if (m.state === 'fight') {
    if (input.pressed('wrist') || input.pressed('slap')) m.fightInput('punch');
    if (input.pressed('pass') || input.pressed('check')) m.fightInput('block');
    return;
  }
  let b = t.ub;
  if (b && b.isGoalie) { updateGoalieHuman(m, b, input, basis); return; }
  if (m.special && m.special.team !== t) return;
  if (!b || !b.active) {
    if (m.special || m.lockPl) return;
    switchPlayer(m, t); b = t.ub;
    if (!b || !b.active) return;
  }
  const [ix, iy] = stickOf(input);
  let mx = ix * basis.rx + iy * basis.fx, mz = ix * basis.rz + iy * basis.fz;
  const len = hyp(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  b.ctrl.mx = mx; b.ctrl.mz = mz; b.ctrl.sprint = input.down('sprint');
  if (m.state === 'faceoff') {
    if (input.pressed('slap') || input.pressed('wrist') || input.pressed('pass')) m.faceoffPress(side);
    return;
  }
  if (m.state !== 'play') return;
  if (input.pressed('ability')) m.useAbility(b);
  const p = m.puck, has = p.carrier === b;
  const assist = !!input.assist;
  const aim = () => (Math.abs(mz) > 0.3 ? Math.sign(mz) * 0.85 : assist ? assistAim(m, b) : null);

  if (has) {
    if (m.special && m.special.phase !== 'live') { b.ctrl.mx = b.ctrl.mz = 0; return; }
    if (input.pressed('slap')) b.windup = { t: 0, type: 'slap', need: 99 };
    else if (b.windup && !input.down('slap')) m.shoot(b, 'slap', clamp(b.windup.t / 0.8, 0.15, 1), aim());
    if (p.carrier === b && input.pressed('wrist')) m.shoot(b, 'wrist', 0, aim());
    if (p.carrier === b && (input.pressed('pass') || input.pressed('saucer'))) {
      const target = pickPassTarget(m, b, mx, mz, assist);
      if (target) m.pass(b, target, input.pressed('saucer'));
    }
    if (p.carrier === b && input.pressed('dump')) m.dump(b, mx, mz);
    if (p.carrier === b && input.pressed('deke')) m.deke(b, mx, mz);
  } else {
    b.windup = null;
    const incoming = !p.carrier && p.pass && p.pass.to === b;
    if (incoming && len < 0.1) { // aide à la réception
      const ip = interceptPoint(m, b), dx = ip[0] - b.x, dz = ip[1] - b.z, d = hyp(dx, dz);
      if (d > 0.3) { b.ctrl.mx = dx / d * Math.min(1, d / 2); b.ctrl.mz = dz / d * Math.min(1, d / 2); }
    }
    if (incoming && (input.pressed('wrist') || input.pressed('slap'))) {
      b.oneTimer = { type: input.pressed('slap') ? 'slap' : 'wrist', exp: m.time + 1.0, aim: aim() };
    }
    if (input.pressed('check')) m.check(b);
    if (input.pressed('deke')) m.deke(b, mx, mz);
    if (input.pressed('switch')) switchPlayer(m, t);
    if (input.pressed('pass') && p.carrier && p.carrier.team === t) { t.callFor = b; t.callT = 0.9; }
  }
  if (input.pressed('line') && !m.special && m.mode === 'game' && !m.lockPl) m.lineChange(t);
}

// Gardien contrôlé (Carrière) : peu de touches, toutes réutilisées du patineur
//   déplacer = glisser · Sprint = poussée rapide · Lancer frappé (maintenir) = papillon
//   Mise en échec = plongeon · Lancer du poignet = geler la rondelle · Passe / Dégager quand il a la rondelle
function updateGoalieHuman(m, g, input, basis) {
  const [ix, iy] = stickOf(input);
  let mx = ix * basis.rx + iy * basis.fx, mz = ix * basis.rz + iy * basis.fz;
  const len = hyp(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  g.gc = { mx, mz, fast: input.down('sprint'), fly: input.down('slap') };
  if (m.state !== 'play') return;
  if (input.pressed('ability')) m.useAbility(g);
  if (m.puck.carrier === g) {
    if (input.pressed('pass')) { const to = pickPassTarget(m, g, mx, mz); if (to) m.pass(g, to, false); }
    else if (input.pressed('saucer')) { const to = pickPassTarget(m, g, mx, mz); if (to) m.pass(g, to, true); }
    else if (input.pressed('dump')) m.dump(g, mx, mz);
    else if (input.pressed('wrist')) goalieFreeze(m, g);
    return;
  }
  if (input.pressed('wrist')) goalieFreeze(m, g);
  if (input.pressed('check')) goalieDive(m, g, mx, mz);
}
