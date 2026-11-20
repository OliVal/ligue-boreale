# Version tactile (cellulaire et iPad) — journal de travail

Branche : `mobile` (worktree `../hockey-mobile`). Échéance : vendredi 2026-11-20, 06 h 00.

## Fait
- `Input` (js/engine/input.js) : actions virtuelles (`vpress`, `vrelease`, `vtap`) et joystick analogique (`setStick`, `stick()`).
  Le clavier se comporte exactement comme avant (le joystick vaut 0 quand on ne s'en sert pas).
- `human.js` lit la direction avec `stick()` (analogique au doigt, identique au clavier sinon).
- En ligne : l'invité envoie aussi la direction analogique (`a`) ; l'hôte la rejoue (`RemoteInput.stick()`).
- `keyName` affiche le nom du bouton tactile au lieu de la touche quand le mode tactile est actif (`TOUCH`).

## En cours / à faire
- Module `js/ui/touch.js` : joystick + boutons contextuels + barre (pause, caméra, simuler).
- CSS mobile (menus, HUD), message « tourne ton téléphone ».
- Qualité graphique automatique sur mobile.
- PWA (manifeste, icône, service worker), bundle, dossier `mobile/` sur `main`.

## Décisions
- Les boutons tactiles appuient sur les mêmes actions que le clavier (pas de logique de jeu dupliquée).
