// Écran TO8 : composition des banques vidéo (forme/couleur) sur un canvas,
// grille texte 40×25 façon BASIC (COLOR/LOCATE/PRINT, coupure dure à 40
// colonnes, police bitmap 8×8), primitives ROM point/segment.

import { FONT } from './font.js';

// Palette TO8 par défaut (indices BASIC 0-15).
export const PALETTE = [
  '#000000', '#f00000', '#00f000', '#f0f000',
  '#0000f0', '#f000f0', '#00f0f0', '#f0f0f0',
  '#636363', '#f06363', '#63f063', '#f0f063',
  '#6363f0', '#f063f0', '#63f0f0', '#f06300',
];
const PALETTE_RGB = PALETTE.map(h => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
]);

const hwToIndex = v => (v & 0x0F) ^ 8;

export class TO8Screen {
  constructor(canvas, emu) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emu = emu;
    this.scale = 2;                      // canvas logique 640×400
    this.gfx = new OffscreenCanvas(320, 200);
    this.gctx = this.gfx.getContext('2d');
    this.img = this.gctx.createImageData(320, 200);
    // grille texte : null = transparent (graphique visible)
    this.cells = Array.from({ length: 25 }, () => new Array(40).fill(null));
    this.cursor = { col: 0, row: 24, visible: false, blink: true };
    this.forme = 4;   // couleurs texte courantes (COLOR forme, fond)
    this.fond = 6;
    this.dirty = true;
    this.emu.traps.set(0xE80C, e => this.romLine(e));
    this.emu.traps.set(0xE80F, e => this.romPoint(e));
  }

  // ---------- primitives ROM ----------
  plot(x, y) {
    if (x < 0 || x >= 320 || y < 0 || y >= 200) return;
    const off = y * 40 + (x >> 3);
    const bit = 0x80 >> (x & 7);
    if (this.emu.mem[0x6019] & 0x10) {          // mode gomme
      this.emu.forme[off] &= ~bit;
      return;
    }
    this.emu.forme[off] |= bit;
    // Octet couleur TO8 : forme = bits 3-6, fond = bits 0-2 + bit 7
    // (vérifié contre des captures du jeu original).
    const color = this.emu.mem[0x6038] & 0x0F;
    this.emu.couleur[off] = (this.emu.couleur[off] & 0x87) | (color << 3);
  }

  romPoint(e) {
    this.plot((e.x << 16) >> 16, (e.y << 16) >> 16);
    e.wr16(0x603D, e.x); e.wr16(0x603F, e.y);
    this.dirty = true;
  }

  romLine(e) {
    let x0 = (e.rd16(0x603D) << 16) >> 16, y0 = (e.rd16(0x603F) << 16) >> 16;
    const x1 = (e.x << 16) >> 16, y1 = (e.y << 16) >> 16;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.plot(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    this.dirty = true;
  }

  // ---------- écran graphique ----------
  clearGraphics(fond = 0) {
    const hw = fond ^ 8;
    this.emu.forme.fill(0, 0, 0x1F40);
    this.emu.couleur.fill((hw & 0x07) | ((hw & 0x08) << 4), 0, 0x1F40);
    this.dirty = true;
  }

  box(x0, y0, x1, y1, color) {
    this.emu.mem[0x6038] = color;
    this.emu.mem[0x6019] &= ~0x10;
    for (let x = x0; x <= x1; x++) { this.plot(x, y0); this.plot(x, y1); }
    for (let y = y0; y <= y1; y++) { this.plot(x0, y); this.plot(x1, y); }
    this.dirty = true;
  }

  // ---------- texte ----------
  color(forme, fond) {
    if (forme !== undefined && forme !== null) this.forme = forme;
    if (fond !== undefined && fond !== null) this.fond = fond;
  }

  locate(col, row) {
    this.cursor.col = col;
    this.cursor.row = row;
  }

  putChar(ch, opts = {}) {
    const { col, row } = this.cursor;
    if (row < 0 || row > 24) return;
    if (col >= 0 && col < 40) {
      this.cells[row][col] = {
        ch, fg: this.forme, bg: this.fond,
        big: opts.big || false, wide: opts.wide || false,
      };
    }
    this.cursor.col++;
    if (this.cursor.col >= 40) { this.cursor.col = 0; this.lineFeed(); }
    this.dirty = true;
  }

  lineFeed() {
    this.cursor.row++;
    if (this.cursor.row > this.winBottom) {
      this.scrollWindow();
      this.cursor.row = this.winBottom;
    }
  }

  // fenêtre console (CONSOLE a,b)
  setWindow(top, bottom) { this.winTop = top; this.winBottom = bottom; }
  winTop = 0;
  winBottom = 24;

  scrollWindow() {
    for (let r = this.winTop; r < this.winBottom; r++) this.cells[r] = this.cells[r + 1];
    // Comme sur TO8, la nouvelle ligne est remplie avec le fond courant.
    this.cells[this.winBottom] = Array.from({ length: 40 }, () =>
      ({ ch: ' ', fg: this.forme, bg: this.fond, big: false, wide: false }));
    this.dirty = true;
  }

  // Remplit une plage de lignes avec des espaces dans le fond donné
  // (équivalent du CLS de la fenêtre CONSOLE).
  fillRows(r0, r1, fg, bg) {
    for (let r = r0; r <= r1; r++) {
      this.cells[r] = Array.from({ length: 40 }, () =>
        ({ ch: ' ', fg, bg, big: false, wide: false }));
    }
    this.dirty = true;
  }

  // PRINT avec coupure dure à 40 colonnes (comportement BASIC).
  print(text, { newline = true, big = false, wide = false } = {}) {
    for (const ch of text) this.putChar(ch, { big, wide });
    if (newline) { this.cursor.col = 0; this.lineFeed(); }
    this.dirty = true;
  }

  clearRow(row, fromCol = 0) {
    if (row < 0 || row > 24) return;
    for (let c = fromCol; c < 40; c++) this.cells[row][c] = null;
    this.dirty = true;
  }

  clearRows(r0, r1) { for (let r = r0; r <= r1; r++) this.clearRow(r); }

  cls() {
    for (let r = 0; r < 25; r++) this.cells[r] = new Array(40).fill(null);
    this.clearGraphics(this.fond === undefined ? 0 : 0);
    this.cursor.col = 0;
    this.cursor.row = this.winTop;
    this.dirty = true;
  }

  // ---------- rendu ----------
  render(force = false) {
    if (!this.dirty && !force) return;
    const data = this.img.data;
    const { forme, couleur } = this.emu;
    let p = 0;
    for (let y = 0; y < 200; y++) {
      for (let xb = 0; xb < 40; xb++) {
        const off = y * 40 + xb;
        const fb = forme[off], cb = couleur[off];
        const fg = PALETTE_RGB[hwToIndex((cb >> 3) & 0x0F)];
        const bg = PALETTE_RGB[hwToIndex((cb & 0x07) | ((cb >> 4) & 0x08))];
        for (let b = 0; b < 8; b++) {
          const c = (fb & (0x80 >> b)) ? fg : bg;
          data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
          p += 4;
        }
      }
    }
    this.gctx.putImageData(this.img, 0, 0);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.gfx, 0, 0, 640, 400);

    // couche texte : police bitmap 8×8 (2 px canvas par pixel de glyphe,
    // 4 px de haut pour les caractères double hauteur ATTRB)
    for (let r = 0; r < 25; r++) {
      for (let c = 0; c < 40; c++) {
        const cell = this.cells[r][c];
        if (!cell) continue;
        const x = c * 16, y = r * 16;
        const ph = cell.big ? 4 : 2;
        ctx.fillStyle = PALETTE[cell.bg];
        ctx.fillRect(x, y, 16, 8 * ph);
        const glyph = FONT[cell.ch] || FONT['?'];
        ctx.fillStyle = PALETTE[cell.fg];
        for (let gy = 0; gy < 8; gy++) {
          const row = glyph[gy];
          if (!row) continue;
          for (let gx = 0; gx < 8; gx++) {
            if (row & (0x80 >> gx)) ctx.fillRect(x + gx * 2, y + gy * ph, 2, ph);
          }
        }
      }
    }
    // curseur
    if (this.cursor.visible && this.cursor.blink) {
      const { col, row } = this.cursor;
      if (col >= 0 && col < 40 && row >= 0 && row < 25) {
        this.ctx.fillStyle = PALETTE[this.forme];
        this.ctx.fillRect(col * 16, row * 16 + 12, 14, 3);
      }
    }
    this.dirty = false;
  }
}
