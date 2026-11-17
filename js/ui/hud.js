// Affichage en match : pointage, chronomètre, pénalités, endurance, puissance, commentaires, mini-jeux
import { PENALTY_NAMES } from '../core/config.js';
import { keyName } from '../engine/input.js';

const $ = (id) => document.getElementById(id);
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
    if (!r) { el.className = ''; return; }
    $('rpT').textContent = r.title;
    $('rpS').textContent = `${r.shot.label} · angle ${r.n}/${r.total} · [${keyName(this.set.keys.slap)}] pour passer`;
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
  toast(txt) { const t = $('toast'); t.textContent = txt; t.className = 'on'; this.toastT = 1.6; }

  // Grands messages et mini-jeux (les commentaires du bandeau sont dans commentary.js)
  onEvent(type, d) {
    const m = this.match, k = this.set.keys;
    switch (type) {
      case 'faceoffEarly': if (d.side == null || d.side === this.match.userTeam) this.toast('Trop tôt ! Mise au jeu perdue'); break;
      case 'post': this.toast(d.bar ? 'Barre horizontale !' : 'Poteau !'); break;
      case 'breakaway': if (d.by.team.isUser) this.toast('Échappée !'); break;
      case 'penalty': this.big('PÉNALITÉ', `${d.pl.name} (${d.team.data.abbr}) — ${PENALTY_NAMES[d.type]}, ${d.min} minutes`, 2.6, 'warn'); break;
      case 'whistle': {
        const msg = { offside: ['HORS-JEU', 'Mise au jeu en zone neutre'], icing: ['DÉGAGEMENT REFUSÉ', 'Mise au jeu en zone défensive'],
          out: ['RONDELLE HORS JEU', ''], freeze: ['ARRÊT DE JEU', 'Le gardien immobilise la rondelle'] }[d.reason];
        if (msg) this.big(msg[0], msg[1], 1.7);
        break;
      }
      case 'offsideDelayed': this.toast('Hors-jeu à retardement'); break;
      case 'goal': {
        const as = d.assists.length ? ` (${d.assists.map(last).join(', ')})` : ' (sans aide)';
        this.big('BUT !', d.scorer ? `${d.scorer.name}${m.mode === 'practice' ? '' : as}` : '', 4.2, 'goal');
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
    $('sbA').querySelector('.sc').textContent = a.score; $('sbB').querySelector('.sc').textContent = b.score;
    $('sbPer').textContent = m.mode === 'practice' ? 'ENTR.' : periodName(m.period);
    $('sbClk').textContent = m.mode === 'practice' || m.period === 5 ? '—' : mmss(m.clock);
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
    let fl = '';
    if (m.pending.length && m.state === 'play') fl += '<span class="warn">PÉNALITÉ À RETARDEMENT</span>';
    if ((m.offD[0] || m.offD[1]) && m.state === 'play') fl += '<span>HORS-JEU À RETARDEMENT</span>';
    if (this.flHtml !== fl) { this.flHtml = fl; $('flags').innerHTML = fl; }
    // joueur contrôlé
    const ub = m.userBody, pl = $('pl');
    if (ub && ub.active && ub.p) {
      pl.className = 'on';
      $('plName').textContent = `#${ub.p.num} ${ub.p.name} · ${ub.role === 'X' ? 'ATT' : ub.role.replace('LD', 'DG').replace('RD', 'DD').replace('LW', 'AG').replace('RW', 'AD')}`;
      const st = ub.p.stamina;
      $('stam').style.width = `${st * 100}%`; $('stam').style.background = st < 0.25 ? '#ff5a3c' : st < 0.5 ? '#ffc93c' : '#3ddc84';
      const w = ub.windup ? Math.min(1, ub.windup.t / 0.8) : 0;
      $('pwRow').style.opacity = ub.windup ? 1 : 0.25; $('power').style.width = `${w * 100}%`;
      const t = ub.team;
      $('plLine').textContent = m.mode === 'game' ? `Trio ${t.curF + 1} · Duo ${t.curD + 1} · Chimie ${t.chem.F[t.curF]}${t.skaters.some((q) => q.active && q.changing) ? ' (changement en cours)' : ''}` : '';
    } else pl.className = '';
    // mise au jeu
    const fo = m.fo, foEl = $('fo');
    if (m.state === 'faceoff' && fo && fo.user) {
      foEl.className = 'on' + (fo.early ? ' bad' : '');
      $('foTxt').textContent = fo.early ? 'Trop tôt !' : `Mise au jeu : appuie sur [${keyName(k.slap)}] dès que la rondelle tombe`;
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
