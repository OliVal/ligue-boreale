# Version tactile (cellulaire et iPad) — journal de travail

Branche : `mobile` (worktree `../hockey-mobile`). Échéance : vendredi 2026-11-20, 06 h 00.
Consigne : si la liste est finie avant 06 h, continuer les améliorations (jouabilité au doigt, petit écran, performance, finition, bogues).

## Fait
- **Entrées** (`js/engine/input.js`) : actions virtuelles (`vpress`, `vrelease`, `vtap`) et joystick analogique (`setStick`, `stick()`).
  Le clavier se comporte exactement comme avant (joystick à 0 quand on ne s'en sert pas). `human.js` lit la direction avec `stick()`.
- **Contrôles tactiles** (`js/ui/touch.js`) : joystick flottant (apparaît sous le pouce, moitié gauche), 6 boutons à droite qui
  changent selon la situation (rondelle, sans rondelle, mise au jeu, bagarre, gardien, gardien avec rondelle, reprise/étoiles),
  barre du haut (pause, caméra, capacité ★, trio si changements manuels), bouton ⏩ « simuler jusqu'à ta présence » sur le banc.
  Multi-touch par `pointerId`; une action est relâchée même si les boutons changent pendant l'appui. Vibration légère.
  Détection automatique (téléphone/tablette), bascule au premier toucher et retour au clavier dès qu'une touche du jeu sert en match.
  Les indications du HUD nomment les boutons à l'écran au lieu des touches (`TOUCH.names`).
- **Options** : qualité « Mobile (économie) »; section Écran tactile (auto / toujours / jamais, taille des boutons, gaucher,
  aide à la visée, vibration). En mode tactile, la colonne des touches est remplacée par l'aide des contrôles tactiles.
- **Écran** : HUD réduit et déplacé sur petit écran, menus compacts (grille 2 colonnes, défilement), panneaux larges sur plusieurs lignes,
  message « tourne ton téléphone » à la verticale, zones sûres (encoche), pas de zoom ni de défilement de page en match, plein écran au lancement d'un match (Android).
- **Performance** : premier lancement sur mobile → qualité « mobile » (pas d'anticrénelage, définition ≤ 1,5, moitié des gradins, spectateurs immobiles,
  pas de traces sur la glace). Si le match tourne sous 45 images/s pendant 3 s, la définition baisse par paliers (jusqu'à 0,75).
- **Application web** : `manifest.webmanifest`, icônes (`outils/icone.py` → `icones/`), `sw.js` (cache : réseau d'abord pour le jeu,
  cache d'abord pour Three.js/PeerJS/MQTT.js versionnés; jamais les serveurs de connexion). `python outils/bundle.py --mobile mobile`
  produit le dossier à publier.
- **En ligne** : salon utilisable au doigt (Entrée du clavier virtuel, boutons Coller et Partager, code en majuscules).
  L'invité tactile envoie aussi la direction analogique (`a`, champ facultatif : la version publique l'ignore et utilise les directions habituelles).

## Vérifié
- Tests : `node test/sim.mjs`, `career.mjs`, `goalie.mjs`, `franchise.mjs`, `online.mjs` passent après chaque étape.
- Navigateur intégré à 844×390 (format téléphone), événements tactiles synthétiques :
  joystick (direction et relâchement), sprint à deux doigts, lancer frappé maintenu (élan 0,5 s puis tir), passe, poignet, feinte,
  pause / reprendre, caméra, gardien (papillon maintenu, déplacement), Carrière patineur (bouton ⏩ sur le banc → simulation).
  Menus : principal, options, éditeur, Carrière (création + tableau de bord), Franchise, En ligne, vestiaire, choix d'équipes : aucun débordement horizontal.
- **En ligne ordinateur ↔ téléphone** (onglet « ordinateur » = version publique https://olival.github.io/ligue-boreale/,
  onglet « téléphone » = cette branche, tactile) :
  téléphone hôte + direct ✔ · téléphone hôte + relais ✔ · téléphone invité + direct ✔ · téléphone invité + relais ✔
  (relais forcé en bloquant PeerJS dans l'onglet invité). Déplacements de l'invité reçus par l'hôte dans les deux sens.

## Ajouts après la première publication
- Aide à la visée (tir vers le côté que le gardien couvre le moins, sans la pénalité de précision du tir automatique) et passes vers
  un coéquipier démarqué (ligne de passe libre) — **seulement au doigt**, désactivable dans les options.
- Écran « Jouer au doigt » au premier match tactile, et bouton « Contrôles au doigt » dans le menu pause.
- Textes du HUD adaptés au doigt (mise au jeu, reprise). Astuce clavier du menu cachée au doigt.
- Pause automatique quand on tourne le téléphone à la verticale en plein match.
- Son débloqué sur iPhone/iPad (touchend / click). Pas de sélection de texte au toucher prolongé (Safari).
- **Bogue corrigé (profite aussi à l'ordinateur)** : la mémoire graphique des joueurs n'était jamais libérée; chaque match et chaque démo du
  menu en ajoutait (~145 objets 3D). Maintenant stable (vérifié : 230 géométries après 4 changements de match).
- Format tablette (768×1024) : cartes d'équipe resserrées, aucun débordement, match jouable à la verticale sur iPad.
- Service worker vérifié sur GitHub Pages (https) : enregistré, page + Three.js + icônes en cache.
- Changement de joueur automatique en défense (au doigt, quand le joystick est lâché, au plus une fois par 1,2 s).
  Mesuré sans affichage : 65 changements en 4 min contre 20 sans l'aide.
- Anneau de puissance doré autour du bouton Lancer pendant l'élan. Vibrations (mises en échec du joueur, buts, poteaux, arrêts du gardien).
- Qualité mobile : au plus 60 images/s sur écran 120 Hz (moins de chaleur et de batterie).
- HUD : les textes ne sont réécrits que s'ils changent (moins de travail à chaque image, aussi sur ordinateur).
- En ligne : l'invité au doigt profite des mêmes aides (champ facultatif `as`, ignoré par la version publique).
- Nouveau test `node test/touch.mjs` (boutons virtuels, joystick, clavier inchangé, tir et passe au doigt avec et sans aide).
- Corrigé : boutons qui restaient cachés après un passage clavier → doigt en plein match; joystick pas toujours remis à sa place.
- Three.js minifié (même version 0.160.0) + préchargement : 136 Ko transférés au lieu d'environ 257 Ko.
- Qualité mobile : 30 images/s dans les menus (la démo derrière le menu n'a pas besoin de plus).
- L'écran reste allumé pendant un match (Wake Lock), libéré dans les menus.
- Boutons et joystick 12 % plus grands sur tablette (plus petite dimension ≥ 700 px).
- Fins de ligne d'origine (CRLF) rétablies : le diff avec `main` ne montre que les vrais changements.
- Relu tout le diff avec `main` : tout ce qui est nouveau ne s'active qu'au doigt ou en qualité « Mobile ».
### Séance 02 h 15 – (améliorations plus importantes)
- **Aide au doigt réglable** : Aucune / Normale / Forte (Forte : passes encore plus orientées vers le joueur démarqué,
  changement de joueur plus réactif). Testé dans `test/touch.mjs` pour les trois niveaux.
- **Tutoriel interactif** (`js/ui/tutorial.js`) : entraînement guidé en 6 étapes qui attend le vrai geste (patiner 1,2 s,
  sprinter en patinant, passe, tir du poignet, lancer frappé chargé — « Presque ! » si relâché trop tôt —, feinte), bouton ou
  joystick à utiliser qui clignote, panneau vert à chaque réussite, fin : Jouer un match / Continuer l'entraînement / Menu.
  Proposé en tête du menu au premier lancement au doigt, et dans l'écran d'aide du premier match. Vérifié pas à pas au doigt synthétique.
- **Sensibilité du joystick** réglable (Douce, Normale, Vive, Très vive) et **éditeur de disposition** (Options → Disposer les contrôles) :
  on fait glisser le groupe de boutons et le joystick; ils restent dans l'écran; « Remettre à leur place ». Vérifié : déplacement,
  blocage au bord, aucune action déclenchée pendant l'édition, position sauvegardée et appliquée en match.
- **Menus à la verticale** sur téléphone : seul le match demande l'horizontale. Mise en page portrait (menu en 2 colonnes, cartes
  empilées, options en une colonne…). En portrait au lancement d'un match : pause avec « Tourne ton téléphone… », et le match
  **reprend tout seul** quand on remet le téléphone à l'horizontale. Au doigt, chaque écran s'ouvre en haut (avant : défilé jusqu'au bouton Retour).
  Vérifié à 390×844 : menu, match rapide, Carrière, Franchise, En ligne, vestiaire, éditeur, options, tirs de barrage.
- **Performance mesurée** (ordinateur, même scène, 300 images) : qualité Haute 228 dessins, 1,29 ms/image; qualité Mobile
  avant 270 dessins → maintenant **151 dessins, 0,83 ms/image** grâce à la fusion des pièces unies de chaque joueur (≈20 → 10 par joueur),
  image identique. Le reste du temps est l'envoi à WebGL; simulation ≈0,05 ms, HUD négligeable.
- **Rendu encore allégé** : ombres des joueurs dessinées en une seule fois en qualité mobile → **126 dessins par image** (270 au départ).
- **Bouton « Installer le jeu »** au menu (au doigt, si pas déjà installé) : invite du système sur Android/Chrome (testée avec un
  faux événement), marche à suivre Partager → Sur l'écran d'accueil sur iPhone/iPad.
- **Manette de jeu** (`js/engine/gamepad.js`) : joystick gauche, A passe, X poignet, Y feinte, B mise en échec/dégager, RT lancer
  frappé maintenu, LT sprint, RB/LB changer/soulevée, Start pause, Select caméra, croix : capacité/trio/simuler. Menus : croix ou
  joystick pour se déplacer, A choisir, B retour, gauche/droite changent une liste. Vibration de la manette. Testé avec une manette
  simulée (menus, déplacement, passe, lancer frappé, pause/reprise, vibration). Sert aussi sur ordinateur.
- **Joystick fixe** (option) et **sprint automatique** quand le joystick est poussé au bord (option). Testés.
- **Lien d'invitation en ligne** : « Copier le lien » / « Partager » envoient `…/mobile/?partie=CODE`; l'ami qui l'ouvre rejoint
  directement (vérifié avec deux onglets : salon atteint en connexion directe, adresse nettoyée). Protocole inchangé.
- Pause au doigt : bouton **Plein écran** si on en est sorti (Android).
- **Premier lancement vérifié sur le site publié** (stockage, cache et service worker effacés, format téléphone 740×360) :
  tactile et qualité Mobile automatiques (sans anticrénelage), « Apprendre à jouer au doigt » en tête du menu, écran d'aide au
  premier match avec « Faire le tutoriel », tutoriel lancé, service worker enregistré.
- **Ordinateur vérifié inchangé** (réglages effacés, taille ordinateur) : pas de mode tactile, qualité Haute, menu d'origine,
  colonne des touches dans les options, clavier qui fait patiner, aucune aide, pas d'écran d'aide.
- Textures : la plus grande fait 2048×873 (glace) : raisonnable pour un téléphone.
- iPad : en paysage comme en portrait, la mise en page « ordinateur » à plusieurs colonnes s'applique déjà (vérifié à 768×1024, aucun débordement).

- Écran « Chargement… » pendant le téléchargement de la 3D (message d'aide après 15 s; retiré dès que le jeu démarre).
- Joystick au repos plus visible sur la glace blanche, avec l'étiquette « Patiner ». 30 images/s en pause (qualité mobile).
- En ligne retesté à 01 h 15 après l'ajout des champs `a`/`as` : téléphone invité → ordinateur hôte (version publique) : OK.
- Robustesse (01 h 11) : 3 matchs complets joués sans affichage par un robot « au doigt » (joystick analogique, boutons au hasard,
  aides actives) : aucune erreur, matchs terminés (60-75 tirs, ~170 passes, une bagarre). Entraînement et éditeur d'équipe
  (3 onglets) vérifiés au format téléphone : aucun débordement.
- Vérifié aussi : disposition gaucher, bagarre au doigt, bouton Passer pendant une reprise, tirs de barrage, écran de fin (étoiles + résumé), Franchise (8 onglets).

## Pas pu tester
- Vrai téléphone / iPad (Safari iOS, Chrome Android), vraie performance 60 images/s, vibration, plein écran, installation sur l'écran d'accueil.
- Service worker en local (localhost) : refusé par le navigateur intégré; fonctionne sur le site publié.

## Publication
- Branche `mobile` poussée sur GitHub. Dossier `mobile/` publié sur `main` (seul ce dossier ajouté) : https://olival.github.io/ligue-boreale/mobile/ (répond, vérifié).

## À faire / idées
- Continuer les améliorations jusqu'à 06 h.

## Décisions
- Les boutons tactiles appuient sur les mêmes actions que le clavier (aucune logique de jeu dupliquée).
- Worktree séparé pour ne pas toucher au dossier `hockey` (un autre serveur y tourne).
