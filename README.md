# basker — Portage web du « Trésor des Baskerville »

Portage web du jeu d'aventure textuelle **Le Trésor des Baskerville**
(© CHIP 1987, André Rocques / Paul Duplierto), publié à l'origine sur
ordinateur **Thomson TO8**.

**Les dessins vectoriels sont ceux d'origine** : le moteur graphique 6809 du
jeu (`PLAN7.BIN` + `MOCH7.BIN`) est émulé dans le navigateur, et la logique
du jeu (`LOCH7.BAS`) ainsi que l'intro (`JEU.BAS`) sont portées ligne à
ligne en JavaScript.

## Jouer

```sh
cd web && python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Un serveur HTTP est nécessaire : la page charge les binaires originaux.)
Le dépôt contient aussi un workflow GitHub Pages
(`.github/workflows/pages.yml`) : activez Pages avec la source
« GitHub Actions » dans les réglages du dépôt pour publier `web/` en ligne
à chaque poussée sur `main`.

Commandes : tapez les **3 premières lettres** de chaque mot (le jeu
complète), **Entrée** valide, **Retour arrière** efface le dernier mot, les
**flèches** déplacent, **Échap** passe l'intro.

Documentation d'époque (éléments textuels) :
<http://dcmoto.free.fr/programmes/le-tresor-des-baskerville/le-tresor-des-baskerville_doc.txt>

## Organisation du dépôt

```
web/
  index.html                         Le jeu (ES modules, aucune dépendance)
  plan.html                          Plan des 40 lieux et de leurs liaisons
  soluce.html                        Soluce complète (fins, étapes, télégramme)
  js/emu6809.js                      Émulateur 6809 (moteur graphique original)
  js/to8.js                          Écran TO8 (banques forme/couleur, texte 40 col)
  js/pictures.js                     Chargement des binaires + EXECJ/EXECK
  js/audio.js                        Interpréteur PLAY Thomson (Web Audio)
  js/game.js                         Portage de LOCH7.BAS (logique du jeu)
  js/intro.js                        Portage de JEU.BAS (générique, explications)
  data/                              Binaires originaux + tables décodées
source-fd/
  le-tresor-des-baskerville_to8.fd   Image disquette originale (source de vérité)
  *.BAS, *.BAT                       Sources BASIC décodées (lisibles)
  *.BIN, *.DCL                       ⚠ extractions corrompues (détokenisées à tort)
  extracted/                         Extractions binaires correctes (via tools/extract_fd.py)
tools/
  extract_fd.py                      Extraction de l'image .fd + décodage des tables du jeu
data/
  game-data.json                     Tables du jeu décodées : carte des 40 lieux,
                                     objets, vocabulaire (généré, commité pour référence)
docs/
  ANALYSE.md                         Analyse complète du moteur original
```

## Extraction / régénération des données

```sh
python3 tools/extract_fd.py source-fd/le-tresor-des-baskerville_to8.fd source-fd/extracted
```

Le script parse le format disquette Thomson (FAT + catalogue piste 20),
extrait les fichiers, applique le décodage XOR `$D7` effectué à l'origine par
`EXEC&HA5F2` (voir `docs/ANALYSE.md` §1), et produit `data/game-data.json`.

## Points clés du jeu original

- Moteur en BASIC 512 (`LOCH7.BAS`), dessins vectoriels tracés par une
  routine 6809 (`PLAN7.BIN` + `MOCH7.BIN`) ;
- Saisie des ordres sur les **3 premières lettres**, complétion automatique ;
  déplacements aux 4 flèches ;
- 40 lieux, 20 objets manipulables, 33 verbes, 35 noms ;
- Progression scénarisée par la variable `D1` (0 → 6), plusieurs morts
  possibles et un télégramme-bilan en fin de partie.
