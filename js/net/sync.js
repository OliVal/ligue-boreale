// Match en ligne : l'hôte simule, l'invité affiche.
// Hôte → invité : état rapide (positions, 30 fois/s), état complet (4 fois/s) et événements du match.
// Invité → hôte : ses touches. Aucun affichage ici : testable avec Node.
import { updateHuman } from '../game/human.js';

const FAST_HZ = 30, SLOW_HZ = 4;
const r3 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1000) / 1000 : v);
// champs d'animation envoyés 30 fois par seconde (les positions sont traitées à part)
const ANIM = ['stride', 'stun', 'checkT', 'shotAnim', 'dekeT', 'down', 'saveAnim', 'saveSide'];
// champs d'un corps jamais envoyés : liens fixes, IA et commandes (l'invité ne simule pas)
const BODY_SKIP = new Set(['team', 'ai', 'ctrl', 'id', 'slot', 'isGoalie', 'role', 'x', 'z', 'vx', 'vz', 'face', 'track', 'oneTimer', ...ANIM]);
const MATCH_KEYS = ['period', 'clock', 'state', 'stateT', 'base', 'winner', 'special', 'so', 'offD', 'pending', 'goals', 'stars', 'lastGoal', 'lmFlag'];
const TEAM_KEYS = ['score', 'pens', 'pulled', 'curF', 'curD', 'shiftT', 'stats'];
// événements que l'invité n'a pas besoin de recevoir
const NO_FWD = new Set(['switch']);
// avant ces événements, l'hôte envoie l'état complet (pointage, pénalités, buts à jour)
const SLOW_FIRST = new Set(['goal', 'final', 'penalty', 'penaltyEnd', 'periodEnd', 'periodStart', 'attemptEnd', 'shootoutStart', 'whistle']);

export const bodiesOf = (m) => m.teams.flatMap((t) => [...t.skaters, t.goalie]);

// Convertit les liens vers les objets du match (corps, équipes, joueurs) en identifiants, et inversement
export function codec(m) {
  const bodies = bodiesOf(m), bIdx = new Map(bodies.map((b, i) => [b, i])), pIdx = new Map();
  m.teams.forEach((t, ti) => t.roster.forEach((p, i) => pIdx.set(p, [ti, i])));
  const pack = (v, depth = 0) => {
    if (v === null || v === undefined) return v === null ? null : undefined;
    const ty = typeof v;
    if (ty === 'function') return undefined;
    if (ty !== 'object') return ty === 'number' ? r3(v) : v;
    if (bIdx.has(v)) return { $b: bIdx.get(v) };
    if (pIdx.has(v)) return { $p: pIdx.get(v) };
    const ti = m.teams.indexOf(v);
    if (ti >= 0) return { $t: ti };
    if (depth > 5 || v instanceof Set || v instanceof Map) return undefined;
    if (Array.isArray(v)) return v.map((x) => { const y = pack(x, depth + 1); return y === undefined ? null : y; });
    const o = {};
    for (const k in v) { const y = pack(v[k], depth + 1); if (y !== undefined) o[k] = y; }
    return o;
  };
  const unpack = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(unpack);
    if ('$b' in v) return bodies[v.$b] || null;
    if ('$p' in v) return m.teams[v.$p[0]].roster[v.$p[1]] || null;
    if ('$t' in v) return m.teams[v.$t];
    const o = {};
    for (const k in v) o[k] = unpack(v[k]);
    return o;
  };
  return { pack, unpack, bodies };
}

// Touches de l'invité, rejouées par l'hôte comme un clavier
export class RemoteInput {
  constructor() { this.held = new Set(); this.hit = new Set(); this.basis = null; }
  feed(msg) {
    this.held = new Set(msg.d || []);
    for (const a of msg.p || []) this.hit.add(a);
    if (msg.bs) this.basis = { rx: msg.bs[0], rz: msg.bs[1], fx: msg.bs[2], fz: msg.bs[3] };
    this.an = msg.a || null; // joystick tactile de l'invité (direction analogique)
  }
  stick() {
    if (this.an) return this.an;
    return [(this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0), (this.down('up') ? 1 : 0) - (this.down('down') ? 1 : 0)];
  }
  down(a) { return this.held.has(a); }
  pressed(a) { return this.hit.has(a); }
  endFrame() { this.hit.clear(); }
}

export class NetHost {
  constructor(m, send, guestSide, fastHz = FAST_HZ) {
    this.m = m; this.send = send; this.side = guestSide; this.remote = new RemoteInput(); this.hz = fastHz;
    this.c = codec(m); this.tf = 0; this.ts = 0;
    m.on((type, d) => {
      if (NO_FWD.has(type)) return;
      if (SLOW_FIRST.has(type)) this.sendSlow();
      this.send({ k: 'e', type, d: this.c.pack(d) });
    });
  }
  onMessage(msg) { if (msg.k === 'i') this.remote.feed(msg); }
  // à chaque image, avant la simulation : applique les touches de l'invité à son équipe
  applyRemote(fallbackBasis) {
    updateHuman(this.m, this.remote, this.remote.basis || fallbackBasis, this.side);
    this.remote.endFrame();
  }
  // à chaque image, après la simulation
  frame(dt) {
    this.tf += dt; this.ts += dt;
    if (this.ts >= 1 / SLOW_HZ) { this.ts = 0; this.sendSlow(); }
    if (this.tf >= 1 / this.hz) { this.tf = 0; this.sendFast(); }
  }
  sendFast() {
    const m = this.m, p = m.puck, c = this.c, fo = m.fo;
    const b = c.bodies.map((q) => {
      if (!q.active || !q.p) return 0;
      const pi = q.team.roster.indexOf(q.p);
      return [pi, r3(q.x), r3(q.z), r3(q.vx), r3(q.vz), r3(q.face), ...ANIM.map((k) => r3(q[k] || 0)), q.windup ? r3(q.windup.t) : -1, q.human ? 1 : 0];
    });
    const ci = p.carrier ? c.bodies.indexOf(p.carrier) : -1;
    this.send({ k: 'f', t: r3(m.time), st: m.state, cl: r3(m.clock), sc: m.teams.map((t) => t.score), b,
      pk: [r3(p.x), r3(p.y), r3(p.z), r3(p.vx), r3(p.vy), r3(p.vz), ci],
      ub: m.teams.map((t) => (t.ub ? c.bodies.indexOf(t.ub) : -1)),
      fo: fo ? [r3(fo.t), r3(fo.dropAt), fo.dropped ? 1 : 0, fo.earlyV ? +fo.earlyV[0] : 0, fo.earlyV ? +fo.earlyV[1] : 0] : 0 });
  }
  sendSlow() {
    const m = this.m, { pack, bodies } = this.c, mo = {}, bo = [];
    for (const k of MATCH_KEYS) mo[k] = pack(m[k]);
    for (const b of bodies) { const o = {}; for (const k in b) if (!BODY_SKIP.has(k)) { const v = pack(b[k]); if (v !== undefined) o[k] = v; } bo.push(o); }
    this.send({ k: 'S', m: mo,
      t: m.teams.map((t) => { const o = {}; for (const k of TEAM_KEYS) o[k] = pack(t[k]); return o; }),
      r: m.teams.map((t) => t.roster.map((q) => [r3(q.stamina), r3(q.unavailable), r3(q.abUntil || 0), r3(q.abReady || 0), pack(q.st)])),
      b: bo });
  }
}

export class NetClient {
  constructor(m, send, side) {
    this.m = m; this.send = send; this.side = side; this.c = codec(m);
    this.tgt = this.c.bodies.map(() => null); this.pk = null; this.age = 0; this.inT = 0; this.lastIn = '';
    this.got = false; this.lead = 0.05; // délai estimé hôte → invité (moitié du ping), corrigé par setPing
  }
  setPing(ms) { this.lead = Math.min(0.15, Math.max(0.01, ms / 2000)); }
  onMessage(msg) {
    const m = this.m;
    if (msg.k === 'f') this.applyFast(msg);
    else if (msg.k === 'S') this.applySlow(msg);
    else if (msg.k === 'e') {
      const d = this.c.unpack(msg.d) || {};
      if (msg.type === 'goal' && d.team) m.lastGoal = { team: d.team, scorer: d.scorer, time: m.time, s: d.s };
      if (msg.type === 'final') { m.state = 'final'; m.winner = d.winner; }
      if (msg.type === 'faceoffEarly' && d.side !== this.side) return; // l'erreur de l'autre joueur ne concerne pas cet écran
      m.emit(msg.type, d);
    }
  }
  applyFast(f) {
    const m = this.m, bodies = this.c.bodies;
    this.got = true;
    m.time = f.t; m.clock = f.cl;
    if (m.state !== 'final') m.state = f.st;
    f.sc.forEach((s, i) => { m.teams[i].score = s; });
    f.b.forEach((e, i) => {
      const b = bodies[i];
      if (!e) { b.active = false; b.human = false; this.tgt[i] = null; return; }
      const wasOff = !b.active;
      b.active = true; b.p = b.team.roster[e[0]] || b.p;
      ANIM.forEach((k, j) => { b[k] = e[6 + j]; });
      const w = e[6 + ANIM.length];
      b.windup = w >= 0 ? { t: w, type: 'slap', need: 99 } : null;
      b.human = !!e[7 + ANIM.length];
      this.tgt[i] = { x: e[1], z: e[2], vx: e[3], vz: e[4] };
      b.vx = e[3]; b.vz = e[4]; b.face = e[5];
      if (wasOff || Math.hypot(b.x - e[1], b.z - e[2]) > 3) { b.x = e[1]; b.z = e[2]; }
    });
    const p = m.puck, k = f.pk;
    this.pk = { x: k[0], y: k[1], z: k[2], vx: k[3], vy: k[4], vz: k[5] };
    p.vx = k[3]; p.vy = k[4]; p.vz = k[5]; p.carrier = k[6] >= 0 ? bodies[k[6]] : null;
    if (Math.hypot(p.x - k[0], p.z - k[2]) > 2.5) { p.x = k[0]; p.y = k[1]; p.z = k[2]; }
    m.teams.forEach((t, i) => { t.ub = f.ub[i] >= 0 ? bodies[f.ub[i]] : null; });
    if (f.fo) {
      const fo = m.fo || (m.fo = {});
      Object.assign(fo, { t: f.fo[0], dropAt: f.fo[1], dropped: !!f.fo[2], user: true, vs: true, early: !!f.fo[3 + this.side] });
    }
    this.age = 0;
  }
  applySlow(s) {
    const m = this.m, { unpack, bodies } = this.c;
    for (const k in s.m) {
      if (k === 'state' && m.state === 'final') continue;
      m[k] = unpack(s.m[k]);
    }
    s.t.forEach((o, i) => Object.assign(m.teams[i], unpack(o)));
    s.r.forEach((list, ti) => list.forEach((e, i) => {
      const q = m.teams[ti].roster[i];
      q.stamina = e[0]; q.unavailable = e[1]; q.abUntil = e[2]; q.abReady = e[3]; q.st = unpack(e[4]);
    }));
    s.b.forEach((o, i) => Object.assign(bodies[i], unpack(o)));
  }
  // à chaque image : envoie les touches, puis prolonge les mouvements entre deux états reçus
  frame(dt, input, basis, actions, idle) {
    const held = idle ? [] : actions.filter((a) => input.down(a)), hit = idle ? [] : actions.filter((a) => input.pressed(a));
    const an = !idle && (input.ax || input.ay) ? [Math.round(input.ax * 20) / 20, Math.round(input.ay * 20) / 20] : null;
    const key = held.join() + (an ? '|' + an.join() : '');
    this.inT += dt;
    if (hit.length || key !== this.lastIn || this.inT > 0.1) {
      const msg = { k: 'i', d: held, p: hit, bs: [r3(basis.rx), r3(basis.rz), r3(basis.fx), r3(basis.fz)] };
      if (an) msg.a = an;
      this.send(msg);
      this.lastIn = key; this.inT = 0;
    }
    const m = this.m, a = Math.min(1, dt * 14);
    this.age = Math.min(this.age + dt, 0.25);
    const ahead = this.age + this.lead;
    m.time += dt;
    if (m.fo && m.state === 'faceoff') m.fo.t += dt;
    this.c.bodies.forEach((b, i) => {
      const g = this.tgt[i];
      if (!g || !b.active) return;
      b.x += (g.x + g.vx * ahead - b.x) * a; b.z += (g.z + g.vz * ahead - b.z) * a;
    });
    const g = this.pk, p = m.puck;
    if (g) {
      const k = Math.min(1, dt * 22);
      p.x += (g.x + g.vx * ahead - p.x) * k; p.z += (g.z + g.vz * ahead - p.z) * k; p.y += (g.y - p.y) * k;
    }
  }
}
