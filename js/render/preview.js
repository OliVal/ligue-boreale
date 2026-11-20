// Aperçu 3D d'un joueur qui tourne sur lui-même (éditeur d'équipe)
import * as THREE from 'three';
import { makePlayer, setNumber, setLook } from './playergfx.js';

export class Preview3D {
  constructor(w = 280, h = 340) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * 2; this.canvas.height = h * 2;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.r.setSize(w * 2, h * 2, false);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    this.cam.position.set(0, 1.5, 5.9); this.cam.lookAt(0, 0.86, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(3, 6, 5); this.scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.04, 40), new THREE.MeshLambertMaterial({ color: 0xe6f1fb }));
    disc.position.y = -0.02; this.scene.add(disc);
    this.pm = null; this.sig = ''; this.angle = 0.6; this.last = 0; this.running = false;
  }

  setKit(kit, num, look = null, goalie = false) {
    const sig = JSON.stringify([goalie, kit.jersey, kit.trim, kit.accent, kit.pants, kit.helmet, kit.number, kit.stripes, kit.shoulders, kit.panels, kit.numStyle, kit.logo && kit.logo.url, num]);
    if (sig !== this.sig) {
      this.sig = sig;
      if (this.pm) {
        this.scene.remove(this.pm.outer);
        this.pm.outer.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      }
      this.pm = makePlayer(kit, goalie, 0);
      setNumber(this.pm.numTex, num);
      this.scene.add(this.pm.outer);
    }
    setLook(this.pm, look ? { look } : null);
    this.render(0);
    if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this.loop(t)); }
  }

  render(dt) {
    this.angle += dt * 0.9;
    if (this.pm) this.pm.outer.rotation.y = this.angle;
    this.r.render(this.scene, this.cam);
  }

  loop(now) {
    if (!this.canvas.isConnected) { this.running = false; return; } // l'écran de l'éditeur a été fermé
    this.render(Math.min(0.05, (now - this.last) / 1000)); this.last = now;
    requestAnimationFrame((t) => this.loop(t));
  }
}
