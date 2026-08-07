/**
 * L'écran de fin, après le dernier champion.
 *
 * Il manquait entièrement : battre le champion posait un drapeau que personne ne lisait,
 * et l'on revenait au monde comme après n'importe quel combat. Rien ne disait qu'on avait
 * gagné, rien ne récapitulait la partie, rien ne donnait envie d'en relancer une.
 *
 * L'aventure **ne s'arrête pas là** : le sanctuaire vient de s'ouvrir, et c'est le seul
 * endroit où terminer le Terradex. L'écran propose donc de reprendre autant que de
 * repartir sur une autre seed.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import {
  tailleTerradex,
  tempsJoue,
  typesDesBadges,
} from '../game/state.ts';
import { COULEURS } from '../ui/draw.ts';
import { SceneTitre } from './titre.ts';

export class SceneFin implements Scene {
  readonly nom = 'fin';
  readonly opaque = true;

  private selection = 0;
  private temps = 0;

  mettreAJour(jeu: Jeu, step: number): void {
    this.temps += step;
    if (jeu.dialogue.actif) {
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }

    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + 1) % 2;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection + 1) % 2;
    if (!jeu.entrees.pressee('valider')) return;

    if (this.selection === 0) {
      // On rend la main au monde : le sanctuaire attend, et le Terradex n'est pas fini.
      jeu.retirer();
      return;
    }
    // Une autre seed, c'est une autre aventure — la partie en cours reste dans la
    // sauvegarde locale, et « Continuer » la retrouvera.
    jeu.remplacer(new SceneTitre(jeu.state.seedText));
  }

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, COULEURS.fond);

    // Les créatures de l'équipe défilent en fond : c'est d'elles qu'on se souvient.
    const defilement = (this.temps * 10) % (VIRTUAL_WIDTH + 80);
    jeu.state.equipe.forEach((membre, index) => {
      peintre.creature(membre.speciesId, 'face', VIRTUAL_WIDTH - defilement + index * 74, 120, {
        echelle: 0.75,
        opacite: 0.2,
      });
    });

    peintre.texteCentre(jeu.t('fin.titre'), VIRTUAL_WIDTH / 2, 20, { couleur: COULEURS.texteInverse });

    const largeur = VIRTUAL_WIDTH - 56;
    const gauche = 28;
    peintre.panneau(gauche, 36, largeur, 108);

    const progression = jeu.state.progression;
    const lignes: Array<[string, string]> = [
      [jeu.t('fin.temps'), tempsJoue(jeu.state)],
      [
        jeu.t('fin.terradex'),
        `${progression.terradexCaptures.length} / ${tailleTerradex()}`,
      ],
      [jeu.t('fin.dresseurs'), String(progression.dresseursVaincus.length)],
      [jeu.t('fin.seed'), jeu.state.seedText],
    ];
    lignes.forEach(([libelle, valeur], index) => {
      const y = 46 + index * 14;
      peintre.texte(libelle, gauche + 12, y, { couleur: COULEURS.texteAttenue });
      peintre.texteDroite(valeur, gauche + largeur - 12, y, { couleur: COULEURS.texteAccent });
    });

    // Les insignes remportés, alignés sous le récapitulatif.
    const insignes = typesDesBadges(jeu.state);
    const taille = peintre.tailleInsigne;
    insignes.forEach((type, index) => {
      peintre.insigne(type, gauche + 12 + index * (taille + 3), 106);
    });

    peintre.texteCentreBloc(jeu.t('fin.sanctuaire'), VIRTUAL_WIDTH / 2, 122, largeur - 24, {
      couleur: COULEURS.texteAttenue,
    });

    [jeu.t('fin.reprendre'), jeu.t('fin.nouvelleSeed')].forEach((libelle, index) => {
      const y = 156 + index * 14;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', gauche + 12, y, { couleur: COULEURS.selection });
      peintre.texte(libelle, gauche + 24, y, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
    });
  }
}
