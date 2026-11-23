// Rendu Three.js : scène, caméras (télé, haut, derrière le joueur, reprises), synchronisation avec la simulation
import * as THREE from 'three';
import { RINK } from '../core/config.js';
import { clamp } from '../core/util.js';
import { buildArena, updateCrowd, updateTowels, addMark, wipeMarks } from './rinkgfx.js';
import { makePlayer, poseSkater, poseGoalie, setNumber, setLook, compactPlayer } from './playergfx.js';
import { Fx } from './fx.js';

const CAMS = ['tv', 'top', 'behind'];
export const CAM_NAMES = { tv: 'Diffusion', top: 'Vue de haut', behind: 'Derrière le joueur', goalie: 'Derrière le gardien' };

import { getLook, kitFor, logoCanvas } from '../data/kit.js';

const PV = new THREE.Vector3();
const SH_M = new THREE.Matrix4(), SH_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), SH_V = new THREE.Vector3(), SH_S = new THREE.Vector3();

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas; this.set = settings;
    // qualité « mobile » : image nette (jusqu'à 2 fois la définition de l'écran, contours lissés); un téléphone modeste
    // (peu de mémoire ou de cœurs) commence plus bas. La définition s'ajuste ensuite toute seule (voir adapt).
    this.prMax = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ? 1.25 : 2;
    this.prCap = this.prMax; this.slowT = 0; this.fastT = 0;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
    this.setQuality(settings.quality);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090d);
    this.scene.fog = new THREE.Fog(0x07090d, 80, 160);
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.5, 300);
    this.ambient = new THREE.AmbientLight(0xffffff, 1.5); this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x8090a8, 1.0); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(8, 30, 14); this.scene.add(sun);
    this.camMode = 'tv'; this.fx = 0; this.fz = 0; this.menuT = 0;
    this.look = new THREE.Vector3(); this.cpos = new THREE.Vector3(0, 16, 27); this.cutCam = true;
    this.basis = { rx: 1, rz: 0, fx: 0, fz: -1 };
    this.arena = null; this.bodyList = []; this.pms = []; this.lastPos = []; this.match = null;
    this.goalFlash = 0; this.goalSide = 0; this.crowdEx = 0;
    // rondelle, ombre, halo et traînée
    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 14), new THREE.MeshLambertMaterial({ color: 0x0b0b0d }));
    const flat = (geo, color, opacity) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); m.rotation.x = -Math.PI / 2; return m; };
    this.puckShadow = flat(new THREE.CircleGeometry(0.14, 12), 0x000000, 0.35);
    this.puckHalo = flat(new THREE.RingGeometry(0.2, 0.32, 24), 0xffe14a, 0.7); // halo plus large et plus vif (rondelle visible sur petit écran)
    this.trail = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.07), new THREE.MeshBasicMaterial({ color: 0x1a2a44, transparent: true, opacity: 0.3, depthWrite: false }));
    this.scene.add(this.puck, this.puckShadow, this.puckHalo, this.trail);
    // indicateurs du joueur contrôlé et du receveur
    this.ring = flat(new THREE.RingGeometry(0.55, 0.72, 28), 0xffd21f, 0.95);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    this.arrow.rotation.x = Math.PI;
    this.tRing = flat(new THREE.RingGeometry(0.5, 0.58, 24), 0x6fd3ff, 0.8);
    this.scene.add(this.ring, this.arrow, this.tRing);
    // où est la rondelle (vert lime : couleur qu'aucune équipe ne porte) : flèche au-dessus d'elle quand elle est libre, au-dessus du porteur sinon,
    // et anneau vert qui pulse sous le joueur qui la porte (peu importe l'équipe)
    this.puckMark = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 4), new THREE.MeshBasicMaterial({ color: 0x66ff33 }));
    this.puckMark.rotation.x = Math.PI;
    this.cRing = flat(new THREE.RingGeometry(0.76, 0.95, 32), 0x66ff33, 0.85);
    this.scene.add(this.puckMark, this.cRing);
    this.resize();
    this.efx = new Fx(this); // neige, reflet de la glace, spectacle de but, secousses, vitre, traînée des lancers frappés
    this.lastSp = []; this.snowT = [];
  }

  setQuality(q) {
    this.r.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : q === 'mobile' ? Math.min(devicePixelRatio, this.prCap || 2) : Math.min(devicePixelRatio, 2));
  }

  // Qualité « mobile » : définition ajustée selon la fluidité (appelé deux fois par seconde pendant un match).
  // Baisse seulement si le téléphone peine vraiment (sous 40 images/s pendant 5 s, sans jamais descendre sous 1),
  // remonte quand tout redevient fluide (55 images/s ou plus pendant 6 s). Un plafond à 30 images/s (mode économie
  // d'énergie de l'iPhone) ne fait pas baisser l'image : réduire la définition n'y changerait rien.
  adapt(fps, dt) {
    if (this.set.quality !== 'mobile') return;
    const capped30 = fps > 27 && fps < 33;
    if (fps < 40 && !capped30) { this.slowT += dt; this.fastT = 0; } else if (fps >= 55) { this.fastT += dt; this.slowT = 0; } else { this.slowT = 0; this.fastT = 0; }
    const cur = Math.min(devicePixelRatio, this.prCap);
    // téléphone qui peine : on enlève d'abord le reflet de la glace (avant de baisser la netteté)
    if (this.slowT >= 5 && this.efx.mirror) { this.efx.mirror = false; this.efx.plane.visible = false; this.slowT = 0; return; }
    if (this.slowT >= 5 && cur > 1.01) { this.prCap = Math.max(1, cur - 0.25); this.slowT = 0; this.setQuality('mobile'); this.resize(); }
    else if (this.fastT >= 6 && this.prCap < this.prMax && cur < devicePixelRatio) { this.prCap = Math.min(this.prMax, cur + 0.25); this.fastT = 0; this.setQuality('mobile'); this.resize(); }
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.lw = w; this.lh = h;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  // la taille réelle de l'écran a changé (plein écran, rotation…) sans événement fiable : on la reprend à chaque image
  checkSize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (w !== this.lw || h !== this.lh)) this.resize();
  }

  nextCamera() {
    const list = this.goalieCam ? ['goalie', ...CAMS] : CAMS; // la vue du gardien n'existe qu'en carrière de gardien
    this.camMode = list[(list.indexOf(this.camMode) + 1) % list.length]; this.cutCam = true; return this.camMode;
  }

  setMatch(m) {
    this.match = m;
    if (this.arena) {
      this.scene.remove(this.arena.group);
      this.arena.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    }
    // joueurs de l'ancien match : on libère aussi leur mémoire graphique (sinon chaque match, et chaque démo du menu, en ajoute)
    const done = new Set(), free = (x) => { if (x && !done.has(x)) { done.add(x); x.dispose(); } };
    for (const pm of this.pms) {
      this.scene.remove(pm.outer); this.scene.remove(pm.shadow);
      for (const root of [pm.outer, pm.shadow]) root.traverse((o) => { free(o.geometry); for (const mt of [].concat(o.material || [])) { free(mt.map); free(mt); } });
    }
    if (this.shInst) { this.scene.remove(this.shInst); this.shInst.geometry.dispose(); this.shInst.material.dispose(); this.shInst = null; }
    this.bodyList = []; this.pms = []; this.lastPos = [];
    // objets débloqués (this.cos = { team, stick, gloves, celeb, rink }) : patinoire spéciale, bâtons et gants de l'équipe du joueur
    const cos = this.cos, hd = m.teams[0].data;
    this.arena = buildArena(this.scene, cos && cos.rink ? { ...hd, look: { ...getLook(hd), ice: cos.rink.ice, boards: cos.rink.boards } } : hd, this.set.quality);
    const shGeo = new THREE.CircleGeometry(0.55, 14);
    const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    for (const t of m.teams) {
      const kit = kitFor(t.data, t.idx === this.retroIdx ? (this.retroVar || 'retro') : t.idx === 0 ? 'home' : 'away', m.teams[0].data.colors[0]);
      kit.logo = logoCanvas(t.data);
      for (const b of [...t.skaters, t.goalie]) {
        const pm = makePlayer(kit, b.isGoalie, b.id);
        if (cos && cos.team === t.idx) { pm.shaftMat.color.set(cos.stick); if (!b.isGoalie) pm.glove.color.set(cos.gloves); } 
        const mob = this.set.quality === 'mobile';
        if (mob || pm.hd) compactPlayer(pm); // moins de dessins par image (téléphone, et toujours pour le style « Nouveau »)
        this.efx.reflect(pm.outer); // le joueur se reflète dans la glace
        // qualité mobile : les ombres sont dessinées toutes ensemble (une seule forme répétée), voir syncShadows
        pm.shadow = mob ? new THREE.Object3D() : new THREE.Mesh(shGeo, shMat); pm.shadow.rotation.x = -Math.PI / 2; pm.shadow.position.y = 0.012;
        if (mob) this.scene.add(pm.outer); else this.scene.add(pm.outer, pm.shadow);
        this.bodyList.push(b); this.pms.push(pm); this.lastPos.push(null);
      }
    }
    if (this.set.quality === 'mobile') {
      this.shInst = new THREE.InstancedMesh(shGeo, shMat, this.pms.length);
      this.shInst.frustumCulled = false; this.scene.add(this.shInst);
    } else if (!this.pms.length) { shGeo.dispose(); shMat.dispose(); }
    this.goalFlash = 0; this.crowdEx = 0; this.cutCam = true; this.star = null;
    this.efx.clear(); this.lastSp = []; this.snowT = [];
    const fx = this.efx, mine = (b) => b && (b === m.userBody || (m.lockPl && b.p === m.lockPl));
    m.on((type, d) => {
      if (type === 'goal' || (type === 'attemptEnd' && d.result === 'goal')) {
        this.goalFlash = 6; this.goalSide = d.s || (d.team ? d.team.dir : 1);
        this.crowdEx = d.team && d.team.idx === 0 ? 2.6 : 0.5; // la foule appuie l'équipe locale
        this.goalHome = !d.team || d.team.idx === 0;
        if (type === 'goal') fx.goal(d.team, this.goalSide, d.scorer ? this.bodyList.find((q) => q.p === d.scorer && q.active) : null); // projecteur sur le marqueur, lueur rouge, secousse
      } else if (type === 'hit' && !d.weak) {
        this.crowdEx = Math.max(this.crowdEx, d.big ? 1.0 : 0.5);
        // mise en échec : éclat de glace, secousse (plus forte si ton joueur est impliqué), vitre qui vibre près de la bande
        const o = d.on, a = d.by, dx = o.x - a.x, dz = o.z - a.z;
        if (!d.illegal) fx.spray(o.x, o.z, dx || 1, dz, d.big ? 18 : 9, d.big ? 1.3 : 0.9);
        fx.addShake((d.big ? 0.13 : 0.06) * (mine(a) || mine(o) ? 1.6 : 1));
        fx.ripple(o.x, o.z, d.big ? 1.3 : 0.8);
      } else if (type === 'board' && (d.glass || d.v > 16)) fx.ripple(m.puck.x, m.puck.z, Math.min(1.2, d.v / 22));
      else if (type === 'shot' && d.type === 'slap') { // lancer frappé : éclats de glace sous la rondelle, petite secousse
        fx.spray(m.puck.x, m.puck.z, m.puck.vx, m.puck.vz, 10, 1.1);
        if (mine(d.by)) fx.addShake(0.05);
      }
      else if (type === 'save') this.crowdEx = Math.max(this.crowdEx, d.goalie.team.idx === 0 ? 0.9 : 0.45);
      else if (type === 'post' || type === 'breakaway') this.crowdEx = Math.max(this.crowdEx, 0.9);
      else if (type === 'fightStart') this.crowdEx = 1.6;
      else if (type === 'periodStart') wipeMarks(this.arena.marks, Infinity);
    });
  }

  // Place la caméra avec lissage (sauf lors d'une coupe)
  aim(px, py, pz, lx, ly, lz, fov, dt, rate = 4) {
    const cam = this.cam, k = this.cutCam ? 1 : Math.min(1, rate * dt);
    this.cpos.x += (px - this.cpos.x) * k; this.cpos.y += (py - this.cpos.y) * k; this.cpos.z += (pz - this.cpos.z) * k;
    this.look.x += (lx - this.look.x) * k; this.look.y += (ly - this.look.y) * k; this.look.z += (lz - this.look.z) * k;
    this.cutCam = false;
    cam.position.copy(this.cpos); cam.lookAt(this.look);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // Distance de la caméra (Options) : « rapprochée » resserre le cadre d'environ 25 % (joueurs plus gros).
  // « Automatique » : rapprochée sur un téléphone (petit écran tactile), normale ailleurs.
  zoomK() {
    const z = this.set.camZoom || 'auto';
    const close = z === 'close' || (z === 'auto' && document.body.classList.contains('touch') && Math.min(innerWidth, innerHeight) < 520);
    return close ? 0.74 : 1;
  }

  updateCamera(m, p, dt, menu) {
    // Carrière de patineur : la caméra suit TON joueur (pas la rondelle). Si la rondelle sort de l'image,
    // la caméra recule et se recentre entre lui et la rondelle (this.zo de 0 à 1); une flèche au bord de l'écran indique où elle est.
    const ub0 = m.userBody && m.userBody.active ? m.userBody : null;
    const follow = !menu && !!m.lockPl && m.lockPl.pos !== 'G' && !!ub0 && !ub0.isGoalie;
    if (follow !== this.follow) { this.follow = follow; if (!follow) this.zo = 0; }
    const zo = follow ? this.zo || 0 : 0, wide = 1 + 0.42 * zo;
    let tx = p.x, tz = p.z;
    if (follow) { const w = 0.1 + 0.4 * zo; tx = ub0.x + (p.x - ub0.x) * w; tz = ub0.z + (p.z - ub0.z) * w; }
    const k = Math.min(1, (follow ? 4.5 : 3.2) * dt);
    this.fx += (tx - this.fx) * k; this.fz += (tz - this.fz) * k;
    if (menu) {
      this.menuT += dt * 0.08;
      const a = this.menuT;
      this.aim(Math.sin(a) * 34, 13 + Math.sin(a * 0.7) * 3, Math.cos(a) * 30, this.fx * 0.5, 0, this.fz * 0.3, 40, dt, 20);
      return;
    }
    const mode = this.camMode, zk = this.zoomK();
    if (mode === 'tv') {
      // en suivant le joueur, le cadre glisse aussi de haut en bas (sinon il sortirait de l'image près des bandes)
      const lz = follow ? this.fz * 0.75 - 1.2 : this.fz * 0.3 - 1.2;
      this.aim(clamp(this.fx * 0.82, -21, 21), 16.5, 27.5 + (follow ? this.fz * 0.35 : 0), clamp(this.fx * 0.96, -25, 25), 0, lz, 34 * zk * wide, dt, 20);
      this.basis = { rx: 1, rz: 0, fx: 0, fz: -1 };
    } else if (mode === 'top') {
      const x = clamp(this.fx * 0.75, -17, 17);
      this.aim(x, 37, 9, x, 0, 0.5, 40 * zk * Math.min(wide, 1.15), dt, 20);
      this.basis = { rx: 1, rz: 0, fx: 0, fz: -1 };
    } else if (mode === 'goalie') {
      // Derrière le gardien, bas : on voit son dos, le filet et le jeu qui arrive devant
      const ut = m.teams[m.userTeam != null ? m.userTeam : 0], s = -ut.dir, gl = ut.goalie;
      const gz = gl && gl.active ? gl.z : 0;
      const dist = Math.abs(this.fx - s * RINK.goalX);
      const far = clamp((dist - 18) / 30, 0, 1); // jeu à l'autre bout : on monte un peu pour voir par-dessus
      // gardien derrière son filet (il va jouer la rondelle) : la caméra monte et recule au-dessus de la bande du fond
      // pour bien le voir avec la rondelle; le haut de l'écran reste vers le centre de la glace (mêmes directions au joystick)
      const gfx = gl && gl.active ? (gl.x - s * RINK.goalX) * -s : 1;
      this.gkBack = (this.gkBack || 0) + (clamp((0.2 - gfx) / 1.2, 0, 1) - (this.gkBack || 0)) * Math.min(1, dt * 2.5);
      const b = this.gkBack, gx = gl && gl.active ? gl.x : s * RINK.goalX;
      const cx = s * (RINK.L - 0.6 + b * 3.4), cy = 2.5 + far * 1.6 + b * 7.5;
      const lx = (s * RINK.goalX - s * clamp(dist * 0.55, 7, 22)) * (1 - b) + (gx - s * 2.2) * b;
      // la caméra suit le gardien de côté (il reste toujours dans l'image, même en plongeon)
      this.aim(cx, cy, gz * 0.8, lx, 0.35 * (1 - b), gz * (0.45 + 0.4 * b) + this.fz * 0.3 * (1 - b), 66 - b * 8, dt, 6);
      this.basis = { rx: 0, rz: -s, fx: -s, fz: 0 };
    } else {
      // Derrière l'équipe du joueur, dans son sens d'attaque : la caméra suit la rondelle (pas le joueur),
      // d'un peu plus haut et plus loin pour garder les joueurs autour dans l'image.
      const ut = m.teams[m.userTeam != null ? m.userTeam : 0];
      const dir = ut.dir, ub = m.userBody && m.userBody.active ? m.userBody : null;
      let fx = this.fx, fz = this.fz;
      if (!follow && ub && Math.hypot(ub.x - fx, ub.z - fz) < 14) { fx = fx * 0.8 + ub.x * 0.2; fz = fz * 0.8 + ub.z * 0.2; } // un peu vers son joueur s'il est proche
      const BACK = 17 + zo * 5, AHEAD = 5, SAFE = RINK.L - 2, MAXX = RINK.L + 8;
      let cx = fx - dir * BACK;
      // Près des bouts, la caméra passe au-dessus des gradins (spectateurs jusqu'à environ 8,7 m de haut) :
      // plus elle recule derrière la bande, plus elle monte, pour que personne ne bouche la vue.
      const over = Math.max(0, Math.abs(cx) - SAFE);
      cx = clamp(cx, -MAXX, MAXX);
      const cy = Math.min(14.5 + zo * 3, 10 + zo * 3 + over * 0.45);
      const ahead = Math.max(0, AHEAD - over * 0.5);
      // le point visé reste sur la glace (sinon, en zone adverse profonde, on fixerait les gradins du fond)
      const lx = clamp(fx + dir * ahead, -(RINK.L - 3), RINK.L - 3);
      this.aim(cx, cy, fz * 0.5, lx, 0, fz * 0.8, 58 * (1 - (1 - zk) * 0.5) * Math.min(wide, 1.25), dt, 5);
      this.basis = { rx: 0, rz: dir, fx: dir, fz: 0 };
    }
    this.ptr = null;
    if (follow) { // la rondelle est-elle dans l'image ?
      const v = PV.set(p.x, Math.max(0, p.y), p.z).project(this.cam);
      const behind = v.z > 1, e = behind ? 9 : Math.max(Math.abs(v.x), Math.abs(v.y));
      this.zo = clamp(zo + (e > 0.8 ? dt * 1.4 : e < 0.5 ? -dt * 0.45 : 0), 0, 1);
      if (e > 0.94) this.ptr = behind ? { x: -v.x || 0.001, y: -v.y } : { x: v.x, y: v.y };
    }
  }

  // Flèche au bord de l'écran vers la rondelle quand elle est hors de l'image (carrière de patineur)
  pointer(show) {
    if (typeof document === 'undefined') return;
    let el = this.ptrEl;
    if (!el) {
      const hud = document.getElementById('hud');
      if (!hud) return;
      el = this.ptrEl = document.createElement('div'); el.id = 'puckPtr';
      el.innerHTML = '<i></i><b></b>'; hud.appendChild(el);
    }
    const q = show && this.ptr;
    el.classList.toggle('on', !!q);
    if (!q) return;
    const W = this.lw || innerWidth, H = this.lh || innerHeight;
    const dx = q.x * W / 2, dy = -q.y * H / 2, mx = W / 2 - 46, my = H / 2 - 46;
    const s = 1 / Math.max(Math.abs(dx) / mx, Math.abs(dy) / my, 1e-6);
    el.style.transform = `translate(${W / 2 + dx * s}px, ${H / 2 + dy * s}px)`;
    el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }

  // Caméras de reprise : derrière le filet, au ras de la glace, gros plan
  replayCamera(shot, spec, p, dt) {
    const s = spec.s || 1;
    if (shot !== this.lastShot) { this.lastShot = shot; this.cutCam = true; }
    if (shot.cam === 'net') this.aim(s * (RINK.goalX + 5.5), 4.6, clamp(p.z * 0.25, -3, 3) + 2.5, p.x, 0.5, p.z, 38, dt, 5);
    else if (shot.cam === 'low') this.aim(clamp(p.x - s * 8, -24, 24), 1.7, 11.2, p.x, 0.6, p.z, 30, dt, 4);
    else this.aim((spec.x || p.x) + 4, 3, (spec.z || p.z) + 8, spec.x || p.x, 0.9, spec.z || p.z, 28, dt, 6);
  }

  // Présentation d'une étoile du match : le joueur salue la foule au centre de la glace
  showStar(m, entry, dt) {
    this.checkSize();
    const t = entry.team, isG = entry.pl.pos === 'G';
    const want = isG ? t.goalie : t.skaters[0];
    const time = performance.now() / 1000;
    const a = time * 0.9;
    const fake = { x: Math.cos(a) * 3.2, z: Math.sin(a) * 3.2, vx: -Math.sin(a) * 3, vz: Math.cos(a) * 3, face: a + Math.PI / 2, stun: 0, checkT: 0,
      stride: time * 3, windup: null, shotAnim: 0, down: 0, saveAnim: 0, saveSide: 0, p: entry.pl };
    for (let i = 0; i < this.pms.length; i++) {
      const pm = this.pms[i], on = this.bodyList[i] === want;
      pm.outer.visible = pm.shadow.visible = on;
      if (!on) continue;
      setNumber(pm.numTex, entry.pl.num, entry.pl.name); setLook(pm, entry.pl);
      if (isG) poseGoalie(pm, fake); else poseSkater(pm, fake, time, 1);
      pm.shadow.position.x = fake.x; pm.shadow.position.z = fake.z;
    }
    this.puck.visible = this.puckShadow.visible = this.puckHalo.visible = this.trail.visible = false;
    this.ring.visible = this.arrow.visible = this.tRing.visible = false;
    this.puckMark.visible = this.cRing.visible = false;
    this.crowdEx = 1.5;
    updateCrowd(this.arena.crowd, time, this.crowdEx);
    if (this.star !== entry) { this.star = entry; this.cutCam = true; }
    this.aim(fake.x * 0.4 + 5.5, 2.4, fake.z * 0.4 + 7, fake.x, 1.1, fake.z, 30, dt, 3);
    this.syncShadows();
    this.r.render(this.scene, this.cam);
  }

  // m : match; snap : image de reprise (ou null pour le direct); rp : { shot, spec } pendant une reprise
  // Ombres des joueurs en qualité mobile : une seule forme répétée (un seul dessin au lieu d'un par joueur)
  syncShadows() {
    const inst = this.shInst;
    if (!inst) return;
    const mt = SH_M, q = SH_Q, v = SH_V, s = SH_S;
    this.pms.forEach((pm, i) => {
      const sh = pm.shadow, on = sh.visible && pm.outer.visible;
      v.set(sh.position.x, sh.position.y, sh.position.z); s.setScalar(on ? 1 : 0);
      mt.compose(v, q, s); inst.setMatrixAt(i, mt);
    });
    inst.instanceMatrix.needsUpdate = true;
  }

  update(m, dt, menu = false, snap = null, rp = null) {
    this.checkSize();
    if (!m) return;
    const live = !snap;
    const src = snap ? snap.bodies : this.bodyList;
    const p = snap ? snap.puck : m.puck;
    const time = snap ? snap.time : m.time;
    const cel = snap ? snap.cel : (this.celOverride || (m.state === 'goal' ? m.lastGoal : null)); // celOverride : remise de la coupe
    const marks = this.arena.marks;
    // entracte : les joueurs rentrent au vestiaire pendant que la glace est refaite
    const inter = live && m.state === 'intermission' && m.period < 3 && m.mode === 'game';
    this.arena.cube.visible = !!this.introCube && !menu; // le cube n'apparaît que pendant la cérémonie (il ne bouche jamais la vue en match)
    for (let i = 0; i < this.pms.length; i++) {
      const b = src[i], pm = this.pms[i];
      const vis = (snap ? b.active : (b.active && !!b.p)) && !inter;
      pm.outer.visible = vis; pm.shadow.visible = vis;
      if (!vis) { this.lastPos[i] = null; continue; }
      setNumber(pm.numTex, b.p.num, b.p.name); setLook(pm, b.p, !!(m.set && m.set.playoff)); // séries : barbes
      if (b.isGoalie) poseGoalie(pm, b);
      else poseSkater(pm, b, time, cel && cel.team === b.team ? (cel.scorer === b.p ? 2 : 1) : 0, this.cos && this.cos.team === b.team.idx ? this.cos.celeb : null);
      pm.shadow.position.x = b.x; pm.shadow.position.z = b.z;
      // traces de patins (en direct seulement)
      if (live && !menu && dt > 0 && !b.isGoalie) {
        const lp = this.lastPos[i];
        if (!lp) this.lastPos[i] = { x: b.x, z: b.z };
        else {
          const d = Math.hypot(b.x - lp.x, b.z - lp.z);
          if (d > 3) { lp.x = b.x; lp.z = b.z; } // téléportation (mise au jeu)
          else if (d > 0.35) {
            const sp = Math.hypot(b.vx, b.vz);
            const turn = sp > 3 ? Math.abs(b.ctrl.mx * b.vz - b.ctrl.mz * b.vx) / sp : 0; // virage serré ou freinage
            addMark(marks, lp.x, lp.z, b.x, b.z, turn > 0.8 || b.stun > 0);
            lp.x = b.x; lp.z = b.z;
          }
        }
        // gerbe de neige : freinage sec, ou virage très serré à pleine vitesse
        // (on compare à la vitesse d'il y a environ un quart de seconde : seul un vrai arrêt compte, pas les petites variations)
        const sp = Math.hypot(b.vx, b.vz), prev = this.lastSp[i] == null ? sp : this.lastSp[i];
        this.lastSp[i] = prev + (sp - prev) * Math.min(1, dt * 4); this.snowT[i] = (this.snowT[i] || 0) - dt;
        if (this.snowT[i] <= 0 && !inter) {
          if (prev > (b === m.userBody ? 5 : 6) && prev - sp > (b === m.userBody ? 2.8 : 3.7)) { // arrêt : la neige part devant, dans le sens de la glisse
            const ux = b.vx / (sp || 1), uz = b.vz / (sp || 1), f = b.face;
            this.efx.spray(b.x + Math.cos(f) * 0.25, b.z + Math.sin(f) * 0.25, sp > 0.5 ? ux : Math.cos(f), sp > 0.5 ? uz : Math.sin(f), 9, Math.min(1.5, prev / 6));
            this.snowT[i] = 0.45;
          } else if (sp > 6.5 && b.ctrl) {
            const turn = Math.abs(b.ctrl.mx * b.vz - b.ctrl.mz * b.vx) / sp;
            if (turn > 0.93) { // virage serré : la neige part vers l'extérieur du virage
              const side = b.ctrl.mx * b.vz - b.ctrl.mz * b.vx > 0 ? 1 : -1;
              this.efx.spray(b.x, b.z, side * b.vz / sp, -side * b.vx / sp, 3, 0.8);
              this.snowT[i] = 0.15;
            }
          }
        }
      } else this.lastSp[i] = null;
    }
    if (marks.dirty) { marks.t += dt; if (marks.t > 0.35 || !live) { marks.t = 0; marks.dirty = false; marks.tex.needsUpdate = true; } }
    // resurfaçage pendant l'entracte
    const zs = this.arena.zambonis;
    for (let i = 0; i < zs.length; i++) zs[i].visible = inter;
    if (inter) {
      const k = clamp(1 - m.stateT / (m.interLen || 4), 0, 1), x = -RINK.L + 1 + k * (2 * RINK.L - 2);
      wipeMarks(marks, x);
      zs[0].position.set(x, 0, -6 + Math.sin(k * 20) * 5); zs[1].position.set(x - 2.5, 0, 6 + Math.sin(k * 20 + 2) * 5);
      zs[0].rotation.y = zs[1].rotation.y = Math.PI / 2;
    }
    // rondelle
    this.puck.visible = this.puckShadow.visible = !inter;
    this.puck.position.set(p.x, p.y + 0.025, p.z);
    this.puck.scale.set(1.35, 1.5, 1.35); // un peu plus grosse que la vraie, pour bien la voir
    const free = snap ? !p.carrier : !m.puck.carrier;
    if (p.rolling > 0 && free) { this.puck.rotation.set(Math.PI / 2, 0, p.spin); this.puck.position.y += 0.08; }
    else this.puck.rotation.set(0, p.spin * 0.3, 0);
    this.puckShadow.position.set(p.x, 0.011, p.z);
    this.puckShadow.scale.setScalar(1 + p.y * 0.4);
    this.puckHalo.position.set(p.x, 0.013, p.z);
    this.puckHalo.visible = live && !menu && !p.inNet && !inter;
    this.puckHalo.material.opacity = free ? 0.85 : 0.4;
    this.puckHalo.scale.setScalar(free ? 1 + 0.18 * Math.sin(time * 7) : 1); // rondelle libre : le halo pulse
    const psp = Math.hypot(p.vx || 0, p.vz || 0);
    this.trail.visible = free && psp > 15 && !p.inNet;
    if (this.trail.visible) {
      const len = Math.min(2.2, psp * 0.05);
      this.trail.scale.x = len; this.trail.rotation.y = -Math.atan2(p.vz, p.vx);
      this.trail.position.set(p.x - (p.vx / psp) * len / 2, p.y + 0.03, p.z - (p.vz / psp) * len / 2);
    }
    // indicateurs
    const ub = live && !menu && !inter && m.userBody && m.userBody.active ? m.userBody : null;
    this.ring.visible = this.arrow.visible = !!ub;
    if (ub) {
      this.ring.position.set(ub.x, 0.014, ub.z);
      this.arrow.position.set(ub.x, 2.25 + Math.sin(time * 5) * 0.08, ub.z);
      this.ring.material.color.setHex(ub.p.stamina < 0.25 ? 0xff5533 : 0xffd21f);
    }
    // rondelle : flèche au-dessus (libre) ou au-dessus du porteur, anneau sous le porteur
    const car = live && !menu && !inter && !snap && m.puck.carrier && m.puck.carrier.active ? m.puck.carrier : null;
    const markOn = live && !menu && !inter && !p.inNet && (free || (car && car !== ub));
    this.puckMark.visible = markOn;
    if (markOn) {
      const bob = Math.sin(time * 5) * 0.06;
      if (free) this.puckMark.position.set(p.x, p.y + 0.75 + bob, p.z);
      else this.puckMark.position.set(car.x, 2.35 + bob, car.z);
    }
    this.cRing.visible = !!car;
    if (car) {
      this.cRing.position.set(car.x, 0.015, car.z);
      this.cRing.material.opacity = 0.6 + 0.3 * Math.sin(time * 6);
      this.cRing.scale.setScalar(car.isGoalie ? 1.15 : 1);
    }
    const mp = m.puck;
    const pt = live && !menu && mp.pass && mp.pass.to && mp.pass.to.team.isUser ? mp.pass.to : null;
    this.tRing.visible = !!pt && pt !== ub;
    if (pt) this.tRing.position.set(pt.x, 0.013, pt.z);
    // lumière de but, ambiance et foule
    if (live) { if (this.goalFlash > 0) this.goalFlash -= dt; this.crowdEx = Math.max(0, this.crowdEx - dt * 0.45); }
    const flash = snap ? !!snap.cel : this.goalFlash > 0;
    const blink = Math.sin(time * 14) > -0.3;
    // fond du filet qui se gonfle puis ondule quand la rondelle le frappe
    if (!snap && p.netHit && p.netHit !== this.netHitSeen) { this.netHitSeen = p.netHit; this.bulge = { s: p.inNet, a: clamp(p.netHitV * 0.012, 0.06, 0.28), t: 0 }; }
    if (this.bulge) this.bulge.t += dt;
    for (const n of this.arena.nets) {
      const bg = this.bulge && this.bulge.s === n.s ? this.bulge : null;
      const off = bg ? bg.a * Math.exp(-bg.t * 5) * Math.cos(bg.t * 16) : 0;
      n.back.position.x = n.s * (RINK.netD + Math.max(-0.05, off));
      const on = flash && n.s === this.goalSide && blink;
      n.lamp.material.color.setHex(on ? 0xff2a1a : 0x4a0a0a);
      n.light.intensity = on ? 60 : 0;
    }
    this.ambient.color.setRGB(1, flash && blink ? 0.86 : 1, flash && blink ? 0.86 : 1);
    // séries : la foule est debout plus souvent et plus excitée
    const poK = m.set && m.set.playoff ? 1.4 : 1, exBase = m.set && m.set.playoff && !menu ? 0.7 : 0;
    updateCrowd(this.arena.crowd, performance.now() / 1000, snap ? (snap.cel ? 2 : 0.4) * poK : Math.max(exBase, this.crowdEx * poK));
    // serviettes : pendant la cérémonie d'avant-match des séries et après un but de l'équipe locale en séries
    updateTowels(this.arena.crowd, performance.now() / 1000, ((!!(m.set && m.set.playoff) && !menu && (!!this.introCam || (this.goalFlash > 0 && this.goalHome) || !!(snap && snap.cel))) || !!this.cupOn));
    if (this.introCam) { // cérémonie d'avant-match : sa propre caméra, sans rondelle ni indicateurs
      const c = this.introCam; this.aim(c[0], c[1], c[2], c[3], c[4], c[5], c[6], dt, 20);
      this.puck.visible = this.puckShadow.visible = this.puckHalo.visible = this.trail.visible = false;
      this.ring.visible = this.arrow.visible = this.tRing.visible = this.puckMark.visible = this.cRing.visible = false;
    } else if (rp) this.replayCamera(rp.shot, rp.spec, p, dt); else { if (this.lastShot) this.cutCam = true; this.lastShot = null; this.updateCamera(m, p, dt, menu); }
    this.pointer(live && !menu && !rp && !this.introCam && this.follow && m.state !== 'goal');
    this.efx.update(dt, live ? m.puck : p, live && !menu && !rp && !this.introCam, time); // effets (et secousse de la caméra)
    this.efx.renderMirror(); // reflet des joueurs dans la glace
    this.syncShadows();
    this.r.render(this.scene, this.cam);
  }
}
