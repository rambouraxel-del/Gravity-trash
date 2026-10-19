# SPACE TRASH — Cahier des charges V1

Version de conception 1.1 — Projet Azerya Studio

## 1. Vision générale

Space Trash est un jeu solo 2D mobile, en vue du dessus, mêlant exploration spatiale, récupération de ressources, construction modulaire et gestion d’une entreprise industrielle.

Le joueur possède initialement un petit vaisseau de récupération et une station spatiale presque abandonnée.

Son objectif est de développer une entreprise capable de collecter, transformer et commercialiser des ressources spatiales, jusqu’à construire son premier grand relais commercial orbital.

Les trois piliers du jeu :

1. Explorer librement l’espace à bord de son vaisseau.
2. Développer une station industrielle et améliorer ses équipements.
3. Automatiser progressivement la récupération et la transformation.

Le jeu reste accessible, sans mécanique de survie punitive ni gestion industrielle trop complexe.

## 2. Exploration spatiale — Système principal

### Monde et déplacements

Le joueur choisit un secteur spatial depuis sa station, puis part l’explorer librement.

Chaque secteur possède une carte vaste avec des astéroïdes, gisements, débris, épaves et dangers.

Il n’y a aucun chronomètre global, aucune limite de durée d’expédition et aucun carburant à surveiller.

Le joueur peut donc :

* Explorer pendant deux minutes ou vingt minutes.
* Récolter des ressources librement.
* Découvrir des zones éloignées et dangereuses.
* Revenir déposer sa cargaison à volonté.
* Repartir dans le même secteur après un dépôt.

La station ou le point d’amarrage reste accessible sur la carte. Le radar et une balise directionnelle permettent de le retrouver.

### Une vraie gestion du risque

L’absence de chronomètre ne signifie pas l’absence de danger.

La difficulté dépend de l’emplacement : plus certaines zones sont éloignées ou difficiles d’accès, plus elles peuvent contenir d’obstacles et de ressources précieuses.

Exemples : champs d’astéroïdes instables, poches de radiation, courants électriques, épaves dangereuses.

En cas de destruction du vaisseau, le joueur est rapatrié et perd sa cargaison non déposée, mais conserve les ressources sécurisées, les constructions et les améliorations.

Un rapatriement d’urgence manuel reste possible, avec perte de la cargaison transportée.

### Cartographie et découverte

Une mini-carte indique la position du vaisseau, la station et les points d’intérêt déjà détectés.

Un système de scanner permet de révéler progressivement les gisements, grandes épaves et zones particulières.

Les découvertes importantes restent enregistrées. Les ressources ordinaires sont renouvelées lors des nouvelles expéditions, tandis que les objets uniques ne peuvent être obtenus qu’une fois.

## 3. Trois secteurs pour la V1

| Secteur | Ressources principales | Particularité |
|---|---|---|
| Ceinture rocheuse | Roche brute, ferraille | Secteur initial, minage simple |
| Nébuleuse cristalline | Glace, cristaux | Extraction spécialisée, perturbations énergétiques |
| Cimetière orbital | Circuits récupérés, noyaux énergétiques | Épaves, démantèlement, ressources rares |

Chaque secteur possède sa propre identité visuelle, sa répartition de ressources et ses dangers.

Les secteurs restent accessibles après leur déblocage. Le joueur peut donc retourner chercher les ressources précédentes.

Important : la progression ne dépend plus de l’obligation de maximiser toutes les améliorations ou de livrer un quota arbitraire.

Elle dépend désormais de projets de construction, de contrats importants et de découvertes technologiques.

## 4. Système de ressources et d’industrie

### Ressources brutes

Six ressources principales constituent l’économie initiale.

* Roche brute : matériau de construction basique.
* Ferraille : métal récupéré et recyclable.
* Glace : source de composants chimiques et énergétiques.
* Cristaux : matière utilisée pour les technologies avancées.
* Circuits récupérés : électronique issue des épaves.
* Noyaux énergétiques : composants rares de haute technologie.

### Transformation industrielle

La raffinerie débloque trois chaînes simples :

| Transformation | Produit |
|---|---|
| Ferraille | Lingots métalliques |
| Glace + cristaux | Cellules énergétiques |
| Lingots + circuits | Pièces technologiques |

Chaque production possède un temps de traitement et consomme réellement les ressources nécessaires.

Les chaînes sont volontairement courtes pour cette V1.

### Économie

Deux ressources économiques sont distinguées :

Les matières physiques servent aux constructions, équipements, améliorations et livraisons.

Les crédits spatiaux sont obtenus par les contrats et la vente de surplus. Ils servent aux services, à certaines constructions et aux technologies.

Les crédits ne remplacent jamais les matériaux nécessaires à une construction.

## 5. Station spatiale — Construction modulaire

La station constitue le quartier général du joueur.

Elle possède une vue 2D fixe, dans laquelle les installations sont positionnées à des emplacements prédéfinis.

Le joueur ne place pas manuellement les bâtiments sur une grille. Chaque nouvelle construction apparaît automatiquement à son emplacement.

Il peut toucher un module pour ouvrir ses fonctions et ses améliorations.

### Installations de la V1

| Installation | Fonction |
|---|---|
| Atelier initial | Amélioration du vaisseau et équipement |
| Entrepôt | Augmentation des capacités de stockage |
| Raffinerie | Transformation automatique des ressources |
| Bureau commercial | Contrats, commandes et vente |
| Hangar à drones | Fabrication et gestion du drone |

L’atelier et un petit stockage de départ sont immédiatement disponibles. Les quatre autres installations doivent être construites.

Chaque bâtiment possède trois niveaux d’amélioration au maximum.

Par exemple, améliorer la raffinerie permet d’accélérer le traitement et d’augmenter les quantités prises en charge.

La station change visuellement à mesure qu’elle se développe : nouveaux modules, lumières, structures et animations.

Objectif : donner au joueur une impression tangible de croissance, plutôt qu’une simple accumulation de chiffres.

## 6. Vaisseau et équipements

Les quatre améliorations existantes sont conservées :

| Branche | Effet |
|---|---|
| Soute | Capacité de transport |
| Aimant | Portée et efficacité de collecte |
| Moteur | Vitesse et maniabilité |
| Coque | Résistance aux dangers |

Les améliorations restent permanentes et sont visibles sur les statistiques.

### Deux équipements spécialisés

Laser de découpe : permet de démanteler certaines épaves et de récupérer leurs composants.

Tracteur gravitationnel : permet d’attirer et de déplacer des objets lourds vers une zone de récupération.

Un seul outil spécialisé peut être équipé à la fois en V1.

Le vaisseau possède un emplacement dédié, mais les équipements n’imposent pas encore un système complexe de poids ou de consommation énergétique.

## 7. Système de contrats commerciaux

Le bureau commercial propose régulièrement des commandes.

Trois catégories :

Contrats classiques : livraison de matières brutes ou raffinées contre des crédits.

Contrats industriels : fourniture de composants nécessitant la construction et l’utilisation des installations.

Contrats majeurs : objectifs uniques servant à débloquer les nouveaux secteurs ou les étapes du projet final.

La V1 prévoit une douzaine de modèles de contrats ordinaires et plusieurs contrats majeurs scénarisés légèrement.

Les contrats ordinaires n’ont pas de limite de temps. Le joueur peut les accepter, les compléter progressivement ou les abandonner sans pénalité importante.

Une vente directe à prix fixe est également possible afin d’éviter les situations où le joueur manquerait de crédits et ne pourrait plus progresser.

## 8. Drones et automatisation

La V1 permet de fabriquer un seul drone collecteur, améliorable.

Le joueur choisit un secteur déjà découvert et confie au drone une mission de récupération.

Le drone récolte une quantité limitée de ressources ordinaires sur la durée et revient automatiquement à la station.

Ses performances dépendent de trois caractéristiques : capacité, vitesse de récupération et efficacité.

L’automatisation est volontairement moins productive qu’une expédition manuelle optimisée.

Le drone travaille pendant que le joueur explore ou gère sa station. Sa production est plafonnée par sa capacité : il faut vider sa cargaison pour relancer une mission.

La production hors application reste exclue de la première V1, afin de ne pas transformer le jeu en simple système d’attente.

## 9. Progression et objectif final

### Phase 1 — Survivre économiquement

Le joueur récupère ses premières matières, améliore sa soute et construit un entrepôt.

Il découvre le fonctionnement de sa station et réalise ses premières ventes.

### Phase 2 — Industrialiser

Il débloque la nébuleuse, construit sa raffinerie, fabrique des matériaux transformés et commence les contrats industriels.

### Phase 3 — Automatiser

Il atteint le cimetière orbital, explore de grandes épaves et récupère les composants nécessaires au hangar à drones.

Son premier drone commence à produire.

### Phase 4 — Construire son relais commercial

Le projet final demande plusieurs produits raffinés, des composants rares et un investissement en crédits.

La construction du relais orbital marque la fin de progression de la V1 et donne accès à un écran de réussite.

Le joueur peut continuer à explorer, récolter et développer sa station après cette réussite.

## 10. Interface et expérience mobile

Les écrans principaux sont :

* Accueil et station spatiale.
* Carte des secteurs.
* Exploration à bord du vaisseau.
* Atelier et équipements.
* Entrepôt et raffinerie.
* Contrats commerciaux.
* Gestion du drone.
* Progression du projet final.

Le pilotage reste accessible à un doigt, avec collecte automatique des fragments et extraction à proximité.

L’interface d’exploration privilégie la lisibilité du vaisseau, de sa cargaison, de sa coque et de la mini-carte.

La navigation entre les installations doit rester simple, avec un minimum d’écrans intermédiaires.

## 11. Limites du périmètre V1

Ne sont pas inclus : multijoueur, combats, ennemis, construction libre sur grille, flotte de plusieurs vaisseaux, dizaines de drones, chaînes de production complexes, arbre technologique géant, marché dynamique entre joueurs ou régions infinies.

Les publicités, achats intégrés et éléments premium restent hors du périmètre de développement de cette première version jouable.

## 12. Critères de réussite de la V1

La V1 est considérée comme terminée lorsque le joueur peut :

1. Explorer librement les trois secteurs sans limite de temps.
2. Récupérer les six matières principales.
3. Revenir déposer et sécuriser sa cargaison.
4. Construire et améliorer les quatre installations.
5. Transformer les ressources grâce à la raffinerie.
6. Accomplir des contrats et gagner des crédits.
7. Améliorer et équiper son vaisseau.
8. Fabriquer et utiliser son premier drone.
9. Compléter le grand projet de relais orbital.
10. Sauvegarder et reprendre sa progression sans perte ou duplication de ressources.

L’expérience doit rester plaisante sans achat réel, connexion permanente ou publicité.

Principe directeur : chaque nouveau système doit encourager le joueur à explorer davantage, et chaque expédition doit contribuer au développement de son empire.
