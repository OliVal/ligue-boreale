// Clavier : état des touches par action, avec reconfiguration
// Écran tactile : les boutons virtuels appuient sur les mêmes actions (vpress / vrelease)
// et le joystick fournit une direction analogique (setStick), lue par stick().
export class Input {
  constructor(keys) {
    this.keys = keys;
    this.d = new Set(); this.p = new Set(); this.r = new Set();
    this.vd = new Set(); this.vp = new Set(); this.vr = new Set(); // actions virtuelles (tactile)
    this.ax = 0; this.ay = 0; // joystick analogique (-1..1, y vers le haut)
    this.capture = null; // fonction appelée avec le prochain code de touche (reconfiguration)
    addEventListener('keydown', (e) => {
      if (this.capture) { const f = this.capture; this.capture = null; e.preventDefault(); f(e.code); return; }
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (Object.values(this.keys).includes(e.code) || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) { this.d.add(e.code); this.p.add(e.code); }
    });
    addEventListener('keyup', (e) => { this.d.delete(e.code); this.r.add(e.code); });
    addEventListener('blur', () => { this.d.clear(); this.vd.clear(); this.ax = this.ay = 0; });
  }
  down(a) { return this.d.has(this.keys[a]) || this.vd.has(a); }
  pressed(a) { return this.p.has(this.keys[a]) || this.vp.has(a); }
  released(a) { return this.r.has(this.keys[a]) || this.vr.has(a); }
  anyPressed() { return this.p.size > 0 || this.vp.size > 0; }
  endFrame() { this.p.clear(); this.r.clear(); this.vp.clear(); this.vr.clear(); this.passTarget = null; }
  // boutons tactiles
  vpress(a) { if (!this.vd.has(a)) { this.vd.add(a); this.vp.add(a); } }
  vrelease(a) { if (this.vd.has(a)) { this.vd.delete(a); this.vr.add(a); } }
  vtap(a) { this.vp.add(a); }
  // joystick : met aussi les directions « virtuelles » à jour (utile en ligne, où l'invité envoie des actions)
  setStick(x, y) {
    this.ax = x; this.ay = y;
    const T = 0.38;
    for (const [a, on] of [['right', x > T], ['left', x < -T], ['up', y > T], ['down', y < -T]]) on ? this.vpress(a) : this.vrelease(a);
  }
  // direction de déplacement [x, y] : joystick s'il est utilisé, sinon les touches (identique au clavier)
  stick() {
    if (this.ax || this.ay) return [this.ax, this.ay];
    return [(this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0), (this.down('up') ? 1 : 0) - (this.down('down') ? 1 : 0)];
  }
}

// Mode tactile : noms des boutons à l'écran affichés à la place des touches dans les indications
export const TOUCH = { on: false, names: {} };

const NAMES = { Space: 'Espace', ShiftLeft: 'Maj gauche', ShiftRight: 'Maj droite', Escape: 'Échap', Tab: 'Tab', Enter: 'Entrée',
  ControlLeft: 'Ctrl gauche', ControlRight: 'Ctrl droite', AltLeft: 'Alt gauche', AltRight: 'Alt droite',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Retour' };
export function keyName(code) {
  if (TOUCH.on && TOUCH.names[code]) return TOUCH.names[code];
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
