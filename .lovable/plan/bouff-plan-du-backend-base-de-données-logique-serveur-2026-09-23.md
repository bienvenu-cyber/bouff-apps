# BOUFF — Plan du backend (base de données + logique serveur)

## Recommandation

Construire notre propre backend sur Lovable Cloud plutôt que de reconstruire l'API Enatega.
Raisons :

- Le serveur d'Enatega n'est pas dans le dépôt et reste sous licence payante : impossible à reprendre, coûteux à imiter à l'identique.
- Lovable Cloud fournit d'un coup la base de données, les comptes utilisateurs, le stockage des images et le code serveur, sans compte externe à ouvrir.
- Tout reste récupérable sur GitHub : la structure de la base est écrite dans des fichiers du projet, donc reproductible sur votre machine.

Conséquence assumée : l'espace client est reconstruit aux couleurs BOUFF dans le projet Lovable (le site Enatega actuel sert de référence visuelle et fonctionnelle, pas de base de code). Les 3 autres espaces (cuisine, livreur, admin) sont construits ensuite sur la même base.

## Ce que la base contiendra (multi-restaurants dès le premier jour)

Une seule base, une seule logique, BOUFF n'étant que le premier restaurant enregistré.

- **Restaurants** : nom, logo, couleurs, zone, horaires, taux de commission, actif/inactif.
- **Catégories** et **articles** : rattachés à un restaurant, prix de base en FCFA, photo, disponible/rupture.
- **Formules** : Seul / + Frites / Combo, avec le prix propre à chaque article (ex. Classique 1500 / 2000 / 2500).
- **Options** : choix de boisson du combo, suppléments, sauces.
- **Commandes** : numéro, restaurant, client, emporter ou livraison, adresse, mode de paiement, total, statut (reçue → en cuisine → prête → en route → livrée / annulée), horodatage de chaque étape.
- **Lignes de commande** : article, formule choisie, options, quantité, prix figé au moment de la commande.
- **Livreurs** : rattachés à BOUFF ou à un restaurant partenaire, disponible/en course, courses affectées.
- **Zones de livraison Parakou** : Feu Alhouda, Marché Guéma, Carrefour 3 Banques, Banikanni, avec frais par zone.
- **Rôles** : client, cuisine, livreur, admin restaurant, super admin — dans une table dédiée, jamais dans le profil.
- **Statistiques** : ventes par jour, par restaurant, par article, commissions dues.

## Règles d'accès (sécurité)

Chaque table est verrouillée côté base, pas côté navigateur :

- un client ne voit que ses propres commandes ;
- la cuisine ne voit que les commandes de son restaurant ;
- un livreur ne voit que les courses qui lui sont affectées, plus les courses libres de sa zone ;
- un admin restaurant ne touche qu'à son restaurant ;
- seul le super admin voit la plateforme entière ;
- la carte et les prix sont lisibles publiquement (il faut bien commander sans compte).

C'est ce qui corrige le défaut relevé dans l'audit Enatega (rôles contrôlés uniquement dans le navigateur).

## Logique serveur à écrire

- **Créer une commande** : le prix est recalculé côté serveur à partir de la carte, jamais accepté depuis le téléphone du client (sinon on peut commander à 1 F).
- **Frais de livraison** : calculés selon la zone choisie.
- **Numéro de commande** lisible (ex. BF-0241).
- **Envoi WhatsApp** : message récapitulatif au restaurant et confirmation au client, via WhatsApp Business.
- **Changement de statut** : réservé à la cuisine et au livreur de la commande.
- **Affectation de course** : un livreur prend une course libre, sans doublon possible.
- **Rupture de stock** : la cuisine coupe un article, il disparaît de la carte en direct.
- **Commissions** : calcul par restaurant et par période pour le super admin.
- **Temps réel** : la cuisine, le livreur et le client voient les changements sans rafraîchir la page.

## Ordre de construction

1. Base de données + rôles + règles d'accès, avec la carte BOUFF complète (3 piliers, formules, boissons, loaded fries) déjà enregistrée.
2. Espace client BOUFF : carte, fiche article avec formule et boisson, panier, emporter/livraison, validation et envoi WhatsApp.
3. Espace cuisine : commandes en temps réel, statuts, ruptures.
4. Espace livreur : courses disponibles, prise en charge, contact client, remise validée.
5. Super admin : restaurants, carte, livreurs, commissions, statistiques.
6. Comptes : téléphone ou e-mail pour le client, comptes créés par l'admin pour cuisine et livreurs.
7. « Le Repas du Monde » : article spécial programmable chaque samedi.

## Détails techniques

- Base PostgreSQL Lovable Cloud, sécurité par RLS sur toutes les tables, rôles dans `user_roles` + fonction `has_role` (security definer) pour éviter toute escalade de privilèges.
- Prix stockés en entiers (FCFA, pas de centimes).
- Écritures sensibles (création de commande, changement de statut, affectation livreur, commissions) via des fonctions serveur `createServerFn`, validation Zod, jamais en écriture directe depuis le client.
- Envoi WhatsApp via la Cloud API Meta, jeton stocké en secret côté serveur.
- Temps réel via Supabase Realtime sur `orders` et `order_items`.
- Migrations SQL versionnées dans le dépôt → `git pull` puis rejouables localement.
- Le monorepo Enatega reste dans le dépôt comme référence tant que les espaces correspondants ne sont pas réécrits.

## À fournir de votre côté (pas bloquant pour démarrer)

- Numéro WhatsApp Business + accès à la Cloud API Meta.
- Frais de livraison par zone.
- Photos des produits et logo BOUFF définitif.
