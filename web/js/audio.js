// Interpréteur des chaînes PLAY du BASIC Thomson (DO RE MI FA SO LA SI,
// # dièse, On octave, Ln longueur, Tn tempo, An attaque/volume, P pause)
// rendu via Web Audio. play() retourne une promesse résolue à la fin,
// ce qui sert aussi de métronome au jeu (comme sur TO8).

const SEMITONES = { DO: 0, RE: 2, MI: 4, FA: 5, SO: 7, LA: 9, SI: 11 };

export class ThomsonAudio {
  constructor() {
    this.ctx = null;
    this.tempo = 5;
    this.length = 24;
    this.octave = 3;
    this.volume = 0.35;
    this.enabled = true;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = AC ? new AC() : null;
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  parse(str) {
    const s = str.toUpperCase().replace(/\s+/g, '');
    const events = [];
    let i = 0;
    const num = () => {
      let n = '';
      while (i < s.length && s[i] >= '0' && s[i] <= '9') n += s[i++];
      return n === '' ? null : parseInt(n, 10);
    };
    while (i < s.length) {
      const two = s.slice(i, i + 2), three = s.slice(i, i + 3);
      if (three === 'SOL' && s[i + 3] >= '0' && s[i + 3] <= '9') {
        // "SOL24" est en réalité SO + L24
        events.push({ type: 'note', semi: SEMITONES.SO });
        i += 2;
        continue;
      }
      if (two === 'DO' || two === 'RE' || two === 'MI' || two === 'FA'
          || two === 'SO' || two === 'LA' || two === 'SI') {
        i += 2;
        let semi = SEMITONES[two];
        if (s[i] === '#') { semi++; i++; }
        events.push({ type: 'note', semi });
        continue;
      }
      const c = s[i];
      if (c === 'P') { events.push({ type: 'pause' }); i++; continue; }
      if (c === 'T') { i++; events.push({ type: 'tempo', v: num() ?? 5 }); continue; }
      if (c === 'L') { i++; events.push({ type: 'length', v: num() ?? 24 }); continue; }
      if (c === 'O') { i++; events.push({ type: 'octave', v: num() ?? 3 }); continue; }
      if (c === 'A') { i++; events.push({ type: 'attack', v: num() ?? 50 }); continue; }
      i++; // caractère inconnu : ignoré
    }
    return events;
  }

  durationMs() {
    // approximation : L96 à T5 ≈ 1 s
    return this.length * (1000 / 96) * (5 / Math.max(1, this.tempo));
  }

  async play(str) {
    const events = this.parse(str);
    const ctx = this.enabled ? this.ensure() : null;
    let when = ctx ? ctx.currentTime : 0;
    let totalMs = 0;
    for (const ev of events) {
      switch (ev.type) {
        case 'tempo': this.tempo = ev.v; break;
        case 'length': this.length = ev.v; break;
        case 'octave': this.octave = ev.v; break;
        case 'attack': this.volume = Math.min(0.5, 0.1 + (ev.v % 100) / 250); break;
        case 'pause': {
          const d = this.durationMs();
          when += d / 1000; totalMs += d;
          break;
        }
        case 'note': {
          const d = this.durationMs();
          if (ctx) {
            const freq = 261.63 * Math.pow(2, this.octave - 3 + ev.semi / 12);
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, when);
            gain.gain.linearRampToValueAtTime(this.volume * 0.4, when + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + d / 1000);
            osc.connect(gain).connect(ctx.destination);
            osc.start(when);
            osc.stop(when + d / 1000 + 0.02);
          }
          when += d / 1000; totalMs += d;
          break;
        }
      }
    }
    await new Promise(res => setTimeout(res, totalMs));
  }
}
