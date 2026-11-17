// Outils mathématiques et générateur aléatoire
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const hyp = Math.hypot;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const sign = (v) => (v < 0 ? -1 : 1);

export function angDiff(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Distance d'un point (px,pz) au segment a-b
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function makeRng(seed) {
  let s = seed >>> 0;
  const o = {
    seed(n) { s = n >>> 0; },
    f() {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    r(a, b) { return a + (b - a) * o.f(); },
    i(a, b) { return Math.floor(a + (b - a + 1) * o.f()); },
    pick(arr) { return arr[Math.floor(o.f() * arr.length)]; },
    g() { // gaussienne approx. (moyenne 0, écart-type 1)
      return (o.f() + o.f() + o.f() + o.f() + o.f() + o.f() - 3) * 1.4142;
    },
    chance(p) { return o.f() < p; },
  };
  return o;
}

// RNG global de la simulation
export const R = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);
