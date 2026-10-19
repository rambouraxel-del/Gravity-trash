# Prompt Claude — Les Éboueurs de l’espace — Lot 1

Tu développes le premier lot jouable d’un nouveau jeu solo mobile de récupération et de minage spatial, « Les Éboueurs de l’espace ». Il doit aussi fonctionner au clavier sur ordinateur. Implémente réellement le jeu dans le dossier de travail, sans te limiter à un plan ou à une maquette.

Le cahier des charges `Eboueurs_Espace_Cahier_des_charges_V1.md`, fourni avec ce prompt, décrit la cible globale. Copie-le dans `docs/` s’il est disponible. Il ne signifie pas qu’il faut réaliser les cinq lots maintenant. Le présent prompt est autonome pour le lot 1 et définit sa limite. En cas de contradiction, applique ses exigences de lot ; signale toute divergence avec le document global.

## 1. Démarrage et périmètre

Lis les éventuels AGENTS.md, CLAUDE.md et fichiers du dépôt. Préserve le travail existant. Pour un dossier vide, crée une base TypeScript + Vite + Phaser, versions stables compatibles vérifiées dans leurs documentations officielles et verrouillées par un lockfile. Pour un projet compatible déjà présent, conserve sa pile et ses conventions.

Ne touche pas à Polar Rift. Il s’agit d’un autre jeu : aucun partage supposé de compte, service ou portefeuille. N’intègre ni publicité réelle, ni paiement, ni backend, ni classement, ni campagne narrative dans ce premier lot. Ne déploie pas et ne pousse pas sur un dépôt distant sans instruction existante en ce sens.

Le livrable est une **première région jouable et améliorable jusqu’à sa condition de sortie**, avec une présentation propre. Les autres régions sont seulement définies en configuration et affichées verrouillées. Au déblocage de la région 2, affiche une vraie fin de prototype et conserve le résultat ; n’invente pas une région 2 fonctionnelle.

## 2. Boucle et commandes

- Affichage portrait, référence logique 390 × 844, adaptation aux écrans et zones sûres. Sur ordinateur, portrait centré avec marges.
- Vaisseau vu du dessus, pilotage au joystick flottant dans une zone basse réservée ; choix gauche/droite dans les réglages. Aucun défilement de page lors du jeu.
- Au clavier : flèches et ZQSD/WASD ; déplacement normalisé. Rotation automatique vers le mouvement, accélération douce et freinage rapide. Pas de simulation d’inertie réaliste.
- Collecte et extraction automatiques. Aucune arme, aucun bouton pour ramasser.
- Le joueur quitte une station, exploite la zone, remplit sa soute, revient déposer puis peut repartir. Sortie de quatre minutes, fin volontaire possible à la station.

## 3. Région 1 : Ceinture rocheuse

Crée une carte d’environ trois écrans de haut et deux de large, avec caméra suiveuse, frontières visibles et station fixe en bas. Un radar compact et une flèche indiquent la station hors écran. Le chemin de retour doit rester praticable.

Dispose quelques fragments de pierre libres, des gisements exploitables et des obstacles stériles. Ces trois catégories doivent être reconnaissables par leur forme, pas seulement leur couleur. Premier groupe de fragments très proche de la station. Privilégie une disposition préparée avec légère variation déterministe plutôt qu’un générateur complexe.

- Un fragment = une place de soute et 10 tonnes de pierre après dépôt.
- Aimant de base : portée 56 unités logiques. Fragments attirés visiblement vers le vaisseau.
- Gisement : sélection du plus proche, stable jusqu’à sortie de portée ; extraction après 0,3 s de présence, puis un fragment par 0,6 s avant multiplicateur. Quantité finie ; progression d’extraction conservée pendant la sortie.
- Le fragment n’est consommé qu’une fois effectivement collecté. Soute pleine : extraction suspendue, surplus conservé dans le monde ; aucune perte silencieuse.
- Coque initiale : trois points. Astéroïdes stériles : un dégât par choc, répulsion légère, invulnérabilité de 1,2 s.
- Aucun objet collectable ne provoque de dégât.
- Soute pleine : vitesse réduite de 10 % maximum, freinage toujours efficace.

## 4. Station, chrono et échec

Dans l’anneau, deux secondes à faible vitesse déposent toute la cargaison, créditent le stock de pierre et sauvegardent en une transaction unique. Animation et son de déchargement. Rester trois secondes supplémentaires répare la coque. Le joueur peut repartir ou appuyer sur « Terminer la sortie ».

Durée : 240 s de simulation active. Alertes à 60, 30 et 10 secondes ; frontière de tempête avançant depuis le haut pendant les 40 dernières secondes. Aucun dommage injuste à l’apparition : danger annoncé, station sûre.

À zéro : dans l’anneau, dépôt puis réussite ; dehors, récupération d’urgence et perte de la soute non déposée. Coque à zéro : même perte du chargement courant. Aucun dépôt précédent ni amélioration ne disparaît. Pas de seconde chance dans ce lot.

Pause et arrière-plan suspendent tout, chronomètre compris. Au retour : écran de pause et commandes neutralisées. En cas de fermeture complète, les dépôts sont conservés et la cargaison non déposée abandonnée ; aucune récompense répétée après rechargement.

## 5. Atelier et transition obligatoires

Quatre branches, niveaux 0 à 3 dans ce prototype : soute, aimant/extracteur, moteur, coque. Pour chacune, prix successifs 40 / 80 / 120 tonnes de pierre. Aucun achat sans stock suffisant, aucun stock négatif, aucune réapplication au double clic.

- Capacité par niveau de soute : 12 / 16 / 20 / 24 places.
- Aimant : portée `56 + 4 × niveau` ; puissance d’extraction `1,17 puissance niveau`.
- Moteur : vitesse maximale `170 + 6 × niveau` unités/s.
- Coque : trois points de base, quatre au niveau 3 ; chaque niveau réduit le délai de réparation de 0,25 s.

La transition nécessite **les quatre branches au niveau 3 ET 1 000 tonnes livrées**. La livraison n’est possible qu’une fois les branches maximisées : bouton explicite à l’atelier, livraison partielle possible depuis le stock. Elle retire la matière du stock et crédite un compteur livré distinct. Les achats ne comptent jamais comme livraison. Un stock économisé avant maximisation reste utilisable ensuite.

Affiche « Atelier x/12 » et « Livraison x/1 000 t » avec la cause exacte des verrous. Une fois les deux conditions remplies : action « Ouvrir la région 2 », résultat persistant puis écran « Région 2 débloquée — fin du prototype ». Le joueur peut rejouer la région 1.

Prépare des configurations pour les régions futures, sans les activer : pierre/cristal/or/circuits ; plafonds 3/6/9/12 ; masses par fragment 10/25/50/100 t ; quotas 1 000/4 000/12 000/40 000 t ; coefficients de prix 1/4/12/40. Les niveaux seront cumulatifs, jamais remis à zéro entre régions.

## 6. Présentation et son

Style cohérent et lisible : espace bleu sombre, vaisseau crème/orange, aimant cyan, dangers corail. Le vaisseau est un petit remorqueur avec deux propulseurs et deux branches d’aimant. Station circulaire/octogonale avec anneau de dépôt lumineux.

Crée des assets séparés simples et propres par code/SVG/textures procédurales si les images ne sont pas disponibles ; garde leurs sources et rends leur remplacement facile. N’utilise pas une capture de maquette comme fond de jeu. N’attends pas des images définitives pour rendre le prototype jouable.

Soigne propulseurs, attraction, extraction, petit impact, déchargement et retour visuel d’achat. Pas de secousses ou flashs agressifs. Limite particules et objets actifs ; aucun shader coûteux nécessaire.

Ajoute un gestionnaire audio : déblocage au premier geste, volumes musique/effets séparés, sourdine persistante et reprise propre. Si des fichiers autorisés existent, utilise-les et documente leur provenance. Sinon, crée une ambiance musicale temporaire originale de synthèse, douce et variée, ainsi que des sons courts de collecte/dépôt/impact ; indique clairement leur statut provisoire. Ne télécharge pas de musique sans licence et ne prétends pas avoir produit une bande-son finale.

Les sons doivent être agréables en série, avec limitation des déclenchements et variations légères. Aucun besoin de jouer au rythme, aucune collision synchronisée à la musique. Le jeu reste lisible muet.

## 7. Écrans et organisation

Accueil avec Jouer/Reprendre, atelier, préparation/décollage, sortie, pause, bilan, paramètres et fin de prototype. Courts conseils intégrés pour mouvement, collecte, minage, dépôt puis achat. Pas de longs tutoriels, menus vides ou faux boutons commerciaux.

Sépare configurations, logique de cargaison, transactions, progression, stockage, contrôle, rendu et audio. La logique économique et les conditions d’ouverture doivent être testables sans lancer Phaser. Évite à la fois le fichier unique géant et une usine à abstractions.

Sauvegarde versionnée : stocks, livraisons, niveaux, régions ouvertes, réglages et identifiants de transactions. Valide les données, conserve une dernière copie valide et traite les erreurs de stockage sans crash ni effacement silencieux. Ne stocke aucun secret. Aucun backend nécessaire.

Un panneau développeur local non public peut permettre ajout de pierre, accélération du temps, inspection de sauvegarde et remise à zéro explicite. Jamais de crédit automatique au lancement, jamais de reset systématique.

## 8. Vérification et restitution

Écris les tests utiles sur : dépassement de soute, conservation des tonnes, dépôt unique, achats atomiques, compteur livré distinct, double condition de transition, perte de la seule cargaison non déposée et rechargement sans duplication. Exécute compilation et tests. Corrige les erreurs avant de terminer.

Teste si possible une sortie en navigateur à 390 × 844, 360 × 800 et sur ordinateur. Vérifie joystick, mise à l’échelle, pause, son, minage et retour. N’affirme pas un test sur téléphone réel si tu n’as utilisé qu’une émulation. Si un outil ou le réseau manque, documente le blocage précis et poursuis le travail possible ; ne simule pas une vérification réussie.

Mets à jour README.md avec installation, lancement, commandes et limitations ; crée un fichier de suivi résumant lot terminé, fichiers importants et prochain lot. Ne pars pas réaliser le lot 2 automatiquement.

À la fin, donne un compte rendu court : ce qui est jouable, commandes de lancement, vérifications réellement exécutées, limites et prochaine étape. L’objectif prioritaire est de pouvoir lancer le jeu, ramasser, miner, déposer, améliorer et ouvrir la région suivante, avec un pilotage déjà agréable.
