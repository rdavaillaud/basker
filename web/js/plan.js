// Page « plan » : les 40 lieux et leurs liaisons, générés depuis
// data/game-data.json (table des déplacements décodée), avec la miniature
// de chaque lieu dessinée par le moteur graphique 6809 émulé.

import { Emu6809 } from './emu6809.js';
import { PictureEngine } from './pictures.js';

// Position (colonne, ligne) de chaque lieu sur la carte.
const POS = {
  // le manoir : étage, rez-de-chaussée, sous-sol, passage secret
  13: [0, 0], 10: [1, 0], 4: [2, 0], 11: [3, 0], 16: [4, 0],
  12: [0, 1], 9: [1, 1], 3: [2, 1], 15: [4, 1],
  6: [0, 2], 2: [1, 2], 7: [2, 2], 14: [3, 2],
  8: [0, 3], 5: [1, 3], 1: [2, 3],
  // extérieur : prairie, lande, marais, village, Loch Ness
  35: [0, 5], 26: [1, 5], 27: [2, 5], 28: [3, 5], 32: [4, 5], 17: [5, 5],
  40: [0, 6], 25: [1, 6], 29: [2, 6], 30: [3, 6], 31: [4, 6], 20: [5, 6],
  39: [0, 7], 34: [1, 7], 19: [3, 7], 21: [4, 7], 22: [5, 7], 37: [6, 7],
  18: [0, 8], 23: [1, 8], 24: [2, 8], 36: [4, 8], 33: [5, 8], 38: [6, 8],
};

const COL_W = 142, ROW_H = 122, CARD_W = 122, CARD_H = 104;
const OX = 10, OY = 34;

const DIRS = ['haut (nord)', 'bas (sud)', 'droite (est)', 'gauche (ouest)'];

const center = p => {
  const [c, r] = POS[p];
  return [OX + c * COL_W + CARD_W / 2, OY + r * ROW_H + CARD_H / 2];
};

// palette (mêmes valeurs que to8.js)
const PALETTE = [
  [0x00, 0x00, 0x00], [0xF0, 0x00, 0x00], [0x00, 0xF0, 0x00], [0xF0, 0xF0, 0x00],
  [0x00, 0x00, 0xF0], [0xF0, 0x00, 0xF0], [0x00, 0xF0, 0xF0], [0xF0, 0xF0, 0xF0],
  [0x63, 0x63, 0x63], [0xF0, 0x63, 0x63], [0x63, 0xF0, 0x63], [0xF0, 0xF0, 0x63],
  [0x63, 0x63, 0xF0], [0xF0, 0x63, 0xF0], [0x63, 0xF0, 0xF0], [0xF0, 0x63, 0x00],
];

function makeRenderer(bins) {
  const emu = new Emu6809();
  const pics = new PictureEngine(emu);
  pics.init(bins, 'game');
  const plot = (x, y) => {
    if (x < 0 || x >= 320 || y < 0 || y >= 200) return;
    const off = y * 40 + (x >> 3);
    if (emu.mem[0x6019] & 0x10) { emu.forme[off] &= ~(0x80 >> (x & 7)); return; }
    emu.forme[off] |= 0x80 >> (x & 7);
    emu.couleur[off] = (emu.couleur[off] & 0x87) | ((emu.mem[0x6038] & 0x0F) << 3);
  };
  const s16 = v => (v << 16) >> 16;
  emu.traps.set(0xE80F, e => { plot(s16(e.x), s16(e.y)); e.wr16(0x603D, e.x); e.wr16(0x603F, e.y); });
  emu.traps.set(0xE80C, e => {
    let x0 = s16(e.rd16(0x603D)), y0 = s16(e.rd16(0x603F));
    const x1 = s16(e.x), y1 = s16(e.y);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      plot(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  });
  return { emu, pics };
}

function snapshot(emu, canvas) {
  const off = new OffscreenCanvas(320, 200);
  const ctx = off.getContext('2d');
  const img = ctx.createImageData(320, 200);
  let p = 0;
  for (let y = 0; y < 200; y++) {
    for (let xb = 0; xb < 40; xb++) {
      const o = y * 40 + xb;
      const fb = emu.forme[o], cb = emu.couleur[o];
      const fg = PALETTE[(((cb >> 3) & 0x0F)) ^ 8];
      const bg = PALETTE[(((cb & 0x07) | ((cb >> 4) & 0x08))) ^ 8];
      for (let b = 0; b < 8; b++) {
        const c = fb & (0x80 >> b) ? fg : bg;
        img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2];
        img.data[p + 3] = 255;
        p += 4;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const c2 = canvas.getContext('2d');
  c2.imageSmoothingEnabled = false;
  // la zone utile des images : le cadre (20,4)-(307,123)
  c2.drawImage(off, 18, 2, 292, 124, 0, 0, canvas.width, canvas.height);
}

async function main() {
  const [bins, data] = await Promise.all([
    PictureEngine.loadData('data'),
    fetch('data/game-data.json').then(r => r.json()),
  ]);
  const rooms = data.lieux;

  // dimensions de la carte
  const maxC = Math.max(...Object.values(POS).map(p => p[0]));
  const maxR = Math.max(...Object.values(POS).map(p => p[1]));
  const carte = document.getElementById('carte');
  const W = OX * 2 + (maxC + 1) * COL_W;
  const H = OY + (maxR + 1) * ROW_H + 10;
  carte.style.width = W + 'px';
  carte.style.height = H + 'px';

  // zones
  const zones = document.getElementById('zones');
  for (const [txt, c, r] of [['Le manoir des Baskerville', 0, -0.27],
                             ['La lande, le village et le Loch Ness', 0, 4.73]]) {
    const el = document.createElement('div');
    el.className = 'zone';
    el.textContent = txt;
    el.style.left = (OX + c * COL_W) + 'px';
    el.style.top = (OY + r * ROW_H) + 'px';
    zones.appendChild(el);
  }

  // cartes des lieux
  const lieux = document.getElementById('lieux');
  const canvases = {};
  for (const room of rooms) {
    const [c, r] = POS[room.id];
    const div = document.createElement('div');
    div.className = 'lieu';
    div.style.left = (OX + c * COL_W) + 'px';
    div.style.top = (OY + r * ROW_H) + 'px';
    const cv = document.createElement('canvas');
    cv.width = 224; cv.height = 140;
    canvases[room.id] = cv;
    div.appendChild(cv);
    const label = document.createElement('div');
    const badges = [];
    const vals = DIRS.map(d => room.sorties[d]);
    if (vals.includes(44)) badges.push('☠');
    if (vals.includes(99)) badges.push('↩');
    if (vals.includes(41)) badges.push('🌊');
    if (vals.includes(43)) badges.push('🚪');
    if (vals.includes(42)) badges.push('⏏');
    label.innerHTML = `<span class="num">${room.id}</span>${room.nom}`
      + (badges.length ? `<div class="badges">${badges.join(' ')}</div>` : '');
    div.appendChild(label);
    lieux.appendChild(div);
  }

  // liaisons
  const svg = document.getElementById('liens');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const links = new Map();   // "min-max" -> {a, b, ab, ba, cond}
  for (const room of rooms) {
    for (const d of DIRS) {
      let v = room.sorties[d];
      let cond = false;
      if (v > 60 && v <= 64) { v -= 50; cond = true; }
      if (v < 1 || v > 40) continue;
      // portes soumises au scénario (chez les Vandeleur, presbytère)
      if (v === 18 || v === 17) cond = true;
      const key = Math.min(room.id, v) + '-' + Math.max(room.id, v);
      const e = links.get(key) || { a: Math.min(room.id, v), b: Math.max(room.id, v), ab: false, ba: false, cond: false };
      if (room.id === e.a) e.ab = true; else e.ba = true;
      e.cond = e.cond || cond;
      links.set(key, e);
    }
  }
  const ns = 'http://www.w3.org/2000/svg';
  for (const e of links.values()) {
    if (e.a === e.b) continue;
    const [x1, y1] = center(e.a);
    const [x2, y2] = center(e.b);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    // courbe légère pour les longues liaisons, afin de contourner les cartes
    const bend = len > COL_W * 1.6 ? Math.min(70, len * 0.18) : 0;
    const mx = (x1 + x2) / 2 - bend * (dy / len);
    const my = (y1 + y2) / 2 + bend * (dx / len);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    const oneWay = !(e.ab && e.ba);
    path.setAttribute('stroke', e.cond ? '#f06300' : oneWay ? '#e8c86a' : '#8fa0d8');
    path.setAttribute('stroke-width', oneWay || e.cond ? 1.6 : 2.2);
    if (e.cond) path.setAttribute('stroke-dasharray', '6 4');
    path.setAttribute('opacity', 0.85);
    svg.appendChild(path);
    if (oneWay) {
      // flèche au milieu, orientée vers la destination
      const to = e.ab ? [x2, y2] : [x1, y1];
      const from = e.ab ? [x1, y1] : [x2, y2];
      const t = 0.5;
      const px = (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * mx + t * t * to[0];
      const py = (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * my + t * t * to[1];
      const ang = Math.atan2(to[1] - py, to[0] - px) * 180 / Math.PI;
      const arrow = document.createElementNS(ns, 'path');
      arrow.setAttribute('d', 'M -6 -5 L 7 0 L -6 5 z');
      arrow.setAttribute('fill', e.cond ? '#f06300' : '#e8c86a');
      arrow.setAttribute('transform', `translate(${px} ${py}) rotate(${ang})`);
      svg.appendChild(arrow);
    }
  }

  // miniatures : rendu séquentiel par le moteur émulé
  const { emu, pics } = makeRenderer(bins);
  for (const room of rooms) {
    emu.forme.fill(0, 0, 0x1F40);
    emu.couleur.fill(0x80, 0, 0x1F40);   // fond noir (encodage matériel)
    pics.drawFull(1, 50);
    pics.drawFull(room.image, 2500);
    snapshot(emu, canvases[room.id]);
    await new Promise(r => requestAnimationFrame(r));
  }
}

main().catch(err => {
  console.error(err);
  document.querySelector('.subtitle').textContent = 'Erreur : ' + err.message;
});
