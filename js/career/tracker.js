// Suivi du joueur de Carrière pendant un match : note, objectifs de l'entraîneur, temps de glace
import { clamp } from '../core/util.js';
import { ABILITIES, lineName, maxLine } from './career.js';

const OBJ = [
  { id: 'sog', text: (n) => `Décoche ${n} tir${n > 1 ? 's' : ''} au but`, n: 2, w: (c) => (c.pos === 'D' ? 1 : 3) },
  { id: 'hits', text: (n) => `Distribue ${n} mise${n > 1 ? 's' : ''} en échec`, n: 2, w: () => 2 },
  { id: 'pts', text: () => 'Récolte un point', n: 1, fixed: true, w: (c) => (c.pos === 'D' ? 1 : 2) },
  { id: 'passes', text: (n) => `Réussis ${n} passes`, n: 4, w: () => 3 },
  { id: 'fow', text: (n) => `Gagne ${n} mises au jeu`, n: 3, w: (c) => (c.pos === 'C' ? 3 : 0) },
  { id: 'blk', text: () => 'Bloque un tir', n: 1, fixed: true, w: (c) => (c.pos === 'D' ? 3 : 1) },
  { id: 'take', text: () => 'Soutire une rondelle à l\'adversaire', n: 1, fixed: true, w: () => 2 },
  { id: 'pim', text: () => 'Reste hors du banc des pénalités', max: true, w: () => 1 },
  { id: 'gaOn', text: () => 'Ne sois pas sur la glace pour un but adverse', max: true, w: (c) => (c.pos === 'D' ? 3 : 1) },
];

export class CareerTracker {
  constructor(m, c, hud, settings) {
    this.m = m; this.c = c; this.hud = hud; this.set = settings;
    this.me = m.lockPl; this.team = m.teams[m.userTeam];
    this.x = { passes: 0, take: 0, gaOn: 0, gfOn: 0, pm: 0 };
    this.bonus = 0; this.objs = []; this.cur = null; this.pend = null; this.moved = false;
    this.line = c.line;
    this.newObj();
    m.on((type, d) => this.onEvent(type, d));
  }

  get onIce() { return this.team.skaters.some((b) => b.active && b.p === this.me); }
  stat(id) {
    const s = this.me.st;
    return id === 'pts' ? s.g + s.a : id in this.x ? this.x[id] : s[id];
  }
  get rating() {
    const s = this.me.st, x = this.x;
    return clamp(6 + 1.1 * s.g + 0.7 * s.a + 0.12 * s.sog + 0.12 * s.hits + 0.2 * s.blk + 0.04 * x.passes + 0.15 * x.take + 0.03 * s.fow
      - 0.25 * s.pim + 0.15 * x.gfOn - 0.25 * x.gaOn + this.bonus, 1, 10);
  }

  newObj() {
    const used = new Set(this.objs.map((o) => o.id));
    const pool = OBJ.filter((o) => !used.has(o.id)).flatMap((o) => Array(o.w(this.c)).fill(o));
    const o = pool[Math.floor(Math.random() * pool.length)];
    const n = o.max ? 0 : o.fixed ? o.n : Math.max(1, Math.round(o.n * Math.min(1.5, this.set.periodMin / 4)));
    this.cur = { id: o.id, text: o.text(n), n, max: !!o.max, base: this.stat(o.id), done: false };
    this.objs.push(this.cur);
    this.hud.toast('Objectif : ' + this.cur.text);
  }
  prog(o) { return this.stat(o.id) - o.base; }
  closeObj() {
    const o = this.cur; if (!o) return;
    o.done = o.max ? this.prog(o) <= 0 : this.prog(o) >= o.n;
    this.bonus += o.done ? 0.4 : -0.2;
    this.cur = null;
  }

  onEvent(type, d) {
    const me = this.me, m = this.m;
    if (type === 'pass') this.pend = d.by.p === me ? d.to : null;
    else if (type === 'gain') { if (this.pend && d.by === this.pend) this.x.passes++; this.pend = null; }
    else if (type === 'poke') { if (d.by.p === me) this.x.take++; }
    else if (type === 'goal') {
      if (this.onIce && d.str !== 'TB') {
        const mine = d.team === this.team;
        if (mine) this.x.gfOn++; else this.x.gaOn++;
        if (!d.str) this.x.pm += mine ? 1 : -1;
      }
    } else if (type === 'ability') {
      if (d.by.p === me) this.hud.toast(ABILITIES[d.type].name + ' !');
    } else if (type === 'periodEnd' && d.period <= 3) {
      this.closeObj();
      // l'entraîneur ajuste le temps de glace pendant le match
      const r = this.rating;
      if (!this.moved && d.period < 3) {
        const to = r >= 7.6 && this.line > 0 ? this.line - 1 : r <= 4.6 && this.line < maxLine(this.c) ? this.line + 1 : -1;
        if (to >= 0 && m.moveLock(to)) {
          this.hud.say(to < this.line ? `L'entraîneur aime ce qu'il voit : te voilà sur le ${lineName(this.c, to)} !` : `L'entraîneur n'est pas content : tu descends sur le ${lineName(this.c, to)}.`, 3);
          this.line = to; this.moved = true;
        }
      }
    } else if (type === 'periodStart' && d.period <= 3) this.newObj();
  }

  // Panneau du HUD
  html(keyName) {
    const m = this.m, me = this.me, o = this.cur;
    let h = `<div class="rt">Note <b>${this.rating.toFixed(1)}</b> <small>${lineName(this.c, this.line)}</small></div>`;
    if (o) {
      const p = this.prog(o);
      h += `<div class="ob${(o.max ? p > 0 : false) ? ' bad' : (!o.max && p >= o.n) ? ' ok' : ''}">Objectif : ${o.text}${o.max ? (p > 0 ? ' ✗' : '') : ` (${Math.min(p, o.n)}/${o.n})`}</div>`;
    }
    if (me.ability) {
      const left = (me.abUntil || 0) - m.time, cd = (me.abReady || 0) - m.time;
      h += `<div class="ab${left > 0 ? ' act' : ''}">${ABILITIES[me.ability].name} : ${left > 0 ? 'ACTIVE' : cd > 0 ? Math.ceil(cd) + ' s' : `prête [${keyName(this.set.keys.ability)}]`}</div>`;
    }
    if (!m.userBody && m.state !== 'final') h += `<div class="bn">${me.unavailable > 0 ? 'AU BANC DES PÉNALITÉS' : 'SUR LE BANC'} · avance rapide</div>`;
    return h;
  }

  result() {
    const m = this.m, s = this.me.st, o = m.other(this.team);
    if (this.cur) this.closeObj();
    return { gf: this.team.score, ga: o.score, ot: m.period > 3, rating: this.rating, sim: false,
      st: { g: s.g, a: s.a, sog: s.sog, hits: s.hits, pim: s.pim, toi: s.toi, blk: s.blk, pm: this.x.pm },
      obj: this.objs.map((q) => ({ text: q.text, done: q.done })) };
  }
}
