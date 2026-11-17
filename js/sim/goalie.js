// Gardiens : positionnement sur l'angle, papillon, arrêts (mitaine, bouclier, jambières), rebonds, sorties
import { RINK, G } from '../core/config.js';
import { R, hyp, clamp, segDist, sign } from '../core/util.js';
import { zoneDot } from './rink.js';

function nearestOpp(m, team, x, z) {
  let bd = 1e9;
  for (const b of m.other(team).skaters) if (b.active) bd = Math.min(bd, hyp(b.x - x, b.z - z));
  return bd;
}

export function updateGoalie(m, g, dt) {
  const t = g.team, p = m.puck, a = g.p.a;
  const { goalX, netHW } = RINK;
  const s = -t.dir, nx = s * goalX;
  const sk = m.gkBonus(g);
  g.down = Math.max(0, g.down - dt);
  g.saveAnim = Math.max(0, g.saveAnim - dt);
  g.pickupCd = Math.max(0, g.pickupCd - dt);
  g.vx = g.vz = 0;

  if (p.carrier === g) {
    g.holdT += dt;
    const od = nearestOpp(m, t, g.x, g.z);
    if (m.special) { if (g.holdT > 0.3) m.attemptOver('save'); return; }
    if (g.holdT > 0.5 && od < 3.4) { m.stopPlay('freeze', zoneDot(s, g.z)); return; }
    if (g.holdT > 0.9) {
      let best = null, bs = -1e9;
      for (const b of t.skaters) {
        if (!b.active || b.stun > 0) continue;
        const d = hyp(b.x - g.x, b.z - g.z);
        if (d < 3 || d > 22) continue;
        const sc = Math.min(6, nearestOpp(m, t, b.x, b.z)) - d * 0.12;
        if (sc > bs) { bs = sc; best = b; }
      }
      if (best && bs > 1.5) m.pass(g, best, false);
      else if (g.holdT > 2) m.stopPlay('freeze', zoneDot(s, g.z));
    }
    return;
  }
  g.holdT = 0;

  const sp = hyp(p.vx, p.vz);
  let tx, tz, spd = 3 + 2.6 * (a.pos + sk) / 100;
  let threat = null;
  if (!p.carrier && sp > 9 && p.vx * s > 0.2 * sp) {
    const tt = (nx - p.x) / p.vx;
    if (tt > 0 && tt < 1.6) {
      const zc = p.z + p.vz * tt;
      if (Math.abs(zc) < netHW + 0.7) threat = { tt, zc, yc: Math.max(0, p.y + p.vy * tt - 0.5 * G * tt * tt) };
    }
  }
  if (threat) {
    if (!g.track || g.track.seq !== p.seq) {
      let screens = 0;
      for (const tm of m.teams) for (const b of tm.skaters) {
        if (!b.active || (p.shot && b === p.shot.by)) continue;
        if (segDist(b.x, b.z, p.x, p.z, nx, 0) < 0.55 && hyp(b.x - p.x, b.z - p.z) > 1.2) screens++;
      }
      const react = (0.085 + 0.19 * (1 - (a.ref + sk) / 100)) * R.r(0.75, 1.4) + Math.min(2, screens) * 0.05;
      g.track = { seq: p.seq, at: m.time + react, d0: hyp(p.x - nx, p.z) };
    }
    if (m.time >= g.track.at) {
      const tp = (g.x - p.x) / p.vx;
      const zg = clamp(p.z + p.vz * tp, -netHW - 0.2, netHW + 0.2);
      const ls = (4 + 3.5 * (a.ref + sk) / 100) * (g.down > 0 ? 0.6 : 1);
      const dz = zg - g.z;
      g.z += clamp(dz, -ls * dt, ls * dt);
      if (g.down <= 0 && (threat.yc < 0.75 || g.track.d0 < 9)) g.down = 1.0;
    }
    g.face = Math.atan2(p.z - g.z, p.x - g.x);
    return;
  }
  g.track = null;

  const front = (p.x - nx) * -s; // distance de la rondelle devant la ligne de but
  if (front < 0.3) {
    tx = nx - s * 0.3;
    tz = Math.abs(p.z) > netHW ? sign(p.z) * 0.7 : p.z * 0.5;
  } else {
    const dx = p.x - nx, dz = p.z, d = hyp(dx, dz) || 1;
    const depth = clamp(0.45 + d * 0.05, 0.6, 1.5);
    tx = nx + (dx / d) * depth; tz = (dz / d) * depth;
  }
  // sortie pour jouer une rondelle libre
  if (!p.carrier && sp < 4.5 && p.y < 0.3 && m.state === 'play' && !m.special) {
    const dn = hyp(p.x - nx, p.z), dg = hyp(p.x - g.x, p.z - g.z);
    const od = nearestOpp(m, t, p.x, p.z);
    if (dn < 5.5 && od > 4.5 && dg < od - 1.5 && Math.abs(p.x) < RINK.L - 1) { tx = p.x; tz = p.z; spd *= 1.3; }
  }
  if (g.down > 0) spd *= 0.5;
  const dx = tx - g.x, dz = tz - g.z, d = hyp(dx, dz);
  if (d > 0.01) {
    const st = Math.min(d, spd * dt);
    g.vx = (dx / d) * st / dt; g.vz = (dz / d) * st / dt;
    g.x += (dx / d) * st; g.z += (dz / d) * st;
  }
  g.face = Math.atan2(p.z - g.z, p.x - g.x);
  // couvrir une rondelle lente à portée
  if (!p.carrier && g.pickupCd <= 0 && sp < 8 && p.y < 0.5 && hyp(p.x - g.x, p.z - g.z) < 0.8) m.gain(g);
}

// Appelé à chaque pas de la rondelle : tente l'arrêt quand elle traverse le plan du gardien
export function trySave(m, g, x0, y0, z0) {
  const p = m.puck;
  if (p.carrier) return;
  const s = -g.team.dir;
  if (p.vx * s <= 0) return;
  if (!((x0 - g.x) * s < 0 && (p.x - g.x) * s >= 0)) return;
  const t = (g.x - x0) / (p.x - x0 || 1e-9);
  const zc = z0 + (p.z - z0) * t, yc = y0 + (p.y - y0) * t;
  const dz = zc - g.z, adz = Math.abs(dz);
  if (adz > 1.6 || yc > 2.1) return;
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  const a = g.p.a, sk = m.gkBonus(g);
  if (sp < 9) {
    if (adz < 0.7 && yc < 0.6 && g.pickupCd <= 0) { p.x = g.x - s * 0.2; p.z = zc; m.gain(g); }
    return;
  }
  const { goalX, netHW, netH } = RINK;
  const tg = (s * goalX - g.x) / p.vx;
  const zl = zc + p.vz * tg, yl = Math.max(0, yc + p.vy * tg - 0.5 * G * tg * tg);
  const onNet = Math.abs(zl) < netHW && yl < netH;
  const since = g.track && g.track.seq === p.seq ? m.time - g.track.at : -0.1;
  const limb = 3.2 + 3.2 * (a.ref + sk) / 100;
  const ext = clamp(since * limb, 0, 0.7);
  const down = g.down > 0;
  let cover;
  if (down) cover = yc < 0.5 ? 0.64 + ext * 0.5 : yc < 1.05 ? 0.34 + ext : yc < 1.35 ? ext * 0.9 : -1;
  else cover = yc < 0.35 ? 0.3 + ext * 0.85 : yc < 1.5 ? 0.34 + ext : yc < 1.85 ? 0.2 : -1;
  cover += R.g() * 0.07 + (a.pos + sk - 70) * 0.004;
  if (!down && yc < 0.3 && adz < 0.16 && R.chance(0.12)) cover = -1; // entre les jambières
  if (adz > cover) return;

  // ARRÊT
  const shooter = p.shot ? p.shot.by : null;
  if (onNet) m.creditShot(shooter, g);
  const gloveZ = g.p.d.hand;
  const type = yc < 0.45 ? 'jambières' : adz < 0.3 ? 'corps' : sign(dz) === gloveZ ? 'mitaine' : 'bouclier';
  g.saveAnim = 0.6; g.saveSide = sign(dz);
  p.x = g.x - s * 0.35; p.z = zc; p.y = yc;
  p.shot = null; p.pass = null; p.rel = null; p.seq++;
  const caught = (type === 'mitaine' && R.chance(0.75)) || (type === 'corps' && R.chance(0.5 + a.pos / 400)) || (sp < 15 && R.chance(0.5));
  if (caught) {
    p.vx = p.vy = p.vz = 0;
    m.emit('save', { goalie: g, type, shooter, caught: true, onNet });
    m.gain(g);
    return;
  }
  const controlled = R.chance(0.3 + (a.pos + sk) / 260);
  const ang = (controlled ? R.r(0.95, 1.45) : R.r(0, 0.8)) * (R.chance(0.75) ? sign(dz) : -sign(dz));
  const out = sp * R.r(0.12, 0.3);
  p.vx = -s * Math.cos(ang) * out; p.vz = Math.sin(ang) * out; p.vy = R.r(0, 2.5);
  g.pickupCd = 0.6;
  m.emit('save', { goalie: g, type, shooter, caught: false, onNet });
}
