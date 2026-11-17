// Jeu en ligne : créer ou rejoindre une partie avec un code, salon de choix des équipes
import { getTeams } from '../data/teams.js';
import { hostGame, joinGame, cleanCode } from '../net/peer.js';
import { DIFFS } from '../core/config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// une équipe reçue de l'autre ordinateur doit avoir la forme attendue par le moteur
const validTeam = (t) => t && typeof t === 'object' && Array.isArray(t.players) && t.players.length === 20 && t.lines && t.lines.F && t.lines.F.length === 4
  && t.lines.D && t.lines.D.length === 3 && t.lines.G && t.lines.G.length === 2 && Array.isArray(t.colors) && t.colors.length === 3;
const RULES = ['periodMin', 'skaters', 'offside', 'icing', 'penalties', 'autoLines', 'difficulty'];

export class OnlineUI {
  constructor(ui) { this.ui = ui; this.link = null; this.role = null; this.pick = 0; this.theirs = null; this.pending = null; this.inLobby = false;
    addEventListener('pagehide', () => { if (this.link) this.link.send({ k: 'bye' }); }); // fermeture de l'onglet : prévenir l'ami
  }
  get app() { return this.ui.app; }

  // ---------- accueil ----------
  menu(msg = '') {
    const ui = this.ui;
    this.leave();
    ui.back = () => ui.main();
    ui.show(`<h1>Jouer en ligne</h1>
      <div class="online">
        <div class="ocard"><h3>Créer une partie</h3><p>Tu obtiens un code de 5 lettres à donner à ton ami.</p><button data-a="host" class="primary" data-focus>Créer une partie</button></div>
        <div class="ocard"><h3>Rejoindre une partie</h3><p>Entre le code que ton ami t'a donné.</p>
          <input type="text" data-code maxlength="7" placeholder="CODE" autocomplete="off" spellcheck="false"><button data-a="join">Rejoindre</button></div>
      </div>
      ${msg ? `<p class="msg">${esc(msg)}</p>` : ''}
      <div class="row"><button data-a="back">Retour</button></div>
      <div class="foot">Chacun joue sur son ordinateur avec le même fichier du jeu. L'hôte fait tourner la partie : il doit garder la fenêtre du jeu visible.</div>`, 'career');
    const inp = ui.el.querySelector('[data-code]');
    inp.addEventListener('input', () => { const p = inp.selectionStart; inp.value = cleanCode(inp.value); inp.setSelectionRange(p, p); });
    inp.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.join(inp.value); } e.stopPropagation(); });
    ui.on('[data-a]', (n) => {
      const a = n.dataset.a;
      if (a === 'back') ui.main(); else if (a === 'host') this.host(); else this.join(inp.value);
    });
  }

  wait(title, text, code = '') {
    const ui = this.ui;
    ui.back = () => this.menu();
    ui.show(`<h1>${esc(title)}</h1>${code ? `<div class="bigcode">${esc(code)}</div><button data-a="copy">Copier le code</button>` : ''}
      <p class="dim spin">${esc(text)}</p><div class="row"><button data-a="cancel" ${code ? '' : 'data-focus'}>Annuler</button></div>`, 'career');
    ui.on('[data-a="copy"]', (n) => { try { navigator.clipboard.writeText(code); n.textContent = 'Code copié ✓'; } catch { n.textContent = 'Copie impossible : note le code'; } });
    ui.on('[data-a="cancel"]', () => this.menu());
  }

  async host() {
    this.leave();
    this.role = 'host';
    this.wait('Créer une partie', 'Connexion au serveur…');
    const tok = this.tok = {};
    this.pending = await hostGame({
      code: (c) => { if (this.tok === tok) this.wait('Ta partie est prête', 'Donne ce code à ton ami. En attente de sa connexion…', c); },
      connected: (link) => { if (this.tok === tok) this.connected(link); else link.close(); },
      error: (t) => { if (this.tok === tok) this.menu(t); },
    });
  }

  async join(raw) {
    const c = cleanCode(raw);
    if (c.length !== 5) return this.menu('Le code compte 5 caractères.');
    this.leave();
    this.role = 'guest';
    this.wait('Rejoindre une partie', `Connexion à la partie ${c}…`);
    const tok = this.tok = {};
    this.pending = await joinGame(c, {
      status: (t) => { if (this.tok === tok) { const p = this.ui.el.querySelector('.spin'); if (p) p.textContent = t; } },
      connected: (link) => { if (this.tok === tok) this.connected(link); else link.close(); },
      error: (t) => { if (this.tok === tok) this.menu(t); },
    });
  }

  // Quitte toute partie en ligne en cours (connexion fermée)
  leave() {
    this.tok = null;
    if (this.pending) { this.pending.cancel(); this.pending = null; }
    if (this.link) { const l = this.link; this.link = null; l.send({ k: 'bye' }); setTimeout(() => l.close(), 200); }
    this.theirs = null; this.inLobby = false;
  }

  connected(link) {
    this.link = link; this.pending = null; this.theirs = null;
    link.onMessage = (msg) => this.onMessage(msg);
    link.onClose = () => this.lost('La connexion avec ton ami a été perdue.');
    this.sendPick();
    this.lobby();
  }

  lost(text) {
    if (!this.link) return;
    this.link = null;
    if (this.app.net) this.app.endOnline();
    this.menu(text);
  }

  onMessage(msg) {
    const app = this.app;
    if (app.net && (msg.k === 'f' || msg.k === 'S' || msg.k === 'e' || msg.k === 'i')) { app.net.onMessage(msg); return; }
    if (msg.k === 'pick' && validTeam(msg.team)) { this.theirs = msg.team; if (this.inLobby) this.lobby(); }
    else if (msg.k === 'start' && this.role === 'guest' && validTeam(msg.home) && validTeam(msg.away)) this.startGuest(msg);
    else if (msg.k === 'lobby' && app.net) { app.endOnline(); this.lobby(msg.why === 'quit' ? 'Ton ami a quitté le match.' : ''); }
    else if (msg.k === 'bye') { const l = this.link; this.link = null; if (l) l.close(); if (app.net) app.endOnline(); this.menu('Ton ami a quitté la partie.'); }
  }

  myTeam() { const t = getTeams(); if (this.pick >= t.length) this.pick = 0; return t[this.pick]; }
  sendPick() { if (this.link) this.link.send({ k: 'pick', team: this.myTeam() }); }

  // ---------- salon ----------
  lobby(msg = '') {
    const ui = this.ui, host = this.role === 'host', me = this.myTeam(), th = this.theirs, st = this.app.settings;
    if (!this.link) return this.menu();
    this.inLobby = true;
    ui.back = () => this.menu();
    const same = th && th.city === me.city && th.name === me.name;
    const ping = (this.link.ping ? `${Math.round(this.link.ping)} ms` : '…') + (this.link.via === 'relais' ? ' · via le relais' : ' · connexion directe');
    const rules = `Périodes de ${st.periodMin} min · ${st.skaters} contre ${st.skaters} · hors-jeu ${st.offside ? 'oui' : 'non'} · dégagement refusé ${st.icing ? 'oui' : 'non'} · pénalités ${st.penalties ? 'oui' : 'non'}`;
    ui.show(`<h1>Salon en ligne <small>${host ? 'tu es l\'hôte' : 'tu es l\'invité'} · ping ${ping}</small></h1>
      <div class="vs">
        <div class="pick"><button data-d="-1">◀</button>${ui.teamCard(me, host ? 'TOI · domicile' : 'TOI · visiteur')}<button data-d="1">▶</button></div>
        <div class="mid">VS</div>
        <div class="pick">${th ? ui.teamCard(th, host ? 'TON AMI · visiteur' : 'TON AMI · domicile') : '<div class="card"><p class="dim">Ton ami choisit son équipe…</p></div>'}</div>
      </div>
      ${msg ? `<p class="msg">${esc(msg)}</p>` : ''}${same ? '<p class="msg">Vous avez choisi la même équipe : l\'un de vous doit en changer.</p>' : ''}
      <div class="row">${host ? `<button data-a="go" class="primary" data-focus ${th && !same ? '' : 'disabled'}>Sur la glace !</button>` : '<p class="dim">L\'hôte lancera la partie quand vous serez prêts.</p>'}<button data-a="quit">Quitter le salon</button></div>
      <div class="foot">${host ? `Règles de la partie (tes options) : ${rules}` : 'Les règles et la durée des périodes sont celles de l\'hôte.'} · pas de bagarres ni de reprises en ligne</div>`, 'select');
    if (!host || !th) { const f = ui.el.querySelector('[data-d="1"]'); if (f) f.focus(); }
    ui.on('[data-d]', (n) => { const n2 = getTeams().length; this.pick = (this.pick + +n.dataset.d + n2) % n2; this.sendPick(); this.lobby(); const b = ui.el.querySelector(`[data-d="${n.dataset.d}"]`); if (b) b.focus(); });
    ui.on('[data-a]', (n) => {
      if (n.dataset.a === 'quit') return this.menu();
      // l'hôte lance : il envoie les deux équipes et ses règles
      const set = {}; for (const k of RULES) set[k] = st[k];
      const msgS = { k: 'start', home: me, away: th, set };
      this.link.send(msgS);
      this.inLobby = false; ui.hide();
      this.app.startMatch({ mode: 'game', teams: { home: me, away: th, userHome: true }, online: { link: this.link, role: 'host', set } });
    });
    clearTimeout(this.pingT);
    this.pingT = setTimeout(() => { if (this.inLobby && this.link && ui.el.querySelector('.vs')) { const h = ui.el.querySelector('h1 small'); if (h) h.textContent = `${host ? 'tu es l\'hôte' : 'tu es l\'invité'} · ping ${Math.round(this.link.ping)} ms · ${this.link.via === 'relais' ? 'via le relais' : 'connexion directe'}`; } }, 2500);
  }

  startGuest(msg) {
    this.inLobby = false; this.ui.hide();
    const set = {}; for (const k of RULES) if (msg.set && k in msg.set) set[k] = msg.set[k];
    this.app.startMatch({ mode: 'game', teams: { home: msg.home, away: msg.away, userHome: false }, online: { link: this.link, role: 'guest', set } });
  }
}
export const diffName = (i) => (DIFFS[i] || DIFFS[1]).name;
