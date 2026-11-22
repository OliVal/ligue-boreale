// Effets visuels du match : gerbes de neige, reflet de la glace, spectacle de lumière après un but,
// secousses de caméra, vitre qui vibre et traînée des lancers frappés.
// Tout est préparé une fois (aucune création d'objet pendant le jeu) pour rester fluide sur téléphone.
import * as THREE from 'three';
import { RINK } from '../core/config.js';

const MIRROR = 1;
const WARM = new THREE.Color(0xfff0cc); // calque des objets qui se reflètent dans la glace (joueurs, rondelle)

// petite image ronde et douce (neige, taches de lumière)
function softDot(size, inner = 0.15) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2;
  const gr = g.createRadialGradient(r, r, r * inner, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// anneaux concentriques (onde dans la vitre)
function ringsTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = `rgba(220,240,255,${0.9 - i * 0.2})`; g.lineWidth = 5 - i;
    g.beginPath(); g.ellipse(64, 64, 18 + i * 14, 12 + i * 10, 0, 0, Math.PI * 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// traînée blanche qui s'efface vers l'arrière (lancer frappé)
function streakTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const g = c.getContext('2d');
  const gx = g.createLinearGradient(0, 0, 128, 0);
  gx.addColorStop(0, 'rgba(120,200,255,0)'); gx.addColorStop(0.7, 'rgba(200,235,255,0.6)'); gx.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gx; g.fillRect(0, 0, 128, 16);
  const gy = g.createLinearGradient(0, 0, 0, 16);
  gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(0.5, 'rgba(0,0,0,0)'); gy.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gy; g.fillRect(0, 0, 128, 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const add = (color, opacity, map) => new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

// point de la bande le plus proche (patinoire aux coins arrondis) et direction vers l'intérieur
function boardPoint(x, z) {
  const { L, W, R } = RINK, ax = Math.abs(x), az = Math.abs(z), sx = x < 0 ? -1 : 1, sz = z < 0 ? -1 : 1;
  if (ax > L - R && az > W - R) {
    const cx = sx * (L - R), cz = sz * (W - R), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
    return { x: cx + dx / d * R, z: cz + dz / d * R, nx: -dx / d, nz: -dz / d, d: R - d };
  }
  if (L - ax < W - az) return { x: sx * L, z, nx: -sx, nz: 0, d: L - ax };
  return { x, z: sz * W, nx: 0, nz: -sz, d: W - az };
}

export class Fx {
  constructor(renderer) {
    this.R = renderer; const scene = renderer.scene;
    this.mobile = renderer.set.quality === 'mobile';
    this.g = new THREE.Group(); scene.add(this.g);
    this.shake = 0; this.shakeT = 0;

    // ---- neige : un seul nuage de points réutilisé ----
    const N = this.N = this.mobile ? 180 : 320;
    this.sp = new Float32Array(N * 3); this.sv = new Float32Array(N * 3); this.sl = new Float32Array(N); this.sl0 = new Float32Array(N).fill(1);
    this.ss = new Float32Array(N); this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sp, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(this.sl, 1));
    geo.setAttribute('sz', new THREE.BufferAttribute(this.ss, 1));
    this.snowMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot(32, 0.25) }, scale: { value: 400 } },
      vertexShader: 'attribute float life; attribute float sz; varying float vL; uniform float scale;\n' +
        'void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = life > 0.0 ? sz * scale / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying float vL;\n' +
        'void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.8,0.88,0.97), t.a * clamp(vL * 2.5, 0.0, 0.95)); }',
      transparent: true, depthWrite: false,
    });
    this.snow = new THREE.Points(geo, this.snowMat); this.snow.frustumCulled = false; this.g.add(this.snow);
    this.snowGeo = geo; this.snowOn = 0;

    // ---- spectacle de but : faisceaux qui tournent depuis le toit, taches de couleur sur la glace, lueur rouge au filet ----
    this.beams = []; this.pools = [];
    const dot = softDot(64, 0.05);
    const beamGeo = new THREE.CylinderGeometry(0.25, 3.2, 21, 18, 1, true); beamGeo.translate(0, -10.5, 0);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(beamGeo, add(0xffffff, 0.12)); b.position.y = 21; b.visible = false; this.g.add(b); this.beams.push(b);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), add(0xffffff, 0.5, dot)); p.rotation.x = -Math.PI / 2; p.position.y = 0.07; p.renderOrder = 3; p.visible = false;
      this.g.add(p); this.pools.push(p);
    }
    this.red = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), add(0xff2a1a, 0.6, dot));
    this.red.rotation.x = -Math.PI / 2; this.red.position.y = 0.08; this.red.renderOrder = 3; this.red.visible = false; this.g.add(this.red);
    this.show = null;

    // ---- vitre qui vibre ----
    this.ripples = [];
    const rt = ringsTex();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), add(0xcfeaff, 0, rt)); m.visible = false; m.t = 9; this.g.add(m); this.ripples.push(m);
    }

    // ---- traînée du lancer frappé ----
    this.streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.24), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, map: streakTex(), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.streak.visible = false; this.g.add(this.streak);

    // ---- reflet de la glace (sauf en qualité basse) ----
    this.mirror = renderer.set.quality !== 'low';
    if (this.mirror) this.buildMirror();
  }

  // Les objets qui se reflètent (joueurs, rondelle) et les lumières sont mis sur le calque du miroir
  reflect(obj) { obj.traverse((o) => o.layers.enable(MIRROR)); }

  buildMirror() {
    const R = this.R;
    this.rt = new THREE.WebGLRenderTarget(256, 128);
    this.rt.texture.colorSpace = R.r.outputColorSpace;
    this.vcam = new THREE.PerspectiveCamera(); this.vcam.layers.set(MIRROR);
    this.tm = new THREE.Matrix4();
    for (const l of [R.ambient, R.hemi, R.sun]) l.layers.enable(MIRROR);
    R.puck.layers.enable(MIRROR);
    const { L, W } = RINK;
    this.mirrorMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: this.rt.texture }, tm: { value: this.tm }, op: { value: this.mobile ? 0.3 : 0.34 }, cpos: { value: new THREE.Vector3() } },
      vertexShader: 'uniform mat4 tm; varying vec4 vUv; varying vec3 vW;\n' +
        'void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vUv = tm * w; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D tex; uniform float op; uniform vec3 cpos; varying vec4 vUv; varying vec3 vW;
        void main(){
          // coins arrondis de la patinoire
          vec2 q = abs(vW.xz) - vec2(${(L - RINK.R).toFixed(2)}, ${(W - RINK.R).toFixed(2)});
          float d = length(max(q, 0.0)) - ${RINK.R.toFixed(2)};
          if (d > 0.0) discard;
          vec4 c = texture2DProj(tex, vUv);
          // plus de reflet quand on regarde la glace de biais (comme une vraie surface lisse)
          vec3 v = normalize(cpos - vW);
          float fres = mix(0.55, 1.25, pow(1.0 - clamp(v.y, 0.0, 1.0), 2.0));
          gl_FragColor = vec4(c.rgb, c.a * op * fres);
        }`,
      transparent: true, depthWrite: false,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, 2 * W), this.mirrorMat);
    this.plane.rotation.x = -Math.PI / 2; this.plane.position.y = 0.002; this.plane.renderOrder = -1;
    this.g.add(this.plane); this.plane.updateMatrixWorld();
    this.mirrorSkip = 0;
  }

  // Dessine les joueurs vus « par en dessous » de la glace dans une petite image (le reflet), juste avant l'image principale
  renderMirror(menu) {
    if (!this.mirror) return;
    const R = this.R, cam = R.cam, r = R.r;
    const lowQ = R.set.quality === 'low'; // qualité basse choisie dans les Options : pas de reflet
    this.plane.visible = !lowQ;
    if (lowQ) return;
    // téléphone : petite image du reflet, refaite une image sur deux (c'est flou de toute façon, comme sur une vraie glace)
    if (this.mobile && (this.mirrorSkip = (this.mirrorSkip + 1) % 2) === 1) return;
    const k = this.mobile ? 0.35 : 0.5, w = Math.max(64, Math.round(R.lw * k)), h = Math.max(32, Math.round(R.lh * k));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const vc = this.vcam;
    cam.updateMatrixWorld();
    vc.position.set(cam.position.x, -cam.position.y, cam.position.z);
    const look = R.look;
    vc.up.set(0, -1, 0);
    vc.lookAt(look.x, -look.y, look.z);
    vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = cam.near; vc.far = cam.far; vc.updateProjectionMatrix();
    vc.updateMatrixWorld();
    this.tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.tm.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    this.mirrorMat.uniforms.cpos.value.copy(cam.position);
    const sc = R.scene, bg = sc.background, fog = sc.fog, old = r.getRenderTarget(), cc = r.getClearAlpha();
    const tmp = this._cc || (this._cc = new THREE.Color()); r.getClearColor(tmp);
    sc.background = null; sc.fog = null;
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear();
    r.render(sc, vc);
    r.setRenderTarget(old); r.setClearColor(tmp, cc);
    sc.background = bg; sc.fog = fog;
  }

  // ---- gerbe de neige : n flocons projetés vers (dx, dz) ----
  spray(x, z, dx, dz, n, power = 1) {
    const sp = this.sp, sv = this.sv, sl = this.sl, ss = this.ss;
    n = Math.round(n * (this.mobile ? 0.7 : 1));
    for (let j = 0; j < n; j++) {
      const i = this.next; this.next = (this.next + 1) % this.N;
      const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 1.3, v = (1.5 + Math.random() * 3.5) * power;
      sp[i * 3] = x + (Math.random() - 0.5) * 0.3; sp[i * 3 + 1] = 0.04 + Math.random() * 0.1; sp[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      sv[i * 3] = Math.cos(a) * v; sv[i * 3 + 1] = (0.8 + Math.random() * 2.2) * Math.min(1.4, power); sv[i * 3 + 2] = Math.sin(a) * v;
      sl[i] = this.sl0[i] = 0.45 + Math.random() * 0.5; ss[i] = 0.09 + Math.random() * 0.13;
    }
    this.snowOn = 1.5;
  }

  addShake(a) { this.shake = Math.max(this.shake, a); }

  // onde dans la vitre près d'une mise en échec ou d'un tir dans la baie vitrée
  ripple(x, z, power) {
    const b = boardPoint(x, z);
    if (b.d > 2) return;
    let m = this.ripples[0];
    for (const r of this.ripples) if (r.t > m.t) m = r;
    m.t = 0; m.pow = power; m.visible = true;
    m.bx = b.x + b.nx * 0.03; m.bz = b.z + b.nz * 0.03; m.nx = b.nx; m.nz = b.nz;
    m.position.set(m.bx, (RINK.boardH + RINK.glassH) / 2, m.bz);
    m.rotation.set(0, Math.atan2(b.nx, b.nz), 0);
  }

  // Début du spectacle de but : couleurs de l'équipe qui marque
  // body : le joueur qui vient de marquer (le projecteur le suit); sans lui, on éclaire le filet
  goal(team, side, body) {
    const c = team && team.data && team.data.colors ? team.data.colors : ['#ffd21f', '#ffffff'];
    const tx = body ? body.x : side * (RINK.goalX - 4), tz = body ? body.z : 0;
    this.show = { t: 0, side, body, tx, tz, c0: new THREE.Color(c[0]), c1: new THREE.Color(c[1] || '#ffffff') };
    // couleurs trop sombres : on les éclaircit (sinon on ne verrait rien sur la glace)
    for (const k of ['c0', 'c1']) { const hsl = {}; this.show[k].getHSL(hsl); if (hsl.l < 0.45) this.show[k].setHSL(hsl.h, Math.max(0.6, hsl.s), 0.55); }
    this.addShake(0.22);
  }

  stopShow() {
    this.show = null; for (const o of [...this.beams, ...this.pools, this.red]) o.visible = false;
    this.dim(0);
  }

  // l'aréna baisse ses lumières pendant le spectacle (les couleurs ressortent sur la glace)
  dim(k) {
    const R = this.R, L = [R.ambient, R.hemi, R.sun];
    if (!this.base) this.base = L.map((l) => l.intensity);
    if (k === this.dimK) return;
    this.dimK = k; L.forEach((l, i) => { l.intensity = this.base[i] * (1 - k); });
  }

  // Appelé à chaque image. live : match en direct (pas de reprise ni de menu)
  update(dt, p, live, time) {
    const R = this.R;
    // neige
    if (this.snowOn > 0) {
      this.snowOn -= dt;
      const sp = this.sp, sv = this.sv, sl = this.sl;
      for (let i = 0; i < this.N; i++) {
        if (sl[i] <= 0) continue;
        sl[i] -= dt;
        sv[i * 3 + 1] -= 9.8 * dt;
        sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
        if (sp[i * 3 + 1] < 0.02) { sp[i * 3 + 1] = 0.02; sv[i * 3] *= 0.6; sv[i * 3 + 1] = 0; sv[i * 3 + 2] *= 0.6; }
        if (sl[i] < 0) sl[i] = 0;
      }
      this.snowGeo.attributes.position.needsUpdate = true; this.snowGeo.attributes.life.needsUpdate = true; this.snowGeo.attributes.sz.needsUpdate = true;
      this.snow.visible = true;
    } else this.snow.visible = false;
    this.snowMat.uniforms.scale.value = R.lh * R.r.getPixelRatio() / (2 * Math.tan(R.cam.fov * Math.PI / 360));

    // spectacle de but
    const s = this.show;
    if (s) {
      s.t += dt;
      const T = 6.5, fade = Math.min(1, s.t * 3) * Math.min(1, (T - s.t) * 1.5);
      if (s.t > T || !live) this.stopShow();
      else {
        // le projecteur suit le marqueur pendant sa célébration
        const bd = s.body && s.body.active ? s.body : null, kf = Math.min(1, dt * 6);
        if (bd) { s.tx += (bd.x - s.tx) * kf; s.tz += (bd.z - s.tz) * kf; }
        const W = WARM;
        for (let i = 0; i < 4; i++) {
          const b = this.beams[i], pl = this.pools[i];
          if (i === 3) { b.visible = pl.visible = false; continue; }
          b.visible = pl.visible = true;
          let ax, az, px = s.tx, pz = s.tz, col, bo, po, sc;
          if (i === 0) { // projecteur principal, blanc chaud, juste au-dessus du marqueur
            ax = s.tx * 0.75; az = s.tz * 0.75 - 3; col = W; bo = 0.2; po = 0.95; sc = 0.62;
          } else { // deux faisceaux aux couleurs de l'équipe, des coins du toit, qui tournent autour de lui
            const a = s.t * 2.2 + (i === 1 ? 0 : Math.PI);
            px += Math.cos(a) * 1.8; pz += Math.sin(a) * 1.8;
            ax = (i === 1 ? -1 : 1) * 14; az = (i === 1 ? -1 : 1) * 9; col = i === 1 ? s.c0 : s.c1; bo = 0.11; po = 0.5; sc = 0.85;
          }
          b.position.set(ax, 20, az);
          b.lookAt(px, 0, pz); b.rotateX(-Math.PI / 2);
          b.scale.set(1, Math.hypot(px - ax, 20, pz - az) / 21, 1);
          b.material.color.copy(col); b.material.opacity = bo * fade;
          pl.position.x = px; pl.position.z = pz; pl.scale.setScalar(sc);
          pl.material.color.copy(col); pl.material.opacity = po * fade;
        }
        this.dim(0.6 * fade);
        const blink = Math.sin(time * 14) > -0.3;
        this.red.visible = true; this.red.position.x = s.side * (RINK.goalX + 1.5);
        this.red.material.opacity = (blink ? 0.55 : 0.2) * fade;
      }
    }

    // vitre
    for (const m of this.ripples) {
      if (!m.visible) continue;
      m.t += dt;
      if (m.t > 0.7) { m.visible = false; continue; }
      const k = m.t / 0.7, w = Math.sin(m.t * 45) * 0.05 * m.pow * (1 - k);
      m.position.x = m.bx + m.nx * w; m.position.z = m.bz + m.nz * w;
      m.scale.setScalar(0.6 + k * 0.9);
      m.material.opacity = (1 - k) * 0.8 * Math.min(1, m.pow);
    }

    // traînée du lancer frappé
    const sh = p && p.shot, spd = p ? Math.hypot(p.vx || 0, p.vz || 0) : 0;
    const on = live && sh && !p.carrier && !p.inNet && spd > 24 && sh.type === 'slap';
    this.streak.visible = !!on;
    if (on) {
      const len = Math.min(5, spd * 0.12), ux = p.vx / spd, uz = p.vz / spd;
      this.streak.scale.set(len, 1, 1);
      this.streak.position.set(p.x - ux * len / 2, Math.max(0.05, p.y + 0.03), p.z - uz * len / 2);
      this.streak.rotation.set(-Math.PI / 2, 0, Math.atan2(-uz, ux)); // à plat, dans le sens du tir
    }

    // secousse de la caméra (après sa mise en place)
    if (this.shake > 0.002) {
      this.shakeT += dt * 38;
      const a = this.shake, c = R.cam;
      c.position.x += Math.sin(this.shakeT * 1.3) * a; c.position.y += Math.sin(this.shakeT * 1.9 + 1) * a * 0.7; c.position.z += Math.sin(this.shakeT * 1.1 + 2) * a * 0.5;
      this.shake *= Math.exp(-dt * 7);
    } else this.shake = 0;
  }

  clear() { this.stopShow(); this.sl.fill(0); this.snowOn = 0; this.snow.visible = false; for (const m of this.ripples) m.visible = false; this.shake = 0; this.streak.visible = false; }
}
