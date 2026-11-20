// Cérémonie d'avant-match (environ 30 s, on peut la passer) :
//   0-3 s    aréna dans le noir, faisceaux de couleur sur la glace, logos des deux équipes projetés
//   3-11 s   les gardiens sortent du banc, puis les patineurs, qui font des tours dans leur zone
//   11-13 s  les 5 patineurs de chaque équipe s'alignent sur leur ligne bleue
//   13-19 s  hymne national du Canada (drapeau qui ondule sur la glace)
//   19-25 s  hymne national des États-Unis (drapeau qui ondule sur la glace)
//   25-30 s  gros plan sur chaque gardien devant son filet, avec sa fiche; les lumières se rallument
// La simulation ne tourne pas pendant la cérémonie : on place les joueurs nous-mêmes, puis on remet tout comme avant.
import * as THREE from 'three';
import { RINK } from '../core/config.js';
import { logoCanvas } from '../data/kit.js';
import { keyName, TOUCH } from '../engine/input.js';

const T = { enter: 3.2, line: 10.8, can: 13, usa: 19.2, gk1: 25.2, gk2: 27.6, end: 30 };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// Mélodies (domaine public) : première phrase de chaque hymne, [note MIDI, durée en temps]
const O_CANADA = [[64, 2], [67, 1.5], [67, 0.5], [60, 3], [62, 1], [64, 1], [65, 1], [67, 1], [69, 1], [62, 3]];
const STAR_SPANGLED = [[67, 0.75], [64, 0.25], [60, 1], [64, 1], [67, 1], [72, 2], [76, 0.75], [74, 0.25], [72, 1], [64, 1], [66, 1], [67, 2]];

// ---------- dessins projetés sur la glace ----------
function canvas(w = 1024, h = 512) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function mapleLeaf(x, cx, cy, s) {
  const P = [[0, -1], [0.12, -0.75], [0.3, -0.82], [0.24, -0.45], [0.5, -0.62], [0.46, -0.48], [0.68, -0.5], [0.58, -0.3], [0.82, -0.18],
    [0.54, 0.02], [0.62, 0.2], [0.3, 0.12], [0.06, 0.3], [0.05, 0.62], [-0.05, 0.62], [-0.06, 0.3], [-0.3, 0.12], [-0.62, 0.2], [-0.54, 0.02],
    [-0.82, -0.18], [-0.58, -0.3], [-0.68, -0.5], [-0.46, -0.48], [-0.5, -0.62], [-0.24, -0.45], [-0.3, -0.82], [-0.12, -0.75]];
  x.beginPath(); P.forEach(([px, py], i) => (i ? x.lineTo(cx + px * s, cy + py * s) : x.moveTo(cx + px * s, cy + py * s))); x.closePath(); x.fill();
}
function flagCanada() {
  const c = canvas(), x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#d52b1e'; x.fillRect(0, 0, W / 4, H); x.fillRect(W * 3 / 4, 0, W / 4, H);
  mapleLeaf(x, W / 2, H * 0.52, H * 0.38);
  return c;
}
function star(x, cx, cy, r) {
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
}
function flagUSA() {
  const c = canvas(), x = c.getContext('2d'), W = c.width, H = c.height, sh = H / 13;
  for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#b22234'; x.fillRect(0, i * sh, W, sh + 1); }
  const cw = W * 0.4, ch = sh * 7;
  x.fillStyle = '#3c3b6e'; x.fillRect(0, 0, cw, ch);
  x.fillStyle = '#ffffff';
  for (let r = 0; r < 9; r++) { const n = r % 2 ? 5 : 6; for (let k = 0; k < n; k++) star(x, cw * ((r % 2 ? 2 : 1) + k * 2) / 12, ch * (r + 1) / 10, sh * 0.32); }
  return c;
}
function teamsArt(home, away) {
  const c = canvas(), x = c.getContext('2d'), W = c.width, H = c.height;
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, home.colors[0]); g.addColorStop(0.46, '#05070b'); g.addColorStop(0.54, '#05070b'); g.addColorStop(1, away.colors[0]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const lh = logoCanvas(home), la = logoCanvas(away);
  x.globalAlpha = 0.95; x.drawImage(lh, W * 0.1, H * 0.18, H * 0.64, H * 0.64); x.drawImage(la, W * 0.9 - H * 0.64, H * 0.18, H * 0.64, H * 0.64);
  x.globalAlpha = 1; x.fillStyle = '#ffffff'; x.font = 'italic 900 64px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('VS', W / 2, H / 2);
  return c;
}
function glowTex() {
  const c = canvas(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// projection sur la glace qui ondule comme un drapeau, coupée aux coins arrondis de la patinoire
const PROJ_VS = `varying vec2 vUv; varying vec2 vW;
void main() { vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PROJ_FS = `uniform sampler2D map; uniform float t; uniform float op; uniform float wave; varying vec2 vUv; varying vec2 vW;
void main() {
  float ph = vUv.x * 9.0 - t * 2.4 + vUv.y * 2.5;
  vec2 uv = vUv + vec2(sin(ph * 0.5) * 0.012 * wave, sin(ph) * 0.04 * wave);
  vec4 c = texture2D(map, uv);
  float shade = 0.74 + 0.3 * sin(ph + 1.3) * wave;
  vec2 q = abs(vW) - vec2(${(RINK.L - 0.3 - RINK.R).toFixed(2)}, ${(RINK.W - 0.3 - RINK.R).toFixed(2)});
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ${RINK.R.toFixed(2)};
  float m = 1.0 - smoothstep(-0.4, 0.0, d);
  gl_FragColor = vec4(c.rgb * shade, op * m);
}`;

export class Intro {
  constructor(app, m, done) {
    this.app = app; this.m = m; this.R = app.renderer; this.audio = app.audio; this.done = done;
    this.t = 0; this.over = false; this.flags = {};
    const R = this.R, [home, away] = m.teams;
    // joueurs : état sauvegardé (remis tel quel à la fin) et état de la cérémonie
    this.saved = R.bodyList.map((b) => ({ b, x: b.x, z: b.z, vx: b.vx, vz: b.vz, face: b.face, stride: b.stride }));
    this.actors = [];
    for (const t of m.teams) {
      const dir = t.dir, sk = t.skaters.filter((b) => b.active), n = sk.length;
      const gate = { x: t.benchX, z: -RINK.W - 1.2 };
      const add = (b, i, isG) => {
        const a = { b, t, i, n, isG, x: gate.x + (isG ? 0 : (i - 2) * 0.5), z: gate.z - (isG ? 0 : 0.8 + i * 0.35), vx: 0, vz: 0,
          go: T.enter + (t.idx ? 0.25 : 0) + (isG ? 0 : 0.5 + i * 0.4), face: Math.PI / 2 };
        b.x = a.x; b.z = a.z; b.vx = b.vz = 0; b.face = a.face; b.stun = 0; b.windup = null; b.checkT = 0; b.dekeT = 0;
        if (isG) { b.down = 0; b.dive = 0; b.saveAnim = 0; }
        this.actors.push(a);
      };
      if (t.goalie && t.goalie.active) add(t.goalie, 0, true);
      sk.forEach((b, i) => add(b, i, false));
      t._ownX = -dir; // côté de sa zone (gardien) : x négatif pour l'équipe qui attaque vers +x
    }
    // effets 3D : projection qui ondule et faisceaux de lumière
    const grp = this.grp = new THREE.Group();
    this.tex = { vs: new THREE.CanvasTexture(teamsArt(home.data, away.data)), can: new THREE.CanvasTexture(flagCanada()), usa: new THREE.CanvasTexture(flagUSA()) };
    for (const k in this.tex) { this.tex[k].colorSpace = THREE.SRGBColorSpace; this.tex[k].anisotropy = 4; }
    this.proj = new THREE.Mesh(new THREE.PlaneGeometry(2 * RINK.L, 2 * RINK.W, 1, 1), new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex.vs }, t: { value: 0 }, op: { value: 0 }, wave: { value: 1 } },
      vertexShader: PROJ_VS, fragmentShader: PROJ_FS, transparent: true, depthWrite: false,
    }));
    this.proj.rotation.x = -Math.PI / 2; this.proj.position.y = 0.03; this.proj.renderOrder = 2; grp.add(this.proj);
    const gt = glowTex(), cols = [home.data.colors[0], away.data.colors[0], '#ffffff', '#35c8ff', '#ffd21f', home.data.colors[1], away.data.colors[1], '#ffffff'];
    this.pools = cols.map((c, i) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: gt, color: new THREE.Color(c), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.05; mesh.renderOrder = 3; grp.add(mesh);
      return { mesh, ph: i * 0.8 };
    });
    // projecteurs blancs sur les deux lignes bleues pendant les hymnes
    this.lines = [-1, 1].map((s) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: gt, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(s * RINK.blueX, 0.06, 0); mesh.scale.set(5, 22, 1); mesh.renderOrder = 3; grp.add(mesh);
      return mesh;
    });
    R.scene.add(grp);
    R.intro = this; R.cutCam = true;
    this.buildDom(home, away);
  }

  buildDom(home, away) {
    const el = this.el = document.createElement('div'); el.id = 'intro';
    const keys = this.app.settings.keys;
    const skip = TOUCH.on ? 'Touche l\'écran pour passer l\'intro' : `Appuie sur ${esc(keyName(keys.slap))} pour passer l'intro`;
    const side = (t) => `<span><img src="${logoCanvas(t.data).url}" alt=""><b>${esc(t.data.city)}</b><em>${esc(t.data.name)}</em></span>`;
    el.innerHTML = `<div class="itop"><small>CE SOIR · LIGUE BORÉALE</small><div class="imatch">${side(this.m.teams[1])}<i>VS</i>${side(this.m.teams[0])}</div></div>
      <div class="icap"><small></small><b></b></div>
      <div class="igk"></div>
      <div class="iskip">${skip}</div><div class="ibar"><i></i></div>`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.skip(); });
    document.body.appendChild(el);
    this.capEl = el.querySelector('.icap'); this.gkEl = el.querySelector('.igk'); this.barEl = el.querySelector('.ibar i');
    setTimeout(() => el.classList.add('on'), 30);
  }

  caption(small, big) {
    const key = small + big;
    if (this.capKey === key) return;
    this.capKey = key;
    this.capEl.classList.toggle('on', !!big);
    if (big) { this.capEl.querySelector('small').textContent = small; this.capEl.querySelector('b').textContent = big; }
  }

  goalieCard(g) {
    const key = g ? g.p.name : '';
    if (this.gkKey === key) return;
    this.gkKey = key;
    if (!g) { this.gkEl.classList.remove('on'); return; }
    const p = g.p, d = p.d || {}, a = p.a || {}, t = g.team.data;
    this.gkEl.style.setProperty('--c1', t.colors[0]); this.gkEl.style.setProperty('--c2', t.colors[1]);
    this.gkEl.innerHTML = `<img src="${logoCanvas(t).url}" alt=""><div><small>GARDIEN PARTANT · ${esc(t.city)} ${esc(t.name)}</small>
      <b>#${p.num} ${esc(p.name)}</b>
      <p><span><em>${d.ovr || '—'}</em>Cote</span><span><em>${a.ref || '—'}</em>Réflexes</span><span><em>${a.pos || '—'}</em>Placement</span><span><em>${d.age || '—'}</em>Âge</span></p></div>`;
    this.gkEl.classList.remove('on'); void this.gkEl.offsetWidth; this.gkEl.classList.add('on');
  }

  once(key, fn) { if (!this.flags[key]) { this.flags[key] = true; fn(); } }

  // une image de la cérémonie
  update(dt) {
    if (this.over) return false;
    this.t += dt;
    const t = this.t, R = this.R, au = this.audio;
    if (t >= T.end) { this.finish(); return false; }
    this.moveActors(dt);
    // lumière de l'aréna : noir, un peu de lumière pendant l'échauffement, noir pour les hymnes, puis tout se rallume
    const L = t < T.enter ? 0.12 : t < T.line ? 0.32 : t < T.gk1 ? 0.14 : 0.14 + 0.86 * smooth(T.gk1, T.end - 0.4, t);
    R.ambient.intensity = 1.5 * L; R.hemi.intensity = 1.0 * L; R.sun.intensity = 1.3 * L;
    // projection : logos, puis drapeaux
    const u = this.proj.material.uniforms;
    u.t.value = t;
    let op = 0;
    if (t < T.line) { u.map.value = this.tex.vs; u.wave.value = 0.5; op = 0.85 * smooth(0.2, 1.4, t) * (1 - smooth(T.enter + 1.5, T.enter + 3.5, t)) + 0.3 * smooth(T.enter + 3.5, T.enter + 5, t) * (1 - smooth(T.line - 1.2, T.line, t)); }
    else if (t < T.usa) { u.map.value = this.tex.can; u.wave.value = 1; op = 0.9 * smooth(T.can - 1.2, T.can + 0.6, t) * (1 - smooth(T.usa - 0.5, T.usa, t)); }
    else { u.map.value = this.tex.usa; u.wave.value = 1; op = 0.9 * smooth(T.usa, T.usa + 0.8, t) * (1 - smooth(T.gk1 + 0.3, T.gk1 + 1.6, t)); }
    u.op.value = op;
    // faisceaux de couleur qui balaient la glace (forts au début et à l'échauffement)
    const pk = (1 - smooth(T.line - 0.5, T.can, t)) * smooth(0, 0.6, t);
    this.pools.forEach((p, i) => {
      const a = t * (0.55 + i * 0.07) + p.ph;
      p.mesh.position.x = Math.sin(a * 1.3) * (RINK.L - 9); p.mesh.position.z = Math.cos(a * 0.9 + i) * (RINK.W - 5);
      const s = 7 + 2 * Math.sin(a * 2); p.mesh.scale.set(s, s, 1);
      p.mesh.material.opacity = pk * (0.45 + 0.25 * Math.sin(a * 3));
    });
    const ln = smooth(T.can - 1, T.can, t) * (1 - smooth(T.gk1 - 0.3, T.gk1 + 0.6, t));
    for (const l of this.lines) l.material.opacity = 0.32 * ln;
    // foule et sons
    if (t < T.can - 1) R.crowdEx = Math.max(R.crowdEx || 0, t > T.enter ? 1.6 : 0.6);
    this.once('roar1', () => au && au.roar && au.roar(false));
    if (t > T.enter) this.once('roar2', () => au && au.roar && au.roar(true));
    if (t > T.can) this.once('can', () => au && au.melody && au.melody(O_CANADA, 150));
    if (t > T.usa) this.once('usa', () => au && au.melody && au.melody(STAR_SPANGLED, 120));
    if (t > T.gk1 - 0.4) this.once('roar3', () => au && au.roar && au.roar(true));
    // textes à l'écran
    this.el.querySelector('.itop').classList.toggle('on', t > 0.4 && t < T.enter + 2.5);
    if (t < T.enter + 2.5) this.caption('', '');
    else if (t < T.line) this.caption('ÉCHAUFFEMENT', 'Les joueurs sautent sur la glace');
    else if (t < T.can) this.caption('AVANT LE MATCH', 'Veuillez vous lever pour les hymnes nationaux');
    else if (t < T.usa) this.caption('HYMNE NATIONAL DU CANADA', 'Ô Canada');
    else if (t < T.gk1) this.caption('HYMNE NATIONAL DES ÉTATS-UNIS', 'The Star-Spangled Banner');
    else this.caption('', '');
    const [home, away] = this.m.teams;
    this.goalieCard(t >= T.gk1 && t < T.gk2 ? away.goalie : t >= T.gk2 ? home.goalie : null);
    this.barEl.style.width = `${Math.min(100, (t / T.end) * 100)}%`;
    this.camera(t);
    return true;
  }

  // déplacement des joueurs : sortie du banc, tours dans la zone, alignement sur la ligne bleue, gardiens devant leur filet
  moveActors(dt) {
    const t = this.t;
    for (const a of this.actors) {
      const b = a.b, dir = a.t.dir, own = -dir;
      let tx, tz, settle = null;
      if (t < a.go) { tx = a.x; tz = a.z; }
      else if (a.isG) {
        const cx = own * (RINK.goalX - 1.6);
        if (t < a.go + 1.2) { tx = a.t.benchX; tz = -RINK.W + 2.5; } else { tx = cx; tz = 0; settle = dir > 0 ? 0 : Math.PI; }
      } else if (t < a.go + 0.9) { tx = a.t.benchX; tz = -RINK.W + 2.5; }
      else if (t < T.line) {
        const th = t * 1.05 + a.i * (2 * Math.PI / a.n) + a.t.idx * 1.3;
        tx = own * 16.5 + Math.cos(th) * 6.2; tz = Math.sin(th) * 6.2 * (dir > 0 ? 1 : -1);
      } else {
        tx = own * RINK.blueX - own * 0.4; tz = (a.i - (a.n - 1) / 2) * 3.1; settle = dir > 0 ? 0 : Math.PI;
      }
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      const max = a.isG ? 6.5 : 9.5, want = Math.min(max, d * 2.4);
      const k = Math.min(1, dt * 4);
      a.vx += ((d > 0.01 ? dx / d * want : 0) - a.vx) * k; a.vz += ((d > 0.01 ? dz / d * want : 0) - a.vz) * k;
      if (settle != null && d < 0.15) { a.vx *= 0.8; a.vz *= 0.8; }
      a.x += a.vx * dt; a.z += a.vz * dt;
      const sp = Math.hypot(a.vx, a.vz);
      if (sp > 0.6) a.face = Math.atan2(a.vz, a.vx);
      else if (settle != null) { let df = settle - a.face; df = Math.atan2(Math.sin(df), Math.cos(df)); a.face += df * Math.min(1, dt * 3); }
      b.x = a.x; b.z = a.z; b.vx = a.vx; b.vz = a.vz; b.face = a.face; b.stride = (b.stride || 0) + sp * dt;
      if (b.ctrl) { b.ctrl.mx = a.vx / 9; b.ctrl.mz = a.vz / 9; }
    }
  }

  // plans de caméra de la cérémonie (comme à la télé)
  camera(t) {
    const R = this.R, shot = t < T.enter ? 0 : t < T.line ? 1 : t < T.can ? 2 : t < T.usa ? 3 : t < T.gk1 ? 4 : t < T.gk2 ? 5 : 6;
    if (shot !== this.shot) { this.shot = shot; R.cutCam = true; }
    let c;
    if (shot === 0) { const a = 0.5 + t * 0.12; c = [Math.sin(a) * 34, 17, Math.cos(a) * 26, 0, 0, 0, 46]; }
    else if (shot === 1) { const k = (t - T.enter) / (T.line - T.enter); c = [-14 + 28 * k, 9.5, 21, -8 + 16 * k, 0, -2, 54]; }
    else if (shot === 2) { c = [0, 21, 29 - (t - T.line) * 1.2, 0, 0, -1, 50]; }
    else if (shot === 3) { const k = (t - T.can) / (T.usa - T.can); c = [-5 + 10 * k, 20, 25, 0, 0, -1, 52]; }
    else if (shot === 4) { const k = (t - T.usa) / (T.gk1 - T.usa); c = [6 - 10 * k, 15, 23, 0, 0, -1, 54]; }
    else {
      const g = (shot === 5 ? this.m.teams[1] : this.m.teams[0]).goalie, toC = g.team.dir, k = (t - (shot === 5 ? T.gk1 : T.gk2)) / 2.4;
      c = [g.x + toC * (5.2 - k * 0.8), 1.8, g.z + 1.4 - k * 0.6, g.x, 1.05, g.z, 42];
    }
    R.introCam = c;
  }

  skip() { if (!this.over) this.finish(); }

  // fin (ou passée) : on remet les joueurs, la lumière et la caméra comme pour la mise au jeu
  finish() {
    if (this.over) return;
    this.over = true;
    const R = this.R;
    for (const s of this.saved) Object.assign(s.b, { x: s.x, z: s.z, vx: s.vx, vz: s.vz, face: s.face, stride: s.stride });
    for (const a of this.actors) if (a.b.ctrl) { a.b.ctrl.mx = 0; a.b.ctrl.mz = 0; }
    R.ambient.intensity = 1.5; R.hemi.intensity = 1.0; R.sun.intensity = 1.3;
    R.scene.remove(this.grp);
    this.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    for (const k in this.tex) this.tex[k].dispose();
    R.intro = null; R.introCam = null; R.cutCam = true; R.lastPos = R.lastPos.map(() => null);
    if (this.audio && this.audio.stopMelody) this.audio.stopMelody();
    this.el.classList.remove('on'); setTimeout(() => this.el.remove(), 400);
    if (this.done) this.done();
  }
}
