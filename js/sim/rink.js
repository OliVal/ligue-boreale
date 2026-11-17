// Géométrie de la patinoire : collisions avec les bandes, zones, points de mise au jeu
import { RINK, DOTS } from '../core/config.js';

// Contraint un objet {x,z,vx,vz} de rayon r à l'intérieur des bandes. Retourne la vitesse d'impact.
export function constrain(o, r, e) {
  const { L, W, R: CR } = RINK;
  let hit = 0;
  const sx = o.x < 0 ? -1 : 1, sz = o.z < 0 ? -1 : 1;
  const ax = Math.abs(o.x), az = Math.abs(o.z);
  const cx = L - CR, cz = W - CR;
  if (ax > cx && az > cz) {
    const dx = ax - cx, dz = az - cz;
    const d = Math.hypot(dx, dz);
    if (d > CR - r) {
      const nx = -(dx / d) * sx, nz = -(dz / d) * sz;
      const k = (CR - r) / d;
      o.x = sx * (cx + dx * k); o.z = sz * (cz + dz * k);
      const vn = o.vx * nx + o.vz * nz;
      if (vn < 0) { o.vx -= (1 + e) * vn * nx; o.vz -= (1 + e) * vn * nz; hit = -vn; }
    }
  } else {
    if (ax > L - r) { o.x = sx * (L - r); if (o.vx * sx > 0) { hit = Math.abs(o.vx); o.vx = -o.vx * e; } }
    if (az > W - r) { o.z = sz * (W - r); if (o.vz * sz > 0) { hit = Math.max(hit, Math.abs(o.vz)); o.vz = -o.vz * e; } }
  }
  return hit;
}

export function isOutside(x, z, r = 0) {
  const { L, W, R: CR } = RINK;
  const ax = Math.abs(x), az = Math.abs(z);
  const cx = L - CR, cz = W - CR;
  if (ax > cx && az > cz) return Math.hypot(ax - cx, az - cz) > CR - r;
  return ax > L - r || az > W - r;
}

// Distance approximative à la bande la plus proche
export function boardDist(x, z) {
  const { L, W, R: CR } = RINK;
  const ax = Math.abs(x), az = Math.abs(z);
  const cx = L - CR, cz = W - CR;
  if (ax > cx && az > cz) return CR - Math.hypot(ax - cx, az - cz);
  return Math.min(L - ax, W - az);
}

// Empêche un patineur d'entrer dans le filet
export function keepOutOfNet(b, r) {
  const { goalX, netD, netHW } = RINK;
  const ax = Math.abs(b.x), s = b.x < 0 ? -1 : 1;
  const x0 = goalX - r * 0.3, x1 = goalX + netD + r, zw = netHW + r;
  if (ax > x0 && ax < x1 && Math.abs(b.z) < zw) {
    const pf = ax - x0, pb = x1 - ax, pz = zw - Math.abs(b.z);
    if (pz <= pf && pz <= pb) { b.z = (b.z < 0 ? -1 : 1) * zw; b.vz *= 0.3; }
    else if (pf < pb) { b.x = s * x0; b.vx *= 0.3; }
    else { b.x = s * x1; b.vx *= 0.3; }
  }
}

export function nearestDot(list, x, z) {
  let best = list[0], bd = 1e9;
  for (const d of list) { const q = Math.hypot(d.x - x, d.z - z); if (q < bd) { bd = q; best = d; } }
  return best;
}

// Point de mise au jeu dans une zone d'extrémité (side = signe de x) du côté de z
export const zoneDot = (side, z) => ({ x: side * 20.5, z: z < 0 ? -6.7 : 6.7 });
export const neutralDot = (side, z) => ({ x: side * 6.1, z: z < 0 ? -6.7 : 6.7 });
export { DOTS };
