# Audit du code — 23/09/2026

Périmètre : les 6 applications présentes dans le dépôt (site web client, app client
mobile, app livreur, app boutique/cuisine, 2 back-offices admin).

## Résumé

Le dépôt est aujourd'hui la base Enatega quasi intacte : aucune trace de la marque
BOUFF (0 occurrence dans tout le code), et le serveur (l'API qui contient les
commandes, les comptes et les paiements) ne fait pas partie du dépôt. Le code est
riche et fonctionnel, mais il pointe encore vers les serveurs de démonstration
d'Enatega. C'est le point à régler avant tout travail de marque ou de menu.

## Bloquants

1. **Aucun serveur à vous.** Le code appelle
   `aws-server-v2.enatega.com`, `backup-server.enatega.com` et une adresse de démo
   Railway, écrites en dur dans `enatega-multivendor-rider/environment.ts`. Sans
   votre propre serveur, aucune commande BOUFF ne peut être enregistrée.
2. **Marque absente.** Rien n'est encore aux couleurs BOUFF (nom, slogan, ambiance
   sombre/orange, menu, prix en FCFA). Tout l'habillage reste Enatega.
3. **Comptes Firebase/Google d'Enatega.** Les fichiers de configuration
   (`google-services.json`, `public/firebase-messaging-sw.js`, clés `AIza...`)
   appartiennent aux projets Enatega : les notifications et les cartes doivent
   être basculées sur vos propres comptes.

## Sécurité

4. **Sessions stockées dans le navigateur** (`localStorage`) pour le site et les
   back-offices : un script malveillant injecté dans une page pourrait voler la
   session d'un administrateur. À migrer vers des cookies sécurisés.
5. **Droits d'accès vérifiés seulement côté navigateur** : le rôle (`ADMIN`,
   `VENDOR`, `RESTAURANT`, `STAFF`) est lu depuis le navigateur pour afficher ou
   masquer les menus. Le serveur doit revérifier chaque droit, sinon un
   utilisateur peut accéder à des écrans qui ne lui sont pas destinés.

## Qualité / maintenance

6. **Fichier généré commité** : `enatega-multivendor-web/public/sw.js` est un
   build de développement versionné (il contient du code de rechargement à chaud).
   Risque de comportement cassé en production ; à régénérer et à exclure du dépôt.
7. **Deux back-offices quasi identiques** (`enatega-multivendor-admin` et
   `enatega-singlevendor-admin`) : chaque correction doit être faite deux fois.
   Pour BOUFF, un seul back-office suffit.
8. **Versions incohérentes** : le site web est en Next 16 / React 19, les
   back-offices en Next 14 / React 18.
9. **Bruit de développement** : traces `console.log` dans ~173 fichiers,
   11 `TODO/FIXME`, typage relâché (`noImplicitAny: false` sur le site web).
10. **Presque aucun test automatisé** et pas de vérification automatique de
    compilation à chaque modification : les régressions passent inaperçues.
11. **Fichier `.codex/hooks.json`** référence un chemin personnel d'une autre
    machine (`/Users/muhammadali/...`) : inutile ici.

## Ordre de travail recommandé

1. Mettre en service votre serveur (API) et vos comptes Firebase/Google, puis
   remplacer toutes les adresses de démo par des variables d'environnement.
2. Habiller BOUFF : identité, menu réel, prix FCFA, slogan, espace client.
3. Sécuriser : sessions en cookies, contrôle des rôles côté serveur.
4. Nettoyer : un seul back-office, suppression des fichiers générés, logs,
   alignement des versions.
