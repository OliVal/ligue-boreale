// Entités de match : équipes, corps sur la glace, alignements et déploiement
import { ROLES, RINK } from '../core/config.js';
import { teamChem, chemBonus, CHEM_ATTRS } from '../data/chemistry.js';

let bodyId = 0;

export function mkBody(team, slot, isGoalie) {
  return {
    id: bodyId++, team, slot, isGoalie, role: isGoalie ? 'G' : ROLES[slot],
    p: null, active: false, human: false,
    x: 0, z: 0, vx: 0, vz: 0, face: team.dir > 0 ? 0 : Math.PI,
    ctrl: { mx: 0, mz: 0, sprint: false },
    stun: 0, checkT: 0, checkCd: 0, dekeT: 0, dekeCd: 0, pokeCd: 0, pickupCd: 0,
    windup: null, shotAnim: 0, oneTimer: null, lostPuckT: 9, stride: 0,
    changing: null, changeT: 0,
    ai: { next: 0, tx: 0, tz: 0, sp: 1, sprint: false, faceTo: null, zoneT: 0 },
    // gardien
    down: 0, track: null, holdT: 0, saveAnim: 0, saveSide: 0, dive: 0, diveX: 0, diveZ: 0, gc: null,
  };
}

export function mkTeam(data, idx, dir, baseCount) {
  const roster = data.players.map((d) => ({
    d, a: { ...d.a }, name: d.name, num: d.num, pos: d.pos, stamina: 1, unavailable: 0, ability: d.ability || null,
    st: { g: 0, a: 0, sog: 0, hits: 0, pim: 0, toi: 0, blk: 0, fow: 0, fol: 0, sa: 0, sv: 0, ga: 0, fz: 0 },
  }));
  const team = {
    idx, data, dir, baseCount, score: 0, roster,
    lines: {
      F: data.lines.F.map((l) => [roster[l[1]], roster[l[2]], roster[l[0]]]), // ordre C, RW, LW
      D: data.lines.D.map((l) => [roster[l[0]], roster[l[1]]]),
      G: data.lines.G.map((i) => roster[i]),
    },
    curF: 0, curD: 0, shiftT: 0,
    skaters: [], goalie: null, pens: [], pulled: false,
    stats: { shots: 0, hits: 0, fow: 0, ppg: 0, ppo: 0, toa: 0, blk: 0, pim: 0 },
    touch: [], ctx: {}, isUser: false, callFor: null, callT: 0,
    benchX: idx === 0 ? -5 : 5, boxX: idx === 0 ? -3 : 3,
  };
  // chimie de trio : bonus ou malus aux attributs de jeu collectif des coéquipiers
  team.chem = teamChem(data);
  const applyChem = (lines, vals) => lines.forEach((l, i) => {
    const b = chemBonus(vals[i]);
    for (const pl of l) for (const k of CHEM_ATTRS) pl.a[k] = Math.max(30, Math.min(99, pl.a[k] + b));
  });
  applyChem(team.lines.F, team.chem.F); applyChem(team.lines.D, team.chem.D);
  for (let i = 0; i < 6; i++) team.skaters.push(mkBody(team, i, false));
  team.goalie = mkBody(team, 0, true);
  team.goalie.p = team.lines.G[0];
  team.goalie.active = true;
  return team;
}

export const benchPos = (team) => ({ x: team.benchX, z: -RINK.W + 0.9 });
export const boxPos = (team) => ({ x: team.boxX, z: RINK.W - 0.9 });

const isOut = (pl) => pl.unavailable > 0;

// Listes ordonnées des attaquants et défenseurs disponibles (trio courant d'abord)
function availLists(team) {
  const fw = [], df = [];
  for (let k = 0; k < team.lines.F.length; k++) {
    for (const pl of team.lines.F[(team.curF + k) % team.lines.F.length]) if (!isOut(pl)) fw.push(pl);
  }
  for (let k = 0; k < team.lines.D.length; k++) {
    for (const pl of team.lines.D[(team.curD + k) % team.lines.D.length]) if (!isOut(pl)) df.push(pl);
  }
  return { fw, df };
}

// Joueur prévu pour chaque rôle selon le nombre de patineurs n
export function lineupFor(team, n) {
  const { fw, df } = availLists(team);
  const out = [];
  let fi = 0, di = 0;
  for (let i = 0; i < n; i++) {
    const role = ROLES[i];
    if (role === 'LD' || role === 'RD') out.push(df[di++] || fw[fi++]);
    else out.push(fw[fi++] || df[di++]);
  }
  return out;
}

// Assigne les joueurs aux corps (aux arrêts de jeu : instantané)
export function deploy(team, n) {
  const lu = lineupFor(team, n);
  for (let i = 0; i < 6; i++) {
    const b = team.skaters[i];
    if (i < n) { b.p = lu[i]; b.active = true; b.changing = null; }
    else { b.active = false; b.human = false; }
    b.stun = 0; b.windup = null; b.checkT = 0; b.oneTimer = null;
  }
}
