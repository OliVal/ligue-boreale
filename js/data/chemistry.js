// Chimie entre coéquipiers d'un même trio ou d'une même paire (0 à 100).
// Une bonne chimie améliore passes, sens du jeu, précision et maniement des joueurs concernés.
export const CHEM_ATTRS = ['pas', 'sns', 'accu', 'hnd'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Trio : players = [ailier gauche, centre, ailier droit]
export function trioChem(players) {
  const slots = ['LW', 'C', 'RW'];
  let c = 46;
  const st = players.map((p) => p.style);
  players.forEach((p, i) => { c += p.pos === slots[i] ? 6 : p.pos === 'D' || p.pos === 'G' ? -9 : -2; });
  const has = (s) => st.includes(s);
  const finisher = has('Marqueur'), maker = has('Fabricant de jeu'), muscle = has('Joueur physique') || has('Plombier');
  if (finisher && maker) c += 16;                 // un passeur pour alimenter un marqueur
  if (muscle && (finisher || maker)) c += 8;      // quelqu'un pour gagner les batailles
  c += st.filter((s) => s === 'Attaquant complet').length * 4;
  if (st[0] === st[1] && st[1] === st[2]) c -= 12; // trois profils identiques
  if (st.filter((s) => s === 'Marqueur').length >= 2 && !maker) c -= 6;
  return Math.round(clamp(c, 0, 100));
}

// Paire de défenseurs
export function pairChem(players) {
  let c = 54;
  const st = players.map((p) => p.style);
  for (const p of players) if (p.pos !== 'D') c -= 10;
  const off = st.filter((s) => s === 'Défenseur offensif').length, def = st.filter((s) => s === 'Défenseur défensif').length;
  if (off === 1 && def === 1) c += 22;            // l'un monte, l'autre reste
  c += st.filter((s) => s === 'Défenseur complet').length * 8;
  if (off === 2) c -= 8;
  if (def === 2) c -= 2;
  return Math.round(clamp(c, 0, 100));
}

export function teamChem(team) {
  const P = (ix) => ix.map((i) => team.players[i]);
  return { F: team.lines.F.map((l) => trioChem(P(l))), D: team.lines.D.map((l) => pairChem(P(l))) };
}

// Points d'attribut gagnés ou perdus : de -4 (chimie 0) à +4 (chimie 100)
export const chemBonus = (c) => Math.round(((c - 50) / 50) * 4);
export const chemLabel = (c) => (c >= 80 ? 'Excellente' : c >= 62 ? 'Bonne' : c >= 45 ? 'Correcte' : 'Faible');
