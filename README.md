# Les Éboueurs de l’espace — Lot 1 (prototype jouable)

Jeu solo de récupération et de minage spatial, en portrait sur mobile, jouable aussi au clavier sur ordinateur.
Ce dépôt contient le **lot 1** : la **région 1 (Ceinture rocheuse)**, de la première sortie jusqu’à l’écran « Région 2 débloquée — fin du prototype ».

Documents de référence : [`docs/Eboueurs_Espace_Cahier_des_charges_V1.md`](docs/Eboueurs_Espace_Cahier_des_charges_V1.md) (cible globale), [`docs/Eboueurs_Espace_Prompt_Claude_Lot_1.md`](docs/Eboueurs_Espace_Prompt_Claude_Lot_1.md) (périmètre du lot), [`docs/SUIVI_LOT1.md`](docs/SUIVI_LOT1.md) (suivi et prochain lot).

## Lancer

Prérequis : Node.js 22+.

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173, accessible sur le réseau local)
npm test           # tests de la logique (Vitest)
npm run build      # vérification de types + build de production dans dist/
npm run preview    # sert le build de production
```

Versions figées par `package-lock.json` : Phaser 3.90.0, Vite 7.3.7, TypeScript 5.9.3, Vitest 5.0.5.

## Jouer

1. **Jouer** : la première sortie démarre directement, avec de courts conseils intégrés.
2. Pilote, les fragments sont attirés et ramassés automatiquement ; reste près d’un **gisement** (roche ronde à cristaux cyan) pour l’extraire. Les **obstacles stériles** (roches à pointes, contour corail) blessent : −1 coque, 1,2 s d’invulnérabilité.
3. Reviens dans l’**anneau de la station** (flèche et radar t’indiquent où) et reste presque immobile **2 s** pour déposer ; **3 s** de plus répare la coque (délai réduit par la branche coque). Le bouton **Terminer la sortie** apparaît dans l’anneau.
4. Sortie de **4 min** : alertes à 60, 30 et 10 s, puis une tempête descend du haut pendant les 40 dernières secondes. À zéro, dans l’anneau : dépôt et réussite ; dehors : récupération d’urgence, cargaison non déposée perdue. Les dépôts et améliorations ne sont jamais perdus.
5. À l’**atelier**, dépense la pierre (40 / 80 / 120 t par branche, niveaux 0→3 : soute, aimant/extracteur, moteur, coque).
6. Quand les **4 branches sont au niveau 3** (« Atelier 12/12 »), la **livraison** s’ouvre : livre **1 000 t** de pierre (partiellement si besoin), puis **Ouvrir la région 2**. Total nécessaire : 960 t d’améliorations + 1 000 t livrées.

### Commandes
| | |
|---|---|
| Mobile | joystick flottant dans la zone basse (côté réglable gauche/droite dans les réglages) |
| Clavier | flèches, ZQSD ou WASD ; diagonales normalisées |
| Pause | bouton ❚❚ ou Échap / P ; automatique si l’application passe en arrière-plan |

### Panneau développeur (mode `npm run dev` uniquement)
Bouton **DEV** en bas à gauche : +100 / +1000 t de pierre, « Max atelier », temps ×1/×4/×10, inspection de la sauvegarde, remise à zéro **avec confirmation**. Absent du build de production. Aucun crédit automatique, aucun reset systématique.

## Déploiement (GitHub Pages)
Le workflow `.github/workflows/pages.yml` teste, construit et publie `dist/` à chaque push sur `main` (ou à la main via *Actions → Run workflow*). Le build utilise des chemins relatifs (`base: './'`) : il fonctionne sous `https://<compte>.github.io/<dépôt>/`.
**À faire une fois** : *Settings → Pages → Build and deployment → Source : GitHub Actions*.

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/config/` | régions (4 définies, 1 jouable) et formules d’équilibrage |
| `src/logic/` | **logique pure, testée sans Phaser** : soute (`cargo`), transactions et conditions de transition (`economy`), modèle et validation de sauvegarde (`save-model`), carte (`level`), simulation de sortie (`sim`) |
| `src/storage/` | sauvegarde locale : copie principale + dernière copie valide, récupération explicite |
| `src/input/` | joystick flottant et clavier |
| `src/scenes/` | rendu Phaser : textures procédurales, fond, scène de sortie, particules |
| `src/ui/` | HUD et écrans en DOM (accueil, atelier, bilan, pause, réglages, fin, récupération) |
| `src/audio/` | synthèse Web Audio (musique + sons) |
| `tests/` | tests Vitest |
| `scripts/` | tests navigateur optionnels (Playwright, voir plus bas) |

### Remplacer les assets
Les images sont dessinées par code (Canvas 2D / chemins SVG) dans `src/scenes/textures.ts`, une fonction par asset. `ensure()` ne dessine une texture que si sa clé n’existe pas : pour la remplacer par une image, la charger sous la même clé avant `generateTextures` (`ship`, `station`, `frag0-2`, `dep0-2`, `obs0-2`, `stars1-2`, `glow`, `spark`). Les textures sont dessinées à 2× et affichées à l’échelle 0,5.

## Sauvegarde
`localStorage`, clés `eboueurs.save.v1` (principale) et `eboueurs.save.v1.backup` (dernière copie valide). Chaque dépôt, achat et livraison est une transaction **idempotente** (identifiant unique) sauvegardée immédiatement. Une sauvegarde illisible n’est jamais écrasée : un écran propose de restaurer la dernière copie valide ou de repartir à neuf, et le contenu illisible est conservé (`…v1.corrupt`). Si le stockage est indisponible, l’interface le signale (session non persistante).
Fermeture complète pendant une sortie : les dépôts déjà faits sont conservés, la cargaison non déposée est perdue, rien n’est rejoué.

## Vérifications effectuées (voir `docs/SUIVI_LOT1.md` pour le détail)
- `npm run build` (types + production) et `npm test` : 55 tests de logique.
- Tests navigateur Chromium (émulation, **pas un téléphone réel**) : `node scripts/smoke.mjs` et `node scripts/flow.mjs` (Playwright requis, `npm run dev` lancé). Ils couvrent 390×844, 360×800 et ordinateur, joystick tactile émulé, clavier, pause, arrière-plan, minage, dépôt, achats, livraison, région 2, rechargement.

## Limites connues
- **Performance non mesurée sur appareil réel** : la simulation seule coûte ≈ 0,006 ms par image (mesuré dans Node sur une sortie complète) ; le rendu a seulement été exécuté en logiciel (SwiftShader), sans valeur de référence pour 60 i/s sur téléphone.
- **Son** : musique et effets sont une synthèse **temporaire** originale (aucun fichier tiers), pas une bande-son finale. Le rendu audio n’a pas été écouté par un humain ici : seuls le déblocage, la reprise et l’absence d’erreur ont été vérifiés.
- Visuels procéduraux provisoires, lisibles mais à remplacer par de vrais assets (lot 3).
- Pas d’achat, de publicité, de modules, de seconde chance, d’Éclats/Médailles/Prismes : lots suivants.
- Équilibrage (quota, durée, tempête : 1 point de coque par 1,5 s dedans) = valeurs initiales à tester.
