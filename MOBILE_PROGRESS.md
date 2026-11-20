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
