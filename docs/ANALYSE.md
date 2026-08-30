# Le Trésor des Baskerville — Analyse des sources originales (Thomson TO8)

Jeu d'aventure textuelle avec dessins vectoriels, © CHIP 1987.
Réalisation : André Rocques — Dessins : Paul Duplierto.

Référence : la documentation d'époque est disponible sur
<http://dcmoto.free.fr/programmes/le-tresor-des-baskerville/le-tresor-des-baskerville_doc.txt>.

## 1. Contenu de la disquette

L'image `source-fd/le-tresor-des-baskerville_to8.fd` est au format Thomson
simple face : 80 pistes × 16 secteurs × 256 octets. La piste 20 contient la
FAT (secteur 2) et le catalogue (secteurs 3-16). `tools/extract_fd.py`
extrait tout et décode les tables de jeu.

| Fichier | Type | Adresse | Rôle |
|---|---|---|---|
| `AUTO.BAT` | BASIC | — | Programme de démarrage (identique à `JEU.BAS`) |
| `JEU.BAS` | BASIC | — | Intro : explications, générique animé (le cocher), puis chargement du jeu |
| `LOCH7.BAS` | BASIC | — | **Le moteur du jeu complet** (analyse des ordres, logique, textes) |
| `PLAN7.BIN` | binaire | `$A5F2`–`$B484` | Routines machine 6809 (affichage des dessins) + tables du jeu, **XORées avec `$D7`** |
| `MOCH7.BIN` | binaire | `$B275`–`$DFFF` | Données vectorielles des dessins (chargé après le décodage XOR, écrase la fin de PLAN7) |
| `TOCH7.BIN` | binaire | `$5F40`–`$5FEA` | Tables de données du jeu (objets, vocabulaire) en RAM vidéo |
| `DEPI7.DCL` | binaire | `$D010`–`$DFFF` | Données des dessins de l'intro uniquement |
| `PLAN.BIN` | binaire | `$A5C8`–`$B483` | Variante plus ancienne de PLAN7, non utilisée par `AUTO.BAT` |

> **Attention** : les fichiers `.BIN`/`.DCL` à la racine de `source-fd/` ont été
> détokenisés à tort comme du BASIC lors d'une extraction précédente et sont
> corrompus. Les extractions correctes sont dans `source-fd/extracted/`.

### Obfuscation des données

`JEU.BAS` ligne 1 fait `LOADM"PLAN7.BIN":EXEC&HA5F2`. Le code en `$A5F2`
configure l'affichage puis décode les données en place :

```
LDX  #$A637      ; début des tables
loop: LDA ,X
EORA #$D7        ; clé XOR
STA  ,X
LEAX 1,X
CMPX #$B484      ; fin (exclue)
BNE  loop
RTS
```

Tout ce qui se trouve entre `$A637` et `$B483` (table des images par lieu,
table des déplacements, début des données de dessin) est donc XORé avec `$D7`
sur la disquette. `PLAN.BIN` (variante non utilisée) lit sa clé XOR en RAM
`$7D50` — vraisemblablement un reste de protection anti-copie ; `PLAN7.BIN`
est la version avec la clé en dur.

## 2. Séquence de chargement

1. `AUTO.BAT`/`JEU.BAS` : `CLEAR900,&HA5C8` ; charge `PLAN7.BIN`, `EXEC&HA5F2`
   (décodage XOR), charge `DEPI7.DCL` ; joue l'intro.
2. Ligne 25 : `CLEAR3000,&HA5C8` ; charge `TOCH7.BIN` (en RAM vidéo, d'où le
   `POKE&HE7C3,PEEK(&HE7C3) OR 1` avant chaque accès), `MOCH7.BIN`, puis
   `LOAD"LOCH7",R`.
3. `LOCH7.BAS` ligne 110 : lit les tables de `TOCH7.BIN` en `PEEK`, lit le
   vocabulaire dans ses lignes `DATA`, et démarre au lieu 24 (la lande).

Routines machine utilisées par le BASIC :

| Adresse | Variable | Rôle |
|---|---|---|
| `$AC9F` | `J` (=-21345) | Dessine l'image dont le numéro est POKEé en `$A749` (`S`) |
| `$ACB4` | `K` (=-21324) | Pas d'animation / attente synchronisée |
| `$A749` | `S` | Numéro d'image à dessiner (`POKES,A:EXECJ`) |

## 3. Cartographie mémoire des tables (lues par `PEEK` dans LOCH7)

Dans `TOCH7.BIN` (`$5F40` = 24384) :

| Adresse | Table BASIC | Contenu |
|---|---|---|
| `24382+2*A` (A=1..21) | `H(A)` | Index du 1er **verbe** commençant par la lettre A..U |
| `24383+2*A` (A=1..21) | `G(A)` | Index du 1er **nom** commençant par la lettre A..U |
| `24426..24445` | — | Genre des 20 objets (1 = « un », sinon « une ») |
| `24446..24465` | `L(A)` | Lieu initial des 20 objets (0 = pas encore en jeu) |
| `24466..24500` | `N(F)` | Nom F (1-35) → numéro d'objet (0 = décor) |
| `24501..24520` | — | Objet A → index de son nom dans `T()` |
| `24521..24553` | — | Verbe B : 1 = s'emploie sans complément |

Dans `PLAN7.BIN` après décodage XOR :

| Adresse | Contenu |
|---|---|
| `42550+P` (P=1..40) | Numéro du dessin du lieu P |
| `42591+4*(P-1)+B` | Table des déplacements : B = 0 haut, 1 bas, 2 droite, 3 gauche |

(Les flèches renvoient les codes clavier 8=←, 9=→, 10=↓, 11=↑ ;
LOCH7 calcule `B=45-code` puis `B-34` → index 0..3.)

Valeurs de la table des déplacements (`F`) :

- `1..40` : lieu de destination ;
- `0` : mur (« Bing!Dans le mur! ») ;
- `41` : « L'eau du lac est trop froide! » ;
- `42` : proposition d'abandon (« VEUX-TU REVENIR EN FRANCE... ») ;
- `43` : « La porte est fermée » ;
- `44` : noyade dans les marais (« GLUPS », mort) ;
- `61..64` : destination `F-50`, conditionnelle — 12 exige la bibliothèque
  actionnée (`N(3)=1`), 13 le panneau ouvert (`N(5)=1`), 14 la trappe ouverte
  (`N(4)=1`), sinon mur ;
- `65` : « BING!AIE!Tu n'y voit rien! » ;
- `99` : retour au lieu précédent (`O`).

Cas particuliers (ligne 655) : la destination 18 (chez les Vandeleur) est
fermée si `D1`∈{1,2} ; la 17 (presbytère) est fermée si `D1<2`. Les lieux
14 et 15 exigent le chandelier allumé (`C(4)=2`), sinon on avance dans le
noir.

L'intégralité des tables décodées est dans **`data/game-data.json`**
(régénérable avec `python3 tools/extract_fd.py`).

## 4. Le moteur de jeu (LOCH7.BAS)

### Variables principales

| Variable | Rôle |
|---|---|
| `P` | Lieu courant (1-40) ; `O` = lieu précédent |
| `B` | Verbe saisi (1-33), `F` = nom saisi (1-35) |
| `T(1..35)` | Libellés des noms ; `X(1..33)` : libellés des verbes |
| `N(F)` | Nom → objet (1-20), 0 pour les mots de décor ; sert aussi d'état pour certains mécanismes (voir ci-dessous) |
| `L(obj)` | Lieu où se trouve l'objet |
| `C(obj)` | État de l'objet (voir ci-dessous) |
| `D1` | Avancement du scénario |
| `W` | Nom du lieu affiché entre `* ... *` |

États `C(obj)` :

- `0` : présent mais pas encore révélé (intégré au décor) ;
- `1` : visible, listé par « TU REMARQUES » ;
- `2` : état spécial — porté sur soi (kilt, toison), allumé (chandelier),
  déchargé (fusil), attaché (chien) selon l'objet ;
- `3` : autre état spécial (chandelier décroché, chien libre...) ;
- `8` : détruit / sorti du jeu ;
- `9` : dans l'inventaire.

Progression `D1` :

- `0` : début de partie ;
- `1` : a rencontré les Vandeleur (reçoit l'appeau) ;
- `2` : a parlé au révérend Mac Mitchum à la chapelle / donné le coq au chien ;
- `3` : a ouvert le cercueil (vide → lettre chez les Vandeleur) ;
- `4` : a délivré l'oncle Alexander dans le souterrain ;
- `5` : a lu le message de Murdock (rendez-vous à l'embarcadère) ;
- `6` : fin victorieuse (a payé Murdock avec la fausse couronne ou le trésor).

### Mécanismes portés par `N()` (indices non-objets)

`N()` sert aussi de drapeaux d'état : `N(3)` bibliothèque pivotée (salon),
`N(4)` trappe de la salle des trophées, `N(5)` panneau de la chambre
d'Alexander, `N(8)` coffre-fort du sous-sol (0 caché / 1 découvert /
2 ouvert), `N(12)` cercueil ouvert, `N(16)` chenet actionné, `N(17)` tiroir
du presbytère, `N(21)` coffre de la chambre de Charles-Edouard, `N(32)`
pasteur déjà rencontré, `N(33)` tiroir.

### Boucle principale

1. Ligne 121 : invite « QUE FAITES-VOUS, MISTER ? » ;
2. Lignes 123-170 : saisie lettre à lettre ; au bout de 3 lettres, recherche
   dans `X()` (verbe) puis `T()` (nom) via les index alphabétiques `H()`/`G()`;
   complétion automatique du mot reconnu, effacement sinon ;
3. Flèches (codes 8-11) → déplacement via la table (`GOSUB 650`) ;
4. `ENTREE` → exécution : contrôles globaux (lignes 202-206 : allumette qui
   se consume, chien affamé au sous-sol, embuscades), puis dispatch
   `ON B GOSUB ...` (ligne 300) vers le gestionnaire du verbe ;
5. Changement de lieu : `GOSUB 1000` — dessine l'image (`PEEK(42550+P)`),
   appelle le sous-programme du lieu (`ON P GOSUB`, ligne 1005) qui affiche
   le nom et déclenche les scènes (Vandeleur, oncle, berger, Murdock...).

### Fins de partie

- Noyade dans les marais (sortie 44) ; tué par le chien Long Silver
  (sous-sol, fusil) ; assommé/tué par Murdock à l'embarcadère sans trésor ;
  mort dans la tombe (« CI-GIT BASKERVILLE JUNIOR ») ;
- Abandon (sortie 42) → télégramme-bilan (ligne 3001) ;
- Victoire : donner la couronne (le toc) ou le trésor à Murdock à
  l'embarcadère (`D1=6`), télégramme final : l'oncle est sauvé.

Le télégramme (lignes 80-84) sert de bilan : décès prouvé ou non, couronne
expertisée, couple Vandeleur emprisonné (dossier), trésor sauvé ou perdu.

## 5. Vocabulaire

**33 verbes** : ACTIONNE, ALLUME, DONNE, DETACHE, DECROCHE, DESCENDS, ETEINS,
ECOUTE, ENTRE, EMMENE, ENFILE, ENLEVE, FAIS SENTIR, FOUILLE, FERME, GRATTE,
INVENTAIRE, JOUE, LIS, LACHE, MONTE, METS, MANGE, OUVRE, PRENDS, POSE,
PARLEMENTE, REGARDE, REMETS, RAME, SORS, SUIS, TIRE.

**35 noms** (20 objets manipulables + décor) : ALLUMETTE, APPEAU, BATEAU,
BIBLIOTHEQUE, BARQUE, CHIEN, CHANDELIER, COFFRE-FORT, CORNEMUSE, COURONNE,
COQ DE BRUYERE, CERCUEIL, CANNE DE GOLF, CLE, CHAUSSURE, CHENET, CORDE,
CRUCIFIX, DOSSIER, DRAPEAU, ENVELOPPE, FUSIL, FANION, GOLF, KILT, LIVRE,
LAMPE, LETTRE, MESSAGE, MOUTON, POMPON, PASTEUR, TIROIR, TRESOR, TOISON.

La saisie ne compare que les **3 premières lettres** de chaque mot.

## 6. La carte (40 lieux)

Voir `data/game-data.json` pour la table exacte. En résumé :

- **1-11** : le manoir des Baskerville (hall, étage, couloir, cuisine, salon,
  salle des trophées, sous-sol, chambres) ;
- **12-16** : le passage secret (salon ↔ chambre d'Alexander ↔ salle des
  trophées → geôle de l'oncle → sortie vers le square) ;
- **17-22** : presbytère, maison des Vandeleur, marais de Grimpen, chapelle,
  cimetière, église St Patrick ;
- **23-32** : la lande, les abords du manoir, le square, le terrain de golf ;
- **33-40** : le Loch Ness, les petites maisons de la prairie (Vandeleur,
  berger), l'embarcadère, les rives du lac.

## 7. Le moteur graphique (PLAN7.BIN + MOCH7.BIN)

Les dessins sont des **flux d'opcodes** interprétés par le code 6809 de
PLAN7.BIN. Entrées : `J=$AC9F` (EXECJ : initialise l'image n° `PEEK($A749)`
et exécute un pas), `K=$ACB4` (EXECK : un pas d'animation). Le pas courant
tourne jusqu'à un opcode de rendez-vous (`06`/`04`), ce qui permet les
animations rythmées par les boucles `EXECK` du BASIC.

- Table des images : pointeurs 16 bits en `$B279` (indexée par 2×n, +1 octet
  d'en-tête sauté) — fournie par MOCH7.BIN pour le jeu, par PLAN7 lui-même
  pour l'intro (motifs dans DEPI7.DCL).
- Pile d'appels de sous-images : `$A75E` descendant, vide à `$A760`.
- Table des vecteurs d'opcodes : `$A800` (48 opcodes 00-2F).
- Motifs bitmap : table de pointeurs descendante `[$DFFA - 2*i]`, en-tête
  (largeur en octets, hauteur, mode) puis paires (couleur, forme) par cellule.
- Écran : fenêtre `$4000-$5F3F`, deux banques commutées par bit 0 de `$E7C3`
  (0 = couleur, 1 = forme). Octet couleur : forme = bits 0-2 + 7,
  fond = bits 3-6, valeurs encodées matériel (= indice BASIC XOR 8).

Principaux opcodes : 00/01 origine (absolue/relative), 02/03/13 appel de
sous-image (direct/indirect/saut), 04/05/06 retour et rendez-vous
d'animation, 07/08/09 modes OR/XOR/opaque (auto-modification du code !),
0A-0D dessin de motif (option couleur forcée, option fenêtre à fond
sauvegardé), 0E/0F/19/1A idem en miroir, 10 remplissage forme, 11
restauration de fenêtre, 12 effacement, 14-17 sprites repositionnables,
18 effacement à l'ancienne position, 1B/1C tempo, 1D-22 POKE/INC/DEC 8/16
bits (auto-modification des variables moteur), 23/24 boucles, 25/26
descripteurs de fenêtres, 27 vitesse d'animation, 28/29 rectangles de
couleur (fond/forme), 2A/2B point (ROM `$E80F`), 2C/2D segment relatif
8/16 bits (ROM `$E80C`), 2E couleur de tracé (`$6038`) ou gomme
(`$10`/`$11` → bit 4 de `$6019`), 2F page des POKE.

`tools/emu6809.py` + `tools/render_pictures.py` émulent fidèlement ce moteur
(CPU 6809 + vidéo TO8 + traps ROM) et produisent des PNG de contrôle.

### Correction importante : secteurs de 255 octets

Chaque secteur de 256 octets du `.fd` ne contient que **255 octets utiles**
(le dernier octet est réservé par le DOS Thomson). Sans cette correction,
les fichiers extraits contiennent un octet parasite tous les 255 octets.
