# basker — Portage du « Trésor des Baskerville »

Projet de portage du jeu d'aventure textuelle **Le Trésor des Baskerville**
(© CHIP 1987, André Rocques / Paul Duplierto), publié à l'origine sur
ordinateur **Thomson TO8**.

Documentation d'époque (éléments textuels) :
<http://dcmoto.free.fr/programmes/le-tresor-des-baskerville/le-tresor-des-baskerville_doc.txt>

## Organisation du dépôt

```
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
