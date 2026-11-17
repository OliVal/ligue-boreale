// Ligues du mode Carrière : junior, mineure (clubs-écoles) et grande ligue
import { generateTeam, getTeams } from '../data/teams.js';

export const LEAGUES = [
  { name: 'Ligue junior des Cantons', short: 'Junior', lines: ['2e trio', '2e duo'] },
  { name: 'Ligue Continentale', short: 'Ligue mineure' },
  { name: 'Ligue Boréale', short: 'Grande ligue' },
];

const JUNIOR = [
  ['Saint-Aubert', 'Éperviers', 'SAU', '#1b3a6b', '#f4f4f4', '#e0b13a', 'Junior', 61],
  ['Grand-Portage', 'Draveurs', 'GPO', '#2f5d3a', '#f1ead6', '#1d1d1d', 'Junior', 59],
  ['Val-Érable', 'Castors', 'VER', '#8a2b1a', '#f6e7c8', '#2a2a2a', 'Junior', 60],
  ['Pointe-aux-Loups', 'Marins', 'PAL', '#12365c', '#ffffff', '#c8202e', 'Junior', 62],
  ['Mont-Rosier', 'Béliers', 'MRO', '#5b2a6e', '#f0e9f5', '#d9b648', 'Junior', 58],
  ['Rivière-Blanche', 'Voltigeurs', 'RBL', '#b8231f', '#ffffff', '#1c2a4a', 'Junior', 61],
  ['Anse-Dorée', 'Mistral', 'ADO', '#c98f1c', '#1d1d22', '#f7f0dc', 'Junior', 59],
  ['Lac-Miroir', 'Huards', 'LMI', '#1f2428', '#d8dde3', '#2f9c8f', 'Junior', 60],
];

// Un club-école par équipe de la grande ligue, dans le même ordre
const FARM = [
  ['Havre-Gris', 'Goélands', 'HGR'], ['Roc-Blanc', 'Colosses', 'RBC'], ['Bois-Sombre', 'Coyotes', 'BSO'], ['Île-au-Vent', 'Flibustiers', 'IAV'],
  ['Mine-Rouge', 'Marteaux', 'MRG'], ['Anse-Bleue', 'Bélugas', 'ABL'], ['Fort-Cuivre', 'Goupils', 'FCU'], ['Marais-Pâle', 'Feux follets', 'MPA'],
  ['Astroport', 'Météores', 'AST'], ['Col-Blanc', 'Grizzlis', 'CBL'], ['Dune-Vive', 'Vipères', 'DVI'], ['Quai-Nord', 'Requins', 'QNO'],
  ['Plaine-Haute', 'Mustangs', 'PHA'], ['Braise-Ville', 'Salamandres', 'BRV'], ['Forêt-Givre', 'Cougars', 'FGI'], ['Baie-Jade', 'Griffons', 'BJA'],
];

let cache = null;
function lower() {
  if (cache) return cache;
  const age = (t, a, b) => { t.players.forEach((p, i) => { p.age = a + ((i * 7 + t.id) % (b - a + 1)); }); return t; };
  const junior = JUNIOR.map((d, i) => age(generateTeam(d, 100 + i, 5000 + i * 331), 16, 20));
  const big = getTeams().slice(0, 16);
  const farm = FARM.map((f, i) => {
    const b = big[i];
    return age(generateTeam([f[0], f[1], f[2], b.colors[0], b.colors[2], b.colors[1], 'Continentale', 66 + (b.rating - 74) * 0.5], 200 + i, 9000 + i * 577), 20, 31);
  });
  cache = [junior, farm];
  return cache;
}

// Équipes d'une ligue (0 junior, 1 mineure, 2 grande ligue)
export function leagueTeams(lg) {
  if (lg === 2) return getTeams().slice(0, 16);
  return lower()[lg];
}
export const teamStrength = (t) => t.players.reduce((s, p) => s + p.ovr, 0) / t.players.length;
