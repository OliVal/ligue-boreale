# Ligue Boréale — Hockey 3D

Jeu de hockey 3D jouable dans le navigateur (HTML + JavaScript, Three.js).

## ▶ Jouer : https://olival.github.io/ligue-boreale/

Rien à installer. Pour jouer contre un ami, envoie-lui ce lien : **En ligne contre un ami → Créer une partie**, puis donne-lui le code.

## Lancer le jeu

Double-clique sur `lancer.bat`, ou dans un terminal :

```bash
python serveur.py --ouvrir
```

Le jeu s'ouvre à http://localhost:8317. (Ouvrir `index.html` directement ne fonctionne pas : les modules
JavaScript exigent un serveur local. Three.js est chargé depuis un CDN, donc une connexion Internet est requise.)

## Contrôles (reconfigurables dans Options)

| Touche | Action |
|---|---|
| W A S D | Patiner |
| Maj gauche | Sprint (consomme l'endurance) |
| Espace | Lancer frappé (maintenir pour charger) · mise au jeu |
| J | Lancer du poignet · tir sur réception si une passe arrive |
| K | Passe (vers la direction tenue) · sans la rondelle : demander la passe |
| L | Passe soulevée |
| F | Mise en échec |
| R | Feinte / dangle |
| Q | Changer de joueur |
| E | Dégager la rondelle |
| Tab | Changer de trio |
| C | Changer de caméra |
| Échap | Pause |

Viser : tiens W ou S au moment du lancer pour choisir le côté du filet.
Bagarre : J pour frapper, K pour bloquer quand l'adversaire arme son coup.

## Sur cellulaire et tablette

Le jeu se joue au doigt : les contrôles tactiles apparaissent tout seuls sur un téléphone ou une tablette (Options → Écran tactile pour les forcer, les cacher, les agrandir ou les passer à gauche).
Tiens le téléphone à l'horizontale.

- **Joystick** : pose le pouce gauche n'importe où sur la moitié gauche de l'écran et glisse.
- **Boutons à droite**, selon la situation : Lancer (maintenir puis relâcher), Poignet, Passe, Feinte, Soulevée et Sprint avec la rondelle;
  Mise en échec, Changer, Réclame, Tir sur réception, Esquive sans la rondelle; Mise au jeu; Frapper / Bloquer en bagarre;
  Papillon, Plongeon, Geler, Passe, Poussée pour le gardien en Carrière; Passer pendant les reprises.
- **En haut à droite** : pause, caméra, capacité spéciale ★, Trio (changements manuels).
- **Carrière** : sur le banc, le bouton ⏩ simule jusqu'à ta prochaine présence.
- Au doigt seulement, une aide à la visée et aux passes est active (désactivable dans les options).
- La qualité graphique « Mobile » est choisie au premier lancement; la définition baisse toute seule si le téléphone peine.
- **Installer** : dans le navigateur du téléphone, « Ajouter à l'écran d'accueil » : le jeu s'ouvre alors en plein écran, comme une application.

On peut jouer en ligne entre un ordinateur et un téléphone.

## Présentation télé

- Reprises automatiques au ralenti après les buts (deux angles) et, aux arrêts de jeu, après les grosses mises en échec
  et les arrêts sur tirs puissants. Espace pour passer. Réglage dans Options : buts et gros jeux, buts seulement, aucune.
- La glace se marque au fil de la période et les resurfaceuses la refont à l'entracte.
- La foule appuie l'équipe locale : elle se lève sur ses buts et reste froide sur ceux des visiteurs.
- Les Trois étoiles sont présentées sur la glace avant le résumé du match.

## Éditeur d'équipe

Menu principal → Éditeur d'équipe (ou « Modifier mon équipe » à l'écran de choix des équipes).

- **Identité** : ville, nom, abréviation, association, trois couleurs et style de chandail (classique, à bandes, manches
  contrastées). L'aperçu montre les chandails domicile et visiteur, et l'équipe joue derrière le menu.
- **Alignement** : clique sur deux joueurs pour les échanger entre trios et paires; « Alignement optimal » reclasse tout
  selon les cotes. Le premier gardien est le partant.
- **Joueurs** : nom, numéro, âge, position, style, main et attributs (la cote se recalcule en direct).
- **Créer une équipe** : jusqu'à 8 équipes créées, jouables dans tous les modes. « Générer 20 nouveaux joueurs » refait
  un alignement de la force choisie.
- Tout est enregistré automatiquement dans le navigateur. « Exporter » produit un fichier `.json` à conserver ou à
  partager; « Importer » remplace les équipes modifiées et créées par celles du fichier.

## Équipes et personnalisation

- Éditeur d'équipe (menu principal) : identité, trois couleurs, motif du chandail (bandes, épaules, empiècements, style des numéros),
  logo généré (forme, motif, lettres), couleur de la glace et des bandes, alignement et joueurs.
- Trois chandails par équipe : domicile, visiteur et rétro. Le rétro se choisit à l'écran de sélection des équipes.
- Aperçu 3D du joueur qui tourne dans l'onglet Identité.
- Chimie de trio et de paire (onglet Alignement) : elle ajoute de -4 à +4 aux passes, au sens du jeu, à la précision et au maniement.

## En ligne contre un ami

1. Envoie à ton ami le lien https://olival.github.io/ligue-boreale/ (ou le fichier **`LigueBoreale.html`**, qui s'ouvre d'un double-clic, même sans Internet pour le menu).
2. L'un de vous choisit **En ligne contre un ami → Créer une partie** et donne le code de 5 lettres à l'autre.
3. L'autre choisit **Rejoindre une partie** et entre le code.
4. Chacun choisit son équipe dans le salon, puis l'hôte lance la partie.

- L'hôte fait tourner le match : il doit garder la fenêtre du jeu visible (un onglet caché ralentit tout).
- Les règles et la durée des périodes sont celles des options de l'hôte. Pas de bagarres ni de reprises en ligne.
- La pause n'arrête pas le match. « Quitter le match » ramène les deux joueurs au salon.
- Une connexion Internet est nécessaire. Le jeu essaie d'abord une connexion directe (PeerJS sert seulement à se trouver avec le code). Si un réseau la bloque (réseau d'école, LTE), il passe après 7 s par un relais public (shiftr.io sur le port 443, sinon test.mosquitto.org) : ça marche presque partout, avec un peu plus de délai pour l'invité. Le salon indique « connexion directe » ou « via le relais ».
- Après une modification du code, regénérer le fichier : `python outils/bundle.py`, puis publier : `git commit` et `git push` (le site se met à jour en une minute).

## Carrière

Menu principal → **Carrière**. Trois emplacements de sauvegarde, enregistrés automatiquement après chaque match et chaque décision.

- **Création** : nom, numéro, position (centre, ailier, défenseur, gardien), style, main, apparence (teint, taille, gabarit, ruban), équipe junior.
- **Parcours** : ligue junior (14 matchs) → repêchage → club-école de la ligue mineure → grande ligue. Un rappel peut survenir en cours de saison.
- **En match** : tu ne contrôles que ton joueur. Sur le banc, le match avance en accéléré; `X` simule jusqu'à ta prochaine présence. Le panneau en haut à gauche montre ta note, l'objectif de l'entraîneur pour la période et ta capacité spéciale (touche `G` par défaut).
- **Progression** : chaque match donne de l'XP (deux fois plus s'il est joué plutôt que simulé). Chaque niveau donne un point pour l'arbre de compétences (trois branches, trois capacités : Tir précis, Vision du jeu, Bouclier humain).
- **Gardien** : caméra basse derrière le filet. Le gardien suit l'angle de lui-même; les flèches le décalent (sortir au-devant, tricher d'un côté), `Maj` + direction l'envoie jouer la rondelle. `Espace` (maintenir) : papillon · `F` : plongeon · `J` : geler la rondelle · `K` : passe · `E` : dégager. Arbre de compétences propre (Réflexes, Positionnement, Mobilité) et trois capacités : Le mur, Mitaine de colle, Concentration (le jeu ralentit). Statistiques de gardien : arrêts, % d'arrêts, moyenne, blanchissages.
- **Temps de glace** : la confiance de l'entraîneur monte ou descend selon ta note et te fait changer de trio.
- **Contrats** : contrat d'entrée de 3 ans après le repêchage, puis trois offres à comparer à chaque échéance.

## Franchise

Menu principal → **Franchise**. Trois emplacements de sauvegarde automatique. Tu diriges une des 16 équipes sur autant de saisons que tu veux.

- **Saison** : 30 matchs (aller-retour), à jouer ou à simuler. Classement par association.
- **Séries** : les 4 premières équipes de chaque association, séries 3 de 5, jusqu'à la Coupe Boréale.
- **Effectif** : alignement modifiable (⇄ puis « Ici »), fiche de chaque joueur avec ses statistiques de carrière, blessures, moral.
- **Plafond salarial** : la masse salariale ne peut pas dépasser le plafond pour signer, échanger ou commencer une saison.
- **Échanges** : chaque DG adverse évalue l'offre selon sa place au classement, l'âge, le potentiel, le contrat et ses besoins.
- **Agents libres** : signatures en saison comme à l'intersaison.
- **Dépistage et repêchage** : trois dépisteurs suivent des régions; les fourchettes des espoirs se resserrent avec le temps. Deux rondes.
- **Intersaison** : trophées, retraites, Temple de la renommée, progression des jeunes, déclin des vétérans, contrats échus à prolonger.
- **Meneurs et histoire** : meneurs de la ligue, champions et trophées de chaque saison, Temple de la renommée.

## Succès et vestiaire

Menu principal → **Succès et vestiaire**. Seize succès répartis dans tous les modes. Chacun débloque un objet : bâton, gants, célébration de but, patinoire ou chandail spécial. Les objets choisis s'appliquent à ton équipe dans tous les modes.

## Architecture

```
js/core/      config.js (constantes, réglages), util.js (maths, aléatoire)
js/data/      teams.js (16 équipes, alignements générés, équipes modifiées et créées), kit.js (uniformes)
js/sim/       simulation pure, sans affichage (testable avec Node)
              rink.js (bandes), puck.js (rondelle), goalie.js, ai.js, entities.js, match.js (règles et déroulement)
js/render/    renderer.js (scène, caméras), rinkgfx.js (aréna, foule, traces), playergfx.js (joueurs), replay.js (reprises)
js/engine/    input.js (clavier, boutons tactiles et joystick)
js/game/      human.js (contrôle du joueur)
js/audio/     audio.js (sons générés)
js/ui/        hud.js (affichage en match), commentary.js (commentaires), ui.js (menus), editor.js (éditeur d'équipe), careerui.js (écrans de Carrière), franchiseui.js (écrans de Franchise), lockerui.js (succès et vestiaire), onlineui.js (jeu en ligne), touch.js (contrôles tactiles)
js/career/    career.js (logique de carrière, sans affichage), leagues.js (ligues junior et mineure), tracker.js (note et objectifs en match)
js/franchise/ franchise.js (logique de franchise, sans affichage)
js/net/       sync.js (synchronisation hôte → invité, sans affichage), peer.js (connexion PeerJS)
js/save/      storage.js (localStorage : réglages, équipes, carrières, franchises), profile.js (succès et objets débloqués)
test/         sim.mjs (matchs IA contre IA sans affichage), career.mjs (carrières simulées et match à joueur verrouillé), goalie.mjs (match complet avec un gardien contrôlé), franchise.mjs (six saisons de franchise simulées), online.mjs (hôte et invité reliés avec délai), touch.mjs (boutons tactiles et joystick)
outils/       bundle.py (assemble LigueBoreale.html, le jeu en un seul fichier; --mobile DOSSIER pour la version application web), icone.py (icônes)
manifest.webmanifest, sw.js, icones/   application web (installation sur l'écran d'accueil, cache hors ligne)
```

## Tests

```bash
node test/sim.mjs 10
```

Arguments : nombre de matchs, mode (`game` ou `shootout`), nombre de patineurs (5, 4 ou 3).

```bash
node test/career.mjs
node test/goalie.mjs
```

```bash
node test/franchise.mjs
```

```bash
node test/online.mjs
node test/touch.mjs
```

## Licence

© 2026 Olivier Valenciano. Tous droits réservés. Tu peux jouer au jeu et consulter le code, mais pas le copier, le modifier ni le republier sans autorisation. Voir [LICENSE](LICENSE).
