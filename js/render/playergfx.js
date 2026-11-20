// Modèle 3D d'un joueur construit avec des primitives (l'avant du modèle pointe vers +x)
import * as THREE from 'three';

const SKIN = [0xe8b998, 0xd9a47e, 0xb97f5a, 0xf0c8a8];
const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

function numberTexture(color, bg, style, outline) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.userData = { c, color, bg, style, outline, num: null };
  return t;
}
const NUM_FONTS = { bloc: 'bold 46px Arial', contour: '900 42px Arial', italique: 'italic 900 46px Arial', rond: 'bold 42px "Trebuchet MS", Verdana, sans-serif' };
export function setNumber(tex, num) {
  const u = tex.userData;
  if (u.num === num) return;
  u.num = num;
  const x = u.c.getContext('2d');
  x.fillStyle = u.bg; x.fillRect(0, 0, 64, 64);
  x.font = NUM_FONTS[u.style] || NUM_FONTS.bloc; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (u.style === 'contour') { x.lineWidth = 8; x.lineJoin = 'round'; x.strokeStyle = u.outline; x.strokeText(String(num), 32, 35); }
  x.fillStyle = u.color; x.fillText(String(num), 32, 35);
  tex.needsUpdate = true;
}

// kit = { jersey, trim, accent, pants, helmet, number, stripes, shoulders, panels, numStyle, logo }
export function makePlayer(kit, isGoalie, idx) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner);
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const glove = L(0x1a1a1e), jersey = L(kit.jersey), trim = L(kit.trim), accent = L(kit.accent || kit.trim), pants = L(kit.pants), dark = L(0x1a1a1e), white = L(0xf2f2f2);
  const nStripes = { none: 0, simple: 1, double: 2, triple: 3 }[kit.stripes] ?? 1;
  const skin0 = SKIN[idx % SKIN.length], skin = L(skin0);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    if (isGoalie) leg.add(box(0.2, 0.62, 0.3, white, 0.03, 0.33, 0));
    else { leg.add(box(0.18, 0.5, 0.17, trim, 0, 0.36, 0)); leg.add(box(0.3, 0.1, 0.13, dark, 0.04, 0.06, 0)); }
    leg.position.z = s * 0.14; inner.add(leg); legs.push(leg);
  }
  const body = new THREE.Group(); inner.add(body);
  body.add(box(0.3, 0.3, 0.46, pants, 0, 0.74, 0));
  body.add(box(0.32, 0.5, 0.52, jersey, 0, 1.12, 0));
  // bandes au bas du chandail, épaules et empiècements
  for (let i = 0; i < nStripes; i++) body.add(box(0.33, i ? 0.045 : 0.1, 0.53, i % 2 ? accent : trim, 0, i ? 0.94 + i * 0.065 : 0.9, 0));
  body.add(box(0.36, 0.15, 0.68, kit.shoulders === 'none' ? jersey : trim, 0, 1.38, 0));
  if (kit.panels === 'sides') for (const s of [-1, 1]) body.add(box(0.325, 0.38, 0.05, trim, 0, 1.14, s * 0.24));
  const numTex = numberTexture(kit.number, kit.jersey, kit.numStyle, kit.trim);
  if (kit.logo) { // écusson sur la poitrine
    const lt = kit.logoTex || (kit.logoTex = Object.assign(new THREE.CanvasTexture(kit.logo), { colorSpace: THREE.SRGBColorSpace }));
    const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27), new THREE.MeshLambertMaterial({ map: lt, transparent: true, alphaTest: 0.4 }));
    crest.rotation.y = Math.PI / 2; crest.position.set(0.166, 1.16, 0); body.add(crest);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshLambertMaterial({ map: numTex }));
  plate.rotation.y = -Math.PI / 2; plate.position.set(-0.165, 1.14, 0); body.add(plate);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.add(box(0.14, 0.42, 0.14, kit.panels === 'sleeves' ? (kit.shoulders === 'none' ? accent : trim) : jersey, 0, -0.18, 0));
    for (let i = 0; i < nStripes; i++) arm.add(box(0.15, 0.05, 0.15, i % 2 ? accent : (kit.panels === 'sleeves' ? jersey : trim), 0, -0.28 + i * 0.075, 0));
    arm.add(box(0.16, 0.14, 0.16, isGoalie && s > 0 ? white : glove, 0, -0.44, 0));
    arm.position.set(0.04, 1.34, s * 0.36); arm.rotation.z = 0.7;
    body.add(arm); arms.push(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), skin); head.position.set(0.02, 1.6, 0); body.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), L(isGoalie ? 0xf2f2f2 : kit.helmet));
  helmet.position.set(0, 1.63, 0); body.add(helmet);
  if (isGoalie) body.add(box(0.06, 0.2, 0.2, white, 0.13, 1.58, 0));
  // bâton
  const stick = new THREE.Group(); stick.position.set(0.26, 0.95, 0); body.add(stick);
  const shaftMat = L(0x2b2b30);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), shaftMat); stick.add(shaft);
  const bladeMat = L(0x111111);
  const blade = box(0.3, 0.08, 0.035, bladeMat, 0, 0, 0); stick.add(blade);
  const setHand = (hand) => {
    const end = new THREE.Vector3(0.58, -0.9, hand * 0.3);
    const len = end.length();
    shaft.scale.y = len; shaft.position.copy(end).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
    blade.position.set(end.x + 0.1, end.y, end.z);
  };
  setHand(1);
  return { outer, inner, body, legs, arms, stick, numTex, setHand, isGoalie, hand: 1, skin, skin0, bladeMat, shaftMat, glove, lookOf: null };
}

// Qualité « mobile » : dans chaque partie du corps (jambes, tronc, bras), les pièces de couleur unie sont fusionnées en une seule
// (couleurs gardées dans les sommets). Un joueur passe d'environ 20 à 10 dessins par image; l'image reste la même.
// La tête et le bâton restent à part : leurs couleurs changent pendant la partie (apparence en Carrière, objets du vestiaire).
export function compactPlayer(pm) {
  const keep = new Set([pm.skin, pm.bladeMat, pm.shaftMat]);
  for (const g of [...pm.legs, pm.body, ...pm.arms]) {
    const parts = g.children.filter((o) => o.isMesh && o.material && o.material.isMeshLambertMaterial && !o.material.map && !keep.has(o.material));
    if (parts.length < 2) continue;
    const pos = [], nor = [], col = [];
    for (const o of parts) {
      o.updateMatrix();
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrix);
      const p = geo.attributes.position.array, n = geo.attributes.normal.array, c = o.material.color;
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
      geo.dispose(); o.geometry.dispose(); g.remove(o); // matériaux partagés : libérés avec le joueur
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
}

// Apparence propre à un joueur (Carrière) : teint, taille, gabarit, ruban du bâton
export function setLook(pm, pl) {
  const lk = (pl && ((pl.d && pl.d.look) || pl.look)) || null;
  if (pm.lookOf === lk) return;
  pm.lookOf = lk;
  pm.skin.color.set(lk ? lk.skin : pm.skin0);
  pm.bladeMat.color.set(lk ? lk.tape : 0x111111);
  pm.inner.scale.set(lk ? lk.w : 1, lk ? lk.h : 1, lk ? lk.w : 1);
}

export function poseSkater(pm, b, time, celebrate, style = null) {
  const sp = Math.hypot(b.vx, b.vz);
  pm.outer.position.set(b.x, 0, b.z);
  pm.outer.rotation.y = -b.face;
  const hand = b.p.d.hand;
  if (pm.hand !== hand) { pm.hand = hand; pm.setHand(hand); }
  const inner = pm.inner;
  if (b.stun > 0) { // au sol
    const k = Math.min(1, b.stun * 3);
    inner.rotation.set(k * 1.45, 0, 0); inner.position.y = 0.12 * k;
  } else {
    inner.rotation.set(0, 0, -Math.min(0.3, sp * 0.028) - (b.checkT > 0 ? 0.35 : 0));
    inner.position.y = 0;
  }
  const stride = Math.sin(b.stride * 2.4) * Math.min(1, sp / 4);
  pm.legs[0].position.x = stride * 0.16; pm.legs[1].position.x = -stride * 0.16;
  pm.legs[0].rotation.y = stride * 0.25; pm.legs[1].rotation.y = -stride * 0.25;
  pm.body.position.y = -0.04 - Math.min(0.05, sp * 0.006);
  // bâton : élan et lancer
  let sw = 0;
  if (b.windup) sw = -Math.min(1.5, b.windup.t * 2.6);
  else if (b.shotAnim > 0) sw = Math.sin((b.shotAnim / 0.45) * Math.PI) * 0.9;
  pm.stick.rotation.z = sw;
  // célébration : bras levés; le marqueur (celebrate === 2) pompe le poing en se penchant vers l'arrière
  const up0 = celebrate === 2 ? 2.9 + Math.sin(time * 12) * 0.5 : celebrate ? 2.7 + Math.sin(time * 9 + b.stride) * 0.25 : 0.7;
  const up1 = celebrate === 2 ? 1.0 : up0;
  pm.arms[0].rotation.z += (up0 - pm.arms[0].rotation.z) * 0.2;
  pm.arms[1].rotation.z += (up1 - pm.arms[1].rotation.z) * 0.2;
  if (celebrate === 2 && b.stun <= 0) {
    inner.rotation.z += 0.2;
    // célébrations à débloquer
    if (style === 'spin') pm.outer.rotation.y = -b.face + time * 9;
    else if (style === 'knee') { inner.position.y = -0.26; inner.rotation.z = 0.5; pm.legs[0].position.x = 0.22; pm.legs[1].position.x = -0.2; }
    else if (style === 'jump') inner.position.y = Math.abs(Math.sin(time * 7)) * 0.45;
  }
}

export function poseGoalie(pm, g) {
  pm.outer.position.set(g.x, 0, g.z);
  pm.outer.rotation.y = -g.face;
  const down = g.down > 0 ? Math.min(1, (1 - Math.abs(g.down - 0.5) * 2) * 4 + 0.2) : 0;
  const d = Math.min(1, Math.max(0, down));
  pm.body.position.y = -0.08 - d * 0.38;
  // papillon : jambières écartées à plat
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1, leg = pm.legs[i];
    leg.rotation.x = s * d * 1.25; leg.position.z = s * (0.16 + d * 0.12); leg.position.y = d * 0.1;
  }
  // plongeon : le corps se couche du côté du plongeon
  const dv = g.dive > 0 ? Math.sin(Math.min(1, (1 - g.dive / 0.45) * 2) * Math.PI * 0.5) : 0;
  pm.body.rotation.x = (g.diveSide || 0) >= 0 ? dv * 1.0 : -dv * 1.0;
  const hand = g.p.d.hand;
  if (pm.hand !== hand) { pm.hand = hand; pm.setHand(-hand); }
  // bras qui s'étire du côté de l'arrêt
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const reach = g.saveAnim > 0 && Math.sign(g.saveSide) === s ? Math.sin((g.saveAnim / 0.6) * Math.PI) : 0;
    pm.arms[i].rotation.x = -s * reach * 1.3;
    pm.arms[i].rotation.z = 0.5 + reach * 0.4;
  }
}
