// Reprises : enregistre les dernières secondes de jeu et les rejoue au ralenti sous plusieurs angles
import { angDiff } from '../core/util.js';

const RATE = 1 / 30, MAX = 330; // environ 11 secondes de mémoire

function snapBody(b) {
  return {
    active: b.active && !!b.p, isGoalie: b.isGoalie, team: b.team, p: b.p,
    x: b.x, z: b.z, vx: b.vx, vz: b.vz, face: b.face, stun: b.stun, checkT: b.checkT, stride: b.stride,
    windup: b.windup ? { t: b.windup.t } : null, shotAnim: b.shotAnim,
    down: b.down, saveAnim: b.saveAnim, saveSide: b.saveSide,
  };
}

export class Replay {
  constructor() { this.reset(); }

  reset() { this.buf = []; this.lastT = -1; this.active = null; this.pending = null; this.highlight = null; }

  record(m, list) {
    if (m.time - this.lastT < RATE) return;
    this.lastT = m.time;
    const p = m.puck;
    this.buf.push({
      time: m.time, bodies: list.map(snapBody),
      puck: { x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz, rolling: p.rolling, spin: p.spin, inNet: p.inNet, carrier: !!p.carrier },
      cel: m.state === 'goal' && m.lastGoal ? m.lastGoal : null,
    });
    if (this.buf.length > MAX) this.buf.shift();
  }

  // spec = { kind: 'goal' | 'hit' | 'save', t, s, x, z, delay }
  schedule(spec) { this.pending = { ...spec }; }

  // Décompte avant le début de la reprise; retourne true quand elle démarre
  countdown(dt, m) {
    const q = this.pending;
    if (!q) return false;
    if (m.state !== 'goal' && m.state !== 'whistle') { this.pending = null; return false; }
    q.delay -= dt;
    if (q.delay > 0) return false;
    this.pending = null;
    if (this.buf.length < 20) return false;
    const t = q.t, first = this.buf[0].time, lastT = this.buf[this.buf.length - 1].time;
    const mk = (cam, back, fwd, speed, label) => ({ cam, from: Math.max(first, t - back), to: Math.min(lastT, t + fwd), speed, label });
    let shots;
    if (q.kind === 'goal') shots = [mk('net', 3.3, 0.9, 0.6, 'Angle du filet'), mk('low', 1.7, 0.9, 0.33, 'Ralenti')];
    else if (q.kind === 'hit') shots = [mk('close', 1.6, 1.0, 0.4, 'Ralenti')];
    else shots = [mk('net', 1.7, 0.7, 0.4, 'Ralenti')];
    this.active = { spec: q, shots, i: 0, t: shots[0].from, title: { goal: 'REPRISE DU BUT', hit: 'REPRISE — MISE EN ÉCHEC', save: 'REPRISE — ARRÊT' }[q.kind] };
    return true;
  }

  skip() { if (this.active) this.active.i = this.active.shots.length; }

  frameAt(t) {
    const buf = this.buf;
    let i = buf.length - 1;
    while (i > 0 && buf[i].time > t) i--;
    const a = buf[i], b = buf[Math.min(i + 1, buf.length - 1)];
    const k = b.time > a.time ? Math.min(1, Math.max(0, (t - a.time) / (b.time - a.time))) : 0;
    const L = (x, y) => x + (y - x) * k;
    const bodies = a.bodies.map((s, j) => {
      const e = b.bodies[j];
      if (!s.active || !e.active || s.p !== e.p) return s;
      return { ...s, x: L(s.x, e.x), z: L(s.z, e.z), face: s.face + angDiff(s.face, e.face) * k, stride: L(s.stride, e.stride), stun: L(s.stun, e.stun) };
    });
    const pa = a.puck, pb = b.puck;
    return { time: t, bodies, cel: a.cel, puck: { ...pa, x: L(pa.x, pb.x), y: L(pa.y, pb.y), z: L(pa.z, pb.z), spin: L(pa.spin, pb.spin) } };
  }

  // Avance la reprise. Retourne { frame, shot, spec, title, done }
  update(dt) {
    const A = this.active;
    if (!A) return null;
    if (A.i >= A.shots.length) { this.active = null; return { done: true }; }
    const sh = A.shots[A.i];
    A.t += dt * sh.speed;
    const frame = this.frameAt(Math.min(A.t, sh.to));
    const n = A.i + 1;
    if (A.t >= sh.to + 0.25 * sh.speed) { A.i++; if (A.i < A.shots.length) A.t = A.shots[A.i].from; }
    return { frame, shot: sh, spec: A.spec, title: A.title, n, total: A.shots.length, done: false };
  }
}
