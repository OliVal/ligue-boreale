// Sauvegarde locale (localStorage). Les emplacements de Carrière/Franchise s'ajouteront aux étapes 4 et 5.
import { DEFAULT_SETTINGS, DEFAULT_KEYS } from '../core/config.js';

const KEY = 'hockeyweb.settings.v1';

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...raw, keys: { ...DEFAULT_KEYS, ...(raw.keys || {}) } };
  } catch { return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } }; }
}

// Équipes modifiées et équipes créées (éditeur d'équipe)
const TEAMS_KEY = 'hockeyweb.teams.v1';
export function loadTeamData() {
  try { return JSON.parse(localStorage.getItem(TEAMS_KEY) || 'null'); } catch { return null; }
}
export function saveTeamData(d) {
  try { localStorage.setItem(TEAMS_KEY, JSON.stringify(d)); return true; } catch { return false; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ }
}

// Carrière : trois emplacements, sauvegarde automatique après chaque match et chaque décision
export const CAREER_SLOTS = 3;
const careerKey = (slot) => `hockeyweb.career.v1.${slot}`;
export function loadCareer(slot) {
  try { const c = JSON.parse(localStorage.getItem(careerKey(slot)) || 'null'); return c && c.v === 1 && c.season ? c : null; } catch { return null; }
}
export function saveCareer(slot, c) {
  try { localStorage.setItem(careerKey(slot), JSON.stringify(c)); return true; } catch { return false; }
}
export function deleteCareer(slot) {
  try { localStorage.removeItem(careerKey(slot)); } catch { /* stockage indisponible */ }
}

// Franchise : trois emplacements
export const SAVE_SLOTS = 3;
const franchiseKey = (slot) => `hockeyweb.franchise.v1.${slot}`;
export function loadFranchise(slot) {
  try { const f = JSON.parse(localStorage.getItem(franchiseKey(slot)) || 'null'); return f && f.v === 1 && f.teams ? f : null; } catch { return null; }
}
export function saveFranchise(slot, f) {
  try { localStorage.setItem(franchiseKey(slot), JSON.stringify(f)); return true; } catch { return false; }
}
export function deleteFranchise(slot) {
  try { localStorage.removeItem(franchiseKey(slot)); } catch { /* stockage indisponible */ }
}
