# Feuille de route BOUFF

## Fait
- [x] Audit du code (voir `AUDIT-BOUFF.md`)
- [x] Réintégration des images et icônes exclues du dépôt (le projet compile à nouveau après un `git clone`)
- [x] Aperçu du site client fonctionnel

## Étape 1 — Socle technique
- [x] Base de données BOUFF créée sur Lovable Cloud, structurée multi-restaurants (restaurants, zones, catégories, articles, formules, options, profils, rôles, livreurs, commandes)
- [x] Règles d'accès par rôle vérifiées côté base, fonctions de rôles hors de portée du navigateur
- [x] Carte BOUFF enregistrée (prix FCFA, formules Seul / + Frites / Combo, boissons, sauces)
- [x] Temps réel activé sur les commandes et la disponibilité des articles
- [ ] Prix Pop's Chicken, prix du Repas du Monde, frais réels par zone (en attente)
- [ ] Numéro WhatsApp Business + accès à la Cloud API Meta
- [ ] Créer les comptes Google Maps BOUFF (cartes)
- [ ] Retirer les adresses de serveurs Enatega écrites en dur (app livreur)


## Étape 2 — Vitrine BOUFF (site + app client)
- [x] Ambiance sombre + orange néon, nom et slogan dans le titre du site
- [ ] Logo BOUFF (couronne dans le « O »), textes d'accueil et typographie au pinceau
- [ ] Identité (reste) : slogan « Bonne bouffe. Bon prix. Bon mood. », ambiance sombre + orange néon
- [ ] Menu réel : smash burgers, shawarma/kebab, Pop's Chicken, loaded fries, boissons
- [ ] Prix en FCFA, options sur place / à emporter / livraison
- [ ] Panier et passage de commande

## Étape 3 — Cuisine (app boutique)
- [ ] Réception des commandes en temps réel, statuts, ruptures de stock

## Étape 4 — Livreurs
- [ ] Attribution des courses, adresses, remise de commande, flotte interne + partenaires

## Étape 5 — Back-office
- [ ] Un seul back-office (supprimer le doublon)
- [ ] Restaurants, commissions, livreurs, statistiques

## Étape 6 — Sécurité et nettoyage
- [ ] Sessions en cookies sécurisés au lieu du stockage navigateur
- [ ] Contrôle des rôles validé côté serveur
- [ ] Suppression des fichiers générés commités, des traces de débogage, alignement des versions
