# Suivi — Lot 1 « Boucle jouable »

## État
**Lot 1 terminé** : la région 1 est jouable de bout en bout et améliorable jusqu’à « Région 2 débloquée — fin du prototype » (rejouable ensuite). Le lot 2 n’est **pas** commencé.

## Livré
- Pilotage au joystick flottant (zone basse réservée, gauche/droite) et au clavier (flèches, ZQSD/WASD), diagonales normalisées, rotation automatique, accélération douce, freinage rapide.
- Collecte et minage automatiques (aimant, 0,3 s de stabilité de ciblage, un gisement actif, progression conservée, quantités finies, soute pleine = extraction suspendue sans perte).
- Soute en places, stock en tonnes ; station, dépôt unique en 2 s, réparation, fin volontaire ; chrono 240 s, alertes 60/30/10, tempête sur les 40 dernières secondes ; pertes limitées à la cargaison non déposée.
- Atelier 4 branches × 3 niveaux (40/80/120 t), « Atelier x/12 », livraison 1 000 t séparée du stock (compteur `delivered`), ouverture de la région 2, fin de prototype persistante.
- Régions 2–4 configurées (matière, plafond, masse, quota, coefficient) mais verrouillées.
- Sauvegarde versionnée avec copie de secours, récupération explicite, transactions idempotentes.
- Audio Web Audio provisoire (musique atelier/sortie, couche de tension, effets limités en nombre), volumes séparés, sourdine, déblocage au premier geste, suspension en arrière-plan.
- Panneau développeur (mode dev seulement).

## Fichiers importants
`src/logic/sim.ts` (simulation), `src/logic/economy.ts` (transactions/transition), `src/logic/save-model.ts` + `src/storage/storage.ts` (sauvegarde), `src/logic/level.ts` (carte), `src/config/regions.ts` + `balance.ts` (chiffres), `src/scenes/RunScene.ts` (rendu), `src/app.ts` (flux d’écrans), `src/ui/screens.ts`, `src/audio/audio.ts`, `tests/`, `scripts/`.

## Vérifications réellement exécutées
- `npm run build` : OK (types stricts + build).
- `npm test` : 55 tests OK — dépassement de soute, conservation des tonnes, dépôt unique, achats atomiques et idempotents, compteur livré distinct, double condition de transition, perte de la seule cargaison non déposée, sauvegarde/rechargement sans duplication, sauvegarde corrompue/stockage indisponible, praticabilité de la carte sur 40 graines, coût de simulation.
- Navigateur Chromium (Playwright, émulation tactile) : `scripts/smoke.mjs` 20/20 (390×844, 360×800, ordinateur 1280×800 : pas de défilement de page, joystick tactile, freinage, pause, clavier, diagonale) ; `scripts/flow.mjs` : parcours complet (collecte, minage, dépôt, bilan, rechargement, fermeture en sortie, atelier, livraison, région 2, pause/arrière-plan/réglages/abandon), aucune erreur console. Captures relues visuellement.
- **Non vérifié** : téléphone réel (iOS/Android), 60 i/s sur appareil, écoute humaine de la musique et des sons, tactile multi-doigts réel, restauration de la sauvegarde dans un vrai navigateur après corruption (testée en unitaire seulement).

## Écarts et choix par rapport au cahier des charges global
- **Phaser 3.90.0** retenu alors que Phaser 4.2.1 est publié : version dont l’API est éprouvée ; migration à évaluer avant le lot 3.
- **Vitest 5.0.5** (et non 3.x) pour éviter des avis de sécurité `npm audit` sur les versions antérieures.
- Précisions non fixées par le cahier : la fin volontaire dépose le reste de la cargaison ; les dégâts de tempête sont de 1 point toutes les 1,5 s dans la zone ; la réparation exige 2 s + délai de coque depuis l’arrivée à faible vitesse, même sans cargaison ; sur un profil neuf, « Jouer » lance directement la première sortie.
- Échelle de rendu du canvas 1× ou 2× selon la densité d’écran (netteté), logique 390 × 844 inchangée.

## Prochain lot (non commencé)
**Lot 2 — Quatre régions** : matières/plafonds 6-9-12, cartes et dangers (débris mobiles, mines, épaves), dureté des gisements, modules (Collecteur large, Compacteur, Protection) et caisses techniques, fin de V1. Avant : faire tester le pilotage et l’envie de refaire une sortie sur téléphone réel, ajuster quota/durée/tempête selon ces essais.
