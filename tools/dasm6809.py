#!/usr/bin/env python3
"""Mini désassembleur Motorola 6809 (sous-ensemble suffisant pour PLAN7.BIN).

Usage : python3 tools/dasm6809.py <fichier BIN Thomson> <addr_debut_hex> [addr_fin_hex]
"""
import struct
import sys

R8 = ["NEG", None, None, "COM", "LSR", None, "ROR", "ASR",
      "ASL", "ROL", "DEC", None, "INC", "TST", "JMP", "CLR"]
BR = ["BRA", "BRN", "BHI", "BLS", "BCC", "BCS", "BNE", "BEQ",
      "BVC", "BVS", "BPL", "BMI", "BGE", "BLT", "BGT", "BLE"]
ALU_A = ["SUBA", "CMPA", "SBCA", "SUBD", "ANDA", "BITA", "LDA", "STA",
         "EORA", "ADCA", "ORA", "ADDA", "CMPX", "JSR", "LDX", "STX"]
ALU_B = ["SUBB", "CMPB", "SBCB", "ADDD", "ANDB", "BITB", "LDB", "STB",
         "EORB", "ADCB", "ORB", "ADDB", "LDD", "STD", "LDU", "STU"]
IDX_REG = ["X", "Y", "U", "S"]
EXG_REG = {0: "D", 1: "X", 2: "Y", 3: "U", 4: "S", 5: "PC",
           8: "A", 9: "B", 10: "CC", 11: "DP"}
PSH_S = ["CC", "A", "B", "DP", "X", "Y", "U", "PC"]

WORD_OPS = {"SUBD", "CMPX", "LDX", "STX", "ADDD", "LDD", "STD", "LDU", "STU",
            "CMPD", "CMPY", "LDY", "STY", "LDS", "STS", "CMPU", "CMPS"}


class Dasm:
    def __init__(self, mem):
        self.mem = mem  # dict addr->byte

    def b(self):
        v = self.mem.get(self.pc, 0)
        self.pc += 1
        return v

    def w(self):
        return (self.b() << 8) | self.b()

    def indexed(self):
        pb = self.b()
        r = IDX_REG[(pb >> 5) & 3]
        if not pb & 0x80:
            off = pb & 0x1F
            if off & 0x10:
                off -= 32
            return f"{off},{r}"
        mode = pb & 0x0F
        ind = pb & 0x10
        if mode == 0x0:
            s = f",{r}+"
        elif mode == 0x1:
            s = f",{r}++"
        elif mode == 0x2:
            s = f",-{r}"
        elif mode == 0x3:
            s = f",--{r}"
        elif mode == 0x4:
            s = f",{r}"
        elif mode == 0x5:
            s = f"B,{r}"
        elif mode == 0x6:
            s = f"A,{r}"
        elif mode == 0x8:
            v = self.b()
            s = f"{v - 256 if v & 0x80 else v},{r}"
        elif mode == 0x9:
            v = self.w()
            s = f"{v - 65536 if v & 0x8000 else v},{r}"
        elif mode == 0xB:
            s = f"D,{r}"
        elif mode == 0xC:
            v = self.b()
            v = v - 256 if v & 0x80 else v
            s = f"${(self.pc + v) & 0xFFFF:04X},PCR"
        elif mode == 0xD:
            v = self.w()
            s = f"${(self.pc + v) & 0xFFFF:04X},PCR"
        elif mode == 0xF:
            s = f"${self.w():04X}"
        else:
            s = f"?idx{pb:02X}"
        return f"[{s}]" if ind else s

    def op(self, mnem, mode):
        if mode == "imm":
            if mnem in WORD_OPS:
                return f"{mnem} #${self.w():04X}"
            return f"{mnem} #${self.b():02X}"
        if mode == "dir":
            return f"{mnem} <${self.b():02X}"
        if mode == "ext":
            return f"{mnem} ${self.w():04X}"
        if mode == "idx":
            return f"{mnem} {self.indexed()}"
        return mnem

    def psh(self, mnem):
        m = self.b()
        regs = [n for i, n in enumerate(PSH_S) if m & (1 << i)]
        return f"{mnem} {','.join(regs) or '0'}"

    def step(self, pc):
        self.pc = pc
        o = self.b()
        if o == 0x10 or o == 0x11:
            o2 = self.b()
            page = {0x10: {0x83: "CMPD", 0x8C: "CMPY", 0x8E: "LDY",
                           0x93: "CMPD", 0x9C: "CMPY", 0x9E: "LDY", 0x9F: "STY",
                           0xA3: "CMPD", 0xAC: "CMPY", 0xAE: "LDY", 0xAF: "STY",
                           0xB3: "CMPD", 0xBC: "CMPY", 0xBE: "LDY", 0xBF: "STY",
                           0xCE: "LDS", 0xDE: "LDS", 0xDF: "STS",
                           0xEE: "LDS", 0xEF: "STS", 0xFE: "LDS", 0xFF: "STS"},
                    0x11: {0x83: "CMPU", 0x8C: "CMPS", 0x93: "CMPU", 0x9C: "CMPS",
                           0xA3: "CMPU", 0xAC: "CMPS", 0xB3: "CMPU", 0xBC: "CMPS"}}
            if o == 0x10 and 0x21 <= o2 <= 0x2F:
                v = self.w()
                v = v - 65536 if v & 0x8000 else v
                return f"L{BR[o2 - 0x20]} ${(self.pc + v) & 0xFFFF:04X}", self.pc
            mnem = page[o].get(o2)
            if mnem is None:
                return f"???({o:02X}{o2:02X})", self.pc
            mode = ["imm", "dir", "idx", "ext"][(o2 >> 4) - 8] if o2 < 0xC0 else \
                   ["imm", "dir", "idx", "ext"][(o2 >> 4) - 0xC]
            return self.op(mnem, mode), self.pc
        if o < 0x10:
            m = R8[o]
            return (f"{m} <${self.b():02X}" if m else f"???({o:02X})"), self.pc
        if o == 0x12:
            return "NOP", self.pc
        if o == 0x13:
            return "SYNC", self.pc
        if o == 0x16:
            v = self.w()
            v = v - 65536 if v & 0x8000 else v
            return f"LBRA ${(self.pc + v) & 0xFFFF:04X}", self.pc
        if o == 0x17:
            v = self.w()
            v = v - 65536 if v & 0x8000 else v
            return f"LBSR ${(self.pc + v) & 0xFFFF:04X}", self.pc
        if o == 0x19:
            return "DAA", self.pc
        if o == 0x1A:
            return f"ORCC #${self.b():02X}", self.pc
        if o == 0x1C:
            return f"ANDCC #${self.b():02X}", self.pc
        if o == 0x1D:
            return "SEX", self.pc
        if o in (0x1E, 0x1F):
            m = self.b()
            return (f"{'EXG' if o == 0x1E else 'TFR'} "
                    f"{EXG_REG.get(m >> 4, '?')},{EXG_REG.get(m & 15, '?')}"), self.pc
        if 0x20 <= o <= 0x2F:
            v = self.b()
            v = v - 256 if v & 0x80 else v
            return f"{BR[o - 0x20]} ${(self.pc + v) & 0xFFFF:04X}", self.pc
        if 0x30 <= o <= 0x33:
            return f"LEA{IDX_REG[o - 0x30]} {self.indexed()}", self.pc
        if 0x34 <= o <= 0x37:
            return self.psh(["PSHS", "PULS", "PSHU", "PULU"][o - 0x34]), self.pc
        if o == 0x39:
            return "RTS", self.pc
        if o == 0x3A:
            return "ABX", self.pc
        if o == 0x3B:
            return "RTI", self.pc
        if o == 0x3D:
            return "MUL", self.pc
        if o == 0x3F:
            return "SWI", self.pc
        if 0x40 <= o <= 0x5F:
            m = R8[o & 0x0F]
            reg = "A" if o < 0x50 else "B"
            return (f"{m}{reg}" if m else f"???({o:02X})"), self.pc
        if 0x60 <= o <= 0x7F:
            m = R8[o & 0x0F]
            if m is None:
                return f"???({o:02X})", self.pc
            return self.op(m, "idx" if o < 0x70 else "ext"), self.pc
        if o >= 0x80:
            table = ALU_A if (o >> 6) & 1 == 0 else ALU_B
            table = ALU_A if o < 0xC0 else ALU_B
            m = table[o & 0x0F]
            if m is None:
                return f"???({o:02X})", self.pc
            if m == "BSR" or (o & 0xCF) == 0x8D:
                pass
            if o & 0xF0 in (0x80, 0xC0) and (o & 0x0F) == 0x0D:
                v = self.b()
                v = v - 256 if v & 0x80 else v
                return f"BSR ${(self.pc + v) & 0xFFFF:04X}", self.pc
            mode = ["imm", "dir", "idx", "ext"][(o >> 4) & 3]
            return self.op(m, mode), self.pc
        return f"???({o:02X})", self.pc


def load_bin(path, xor=None):
    d = open(path, "rb").read()
    mem = {}
    i = 0
    while i < len(d) and d[i] == 0x00:
        ln = struct.unpack(">H", d[i + 1:i + 3])[0]
        addr = struct.unpack(">H", d[i + 3:i + 5])[0]
        for j in range(ln):
            mem[addr + j] = d[i + 5 + j]
        i += 5 + ln
    if xor:
        start, end, key = xor
        for a in range(start, end):
            if a in mem:
                mem[a] ^= key
    return mem


def main():
    mem = load_bin(sys.argv[1], xor=(0xA637, 0xB484, 0xD7))
    start = int(sys.argv[2], 16)
    end = int(sys.argv[3], 16) if len(sys.argv) > 3 else start + 0x100
    d = Dasm(mem)
    pc = start
    while pc < end and pc in mem:
        txt, npc = d.step(pc)
        raw = ' '.join(f"{mem.get(a, 0):02X}" for a in range(pc, npc))
        print(f"{pc:04X}: {raw:<12} {txt}")
        pc = npc


if __name__ == "__main__":
    main()
