// Émulateur 6809 minimal — port JavaScript de tools/emu6809.py.
// Exécute le moteur graphique original du Trésor des Baskerville.

const C_C = 1, C_V = 2, C_Z = 4, C_N = 8, C_H = 32;

export class Emu6809 {
  constructor() {
    this.mem = new Uint8Array(0x10000);
    // Vidéo TO8 : fenêtre $4000-$5FFF, banque couleur (bit0 E7C3 = 0)
    // ou forme (bit0 = 1).
    this.forme = new Uint8Array(0x2000);
    this.couleur = new Uint8Array(0x2000);
    this.a = 0; this.b = 0; this.dp = 0; this.cc = 0;
    this.x = 0; this.y = 0; this.u = 0; this.s = 0; this.pc = 0;
    this.traps = new Map();
  }

  bank() { return (this.mem[0xE7C3] & 1) ? this.forme : this.couleur; }

  rd(ad) {
    ad &= 0xFFFF;
    if (ad >= 0x4000 && ad < 0x6000) return this.bank()[ad - 0x4000];
    return this.mem[ad];
  }
  wr(ad, v) {
    ad &= 0xFFFF; v &= 0xFF;
    if (ad >= 0x4000 && ad < 0x6000) this.bank()[ad - 0x4000] = v;
    else this.mem[ad] = v;
  }
  rd16(ad) { return (this.rd(ad) << 8) | this.rd(ad + 1); }
  wr16(ad, v) { this.wr(ad, v >> 8); this.wr(ad + 1, v); }

  get d() { return (this.a << 8) | this.b; }
  set d(v) { this.a = (v >> 8) & 0xFF; this.b = v & 0xFF; }

  getr(i) {
    switch (i) {
      case 0: return this.d; case 1: return this.x; case 2: return this.y;
      case 3: return this.u; case 4: return this.s; case 5: return this.pc;
      case 8: return this.a; case 9: return this.b;
      case 10: return this.cc; case 11: return this.dp;
      default: return 0;
    }
  }
  setr(i, v) {
    switch (i) {
      case 0: this.d = v & 0xFFFF; break; case 1: this.x = v & 0xFFFF; break;
      case 2: this.y = v & 0xFFFF; break; case 3: this.u = v & 0xFFFF; break;
      case 4: this.s = v & 0xFFFF; break; case 5: this.pc = v & 0xFFFF; break;
      case 8: this.a = v & 0xFF; break; case 9: this.b = v & 0xFF; break;
      case 10: this.cc = v & 0xFF; break; case 11: this.dp = v & 0xFF; break;
    }
  }

  fetch() { const v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  fetch16() { return (this.fetch() << 8) | this.fetch(); }

  static s8(v) { return v & 0x80 ? v - 256 : v; }
  static s16(v) { return v & 0x8000 ? v - 65536 : v; }

  nz8(v) { this.cc = (this.cc & ~(C_N | C_Z)) | (v & 0x80 ? C_N : 0) | (v === 0 ? C_Z : 0); }
  nz16(v) { this.cc = (this.cc & ~(C_N | C_Z)) | (v & 0x8000 ? C_N : 0) | (v === 0 ? C_Z : 0); }

  adjust(r, n) {
    switch (r) {
      case 0: this.x = (this.x + n) & 0xFFFF; break;
      case 1: this.y = (this.y + n) & 0xFFFF; break;
      case 2: this.u = (this.u + n) & 0xFFFF; break;
      case 3: this.s = (this.s + n) & 0xFFFF; break;
    }
  }

  eaIndexed() {
    const pb = this.fetch();
    const r = (pb >> 5) & 3;
    const base = [this.x, this.y, this.u, this.s][r];
    let ea;
    if (!(pb & 0x80)) {
      let off = pb & 0x1F;
      if (off & 0x10) off -= 32;
      return (base + off) & 0xFFFF;
    }
    switch (pb & 0x0F) {
      case 0x0: ea = base; this.adjust(r, 1); break;
      case 0x1: ea = base; this.adjust(r, 2); break;
      case 0x2: this.adjust(r, -1); ea = (base - 1) & 0xFFFF; break;
      case 0x3: this.adjust(r, -2); ea = (base - 2) & 0xFFFF; break;
      case 0x4: ea = base; break;
      case 0x5: ea = (base + Emu6809.s8(this.b)) & 0xFFFF; break;
      case 0x6: ea = (base + Emu6809.s8(this.a)) & 0xFFFF; break;
      case 0x8: ea = (base + Emu6809.s8(this.fetch())) & 0xFFFF; break;
      case 0x9: ea = (base + Emu6809.s16(this.fetch16())) & 0xFFFF; break;
      case 0xB: ea = (base + Emu6809.s16(this.d)) & 0xFFFF; break;
      case 0xC: ea = (this.pc + Emu6809.s8(this.fetch()) + 0) & 0xFFFF; break;
      case 0xD: { const o = Emu6809.s16(this.fetch16()); ea = (this.pc + o) & 0xFFFF; break; }
      case 0xF: ea = this.fetch16(); break;
      default: throw new Error(`mode indexé ${pb.toString(16)} pc=${this.pc.toString(16)}`);
    }
    if (pb & 0x10) ea = this.rd16(ea);
    return ea;
  }

  add8(a, b, c = 0) {
    const r = a + b + c;
    this.cc &= ~(C_N | C_Z | C_V | C_C | C_H);
    if ((a ^ b ^ r) & 0x10) this.cc |= C_H;
    if (r & 0x100) this.cc |= C_C;
    if ((a ^ r) & (b ^ r) & 0x80) this.cc |= C_V;
    const v = r & 0xFF;
    if (v & 0x80) this.cc |= C_N;
    if (v === 0) this.cc |= C_Z;
    return v;
  }
  sub8(a, b, c = 0) {
    const r = a - b - c;
    this.cc &= ~(C_N | C_Z | C_V | C_C);
    if (r & 0x100) this.cc |= C_C;
    if ((a ^ b) & (a ^ r) & 0x80) this.cc |= C_V;
    const v = r & 0xFF;
    if (v & 0x80) this.cc |= C_N;
    if (v === 0) this.cc |= C_Z;
    return v;
  }
  add16(a, b) {
    const r = a + b;
    this.cc &= ~(C_N | C_Z | C_V | C_C);
    if (r & 0x10000) this.cc |= C_C;
    if ((a ^ r) & (b ^ r) & 0x8000) this.cc |= C_V;
    const v = r & 0xFFFF;
    if (v & 0x8000) this.cc |= C_N;
    if (v === 0) this.cc |= C_Z;
    return v;
  }
  sub16(a, b) {
    const r = a - b;
    this.cc &= ~(C_N | C_Z | C_V | C_C);
    if (r & 0x10000) this.cc |= C_C;
    if ((a ^ b) & (a ^ r) & 0x8000) this.cc |= C_V;
    const v = r & 0xFFFF;
    if (v & 0x8000) this.cc |= C_N;
    if (v === 0) this.cc |= C_Z;
    return v;
  }
  logic8(v) {
    v &= 0xFF;
    this.cc &= ~(C_N | C_Z | C_V);
    if (v & 0x80) this.cc |= C_N;
    if (v === 0) this.cc |= C_Z;
    return v;
  }

  unary(op, v) {
    let r, c;
    switch (op) {
      case 0x0: return this.sub8(0, v);
      case 0x3: r = (~v) & 0xFF; this.logic8(r); this.cc |= C_C; return r;
      case 0x4:
        this.cc = (this.cc & ~(C_C | C_N | C_Z)) | (v & 1 ? C_C : 0);
        r = v >> 1; if (r === 0) this.cc |= C_Z; return r;
      case 0x6:
        c = this.cc & C_C;
        this.cc = (this.cc & ~(C_C | C_N | C_Z)) | (v & 1 ? C_C : 0);
        r = (v >> 1) | (c ? 0x80 : 0);
        if (r & 0x80) this.cc |= C_N; if (r === 0) this.cc |= C_Z; return r;
      case 0x7:
        this.cc = (this.cc & ~(C_C | C_N | C_Z)) | (v & 1 ? C_C : 0);
        r = (v >> 1) | (v & 0x80);
        if (r & 0x80) this.cc |= C_N; if (r === 0) this.cc |= C_Z; return r;
      case 0x8:
        r = (v << 1) & 0xFF;
        this.cc &= ~(C_C | C_N | C_Z | C_V);
        if (v & 0x80) this.cc |= C_C;
        if ((v ^ r) & 0x80) this.cc |= C_V;
        if (r & 0x80) this.cc |= C_N; if (r === 0) this.cc |= C_Z; return r;
      case 0x9:
        c = this.cc & C_C;
        r = ((v << 1) | (c ? 1 : 0)) & 0xFF;
        this.cc &= ~(C_C | C_N | C_Z | C_V);
        if (v & 0x80) this.cc |= C_C;
        if ((v ^ r) & 0x80) this.cc |= C_V;
        if (r & 0x80) this.cc |= C_N; if (r === 0) this.cc |= C_Z; return r;
      case 0xA:
        r = (v - 1) & 0xFF;
        this.cc &= ~(C_N | C_Z | C_V);
        if (v === 0x80) this.cc |= C_V;
        if (r & 0x80) this.cc |= C_N; if (r === 0) this.cc |= C_Z; return r;
      case 0xC:
        r = (v + 1) & 0xFF;
        this.cc &= ~(C_N | C_Z | C_V);
        if (v === 0x7F) this.cc |= C_V;
        if (r & 0x80) this.cc |= C_N; if (r === 0) this.cc |= C_Z; return r;
      case 0xD: this.logic8(v); return null;
      case 0xF: this.cc = (this.cc & ~(C_N | C_V | C_C)) | C_Z; return 0;
      default: throw new Error(`unaire ${op}`);
    }
  }

  pushS(mask) {
    const w = [[0x80, 'pc'], [0x40, 'u'], [0x20, 'y'], [0x10, 'x']];
    for (const [bit, n] of w) if (mask & bit) { this.s = (this.s - 2) & 0xFFFF; this.wr16(this.s, this[n]); }
    for (const [bit, n] of [[0x08, 'dp'], [0x04, 'b'], [0x02, 'a'], [0x01, 'cc']])
      if (mask & bit) { this.s = (this.s - 1) & 0xFFFF; this.wr(this.s, this[n]); }
  }
  pullS(mask) {
    for (const [bit, n] of [[0x01, 'cc'], [0x02, 'a'], [0x04, 'b'], [0x08, 'dp']])
      if (mask & bit) { this[n] = this.rd(this.s); this.s = (this.s + 1) & 0xFFFF; }
    for (const [bit, n] of [[0x10, 'x'], [0x20, 'y'], [0x40, 'u'], [0x80, 'pc']])
      if (mask & bit) { this[n] = this.rd16(this.s); this.s = (this.s + 2) & 0xFFFF; }
  }
  pushU(mask) {
    const w = [[0x80, 'pc'], [0x40, 's'], [0x20, 'y'], [0x10, 'x']];
    for (const [bit, n] of w) if (mask & bit) { this.u = (this.u - 2) & 0xFFFF; this.wr16(this.u, this[n]); }
    for (const [bit, n] of [[0x08, 'dp'], [0x04, 'b'], [0x02, 'a'], [0x01, 'cc']])
      if (mask & bit) { this.u = (this.u - 1) & 0xFFFF; this.wr(this.u, this[n]); }
  }
  pullU(mask) {
    for (const [bit, n] of [[0x01, 'cc'], [0x02, 'a'], [0x04, 'b'], [0x08, 'dp']])
      if (mask & bit) { this[n] = this.rd(this.u); this.u = (this.u + 1) & 0xFFFF; }
    for (const [bit, n] of [[0x10, 'x'], [0x20, 'y'], [0x40, 's'], [0x80, 'pc']])
      if (mask & bit) { this[n] = this.rd16(this.u); this.u = (this.u + 2) & 0xFFFF; }
  }

  branchTaken(cond) {
    const cc = this.cc;
    const n = !!(cc & C_N), z = !!(cc & C_Z), v = !!(cc & C_V), c = !!(cc & C_C);
    switch (cond) {
      case 0x0: return true; case 0x1: return false;
      case 0x2: return !(c || z); case 0x3: return c || z;
      case 0x4: return !c; case 0x5: return c;
      case 0x6: return !z; case 0x7: return z;
      case 0x8: return !v; case 0x9: return v;
      case 0xA: return !n; case 0xB: return n;
      case 0xC: return n === v; case 0xD: return n !== v;
      case 0xE: return !z && n === v; case 0xF: return z || n !== v;
    }
  }

  // Émule JSR addr et tourne jusqu'au retour (sentinelle $FFFF).
  call(addr, maxSteps = 5_000_000) {
    this.s = 0x9F00;
    this.pc = addr;
    this.s = (this.s - 2) & 0xFFFF;
    this.wr16(this.s, 0xFFFF);
    let steps = 0;
    while (this.pc !== 0xFFFF) {
      this.step();
      if (++steps > maxSteps) throw new Error('boucle infinie 6809 ?');
    }
    return steps;
  }

  step() {
    const trap = this.traps.get(this.pc);
    if (trap) {
      trap(this);
      this.pc = this.rd16(this.s);
      this.s = (this.s + 2) & 0xFFFF;
      return;
    }
    const op = this.fetch();
    if (op === 0x10 || op === 0x11) { this.stepPage(op); return; }
    const hi = op >> 4, lo = op & 0x0F;

    if (hi === 0x0) {
      const ea = (this.dp << 8) | this.fetch();
      if (lo === 0xE) { this.pc = ea; return; }
      const r = this.unary(lo, this.rd(ea));
      if (r !== null) this.wr(ea, r);
      return;
    }
    if (hi === 0x6 || hi === 0x7) {
      const ea = hi === 0x6 ? this.eaIndexed() : this.fetch16();
      if (lo === 0xE) { this.pc = ea; return; }
      const r = this.unary(lo, this.rd(ea));
      if (r !== null) this.wr(ea, r);
      return;
    }
    if (hi === 0x4 || hi === 0x5) {
      const reg = hi === 0x4 ? 'a' : 'b';
      const r = this.unary(lo, this[reg]);
      if (r !== null) this[reg] = r;
      return;
    }
    if (hi === 0x1) {
      switch (op) {
        case 0x12: return;
        case 0x16: { const o = Emu6809.s16(this.fetch16()); this.pc = (this.pc + o) & 0xFFFF; return; }
        case 0x17: { const o = Emu6809.s16(this.fetch16()); this.pushS(0x80); this.pc = (this.pc + o) & 0xFFFF; return; }
        case 0x19: return; // DAA (non utilisé sérieusement ici)
        case 0x1A: this.cc |= this.fetch(); return;
        case 0x1C: this.cc &= this.fetch(); return;
        case 0x1D: this.a = this.b & 0x80 ? 0xFF : 0; this.nz16(this.d); return;
        case 0x1E: { const m = this.fetch(); const r1 = m >> 4, r2 = m & 15; const v1 = this.getr(r1), v2 = this.getr(r2); this.setr(r1, v2); this.setr(r2, v1); return; }
        case 0x1F: { const m = this.fetch(); this.setr(m & 15, this.getr(m >> 4)); return; }
      }
      throw new Error(`op ${op.toString(16)} pc=${(this.pc - 1).toString(16)}`);
    }
    if (hi === 0x2) {
      const o = Emu6809.s8(this.fetch());
      if (this.branchTaken(lo)) this.pc = (this.pc + o) & 0xFFFF;
      return;
    }
    if (hi === 0x3) {
      switch (op) {
        case 0x30: this.x = this.eaIndexed(); this.cc = (this.cc & ~C_Z) | (this.x === 0 ? C_Z : 0); return;
        case 0x31: this.y = this.eaIndexed(); this.cc = (this.cc & ~C_Z) | (this.y === 0 ? C_Z : 0); return;
        case 0x32: this.s = this.eaIndexed(); return;
        case 0x33: this.u = this.eaIndexed(); return;
        case 0x34: this.pushS(this.fetch()); return;
        case 0x35: this.pullS(this.fetch()); return;
        case 0x36: this.pushU(this.fetch()); return;
        case 0x37: this.pullU(this.fetch()); return;
        case 0x39: this.pc = this.rd16(this.s); this.s = (this.s + 2) & 0xFFFF; return;
        case 0x3A: this.x = (this.x + this.b) & 0xFFFF; return;
        case 0x3D: { const r = this.a * this.b; this.d = r; this.cc &= ~(C_Z | C_C); if (r === 0) this.cc |= C_Z; if (r & 0x80) this.cc |= C_C; return; }
      }
      throw new Error(`op ${op.toString(16)} pc=${(this.pc - 1).toString(16)}`);
    }

    // ALU
    const regA = hi < 0xC;
    const mode = hi & 3;
    let ea = null;
    if (mode === 1) ea = (this.dp << 8) | this.fetch();
    else if (mode === 2) ea = this.eaIndexed();
    else if (mode === 3) ea = this.fetch16();
    const m8 = () => ea === null ? this.fetch() : this.rd(ea);
    const m16 = () => ea === null ? this.fetch16() : this.rd16(ea);

    if (regA) {
      switch (lo) {
        case 0x0: this.a = this.sub8(this.a, m8()); return;
        case 0x1: this.sub8(this.a, m8()); return;
        case 0x2: this.a = this.sub8(this.a, m8(), this.cc & C_C ? 1 : 0); return;
        case 0x3: this.d = this.sub16(this.d, m16()); return;
        case 0x4: this.a = this.logic8(this.a & m8()); return;
        case 0x5: this.logic8(this.a & m8()); return;
        case 0x6: this.a = this.logic8(m8()); return;
        case 0x7: this.wr(ea, this.a); this.logic8(this.a); return;
        case 0x8: this.a = this.logic8(this.a ^ m8()); return;
        case 0x9: this.a = this.add8(this.a, m8(), this.cc & C_C ? 1 : 0); return;
        case 0xA: this.a = this.logic8(this.a | m8()); return;
        case 0xB: this.a = this.add8(this.a, m8()); return;
        case 0xC: this.sub16(this.x, m16()); return;
        case 0xD:
          if (ea === null) { const o = Emu6809.s8(this.fetch()); this.pushS(0x80); this.pc = (this.pc + o) & 0xFFFF; return; }
          this.pushS(0x80); this.pc = ea; return;
        case 0xE: this.x = m16(); this.nz16(this.x); this.cc &= ~C_V; return;
        case 0xF: this.wr16(ea, this.x); this.nz16(this.x); this.cc &= ~C_V; return;
      }
    } else {
      switch (lo) {
        case 0x0: this.b = this.sub8(this.b, m8()); return;
        case 0x1: this.sub8(this.b, m8()); return;
        case 0x2: this.b = this.sub8(this.b, m8(), this.cc & C_C ? 1 : 0); return;
        case 0x3: this.d = this.add16(this.d, m16()); return;
        case 0x4: this.b = this.logic8(this.b & m8()); return;
        case 0x5: this.logic8(this.b & m8()); return;
        case 0x6: this.b = this.logic8(m8()); return;
        case 0x7: this.wr(ea, this.b); this.logic8(this.b); return;
        case 0x8: this.b = this.logic8(this.b ^ m8()); return;
        case 0x9: this.b = this.add8(this.b, m8(), this.cc & C_C ? 1 : 0); return;
        case 0xA: this.b = this.logic8(this.b | m8()); return;
        case 0xB: this.b = this.add8(this.b, m8()); return;
        case 0xC: this.d = m16(); this.nz16(this.d); this.cc &= ~C_V; return;
        case 0xD: this.wr16(ea, this.d); this.nz16(this.d); this.cc &= ~C_V; return;
        case 0xE: this.u = m16(); this.nz16(this.u); this.cc &= ~C_V; return;
        case 0xF: this.wr16(ea, this.u); this.nz16(this.u); this.cc &= ~C_V; return;
      }
    }
  }

  stepPage(page) {
    const op = this.fetch();
    if (page === 0x10 && op >= 0x21 && op <= 0x2F) {
      const o = Emu6809.s16(this.fetch16());
      if (this.branchTaken(op & 0x0F)) this.pc = (this.pc + o) & 0xFFFF;
      return;
    }
    const hi = op >> 4, lo = op & 0x0F;
    const mode = hi & 3;
    let ea = null;
    if (mode === 1) ea = (this.dp << 8) | this.fetch();
    else if (mode === 2) ea = this.eaIndexed();
    else if (mode === 3) ea = this.fetch16();
    const m16 = () => ea === null ? this.fetch16() : this.rd16(ea);

    if (page === 0x10) {
      if (lo === 0x3) { this.sub16(this.d, m16()); return; }
      if (lo === 0xC) { this.sub16(this.y, m16()); return; }
      if (lo === 0xE && hi < 0xC) { this.y = m16(); this.nz16(this.y); this.cc &= ~C_V; return; }
      if (lo === 0xF && hi < 0xC) { this.wr16(ea, this.y); this.nz16(this.y); this.cc &= ~C_V; return; }
      if (lo === 0xE) { this.s = m16(); this.nz16(this.s); this.cc &= ~C_V; return; }
      if (lo === 0xF) { this.wr16(ea, this.s); this.nz16(this.s); this.cc &= ~C_V; return; }
    } else {
      if (lo === 0x3) { this.sub16(this.u, m16()); return; }
      if (lo === 0xC) { this.sub16(this.s, m16()); return; }
    }
    throw new Error(`op page ${page.toString(16)} ${op.toString(16)}`);
  }
}
