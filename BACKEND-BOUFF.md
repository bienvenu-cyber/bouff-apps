# Le serveur de BOUFF — ce qu'il faut savoir

## 1. Ce que dit la documentation du code récupéré

Le README du projet d'origine est clair (ligne 59 et ligne 229) :

> « The frontend source code for our solution is completely open source.
> However, the API and backend is proprietary and can be accessed via a paid
> license. »

Traduction : **les 6 applications sont libres, mais le serveur ne l'est pas.**
Il s'appelle `enatega-multivendor-api`, il est vendu séparément, et il n'est
pas dans le dépôt. Les applications s'attendent à le trouver à côté
(`cd ../enatega-multivendor-api`), ce dossier n'existe pas.

Il n'existe donc **aucune documentation pour construire le serveur** : la doc
disponible explique seulement comment brancher les applications sur un serveur
déjà existant (adresses, clés Google/Firebase, mode mono/multi-vendeurs — voir
`VENDOR_MODE_CONFIGURATION.md`).

## 2. Une seule base de données, pas quatre

Les 4 interfaces (client, cuisine, livreur, admin) ne sont que des écrans.
Elles tapent toutes sur **le même serveur et la même base de données** :

```
Client (web + mobile) ┐
Cuisine / boutique    ├──► un seul serveur (API) ──► une seule base de données
Livreur               │
Super Admin           ┘
```

C'est ce qui permet qu'une commande passée par un étudiant apparaisse
instantanément en cuisine, puis chez le livreur, puis dans les statistiques
admin. Séparer les bases casserait tout ça.

Le multi-vendeurs ne change pas ce principe : chaque restaurant est simplement
une **ligne** dans la base (avec son menu, ses horaires, sa commission, ses
livreurs). BOUFF est le premier restaurant ; en ajouter d'autres plus tard, ce
n'est qu'ajouter des lignes, pas une nouvelle base.

## 3. Les trois chemins possibles

### A. Acheter la licence du serveur Enatega
- Avantage : les 6 applications fonctionnent quasi immédiatement, elles sont
  déjà écrites pour ce serveur précis.
- Inconvénients : coût récurrent, code du serveur non modifiable librement,
  dépendance à un éditeur externe.

### B. Écrire notre propre serveur, en copiant exactement le langage attendu
Les applications parlent au serveur dans un langage très précis (GraphQL) avec
des centaines de requêtes déjà figées dans le code. On peut recréer un serveur
qui répond exactement pareil.
- Avantage : on garde les 4 applications existantes, tout est à nous.
- Inconvénient : gros chantier (comptes, commandes, paiements, temps réel,
  notifications, zones de livraison, commissions…), plusieurs semaines.

### C. Repartir de l'espace client, avec notre propre serveur moderne
On construit d'abord le site client BOUFF (carte, panier, commande, WhatsApp)
sur une base de données intégrée, puis on ajoute la cuisine, le livreur et
l'admin au même endroit. Les applications mobiles Enatega peuvent être
rebranchées plus tard, ou refaites.
- Avantage : quelque chose de réellement utilisable en quelques jours,
  100 % à nous, sans licence.
- Inconvénient : on n'utilise pas tout de suite les applications mobiles
  existantes.

## 4. Recommandation

Le chemin **C** pour ouvrir BOUFF vite et sans licence : base de données
intégrée, structure multi-restaurants dès le départ (restaurants, menus,
formules, commandes, livreurs, commissions), et les 4 espaces ajoutés l'un
après l'autre. Si à un moment l'objectif devient « lancer les apps mobiles
Enatega telles quelles », alors le chemin A (licence) devient le plus rapide.

## 5. Ce qu'il faudra dans tous les cas

- Un compte Google Maps (adresses et carte de Parakou)
- Un compte pour les notifications (alerte cuisine et livreur)
- Un numéro WhatsApp Business pour la confirmation des commandes
- Les comptes Google/Firebase actuels appartiennent à Enatega : à remplacer
