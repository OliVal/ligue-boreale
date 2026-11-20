// Contrôles tactiles (cellulaire, tablette) : joystick à gauche, gros boutons à droite qui changent selon la situation.
// Les boutons appuient sur les mêmes actions que le clavier (classe Input) : aucune logique de jeu n'est dupliquée.
import { TOUCH } from '../engine/input.js';

// Ordinateur avec souris : jamais de mode tactile automatique (même avec un écran tactile)
export function isTouchDevice() {
  const coarse = matchMedia('(pointer: coarse)').matches, fine = matchMedia('(any-pointer: fine)').matches;
  return coarse && (!fine || navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); // iPad présenté comme un Mac
}

// Disposition des boutons selon la situation : [action, étiquette, maintenu ?]
// emplacements : 0 = gros bouton principal, 1 à 4 = autour, 5 = petit bouton (sprint)
const LAYOUTS = {
  puck: [['slap', 'Lancer', 1, 'maintenir'], ['pass', 'Passe'], ['wrist', 'Poignet'], ['deke', 'Feinte'], ['saucer', 'Soulevée'], ['sprint', 'Sprint', 1]],
  skate: [['check', 'Mise en échec'], ['pass', 'Réclame'], ['wrist', 'Tir sur réception'], ['switch', 'Changer'], ['deke', 'Esquive'], ['sprint', 'Sprint', 1]],
  faceoff: [['slap', 'Mise au jeu'], null, null, null, null, null],
  fight: [['wrist', 'Frapper'], ['pass', 'Bloquer'], null, null, null, null],
  goalie: [['slap', 'Papillon', 1, 'maintenir'], ['check', 'Plongeon'], ['wrist', 'Geler'], ['pass', 'Passe'], null, ['sprint', 'Poussée', 1]],
  goaliePuck: [['pass', 'Passe'], ['saucer', 'Soulevée'], ['wrist', 'Geler'], ['dump', 'Dégager'], null, ['sprint', 'Poussée', 1]],
  skip: [['slap', 'Passer'], null, null, null, null, null],
  none: [null, null, null, null, null, null],
};

// Aide des contrôles tactiles (options et menu pause)
export const TOUCH_HELP = `
  <h4>Contrôles au doigt</h4>
  <ul class="thelp">
    <li><b>Joystick</b> pose le pouce gauche n'importe où sur la moitié gauche de l'écran et glisse pour patiner.</li>
    <li><b>Avec la rondelle</b> Lancer (maintenir puis relâcher pour plus de puissance) · Poignet · Passe · Feinte · Soulevée.</li>
    <li><b>Sans la rondelle</b> Mise en échec · Changer de joueur · Réclame (demande la passe) · Tir sur réception · Esquive. En défense, le coéquipier le plus près de la rondelle est choisi tout seul quand tu lâches le joystick.</li>
    <li><b>Sprint</b> petit bouton en bas : garde-le appuyé tout en patinant.</li>
    <li><b>Mise au jeu</b> touche le gros bouton dès que la rondelle tombe.</li>
    <li><b>Bagarre</b> Frapper · Bloquer quand l'adversaire arme son coup.</li>
    <li><b>Gardien (Carrière)</b> Papillon (maintenir) · Plongeon (avec le joystick) · Geler · Passe · Poussée.</li>
    <li><b>En haut à droite</b> ❚❚ pause · caméra · ★ capacité spéciale · Trio (si les changements ne sont pas automatiques).</li>
    <li><b>Carrière</b> sur le banc, le bouton ⏩ simule jusqu'à ta prochaine présence.</li>
    <li><b>Reprises et étoiles</b> le gros bouton « Passer » les saute.</li>
  </ul>`;

export class TouchControls {
  constructor(app) {
    this.app = app; this.input = app.input; this.set = app.settings;
    this.on = false; this.ctx = ''; this.stickId = null; this.held = new Map(); // pointerId -> action maintenue
    const el = this.el = document.createElement('div'); el.id = 'touch';
    el.innerHTML = `
      <div id="tZone"><div id="tBase"><div id="tKnob"></div></div></div>
      <div id="tBtns">${[0, 1, 2, 3, 4, 5].map((i) => `<button class="tb s${i}" data-slot="${i}"><b></b><small></small></button>`).join('')}</div>
      <div id="tTop">
        <button class="tt" data-tap="pause" aria-label="Pause">❚❚</button>
        <button class="tt" data-tap="camera" aria-label="Caméra"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="2" y="7" width="14" height="11" rx="2"/><path d="M17 11l5-3v9l-5-3z"/></svg></button>
        <button class="tt" data-tap="line" aria-label="Changer de trio">Trio</button>
        <button class="tt" data-tap="ability" aria-label="Capacité spéciale">★</button>
      </div>
      <button id="tSkip" data-tap="skip">⏩ Simuler jusqu'à ta présence</button>`;
    document.body.appendChild(el);
    this.slots = [...el.querySelectorAll('.tb')];
    this.base = el.querySelector('#tBase'); this.knob = el.querySelector('#tKnob'); this.zone = el.querySelector('#tZone');
    this.bindStick(); this.bindButtons();
    // aucune sélection, loupe ou menu contextuel pendant le jeu
    for (const ev of ['contextmenu', 'selectstart', 'dblclick']) el.addEventListener(ev, (e) => e.preventDefault());
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if (this.on && this.app.screen === 'game') e.preventDefault(); });
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    // téléphone tourné à la verticale pendant un match : pause (le message « tourne ton téléphone » couvre l'écran)
    const portrait = matchMedia('(orientation: portrait) and (max-width: 600px) and (pointer: coarse)');
    const onTurn = () => {
      const a = this.app;
      if (portrait.matches && a.screen === 'game' && a.match && !a.paused && !a.net && !a.stars && a.match.state !== 'final') { this.releaseAll(); a.pause(); }
    };
    if (portrait.addEventListener) portrait.addEventListener('change', onTurn); else if (portrait.addListener) portrait.addListener(onTurn);
    addEventListener('resize', onTurn); addEventListener('orientationchange', onTurn);
    this.mode(this.set.touchMode || 'auto');
  }

  // 'auto' : tactile sur téléphone et tablette; on bascule aussi au premier toucher, et au clavier dès qu'une touche sert en match
  mode(m) {
    this.pref = m;
    this.enable(m === 'on' || (m === 'auto' && isTouchDevice()));
    if (!this.autoBound) {
      this.autoBound = true;
      addEventListener('pointerdown', (e) => { if (this.pref === 'auto' && e.pointerType === 'touch' && !this.on) this.enable(true); }, true);
      addEventListener('keydown', (e) => {
        if (this.pref === 'auto' && this.on && this.app.screen === 'game' && Object.values(this.set.keys).includes(e.code)) this.enable(false);
      }, true);
    }
  }

  enable(v) {
    this.on = v; TOUCH.on = v; this.ctx = null; // la disposition des boutons sera recalculée
    document.body.classList.toggle('touch', v);
    if (!v) { this.releaseAll(); this.el.className = ''; }
    this.applyLook();
    if (this.app.onTouchChange) this.app.onTouchChange(v);
  }

  // Plein écran et orientation paysage (Android; sur iPhone, ajouter le jeu à l'écran d'accueil donne le même résultat)
  fullscreen() {
    if (this.set.touchFull === false || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
    const d = document.documentElement, req = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = req.call(d, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch { /* refusé par le navigateur */ }
  }

  // Vibrations (Android; l'iPhone ne permet pas la vibration dans le navigateur)
  buzz(m, type, d) {
    if (this.set.touchVibe === false || !navigator.vibrate || m.autoUser) return;
    const me = m.userBody, mine = (b) => b && (b === me || (m.lockPl && b.p === m.lockPl));
    let pat = null;
    if (type === 'hit' && !d.weak && (mine(d.by) || mine(d.on))) pat = d.big ? [35, 40, 35] : 22;
    else if (type === 'goal') pat = d.team && d.team.idx === m.userTeam ? [60, 50, 60, 50, 120] : 80;
    else if (type === 'save' && mine(d.goalie)) pat = 18;
    else if (type === 'post') pat = 30;
    if (pat) try { navigator.vibrate(pat); } catch { /* refusé */ }
  }

  applyLook() {
    const s = this.set;
    this.el.style.setProperty('--tk', s.touchScale || 1);
    this.el.classList.toggle('lefty', !!s.touchLefty);
    this.input.assist = this.on && s.touchAssist !== false; // aide à la visée et aux passes : seulement au doigt
  }

  releaseAll() {
    for (const a of this.held.values()) this.input.vrelease(a);
    this.held.clear();
    this.resetStick();
    for (const b of this.slots) b.classList.remove('down');
  }

  resetStick() {
    this.stickId = null; this.input.setStick(0, 0); this.base.classList.remove('on');
    this.base.style.left = this.base.style.top = ''; this.knob.style.transform = ''; // retour à sa place de repos
  }

  // ---------- joystick flottant : il apparaît sous le pouce ----------
  bindStick() {
    const z = this.zone;
    const R = () => 62 * (this.set.touchScale || 1);
    const move = (e) => {
      const r = R(); let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
      const d = Math.hypot(dx, dy);
      if (d > r) { // le centre suit le pouce s'il dépasse beaucoup (on ne « perd » jamais le joystick)
        const k = (d - r) / d; this.ox += dx * k; this.oy += dy * k; dx -= dx * k; dy -= dy * k;
        this.base.style.left = this.ox + 'px'; this.base.style.top = this.oy + 'px';
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let x = dx / r, y = -dy / r; const m = Math.hypot(x, y);
      if (m < 0.18) { x = 0; y = 0; } else { const s = Math.min(1, (m - 0.18) / 0.72) / m; x *= s; y *= s; } // zone morte puis pleine vitesse avant le bord
      this.input.setStick(x, y);
    };
    z.addEventListener('pointerdown', (e) => {
      if (this.stickId != null) return;
      e.preventDefault(); try { z.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      this.stickId = e.pointerId; this.ox = e.clientX; this.oy = e.clientY;
      this.base.style.left = this.ox + 'px'; this.base.style.top = this.oy + 'px';
      this.knob.style.transform = ''; this.base.classList.add('on');
    });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) { e.preventDefault(); move(e); } });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.resetStick();
    };
    z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end); z.addEventListener('lostpointercapture', end);
  }

  // ---------- boutons : l'action est lue au moment de l'appui (un changement de situation ne bloque jamais une touche) ----------
  bindButtons() {
    for (const b of this.slots) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const a = b.dataset.a; if (!a) return;
        try { b.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
        this.held.set(e.pointerId, a); this.input.vpress(a); b.classList.add('down');
        if (navigator.vibrate && this.set.touchVibe !== false) navigator.vibrate(8);
      });
      const up = (e) => {
        const a = this.held.get(e.pointerId); if (a == null) return;
        this.held.delete(e.pointerId); this.input.vrelease(a); b.classList.remove('down');
      };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    }
    for (const b of this.el.querySelectorAll('[data-tap]')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.input.vtap(b.dataset.tap); });
      b.addEventListener('click', (e) => e.preventDefault());
    }
  }

  // ---------- situation de jeu -> boutons affichés (appelé à chaque image) ----------
  context() {
    const app = this.app, m = app.match;
    if (app.screen !== 'game' || !m || app.paused) return 'hidden';
    if (app.stars || (app.replay && app.replay.active)) return 'skip';
    if (m.state === 'final') return 'hidden';
    if (m.state === 'fight') return m.fight && m.fight.userSide < 0 ? 'none' : 'fight';
    const me = m.lockPl, b = m.userBody;
    if (me && !b) return 'bench';
    if (!b || m.autoUser) return 'none';
    if (b.isGoalie) return m.puck.carrier === b ? 'goaliePuck' : 'goalie';
    if (m.state === 'faceoff') return 'faceoff';
    return m.puck.carrier === b ? 'puck' : 'skate';
  }

  update() {
    if (!this.on) return;
    const ctx = this.context(), m = this.app.match;
    const extra = m ? `${!!(m.lockPl && m.lockPl.ability)}${m.mode === 'game' && !m.set.autoLines && !m.lockPl && !(this.app.net && this.app.net.guest) ? 1 : 0}` : '';
    // anneau de puissance autour du bouton Lancer pendant l'élan du lancer frappé
    const ub = m && m.userBody, pw = ctx === 'puck' && ub && ub.windup ? Math.min(1, ub.windup.t / 0.8) : 0;
    if (Math.abs(pw - (this.pw || 0)) > 0.01 || (pw === 0 && this.pw)) { this.pw = pw; this.slots[0].style.setProperty('--pw', pw.toFixed(2)); }
    if (ctx === this.ctx && extra === this.extra) return;
    this.ctx = ctx; this.extra = extra;
    this.el.className = 'on c-' + ctx + (this.set.touchLefty ? ' lefty' : '');
    if (ctx === 'hidden') { this.releaseAll(); this.el.className = this.set.touchLefty ? 'lefty' : ''; return; }
    const L = LAYOUTS[ctx === 'bench' ? 'none' : ctx] || LAYOUTS.none;
    const names = {}, K = this.set.keys;
    this.slots.forEach((el, i) => {
      const d = L[i];
      if (!d) { el.dataset.a = ''; el.hidden = true; return; }
      el.hidden = false; el.dataset.a = d[0];
      el.querySelector('b').textContent = d[1]; el.querySelector('small').textContent = d[3] || '';
      names[K[d[0]]] = d[1];
    });
    names[K.skip] = '⏩'; names[K.ability] = '★'; names[K.pause] = '❚❚'; names[K.camera] = 'Caméra'; names[K.line] = 'Trio';
    TOUCH.names = names; // les indications du HUD nomment les boutons à l'écran
    this.el.querySelector('[data-tap="ability"]').hidden = extra[0] !== 't';
    this.el.querySelector('[data-tap="line"]').hidden = extra.slice(-1) !== '1';
    this.el.querySelector('#tSkip').hidden = ctx !== 'bench';
    if (ctx === 'skip' || ctx === 'bench' || ctx === 'none' || ctx === 'fight') this.resetStick();
  }
}
