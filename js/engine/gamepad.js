// Manette de jeu (Bluetooth sur iPad et téléphone, USB ou sans fil sur ordinateur) — disposition « standard » des navigateurs.
// En match, les boutons appuient sur les mêmes actions que le clavier (classe Input) ; dans les menus, la croix et le
// joystick gauche déplacent le focus, A choisit, B revient en arrière.
//
//   joystick gauche : patiner          A : passe            X : poignet         Y : feinte
//   B : mise en échec (sans rondelle) ou dégager (avec)     RT : lancer frappé (maintenir)
//   LT : sprint     RB : changer de joueur     LB : passe soulevée
//   Start : pause   Select : caméra   croix haut : capacité   croix bas : trio   croix droite : simuler (Carrière)

const MAP = [
  [0, 'pass'], [2, 'wrist'], [3, 'deke'], [7, 'slap'], [6, 'sprint'], [5, 'switch'], [4, 'saucer'],
  [9, 'pause'], [8, 'camera'], [12, 'ability'], [13, 'line'], [15, 'skip'],
];
const DEAD = 0.22;

export class Gamepads {
  constructor(app) {
    this.app = app; this.input = app.input; this.prev = []; this.stickUsed = false; this.menuT = 0; this.on = false;
    addEventListener('gamepadconnected', () => { this.on = true; this.app.hud && this.app.hud.toast && this.app.screen === 'game' && this.app.hud.toast('Manette branchée'); });
  }

  // à chaque image (appelé par la boucle du jeu)
  update(dt) {
    if (!this.on || !navigator.getGamepads) return;
    const pad = [...navigator.getGamepads()].find((g) => g && g.connected && g.mapping === 'standard') || [...navigator.getGamepads()].find((g) => g && g.connected);
    if (!pad) return;
    this.pad = pad;
    const app = this.app, inp = this.input, b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
    const down = pad.buttons.map((_, i) => b(i)), was = this.prev;
    const hit = (i) => down[i] && !was[i];
    this.prev = down;
    const menu = app.screen !== 'game' || app.paused;
    if (menu) { this.releaseAll(); this.menu(pad, hit, dt); return; }
    // la manette sert en match : les contrôles tactiles s'effacent (mode automatique), comme avec le clavier
    const t = app.touch;
    if (t && t.on && t.pref === 'auto' && (down.some((d, k) => d && !was[k]) || Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0) > 0.5)) t.enable(false);
    // joystick gauche → direction analogique (on ne touche pas au joystick tactile si la manette est au repos)
    let x = pad.axes[0] || 0, y = -(pad.axes[1] || 0);
    const m = Math.hypot(x, y);
    if (m < DEAD) { x = 0; y = 0; } else { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; x *= k; y *= k; }
    if (x || y) { inp.setStick(x, y); this.stickUsed = true; } else if (this.stickUsed) { inp.setStick(0, 0); this.stickUsed = false; }
    // boutons → actions
    for (const [i, a] of MAP) {
      if (down[i] && !was[i]) inp.vpress(a); else if (!down[i] && was[i]) inp.vrelease(a);
    }
    // B : mise en échec sans la rondelle, dégager avec la rondelle
    const mt = app.match, has = mt && mt.userBody && mt.puck.carrier === mt.userBody;
    if (hit(1)) { this.bAct = has ? 'dump' : 'check'; inp.vpress(this.bAct); } else if (!down[1] && was[1] && this.bAct) { inp.vrelease(this.bAct); this.bAct = null; }
  }

  // vibration de la manette (si elle en a) : mises en échec du joueur, buts, poteaux, arrêts du gardien contrôlé
  rumble(m, type, d) {
    if (!this.on || !this.pad || !this.pad.vibrationActuator || m.autoUser || this.app.settings.touchVibe === false) return;
    const me = m.userBody, mine = (b) => b && (b === me || (m.lockPl && b.p === m.lockPl));
    let fx = null;
    if (type === 'hit' && !d.weak && (mine(d.by) || mine(d.on))) fx = d.big ? [220, 1, 0.6] : [120, 0.5, 0.3];
    else if (type === 'goal') fx = d.team && d.team.idx === m.userTeam ? [500, 0.8, 0.8] : [200, 0.3, 0.2];
    else if (type === 'save' && mine(d.goalie)) fx = [90, 0.3, 0.5];
    else if (type === 'post') fx = [150, 0.4, 0.6];
    if (fx) this.pad.vibrationActuator.playEffect('dual-rumble', { duration: fx[0], strongMagnitude: fx[1], weakMagnitude: fx[2] }).catch(() => {});
  }

  releaseAll() {
    for (const [, a] of MAP) this.input.vrelease(a);
    if (this.bAct) { this.input.vrelease(this.bAct); this.bAct = null; }
    if (this.stickUsed) { this.input.setStick(0, 0); this.stickUsed = false; }
  }

  // menus : croix ou joystick pour se déplacer, A pour choisir, B pour revenir, Start pour reprendre
  menu(pad, hit, dt) {
    const sc = document.getElementById('screen');
    if (!sc || !sc.classList.contains('on')) return;
    const items = [...sc.querySelectorAll('button:not([disabled]), select, input')].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    const ay = pad.axes[1] || 0, ax = pad.axes[0] || 0;
    this.menuT -= dt;
    let dir = 0;
    if (hit(13) || hit(15)) dir = 1; else if (hit(12) || hit(14)) dir = -1;
    else if (this.menuT <= 0 && (Math.abs(ay) > 0.6 || Math.abs(ax) > 0.6)) { dir = (Math.abs(ay) > Math.abs(ax) ? ay : ax) > 0 ? 1 : -1; this.menuT = 0.22; }
    else if (Math.abs(ay) < 0.3 && Math.abs(ax) < 0.3) this.menuT = 0;
    const cur = items[i];
    const horiz = hit(14) || hit(15) || (dir && Math.abs(ax) > Math.abs(ay));
    if (dir && cur && cur.tagName === 'SELECT' && horiz) { // liste déroulante : gauche / droite changent la valeur
      const k = cur.selectedIndex + (hit(14) || ax < 0 ? -1 : 1);
      if (k >= 0 && k < cur.options.length) { cur.selectedIndex = k; cur.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    if (dir) { const n = items[(i + dir + items.length) % items.length] || items[0]; n.focus(); n.scrollIntoView({ block: 'nearest' }); }
    if (hit(0)) {
      const n = cur || items[0];
      if (n.tagName === 'BUTTON') n.click();
      else if (n.type === 'checkbox') { n.checked = !n.checked; n.dispatchEvent(new Event('change', { bubbles: true })); }
      else n.focus();
    }
    const ui = this.app.ui;
    if ((hit(1) || (hit(9) && this.app.paused)) && ui && ui.back) ui.back(); // B (ou Start en pause) : retour
  }
}
