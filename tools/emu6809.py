#!/usr/bin/env python3
"""Émulateur 6809 minimal pour exécuter le moteur graphique du Trésor des
Baskerville (PLAN7.BIN + MOCH7.BIN) et produire des rendus de contrôle.

La vidéo TO8 est émulée sur la fenêtre $4000-$5FFF : deux banques de
8 Ko (couleur si E7C3 bit0 = 0, forme si bit0 = 1). Les appels ROM sont
piégés : $E80C = tracé de segment, $E80F = point (sémantique du moniteur
TO8, couleur courante en $6038, position courante en $603D/$603F,
bit 4 de $6019 = gomme).
"""

C_C, C_V, C_Z, C_N, C_H, C_F, C_I, C_E = 1, 2, 4, 8, 32, 64, 16, 128

SCREEN_W, SCREEN_H = 320, 200


class TO8Video:
    def __init__(self):
        self.forme = bytearray(0x2000)   # banque bit0 = 1 (bitmap + TOCH7)
        self.couleur = bytearray(0x2000)  # banque bit0 = 0 (attributs)

    def bank(self, e7c3):
        return self.forme if (e7c3 & 1) else self.couleur


class Emu:
    def __init__(self):
        self.mem = bytearray(0x10000)
        self.video = TO8Video()
        self.a = self.b = self.dp = self.cc = 0
        self.x = self.y = self.u = self.s = self.pc = 0
        self.traps = {}

    # ---- accès mémoire (fenêtre vidéo + registre système E7C3) ----
    def rd(self, ad):
        ad &= 0xFFFF
        if 0x4000 <= ad < 0x6000:
            return self.video.bank(self.mem[0xE7C3])[ad - 0x4000]
        return self.mem[ad]

    def wr(self, ad, v):
        ad &= 0xFFFF
        v &= 0xFF
        if 0x4000 <= ad < 0x6000:
            self.video.bank(self.mem[0xE7C3])[ad - 0x4000] = v
        else:
            self.mem[ad] = v

    def rd16(self, ad):
        return (self.rd(ad) << 8) | self.rd(ad + 1)

    def wr16(self, ad, v):
        self.wr(ad, v >> 8)
        self.wr(ad + 1, v)

    # ---- registres ----
    @property
    def d(self):
        return (self.a << 8) | self.b

    @d.setter
    def d(self, v):
        self.a = (v >> 8) & 0xFF
        self.b = v & 0xFF

    def getreg16(self, i):
        return [self.d, self.x, self.y, self.u, self.s, self.pc][i]

    def setreg16(self, i, v):
        v &= 0xFFFF
        if i == 0:
            self.d = v
        elif i == 1:
            self.x = v
        elif i == 2:
            self.y = v
        elif i == 3:
            self.u = v
        elif i == 4:
            self.s = v
        elif i == 5:
            self.pc = v

    def getr(self, i):
        if i < 6:
            return self.getreg16(i)
        return {8: self.a, 9: self.b, 10: self.cc, 11: self.dp}[i]

    def setr(self, i, v):
        if i < 6:
            self.setreg16(i, v)
        elif i == 8:
            self.a = v & 0xFF
        elif i == 9:
            self.b = v & 0xFF
        elif i == 10:
            self.cc = v & 0xFF
        elif i == 11:
            self.dp = v & 0xFF

    # ---- flags ----
    def set_nz8(self, v):
        self.cc = (self.cc & ~(C_N | C_Z)) | (C_N if v & 0x80 else 0) | (C_Z if v == 0 else 0)

    def set_nz16(self, v):
        self.cc = (self.cc & ~(C_N | C_Z)) | (C_N if v & 0x8000 else 0) | (C_Z if v == 0 else 0)

    # ---- fetch ----
    def fetch(self):
        v = self.rd(self.pc)
        self.pc = (self.pc + 1) & 0xFFFF
        return v

    def fetch16(self):
        return (self.fetch() << 8) | self.fetch()

    # ---- adressage indexé ----
    def ea_indexed(self):
        pb = self.fetch()
        r = (pb >> 5) & 3
        base = [self.x, self.y, self.u, self.s][r]
        if not pb & 0x80:
            off = pb & 0x1F
            if off & 0x10:
                off -= 32
            return (base + off) & 0xFFFF
        mode = pb & 0x0F
        if mode == 0x0:  # ,R+
            ea = base
            self._adjust(r, 1)
        elif mode == 0x1:  # ,R++
            ea = base
            self._adjust(r, 2)
        elif mode == 0x2:  # ,-R
            self._adjust(r, -1)
            ea = (base - 1) & 0xFFFF
        elif mode == 0x3:  # ,--R
            self._adjust(r, -2)
            ea = (base - 2) & 0xFFFF
        elif mode == 0x4:
            ea = base
        elif mode == 0x5:
            ea = (base + self._s8(self.b)) & 0xFFFF
        elif mode == 0x6:
            ea = (base + self._s8(self.a)) & 0xFFFF
        elif mode == 0x8:
            ea = (base + self._s8(self.fetch())) & 0xFFFF
        elif mode == 0x9:
            ea = (base + self._s16(self.fetch16())) & 0xFFFF
        elif mode == 0xB:
            ea = (base + self._s16(self.d)) & 0xFFFF
        elif mode == 0xC:
            o = self._s8(self.fetch())
            ea = (self.pc + o) & 0xFFFF
        elif mode == 0xD:
            o = self._s16(self.fetch16())
            ea = (self.pc + o) & 0xFFFF
        elif mode == 0xF:
            ea = self.fetch16()
        else:
            raise RuntimeError(f"mode indexé {pb:02X} non géré pc={self.pc:04X}")
        if pb & 0x10 and mode != 0x4 or (pb & 0x9F) == 0x94:
            pass
        if pb & 0x80 and pb & 0x10:
            ea = self.rd16(ea)
        return ea

    def _adjust(self, r, n):
        v = ([self.x, self.y, self.u, self.s][r] + n) & 0xFFFF
        if r == 0:
            self.x = v
        elif r == 1:
            self.y = v
        elif r == 2:
            self.u = v
        else:
            self.s = v

    @staticmethod
    def _s8(v):
        return v - 256 if v & 0x80 else v

    @staticmethod
    def _s16(v):
        return v - 65536 if v & 0x8000 else v

    # ---- opérations ALU 8 bits ----
    def add8(self, a, b, carry=0):
        r = a + b + carry
        self.cc &= ~(C_N | C_Z | C_V | C_C | C_H)
        if (a ^ b ^ r) & 0x10:
            self.cc |= C_H
        if r & 0x100:
            self.cc |= C_C
        if (a ^ r) & (b ^ r) & 0x80:
            self.cc |= C_V
        r &= 0xFF
        if r & 0x80:
            self.cc |= C_N
        if r == 0:
            self.cc |= C_Z
        return r

    def sub8(self, a, b, carry=0, store=True):
        r = a - b - carry
        self.cc &= ~(C_N | C_Z | C_V | C_C)
        if r & 0x100:
            self.cc |= C_C
        if (a ^ b) & (a ^ r) & 0x80:
            self.cc |= C_V
        r &= 0xFF
        if r & 0x80:
            self.cc |= C_N
        if r == 0:
            self.cc |= C_Z
        return r

    def add16(self, a, b):
        r = a + b
        self.cc &= ~(C_N | C_Z | C_V | C_C)
        if r & 0x10000:
            self.cc |= C_C
        if (a ^ r) & (b ^ r) & 0x8000:
            self.cc |= C_V
        r &= 0xFFFF
        if r & 0x8000:
            self.cc |= C_N
        if r == 0:
            self.cc |= C_Z
        return r

    def sub16(self, a, b):
        r = a - b
        self.cc &= ~(C_N | C_Z | C_V | C_C)
        if r & 0x10000:
            self.cc |= C_C
        if (a ^ b) & (a ^ r) & 0x8000:
            self.cc |= C_V
        r &= 0xFFFF
        if r & 0x8000:
            self.cc |= C_N
        if r == 0:
            self.cc |= C_Z
        return r

    def logic8(self, v):
        self.cc &= ~(C_N | C_Z | C_V)
        if v & 0x80:
            self.cc |= C_N
        if v == 0:
            self.cc |= C_Z
        return v & 0xFF

    # ---- unaires (mémoire ou registre) ----
    def unary(self, op, v):
        if op == 0x0:  # NEG
            return self.sub8(0, v)
        if op == 0x3:  # COM
            r = (~v) & 0xFF
            self.logic8(r)
            self.cc |= C_C
            return r
        if op == 0x4:  # LSR
            self.cc = (self.cc & ~(C_C | C_N | C_Z)) | (C_C if v & 1 else 0)
            r = v >> 1
            if r == 0:
                self.cc |= C_Z
            return r
        if op == 0x6:  # ROR
            c = self.cc & C_C
            self.cc = (self.cc & ~(C_C | C_N | C_Z)) | (C_C if v & 1 else 0)
            r = (v >> 1) | (0x80 if c else 0)
            if r & 0x80:
                self.cc |= C_N
            if r == 0:
                self.cc |= C_Z
            return r
        if op == 0x7:  # ASR
            self.cc = (self.cc & ~(C_C | C_N | C_Z)) | (C_C if v & 1 else 0)
            r = (v >> 1) | (v & 0x80)
            if r & 0x80:
                self.cc |= C_N
            if r == 0:
                self.cc |= C_Z
            return r
        if op == 0x8:  # ASL
            c = v & 0x80
            r = (v << 1) & 0xFF
            self.cc &= ~(C_C | C_N | C_Z | C_V)
            if c:
                self.cc |= C_C
            if (v ^ r) & 0x80:
                self.cc |= C_V
            if r & 0x80:
                self.cc |= C_N
            if r == 0:
                self.cc |= C_Z
            return r
        if op == 0x9:  # ROL
            c = self.cc & C_C
            nc = v & 0x80
            r = ((v << 1) | (1 if c else 0)) & 0xFF
            self.cc &= ~(C_C | C_N | C_Z | C_V)
            if nc:
                self.cc |= C_C
            if (v ^ r) & 0x80:
                self.cc |= C_V
            if r & 0x80:
                self.cc |= C_N
            if r == 0:
                self.cc |= C_Z
            return r
        if op == 0xA:  # DEC
            r = (v - 1) & 0xFF
            self.cc &= ~(C_N | C_Z | C_V)
            if v == 0x80:
                self.cc |= C_V
            if r & 0x80:
                self.cc |= C_N
            if r == 0:
                self.cc |= C_Z
            return r
        if op == 0xC:  # INC
            r = (v + 1) & 0xFF
            self.cc &= ~(C_N | C_Z | C_V)
            if v == 0x7F:
                self.cc |= C_V
            if r & 0x80:
                self.cc |= C_N
            if r == 0:
                self.cc |= C_Z
            return r
        if op == 0xD:  # TST
            self.logic8(v)
            return None
        if op == 0xF:  # CLR
            self.cc = (self.cc & ~(C_N | C_V | C_C)) | C_Z
            return 0
        raise RuntimeError(f"unaire {op:X} non géré")

    # ---- pile ----
    def push_s(self, mask):
        regs = [(0x80, 'pc'), (0x40, 'u'), (0x20, 'y'), (0x10, 'x')]
        for bit, name in regs:
            if mask & bit:
                v = getattr(self, name)
                self.s = (self.s - 2) & 0xFFFF
                self.wr16(self.s, v)
        for bit, name in [(0x08, 'dp'), (0x04, 'b'), (0x02, 'a'), (0x01, 'cc')]:
            if mask & bit:
                self.s = (self.s - 1) & 0xFFFF
                self.wr(self.s, getattr(self, name))

    def pull_s(self, mask):
        for bit, name in [(0x01, 'cc'), (0x02, 'a'), (0x04, 'b'), (0x08, 'dp')]:
            if mask & bit:
                setattr(self, name, self.rd(self.s))
                self.s = (self.s + 1) & 0xFFFF
        for bit, name in [(0x10, 'x'), (0x20, 'y'), (0x40, 'u'), (0x80, 'pc')]:
            if mask & bit:
                setattr(self, name, self.rd16(self.s))
                self.s = (self.s + 2) & 0xFFFF

    def push_u(self, mask):
        regs = [(0x80, 'pc'), (0x40, 's'), (0x20, 'y'), (0x10, 'x')]
        for bit, name in regs:
            if mask & bit:
                self.u = (self.u - 2) & 0xFFFF
                self.wr16(self.u, getattr(self, name))
        for bit, name in [(0x08, 'dp'), (0x04, 'b'), (0x02, 'a'), (0x01, 'cc')]:
            if mask & bit:
                self.u = (self.u - 1) & 0xFFFF
                self.wr(self.u, getattr(self, name))

    def pull_u(self, mask):
        for bit, name in [(0x01, 'cc'), (0x02, 'a'), (0x04, 'b'), (0x08, 'dp')]:
            if mask & bit:
                setattr(self, name, self.rd(self.u))
                self.u = (self.u + 1) & 0xFFFF
        for bit, name in [(0x10, 'x'), (0x20, 'y'), (0x40, 's'), (0x80, 'pc')]:
            if mask & bit:
                setattr(self, name, self.rd16(self.u))
                self.u = (self.u + 2) & 0xFFFF

    # ---- exécution ----
    def call(self, addr, max_steps=5_000_000):
        """Émule JSR addr jusqu'au RTS final (pile S factice)."""
        self.s = 0x9F00
        self.pc = addr
        self.s = (self.s - 2) & 0xFFFF
        self.wr16(self.s, 0xFFFF)  # adresse de retour sentinelle
        steps = 0
        while self.pc != 0xFFFF:
            self.step()
            steps += 1
            if steps > max_steps:
                raise RuntimeError("trop d'instructions (boucle infinie ?)")
        return steps

    def ea_for(self, hi):
        mode = (hi >> 4) & 3
        if mode == 0:  # immédiat (géré par l'appelant)
            return None
        if mode == 1:
            return (self.dp << 8) | self.fetch()
        if mode == 2:
            return self.ea_indexed()
        return self.fetch16()

    def step(self):
        if self.pc in self.traps:
            self.traps[self.pc](self)
            # simule RTS
            self.pc = self.rd16(self.s)
            self.s = (self.s + 2) & 0xFFFF
            return
        op = self.fetch()
        if op == 0x10 or op == 0x11:
            self.step_page(op)
            return
        hi, lo = op >> 4, op & 0x0F

        if hi == 0x0:  # unaires direct
            ea = (self.dp << 8) | self.fetch()
            r = self.unary(lo, self.rd(ea)) if lo != 0xE else None
            if lo == 0xE:  # JMP direct
                self.pc = ea
            elif r is not None:
                self.wr(ea, r)
            return
        if hi in (0x6, 0x7):  # unaires indexé / étendu
            ea = self.ea_indexed() if hi == 0x6 else self.fetch16()
            if lo == 0xE:
                self.pc = ea
                return
            r = self.unary(lo, self.rd(ea))
            if r is not None:
                self.wr(ea, r)
            return
        if hi in (0x4, 0x5):  # unaires registre
            reg = 'a' if hi == 0x4 else 'b'
            r = self.unary(lo, getattr(self, reg))
            if r is not None:
                setattr(self, reg, r)
            return
        if hi == 0x1:
            if op == 0x12:
                return
            if op == 0x16:
                o = self._s16(self.fetch16())
                self.pc = (self.pc + o) & 0xFFFF
                return
            if op == 0x17:
                o = self._s16(self.fetch16())
                self.push_s(0x80)
                self.pc = (self.pc + o) & 0xFFFF
                return
            if op == 0x1A:
                self.cc |= self.fetch()
                return
            if op == 0x1C:
                self.cc &= self.fetch()
                return
            if op == 0x1D:  # SEX
                self.a = 0xFF if self.b & 0x80 else 0
                self.set_nz16(self.d)
                return
            if op == 0x1E:  # EXG
                m = self.fetch()
                r1, r2 = m >> 4, m & 0x0F
                v1, v2 = self.getr(r1), self.getr(r2)
                self.setr(r1, v2)
                self.setr(r2, v1)
                return
            if op == 0x1F:  # TFR
                m = self.fetch()
                self.setr(m & 0x0F, self.getr(m >> 4))
                return
            raise RuntimeError(f"op {op:02X} non géré pc={self.pc - 1:04X}")
        if hi == 0x2:  # branches
            o = self._s8(self.fetch())
            if self.branch_taken(lo):
                self.pc = (self.pc + o) & 0xFFFF
            return
        if hi == 0x3:
            if op <= 0x33:  # LEA
                ea = self.ea_indexed()
                if op == 0x30:
                    self.x = ea
                    self.cc = (self.cc & ~C_Z) | (C_Z if ea == 0 else 0)
                elif op == 0x31:
                    self.y = ea
                    self.cc = (self.cc & ~C_Z) | (C_Z if ea == 0 else 0)
                elif op == 0x32:
                    self.s = ea
                else:
                    self.u = ea
                return
            if op == 0x34:
                self.push_s(self.fetch())
                return
            if op == 0x35:
                self.pull_s(self.fetch())
                return
            if op == 0x36:
                self.push_u(self.fetch())
                return
            if op == 0x37:
                self.pull_u(self.fetch())
                return
            if op == 0x39:  # RTS
                self.pc = self.rd16(self.s)
                self.s = (self.s + 2) & 0xFFFF
                return
            if op == 0x3A:  # ABX
                self.x = (self.x + self.b) & 0xFFFF
                return
            if op == 0x3D:  # MUL
                r = self.a * self.b
                self.d = r
                self.cc &= ~(C_Z | C_C)
                if r == 0:
                    self.cc |= C_Z
                if r & 0x80:
                    self.cc |= C_C
                return
            raise RuntimeError(f"op {op:02X} non géré pc={self.pc - 1:04X}")

        # ALU 8/16 bits
        reg_a = hi < 0xC  # tables A (8x-Bx) / B (Cx-Fx)
        mode = (hi - (0x8 if reg_a else 0xC))
        if mode == 0:
            ea = None
        elif mode == 1:
            ea = (self.dp << 8) | self.fetch()
        elif mode == 2:
            ea = self.ea_indexed()
        else:
            ea = self.fetch16()

        def m8():
            return self.fetch() if ea is None else self.rd(ea)

        def m16():
            return self.fetch16() if ea is None else self.rd16(ea)

        if reg_a:
            if lo == 0x0:
                self.a = self.sub8(self.a, m8())
            elif lo == 0x1:
                self.sub8(self.a, m8())
            elif lo == 0x2:
                self.a = self.sub8(self.a, m8(), self.cc & C_C)
            elif lo == 0x3:
                self.d = self.sub16(self.d, m16())
            elif lo == 0x4:
                self.a = self.logic8(self.a & m8())
            elif lo == 0x5:
                self.logic8(self.a & m8())
            elif lo == 0x6:
                self.a = self.logic8(m8())
            elif lo == 0x7:
                self.wr(ea, self.a)
                self.logic8(self.a)
            elif lo == 0x8:
                self.a = self.logic8(self.a ^ m8())
            elif lo == 0x9:
                self.a = self.add8(self.a, m8(), 1 if self.cc & C_C else 0)
            elif lo == 0xA:
                self.a = self.logic8(self.a | m8())
            elif lo == 0xB:
                self.a = self.add8(self.a, m8())
            elif lo == 0xC:
                self.sub16(self.x, m16())
            elif lo == 0xD:
                if ea is None:  # BSR
                    o = self._s8(self.rd(self.pc - 1))
                    raise RuntimeError("BSR immédiat inattendu")
                self.push_s(0x80)
                self.pc = ea
            elif lo == 0xE:
                self.x = m16()
                self.set_nz16(self.x)
                self.cc &= ~C_V
            elif lo == 0xF:
                self.wr16(ea, self.x)
                self.set_nz16(self.x)
                self.cc &= ~C_V
        else:
            if lo == 0x0:
                self.b = self.sub8(self.b, m8())
            elif lo == 0x1:
                self.sub8(self.b, m8())
            elif lo == 0x2:
                self.b = self.sub8(self.b, m8(), self.cc & C_C)
            elif lo == 0x3:
                self.d = self.add16(self.d, m16())
            elif lo == 0x4:
                self.b = self.logic8(self.b & m8())
            elif lo == 0x5:
                self.logic8(self.b & m8())
            elif lo == 0x6:
                self.b = self.logic8(m8())
            elif lo == 0x7:
                self.wr(ea, self.b)
                self.logic8(self.b)
            elif lo == 0x8:
                self.b = self.logic8(self.b ^ m8())
            elif lo == 0x9:
                self.b = self.add8(self.b, m8(), 1 if self.cc & C_C else 0)
            elif lo == 0xA:
                self.b = self.logic8(self.b | m8())
            elif lo == 0xB:
                self.b = self.add8(self.b, m8())
            elif lo == 0xC:
                self.d = m16()
                self.set_nz16(self.d)
                self.cc &= ~C_V
            elif lo == 0xD:
                self.wr16(ea, self.d)
                self.set_nz16(self.d)
                self.cc &= ~C_V
            elif lo == 0xE:
                self.u = m16()
                self.set_nz16(self.u)
                self.cc &= ~C_V
            elif lo == 0xF:
                self.wr16(ea, self.u)
                self.set_nz16(self.u)
                self.cc &= ~C_V

    def step_page(self, page):
        op = self.fetch()
        if page == 0x10 and 0x21 <= op <= 0x2F:
            o = self._s16(self.fetch16())
            if self.branch_taken(op & 0x0F):
                self.pc = (self.pc + o) & 0xFFFF
            return
        hi, lo = op >> 4, op & 0x0F
        mode = (hi & 3)
        if mode == 0:
            ea = None
        elif mode == 1:
            ea = (self.dp << 8) | self.fetch()
        elif mode == 2:
            ea = self.ea_indexed()
        else:
            ea = self.fetch16()

        def m16():
            return self.fetch16() if ea is None else self.rd16(ea)

        if page == 0x10:
            if lo == 0x3:  # CMPD
                self.sub16(self.d, m16())
            elif lo == 0xC:  # CMPY
                self.sub16(self.y, m16())
            elif lo == 0xE:
                if hi & 0x4 or hi < 0xC:
                    pass
                # LDY (8E/9E/AE/BE) ou LDS (CE/DE/EE/FE)
            if lo == 0xE and hi < 0xC:
                self.y = m16()
                self.set_nz16(self.y)
                self.cc &= ~C_V
            elif lo == 0xF and hi < 0xC:
                self.wr16(ea, self.y)
                self.set_nz16(self.y)
                self.cc &= ~C_V
            elif lo == 0xE:
                self.s = m16()
                self.set_nz16(self.s)
                self.cc &= ~C_V
            elif lo == 0xF:
                self.wr16(ea, self.s)
                self.set_nz16(self.s)
                self.cc &= ~C_V
        else:
            if lo == 0x3:  # CMPU
                self.sub16(self.u, m16())
            elif lo == 0xC:  # CMPS
                self.sub16(self.s, m16())

    def branch_taken(self, cond):
        cc = self.cc
        n, z, v, c = bool(cc & C_N), bool(cc & C_Z), bool(cc & C_V), bool(cc & C_C)
        return [
            True, False, not (c or z), c or z, not c, c, not z, z,
            not v, v, not n, n, n == v, n != v,
            not z and n == v, z or n != v,
        ][cond]
