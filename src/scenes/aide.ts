/**
 * « Comment jouer » : l'onboarding consultable à tout moment.
 *
 * Six pages courtes plutôt qu'un mur de texte, et surtout **une illustration par page**
 * tirée des vraies planches du jeu : la page sur les hautes herbes montre la tuile qui
 * déclenche les rencontres, celle sur la capture montre le prisme. Décrire un élément
 * qu'on n'a jamais vu ne sert à rien ; le montrer suffit souvent.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import { COULEURS } from '../ui/draw.ts';
import type { CleTexte } from '../i18n/index.ts';

interface Page {
  readonly titre: CleTexte;
  readonly texte: CleTexte;
  /** Vignette dessinée au-dessus du texte. */
  readonly illustration: (jeu: Jeu, centreX: number, y: number) => void;
}

const PAGES: readonly Page[] = [
  {
    titre: 'aide.but.titre',
    texte: 'aide.but.texte',
    illustration: (jeu, centreX, y) => {
      // Le trajet : bourg → routes → arène, avec un jalon par région.
      const peintre = jeu.peintre;
      const total = 8;
      const pas = 26;
      const depart = centreX - ((total - 1) * pas) / 2;
      for (let index = 0; index < total; index++) {
        const x = depart + index * pas;
        if (index > 0) peintre.remplir(x - pas + 5, y + 7, pas - 10, 2, COULEURS.texteAttenue);
        const dernier = index === total - 1;
        peintre.remplir(x - 4, y + 2, 8, 12, dernier ? COULEURS.selection : COULEURS.pvFond);
      }
      peintre.personnage('heros', 'sud', 0, depart - 8, y - 6);
    },
  },
  {
    titre: 'aide.controles.titre',
    texte: 'aide.controles.texte',
    illustration: (jeu, centreX, y) => {
      const peintre = jeu.peintre;
      // Croix directionnelle stylisée, puis les deux touches d'action.
      const touche = (x: number, cy: number, libelle: string): void => {
        peintre.remplir(x, cy, 13, 13, COULEURS.pvFond);
        peintre.texteCentre(libelle, x + 7, cy + 1, { couleur: COULEURS.texteInverse });
      };
      touche(centreX - 46, y, '▲');
      touche(centreX - 60, y + 14, '◀');
      touche(centreX - 46, y + 14, '▼');
      touche(centreX - 32, y + 14, '▶');
      peintre.texte('E', centreX + 6, y + 7, { couleur: COULEURS.texteInverse });
      peintre.texte('M', centreX + 40, y + 7, { couleur: COULEURS.texteInverse });
    },
  },
  {
    titre: 'aide.herbes.titre',
    texte: 'aide.herbes.texte',
    illustration: (jeu, centreX, y) => {
      // Herbe rase à gauche, hautes herbes à droite : la comparaison fait comprendre
      // plus vite que la description.
      for (let index = 0; index < 3; index++) {
        jeu.peintre.tuile('herbe', 0, centreX - 52 + index * 17, y);
        jeu.peintre.tuile('herbesHautes', 0, centreX + 6 + index * 17, y);
      }
      jeu.peintre.personnage('heros', 'est', 1, centreX - 12, y - 5);
    },
  },
  {
    titre: 'aide.capture.titre',
    texte: 'aide.capture.texte',
    illustration: (jeu, centreX, y) => {
      jeu.peintre.icone('prisme', centreX - 30, y);
      jeu.peintre.icone('prismeAncre', centreX - 8, y);
      jeu.peintre.icone('prismeRoyal', centreX + 14, y);
    },
  },
  {
    titre: 'aide.seed.titre',
    texte: 'aide.seed.texte',
    illustration: (jeu, centreX, y) => {
      jeu.peintre.panneau(centreX - 58, y - 2, 116, 18);
      jeu.peintre.texteCentre(jeu.state.seedText, centreX, y + 3, { couleur: COULEURS.texteAccent });
    },
  },
  {
    titre: 'aide.sauvegarde.titre',
    texte: 'aide.sauvegarde.texte',
    illustration: (jeu, centreX, y) => {
      jeu.peintre.icone('carte', centreX - 8, y);
    },
  },
];

export class SceneAide implements Scene {
  readonly nom = 'aide';
  readonly opaque = true;

  private page = 0;

  mettreAJour(jeu: Jeu): void {
    if (jeu.entrees.pressee('annuler')) {
      jeu.retirer();
      return;
    }
    if (jeu.entrees.pressee('est') || jeu.entrees.pressee('sud') || jeu.entrees.pressee('valider')) {
      // Passé la dernière page, on referme : l'aide ne doit pas devenir un piège.
      if (this.page >= PAGES.length - 1) jeu.retirer();
      else this.page += 1;
    }
    if (jeu.entrees.pressee('ouest') || jeu.entrees.pressee('nord')) {
      this.page = Math.max(0, this.page - 1);
    }
  }

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const page = PAGES[this.page]!;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, COULEURS.fond);
    peintre.panneau(8, 8, VIRTUAL_WIDTH - 16, VIRTUAL_HEIGHT - 16);

    peintre.texte(jeu.t('aide.titre'), 18, 14, { couleur: COULEURS.texteAccent });
    peintre.texteDroite(
      jeu.t('aide.page', { page: this.page + 1, total: PAGES.length }),
      VIRTUAL_WIDTH - 18,
      14,
      { couleur: COULEURS.texteAttenue },
    );

    peintre.texteCentre(jeu.t(page.titre), VIRTUAL_WIDTH / 2, 32);
    page.illustration(jeu, VIRTUAL_WIDTH / 2, 50);
    peintre.texteCentreBloc(jeu.t(page.texte), VIRTUAL_WIDTH / 2, 84, VIRTUAL_WIDTH - 48, {
      couleur: COULEURS.texte,
    });

    // Points de progression : on voit d'un coup d'œil combien de pages restent.
    const largeurPoints = PAGES.length * 8;
    PAGES.forEach((_, index) => {
      const x = VIRTUAL_WIDTH / 2 - largeurPoints / 2 + index * 8;
      peintre.remplir(x, VIRTUAL_HEIGHT - 32, 5, 5, index === this.page ? COULEURS.selection : COULEURS.pvFond);
    });
    peintre.texteCentre(jeu.t('aide.suite'), VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 22, {
      couleur: COULEURS.texteAttenue,
    });
  }
}
