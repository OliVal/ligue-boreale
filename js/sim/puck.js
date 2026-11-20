// Physique de la rondelle : glisse, vol, rebonds (bandes, baie vitrée, poteaux, filet), buts
import { RINK, G } from '../core/config.js';
import { R, hyp } from '../core/util.js';
import { constrain, isOutside } from './rink.js';
import { trySave } from './goalie.js';

export function makePuck() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    carrier: null, shot: null, pass: null, rel: null, lastTeam: null,
    rolling: 0, curl: 0, inNet: 0, seq: 0, spin: 0,
  };
}

export function setRolling(p, t) {
  p.rolling = t; p.curl = R.r(-0.5, 0.5);
}

export function stepPuck(m, dt) {
  const p = m.puck;
  const { goalX, netHW, netH, netD, boardH, glassH } = RINK;
  const x0 = p.x, y0 = p.y, z0 = p.z;
  const live = m.state === 'play' || m.live;

  if (p.y > 0 || p.vy > 0) {
    p.vy -= G * dt;
    const k = 1 - 0.03 * dt; p.vx *= k; p.vz *= k;
  } else {
    const sp = hyp(p.vx, p.vz);
    if (sp > 0) {
      const dec = (p.rolling > 0 ? 0.55 : 1.25) + 0.0035 * sp * sp;
      const ns = Math.max(0, sp - dec * dt);
      p.vx *= ns / sp; p.vz *= ns / sp;
      if (p.rolling > 0) { // rondelle sur la tranche : trajectoire qui courbe
        const a = p.curl * dt, c = Math.cos(a), s = Math.sin(a);
        const vx = p.vx * c - p.vz * s; p.vz = p.vx * s + p.vz * c; p.vx = vx;
        p.rolling -= dt; if (ns < 1.5) p.rolling = 0;
      }
    }
  }
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  p.spin += hyp(p.vx, p.vz) * dt * 3;
  if (p.y < 0) {
    p.y = 0;
    if (p.vy < -2.2) { p.vy = -p.vy * 0.28; p.vx *= 0.9; p.vz *= 0.9; if (R.chance(0.2)) setRolling(p, R.r(0.8, 2)); }
    else p.vy = 0;
  }

  if (p.inNet) { // rondelle prise dans le filet
    const s = p.inNet, ax = p.x * s;
    if (ax > goalX + netD - 0.08) { // le fond du filet : la rondelle s'y écrase (le filet se gonfle à l'image)
      if (p.vx * s > 1.5) { p.netHit = (p.netHit || 0) + 1; p.netHitV = Math.abs(p.vx); }
      p.x = s * (goalX + netD - 0.08); p.vx *= -0.03; p.vz *= 0.3; // le filet absorbe le tir
    }
    if (ax < goalX + 0.02) { p.x = s * (goalX + 0.02); p.vx *= -0.1; }
    if (Math.abs(p.z) > netHW - 0.06) { p.z = Math.sign(p.z) * (netHW - 0.06); p.vz *= -0.1; p.vx *= 0.3; }
    if (p.y > netH - 0.1) { p.y = netH - 0.1; p.vy = 0; }
    return;
  }

  // arrêts des gardiens (avant la ligne de but)
  if (live) for (const t of m.teams) if (t.goalie.active) trySave(m, t.goalie, x0, y0, z0);

  // franchissement de la ligne de but
  for (const s of [-1, 1]) {
    const gx = s * goalX;
    if ((x0 - gx) * s < 0 && (p.x - gx) * s >= 0) {
      const t = (gx - x0) / (p.x - x0 || 1e-9);
      const zc = z0 + (p.z - z0) * t, yc = y0 + (p.y - y0) * t, az = Math.abs(zc);
      if (az < netHW - 0.04 && yc < netH - 0.04) {
        // la rondelle entre franchement dans le filet (on la voit traverser la ligne); un tir assez fort va jusqu'au fond
        p.inNet = s; p.vx *= 0.75; p.vz *= 0.6; p.vy *= 0.6;
        if (p.vx * s < 1.2) p.vx = s * R.r(1.2, 1.8); // rondelle poussée lentement : elle franchit la ligne et s'arrête dans le filet
        if (live) m.onGoal(s);
      } else if (az < netHW + 0.1 && yc < netH + 0.07) {
        // poteau ou barre horizontale
        const bar = az < netHW - 0.04;
        p.x = gx - s * 0.03; p.z = zc; p.y = yc;
        p.vx = -p.vx * R.r(0.35, 0.65);
        if (bar) p.vy = R.r(1, 5); else p.vz += Math.sign(zc) * R.r(2, 7);
        p.seq++; p.shot = null;
        if (R.chance(0.5)) setRolling(p, R.r(1, 2.5));
        m.emit('post', { bar });
      } else if (p.shot && live) { // lancer raté
        m.emit('miss', { by: p.shot.by, high: yc >= netH });
      }
    }
  }

  // côtés, dessus et arrière du filet (de l'extérieur)
  const ax = Math.abs(p.x), sgn = p.x < 0 ? -1 : 1;
  if (!p.inNet && ax > goalX && ax < goalX + netD && Math.abs(p.z) < netHW && p.y < netH) { // (pas pour une rondelle qui vient d'entrer : c'est un but)
    const ax0 = Math.abs(x0);
    if (Math.abs(z0) >= netHW) { p.z = Math.sign(z0) * (netHW + 0.01); p.vz = -p.vz * 0.25; p.vx *= 0.7; }
    else if (ax0 >= goalX + netD) { p.x = sgn * (goalX + netD + 0.01); p.vx = -p.vx * 0.25; p.vz *= 0.7; }
    else if (y0 >= netH) { p.y = netH; p.vy = Math.abs(p.vy) * 0.2; p.vx *= 0.8; p.vz *= 0.8; }
    else { p.x = x0; p.z = z0; p.vx *= -0.2; p.vz *= -0.2; }
    p.seq++;
  }

  // bandes et baie vitrée
  if (p.y > glassH) {
    if (isOutside(p.x, p.z, 0)) { if (live) m.puckOut(); else { p.vx = p.vz = 0; p.x = x0; p.z = z0; } }
  } else {
    const hit = constrain(p, 0.05, p.y > boardH ? 0.72 : 0.55);
    if (hit > 1.5) {
      p.seq++;
      if (hit > 4) m.emit('board', { v: hit, glass: p.y > boardH });
      if (hit > 10 && R.chance(0.25)) setRolling(p, R.r(1, 2.5));
    }
  }
}
