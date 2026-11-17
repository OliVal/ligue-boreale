// Clavier : état des touches par action, avec reconfiguration
export class Input {
  constructor(keys) {
    this.keys = keys;
    this.d = new Set(); this.p = new Set(); this.r = new Set();
    this.capture = null; // fonction appelée avec le prochain code de touche (reconfiguration)
    addEventListener('keydown', (e) => {
      if (this.capture) { const f = this.capture; this.capture = null; e.preventDefault(); f(e.code); return; }
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (Object.values(this.keys).includes(e.code) || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) { this.d.add(e.code); this.p.add(e.code); }
    });
    addEventListener('keyup', (e) => { this.d.delete(e.code); this.r.add(e.code); });
    addEventListener('blur', () => this.d.clear());
  }
  down(a) { return this.d.has(this.keys[a]); }
  pressed(a) { return this.p.has(this.keys[a]); }
  released(a) { return this.r.has(this.keys[a]); }
  anyPressed() { return this.p.size > 0; }
  endFrame() { this.p.clear(); this.r.clear(); }
}

const NAMES = { Space: 'Espace', ShiftLeft: 'Maj gauche', ShiftRight: 'Maj droite', Escape: 'Échap', Tab: 'Tab', Enter: 'Entrée',
  ControlLeft: 'Ctrl gauche', ControlRight: 'Ctrl droite', AltLeft: 'Alt gauche', AltRight: 'Alt droite',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Retour' };
export function keyName(code) {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
