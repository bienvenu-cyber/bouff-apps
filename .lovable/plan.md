# Brancher le site web client sur la base BOUFF

Aucune nouvelle application, aucun nouvel écran. On garde le site web client déjà dans le dépôt (`enatega-multivendor-web`) et on remplace uniquement sa source de données : à la place du serveur payant d'Enatega, il parle à la base BOUFF.

## Le principe

Le site est déjà prévu pour deux façons de fonctionner : « plusieurs restaurants » et « un seul restaurant ». Le mode « un seul restaurant » correspond exactement à BOUFF aujourd'hui, et il a son propre jeu d'écrans (accueil, carte, fiche produit, panier, commande, suivi, profil, historique). On force ce mode et on lui branche la base BOUFF derrière.

Entre les écrans et la base, on ajoute une couche de traduction : le site continue de poser ses questions habituelles (« donne-moi la carte », « enregistre cette commande », « où en est ma commande »), et cette couche va chercher la réponse dans la base BOUFF au format attendu. Résultat : on ne touche pas aux pages, donc rien ne casse, et la même couche servira ensuite pour l'app mobile client.

## Ce qui sera branché

- Accueil et carte : catégories, articles, mises en avant, prix en FCFA
- Fiche article : formules Seul / + Frites / Combo, boisson du combo, sauces, indisponibilités en direct
- Panier : ajout, modification, quantités, total
- Validation de commande : emporter ou livraison, zone Parakou et frais, espèces ou mobile money, note — total toujours recalculé par la base
- Suivi : reçue → en cuisine → prête → en route → livrée, mise à jour en direct
- Compte client : inscription, connexion, profil, historique de commandes
- Horaires d'ouverture et fermeture du restaurant

## Ce qui sera neutralisé proprement (pas d'écran cassé)

Fonctions Enatega qui n'existent pas chez BOUFF pour le moment : coupons, pourboire, taxes, portefeuille, abonnement, parrainage, bons d'achat, avis, chat avec le livreur, PayPal/Stripe. Ces éléments sont masqués côté écran plutôt que laissés en erreur. On les activera plus tard si vous le souhaitez.

## Nettoyage au passage

- Retirer les adresses de serveurs Enatega écrites en dur
- Retirer les clés de démonstration d'Enatega (Google, Firebase, suivi d'audience)
- Habillage BOUFF sur ces écrans : nom, slogan, noir mat + orange néon

## Mise en ligne — un point à trancher

Ce site a besoin d'un vrai serveur pour fonctionner (il calcule ses pages à la demande). L'hébergement de Lovable ne publie que des fichiers statiques, donc `bouff-web.lovable.app` ne pourra pas servir ce site. Deux options, au choix :

1. Héberger le site sur Vercel ou sur votre serveur (`git pull` puis mise en ligne depuis votre terminal) — la base BOUFF, elle, reste ici et est déjà en ligne.
2. Reconstruire plus tard une vitrine légère publiable ici, en gardant ce site pour la commande.

Le travail décrit ci-dessus est valable dans les deux cas.

## Détails techniques

- Mode forcé via `NEXT_PUBLIC_VENDOR_MODE=SINGLE` + `NEXT_PUBLIC_SINGLE_VENDOR_ENABLED=true`.
- Nouveau lien Apollo local (`lib/bouff-data/`) inséré à la place du `HttpLink` dans `lib/hooks/useSetApollo.tsx` : il intercepte les opérations par nom et les résout via `@supabase/supabase-js` (déjà installé), en renvoyant exactement la forme attendue par le schéma Enatega.
- Opérations couvertes en priorité : `SINGLE_VENDOR_CONFIGURATION`, `SINGLE_VENDOR_CATALOG`, `SINGLE_VENDOR_CATEGORIES`, `SINGLE_VENDOR_CATEGORY`, `SINGLE_VENDOR_PRODUCT`, `SINGLE_VENDOR_SEARCH`, `SINGLE_VENDOR_DISCOVERY`, `SINGLE_VENDOR_CART`/`UPDATE_CART`/`CLEAR_CART` (panier local), `SINGLE_VENDOR_CALCULATE_CHECKOUT`, `SINGLE_VENDOR_PLACE_ORDER` → `place_order`, `SINGLE_VENDOR_ORDER_STATUS`/`ORDER_DETAILS`/`TRACKING` → `track_order`, `SINGLE_VENDOR_ACTIVE_ORDERS`/`PAST_ORDERS`, `SINGLE_VENDOR_PROFILE`, `SINGLE_VENDOR_LOGIN`/`EMAIL_EXISTS`/`PHONE_EXISTS` → auth Lovable Cloud, `SINGLE_VENDOR_SCHEDULE`.
- `SINGLE_VENDOR_TRACKING_UPDATED` (abonnement) résolu via Realtime sur `orders`.
- Opérations non couvertes : réponse vide typée (listes vides, `null`) au lieu d'une erreur, plus masquage des blocs correspondants dans les écrans.
- Prix : entiers FCFA, devise et format forcés dans la configuration renvoyée.
- Tests : un parcours Playwright complet accueil → article → panier → validation → suivi, puis vérification que la commande apparaît bien en base.
