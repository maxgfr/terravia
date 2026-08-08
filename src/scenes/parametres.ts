/**
 * Réglages, atteignables depuis l'écran-titre comme depuis le menu de pause.
 *
 * Les deux chemins comptent : c'est cet écran qui porte le choix de la langue, et un
 * joueur qui ne comprend pas le premier écran doit pouvoir en changer avant même de
 * commencer une partie.
 *
 * C'est aussi ce qui en fait le bon endroit pour l'export. Le même bouton dans le menu de
 * pause n'existe que dans le monde parcouru ; ici, on peut mettre sa partie à l'abri au
 * milieu d'un combat.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { makeSeedText } from '../core/rng.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import { LANGUES, type CleTexte } from '../i18n/index.ts';
import { nomFichier } from '../save/serialize.ts';
import { choisirFichier, enregistrerLanguePreferee, telecharger } from '../save/storage.ts';
import { COULEURS } from '../ui/draw.ts';
import { SceneAide } from './aide.ts';
import { traiterImport } from './partie.ts';
import { SceneTitre } from './titre.ts';

export class SceneParametres implements Scene {
  readonly nom = 'parametres';

  private selection = 0;

  /**
   * Les entrées se calculent : « Exporter » n'a de sens qu'avec une partie en cours.
   * Depuis l'écran-titre, l'état est une partie neuve sans créature — la même raison qui
   * fait refuser sa sauvegarde. « Importer » reste, lui, toujours offert : c'est
   * justement là qu'on en a besoin.
   */
  private entrees(jeu: Jeu): readonly CleTexte[] {
    const exportable = jeu.state.equipe.length > 0;
    return [
      'parametres.langue',
      ...(exportable ? (['sauvegarde.exporter'] as const) : []),
      'sauvegarde.importer',
      'parametres.commentJouer',
      // Repartir sur une autre seed sans avoir à finir la partie : c'est la promesse du
      // jeu, et il n'existait aucun chemin pour y revenir hormis recharger la page.
      ...(exportable ? (['parametres.recommencer'] as const) : []),
      'menu.retour',
    ];
  }

  mettreAJour(jeu: Jeu, step: number): void {
    if (jeu.dialogue.actif) {
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }

    const entrees = this.entrees(jeu);
    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + 1) % entrees.length;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - 1 + entrees.length) % entrees.length;
    if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('menu')) {
      jeu.retirer();
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;

    switch (entrees[this.selection]) {
      case 'parametres.langue': {
        // Bascule circulaire : avec deux langues, c'est un aller-retour ; avec trois,
        // ce serait toujours juste.
        const index = LANGUES.indexOf(jeu.langue);
        jeu.state.langue = LANGUES[(index + 1) % LANGUES.length]!;
        enregistrerLanguePreferee(jeu.state.langue);
        break;
      }
      case 'sauvegarde.exporter':
        this.exporter(jeu);
        break;
      case 'sauvegarde.importer':
        void this.importer(jeu);
        break;
      case 'parametres.commentJouer':
        jeu.pousser(new SceneAide());
        break;
      case 'parametres.recommencer':
        void this.retournerAuTitre(jeu);
        break;
      default:
        jeu.retirer();
    }
  }

  /**
   * Retour à l'écran-titre, après confirmation.
   *
   * La partie en cours n'est pas perdue : elle vient d'être écrite, et « Continuer » la
   * retrouvera. C'est ce qui permet de lancer une seed le temps d'une soirée sans
   * abandonner celle d'avant.
   */
  private async retournerAuTitre(jeu: Jeu): Promise<void> {
    jeu.sauvegarderLocalement();
    const choix = await jeu.dialogue.demander(jeu.t('parametres.confirmerTitre'), [
      jeu.t('depart.oui'),
      jeu.t('depart.non'),
    ]);
    if (choix !== 0) return;
    jeu.remplacer(new SceneTitre(makeSeedText(jeu.rng.next())));
  }

  /**
   * Le document passe par `documentDePartie`, comme la sauvegarde automatique : il hérite
   * donc du même crochet, et un export déclenché en plein combat emporte l'échange.
   */
  private exporter(jeu: Jeu): void {
    const document = jeu.documentDePartie();
    if (!document) return;
    telecharger(document, nomFichier(jeu.state, document.majLe));
    jeu.dialogue.dire(jeu.t('sauvegarde.exportee'));
  }

  private async importer(jeu: Jeu): Promise<void> {
    const contenu = await choisirFichier();
    if (contenu !== null) traiterImport(jeu, contenu);
  }

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 'rgba(11, 15, 20, 0.78)');

    const entrees = this.entrees(jeu);
    const hauteur = entrees.length * 15 + 40;
    const y = VIRTUAL_HEIGHT / 2 - hauteur / 2;
    // Le panneau se mesure sur son entrée la plus longue : « Importer une sauvegarde »
    // dépassait d'une largeur fixée à l'œil, et toute traduction plus longue aussi.
    const largeur = Math.min(
      VIRTUAL_WIDTH - 16,
      Math.max(172, Math.max(...entrees.map((cle) => peintre.largeurTexte(jeu.t(cle)))) + 36),
    );
    const gauche = Math.round(VIRTUAL_WIDTH / 2 - largeur / 2);

    peintre.panneau(gauche, y, largeur, hauteur);
    peintre.texte(jeu.t('parametres.titre'), gauche + 12, y + 8, {
      couleur: COULEURS.texteAccent,
    });

    entrees.forEach((cle, index) => {
      const ligneY = y + 26 + index * 15;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', gauche + 10, ligneY, { couleur: COULEURS.selection });
      peintre.texte(jeu.t(cle), gauche + 22, ligneY, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
    });

    peintre.texteCentre(jeu.t('aide.fermer'), VIRTUAL_WIDTH / 2, y + hauteur - 12, {
      couleur: COULEURS.texteAttenue,
    });
  }
}
