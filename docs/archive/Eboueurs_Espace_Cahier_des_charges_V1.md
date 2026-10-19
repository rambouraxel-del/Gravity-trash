# Les Éboueurs de l’espace — Cahier des charges V1

Version de conception : 1.0 — 18 octobre 2026. Nom de travail, disponibilité commerciale non vérifiée.

## 1. Direction et décisions

Jeu solo mobile de récupération, de minage et d’amélioration d’un petit vaisseau. Jouable également sur ordinateur. L’expérience principale est le plaisir de collecter, de nettoyer une zone, de déposer sa cargaison et de rendre son appareil plus efficace.

Promesse : « Pars avec une petite soute. Reviens avec de quoi construire ton prochain palier. »

Décisions demandées par Axel : progression par régions successives ; matériaux de plus en plus évolués ; améliorations maximales du palier puis livraison d’un quota pour accéder au suivant ; cosmétiques et principe économique de Polar Rift ; ambiance musicale et sonore soignée ; beau rendu ; narration légère éventuellement ajoutée plus tard.

Choix de conception proposés dans ce document : quatre régions pour la V1, sorties de quatre minutes, améliorations cumulatives, pilotage à un doigt, minage automatique, livraison séparée des dépenses et paramètres chiffrés ci-dessous. Ces chiffres sont des valeurs initiales à tester, pas un équilibrage validé.

### Périmètres à distinguer

- **V1 de jeu** : quatre régions, progression complète, atelier, trois modules, cosmétiques, musique, sauvegarde et paramètres. Gratuit ; utilisable sans achat.
- **Lot 1 demandé à Claude** : première région entièrement jouable, collecte/minage/dépôt, améliorations et condition de fin du palier. Le reste est décrit pour éviter une architecture à refaire.
- **Services commerciaux** : achats et publicités réels constituent un lot séparé avant diffusion commerciale. Une version navigateur peut avoir ces fonctions indisponibles sans bloquer le jeu. Aucun achat ni visionnage fictif présenté comme réel.

Le projet est autonome : reprendre des principes de Polar Rift ne signifie ni modifier son dépôt ni supposer que ses comptes, monnaies ou services sont partagés.

## 2. Boucles de jeu

### Pendant une sortie

1. Décoller depuis une station de récupération.
2. Choisir une poche de matériaux ou une épave à exploiter.
3. S’approcher : l’outil extrait, l’aimant attire et la soute se remplit automatiquement.
4. Adapter sa trajectoire aux obstacles et à sa capacité restante.
5. Revenir déposer pour sécuriser les ressources ; repartir si le temps le permet.
6. Terminer volontairement à la station ou rentrer avant la fermeture du secteur.

### Entre les sorties

Déposer → acheter une amélioration → exploiter plus efficacement → maximiser les quatre branches du palier → livrer le quota de transition → ouvrir une région plus avancée.

Le plaisir doit exister avant les menus : déplacer le vaisseau et aspirer un groupe de fragments doit déjà être satisfaisant.

## 3. Commandes et affichage

- Présentation verticale sur téléphone, vue du dessus. Référence logique proposée : 390 × 844, adaptée aux formats voisins.
- Joystick flottant dans une zone basse réservée, utilisable à gauche ou à droite. Déplacement relatif : le vaisseau ne doit pas être caché sous le doigt.
- Rotation automatique dans la direction du mouvement ; accélération souple et freinage rapide au relâchement. Pas d’inertie réaliste incontrôlable.
- Minage, attraction et collecte automatiques ; aucune visée manuelle nécessaire.
- Souris pour les menus ; flèches et ZQSD/WASD pour déplacer le vaisseau sur ordinateur. Même simulation et mêmes statistiques.
- Zone de jeu distincte de la zone de commande ; boutons d’au moins 44 pixels CSS dans les tailles de test.
- Portrait centré sur ordinateur, marges décoratives possibles ; ne pas agrandir artificiellement le champ de vision du joueur PC.
- Le HUD affiche coque, soute et temps. Indicateur de station hors écran et radar compact. Objectif régional consultable à la pause et à l’atelier, sans panneau permanent encombrant.
- Respect des zones sûres, changement de taille sans coordonnées tactiles décalées, aucune page qui défile pendant le pilotage.

## 4. Collecte et minage

Deux actions complémentaires donnent du rythme :

**Fragments libres** : ramassage immédiat à portée. Courbe d’attraction courte, son métallique, pulsation et augmentation visible de la soute. Les fragments ont de petites variantes visuelles, mais des valeurs lisibles.

**Gisements/épaves** : rester à proximité déclenche l’extraction après 0,3 seconde de stabilité de ciblage. Un seul gisement actif ; priorité au plus proche, conservée jusqu’à sortie de portée pour éviter les changements intempestifs. Une jauge indique le travail. Les fragments extraits apparaissent près du gisement puis suivent les règles normales de collecte.

Le minage consomme le contenu réel du gisement. Une ressource est transférée une seule fois ; aucun gain à chaque frame. En sortie de portée, progression d’extraction conservée pendant la sortie. Soute pleine : extraction suspendue, aucun fragment supprimé pour manque de place.

Une poche facile est proche de la station ; les meilleurs regroupements sont éloignés ou plus exposés. Pas de génération qui enferme le joueur ou oblige à subir des dégâts.

### Capacité et unités

- La soute utilise des **places**. Le quota et les stocks utilisent des **tonnes** de la matière régionale. Les deux unités sont affichées avec leur nom, jamais mélangées.
- Un fragment principal occupe une place. Sa masse dépend de la région ; c’est une convention de progression, pas une simulation de masse réaliste.
- Une caisse technique optionnelle occupe quatre places et donne un composant d’équipement après dépôt. Elle ne fournit ni Prismes ni progression de quota.
- Le manifeste permet de consulter le contenu à la pause. Pas de tri manuel requis en pilotant.
- Une soute pleine réduit au maximum la vitesse de 10 %, progressivement. Le freinage reste efficace.

## 5. Une sortie et ses risques

Durée par défaut : 240 secondes de simulation active. Pas de carburant, d’oxygène ou de jauge de chaleur supplémentaire en V1.

La carte représente environ trois écrans de haut et deux de large ; caméra suiveuse et limites explicites. La station reste fixe, près d’une bordure, avec un espace de retour dégagé. Dispositions contrôlées combinées à des placements variables selon une graine.

### Dépôt

Entrer dans l’anneau et rester à faible vitesse pendant deux secondes dépose toute la cargaison. Chaque transaction a un identifiant, vide la soute et crédite le stock exactement une fois. Le dépôt sauvegarde immédiatement le résultat.

Après le dépôt, le joueur peut repartir. Rester trois secondes supplémentaires répare la coque. Un bouton « Terminer la sortie » apparaît dans l’anneau ; il n’est pas déclenché par le joystick. La station est une zone sûre, pas une source de nouveaux matériaux.

### Dangers

| Élément | Fonction | Introduction |
|---|---|---|
| Astéroïde sombre stérile | Obstacle fixe à contourner | Région 1 |
| Débris mobiles | Traversée à anticiper | Région 2 |
| Mine balisée | Zone d’explosion après avertissement | Région 3 |
| Tempête | Limite la durée et impose le retour | Toutes |

Les roches exploitables et les roches stériles ont des silhouettes et marquages différents. Un objet ramassable ne blesse pas. Les formes, signaux et sons doublent les codes couleur.

Collision dangereuse : un point de coque perdu, petite répulsion et invulnérabilité de 1,2 seconde. Les sons et effets expliquent l’origine des dégâts. Pas de combat, de tirs ennemis ou de boss dans cette V1.

### Tempête et fin

Avertissement à 60 secondes, puis à 30 et 10. Pendant les 40 dernières secondes, une zone dangereuse progresse depuis le bord opposé à la station. Elle reste compatible avec un retour possible depuis les positions normalement accessibles, à condition de partir à temps. Sa frontière est visible au radar.

À zéro : présent dans l’anneau, le vaisseau dépose et la sortie réussit ; présent dehors, la récupération d’urgence termine la sortie et détruit le chargement non déposé. Les dépôts antérieurs et toutes les améliorations restent acquis.

Coque à zéro : ouverture de l’écran d’accident avant résolution définitive du chargement. Refuser ou ne pas avoir accès à une seconde chance entraîne la perte du chargement courant uniquement.

En pause, en arrière-plan, pendant une interruption audio ou une publicité : simulation et chronomètre suspendus. Retour avec une pause explicite, joystick relâché ; pas de mort pendant un changement d’application.

## 6. Progression régionale — règle centrale

Quatre branches principales : **soute, aimant/extracteur, moteur, coque**. Trois améliorations par branche et par région. Les niveaux s’accumulent : 0–3, puis 4–6, 7–9 et 10–12. On ne remet jamais le vaisseau à zéro au changement de région.

Conditions de transition :

1. Les quatre branches atteignent le plafond natif de la région.
2. Le joueur livre le quota régional demandé.
3. Il valide le départ depuis l’atelier.

La livraison s’ouvre après maximisation des branches. Elle est volontaire, peut être partielle et retire réellement la matière du stock. Les anciens dépôts ne comptent pas une deuxième fois. Un compteur `delivered` distinct du stock conserve les livraisons effectuées. Un surplus économisé avant maximisation peut ensuite être livré.

Le joueur voit deux objectifs séparés : « Atelier 9/12 améliorations », puis « Livraison 600/1 000 t ». La raison du verrouillage est toujours visible. Aucun achat premium ni bonus temporaire ne remplace ces conditions.

### Régions de la V1

| Région | Matière | Tonnes/fragment | Plafond des branches | Quota livré | Nouveauté |
|---|---|---:|---:|---:|---|
| 1 — Ceinture rocheuse | Pierre | 10 | 3 | 1 000 t | Collecte, minage, obstacles fixes |
| 2 — Nébuleuse cristalline | Cristal | 25 | 6 | 4 000 t | Débris mobiles et gisements plus résistants |
| 3 — Couronne dorée | Or | 50 | 9 | 12 000 t | Mines visibles, poches très rentables plus exposées |
| 4 — Cimetière orbital | Circuits recyclables | 100 | 12 | 40 000 t | Épaves à extraire et combinaison des dangers |

Quotas et tonnages sont des valeurs de départ. La région 4 achève la progression V1 avec un écran de réussite ; elle reste rejouable. Ne pas promettre de régions infinies générées automatiquement.

Revisiter une ancienne région est possible. Ses stocks sont conservés, mais une matière ancienne ne paie pas les améliorations d’une région avancée. Pas de conversion automatique entre matériaux.

## 7. Améliorations, rythme et modules

Table de capacité pour les niveaux 0 à 12 : **12, 16, 20, 24, 30, 36, 42, 50, 60, 72, 86, 102, 120 places**.

Pour chacune des quatre branches, les trois achats d’un palier coûtent 40, 80 et 120 fois le coefficient régional, en tonnes de la matière de cette région.

| Région | Coefficient | Coût des 3 achats par branche | Total des 4 branches | Coût total avec livraison |
|---|---:|---:|---:|---:|
| 1 | 1 | 40 / 80 / 120 t | 960 t | 1 960 t |
| 2 | 4 | 160 / 320 / 480 t | 3 840 t | 7 840 t |
| 3 | 12 | 480 / 960 / 1 440 t | 11 520 t | 23 520 t |
| 4 | 40 | 1 600 / 3 200 / 4 800 t | 38 400 t | 78 400 t |

Paramètres initiaux de simulation, exprimés dans l’espace logique du jeu :

- Moteur : vitesse maximale `170 + 6 × niveau` unités/seconde, normalisation des diagonales.
- Aimant : portée `56 + 4 × niveau` unités ; extraction multipliée par `1,17 puissance niveau`.
- Coque maximale : `3 + partie_entière(niveau / 3)` ; niveaux intermédiaires réduisent le délai de réparation à la station de 0,25 seconde chacun, avec minimum de 1 seconde.
- Dureté des gisements : coefficients régionaux 1 / 1,6 / 2,56 / 4,096 ; un gain de puissance est donc utile sans bloquer tout minage à l’entrée d’une région.
- Extraction de base : un fragment toutes les 0,6 seconde avant puissance/dureté ; plafonner le débit réel pour ne pas créer des centaines d’objets simultanés.

Intention de rythme : première amélioration possible après une courte première sortie réussie ; environ 5 à 10 sorties par région, à vérifier par télémétrie locale de test. Ne pas allonger artificiellement les quotas pour atteindre cette durée. Réduire les exigences si le jeu devient une répétition sans choix.

Trois modules disponibles après la région 1, un seul équipé à la fois : Collecteur large (+15 % de portée), Compacteur (deux fragments ordinaires pour une place), Protection (premier impact annulé par sortie). Déblocages par composants de caisses techniques, seuils initiaux 2 / 3 / 3. Équipement hors sortie uniquement. Aucun module n’est requis pour la transition régionale. Les places fractionnaires du Compacteur sont calculées par arrondi supérieur sur les paires, sans créer ni détruire de matière.

## 8. Économie et cosmétiques

### Référence Polar Rift et adaptation

Les règles retrouvées pour Polar Rift sont : jeu gratuit ; Éclats pour les bonus ; Médailles/succès pour les cosmétiques ordinaires ; Prismes premium ; apparences limitées aux vaisseaux et aux traînées ; packs 30/100/380 Prismes à 0,99/2,99/9,99 € ; vaisseau premium 150, traînée 75, ensemble 200 Prismes ; Boost 50 Éclats, Gel 100 ; deuxième chance 5 Prismes ou publicité récompensée, troisième vie 10 Prismes. Les parties aidées y sont séparées du classement.

Ces catégories et tarifs constituent la référence économique de ce projet. Le fonctionnement des bonus est adapté au minage, comme décrit ci-dessous. Les tarifs des boutiques réelles seront configurés via leurs produits, sans montant débité directement par le client.

### Comptes séparés

1. **Matières régionales** : progression, achats techniques et livraisons. Non achetables en argent réel.
2. **Éclats** : bonus temporaires. Récompense proposée : 10 pour une sortie déposant au moins une unité de matière, plus 5 si aucun dégât subi, une fois par identifiant de sortie. Aucun gain en quittant à vide.
3. **Médailles** : succès et défis pour acheter les apparences ordinaires. Gains initiaux : succès uniques 10/20/40 selon difficulté ; trois défis quotidiens maximum à 10 chacun, non requis pour progresser.
4. **Prismes** : achats premium, cosmétiques premium et secondes chances. Pas de conversion en matière ou en niveau de vaisseau. Aucun portefeuille commun avec Polar Rift en V1.

L’atelier technique n’affiche que les matières utiles. Médailles et Prismes apparaissent dans le vestiaire ; les Éclats dans la préparation des bonus. Éviter quatre compteurs dans le HUD.

### Catalogue initial

Une apparence de base et une traînée de base gratuites. Deux vaisseaux ordinaires à 140 et 180 Médailles ; deux traînées ordinaires à 70 et 100. Trois vaisseaux premium à 150 Prismes chacun ; trois traînées à 75 ; ensembles correspondants à 200. Les silhouettes et couleurs peuvent varier, mais taille de collision, portée et performances restent identiques.

Les renforcements visibles du vaisseau technique restent distincts de son habillage. Aucun tirage aléatoire, abonnement ou achat d’avantage permanent nécessaire en V1. Ne pas inventer une offre de suppression des publicités non définie dans la référence.

### Bonus et reprise

- **Boost — 50 Éclats** : active pendant 10 secondes une attraction/extraction renforcée de 30 %, une fois par sortie. Ne change ni capacité native ni verrou régional.
- **Gel — 100 Éclats** : immobilise les débris mobiles et suspend les mines pendant 5 secondes, une fois par sortie. Ne stoppe pas le chronomètre ni la tempête.
- Achat/armement avant départ ; charge consommée seulement au déclenchement. Un unique bouton contextuel reste hors zone du joystick ; l’expérience normale n’en dépend pas.
- Première reprise après accident : 5 Prismes **ou** une publicité récompensée effectivement validée. Deuxième reprise : 10 Prismes. Maximum deux reprises par sortie.
- Reprise disponible seulement s’il reste au moins 20 secondes et si une position sûre hors station existe. Jamais après expiration du temps. Restaure la coque et conserve la cargaison figée à l’accident, avec protection de 2 secondes ; aucun dépôt automatique.
- L’écran d’accident et la publicité mettent la simulation en pause. Retour volontaire au jeu après validation, pas de saut du chronomètre.
- Toute sortie utilisant un bonus ou une reprise porte `assisted=true`. Aucun classement public en V1. Si un classement arrive plus tard, les catégories restent séparées et aucune remise à zéro automatique n’est ajoutée.

### Services réels et absence de réseau

La progression normale fonctionne hors ligne. Les achats et publicités dépendent d’adaptateurs séparés ; en leur absence, boutons cachés ou explicitement indisponibles, sans fausse réussite.

Avant commercialisation : produits et plateformes configurés, consentement, vérification des achats/récompenses via service adapté, transactions idempotentes, restauration, gestion des remboursements et des indisponibilités. Aucune clé secrète côté client. Ne pas reprendre comme acquise l’intégration native Polar Rift : elle doit être auditée et testée avant réutilisation. Ces tâches sont des prérequis de diffusion, pas du lot 1.

## 9. Ambiance visuelle et audio

### Visuels

Fond spatial sombre, vaisseau crème/orange, interaction cyan, danger corail. Région 1 : pierre et lumière froide ; région 2 : cristaux violets/cyan ; région 3 : poussières ambrées ; région 4 : structures industrielles et voyants.

Les trois maquettes de la discussion sont des références de direction, pas des images à utiliser comme fonds de jeu complets. Interface, vaisseau, station et objets doivent être des éléments séparés. Retenir une vue réellement verticale et cohérente dans tous les assets.

Production initiale : un vaisseau de base, une station, quatre familles de gisements avec trois variantes, quatre silhouettes d’obstacles, un débris mobile, une mine, une caisse technique, quatre fragments principaux, icônes d’atelier, effets et variantes cosmétiques. Une même image de vaisseau tourne ; pas de spritesheet à huit directions nécessaire.

Animations par code : propulseurs, léger mouvement d’objets, rayons d’extraction, fragments attirés, déchargement, pulsations et frontière de tempête. Pool d’objets et limites de particules. Le rendu généré par IA reste une source à préparer et vérifier : transparence, cadrage, contours et cohérence, pas une garantie d’intégration automatique.

### Musique

Identité électronique spatiale mélodique, entraînante et chaleureuse. On recherche l’envie de rester dans l’ambiance, pas une simple nappe de fond ni une musique épique épuisante.

- Atelier : version calme du thème.
- Sortie : base musicale avec variations, percussions légères et basse lisible.
- Approche du danger : ajout progressif d’une couche, sans changement brutal de morceau.
- Fin de sortie : tension modérée ; retour station : résolution et son de dépôt gratifiant.
- Une identité par région, avec un motif commun. Première production : une musique de sortie et une d’atelier ; variantes régionales ensuite.

La musique n’impose pas le moment des collisions et le jeu reste entièrement jouable muet. Les pulsations visuelles éventuelles restent discrètes et désactivables. Utiliser des boucles compatibles ou des stems synchronisés ; ne pas fabriquer une pseudo-réactivité aléatoire.

Sons essentiels : propulsion discrète, extraction, collecte avec variations légères, soute pleine, impact, dépôt, achat, transition et alerte. Limiter les déclenchements simultanés pour éviter la cacophonie. Volumes séparés musique/effets, sourdine, réglage conservé. Déblocage audio après geste utilisateur, arrêt/reprise propres en arrière-plan, jamais plusieurs musiques superposées par erreur.

Les musiques et sons définitifs nécessitent des fichiers originaux ou utilisables sous licence documentée. Des sons de synthèse temporaires peuvent servir au prototype ; ils ne valent pas bande-son finale livrée.

## 10. Écrans et premiers pas

Écrans : accueil, sélection de région, atelier/préparation, sortie, pause, accident, bilan, livraison/transition, vestiaire et paramètres. Les panneaux peuvent partager une même structure, sans multiplication artificielle des scènes.

Première expérience : bouton Jouer → premier mouvement → groupe de fragments proche → gisement facile → soute pleine → flèche de retour → dépôt → premier achat. Instructions courtes intégrées, sans écran de texte préalable. La tempête de la première sortie reste annoncée et explicable ; aucune monnaie premium requise pour apprendre.

Bilan : matière déposée, chargement perdu, nouveaux succès, progression d’atelier et de livraison. Afficher clairement ce qui a réellement été sauvegardé. Aucun bouton inactif présenté comme opérationnel.

## 11. Architecture et persistance

TypeScript + Vite + Phaser pour une nouvelle base, avec versions stables compatibles vérifiées lors de l’installation et figées dans le lockfile. Si un dépôt existant est fourni, lire ses consignes et conserver sa pile compatible. Aucun framework d’interface supplémentaire imposé pour le prototype. Prévoir un emballage natif ultérieur sans intégrer les SDK commerciaux au lot 1.

Séparer configuration des régions, logique économique pure, progression, cargaison, simulation, interface, audio et stockage. Pas de scène unique géante ni d’architecture de moteur générique surdimensionnée.

Enregistrer au minimum : version de schéma, identifiant de profil local, région active, régions ouvertes, stocks par matière, livraisons par région, niveaux des quatre branches, modules, monnaies, cosmétiques possédés/équipés, succès réclamés, identifiants des dernières transactions et réglages.

Transactions déterministes : vérifier les préconditions, débiter/créditer ensemble, enregistrer une seule fois. Sur achat impossible, aucune modification partielle. Les nombres sont entiers non négatifs et les valeurs lues sont validées. Sauvegarde principale + dernière copie valide ; sauvegarde corrompue : récupération explicite, pas d’effacement silencieux de tout le profil. Si le stockage est indisponible, prévenir que la session n’est pas persistante.

La sortie en cours peut être abandonnée après fermeture complète : tous les dépôts sont conservés, le chargement non déposé est perdu, sans réappliquer les récompenses. Suspendre/reprendre une application sans fermeture conserve la sortie en mémoire. Enregistrer la consommation des bonus à l’usage pour empêcher leur duplication après rechargement.

Outillage de développement hors version publique : ajout de matière, remise à zéro explicite, temps, région et statistiques de performance. Ne jamais exposer de bouton de crédit premium en production. Aucune réinitialisation automatique des données.

## 12. Performance, qualité et critères d’acceptation

Objectif : commandes réactives et 60 images/seconde sur appareils de test intermédiaires, avec réduction des particules et décor en qualité basse. Ce chiffre est une cible à mesurer sur appareil réel, pas un résultat garanti par un test navigateur.

Garde-fous initiaux : jusqu’à 120 fragments actifs, 30 obstacles, 20 gisements et 80 particules ; réutilisation des objets ; regroupement visuel des très petites ressources si nécessaire. Les quantités dépassant le budget restent dans le gisement, jamais perdues.

Validation fonctionnelle :

1. Un doigt déplace correctement le vaisseau à toutes les tailles testées ; diagonales non accélérées.
2. Une sortie complète fonctionne sans achat, publicité ni connexion.
3. Chaque fragment, dépôt, achat, livraison et récompense n’est traité qu’une fois.
4. Pleine, la soute n’avale ni ne détruit les ressources excédentaires.
5. Un choc n’enlève pas plusieurs points sur un seul contact.
6. Une sortie ratée préserve les dépôts et améliorations antérieurs.
7. Les quatre branches maximisées seules ne débloquent pas une région ; le quota seul non plus.
8. Livrer retire la bonne matière ; dépenses et livraisons ne se comptent pas deux fois.
9. Le passage de région garde les niveaux, change la matière et ouvre le bon palier.
10. Sauvegarder/recharger conserve exactement stocks, progression, achats et réglages.
11. Pause/arrière-plan/publicité n’avancent pas la simulation et ne laissent pas le joystick actif.
12. Les cosmétiques ne changent aucune statistique ou collision.
13. Une publicité fermée ou un achat annulé ne donne rien ; un résultat validé ne crédite jamais deux fois.
14. Son débloqué au premier geste, volumes persistants et aucune duplication de musique.

Tests automatisés prioritaires : cargaison, transactions, plafonds d’amélioration, conditions de transition, pertes après accident, idempotence et relecture des sauvegardes. Tests manuels : commandes, son, lisibilité, plaisir et performance. Un test simulé n’est jamais présenté comme une vérification sur iPhone/Android réel.

## 13. Lots de production

| Lot | Contenu | Condition de sortie |
|---|---|---|
| 1 — Boucle jouable | Région 1, pilotage, minage, aimant, soute, station, dégâts, temps, atelier, sauvegarde, quota | Une progression complète jusqu’à « Région 2 disponible » est testable |
| 2 — Quatre régions | Matières, plafonds, nouvelles cartes/dangers, modules, fin V1 | Toute la progression se joue sans outil développeur |
| 3 — Présentation | Assets cohérents, musique/stems, sons, effets, onboarding, accessibilité | Expérience lisible et agréable sur téléphone réel |
| 4 — Méta et cosmétiques | Succès, défis, Éclats, Médailles, vestiaire, bonus, adaptateurs commerciaux | Déblocages gratuits complets, aucun faux paiement |
| 5 — Diffusion | Intégrations natives, achats/publicités vérifiés, restauration, tests appareils et réglage final | Parcours commerciaux et jeu hors ligne validés |

Le lot 1 n’est pas toute la V1 ; il doit être un jeu testable, pas un squelette de menus. N’intégrer ni les quatre régions graphiques ni un backend complet avant d’avoir validé le pilotage, la collecte et l’envie de refaire une sortie.

Hors périmètre : multijoueur, classement public, campagne dialoguée, combats de boss, inventaire manuel complexe, crafting à dizaines de recettes, physique réaliste de chaque débris, monnaie partagée entre jeux et contenu infini.

## 14. Références techniques consultées

Documentation officielle Phaser, consultée le 18 octobre 2026 :

- [Audio et déblocage après interaction](https://docs.phaser.io/phaser/concepts/audio).
- [Adaptation de l’affichage et modes de mise à l’échelle](https://docs.phaser.io/phaser/concepts/scale-manager).

Ces références cadrent les contraintes techniques ; les nombres de gameplay et l’organisation des lots sont des propositions de conception propres à ce projet.
