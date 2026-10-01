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
- [x] Retirer les adresses de serveurs Enatega écrites en dur (app livreur)


## Étape 2 — Brancher les applications existantes sur la base BOUFF
Aucune nouvelle application ne sera créée. On réutilise les applications déjà présentes dans le dépôt (site web client, app mobile client, app cuisine, app livreur, back-office) et on remplace leur serveur Enatega par notre base BOUFF.
- [x] Couche d'accès commune (connexion à la base + appels de commande) partagée par les applications
- [x] Site web client : carte, formules, panier, emporter/livraison, validation, suivi
- [x] Compte client testé (inscription, connexion, mes commandes)
- [x] Habillage BOUFF : logo, pied de page, site en français par défaut, prix affichés « 1 500 FCFA »
- [x] Paiement Mobile Money pawaPay préparé (à activer avec les clés)
- [x] Notifications WhatsApp (wapiway) et e-mail (Resend) préparées (à activer avec les clés)
- [ ] Photos des plats et logo définitif
- [ ] Mise en ligne du site client sur un hébergement Node
- [x] App mobile client branchée (carte, panier, commande, suivi, chat, adresses) — à tester sur téléphone, branding à faire
- [x] App cuisine branchée : connexion e-mail, commandes en direct, accepter (temps de préparation), prête, remise (emporter), refus, fermeture d'urgence, français par défaut
- [x] App cuisine : onglet « Carte » pour les ruptures (plats et formules), règles testées
- [x] App livreur : disponibilité, courses libres, prise en charge, en route, remise (course test complète OK) — à tester sur téléphone
- [x] Back-office : restaurants, carte, comptes de l'équipe, livreurs, commissions, statistiques branchés — à tester en ligne
- [ ] Retirer les adresses de serveurs Enatega écrites en dur — fait pour livreur et cuisine ; reste app client (à faire avec test sur téléphone)

## Déjà disponible côté base (rien à refaire)
- [x] Prise de commande avec total, frais de zone et commission recalculés côté base
- [x] Suivi de commande sans compte (numéro + téléphone)
- [x] Statuts cuisine et livreur, prise de course sans doublon, ruptures de stock
- [x] Statistiques (ventes, commandes, panier moyen, commissions, meilleurs articles)
- [x] Comptes de l'équipe (cuisine, livreurs) créés par l'admin

## À faire plus tard
- [ ] Notifications WhatsApp (Cloud API Meta) au restaurant et au client
- [ ] Notifications SMS
- [ ] Notifications e-mail
- [ ] (Pour l'instant : messages toast dans l'application)

## Ancienne vitrine Enatega (référence)
- [x] Ambiance sombre + orange néon, nom et slogan dans le titre du site
- [ ] Logo BOUFF (couronne dans le « O »), textes d'accueil et typographie au pinceau
- [ ] Identité (reste) : slogan « Bonne bouffe. Bon prix. Bon mood. », ambiance sombre + orange néon
- [x] Menu réel : smash burgers, shawarma/kebab, Pop's Chicken, loaded fries, boissons
- [x] Prix en FCFA, options sur place / à emporter / livraison
- [x] Panier et passage de commande

## Nettoyage Enatega
- [ ] Sessions en cookies sécurisés au lieu du stockage navigateur
- [x] Contrôle des rôles validé côté serveur
- [ ] Suppression des fichiers générés commités, des traces de débogage, alignement des versions

## Fonctions à compléter (28/09)
- [x] Pourboire livreur
- [x] Commande programmée
- [x] Avis et notes
- [x] Admin : pages Paramètres et Langue
- [x] Admin : bouton Créditer un client (portefeuille, livraisons, points)
- [x] Admin : vrais compteurs annulées / en retard / notes
- [ ] URGENT avant prod : numéro WhatsApp BOUFF
