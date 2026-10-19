# Suivi — Space Trash V1

## État
Toutes les fonctions du cahier des charges V1 (version 1.1) sont implémentées et jouables de bout en bout, de la première expédition à l’écran « Relais orbital construit ». Les chiffres sont des **valeurs initiales à tester**, pas un équilibrage validé.

## Correspondance avec les critères de réussite (§12)
| # | Critère | Où / comment vérifié |
|---|---|---|
| 1 | Explorer librement les trois secteurs sans limite de temps | `level.ts` (3 secteurs 2400 × 4000), `sim.ts` (aucun chrono) ; test « aucun chronomètre », flow navigateur (ceinture, nébuleuse, cimetière) |
| 2 | Récupérer les six matières | fragments, gisements, épaves (laser), objets lourds (tracteur) ; tests de simulation par matière |
| 3 | Déposer et sécuriser la cargaison | anneau de la station, transaction idempotente, entrepôt plein = surplus gardé à bord |
| 4 | Construire et améliorer les installations | 5 emplacements × 3 niveaux, coûts en matières + crédits ; tests `economy`, flow |
| 5 | Transformer grâce à la raffinerie | 3 recettes, consommation réelle, temps réel ; tests et flow |
| 6 | Contrats et crédits | 12 modèles + 4 majeurs + vente directe ; tests `contracts`, flow |
| 7 | Améliorer et équiper le vaisseau | 4 branches (niv. 0-6, plafond par l’atelier), laser/tracteur, un seul outil équipé |
| 8 | Fabriquer et utiliser le drone | hangar, 3 caractéristiques, mission plafonnée, pas de production hors application |
| 9 | Compléter le relais orbital | 4 contrats majeurs → chantier (structure, énergie, systèmes, financement) → écran de réussite |
| 10 | Sauvegarder/reprendre sans perte ni duplication | `save-model` + `storage`, transactions idempotentes ; tests de rechargement, de corruption, flow |

## Choix de conception là où le cahier laisse de la liberté
- **Niveaux** : un bâtiment a 3 niveaux (le niveau 1 = construction ; l’atelier démarre au niveau 1). L’atelier plafonne les branches du vaisseau à 2 / 4 / 6 ; le hangar plafonne les améliorations du drone à 1 / 2 / 3.
- **Stockage** : capacité **par matière** (60 au départ ; entrepôt 200 / 500 / 1 200). Si une matière est pleine, le surplus reste à bord ; quitter la station avec du surplus demande une confirmation explicite (perte signalée). Les productions de la raffinerie attendent de la place.
- **Dangers** : radiation = 1 point de coque par intervalle (1,5 s, rallongé de 0,2 s par niveau de coque, jamais dans l’anneau) ; courant électrique = cycle de 4 s (calme, avertissement clignotant 0,8 s, décharge 0,8 s) ; roches et astéroïdes mobiles = 1 point + 1,2 s d’invulnérabilité.
- **Scanner** : passif, rayon lié au niveau d’atelier (220 / 300 / 380) ; la mini-carte n’affiche que ce qui est découvert.
- **Contrats** : l’abandon rend les matières déjà livrées (dans la limite de l’entrepôt, la perte éventuelle est annoncée). Les contrats majeurs ne s’abandonnent pas. Offres du tableau déterministes (graine = profil + compteur).
- **Découvertes et uniques** : les repères (positions des gisements, épaves, zones) sont fixes par secteur ; le contenu ordinaire change à chaque expédition ; 2 objets uniques par secteur (une seule fois).
- **Production hors application** : exclue (drone, comme demandé) et retenue aussi pour la raffinerie par cohérence. La progression est sauvegardée ; en cas de fermeture, les minuteries reprennent là où elles étaient.
- **Phaser 3.90.0** (Phaser 4 est publié mais l’API 3 est éprouvée), **Vitest 5.0.5** (les versions antérieures ont des avis `npm audit`).

## Vérifications réellement exécutées
- `npm run build` : OK (types stricts).
- `npm test` : **99 tests OK** — soute typée et plafonds, dépôt unique, entrepôt plein, objets lourds, laser, scanner et découvertes, radiation / électricité / astéroïdes, rapatriements et pertes, génération des 3 secteurs (atteignabilité sur 20 graines, budgets, repères fixes, uniques), transactions atomiques et idempotentes, bâtiments, raffinerie, contrats (ordinaires, majeurs, abandon), drone, projet final, sauvegarde (validation, rechargement, corruption, stockage indisponible), **parcours complet de la V1 en logique pure**, coût de simulation (≈ 0,005–0,007 ms/image).
- Navigateur Chromium (Playwright, émulation tactile, **pas un téléphone réel**) : `scripts/flow.mjs` **50/50** (parcours complet : expédition, collecte, minage, dépôt, bilan, rechargement, entrepôt, bureau, vente, contrats ordinaire et majeurs, améliorations, radiation, rapatriement, raffinerie, laser, tracteur, hangar, drone, projet, réussite, rechargement final, aucune erreur console) ; `scripts/smoke.mjs` **29/29** (390 × 844, 360 × 800 et ordinateur : aucun défilement de page, boutons ≥ 44 px, joystick tactile, freinage, pause, arrière-plan, audio débloqué, fermeture en expédition, clavier ZQSD/WASD, diagonale normalisée, Échap).
- Build de production lancé dans le navigateur : fonctionne, sans panneau ni hook développeur.
- Captures relues visuellement (station niveau 0 et 3, panneaux, exploration, radiation, laser, minage, relais).

## Non vérifié
- Téléphone réel (iOS/Android), 60 images/s sur appareil, tactile multi-doigts réel.
- Écoute humaine de la musique et des sons (synthèse provisoire) ; mixage et goût.
- Équilibrage en conditions de jeu réelles (durée d’une partie, difficulté des zones, prix) ; la progression est cohérente (testée) mais pas ajustée au plaisir.
- Restauration d’une sauvegarde corrompue testée en unitaire seulement.
- Déploiement GitHub Pages effectif (workflow fourni ; le réglage *Pages → GitHub Actions* se fait sur GitHub).

## Pistes pour la suite
Passes d’équilibrage sur appareil réel (rythme des expéditions, coût des paliers, difficulté des zones), vraie bande-son et assets graphiques, accessibilité (contrastes, réduction des flashs), évaluation de la migration Phaser 4, emballage natif.
