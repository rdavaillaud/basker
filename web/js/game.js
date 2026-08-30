// Portage JavaScript du moteur de jeu LOCH7.BAS (Le Trésor des Baskerville,
// © CHIP 1987). La numérotation des commentaires renvoie aux lignes du
// BASIC d'origine (source-fd/JEU.BAS + LOCH7.BAS décodés).

export class Game {
  constructor({ screen, audio, pics, data, input, onQuit }) {
    this.scr = screen;
    this.snd = audio;
    this.pics = pics;
    this.data = data;
    this.input = input;      // async getKey() -> code clavier façon TO8
    this.onQuit = onQuit;

    // Vocabulaire (lignes 100-104)
    this.T = [null, ...data.noms.map(n => n.mot)];          // noms 1-35
    this.X = [null, ...data.verbes.map(v => v.mot)];        // verbes 1-33
    this.H = data.index_verbes_par_lettre;
    this.G = data.index_noms_par_lettre;
    this.noNoun = [null, ...data.verbes.map(v => v.sans_complement)];
    this.genre = [null, ...data.objets.map(o => o.genre)];
    this.nameIdx = [null, ...data.objets.map(o => this.T.indexOf(o.nom))];
    this.roomPic = [null, ...data.lieux.map(r => r.image)];
    this.exits = [null, ...data.lieux.map(r => [
      r.sorties['haut (nord)'], r.sorties['bas (sud)'],
      r.sorties['droite (est)'], r.sorties['gauche (ouest)'],
    ])];
  }

  reset() {
    const d = this.data;
    this.P = 0; this.O = 0;                          // lieu courant / précédent
    this.B = 0; this.F = 0;                          // verbe / nom saisis
    this.D1 = 0;                                     // avancement du scénario
    this.W = '';                                     // nom du lieu
    this.C = new Array(21).fill(0);                  // états des objets
    this.L = [0, ...d.objets.map(o => o.lieu_initial)];  // lieux des objets
    this.N = new Array(36).fill(0);                  // nom -> objet + drapeaux
    for (const n of d.noms) this.N[n.index] = n.objet_slot;
    this.dead = false;
  }

  // ---------- utilitaires écran ----------
  print(t = '', opts) { this.scr.print(t, opts); }
  printNoNl(t) { this.scr.print(t, { newline: false }); }
  locate(c, r) { this.scr.locate(c, r); }
  color(f, b) { this.scr.color(f, b); }

  async pic(n) { this.pics.execJ(n); this.scr.dirty = true; await this.frame(); }   // GOSUB6
  async tick() { this.pics.execK(); this.scr.dirty = true; await this.frame(); }    // EXECK
  frame() { return new Promise(r => requestAnimationFrame(r)); }
  play(s) { return this.snd.play(s); }

  async waitKey() {                                   // GOSUB65
    this.rnd();                                       // A=RND(1) : brasse l'aléa
    await this.input.getKey();
  }
  async getKey() { return this.input.getKey(); }      // GOSUB71 (INPUT$(1))

  rnd() { return Math.random(); }
  rndInt(n) { return Math.floor(Math.random() * n); }

  // ---------- GOSUB 2-9 ----------
  checkHere(F) {                                      // GOSUB2 -> {B,E}
    let B = this.N[F], E;
    if (B === 0 || (B === 1 && F !== 1) || (B === 2 && F !== 2)) { B = 0; E = 9; }
    else if (this.L[B] !== this.P) E = 9;
    else if (this.C[B] === 0) E = 0;
    else if (this.C[B] === 1) E = 1;
    else if (this.C[B] === 2) E = 2;
    else E = 3;
    return { B, E };
  }

  checkCarried(F) {                                   // GOSUB4 -> {B,E}
    const B = this.N[F];
    if (B === 0 || (B === 1 && F !== 1) || (B === 2 && F !== 2)) return { B, E: 9, silent: true };
    if (this.C[B] !== 9) { this.print('IL TE MANQUE QUELQUE CHOSE'); return { B, E: 9 }; }
    return { B, E: 0 };
  }

  take(F) { this.C[this.N[F]] = 9; }                  // GOSUB5

  praise() {                                          // GOSUB7
    const d = this.rndInt(4);
    if (d === 1) this.print('ELEMENTAIRE MON CHER');
    else if (d === 2) this.print('VERY GOOD MY LORD');
    else if (d === 3) this.print('ASTUCIEUX');
    else this.print('FORMIDABLE, N\'EST-IL PAS?');
  }

  insult() {                                          // GOSUB9
    const a = this.rndInt(4);
    if (a === 1) this.print('VERY STUPID SIR');
    else if (a === 2) this.print('RIDICULE');
    else if (a === 3) this.print('SORRY?');
    else this.print('I BEG YOUR PARDON');
  }

  // ---------- GOSUB 17-21 : "TU REMARQUES" ----------
  async remarks() {                                   // GOSUB17
    let any = false;
    for (let a = 1; a <= 20; a++) if (this.L[a] === this.P && this.C[a] === 1) any = true;
    if (!any) return;
    this.printNoNl('TU REMARQUES');
    for (let a = 1; a <= 20; a++) {
      if (this.L[a] === this.P && this.C[a] === 1) this.listItem(a);
    }
    this.print();
  }

  listItem(a) {                                       // GOSUB20-21
    const z = this.genre[a] === 'un' ? 'UN ' : 'UNE ';
    this.printNoNl('  ' + z + this.T[this.nameIdx[a]]);
  }

  // ---------- sons courts ----------
  pause27() { return this.play('L65PP'); }            // GOSUB27
  pause29() { return this.play('L96PP'); }            // GOSUB29
  shot() { return this.play('A65L19O1FA'); }          // GOSUB51
  chord47() { return this.play('L40A80O5DOREMIFASOLASI'); }  // GOSUB47
  digNote() { return this.play('A39L6O5FAMIP'); }     // GOSUB66

  // ---------- morts et fins ----------
  async tombDeath() {                                 // GOSUB28 -> 3002
    await this.pause27();
    await this.pic(18);
    await this.gosub97();
    await this.pause29();
    await this.tick();
    this.color(0, 7);
    this.print();
    this.print('<CI-GIT BASKERVILLE JUNIOR (-1890), MORT A LA SUITE D\'UN ACCIDENT DE CHASSE>');
    await this.askReplay();
  }

  async drown() {                                     // ligne 30
    await this.pic(44);
    await this.pause29();
    for (let b = 1; b <= 4; b++) {
      await this.tick();
      await this.play('L24P');
      this.print('GLUPS');
    }
    await this.askReplay();
  }

  async vandeleurFlee() {                             // GOSUB32
    await this.pause27();
    await this.pic(130);
    await this.pause29();
    await this.tick();
    for (let b = 1; b <= 7; b++) {
      await this.play('A9O5L1FASOLAL9P');
      await this.tick();
      await this.play('L39P');
      await this.tick();
    }
  }

  showName() {                                        // GOSUB34
    const e = 18 - Math.floor(this.W.length / 2);
    this.locate(Math.max(0, e), 16);
    this.scr.clearRow(16);
    this.locate(Math.max(0, e), 16);
    this.color(7, 0);
    this.printNoNl('* ' + this.W + ' *');
  }

  async murdockPunch() {                              // GOSUB36
    await this.pause29();
    this.print('Tu l\'auras cherché, petit crétin...');
    await this.pic(2);
    await this.pic(148);
    await this.pause29();
    this.print('PAF');
    await this.play('L80A50O3DOPP');
  }

  async dogAttack() {                                 // GOSUB38 -> mort
    await this.pic(147);
    this.print('Long Silver se jette sur toi...');
    this.print('GRR...CROC...');
    await this.tombDeath();
  }

  darkBump() {                                        // ligne 40
    this.color(0, 7);
    this.print('BING!AIE!Tu n\'y voit rien!');
  }

  async openFlag(a, F) {                              // GOSUB41
    this.N[F] = 1;
    await this.pic(a);
  }

  async gosub97() {                                   // GOSUB97 : efface la ligne du nom
    this.scr.clearRow(16);
    this.color(null, 0);
    this.locate(0, 24);
  }

  // ---------- scène Vandeleur (GOSUB42-45) ----------
  async vandeleurScene() {
    this.color(0, 0);
    await this.pic(135);
    this.locate(0, 24);
    this.print('Je me présente Léon Vandeleur zoologisteet écrivain français...');
    await this.play('T99L15PP');
    await this.tick();
    this.print('Voici ma femme Pauline...');
    await this.play('P');
    await this.tick();
    this.print('J\'ai appris la triste nouvelle...Un bêteaccident de chasse...Alexander était un grand chasseur...Il allait souvent tirerle coq de bruyère près du bourbier');
    this.print('de Grimpen...');
    await this.waitKey();
    await this.tick();
    await this.play('L8P');
    await this.tick();
    this.print('Tenez!..Un appeau à coq qu\'il m\'avait   prêté, je vous le rends...');
    await this.waitKey();
    await this.tick();
    await this.play('L11P');
    await this.tick();
    await this.play('P');
    await this.pic(152);
    await this.play('P');
    await this.tick();
    await this.play('L4PT5');
    await this.tick();
    this.print('SORS D\'ICI, CRAPULE !..Et arrêtes de    sourire à ma femme...');
  }

  async nessie() {                                    // GOSUB46
    await this.pic(159);
    for (let b = 1; b <= 21; b++) { await this.play('L26P'); await this.tick(); }
    for (let b = 1; b <= 5; b++) { await this.play('L67P'); await this.tick(); }
  }

  async rowTicks() {                                  // GOSUB50
    for (let b = 1; b <= 48; b++) { await this.play('L26P'); await this.tick(); }
  }

  async neighborScene() {                             // GOSUB52
    this.color(0);
    await this.pause29();
    await this.pic(96);
    await this.pic(134);
    this.locate(0, 24);
    this.print('HELLO, cher voisin...');
    await this.pause29();
    this.print('J\'étais un ami de votre oncle...');
    await this.pause29();
    await this.tick();
    this.print('Entrez!Nous allons faire connaissance...');
    await this.pause29();
    await this.tick();
  }

  async digScene() {                                  // GOSUB54
    await this.pause27();
    await this.pic(138);
    for (let a = 1; a <= 24; a++) { await this.digNote(); await this.tick(); }
    this.C[7] = 2;
  }

  async bagpipe() {                                   // GOSUB56-60
    const intro = 'A1T12O3L18REL6RE#L18DOL6REO2L12LA#LA#LA#L6';
    await this.play(intro);
    await this.play('LA#O3DOL12RERE#FASOL24SOL12FAP');
    await this.play(intro);
    await this.play('O3LA#SOL12LA#L6LA#SOL12LA#L6LA#SOL24FAL12RE#P');
    await this.play(intro);
    await this.play('LA#O3DOL12RERERE#DOL24DOO2L18LA#T5');
  }

  async tooLate() {                                   // ligne 62
    this.print('TROP TARD');
    await this.pic(154);
    await this.shot();
    await this.tick();
    await this.tombDeath();
  }

  specialPickup() {                                   // GOSUB67 -> {B,D}
    if (this.P === 1 && this.L[18] === 1 && this.C[18] === 0) return { B: 18, D: 1 };
    if (this.P === 18 && this.C[17] === 0 && this.L[17] === 18) return { B: 17, D: 0 };
    return { B: 0, D: 3 };
  }

  async reverend() {                                  // GOSUB70
    this.print('Bonjour mon fils.Je suis le Révérend MacMitchum.Le cercueil de ton oncle est au cimetière.J\'attendais que tu le vois unedernière fois avant de l\'inhumer.');
    this.print('Je te laisse, je vais me recueillir.    Vas en paix...');
  }

  // ---------- télégramme final (GOSUB80-84) ----------
  async telegram() {
    if (this.D1 < 6) {
      this.print('Décès oncle non prouvé-STOP');
      this.print('Héritage bloqué-STOP');
      if (this.C[6] === 9 && this.C[19] !== 9) this.print('Couronne expertisée sans valeur-STOP');
    }
    if (this.C[12] === 9) this.print('Couple prison grâce dossier-STOP');
    if (this.D1 === 6) {
      this.print('Alexander bonne santé-STOP');
      this.print('Chasse avec voisin et Long Silver-STOP');
      if (this.C[19] === 8) this.print('Tu aurais pu sauver trésor-STOP');
      else this.print('Il t\'envoie cadeau cornemuse-STOP');
    }
    this.print('SALUTATIONS');
    this.printNoNl('#ERNEST APPLECAKE#');
    await this.waitKey();
    if (this.D1 === 6) { this.dead = true; return true; }
    return false;
  }

  // ---------- boucle principale ----------
  async run() {
    this.reset();
    // ligne 120 : écran de jeu — la console (lignes 18-24) est peinte en
    // blanc comme sur l'original (CLS de la fenêtre CONSOLE avec fond 7)
    this.scr.setWindow(18, 24);
    this.scr.cells.forEach((row, i) => this.scr.cells[i] = new Array(40).fill(null));
    this.scr.clearGraphics(0);
    this.scr.fillRows(18, 24, 4, 7);
    for (let a = 0; a <= 3; a++) this.scr.box(20 + a, 4 + a, 307 - a, 123 - a, 1);
    await this.play('T5');
    await this.gotoRoom(24);
    while (!this.dead) {
      await this.prompt();     // 121
      await this.inputLoop();  // 123-170 + exécution
    }
    if (this.onQuit) this.onQuit();
  }

  async prompt() {             // ligne 121
    this.color(4, 7);
    this.B = 0; this.F = 0;
    this.locate(0, 24);
    this.print('QUE FAITES-VOUS, MISTER ?');
  }

  async inputLoop() {
    let W = '', D = 1;
    this.color(1, 7);
    this.scr.cursor.visible = true;
    for (;;) {
      const a = await this.getKey();
      if (a > 7 && a < 12) {   // flèches -> mouvement immédiat
        this.scr.cursor.visible = false;
        this.B = 45 - a;
        await this.execute();
        return;
      }
      if (a === 29) {          // EFF : efface le dernier mot (ligne 15)
        this.eraseInputLine();
        this.F = 0; W = ''; D = 1;
        if (this.B > 0) this.printNoNl(this.X[this.B] + ' ');
        continue;
      }
      if (a === 13) {          // ENTREE (ligne 12)
        this.color(0, 7);
        if ((this.B > 0 && D === 1) || this.F > 0) {
          this.scr.cursor.visible = false;
          await this.execute();
          return;
        }
        this.color(1, 7);
        continue;
      }
      if (a < 65 || a > 90) continue;
      const z = String.fromCharCode(a);
      this.printNoNl(z);
      W += z; D++;
      if (D < 4) continue;
      // 3 lettres tapées : recherche (lignes 126-170)
      const e = W.charCodeAt(0);
      if (e > 84) { this.eraseAndReprint(); W = ''; D = 1; this.F = 0; continue; }
      const letter = String.fromCharCode(e);
      if (this.B === 0) {
        // verbe (140-144) : balayage de H(E) à H(E+1) inclus
        const max = Math.min(this.H[String.fromCharCode(e + 1)] ?? 33, 33);
        let found = 0;
        for (let idx = this.H[letter]; idx <= max; idx++) {
          if (this.X[idx] && this.X[idx].slice(0, 3) === W) { found = idx; break; }
        }
        if (!found) { this.eraseAndReprint(); W = ''; D = 1; continue; }
        this.B = found;
        this.eraseInputLine();
        this.printNoNl(this.X[this.B] + ' ');
        W = ''; D = 1;
      } else {
        // nom (160-170) : balayage de G(E) à G(E+1) inclus
        const max = Math.min(this.G[String.fromCharCode(e + 1)] ?? 35, 35);
        let found = 0;
        for (let idx = this.G[letter]; idx <= max; idx++) {
          if (this.T[idx] && this.T[idx].slice(0, 3) === W) { found = idx; break; }
        }
        if (!found) { this.eraseAndReprint(); W = ''; D = 1; continue; }
        this.F = found;
        this.eraseInputLine();
        this.printNoNl(this.X[this.B] + ' ' + this.T[this.F]);
        W = ''; D = 1;
        // ambiguïtés CHA / COR (lignes 23-26)
        if (this.F === 7 || this.F === 9) {
          this.printNoNl(this.F === 7 ? '(1)ou CHAUSSURE(2)' : '(1)ou CORDE(2)');
          for (;;) {
            const k = await this.getKey();
            if (k === 50) { this.F += 8; break; }          // '2'
            if (k === 29) { this.eraseInputLine(); this.F = 0; if (this.B > 0) this.printNoNl(this.X[this.B] + ' '); break; }
            if (k === 49) break;                            // '1'
          }
          if (this.F > 0) {
            this.eraseInputLine();
            this.printNoNl(this.X[this.B] + ' ' + this.T[this.F]);
            this.color(0, 7);
            this.scr.cursor.visible = false;
            await this.execute();                           // ligne 26 -> 12
            return;
          }
        }
      }
    }
  }

  eraseInputLine() {
    this.scr.clearRow(this.scr.cursor.row);
    this.locate(0, this.scr.cursor.row);
  }

  eraseAndReprint() {          // ligne 15
    this.eraseInputLine();
    if (this.B > 0) this.printNoNl(this.X[this.B] + ' ');
  }

  // ---------- exécution d'un ordre (lignes 200-301) ----------
  async execute() {
    const B = this.B, F = this.F;
    if (B <= 33) {
      this.print();
      if (this.noNoun[B] && F > 0) {                 // ligne 200
        if (B !== 8) this.insult();
        return;
      }
    }
    // lignes 202-206 : événements automatiques
    if (this.C[1] < 6 && this.C[1] > 1) {
      this.C[1]--;
      if (this.C[1] === 1) { this.C[1] = 8; this.print('AIE!L\'allumette t\'a brûlé!'); }
    }
    if (this.C[0] === 1 && this.P < 25) this.C[0] = 0;
    if (this.L[0] === 1) { this.L[0] = 0; await this.pic(2); }
    if (this.C[7] === 2) {
      await this.coqSniffed();                       // GOSUB700
    } else if ((this.P === 38 && this.D1 === 5) || (this.P === 18 && this.D1 === 1)) {
      await this.confrontation();                    // 750
      return;
    } else if (this.P === 8 && (this.C[3] === 0 || this.C[3] === 2)) {
      const done = await this.dogRoom();             // 790
      if (done) return;
    }
    // ligne 300
    if (B > 33) { await this.move(B - 34); return; }
    await this.dispatch(B, F);
  }

  async coqSniffed() {                               // GOSUB700
    if (this.B === 1 && this.F === 22 && this.C[13] === 9) return;
    await this.pic(139);
    for (let a = 1; a <= 9; a++) { await this.digNote(); await this.tick(); }
    this.C[7] = 0;
  }

  async dispatch(B, F) {
    switch (B) {
      case 1: await this.vActionne(F); break;
      case 2: await this.vAllume(F); break;
      case 3: this.insult(); break;                  // DONNE (hors scènes)
      case 4: case 5: await this.vDetache(F); break; // DETACHE / DECROCHE
      case 6: await this.vDescends(F); break;
      case 7: await this.vEteins(F); break;
      case 8: await this.vEcoute(); break;
      case 9: await this.vEntre(F); break;
      case 10: await this.vEmmene(F); break;
      case 11: case 22: await this.vEnfileMets(F); break;
      case 12: await this.vEnleve(F); break;
      case 13: await this.vFaisSentir(F); break;
      case 14: await this.vFouille(F); break;
      case 15: await this.vFerme(F); break;
      case 16: await this.vGratte(F); break;
      case 17: await this.vInventaire(); break;
      case 18: await this.vJoue(F); break;
      case 19: await this.vLis(F); break;
      case 20: await this.vLache(F); break;
      case 21: await this.vMonte(F); break;
      case 23: await this.vMange(F); break;
      case 24: await this.vOuvre(F); break;
      case 25: await this.vPrends(F); break;
      case 26: await this.vPose(F); break;
      case 27: this.print('To be or not to be, that is the question'); break;
      case 28: await this.vRegarde(F); break;
      case 29: this.insult(); break;                 // REMETS
      case 30: await this.vRame(3); break;           // RAME (ligne 330)
      case 31: await this.vSors(); break;
      case 32: await this.vSuis(F); break;
      case 33: await this.vTire(F); break;
      default: this.insult();
    }
  }

  // ---------- verbes ----------
  async vActionne(F) {                               // 310-318
    if (F === 22) {                                  // ACTIONNE FUSIL
      if (this.C[13] === 2) { this.print('CLIC!?'); return; }
      const { E } = this.checkCarried(F);
      if (E === 9) return;
      this.print('PAN');
      await this.shot();
      this.C[13] = 2;
      if (this.C[7] === 2) {
        this.C[7] = 0; this.L[7] = 27;
        await this.pic(2); await this.pic(140);
      }
      return;
    }
    if (F === 16 && this.P === 8) {                  // ACTIONNE CHENET
      this.praise();
      if (this.N[16] === 0) { this.N[16] = 1; await this.pic(132); }
      else { this.N[16] = 0; this.N[8] = 0; await this.pic(133); }
      return;
    }
    if (F === 27 && this.P === 6) {                  // ACTIONNE LAMPE (salon)
      this.praise();
      if (this.N[3] === 1) { this.N[3] = 0; await this.pic(53); }
      else { this.N[3] = 1; await this.pic(54); }
      return;
    }
    if (F === 14) {                                  // ACTIONNE CLE
      const { E } = this.checkCarried(F);
      if (E === 9) return;
      if ((this.P === 8 && this.N[16] === 1) || (this.P === 11 && this.C[14] !== 0)) {
        await this.vOuvre(8);                        // -> OUVRE COFFRE-FORT
        return;
      }
    }
    if (F === 17 || F === 31) { await this.vTire(F); return; }
    if (F === 2 || F === 9) { await this.vJoue(F); return; }
    if (F === 1) { await this.vGratte(F); return; }
    if (F === 13) {
      if (this.P === 21 && this.N[12] === 0) { await this.vOuvre(12); return; }
      await this.vJoue(F); return;
    }
    this.insult();
  }

  async vAllume(F) {                                 // 320-324
    if (F === 1) { await this.vGratte(F); return; }
    if (F !== 7) { this.insult(); return; }
    if ((this.C[4] === 0 && this.P === 1) || this.C[4] === 9) {
      if ((this.C[1] > 1 && this.C[1] < 5) || this.C[1] === 9) {
        this.praise();
        this.C[1] = 4;
        if (this.C[4] === 0) { this.C[4] = 3; await this.pic(47); return; }
        this.C[4] = 2;
        if (this.P === 14) await this.roomRefresh();
        return;
      }
      const { E } = this.checkCarried(1);
      return;
    }
    this.checkCarried(F);
  }

  async vDetache(F) {                                // 340
    if (F === 9 || F === 20 || F === 23 || F === 25) {
      const { E } = this.checkHere(F);
      if (E === 0) { await this.vPrends(F); return; }
    }
    this.insult();
  }

  async vDescends(F) {                               // 360
    if (this.P === 3) await this.move(2);
    else if (this.P === 13) await this.move(0);
    else if (this.P === 5) await this.move(3);
    else if (this.P === 16) await this.move(1);
    else this.insult();
  }

  async vEteins(F) {                                 // 370-372
    if (F === 1) {
      if (this.C[1] > 1 && this.C[1] < 5) { this.C[1] = 8; this.praise(); return; }
      this.insult(); return;
    }
    if (F === 7) {
      if (this.C[4] === 3 && this.P === 1) { this.C[4] = 0; this.praise(); await this.pic(2); return; }
      if (this.C[4] === 2) { this.C[4] = 9; this.praise(); return; }
    }
    this.insult();
  }

  async vEcoute() {                                  // 380-386
    if (this.P < 3 && this.L[9] === 0) {
      await this.chord47();
      this.print('Il y a quelqu\'un à l\'étage');
      return;
    }
    if ((this.P === 14 || this.P === 7) && this.D1 < 4) { this.print('Tu entends ton oncle!?'); return; }
    if (this.P === 34 && this.D1 < 3) { this.print('On discute ferme dans la maison'); return; }
    if (this.P < 14) this.print('Le manoir est calme');
    else if (this.P < 23) this.print('BOUM!Ton coeur fait BOUM!');
    else if (this.P < 36) this.print('Des corbeaux croassent au loin');
    else this.print('Ca a bougé dans le lac!?');
  }

  async vEntre(F) {                                  // 390-392
    if (F === 0) {
      if (this.P === 29 || this.P === 34 || this.P === 35 || this.P === 22) await this.move(0);
      else this.insult();
      return;
    }
    if (F === 3 || F === 5) {
      if (this.P === 38) { await this.move(3); return; }
      if (this.P === 37) { await this.move(2); return; }
    }
    this.insult();
  }

  async vEmmene(F) {                                 // 400
    if (F !== 6) { this.insult(); return; }
    if (this.P === 8 && this.C[3] === 3) {
      this.praise();
      this.D1 = 2;
      this.take(F);
      await this.pic(2);
      return;
    }
    await this.vPrends(F);
  }

  async vEnfileMets(F) {                             // 410-412
    if (F === 10 || F === 15 || F === 34 || F === 25 || F === 30 || F === 35) {
      const { B } = this.checkHere(F);
      if (this.N[F] > 0 && this.C[this.N[F]] === 2) { this.print('C\'EST DEJA FAIT'); return; }
      const { E } = this.checkCarried(F);
      if (E === 9) return;
      if (F === 10 || F === 34) { this.print('VIVE LE ROI'); return; }
      if (F === 15) { this.print('Trop large!'); return; }
      this.C[this.N[F]] = 2;
      this.praise();
      return;
    }
    this.insult();
  }

  async vEnleve(F) {                                 // 420
    if (F === 25 || F === 30 || F === 35 || F === 10 || F === 34) {
      if (this.C[this.N[F]] === 2) { this.take(F); this.praise(); return; }
      const { E } = this.checkCarried(F);
      if (E === 9) return;
      this.print('C\'EST DEJA FAIT');
      return;
    }
    this.insult();
  }

  async vFaisSentir(F) {                             // 430-436
    if (this.P === 8 && this.C[3] === 3) {
      this.C[3] = 9; this.D1 = 2;
      await this.pic(2);
    } else if (this.C[3] !== 9) { this.print('A QUI?'); return; }
    if (F === 15 || F === 25 || F === 35 || F === 30) {
      const { B, E } = this.checkHere(F);
      if (!(this.C[this.N[F]] === 2 || this.C[this.N[F]] === 9)) { this.checkCarried(F); return; }
      if (F === 15) {
        if (this.P === 8) this.print('Long Silver cherche...');
        else if (this.P < 17) this.print('AH!Il suit une piste qui mène dehors');
        else if (this.P < 38) this.print('Le chien poursuit vers l\'ouest');
        else this.print('Il s\'est arrêté au bord du lac');
      } else this.print('Vous vous êtes lavé récemment?');
      return;
    }
    this.insult();
  }

  async vFouille(F) {                                // 440
    if (F === 21) { await this.vOuvre(F); return; }
    if (F === 26 || F === 4 || F === 32 || (F === 0 && this.P === 6)) { await this.vRegarde(F); return; }
    if (F === 19) { await this.vLis(F); return; }
    this.print('Sans résultat');
  }

  async vFerme(F) {                                  // 450-454
    if (F === 4 && this.P === 7 && this.N[4] === 1) {
      this.praise(); this.N[4] = 0; await this.pic(20); return;
    }
    if (F === 12 && this.P === 21 && this.N[12] === 1) {
      this.N[12] = 0; this.praise(); await this.pic(4); return;
    }
    if (F === 19) { await this.vPrends(F); return; }
    let A = 0, FF = F;
    if (F === 8) {
      if (this.P === 8 && this.N[8] !== 0) { FF = 8; A = 131; }
      else if (this.P === 11 && this.N[21] !== 0) { FF = 21; A = 67; }
      else { this.insult(); return; }
    } else if (F === 33) {
      if (this.P === 2 && this.N[17] === 1) { FF = 17; A = 4; }
      else if (this.P === 17 && this.N[33] === 1) { FF = 33; A = 4; }
      else { this.insult(); return; }
    } else { this.insult(); return; }
    this.N[FF] = 0;
    this.praise();
    await this.pic(A);
  }

  async vGratte(F) {                                 // 460-462
    this.print('GRAT GRAT');
    if (F === 6) { this.print('Il apprécie et te bave dessus'); return; }
    if (F === 1) {
      const { E } = this.checkCarried(F);
      if (E === 0) { this.print('CRACH'); this.C[1] = 5; }
    }
  }

  async vInventaire() {                              // 470-474
    this.printNoNl('TU AS');
    let f = 0;
    for (let a = 1; a <= 20; a++) {
      if (this.C[a] === 9) { f = 1; this.listItem(a); }
      else if (a === 4 && this.C[4] === 2) { this.listItem(a); this.printNoNl(' allumé'); f = 1; }
      else if (a === 13 && this.C[13] === 2) { this.listItem(a); this.printNoNl(' déchargé'); }
      else if ((a === 15 && this.C[15] === 2) || (a === 20 && this.C[20] === 2)) {
        this.listItem(a); this.printNoNl('(sur toi)'); f = 1;
      }
    }
    if (f === 0) this.print(' DU CRAN');
    else this.print();
  }

  async vJoue(F) {                                   // 480-486
    let FF = F === 24 ? 13 : F;
    if (FF !== 2 && FF !== 9 && FF !== 13) { this.insult(); return; }
    const { E } = this.checkCarried(FF);
    if (E === 9) return;
    if (FF === 13) { this.print('Tu as ni balle, ni tee'); return; }
    if (FF === 2) {                                  // JOUE APPEAU
      await this.play('A0L90O5SI#SI');
      if (this.P === 27 && this.C[7] === 0 && this.L[7] === 0) { await this.digScene(); return; }
      if (this.P === 7) {
        if (this.N[4] === 0) { this.N[4] = 1; await this.pic(56); }
        else { this.N[4] = 0; await this.pic(20); }
      }
      return;
    }
    // FF === 9 : CORNEMUSE
    await this.bagpipe();
    if (this.P === 35) {
      await this.pic(96); await this.pic(115);
      await this.pause27();
      await this.pic(4); await this.pic(116);
      this.print('SCOTLAND THE BRAVE !');
      await this.pause27();
      await this.pic(4); await this.pic(115);
      await this.pause27();
      await this.pic(2); await this.pic(4); await this.pic(97);
    }
  }

  async vLis(F) {                                    // 490-499
    if (F === 21) {
      if (this.D1 < 4 && this.C[17] === 9) { this.print('Une lettre'); return; }
      if (this.C[18] === 9) { this.print('Un message pour toi'); return; }
      return;
    }
    if (F === 19 || F === 28 || F === 29 || F === 26) {
      const { E } = this.checkCarried(F);
      if (E === 9) return;
      this.scr.clearRows(18, 24);
      this.locate(0, 18);
      if (F === 19) {
        this.print('C\'est un dossier de Scotland Yard, qui  relate les faits et gestes d\'un couple  français de cambrioleurs, surnommés \'LESPOSTICHES\'');
      } else if (F === 26) {
        this.print('Où tu apprends qu\'il vaut mieux se vêtird\'une toison de mouton pour traverser lelac.');
      } else if (F === 29) {
        this.print('VoTRe OncLe a Eu QUelQueS eNNuIs.SI vOuSVouLeZ lE rEvOiR En boNnE sAnTé,RenDeZ- VouS à L\'eMBarcAdèRE AvEc Le TréSoR');
        this.print('                         MuRdocK');
      } else {
        this.print('DEAR MURDOCK');
        this.print('     Nous sommes contraints de partir.  L\'agent de Scotland Yard, Mac Mitchum, ades soupçons sur nous. De plus, la venue du jeune présomptueux Baskerville n\'a  pas simplifié la fouille du manoir.');
        await this.waitKey();
        this.scr.clearRows(18, 24);
        this.locate(0, 18);
        this.print('On te laisse le trésor, à mon avis il   n\'existe pas. Je te signale qu\'on a mis le vieux sanglier au fond du souterrain.On n\'y accède par la salle des trophées');
        this.print('en utilisant un appeau à coq de bruyère.Bonne chance. Nous rentrons à Paris.');
        this.print('                         LES POSTICHES');
      }
      await this.waitKey();
      this.print();
      return;
    }
    this.insult();
  }

  async vLache(F) {                                  // 500
    if (F !== 6) { this.insult(); return; }
    const { E } = this.checkCarried(F);
    if (E === 9) return;
    this.print('Long Silver s\'enfuit...');
    this.C[3] = 1; this.L[3] = 10;
  }

  async vMonte(F) {                                  // 510, 530
    if (this.P === 10) {
      if (F === 0) { this.insult(); return; }
      this.print('Tu te prends pour Greystoke?');
      return;
    }
    if (this.P === 12 || this.P === 15) { await this.move(0); return; }
    if (this.P === 1 || this.P === 8) { await this.move(2); return; }
    this.insult();
  }

  async vMange(F) {                                  // 530
    if (F === 0) { this.insult(); return; }
    this.print('Tu te prends pour Greystoke?');
  }

  async vOuvre(F) {                                  // 540-549
    if (F === 21) { await this.vLis(21); return; }
    if (F === 12 && this.P === 21 && this.N[12] === 0) {
      if (this.C[8] !== 9) { this.print('Il te faudrait un pied de biche'); return; }
      await this.openFlag(102, 12);
      if (this.C[13] === 0) { this.print('A part un fusil de chasse'); return; }
      this.print('VIDE');
      return;
    }
    if (F === 33) {
      if (this.P === 2 && this.N[17] === 0) {
        await this.openFlag(48, 17);
        if (this.C[1] === 0) { this.print('UNE ' + this.T[1]); return; }
        this.print('VIDE');
        return;
      }
      if (this.P === 17 && this.N[33] === 0) {
        await this.openFlag(62, 33);
        if (this.C[12] === 0) { this.print('UN ' + this.T[19]); return; }
        this.print('VIDE');
        return;
      }
      this.insult(); return;
    }
    if (F === 8 && this.P === 8 && this.N[16] === 1 && this.N[8] === 0) {
      const { E } = this.checkCarried(14);
      if (E === 9) return;
      if (this.C[19] === 0) {
        this.N[8] = 1;
        await this.pic(68);
        this.print('LE TRESOR DE CHARLES-EDOUARD!');
        this.print('(Emploies le mot TRESOR)');
        return;
      }
      this.N[8] = 2;
      await this.pic(69);
      this.print('VIDE');
      return;
    }
    if (F === 8 && this.P === 11 && this.C[14] !== 0 && this.N[21] === 0) {
      const { E } = this.checkCarried(14);
      if (E === 9) return;
      if (this.C[6] === 0) {
        this.N[21] = 1;
        await this.pic(68);
        this.print('UNE ' + this.T[10]);
        return;
      }
      this.N[21] = 2;
      await this.pic(69);
      this.print('VIDE');
      return;
    }
    this.insult();
  }

  async vPrends(F) {                                 // 550-557
    if (F === 21) {                                  // ENVELOPPE
      const { B, D } = this.specialPickup();
      if (D < 2) {
        this.C[B] = 9;
        await this.pic(4);
        if (B === 18) this.D1 = 5;
        await this.vLis(21);
        return;
      }
      // sinon continue plus bas
    }
    if (F === 6 && this.C[3] === 3) { await this.vEmmene(6); return; }
    const { B, E } = this.checkHere(F);
    if (F === 22 || F === 7) {
      if (B > 0 && this.C[B] === 3) {
        this.C[B] = 2;
        if (F === 7) { await this.pic(2); await this.pic(4); return; }
        this.praise();
        return;
      }
    }
    if (E === 9) {
      if (B === 0) { this.insult(); return; }
      this.insult(); return;
    }
    if (E === 1) { this.take(F); this.praise(); return; }
    if (E !== 0) { this.insult(); return; }
    // E = 0 : objet encore "caché" (lignes 553-557)
    let A = 0;
    if (B === 1) A = 17;
    else if (B === 6) A = 21;
    else if (B === 12) { this.D1 = 3; this.L[17] = 18; A = 33; }
    else if (B === 13) A = 12;
    else if (B === 19) A = 8;
    else {
      this.praise();
      this.take(F);
      if (B === 4 || B === 11 || B === 17 || B === 18) await this.pic(4);
      else if (B === 16) return;
      else if (B === 14) await this.pic(67);
      else await this.pic(2);
      return;
    }
    if (this.N[A] !== 1) { this.insult(); return; }
    this.praise();
    if (B === 6 || B === 19) { this.N[A] = 2; await this.pic(69); }
    this.take(F);
  }

  async vPose(F) {                                   // 560-562
    const { B } = this.checkHere(F);
    if ((F === 7 || F === 25 || F === 35) && this.N[F] > 0 && this.C[this.N[F]] === 2) {
      this.L[this.N[F]] = this.P; this.C[this.N[F]] = 1; this.praise(); return;
    }
    if (F === 22 && this.N[F] > 0 && this.C[this.N[F]] === 2) {
      this.L[this.N[F]] = this.P; this.C[this.N[F]] = 3; this.praise(); return;
    }
    const { E } = this.checkCarried(F);
    if (E === 9) return;
    this.L[this.N[F]] = this.P;
    this.C[this.N[F]] = 1;
    this.praise();
  }

  async vRegarde(F) {                                // 580-589
    if ((F === 4 || F === 0 || F === 26) && this.P === 6 && this.C[16] === 0) {
      this.print('Il y a un livre en français : LE MONSTREDU LOCH NESS EXISTE, JE L\'AI RENCONTRE, guide destiné aux Sassenach (étrangers),par Léon & Paule Vandeleur,scientifiquesbelges du F.R.I.T.');
      return;
    }
    if (this.P === 8 && (this.C[3] === 0 || this.C[3] === 2) && (F === 0 || F === 6)) {
      this.print('Long Silver a faim');
      return;
    }
    if (F === 26 || F === 19 || F === 21 || F === 28 || F === 29) { await this.vLis(F); return; }
    if (F === 34 && this.C[19] === 9) { this.print('Authentique'); return; }
    if (F === 10 && this.C[6] === 9) { this.print('C\'est du toc!!!'); return; }
    if (this.P === 21 && this.D1 > 1 && (F === 32 || F === 0)) {
      this.print('Il est mort étranglé!');
      this.print('Il porte l\'insigne de Scotland Yard!..');
      return;
    }
    if (F !== 0) { this.print('Sans intérêt'); return; }
    let any = false;
    for (let a = 1; a <= 20; a++) if (this.L[a] === this.P && this.C[a] === 1) any = true;
    if (any) { await this.remarks(); return; }
    if (this.P === 9 && this.C[15] === 0) { this.print('Un kilt'); return; }
    const { D } = this.specialPickup();
    if (D < 2) this.print('UNE ' + this.T[21]);
    else this.print('Wait and see');
  }

  async vRame(F) {                                   // 330 -> 390
    if (this.P === 38) { await this.move(3); return; }
    if (this.P === 37) { await this.move(2); return; }
    this.insult();
  }

  async vSors() {                                    // 350
    if (this.P === 1 || this.P === 18 || this.P === 17 || this.P === 20) { await this.move(1); return; }
    if (this.P === 16) { await this.move(0); return; }
    this.insult();
  }

  async vSuis(F) {                                   // 520-522
    if (F !== 6) { this.insult(); return; }
    const { E } = this.checkCarried(F);
    if (E !== 0) return;
    if (this.P === 8) { await this.move(2); return; }
    if (this.P < 17) { this.praise(); await this.gotoRoom(29); return; }
    if (this.P === 38) { await this.vFaisSentir(15); return; }
    this.praise();
    await this.gotoRoom(38);
  }

  async vTire(F) {                                   // 590-592
    if (F === 33) { await this.vOuvre(33); return; }
    if ((F === 31 || F === 17) && this.P === 10) {
      this.praise();
      if (this.N[5] === 0) { this.N[5] = 1; await this.pic(63); }
      else { this.N[5] = 0; await this.pic(64); }
      return;
    }
    this.insult();
  }

  // ---------- déplacements (650-680) ----------
  async move(dir) {
    let F = this.exits[this.P][dir];
    if (F === 99) { await this.gotoRoom(this.O); return; }
    if (F === 42) { await this.askAbandon(); return; }
    if (F === 41) { this.print('L\'eau du lac est trop froide!'); return; }
    if (F === 65) { this.darkBump(); return; }
    if (F > 60) {
      F -= 50;
      if ((F === 12 && this.N[3] === 0) || (F === 13 && this.N[5] === 0) || (F === 14 && this.N[4] === 0)) F = 0;
    }
    if ((F === 18 && (this.D1 === 1 || this.D1 === 2)) || (F === 17 && this.D1 < 2)) F = 43;
    if (F === 0) { this.print('Bing!Dans le mur!'); return; }
    if (F === 43) { this.print('La porte est fermée'); return; }
    if (F === 44) { await this.drown(); return; }
    if ((F === 14 || F === 15) && this.C[4] !== 2) {
      await this.pic(1); await this.pic(7);
      await this.gosub97();
      if (this.P === 7) this.P = F;
      this.darkBump();
      return;
    }
    await this.gotoRoom(F);
  }

  // ---------- arrivée dans un lieu (1000-1020) ----------
  async gotoRoom(A) {
    for (;;) {
      this.O = this.P;
      this.P = A;
      if (this.P === 33) {                           // 1001
        if (this.O === 37) { await this.pic(151); await this.pause27(); }
        else {
          await this.pic(149);
          if (this.C[3] === 9) {
            this.print('KAI!KAI!Long Silver s\'enfuit apeuré!');
            this.C[3] = 8;
            await this.pause29();
          } else await this.pause27();
        }
      }
      await this.pic(1);                             // 1003
      await this.roomRefresh();                      // 1004
      const tele = await this.roomHandler();         // 1005
      this.showName();                               // 1020
      if (tele !== undefined && tele !== null && tele < 0) { A = Math.abs(tele); continue; }
      this.locate(0, 24);
      this.color(0, 0);
      await this.remarks();
      return;
    }
  }

  async roomRefresh() {                              // 1004
    await this.pic(this.roomPic[this.P]);
    await this.gosub97();
    this.color(4, 7);
  }

  async roomHandler() {
    switch (this.P) {
      case 1: {                                      // 800
        this.W = 'Dans le manoir des Baskerville';
        if (this.C[4] === 0) { await this.pic(46); return; }
        if (this.C[4] === 3) { await this.pic(46); await this.pic(47); return; }
        if (this.D1 === 4) { await this.pic(91); return; }
        return;
      }
      case 2: {                                      // 804
        this.W = 'Dans le manoir des Baskerville';
        if (this.N[17] === 1) await this.pic(48);
        return;
      }
      case 3: {                                      // 808
        this.W = "A l'étage";
        this.showName();
        if (this.L[9] === 0) {
          this.L[9] = 13; this.L[10] = 12;
          await this.vandeleurFlee();
        }
        return;
      }
      case 4: {                                      // 812
        this.W = 'Dans le manoir des Baskerville';
        if (this.C[5] === 0) await this.pic(49);
        return;
      }
      case 5: this.W = 'A la cuisine'; return;       // 816
      case 6: {                                      // 820-822
        this.W = 'Au salon';
        if (this.O === 12) this.N[3] = 1;
        await this.pic(this.N[3] === 1 ? 54 : 53);
        return;
      }
      case 7: {                                      // 824
        this.W = 'La salle des trophées';
        if (this.N[4] === 1) await this.pic(56);
        return;
      }
      case 8: {                                      // 828
        this.W = 'Au sous-sol';
        if (this.C[3] === 0 || this.C[3] === 2) {
          this.C[3] = 0;
          await this.pic(144); await this.pic(145);
          return;
        }
        if (this.C[3] === 3) { await this.pic(145); return; }
        if (this.N[16] === 1) {
          await this.pic(132);
          if (this.N[8] === 1) await this.pic(68);
          else if (this.N[8] === 2) await this.pic(69);
        }
        return;
      }
      case 9: {                                      // 832
        this.W = "La chambre d'ami";
        if (this.C[15] === 0) await this.pic(128);
        return;
      }
      case 10: {                                     // 836
        this.W = "Oncle Alexander's bedroom";
        if (this.O === 13) this.N[5] = 1;
        if (this.N[5] === 1) await this.pic(63);
        return;
      }
      case 11: {                                     // 840
        this.W = "Prince Charles-Edouard's bedroom";
        let a;
        if (this.C[14] === 0) a = 66;
        else if (this.N[21] === 0) a = 67;
        else if (this.N[21] === 1) a = 68;
        else a = 69;
        await this.pic(a);
        return;
      }
      case 12: {                                     // 844
        this.W = 'Secret passage';
        const { E } = this.checkHere(15);
        if (E === 0) await this.pic(57);
        return;
      }
      case 13: {                                     // 848
        this.W = 'Secret passage';
        const { E } = this.checkHere(14);
        if (E === 0) await this.pic(70);
        return;
      }
      case 14: case 16: this.W = 'Secret passage'; return;
      case 15: return this.unclePrison();            // 856
      case 17: {                                     // 864
        this.W = 'Au presbytère';
        if (this.N[33] === 1) await this.pic(62);
        return;
      }
      case 18: {                                     // 868-869
        this.W = 'Chez les Vandeleur';
        this.showName();
        if (this.D1 === 0) {
          this.D1 = 1;
          await this.vandeleurScene();
          this.C[2] = 9;
          return;
        }
        if (this.L[17] === 18 && this.C[17] === 0) await this.pic(90);
        return;
      }
      case 19: case 28: this.W = 'Dans les marais de Grimpen'; return;
      case 20: {                                     // 876-877
        this.W = 'A la chapelle';
        this.showName();
        if (this.C[11] === 0) await this.pic(58);
        if (this.N[32] === 0 && this.D1 < 2) {
          this.N[32] = 1;
          await this.pic(126);
          this.locate(0, 24);
          this.color(0, 0);
          await this.reverend();
          await this.waitKey();
          await this.pic(2);
          await this.pic(41);
        }
        return;
      }
      case 21: {                                     // 880-881
        this.W = 'Au cimetière';
        await this.pic(101);
        if (this.N[12] === 1) await this.pic(102);
        if (this.D1 > 1) await this.pic(112);
        return;
      }
      case 22: this.W = "St Patrick's Church"; return;
      case 23: case 24: case 25: case 26: case 27: {  // 94
        this.W = "Sur la lande pourpre de l'automne";
        if (this.P === 27 && this.C[7] === 0 && this.L[7] === 27) await this.pic(140);
        return;
      }
      case 29: case 30: this.W = 'Aux abords du manoir'; return;
      case 31: {                                     // 904
        this.W = 'Au Square';
        if (this.O === 16) {
          await this.pic(85);
          await this.pause29();
          await this.tick();
          this.L[0] = 1;
        }
        return;
      }
      case 32: {                                     // 908
        this.W = 'Au terrain de golf';
        if (this.C[8] === 0) await this.pic(89);
        return;
      }
      case 33: return this.lochCrossing();           // 912-915
      case 34: {                                     // 916
        await this.pic(97);
        this.W = 'Une petite maison dans la prairie';
        this.showName();
        if (this.D1 === 0) await this.neighborScene();
        return;
      }
      case 35: return this.shepherd();               // 920-923
      case 36: this.W = 'LOCH NESS'; return;
      case 37: this.W = "A l'embarcadère"; return;
      case 38: return this.murdockPier();            // 932-933
      case 39: case 40: this.W = 'Sur une rive du Loch Ness'; return;
      default: this.W = ''; return;
    }
  }

  async unclePrison() {                              // 856-858
    this.W = 'HELLO!TONTON ALEXANDER!';
    this.showName();
    this.color(0, 0);
    await this.pic(136);
    this.locate(0, 24);
    this.print('ENFIN!Te voilà neveu!C\'est pas trop tôt!Ca fait un mois que j\'ai été enfermé icipar ces escrocs de Vandeleur.');
    await this.waitKey();
    this.print('Jamais je n\'avouerai qu\'on trouve le    trésor en actionnant le CHENET du sous- sol. Jamais!');
    if (this.C[6] === 9) this.print('La couronne que tu as, c\'est du toc');
    await this.waitKey();
    await this.pic(137);
    this.print('Et maintenant, donnes-moi ce chandelier et rentrons au manoir...');
    this.C[7] = 8;
    this.D1 = 4;
    this.L[18] = 1;
    await this.pic(7);
    await this.chord47();
  }

  async lochCrossing() {                             // 912-915
    this.W = 'LOCH NESS';
    this.showName();
    if ((this.O === 38 && this.C[20] !== 2) || this.D1 === 5) {
      await this.nessie();
      if (this.D1 === 5) return;
      await this.askReplay();
      return;
    }
    if (this.O === 38) {
      await this.pic(142);
      await this.rowTicks();
      return -37;
    }
    if (this.O === 37) {
      await this.pic(143);
      await this.rowTicks();
      return -38;
    }
  }

  async shepherd() {                                 // 920-923
    await this.pic(97);
    this.W = 'Une petite maison dans la prairie';
    this.showName();
    if (this.C[20] === 0 && this.C[0] === 0) {
      await this.pause29();
      this.C[0] = 1;
      await this.pic(96);
      await this.pic(115);
      await this.pause29();
      this.locate(0, 24);
      this.color(0, 0);
      await this.pic(4);
      await this.pic(116);
    } else return;
    if (this.C[15] === 9) {
      this.print('WHERE\'S KILT?');
      await this.pause29();
    } else if (this.C[15] === 2) {
      this.print('GOOD BOY BASKERVILLE');
      await this.pause29();
      await this.pic(4);
      await this.pic(129);
      this.print('TAKE SHEEP');
      this.C[20] = 9;
      await this.waitKey();
    } else {
      this.print('SASSENACH !');
      this.print('(Vu ton allure, ça ne fait aucun doute)');
      await this.pause29();
    }
    await this.pic(4);
    await this.pic(115);
    if (this.C[15] === 2) this.print('GOOD LUCK');
    await this.pause27();
    await this.pic(2);
    await this.pic(4);
    await this.pic(97);
  }

  async murdockPier() {                              // 932-933
    this.W = "A l'embarcadère";
    this.showName();
    if (this.D1 !== 5) return;
    await this.pic(155);
    this.locate(0, 24);
    this.color(0, 0);
    this.print('WELCOME!Je suis le cocher Murdock, aliasle fantôme. Grâce à une indiscrétion du notaire, j\'ai appris que votre oncle    détenais un trésor.');
    await this.waitKey();
    this.print('Alors petit, envoies la couronne sinon  Tonton Alexander risque de mourir pour  de bon!..');
  }

  // ---------- confrontations (750-793) ----------
  async confrontation() {                            // 750-782
    const B = this.B, F = this.F;
    if (B === 27) this.print('To be or not to be, that is the question');
    if (this.P === 18) {
      // Chez les Vandeleur après la scène : seuls SORS (31) ou la flèche
      // bas (B=35) sont tolérés, tout le reste finit mal (ligne 760).
      if (B === 31) { await this.vSors(); return; }
      if (B === 35) { await this.move(1); return; }
      await this.tooLate();
      return;
    }
    // P = 38, D1 = 5 : Murdock attend le trésor
    if (this.C[19] !== 9 && this.C[6] !== 9) {
      this.print('Mais...Tu n\'as pas apporté le trésor!..');
      await this.murdockPunch();
      this.print('Mince, j\'ai dû tapé trop fort!');
      await this.tombDeath();
      return;
    }
    if ((B === 3 || B === 26) && (F === 34 || F === 10)) {
      const { E } = this.checkCarried(F);
      if (E === 0) {
        this.print('C\'est bien gamin, tu es raisonnable');
        this.C[this.N[F]] = 8;
        await this.happyEnd(this.N[F]);
        return;
      }
    }
    await this.murdockGrabs();
  }

  async murdockGrabs() {                             // 780-782
    await this.murdockPunch();
    this.print('Merci pour le cadeau, Oeil Poché!');
    const b = this.C[19] === 9 ? 19 : 6;
    this.C[b] = 8;
    await this.happyEnd(b);
  }

  async happyEnd() {                                 // 775
    await this.pause29();
    await this.pic(155);
    await this.pic(4);
    this.print('Affaire règlée');
    await this.pause29();
    this.print('Allez au diable, Chiens de Baskerville!');
    await this.pause29();
    this.P = 33;
    await this.pic(1);
    await this.roomRefresh();
    this.locate(15, 11);
    this.color(1, 6);
    this.scr.print('FIN', { newline: false, big: true });
    this.locate(0, 24);
    await this.bagpipe();
    this.D1 = 6;
    await this.finalTelegram();
  }

  async dogRoom() {                                  // 790-793 (P=8, chien affamé)
    const B = this.B, F = this.F;
    if (B === 1 && F === 22) { await this.dogAttack(); return true; }
    if ((B === 3 || B === 26) && F === 11) {
      const { E } = this.checkCarried(F);
      if (E === 0) {
        this.C[3] = 3;
        await this.pic(147);
        this.print('MIAM...SLURP');
        await this.pause29();
        await this.pic(145);
        this.C[7] = 8;
        return true;
      }
      await this.dogAttack();
      return true;
    }
    if (B === 28 || B === 21 || B === 36) return false;   // REGARDE, MONTE, flèche haut
    if (this.C[3] === 2) { await this.dogAttack(); return true; }
    this.C[3] = 2;
    await this.pic(146);
    this.print('GRR...');
    if (B === 5 || B === 4 || B === 10 || B === 13 || B === 20 || B === 25 || B === 3) return true;
    return false;
  }

  // ---------- abandon / fin (3000-3005) ----------
  async askAbandon() {
    this.locate(0, 24);
    this.print('VEUX-TU REVENIR EN FRANCE ET ABANDONNER LA PARTIE?');
    for (;;) {
      const k = await this.getKey();
      if (k === 78) return;                          // N
      if (k === 79) break;                           // O
    }
    await this.finalTelegram();
  }

  async finalTelegram() {                            // 3001
    this.scr.setWindow(0, 24);
    this.scr.cls();
    this.locate(0, 0);
    this.color(0, 5);
    this.print('TELEGRAMME : Inverness-24/12/90-');
    this.color(0, 1);
    const won = await this.telegram();
    if (won) { this.dead = true; await this.askReplay(true); return; }
    await this.askReplay();
  }

  async askReplay(end = false) {                     // 3002-3005
    this.color(2, 7);
    this.locate(0, 24);
    this.scr.clearRow(24);
    this.locate(0, 24);
    this.printNoNl('VEUX-TU REJOUER?');
    for (;;) {
      const k = await this.getKey();
      if (k === 79) { this.dead = true; this.replay = true; break; }  // O
      if (k === 78) { this.dead = true; this.replay = false; break; } // N
    }
    throw new GameRestart(this.replay);
  }
}

export class GameRestart extends Error {
  constructor(replay) { super('restart'); this.replay = replay; }
}
