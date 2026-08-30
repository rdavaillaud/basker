#!/usr/bin/env python3
"""Extraction de l'image disquette Thomson (.fd) du Trésor des Baskerville.

L'image est au format standard Thomson simple face :
80 pistes x 16 secteurs x 256 octets = 327680 octets.

La piste 20 est la piste répertoire :
  - secteur 2  : FAT (1 octet par bloc de 8 secteurs)
  - secteurs 3-16 : catalogue (entrées de 32 octets)

Usage :
  python3 tools/extract_fd.py source-fd/le-tresor-des-baskerville_to8.fd out_dir/

Produit :
  - les fichiers du catalogue, extraits octet à octet (BAS tokenisés, BIN bruts)
  - pour chaque .BIN/.DCL, les segments décodés (adresse de chargement, longueur)
  - data/game-data.json : les tables de jeu décodées depuis TOCH7.BIN et
    PLAN7.BIN (carte, objets, vocabulaire) telles que LOCH7.BAS les lit en PEEK.

Note sur l'obfuscation : le code machine de PLAN7.BIN (EXEC &HA5F2, lancé par
JEU.BAS ligne 1) contient une boucle de décodage 6809 :

    LDX  #$A637
  boucle:
    LDA  ,X
    EORA #$D7
    STA  ,X
    LEAX 1,X
    CMPX #$B484
    BNE  boucle

Toutes les données de $A637 à $B483 (table des images, table des déplacements,
données vectorielles des dessins) sont donc XORées avec $D7 sur la disquette.
PLAN.BIN est une variante plus ancienne où la clé XOR est lue en RAM ($7D50,
protection anti-copie) ; elle n'est pas utilisée par AUTO.BAT.
"""
import json
import struct
import sys
from pathlib import Path

SECTOR = 256
SECTORS_PER_TRACK = 16
DIR_TRACK = 20

# Vocabulaire du jeu, lignes DATA 100-104 de LOCH7.BAS.
NOUNS = [
    "ALLUMETTE", "APPEAU", "BATEAU", "BIBLIOTHEQUE", "BARQUE", "CHIEN",
    "CHANDELIER", "COFFRE-FORT", "CORNEMUSE", "COURONNE", "COQ DE BRUYERE",
    "CERCUEIL", "CANNE DE GOLF", "CLE", "CHAUSSURE", "CHENET", "CORDE",
    "CRUCIFIX", "DOSSIER", "DRAPEAU", "ENVELOPPE", "FUSIL", "FANION", "GOLF",
    "KILT", "LIVRE", "LAMPE", "LETTRE", "MESSAGE", "MOUTON", "POMPON",
    "PASTEUR", "TIROIR", "TRESOR", "TOISON",
]  # T(1)..T(35)
VERBS = [
    "ACTIONNE", "ALLUME", "DONNE", "DETACHE", "DECROCHE", "DESCENDS",
    "ETEINS", "ECOUTE", "ENTRE", "EMMENE", "ENFILE", "ENLEVE", "FAIS SENTIR",
    "FOUILLE", "FERME", "GRATTE", "INVENTAIRE", "JOUE", "LIS", "LACHE",
    "MONTE", "METS", "MANGE", "OUVRE", "PRENDS", "POSE", "PARLEMENTE",
    "REGARDE", "REMETS", "RAME", "SORS", "SUIS", "TIRE",
]  # X(1)..X(33)

# Noms des lieux, sous-programmes 90-99 et 800-932 de LOCH7.BAS.
ROOM_NAMES = {
    1: "Dans le manoir des Baskerville (hall)",
    2: "Dans le manoir des Baskerville (hall, pied de l'escalier)",
    3: "A l'étage",
    4: "Dans le manoir des Baskerville (couloir)",
    5: "A la cuisine",
    6: "Au salon",
    7: "La salle des trophées",
    8: "Au sous-sol",
    9: "La chambre d'ami",
    10: "Oncle Alexander's bedroom",
    11: "Prince Charles-Edouard's bedroom",
    12: "Secret passage",
    13: "Secret passage",
    14: "Secret passage",
    15: "Secret passage (geôle d'Alexander)",
    16: "Secret passage",
    17: "Au presbytère",
    18: "Chez les Vandeleur",
    19: "Dans les marais de Grimpen",
    20: "A la chapelle",
    21: "Au cimetière",
    22: "St Patrick's Church",
    23: "Sur la lande pourpre de l'automne",
    24: "Sur la lande pourpre de l'automne",
    25: "Sur la lande pourpre de l'automne",
    26: "Sur la lande pourpre de l'automne",
    27: "Sur la lande pourpre de l'automne",
    28: "Dans les marais de Grimpen",
    29: "Aux abords du manoir",
    30: "Aux abords du manoir",
    31: "Au Square",
    32: "Au terrain de golf",
    33: "LOCH NESS",
    34: "Une petite maison dans la prairie (chez les Vandeleur, extérieur)",
    35: "Une petite maison dans la prairie (chez le berger)",
    36: "LOCH NESS",
    37: "A l'embarcadère",
    38: "A l'embarcadère (côté Murdock)",
    39: "Sur une rive du Loch Ness",
    40: "Sur une rive du Loch Ness",
}

# LOCH7.BAS ligne 124/202 : les flèches renvoient les codes 8=gauche, 9=droite,
# 10=bas, 11=haut ; B=45-code puis B-34 donne l'index 0..3 dans la table.
DIRECTIONS = ["haut (nord)", "bas (sud)", "droite (est)", "gauche (ouest)"]

# Zone XORée par l'EXEC &HA5F2 de PLAN7.BIN.
XOR_KEY = 0xD7
XOR_START, XOR_END = 0xA637, 0xB484


def read_sector(img, track, sect):
    off = (track * SECTORS_PER_TRACK + (sect - 1)) * SECTOR
    return img[off:off + SECTOR]


def read_catalog(img):
    entries = []
    for s in range(3, 17):
        sec = read_sector(img, DIR_TRACK, s)
        for i in range(8):
            e = sec[i * 32:(i + 1) * 32]
            if e[0] in (0x00, 0x20, 0xE5, 0xFF):
                continue
            entries.append({
                "name": e[0:8].decode("ascii").strip(),
                "ext": e[8:11].decode("ascii").strip(),
                "type": e[11],
                "ascii_flag": e[12],
                "first_block": e[13],
                "last_sector_bytes": int.from_bytes(e[14:16], "big"),
            })
    return entries


def read_file(img, fat, first_block, last_bytes):
    # Chaque secteur de 256 octets ne porte que 255 octets utiles : le
    # dernier octet est réservé par le DOS Thomson (toujours 0x00 ici).
    out = b""
    b = first_block
    while True:
        nxt = fat[b + 1]
        track = b // 2
        start = 1 if b % 2 == 0 else 9
        if nxt <= 0xBF:  # bloc plein, la chaîne continue
            for s in range(start, start + 8):
                out += read_sector(img, track, s)[:255]
            b = nxt
        elif 0xC1 <= nxt <= 0xC8:  # dernier bloc, n secteurs utilisés
            n = nxt - 0xC0
            for s in range(start, start + n - 1):
                out += read_sector(img, track, s)[:255]
            out += read_sector(img, track, start + n - 1)[:last_bytes]
            return out
        else:
            raise ValueError(f"chaîne FAT invalide: bloc {b} -> {nxt:#04x}")


def parse_bin_segments(data):
    """Blocs Thomson BINAIRE : 00 <len:2> <addr:2> <data>, terminés par FF."""
    segs = []
    i = 0
    while i < len(data):
        t = data[i]
        if t == 0x00:
            ln = struct.unpack(">H", data[i + 1:i + 3])[0]
            addr = struct.unpack(">H", data[i + 3:i + 5])[0]
            segs.append({"addr": addr, "data": data[i + 5:i + 5 + ln]})
            i += 5 + ln
        elif t == 0xFF:
            break
        else:  # bourrage de fin de secteur
            break
    return segs


class Memory:
    """Vue mémoire reconstituée à partir des segments chargés."""

    def __init__(self):
        self.mem = {}

    def load(self, segs):
        for s in segs:
            for i, byte in enumerate(s["data"]):
                self.mem[s["addr"] + i] = byte

    def apply_xor(self, start, end, key):
        for a in range(start, end):
            if a in self.mem:
                self.mem[a] ^= key

    def peek(self, addr):
        return self.mem[addr]


def decode_game_data(mem):
    """Reproduit les PEEK de LOCH7.BAS (lignes 110, 20-21, 200, 650, 1004)."""
    # Index alphabétiques : H(lettre) = premier verbe, G(lettre) = premier nom.
    H = {chr(64 + a): mem.peek(24382 + 2 * a) for a in range(1, 22)}
    G = {chr(64 + a): mem.peek(24383 + 2 * a) for a in range(1, 22)}

    items = []
    for a in range(1, 21):
        items.append({
            "slot": a,
            "nom": NOUNS[mem.peek(24500 + a) - 1],
            "genre": "un" if mem.peek(24425 + a) == 1 else "une",
            "lieu_initial": mem.peek(24445 + a),
            "lieu_initial_nom": ROOM_NAMES.get(mem.peek(24445 + a), "porté/nulle part"),
        })

    nouns = []
    for f in range(1, 36):
        nouns.append({
            "index": f,
            "mot": NOUNS[f - 1],
            "objet_slot": mem.peek(24465 + f),  # N(F): 0 = décor
        })

    verbs = []
    for b in range(1, 34):
        verbs.append({
            "index": b,
            "mot": VERBS[b - 1],
            "sans_complement": mem.peek(24520 + b) == 1,
        })

    rooms = []
    for p in range(1, 41):
        exits = {}
        for d in range(4):
            v = mem.peek(42591 + 4 * (p - 1) + d)
            exits[DIRECTIONS[d]] = v
        rooms.append({
            "id": p,
            "nom": ROOM_NAMES[p],
            "image": mem.peek(42550 + p),
            "sorties": exits,
        })

    return {
        "commentaire": {
            "sorties": "valeur = lieu destination (1-40), ou : 0=mur (Bing!), "
                       "41=«L'eau du lac est trop froide!», 42=proposition d'abandon, "
                       "43=«La porte est fermée», 44=noyade dans les marais (GLUPS), "
                       "65=«BING!AIE!Tu n'y voit rien!», 61-64=destination-50, sortie "
                       "conditionnelle (12: bibliothèque actionnée, 13: panneau ouvert, "
                       "14: trappe ouverte, sinon mur), 99=retour au lieu précédent. "
                       "En plus (ligne 655) : dest 18 fermée si D1=1 ou 2, dest 17 "
                       "fermée si D1<2. Dest 14/15 dans le noir si chandelier éteint.",
            "objet_slot": "0 = simple décor (pas un objet manipulable)",
        },
        "index_verbes_par_lettre": H,
        "index_noms_par_lettre": G,
        "objets": items,
        "noms": nouns,
        "verbes": verbs,
        "lieux": rooms,
    }


def main():
    fd_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("source-fd/le-tresor-des-baskerville_to8.fd")
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("source-fd/extracted")
    out_dir.mkdir(parents=True, exist_ok=True)

    img = fd_path.read_bytes()
    fat = read_sector(img, DIR_TRACK, 2)

    # On reproduit la séquence de chargement du jeu (JEU.BAS) :
    # LOADM"PLAN7.BIN" : EXEC&HA5F2 (XOR $D7) : ... LOADM"TOCH7" : LOADM"MOCH7".
    # PLAN.BIN (variante protégée, non utilisée) et DEPI7.DCL (intro) sont
    # extraits mais pas chargés dans la vue mémoire.
    mem = Memory()
    contents = {}
    for e in read_catalog(img):
        name = f"{e['name']}.{e['ext']}"
        content = read_file(img, fat, e["first_block"], e["last_sector_bytes"])
        (out_dir / name).write_bytes(content)
        contents[name] = content
        info = f"{name:12s} {len(content):6d} octets"
        if e["ext"] in ("BIN", "DCL"):
            for s in parse_bin_segments(content):
                info += f"  [addr={s['addr']:#06x} len={len(s['data'])}]"
        print(info)

    mem.load(parse_bin_segments(contents["PLAN7.BIN"]))
    mem.apply_xor(XOR_START, XOR_END, XOR_KEY)
    mem.load(parse_bin_segments(contents["TOCH7.BIN"]))
    mem.load(parse_bin_segments(contents["MOCH7.BIN"]))

    data = decode_game_data(mem)
    data_path = Path("data/game-data.json")
    data_path.parent.mkdir(parents=True, exist_ok=True)
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nTables de jeu décodées -> {data_path}")


if __name__ == "__main__":
    main()
