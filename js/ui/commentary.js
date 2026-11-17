// Commentaires textuels en direct : description du jeu avec variété, priorités et contexte du match
import { PENALTY_NAMES } from '../core/config.js';
import { R } from '../core/util.js';

const last = (pl) => (pl ? pl.name.split(' ').slice(1).join(' ') || pl.name : '');
const pick = (...a) => a[Math.floor(R.f() * a.length)];
const ordinal = (p) => (p === 1 ? 'première' : p === 2 ? 'deuxième' : 'troisième');

export class Commentary {
  // say(texte, priorité) : 1 = remplissage, 2 = jeu important, 3 = moment clé
  constructor(say, card) { this.say = say; this.card = card; this.match = null; this.shot = null; this.rebound = null; }

  setMatch(m) {
    this.match = m; this.shot = null; this.rebound = null; this.whistles = 0;
    m.on((type, d) => this.on(type, d));
  }

  score() {
    const [a, b] = this.match.teams;
    if (a.score === b.score) return a.score === 0 ? 'Toujours aucun but dans ce match.' : `C'est l'égalité ${a.score} à ${b.score}.`;
    const l = a.score > b.score ? a : b, t = a.score > b.score ? b : a, d = l.score - t.score;
    return `Les ${l.data.name} mènent ${l.score} à ${t.score}${d >= 3 ? ', une avance confortable' : d === 1 ? ', tout reste à jouer' : ''}.`;
  }

  on(type, d) {
    const m = this.match, say = this.say;
    switch (type) {
      case 'faceoffWon':
        if (R.chance(0.45)) say(pick(`${last(d.by.p)} remporte la mise au jeu.`, `Mise au jeu gagnée par ${last(d.by.p)} pour les ${d.team.data.name}.`, `${last(d.by.p)} ramène la rondelle vers l'arrière.`), 1);
        break;
      case 'shot': {
        const n = last(d.by.p);
        let txt;
        if (d.oneT) txt = pick(`Tir sur réception de ${n}…`, `${n} frappe sur réception…`);
        else if (d.type === 'slap') txt = d.dist > 14 ? pick(`Lancer frappé de la pointe…`, `${n} s'élance de la ligne bleue…`) : pick(`Lancer frappé de ${n}…`, `${n} y va d'un boulet…`);
        else txt = d.dist < 6 ? pick(`${n} tire de près…`, `${n} dans l'enclave, il lance…`) : pick(`${n} décoche un tir du poignet…`, `Lancer de ${n}…`, `${n} tente sa chance…`);
        this.shot = { txt, t: m.time, by: d.by };
        say(txt, 2);
        break;
      }
      case 'save': {
        const g = last(d.goalie.p);
        const how = { mitaine: ' de la mitaine', bouclier: ' du bouclier', 'jambières': ' de la jambière', corps: '' }[d.type];
        const pre = this.shot && m.time - this.shot.t < 1.5 ? this.shot.txt + ' ' : '';
        say(pre + (d.caught ? pick(`ARRÊT${how} ! ${g} garde la rondelle.`, `${g} dit non${how} et gèle le jeu !`, `ARRÊT de ${g} !`)
          : pick(`ARRÊT${how} ! Il y a un retour…`, `${g} repousse${how}, la rondelle est libre !`, `ARRÊT de ${g}, retour de lancer…`)), 3);
        this.rebound = d.caught ? null : { t: m.time, team: d.goalie.team };
        this.shot = null;
        break;
      }
      case 'miss': {
        const pre = this.shot && m.time - this.shot.t < 1.5 ? this.shot.txt + ' ' : '';
        say(pre + (d.high ? pick(`par-dessus le filet !`, `trop haut !`) : pick(`à côté du filet !`, `il rate la cible.`, `ça passe à côté !`)), 2);
        this.shot = null;
        break;
      }
      case 'post': {
        const pre = this.shot && m.time - this.shot.t < 1.5 ? this.shot.txt + ' ' : '';
        say(pre + (d.bar ? pick('LA BARRE HORIZONTALE !', 'ÇA FRAPPE LA BARRE !') : pick('LE POTEAU !', 'SUR LE POTEAU ! Quel bruit !')), 3);
        break;
      }
      case 'gain':
        if (this.rebound && m.time - this.rebound.t < 1.4 && d.by.team !== this.rebound.team && !d.by.isGoalie) {
          say(pick(`${last(d.by.p)} saute sur le retour !`, `Le retour à ${last(d.by.p)} !`), 3);
        }
        this.rebound = null;
        break;
      case 'block': say(pick(`Tir bloqué par ${last(d.by.p)}.`, `${last(d.by.p)} se sacrifie et bloque le lancer !`, `Ça frappe ${last(d.by.p)} en plein dans la jambière.`), 2); break;
      case 'tip': say(pick(`Déviation de ${last(d.by.p)} !`, `${last(d.by.p)} fait dévier la rondelle !`), 3); break;
      case 'breakaway': say(pick(`ÉCHAPPÉE de ${last(d.by.p)} !`, `${last(d.by.p)} s'échappe seul devant le gardien !`, `${last(d.by.p)} file fin seul !`), 3); break;
      case 'hit':
        if (d.illegal) say(`${last(d.by.p)} frappe ${last(d.on.p)} loin de la rondelle…`, 2);
        else if (d.big) say(pick(`QUELLE MISE EN ÉCHEC de ${last(d.by.p)} sur ${last(d.on.p)} !`, `${last(d.on.p)} est envoyé au tapis par ${last(d.by.p)} !`, `BOUM ! ${last(d.by.p)} ne s'est pas gêné !`), 3);
        else if (!d.weak) say(pick(`Solide mise en échec de ${last(d.by.p)}.`, `${last(d.by.p)} applique l'épaule.`, `${last(d.by.p)} termine sa mise en échec.`), 2);
        break;
      case 'poke': if (R.chance(0.5)) say(pick(`${last(d.by.p)} harponne la rondelle.`, `Revirement ! ${last(d.by.p)} soutire la rondelle à ${last(d.on.p)}.`, `Beau repli de ${last(d.by.p)}.`), 1); break;
      case 'pass':
        if (d.saucer && R.chance(0.6)) say(pick(`Passe soulevée de ${last(d.by.p)} vers ${last(d.to.p)}.`, `Belle soucoupe de ${last(d.by.p)}.`), 1);
        else if (R.chance(0.08) && !d.by.isGoalie) say(pick(`${last(d.by.p)} repère ${last(d.to.p)}.`, `${last(d.by.p)}, à ${last(d.to.p)}.`, `Passe de ${last(d.by.p)}.`), 1);
        break;
      case 'dump': say(pick(`${last(d.by.p)} dégage la rondelle.`, `${last(d.by.p)} envoie la rondelle en fond de territoire.`, `Dégagement de ${last(d.by.p)}.`), 1); break;
      case 'deke': if (R.chance(0.35)) say(pick(`Belle feinte de ${last(d.by.p)} !`, `${last(d.by.p)} déjoue son couvreur !`, `Quelles mains de ${last(d.by.p)} !`), 2); break;
      case 'penaltyCall': say(d.ps ? 'Le bras de l\'arbitre est levé… ce sera un tir de pénalité !' : pick('Pénalité à retardement !', 'L\'arbitre a le bras levé…'), 3); break;
      case 'penalty': {
        const o = m.other(d.team);
        say(`Pénalité à ${d.pl.name} : ${PENALTY_NAMES[d.type].toLowerCase()}, ${d.min} minutes. Avantage numérique pour les ${o.data.name}.`, 3);
        break;
      }
      case 'penaltyEnd': say(pick(`${last(d.pl)} quitte le banc des pénalités.`, `Pénalité écoulée, les ${d.team.data.name} reviennent à forces égales.`), 2); break;
      case 'whistle': {
        this.whistles++;
        const line = {
          offside: pick('Hors-jeu. Mise au jeu en zone neutre.', 'Coup de sifflet : hors-jeu.', 'Un joueur avait devancé la rondelle. Hors-jeu.'),
          icing: pick('Dégagement refusé.', `Dégagement refusé contre les ${d.team ? d.team.data.name : 'visiteurs'}, la mise au jeu revient dans leur zone.`),
          out: pick('La rondelle quitte la surface de jeu.', 'Par-dessus la baie vitrée ! Arrêt de jeu.'),
        }[d.reason];
        if (line) say(line, 2);
        // capsule statistique de temps à autre pendant les arrêts
        if (m.mode === 'game' && this.whistles % 4 === 0) {
          const [a, b] = m.teams;
          const k = R.i(0, 2);
          if (k === 0) this.card('TIRS AU BUT', `${a.data.abbr} ${a.stats.shots} — ${b.stats.shots} ${b.data.abbr}`);
          else if (k === 1) this.card('MISES EN ÉCHEC', `${a.data.abbr} ${a.stats.hits} — ${b.stats.hits} ${b.data.abbr}`);
          else { const fo = a.stats.fow + b.stats.fow || 1; this.card('MISES AU JEU', `${a.data.abbr} ${Math.round(a.stats.fow / fo * 100)} % — ${Math.round(b.stats.fow / fo * 100)} % ${b.data.abbr}`); }
        } else if (m.mode === 'game' && d.reason !== 'penalty' && R.chance(0.2)) say(this.score(), 1);
        break;
      }
      case 'goal': {
        if (!d.scorer) { say('ET LE BUT !', 3); break; }
        const str = { AN: ' en avantage numérique', DN: ' en désavantage numérique', FD: ' dans un filet désert' }[d.str] || '';
        const n = d.scorer.st.g;
        const tally = n === 3 ? ' TOUR DU CHAPEAU !' : n === 2 ? ' Son deuxième du match !' : '';
        const as = d.assists.length ? ` Aide${d.assists.length > 1 ? 's' : ''} : ${d.assists.map(last).join(' et ')}.` : '';
        say(pick(`ET LE BUT ! ${d.scorer.name} marque pour les ${d.team.data.name}${str} !`, `IL LANCE ET COMPTE ! ${d.scorer.name}${str} !`, `C'EST DANS LE FILET ! ${d.scorer.name} fait bouger les cordages${str} !`) + tally + as, 3);
        break;
      }
      case 'lastMinute': if (d.period <= 3) say(`Dernière minute de jeu en ${ordinal(d.period)} période. ${this.score()}`, 2); break;
      case 'periodEnd': say(d.period <= 3 ? `C'est la fin de la ${ordinal(d.period)} période. ${this.score()}` : 'Fin de la prolongation : on s\'en va en tirs de barrage !', 3); break;
      case 'periodStart': say(d.period === 4 ? 'Prolongation à 3 contre 3 : le prochain but gagne !' : `Début de la ${ordinal(d.period)} période sur une glace fraîchement refaite.`, 2); break;
      case 'goaliePulled': say(`Les ${d.team.data.name} retirent leur gardien pour un sixième attaquant !`, 3); break;
      case 'fightStart': say(pick(`Les gants tombent ! ${last(d.a.p)} contre ${last(d.o.p)} !`, `Ça brasse ! ${last(d.a.p)} et ${last(d.o.p)} jettent les gants !`), 3); break;
      case 'fightEnd': say(`${d.winner.p.name} a eu le dessus. Cinq minutes chacun.`, 2); break;
      case 'attemptStart': say(pick(`${d.shooter.name} s'élance${d.kind === 'ps' ? ' pour le tir de pénalité' : ''}…`, `${d.shooter.name} prend son élan…`), 2); break;
      case 'attemptEnd': say(d.result === 'goal' ? pick('ET LE BUT ! Quelle feinte !', 'IL DÉJOUE LE GARDIEN !') : d.result === 'save' ? pick('ARRÊT du gardien !', 'Le gardien ferme la porte !') : pick('Il rate la cible !', 'Raté !'), 3); break;
      case 'final': say(`C'est terminé ! Victoire des ${m.winner.data.name} de ${m.winner.data.city}.`, 3); break;
    }
  }
}
