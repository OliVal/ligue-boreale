// Menus : principal, choix des équipes, options (touches reconfigurables), pause, résumé d'après-match
import { DIFFS, KEY_LABELS, DEFAULT_KEYS } from '../core/config.js';
import { getTeams } from '../data/teams.js';
import { keyName, TOUCH } from '../engine/input.js';
import { TOUCH_HELP, INSTALL, canInstall } from './touch.js';
import { saveSettings } from '../save/storage.js';
import { periodName } from './hud.js';
import { CAM_NAMES } from '../render/renderer.js';
import { Editor } from './editor.js';
import { logoImg } from '../data/kit.js';
import { CareerUI } from './careerui.js';
import { FranchiseUI } from './franchiseui.js';
import { OnlineUI } from './onlineui.js';
import { locker } from './lockerui.js';
import { ITEMS, equipped, equip, ownedList } from '../save/profile.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class UI {
  constructor(app) {
    this.app = app; this.el = document.getElementById('screen');
    this.sel = { user: 0, opp: 8, home: true };
    this.back = null;
    this.editor = new Editor(this);
    this.career = new CareerUI(this);
    this.franchise = new FranchiseUI(this);
    this.online = new OnlineUI(this);
    addEventListener('keydown', (e) => {
      if (!this.el.classList.contains('on') || this.app.input.capture) return;
      const items = [...this.el.querySelectorAll('button:not([disabled]), select, input')];
      const i = items.indexOf(document.activeElement);
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        const n = items[(i + (e.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length] || items[0];
        if (n) n.focus();
      } else if (e.code === 'Escape' && this.back) { e.preventDefault(); e.stopImmediatePropagation(); const b = this.back; b(); }
    }, true);
  }

  show(html, cls = '') {
    this.el.innerHTML = html; this.el.className = 'on ' + cls;
    const f = this.el.querySelector('[data-focus]') || this.el.querySelector('button:not([disabled])');
    // au doigt : chaque écran s'ouvre en haut (sans défiler jusqu'au bouton qui a le focus clavier)
    if (f) f.focus(TOUCH.on ? { preventScroll: true } : undefined);
    if (TOUCH.on) this.el.scrollTop = 0;
  }
  hide() { this.el.className = ''; this.el.innerHTML = ''; this.back = null; }
  on(sel, fn, ev = 'click') { for (const n of this.el.querySelectorAll(sel)) n.addEventListener(ev, (e) => fn(n, e)); }

  // ---------- menu principal ----------
  main() {
    this.back = null;
    this.app.demoHome = null;
    this.show(`
      <div class="title"><div class="logo">LIGUE<span>BORÉALE</span></div><div class="tag">Hockey 3D · ${getTeams().length} équipes · 2 associations</div></div>
      <div class="menu">
        ${TOUCH.on && !this.app.settings.touchTutoDone ? '<button data-a="tuto" class="primary">Apprendre à jouer au doigt</button>' : ''}
        <button data-a="quick" data-focus>Match rapide</button>
        <button data-a="online">En ligne contre un ami</button>
        <button data-a="career">Carrière</button>
        <button data-a="franchise">Franchise</button>
        <button data-a="shootout">Tirs de barrage</button>
        <button data-a="practice">Entraînement</button>
        <button data-a="editor">Éditeur d'équipe</button>
        <button data-a="locker">Succès et vestiaire</button>
        <button data-a="options">Options</button>
        ${TOUCH.on && this.app.settings.touchTutoDone ? '<button data-a="tuto">Tutoriel au doigt</button>' : ''}
        ${TOUCH.on && canInstall() ? `<button data-a="install">Installer le jeu sur l'écran d'accueil</button>` : ''}
      </div>
      <div class="foot">↑ ↓ pour naviguer · Entrée pour choisir</div>`, 'mainmenu');
    this.on('[data-a]', (n) => {
      const a = n.dataset.a;
      if (a === 'options') this.options(() => this.main());
      else if (a === 'editor') this.editor.list();
      else if (a === 'career') this.career.slots();
      else if (a === 'franchise') this.franchise.slots();
      else if (a === 'online') this.online.menu();
      else if (a === 'locker') locker(this);
      else if (a === 'tuto') this.app.startTutorial();
      else if (a === 'install') this.install();
      else this.teamSelect(a === 'quick' ? 'game' : a);
    });
  }

  // ---------- choix des équipes ----------
  teamCard(t, label) {
    const top = [...t.players].sort((a, b) => b.ovr - a.ovr).slice(0, 4);
    return `<div class="card" style="--c1:${t.colors[0]};--c2:${t.colors[1]};--c3:${t.colors[2]}">
      <div class="lbl">${label}</div>
      <div class="crest">${logoImg(t, 'lg-l')}</div>
      <h2>${esc(t.city)}</h2><h3>${esc(t.name)}</h3>
      <div class="meta">Association de l'${t.conf} · Cote ${t.rating}</div>
      <ul>${top.map((p) => `<li><b>#${p.num}</b> ${esc(p.name)} <i>${p.pos} · ${p.ovr}</i></li>`).join('')}</ul></div>`;
  }

  teamSelect(mode) {
    const teams = getTeams(), s = this.sel;
    if (s.user >= teams.length) s.user = 0; // une équipe créée a pu être supprimée
    if (s.opp >= teams.length || s.opp === s.user) s.opp = (s.user + 8) % teams.length;
    this.back = () => this.main();
    const title = { game: 'Match rapide', shootout: 'Tirs de barrage', practice: 'Entraînement' }[mode];
    const render = () => {
      const u = teams[s.user], o = teams[s.opp];
      this.show(`
        <h1>${title}</h1>
        <div class="vs">
          <div class="pick"><button data-d="user,-1">◀</button>${this.teamCard(u, 'TON ÉQUIPE' + (mode === 'game' ? (s.home ? ' · domicile' : ' · visiteur') : ''))}<button data-d="user,1">▶</button></div>
          <div class="mid">VS</div>
          <div class="pick"><button data-d="opp,-1">◀</button>${this.teamCard(o, mode === 'practice' ? 'GARDIEN ADVERSE' : 'ADVERSAIRE')}<button data-d="opp,1">▶</button></div>
        </div>
        <div class="row">
          <button data-a="edit">Modifier mon équipe</button>
          <button data-a="retro">Chandail : ${ITEMS.jersey.list[equipped().jersey].name.toLowerCase()}</button>
          ${mode === 'game' ? `<button data-a="side">Jouer ${s.home ? 'à domicile' : 'comme visiteur'} (changer)</button>` : ''}
          <button data-a="go" data-focus class="primary">Sur la glace !</button>
          <button data-a="back">Retour</button>
        </div>
        <div class="foot">Difficulté : ${DIFFS[this.app.settings.difficulty].name} · Périodes de ${this.app.settings.periodMin} min · ${this.app.settings.skaters} contre ${this.app.settings.skaters}</div>`, 'select');
      this.on('[data-d]', (n) => {
        const [k, d] = n.dataset.d.split(',');
        do { s[k] = (s[k] + +d + teams.length) % teams.length; } while (s.user === s.opp);
        render();
      });
      this.on('[data-a]', (n) => {
        const a = n.dataset.a;
        if (a === 'side') { s.home = !s.home; render(); }
        else if (a === 'retro') { const l = ownedList('jersey'); equip('jersey', l[(l.indexOf(equipped().jersey) + 1) % l.length]); render(); this.el.querySelector('[data-a="retro"]').focus(); }
        else if (a === 'back') this.main();
        else if (a === 'edit') { this.app.previewTeam(teams[s.user]); this.editor.team(teams[s.user], 'lines'); }
        else { this.hide(); this.app.startMatch({ mode, user: s.user, opp: s.opp, home: mode === 'game' ? s.home : true }); }
      });
    };
    render();
  }

  // ---------- options ----------
  options(back) {
    const st = this.app.settings;
    this.back = back;
    const render = (focus) => {
      const sel = (id, opts, cur) => `<select data-s="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      const chk = (id, label) => `<label class="chk"><input type="checkbox" data-c="${id}" ${st[id] ? 'checked' : ''}> ${label}</label>`;
      this.show(`
        <h1>Options</h1>
        <div class="opts">
          <div class="col">
            <h4>Partie</h4>
            <label>Difficulté ${sel('difficulty', DIFFS.map((d, i) => [i, d.name]), st.difficulty)}</label>
            <label>Durée des périodes ${sel('periodMin', [2, 3, 4, 5, 7, 10, 20].map((v) => [v, v + ' min']), st.periodMin)}</label>
            <label>Format ${sel('skaters', [[5, '5 contre 5'], [4, '4 contre 4'], [3, '3 contre 3']], st.skaters)}</label>
            <h4>Règles</h4>
            ${chk('offside', 'Hors-jeu')}${chk('icing', 'Dégagement refusé')}${chk('penalties', 'Pénalités')}${chk('fights', 'Bagarres')}
            ${chk('autoLines', 'Changements de trio automatiques')}
            <label>Reprises ${sel('replays', [['all', 'Buts et gros jeux'], ['goals', 'Buts seulement'], ['off', 'Aucune']], st.replays)}</label>
            <h4>Son et image</h4>
            <label>Volume <input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-r="volume"></label>
            <label>Taille de l'interface ${sel('uiScale', [[1, 'Normale'], [1.15, 'Grande'], [1.3, 'Très grande']], st.uiScale || 1)}</label>
            <label>Qualité graphique ${sel('quality', [['mobile', 'Mobile (économie)'], ['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute']], st.quality)}</label>
            <div class="tsec"><h4>Écran tactile</h4>
            <label>Contrôles tactiles ${sel('touchMode', [['auto', 'Automatique'], ['on', 'Toujours'], ['off', 'Jamais']], st.touchMode)}</label>
            <label>Taille des boutons ${sel('touchScale', [[0.85, 'Petite'], [1, 'Normale'], [1.15, 'Grande'], [1.3, 'Très grande']], st.touchScale)}</label>
            <label>Sensibilité du joystick ${sel('touchSens', [[0.8, 'Douce'], [1, 'Normale'], [1.25, 'Vive'], [1.5, 'Très vive']], st.touchSens || 1)}</label>
            ${chk('touchFixed', 'Joystick fixe (ne suit pas le pouce)')}${chk('touchAutoSprint', 'Sprint automatique (joystick poussé au bord)')}
            ${chk('touchLefty', 'Gaucher (joystick à droite)')}<label>Aide au doigt (visée, passes, changement de joueur) ${sel('touchAssist', [[0, 'Aucune'], [1, 'Normale'], [2, 'Forte']], st.touchAssist === false ? 0 : st.touchAssist === true ? 1 : st.touchAssist)}</label>${chk('touchVibe', 'Vibrations (au doigt et manette)')}
            <button data-l="layout">Disposer les contrôles (déplacer boutons et joystick)</button></div>
          </div>
          <div class="col">${TOUCH.on ? TOUCH_HELP : `
            <h4>Touches <small>(clique puis appuie sur la nouvelle touche)</small></h4>
            <div class="keys">${Object.keys(KEY_LABELS).map((a) => `<div><span>${KEY_LABELS[a]}</span><button data-k="${a}">${esc(keyName(st.keys[a]))}</button></div>`).join('')}</div>
            <button data-a="resetKeys">Rétablir les touches par défaut</button>`}
          </div>
        </div>
        <div class="row"><button data-a="back" ${focus ? '' : 'data-focus'} class="primary">Retour</button></div>`, 'options');
      if (focus) { const f = this.el.querySelector(`[data-k="${focus}"]`); if (f) f.focus(); }
      const save = () => { saveSettings(st); this.app.applySettings(); };
      this.on('[data-s]', (n) => { const k = n.dataset.s; st[k] = k === 'quality' || k === 'replays' || k === 'touchMode' ? n.value : +n.value; save(); if (k === 'touchMode') render(); }, 'change');
      this.on('[data-c]', (n) => { st[n.dataset.c] = n.checked; save(); }, 'change');
      this.on('[data-l="layout"]', () => this.touchLayout(() => { save(); render(); }));
      this.on('[data-r]', (n) => { st.volume = +n.value; save(); }, 'input');
      this.on('[data-k]', (n) => {
        const a = n.dataset.k;
        n.textContent = '…'; n.classList.add('wait');
        this.app.input.capture = (code) => {
          if (code !== 'Escape' || a === 'pause') {
            for (const o of Object.keys(st.keys)) if (o !== a && st.keys[o] === code) st.keys[o] = st.keys[a]; // échange si déjà utilisée
            st.keys[a] = code; save();
          }
          render(a);
        };
      });
      this.on('[data-a]', (n) => {
        if (n.dataset.a === 'resetKeys') { Object.assign(st.keys, DEFAULT_KEYS); save(); render(); }
        else back();
      });
    };
    render();
  }

  // ---------- tableaux de statistiques ----------
  statsHtml(m) {
    const [a, b] = m.teams;
    const fo = a.stats.fow + b.stats.fow || 1;
    const rows = [
      ['Tirs au but', a.stats.shots, b.stats.shots], ['Mises en échec', a.stats.hits, b.stats.hits],
      ['Mises au jeu gagnées', `${a.stats.fow} (${Math.round(a.stats.fow / fo * 100)} %)`, `${b.stats.fow} (${Math.round(b.stats.fow / fo * 100)} %)`],
      ['Avantages numériques', `${a.stats.ppg}/${a.stats.ppo}`, `${b.stats.ppg}/${b.stats.ppo}`],
      ['Minutes de pénalité', a.stats.pim, b.stats.pim], ['Tirs bloqués', a.stats.blk, b.stats.blk],
      ['Temps en zone offensive', mmss(a.stats.toa), mmss(b.stats.toa)],
    ];
    const team = `<table class="tstats"><tr><th>${esc(a.data.abbr)}</th><th></th><th>${esc(b.data.abbr)}</th></tr>
      ${rows.map((r) => `<tr><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td></tr>`).join('')}</table>`;
    const players = (t) => {
      const sk = t.roster.filter((p) => p.pos !== 'G' && p.st.toi > 0).sort((x, y) => (y.st.g + y.st.a) - (x.st.g + x.st.a) || y.st.sog - x.st.sog);
      const gk = t.roster.filter((p) => p.pos === 'G' && p.st.sa > 0);
      return `<table class="pstats"><tr><th colspan="2">${esc(t.data.city)} ${esc(t.data.name)}</th><th>B</th><th>A</th><th>PTS</th><th>T</th><th>MÉ</th><th>PUN</th><th>TG</th></tr>
        ${sk.map((p) => `<tr><td>${p.num}</td><td>${esc(p.name)} <i>${p.pos}</i></td><td>${p.st.g}</td><td>${p.st.a}</td><td>${p.st.g + p.st.a}</td><td>${p.st.sog}</td><td>${p.st.hits}</td><td>${p.st.pim}</td><td>${mmss(p.st.toi)}</td></tr>`).join('')}
        ${gk.map((p) => `<tr class="gk"><td>${p.num}</td><td>${esc(p.name)} <i>G</i></td><td colspan="7">${p.st.sv} arrêts sur ${p.st.sa} tirs (${p.st.sa ? (p.st.sv / p.st.sa).toFixed(3).slice(1) : '—'})</td></tr>`).join('')}</table>`;
    };
    return { team, players: players(a) + players(b) };
  }

  goalsHtml(m) {
    if (!m.goals.length) return '<p class="dim">Aucun but.</p>';
    return `<ul class="goals">${m.goals.map((g) => {
      const t = m.teams[g.team];
      if (g.str === 'TB') return `<li><b>${esc(t.data.abbr)}</b> But gagnant en tirs de barrage</li>`;
      const as = g.assists.length ? g.assists.map((p) => esc(p.name)).join(', ') : 'sans aide';
      return `<li><b>${esc(t.data.abbr)}</b> ${periodName(g.period)} ${mmss(g.clock)} — ${esc(g.scorer.name)} <i>(${as})</i>${g.str ? ` <em>${g.str}</em>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  // ---------- pause ----------
  pause(m) {
    const app = this.app, s = this.statsHtml(m), [a, b] = m.teams;
    this.back = () => app.resume();
    this.show(`
      <h1>Pause${app.net ? ' <small>la partie continue pendant la pause</small>' : ''}</h1>
      <div class="scoreline">${esc(a.data.abbr)} <b>${a.score}</b> — <b>${b.score}</b> ${esc(b.data.abbr)} <small>${m.mode === 'practice' ? 'Entraînement' : periodName(m.period) + ' · ' + mmss(m.clock)}</small></div>
      ${TOUCH.on ? `<p class="rotnote">Tourne ton téléphone à l'horizontale pour reprendre le match.</p>` : ''}
      <div class="cols"><div class="menu small">
        <button data-a="resume" data-focus class="primary">Reprendre</button>
        <button data-a="cam">Caméra : ${CAM_NAMES[app.renderer.camMode]}</button>
        <button data-a="options">Options</button>
        ${TOUCH.on ? '<button data-a="help">Contrôles au doigt</button>' : ''}
        ${TOUCH.on && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen) && !(document.fullscreenElement || document.webkitFullscreenElement) && !matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ? '<button data-a="full">Plein écran</button>' : ''}
        <button data-a="quit">${app.net ? 'Quitter le match (retour au salon)' : app.tracker || app.franchise ? 'Abandonner (match non compté)' : 'Quitter le match'}</button>
      </div><div>${m.mode === 'practice' ? '' : s.team + this.goalsHtml(m)}</div></div>
      ${m.mode === 'practice' ? '' : `<div class="scroll">${s.players}</div>`}`, 'pause');
    this.on('[data-a]', (n) => {
      const x = n.dataset.a;
      if (x === 'resume') app.resume();
      else if (x === 'cam') { app.renderer.nextCamera(); this.pause(m); }
      else if (x === 'options') this.options(() => this.pause(m));
      else if (x === 'help') this.touchHelp(() => this.pause(m));
      else if (x === 'full') { app.touch.fullscreen(); app.resume(); }
      else app.toMenu();
    });
  }

  // Installer le jeu comme une application (plein écran, icône sur l'écran d'accueil, fonctionne sans réseau sauf en ligne)
  install() {
    if (INSTALL.prompt) {
      const p = INSTALL.prompt; INSTALL.prompt = null;
      p.prompt(); p.userChoice.then((c) => { if (c && c.outcome === 'accepted') INSTALL.done = true; this.main(); }).catch(() => this.main());
      return;
    }
    this.back = () => this.main();
    this.show(`<h1>Installer le jeu</h1><div class="opts touchhelp"><div class="col"><ul class="thelp">
        <li><b>1.</b> Dans Safari, touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li>
        <li><b>2.</b> Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</li>
        <li><b>3.</b> Ouvre Ligue Boréale depuis la nouvelle icône : le jeu s'affiche en plein écran, comme une application.</li>
      </ul></div></div><div class="row"><button data-a="ok" class="primary" data-focus>Compris</button></div>`, 'pause');
    this.on('[data-a="ok"]', () => this.main());
  }

  // Disposition des contrôles tactiles : l'écran d'options s'efface le temps de déplacer boutons et joystick
  touchLayout(done) {
    const keep = this.back;
    this.hide();
    const t = this.app.touch;
    if (!t.on) t.enable(true);
    t.editLayout(() => { this.back = keep; done(); });
  }

  // Aide des contrôles tactiles (au premier match joué au doigt, et depuis le menu pause)
  touchHelp(done, tuto = null) {
    this.back = done;
    this.show(`<h1>Jouer au doigt</h1><div class="opts touchhelp"><div class="col">${TOUCH_HELP}</div></div>
      <div class="row">${tuto ? '<button data-a="tuto">Faire le tutoriel (2 min)</button>' : ''}<button data-a="ok" class="primary" data-focus>C'est parti !</button></div>`, 'pause');
    this.on('[data-a="ok"]', () => done());
    this.on('[data-a="tuto"]', () => tuto());
  }

  // ---------- résumé d'après-match ----------
  summary(m) {
    const app = this.app, s = this.statsHtml(m), [a, b] = m.teams;
    this.back = null;
    const stars = m.stars.map((st, i) => `<div class="star"><div class="n">${'★'.repeat(3 - i)}</div><b>${esc(st.pl.name)}</b><span>${esc(st.team.data.abbr)} · ${st.pl.pos === 'G' ? `${st.pl.st.sv} arrêts` : `${st.pl.st.g} B, ${st.pl.st.a} A`}</span></div>`).join('');
    this.show(`
      <h1>Résumé du match</h1>
      <div class="scoreline big">${esc(a.data.city)} <b>${a.score}</b> — <b>${b.score}</b> ${esc(b.data.city)} <small>${m.period === 4 ? 'en prolongation' : m.period === 5 ? 'en tirs de barrage' : 'Final'}</small></div>
      <h4>Les Trois étoiles</h4><div class="stars">${stars}</div>
      <div class="cols"><div>${s.team}</div><div><h4>Sommaire des buts</h4>${this.goalsHtml(m)}</div></div>
      <div class="scroll">${s.players}</div>
      <div class="row">${app.tracker ? '<button data-a="career" data-focus class="primary">Continuer la carrière</button>'
        : app.franchise ? '<button data-a="franchise" data-focus class="primary">Continuer la saison</button>'
        : app.net ? '<button data-a="lobby" data-focus class="primary">Retour au salon</button>'
        : '<button data-a="again" data-focus class="primary">Rejouer</button><button data-a="menu">Menu principal</button>'}</div>`, 'summary');
    this.on('[data-a]', (n) => {
      if (n.dataset.a === 'career') app.careerDone();
      else if (n.dataset.a === 'franchise') app.franchiseDone();
      else if (n.dataset.a === 'lobby') { app.endOnline(); this.online.lobby(); }
      else if (n.dataset.a === 'again') { this.hide(); app.startMatch(app.lastOpts); } else app.toMenu();
    });
  }
}
