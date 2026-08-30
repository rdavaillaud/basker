// Point d'entrée du portage web du Trésor des Baskerville.

import { Emu6809 } from './emu6809.js';
import { TO8Screen } from './to8.js';
import { PictureEngine } from './pictures.js';
import { ThomsonAudio } from './audio.js';
import { Game, GameRestart } from './game.js';
import { Intro, IntroSkip } from './intro.js';

// ---------- clavier façon TO8 ----------
class Input {
  constructor() {
    this.queue = [];
    this.waiter = null;
    this.skip = false;
    window.addEventListener('keydown', e => this.onKey(e));
  }

  onKey(e) {
    let code = null;
    switch (e.key) {
      case 'ArrowLeft': code = 8; break;
      case 'ArrowRight': code = 9; break;
      case 'ArrowDown': code = 10; break;
      case 'ArrowUp': code = 11; break;
      case 'Enter': code = 13; break;
      case 'Backspace': case 'Delete': code = 29; break;
      case 'Escape': this.skip = true; code = 27; break;
      default:
        if (e.key.length === 1) {
          const c = e.key.toUpperCase().charCodeAt(0);
          if ((c >= 65 && c <= 90) || (c >= 48 && c <= 57)) code = c;
        }
    }
    if (code === null) return;
    e.preventDefault();
    if (this.waiter) { const w = this.waiter; this.waiter = null; w(code); }
    else this.queue.push(code);
  }

  getKey() {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise(res => { this.waiter = res; });
  }

  flush() { this.queue.length = 0; }
  consumeSkip() { const s = this.skip; this.skip = false; return s; }
}

// ---------- panneau d'aide ----------
function setupAide(data) {
  const aide = document.getElementById('aide');
  const btn = document.getElementById('btn-aide');
  const verbes = document.getElementById('aide-verbes');
  const noms = document.getElementById('aide-noms');
  for (const v of data.verbes) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${v.mot.slice(0, 3)}</b>${v.mot.slice(3)}${v.sans_complement ? ' <span class="seul">•</span>' : ''}`;
    verbes.appendChild(li);
  }
  for (const n of data.noms) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${n.mot.slice(0, 3)}</b>${n.mot.slice(3)}`;
    noms.appendChild(li);
  }
  const toggle = () => {
    aide.hidden = !aide.hidden;
    btn.classList.toggle('active', !aide.hidden);
  };
  btn.addEventListener('click', () => { toggle(); btn.blur(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'F1') { e.preventDefault(); toggle(); }
  });
}

// ---------- boot ----------
async function boot() {
  const canvas = document.getElementById('screen');
  const overlay = document.getElementById('overlay');
  const status = document.getElementById('status');

  const emu = new Emu6809();
  const screen = new TO8Screen(canvas, emu);
  const audio = new ThomsonAudio();
  const pics = new PictureEngine(emu);
  const input = new Input();

  status.textContent = 'Chargement des données originales…';
  const [bins, data] = await Promise.all([
    PictureEngine.loadData('data'),
    fetch('data/game-data.json').then(r => r.json()),
  ]);
  status.textContent = '';
  overlay.querySelector('button').disabled = false;
  setupAide(data);

  // rendu continu + clignotement curseur
  setInterval(() => { screen.cursor.blink = !screen.cursor.blink; screen.dirty = true; }, 400);
  (function loop() { screen.render(); requestAnimationFrame(loop); })();

  await new Promise(res => {
    overlay.querySelector('button').addEventListener('click', () => {
      overlay.remove();
      audio.ensure();
      res();
    }, { once: true });
  });

  // intro (JEU.BAS) — Échap pour passer
  pics.init(bins, 'intro');
  const intro = new Intro({ screen, audio, pics, input });
  try {
    await intro.run();
  } catch (e) {
    if (!(e instanceof IntroSkip)) throw e;
    audio.enabled = true;
  }
  try {
    await intro.explain();
  } catch (e) { if (!(e instanceof IntroSkip)) throw e; }

  // jeu (LOCH7.BAS) — recharge mémoire comme la ligne 25 de JEU.BAS
  for (;;) {
    const gameEmu = new Emu6809();
    screen.emu = gameEmu;
    gameEmu.traps.set(0xE80C, e => screen.romLine(e));
    gameEmu.traps.set(0xE80F, e => screen.romPoint(e));
    const gamePics = new PictureEngine(gameEmu);
    gamePics.init(bins, 'game');
    input.flush();
    const game = new Game({
      screen, audio, pics: gamePics, data, input,
    });
    try {
      await game.run();
      break;
    } catch (e) {
      if (e instanceof GameRestart) {
        if (!e.replay) {
          screen.color(7, 0);
          screen.locate(0, 24);
          screen.clearRow(24);
          screen.locate(12, 24);
          screen.print('AU REVOIR, SIR !', { newline: false });
          break;
        }
        continue;   // RUN : on relance une partie
      }
      throw e;
    }
  }
}

boot().catch(err => {
  console.error(err);
  const s = document.getElementById('status');
  if (s) s.textContent = 'Erreur : ' + err.message;
});
