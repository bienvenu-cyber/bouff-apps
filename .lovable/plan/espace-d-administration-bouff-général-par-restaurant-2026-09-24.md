# Espace d'administration BOUFF (général + par restaurant)

## Point de départ
- L'admin d'origine (`enatega-multivendor-admin`) contient déjà les deux espaces, dans le même code :
  - Admin général (super-admin) : restaurants, villes/zones, livreurs, équipe, clients, commandes, codes promo, commissions, statistiques.
  - Admin restaurant (« store ») : tableau de bord, commandes, carte (catégories, plats, options), horaires, adresse/position, codes promo du restaurant, gains.
- 52 écrans au total. On garde les écrans d'origine, on les branche sur la base BOUFF, sans créer de nouvelle app.
- Écrans sans équivalent BOUFF (portefeuilles/retraits, bannières, types de boutique, pourboires, langues, audit, support, « vendeurs ») : masqués du menu pour l'instant.

## Étapes
1. Connexion : e-mail + mot de passe sur la base BOUFF. Le rôle décide de l'espace : admin général → espace général, admin restaurant → son restaurant uniquement. Les autres comptes sont refusés.
2. Passerelle de données (même méthode que le site et les apps) : l'admin continue de « parler Enatega », les réponses viennent de la base BOUFF. Prix en FCFA, textes en français par défaut.
3. Admin restaurant : commandes en direct (accepter, statuts, annuler), carte complète avec variantes/options et disponibilité, horaires 11 h–2 h + fermeture d'un clic, minimum de commande, zones et frais (min 500 F), position sur carte, codes promo, statistiques.
4. Admin général : restaurants (créer, activer, commission), villes et quartiers, livreurs et équipe (inviter cuisine / livreur / gérant avec rôle), clients, toutes les commandes, codes promo globaux, statistiques plateforme.
5. Photos : envoi des images des plats et logos vers le stockage de la base.
6. Branding BOUFF : noir mat + orange, logo, polices, via `packages/bouff-theme` (sombre par défaut).
7. Vérification : compilation, puis parcours avec un compte admin général et un compte admin restaurant de test.

## Détails techniques
- Nouvelles fonctions serveur sécurisées côté base pour les actions du personnel : invitation (création de compte + rôle), gestion des rôles, envoi d'images. Toutes vérifient le rôle (`super_admin` ou `restaurant_admin` du bon restaurant).
- Stockage : un espace public pour les images, écriture réservée aux admins.
- Publication : sur Vercel comme le site (dossier `enatega-multivendor-admin`, fichiers hors du dossier inclus).

## Ce que vous aurez à faire
- Me donner l'e-mail qui sera l'admin général.
- Publier le dossier sur Vercel et tester.
