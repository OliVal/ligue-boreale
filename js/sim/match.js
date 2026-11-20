// Moteur de match : boucle de simulation, actions (lancers, passes, mises en échec), règles et déroulement
import { RINK, G, DIFFS, GOALIE_DIFFS, DOTS } from '../core/config.js';
import { R, hyp, clamp, angDiff } from '../core/util.js';
import { constrain, keepOutOfNet, boardDist, nearestDot, zoneDot, neutralDot } from './rink.js';
import { mkTeam, deploy, lineupFor, benchPos, boxPos } from './entities.js';
import { makePuck, stepPuck, setRolling } from './puck.js';
import { updateGoalie, inTrapezoid } from './goalie.js';
import { aiUpdate } from './ai.js';

const FO_SPOTS = { C: [-0.8, 0], LW: [-1.3, -4.2], RW: [-1.3, 4.2], LD: [-5.5, -2.6], RD: [-5.5, 2.6], X: [-3, 1.5] };
const ALL_DOTS = [DOTS.center, ...DOTS.neutral, ...DOTS.zone];
// Rotation des trios et des duos : les premiers jouent plus souvent
const F_ROT = [0, 1, 0, 2, 1, 0, 3, 0, 1, 2], D_ROT = [0, 1, 0, 2, 1];

export class Match {
  constructor({ home, away, settings, user = null, mode = 'game', autoUser = false, lock = null, versus = false }) {
    this.set = settings; this.diff = DIFFS[settings.difficulty] || DIFFS[1];
    this.mode = mode; this.userTeam = user; this.autoUser = autoUser;
    this.base = mode === 'game' || mode === 'practice' ? settings.skaters : 5;
    this.teams = [mkTeam(home, 0, 1, this.base), mkTeam(away, 1, -1, this.base)];
    if (user != null) this.teams[user].isUser = true;
    // En ligne : deux humains, un par équipe (chaque équipe garde son joueur contrôlé dans t.ub)
    this.versus = versus && user != null;
    if (this.versus) for (const t of this.teams) t.isUser = true;
    // Carrière : l'utilisateur ne contrôle qu'un seul joueur (lock = identifiant du joueur)
    this.lockPl = lock != null && user != null ? this.teams[user].roster.find((q) => q.d.id === lock) || null : null;
    // Carrière de gardien : niveaux propres au gardien (voir GOALIE_DIFFS)
    if (this.lockPl && this.lockPl.pos === 'G') this.diff = GOALIE_DIFFS[settings.difficulty] || GOALIE_DIFFS[1];
    this.puck = makePuck();
    this.time = 0; this.period = 1; this.clock = 1200;
    this.clockScale = 1200 / (settings.periodMin * 60);
    this.state = 'whistle'; this.stateT = 0; this.next = null;
    this.listeners = []; this.pending = []; this.goals = [];
    this.offD = [false, false]; this.pIn = [false, false];
    this.special = null; this.fo = null; this.fight = null; this.so = null;
    this.userBody = null; this.winner = null; this.stars = [];
    if (mode === 'shootout') { this.state = 'intermission'; this.stateT = 0.5; this.next = () => this.startShootout(); }
    else this.setupFaceoff(DOTS.center);
  }

  // joueur contrôlé par l'utilisateur local
  get userBody() { return this.userTeam == null ? null : this.teams[this.userTeam].ub || null; }
  set userBody(b) { if (this.userTeam != null) this.teams[this.userTeam].ub = b; }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) {
    if (type === 'save' && this.special) this.special.saved = true;
    for (const fn of this.listeners) fn(type, data);
  }
  other(t) { return this.teams[1 - t.idx]; }
  gkBonus(g) {
    if (this.userTeam == null || this.autoUser) return 0;
    return g.team.isUser ? this.diff.userGoalie : this.diff.cpuGoalie;
  }
  errMul(t) {
    if (this.userTeam == null || this.autoUser) return 1.2;
    return t.isUser ? this.diff.userErr : this.diff.aiErr;
  }
  get live() { return this.state === 'play'; }

  skaterCount(t) {
    const o = this.other(t);
    const mine = Math.min(2, t.pens.filter((q) => !q.major).length);
    const theirs = Math.min(2, o.pens.filter((q) => !q.major).length);
    let n = Math.max(3, this.base - mine) + Math.max(0, 3 - (this.base - theirs));
    n = Math.min(5, n);
    if (t.pulled) n++;
    return Math.min(6, n);
  }

  // ---------- possession ----------
  touch(b) {
    const t = b.team, p = this.puck;
    if (p.lastTeam !== t) t.touch.length = 0;
    if (!b.isGoalie) {
      const i = t.touch.indexOf(b.p); if (i >= 0) t.touch.splice(i, 1);
      t.touch.push(b.p); if (t.touch.length > 3) t.touch.shift();
    }
    p.lastTeam = t; p.rel = null;
    if (this.state === 'play' && !this.special && this.offD[t.idx]) { this.offsideCall(t); return false; }
    return true;
  }

  gain(b) {
    const p = this.puck;
    if (!this.touch(b)) return;
    // règle du trapèze : un gardien qui joue la rondelle derrière sa ligne de but, hors du trapèze
    const trap = b.isGoalie && this.state === 'play' && !this.special && !inTrapezoid(p.x, p.z);
    p.carrier = b; p.shot = null; p.pass = null; p.rolling = 0; p.vy = 0; p.y = 0;
    if (trap) { this.callPenalty(b, 'delay'); if (this.state !== 'play') return; }
    b.holdT = 0; b.ai.zoneT = 0; b.ai.holdT = 0; b.bk = false;
    if (this.state === 'play' && this.pending.some((q) => q.body.team === b.team)) { this.stopForPenalty(); return; }
    if (b.team.isUser && !b.isGoalie && b.team.ub !== b) this.setUser(b);
    this.emit('gain', { by: b });
    b.ai.next = Math.max(b.ai.next, this.diff.aiReact * R.r(0.5, 1.2));
    if (b.oneTimer && this.time < b.oneTimer.exp) {
      const o = b.oneTimer; b.oneTimer = null;
      this.shoot(b, o.type, 0.85, o.aim, true);
    }
    b.oneTimer = null;
  }

  release(b) {
    const p = this.puck;
    p.carrier = null; p.rel = { team: b.team, fx: p.x * b.team.dir };
    b.pickupCd = 0.3; b.lostPuckT = 0; b.windup = null; p.seq++;
  }

  knockLoose(o, kx, kz) {
    const p = this.puck;
    if (p.carrier !== o) return;
    p.carrier = null; p.vx = o.vx * 0.4 + kx; p.vz = o.vz * 0.4 + kz; p.vy = 0;
    o.pickupCd = 0.45; o.lostPuckT = 0; o.windup = null; p.seq++; p.rel = null;
  }

  setUser(b, t = b ? b.team : this.teams[this.userTeam]) {
    if (!t) return;
    if (this.lockPl) {
      t = this.teams[this.userTeam];
      b = t.skaters.find((q) => q.active && q.p === this.lockPl) || (t.goalie.active && t.goalie.p === this.lockPl ? t.goalie : null);
      if (b === t.ub) return;
    }
    if (t.ub) t.ub.human = false;
    t.ub = b;
    if (b) { b.human = true; b.oneTimer = null; }
    this.emit('switch', { body: b });
  }

  // ---------- actions ----------
  shoot(b, type, charge, aim, oneT = false) {
    const p = this.puck;
    if (p.carrier !== b || b.isGoalie) return;
    const a = b.p.a, t = b.team, o = this.other(t), gx = t.dir * RINK.goalX;
    const fat = 0.72 + 0.28 * Math.pow(b.p.stamina, 0.7);
    let az = aim, err = 1;
    const og = o.goalie;
    if (az == null) {
      if (og.active) {
        const k = (og.x - p.x) / ((gx - p.x) || 1e-6);
        const lineZ = p.z + (0 - p.z) * k;
        az = (og.z > lineZ ? -1 : 1) * R.r(0.5, 0.95);
      } else az = 0;
      if (b.human) err = 1.25;
    }
    const tz = clamp(az, -1, 1) * (RINK.netHW - 0.15);
    let h = type === 'slap' ? R.pick([0.05, 0.3, 0.6]) : R.pick([0.1, 0.5, 0.9, 1.0]);
    if (og.active && og.down > 0 && R.chance(0.7)) h = R.r(0.85, 1.05);
    if (!og.active) h = 0.1;
    const dx = gx - p.x, dz = tz - p.z, D = hyp(dx, dz) || 1;
    let ang = Math.atan2(dz, dx);
    let speed = type === 'slap' ? (25 + 17 * a.sht / 100) * (0.62 + 0.38 * charge) : 20 + 11 * a.sht / 100;
    if (Math.abs(angDiff(b.face, ang)) > 1.75) { speed *= 0.75; err *= 1.4; } // revers
    if (oneT) speed *= 1.07;
    if (this.abOn(b.p, 'snipe')) { speed *= 1.08; err *= 0.2; }
    speed *= 0.85 + 0.15 * fat;
    const sd = (type === 'slap' ? 0.05 : 0.03) * (1.7 - a.accu / 100) * (1 + hyp(b.vx, b.vz) / 15) * (2 - fat) * err * this.errMul(t);
    ang += R.g() * sd;
    const tt = D / speed;
    let vy = h < 0.2 ? 0 : clamp((h + R.g() * sd * D * 0.6) / tt + 0.5 * G * tt, 0, 14);
    this.release(b);
    p.vx = Math.cos(ang) * speed; p.vz = Math.sin(ang) * speed; p.vy = vy; if (vy > 0) p.y = 0.03;
    p.shot = { by: b, team: t, t: 0, type, seen: new Set(), credited: false };
    b.shotAnim = 0.45; b.p.stamina = Math.max(0, b.p.stamina - 0.015);
    if (this.special) this.special.shotTaken = true;
    this.emit('shot', { by: b, type, speed, oneT, dist: D });
  }

  pass(b, target, saucer) {
    const p = this.puck;
    if (p.carrier !== b || !target || this.special) return;
    const a = b.p.a;
    let tx = target.x, tz = target.z, d = hyp(tx - p.x, tz - p.z);
    const vision = this.abOn(b.p, 'vision');
    let sp = clamp(10 + d * 0.85, 12, 27); if (saucer) sp *= 0.88; if (vision) sp *= 1.15;
    for (let i = 0; i < 2; i++) {
      const tt = d / sp;
      tx = target.x + target.vx * tt * 0.85; tz = target.z + target.vz * tt * 0.85;
      d = hyp(tx - p.x, tz - p.z);
    }
    const sd = b.isGoalie ? 0.03 : 0.022 * (1.7 - a.pas / 100) * (1 + hyp(b.vx, b.vz) / 18) * this.errMul(b.team) * (vision ? 0.15 : 1);
    const ang = Math.atan2(tz - p.z, tx - p.x) + R.g() * sd;
    this.release(b);
    p.vx = Math.cos(ang) * sp; p.vz = Math.sin(ang) * sp; p.vy = 0;
    if (saucer) { p.vy = Math.min(5, G * (d / sp) / 2); p.y = 0.03; }
    p.pass = { to: target, team: b.team, t: 0, saucer };
    b.shotAnim = 0.25;
    this.emit('pass', { by: b, to: target, saucer });
    if (b.team.isUser && !target.isGoalie) this.setUser(target);
  }

  dump(b, dx = 0, dz = 0) {
    const p = this.puck;
    if (p.carrier !== b || this.special) return;
    const t = b.team;
    let ang;
    if (hyp(dx, dz) > 0.3) ang = Math.atan2(dz, dx);
    else ang = Math.atan2((b.z >= 0 ? 1 : -1) * 10.5 - p.z, t.dir * 28 - p.x);
    this.release(b);
    // de sa propre moitié : dégagement plus court (par la bande) pour limiter les dégagements refusés,
    // sauf en désavantage numérique où l'on dégage à pleine force
    const own = p.x * t.dir < 0 && !(this.skaterCount(t) < this.skaterCount(this.other(t))) && !b.human;
    const sp = own ? 13 : 21;
    p.vx = Math.cos(ang) * sp; p.vz = Math.sin(ang) * sp; p.vy = own ? 5 : 6.2; p.y = 0.03;
    b.shotAnim = 0.3;
    this.emit('dump', { by: b });
  }

  deke(b, dx, dz) {
    if (b.dekeCd > 0 || b.stun > 0 || b.p.stamina < 0.05) return;
    const rx = -Math.sin(b.face), rz = Math.cos(b.face);
    let s = dx * rx + dz * rz;
    s = Math.abs(s) > 0.2 ? Math.sign(s) : (R.chance(0.5) ? 1 : -1);
    b.vx += rx * s * 4.4; b.vz += rz * s * 4.4;
    b.dekeT = 0.42; b.dekeCd = 1.1; b.dekeSide = s;
    b.p.stamina = Math.max(0, b.p.stamina - 0.04);
    this.emit('deke', { by: b });
  }

  check(b) {
    if (b.checkCd > 0 || b.stun > 0 || this.puck.carrier === b || this.special) return;
    let dx = b.ctrl.mx, dz = b.ctrl.mz; const l = hyp(dx, dz);
    if (l > 0.3) { dx /= l; dz /= l; } else { dx = Math.cos(b.face); dz = Math.sin(b.face); }
    b.vx += dx * 3.8; b.vz += dz * 3.8;
    b.checkT = 0.3; b.checkCd = 1.3; b.hitDone = false;
    b.p.stamina = Math.max(0, b.p.stamina - 0.05);
  }

  resolveHit(a, o) {
    a.hitDone = true;
    if (o.isGoalie || o.stun > 0) return;
    const p = this.puck, carrier = p.carrier === o, recent = o.lostPuckT < 0.9;
    const dx = o.x - a.x, dz = o.z - a.z, d = hyp(dx, dz) || 1, nx = dx / d, nz = dz / d;
    const rel = Math.max(0, (a.vx - o.vx) * nx + (a.vz - o.vz) * nz);
    if (!carrier && !recent) { // obstruction
      o.stun = 0.7; o.vx += nx * 3; o.vz += nz * 3;
      this.emit('hit', { by: a, on: o, illegal: true });
      if (R.chance(0.6)) this.callPenalty(a, R.chance(0.5) ? 'cross' : 'hold', o);
      return;
    }
    const fromBehind = Math.cos(o.face) * nx + Math.sin(o.face) * nz > 0.55;
    const pow = a.p.a.chk * 0.5 + rel * 6 + R.r(0, 30) + (this.abOn(a.p, 'shield') ? 25 : 0);
    const res = o.p.a.chk * 0.3 + o.p.a.acc * 0.15 + 28 + (o.dekeT > 0 ? 45 : 0) + R.r(0, 25) + (this.abOn(o.p, 'shield') ? 70 : 0);
    if (pow > res) {
      if (carrier) this.knockLoose(o, nx * R.r(1, 4) + R.r(-2, 2), nz * R.r(1, 4) + R.r(-2, 2));
      o.stun = R.r(0.9, 1.5); o.vx += nx * 4; o.vz += nz * 4;
      a.p.st.hits++; a.team.stats.hits++;
      const big = pow - res > 22;
      this.emit('hit', { by: a, on: o, big });
      if (fromBehind && boardDist(o.x, o.z) < 1.8 && R.chance(0.4)) this.callPenalty(a, 'cross', o);
      else if (big && this.set.fights && this.mode === 'game' && R.chance(0.04)) this.startFight(a, o);
    } else {
      a.vx *= 0.4; a.vz *= 0.4;
      if (carrier && R.chance(0.3)) this.knockLoose(o, R.r(-3, 3), R.r(-3, 3));
      this.emit('hit', { by: a, on: o, weak: true });
    }
  }

  // ---------- capacités spéciales (Carrière) ----------
  abOn(pl, type) { return pl.ability === type && this.time < (pl.abUntil || 0); }
  useAbility(b) {
    const pl = b && b.p;
    if (!pl || !pl.ability || this.state !== 'play' || this.time < (pl.abReady || 0)) return false;
    pl.abUntil = this.time + 7; pl.abReady = this.time + 50;
    this.emit('ability', { by: b, type: pl.ability });
    return true;
  }

  // Carrière : l'entraîneur déplace le joueur verrouillé sur un autre trio ou duo (à un arrêt de jeu)
  moveLock(line) {
    const t = this.teams[this.userTeam], me = this.lockPl;
    for (const L of [t.lines.F, t.lines.D]) for (let i = 0; i < L.length; i++) {
      const s = L[i].indexOf(me);
      if (s < 0 || !L[line] || line === i) continue;
      L[i][s] = L[line][s]; L[line][s] = me;
      return true;
    }
    return false;
  }
  nextLine(t) { t.rot = (t.rot || 0) + 1; t.curF = F_ROT[t.rot % F_ROT.length]; t.curD = D_ROT[t.rot % D_ROT.length]; t.shiftT = 0; }

  // ---------- pénalités ----------
  callPenalty(b, type, victim) {
    if (!this.set.penalties || this.special || this.state !== 'play' || this.mode !== 'game') return;
    if (this.pending.some((q) => q.body === b)) return;
    const p = this.puck;
    let ps = false;
    if (victim && (p.carrier === victim || victim.lostPuckT < 0.5)) {
      // tir de pénalité seulement pour une vraie échappée : devant la ligne de but (pas derrière le filet ni dans un coin),
      // en patinant vers le filet, sans défenseur devant lui. Sinon : pénalité ordinaire (avantage numérique).
      const t = victim.team, fx = victim.x * t.dir;
      const chance = fx > RINK.blueX && fx < RINK.goalX - 1 && Math.abs(victim.z) < RINK.W - 4 && victim.vx * t.dir > 1.5;
      if (chance && !b.team.skaters.some((q) => q.active && q !== b && q.x * t.dir > fx - 0.5)) ps = true;
    }
    // pénalité d'un gardien : un coéquipier va au banc à sa place (les minutes sont inscrites au gardien)
    const server = b.isGoalie ? (b.team.skaters.find((q) => q.active) || {}).p || null : null;
    this.pending.push({ body: b, pl: b.p, type, min: 2, ps, victim, server });
    this.emit('penaltyCall', { by: b, type, ps });
    const c = p.carrier;
    if (c && c.team === b.team) this.stopForPenalty();
  }

  stopForPenalty() {
    const t = this.pending[0].body.team;
    this.stopPlay('penalty', zoneDot(-t.dir, this.puck.z), { pens: this.pending.slice() });
  }

  // Applique les pénalités en attente. Retourne un tir de pénalité à exécuter, s'il y a lieu.
  applyPending() {
    let ps = null;
    for (const q of this.pending) {
      const t = q.body.team;
      if (q.ps && !ps && q.victim) { ps = q; continue; }
      const srv = q.server || q.pl;
      t.pens.push({ pl: srv, type: q.type, remain: q.min * 60, min: q.min, major: false });
      srv.unavailable = 1; q.pl.st.pim += q.min; t.stats.pim += q.min;
      this.other(t).stats.ppo++;
      this.emit('penalty', { team: t, pl: q.pl, type: q.type, min: q.min });
    }
    this.pending = [];
    return ps;
  }

  tickPenalties(dt) {
    for (const t of this.teams) {
      let running = 0;
      for (let i = 0; i < t.pens.length; i++) {
        const q = t.pens[i];
        if (!q.major) { if (running >= 2) continue; running++; }
        q.remain -= dt;
        if (q.remain <= 0) {
          t.pens.splice(i--, 1); q.pl.unavailable = 0;
          this.emit('penaltyEnd', { team: t, pl: q.pl });
          if (!q.major) this.syncStrength(t, boxPos(t));
        }
      }
    }
  }

  // Active en cours de jeu les corps manquants (retour de pénalité, 6e attaquant)
  syncStrength(t, where) {
    const n = this.skaterCount(t);
    const onIce = new Set(t.skaters.filter((b) => b.active).map((b) => b.p));
    const lu = lineupFor(t, 6);
    for (let i = 0; i < 6; i++) {
      const b = t.skaters[i];
      if (i < n && !b.active) {
        const pl = lu.find((q) => q && !onIce.has(q));
        if (!pl) continue;
        onIce.add(pl);
        b.p = pl; b.active = true; b.x = where.x; b.z = where.z; b.vx = b.vz = 0; b.stun = 0; b.changing = null;
        b.ai.next = 0;
      } else if (i >= n && b.active && this.puck.carrier !== b) {
        b.active = false; if (b.human) { b.human = false; b.team.ub = null; }
      }
    }
  }

  // ---------- arrêts de jeu et mises au jeu ----------
  stopPlay(reason, dot, data = {}) {
    if (this.state !== 'play') return;
    if (this.special) { this.attemptOver(reason === 'freeze' ? 'save' : 'miss'); return; }
    this.state = 'whistle'; this.stateT = reason === 'penalty' ? 2.8 : 1.9;
    this.offD = [false, false];
    this.puck.pass = null; this.puck.shot = null;
    this.emit('whistle', { reason, ...data });
    if (this.mode === 'practice') { this.next = () => this.practiceReset(); return; }
    this.next = () => this.afterStop(dot);
  }

  afterStop(dot) {
    const ps = this.applyPending();
    if (ps) {
      const vt = ps.victim.team;
      this.startSpecial('ps', vt, ps.victim.p, (goal) => {
        if (goal) { this.creditGoal(vt, ps.victim.p, [], 'TP'); this.setupFaceoff(DOTS.center); }
        else this.setupFaceoff(zoneDot(vt.dir, 6.7));
      });
    } else this.setupFaceoff(dot);
  }

  clearPuck(x, z) {
    const p = this.puck;
    Object.assign(p, { x, y: 0, z, vx: 0, vy: 0, vz: 0, carrier: null, shot: null, pass: null, rel: null, rolling: 0, inNet: 0, lastTeam: null });
    p.seq++;
  }

  placeGoalie(t) {
    const g = t.goalie;
    g.x = -t.dir * (RINK.goalX - 0.7); g.z = 0; g.vx = g.vz = 0; g.down = 0; g.track = null; g.holdT = 0; g.pickupCd = 0;
    g.face = t.dir > 0 ? 0 : Math.PI;
  }

  shouldPull(t) {
    const o = this.other(t), def = o.score - t.score;
    return this.mode === 'game' && this.period === 3 && this.clock < 100 && def >= 1 && def <= 2;
  }

  setupFaceoff(dot) {
    this.special = null;
    this.clearPuck(dot.x, dot.z);
    this.puck.y = 1.1;
    for (const t of this.teams) {
      // changement de trio à l'arrêt
      const auto = !t.isUser || this.set.autoLines || this.autoUser || this.lockPl;
      if (auto && t.shiftT > 22) this.nextLine(t);
      if (t.lineReq) { t.lineReq = false; }
      t.pulled = this.shouldPull(t) && dot.x * t.dir > -RINK.blueX;
      const n = this.mode === 'practice' && !t.isUser ? 0 : this.skaterCount(t);
      deploy(t, n);
      t.goalie.active = !t.pulled && !(this.mode === 'practice' && t.isUser && false);
      this.placeGoalie(t);
      for (const b of t.skaters) {
        if (!b.active) continue;
        const o = FO_SPOTS[b.role];
        b.x = dot.x + o[0] * t.dir; b.z = dot.z + o[1] * t.dir;
        b.x = clamp(b.x, -RINK.L + 1.2, RINK.L - 1.2); b.z = clamp(b.z, -RINK.W + 1.2, RINK.W - 1.2);
        b.vx = b.vz = 0; constrain(b, 1, 0); keepOutOfNet(b, 0.6);
        b.vx = b.vz = 0;
        b.face = Math.atan2(dot.z - b.z, dot.x - b.x);
        b.ctrl.mx = b.ctrl.mz = 0; b.ctrl.sprint = false; b.ai.next = R.r(0, 0.15); b.lostPuckT = 9;
        b.ai.tx = b.x; b.ai.tz = b.z;
      }
    }
    for (const t of this.teams) if (t.isUser) this.setUser(t.skaters[0], t);
    if (this.mode === 'practice') { this.puck.y = 0; this.state = 'play'; this.gain(this.teams[this.userTeam].skaters[0]); return; }
    const uc = this.userTeam != null && !this.autoUser;
    const cpuAdj = [0.12, 0.05, 0, -0.05][this.set.difficulty] || 0;
    this.fo = { dot, t: 0, dropAt: R.r(1.9, 2.8), dropped: false, press: null, early: false, vs: this.versus, pressV: [null, null], earlyV: [false, false], cpuReact: clamp(R.r(0.17, 0.42) + cpuAdj, 0.08, 0.6),
      user: uc && (!this.lockPl || this.teams[this.userTeam].skaters[0].p === this.lockPl) };
    this.state = 'faceoff';
    this.emit('faceoffSetup', { dot, dropAt: this.fo.dropAt });
  }

  faceoffPress(side = this.userTeam) {
    const fo = this.fo;
    if (this.state !== 'faceoff' || !fo || !fo.user) return;
    if (fo.vs) { // deux humains : le premier qui réagit après la chute de la rondelle gagne
      if (fo.earlyV[side] || fo.pressV[side] != null) return;
      if (!fo.dropped && fo.t > 0.7 && fo.t < fo.dropAt - 0.05) {
        fo.earlyV[side] = true; if (side === this.userTeam) fo.early = true;
        this.emit('faceoffEarly', { side });
      } else if (fo.dropped || fo.t >= fo.dropAt - 0.05) fo.pressV[side] = fo.t;
      return;
    }
    if (!fo.dropped) {
      if (fo.t > 0.7 && fo.t < fo.dropAt - 0.05 && !fo.early) { fo.early = true; this.emit('faceoffEarly'); }
      else if (fo.t >= fo.dropAt - 0.05) fo.press = fo.t;
    } else if (fo.press == null) fo.press = fo.t;
  }

  stepFaceoff(dt) {
    const fo = this.fo; fo.t += dt;
    if (!fo.dropped && fo.t >= fo.dropAt) { fo.dropped = true; this.emit('puckDrop'); }
    if (!fo.dropped) return;
    const p = this.puck;
    if (p.y > 0) { p.vy -= G * dt; p.y = Math.max(0, p.y + p.vy * dt); }
    const [A, Bt] = this.teams;
    let winner = null;
    if (fo.vs) {
      const [pa, pb] = fo.pressV, [ea, eb] = fo.earlyV;
      if (ea && eb) winner = R.chance(0.5) ? A : Bt;
      else if (ea || eb) winner = ea ? Bt : A;
      else if (pa != null || pb != null) winner = pb == null || (pa != null && pa <= pb) ? A : Bt;
      else if (fo.t >= fo.dropAt + 0.8) winner = R.chance(0.5) ? A : Bt;
    } else if (fo.user) {
      const U = this.teams[this.userTeam], C = this.other(U);
      if (fo.early) winner = C;
      else if (fo.press != null) winner = U;
      else if (fo.t >= fo.dropAt + fo.cpuReact) winner = C;
    } else if (fo.t >= fo.dropAt + 0.2) {
      const sk = (t) => { const c = t.skaters[0].p.a; return (c.sns + c.hnd) / 2; };
      winner = R.chance(0.5 + (sk(A) - sk(Bt)) * 0.012) ? A : Bt;
    }
    if (winner) this.faceoffWin(winner);
  }

  faceoffWin(t) {
    const o = this.other(t), p = this.puck, c = t.skaters[0], fo = this.fo;
    c.p.st.fow++; t.stats.fow++; o.skaters[0].p.st.fol++;
    p.y = 0; p.vy = 0;
    const opts = [t.skaters[1], t.skaters[2], t.skaters[3], t.skaters[4]].filter((b) => b && b.active);
    let target = opts.length ? (opts.length > 1 && R.chance(0.5) ? opts[1] : opts[0]) : c;
    if (t.isUser && fo.user && hyp(c.ctrl.mx, c.ctrl.mz) > 0.3 && opts.length) { // direction choisie par le joueur
      let bs = -9;
      for (const b of opts) {
        const d = hyp(b.x - p.x, b.z - p.z) || 1;
        const s = ((b.x - p.x) * c.ctrl.mx + (b.z - p.z) * c.ctrl.mz) / d;
        if (s > bs) { bs = s; target = b; }
      }
    }
    const d = hyp(target.x - p.x, target.z - p.z) || 1;
    p.vx = (target.x - p.x) / d * 9; p.vz = (target.z - p.z) / d * 9;
    p.lastTeam = t; t.touch = [c.p]; p.pass = target === c ? null : { to: target, team: t, t: 0 };
    c.pickupCd = 0.3; o.skaters[0].pickupCd = 0.5;
    for (const tm of this.teams) this.pIn[tm.idx] = p.x * tm.dir > RINK.blueX + 0.08;
    this.offD = [false, false];
    this.state = 'play';
    this.emit('faceoffWon', { team: t, by: c });
    if (t.isUser && target !== c) this.setUser(target);
  }

  practiceReset() {
    const u = this.teams[this.userTeam];
    const b = this.userBody || u.skaters[0];
    if (b.x * u.dir > 15) { b.x = u.dir * 6; b.z = 0; b.vx = b.vz = 0; } // revenir en zone neutre après un jeu près du filet
    this.clearPuck(b.x, b.z);
    for (const t of this.teams) this.placeGoalie(t);
    this.state = 'play';
    this.gain(b);
  }

  // ---------- règles ----------
  checkOffside() {
    if (!this.set.offside) return;
    const p = this.puck;
    for (const t of this.teams) {
      const i = t.idx, pin = p.x * t.dir > RINK.blueX + 0.08, was = this.pIn[i];
      this.pIn[i] = pin;
      const inZone = (b) => b.x * t.dir > RINK.blueX + 0.35;
      if (pin && !was) {
        const c = p.carrier;
        const byT = c ? c.team === t : p.lastTeam === t;
        if (!byT) continue;
        const offs = t.skaters.filter((b) => b.active && b !== c && inZone(b));
        if (!offs.length) continue;
        if (c || (p.pass && offs.includes(p.pass.to))) { this.offsideCall(t); return; }
        this.offD[i] = true; this.emit('offsideDelayed', { team: t });
      } else if (this.offD[i]) {
        if (!pin || !t.skaters.some((b) => b.active && inZone(b))) { this.offD[i] = false; this.emit('offsideClear', { team: t }); }
      }
    }
  }
  offsideCall(t) { this.stopPlay('offside', neutralDot(t.dir, this.puck.z), { team: t }); }

  checkIcing() {
    if (!this.set.icing) return;
    const p = this.puck, r = p.rel;
    if (!r || p.carrier || p.inNet) return;
    const t = r.team;
    if (r.fx < 0 && p.x * t.dir > RINK.goalX + 0.15) {
      if (this.skaterCount(t) < this.skaterCount(this.other(t))) { p.rel = null; return; }
      this.stopPlay('icing', zoneDot(-t.dir, p.z), { team: t });
    }
  }

  puckOut() {
    const p = this.puck;
    this.stopPlay('out', nearestDot(ALL_DOTS, p.x, p.z));
  }

  creditShot(shooter, g) {
    const p = this.puck;
    if (p.shot && p.shot.credited) return;
    if (p.shot) p.shot.credited = true;
    if (shooter) { shooter.p.st.sog++; shooter.team.stats.shots++; }
    else if (g) this.other(g.team).stats.shots++;
    if (g) { g.p.st.sa++; g.p.st.sv++; }
  }

  onGoal(s) {
    const t = this.teams.find((q) => q.dir === s), o = this.other(t), p = this.puck;
    if (this.special) { this.attemptOver('goal'); return; }
    if (this.offD[t.idx]) { this.offsideCall(t); return; }
    this.lastGoal = { team: t, scorer: this.mode === 'practice' && this.userBody ? this.userBody.p : (t.touch[t.touch.length - 1] || null), time: this.time, s };
    if (this.mode === 'practice') {
      this.state = 'goal'; this.stateT = 2.2; this.emit('goal', { team: t, scorer: this.userBody ? this.userBody.p : null, assists: [], str: '', s });
      this.next = () => this.practiceReset(); return;
    }
    let list = t.touch.slice();
    if (!list.length) {
      let nb = null, bd = 1e9;
      for (const b of t.skaters) if (b.active) { const d = hyp(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; nb = b; } }
      list = [nb.p];
    }
    const scorer = list[list.length - 1], assists = list.slice(0, -1).reverse();
    const nt = this.skaterCount(t) - (t.pulled ? 1 : 0), no = this.skaterCount(o) - (o.pulled ? 1 : 0);
    let str = nt > no ? 'AN' : nt < no ? 'DN' : '';
    if (!o.goalie.active) str = 'FD';
    if (!(p.shot && p.shot.credited)) { scorer.st.sog++; t.stats.shots++; if (o.goalie.active) o.goalie.p.st.sa++; }
    if (o.goalie.active) o.goalie.p.st.ga++;
    if (nt > no) {
      t.stats.ppg++;
      const run = o.pens.filter((q) => !q.major).slice(0, 2).sort((a, b) => a.remain - b.remain)[0];
      if (run) { o.pens.splice(o.pens.indexOf(run), 1); run.pl.unavailable = 0; }
    }
    const qi = this.pending.findIndex((q) => q.body.team === o && !q.ps);
    if (qi >= 0) this.pending.splice(qi, 1);
    this.creditGoal(t, scorer, assists, str);
    this.lastGoal.scorer = scorer;
    this.state = 'goal'; this.stateT = 5;
    this.emit('goal', { team: t, scorer, assists, str, s });
    this.next = () => {
      if (this.period > 3) return this.finish();
      this.afterStop(DOTS.center);
    };
  }

  creditGoal(t, scorer, assists, str) {
    t.score++; scorer.st.g++;
    for (const a of assists) a.st.a++;
    this.goals.push({ period: this.period, clock: this.clock, team: t.idx, scorer, assists, str });
  }

  // ---------- périodes ----------
  endPeriod() {
    this.state = 'intermission'; this.stateT = 4;
    this.puck.pass = null; this.puck.shot = null;
    this.emit('periodEnd', { period: this.period });
    this.next = () => {
      const [a, b] = this.teams;
      if (this.period < 3) return this.newPeriod(1200);
      if (a.score !== b.score) return this.finish();
      if (this.period === 3) { this.base = 3; return this.newPeriod(300); }
      this.startShootout();
    };
  }
  newPeriod(len) {
    this.period++; this.clock = len;
    for (const t of this.teams) { t.dir *= -1; t.shiftT = 99; }
    this.pending = []; this.lmFlag = false;
    this.emit('periodStart', { period: this.period });
    this.setupFaceoff(DOTS.center);
  }

  finish() {
    const [a, b] = this.teams;
    this.winner = a.score > b.score ? a : b;
    this.state = 'final';
    // Trois étoiles
    const all = [];
    for (const t of this.teams) for (const pl of t.roster) {
      const s = pl.st;
      let v = s.g * 3 + s.a * 2 + s.sog * 0.25 + s.hits * 0.15 + s.blk * 0.2;
      if (pl.pos === 'G' && s.sa > 0) v = s.sv * 0.28 - s.ga * 1.3 + (t === this.winner ? 2 : 0);
      if (t === this.winner) v += 0.5;
      all.push({ pl, team: t, v });
    }
    all.sort((x, y) => y.v - x.v);
    this.stars = all.slice(0, 3);
    this.emit('final', { winner: this.winner });
  }

  // ---------- tirs de barrage et tirs de pénalité ----------
  startSpecial(kind, t, pl, after) {
    const o = this.other(t);
    for (const tm of this.teams) { deploy(tm, 0); tm.goalie.active = false; tm.pulled = false; }
    const b = t.skaters[0];
    b.p = pl; b.active = true; b.x = 0; b.z = 0; b.vx = b.vz = 0; b.face = t.dir > 0 ? 0 : Math.PI;
    b.ai.shootD = 0; b.ai.next = 0; b.ctrl.mx = b.ctrl.mz = 0; b.dekeCd = 0; b.pickupCd = 0;
    o.goalie.active = true; this.placeGoalie(o);
    this.clearPuck(0, 0);
    this.special = { kind, team: t, shooter: pl, t: 0, phase: 'setup', over: null, after, shotTaken: false, saved: false, afterT: 0 };
    this.offD = [false, false];
    this.state = 'play';
    this.puck.carrier = b; this.puck.lastTeam = t;
    for (const tm of this.teams) if (tm.isUser) this.setUser(tm === t ? b : null, tm);
    this.emit('attemptStart', { kind, team: t, shooter: pl });
  }

  stepSpecial(dt) {
    const sp = this.special, p = this.puck;
    sp.t += dt;
    if (sp.phase === 'setup') { if (sp.t > 1.3) { sp.phase = 'live'; sp.t = 0; } return; }
    if (!p.carrier && !sp.shotTaken) sp.shotTaken = true;
    if (sp.shotTaken) {
      sp.afterT += dt;
      if (sp.saved) return this.attemptOver('save');
      if (sp.afterT > 1.8 || Math.abs(p.x) > RINK.goalX + 0.4) return this.attemptOver('miss');
    }
    if (sp.t > 13) this.attemptOver('time');
  }

  attemptOver(result) {
    const sp = this.special;
    if (!sp || sp.over) return;
    sp.over = result;
    this.state = 'specialEnd'; this.stateT = 2.3;
    this.emit('attemptEnd', { kind: sp.kind, team: sp.team, shooter: sp.shooter, result });
    this.next = () => { this.special = null; sp.after(result === 'goal'); };
  }

  startShootout() {
    const order = (t) => t.roster.filter((q) => q.pos !== 'G' && !q.unavailable)
      .sort((x, y) => (y.a.sht + y.a.accu + y.a.hnd) - (x.a.sht + x.a.accu + x.a.hnd));
    this.so = { n: 0, res: [[], []], order: [order(this.teams[0]), order(this.teams[1])] };
    this.period = 5;
    this.emit('shootoutStart');
    this.nextShootoutAttempt();
  }

  nextShootoutAttempt() {
    const so = this.so, [A, Bt] = this.teams;
    const ra = so.res[0], rb = so.res[1];
    const ga = ra.filter(Boolean).length, gb = rb.filter(Boolean).length;
    const done = (() => {
      if (ra.length === rb.length && ra.length >= 3) return ga !== gb;
      if (rb.length <= 3 && ra.length <= 3) { // premières rondes : avance insurmontable
        const leftA = 3 - ra.length, leftB = 3 - rb.length;
        return ga > gb + leftB || gb > ga + leftA;
      }
      return false;
    })();
    if (done) {
      const w = ga > gb ? A : Bt; w.score++;
      this.goals.push({ period: 5, clock: 0, team: w.idx, scorer: null, assists: [], str: 'TB' });
      return this.finish();
    }
    const ti = rb.length <= ra.length ? 1 : 0; // le visiteur tire en premier
    const t = this.teams[ti], list = so.order[ti];
    const pl = list[so.res[ti].length % list.length];
    this.startSpecial('so', t, pl, (goal) => { so.res[ti].push(goal); this.nextShootoutAttempt(); });
  }

  // ---------- bagarres ----------
  startFight(a, o) {
    if (this.state !== 'play') return;
    this.state = 'fight';
    this.puck.pass = null; this.puck.shot = null;
    const mx = (a.x + o.x) / 2, mz = (a.z + o.z) / 2;
    a.x = mx - 0.55; o.x = mx + 0.55; a.z = o.z = mz; a.vx = a.vz = o.vx = o.vz = 0; a.stun = o.stun = 0;
    a.face = 0; o.face = Math.PI;
    const isU = (b) => b.team.isUser && !this.autoUser && (!this.lockPl || b.p === this.lockPl);
    const userSide = isU(a) ? 0 : isU(o) ? 1 : -1;
    this.fight = { f: [a, o], hp: [1, 1], cd: [0.8, 0.9], block: [0, 0], wind: [0, 0], t: 0, userSide, punchAnim: [0, 0] };
    this.emit('fightStart', { a, o, userSide });
  }

  fightInput(action) {
    const F = this.fight; if (!F || F.userSide < 0) return;
    const i = F.userSide;
    if (action === 'punch' && F.cd[i] <= 0) { F.cd[i] = 0.38; this.fightPunch(i); }
    if (action === 'block') F.block[i] = 0.5;
  }

  fightPunch(i) {
    const F = this.fight, j = 1 - i;
    F.punchAnim[i] = 0.25;
    const blocked = F.block[j] > 0;
    const dmg = (0.04 + F.f[i].p.a.chk / 2200) * R.r(0.7, 1.3) * (blocked ? 0.15 : 1);
    F.hp[j] = Math.max(0, F.hp[j] - dmg);
    this.emit('punch', { by: i, blocked });
  }

  stepFight(dt) {
    const F = this.fight; F.t += dt;
    for (let i = 0; i < 2; i++) {
      F.cd[i] -= dt; F.block[i] -= dt; F.punchAnim[i] -= dt;
      if (i === F.userSide) continue;
      if (F.wind[i] > 0) { F.wind[i] -= dt; if (F.wind[i] <= 0) this.fightPunch(i); }
      else if (F.cd[i] <= 0) { F.wind[i] = 0.34; F.cd[i] = R.r(0.75, 1.25); this.emit('fightWindup', { by: i }); }
    }
    if (F.hp[0] <= 0 || F.hp[1] <= 0 || F.t > 20) {
      const w = F.hp[0] >= F.hp[1] ? 0 : 1;
      const wb = F.f[w], lb = F.f[1 - w];
      lb.stun = 2;
      for (const b of F.f) {
        b.team.pens.push({ pl: b.p, type: 'fight', remain: 300, min: 5, major: true });
        b.p.unavailable = 1; b.p.st.pim += 5; b.team.stats.pim += 5;
      }
      for (const pl of wb.team.roster) pl.stamina = Math.min(1, pl.stamina + 0.2);
      this.emit('fightEnd', { winner: wb, loser: lb });
      this.fight = null;
      this.state = 'whistle'; this.stateT = 2.5;
      const dot = nearestDot(ALL_DOTS, wb.x, wb.z);
      this.next = () => this.afterStop(dot);
    }
  }

  // ---------- changements de trio ----------
  lineChange(t) {
    this.nextLine(t);
    const n = t.skaters.filter((b) => b.active).length;
    const lu = lineupFor(t, n);
    const onIce = new Set(t.skaters.filter((b) => b.active).map((b) => b.p));
    for (let i = 0; i < n; i++) {
      const b = t.skaters[i];
      if (b.active && lu[i] && lu[i] !== b.p && !onIce.has(lu[i])) { b.changing = lu[i]; b.changeT = 0; }
    }
    this.emit('lineChange', { team: t });
  }

  lineLogic(dt) {
    const p = this.puck;
    for (const t of this.teams) {
      t.shiftT += dt;
      const onIce = new Set();
      for (const b of t.skaters) if (b.active) onIce.add(b.p);
      for (const pl of t.roster) if (!onIce.has(pl)) pl.stamina = Math.min(1, pl.stamina + 0.022 * dt);
      const auto = !t.isUser || this.set.autoLines || this.autoUser || this.lockPl;
      const anyChanging = t.skaters.some((b) => b.active && b.changing);
      if (auto && !anyChanging && t.shiftT > 34) {
        let avg = 0, n = 0;
        for (const b of t.skaters) if (b.active) { avg += b.p.stamina; n++; }
        avg /= n || 1;
        const px = p.x * t.dir;
        const safe = px > -2 && ((p.carrier && p.carrier.team === t) || px > RINK.blueX);
        if ((t.shiftT > 46 || avg < 0.5) && safe) this.lineChange(t);
      }
      const bp = benchPos(t);
      for (const b of t.skaters) {
        if (!b.active || !b.changing) continue;
        b.changeT += dt;
        if (p.carrier === b) continue;
        if (hyp(b.x - bp.x, b.z - bp.z) < 1.7 || b.changeT > 7) {
          b.p = b.changing; b.changing = null;
          this.emit('sub', { body: b });
        }
      }
      // retirer le gardien en fin de match
      if (!t.pulled && this.shouldPull(t) && p.carrier && p.carrier.team === t && p.carrier !== t.goalie && p.x * t.dir > -2) {
        t.pulled = true; t.goalie.active = false;
        this.syncStrength(t, bp);
        this.emit('goaliePulled', { team: t });
      }
    }
  }

  // ---------- boucle ----------
  stepBody(b, dt) {
    const a = b.p.a, p = this.puck;
    b.stun = Math.max(0, b.stun - dt); b.checkT = Math.max(0, b.checkT - dt); b.checkCd = Math.max(0, b.checkCd - dt);
    b.dekeT = Math.max(0, b.dekeT - dt); b.dekeCd = Math.max(0, b.dekeCd - dt); b.pokeCd = Math.max(0, b.pokeCd - dt);
    b.pickupCd = Math.max(0, b.pickupCd - dt); b.shotAnim = Math.max(0, b.shotAnim - dt); b.lostPuckT += dt;
    const fat = 0.72 + 0.28 * Math.pow(b.p.stamina, 0.7);
    const has = p.carrier === b;
    let mx = b.ctrl.mx, mz = b.ctrl.mz, len = hyp(mx, mz);
    if (len > 1) { mx /= len; mz /= len; len = 1; }
    if (b.stun > 0) len = 0;
    const cpu = this.userTeam != null && !this.autoUser && !b.team.isUser;
    let maxSp = (6.0 + 3.1 * a.spd / 100) * fat * (cpu ? this.diff.aiSpeed : 1);
    const sprinting = b.ctrl.sprint && b.p.stamina > 0.04 && len > 0.3;
    if (sprinting) maxSp *= 1.2;
    if (has) maxSp *= 0.94;
    if (b.windup) maxSp *= 0.45;
    const acc = (9 + 10 * a.acc / 100) * fat;
    if (b.checkT > 0) { /* élan de la mise en échec */ }
    else if (len > 0.05) {
      const dx = mx / len, dz = mz / len;
      let vpar = b.vx * dx + b.vz * dz;
      let px = b.vx - vpar * dx, pz = b.vz - vpar * dz;
      const grip = Math.exp(-3.2 * dt); px *= grip; pz *= grip; // virage serré = perte de vitesse
      if (vpar < 0) vpar *= Math.exp(-3.5 * dt);
      const cap = maxSp * len;
      if (vpar < cap) vpar = Math.min(cap, vpar + acc * len * dt);
      else vpar -= (vpar - cap) * Math.min(1, 2.5 * dt);
      b.vx = vpar * dx + px; b.vz = vpar * dz + pz;
    } else {
      const k = Math.exp(-(b.stun > 0 ? 2.5 : 0.8) * dt); b.vx *= k; b.vz *= k;
    }
    const pl = b.p;
    if (this.state === 'play') {
      if (sprinting) pl.stamina -= dt * 0.085 * (1.35 - a.end / 200);
      else pl.stamina += dt * 0.012;
      pl.stamina = clamp(pl.stamina - dt * 0.004, 0, 1);
      if (!this.special) pl.st.toi += dt * this.clockScale;
    }
    const sp = hyp(b.vx, b.vz);
    let tf = b.face;
    if (b.ai.faceTo && !b.human && sp < 4.5) tf = Math.atan2(b.ai.faceTo.z - b.z, b.ai.faceTo.x - b.x);
    else if (sp > 1.2) tf = Math.atan2(b.vz, b.vx);
    else if (len > 0.1) tf = Math.atan2(mz, mx);
    b.face += clamp(angDiff(b.face, tf), -9 * dt, 9 * dt);
    b.x += b.vx * dt; b.z += b.vz * dt; b.stride += sp * dt;
    constrain(b, 0.45, 0.05);
    keepOutOfNet(b, 0.4);
  }

  physics(dt) {
    const all = [];
    for (const t of this.teams) {
      for (const b of t.skaters) if (b.active) { this.stepBody(b, dt); all.push(b); }
      if (t.goalie.active) all.push(t.goalie);
    }
    const live = this.state === 'play';
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz);
      if (d > 1.15 || d < 1e-4) continue;
      if (live && a.team !== b.team) {
        if (a.checkT > 0 && !a.hitDone && !a.isGoalie) this.resolveHit(a, b);
        else if (b.checkT > 0 && !b.hitDone && !b.isGoalie) this.resolveHit(b, a);
      }
      const minD = 0.85;
      if (d < minD) {
        const nx = dx / d, nz = dz / d, ov = minD - d;
        const wa = a.isGoalie ? 0 : b.isGoalie ? 1 : 0.5, wb = 1 - wa;
        a.x -= nx * ov * wa; a.z -= nz * ov * wa; b.x += nx * ov * wb; b.z += nz * ov * wb;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0 && !a.isGoalie && !b.isGoalie) {
          a.vx += nx * rv * 0.4; a.vz += nz * rv * 0.4; b.vx -= nx * rv * 0.4; b.vz -= nz * rv * 0.4;
        }
      }
    }
    if (!live) return;
    // harponnage automatique au bâton
    const p = this.puck, c = p.carrier;
    if (c && !c.isGoalie && !this.special) {
      for (const b of this.other(c.team).skaters) {
        if (!b.active || b.stun > 0 || b.pokeCd > 0 || b.checkT > 0) continue;
        const sx = b.x + Math.cos(b.face) * 0.7, sz = b.z + Math.sin(b.face) * 0.7;
        if (hyp(sx - p.x, sz - p.z) > 0.95) continue;
        b.pokeCd = 0.45;
        let pr = 0.26 * (0.5 + (b.p.a.chk + b.p.a.sns) / 200) / (0.5 + c.p.a.hnd / 100);
        if (c.dekeT > 0) pr *= 0.15;
        if (c.windup) pr *= 1.8;
        if (this.abOn(c.p, 'shield')) pr *= 0.25;
        const dx = c.x - b.x, dz = c.z - b.z, d = hyp(dx, dz) || 1;
        const behind = (Math.cos(c.face) * dx + Math.sin(c.face) * dz) / d > 0.5;
        if (behind) pr *= 0.5;
        if (this.userTeam != null && !this.autoUser) pr *= b.team.isUser ? 1.1 : this.diff.aiCheck;
        if (R.chance(pr)) {
          this.knockLoose(c, (dx / d) * R.r(1, 3) + R.r(-3, 3), (dz / d) * R.r(1, 3) + R.r(-3, 3));
          this.emit('poke', { by: b, on: c });
          break;
        } else if (R.chance(behind ? 0.03 : 0.009)) {
          this.callPenalty(b, R.pick(['hook', 'slash', 'hold']), c);
          if (this.state !== 'play') return;
        }
      }
    }
  }

  puckStep(dt) {
    const p = this.puck, c = p.carrier, live = this.state === 'play';
    if (c) {
      if (!c.active || c.stun > 0) { this.knockLoose(c, R.r(-2, 2), R.r(-2, 2)); return; }
      const fx = Math.cos(c.face), fz = Math.sin(c.face), rx = -fz, rz = fx;
      const lat = c.isGoalie ? 0 : c.p.d.hand * 0.28 * (c.dekeT > 0 ? -c.dekeSide * c.p.d.hand * 1.6 : 1) + Math.sin(this.time * 9 + c.id) * 0.1;
      const fwd = c.isGoalie ? 0.45 : c.windup ? 0.55 : 0.85;
      const tx = c.x + fx * fwd + rx * lat, tz = c.z + fz * fwd + rz * lat;
      const k = Math.min(1, 24 * dt);
      p.x += (tx - p.x) * k; p.z += (tz - p.z) * k; p.y = 0; p.vx = c.vx; p.vz = c.vz; p.vy = 0;
      const vx = p.vx, vz = p.vz; constrain(p, 0.05, 0); p.vx = vx; p.vz = vz;
      return;
    }
    stepPuck(this, dt);
    if (!live || this.state !== 'play') return;
    if (p.pass) { p.pass.t += dt; if (p.pass.t > 4) p.pass = null; }
    const sp = hyp(p.vx, p.vz);
    if (p.shot) {
      p.shot.t += dt;
      if (sp < 6) p.shot = null;
      else if (p.y < 1.7 && sp > 10) {
        for (const t of this.teams) for (const b of t.skaters) {
          if (!p.shot || !b.active || b === p.shot.by || p.shot.seen.has(b)) continue;
          if (hyp(b.x - p.x, b.z - p.z) > 0.5) continue;
          p.shot.seen.add(b);
          if (b.team !== p.shot.team) {
            if (b.stun <= 0 && R.chance(0.7)) {
              p.vx = -p.vx * R.r(0.05, 0.2) + R.r(-2, 2); p.vz = -p.vz * R.r(0.05, 0.2) + R.r(-2, 2); p.vy = R.r(0, 2);
              p.shot = null; p.seq++; p.rel = null; b.pickupCd = 0.25;
              b.p.st.blk++; b.team.stats.blk++;
              if (R.chance(0.4)) setRolling(p, R.r(1, 2));
              this.emit('block', { by: b });
            }
          } else if (p.shot.t > 0.1 && b.stun <= 0 && R.chance(0.4)) { // déviation
            const a = R.g() * 0.14, cs = Math.cos(a), sn = Math.sin(a);
            const vx = (p.vx * cs - p.vz * sn) * 0.85; p.vz = (p.vx * sn + p.vz * cs) * 0.85; p.vx = vx;
            p.vy += R.r(-1, 2); p.seq++;
            if (this.touch(b)) this.emit('tip', { by: b });
            if (this.state !== 'play') return;
          }
        }
      }
    }
    if (p.carrier || p.y > 0.4 || p.inNet) return;
    let best = null, bd = 1e9, bt = false;
    for (const t of this.teams) for (const b of t.skaters) {
      if (!b.active || b.stun > 0 || b.pickupCd > 0) continue;
      const sx = b.x + Math.cos(b.face) * 0.65, sz = b.z + Math.sin(b.face) * 0.65;
      const target = !!p.pass && p.pass.to === b;
      const d = Math.min(hyp(sx - p.x, sz - p.z), hyp(b.x - p.x, b.z - p.z) + 0.3);
      if (d < 0.95 + (target ? 0.45 : 0) && d < bd) { bd = d; best = b; bt = target; }
    }
    if (!best) return;
    const rel = hyp(p.vx - best.vx, p.vz - best.vz);
    let limit = 12 + 16 * best.p.a.hnd / 100 + (bt ? 12 : 0);
    if (p.rolling > 0) limit *= 0.7;
    if (rel < limit || R.chance(0.2)) this.gain(best);
    else { // la rondelle saute par-dessus le bâton / déviation
      const a = R.g() * 0.5, cs = Math.cos(a), sn = Math.sin(a);
      const vx = (p.vx * cs - p.vz * sn) * 0.5; p.vz = (p.vx * sn + p.vz * cs) * 0.5; p.vx = vx;
      best.pickupCd = 0.35; p.seq++; p.pass = null;
      if (R.chance(0.3)) setRolling(p, R.r(1, 2));
      this.touch(best);
    }
  }

  coast(dt) {
    // célébration : le marqueur glisse vers la bande, ses coéquipiers le rejoignent
    const cel = this.state === 'goal' && this.lastGoal ? this.lastGoal : null;
    const sb = cel ? cel.team.skaters.find((q) => q.active && q.p === cel.scorer) || null : null;
    for (const t of this.teams) for (const b of t.skaters) {
      if (!b.active) continue;
      b.ctrl.sprint = false;
      if (cel && b.team === cel.team && b.stun <= 0) {
        let tx, tz, sp = 0.6;
        if (b === sb || !sb) { tx = cel.team.dir * 13; tz = (b.z >= 0 ? 1 : -1) * 7.5; }
        else { tx = sb.x; tz = sb.z; sp = 0.75; }
        const dx = tx - b.x, dz = tz - b.z, d = hyp(dx, dz) || 1;
        const k = d > 1.6 ? sp : 0;
        b.ctrl.mx = dx / d * k; b.ctrl.mz = dz / d * k;
      } else { b.ctrl.mx *= 0.9; b.ctrl.mz *= 0.9; }
    }
    this.physics(dt);
    this.puckStep(dt);
  }

  stepPlay(dt) {
    const sp = this.special;
    if (!sp && this.mode !== 'practice') {
      this.clock -= dt * this.clockScale;
      this.tickPenalties(dt * this.clockScale);
      const pc = this.puck.carrier;
      if (pc && pc.x * pc.team.dir > RINK.blueX) pc.team.stats.toa += dt * this.clockScale;
    }
    if (sp && sp.phase === 'setup') { this.stepSpecial(dt); this.puckStep(dt); return; }
    aiUpdate(this, dt);
    if (this.state !== 'play') return;
    for (const t of this.teams) if (t.goalie.active) { updateGoalie(this, t.goalie, dt); if (this.state !== 'play') return; }
    this.physics(dt);
    if (this.state !== 'play') return;
    this.puckStep(dt);
    if (this.state !== 'play') return;
    if (sp) { this.stepSpecial(dt); return; }
    if (this.mode === 'practice') return;
    this.checkOffside(); if (this.state !== 'play') return;
    this.checkIcing(); if (this.state !== 'play') return;
    this.lineLogic(dt);
    if (this.clock <= 60 && !this.lmFlag) { this.lmFlag = true; this.emit('lastMinute', { period: this.period }); }
    // échappée : porteur lancé sans défenseur devant lui
    this.bkT = (this.bkT || 0) - dt;
    if (this.bkT <= 0) {
      this.bkT = 0.25;
      const c = this.puck.carrier;
      if (c && !c.isGoalie && !c.bk) {
        const t = c.team, fx = c.x * t.dir;
        if (fx > 1 && fx < 18 && hyp(c.vx, c.vz) > 5 && !this.other(t).skaters.some((q) => q.active && (q.x * t.dir > fx + 0.5 || hyp(q.x - c.x, q.z - c.z) < 4.5))) {
          c.bk = true; this.emit('breakaway', { by: c });
        }
      }
    }
    if (this.clock <= 0) { this.clock = 0; this.endPeriod(); }
  }

  step(dt) {
    this.time += dt;
    const st = this.state;
    if (st === 'play') this.stepPlay(dt);
    else if (st === 'faceoff') this.stepFaceoff(dt);
    else if (st === 'fight') this.stepFight(dt);
    else if (st === 'final') this.coast(dt);
    else {
      this.coast(dt);
      this.stateT -= dt;
      if (this.stateT <= 0 && this.next) { const n = this.next; this.next = null; n(); }
    }
    if (this.lockPl) this.setUser(null); // suit le joueur verrouillé au fil des changements
  }
}
