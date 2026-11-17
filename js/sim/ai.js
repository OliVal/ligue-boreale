// IA des patineurs : systèmes d'équipe (échec avant 1-2-2, trappe, homme à homme, sorties de zone,
// attaque en zone, avantage/désavantage numérique) et décisions du porteur.
import { RINK } from '../core/config.js';
import { R, hyp, clamp, segDist } from '../core/util.js';
import { benchPos } from './entities.js';

const B = RINK.blueX, GX = RINK.goalX;
const PAIR = { LD: 'RW', RD: 'LW', C: 'C', LW: 'RD', RW: 'LD', X: 'X' };
const isDef = (b) => b.role === 'LD' || b.role === 'RD';
const sideOf = (b) => (b.role === 'LW' || b.role === 'LD' ? -1 : b.role === 'RW' || b.role === 'RD' ? 1 : 0);

function posVal(x, z) {
  const d = hyp(GX - x, z), ang = Math.atan2(Math.abs(z), GX - x);
  const q = clamp(1 - d / 20, 0, 1) * Math.pow(Math.max(0, Math.cos(ang)), 1.2);
  return 0.5 * clamp((x + GX) / (2 * GX), 0, 1) + 0.6 * q;
}

function buildCtx(m, t) {
  const p = m.puck, o = m.other(t), c = p.carrier, ctx = t.ctx;
  ctx.px = p.x * t.dir; ctx.pz = p.z * t.dir;
  ctx.has = !!c && c.team === t; ctx.oppHas = !!c && c.team === o;
  let tx = p.x, tz = p.z;
  if (!c) {
    tx = clamp(tx + p.vx * 0.45, -RINK.L + 0.8, RINK.L - 0.8);
    tz = clamp(tz + p.vz * 0.45, -RINK.W + 0.8, RINK.W - 0.8);
  }
  ctx.tx = tx; ctx.tz = tz;
  const eta = (b) => hyp(b.x - tx, b.z - tz) / 7.5 + b.stun + (b.changing ? 1.5 : 0);
  let n = 0, on = 0, best = null, be = 1e9, sec = null, se = 1e9, f1 = null, fe = 1e9;
  for (const b of t.skaters) {
    if (!b.active) continue; n++;
    const e = eta(b);
    if (e < be) { sec = best; se = be; best = b; be = e; } else if (e < se) { sec = b; se = e; }
    if (!isDef(b) && e < fe) { fe = e; f1 = b; }
  }
  let oe = 1e9;
  for (const b of o.skaters) { if (!b.active) continue; on++; oe = Math.min(oe, eta(b)); }
  ctx.n = n; ctx.on = on; ctx.pp = n > on; ctx.pk = n < on;
  ctx.chaser = best; ctx.second = sec; ctx.f1 = f1; ctx.myEta = be; ctx.oppEta = oe;
  // couverture homme à homme
  const mark = {}; const taken = new Set();
  for (const b of t.skaters) {
    if (!b.active) continue;
    const ob = o.skaters.find((q) => q.active && q.role === PAIR[b.role]);
    if (ob) { mark[b.slot] = ob; taken.add(ob); }
  }
  for (const b of t.skaters) {
    if (!b.active || mark[b.slot]) continue;
    let bo = null, bd = 1e9;
    for (const q of o.skaters) {
      if (!q.active || taken.has(q)) continue;
      const d = hyp(q.x - b.x, q.z - b.z); if (d < bd) { bd = d; bo = q; }
    }
    if (bo) { mark[b.slot] = bo; taken.add(bo); }
  }
  ctx.mark = mark;
}

function offenseSpot(m, b, ctx) {
  const r = b.role, s = sideOf(b), D = isDef(b);
  const px = ctx.px, pz = ctx.pz, side = pz < 0 ? -1 : 1;
  let x, z;
  if (px < -B) { // sortie de zone
    if (D) { x = clamp(px - 1, -24.5, -9); z = -side * 6; }
    else if (r === 'C') { x = clamp(px + 6, -22, -3); z = pz * 0.35; }
    else if (r === 'X') { x = clamp(px + 10, -18, 2); z = -side * 3; }
    else { x = clamp(px + 9, -14, -1.5); z = s * 10.5; }
  } else if (px < B) { // montée en zone neutre : trois couloirs
    if (D) { x = px - 8; z = s * 5.5; }
    else if (r === 'C') { x = px + 3; z = pz * 0.3; }
    else if (r === 'X') { x = px + 2; z = -side * 4; }
    else { x = px + 5; z = s * 9; }
  } else if (ctx.pp) { // avantage numérique : 1-3-1
    if (r === 'LD') { x = B + 2.2; z = 0; }
    else if (r === 'RD') { x = 17.5; z = 9; }
    else if (r === 'LW') { x = 17.5; z = -9; }
    else if (r === 'C') { x = 19.5; z = -side * 1.5; }
    else if (r === 'RW') { x = 25; z = -side * 1.3; }
    else { x = 21; z = -side * 4; }
  } else { // attaque en zone
    if (D) { x = B + 1.6; z = s * 7 + pz * 0.15; }
    else {
      if (r === 'C') { x = 18.5; z = -side * 2.5; }
      else if (r === 'X') { x = 20; z = 0; }
      else if (s === side) { x = clamp(px + (px > 21 ? -4 : 3), 14, 24.5); z = side * 9.5; }
      else { x = 24.6; z = -side * 1.4; }
      x += Math.sin(m.time * 0.6 + b.id * 2.1) * 1.3; z += Math.cos(m.time * 0.5 + b.id * 1.3) * 1.3;
    }
  }
  if (px < B + 0.3) x = Math.min(x, B - 0.9);       // rester en jeu
  if (m.offD[b.team.idx]) x = Math.min(x, B - 1.3);  // hors-jeu différé : ressortir
  return [x, z];
}

// Retourne null quand le joueur doit presser le porteur / la rondelle
function defenseSpot(m, b, ctx) {
  const r = b.role, s = sideOf(b), D = isDef(b);
  const px = ctx.px, pz = ctx.pz, t = b.team, p = m.puck;
  const f1 = ctx.f1;
  const lane = () => (s !== 0 ? s * 6.5 : f1 && f1.role === 'LW' ? -6.5 : f1 && f1.role === 'RW' ? 6.5 : 0);
  if (px > B) { // échec avant 1-2-2
    if (D) return [clamp(px - 21, -4, 3), s * 5.5 + pz * 0.2];
    if (f1 === b && !ctx.pk) return null;
    return [ctx.pk ? clamp(px - 14, -2, 6) : clamp(px - 9, 4, 12), lane()];
  }
  if (px > -B) { // trappe en zone neutre
    if (D) return [clamp(px - 11, -16, -6), s * 4.5 + pz * 0.25];
    if (f1 === b) return null;
    return [clamp(px - 6, -B - 0.5, 2), lane()];
  }
  // zone défensive
  if (ctx.pk) { // boîte ou triangle
    let x, z;
    if (r === 'C') { x = -16; z = ctx.n <= 3 ? 0 : -3.5; }
    else if (r === 'RW' || r === 'LW' || r === 'X') { x = -16; z = 3.5; }
    else { x = -23; z = s * 3; }
    x += (px + 20) * 0.2; z += pz * 0.3;
    const wx = x * t.dir, wz = z * t.dir;
    if (ctx.chaser === b && hyp(p.x - wx, p.z - wz) < 4) return null;
    return [x, z];
  }
  const mk = ctx.mark[b.slot];
  const c = p.carrier;
  if (!mk) return D ? [-24, s * 2] : [-14, s * 6];
  if (mk === c) return null;
  if (ctx.chaser === b && (!c || hyp(c.x - b.x, c.z - b.z) < 3)) return null;
  const mx = mk.x * t.dir, mz = mk.z * t.dir;
  const vx = -GX - mx, vz = -mz, n = hyp(vx, vz) || 1, gap = D ? 1.3 : 2.3;
  return [Math.max(-GX + 0.9, mx + (vx / n) * gap), mz + (vz / n) * gap];
}

export function interceptPoint(m, b) {
  const p = m.puck, sp = hyp(p.vx, p.vz);
  if (sp < 2) return [p.x, p.z];
  const ux = p.vx / sp, uz = p.vz / sp;
  const along = Math.max((b.x - p.x) * ux + (b.z - p.z) * uz, 0.4);
  return [p.x + ux * along, p.z + uz * along];
}

function setTarget(b, x, z) {
  b.ai.tx = clamp(x, -RINK.L + 0.7, RINK.L - 0.7);
  b.ai.tz = clamp(z, -RINK.W + 0.7, RINK.W - 0.7);
}
const setRel = (b, r) => setTarget(b, r[0] * b.team.dir, r[1] * b.team.dir);

function pressure(m, b, ctx) {
  const p = m.puck, c = p.carrier, t = b.team, ai = b.ai;
  if (!c || c.team === t) { setTarget(b, ctx.tx, ctx.tz); ai.sprint = b.p.stamina > 0.25; return; }
  // se placer légèrement côté but
  const gx = -t.dir * GX;
  const dx = gx - c.x, dz = -c.z, n = hyp(dx, dz) || 1;
  setTarget(b, c.x + c.vx * 0.18 + (dx / n) * 0.35, c.z + c.vz * 0.18 + (dz / n) * 0.35);
  const d = hyp(c.x - b.x, c.z - b.z);
  ai.sprint = d > 2.5 && b.p.stamina > 0.3;
  if (d < 1.9 && b.checkCd <= 0 && b.p.stamina > 0.15 && !c.isGoalie) {
    const k = m.userTeam != null && !t.isUser ? m.diff.aiCheck : 1;
    if (R.chance((b.p.a.chk / 800) * k)) {
      b.ctrl.mx = (c.x - b.x) / d; b.ctrl.mz = (c.z - b.z) / d;
      m.check(b);
    }
  }
}

function carrierAI(m, b) {
  const t = b.team, o = m.other(t), ctx = t.ctx, ai = b.ai, p = m.puck;
  const cx = b.x * t.dir, cz = b.z * t.dir;
  ai.holdT = (ai.holdT || 0) + 0.13;
  let press = 1e9, near = null;
  for (const ob of o.skaters) {
    if (!ob.active || ob.stun > 0) continue;
    const d = hyp(ob.x - b.x, ob.z - b.z); if (d < press) { press = d; near = ob; }
  }
  const dGoal = hyp(GX - cx, cz), ang = Math.atan2(Math.abs(cz), GX - cx);
  ai.zoneT = cx > B ? ai.zoneT + 0.13 : 0;
  const goalW = [t.dir * GX, 0];

  if (b.windup) {
    setTarget(b, goalW[0], 0); ai.sp = 0.3;
    if (b.windup.t >= b.windup.need || press < 1.4) m.shoot(b, 'slap', clamp(b.windup.t / 0.8, 0.2, 1), null);
    return;
  }
  // désavantage numérique : dégager
  if (ctx.pk && cx < -2 && (press < 4.5 || R.chance(0.25))) { m.dump(b); return; }

  // lancer
  const emptyNet = !o.goalie.active;
  if (cx > B - 1 || (emptyNet && cx > -2)) {
    let q = clamp(1 - dGoal / 20, 0, 1) * Math.pow(Math.max(0, Math.cos(ang)), 1.2);
    let nb = 0;
    for (const ob of o.skaters) {
      if (ob.active && hyp(ob.x - b.x, ob.z - b.z) > 1 && segDist(ob.x, ob.z, p.x, p.z, goalW[0], 0) < 0.6) nb++;
    }
    q *= Math.pow(0.6, nb);
    if (emptyNet && nb === 0) q = Math.max(q, 0.9);
    const thr = 0.5 + R.f() * 0.25 - Math.min(0.28, ai.zoneT * 0.025) - (press < 1.8 ? 0.15 : 0) - (ctx.pp ? -0.05 : 0);
    if (q > thr && cx < GX - 0.4) {
      if (dGoal > 11 && press > 3.5 && R.chance(0.6)) b.windup = { t: 0, need: R.r(0.4, 0.75), type: 'slap' };
      else m.shoot(b, 'wrist', 0, null);
      return;
    }
  }

  // passe
  let best = null, bv = -1e9, bestLane = 9;
  const myVal = posVal(cx, cz);
  for (const mate of t.skaters) {
    if (!mate.active || mate === b || mate.stun > 0 || mate.changing) continue;
    const mx = mate.x * t.dir, mz = mate.z * t.dir;
    if (ctx.px < B + 0.3 && mx > B + 0.2) continue; // hors-jeu
    const len = hyp(mate.x - b.x, mate.z - b.z);
    if (len < 3 || len > 26) continue;
    let lane = 1e9, open = 1e9;
    for (const ob of o.skaters) {
      if (!ob.active) continue;
      lane = Math.min(lane, segDist(ob.x, ob.z, b.x, b.z, mate.x + mate.vx * 0.3, mate.z + mate.vz * 0.3));
      open = Math.min(open, hyp(ob.x - mate.x, ob.z - mate.z));
    }
    if (lane < 0.8 + len * 0.03) continue;
    let v = posVal(mx, mz) - myVal + Math.min(open, 5) * 0.03 - len * 0.004 + (mx - cx) * 0.004;
    if (t.callFor === mate) v += 1;
    if (v > bv) { bv = v; best = mate; bestLane = lane; }
  }
  const passThr = press < 2.2 ? -0.08 : 0.1 + R.f() * 0.15 - (ctx.pp ? 0.06 : 0);
  if (best && bv > passThr && ai.holdT > 0.3) { m.pass(b, best, bestLane < 1.7); return; }

  // rejet en fond de territoire / dégagement sous pression
  const aheadOpp = near && (near.x - b.x) * t.dir > 0;
  if (cx > 0.6 && cx < B + 1 && press < 2.6 && aheadOpp && !ctx.pp) { m.dump(b); return; }
  if (cx < -B && press < 1.4 && R.chance(0.15)) { m.dump(b); return; }

  // feinte
  if (near && press < 2.4 && b.dekeCd <= 0 && b.p.stamina > 0.15) {
    const fx = Math.cos(b.face), fz = Math.sin(b.face);
    const tx = (near.x - b.x) / press, tz = (near.z - b.z) / press;
    if (fx * tx + fz * tz > 0.6 && R.chance(b.p.a.hnd / 170)) {
      const cross = fx * tz - fz * tx; // défenseur à droite (>0) → feinter à gauche
      const sg = cross > 0 ? -1 : 1;
      m.deke(b, -fz * sg, fx * sg);
    }
  }

  // transport de la rondelle
  let tx, tz;
  const mateOff = ctx.px < B + 0.1 && t.skaters.some((q) => q.active && q !== b && q.x * t.dir > B + 0.35);
  if (cx < B + 0.2) {
    if (mateOff && cx > B - 4) { tx = B - 2.5; tz = cz + (cz > 0 ? -5 : 5); }
    else {
      let bs = -1e9; tx = cx + 7; tz = cz;
      for (let k = -2; k <= 2; k++) {
        const zz = clamp(cz + k * 3.5, -11, 11), xx = cx + 7;
        let od = 6;
        for (const ob of o.skaters) if (ob.active) od = Math.min(od, hyp(ob.x * t.dir - xx, ob.z * t.dir - zz));
        const sc = od * 0.3 - Math.abs(zz) * 0.04 - Math.abs(k) * 0.12;
        if (sc > bs) { bs = sc; tz = zz; }
      }
    }
    ai.sprint = press > 3 && b.p.stamina > 0.35;
  } else if (cx > GX - 1.2) { tx = GX - 6; tz = cz * 0.5; }
  else if (dGoal > 9) { tx = GX - 7; tz = cz * 0.4; }
  else { tx = GX - 3; tz = cz * 0.4; }
  setRel(b, [tx, tz]);
}

function shooterAI(m, b) {
  const t = b.team, ai = b.ai, sp = m.special;
  if (m.puck.carrier !== b) { setTarget(b, b.x, b.z); return; }
  if (sp.phase !== 'live') { setTarget(b, b.x, b.z); return; }
  if (!ai.shootD) { ai.shootD = R.r(4.5, 9); ai.weave = R.r(1, 3) * (R.chance(0.5) ? 1 : -1); }
  const cx = b.x * t.dir, cz = b.z * t.dir, dGoal = hyp(GX - cx, cz);
  ai.sp = 0.8;
  setRel(b, [GX - 2, Math.sin(sp.t * 1.6) * ai.weave]);
  if (dGoal < ai.shootD + 2.5 && b.dekeCd <= 0 && R.chance(0.12)) m.deke(b, -Math.sin(b.face) * Math.sign(ai.weave), Math.cos(b.face) * Math.sign(ai.weave));
  if (dGoal < ai.shootD) { ai.shootD = 0; m.shoot(b, 'wrist', 0, null); }
}

function decide(m, b) {
  const t = b.team, ctx = t.ctx, p = m.puck, ai = b.ai;
  ai.sprint = false; ai.faceTo = null; ai.sp = 1;
  if (b.stun > 0) return;
  if (m.special) return shooterAI(m, b);
  if (p.carrier === b) return carrierAI(m, b);
  ai.holdT = 0;
  if (b.changing) { const bp = benchPos(t); setTarget(b, bp.x, bp.z); return; }
  if (!p.carrier && p.pass && p.pass.to === b) {
    const ip = interceptPoint(m, b); setTarget(b, ip[0], ip[1]); return;
  }
  if (!p.carrier) {
    if (ctx.chaser === b || (ctx.second === b && ctx.px < -B)) {
      setTarget(b, ctx.tx, ctx.tz); ai.sprint = b.p.stamina > 0.25; return;
    }
    if (ctx.myEta < ctx.oppEta + 0.25) { setRel(b, offenseSpot(m, b, ctx)); return; }
  } else if (ctx.has) {
    setRel(b, offenseSpot(m, b, ctx));
    ai.sprint = ctx.px > -B && ctx.px < B && b.p.stamina > 0.5 && !isDef(b);
    return;
  }
  const sp = defenseSpot(m, b, ctx);
  if (!sp) pressure(m, b, ctx);
  else { setRel(b, sp); ai.faceTo = p; ai.sprint = hyp(ai.tx - b.x, ai.tz - b.z) > 7 && b.p.stamina > 0.4; }
}

function steer(b) {
  const ai = b.ai;
  const dx = ai.tx - b.x, dz = ai.tz - b.z, d = hyp(dx, dz);
  if (b.checkT > 0) return;
  if (d < 0.3) { b.ctrl.mx = 0; b.ctrl.mz = 0; b.ctrl.sprint = false; return; }
  const want = Math.min(1, d / 2.6) * ai.sp;
  b.ctrl.mx = (dx / d) * want; b.ctrl.mz = (dz / d) * want;
  b.ctrl.sprint = ai.sprint && d > 4;
}

export function aiUpdate(m, dt) {
  for (const t of m.teams) {
    t.ctxT = (t.ctxT || 0) - dt;
    if (t.ctxT <= 0) { buildCtx(m, t); t.ctxT = 0.1; }
    if (t.callT > 0) { t.callT -= dt; if (t.callT <= 0) t.callFor = null; }
  }
  for (const t of m.teams) for (const b of t.skaters) {
    if (!b.active) continue;
    if (b.windup) b.windup.t += dt;
    if (b.human && !m.autoUser) continue;
    b.ai.next -= dt;
    if (b.ai.next <= 0) { decide(m, b); b.ai.next = 0.1 + R.f() * 0.06; }
    steer(b);
  }
}
