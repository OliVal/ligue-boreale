// Série éliminatoire en match rapide : deux équipes, trois de cinq ou quatre de sept, avec toute l'ambiance des séries
// (serviettes, barbes, foule bruyante, prolongations sans tirs de barrage) et la remise de la Coupe Boréale au bout.
// La série en cours est gardée dans le navigateur : on la reprend depuis le menu principal.
import { getTeams } from '../data/teams.js';
import { logoImg } from '../data/kit.js';

const KEY = 'hockeyweb.series.v1';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HOME = { 3: [0, 1, 4], 4: [0, 1, 4, 6] }; // matchs à domicile de l'équipe qui a l'avantage de la glace (2-2-1, 2-2-1-1-1)

export function loadSeries() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function saveSeries(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ } }

// petit tirage de pointage d'après la cote des équipes (match simulé), jamais nul (prolongation)
function poisson(l) { let k = 0, p = Math.exp(-l), s = p; const u = Math.random(); while (u > s && k < 12) { k++; p *= l / k; s += p; } return k; }
function simScore(rh, ra) {
  const d = (rh - ra) * 0.07;
  let h = poisson(Math.max(0.6, 3.05 + d)), a = poisson(Math.max(0.6, 2.9 - d)), ot = false;
  if (h === a) { ot = true; if (Math.random() < 0.5 + d * 0.3) h++; else a++; }
  return { h, a, ot };
}

export class SeriesUI {
  constructor(ui) { this.ui = ui; this.s = null; }
  get app() { return this.ui.app; }

  // menu principal → série en cours, ou choix des équipes
  open() { this.s = loadSeries(); if (this.s && this.valid()) this.hub(); else { this.s = null; this.setup(); } }
  valid() { const n = getTeams().length; return this.s.user < n && this.s.opp < n; }

  // choix des équipes, du format et de l'avantage de la glace
  setup(f) {
    const ui = this.ui, teams = getTeams(), sel = ui.sel;
    f = f || { wins: 4, ice: true };
    if (sel.opp === sel.user) sel.opp = (sel.user + 8) % teams.length;
    ui.back = () => ui.main();
    const render = () => {
      const u = teams[sel.user], o = teams[sel.opp];
      ui.show(`<h1>Série éliminatoire</h1>
        <div class="vs">
          <div class="pick"><button data-d="user,-1">◀</button>${ui.teamCard(u, 'TON ÉQUIPE' + (f.ice ? ' · avantage de la glace' : ''))}<button data-d="user,1">▶</button></div>
          <div class="mid">VS</div>
          <div class="pick"><button data-d="opp,-1">◀</button>${ui.teamCard(o, 'ADVERSAIRE' + (f.ice ? '' : ' · avantage de la glace'))}<button data-d="opp,1">▶</button></div>
        </div>
        <div class="row">
          <button data-a="fmt">Format : ${f.wins === 4 ? 'quatre de sept' : 'trois de cinq'} (changer)</button>
          <button data-a="ice">Avantage de la glace : ${f.ice ? 'ton équipe' : 'l\'adversaire'} (changer)</button>
          <button data-a="go" data-focus class="primary">Commencer la série</button>
          <button data-a="back">Retour</button>
        </div>
        <div class="foot">Finale de la Coupe Boréale · prolongations à 5 contre 5 jusqu'au premier but · la série est sauvegardée après chaque match</div>`, 'select');
      ui.on('[data-d]', (n) => { const [k, d] = n.dataset.d.split(','); do { sel[k] = (sel[k] + +d + teams.length) % teams.length; } while (sel.user === sel.opp); render(); });
      ui.on('[data-a]', (n) => {
        const a = n.dataset.a;
        if (a === 'back') return ui.main();
        if (a === 'fmt') { f.wins = f.wins === 4 ? 3 : 4; return render(); }
        if (a === 'ice') { f.ice = !f.ice; return render(); }
        this.s = { v: 1, user: sel.user, opp: sel.opp, wins: f.wins, ice: f.ice, wa: 0, wb: 0, log: [], over: false };
        saveSeries(this.s); this.hub();
      });
    };
    render();
  }

  game() { return this.s.wa + this.s.wb; } // index du prochain match (0 = match 1)
  homeNext() { const homeIce = HOME[this.s.wins].includes(this.game()); return this.s.ice ? homeIce : !homeIce; }

  // tableau de la série
  hub() {
    const ui = this.ui, s = this.s, teams = getTeams(), u = teams[s.user], o = teams[s.opp];
    ui.back = () => ui.main();
    const n = this.game() + 1, home = this.homeNext(), W = s.wins;
    const state = s.over ? (s.wa >= W ? `<div class="cupwin" style="--c1:${u.colors[0]}"><div class="cup">🏆</div><h2>CHAMPIONS !</h2><p>${esc(u.city)} ${esc(u.name)} remportent la Coupe Boréale ${s.wa}-${s.wb}</p></div>`
      : `<p class="poser">Éliminés ${s.wb}-${s.wa} par ${esc(o.city)}. La Coupe Boréale leur revient.</p>`)
      : `<p class="poser">Match ${n} · ${home ? 'à domicile' : 'à l\'étranger'}${s.wa === W - 1 && s.wb === W - 1 ? ' · <b>match décisif !</b>' : s.wa === W - 1 ? ' · <b>une victoire de la coupe</b>' : s.wb === W - 1 ? ' · <b>dos au mur</b>' : ''}</p>`;
    const games = s.log.map((g, i) => `<tr><td>Match ${i + 1}</td><td class="l">${g.home ? 'c.' : 'à'} ${esc(o.abbr)}</td><td>${g.gf > g.ga ? 'V' : 'D'} ${g.gf}-${g.ga}${g.ot ? ' (P)' : ''}</td><td class="dim">${g.sim ? 'simulé' : 'joué'}</td></tr>`).join('');
    ui.show(`<h1>Finale de la Coupe Boréale <small>${W === 4 ? 'quatre de sept' : 'trois de cinq'}</small></h1>
      <div class="srs"><div class="st">${logoImg(u, 'lg-l')}<b>${esc(u.abbr)}</b></div><div class="sc"><em>${s.wa}</em><i>—</i><em>${s.wb}</em></div><div class="st">${logoImg(o, 'lg-l')}<b>${esc(o.abbr)}</b></div></div>
      ${state}
      ${games ? `<table class="ctable srst">${games}</table>` : ''}
      <div class="row">${s.over ? '<button data-a="new" data-focus class="primary">Nouvelle série</button>'
        : '<button data-a="play" data-focus class="primary">Jouer le match</button><button data-a="sim">Simuler ce match</button><button data-a="quit">Abandonner la série</button>'}
        <button data-a="menu">Menu principal</button></div>`, 'select');
    ui.on('[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'menu') return ui.main();
      if (a === 'new') { saveSeries(null); this.s = null; return this.setup(); }
      if (a === 'quit') {
        if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmer l\'abandon'; return; }
        saveSeries(null); this.s = null; return ui.main();
      }
      if (a === 'sim') {
        const r = simScore(home ? u.rating : o.rating, home ? o.rating : u.rating);
        this.record(home ? r.h : r.a, home ? r.a : r.h, r.ot, home, true);
        return this.hub();
      }
      // jouer : ambiance des séries; le match qui peut donner la coupe a la remise sur la glace
      const clinch = s.wa === W - 1;
      ui.hide();
      this.app.startMatch({ mode: 'game', user: s.user, opp: s.opp, home, playoff: true, series: true,
        label: `FINALE DE LA COUPE · MATCH ${n}`, cup: clinch ? { name: 'Coupe Boréale', year: String(new Date().getFullYear()) } : null });
    });
  }

  record(gf, ga, ot, home, sim) {
    const s = this.s;
    s.log.push({ gf, ga, ot, home, sim });
    if (gf > ga) s.wa++; else s.wb++;
    if (s.wa >= s.wins || s.wb >= s.wins) s.over = true;
    saveSeries(s);
  }

  // fin d'un match joué
  afterMatch(m) {
    if (!this.s) this.s = loadSeries();
    if (!this.s) return this.ui.main();
    const U = m.teams[m.userTeam], O = m.teams[1 - m.userTeam];
    this.record(U.score, O.score, m.period > 3, m.userTeam === 0, false);
    this.hub();
  }
}
