/**
 * Boîte de dialogue : messages à la file, effet machine à écrire, questions à choix.
 *
 * Elle est partagée par toutes les scènes plutôt que réimplémentée dans chacune. Un
 * dialogue de combat et un panneau de route se comportent donc exactement pareil — même
 * vitesse, même touche pour avancer, même moyen de tout accélérer.
 *
 * Appuyer sur valider pendant que le texte défile l'affiche d'un coup au lieu de passer
 * au message suivant : sans cela, un joueur pressé saute des phrases sans les voir.
 */

import type { Entrees } from '../core/input.ts';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { COULEURS, Peintre } from './draw.ts';

/** Caractères révélés par seconde. */
const VITESSE = 48;
const MARGE = 6;
const HAUTEUR_BOITE = 52;

interface Question {
  readonly intitule: string;
  readonly options: readonly string[];
  readonly resoudre: (index: number) => void;
}

export class BoiteDialogue {
  private file: string[] = [];
  private courant: string | null = null;
  private lignes: string[] = [];
  private reveles = 0;
  private question: Question | null = null;
  /** Question posée alors qu'un message s'affichait : elle s'ouvre quand la file se vide. */
  private enAttente: Question | null = null;
  private selection = 0;
  private surFin: (() => void) | null = null;

  private readonly peintre: Peintre;

  constructor(peintre: Peintre) {
    this.peintre = peintre;
  }

  get actif(): boolean {
    return this.courant !== null || this.question !== null;
  }

  /** Ajoute un ou plusieurs messages à la file. */
  dire(...messages: string[]): void {
    this.file.push(...messages.filter((message) => message.length > 0));
    if (this.courant === null) this.avancer();
  }

  /**
   * Pose une question et rend l'index choisi.
   *
   * Si un message est en cours, la question attend son tour au lieu de l'écraser. Sans
   * cela, un `dire()` suivi d'un `demander()` effaçait le message et toute la file
   * derrière lui — c'est ce qui faisait disparaître le résumé d'une sauvegarde importée
   * sous sa propre demande de confirmation.
   */
  demander(intitule: string, options: readonly string[]): Promise<number> {
    return new Promise((resoudre) => {
      const question: Question = { intitule, options, resoudre };
      if (this.actif) this.enAttente = question;
      else this.ouvrir(question);
    });
  }

  private ouvrir(question: Question): void {
    this.question = question;
    this.selection = 0;
    this.lignes = this.peintre.decouper(question.intitule, VIRTUAL_WIDTH - MARGE * 4);
    this.reveles = 0;
    this.courant = question.intitule;
  }

  /** Rappel déclenché quand la file se vide. */
  puis(action: () => void): void {
    if (!this.actif) action();
    else this.surFin = action;
  }

  vider(): void {
    this.file = [];
    this.courant = null;
    this.question = null;
    this.enAttente = null;
    this.surFin = null;
  }

  private avancer(): void {
    const suivant = this.file.shift();
    if (suivant === undefined) {
      const enAttente = this.enAttente;
      if (enAttente) {
        this.enAttente = null;
        this.ouvrir(enAttente);
        return;
      }
      this.courant = null;
      const fin = this.surFin;
      this.surFin = null;
      fin?.();
      return;
    }
    this.courant = suivant;
    this.lignes = this.peintre.decouper(suivant, VIRTUAL_WIDTH - MARGE * 4);
    this.reveles = 0;
  }

  private get totalCaracteres(): number {
    return this.lignes.reduce((somme, ligne) => somme + ligne.length, 0);
  }

  mettreAJour(step: number, entrees: Entrees): void {
    if (!this.actif) return;
    const total = this.totalCaracteres;
    if (this.reveles < total) this.reveles = Math.min(total, this.reveles + VITESSE * step);

    if (this.question) {
      if (this.reveles < total) {
        if (entrees.pressee('valider')) this.reveles = total;
        return;
      }
      const nombre = this.question.options.length;
      if (entrees.pressee('sud')) this.selection = (this.selection + 1) % nombre;
      if (entrees.pressee('nord')) this.selection = (this.selection + nombre - 1) % nombre;
      if (entrees.pressee('valider')) {
        const { resoudre } = this.question;
        const choix = this.selection;
        this.question = null;
        this.courant = null;
        resoudre(choix);
        // `avancer` couvre les trois suites possibles : message suivant, question mise
        // en attente, ou file vide qui déclenche le rappel de fin.
        this.avancer();
      }
      return;
    }

    if (entrees.pressee('valider') || entrees.pressee('annuler')) {
      // Première pression : tout révéler. Seconde : passer au message suivant.
      if (this.reveles < total) this.reveles = total;
      else this.avancer();
    }
  }

  dessiner(): void {
    if (!this.actif) return;
    const peintre = this.peintre;
    const hauteur = this.question ? HAUTEUR_BOITE + this.question.options.length * 10 : HAUTEUR_BOITE;
    const y = VIRTUAL_HEIGHT - hauteur - MARGE;
    peintre.panneau(MARGE, y, VIRTUAL_WIDTH - MARGE * 2, hauteur);

    let restants = Math.floor(this.reveles);
    let ligneY = y + 8;
    for (const ligne of this.lignes) {
      if (restants <= 0) break;
      peintre.texte(ligne.slice(0, restants), MARGE + 8, ligneY);
      restants -= ligne.length;
      ligneY += peintre.hauteurLigne;
    }

    if (this.question && this.reveles >= this.totalCaracteres) {
      this.question.options.forEach((option, index) => {
        const optionY = y + hauteur - 8 - (this.question!.options.length - index) * 10;
        const selectionne = index === this.selection;
        if (selectionne) peintre.texte('▶', MARGE + 8, optionY, { couleur: COULEURS.selection });
        peintre.texte(option, MARGE + 18, optionY, {
          couleur: selectionne ? COULEURS.texteAccent : COULEURS.texte,
        });
      });
    } else if (this.reveles >= this.totalCaracteres) {
      // Chevron clignotant : il indique qu'on attend une pression, pas un blocage.
      const visible = Math.floor(performance.now() / 400) % 2 === 0;
      if (visible) {
        peintre.texte('▶', VIRTUAL_WIDTH - MARGE - 14, y + hauteur - 14, { couleur: COULEURS.texteAttenue });
      }
    }
  }
}
