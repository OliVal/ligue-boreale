// Éditeur d'équipe : identité et couleurs, trios, joueurs, création d'équipes, import et export
import { getTeams, commitTeam, resetTeam, createTeam, deleteTeam, rerollRoster, autoLines, exportTeams, importTeams, calcOvr,
  ATTRS, G_ATTRS, ATTR_LABELS, SKATER_STYLES, POS_LABELS, MAX_CUSTOM } from '../data/teams.js';
import { kitFor, jerseySvg, getLook, logoImg, logoCanvas, LOOK_OPTS, LOOK_LABELS, KIT_NAMES } from '../data/kit.js';
import { teamChem, chemBonus, chemLabel } from '../data/chemistry.js';
import { Preview3D } from '../render/preview.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const crest = (t) => logoImg(t, 'lg-s');

export class Editor {
  constructor(ui) { this.ui = ui; this.msg = ''; }

  note(m) { this.msg = m; }
  takeMsg() { const m = this.msg; this.msg = ''; return m ? `<div class="note">${esc(m)}</div>` : ''; }

  // ---------- liste des équipes ----------
  list() {
    const ui = this.ui, teams = getTeams();
    const nCustom = teams.filter((t) => t.custom).length;
    ui.back = () => ui.main();
    ui.show(`
      <h1>Éditeur d'équipe</h1>
      ${this.takeMsg()}
      <div class="tgrid">${teams.map((t, i) => `<button data-t="${i}" ${i === 0 ? 'data-focus' : ''}>${crest(t)}
        <span class="nm"><b>${esc(t.city)}</b> ${esc(t.name)}</span>
        <small>${t.custom ? 'création' : t.edited ? 'modifiée' : ''} ${t.rating}</small></button>`).join('')}</div>
      <div class="row">
        <button data-a="new" class="primary" ${nCustom >= MAX_CUSTOM ? 'disabled' : ''}>Créer une équipe</button>
        <button data-a="export">Exporter dans un fichier</button>
        <button data-a="import">Importer un fichier</button>
        <button data-a="back">Retour</button>
      </div>
      <input type="file" accept=".json,application/json" data-file hidden>
      <div class="foot">Les modifications sont enregistrées automatiquement dans ce navigateur. ${nCustom}/${MAX_CUSTOM} équipes créées.</div>`, 'editor');
    ui.on('[data-t]', (n) => { const t = getTeams()[+n.dataset.t]; ui.app.previewTeam(t); this.team(t, 'id'); });
    ui.on('[data-a]', (n) => {
      const a = n.dataset.a;
      if (a === 'back') ui.main();
      else if (a === 'new') { const t = createTeam(); if (t) { ui.app.previewTeam(t); this.team(t, 'id'); } }
      else if (a === 'export') {
        const url = URL.createObjectURL(new Blob([exportTeams()], { type: 'application/json' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: 'ligue-boreale-equipes.json' });
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (a === 'import') ui.el.querySelector('[data-file]').click();
    });
    ui.on('[data-file]', async (n) => {
      const f = n.files[0];
      if (!f) return;
      if (!confirm('Importer ce fichier remplacera toutes tes équipes modifiées et créées. Continuer ?')) return;
      const k = importTeams(await f.text());
      this.note(k < 0 ? 'Fichier illisible : ce n\'est pas un fichier d\'équipes de la Ligue Boréale.' : `${k} équipe(s) importée(s).`);
      ui.sel.user = 0; ui.sel.opp = 8;
      this.list();
    }, 'change');
  }

  // ---------- une équipe ----------
  team(t, tab = 'id', st = {}) {
    const ui = this.ui;
    ui.back = () => this.list();
    const again = (s2 = st, focus) => { this.team(t, tab, s2); if (focus) { const f = ui.el.querySelector(focus); if (f) f.focus(); } };
    const save = () => { if (!commitTeam(t)) this.note('Sauvegarde impossible : le stockage du navigateur est plein ou bloqué.'); };
    const tabs = [['id', 'Identité'], ['lines', 'Alignement'], ['players', 'Joueurs']];
    const body = tab === 'id' ? this.idHtml(t, st) : tab === 'lines' ? this.linesHtml(t, st) : this.playersHtml(t, st);
    const scroll = ['.epanel', '.plist'].map((q) => ui.el.querySelector(q)?.scrollTop || 0); // conserve le défilement
    setTimeout(() => ['.epanel', '.plist'].forEach((q, i) => { const n = ui.el.querySelector(q); if (n) n.scrollTop = scroll[i]; }), 0);
    ui.show(`
      <h1>${crest(t)} ${esc(t.city)} ${esc(t.name)} <small>cote ${t.rating}</small></h1>
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'cur' : ''}">${l}</button>`).join('')}
        <button data-tab="back">Retour aux équipes</button></div>
      ${this.takeMsg()}
      <div class="epanel">${body}</div>`, 'editor');
    ui.on('[data-tab]', (n) => { if (n.dataset.tab === 'back') this.list(); else this.team(t, n.dataset.tab); });
    if (tab === 'id') this.idBind(t, save, again, st);
    else if (tab === 'lines') this.linesBind(t, st, again);
    else this.playersBind(t, st, save, again);
  }

  // ----- identité, chandails, logo et aréna -----
  idHtml(t, st) {
    const other = getTeams().find((o) => o !== t).colors[0];
    const L = getLook(t), num = t.players[t.lines.F[0][1]].num, cur = st.kit || 'home';
    const lsel = (k) => `<label>${LOOK_LABELS[k]} <select data-l="${k}">${opt(Object.entries(LOOK_OPTS[k]), L[k])}</select></label>`;
    return `<div class="ecols">
      <div class="col">
        <h4>Identité</h4>
        <label>Ville <input type="text" data-f="city" maxlength="22" value="${esc(t.city)}"></label>
        <label>Nom <input type="text" data-f="name" maxlength="18" value="${esc(t.name)}"></label>
        <label>Abréviation <input type="text" data-f="abbr" maxlength="4" value="${esc(t.abbr)}" class="short"></label>
        <label>Association <select data-f="conf">${opt([['Est', 'Est'], ['Ouest', 'Ouest']], t.conf)}</select></label>
        <h4>Couleurs</h4>
        <label>Principale <input type="color" data-c="0" value="${t.colors[0]}"></label>
        <label>Secondaire <input type="color" data-c="1" value="${t.colors[1]}"></label>
        <label>Tertiaire <input type="color" data-c="2" value="${t.colors[2]}"></label>
        <h4>Aréna</h4>
        <label>Couleur de la glace <input type="color" data-lc="ice" value="${L.ice}"></label>
        <label>Couleur des bandes <input type="color" data-lc="boards" value="${L.boards}"></label>
      </div>
      <div class="col">
        <h4>Motif du chandail</h4>
        ${['stripes', 'shoulders', 'panels', 'numStyle'].map(lsel).join('')}
        <h4>Logo</h4>
        <div class="logorow">${logoImg(t, 'lg-l')}<div>${['logoShape', 'logoMotif', 'logoText'].map(lsel).join('')}</div></div>
        <h4>Alignement</h4>
        <label>Force <select data-reroll>${opt([[70, 'Modeste'], [76, 'Moyenne'], [80, 'Forte'], [84, 'Élite']], 76)}</select></label>
        <button data-a="reroll">Générer 20 nouveaux joueurs</button>
        ${t.custom ? '<button data-a="delete">Supprimer cette équipe</button>'
    : `<button data-a="reset" ${t.edited ? '' : 'disabled'}>Rétablir l'équipe d'origine</button>`}
      </div>
      <div class="col pvcol">
        <h4>Aperçu 3D <small>${KIT_NAMES[cur]}</small></h4>
        <div class="pv" data-pv></div>
        <div class="kits">${['home', 'away', 'retro'].map((v) => `<button data-kit="${v}" class="kitb ${v === cur ? 'cur' : ''}">${jerseySvg(kitFor(t, v, other), num)}<span>${KIT_NAMES[v]}</span></button>`).join('')}</div>
      </div></div>`;
  }

  idBind(t, save, again, st) {
    const ui = this.ui, preview = () => ui.app.previewTeam(t);
    const other = getTeams().find((o) => o !== t).colors[0];
    // aperçu 3D : un seul canevas, replacé dans la page à chaque rafraîchissement
    try {
      this.pv = this.pv || new Preview3D();
      ui.el.querySelector('[data-pv]').appendChild(this.pv.canvas);
      this.pv.setKit({ ...kitFor(t, st.kit || 'home', other), logo: logoCanvas(t) }, t.players[t.lines.F[0][1]].num);
    } catch { ui.el.querySelector('[data-pv]').textContent = 'Aperçu 3D indisponible sur cet appareil.'; }
    ui.on('[data-kit]', (n) => again({ ...st, kit: n.dataset.kit }, `[data-kit="${n.dataset.kit}"]`));
    ui.on('[data-l]', (n) => { t.look = { ...getLook(t), [n.dataset.l]: n.value }; save(); preview(); again(undefined, `[data-l="${n.dataset.l}"]`); }, 'change');
    ui.on('[data-lc]', (n) => { t.look = { ...getLook(t), [n.dataset.lc]: n.value.toLowerCase() }; save(); preview(); again(undefined, `[data-lc="${n.dataset.lc}"]`); }, 'change');
    ui.on('[data-f]', (n) => {
      const k = n.dataset.f; let v = n.value.trim();
      if (k === 'abbr') v = v.toUpperCase().replace(/[^A-ZÀ-Ü0-9]/g, '');
      if (!v) { this.note('Ce champ ne peut pas être vide.'); return again(undefined, `[data-f="${k}"]`); }
      t[k] = v; save();
      if (k === 'abbr' || k === 'name') preview();
      again(undefined, `[data-f="${k}"]`);
    }, 'change');
    ui.on('[data-c]', (n) => { t.colors[+n.dataset.c] = n.value.toLowerCase(); save(); preview(); again(undefined, `[data-c="${n.dataset.c}"]`); }, 'change');
    ui.on('[data-a]', (n) => {
      const a = n.dataset.a;
      if (a === 'reroll') {
        if (!confirm('Remplacer les 20 joueurs de cette équipe par de nouveaux joueurs ?')) return;
        rerollRoster(t, +ui.el.querySelector('[data-reroll]').value);
        this.note('Nouvel alignement généré.'); again();
      } else if (a === 'reset') {
        if (!confirm('Annuler toutes les modifications apportées à cette équipe ?')) return;
        const fresh = resetTeam(t);
        ui.app.previewTeam(fresh); this.note('Équipe d\'origine rétablie.'); this.team(fresh, 'id');
      } else if (a === 'delete') {
        if (!confirm(`Supprimer définitivement ${t.city} ${t.name} ?`)) return;
        deleteTeam(t); ui.sel.user = 0; ui.sel.opp = 8;
        this.note('Équipe supprimée.'); this.list();
      }
    });
  }

  // ----- alignement -----
  linesHtml(t, st) {
    const slot = (grp, l, k, i, role) => {
      const p = t.players[i], key = `${grp},${l},${k}`;
      return `<button data-slot="${key}" class="slot ${st.pick === key ? 'cur' : ''}"><i>${role}</i><b>#${p.num} ${esc(p.name)}</b><small>${p.pos} · ${p.ovr}</small></button>`;
    };
    const avg = (ix) => Math.round(ix.reduce((s, i) => s + t.players[i].ovr, 0) / ix.length);
    const chem = teamChem(t);
    const ch = (c) => `<small>cote ${'%AVG%'}</small><em class="chem ${c >= 62 ? 'hi' : c < 45 ? 'lo' : ''}">chimie ${c} · ${chemBonus(c) >= 0 ? '+' : ''}${chemBonus(c)}</em>`;
    const F = t.lines.F.map((ln, l) => `<div class="lrow"><span title="${chemLabel(chem.F[l])}">Trio ${l + 1}${ch(chem.F[l]).replace('%AVG%', avg(ln))}</span>${ln.map((i, k) => slot('F', l, k, i, ['AG', 'C', 'AD'][k])).join('')}</div>`).join('');
    const D = t.lines.D.map((ln, l) => `<div class="lrow"><span title="${chemLabel(chem.D[l])}">Paire ${l + 1}${ch(chem.D[l]).replace('%AVG%', avg(ln))}</span>${ln.map((i, k) => slot('D', l, k, i, ['DG', 'DD'][k])).join('')}</div>`).join('');
    const G = `<div class="lrow"><span>Gardiens</span>${t.lines.G.map((i, k) => slot('G', 0, k, i, k ? 'Aux.' : 'Partant')).join('')}</div>`;
    return `<p class="dim">Clique sur un joueur, puis sur un autre pour les échanger. Les gardiens ne s'échangent qu'entre eux.<br>Chimie : un marqueur avec un fabricant de jeu, un joueur robuste pour les appuyer, chacun à sa position naturelle; en défense, un offensif avec un défensif. Le chiffre après la chimie s'ajoute aux passes, au sens du jeu, à la précision et au maniement.</p>
      <h4>Attaquants</h4>${F}<h4>Défenseurs</h4>${D}<h4>Devant le filet</h4>${G}
      <div class="row left"><button data-a="auto">Alignement optimal</button></div>`;
  }

  linesBind(t, st, again) {
    const ui = this.ui;
    const ref = (key) => { const [g, l, k] = key.split(','); return g === 'G' ? [t.lines.G, +k] : [t.lines[g][+l], +k]; };
    ui.on('[data-slot]', (n) => {
      const key = n.dataset.slot;
      if (!st.pick) return again({ pick: key }, `[data-slot="${key}"]`);
      if (st.pick !== key) {
        if ((st.pick[0] === 'G') !== (key[0] === 'G')) this.note('Un gardien ne peut être échangé qu\'avec l\'autre gardien.');
        else {
          const [a, i] = ref(st.pick), [b, j] = ref(key);
          [a[i], b[j]] = [b[j], a[i]];
          if (!commitTeam(t)) this.note('Sauvegarde impossible.');
        }
      }
      again({}, `[data-slot="${key}"]`);
    });
    ui.on('[data-a="auto"]', () => { autoLines(t); this.note('Trios reclassés selon la cote des joueurs.'); again({}); });
  }

  // ----- joueurs -----
  playersHtml(t, st) {
    const order = [...t.lines.F.flat(), ...t.lines.D.flat(), ...t.lines.G];
    const sel = st.p ?? order[0], p = t.players[sel], isG = p.pos === 'G';
    const rows = order.map((i) => { const q = t.players[i]; return `<button data-p="${i}" class="prow ${i === sel ? 'cur' : ''}"><b>${q.num}</b><span>${esc(q.name)}</span><i>${q.pos}</i><em>${q.ovr}</em></button>`; }).join('');
    const slider = (k) => `<label>${ATTR_LABELS[k]} <span><input type="range" min="30" max="99" step="1" data-attr="${k}" value="${p.a[k]}"><output>${p.a[k]}</output></span></label>`;
    return `<div class="ecols">
      <div class="col plist">${rows}</div>
      <div class="col">
        <h4>${esc(p.name)} <small>${POS_LABELS[p.pos]} · cote <b data-ovr>${p.ovr}</b></small></h4>
        <label>Nom <input type="text" data-pf="name" maxlength="26" value="${esc(p.name)}"></label>
        <label>Numéro <input type="number" data-pf="num" min="1" max="99" value="${p.num}" class="short"></label>
        <label>Âge <input type="number" data-pf="age" min="17" max="45" value="${p.age}" class="short"></label>
        ${isG ? '' : `<label>Position <select data-pf="pos">${opt(['LW', 'C', 'RW', 'D'].map((k) => [k, POS_LABELS[k]]), p.pos)}</select></label>
        <label>Style <select data-pf="style">${opt(SKATER_STYLES.map((s) => [s, s]), p.style)}</select></label>`}
        <label>${isG ? 'Mitaine' : 'Lance de la'} <select data-pf="hand">${opt([[-1, 'Gauche'], [1, 'Droite']], p.hand)}</select></label>
        <h4>Attributs</h4>
        ${(isG ? G_ATTRS : ATTRS).map(slider).join('')}
      </div></div>`;
  }

  playersBind(t, st, save, again) {
    const ui = this.ui, order = [...t.lines.F.flat(), ...t.lines.D.flat(), ...t.lines.G];
    const sel = st.p ?? order[0], p = t.players[sel];
    ui.on('[data-p]', (n) => again({ p: +n.dataset.p }, `[data-p="${n.dataset.p}"]`));
    ui.on('[data-pf]', (n) => {
      const k = n.dataset.pf, focus = `[data-pf="${k}"]`;
      if (k === 'name') {
        const v = n.value.trim();
        if (!v) this.note('Le nom ne peut pas être vide.'); else p.name = v;
      } else if (k === 'num') {
        const v = Math.round(+n.value), other = t.players.find((q) => q !== p && q.num === v);
        if (!(v >= 1 && v <= 99)) this.note('Le numéro doit être entre 1 et 99.');
        else if (other) this.note(`Le numéro ${v} est déjà porté par ${other.name}.`);
        else p.num = v;
      } else if (k === 'age') p.age = Math.min(45, Math.max(17, Math.round(+n.value) || p.age));
      else if (k === 'hand') p.hand = +n.value;
      else p[k] = n.value;
      save(); again({ p: sel }, focus);
    }, 'change');
    // curseurs : mise à jour immédiate de la valeur et de la cote, sauvegarde au relâchement
    ui.on('[data-attr]', (n) => {
      p.a[n.dataset.attr] = +n.value;
      n.nextElementSibling.textContent = n.value;
      ui.el.querySelector('[data-ovr]').textContent = calcOvr(p);
    }, 'input');
    ui.on('[data-attr]', (n) => { save(); again({ p: sel }, `[data-attr="${n.dataset.attr}"]`); }, 'change');
  }
}
