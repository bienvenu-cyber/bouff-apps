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


## Étape 2 — Commande client
- [x] Écran de commande BOUFF (`/bouff`) : carte en direct, formules, boissons et sauces, panier, emporter/livraison, zones et frais, validation
- [x] Total, frais de livraison et commission recalculés côté base (impossible de commander à un prix modifié)
- [x] Suivi de commande sans compte (`/bouff/suivi`) avec numéro + téléphone
- [ ] Logo BOUFF (couronne dans le « O »), photos des produits, typographie au pinceau

## Étape 3 — Cuisine
- [x] Écran cuisine (`/bouff/cuisine`) : commandes en temps réel, reçue → en cuisine → prête, annulation avec motif, ruptures de stock
- [ ] Créer les comptes de l'équipe cuisine

## Étape 4 — Livreurs
- [x] Écran livreur (`/bouff/livreur`) : disponibilité, courses libres, prise en charge sans doublon, en route, remise validée
- [ ] Créer les comptes livreurs

## Étape 5 — Super admin
- [x] Statistiques disponibles côté base (ventes, commandes, panier moyen, commissions, meilleurs articles, par restaurant et plateforme)
- [ ] Écran back-office (restaurants, carte, livreurs, commissions, statistiques)

## À faire plus tard
- [ ] Notifications WhatsApp (Cloud API Meta) au restaurant et au client
- [ ] Notifications SMS
- [ ] Notifications e-mail
- [ ] (Pour l'instant : messages toast dans l'application)

## Ancienne vitrine Enatega (référence)
- [x] Ambiance sombre + orange néon, nom et slogan dans le titre du site
- [ ] Logo BOUFF (couronne dans le « O »), textes d'accueil et typographie au pinceau
- [ ] Identité (reste) : slogan « Bonne bouffe. Bon prix. Bon mood. », ambiance sombre + orange néon
- [ ] Menu réel : smash burgers, shawarma/kebab, Pop's Chicken, loaded fries, boissons
- [ ] Prix en FCFA, options sur place / à emporter / livraison
- [ ] Panier et passage de commande

## Nettoyage Enatega
- [ ] Sessions en cookies sécurisés au lieu du stockage navigateur
- [ ] Contrôle des rôles validé côté serveur
- [ ] Suppression des fichiers générés commités, des traces de débogage, alignement des versions
