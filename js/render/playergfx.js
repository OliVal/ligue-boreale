// Modèle 3D d'un joueur construit avec des primitives (l'avant du modèle pointe vers +x)
import * as THREE from 'three';

const SKIN = [0xe8b998, 0xd9a47e, 0xb97f5a, 0xf0c8a8];
// numéro et nom dans le dos (fond transparent : le chandail se voit autour)
function numberTexture(color, bg, style, outline) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.userData = { c, color, bg, style, outline, num: null };
  return t;
}
const NUM_FONTS = { bloc: 'bold 46px Arial', contour: '900 42px Arial', italique: 'italic 900 46px Arial', rond: 'bold 42px "Trebuchet MS", Verdana, sans-serif' };
// name : nom du joueur, écrit au-dessus du numéro
export function setNumber(tex, num, name = '') {
  const u = tex.userData, last = String(name || '').split(' ').slice(1).join(' ') || String(name || '');
  const key = num + '|' + last;
  if (u.num === key) return;
  u.num = key;
  const x = u.c.getContext('2d');
  x.clearRect(0, 0, 128, 128); // fond transparent : le chandail se voit autour
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (last) {
    x.font = '800 20px Arial'; x.fillStyle = u.color;
    x.fillText(last.toUpperCase(), 64, 16, 112);
  }
  x.font = (NUM_FONTS[u.style] || NUM_FONTS.bloc).replace(/\d+px/, (p) => `${Math.round(parseInt(p, 10) * 1.75)}px`);
  if (u.style === 'contour') { x.lineWidth = 12; x.lineJoin = 'round'; x.strokeStyle = u.outline; x.strokeText(String(num), 64, 78); }
  x.fillStyle = u.color; x.fillText(String(num), 64, 78);
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------
// Joueur : articulations (jambes, tronc, bras, bâton) animées par poseSkater / poseGoalie, formes arrondies :
// chandail ample, épaulières, culottes, bas, patins à lame, casque à visière (ou grille), gros gants, visage,
// nom dans le dos. Gardien : jambières, plastron, masque à grille, mitaine et bloqueur.

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

// kit = { jersey, trim, accent, pants, helmet, number, stripes, shoulders, panels, numStyle, logo }
export function makePlayer(kit, isGoalie, idx) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner);
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const glove = L(0x1a1a1e), jersey = L(kit.jersey), trim = L(kit.trim), accent = L(kit.accent || kit.trim), pants = L(kit.pants), dark = L(0x141418), white = L(0xf2f2f2);
  const steel = L(0xcfd6de), padCol = L(0xf4f4f2);
  const nStripes = { none: 0, simple: 1, double: 2, triple: 3 }[kit.stripes] ?? 1;
  const skin0 = SKIN[idx % SKIN.length], skin = L(skin0);
  const W = isGoalie ? 1.12 : 1; // le gardien est plus massif (équipement)
  let parts = null; // visage et équipement propres à chaque joueur (voir setLook)
  // ---- jambes : patin (lame d'acier), bas aux couleurs du chandail, genou; gardien : grosses jambières ----
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.add(mesh(new THREE.BoxGeometry(0.34, 0.018, 0.012), steel, 0.03, 0.015, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.29, 0.04, 0.028), dark, 0.03, 0.045, 0));
    const boot = mesh(new THREE.CapsuleGeometry(0.052, 0.17, 4, 8), dark, 0.04, 0.105, 0); boot.rotation.z = Math.PI / 2; leg.add(boot);
    leg.add(mesh(cyl(0.062, 0.058, 0.12, 10), dark, -0.005, 0.17, 0));
    if (isGoalie) {
      leg.add(mesh(new THREE.BoxGeometry(0.21, 0.66, 0.29), padCol, 0.07, 0.37, 0));
      for (const y of [0.22, 0.42, 0.6]) leg.add(mesh(new THREE.BoxGeometry(0.215, 0.025, 0.295), y === 0.42 ? trim : jersey, 0.07, y, 0));
      leg.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.24), padCol, 0.13, 0.7, 0));
    } else {
      leg.add(mesh(cyl(0.085, 0.064, 0.36, 10), jersey, 0, 0.4, 0));
      for (let i = 0; i < Math.max(1, nStripes); i++) leg.add(mesh(cyl(0.087, 0.082, 0.035, 10), i % 2 ? accent : trim, 0, 0.42 - i * 0.05, 0));
      leg.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), jersey, 0.02, 0.57, 0));
    }
    leg.position.z = s * (isGoalie ? 0.15 : 0.13); inner.add(leg); legs.push(leg);
  }
  const body = new THREE.Group(); inner.add(body);
  // ---- culottes et ceinture ----
  const hip = mesh(cyl(0.215 * W, 0.245 * W, 0.3, 14), pants, 0, 0.73, 0); hip.scale.set(0.82, 1, 1.08); body.add(hip);
  const belt = mesh(cyl(0.22 * W, 0.22 * W, 0.035, 14), dark, 0, 0.865, 0); belt.scale.set(0.82, 1, 1.08); body.add(belt);
  // ---- chandail : profil tourné (ample en bas, épaules arrondies vers le cou) ----
  const prof = [[0.275, 0.86], [0.262, 0.98], [0.27, 1.2], [0.292, 1.32], [0.24, 1.41], [0.12, 1.46], [0.06, 1.47]];
  const torso = mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * W, y)), 16), jersey); torso.scale.set(0.68, 1, 1); body.add(torso);
  for (let i = 0; i < nStripes; i++) { // bandes au bas du chandail
    const st = mesh(cyl(0.279 * W, 0.279 * W, i ? 0.04 : 0.085, 16), i % 2 ? accent : trim, 0, i ? 0.95 + i * 0.06 : 0.91, 0); st.scale.set(0.68, 1, 1); body.add(st);
  }
  for (const s of [-1, 1]) { // épaulières sous le chandail
    const sh = mesh(new THREE.SphereGeometry(0.14 * W, 12, 8), kit.shoulders === 'none' ? jersey : trim, 0, 1.36, s * 0.24 * W); sh.scale.set(0.95, 0.72, 1); body.add(sh);
    if (kit.panels === 'sides') body.add(mesh(new THREE.BoxGeometry(0.16, 0.34, 0.025), trim, 0, 1.12, s * 0.272 * W));
  }
  const numTex = numberTexture(kit.number, kit.jersey, kit.numStyle, kit.trim);
  if (kit.logo) { // écusson sur la poitrine
    const lt = kit.logoTex || (kit.logoTex = Object.assign(new THREE.CanvasTexture(kit.logo), { colorSpace: THREE.SRGBColorSpace }));
    const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27), new THREE.MeshLambertMaterial({ map: lt, transparent: true, alphaTest: 0.4 }));
    crest.rotation.y = Math.PI / 2; crest.position.set(0.2 * W, 1.15, 0); body.add(crest);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshLambertMaterial({ map: numTex, transparent: true, alphaTest: 0.2 }));
  plate.rotation.y = -Math.PI / 2; plate.position.set(-0.205 * W, 1.15, 0); body.add(plate);
  // ---- bras : manche, coude, bandes, gros gant (gardien : mitaine et bloqueur) ----
  const arms = [];
  const sleeve = kit.panels === 'sleeves' ? (kit.shoulders === 'none' ? accent : trim) : jersey;
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.add(mesh(cyl(0.078 * W, 0.068 * W, 0.24, 10), sleeve, 0, -0.13, 0));
    arm.add(mesh(new THREE.SphereGeometry(0.072 * W, 10, 8), sleeve, 0, -0.26, 0));
    arm.add(mesh(cyl(0.068 * W, 0.072 * W, 0.13, 10), sleeve, 0, -0.33, 0));
    for (let i = 0; i < nStripes; i++) arm.add(mesh(cyl(0.074 * W, 0.074 * W, 0.035, 10), i % 2 ? accent : (kit.panels === 'sleeves' ? jersey : trim), 0, -0.3 + i * 0.05, 0));
    if (isGoalie && s > 0) { // bloqueur
      arm.add(mesh(cyl(0.075, 0.075, 0.08, 10), padCol, 0, -0.42, 0));
      arm.add(mesh(new THREE.BoxGeometry(0.06, 0.28, 0.19), padCol, 0.05, -0.5, 0));
      arm.add(mesh(new THREE.BoxGeometry(0.065, 0.04, 0.195), trim, 0.05, -0.42, 0));
    } else if (isGoalie) { // mitaine
      const mit = mesh(cyl(0.155, 0.155, 0.08, 16), padCol, 0.06, -0.48, 0); mit.rotation.z = Math.PI / 2; arm.add(mit);
      const poc = mesh(cyl(0.09, 0.09, 0.02, 12), trim, 0.105, -0.48, 0); poc.rotation.z = Math.PI / 2; arm.add(poc);
    } else {
      arm.add(mesh(cyl(0.082, 0.088, 0.1, 10), glove, 0, -0.42, 0));
      arm.add(mesh(new THREE.BoxGeometry(0.15, 0.12, 0.13), glove, 0.01, -0.5, 0));
    }
    arm.position.set(0.04, 1.34, s * 0.33 * W); arm.rotation.z = 0.7;
    body.add(arm); arms.push(arm);
  }
  // ---- tête, casque à visière (gardien : masque à grille) ----
  body.add(mesh(cyl(0.055, 0.062, 0.09, 10), skin, 0.01, 1.48, 0));
  body.add(mesh(new THREE.SphereGeometry(0.115, 14, 10), skin, 0.02, 1.585, 0));
  if (isGoalie) {
    const mask = L(kit.helmet);
    const m = mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.78), mask, 0, 1.6, 0); m.scale.set(1.08, 1.05, 1); body.add(m);
    for (const y of [1.54, 1.58, 1.62]) { // grille du masque
      const bar = mesh(new THREE.TorusGeometry(0.135, 0.007, 4, 12, Math.PI * 0.55), dark, 0.03, y, 0); bar.rotation.set(Math.PI / 2, 0, -Math.PI * 0.275); body.add(bar);
    }
    body.add(mesh(new THREE.BoxGeometry(0.008, 0.13, 0.008), dark, 0.165, 1.575, 0));
    body.add(mesh(new THREE.BoxGeometry(0.03, 0.1, 0.13), padCol, 0.13, 1.44, 0)); // protège-gorge
  } else {
    const hm = L(kit.helmet);
    const h = mesh(new THREE.SphereGeometry(0.138, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hm, -0.012, 1.615, 0); h.scale.set(1.1, 1, 1); h.rotation.z = 0.36; body.add(h); // basculé vers l'arrière : le visage se voit
    for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), hm, -0.01, 1.57, s * 0.12)); // protège-oreilles
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.075, 14, 1, true, Math.PI * 0.2, Math.PI * 0.6),
      new THREE.MeshPhongMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.38, shininess: 120, side: THREE.DoubleSide, depthWrite: false }));
    visor.position.set(0.0, 1.585, 0); body.add(visor);
    // visage : yeux, sourcils, bouche, barbe, cheveux qui dépassent du casque (dans un groupe à part : couleurs propres à chaque joueur)
    const face = new THREE.Group(); body.add(face);
    const eye = FACE_DARK, hair = new THREE.MeshLambertMaterial({ color: 0x3a2a1e });
    for (const s of [-1, 1]) {
      face.add(mesh(new THREE.SphereGeometry(0.016, 6, 5), eye, 0.122, 1.6, s * 0.042));
      const brow = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.045), hair, 0.125, 1.628, s * 0.043); brow.rotation.x = s * 0.15; face.add(brow);
    }
    face.add(mesh(new THREE.BoxGeometry(0.01, 0.01, 0.05), FACE_MOUTH, 0.128, 1.538, 0));
    const beard = mesh(new THREE.SphereGeometry(0.121, 12, 6, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.55, Math.PI * 0.3), hair, 0.02, 1.585, 0);
    beard.rotation.y = Math.PI / 2; face.add(beard);
    const stache = mesh(new THREE.BoxGeometry(0.014, 0.018, 0.07), hair, 0.127, 1.558, 0); face.add(stache);
    const back = mesh(new THREE.SphereGeometry(0.122, 12, 6, Math.PI * 0.55, Math.PI * 0.9, Math.PI * 0.42, Math.PI * 0.18), hair, 0.0, 1.6, 0);
    back.rotation.y = Math.PI / 2; face.add(back); // cheveux sur la nuque
    // grille complète (certains joueurs) au lieu de la demi-visière
    const cage = new THREE.Group(); body.add(cage);
    const wire = new THREE.MeshLambertMaterial({ color: 0xd8dde4 });
    for (const y of [1.52, 1.555, 1.59]) { const bar = mesh(new THREE.TorusGeometry(0.14, 0.005, 4, 12, Math.PI * 0.55), wire, 0.02, y, 0); bar.rotation.set(Math.PI / 2, 0, -Math.PI * 0.275); cage.add(bar); }
    for (const z of [-0.05, 0, 0.05]) cage.add(mesh(new THREE.BoxGeometry(0.006, 0.12, 0.006), wire, 0.155 - Math.abs(z) * 0.25, 1.56, z));
    cage.visible = false;
    parts = { face, hair, beard, stache, back, visor, cage };
  }
  // ---- bâton ----
  const stick = new THREE.Group(); stick.position.set(0.26, 0.95, 0); body.add(stick);
  const shaftMat = L(0x2b2b30), bladeMat = L(0x111111);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), shaftMat); stick.add(shaft);
  const blade = new THREE.Group(); stick.add(blade);
  blade.add(mesh(new THREE.BoxGeometry(isGoalie ? 0.34 : 0.3, isGoalie ? 0.09 : 0.075, 0.03), bladeMat, 0, 0, 0));
  const toe = mesh(new THREE.BoxGeometry(0.08, isGoalie ? 0.09 : 0.075, 0.03), bladeMat, 0.17, 0, 0.012); toe.rotation.y = -0.35; blade.add(toe); // palette courbée
  if (isGoalie) blade.add(mesh(new THREE.BoxGeometry(0.06, 0.28, 0.035), shaftMat, -0.12, 0.17, 0)); // palette large du gardien
  const setHand = (hand) => {
    const end = new THREE.Vector3(0.58, -0.9, hand * 0.3);
    const len = end.length();
    shaft.scale.y = len; shaft.position.copy(end).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
    blade.position.set(end.x + 0.1, end.y, end.z);
  };
  setHand(1);
  return { outer, inner, body, legs, arms, stick, numTex, setHand, isGoalie, hand: 1, skin, skin0, bladeMat, shaftMat, glove, lookOf: null, hd: true,
    parts };
}
const FACE_DARK = new THREE.MeshLambertMaterial({ color: 0x1b1410 }), FACE_MOUTH = new THREE.MeshLambertMaterial({ color: 0x6e3a32 });
const HAIR = [0x1d1612, 0x3a2a1e, 0x5c3b22, 0x8a5a2b, 0xc79a5a, 0x9b3d1c, 0x2b2b2b];

// Dans chaque partie du corps (jambes, tronc, bras), les pièces de couleur unie sont fusionnées en une seule
// (couleurs gardées dans les sommets) : beaucoup moins de dessins par image, la même image.
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
// po : séries en cours (la plupart des joueurs se laissent pousser la barbe)
export function setLook(pm, pl, po = false) {
  const lk = (pl && ((pl.d && pl.d.look) || pl.look)) || null;
  if (pm.lookOf === pl && pm.lookPo === po) return;
  pm.lookOf = pl; pm.lookPo = po;
  const h = phash(pl), r = (n) => ((h >>> n) % 100) / 100; // tirages fixes propres au joueur
  pm.skin.color.set(lk ? lk.skin : SKIN[h % SKIN.length]);
  pm.bladeMat.color.set(lk ? lk.tape : r(5) < 0.55 ? 0x111111 : 0xf2f2f2); // ruban noir ou blanc
  // gabarit : défenseurs et joueurs physiques plus costauds, marqueurs plus menus
  const st = pl && pl.d ? pl.d.style || '' : '', pos = pl ? pl.pos : '';
  const big = /physique|défensif|Gros|Policier/i.test(st) ? 1.08 : pos === 'D' ? 1.05 : /Marqueur|Fabricant|Rapide/i.test(st) ? 0.96 : 1;
  const w = lk ? lk.w : big * (0.98 + r(9) * 0.05), hh = lk ? lk.h : (0.97 + r(13) * 0.06) * (big > 1 ? 1.01 : 1);
  pm.inner.scale.set(w, hh, w);
  const P = pm.parts;
  if (!P) return;
  P.hair.color.setHex(HAIR[(h >>> 3) % HAIR.length]);
  const beard = r(7) < (po ? 0.75 : 0.25), stache = beard || r(11) < 0.1;
  P.beard.visible = beard; P.stache.visible = stache;
  const cage = r(17) < 0.12; // quelques-uns portent la grille complète
  P.cage.visible = cage; P.visor.visible = !cage;
}

// ---------- animations ----------
// Les jambes pivotent à la hanche (et non plus aux pieds) : poussée vers l'extérieur et l'arrière, retour sous le corps,
// croisement de la jambe extérieure dans les virages serrés, corps penché et incliné vers l'intérieur du virage.
const HIP = 0.6, _H = new THREE.Vector3();
function setLeg(pm, i, ax, az, lift, dx) {
  const leg = pm.legs[i];
  leg.rotation.set(ax, 0, az);
  _H.set(0, HIP, 0).applyEuler(leg.rotation);
  leg.position.set(dx - _H.x, HIP - _H.y + lift, pm.legZ[i] - _H.z);
}
const _hash = new WeakMap();
function phash(p) { // nombre propre à chaque joueur (célébration, visage, équipement)
  if (!p) return 0;
  let h = _hash.get(p);
  if (h == null) { h = 7; for (const ch of String(p.name || '') + (p.num || 0)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; _hash.set(p, h); }
  return h;
}
const CELEBS = ['pump', 'point', 'wide', 'knee'];

export function poseSkater(pm, b, time, celebrate, style = null) {
  const sp = Math.hypot(b.vx, b.vz);
  pm.outer.position.set(b.x, 0, b.z);
  pm.outer.rotation.y = -b.face;
  const hand = b.p.d.hand;
  if (pm.hand !== hand) { pm.hand = hand; pm.setHand(hand); }
  if (!pm.legZ) pm.legZ = pm.legs.map((l) => l.position.z);
  const inner = pm.inner, body = pm.body;
  const k = Math.min(1, sp / 5.5), ph = (b.stride || 0) * 1.35;
  // intention de virage : commande de côté dans le repère du joueur
  const c = b.ctrl, f = b.face;
  const lat = c && sp > 3 ? Math.max(-1, Math.min(1, -c.mx * Math.sin(f) + c.mz * Math.cos(f))) : 0;
  const turn = Math.abs(lat) > 0.35 ? lat : 0, ts = Math.sign(turn);
  if (b.stun > 0) { // au sol
    const kk = Math.min(1, b.stun * 3);
    inner.rotation.set(kk * 1.45, 0, 0); inner.position.y = 0.12 * kk;
    setLeg(pm, 0, 0, 0, 0, 0); setLeg(pm, 1, 0, 0, 0, 0);
  } else {
    // corps penché vers l'avant (plus en vitesse), incliné dans le virage, petit balancement à chaque poussée
    inner.rotation.set(turn * 0.3 * k + Math.sin(ph) * 0.05 * k, 0, -Math.min(0.34, sp * 0.032) - (b.checkT > 0 ? 0.35 : 0));
    inner.position.y = -0.05 * k;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, p = Math.sin(ph + i * Math.PI), push = Math.max(0, p), rec = Math.max(0, -p);
      let ax = -s * push * 0.42 * k; // la jambe pousse vers l'extérieur…
      const az = (-push * 0.34 + rec * 0.2) * k; // …et vers l'arrière, puis revient sous le corps
      if (ts && s === ts) ax *= 0.4; // jambe intérieure du virage : petite poussée
      if (ts && s === -ts) ax += -ts * rec * 0.6 * k; // croisement : la jambe extérieure passe devant
      setLeg(pm, i, ax, az, rec * 0.05 * k, 0);
    }
  }
  body.position.y = -0.04 - Math.min(0.05, sp * 0.006);
  // lancers : élan (bâton haut, tronc tourné vers l'arrière), puis frappe et accompagnement vers l'avant
  let sw = 0, twist = 0, armUp = 0;
  if (b.windup) {
    const w = Math.min(1, b.windup.t * (b.windup.type === 'slap' ? 1.8 : 3));
    sw = b.windup.type === 'slap' ? -Math.min(2.4, b.windup.t * 3.4) : -Math.min(1.5, b.windup.t * 2.6); // frappé : le bâton monte derrière l'épaule
    twist = -0.55 * w; armUp = (b.windup.type === 'slap' ? 1.3 : 0.4) * w;
  } else if (b.shotAnim > 0) {
    const q = Math.sin((b.shotAnim / 0.45) * Math.PI);
    sw = q * 0.9; twist = 0.45 * q; armUp = -0.15 * q;
  }
  if (b.checkT > 0) { twist += 0.5; armUp -= 0.35; } // mise en échec : l'épaule part devant, les bras serrés
  body.rotation.y = twist * (hand >= 0 ? 1 : -1);
  pm.stick.rotation.z = sw;
  // lancer frappé : le bâton tremble en fin d'élan, puis plie contre la glace et fouette au lancer
  let flex = 0;
  if (b.windup && b.windup.type === 'slap' && b.windup.t > 0.45) flex = Math.sin(time * 60) * 0.03;
  else if (b.shotAnim > 0.2 && b.shotType === 'slap') { const kq = (0.45 - b.shotAnim) / 0.25; flex = Math.sin(kq * Math.PI * 3) * 0.24 * (1 - kq); }
  pm.stick.rotation.x = flex; pm.stick.scale.y = 1 - Math.abs(flex) * 0.5;
  // bras : tiennent le bâton; ils montent à l'élan; célébrations variées
  const h = phash(b.p), cs = celebrate === 2 ? (style || CELEBS[h % CELEBS.length]) : null;
  let up0 = 0.7 + armUp + Math.sin(ph) * 0.08 * k, up1 = up0, x0 = 0, x1 = 0;
  if (celebrate === 2) {
    if (cs === 'point') { up0 = 3.05; up1 = 0.9; } // il pointe le ciel
    else if (cs === 'wide') { up0 = up1 = 1.45; x0 = 1.25; x1 = -1.25; } // l'avion : bras grands ouverts
    else { up0 = 2.9 + Math.sin(time * 12) * 0.5; up1 = 1.0; } // poing qui pompe
  } else if (celebrate) {
    if (h % 3 === 0) { up0 = 2.8 + Math.sin(time * 8 + h) * 0.2; up1 = 1.1; } // un bras, bâton levé
    else { up0 = up1 = 2.7 + Math.sin(time * 9 + (b.stride || 0)) * 0.25; }
  }
  pm.arms[0].rotation.z += (up0 - pm.arms[0].rotation.z) * 0.2;
  pm.arms[1].rotation.z += (up1 - pm.arms[1].rotation.z) * 0.2;
  pm.arms[0].rotation.x += (x0 - pm.arms[0].rotation.x) * 0.2;
  pm.arms[1].rotation.x += (x1 - pm.arms[1].rotation.x) * 0.2;
  if (celebrate === 2 && b.stun <= 0) {
    inner.rotation.z += 0.2;
    // célébrations (débloquées au vestiaire, ou propres à chaque joueur)
    if (cs === 'spin') pm.outer.rotation.y = -b.face + time * 9;
    else if (cs === 'knee') { inner.position.y = -0.26; inner.rotation.z = 0.5; setLeg(pm, 0, 0, 0.9, 0, 0.05); setLeg(pm, 1, 0, -0.5, 0, -0.1); }
    else if (cs === 'jump') inner.position.y = Math.abs(Math.sin(time * 7)) * 0.45;
    else if (cs === 'wide') inner.rotation.x = Math.sin(time * 2.5) * 0.25; // il penche d'un côté puis de l'autre
  }
}

export function poseGoalie(pm, g) {
  pm.outer.position.set(g.x, 0, g.z);
  pm.outer.rotation.y = -g.face;
  const down = g.down > 0 ? Math.min(1, (1 - Math.abs(g.down - 0.5) * 2) * 4 + 0.2) : 0;
  const d = Math.min(1, Math.max(0, down));
  // position prête : accroupi, genoux écartés; en se déplaçant de côté, petite poussée en « T »
  const sp = Math.hypot(g.vx || 0, g.vz || 0), ready = 1 - d;
  pm.body.position.y = -0.08 - d * 0.38 - ready * 0.05;
  const shuffle = Math.min(1, sp / 2.5) * ready, ph = (g.stride || 0) * 3;
  // papillon : jambières écartées à plat
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1, leg = pm.legs[i];
    leg.rotation.x = s * d * 1.25 + s * ready * 0.1 + Math.sin(ph + i * Math.PI) * 0.12 * shuffle;
    leg.position.z = s * (0.16 + d * 0.12 + ready * 0.03); leg.position.y = d * 0.1;
  }
  // plongeon : le corps se couche du côté du plongeon
  const dv = g.dive > 0 ? Math.sin(Math.min(1, (1 - g.dive / 0.45) * 2) * Math.PI * 0.5) : 0;
  pm.body.rotation.x = (g.diveSide || 0) >= 0 ? dv * 1.0 : -dv * 1.0;
  pm.body.rotation.z = -ready * 0.12; // penché vers l'avant, prêt
  const hand = g.p.d.hand;
  if (pm.hand !== hand) { pm.hand = hand; pm.setHand(-hand); }
  // bras qui s'étire du côté de l'arrêt; sinon mitaine ouverte devant, prête
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const reach = g.saveAnim > 0 && Math.sign(g.saveSide) === s ? Math.sin((g.saveAnim / 0.6) * Math.PI) : 0;
    pm.arms[i].rotation.x = -s * reach * 1.3 - s * 0.18 * ready;
    pm.arms[i].rotation.z = 0.5 + reach * 0.4 + (i === 0 ? 0.25 : 0.1) * ready;
  }
}
