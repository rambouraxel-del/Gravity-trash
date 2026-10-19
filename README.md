# Space Trash — V1 (Azerya Studio)

Jeu solo 2D en vue du dessus, pour mobile (et clavier sur ordinateur) : **explore** librement l’espace, **récupère** des ressources, **développe ta station** industrielle et **automatise** la récolte, jusqu’à construire ton premier **relais commercial orbital**.

Cahier des charges : [`docs/Space_Trash_Cahier_des_charges_V1.md`](docs/Space_Trash_Cahier_des_charges_V1.md) · Suivi, choix et vérifications : [`docs/SUIVI_V1.md`](docs/SUIVI_V1.md).
(L’ancien prototype « Les Éboueurs de l’espace » est archivé dans `docs/archive/`.)

## Lancer

Prérequis : Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:5173 (accessible sur le réseau local)
npm test           # 96 tests de la logique (Vitest)
npm run build      # vérification de types + build de production dans dist/
npm run preview    # sert le build de production
```
Versions figées par `package-lock.json` : Phaser 3.90.0, Vite 7.3.7, TypeScript 5.9.3, Vitest 5.0.5.

## Le jeu

**Boucle** : station → carte des secteurs → expédition libre (aucun chrono, aucun carburant) → dépôt à la station → construction, raffinage, contrats, drone → repartir.

- **Exploration** : pilotage à un doigt (joystick flottant, côté réglable) ou flèches / ZQSD / WASD. Collecte et minage automatiques. Une **mini-carte** (touche-la pour l’agrandir) et une **balise** indiquent la station ; le **scanner** révèle peu à peu gisements, épaves, objets lourds et zones dangereuses ; les découvertes sont enregistrées.
- **Dangers** selon l’emplacement : roches stériles, **champs d’astéroïdes instables** (roches mobiles), **poches de radiation** (la coque s’use), **courants électriques** (avertissement clignotant puis décharge), **épaves qui fuient**. Les ressources précieuses se trouvent plus loin ou dans les zones dangereuses. Les stations et l’anneau de dépôt sont sûrs.
- **Destruction** : tu es rapatrié, la cargaison non déposée est perdue ; stocks sécurisés, constructions, améliorations et découvertes sont conservés. **Rapatriement d’urgence** manuel depuis la pause.
- **Trois secteurs** : Ceinture rocheuse (roche, ferraille), Nébuleuse cristalline (glace, cristaux), Cimetière orbital (circuits, noyaux, ferraille, épaves). Débloqués par des contrats majeurs, toujours rejouables. Repères fixes, contenu ordinaire renouvelé à chaque expédition, **objets uniques** obtenables une seule fois.
- **Station** (vue 2D fixe, emplacements prédéfinis) : Atelier (départ), puis Entrepôt, Raffinerie, Bureau commercial, Hangar à drones — 3 niveaux chacun, la station change visuellement.
- **Industrie** : lingots (ferraille), cellules (glace + cristaux), pièces technologiques (lingots + circuits) — temps de traitement réel, matières réellement consommées, en temps réel application ouverte.
- **Vaisseau** : 4 branches (soute, aimant, moteur, coque) jusqu’au niveau 6, plafonnées par le niveau de l’atelier ; 2 équipements, **un seul à la fois** : laser de découpe (démantèle les épaves) et tracteur gravitationnel (ramène les objets lourds dans l’anneau).
- **Contrats** : 12 modèles ordinaires (classiques / industriels, sans limite de temps, abandon sans pénalité) + 4 contrats majeurs scénarisés qui ouvrent les secteurs, le hangar et le chantier du relais ; **vente directe à prix fixe** pour ne jamais être bloqué.
- **Drone** : un seul, 3 caractéristiques améliorables (capacité, vitesse, efficacité), mission dans un secteur déjà exploré, plafonnée par sa capacité ; aucune production hors application.
- **Projet final** : relais orbital (structure, énergie, systèmes, financement) → écran de réussite, puis on peut continuer.
- Pas de publicité, d’achat intégré ni de connexion requise.

### Commandes
| | |
|---|---|
| Mobile | joystick flottant dans la zone basse |
| Clavier | flèches, ZQSD ou WASD (diagonales normalisées) · Échap / P : pause |
| Pause | bouton ❚❚ ; automatique si l’application passe en arrière-plan |

### Panneau développeur (mode `npm run dev` uniquement)
Bouton **DEV** : ajouter des matières (plafonnées à l’entrepôt) ou des crédits, bâtiments niveau 3, vaisseau au maximum, tout débloquer, temps ×4/×20, avancer de 60 s, inspecter la sauvegarde, remise à zéro **avec confirmation**. Absent du build de production.

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/config/` | données de jeu : objets et recettes, secteurs, bâtiments, contrats et projet, formules d’équilibrage |
| `src/logic/` | **logique pure, testée sans Phaser** : transactions (`tx`), inventaire/vente, vaisseau, bâtiments, raffinerie, contrats, drone, projet, minuteries, génération de secteur (`level`), simulation d’expédition (`sim`), modèle et validation de sauvegarde |
| `src/storage/` | sauvegarde locale : copie principale + dernière copie valide, récupération explicite |
| `src/scenes/` | rendu Phaser : textures procédurales, station, expédition, particules |
| `src/ui/` | HUD et panneaux en DOM |
| `src/audio/` | synthèse Web Audio (musique et sons provisoires) |
| `src/input/` | joystick flottant et clavier |
| `tests/` | tests Vitest (96) |
| `scripts/` | tests navigateur Playwright (optionnels) |

### Remplacer les assets
Les images sont dessinées par code (Canvas 2D) dans `src/scenes/textures.ts`, une fonction par asset. `ensure()` ne dessine une texture que si sa clé n’existe pas : pour la remplacer par une image, charger une texture de même clé avant `generateTextures`. Clés : `ship`, `station`, `frag_<matière>_0-2`, `dep_<matière>_0-1`, `obs0-2`, `wreck0-2`, `container`, `drone`, `mod_<bâtiment>_1-3`, `slot_empty`, `relay_scaffold`, `relay_built`, `stars1-2`, `glow`, `spark`. Textures dessinées à 2× et affichées à l’échelle 0,5.

## Sauvegarde
`localStorage`, clés `spacetrash.save.v1` (principale) et `.backup` (dernière copie valide). Chaque dépôt, achat, construction, vente, livraison, production et contrat est une transaction **idempotente** (identifiant unique) sauvegardée immédiatement ; les nombres sont des entiers validés à la lecture. Une sauvegarde illisible n’est jamais écrasée : un écran propose de restaurer la dernière copie valide ou de repartir à neuf (le contenu illisible est conservé à part). Stockage indisponible : l’interface le signale. Fermer le jeu en pleine expédition : dépôts conservés, cargaison non déposée perdue, rien n’est rejoué.

## Déploiement (GitHub Pages)
`.github/workflows/pages.yml` teste, construit et publie `dist/` à chaque push sur `main` (ou à la main via *Actions → Run workflow*). Chemins relatifs (`base: './'`) : fonctionne sous `https://<compte>.github.io/<dépôt>/`. À faire une fois : *Settings → Pages → Source : GitHub Actions*.

## Tests
```bash
npm test                                   # 96 tests de logique
npm run dev &                              # puis, avec Playwright installé :
node scripts/flow.mjs  http://127.0.0.1:5173/ shots   # parcours complet (50 vérifications)
node scripts/smoke.mjs http://127.0.0.1:5173/ shots   # écrans, commandes, pause, son (29 vérifications)
```
Les scripts émulent des écrans et le tactile dans Chromium : **ce n’est pas un test sur téléphone réel**.

## Limites connues
- **Non mesuré sur appareil réel** : fluidité (60 images/s), tactile multi-doigts, rendu sur iOS/Android. La simulation seule coûte ≈ 0,005–0,007 ms par image (mesuré dans Node sur 10 min d’exploration par secteur) ; le rendu n’a été exécuté qu’en logiciel (SwiftShader).
- **Son provisoire** : musique et effets synthétisés (originaux, aucun fichier tiers), non écoutés par un humain ici. Vérifiés : déblocage au premier geste, reprise, absence d’erreur, pas de musiques superposées.
- Visuels procéduraux lisibles mais provisoires.
- Équilibrage (coûts, rendements, dangers) = **valeurs initiales à tester** ; la cohérence de la progression est vérifiée par un test de bout en bout en logique pure, pas par du jeu réel.
- Raffinerie et drone ne progressent qu’application ouverte (choix du cahier pour le drone, retenu aussi pour la raffinerie).
