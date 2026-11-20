// Constantes globales du jeu (unités : mètres, secondes)
export const RINK = {
  L: 30.5,        // demi-longueur
  W: 13,          // demi-largeur
  R: 8.5,         // rayon des coins
  goalX: 26.6,    // ligne de but
  blueX: 7.6,     // ligne bleue
  netHW: 0.92,    // demi-largeur du filet
  netH: 1.22,     // hauteur du filet
  netD: 1.1,      // profondeur du filet
  trapGoal: 2.74, // trapèze du gardien : demi-largeur sur la ligne de but (18 pi au total)
  trapEnd: 4.27,  // demi-largeur à la bande du fond (28 pi au total)
  boardH: 1.1,    // hauteur de la bande
  glassH: 2.9,    // hauteur bande + baie vitrée
};

export const DOTS = {
  center: { x: 0, z: 0 },
  neutral: [[-6.1, -6.7], [-6.1, 6.7], [6.1, -6.7], [6.1, 6.7]].map(([x, z]) => ({ x, z })),
  zone: [[-20.5, -6.7], [-20.5, 6.7], [20.5, -6.7], [20.5, 6.7]].map(([x, z]) => ({ x, z })),
};

export const DT = 1 / 120;       // pas fixe de simulation
export const G = 9.81;

// Ordre des rôles sur la glace : le corps i a toujours le rôle ROLES[i]
export const ROLES = ['C', 'LD', 'RD', 'RW', 'LW', 'X'];

export const DIFFS = [
  { name: 'Recrue',   aiReact: 0.34, aiErr: 1.9, aiSpeed: 0.90, cpuGoalie: -16, userGoalie: 8,  userErr: 0.75, aiCheck: 0.5 },
  { name: 'Pro',      aiReact: 0.22, aiErr: 1.35, aiSpeed: 0.96, cpuGoalie: -7,  userGoalie: 3,  userErr: 0.9,  aiCheck: 0.8 },
  { name: 'Étoile',   aiReact: 0.14, aiErr: 1.0, aiSpeed: 1.0,  cpuGoalie: 0,   userGoalie: 0,  userErr: 1.0,  aiCheck: 1.0 },
  { name: 'Légende',  aiReact: 0.08, aiErr: 0.8, aiSpeed: 1.03, cpuGoalie: 6,   userGoalie: -3, userErr: 1.1,  aiCheck: 1.2 },
];

// Carrière de gardien : les niveaux ci-dessus avantagent l'équipe de l'utilisateur (adversaires plus lents, moins précis, gardien
// adverse affaibli), ce qui est fait pour un patineur contrôlé. Quand on contrôle le gardien, ce sont les coéquipiers (ordinateur)
// qui en profitaient : écarts énormes et peu de tirs. Ici, les adversaires jouent à pleine force et le niveau aide surtout le gardien.
export const GOALIE_DIFFS = [
  // mesuré à « Pro » sur 12 matchs simulés : environ 4 buts pour, 3 contre et 24 tirs sur le gardien par match (avant : 9,5 à 1,5 et 14 tirs)
  { name: 'Recrue',  aiReact: 0.19, aiErr: 1.15, aiSpeed: 0.98, cpuGoalie: 10, userGoalie: 8,  userErr: 1.2,  aiCheck: 0.9 },
  { name: 'Pro',     aiReact: 0.15, aiErr: 1.0,  aiSpeed: 1.0,  cpuGoalie: 14, userGoalie: 3,  userErr: 1.25, aiCheck: 1.0 },
  { name: 'Étoile',  aiReact: 0.12, aiErr: 0.9,  aiSpeed: 1.02, cpuGoalie: 16, userGoalie: 0,  userErr: 1.3,  aiCheck: 1.1 },
  { name: 'Légende', aiReact: 0.09, aiErr: 0.8,  aiSpeed: 1.03, cpuGoalie: 18, userGoalie: -3, userErr: 1.35, aiCheck: 1.2 },
];

export const PENALTY_NAMES = {
  hook: 'Accrochage', cross: 'Double-échec', slash: 'Cinglage', hold: 'Retenue', fight: 'Bagarre', delay: 'Retard de jeu (trapèze)',
};

export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', slap: 'Space', wrist: 'KeyJ', pass: 'KeyK', saucer: 'KeyL',
  check: 'KeyF', deke: 'KeyR', switch: 'KeyQ', dump: 'KeyE', line: 'Tab', pause: 'Escape', camera: 'KeyC', ability: 'KeyG', skip: 'KeyX',
};

export const KEY_LABELS = {
  up: 'Patiner — haut', down: 'Patiner — bas', left: 'Patiner — gauche', right: 'Patiner — droite',
  sprint: 'Sprint', slap: 'Lancer frappé (maintenir)', wrist: 'Lancer du poignet', pass: 'Passe',
  saucer: 'Passe soulevée', check: 'Mise en échec', deke: 'Feinte / dangle', switch: 'Changer de joueur',
  dump: 'Dégager la rondelle', line: 'Changer de trio', pause: 'Pause', camera: 'Changer de caméra', ability: 'Capacité spéciale (Carrière)',
  skip: 'Sauter jusqu\'à ta présence (Carrière)',
};

export const DEFAULT_SETTINGS = {
  difficulty: 1,
  periodMin: 4,          // minutes réelles par période (l'horloge affiche 20:00)
  skaters: 5,            // 5, 4 ou 3
  offside: true, icing: true, penalties: true, fights: true,
  autoLines: true,
  replays: 'all',        // 'all', 'goals' ou 'off'
  volume: 0.7,
  quality: 'high',
  uiScale: 1,           // taille de l'interface (menus et affichage du match)
  // écran tactile : 'auto' (téléphone et tablette), 'on' ou 'off'; taille des contrôles; gaucher (joystick à droite)
  touchMode: 'auto', touchScale: 1, touchLefty: false, touchAssist: 1, touchVibe: true, touchSens: 1, touchPos: null, touchFixed: false, touchAutoSprint: false,
  keys: { ...DEFAULT_KEYS },
};
