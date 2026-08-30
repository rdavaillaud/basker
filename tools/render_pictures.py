#!/usr/bin/env python3
"""Rendu de contrôle des images vectorielles du jeu via l'émulateur 6809.

Usage :
  python3 tools/render_pictures.py out_dir [num ...]

Sans numéros : rend les images de fond des 40 lieux + quelques overlays.
Chaque image est produite par POKE $A749,n puis EXEC $AC9F (comme GOSUB6
de LOCH7.BAS), suivie de ticks EXEC $ACB4 pour dérouler les animations.
"""
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from emu6809 import Emu

# Palette TO8 par défaut (indices BASIC 0-15).
PALETTE = [
    (0x00, 0x00, 0x00), (0xF0, 0x00, 0x00), (0x00, 0xF0, 0x00), (0xF0, 0xF0, 0x00),
    (0x00, 0x00, 0xF0), (0xF0, 0x00, 0xF0), (0x00, 0xF0, 0xF0), (0xF0, 0xF0, 0xF0),
    (0x63, 0x63, 0x63), (0xF0, 0x63, 0x63), (0x63, 0xF0, 0x63), (0xF0, 0xF0, 0x63),
    (0x63, 0x63, 0xF0), (0xF0, 0x63, 0xF0), (0x63, 0xF0, 0xF0), (0xF0, 0x63, 0x00),
]

J_ENTRY, K_ENTRY = 0xAC9F, 0xACB4
PIC_NUM = 0xA749


def load_segments(emu, path, xor=None):
    d = open(path, 'rb').read()
    i = 0
    while i < len(d) and d[i] == 0x00:
        ln = struct.unpack('>H', d[i + 1:i + 3])[0]
        addr = struct.unpack('>H', d[i + 3:i + 5])[0]
        for j in range(ln):
            emu.wr(addr + j, d[i + 5 + j])
        i += 5 + ln
    if xor:
        s, e, k = xor
        for a in range(s, e):
            emu.wr(a, emu.rd(a) ^ k)


def hw_to_index(v4):
    """Encodage matériel EFB (bit pastel inversé) -> indice de palette."""
    return (v4 & 0x0F) ^ 8


def couleur_byte_split(byte):
    """Octet couleur TO8 : forme = bits 0-2 + bit 7, fond = bits 3-6."""
    forme = (byte & 0x07) | ((byte >> 4) & 0x08)
    fond = (byte >> 3) & 0x0F
    return hw_to_index(forme), hw_to_index(fond)


class Renderer:
    def __init__(self):
        self.emu = Emu()
        base = Path(__file__).parent.parent / 'source-fd' / 'extracted'
        load_segments(self.emu, base / 'PLAN7.BIN', xor=(0xA637, 0xB484, 0xD7))
        load_segments(self.emu, base / 'TOCH7.BIN')   # -> banque forme ($5F40)
        load_segments(self.emu, base / 'MOCH7.BIN')
        # état système attendu par le moteur
        self.emu.wr(0xA721, 0)   # flag "saut du dessin" à zéro (POKE de JEU.BAS)
        self.emu.wr(0xA748, 0)   # octet fort du numéro d'image (POKE S-1,0)
        self.emu.traps[0xE80C] = self.trap_line
        self.emu.traps[0xE80F] = self.trap_point
        self.clear_screen()

    # --- écran ---
    def clear_screen(self, fond=0):
        for i in range(0x1F40):
            self.emu.video.forme[i] = 0
            self.emu.video.couleur[i] = ((fond ^ 8) & 0x0F) << 3

    # --- primitieves ROM ---
    def plot(self, x, y):
        if not (0 <= x < 320 and 0 <= y < 200):
            return
        off = y * 40 + (x >> 3)
        bit = 0x80 >> (x & 7)
        gomme = self.emu.mem[0x6019] & 0x10
        if gomme:
            self.emu.video.forme[off] &= ~bit & 0xFF
            return
        self.emu.video.forme[off] |= bit
        color = self.emu.mem[0x6038] & 0x0F
        hw = (color & 0x07) | ((color & 0x08) << 4)
        c = self.emu.video.couleur[off]
        self.emu.video.couleur[off] = (c & 0x78) | hw

    def trap_point(self, emu):
        self.plot(self._s16(emu.x), self._s16(emu.y))
        emu.wr16(0x603D, emu.x)
        emu.wr16(0x603F, emu.y)

    def trap_line(self, emu):
        x0, y0 = self._s16(emu.rd16(0x603D)), self._s16(emu.rd16(0x603F))
        x1, y1 = self._s16(emu.x), self._s16(emu.y)
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            self.plot(x0, y0)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    @staticmethod
    def _s16(v):
        return v - 65536 if v & 0x8000 else v

    # --- exécution d'une image ---
    def draw_picture(self, num, ticks=4000):
        self.emu.wr(PIC_NUM, num)
        self.emu.wr(0xA748, 0)
        self.emu.call(J_ENTRY)
        for _ in range(ticks):
            self.emu.call(K_ENTRY)
            if self.emu.mem[0xA743] == 0:   # état 0 = terminé
                break

    # --- export PNG ---
    def to_rgb(self):
        rows = []
        for y in range(200):
            row = bytearray()
            for xb in range(40):
                off = y * 40 + xb
                fbyte = self.emu.video.forme[off]
                forme, fond = couleur_byte_split(self.emu.video.couleur[off])
                for b in range(8):
                    idx = forme if fbyte & (0x80 >> b) else fond
                    row += bytes(PALETTE[idx])
            rows.append(bytes(row))
        return rows

    def save_png(self, path, scale=2):
        rows = self.to_rgb()
        w, h = 320 * scale, 200 * scale
        raw = b''
        for r in rows:
            line = b''.join(r[i:i + 3] * scale for i in range(0, len(r), 3))
            raw += (b'\x00' + line) * scale
        def chunk(tag, data):
            c = tag + data
            return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
        png = (b'\x89PNG\r\n\x1a\n'
               + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress(raw, 6))
               + chunk(b'IEND', b''))
        Path(path).write_bytes(png)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('renders')
    out.mkdir(parents=True, exist_ok=True)
    nums = [int(a) for a in sys.argv[2:]]
    if not nums:
        # images des 40 lieux d'après data/game-data.json
        import json
        rooms = json.load(open(Path(__file__).parent.parent / 'data' / 'game-data.json'))['lieux']
        nums = sorted({r['image'] for r in rooms})
    for n in nums:
        r = Renderer()
        try:
            r.draw_picture(n)
            r.save_png(out / f'pic{n:03d}.png')
            print(f'image {n:3d} -> ok')
        except Exception as e:
            print(f'image {n:3d} -> ERREUR: {e}')


if __name__ == '__main__':
    main()
