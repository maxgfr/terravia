/**
 * Réglages, ouverts par l'engrenage en haut à droite.
 *
 * Cet écran est joignable **partout** — écran-titre, monde, menu — parce qu'il porte le
 * choix de la langue : un joueur qui ne comprend pas le premier écran doit pouvoir en
 * changer sans deviner comment naviguer.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import { LANGUES } from '../i18n/index.ts';
import { enregistrerLanguePreferee } from '../save/storage.ts';
import { COULEURS } from '../ui/draw.ts';
import { SceneAide } from './aide.ts';

const ENTREES = ['parametres.langue', 'parametres.commentJouer', 'menu.retour'] as const;

export class SceneParametres implements Scene {
  readonly nom = 'parametres';

  private selection = 0;

  mettreAJour(jeu: Jeu, step: number): void {
    if (jeu.dialogue.actif) {
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }

    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + 1) % ENTREES.length;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - 1 + ENTREES.length) % ENTREES.length;
    if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('menu')) {
      jeu.retirer();
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;

    switch (ENTREES[this.selection]) {
      case 'parametres.langue': {
        // Bascule circulaire : avec deux langues, c'est un aller-retour ; avec trois,
        // ce serait toujours juste.
        const index = LANGUES.indexOf(jeu.langue);
        jeu.state.langue = LANGUES[(index + 1) % LANGUES.length]!;
        enregistrerLanguePreferee(jeu.state.langue);
        break;
      }
      case 'parametres.commentJouer':
        jeu.pousser(new SceneAide());
        break;
      default:
        jeu.retirer();
    }
  }

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 'rgba(11, 15, 20, 0.78)');

    const hauteur = ENTREES.length * 15 + 40;
    const y = VIRTUAL_HEIGHT / 2 - hauteur / 2;
    peintre.panneau(VIRTUAL_WIDTH / 2 - 86, y, 172, hauteur);
    peintre.texte(jeu.t('parametres.titre'), VIRTUAL_WIDTH / 2 - 74, y + 8, {
      couleur: COULEURS.texteAccent,
    });

    ENTREES.forEach((cle, index) => {
      const ligneY = y + 26 + index * 15;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', VIRTUAL_WIDTH / 2 - 76, ligneY, { couleur: COULEURS.selection });
      peintre.texte(jeu.t(cle), VIRTUAL_WIDTH / 2 - 64, ligneY, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
    });

    peintre.texteCentre(jeu.t('aide.fermer'), VIRTUAL_WIDTH / 2, y + hauteur - 12, {
      couleur: COULEURS.texteAttenue,
    });
  }
}
