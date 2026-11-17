# Flambe Tout

Party game multijoueur : chaque client reçoit un budget absurde, fait ses achats avant la fermeture du
magasin, les présente lors d’une vente publique, puis tout le monde vote.

Site statique, hébergé sur GitHub Pages. Aucun serveur de jeu : **le navigateur de l’hôte fait office de
serveur** et les invités s’y connectent en pair-à-pair (WebRTC).

## Jouer

1. L’hôte ouvre le site, entre son nom et clique **Créer le salon**. Il garde cet onglet ouvert pendant toute
   la partie (idéalement sur un ordinateur ou une TV).
2. Les autres ouvrent le lien d’invitation (ou tapent le code à 4 lettres).
3. L’hôte remplit le **bon de commande** : budget, durée, critères de vote, primes automatiques.
4. **Le magasin ouvre** : chacun ajoute des articles (nom, prix, lien, justification, image par fichier,
   glisser-déposer ou Ctrl+V). Le ticket de caisse se met à jour en direct.
5. **Vente publique** : les achats sont révélés un par un, en alternant les clients. L’hôte tient le marteau
   (boutons, ou flèches du clavier / espace).
6. **Scrutins** : un vote par critère. Le mode est choisi automatiquement :
   - 3 clients ou plus : vote secret, pas de vote pour soi, égalité = point partagé ;
   - 2 clients + spectateurs : seul le jury de spectateurs vote ;
   - 2 clients seuls : « revendique ou concède » (+ prime fair-play).
7. **Palmarès**, puis « Nouvelle partie » ou « Fermer et tout effacer ».

## Confidentialité

- Aucune base de données, aucun stockage serveur. Toute la partie vit dans la mémoire de l’onglet de l’hôte.
- Les images sont recompressées dans le navigateur (métadonnées EXIF/GPS supprimées), envoyées en binaire,
  montrées aux autres uniquement une fois révélées, et leurs octets sont écrasés (`fill(0)`) dès qu’un article
  est retiré, qu’une manche recommence ou que le salon ferme.
- Les votes ne stockent qu’un compteur par joueur : le lien « qui a voté pour qui » n’existe jamais en mémoire.
- Le service public [PeerJS](https://peerjs.com) sert uniquement à mettre les navigateurs en relation
  (échange d’adresses réseau). Les données de jeu passent directement entre navigateurs, chiffrées (DTLS).
  Si un réseau bloque la connexion directe, un relais TURN transmet le flux, toujours chiffré.
- Si l’hôte ferme ou recharge son onglet, la partie disparaît (c’est voulu).

## Développement

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests du moteur de jeu (vitest)
npm run build      # site statique dans client/dist
```

Structure :

- `shared/` — types du protocole, règles, formatage des montants
- `client/src/engine/` — moteur de jeu (le « serveur » exécuté chez l’hôte)
- `client/src/net/` — réseau pair-à-pair (PeerJS) et session
- `client/src/screens/` — écrans (accueil, salle d’attente, bon de commande, magasin, vente, scrutin, palmarès)

## Déploiement sur GitHub Pages

Le workflow `.github/workflows/deploy.yml` vérifie, teste, construit et publie le site à chaque push sur `main`.
Une seule fois, dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
Le site est ensuite servi à l’adresse `https://<utilisateur>.github.io/<dépôt>/`.
