// Chargement des binaires originaux et pilotage du moteur graphique émulé.
// Reproduit la séquence de chargement de JEU.BAS :
//   LOADM"PLAN7.BIN" : EXEC&HA5F2 (XOR $D7) : LOADM TOCH7/MOCH7 (jeu)
//   ou LOADM DEPI7.DCL (intro).

const XOR_START = 0xA637, XOR_END = 0xB484, XOR_KEY = 0xD7;
const J_ENTRY = 0xAC9F, K_ENTRY = 0xACB4;
const PIC_NUM = 0xA749, STATE = 0xA743;

export async function fetchBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`échec de chargement ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

export function loadSegments(emu, data) {
  let i = 0;
  while (i < data.length && data[i] === 0x00) {
    const len = (data[i + 1] << 8) | data[i + 2];
    const addr = (data[i + 3] << 8) | data[i + 4];
    for (let j = 0; j < len; j++) emu.wr(addr + j, data[i + 5 + j]);
    i += 5 + len;
  }
}

export class PictureEngine {
  constructor(emu) {
    this.emu = emu;
  }

  static async loadData(baseUrl) {
    const names = ['PLAN7.BIN', 'TOCH7.BIN', 'MOCH7.BIN', 'DEPI7.DCL'];
    const bins = {};
    await Promise.all(names.map(async n => { bins[n] = await fetchBin(`${baseUrl}/${n}?v=20260830-1713-3a39f53`); }));
    return bins;
  }

  // mode 'game' : PLAN7 + TOCH7 + MOCH7 ; mode 'intro' : PLAN7 + DEPI7.
  init(bins, mode = 'game') {
    loadSegments(this.emu, bins['PLAN7.BIN']);
    for (let a = XOR_START; a < XOR_END; a++) this.emu.wr(a, this.emu.rd(a) ^ XOR_KEY);
    if (mode === 'game') {
      loadSegments(this.emu, bins['TOCH7.BIN']);
      loadSegments(this.emu, bins['MOCH7.BIN']);
    } else {
      loadSegments(this.emu, bins['DEPI7.DCL']);
    }
    this.emu.wr(0xA721, 0);  // POKE &HA721,0 (JEU.BAS ligne 2)
    this.emu.wr(0xA748, 0);  // POKE S-1,0
  }

  // POKES,A : EXECJ
  execJ(num) {
    this.emu.wr(PIC_NUM, num & 0xFF);
    this.emu.wr(0xA748, (num >> 8) & 0xFF);
    this.emu.call(J_ENTRY);
  }

  // EXECK
  execK() {
    this.emu.call(K_ENTRY);
  }

  get state() { return this.emu.mem[STATE]; }

  // Dessine une image d'un coup (déroule l'animation, borné).
  drawFull(num, maxTicks = 4000) {
    this.execJ(num);
    for (let i = 0; i < maxTicks; i++) {
      this.execK();
      if (this.state === 0) break;
    }
  }
}
