// Écrans du mode Franchise : emplacements, tableau de bord du directeur général, intersaison
import * as F from '../franchise/franchise.js';
import { loadFranchise, saveFranchise, deleteFranchise, SAVE_SLOTS, saveLast } from '../save/storage.js';
import { getTeams, POS_LABELS, ATTRS, ATTR_LABELS } from '../data/teams.js';
import { logoImg } from '../data/kit.js';
import { unlock, bump } from '../save/profile.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (x) => `${x.toFixed(2).replace('.', ',')} M$`;
const ord = (n) => (n === 1 ? '1er' : n + 'e');
const pct = (v) => (v ? v.toFixed(3).slice(1) : '—');
const bar = (v, cls = '') => `<div class="cbar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`;
const POS = { C: 'C', LW: 'AG', RW: 'AD', D: 'D', G: 'G' };
const mood = (m) => (m >= 75 ? '😀' : m >= 55 ? '🙂' : m >= 35 ? '😐' : '😠');

export class FranchiseUI {
  constructor(ui) { this.ui = ui; this.f = null; this.slot = 0; this.tab = 'home'; this.pick = null; this.tr = null; this.card = null; }
  save() { if (!saveFranchise(this.slot, this.f)) this.f.saveErr = true; }
  get team() { return this.f.teams[this.f.user]; }

  // ---------- emplacements ----------
  slots() {
    const ui = this.ui;
    ui.back = () => ui.main();
    const cards = [];
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const f = loadFranchise(i);
      if (!f) { cards.push(`<div class="slot empty"><h3>Emplacement ${i + 1}</h3><p class="dim">Vide</p><button data-new="${i}">Nouvelle franchise</button></div>`); continue; }
      const t = f.teams[f.user], r = f.table[f.user];
      cards.push(`<div class="slot" style="--c1:${t.colors[0]}"><h3>${esc(t.city)}</h3><p>${logoImg(t, 'lg-s')} ${esc(t.name)}</p>
        <p class="dim">Saison ${f.year} · ${r.w}-${r.l}-${r.otl}</p><p class="dim">${f.history.filter((h) => h.mine).length} coupe(s)</p>
        <button data-load="${i}" class="primary">Continuer</button><button data-del="${i}">Effacer</button></div>`);
    }
    ui.show(`<h1>Franchise</h1><div class="slots">${cards.join('')}</div><div class="row"><button data-a="back">Retour</button></div>
      <div class="foot">Dirige une équipe sur plusieurs saisons. Sauvegarde automatique après chaque match et chaque décision.</div>`, 'career');
    ui.on('[data-new]', (n) => this.pickTeam(+n.dataset.new));
    ui.on('[data-load]', (n) => { this.slot = +n.dataset.load; this.f = loadFranchise(this.slot); this.tab = 'home'; this.route(); });
    ui.on('[data-del]', (n) => { if (n.dataset.sure) { deleteFranchise(+n.dataset.del); this.slots(); } else { n.dataset.sure = 1; n.textContent = 'Confirmer l\'effacement'; } });
    ui.on('[data-a]', () => ui.main());
  }

  pickTeam(slot) {
    const ui = this.ui, teams = getTeams().slice(0, 16);
    ui.back = () => this.slots();
    ui.show(`<h1>Choisis ton équipe</h1><div class="tgrid">${teams.map((t, i) => `<button data-t="${i}" style="--c1:${t.colors[0]}">${logoImg(t, 'lg-s')}<b>${esc(t.city)}</b><span>${esc(t.name)} · cote ${t.rating} · ${t.conf}</span></button>`).join('')}</div>
      <div class="row"><button data-a="back">Retour</button></div>
      <div class="foot">Une équipe forte coûte cher : moins d'espace sous le plafond salarial. Une équipe faible repêche tôt.</div>`, 'career');
    ui.on('[data-t]', (n) => { this.slot = slot; this.f = F.newFranchise(+n.dataset.t); this.tab = 'home'; this.save(); this.route(); });
    ui.on('[data-a]', () => this.slots());
  }

  route() {
    saveLast('franchise', this.slot);
    const p = this.f.phase;
    if (p === 'awards') this.awards(); else if (p === 'resign') this.resign(); else if (p === 'draft') this.draft(); else this.hub();
  }

  // Après chaque avancée : succès, sauvegarde
  after(before) {
    const f = this.f;
    if (f.phase === 'playoffs' && before === 'season' && F.nextGame(f)) unlock('playoffs');
    if (f.phase === 'awards' && before !== 'awards' && f.history[0].mine) { unlock('cup'); if (bump('cups') >= 2) unlock('dynasty'); }
    this.save();
  }
  afterMatch(m) { const f = this.f, b = f.phase; F.advance(f, F.fromMatch(f, m)); this.after(b); this.route(); }

  head() {
    const f = this.f, t = this.team, r = f.table[f.user], pay = F.payroll(t);
    const mor = t.players.reduce((s, p) => s + p.morale, 0) / t.players.length, inj = t.players.filter((p) => p.inj > 0).length;
    return `<div class="chead" style="--c1:${t.colors[0]}">
      <div class="who">${logoImg(t, 'lg-l')}<div><b>${esc(t.city)} ${esc(t.name)}</b><span>Saison ${f.year} · ${f.phase === 'playoffs' ? 'séries éliminatoires' : f.phase === 'fa' ? 'intersaison' : `match ${Math.min(f.round + 1, f.rounds.length)} de ${f.rounds.length}`}</span>
        <span>${r.w}-${r.l}-${r.otl} · ${r.pts} pts · ${ord(F.rankOf(f, f.user))} rang</span></div></div>
      <div class="kpi"><b>${F.teamRating(t)}</b><span>Cote</span></div>
      <div class="kpi wide"><b>${money(pay)}</b>${bar(pay / f.cap, pay > f.cap ? 'bad' : '')}<span>Plafond ${f.cap} M$ · espace ${money(f.cap - pay)}</span></div>
      <div class="kpi wide"><b>Moral ${Math.round(mor)}</b>${bar(mor / 100, mor >= 65 ? 'good' : mor < 45 ? 'bad' : '')}<span>${t.players.length} joueurs · ${inj} blessé${inj > 1 ? 's' : ''}</span></div>
    </div>`;
  }

  // ---------- tableau de bord ----------
  hub() {
    const f = this.f, ui = this.ui, tab = this.tab, g = F.nextGame(f), off = f.phase === 'fa';
    ui.back = () => ui.main();
    const tabs = [['home', 'Aperçu'], ['roster', 'Effectif'], ['table', 'Classement'], ['leaders', 'Meneurs'], ['trade', 'Échanges'], ['fa', `Agents libres (${f.fa.length})`], ['scout', 'Dépistage'], ['hist', 'Histoire']];
    const body = this.card ? this.cardHtml() : { home: () => this.homeHtml(g), roster: () => this.rosterHtml(), table: () => this.tableHtml(), leaders: () => this.leadersHtml(),
      trade: () => this.tradeHtml(), fa: () => this.faHtml(), scout: () => this.scoutHtml(), hist: () => this.histHtml() }[tab]();
    const acts = off ? '<button data-a="start" class="primary" data-focus>Commencer la saison</button>'
      : `${g ? '<button data-a="play" class="primary" data-focus>Jouer le match</button><button data-a="sim">Simuler ce match</button>' : '<button data-a="sim" class="primary" data-focus>Simuler la journée des séries</button>'}
         <button data-a="simAll">${f.phase === 'playoffs' ? 'Simuler la fin des séries' : 'Simuler la fin de la saison'}</button>`;
    ui.show(`${this.head()}
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab && !this.card ? 'cur' : ''}">${l}</button>`).join('')}</div>
      <div class="cbody">${this.msg ? `<p class="msg">${esc(this.msg)}</p>` : ''}${body}</div>
      <div class="row">${acts}<button data-a="menu">Menu principal</button></div>`, 'career');
    this.msg = null;
    ui.on('[data-tab]', (n) => { this.tab = n.dataset.tab; this.card = null; this.pick = null; this.hub(); });
    ui.on('[data-card]', (n) => { this.card = n.dataset.card; this.hub(); });
    this.bind();
    ui.on('[data-a]', (n) => {
      const a = n.dataset.a, b = f.phase;
      if (a === 'menu') return ui.main();
      if (a === 'play') {
        // séries : règles et ambiance des séries; la finale gagnée donne la remise de la coupe
        const g = F.nextGame(f), s = g && g.series, my = s ? (s.a === f.user ? s.wa : s.wb) : 0;
        const opts = { mode: 'game', franchise: f, teams: F.matchTeams(f) };
        if (s) {
          opts.playoff = true; opts.label = `SÉRIES · ${F.PO_ROUNDS[f.po.round].toUpperCase()} · MATCH ${s.wa + s.wb + 1}`;
          if (f.po.series.length === 1 && my === 2) opts.cup = { name: 'Coupe Boréale', year: String(new Date().getFullYear() + f.year - 1) };
        }
        ui.hide(); ui.app.startMatch(opts); return;
      }
      if (a === 'start') {
        if (F.overCap(f)) { this.msg = 'Ta masse salariale dépasse le plafond : libère ou échange des joueurs avant de commencer.'; return this.hub(); }
        F.newSeason(f); this.save(); this.tab = 'home'; return this.route();
      }
      if (a === 'sim') { const r = F.advance(f); if (r) this.msg = `${r.gf > r.ga ? 'Victoire' : 'Défaite'} ${r.gf}-${r.ga}${r.ot ? ' en prolongation' : ''} (match simulé).`; this.after(b); return this.route(); }
      if (n.dataset.sure) { let k = 0; while (f.phase === b && k++ < 200) F.advance(f); this.after(b); this.route(); } else { n.dataset.sure = 1; n.textContent = 'Confirmer la simulation'; }
    });
  }

  // Actions des onglets
  bind() {
    const f = this.f, ui = this.ui, t = this.team, re = () => { this.save(); this.hub(); };
    ui.on('[data-swap]', (n) => {
      const id = n.dataset.swap;
      if (!this.pick) this.pick = id;
      else { if (this.pick !== id && !F.swapLine(t, this.pick, id)) this.msg = 'Échange impossible : même groupe (attaquants, défenseurs ou gardiens) et joueurs en santé seulement.'; this.pick = null; }
      re();
    });
    ui.on('[data-auto]', () => { F.setLines(f, t, false); this.msg = 'Alignement refait selon les cotes.'; re(); });
    ui.on('[data-rel]', (n) => {
      if (!n.dataset.sure) { n.dataset.sure = 1; n.textContent = 'Confirmer'; return; }
      const p = F.byId(t, n.dataset.rel), g = F.group(p);
      if (t.players.filter((q) => F.group(q) === g).length <= { F: 12, D: 6, G: 2 }[g]) this.msg = 'Impossible : il ne resterait plus assez de joueurs à cette position.';
      else { F.release(f, p.id); this.msg = `${p.name} est libéré et devient agent libre.`; this.card = null; }
      re();
    });
    ui.on('[data-sign]', (n) => { const p = f.fa.find((q) => q.id === n.dataset.sign), err = F.signFA(f, n.dataset.sign); this.msg = err || `${p.name} signe avec ton équipe.`; re(); });
    ui.on('[data-sc]', (n) => { f.scouts[+n.dataset.sc] = +n.value; re(); }, 'change');
    ui.on('[data-to]', (n) => { this.tr = { other: +n.value, give: new Set(), get: new Set() }; this.hub(); }, 'change');
    ui.on('[data-tg]', (n) => { const s = this.tr[n.dataset.side]; if (n.checked) s.add(n.dataset.tg); else s.delete(n.dataset.tg); this.hub(); }, 'change');
    ui.on('[data-offer]', () => {
      const r = F.proposeTrade(f, this.tr.other, [...this.tr.give], [...this.tr.get]);
      this.msg = r.why;
      if (r.ok) { unlock('trade'); this.tr = { other: this.tr.other, give: new Set(), get: new Set() }; }
      re();
    });
    ui.on('[data-back]', () => { this.card = null; this.hub(); });
  }

  homeHtml(g) {
    const f = this.f, t = this.team, last = f.log[f.log.length - 1];
    let next;
    if (f.phase === 'fa') next = `<h4>Intersaison</h4><p>Le repêchage est terminé. Signe des agents libres, fais des échanges, puis commence la saison ${f.year + 1}.</p><p class="dim">Au lancement, les effectifs de plus de ${F.MAX_ROSTER} joueurs sont ramenés à ${F.MAX_ROSTER} (les moins bons sont libérés).</p>`;
    else if (!g) next = '<h4>Séries éliminatoires</h4><p>Ton équipe n\'est plus en lice. Simule la suite pour connaître le champion.</p>';
    else {
      const o = f.teams[g.opp], r = f.table[g.opp];
      next = `<h4>${g.series ? F.PO_ROUNDS[f.po.round] : 'Prochain match'}</h4><div class="next">${logoImg(g.home ? o : t, 'lg-l')}<span>à</span>${logoImg(g.home ? t : o, 'lg-l')}</div>
        <p><b>${g.home ? 'À domicile contre' : 'En visite chez'} ${esc(o.city)}</b><br>${esc(o.name)} (${r.w}-${r.l}-${r.otl}) · cote ${F.teamRating(o)}</p>
        ${g.series ? `<p>Série 3 de 5 : <b>${g.series.a === f.user ? g.series.wa : g.series.wb}-${g.series.a === f.user ? g.series.wb : g.series.wa}</b></p>` : ''}
        ${last && f.phase === 'season' ? `<p class="dim">Dernier match : ${last.gf > last.ga ? 'victoire' : 'défaite'} ${last.gf}-${last.ga} ${last.home ? 'c.' : 'à'} ${esc(last.opp)}</p>` : ''}`;
    }
    const po = f.po ? `<h4>${F.PO_ROUNDS[f.po.round]}</h4><ul class="news">${f.po.series.map((s) => `<li>${esc(f.teams[s.a].city)} <b>${s.wa}</b> – <b>${s.wb}</b> ${esc(f.teams[s.b].city)}${s.done ? ' ✓' : ''}</li>`).join('')}</ul>` : '';
    const inj = t.players.filter((p) => p.inj > 0);
    return `<div class="cols3"><div>${next}</div>
      <div>${po}<h4>Infirmerie</h4>${inj.length ? `<ul class="news">${inj.map((p) => `<li>${esc(p.name)} (${POS[p.pos]}) — ${p.inj} match${p.inj > 1 ? 's' : ''}</li>`).join('')}</ul>` : '<p class="dim">Aucun blessé.</p>'}
        <h4>Meneurs de l'équipe</h4><ul class="news">${[...t.players].filter((p) => p.pos !== 'G').sort((a, b) => b.st.g + b.st.a - a.st.g - a.st.a).slice(0, 3).map((p) => `<li>${esc(p.name)} — ${p.st.g} B, ${p.st.a} A</li>`).join('')}</ul></div>
      <div><h4>Nouvelles</h4><ul class="news">${f.news.slice(0, 8).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div></div>`;
  }

  slotMap() {
    const t = this.team, m = {};
    t.lines.F.forEach((l, i) => l.forEach((id) => { m[id] = `Trio ${i + 1}`; })); t.lines.D.forEach((l, i) => l.forEach((id) => { m[id] = `Duo ${i + 1}`; }));
    m[t.lines.G[0]] = 'Partant'; m[t.lines.G[1]] = 'Auxiliaire';
    return m;
  }
  rosterHtml() {
    const t = this.team, m = this.slotMap(), order = F.lineupIds(t);
    const list = [...t.players].sort((a, b) => (order.indexOf(a.id) < 0 ? 99 : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? 99 : order.indexOf(b.id)) || b.ovr - a.ovr);
    const row = (p) => `<tr class="${this.pick === p.id ? 'me' : ''}${p.inj > 0 ? ' inj' : ''}"><td>${m[p.id] || '<i class="dim">Réserve</i>'}</td>
      <td class="l"><button class="lnk" data-card="${p.id}">#${p.num} ${esc(p.name)}</button></td><td>${POS[p.pos]}</td><td>${p.age}</td><td><b>${p.ovr}</b></td><td>${p.pot}</td>
      <td title="${Math.round(p.morale)}">${mood(p.morale)}</td><td>${p.inj > 0 ? `🩹 ${p.inj}` : ''}</td><td>${money(p.con.sal)}</td><td>${p.con.yrs}</td>
      ${p.pos === 'G' ? `<td>${p.st.gs}</td><td colspan="3">${p.st.w} V · ${pct(p.st.sa ? 1 - p.st.ga / p.st.sa : 0)}</td>` : `<td>${p.st.gp}</td><td>${p.st.g}</td><td>${p.st.a}</td><td>${p.st.g + p.st.a}</td>`}
      <td>${p.inj > 0 ? '' : `<button class="mini" data-swap="${p.id}">${this.pick === p.id ? 'Annuler' : this.pick ? 'Ici' : '⇄'}</button>`}</td></tr>`;
    return `<p class="dim">Pour changer l'alignement : clique ⇄ sur un joueur, puis « Ici » sur celui avec qui l'échanger (même groupe). Clique un nom pour sa fiche. <button class="mini" data-auto>Alignement automatique</button></p>
      <table class="ctable"><tr><th>Rôle</th><th>Joueur</th><th>Pos</th><th>Âge</th><th>Cote</th><th>Pot.</th><th>Moral</th><th>Bl.</th><th>Salaire</th><th>Ans</th><th>PJ</th><th>B</th><th>A</th><th>PTS</th><th></th></tr>${list.map(row).join('')}</table>`;
  }

  cardHtml() {
    const f = this.f, fa = f.fa.find((q) => q.id === this.card);
    const x = fa ? { p: fa, t: { id: -1, abbr: 'AL', city: 'agent libre' } } : F.allPlayers(f).find((q) => q.p.id === this.card);
    if (!x) { this.card = null; return ''; }
    const p = x.p, mine = x.t.id === f.user, isG = p.pos === 'G', c = p.car;
    const rows = [...p.hist, ...(p.st.gp ? [{ y: f.year, t: x.t.abbr, ...p.st }] : [])];
    const keys = isG ? ['ref', 'pos'] : ATTRS;
    return `<div class="row left"><button class="mini" data-back>← Retour</button>${mine ? `<button class="mini" data-rel="${p.id}">Libérer le joueur</button>` : ''}</div>
      <div class="cols3"><div><h4>#${p.num} ${esc(p.name)}</h4><p>${POS_LABELS[p.pos]} · ${esc(p.style)} · ${p.age} ans · ${esc(x.t.city)}</p>
        <p>Cote <b>${p.ovr}</b> · potentiel ${p.pot} · moral ${Math.round(p.morale)} ${mood(p.morale)}</p><p>Contrat : ${money(p.con.sal)} · ${p.con.yrs} an${p.con.yrs > 1 ? 's' : ''}</p>
        ${p.inj > 0 ? `<p class="msg">Blessé : ${p.inj} match(s)</p>` : ''}${p.aw.length ? `<h4>Honneurs</h4><ul class="news">${p.aw.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>
      <div><h4>Attributs</h4><table class="attrs">${keys.map((k) => `<tr><td>${ATTR_LABELS[k]}</td><td>${bar((p.a[k] - 30) / 69)}</td><td><b>${p.a[k]}</b></td></tr>`).join('')}</table></div>
      <div><h4>Carrière</h4><table class="ctable"><tr><th>An</th><th>Éq.</th><th>PJ</th>${isG ? '<th>V</th><th>% arr.</th>' : '<th>B</th><th>A</th><th>PTS</th><th>+/-</th>'}</tr>
        ${rows.map((r) => `<tr><td>${r.y}</td><td>${esc(r.t)}</td><td>${r.gp}</td>${isG ? `<td>${r.w}</td><td>${pct(r.sa ? 1 - r.ga / r.sa : 0)}</td>` : `<td>${r.g}</td><td>${r.a}</td><td>${r.g + r.a}</td><td>${r.pm}</td>`}</tr>`).join('')}
        <tr class="tot"><td colspan="2">Total</td><td>${c.gp + p.st.gp}</td>${isG ? `<td>${c.w + p.st.w}</td><td>${pct(c.sa + p.st.sa ? 1 - (c.ga + p.st.ga) / (c.sa + p.st.sa) : 0)}</td>` : `<td>${c.g + p.st.g}</td><td>${c.a + p.st.a}</td><td>${c.g + c.a + p.st.g + p.st.a}</td><td></td>`}</tr></table>
        <p class="dim">Le total inclut les saisons jouées avant le début de la franchise.</p></div></div>`;
  }

  tableHtml() {
    const f = this.f, cut = f.phase === 'season';
    const conf = (c) => `<div><h4>Association de l'${c}</h4><table class="ctable"><tr><th></th><th>Équipe</th><th>PJ</th><th>V</th><th>D</th><th>DP</th><th>PTS</th><th>BP</th><th>BC</th></tr>
      ${F.standings(f, c).map((r, i) => `<tr class="${r.me ? 'me' : ''}${cut && i === 3 ? ' cut' : ''}"><td>${i + 1}</td><td class="l">${logoImg(r.team, 'lg-s')} ${esc(r.team.city)}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.otl}</td><td><b>${r.pts}</b></td><td>${r.gf}</td><td>${r.ga}</td></tr>`).join('')}</table></div>`;
    return `<div class="cols2">${conf('Est')}${conf('Ouest')}</div><p class="dim">Les 4 premières équipes de chaque association participent aux séries (3 de 5). DP : défaite en prolongation.</p>`;
  }

  leadersHtml() {
    const f = this.f;
    const col = (title, key, fmt) => `<div><h4>${title}</h4><table class="ctable">${F.leaders(f, key, 8).map((x, i) => `<tr class="${x.t.id === f.user ? 'me' : ''}"><td>${i + 1}</td><td class="l"><button class="lnk" data-card="${x.p.id}">${esc(x.p.name)}</button> <i class="dim">${esc(x.t.abbr)}</i></td><td><b>${fmt ? fmt(x.v) : x.v}</b></td></tr>`).join('')}</table></div>`;
    return `<div class="cols4">${col('Points', 'pts')}${col('Buts', 'g')}${col('Aides', 'a')}${col('Plus/moins', 'pm')}${col('Mises en échec', 'hits')}${col('Victoires (gardiens)', 'w')}${col('% d\'arrêts', 'svp', pct)}${col('Jeux blancs', 'so')}</div>`;
  }

  tradeHtml() {
    const f = this.f, t = this.team;
    if (!this.tr) this.tr = { other: f.user === 0 ? 1 : 0, give: new Set(), get: new Set() };
    const tr = this.tr, o = f.teams[tr.other];
    const col = (team, side) => `<div><h4>${esc(team.city)} <small>masse ${money(F.payroll(team))} · ${ord(F.rankOf(f, team.id))} rang</small></h4><div class="tlist">${[...team.players].sort((a, b) => b.ovr - a.ovr).map((p) => `<label><input type="checkbox" data-tg="${p.id}" data-side="${side}" ${tr[side].has(p.id) ? 'checked' : ''}> ${esc(p.name)} <i>${POS[p.pos]} · ${p.age} ans · <b>${p.ovr}</b>/${p.pot} · ${money(p.con.sal)} × ${p.con.yrs}</i></label>`).join('')}</div></div>`;
    const sum = (team, set) => [...set].reduce((s, id) => s + F.byId(team, id).con.sal, 0);
    return `<p>Échanger avec <select data-to>${f.teams.map((q, i) => (i === f.user ? '' : `<option value="${i}" ${i === tr.other ? 'selected' : ''}>${esc(q.city)} ${esc(q.name)}</option>`)).join('')}</select>
      <button class="mini" data-offer ${tr.give.size && tr.get.size ? '' : 'disabled'}>Proposer l'échange</button>
      <span class="dim">Tu cèdes ${money(sum(t, tr.give))} · tu reçois ${money(sum(o, tr.get))} · espace actuel ${money(F.capRoom(f, t))}</span></p>
      <div class="cols2">${col(t, 'give')}${col(o, 'get')}</div>
      <p class="dim">Chaque DG évalue l'offre selon sa situation : les équipes de tête veulent des joueurs prêts à gagner, celles du bas du classement veulent des jeunes à fort potentiel et se méfient des contrats trop chers.</p>`;
  }

  faHtml() {
    const f = this.f, t = this.team, room = F.capRoom(f, t);
    return `<p class="dim">Espace sous le plafond : <b>${money(room)}</b> · effectif ${t.players.length}/${F.MAX_ROSTER}. Contrat de 2 ans (1 an à 32 ans et plus).</p>
      <table class="ctable"><tr><th>Joueur</th><th>Pos</th><th>Âge</th><th>Cote</th><th>Pot.</th><th>Style</th><th>Demande</th><th></th></tr>
      ${[...f.fa].sort((a, b) => b.ovr - a.ovr).map((p) => `<tr><td class="l"><button class="lnk" data-card="${p.id}">${esc(p.name)}</button></td><td>${POS[p.pos]}</td><td>${p.age}</td><td><b>${p.ovr}</b></td><td>${p.pot}</td><td>${esc(p.style)}</td><td>${money(F.ask(p))}</td>
        <td><button class="mini" data-sign="${p.id}" ${F.ask(p) > room || t.players.length >= F.MAX_ROSTER ? 'disabled' : ''}>Signer</button></td></tr>`).join('')}</table>`;
  }

  prospects(pickable) {
    const f = this.f;
    return `<table class="ctable"><tr><th>Espoir</th><th>Pos</th><th>Région</th><th>Cote estimée</th><th>Potentiel estimé</th><th>Rapports</th>${pickable ? '<th></th>' : ''}</tr>
      ${[...f.draft].sort((a, b) => F.estimate(b).pot[0] + F.estimate(b).pot[1] - F.estimate(a).pot[0] - F.estimate(a).pot[1]).map((p) => {
        const e = F.estimate(p);
        return `<tr><td class="l">${esc(p.name)}</td><td>${POS[p.pos]}</td><td>${REG[p.region]}</td><td>${e.ovr[0]}–${e.ovr[1]}</td><td><b>${e.pot[0]}–${e.pot[1]}</b></td><td>${bar(Math.min(1, p.seen / 27), e.err <= 3 ? 'good' : '')}</td>${pickable ? `<td><button class="mini" data-pick="${p.id}">Repêcher</button></td>` : ''}</tr>`;
      }).join('')}</table>`;
  }
  scoutHtml() {
    const f = this.f;
    return `<p>Tes trois dépisteurs suivent chacun une région. Plus une région est suivie longtemps, plus les fourchettes de ses espoirs se resserrent.</p>
      <p>${f.scouts.map((s, i) => `Dépisteur ${i + 1} <select data-sc="${i}">${REG.map((r, k) => `<option value="${k}" ${k === s ? 'selected' : ''}>${r}</option>`).join('')}</select>`).join(' &nbsp; ')}</p>
      ${f.draft.length ? this.prospects(false) : '<p class="dim">La prochaine cuvée sera connue au début de la saison.</p>'}`;
  }

  histHtml() {
    const f = this.f;
    const seasons = f.history.length ? f.history.map((h) => `<div class="hyear"><b>Saison ${h.year}</b> — ${F.CUP} : <b class="${h.mine ? 'gold' : ''}">${esc(h.champName)}</b> <span class="dim">· ton équipe : ${ord(h.rank)} rang</span>
      <ul class="news">${h.awards.map((a) => `<li class="${a.mine ? 'gold' : ''}">${F.TROPHIES[a.k]} : ${esc(a.name)} (${esc(a.team)}) — ${a.line}</li>`).join('')}</ul></div>`).join('') : '<p class="dim">Aucune saison terminée.</p>';
    const hof = f.hof.length ? `<table class="ctable"><tr><th>Membre</th><th>Pos</th><th>Dernière équipe</th><th>Intronisé</th><th>PJ</th><th>B</th><th>A</th><th>PTS / V</th><th>Trophées</th></tr>
      ${f.hof.map((h) => `<tr><td class="l">${esc(h.name)}</td><td>${POS[h.pos]}</td><td>${esc(h.team)}</td><td>an ${h.year}</td><td>${h.gp}</td><td>${h.pos === 'G' ? '' : h.g}</td><td>${h.pos === 'G' ? '' : h.a}</td><td><b>${h.pos === 'G' ? h.w + ' V' : h.g + h.a}</b></td><td>${h.aw}</td></tr>`).join('')}</table>` : '<p class="dim">Aucun membre pour l\'instant. Les grands joueurs y entrent à leur retraite.</p>';
    return `<div class="cols2"><div><h4>Champions et trophées</h4>${seasons}</div><div><h4>Temple de la renommée</h4>${hof}</div></div>`;
  }

  // ---------- fin de saison ----------
  awards() {
    const f = this.f, ui = this.ui, h = f.history[0], c = f.teams[f.champ];
    ui.back = null;
    ui.show(`<h1>${F.CUP} — saison ${f.year}</h1>
      <div class="draft"><div class="pick" style="--c1:${c.colors[0]}">${logoImg(c, 'lg-l')}<p>Champions de la ${F.CUP}</p><h2>${esc(c.city)} ${esc(c.name)}</h2>${h.mine ? '<p class="lvl">C\'est ton équipe. Félicitations !</p>' : `<p class="dim">Ton équipe a terminé au ${ord(h.rank)} rang.</p>`}</div>
        <div class="cbody" style="width:560px"><h4>Trophées de fin de saison</h4><ul class="news">${h.awards.map((a) => `<li class="${a.mine ? 'gold' : ''}"><b>${F.TROPHIES[a.k]}</b><br>${esc(a.name)} (${esc(a.team)}) — ${a.line}</li>`).join('')}</ul></div></div>
      <div class="row"><button data-a="go" data-focus class="primary">Passer à l'intersaison</button></div>`, 'career');
    ui.on('[data-a]', () => { F.beginOffseason(f); this.save(); this.route(); });
  }

  resign() {
    const f = this.f, ui = this.ui, t = this.team, ex = F.expiring(f);
    ui.back = null;
    const hof = f.retired.filter((r) => r.hof), mine = f.retired.filter((r) => r.mine);
    ui.show(`<h1>Intersaison — contrats échus</h1>${this.head()}
      <div class="cbody">${this.msg ? `<p class="msg">${esc(this.msg)}</p>` : ''}
        <p class="dim">${f.retired.length} joueurs ont pris leur retraite dans la ligue${mine.length ? ` (dans ton équipe : ${mine.map((r) => esc(r.name)).join(', ')})` : ''}.${hof.length ? ` Intronisés au Temple de la renommée : ${hof.map((r) => esc(r.name)).join(', ')}.` : ''} Les jeunes ont progressé et les vétérans ont décliné.</p>
        ${ex.length ? `<table class="ctable"><tr><th>Joueur</th><th>Pos</th><th>Âge</th><th>Cote</th><th>Pot.</th><th>Moral</th><th>Ancien salaire</th><th>Demande</th><th>Prolonger</th></tr>
          ${ex.map((p) => `<tr><td class="l">${esc(p.name)}</td><td>${POS[p.pos]}</td><td>${p.age}</td><td><b>${p.ovr}</b></td><td>${p.pot}</td><td>${mood(p.morale)}</td><td>${money(p.con.sal)}</td><td><b>${money(F.ask(p))}</b></td>
            <td>${[1, 2, 3, 4].map((y) => `<button class="mini" data-rs="${p.id},${y}">${y} an${y > 1 ? 's' : ''}</button>`).join(' ')}</td></tr>`).join('')}</table>
          <p class="dim">Les joueurs non prolongés deviennent agents libres. Un joueur mécontent demande 25 % de plus.</p>` : '<p>Tous tes joueurs sont sous contrat.</p>'}</div>
      <div class="row">${ex.length ? '<button data-all>Tout prolonger pour 2 ans</button>' : ''}<button data-a="go" data-focus class="primary">Passer au repêchage</button></div>`, 'career');
    this.msg = null;
    ui.on('[data-all]', () => {
      let miss = 0;
      for (const p of [...ex].sort((x, y) => y.ovr - x.ovr)) if (!F.resign(f, p.id, 2)) miss++;
      if (miss) this.msg = `Plafond atteint : ${miss} joueur${miss > 1 ? 's' : ''} non prolongé${miss > 1 ? 's' : ''}.`;
      this.save(); this.resign();
    });
    ui.on('[data-rs]', (n) => { const [id, y] = n.dataset.rs.split(','); if (!F.resign(f, id, +y)) this.msg = 'Pas assez d\'espace sous le plafond salarial pour ce contrat.'; this.save(); this.resign(); });
    ui.on('[data-a]', (n) => {
      const left = F.expiring(f).length;
      if (left && !n.dataset.sure) { n.dataset.sure = 1; n.textContent = `Confirmer : laisser partir ${left} joueur${left > 1 ? 's' : ''}`; return; }
      F.endResign(f); this.save(); this.route();
    });
  }

  draft() {
    const f = this.f, ui = this.ui, d = f.dr;
    ui.back = null;
    ui.show(`<h1>Repêchage — saison ${f.year}</h1>
      <p><b>À toi de choisir</b> : ${ord(d.pick + 1)} choix au total (${d.pick < 16 ? '1re' : '2e'} ronde). ${d.log.length ? `Déjà choisis : ${d.log.slice(-4).map((l) => `${l.n}. ${esc(l.name)} (${esc(l.team)})`).join(' · ')}` : 'Tu as le tout premier choix.'}</p>
      <div class="cbody">${this.prospects(true)}</div>
      <div class="foot">Les fourchettes viennent de tes dépisteurs : plus elles sont étroites, plus l'évaluation est sûre.</div>`, 'career');
    ui.on('[data-pick]', (n) => { F.draftPick(f, n.dataset.pick); this.save(); this.tab = 'home'; this.route(); });
  }
}
const REG = F.REGIONS;
