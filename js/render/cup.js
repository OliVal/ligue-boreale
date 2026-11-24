// Remise de la coupe : quand ton équipe gagne la finale des séries (match joué), elle se rassemble au centre de la glace,
// le capitaine soulève le trophée sous un projecteur, les confettis tombent, la foule est debout et fait tourner ses serviettes.
// Puis la photo d'équipe : tout le monde autour de la coupe posée sur la glace (première rangée à genoux, les autres debout,
// bras en l'air), la bannière des champions derrière et des fontaines d'étincelles.
// Environ 17 secondes; Espace (ou le gros bouton) passe à la suite (les Trois étoiles, puis le résumé).
import * as THREE from 'three';
import { RINK } from '../core/config.js';
import { keyName, TOUCH } from '../engine/input.js';
import { makePlayer, poseSkater, poseGoalie, setNumber, setLook, compactPlayer } from './playergfx.js';
import { kitFor, logoCanvas } from '../data/kit.js';

const DUR = 17, PHOTO = 7.5; // la photo d'équipe commence à 7,5 s
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Trophée en argent : socle à étages, col, coupe (profil tourné)
function makeTrophy() {
  const g = new THREE.Group();
  const silver = new THREE.MeshPhongMaterial({ color: 0xdfe4ec, specular: 0xffffff, shininess: 110, emissive: 0x2a2d33 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x8a919c, specular: 0xffffff, shininess: 60 });
  const prof = [[0, 0], [0.33, 0], [0.33, 0.13], [0.29, 0.15], [0.29, 0.28], [0.25, 0.3], [0.25, 0.42], [0.21, 0.44], [0.21, 0.56], [0.17, 0.58],
    [0.17, 0.66], [0.07, 0.7], [0.055, 0.8], [0.09, 0.84], [0.19, 0.88], [0.22, 0.96], [0.2, 0.99], [0.0, 0.95]];
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 32), silver));
  for (const [r, y] of [[0.3, 0.14], [0.26, 0.29], [0.22, 0.43], [0.18, 0.57]]) { // anneaux gravés
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 32), dark); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t);
  }
  return g;
}

export class Cup {
  // info : { name } (nom du trophée); done : appelé à la fin
  constructor(app, m, info, done) {
    this.app = app; this.m = m; this.R = app.renderer; this.audio = app.audio; this.done = done; this.info = info;
    this.t = 0; this.over = false;
    const R = this.R, win = m.winner, lose = m.teams.find((t) => t !== win);
    this.win = win;
    // le capitaine : ton joueur en Carrière, sinon le marqueur du dernier but de l'équipe, sinon le premier patineur
    const sk = win.skaters.filter((b) => b.p), me = m.lockPl && m.lockPl.pos !== 'G' ? m.lockPl : null;
    const lastScorer = [...m.goals].reverse().find((g) => g.team === win.idx && g.scorer);
    let cap = sk.find((b) => me && b.p === me) || sk.find((b) => lastScorer && b.p === lastScorer.scorer) || sk[0];
    if (me && cap.p !== me) cap.p = me; // ton joueur soulève la coupe, même s'il était au banc
    this.cap = cap;
    // équipe gagnante au centre, en demi-cercle face à la caméra; les perdants au banc
    this.spots = [];
    const others = [...sk.filter((b) => b !== cap), win.goalie].filter((b) => b && b.p);
    others.forEach((b, i) => { const a = Math.PI * (0.15 + 0.7 * (i / Math.max(1, others.length - 1))); this.spots.push({ b, x: Math.cos(a) * 2.6, z: -Math.sin(a) * 2.2 }); });
    this.spots.push({ b: cap, x: 0, z: 0.4 });
    for (const s of this.spots) { s.b.active = true; s.b.x = s.x * 0.2 + s.b.x * 0.8; s.b.z = s.z * 0.2 + s.b.z * 0.8; }
    lose.skaters.concat([lose.goalie]).forEach((b, i) => { b.x = lose.benchX + (i - 2.5) * 0.9; b.z = -RINK.W + 1.2; b.vx = b.vz = 0; b.face = Math.PI / 2; });
    // trophée et confettis
    this.grp = new THREE.Group(); R.scene.add(this.grp);
    this.trophy = makeTrophy(); this.grp.add(this.trophy);
    const N = this.N = R.set.quality === 'mobile' || R.set.quality === 'low' ? 320 : 640;
    const cf = this.cf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
    const cols = [win.data.colors[0], win.data.colors[1], '#ffd21f', '#ffffff'].map((c) => new THREE.Color(c)), col = new THREE.Color();
    this.cp = new Float32Array(N * 3); this.cv = new Float32Array(N * 2); this.cr = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      this.spawn(i, true);
      col.copy(cols[i % cols.length]); cf.setColorAt(i, col);
    }
    cf.frustumCulled = false; cf.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.grp.add(cf);
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(); this.P = new THREE.Vector3(); this.S = new THREE.Vector3(1, 1, 1);
    // projecteur blanc sur le capitaine, aréna dans la pénombre, foule debout avec ses serviettes
    R.cupOn = true; R.celOverride = { team: win, scorer: cap.p };
    R.efx.goal(win, 1, cap, { red: false }); R.efx.shake = 0;
    // texte à l'écran
    const el = this.el = document.createElement('div'); el.id = 'cupcer';
    el.innerHTML = `<div class="ct"><div class="cc">🏆</div><h2>CHAMPIONS !</h2><p>${esc(win.data.city)} ${esc(win.data.name)} remportent la <b>${esc(info.name || 'Coupe')}</b></p></div>
      <div class="ck">${TOUCH.on ? 'Touche l\'écran pour continuer' : `Appuie sur ${keyName(app.settings.keys.slap)} pour continuer`}</div>`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.finish(); });
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('on'), 30);
    // la foule explose
    const au = this.audio;
    if (au) { if (!(au.clip && au.clip('but_local', 3.4, 11, 1.4, 0.1, 1.5, true))) au.horn && au.horn(); au.cheer && au.cheer(true); au.excite = 3; }
    this.cheered = false;
  }

  // ---------- photo d'équipe ----------
  buildPhoto() {
    const R = this.R, win = this.win, m = this.m, mob = R.set.quality === 'mobile' || R.set.quality === 'low';
    const g = this.pg = new THREE.Group(); this.grp.add(g);
    // les joueurs du match sont cachés; on aligne toute l'équipe (jusqu'à 18 joueurs) pour la photo
    this.saveActive = R.bodyList.map((b) => [b, b.active]);
    for (const b of R.bodyList) b.active = false;
    const kit = kitFor(win.data, win.idx === 0 ? 'home' : 'away', m.teams[0].data.colors[0]); kit.logo = logoCanvas(win.data);
    const capP = this.cap.p, skP = win.roster.filter((q) => q.pos !== 'G' && q !== capP), gk = win.roster.filter((q) => q.pos === 'G').slice(0, 1);
    const people = [capP, ...skP.slice(0, mob ? 11 : 15), ...gk];
    // rangées : à genoux devant (le capitaine au centre, derrière la coupe), debout au milieu, debout surélevés au fond
    const rows = [{ n: 5, z: 0.95, y: 0, kneel: true, w: 1.05 }, { n: 6, z: 0, y: 0, w: 0.95 }, { n: 99, z: -0.95, y: 0.32, w: 0.9 }];
    this.models = [];
    let k = 0;
    for (const row of rows) {
      const list = people.slice(k, k + row.n); k += list.length;
      const order = row.kneel ? [list[1], list[2], list[0], list[3], list[4]].filter(Boolean) : list; // le capitaine au centre
      order.forEach((pl, i) => {
        const x = (i - (order.length - 1) / 2) * row.w * (row.kneel ? 1.25 : 1);
        const pm = makePlayer(kit, pl.pos === 'G', i + k * 3);
        setNumber(pm.numTex, pl.num, pl.name); setLook(pm, pl, true, this.R.letters && this.R.letters.get(pl)); // barbes des séries, C et A
        compactPlayer(pm);
        g.add(pm.outer);
        this.models.push({ pm, pl, isG: pl.pos === 'G', kneel: !!row.kneel && pl.pos !== 'G', x, z: row.z + (row.kneel ? Math.abs(x) * 0.12 : 0), y: row.y, ph: Math.random() * 6 });
      });
    }
    // bannière des champions, tenue derrière l'équipe
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 220;
    const x = cv.getContext('2d');
    x.fillStyle = '#0b0f18'; x.fillRect(0, 0, 1024, 150); x.fillStyle = win.data.colors[0]; x.fillRect(0, 150, 1024, 70);
    x.drawImage(logoCanvas(win.data), 430, 8, 134, 134);
    x.fillStyle = '#ffffff'; x.font = '900 64px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText((this.info.name || 'COUPE').toUpperCase(), 212, 78, 390); x.fillText('CHAMPIONS', 812, 78, 390); // jamais sur le logo
    x.fillStyle = '#ffd21f'; x.font = '900 52px Arial'; x.fillText(this.info.year || `${win.data.city} ${win.data.name}`.toUpperCase(), 512, 187);
    this.banTex = new THREE.CanvasTexture(cv); this.banTex.colorSpace = THREE.SRGBColorSpace;
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.0), new THREE.MeshBasicMaterial({ map: this.banTex, side: THREE.DoubleSide }));
    ban.position.set(0, 3.25, -1.7); g.add(ban); this.ban = ban;
    // fontaines d'étincelles derrière l'équipe (feux d'artifice de patinoire)
    const NS = this.NS = mob ? 600 : 1300;
    this.sp = new Float32Array(NS * 3); this.sv = new Float32Array(NS * 3); this.sl = new Float32Array(NS); this.sc = new Float32Array(NS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sp, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.sc, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dx = dot.getContext('2d'), gr = dx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,240,200,0.8)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    dx.fillStyle = gr; dx.fillRect(0, 0, 32, 32);
    this.dotTex = new THREE.CanvasTexture(dot);
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.26, map: this.dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false; g.add(this.sparks); this.sGeo = geo;
    this.jets = [-4.8, -2.9, 2.9, 4.8]; this.sNext = 0;
    const NB = this.NB = mob ? 260 : 520;
    const bc = this.bc = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), NB);
    const cols = [win.data.colors[0], win.data.colors[1], '#ffd21f', '#ffffff', '#ffd21f'].map((c) => new THREE.Color(c));
    const hide = new THREE.Matrix4().makeTranslation(0, -50, 0); // pas encore tirés : sous la glace
    for (let i = 0; i < NB; i++) { bc.setColorAt(i, cols[i % cols.length]); bc.setMatrixAt(i, hide); }
    this.bp = new Float32Array(NB * 3).fill(-50); this.bv = new Float32Array(NB * 3); this.br = new Float32Array(NB * 2); this.bNext = 0; this.salvo = 0;
    bc.frustumCulled = false; bc.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(bc);
    this.trophy.rotation.set(0, 0, 0);
    R.efx.stopShow(); // éclairage normal : c'est une photo
    this.el.classList.add('photo'); // le titre s'efface : place à la photo
  }

  updatePhoto(dt, t) {
    const time = performance.now() / 1000;
    for (const o of this.models) {
      const fake = { x: o.x, z: o.z, vx: 0, vz: 0, face: Math.PI / 2, stun: 0, checkT: 0, stride: time * 1.5 + o.ph, windup: null, shotAnim: 0,
        down: 0, saveAnim: 0, saveSide: 0, dive: 0, p: o.pl };
      if (o.isG) poseGoalie(o.pm, fake);
      else poseSkater(o.pm, fake, time + o.ph, o.kneel ? 2 : 1, o.kneel ? 'knee' : null);
      o.pm.outer.position.y = o.y;
    }
    this.trophy.position.set(0, 0.02, 1.55); this.trophy.rotation.set(0, Math.sin(t * 0.5) * 0.25, 0);
    this.ban.position.y = 3.25 + Math.sin(t * 2.4) * 0.05; this.ban.rotation.z = Math.sin(t * 1.7) * 0.025;
    // étincelles : jets de feu qui montent par à-coups (chaque canon a son rythme)
    const sp = this.sp, sv = this.sv, sl = this.sl, sc = this.sc, n = this.NS;
    const emit = Math.min(n, Math.round(dt * n * 1.6));
    for (let e = 0; e < emit; e++) {
      const j = (this.sNext + e) % 4, pulse = Math.max(0, Math.sin(t * 4.2 + j * 1.7));
      if (Math.random() > 0.15 + 0.85 * pulse) continue;
      const i = this.sNext; this.sNext = (this.sNext + 1) % n;
      const jx = this.jets[j];
      sp[i * 3] = jx + (Math.random() - 0.5) * 0.2; sp[i * 3 + 1] = 0.15; sp[i * 3 + 2] = -3 + (Math.random() - 0.5) * 0.2;
      sv[i * 3] = (Math.random() - 0.5) * 1.6; sv[i * 3 + 1] = 8 + Math.random() * 3.5; // jets de 5 à 7 m sv[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      sl[i] = 0.75 + Math.random() * 0.4;
    }
    for (let i = 0; i < n; i++) {
      if (sl[i] <= 0) { sc[i * 3] = sc[i * 3 + 1] = sc[i * 3 + 2] = 0; continue; }
      sl[i] -= dt; sv[i * 3 + 1] -= 7 * dt;
      sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      const k = Math.max(0, Math.min(1, sl[i] * 1.2));
      sc[i * 3] = k; sc[i * 3 + 1] = k * 0.86; sc[i * 3 + 2] = k * 0.55; // or et blanc qui s'éteint
    }
    this.sGeo.attributes.position.needsUpdate = true; this.sGeo.attributes.color.needsUpdate = true;
    // salve de confettis toutes les 1,4 s, en alternance à gauche et à droite : ils jaillissent puis retombent en tournoyant
    this.salvo -= dt;
    if (this.salvo <= 0) {
      this.salvo = 1.4; const side = (this.side = -(this.side || 1));
      for (let c = 0; c < this.NB / 4; c++) {
        const i = this.bNext; this.bNext = (this.bNext + 1) % this.NB;
        const bp = this.bp, bv = this.bv;
        bp[i * 3] = side * (3.8 + Math.random() * 0.4); bp[i * 3 + 1] = 0.3; bp[i * 3 + 2] = -2.6;
        bv[i * 3] = -side * (0.6 + Math.random() * 2.2) + (Math.random() - 0.5) * 1.5; bv[i * 3 + 1] = 10 + Math.random() * 5; bv[i * 3 + 2] = 1 + Math.random() * 2.5;
        this.br[i * 2] = Math.random() * 6; this.br[i * 2 + 1] = 4 + Math.random() * 8;
      }
    }
    const bp = this.bp, bv = this.bv, br = this.br, bc = this.bc;
    for (let i = 0; i < this.NB; i++) {
      if (bp[i * 3 + 1] < -10) continue;
      bv[i * 3 + 1] -= 9.8 * dt;
      if (bv[i * 3 + 1] < -1.6) bv[i * 3 + 1] = -1.6; // le papier freine dans l'air
      const drag = Math.exp(-dt * 1.2); bv[i * 3] *= drag; bv[i * 3 + 2] *= drag;
      bp[i * 3] += bv[i * 3] * dt; bp[i * 3 + 1] += bv[i * 3 + 1] * dt; bp[i * 3 + 2] += bv[i * 3 + 2] * dt;
      if (bp[i * 3 + 1] < 0.02) { bp[i * 3 + 1] = 0.02; bv[i * 3] = bv[i * 3 + 1] = bv[i * 3 + 2] = 0; }
      br[i * 2] += br[i * 2 + 1] * dt * (bp[i * 3 + 1] > 0.03 ? 1 : 0);
      this.P.set(bp[i * 3], bp[i * 3 + 1], bp[i * 3 + 2]);
      this.E.set(br[i * 2], br[i * 2] * 0.6, br[i * 2] * 0.3); this.Q.setFromEuler(this.E);
      this.M.compose(this.P, this.Q, this.S); bc.setMatrixAt(i, this.M);
    }
    bc.instanceMatrix.needsUpdate = true;
    // caméra : le photographe, un peu en contrebas, qui recule doucement
    const k = Math.min(1, (t - PHOTO) / 4);
    this.R.introCam = [0, 1.9 + k * 0.3, 7.2 + k * 1.3, 0, 1.45, -0.4, 44];
  }

  spawn(i, first) {
    const p = this.cp, v = this.cv, r = this.cr;
    p[i * 3] = (Math.random() - 0.5) * 22; p[i * 3 + 1] = first ? 4 + Math.random() * 14 : 15 + Math.random() * 4; p[i * 3 + 2] = (Math.random() - 0.5) * 16;
    v[i * 2] = 0.9 + Math.random() * 1.2; v[i * 2 + 1] = Math.random() * Math.PI * 2;
    r[i * 2] = 3 + Math.random() * 6; r[i * 2 + 1] = Math.random() * Math.PI * 2;
  }

  update(dt) {
    if (this.over) return;
    this.t += dt;
    const t = this.t, R = this.R, cap = this.cap;
    if (t >= DUR) { this.finish(); return; }
    if (t >= PHOTO) {
      if (!this.pg) { this.buildPhoto(); this.R.cutCam = true; if (this.audio && this.audio.cheer) this.audio.cheer(true); }
      this.updatePhoto(dt, t); this.updateConfetti(dt); this.R.crowdEx = 3;
      return;
    }
    // joueurs : ils glissent vers leur place et se tournent vers la caméra; bras levés (pose de célébration)
    for (const s of this.spots) {
      const b = s.b, k = Math.min(1, dt * 2.2);
      b.x += (s.x - b.x) * k; b.z += (s.z - b.z) * k; b.vx = b.vz = 0; b.face = Math.PI / 2; b.stride = (b.stride || 0) + dt * 0.4;
      b.stun = 0; b.windup = null; if (b.ctrl) { b.ctrl.mx = 0; b.ctrl.mz = 0; }
    }
    // trophée : posé sur la glace à côté du capitaine, puis soulevé au-dessus de sa tête
    const lift = Math.min(1, Math.max(0, (t - 1.8) / 0.9)), bob = lift >= 1 ? Math.sin(t * 3.2) * 0.1 : 0;
    this.trophy.position.set(cap.x + (1 - lift) * 0.9, 0.02 + lift * 1.7 + bob, cap.z + 0.15);
    this.trophy.rotation.y = t * 0.6; this.trophy.rotation.z = lift * Math.sin(t * 2.1) * 0.12;
    this.updateConfetti(dt);
    // foule debout, projecteur relancé au besoin, une deuxième clameur
    R.crowdEx = 3;
    if (!R.efx.show) { R.efx.goal(this.win, 1, cap, { red: false }); R.efx.shake = 0; }
    // caméra : plan large depuis les gradins, puis on tourne autour du capitaine et de la coupe
    const tx = cap.x, tz = cap.z;
    if (t < 2.2) { const k = t / 2.2; R.introCam = [tx + 2 - 4 * k, 7.5 - 2.5 * k, tz + 13 - 3 * k, tx, 1.2, tz, 48]; }
    else { const a = (t - 2.2) * 0.32 - 0.5; R.introCam = [tx + Math.sin(a) * 6.2, 2.3 + Math.sin(t * 0.4) * 0.3, tz + Math.cos(a) * 6.2, tx, 1.9, tz, 44]; }
    if (this.shot !== (t < 2.2 ? 0 : 1)) { this.shot = t < 2.2 ? 0 : 1; R.cutCam = true; }
  }

  // confettis : tombent en tournoyant et repartent du haut
  updateConfetti(dt) {
    const p = this.cp, v = this.cv, r = this.cr, cf = this.cf;
    for (let i = 0; i < this.N; i++) {
      p[i * 3 + 1] -= v[i * 2] * dt;
      if (p[i * 3 + 1] < 0.03) this.spawn(i, false);
      v[i * 2 + 1] += dt * 1.6;
      this.P.set(p[i * 3] + Math.sin(v[i * 2 + 1]) * 0.25, p[i * 3 + 1], p[i * 3 + 2] + Math.cos(v[i * 2 + 1] * 0.8) * 0.25);
      r[i * 2 + 1] += r[i * 2] * dt;
      this.E.set(r[i * 2 + 1], r[i * 2 + 1] * 0.7, 0); this.Q.setFromEuler(this.E);
      this.M.compose(this.P, this.Q, this.S); cf.setMatrixAt(i, this.M);
    }
    cf.instanceMatrix.needsUpdate = true;
  }

  // ended : true quand on quitte le match (pas de suite)
  finish(ended = false) {
    if (this.over) return;
    this.over = true;
    const R = this.R;
    R.scene.remove(this.grp);
    const done = new Set(), free = (x) => { if (x && !done.has(x)) { done.add(x); x.dispose(); } };
    this.grp.traverse((o) => { free(o.geometry); for (const mt of [].concat(o.material || [])) { free(mt.map); free(mt); } });
    free(this.banTex); free(this.dotTex);
    if (this.saveActive) for (const [b, a] of this.saveActive) b.active = a;
    R.introCam = null; R.cutCam = true; R.cupOn = false; R.celOverride = null; R.efx.stopShow();
    this.el.classList.remove('on'); setTimeout(() => this.el.remove(), 400);
    if (!ended && this.done) this.done();
  }
}
