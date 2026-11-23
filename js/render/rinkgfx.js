// Construction 3D de l'aréna : glace texturée, bandes, baie vitrée, filets, gradins
import * as THREE from 'three';
import { RINK, DOTS } from '../core/config.js';
import { getLook, drawLogo } from '../data/kit.js';

const PPM = 2048 / 61; // pixels par mètre pour la texture de glace

export function perimeter(seg = 14, inset = 0) {
  const { L, W, R } = RINK, pts = [];
  const cx = L - R, cz = W - R, r = R - inset;
  const corners = [[cx, cz, 0], [-cx, cz, Math.PI / 2], [-cx, -cz, Math.PI], [cx, -cz, 1.5 * Math.PI]];
  for (const [x, z, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * Math.PI / 2;
      pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
    }
  }
  pts.push(pts[0]);
  return pts;
}

function wallGeo(pts, y0, y1) {
  const pos = [], uv = [];
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const d = Math.hypot(bx - ax, bz - az);
    // normale vers l'intérieur : l'ordre des sommets est choisi pour que la face soit visible de la glace
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const nx = -(bz - az), nz = bx - ax;
    const inward = nx * -mx + nz * -mz < 0;
    const A = inward ? [ax, az, dist] : [bx, bz, dist + d], Bp = inward ? [bx, bz, dist + d] : [ax, az, dist];
    // triangles (A0, B0, B1) et (A0, B1, A1)
    pos.push(A[0], y0, A[1], Bp[0], y1, Bp[1], Bp[0], y0, Bp[1], A[0], y0, A[1], A[0], y1, A[1], Bp[0], y1, Bp[1]);
    uv.push(A[2], 0, Bp[2], 1, Bp[2], 0, A[2], 0, A[2], 1, Bp[2], 1);
    dist += d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function drawIce(ctx, home, iceColor = '#f3f8fc') {
  const w = 2048, h = Math.round(26 * PPM);
  const X = (x) => (x + 30.5) * PPM, Z = (z) => (z + 13) * PPM, S = (m) => m * PPM;
  ctx.fillStyle = '#20242c'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  const pts = perimeter(20);
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
  ctx.closePath(); ctx.clip();
  ctx.fillStyle = home ? getLook(home).ice : iceColor; ctx.fillRect(0, 0, w, h);
  // léger grain de glace
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${200 + Math.random() * 40},${225 + Math.random() * 20},255,${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 40, 1 + Math.random() * 2);
  }
  const red = '#d2202f', blue = '#1c4fb8';
  // logo central de l'équipe locale
  if (home) { ctx.globalAlpha = 0.5; drawLogo(ctx, home, X(0), Z(0), S(3.9)); }
  ctx.globalAlpha = 1;
  // lignes
  ctx.fillStyle = red; ctx.fillRect(X(0) - S(0.15), 0, S(0.3), h);
  ctx.fillStyle = blue;
  for (const s of [-1, 1]) ctx.fillRect(X(s * RINK.blueX) - S(0.15), 0, S(0.3), h);
  ctx.fillStyle = red;
  for (const s of [-1, 1]) ctx.fillRect(X(s * RINK.goalX) - S(0.04), 0, S(0.08), h);
  ctx.lineWidth = S(0.07);
  ctx.strokeStyle = blue; ctx.beginPath(); ctx.arc(X(0), Z(0), S(4.5), 0, 7); ctx.stroke();
  ctx.strokeStyle = red; ctx.fillStyle = red;
  for (const d of DOTS.zone) {
    ctx.beginPath(); ctx.arc(X(d.x), Z(d.z), S(4.5), 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(d.x), Z(d.z), S(0.3), 0, 7); ctx.fill();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // traits de mise au jeu
      ctx.fillRect(X(d.x + sx * 0.9) - S(0.03), Z(d.z + sz * 4.5) - (sz > 0 ? 0 : S(0.6)), S(0.06), S(0.6));
    }
  }
  for (const d of DOTS.neutral) { ctx.beginPath(); ctx.arc(X(d.x), Z(d.z), S(0.3), 0, 7); ctx.fill(); }
  ctx.fillStyle = blue; ctx.beginPath(); ctx.arc(X(0), Z(0), S(0.18), 0, 7); ctx.fill();
  // enclaves des gardiens
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(X(s * RINK.goalX), Z(0), S(1.8), s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? 1.5 * Math.PI : Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(70,150,235,0.45)'; ctx.fill(); ctx.strokeStyle = red; ctx.stroke();
  }
  // trapèze du gardien derrière chaque filet (de la ligne de but jusqu'à la bande du fond)
  ctx.strokeStyle = red; ctx.lineWidth = S(0.06);
  for (const s of [-1, 1]) for (const sz of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(X(s * RINK.goalX), Z(sz * RINK.trapGoal));
    ctx.lineTo(X(s * (RINK.L + 0.5)), Z(sz * (RINK.trapEnd + (RINK.trapEnd - RINK.trapGoal) * 0.5 / (RINK.L - RINK.goalX))));
    ctx.stroke();
  }
  ctx.restore();
  return { w, h };
}

export function buildArena(scene, home, quality = 'high') {
  if (quality === 'mobile') quality = 'low'; // mobile : décor allégé (moins de spectateurs, immobiles)
  const g = new THREE.Group();
  const { L, W, boardH, glassH, goalX, netHW, netH, netD } = RINK;
  // glace
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = Math.round(26 * PPM);
  const ctx = cv.getContext('2d');
  drawIce(ctx, home);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(61, 26), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.05 }));
  ice.rotation.x = -Math.PI / 2; g.add(ice);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 100), new THREE.MeshLambertMaterial({ color: 0x14171d }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; g.add(floor);
  // bandes (visibles de l'intérieur seulement : la bande côté caméra ne cache pas le jeu)
  const pts = perimeter(16);
  const boardMat = new THREE.MeshLambertMaterial({ color: home ? getLook(home).boards : 0xd9dee6 });
  g.add(new THREE.Mesh(wallGeo(pts, 0, boardH), boardMat));
  g.add(new THREE.Mesh(wallGeo(perimeter(16, 0.02), 0, 0.2), new THREE.MeshLambertMaterial({ color: 0xe9c531 })));
  g.add(new THREE.Mesh(wallGeo(perimeter(16, 0.02), boardH - 0.1, boardH + 0.03), new THREE.MeshLambertMaterial({ color: home ? home.colors[0] : 0x1c4fb8 })));
  const glass = new THREE.Mesh(wallGeo(pts, boardH, glassH), new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.09, depthWrite: false }));
  g.add(glass);
  // filets
  const nets = [];
  for (const s of [-1, 1]) {
    const n = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0xd2202f });
    const post = new THREE.CylinderGeometry(0.045, 0.045, netH, 8);
    for (const z of [-netHW, netHW]) { const m = new THREE.Mesh(post, postMat); m.position.set(0, netH / 2, z); n.add(m); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, netHW * 2, 8), postMat);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, netH, 0); n.add(bar);
    const nc = document.createElement('canvas'); nc.width = nc.height = 64;
    const nx = nc.getContext('2d'); nx.strokeStyle = 'rgba(255,255,255,0.9)'; nx.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) { nx.beginPath(); nx.moveTo(i, 0); nx.lineTo(i, 64); nx.moveTo(0, i); nx.lineTo(64, i); nx.stroke(); }
    const nt = new THREE.CanvasTexture(nc); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(4, 3);
    const meshMat = new THREE.MeshBasicMaterial({ map: nt, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(netHW * 2, netH), meshMat);
    back.rotation.y = Math.PI / 2; back.position.set(s * netD, netH / 2, 0); n.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(netD, netHW * 2), meshMat);
    top.rotation.x = -Math.PI / 2; top.position.set(s * netD / 2, netH, 0); n.add(top);
    for (const z of [-netHW, netHW]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(netD, netH), meshMat);
      side.position.set(s * netD / 2, netH / 2, z); n.add(side);
    }
    // lumière rouge de but
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0x4a0a0a }));
    lamp.position.set(s * (L - goalX + 0.4), glassH + 0.3, 0); n.add(lamp);
    const light = new THREE.PointLight(0xff2020, 0, 30); light.position.copy(lamp.position); n.add(light);
    n.position.x = s * goalX; g.add(n);
    nets.push({ group: n, lamp, light, s, back });
  }
  // gradins et foule
  const cc = document.createElement('canvas'); cc.width = 512; cc.height = 256;
  const cx = cc.getContext('2d'); cx.fillStyle = '#0d1016'; cx.fillRect(0, 0, 512, 256);
  const cols = ['#c9ccd4', '#8a8f9c', '#d8b89a', '#3c4a66', '#7a2a30', home ? home.colors[0] : '#1c4fb8', home ? home.colors[0] : '#1c4fb8', '#e9e2d0'];
  for (let r = 0; r < 20; r++) for (let c = 0; c < 80; c++) {
    if (Math.random() < 0.12) continue;
    cx.fillStyle = cols[(Math.random() * cols.length) | 0];
    cx.fillRect(c * 6.4 + 1, r * 12.8 + 3, 4, 7);
  }
  const ct = new THREE.CanvasTexture(cc); ct.wrapS = THREE.RepeatWrapping; ct.colorSpace = THREE.SRGBColorSpace;
  // balcon supérieur : plans texturés en arrière-plan
  const mkStand = (w, x, z, ry) => {
    const t = ct.clone(); t.needsUpdate = true; t.repeat.set(w / 30, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 16), new THREE.MeshBasicMaterial({ map: t, color: 0x6a6a6a }));
    m.rotation.order = 'YXZ'; m.rotation.y = ry; m.rotation.x = -0.9;
    m.position.set(x, 14.5, z); g.add(m);
    return m;
  };
  mkStand(96, 0, -W - 19, 0); mkStand(62, -L - 19, 0, Math.PI / 2); mkStand(62, L + 19, 0, -Math.PI / 2); mkStand(96, 0, W + 19, Math.PI);

  // gradins du bas : dalles inclinées + spectateurs instanciés qui se lèvent et sautent
  const ROWS = quality === 'low' ? 6 : 11, STEP = 0.74;
  const standMat = new THREE.MeshLambertMaterial({ color: 0x191d26, side: THREE.DoubleSide });
  const seats = [];
  const sides = [ // centre, axe le long de la bande, direction vers l'extérieur, longueur
    [0, -W - 1.6, 1, 0, 0, -1, 60], [0, W + 1.6, 1, 0, 0, 1, 60], [-L - 1.6, 0, 0, 1, -1, 0, 24], [L + 1.6, 0, 0, 1, 1, 0, 24],
  ];
  for (const [cx0, cz0, ax, az, ox, oz, len] of sides) {
    const depth = ROWS * 0.95 + 0.6, y0 = boardH + 0.1, y1 = y0 + ROWS * 0.62 + 0.3;
    const h = len / 2, P = (a, o, y) => [cx0 + ax * a + ox * o, y, cz0 + az * a + oz * o];
    const q = [P(-h, 0, y0), P(h, 0, y0), P(h, depth, y1), P(-h, depth, y1)];
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]], 3));
    sg.computeVertexNormals();
    g.add(new THREE.Mesh(sg, standMat));
    for (let r = 0; r < ROWS; r++) for (let a = -h + 0.5; a < h - 0.4; a += STEP) {
      if (Math.random() < 0.07) continue;
      seats.push(cx0 + ax * a + ox * (0.5 + r * 0.95), y0 + 0.62 + r * 0.62, cz0 + az * a + oz * (0.5 + r * 0.95));
    }
  }
  const n = seats.length / 3;
  const fans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.78, 0.42), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const dm = new THREE.Matrix4(), col = new THREE.Color();
  const phase = new Float32Array(n), baseY = new Float32Array(n);
  const fanCols = ['#c9ccd4', '#8a8f9c', '#d8b89a', '#3c4a66', '#7a2a30', '#e9e2d0', '#2c2f38'];
  for (let i = 0; i < n; i++) {
    dm.makeTranslation(seats[i * 3], seats[i * 3 + 1], seats[i * 3 + 2]); fans.setMatrixAt(i, dm);
    col.set(home && Math.random() < 0.45 ? home.colors[Math.random() < 0.75 ? 0 : 1] : fanCols[(Math.random() * fanCols.length) | 0]);
    col.multiplyScalar(0.55 + Math.random() * 0.3);
    fans.setColorAt(i, col);
    phase[i] = Math.random(); baseY[i] = seats[i * 3 + 1];
  }
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  g.add(fans);
  // serviettes des séries : environ un partisan sur deux en fait tourner une au-dessus de sa tête (cachées hors des séries)
  const tw = [];
  for (let i = 0; i < n; i++) if (Math.random() < 0.55) tw.push(i);
  const tGeo = new THREE.PlaneGeometry(0.62, 0.36); tGeo.translate(0.31, 0, 0); // tenue par un coin, elle tourne autour de la main
  const towels = new THREE.InstancedMesh(tGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x4a4a4a, side: THREE.DoubleSide }), tw.length);
  const tCol = new THREE.Color();
  for (let j = 0; j < tw.length; j++) {
    tCol.set(home && Math.random() < 0.25 ? home.colors[0] : '#f4f4f0'); // surtout blanches, quelques-unes aux couleurs de l'équipe
    towels.setColorAt(j, tCol);
  }
  towels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); towels.visible = false; towels.frustumCulled = false;
  g.add(towels);
  const tPh = Float32Array.from(tw, () => Math.random() * Math.PI * 2), tSp = Float32Array.from(tw, () => 7 + Math.random() * 4);
  const crowd = { fans, phase, baseY, n, still: quality === 'low', level: -1, towels, tw: Int32Array.from(tw), tPh, tSp };

  // tableau indicateur suspendu
  const cube = new THREE.Group();
  cube.add(new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 5), new THREE.MeshLambertMaterial({ color: 0x10131a })));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.5, 5.1), new THREE.MeshBasicMaterial({ color: home ? home.colors[0] : 0x1c4fb8 }));
  stripe.position.y = -1.2; cube.add(stripe);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.9, 5.15), new THREE.MeshBasicMaterial({ color: 0x1b2a44 }));
  glow.position.y = 0.3; cube.add(glow);
  cube.position.set(0, 17.5, 0); g.add(cube);

  // traces de patins : calque transparent au-dessus de la glace
  const mc = document.createElement('canvas'); mc.width = 1024; mc.height = Math.round(1024 * 26 / 61);
  const mtex = new THREE.CanvasTexture(mc);
  const mplane = new THREE.Mesh(new THREE.PlaneGeometry(61, 26), new THREE.MeshBasicMaterial({ map: mtex, transparent: true, depthWrite: false }));
  mplane.rotation.x = -Math.PI / 2; mplane.position.y = 0.004; mplane.visible = quality !== 'low'; g.add(mplane);
  const marks = { ctx: mc.getContext('2d'), tex: mtex, k: 1024 / 61, w: mc.width, h: mc.height, dirty: false, t: 0, on: quality !== 'low' };

  // resurfaceuses (visibles pendant les entractes)
  const zambonis = [];
  for (let i = 0; i < 2; i++) {
    const z = new THREE.Group();
    const wMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }), cMat = new THREE.MeshLambertMaterial({ color: home ? home.colors[0] : 0x1c4fb8 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 3.4), wMat); b1.position.y = 0.9; z.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.35, 3.45), cMat); b2.position.y = 0.6; z.add(b2);
    const b3 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.1), cMat); b3.position.set(0, 1.9, -0.9); z.add(b3);
    const b4 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 0.5), new THREE.MeshLambertMaterial({ color: 0x33363d })); b4.position.set(0, 0.15, 0); z.add(b4);
    z.visible = false; g.add(z); zambonis.push(z);
  }
  scene.add(g);
  return { group: g, nets, crowd, marks, zambonis, cube, iceCanvas: cv, iceTex: tex };
}

// Niveau d'excitation de la foule : 0 = assise, > 1.2 = debout et en liesse
export function updateCrowd(crowd, time, ex) {
  if (crowd.still) return;
  if (ex < 0.03 && crowd.level < 0.03) return; // rien à animer
  crowd.level = ex;
  const arr = crowd.fans.instanceMatrix.array, { phase, baseY, n } = crowd;
  const amp = Math.min(0.55, ex * 0.3), stand = ex > 1.2 ? 0.28 : 0;
  for (let i = 0; i < n; i++) {
    const ph = phase[i];
    const k = ph < 0.25 && ex < 1.2 ? 0.2 : 1; // certains restent calmes sauf sur un but
    arr[i * 16 + 13] = baseY[i] + stand * k + Math.abs(Math.sin(time * (5 + ph * 3) + ph * 40)) * amp * k;
  }
  crowd.fans.instanceMatrix.needsUpdate = true;
}

// Serviettes qui tournent au-dessus des têtes (séries); suivent les partisans quand ils sautent
const TW_M = new THREE.Matrix4(), TW_Q = new THREE.Quaternion(), TW_E = new THREE.Euler(), TW_P = new THREE.Vector3(), TW_S = new THREE.Vector3(1, 1, 1);
export function updateTowels(crowd, time, on) {
  const tm = crowd.towels;
  if (!tm) return;
  if (!on) { tm.visible = false; return; } // aussi sur téléphone (gradins simplifiés) : seulement pendant la cérémonie et les célébrations
  tm.visible = true;
  const fa = crowd.fans.instanceMatrix.array, tw = crowd.tw, ph = crowd.tPh, sp = crowd.tSp;
  for (let j = 0; j < tw.length; j++) {
    const i = tw[j], a = ph[j] + time * sp[j];
    TW_P.set(fa[i * 16 + 12], fa[i * 16 + 13] + 0.95, fa[i * 16 + 14]);
    TW_E.set(Math.sin(a * 2) * 0.35, -a, 0.25 + Math.sin(a) * 0.15); // la serviette tourne et flotte un peu
    TW_Q.setFromEuler(TW_E); TW_M.compose(TW_P, TW_Q, TW_S); tm.setMatrixAt(j, TW_M);
  }
  tm.instanceMatrix.needsUpdate = true;
}

// Trace de patin entre deux points (en mètres); snow = arrêt brusque / virage serré
export function addMark(marks, x0, z0, x1, z1, snow) {
  if (!marks.on) return;
  const c = marks.ctx, k = marks.k;
  const X = (x) => (x + 30.5) * k, Z = (z) => (z + 13) * k;
  c.lineCap = 'round';
  if (snow) { c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2.6; }
  else { c.strokeStyle = 'rgba(105,135,170,0.16)'; c.lineWidth = 1.1; }
  c.beginPath(); c.moveTo(X(x0), Z(z0)); c.lineTo(X(x1), Z(z1)); c.stroke();
  marks.dirty = true;
}

// Efface les traces à gauche de x (passage de la resurfaceuse); x = Infinity pour tout effacer
export function wipeMarks(marks, x) {
  const px = x === Infinity ? marks.w : Math.max(0, Math.min(marks.w, (x + 30.5) * marks.k));
  marks.ctx.clearRect(0, 0, px, marks.h);
  marks.dirty = true;
}
