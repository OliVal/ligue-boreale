// Affichage en match : pointage, chronomètre, pénalités, endurance, puissance, commentaires, mini-jeux
import { PENALTY_NAMES } from '../core/config.js';
import { keyName, TOUCH } from '../engine/input.js';
import { logoCanvas } from '../data/kit.js';

const $ = (id) => document.getElementById(id);
// n'écrit le texte que s'il change (évite de recalculer la mise en page à chaque image, utile sur téléphone)
const setText = (e, v) => { v = String(v); if (e.textContent !== v) e.textContent = v; };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const periodName = (p) => (p === 1 ? '1re' : p === 2 ? '2e' : p === 3 ? '3e' : p === 4 ? 'PROL' : 'TB');
const last = (pl) => (pl ? pl.name.split(' ').slice(1).join(' ') || pl.name : '');

export class Hud {
  constructor(root, settings) {
    this.root = root; this.set = settings;
    root.innerHTML = `
      <div id="sb">
        <div class="tm" id="sbA"><span class="chip"></span><b class="ab"></b><span class="sc"></span></div>
        <div id="sbMid"><div id="sbPer"></div><div id="sbClk"></div></div>
        <div class="tm" id="sbB"><span class="sc"></span><b class="ab"></b><span class="chip"></span></div>
      </div>
      <div id="sbInfo"></div>
      <div id="flags"></div>
      <div id="big"><div id="bigT"></div><div id="bigS"></div></div>
      <div id="ticker"></div>
      <div id="bc"><div class="lg"><img alt=""></div><div class="tx"><small></small><b></b><span></span></div></div>
      <div id="pl"><div id="plName"></div>
        <div class="barRow"><span>Endurance</span><div class="bar"><i id="stam"></i></div></div>
        <div class="barRow" id="pwRow"><span>Puissance</span><div class="bar pw"><i id="power"></i></div></div>
        <div id="plLine"></div>
      </div>
      <div id="fo"><div id="foTxt"></div><div class="foBar"><i id="foMark"></i><em></em></div></div>
      <div id="fight"><div id="fgTitle">BAGARRE !</div>
        <div class="fgRow"><span id="fgA"></span><div class="bar"><i id="fgHA"></i></div></div>
        <div class="fgRow"><span id="fgB"></span><div class="bar"><i id="fgHB"></i></div></div>
        <div id="fgHelp"></div></div>
      <div id="so"></div>
      <div id="card"><b id="cardT"></b><span id="cardS"></span></div>
      <div id="rp"><div id="rpT"></div><div id="rpS"></div></div>
      <div id="star"></div>
      <div id="car"></div>
      <div id="toast"></div>`;
    this.bigT = 0; this.tickT = 0; this.toastT = 0; this.cardT = 0; this.tickP = 0; this.tickAge = 9; this.match = null;
  }

  setMatch(m) {
    this.match = m;
    const [a, b] = m.teams;
    for (const [el, t] of [[$('sbA'), a], [$('sbB'), b]]) {
      el.querySelector('.chip').style.background = t.data.colors[0];
      el.querySelector('.chip').style.borderColor = t.data.colors[1];
      el.querySelector('.ab').textContent = t.data.abbr;
    }
    $('ticker').textContent = ''; $('big').className = ''; this.bigT = 0;
    $('fight').className = ''; $('so').innerHTML = ''; $('card').className = ''; $('rp').className = ''; $('star').className = '';
    this.soHtml = ''; this.tickP = 0;
    this.bcQ = []; this.bcT = 0; this.bcWait = 0; $('bc').className = ''; this.ppSide = null;
    m.on((type, d) => this.onEvent(type, d));
    this.say(m.mode === 'practice' ? 'Entraînement libre : lancers, passes et feintes à volonté.' : `${a.data.city} reçoit ${b.data.city}. Bon match !`);
  }

  // Panneau du mode Carrière (note, objectif, capacité)
  career(html) {
    if (this.carHtml === html) return;
    this.carHtml = html; $('car').innerHTML = html; $('car').className = html ? 'on' : '';
  }

  big(title, sub = '', dur = 2.4, cls = '') {
    $('bigT').textContent = title; $('bigS').textContent = sub;
    $('big').className = 'on ' + cls; this.bigT = dur;
  }
  // Bandeau de commentaires : une ligne moins importante ne remplace pas tout de suite un moment clé
  say(txt, prio = 2) {
    if (prio < this.tickP && this.tickAge < 1.4) return;
    const t = $('ticker'); t.textContent = txt; t.className = 'on' + (prio >= 3 ? ' key' : '');
    this.tickT = prio >= 3 ? 5.5 : 4; this.tickP = prio; this.tickAge = 0;
  }
  card(title, text) { $('cardT').textContent = title; $('cardS').textContent = text; $('card').className = 'on'; this.cardT = 4.5; }
  replay(r) {
    const el = $('rp');
    this.root.classList.toggle('replaying', !!r);
    // gros bouton « Passer la reprise » en bas de l'écran (clic, doigt, touche X ou manette)
    let sk = $('rpSkip');
    if (!sk) {
      sk = document.createElement('button'); sk.id = 'rpSkip'; sk.type = 'button';
      sk.addEventListener('pointerdown', (e) => { e.preventDefault(); this.skipAsked = true; });
      this.root.appendChild(sk);
    }
    sk.classList.toggle('on', !!r);
    if (!r) { el.className = ''; return; }
    $('rpT').textContent = r.title;
    $('rpS').textContent = `${r.shot.label} · angle ${r.n}/${r.total}`;
    const txt = TOUCH.on ? '⏩ Touche ici pour passer la reprise' : `⏩ Appuie sur ${keyName(this.set.keys.skip || 'KeyX')} pour passer la reprise`;
    if (sk.textContent !== txt) sk.textContent = txt;
    el.className = 'on';
  }
  star(rank, e) {
    const el = $('star');
    this.root.classList.toggle('replaying', !!e);
    if (!e) { el.className = ''; return; }
    const st = e.pl.st, line = e.pl.pos === 'G' ? `${st.sv} arrêts sur ${st.sa} tirs` : `${st.g} but${st.g > 1 ? 's' : ''}, ${st.a} aide${st.a > 1 ? 's' : ''}, ${st.sog} tir${st.sog > 1 ? 's' : ''}`;
    el.innerHTML = `<div class="rk">${'★'.repeat(4 - rank)}</div><div class="lb">${rank === 1 ? 'PREMIÈRE' : rank === 2 ? 'DEUXIÈME' : 'TROISIÈME'} ÉTOILE</div><div class="nm"></div><div class="tm"></div><div class="ln">${line}</div>`;
    el.querySelector('.nm').textContent = `#${e.pl.num} ${e.pl.name}`;
    el.querySelector('.tm').textContent = `${e.team.data.city} ${e.team.data.name}`;
    el.className = 'on';
  }
  // Bandeau de diffusion (comme à la télé) : logo et couleurs de l'équipe, petit titre, nom, détails.
  // Les bandeaux passent un à la fois (file d'attente); delay : attendre avant de l'afficher (ex. après « BUT ! »)
  broadcast(team, kicker, title, line, dur = 4.5, cls = '', delay = 0) {
    this.bcQ.push({ team, kicker, title, line, dur, cls, delay });
  }
  bcNext() {
    const q = this.bcQ.shift(), el = $('bc');
    if (!q) return;
    const t = q.team && q.team.data;
    if (t) { el.style.setProperty('--c1', t.colors[0]); el.style.setProperty('--c2', t.colors[1]); el.querySelector('img').src = logoCanvas(t).url; }
    setText(el.querySelector('small'), q.kicker); setText(el.querySelector('b'), q.title); setText(el.querySelector('span'), q.line);
    el.className = 'on ' + q.cls; this.bcT = q.dur;
  }

  toast(txt) { const t = $('toast'); t.textContent = txt; t.className = 'on'; this.toastT = 1.6; }

  // Grands messages et mini-jeux (les commentaires du bandeau sont dans commentary.js)
  onEvent(type, d) {
    const m = this.match, k = this.set.keys;
    switch (type) {
      case 'faceoffEarly': if (d.side == null || d.side === this.match.userTeam) this.toast('Trop tôt ! Mise au jeu perdue'); break;
      case 'post': this.toast(d.bar ? 'Barre horizontale !' : 'Poteau !'); break;
      case 'breakaway': if (d.by.team.isUser) this.toast('Échappée !'); break;
      case 'penalty':
        if (m.mode === 'game') this.broadcast(d.team, `PÉNALITÉ · ${d.team.data.abbr}`, `#${d.pl.num} ${d.pl.name}`, `${PENALTY_NAMES[d.type]} · ${d.min} minutes`, 4.2, 'warn');
        else this.big('PÉNALITÉ', `${d.pl.name} (${d.team.data.abbr}) — ${PENALTY_NAMES[d.type]}, ${d.min} minutes`, 2.6, 'warn');
        break;
      case 'whistle': {
        const msg = { offside: ['HORS-JEU', 'Mise au jeu en zone neutre'], icing: ['DÉGAGEMENT REFUSÉ', 'Mise au jeu en zone défensive'],
          out: ['RONDELLE HORS JEU', ''], freeze: ['ARRÊT DE JEU', 'Le gardien immobilise la rondelle'] }[d.reason];
        if (msg) this.big(msg[0], msg[1], 1.7);
        break;
      }
      case 'offsideDelayed': this.toast('Hors-jeu à retardement'); break;
      case 'goal': {
        const as = d.assists.length ? ` (${d.assists.map(last).join(', ')})` : ' (sans aide)';
        if (m.mode === 'game' && d.scorer) {
          // le bandeau de diffusion donne les détails du but (le grand « BUT ! » reste seul au centre)
          this.big('BUT !', '', 4.2, 'goal');
          const sc = d.scorer, n = sc.st.g, se = sc.d && sc.d.season ? sc.d.season.g + n : 0;
          const STR = { AN: ' · EN AVANTAGE NUMÉRIQUE', DN: ' · EN INFÉRIORITÉ NUMÉRIQUE', FD: ' · DANS UN FILET DÉSERT', TP: ' · SUR UN TIR DE PÉNALITÉ' };
          const ord = (k) => (k === 1 ? '1er' : `${k}e`);
          const what = se ? `${ord(se)} but de la saison` : `${ord(n)} but du match`;
          const help = d.assists.length ? `Aides : ${d.assists.map((q) => q.name).join(', ')}` : 'Sans aide';
          this.bcQ = this.bcQ.filter((q) => q.kind !== 'pp'); // l'avantage numérique est réglé par le but
          this.goalAt = m.time;
          this.broadcast(d.team, `BUT · ${d.team.data.abbr}${STR[d.str] || ''}`, `#${sc.num} ${sc.name}`, `${what} · ${help} · ${periodName(m.period)} ${mmss(m.clock)}`, 5.5, 'goal', 1.1);
        } else this.big('BUT !', d.scorer ? `${d.scorer.name}${m.mode === 'practice' ? '' : as}` : '', 4.2, 'goal');
        const el = $(d.team.idx === 0 ? 'sbA' : 'sbB'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
        break;
      }
      case 'periodEnd': this.big(d.period <= 3 ? `FIN DE LA ${periodName(d.period).toUpperCase()} PÉRIODE` : 'FIN DE LA PROLONGATION', `${m.teams[0].data.abbr} ${m.teams[0].score} — ${m.teams[1].score} ${m.teams[1].data.abbr}`, 3.6); break;
      case 'goaliePulled': this.toast(`${d.team.data.abbr} : filet désert`); break;
      case 'lineChange': if (d.team.isUser) this.toast('Changement de trio'); break;
      case 'fightStart':
        $('fgA').textContent = d.a.p.name; $('fgB').textContent = d.o.p.name;
        $('fgHelp').textContent = d.userSide >= 0 ? `[${keyName(k.wrist)}] Frapper   [${keyName(k.pass)}] Bloquer (quand l'adversaire arme son coup)` : '';
        $('fight').className = 'on'; break;
      case 'fightWindup': if (m.fight && m.fight.userSide >= 0) this.toast('Il arme son coup — BLOQUE !'); break;
      case 'fightEnd': $('fight').className = ''; this.big('FIN DU COMBAT', `${d.winner.p.name} l'emporte — 5 minutes chacun`, 2.4, 'warn'); break;
      case 'shootoutStart': this.big('TIRS DE BARRAGE', '', 2); break;
      case 'attemptStart': if (d.kind === 'ps') this.big('TIR DE PÉNALITÉ', d.shooter.name, 1.4, 'warn'); break;
      case 'attemptEnd': this.big(d.result === 'goal' ? 'BUT !' : d.result === 'save' ? 'ARRÊT !' : 'RATÉ !', d.shooter.name, 2, d.result === 'goal' ? 'goal' : ''); break;
      case 'final': this.big('MATCH TERMINÉ', `${m.winner.data.city} ${m.winner.data.name} l'emportent !`, 5, 'goal'); break;
    }
  }

  update(m, dt) {
    const [a, b] = m.teams, k = this.set.keys;
    setText($('sbA').querySelector('.sc'), a.score); setText($('sbB').querySelector('.sc'), b.score);
    setText($('sbPer'), m.mode === 'practice' ? 'ENTR.' : periodName(m.period));
    setText($('sbClk'), m.mode === 'practice' || m.period === 5 ? '—' : mmss(m.clock));
    // pénalités et avantage numérique
    let info = '';
    if (m.mode === 'game') {
      const na = m.skaterCount(a) - (a.pulled ? 1 : 0), nb = m.skaterCount(b) - (b.pulled ? 1 : 0);
      const pens = (t) => t.pens.map((q) => `<span class="pen">#${q.pl.num} ${mmss(q.remain)}</span>`).join('');
      const mid = na !== nb ? `<b class="pp">${na > nb ? a.data.abbr : b.data.abbr} — AVANTAGE NUMÉRIQUE ${Math.max(na, nb)} c. ${Math.min(na, nb)}</b>` : (a.pens.length || b.pens.length) && na < m.set.skaters ? `<b>${na} c. ${nb}</b>` : '';
      const en = (a.pulled ? `<b class="pp">${a.data.abbr} FILET DÉSERT</b>` : '') + (b.pulled ? `<b class="pp">${b.data.abbr} FILET DÉSERT</b>` : '');
      info = `<div>${pens(a)}</div><div>${mid}${en}</div><div>${pens(b)}</div>`;
    }
    if (this.infoHtml !== info) { this.infoHtml = info; $('sbInfo').innerHTML = info; }
    // début et fin d'un avantage numérique : bandeau de diffusion
    if (m.mode === 'game' && !m.so && !a.pulled && !b.pulled) {
      const na = m.skaterCount(a), nb = m.skaterCount(b), side = na > nb ? 0 : nb > na ? 1 : null;
      if (side !== this.ppSide) {
        if (side != null) {
          const t = m.teams[side], o = m.teams[1 - side], pen = o.pens.slice().sort((x, y) => x.remain - y.remain)[0];
          const q = { team: t, kicker: 'AVANTAGE NUMÉRIQUE', title: `${t.data.city} ${t.data.name}`, line: `${Math.max(na, nb)} contre ${Math.min(na, nb)}${pen ? ` · ${mmss(pen.remain)} à écouler` : ''}`, dur: 4, cls: 'pp', delay: 0, kind: 'pp' };
          this.bcQ.push(q);
        } else if (this.ppSide != null && m.state !== 'goal' && !(this.goalAt != null && m.time - this.goalAt < 3)) {
          const t = m.teams[this.ppSide];
          this.bcQ.push({ team: t, kicker: "FIN DE L'AVANTAGE NUMÉRIQUE", title: `${a.data.abbr} ${a.score} — ${b.score} ${b.data.abbr}`, line: 'Retour à forces égales', dur: 3, cls: '', delay: 0, kind: 'pp' });
        }
        this.ppSide = side;
      }
    }
    // bandeau de diffusion : celui affiché, puis le suivant de la file
    if (this.bcT > 0) { this.bcT -= dt; if (this.bcT <= 0) { $('bc').className = ''; this.bcWait = 0.5; } }
    else if (this.bcWait > 0) this.bcWait -= dt;
    else if (this.bcQ.length) { if (this.bcQ[0].delay > 0) this.bcQ[0].delay -= dt; else this.bcNext(); }
    let fl = '';
    if (m.pending.length && m.state === 'play') fl += '<span class="warn">PÉNALITÉ À RETARDEMENT</span>';
    if ((m.offD[0] || m.offD[1]) && m.state === 'play') fl += '<span>HORS-JEU À RETARDEMENT</span>';
    if (this.flHtml !== fl) { this.flHtml = fl; $('flags').innerHTML = fl; }
    // joueur contrôlé
    const ub = m.userBody, pl = $('pl');
    if (ub && ub.active && ub.p) {
      pl.className = 'on';
      setText($('plName'), `#${ub.p.num} ${ub.p.name} · ${ub.role === 'X' ? 'ATT' : ub.role.replace('LD', 'DG').replace('RD', 'DD').replace('LW', 'AG').replace('RW', 'AD')}`);
      const st = ub.p.stamina;
      $('stam').style.width = `${st * 100}%`; $('stam').style.background = st < 0.25 ? '#ff5a3c' : st < 0.5 ? '#ffc93c' : '#3ddc84';
      const w = ub.windup ? Math.min(1, ub.windup.t / 0.8) : 0;
      $('pwRow').style.opacity = ub.windup ? 1 : 0.25; $('power').style.width = `${w * 100}%`;
      const t = ub.team;
      setText($('plLine'), m.mode === 'game' ? `Trio ${t.curF + 1} · Duo ${t.curD + 1} · Chimie ${t.chem.F[t.curF]}${t.skaters.some((q) => q.active && q.changing) ? ' (changement en cours)' : ''}` : '');
    } else pl.className = '';
    // mise au jeu
    const fo = m.fo, foEl = $('fo');
    if (m.state === 'faceoff' && fo && fo.user) {
      foEl.className = 'on' + (fo.early ? ' bad' : '');
      setText($('foTxt'), fo.early ? 'Trop tôt !' : TOUCH.on ? 'Mise au jeu : touche le gros bouton dès que la rondelle tombe' : `Mise au jeu : appuie sur [${keyName(k.slap)}] dès que la rondelle tombe`);
      $('foMark').style.left = `${Math.min(1, fo.t / fo.dropAt) * 88}%`;
    } else foEl.className = '';
    // bagarre
    if (m.fight) { $('fgHA').style.width = `${m.fight.hp[0] * 100}%`; $('fgHB').style.width = `${m.fight.hp[1] * 100}%`; }
    // tirs de barrage
    if (m.so) {
      const row = (t, r) => `<div><b>${t.data.abbr}</b> ${r.map((g) => `<i class="${g ? 'g' : 'x'}"></i>`).join('')}</div>`;
      const h = row(a, m.so.res[0]) + row(b, m.so.res[1]);
      if (this.soHtml !== h) { this.soHtml = h; $('so').innerHTML = h; }
    }
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) $('big').className = ''; }
    this.tickAge += dt;
    if (this.tickT > 0) { this.tickT -= dt; if (this.tickT <= 0) { $('ticker').className = ''; this.tickP = 0; } }
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) $('card').className = ''; }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').className = ''; }
  }
}
