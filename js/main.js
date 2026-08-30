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
    this.push(code);
  }

  push(code) {
    if (code === 27) this.skip = true;   // Échap / bouton « passer l'intro »
    if (this.waiter) { const w = this.waiter; this.waiter = null; w(code); }
    else this.queue.push(code);
  }

  pushWord(word) {
    for (const ch of word.slice(0, 3).toUpperCase()) this.push(ch.charCodeAt(0));
  }

  getKey() {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise(res => { this.waiter = res; });
  }

  flush() { this.queue.length = 0; }
  consumeSkip() { const s = this.skip; this.skip = false; return s; }
}

// ---------- panneau d'aide (les mots sont tappables : ils tapent leurs
// 3 premières lettres, comme au clavier) ----------
function setupAide(data, input) {
  const aide = document.getElementById('aide');
  const btn = document.getElementById('btn-aide');
  const verbes = document.getElementById('aide-verbes');
  const noms = document.getElementById('aide-noms');
  const addWord = (ul, mot, extra = '') => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${mot.slice(0, 3)}</b>${mot.slice(3)}${extra}`;
    li.addEventListener('click', () => input.pushWord(mot));
    ul.appendChild(li);
  };
  for (const v of data.verbes) {
    addWord(verbes, v.mot, v.sans_complement ? ' <span class="seul">•</span>' : '');
  }
  for (const n of data.noms) addWord(noms, n.mot);
  const toggle = () => {
    aide.hidden = !aide.hidden;
    btn.classList.toggle('active', !aide.hidden);
  };
  btn.addEventListener('click', () => { toggle(); btn.blur(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'F1') { e.preventDefault(); toggle(); }
  });
  return toggle;
}

// ---------- commandes tactiles (mobile) ----------
function setupTouch(input, toggleAide) {
  const touch = document.getElementById('touch');
  const mobile = (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0)
    || matchMedia('(max-width: 720px)').matches;
  if (!mobile) return;
  touch.hidden = false;
  document.body.classList.add('mobile');
  for (const b of touch.querySelectorAll('button[data-k]')) {
    b.addEventListener('click', e => {
      e.preventDefault();
      input.push(parseInt(b.dataset.k, 10));
    });
  }
  // sur mobile, l'aide (qui sert de pavé de commandes) s'ouvre d'office
  toggleAide();
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
  const toggleAide = setupAide(data, input);
  setupTouch(input, toggleAide);

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
