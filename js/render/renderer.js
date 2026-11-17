// Rendu Three.js : scène, caméras (télé, haut, derrière le joueur, reprises), synchronisation avec la simulation
import * as THREE from 'three';
import { RINK } from '../core/config.js';
import { clamp } from '../core/util.js';
import { buildArena, updateCrowd, addMark, wipeMarks } from './rinkgfx.js';
import { makePlayer, poseSkater, poseGoalie, setNumber, setLook } from './playergfx.js';

const CAMS = ['tv', 'top', 'behind'];
export const CAM_NAMES = { tv: 'Diffusion', top: 'Vue de haut', behind: 'Derrière le joueur' };

import { getLook, kitFor, logoCanvas } from '../data/kit.js';

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas; this.set = settings;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
    this.setQuality(settings.quality);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090d);
    this.scene.fog = new THREE.Fog(0x07090d, 80, 160);
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.5, 300);
    this.ambient = new THREE.AmbientLight(0xffffff, 1.5); this.scene.add(this.ambient);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x8090a8, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(8, 30, 14); this.scene.add(sun);
    this.camMode = 'tv'; this.fx = 0; this.fz = 0; this.menuT = 0;
    this.look = new THREE.Vector3(); this.cpos = new THREE.Vector3(0, 16, 27); this.cutCam = true;
    this.basis = { rx: 1, rz: 0, fx: 0, fz: -1 };
    this.arena = null; this.bodyList = []; this.pms = []; this.lastPos = []; this.match = null;
    this.goalFlash = 0; this.goalSide = 0; this.crowdEx = 0;
    // rondelle, ombre, halo et traînée
    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 14), new THREE.MeshLambertMaterial({ color: 0x0b0b0d }));
    const flat = (geo, color, opacity) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); m.rotation.x = -Math.PI / 2; return m; };
    this.puckShadow = flat(new THREE.CircleGeometry(0.14, 12), 0x000000, 0.35);
    this.puckHalo = flat(new THREE.RingGeometry(0.17, 0.24, 20), 0xffe14a, 0.55);
    this.trail = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.07), new THREE.MeshBasicMaterial({ color: 0x1a2a44, transparent: true, opacity: 0.3, depthWrite: false }));
    this.scene.add(this.puck, this.puckShadow, this.puckHalo, this.trail);
    // indicateurs du joueur contrôlé et du receveur
    this.ring = flat(new THREE.RingGeometry(0.55, 0.72, 28), 0xffd21f, 0.95);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    this.arrow.rotation.x = Math.PI;
    this.tRing = flat(new THREE.RingGeometry(0.5, 0.58, 24), 0x6fd3ff, 0.8);
    this.scene.add(this.ring, this.arrow, this.tRing);
    this.resize();
  }

  setQuality(q) {
    this.r.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  nextCamera() { this.camMode = CAMS[(CAMS.indexOf(this.camMode) + 1) % CAMS.length]; this.cutCam = true; return this.camMode; }

  setMatch(m) {
    this.match = m;
    if (this.arena) {
      this.scene.remove(this.arena.group);
      this.arena.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    }
    for (const pm of this.pms) { this.scene.remove(pm.outer); this.scene.remove(pm.shadow); }
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
        pm.shadow = new THREE.Mesh(shGeo, shMat); pm.shadow.rotation.x = -Math.PI / 2; pm.shadow.position.y = 0.012;
        this.scene.add(pm.outer, pm.shadow);
        this.bodyList.push(b); this.pms.push(pm); this.lastPos.push(null);
      }
    }
    this.goalFlash = 0; this.crowdEx = 0; this.cutCam = true; this.star = null;
    m.on((type, d) => {
      if (type === 'goal' || (type === 'attemptEnd' && d.result === 'goal')) {
        this.goalFlash = 4.5; this.goalSide = d.s || (d.team ? d.team.dir : 1);
        this.crowdEx = d.team && d.team.idx === 0 ? 2.6 : 0.5; // la foule appuie l'équipe locale
      } else if (type === 'hit' && !d.weak) this.crowdEx = Math.max(this.crowdEx, d.big ? 1.0 : 0.5);
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

  updateCamera(m, p, dt, menu) {
    const k = Math.min(1, 3.2 * dt);
    this.fx += (p.x - this.fx) * k; this.fz += (p.z - this.fz) * k;
    if (menu) {
      this.menuT += dt * 0.08;
      const a = this.menuT;
      this.aim(Math.sin(a) * 34, 13 + Math.sin(a * 0.7) * 3, Math.cos(a) * 30, this.fx * 0.5, 0, this.fz * 0.3, 40, dt, 20);
      return;
    }
    const mode = this.camMode;
    if (mode === 'tv') {
      this.aim(clamp(this.fx * 0.82, -21, 21), 16.5, 27.5, clamp(this.fx * 0.96, -25, 25), 0, this.fz * 0.3 - 1.2, 34, dt, 20);
      this.basis = { rx: 1, rz: 0, fx: 0, fz: -1 };
    } else if (mode === 'top') {
      const x = clamp(this.fx * 0.75, -17, 17);
      this.aim(x, 37, 9, x, 0, 0.5, 40, dt, 20);
      this.basis = { rx: 1, rz: 0, fx: 0, fz: -1 };
    } else {
      // Derrière l'équipe du joueur, dans son sens d'attaque : la caméra suit la rondelle (pas le joueur),
      // d'un peu plus haut et plus loin pour garder les joueurs autour dans l'image.
      const ut = m.teams[m.userTeam != null ? m.userTeam : 0];
      const dir = ut.dir, ub = m.userBody && m.userBody.active ? m.userBody : null;
      let fx = this.fx, fz = this.fz;
      if (ub && Math.hypot(ub.x - fx, ub.z - fz) < 14) { fx = fx * 0.8 + ub.x * 0.2; fz = fz * 0.8 + ub.z * 0.2; } // un peu vers son joueur s'il est proche
      const BACK = 17, AHEAD = 5, SAFE = RINK.L - 2, MAXX = RINK.L + 8;
      let cx = fx - dir * BACK;
      // Près des bouts, la caméra passe au-dessus des gradins (spectateurs jusqu'à environ 8,7 m de haut) :
      // plus elle recule derrière la bande, plus elle monte, pour que personne ne bouche la vue.
      const over = Math.max(0, Math.abs(cx) - SAFE);
      cx = clamp(cx, -MAXX, MAXX);
      const cy = Math.min(14.5, 10 + over * 0.45);
      const ahead = Math.max(0, AHEAD - over * 0.5);
      // le point visé reste sur la glace (sinon, en zone adverse profonde, on fixerait les gradins du fond)
      const lx = clamp(fx + dir * ahead, -(RINK.L - 3), RINK.L - 3);
      this.aim(cx, cy, fz * 0.5, lx, 0, fz * 0.8, 58, dt, 5);
      this.basis = { rx: 0, rz: dir, fx: dir, fz: 0 };
    }
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
      setNumber(pm.numTex, entry.pl.num); setLook(pm, entry.pl);
      if (isG) poseGoalie(pm, fake); else poseSkater(pm, fake, time, 1);
      pm.shadow.position.x = fake.x; pm.shadow.position.z = fake.z;
    }
    this.puck.visible = this.puckShadow.visible = this.puckHalo.visible = this.trail.visible = false;
    this.ring.visible = this.arrow.visible = this.tRing.visible = false;
    this.crowdEx = 1.5;
    updateCrowd(this.arena.crowd, time, this.crowdEx);
    if (this.star !== entry) { this.star = entry; this.cutCam = true; }
    this.aim(fake.x * 0.4 + 5.5, 2.4, fake.z * 0.4 + 7, fake.x, 1.1, fake.z, 30, dt, 3);
    this.r.render(this.scene, this.cam);
  }

  // m : match; snap : image de reprise (ou null pour le direct); rp : { shot, spec } pendant une reprise
  update(m, dt, menu = false, snap = null, rp = null) {
    if (!m) return;
    const live = !snap;
    const src = snap ? snap.bodies : this.bodyList;
    const p = snap ? snap.puck : m.puck;
    const time = snap ? snap.time : m.time;
    const cel = snap ? snap.cel : (m.state === 'goal' ? m.lastGoal : null);
    const marks = this.arena.marks;
    // entracte : les joueurs rentrent au vestiaire pendant que la glace est refaite
    const inter = live && m.state === 'intermission' && m.period < 3 && m.mode === 'game';
    this.arena.cube.visible = menu || !!rp || this.camMode !== 'top';
    for (let i = 0; i < this.pms.length; i++) {
      const b = src[i], pm = this.pms[i];
      const vis = (snap ? b.active : (b.active && !!b.p)) && !inter;
      pm.outer.visible = vis; pm.shadow.visible = vis;
      if (!vis) { this.lastPos[i] = null; continue; }
      setNumber(pm.numTex, b.p.num); setLook(pm, b.p);
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
      }
    }
    if (marks.dirty) { marks.t += dt; if (marks.t > 0.35 || !live) { marks.t = 0; marks.dirty = false; marks.tex.needsUpdate = true; } }
    // resurfaçage pendant l'entracte
    const zs = this.arena.zambonis;
    for (let i = 0; i < zs.length; i++) zs[i].visible = inter;
    if (inter) {
      const k = clamp(1 - m.stateT / 4, 0, 1), x = -RINK.L + 1 + k * (2 * RINK.L - 2);
      wipeMarks(marks, x);
      zs[0].position.set(x, 0, -6 + Math.sin(k * 20) * 5); zs[1].position.set(x - 2.5, 0, 6 + Math.sin(k * 20 + 2) * 5);
      zs[0].rotation.y = zs[1].rotation.y = Math.PI / 2;
    }
    // rondelle
    this.puck.visible = this.puckShadow.visible = !inter;
    this.puck.position.set(p.x, p.y + 0.025, p.z);
    const free = snap ? !p.carrier : !m.puck.carrier;
    if (p.rolling > 0 && free) { this.puck.rotation.set(Math.PI / 2, 0, p.spin); this.puck.position.y += 0.08; }
    else this.puck.rotation.set(0, p.spin * 0.3, 0);
    this.puckShadow.position.set(p.x, 0.011, p.z);
    this.puckShadow.scale.setScalar(1 + p.y * 0.4);
    this.puckHalo.position.set(p.x, 0.013, p.z);
    this.puckHalo.visible = live && !menu && !p.inNet && !inter;
    this.puckHalo.material.opacity = free ? 0.6 : 0.25;
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
    const mp = m.puck;
    const pt = live && !menu && mp.pass && mp.pass.to && mp.pass.to.team.isUser ? mp.pass.to : null;
    this.tRing.visible = !!pt && pt !== ub;
    if (pt) this.tRing.position.set(pt.x, 0.013, pt.z);
    // lumière de but, ambiance et foule
    if (live) { if (this.goalFlash > 0) this.goalFlash -= dt; this.crowdEx = Math.max(0, this.crowdEx - dt * 0.45); }
    const flash = snap ? !!snap.cel : this.goalFlash > 0;
    const blink = Math.sin(time * 14) > -0.3;
    for (const n of this.arena.nets) {
      const on = flash && n.s === this.goalSide && blink;
      n.lamp.material.color.setHex(on ? 0xff2a1a : 0x4a0a0a);
      n.light.intensity = on ? 60 : 0;
    }
    this.ambient.color.setRGB(1, flash && blink ? 0.86 : 1, flash && blink ? 0.86 : 1);
    updateCrowd(this.arena.crowd, performance.now() / 1000, snap ? (snap.cel ? 2 : 0.4) : this.crowdEx);
    if (rp) this.replayCamera(rp.shot, rp.spec, p, dt); else { if (this.lastShot) this.cutCam = true; this.lastShot = null; this.updateCamera(m, p, dt, menu); }
    this.r.render(this.scene, this.cam);
  }
}
