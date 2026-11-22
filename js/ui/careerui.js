// Écrans du mode Carrière : emplacements, création du joueur, tableau de bord, repêchage, contrats
import * as C from '../career/career.js';
import { leagueTeams, LEAGUES } from '../career/leagues.js';
import { loadCareer, saveCareer, deleteCareer, CAREER_SLOTS, saveLast } from '../save/storage.js';
import { F_STYLES, D_STYLES, G_STYLES, POS_LABELS, ATTRS, ATTR_LABELS } from '../data/teams.js';

// Attributs montrés pour un gardien
const G_SHOW = ['ref', 'pos', 'acc', 'end', 'pas'];
const svLine = (st) => `${st.sv || 0} arrêts sur ${st.sa || 0} tirs (${C.fmtSv(st)}) · ${st.ga || 0} but${st.ga > 1 ? 's' : ''} accordé${st.ga > 1 ? 's' : ''}`;
import { kitFor, logoCanvas, logoImg } from '../data/kit.js';
import { Preview3D } from '../render/preview.js';
import { unlock } from '../save/profile.js';
import { TOUCH } from '../engine/input.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (x) => `${x.toFixed(2).replace('.', ',')} M$`;
const ord = (n) => (n === 1 ? '1er' : n + 'e');
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const bar = (v, cls = '') => `<div class="cbar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`;
const LG = ['JUN', 'MIN', 'GDE'];

export class CareerUI {
  constructor(ui) { this.ui = ui; this.c = null; this.slot = 0; this.tab = 'home'; }
  save() { saveCareer(this.slot, this.c); }

  // ---------- emplacements de sauvegarde ----------
  slots() {
    const ui = this.ui;
    ui.back = () => ui.main();
    const cards = [];
    for (let i = 0; i < CAREER_SLOTS; i++) {
      const c = loadCareer(i);
      if (!c) { cards.push(`<div class="slot empty"><h3>Emplacement ${i + 1}</h3><p class="dim">Vide</p><button data-new="${i}">Nouvelle carrière</button></div>`); continue; }
      const t = leagueTeams(c.season.lg)[c.season.team], T = C.totals(c);
      cards.push(`<div class="slot" style="--c1:${t.colors[0]}"><h3>${esc(c.name)} <small>#${c.num} · ${c.pos}</small></h3>
        <p>${logoImg(t, 'lg-s')} ${esc(t.city)} ${esc(t.name)}</p>
        <p class="dim">${LEAGUES[c.season.lg].short} · saison ${c.year} · ${c.age} ans · cote ${C.ovr(c)}</p>
        <p class="dim">${T.gp} PJ · ${c.pos === 'G' ? `${C.fmtSv(T)} · ${T.so} BL` : `${T.g} B · ${T.a} A`}</p>
        <button data-load="${i}" ${cards.some((x) => x.includes('data-focus')) ? '' : 'data-focus'} class="primary">Continuer</button><button data-del="${i}">Effacer</button></div>`);
    }
    ui.show(`<h1>Carrière</h1><div class="slots">${cards.join('')}</div>
      <div class="row"><button data-a="back">Retour</button></div>
      <div class="foot">La carrière est sauvegardée automatiquement après chaque match et chaque décision.</div>`, 'career');
    ui.on('[data-new]', (n) => this.create(+n.dataset.new));
    ui.on('[data-load]', (n) => { this.slot = +n.dataset.load; this.c = loadCareer(this.slot); this.tab = 'home'; this.route(); });
    ui.on('[data-del]', (n) => {
      if (n.dataset.sure) { deleteCareer(+n.dataset.del); this.slots(); } else { n.dataset.sure = 1; n.textContent = 'Confirmer l\'effacement'; }
    });
    ui.on('[data-a]', () => ui.main());
  }

  // ---------- création du joueur ----------
  create(slot, f) {
    const ui = this.ui, teams = leagueTeams(0);
    f = f || { name: '', num: 9, pos: 'C', style: 'Marqueur', hand: -1, team: 0, skin: 1, tape: 0, h: 1, w: 1 };
    ui.back = () => this.slots();
    const styles = f.pos === 'G' ? G_STYLES : f.pos === 'D' ? D_STYLES : F_STYLES;
    if (!styles.includes(f.style)) f.style = styles[0];
    const look = () => ({ skin: C.LOOKS.skin[f.skin][0], tape: C.LOOKS.tape[f.tape][0], h: C.LOOKS.h[f.h][0], w: C.LOOKS.w[f.w][0] });
    const sel = (k, opts) => `<select data-f="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f[k]) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const idx = (k) => C.LOOKS[k].map((o, i) => [i, o[1]]);
    const t = teams[f.team];
    ui.show(`<h1>Crée ton joueur</h1>
      <div class="create">
        <div class="col">
          <h4>Identité</h4>
          <label>Nom <input type="text" data-t="name" maxlength="22" placeholder="Prénom Nom" value="${esc(f.name)}" data-focus></label>
          <label>Numéro <input type="number" data-t="num" min="1" max="99" value="${f.num}"></label>
          <label>Position ${sel('pos', ['C', 'LW', 'RW', 'D', 'G'].map((p) => [p, POS_LABELS[p]]))}</label>
          <label>Style ${sel('style', styles.map((s) => [s, s]))}</label>
          <label>${f.pos === 'G' ? 'Mitaine' : 'Lancer'} ${sel('hand', f.pos === 'G' ? [[-1, 'Main gauche'], [1, 'Main droite']] : [[-1, 'Gaucher'], [1, 'Droitier']])}</label>
          <h4>Apparence</h4>
          <label>Teint ${sel('skin', idx('skin'))}</label>
          <label>Taille ${sel('h', idx('h'))}</label>
          <label>Gabarit ${sel('w', idx('w'))}</label>
          <label>Ruban du bâton ${sel('tape', idx('tape'))}</label>
        </div>
        <div class="col mid"><div data-pv class="pv"></div><p class="dim">${esc(f.style)} · ${POS_LABELS[f.pos]}</p></div>
        <div class="col">
          <h4>Équipe junior</h4>
          <label>Équipe ${sel('team', teams.map((q, i) => [i, `${q.city} ${q.name}`]))}</label>
          <p>${logoImg(t, 'lg-l')}</p>
          <p class="dim">${LEAGUES[0].name} · 14 matchs. ${f.pos === 'G' ? 'Tu commences à 17 ans comme gardien partant. Fais des arrêts pour te faire repêcher en fin de saison.' : `Tu commences à 17 ans sur le 2e ${f.pos === 'D' ? 'duo' : 'trio'}. Joue bien pour monter dans l'alignement et te faire repêcher en fin de saison.`}</p>
          <p class="dim">${f.pos === 'G' ? 'Tu contrôles ton gardien, vu de derrière le filet : glisse, papillon, plongeon, geler la rondelle et relances.' : `Dans ce mode, tu ne contrôles que ton joueur. Sur le banc, le match avance en accéléré; ${TOUCH.on ? 'le bouton ⏩' : 'une touche'} te permet de sauter jusqu'à ta prochaine présence.`}</p>
        </div>
      </div>
      <div class="row"><button data-a="go" class="primary">Commencer la carrière</button><button data-a="back">Retour</button></div>`, 'career');
    try {
      this.pv = this.pv || new Preview3D();
      ui.el.querySelector('[data-pv]').appendChild(this.pv.canvas);
      this.pv.setKit({ ...kitFor(t, 'home'), logo: logoCanvas(t) }, f.num, look(), f.pos === 'G');
    } catch { ui.el.querySelector('[data-pv]').textContent = 'Aperçu 3D indisponible sur cet appareil.'; }
    const read = () => {
      f.name = ui.el.querySelector('[data-t="name"]').value;
      f.num = Math.max(1, Math.min(99, Math.round(+ui.el.querySelector('[data-t="num"]').value) || 9));
    };
    ui.on('[data-f]', (n) => {
      read();
      const k = n.dataset.f; f[k] = k === 'pos' || k === 'style' ? n.value : +n.value;
      if (k === 'pos' && n.value === 'G' && f.num === 9) f.num = 30;
      this.create(slot, f);
      const again = ui.el.querySelector(`[data-f="${k}"]`); if (again) again.focus();
    }, 'change');
    ui.on('[data-t="num"]', () => { read(); this.create(slot, f); const n = ui.el.querySelector('[data-t="num"]'); n.focus(); }, 'change');
    ui.on('[data-a]', (n) => {
      if (n.dataset.a === 'back') return this.slots();
      read();
      const name = f.name.trim().replace(/\s+/g, ' ') || 'Alex Recrue';
      this.slot = slot; this.tab = 'home';
      this.c = C.newCareer({ name, num: f.num, pos: f.pos, style: f.style, hand: f.hand, look: look(), team: f.team });
      this.save(); this.route();
    });
  }

  // Affiche l'écran qui correspond à la phase de la carrière
  route() {
    saveLast('career', this.slot);
    const p = this.c.phase, c = this.c;
    // succès
    if (c.drafted) unlock('drafted');
    if (c.season.lg === 2) unlock('bigLeague');
    if (c.level >= 10) unlock('level10');
    if (C.unlocked(c).length) unlock('ability');
    if (p === 'end') this.seasonEnd(); else if (p === 'draft') this.draft(); else if (p === 'contract') this.contract(); else this.hub();
  }

  head() {
    const c = this.c, t = C.myTeam(c), ct = c.contract;
    const deal = ct.type === 'junior' ? 'Junior · admissible au repêchage' : `${money(ct.salary)} · ${ct.years} an${ct.years > 1 ? 's' : ''} restant${ct.years > 1 ? 's' : ''}`;
    return `<div class="chead" style="--c1:${t.colors[0]}">
      <div class="who">${logoImg(t, 'lg-l')}<div><b>#${c.num} ${esc(c.name)}</b><span>${POS_LABELS[c.pos]} · ${esc(c.style)} · ${c.age} ans</span>
        <span>${esc(t.city)} ${esc(t.name)} · ${LEAGUES[c.season.lg].short} · saison ${c.year}</span></div></div>
      <div class="kpi"><b>${C.ovr(c)}</b><span>Cote</span></div>
      <div class="kpi wide"><b>Niveau ${c.level}</b>${bar(c.xp / C.xpNeed(c))}<span>${c.xp} / ${C.xpNeed(c)} XP</span></div>
      <div class="kpi wide"><b>${C.lineName(c)}</b>${bar(c.trust / 100, c.trust >= 65 ? 'good' : c.trust <= 35 ? 'bad' : '')}<span>Confiance de l'entraîneur</span></div>
      <div class="kpi wide"><b>Contrat</b><span>${deal}</span><span>Gains : ${money(c.earned)}</span></div>
    </div>`;
  }

  // ---------- tableau de bord ----------
  hub() {
    const c = this.c, ui = this.ui, g = C.nextGame(c), tab = this.tab;
    ui.back = () => ui.main();
    const tabs = [['home', 'Aperçu'], ['tree', `Compétences${c.sp ? ` (${c.sp})` : ''}`], ['stats', 'Statistiques'], ['table', 'Classement'], ['sched', 'Calendrier']];
    const body = tab === 'tree' ? this.treeHtml() : tab === 'stats' ? this.statsHtml() : tab === 'table' ? this.tableHtml() : tab === 'sched' ? this.schedHtml() : this.homeHtml(g);
    ui.show(`${this.head()}
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'cur' : ''}">${l}</button>`).join('')}</div>
      <div class="cbody">${body}</div>
      <div class="row">
        <button data-a="play" class="primary" data-focus>Jouer le match</button>
        <button data-a="sim">Simuler ce match</button>
        <button data-a="simAll">Simuler le reste de la saison</button>
        <button data-a="menu">Menu principal</button>
      </div>`, 'career');
    ui.on('[data-tab]', (n) => { this.tab = n.dataset.tab; this.hub(); });
    ui.on('[data-buy]', (n) => { if (C.buy(c, n.dataset.buy)) { this.save(); if (C.unlocked(c).length) unlock('ability'); this.hub(); } });
    ui.on('[data-eq]', (n) => { c.equip = n.dataset.eq; this.save(); this.hub(); });
    ui.on('[data-a]', (n) => {
      const a = n.dataset.a;
      if (a === 'menu') return ui.main();
      if (a === 'play') { ui.hide(); ui.app.startMatch({ mode: 'game', career: c, teams: C.matchTeams(c) }); return; }
      if (a === 'sim') return this.afterMatch(C.simMyGame(c));
      if (n.dataset.sure) {
        const year = c.year, lg = c.season.lg;
        while (c.phase === 'season' && c.year === year && c.season.lg === lg) C.recordGame(c, C.simMyGame(c));
        this.save(); this.route();
      } else { n.dataset.sure = 1; n.textContent = `Confirmer : simuler ${C.gamesLeft(c)} matchs`; }
    });
  }

  homeHtml(g) {
    const c = this.c, t = C.myTeam(c), a = C.effAttrs(c), s = c.season, rec = (r) => `${r.w}-${r.l}-${r.otl}`;
    const mine = s.table[s.team], theirs = s.table[g.opp], last = s.log[s.log.length - 1];
    const ab = c.equip ? C.ABILITIES[c.equip] : null;
    return `<div class="cols3">
      <div><h4>Prochain match · ${s.round + 1} de ${s.rounds.length}</h4>
        <div class="next">${logoImg(g.home ? g.team : t, 'lg-l')}<span>à</span>${logoImg(g.home ? t : g.team, 'lg-l')}</div>
        <p><b>${g.home ? 'À domicile contre' : 'En visite chez'} ${esc(g.team.city)}</b><br>${esc(g.team.name)} (${rec(theirs)}) · cote ${g.team.rating}</p>
        <p class="dim">${esc(t.name)} : ${rec(mine)} · ${ord(C.myRank(c))} rang</p>
        ${last ? `<p class="dim">Dernier match : ${last.gf > last.ga ? 'victoire' : 'défaite'} ${last.gf}-${last.ga} ${last.home ? 'c.' : 'à'} ${esc(last.opp)} · ${c.pos === 'G' ? `${last.sv || 0} arrêts sur ${last.sa || 0}` : `${last.g} B, ${last.a} A`} · note ${last.rating.toFixed(1)}</p>` : ''}
      </div>
      <div><h4>Attributs</h4><table class="attrs">${(c.pos === 'G' ? G_SHOW : ATTRS).map((k) => `<tr><td>${ATTR_LABELS[k]}</td><td>${bar((a[k] - 30) / 69)}</td><td><b>${a[k]}</b>${a[k] > c.a[k] ? ` <i>+${a[k] - c.a[k]}</i>` : ''}</td></tr>`).join('')}</table>
        <p class="dim">Capacité : ${ab ? `<b>${ab.name}</b>` : 'aucune (à débloquer dans l\'arbre de compétences)'}</p></div>
      <div><h4>Nouvelles</h4><ul class="news">${c.news.map((n) => `<li>${esc(n)}</li>`).join('') || '<li class="dim">Rien à signaler.</li>'}</ul>
        ${c.drafted ? `<p class="dim">Repêché en ${ord(c.drafted.round)} ronde (${ord(c.drafted.pick)} au total) par ${esc(leagueTeams(2)[c.drafted.team].city)}.</p>` : ''}</div>
    </div>`;
  }

  treeHtml() {
    const c = this.c;
    const col = (b) => {
      const pts = C.branchPts(c, b);
      return `<div class="branch"><h4>${esc(b.name)} <small>${pts} pt${pts > 1 ? 's' : ''}</small></h4>${b.nodes.map((n) => {
        const r = C.rank(c, n.id), can = C.canBuy(c, n.id), full = r >= n.max;
        const eff = n.ability ? C.ABILITIES[n.ability].desc + (r ? '' : ` Exige ${C.ABILITY_NEED} points dans la branche; coûte 2 points.`)
          : Object.keys(n.eff).map((k) => `+${n.eff[k]} ${ATTR_LABELS[k]}`).join(', ') + ' par rang';
        const eq = n.ability && r ? (c.equip === n.ability ? '<em>Équipée</em>' : `<button data-eq="${n.ability}">Équiper</button>`) : '';
        return `<div class="node${full ? ' full' : ''}${n.ability ? ' abil' : ''}"><div><b>${esc(n.name)}</b> <span class="pips">${'●'.repeat(r)}${'○'.repeat(n.max - r)}</span><p>${eff}</p></div>
          ${full ? eq : `<button data-buy="${n.id}" ${can ? '' : 'disabled'}>${n.ability ? 'Débloquer' : 'Améliorer'}</button>`}</div>`;
      }).join('')}</div>`;
    };
    return `<p class="pts">Points de compétence à dépenser : <b>${c.sp}</b> <span class="dim">· un point par niveau gagné</span></p><div class="tree">${C.treeOf(c).map(col).join('')}</div>`;
  }

  statsHtml() {
    const c = this.c, T = c.season.st, tot = C.totals(c), t = C.myTeam(c);
    if (c.pos === 'G') return this.statsG();
    const row = (h, cur) => `<tr class="${cur ? 'me' : ''}"><td>${h.year}</td><td>${h.age}</td><td>${LG[h.lg]}</td><td>${esc(h.team)}</td><td>${h.gp}</td><td>${h.g}</td><td>${h.a}</td><td>${h.g + h.a}</td><td>${h.pm > 0 ? '+' : ''}${h.pm}</td><td>${h.pim}</td><td>${h.rating.toFixed(1)}</td><td>${h.rank ? ord(h.rank) : ''}</td></tr>`;
    const cur = { year: c.year, age: c.age, lg: c.season.lg, team: t.abbr, gp: T.gp, g: T.g, a: T.a, pm: T.pm, pim: T.pim, rating: C.avgRating(c), rank: C.myRank(c) };
    return `<h4>Saison en cours</h4>
      <p>${T.gp} PJ · <b>${T.g}</b> buts · <b>${T.a}</b> aides · <b>${T.g + T.a}</b> points · ${T.sog} tirs · ${T.hits} mises en échec · ${T.blk} tirs bloqués · ${T.pim} min de pénalité · temps de glace moyen ${T.gp ? mmss(T.toi / T.gp) : '—'}</p>
      <h4>Carrière</h4>
      <table class="ctable"><tr><th>Saison</th><th>Âge</th><th>Ligue</th><th>Équipe</th><th>PJ</th><th>B</th><th>A</th><th>PTS</th><th>+/-</th><th>PUN</th><th>Note</th><th>Rang</th></tr>
        ${c.history.map((h) => row(h)).join('')}${row(cur, true)}
        <tr class="tot"><td colspan="4">Total</td><td>${tot.gp}</td><td>${tot.g}</td><td>${tot.a}</td><td>${tot.g + tot.a}</td><td>${tot.pm > 0 ? '+' : ''}${tot.pm}</td><td>${tot.pim}</td><td></td><td></td></tr></table>
      <p class="dim">JUN : junior · MIN : ligue mineure · GDE : grande ligue</p>`;
  }

  // Statistiques d'un gardien : arrêts, buts accordés, % d'arrêts, blanchissages
  statsG() {
    const c = this.c, T = c.season.st, tot = C.totals(c), t = C.myTeam(c);
    const gaa = (h) => (h.gp ? ((h.ga || 0) / h.gp).toFixed(2).replace('.', ',') : '—');
    const row = (h, cur) => `<tr class="${cur ? 'me' : ''}"><td>${h.year}</td><td>${h.age}</td><td>${LG[h.lg]}</td><td>${esc(h.team)}</td><td>${h.gp}</td><td>${h.sa || 0}</td><td>${h.sv || 0}</td><td>${h.ga || 0}</td><td>${C.fmtSv(h)}</td><td>${gaa(h)}</td><td>${h.so || 0}</td><td>${h.rating.toFixed(1)}</td><td>${h.rank ? ord(h.rank) : ''}</td></tr>`;
    const cur = { year: c.year, age: c.age, lg: c.season.lg, team: t.abbr, gp: T.gp, sa: T.sa, sv: T.sv, ga: T.ga, so: T.so, rating: C.avgRating(c), rank: C.myRank(c) };
    return `<h4>Saison en cours</h4>
      <p>${T.gp} PJ · ${svLine(T)} · moyenne ${gaa(T)} · <b>${T.so || 0}</b> blanchissage${T.so > 1 ? 's' : ''}</p>
      <h4>Carrière</h4>
      <table class="ctable"><tr><th>Saison</th><th>Âge</th><th>Ligue</th><th>Équipe</th><th>PJ</th><th>TC</th><th>ARR</th><th>BA</th><th>%ARR</th><th>MOY</th><th>BL</th><th>Note</th><th>Rang</th></tr>
        ${c.history.map((h) => row(h)).join('')}${row(cur, true)}
        <tr class="tot"><td colspan="4">Total</td><td>${tot.gp}</td><td>${tot.sa}</td><td>${tot.sv}</td><td>${tot.ga}</td><td>${C.fmtSv(tot)}</td><td>${gaa(tot)}</td><td>${tot.so}</td><td></td><td></td></tr></table>
      <p class="dim">TC : tirs contre · ARR : arrêts · BA : buts accordés · MOY : buts accordés par match · BL : blanchissages</p>`;
  }

  tableHtml() {
    const c = this.c;
    return `<h4>${LEAGUES[c.season.lg].name}</h4><table class="ctable"><tr><th></th><th>Équipe</th><th>PJ</th><th>V</th><th>D</th><th>DP</th><th>PTS</th><th>BP</th><th>BC</th></tr>
      ${C.standings(c).map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td class="l">${logoImg(r.team, 'lg-s')} ${esc(r.team.city)} ${esc(r.team.name)}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.otl}</td><td><b>${r.pts}</b></td><td>${r.gf}</td><td>${r.ga}</td></tr>`).join('')}</table>
      <p class="dim">DP : défaite en prolongation ou en tirs de barrage (1 point)</p>`;
  }

  schedHtml() {
    const c = this.c, s = c.season;
    if (!s.log.length) return `<p class="dim">Aucun match joué. ${s.rounds.length} matchs au calendrier.</p>`;
    const G = c.pos === 'G';
    return `<table class="ctable"><tr><th>#</th><th>Adversaire</th><th>Résultat</th>${G ? '<th>ARR</th><th>TC</th>' : '<th>B</th><th>A</th>'}<th>Note</th><th></th></tr>
      ${s.log.map((l, i) => `<tr><td>${i + 1}</td><td class="l">${l.home ? 'c.' : 'à'} ${esc(l.opp)}</td><td>${l.gf > l.ga ? 'V' : 'D'} ${l.gf}-${l.ga}${l.ot ? ' (P)' : ''}</td><td>${G ? l.sv || 0 : l.g}</td><td>${G ? l.sa || 0 : l.a}</td><td>${l.rating.toFixed(1)}</td><td class="dim">${l.sim ? 'simulé' : 'joué'}</td></tr>`).join('')}</table>
      <p class="dim">${C.gamesLeft(c)} match${C.gamesLeft(c) > 1 ? 's' : ''} à jouer.</p>`;
  }

  // ---------- après un match ----------
  afterMatch(res) {
    const c = this.c, ui = this.ui, opp = C.nextGame(c).team;
    const out = C.recordGame(c, res);
    this.save();
    ui.back = null;
    const win = res.gf > res.ga;
    ui.show(`<h1>${win ? 'Victoire' : 'Défaite'} ${res.gf}-${res.ga}${res.ot ? ' en prolongation' : ''} <small>contre ${esc(opp.city)}${res.sim ? ' · match simulé' : ''}</small></h1>
      <div class="after">
        <div class="kpi big"><b>${res.rating.toFixed(1)}</b><span>Note du match</span></div>
        <div><h4>Ta feuille de match</h4>
          ${c.pos === 'G' ? `<p><b>${svLine(res.st)}</b>${res.st.so ? ' · <b>blanchissage !</b>' : ''}${res.st.a ? ` · ${res.st.a} aide` : ''}</p>` : `<p><b>${res.st.g}</b> but${res.st.g > 1 ? 's' : ''} · <b>${res.st.a}</b> aide${res.st.a > 1 ? 's' : ''} · ${res.st.sog} tir${res.st.sog > 1 ? 's' : ''} · ${res.st.hits} mise${res.st.hits > 1 ? 's' : ''} en échec · ${res.st.pm > 0 ? '+' : ''}${res.st.pm} · temps de glace ${mmss(res.st.toi)}</p>`}
          ${res.obj.length ? `<h4>Objectifs de l'entraîneur</h4><ul class="objs">${res.obj.map((o) => `<li class="${o.done ? 'ok' : 'no'}">${o.done ? '✓' : '✗'} ${esc(o.text)}</li>`).join('')}</ul>` : ''}
        </div>
        <div><h4>Progression</h4>
          <p><b>+${out.xp} XP</b>${res.sim ? ' <span class="dim">(moitié moins qu\'un match joué)</span>' : ''}</p>
          ${out.levels ? `<p class="lvl">Niveau ${c.level} atteint ! +${out.levels} point${out.levels > 1 ? 's' : ''} de compétence</p>` : ''}
          ${out.msgs.map((m) => `<p class="msg">${esc(m)}</p>`).join('')}
          <p class="dim">Niveau ${c.level} · ${c.xp} / ${C.xpNeed(c)} XP</p>
        </div>
      </div>
      <div class="row"><button data-a="go" data-focus class="primary">Continuer</button>${c.sp ? '<button data-a="tree">Dépenser mes points</button>' : ''}</div>`, 'career');
    ui.on('[data-a]', (n) => { this.tab = n.dataset.a === 'tree' && c.phase === 'season' ? 'tree' : 'home'; this.route(); });
  }

  // ---------- fin de saison ----------
  seasonEnd() {
    const c = this.c, ui = this.ui, T = c.season.st, t = C.myTeam(c), rk = C.myRank(c);
    ui.back = null;
    const next = c.season.lg === 0 && !c.drafted ? 'Vers le repêchage' : c.contract.years <= 1 ? 'Négocier mon contrat' : 'Saison suivante';
    ui.show(`<h1>Fin de la saison ${c.year}</h1>${this.head()}
      <div class="cbody"><p>${esc(t.city)} termine au <b>${ord(rk)} rang</b> de la ${LEAGUES[c.season.lg].name}${rk === 1 ? ' — champions de la saison !' : ''}.</p>
      <p>Ta saison : ${T.gp} PJ · ${c.pos === 'G' ? `${svLine(T)} · <b>${T.so || 0}</b> blanchissage${T.so > 1 ? 's' : ''}` : `<b>${T.g}</b> buts · <b>${T.a}</b> aides · <b>${T.g + T.a}</b> points`} · note moyenne <b>${C.avgRating(c).toFixed(1)}</b></p>
      ${this.tableHtml()}</div>
      <div class="row"><button data-a="go" data-focus class="primary">${next}</button></div>`, 'career');
    ui.on('[data-a]', () => { C.endSeason(c); this.save(); this.tab = 'home'; this.route(); });
  }

  draft() {
    const c = this.c, ui = this.ui, d = c.draft, big = leagueTeams(2), t = big[d.team];
    ui.back = null;
    const show = d.board.filter((p) => p.pick <= 3 || (p.pick >= d.pick - 4 && p.pick <= d.pick));
    let prev = 0;
    const rows = show.map((p, i) => {
      const gap = p.pick > prev + 1 ? '<li class="gap">…</li>' : ''; prev = p.pick;
      return `${gap}<li class="${p.me ? 'me' : ''}" style="animation-delay:${i * 0.45}s"><b>${p.pick}</b>${logoImg(big[p.team], 'lg-s')}<span>${esc(big[p.team].city)}</span><em>${esc(p.name)} · ${p.pos}</em></li>`;
    }).join('');
    ui.show(`<h1>Repêchage de la ${LEAGUES[2].name}</h1>
      <div class="draft"><ul>${rows}</ul>
        <div class="pick" style="--c1:${t.colors[0]};animation-delay:${show.length * 0.45}s">${logoImg(t, 'lg-l')}
          <p>Avec le ${ord(d.pick)} choix au total (${ord(d.round)} ronde),</p><h2>${esc(t.city)} ${esc(t.name)}</h2><p>sélectionnent <b>${esc(c.name)}</b> !</p>
          <p class="dim">Contrat d'entrée de 3 ans. Tu te rapportes d'abord au club-école, dans la ligue mineure.</p></div></div>
      <div class="row"><button data-a="go" data-focus class="primary">Signer mon contrat d'entrée</button></div>`, 'career');
    ui.on('[data-a]', () => { C.signEntry(c); this.save(); this.route(); });
  }

  contract() {
    const c = this.c, ui = this.ui, big = leagueTeams(2);
    ui.back = null;
    ui.show(`<h1>Négociation de contrat</h1>
      <p class="dim">Ton contrat est échu. Trois équipes te font une offre : salaire, durée et rôle promis diffèrent.</p>
      <div class="offers">${c.offers.map((o, i) => {
        const t = big[o.team];
        return `<div class="offer" style="--c1:${t.colors[0]}">${logoImg(t, 'lg-l')}<h3>${esc(t.city)}</h3><p>${esc(t.name)} · cote ${t.rating}${o.team === c.contract.team ? ' · <b>ton équipe</b>' : ''}</p>
          <p class="sal">${money(o.salary)} <small>par saison</small></p><p>${o.years} an${o.years > 1 ? 's' : ''} · total ${money(o.salary * o.years)}</p><p>Rôle promis : <b>${C.lineName(c, o.line)}</b></p>
          <button data-o="${i}" ${i ? '' : 'data-focus'} class="primary">Signer</button></div>`;
      }).join('')}</div>`, 'career');
    ui.on('[data-o]', (n) => { C.acceptOffer(c, +n.dataset.o); this.save(); this.route(); });
  }
}
