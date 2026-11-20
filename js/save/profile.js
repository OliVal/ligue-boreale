// Profil du joueur : succès obtenus et objets débloqués (communs à tous les modes)
const KEY = 'hockeyweb.profile.v1';

// Objets cosmétiques par catégorie. Le premier de chaque catégorie est offert au départ.
export const ITEMS = {
  stick: { label: 'Bâton', list: { classic: { name: 'Composite noir', color: '#2b2b30' }, wood: { name: 'Bois d\'érable', color: '#b98a4e' }, neon: { name: 'Néon', color: '#39ff9c' },
    blue: { name: 'Bleu glacier', color: '#3aa0ff' }, gold: { name: 'Doré', color: '#e2b93b' } } },
  gloves: { label: 'Gants', list: { classic: { name: 'Noirs', color: '#1a1a1e' }, white: { name: 'Blancs', color: '#f2f2f2' }, red: { name: 'Rouges', color: '#c8281e' }, gold: { name: 'Dorés', color: '#d4a92a' } } },
  celeb: { label: 'Célébration de but', list: { classic: { name: 'Poing levé' }, spin: { name: 'Toupie' }, knee: { name: 'Glissade sur un genou' }, jump: { name: 'Sauts de joie' } } },
  rink: { label: 'Patinoire', list: { classic: { name: 'Aréna de l\'équipe' }, winter: { name: 'Classique hivernale', ice: '#dbe9f5', boards: '#8a5a33' },
    night: { name: 'Glace de nuit', ice: '#2b3d57', boards: '#111418' }, aurora: { name: 'Aurore boréale', ice: '#d6f5e8', boards: '#3b2a6b' } } },
  jersey: { label: 'Chandail', list: { regular: { name: 'Régulier' }, retro: { name: 'Rétro' }, black: { name: 'Noir intégral' }, gold: { name: 'Édition dorée' }, champion: { name: 'Chandail des champions' } } },
};
const FREE = { stick: ['classic'], gloves: ['classic'], celeb: ['classic'], rink: ['classic'], jersey: ['regular', 'retro'] };

// Succès : chacun débloque un objet [catégorie, identifiant]
export const ACH = [
  { id: 'firstWin', name: 'Première victoire', desc: 'Gagne un match.', item: ['stick', 'wood'] },
  { id: 'hat', name: 'Tour du chapeau', desc: 'Un joueur de ton équipe marque 3 buts dans un match (en Carrière : ton joueur).', item: ['celeb', 'spin'] },
  { id: 'shutout', name: 'Jeu blanc', desc: 'Gagne sans accorder de but.', item: ['gloves', 'white'] },
  { id: 'so', name: 'Sang-froid', desc: 'Gagne un match en tirs de barrage.', item: ['celeb', 'knee'] },
  { id: 'fight', name: 'Dur à cuire', desc: 'Gagne une bagarre.', item: ['gloves', 'red'] },
  { id: 'five', name: 'Avalanche', desc: 'Marque 5 buts ou plus dans un match (en Carrière : en obtenant au moins un point).', item: ['stick', 'neon'] },
  { id: 'wins10', name: 'Dix de suite, ou presque', desc: 'Cumule 10 victoires.', item: ['jersey', 'black'] },
  { id: 'hard', name: 'Légende', desc: 'Gagne un match au niveau de difficulté le plus élevé.', item: ['jersey', 'gold'] },
  { id: 'drafted', name: 'Espoir', desc: 'Carrière : fais-toi repêcher.', item: ['stick', 'blue'] },
  { id: 'ability', name: 'Talent spécial', desc: 'Carrière : débloque une capacité spéciale.', item: ['celeb', 'jump'] },
  { id: 'bigLeague', name: 'La cour des grands', desc: 'Carrière : atteins la grande ligue.', item: ['rink', 'winter'] },
  { id: 'level10', name: 'Aguerri', desc: 'Carrière : atteins le niveau 10.', item: ['gloves', 'gold'] },
  { id: 'trade', name: 'Fin négociateur', desc: 'Franchise : conclus un échange.', item: ['stick', 'gold'] },
  { id: 'playoffs', name: 'Fièvre du printemps', desc: 'Franchise : qualifie ton équipe pour les séries.', item: ['rink', 'night'] },
  { id: 'cup', name: 'Champion', desc: 'Franchise : remporte la Coupe Boréale.', item: ['jersey', 'champion'] },
  { id: 'dynasty', name: 'Dynastie', desc: 'Franchise : remporte deux Coupes Boréale.', item: ['rink', 'aurora'] },
];

let P = null;
const listeners = [];
function load() {
  if (P) return P;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* stockage indisponible */ }
  P = { ach: {}, wins: 0, cups: 0, equip: {}, ...(raw && typeof raw === 'object' ? raw : {}) };
  for (const k of Object.keys(ITEMS)) if (!ITEMS[k].list[P.equip[k]] || !owned(k, P.equip[k])) P.equip[k] = FREE[k][0];
  return P;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* stockage indisponible */ } }

export const profile = () => load();
export function owned(cat, id) {
  if (FREE[cat].includes(id)) return true;
  const a = ACH.find((x) => x.item[0] === cat && x.item[1] === id);
  return !!(a && (P || load()).ach[a.id]);
}
export const sourceOf = (cat, id) => ACH.find((x) => x.item[0] === cat && x.item[1] === id) || null;
export const equipped = () => ({ ...load().equip });
export function equip(cat, id) { if (!owned(cat, id)) return false; load().equip[cat] = id; save(); return true; }
export const item = (cat) => ITEMS[cat].list[load().equip[cat]];
export const ownedList = (cat) => Object.keys(ITEMS[cat].list).filter((id) => owned(cat, id));

// Débloque un succès (une seule fois) et prévient l'interface
export function unlock(id) {
  const p = load(), a = ACH.find((x) => x.id === id);
  if (!a || p.ach[id]) return false;
  p.ach[id] = Date.now(); save();
  for (const fn of listeners) fn(a, ITEMS[a.item[0]].list[a.item[1]], ITEMS[a.item[0]].label);
  return true;
}
export function bump(key) { const p = load(); p[key] = (p[key] || 0) + 1; save(); return p[key]; }
export const onUnlock = (fn) => listeners.push(fn);
