// Point d'entrée : assemble moteur, simulation, rendu, audio et interface
import { DT } from './core/config.js';
import { R } from './core/util.js';
import { getTeams } from './data/teams.js';
import { Match } from './sim/match.js';
import { Renderer, CAM_NAMES } from './render/renderer.js';
import { Input } from './engine/input.js';
import { updateHuman } from './game/human.js';
import { Audio } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { Commentary } from './ui/commentary.js';
import { Replay } from './render/replay.js';
import { UI } from './ui/ui.js';
import { loadSettings, saveSettings } from './save/storage.js';
import { TouchControls, isTouchDevice } from './ui/touch.js';
import { Tutorial } from './ui/tutorial.js';
import { Gamepads } from './engine/gamepad.js';
import { lockZoom } from './engine/nozoom.js';

lockZoom(); // la fenêtre du jeu ne zoome jamais (pincer, double toucher, Ctrl + molette…)
import { CareerTracker } from './career/tracker.js';
import { ME } from './career/career.js';
import { keyName } from './engine/input.js';
import { equipped, item, unlock, bump, onUnlock } from './save/profile.js';
import { NetHost, NetClient } from './net/sync.js';
import { DEFAULT_KEYS } from './core/config.js';

// touches transmises à l'hôte par l'invité (la caméra et la pause restent locales)
const NET_ACTIONS = Object.keys(DEFAULT_KEYS).filter((a) => a !== 'pause' && a !== 'camera');

const settings = loadSettings();
// Premier lancement sur téléphone ou tablette : qualité graphique « mobile » (modifiable dans les options)
if (!settings.mobileInit && isTouchDevice()) { settings.mobileInit = true; settings.quality = 'mobile'; saveSettings(settings); }
const canvas = document.getElementById('c');
const hudEl = document.getElementById('hud');
const input = new Input(settings.keys);
const renderer = new Renderer(canvas, settings);
const audio = new Audio(settings);
const hud = new Hud(hudEl, settings);
const commentary = new Commentary((t, p) => hud.say(t, p), (a, b) => hud.card(a, b));
const replay = new Replay();

const app = {
  settings, input, renderer, audio, hud,
  match: null, demo: null, screen: 'menu', paused: false, lastOpts: null, fps: 60,

  applySettings() {
    audio.setVolume(settings.volume);
    document.documentElement.style.setProperty('--uiz', settings.uiScale || 1); // taille des menus et de l'affichage du match
    renderer.setQuality(settings.quality); renderer.resize();
    if (this.touch) { if (this.touch.pref !== settings.touchMode) this.touch.mode(settings.touchMode); this.touch.applyLook(); this.touch.ctx = null; }
    if (this.match) this.match.set = settings; // les règles s'appliquent immédiatement
  },

  startMatch(opts) {
    this.lastOpts = opts;
    if (this.touch && this.touch.on) this.touch.fullscreen(); // au doigt : plein écran à l'horizontale
    const teams = getTeams();
    const u = teams[opts.user] || teams[0], o = teams[opts.opp] && teams[opts.opp] !== u ? teams[opts.opp] : teams.find((t) => t !== u);
    // Carrière : équipes fournies directement, joueur verrouillé
    const car = opts.career || null, direct = opts.teams || null, uh = direct ? direct.userHome : opts.home;
    const home = direct ? direct.home : uh ? u : o, away = direct ? direct.away : uh ? o : u;
    this.franchise = opts.franchise || null;
    R.seed((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    // En ligne : règles de l'hôte, sans bagarres ni reprises (elles figeraient le match d'un seul côté)
    const on = opts.online || null;
    const mset = on ? { ...settings, ...on.set, fights: false, replays: 'off' } : settings;
    const m = new Match({ home, away, settings: mset, user: uh ? 0 : 1, mode: opts.mode, autoUser: !!opts.auto, lock: car ? ME : null, versus: !!on && on.role === 'host' });
    this.net = null;
    if (on) {
      const send = (msg) => on.link.send(msg);
      this.net = on.role === 'host' ? new NetHost(m, send, 1, on.link.via === 'relais' ? 20 : 30) : new NetClient(m, send, 1);
      this.net.guest = on.role === 'guest'; this.net.link = on.link;
    }
    this.match = m; this.screen = 'game'; this.paused = false; this.demo = null;
    renderer.camMode = renderer.camMode || 'tv';
    // Carrière de gardien : caméra derrière le filet par défaut
    renderer.goalieCam = !!(car && car.pos === 'G');
    if (renderer.goalieCam) renderer.camMode = 'goalie'; else if (renderer.camMode === 'goalie') renderer.camMode = 'behind';
    this.skipTo = false;
    // objets débloqués choisis dans le vestiaire
    const eq = equipped(), ui_ = uh ? 0 : 1;
    renderer.retroIdx = eq.jersey !== 'regular' ? ui_ : -1; renderer.retroVar = eq.jersey;
    renderer.cos = { team: ui_, stick: item('stick').color, gloves: item('gloves').color, celeb: eq.celeb, rink: eq.rink !== 'classic' ? item('rink') : null }; // chandail rétro pour l'équipe du joueur
    renderer.setMatch(m); hud.setMatch(m); commentary.setMatch(m);
    replay.reset(); this.stars = null; hud.replay(null); hud.star(0, null);
    this.tracker = car ? new CareerTracker(m, car, hud, settings) : null; hud.career('');
    let lastShot = null;
    if (this.tutorial) this.tutorial.close();
    this.tutorial = opts.tutorial ? new Tutorial(this, (c) => this.tutorialDone(c)) : null;
    m.on((type, d) => {
      audio.onEvent(type, d);
      if (this.tutorial) this.tutorial.onEvent(type, d);
      if (touch.on) touch.buzz(m, type, d); // au doigt : petite vibration (mises en échec du joueur, buts, arrêts du gardien)
      pads.rumble(m, type, d); // manette : vibration des mêmes moments
      const rp = m.set.replays;
      if (type === 'shot') lastShot = { speed: d.speed, oneT: d.oneT, t: m.time };
      else if (type === 'goal' && m.mode === 'game' && rp !== 'off') replay.schedule({ kind: 'goal', t: m.time, s: d.s, delay: 2.0 });
      else if (type === 'hit' && d.big) replay.highlight = { kind: 'hit', t: m.time, x: d.on.x, z: d.on.z };
      else if (type === 'save' && d.onNet && lastShot && m.time - lastShot.t < 2 && (lastShot.speed > 33 || lastShot.oneT)) replay.highlight = { kind: 'save', t: m.time, s: -d.goalie.team.dir };
      else if (type === 'whistle' && rp === 'all' && m.mode === 'game' && d.reason !== 'penalty' && replay.highlight && m.time - replay.highlight.t < 6) {
        replay.schedule({ ...replay.highlight, delay: 0.9 }); replay.highlight = null;
      } else if (type === 'final') this.stars = { t: -3.2, i: -1 }; // présentation des Trois étoiles après la sirène
      // succès
      if (m.autoUser || m.mode !== 'game') return;
      const U = m.teams[m.userTeam], O = m.teams[1 - m.userTeam];
      if (type === 'fightEnd' && d.winner.team === U && (!m.lockPl || d.winner.p === m.lockPl)) unlock('fight');
      if (type === 'final') {
        // Carrière : les succès de buts viennent de TON joueur, pas des coéquipiers de l'ordinateur
        // (tour du chapeau : tes 3 buts; avalanche : seulement un patineur qui a obtenu un point dans le match)
        const me = m.lockPl;
        if (me ? me.st.g >= 3 : U.roster.some((p) => p.st.g >= 3)) unlock('hat');
        if (U.score >= 5 && (!me || (me.pos !== 'G' && me.st.g + me.st.a >= 1))) unlock('five');
        if (m.winner === U) {
          unlock('firstWin');
          if (bump('wins') >= 10) unlock('wins10');
          if (!O.score) unlock('shutout');
          if (m.period === 5) unlock('so');
          if (settings.difficulty >= 3) unlock('hard');
        }
      }
    });
    hudEl.classList.add('on');
    audio.init();
    // premier match au doigt : on explique les contrôles (le match attend, sauf en ligne)
    if (touch.on && !settings.touchHelpSeen && !on && !opts.tutorial) {
      this.paused = true;
      ui.touchHelp(() => { settings.touchHelpSeen = true; saveSettings(settings); this.resume(); }, settings.touchTutoDone ? null : () => { settings.touchHelpSeen = true; saveSettings(settings); this.startTutorial(); });
    }
  },

  // Tutoriel au doigt : entraînement guidé (voir ui/tutorial.js)
  startTutorial() {
    ui.hide();
    this.startMatch({ mode: 'practice', user: 0, opp: 8, home: true, tutorial: true });
  },
  tutorialDone(choice) {
    settings.touchTutoDone = true; saveSettings(settings);
    this.tutorial = null;
    if (choice === 'free') return; // on reste à l'entraînement
    this.toMenu();
    if (choice === 'game') ui.teamSelect('game');
  },

  pause() { if (this.match.state === 'final') return; this.paused = true; ui.pause(this.match); },

  // Fin d'un match en ligne (retour au salon ou connexion perdue)
  endOnline() {
    this.net = null; this.match = null; this.screen = 'menu'; this.paused = false; this.stars = null;
    hud.star(0, null); hudEl.classList.remove('on');
    newDemo();
  },
  resume() { this.paused = false; ui.hide(); },

  toMenu() {
    if (this.tutorial) { this.tutorial.close(); this.tutorial = null; }
    if (this.net) { const l = this.net.link; this.endOnline(); l.send({ k: 'lobby', why: 'quit' }); ui.online.lobby(); return; }
    const car = this.tracker, fr = this.franchise;
    this.match = null; this.screen = 'menu'; this.paused = false; this.tracker = null; this.franchise = null; hud.career('');
    hudEl.classList.remove('on');
    newDemo();
    if (car) ui.career.route(); else if (fr) ui.franchise.route(); else ui.main(); // un match de Carrière abandonné n'est pas compté
  },

  // Fin d'un match de Franchise : enregistre le résultat puis retourne au tableau de bord
  franchiseDone() {
    const m = this.match;
    this.match = null; this.screen = 'menu'; this.paused = false; this.franchise = null;
    hudEl.classList.remove('on');
    newDemo(); ui.franchise.afterMatch(m);
  },

  // Fin d'un match de Carrière : enregistre le résultat puis retourne au tableau de bord
  careerDone() {
    const res = this.tracker.result();
    this.tracker = null; this.match = null; this.screen = 'menu'; this.paused = false; hud.career('');
    hudEl.classList.remove('on');
    newDemo(); ui.career.afterMatch(res);
  },

  // Éditeur d'équipe : fait jouer l'équipe à domicile derrière le menu pour voir ses couleurs
  demoHome: null,
  previewTeam(t) { this.demoHome = t; if (this.screen === 'menu') newDemo(); },
};

const ui = new UI(app);
document.documentElement.style.setProperty('--uiz', settings.uiScale || 1);
const touch = new TouchControls(app);
app.touch = touch; app.ui = ui;
const pads = new Gamepads(app); // manette de jeu (match et menus)
app.pads = pads;

// Match de démonstration IA contre IA derrière le menu principal
function newDemo() {
  renderer.retroIdx = -1; renderer.cos = null;
  const teams = getTeams();
  const n = teams.length, pre = teams.indexOf(app.demoHome);
  const a = pre >= 0 ? pre : Math.floor(Math.random() * n); let b = Math.floor(Math.random() * n); if (b === a) b = (a + 1) % n;
  const m = new Match({ home: teams[a], away: teams[b], settings: { ...settings, periodMin: 3, fights: false }, user: null, autoUser: true });
  app.demo = m; renderer.setMatch(m);
  m.on((type, d) => { if (type === 'goal' || type === 'post' || type === 'hit') audio.onEvent(type === 'goal' ? 'save' : type, { ...d, caught: true }); });
}

let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, slowN = 0;
function frame(now) {
  // qualité « mobile » sur écran 90/120 Hz : on saute une image sur deux à 120 Hz (60 images/s) (moins de chaleur et de batterie)
  // et dans les menus ou en pause (match de démonstration en arrière-plan, image figée), 30 images/s suffisent
  if (settings.quality === 'mobile' && now - last < (app.screen === 'game' && !app.paused ? 10 : 28)) { requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsT += dt; fpsN++;
  if (fpsT >= 0.5) {
    app.fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    // qualité « mobile » : si le match tourne sous 45 images/s pendant 3 s, on baisse la définition
    if (app.screen === 'game' && !app.paused && !document.hidden && app.fps < 45) { if (++slowN >= 6) { slowN = 0; renderer.lowerRes(); } } else slowN = 0;
  }
  tick(dt);
  requestAnimationFrame(frame);
}

// Une image de jeu : entrées, simulation à pas fixe, rendu, audio
function tick(dt) {
  touch.update(); // boutons tactiles selon la situation (rien sur ordinateur)
  pads.update(dt);
  if (app.tutorial && app.screen === 'game') app.tutorial.update(dt);
  if (app.screen === 'game' && app.match) {
    const m = app.match;
    if (app.stars && !app.paused) { tickStars(m, dt); input.endFrame(); return; }
    if (replay.active && !app.paused) { tickReplay(m, dt); input.endFrame(); return; }
    const net = app.net;
    if (net && net.guest) { // invité : l'hôte simule, on envoie nos touches et on affiche son état
      net.frame(dt, input, renderer.basis, NET_ACTIONS, app.paused);
      if (net.link.ping) net.setPing(net.link.ping);
      if (!app.paused && input.pressed('camera')) hud.toast('Caméra : ' + CAM_NAMES[renderer.nextCamera()]);
      if (!app.paused && input.pressed('pause')) app.pause();
      if (!app.paused) hud.update(m, dt);
      renderer.update(m, dt, false); audio.update(m, dt, false);
      input.endFrame(); return;
    }
    if (!app.paused || net) { // en ligne, la pause n'arrête pas le match
      if (!app.paused) updateHuman(m, input, renderer.basis);
      if (net) net.applyRemote(renderer.basis);
      if (!app.paused && input.pressed('camera')) hud.toast('Caméra : ' + CAM_NAMES[renderer.nextCamera()]);
      // Carrière : avance rapide pendant que le joueur est sur le banc; [X] simule jusqu'à sa prochaine présence
      const me = m.lockPl, bench = me && !m.userBody && m.state !== 'final';
      if (bench && !app.paused && input.pressed('skip') && !app.skipTo) { app.skipTo = true; hud.toast('Simulation jusqu\'à ta prochaine présence…'); }
      if (!bench) app.skipTo = false;
      if (app.skipTo) replay.pending = null; // pas de reprise pendant la simulation
      const focus = me && m.abOn(me, 'focus'); // Concentration (gardien) : le jeu ralentit
      const ff = app.skipTo ? 40 : bench && (m.state === 'play' || m.state === 'whistle' || m.state === 'faceoff') ? 3 : focus ? 0.55 : 1;
      acc += dt * ff;
      let n = 0;
      while (acc >= DT && n++ < Math.max(8, 8 * ff)) { m.step(DT); acc -= DT; }
      if (acc > DT) acc = 0;
      if (app.tracker) hud.career(app.tracker.html(keyName, app.skipTo));
      if (net) net.frame(dt);
      replay.record(m, renderer.bodyList);
      replay.countdown(dt, m);
      if (!app.paused && input.pressed('pause')) app.pause();
      if (!app.paused) hud.update(m, dt);
    }
    renderer.update(m, app.paused && !net ? 0 : dt, false);
    audio.update(m, dt, false);
  } else if (app.demo) {
    const m = app.demo;
    acc += dt; let n = 0;
    while (acc >= DT && n++ < 8) { m.step(DT); acc -= DT; }
    if (acc > DT) acc = 0;
    if (m.state === 'final') newDemo();
    renderer.update(app.demo, dt, true);
    audio.update(m, dt, true);
  }
  input.endFrame();
}
app.tick = tick;
app.replay = replay;

// Reprise au ralenti : la simulation est figée pendant la diffusion
function tickReplay(m, dt) {
  if (input.pressed('slap') || input.pressed('wrist') || input.pressed('pass') || input.pressed('pause')) replay.skip();
  const r = replay.update(dt);
  if (!r || r.done) {
    hud.replay(null);
    if (m.state === 'goal') m.stateT = Math.min(m.stateT, 1.4);
    renderer.update(m, 0, false);
    return;
  }
  hud.replay(r);
  renderer.update(m, dt, false, r.frame, r);
  audio.update(m, dt, false);
}

// Les Trois étoiles : troisième, deuxième puis première, avant le résumé
function tickStars(m, dt) {
  const S = app.stars, DUR = 3.4;
  S.t += dt;
  const skip = S.t > 0 && (input.pressed('slap') || input.pressed('wrist') || input.pressed('pass') || input.pressed('pause'));
  const i = S.t < 0 ? -1 : Math.floor(S.t / DUR);
  if (i >= m.stars.length || skip || !m.stars.length) {
    app.stars = null; hud.star(0, null);
    app.paused = true; hudEl.classList.remove('on'); ui.summary(m);
    return;
  }
  if (i < 0) { m.step(dt); hud.update(m, dt); renderer.update(m, dt, false); audio.update(m, dt, false); return; }
  const e = m.stars[m.stars.length - 1 - i], rank = m.stars.length - i;
  if (S.i !== i) { S.i = i; hud.star(rank, e); audio.roar(false); }
  hud.update(m, dt);
  renderer.showStar(m, e, dt);
  audio.update(m, dt, false);
}

addEventListener('resize', () => renderer.resize());
for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) addEventListener(ev, () => audio.init(), { once: false, passive: true }); // touchend et click : déblocage du son sur iPhone et iPad
document.addEventListener('visibilitychange', () => { if (document.hidden && !app.net && app.screen === 'game' && !app.paused && app.match.state !== 'final') app.pause(); });

// Bandeau « succès débloqué », visible dans les menus comme en match
const achEl = document.createElement('div'); achEl.id = 'achv'; document.body.appendChild(achEl);
const achQ = []; let achBusy = false;
function achNext() {
  const x = achQ.shift();
  if (!x) { achBusy = false; achEl.className = ''; return; }
  achBusy = true;
  achEl.innerHTML = '<small>SUCCÈS DÉBLOQUÉ</small><b></b><span></span>';
  achEl.querySelector('b').textContent = x[0].name; achEl.querySelector('span').textContent = `${x[2]} : ${x[1].name}`;
  achEl.className = 'on';
  setTimeout(() => { achEl.className = ''; setTimeout(achNext, 400); }, 4200);
}
onUnlock((a, it, label) => { achQ.push([a, it, label]); if (!achBusy) achNext(); });

newDemo();
ui.main();
// lien d'invitation (?partie=CODE) : on rejoint directement la partie de l'ami
{
  const inv = new URLSearchParams(location.search).get('partie');
  if (inv) {
    history.replaceState(null, '', location.pathname + location.search.replace(/[?&]partie=[^&]*/, '').replace(/^&/, '?') + location.hash);
    ui.online.menu(); ui.online.join(inv);
  }
}
requestAnimationFrame(frame);
window.__hockey = app; // accès pour le débogage et les tests
const boot = document.getElementById('boot'); if (boot) boot.remove(); // écran de chargement

// Application web : cache hors ligne (service worker) quand le jeu est servi par http(s)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]nosw\b/.test(location.search)) {
  const reg = () => {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /^https?:/.test(u));
      if (reg.active) reg.active.postMessage({ cache: [location.href.split('#')[0], ...urls] });
    }).catch(() => { /* pas de cache hors ligne : le jeu fonctionne quand même */ });
  };
  if (document.readyState === 'complete') reg(); else addEventListener('load', reg); // version en un seul fichier : la page est déjà chargée
}
