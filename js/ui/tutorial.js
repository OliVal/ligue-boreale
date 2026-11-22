// Tutoriel interactif au doigt : un entraînement guidé, une étape à la fois.
// Chaque étape attend que le joueur fasse vraiment le geste (patiner, sprinter, passer, tirer, feinter) avant de passer à la suivante.

const STEPS = [
  { key: 'skate', act: 'stick', text: 'Pose le pouce gauche n\'importe où sur la moitié gauche de l\'écran et glisse-le pour patiner.' },
  { key: 'sprint', act: 'sprint', text: 'Garde « Sprint » appuyé tout en patinant pour aller plus vite.' },
  { key: 'pass', act: 'pass', text: 'Touche « Passe » pour envoyer la rondelle à un coéquipier (pousse le joystick vers lui pour choisir), ou touche directement le coéquipier à l\'écran.' },
  { key: 'wrist', act: 'wrist', text: 'Touche « Poignet » pour un tir rapide et précis.' },
  { key: 'slap', act: 'slap', text: 'Maintiens « Lancer » (l\'anneau doré se remplit), puis relâche pour un lancer frappé puissant.' },
  { key: 'deke', act: 'deke', text: 'Touche « Feinte » pour un crochet qui déjoue un défenseur.' },
  { key: 'end', act: null, text: 'Sans la rondelle : « Mise en échec » pour frapper, « Changer » pour prendre un autre joueur (le plus proche est aussi choisi tout seul). En haut à droite : pause et caméra.' },
];

export class Tutorial {
  constructor(app, done) {
    this.app = app; this.done = done; this.i = 0; this.t = 0; this.flags = {}; this.wait = 0;
    const el = this.el = document.createElement('div'); el.id = 'tut';
    el.innerHTML = '<div class="tutN"></div><div class="tutT"></div><div class="tutB"></div>';
    document.body.appendChild(el);
    this.show();
  }

  show() {
    const s = STEPS[this.i], el = this.el;
    el.querySelector('.tutN').textContent = s.key === 'end' ? 'C\'EST TOUT !' : `ÉTAPE ${this.i + 1} SUR ${STEPS.length - 1}`;
    el.querySelector('.tutT').textContent = s.text;
    const b = el.querySelector('.tutB');
    b.innerHTML = s.key === 'end'
      ? '<button data-t="game" class="primary">Jouer un match</button><button data-t="free">Continuer l\'entraînement</button><button data-t="menu">Menu</button>'
      : '<button data-t="skip">Passer le tutoriel</button>';
    for (const n of b.querySelectorAll('button')) {
      n.addEventListener('pointerdown', (e) => e.stopPropagation());
      n.addEventListener('click', () => this.finish(n.dataset.t));
    }
    el.className = 'on' + (s.key === 'end' ? ' end' : '');
    this.t = 0; this.wait = 0;
    this.hint(s.act);
  }

  // fait clignoter le bouton (ou le joystick) à utiliser
  hint(act) {
    const touch = document.getElementById('touch');
    if (!touch) return;
    for (const n of touch.querySelectorAll('.hint')) n.classList.remove('hint');
    this.hintAct = act;
  }

  applyHint() {
    const touch = document.getElementById('touch'), act = this.hintAct;
    if (!touch) return;
    for (const n of touch.querySelectorAll('.hint')) if (n.dataset.a !== act && !(act === 'stick' && n.id === 'tBase')) n.classList.remove('hint');
    if (!act) return;
    const n = act === 'stick' ? touch.querySelector('#tBase') : touch.querySelector(`.tb[data-a="${act}"]`);
    if (n && !n.classList.contains('hint')) n.classList.add('hint');
  }

  onEvent(type, d) {
    const m = this.app.match;
    if (!m || !d || !d.by || d.by.team !== m.teams[m.userTeam]) return;
    if (type === 'pass') this.flags.pass = true;
    if (type === 'shot') this.flags[d.type === 'slap' ? (this.flags.charged ? 'slap' : 'weakSlap') : 'wrist'] = true;
    if (type === 'deke') this.flags.deke = true;
  }

  update(dt) {
    const app = this.app, m = app.match, inp = app.input;
    if (!m || app.paused) return;
    this.applyHint();
    const s = STEPS[this.i];
    if (s.key === 'end') return;
    const ub = m.userBody, moving = Math.hypot(inp.ax, inp.ay) > 0.5 || ['up', 'down', 'left', 'right'].some((a) => inp.down(a));
    if (ub && ub.windup && ub.windup.t > 0.35) this.flags.charged = true;
    let ok = false;
    if (s.key === 'skate') { if (moving) this.t += dt; ok = this.t > 1.2; }
    else if (s.key === 'sprint') { if (moving && inp.down('sprint')) this.t += dt; ok = this.t > 0.8; }
    else ok = !!this.flags[s.key];
    if (s.key === 'slap' && this.flags.weakSlap && !this.flags.slap) {
      this.flags.weakSlap = false;
      this.el.querySelector('.tutT').textContent = 'Presque ! Garde « Lancer » appuyé plus longtemps avant de relâcher (l\'anneau doré doit se remplir).';
    }
    if (ok) {
      this.wait += dt;
      this.el.classList.add('good'); // bravo : le panneau passe au vert un instant
      if (this.wait > 0.9) { this.el.classList.remove('good'); this.i++; this.flags = {}; this.show(); }
    }
  }

  finish(choice) {
    this.close();
    this.done(choice);
  }

  close() {
    this.el.remove();
    const touch = document.getElementById('touch');
    if (touch) for (const n of touch.querySelectorAll('.hint')) n.classList.remove('hint');
  }
}
