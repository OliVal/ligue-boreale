// Test sans affichage des entrées tactiles : boutons virtuels, joystick analogique, clavier inchangé, aide au doigt
globalThis.addEventListener = globalThis.addEventListener || (() => {}); // Input écoute la fenêtre : rien à écouter ici
const { Input, keyName, TOUCH } = await import('../js/engine/input.js');
const { Match } = await import('../js/sim/match.js');
const { updateHuman } = await import('../js/game/human.js');
const { getTeams } = await import('../js/data/teams.js');
const { DEFAULT_SETTINGS, DEFAULT_KEYS, DT } = await import('../js/core/config.js');
const { R } = await import('../js/core/util.js');

const ok = (cond, msg) => { if (!cond) throw new Error('ÉCHEC : ' + msg); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// 1. boutons virtuels : appuyé une seule image, tenu jusqu'au relâchement
const inp = new Input({ ...DEFAULT_KEYS });
inp.vpress('slap');
ok(inp.pressed('slap') && inp.down('slap'), 'bouton tactile appuyé');
inp.endFrame();
ok(!inp.pressed('slap') && inp.down('slap'), 'bouton tactile tenu');
inp.vrelease('slap');
ok(inp.released('slap') && !inp.down('slap'), 'bouton tactile relâché');
inp.endFrame();
ok(!inp.released('slap') && !inp.anyPressed(), 'fin d\'image');
inp.vtap('pause'); ok(inp.pressed('pause') && !inp.down('pause'), 'touche brève (pause)'); inp.endFrame();

// 2. clavier : identique à avant, joystick au repos
inp.d.add('KeyD'); inp.d.add('KeyW');
ok(inp.stick()[0] === 1 && inp.stick()[1] === 1, 'touches de direction');
inp.d.clear();
ok(inp.stick()[0] === 0 && inp.stick()[1] === 0, 'aucune direction');

// 3. joystick : direction analogique + directions « virtuelles » (pour l'invité en ligne)
inp.setStick(0.5, -0.9);
ok(near(inp.stick()[0], 0.5) && near(inp.stick()[1], -0.9), 'joystick analogique');
ok(inp.down('right') && inp.down('down') && !inp.down('left') && !inp.down('up'), 'directions virtuelles du joystick');
inp.setStick(0, 0);
ok(!inp.down('right') && !inp.down('down'), 'joystick relâché');

// 4. noms des boutons dans les indications seulement en mode tactile
TOUCH.names = { Space: 'Lancer' };
ok(keyName('Space') === 'Espace', 'nom de touche au clavier');
TOUCH.on = true; ok(keyName('Space') === 'Lancer', 'nom du bouton au doigt');
TOUCH.on = false;

// 5. vrai match : le joystick fait patiner le joueur, un bouton fait tirer, l'aide ne s'applique qu'au doigt
function match() {
  R.seed(7);
  const t = getTeams();
  return new Match({ home: t[0], away: t[1], settings: { ...DEFAULT_SETTINGS, penalties: false, fights: false }, user: 0, mode: 'game' });
}
const basis = { rx: 1, rz: 0, fx: 0, fz: -1 };
for (const assist of [0, 1, 2]) {
  const m = match(), u = new Input({ ...DEFAULT_KEYS }); u.assist = assist;
  let n = 0;
  while (m.state !== 'play' && n++ < 4000) { updateHuman(m, u, basis); u.endFrame(); m.step(DT); }
  ok(m.state === 'play', 'le match commence');
  u.setStick(1, 0);
  for (let i = 0; i < 30; i++) { updateHuman(m, u, basis); u.endFrame(); m.step(DT); }
  const b = m.userBody;
  ok(b && b.ctrl.mx > 0.9, 'le joystick fait patiner vers la droite');
  u.setStick(0, 0);
  let shots = 0, passes = 0;
  m.on((type) => { if (type === 'shot') shots++; if (type === 'pass') passes++; });
  for (const a of ['wrist', 'pass']) {
    const pl = m.userBody; m.puck.x = pl.x; m.puck.z = pl.z; m.gain(pl);
    if (m.puck.carrier !== pl) continue;
    u.vpress(a); updateHuman(m, u, basis); u.endFrame(); u.vrelease(a); m.step(DT);
  }
  ok(shots === 1 && passes === 1, `tir et passe au doigt (aide ${assist ? 'oui' : 'non'}) : ${shots} tir, ${passes} passe`);
}
console.log('OK');
