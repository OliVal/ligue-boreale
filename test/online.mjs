// Test sans affichage du mode en ligne : un hôte et un invité reliés par une fausse connexion (avec délai)
import { Match } from '../js/sim/match.js';
import { getTeams } from '../js/data/teams.js';
import { DEFAULT_SETTINGS, DT, DEFAULT_KEYS } from '../js/core/config.js';
import { R } from '../js/core/util.js';
import { NetHost, NetClient } from '../js/net/sync.js';
import { updateHuman } from '../js/game/human.js';

const ok = (c, msg) => { if (!c) throw new Error('ÉCHEC : ' + msg); };
const teams = getTeams();
const set = { ...DEFAULT_SETTINGS, periodMin: 2, fights: false, replays: 'off' };
R.seed(11);
const host = new Match({ home: teams[0], away: teams[5], settings: set, user: 0, versus: true });
const guestM = new Match({ home: JSON.parse(JSON.stringify(teams[0])), away: JSON.parse(JSON.stringify(teams[5])), settings: set, user: 1 });
// fausse connexion JSON avec 60 ms de délai, comme sur Internet
const LAG = 0.06; let clock = 0; const toGuest = [], toHost = [];
let bytes = 0;
const nh = new NetHost(host, (msg) => { const s = JSON.stringify(msg); bytes += s.length; toGuest.push([clock + LAG, s]); }, 1);
const nc = new NetClient(guestM, (msg) => toHost.push([clock + LAG, JSON.stringify(msg)]), 1);
nc.setPing(LAG * 2000);
const events = { host: {}, guest: {} };
host.on((t) => { events.host[t] = (events.host[t] || 0) + 1; });
guestM.on((t) => { events.guest[t] = (events.guest[t] || 0) + 1; });
const deliver = (q, fn) => { while (q.length && q[0][0] <= clock) fn(JSON.parse(q.shift()[1])); };

// clavier de l'invité : patine vers le filet adverse et lance de temps en temps
const ACTIONS = Object.keys(DEFAULT_KEYS);
let held = new Set(), hit = new Set();
const kb = { down: (a) => held.has(a), pressed: (a) => hit.has(a) };
const basis = { rx: 0, rz: 1, fx: -1, fz: 0 }; // l'invité attaque vers x négatif
const local = { down: () => false, pressed: () => false };
let frames = 0, maxErr = 0, sumErr = 0, nErr = 0, shotsByGuest = 0;
host.on((t, d) => { if (t === 'shot' && d.by.team.idx === 1 && d.by.human) shotsByGuest++; });
const FR = 1 / 60;
while (host.state !== 'final' && frames < 60 * 60 * 20) {
  frames++; clock += FR;
  // invité
  held = new Set(['up', ...(frames % 120 < 40 ? ['sprint'] : [])]);
  hit = new Set(frames % 90 === 0 ? ['wrist'] : frames % 200 === 0 ? ['pass'] : frames % 50 === 0 ? ['slap'] : []);
  nc.frame(FR, kb, basis, ACTIONS, false);
  // hôte
  deliver(toHost, (m) => nh.onMessage(m));
  updateHuman(host, kb, { rx: 0, rz: -1, fx: 1, fz: 0 }, 0); // le joueur de l'hôte joue aussi
  nh.applyRemote(basis);
  for (let i = 0; i < 2; i++) host.step(DT);
  nh.frame(FR);
  deliver(toGuest, (m) => nc.onMessage(m));
  // écart de position entre l'hôte et l'écran de l'invité
  if (nc.got && host.state === 'play') {
    host.teams.forEach((t, ti) => t.skaters.forEach((b, i) => {
      const g = guestM.teams[ti].skaters[i];
      if (!b.active || !g.active) return;
      const e = Math.hypot(b.x - g.x, b.z - g.z); maxErr = Math.max(maxErr, e); sumErr += e; nErr++;
    }));
  }
}
clock += 1; deliver(toGuest, (m) => nc.onMessage(m));
ok(host.state === "final", "match terminé");
const [a, b] = host.teams, [ga, gb] = guestM.teams;
console.log(`hôte ${a.score}-${b.score} · invité voit ${ga.score}-${gb.score} · état invité ${guestM.state}`);
ok(a.score === ga.score && b.score === gb.score, 'pointage identique');
ok(guestM.state === 'final', 'fin reçue');
ok(guestM.goals.length === host.goals.length && guestM.goals.every((g) => g.scorer && g.scorer.name), 'sommaire des buts reçu');
ok(guestM.stars.length === 3 && guestM.stars[0].pl.name === host.stars[0].pl.name, 'trois étoiles reçues');
ok(ga.stats.shots === a.stats.shots, 'statistiques reçues');
ok(shotsByGuest > 0, 'les lancers de l\'invité sont exécutés par l\'hôte');
console.log(`lancers de l'invité : ${shotsByGuest} · écart moyen de position ${(sumErr / nErr).toFixed(2)} m, max ${maxErr.toFixed(2)} m · débit ${(bytes / (frames / 60) / 1024).toFixed(1)} Ko/s`);
console.log('événements hôte/invité :', ['goal', 'shot', 'hit', 'save', 'whistle', 'faceoffWon'].map((t) => `${t} ${events.host[t] || 0}/${events.guest[t] || 0}`).join(' · '));
// mise au jeu à deux humains : celui qui appuie le premier après la chute gagne
R.seed(3);
const fm = new Match({ home: teams[1], away: teams[2], settings: set, user: 0, versus: true });
let won = null; fm.on((t, d) => { if (t === 'faceoffWon') won = d.team.idx; });
while (fm.state === 'faceoff' && !fm.fo.dropped) fm.step(DT);
fm.step(DT * 6); fm.faceoffPress(1); fm.step(DT * 3); fm.faceoffPress(0);
while (fm.state === 'faceoff') fm.step(DT);
ok(won === 1, 'mise au jeu gagnée par le plus rapide'); console.log('mise au jeu : gagnée par l\'équipe 1 (la plus rapide) ✓');
console.log('OK');
