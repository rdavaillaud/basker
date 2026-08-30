// Portage de JEU.BAS : générique animé (CHIP présente, le cocher effrayé),
// crédits, page d'explications. Échap pour passer.

export class IntroSkip extends Error {}

export class Intro {
  constructor({ screen, audio, pics, input }) {
    this.scr = screen;
    this.snd = audio;
    this.pics = pics;
    this.input = input;
  }

  check() { if (this.input.consumeSkip()) throw new IntroSkip(); }
  async pic(n) { this.pics.execJ(n); this.scr.dirty = true; this.check(); }
  async tick() { this.pics.execK(); this.scr.dirty = true; }
  async play(s) { await this.snd.play(s); this.check(); }

  // GOSUB8 : bouche du cocher qui remue (images 7, 8, 6)
  async mouth() {
    await this.play('L16P');
    for (const a of [7, 8, 6]) { await this.pic(a); await this.play('T9L9PPP'); }
  }

  async run() {
    const scr = this.scr;
    scr.setWindow(0, 24);
    scr.cls();
    scr.clearGraphics(0);
    await this.play('T9L76A2O5SIPP');

    // lignes 50-64 : logo CHIP animé
    await this.pic(1);
    await this.play('T9L60P');
    scr.color(4, 6);
    await this.pic(3);
    for (let b = 1; b <= 29; b++) {
      await this.play('T4A100O5L7DOREPP');
      if (b === 7 || b === 14 || b === 21) await this.play('L2A59O5DO');
      if (b === 18) {
        scr.locate(7, 2);
        scr.print('CHIP PRESENTE', { newline: false, big: true });
      }
      await this.tick();
    }
    scr.locate(5, 2);
    scr.clearRow(2); scr.clearRow(3);
    scr.locate(5, 2);
    scr.color(1, 6);
    scr.print('* Le Trésor des Baskerville *', { newline: false });
    await this.play('T5L96PA1L24O4DOSILASOLAPLASOLASOREL96PP');

    // lignes 70-74 : le cocher refuse d'aller plus loin
    await this.pic(5);
    scr.color(1, 6);
    const say = async (col, row, txt) => {
      await this.mouth();
      scr.locate(col, row);
      scr.print(txt, { newline: false });
    };
    await say(19, 3, 'Je regrette, Sir');
    await say(19, 4, 'Je ne vais pas');
    scr.locate(20, 5); scr.print('plus loin', { newline: false });
    await say(19, 6, "J'ai trop peur");
    await say(19, 8, 'Je vous en supplie');
    await say(19, 9, "N'y allez pas !");

    // lignes 76-78 : la réponse du jeune Baskerville, tapée à la machine
    await this.play('T9L96PP');
    await this.pic(1);
    await this.pic(4);
    const w = "Non, cocher ! J'ai fait le voyage jusqu'ici pour me rendre compte de l'héritage de mon oncle, je ne peux plus reculer ! Je continue à pied.";
    scr.locate(0, 17);
    scr.color(0, 1);
    for (const ch of w) {
      scr.putChar(ch);
      await this.play('T5L7O4A9P');
    }
    await this.play('T5L96PP');

    // lignes 80-84 : générique
    scr.cls();
    await this.pic(5);
    scr.color(5, 6);
    await this.mouth();
    scr.locate(18, 2); scr.print('comme vous voudrez...', { newline: false });
    await this.mouth();
    scr.color(1, 6);
    scr.locate(19, 4); scr.print('Ce jeu a été', { newline: false });
    scr.locate(23, 5); scr.print('réalisé par', { newline: false });
    await this.mouth();
    scr.locate(22, 7); scr.color(0, 6); scr.print('ANDRE ROCQUES', { newline: false });
    await this.mouth();
    scr.locate(19, 11); scr.color(1, 6); scr.print('Les dessins sont de', { newline: false });
    await this.mouth();
    scr.locate(22, 13); scr.color(4, 6); scr.print('PAUL DUPLIERTO', { newline: false });
    await this.mouth();
    scr.locate(20, 15); scr.color(1, 6); scr.print('-COPYRIGHT CHIP 87-', { newline: false });
    await this.play('T9L96PPPP');
  }

  // lignes 10-22 : page d'explications
  async explain() {
    const scr = this.scr;
    scr.setWindow(0, 24);
    scr.cls();
    scr.clearGraphics(6);
    scr.color(1, 3);
    scr.locate(10, 1);
    scr.print('QUELQUES EXPLICATIONS', { newline: false });
    scr.color(0, 6);
    scr.locate(1, 3);
    scr.print('MANIPULATIONS', { newline: false });
    scr.color(4, 6);
    scr.locate(0, 4);
    scr.print("Pour entrer un ordre, ne tapez que les 3premières lettres du mot, l'ordinateur lecomplètera ou l'effacera selon qu'il le reconnait ou non.");
    scr.print("Un ordre comprend un verbe seul (ex :    PARLEMENTE) ou un verbe suivi d'un nom  (ex : ACTIONNE FUSIL).");
    scr.color(0, 7); scr.print('ENTREE', { newline: false });
    scr.color(4, 6); scr.print(" valide l'ordre");
    scr.color(0, 7); scr.print('EFF', { newline: false });
    scr.color(4, 6); scr.print(' (retour arrière) efface le dernier mot');
    scr.print('');
    scr.color(1, 6); scr.print(' DEPLACEMENTS', { newline: false }); scr.color(4, 6);
    scr.print('');
    scr.print('Utilisez les 4 flèches');
    scr.print('');
    scr.color(1, 6); scr.print(' EXCEPTIONS', { newline: false }); scr.color(4, 6);
    scr.print('');
    scr.print('Les verbes et les noms tombent sous le  sens, exceptions faites pour');
    scr.print(' FAIS SENTIR et');
    scr.print(' INVENTAIRE, ce dernier vous donnant la liste de ce que vous possédez.');
    scr.color(0, 3);
    scr.locate(7, 24);
    scr.print('Appuyez sur une touche pour jouer', { newline: false });
    this.input.consumeSkip();
    await this.input.getKey();
  }
}
