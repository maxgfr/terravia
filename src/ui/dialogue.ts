/**
 * Boîte de dialogue : messages à la file, effet machine à écrire, questions à choix.
 *
 * Elle est partagée par toutes les scènes plutôt que réimplémentée dans chacune. Un
 * dialogue de combat et un panneau de route se comportent donc exactement pareil — même
 * vitesse, même touche pour avancer, même moyen de tout accélérer.
 *
 * Appuyer sur valider pendant que le texte défile l'affiche d'un coup au lieu de passer
 * au message suivant : sans cela, un joueur pressé saute des phrases sans les voir.
 *
 * Tout se fait aussi à la souris : un clic avance le message, et les options d'une
 * question se survolent puis se cliquent. Une partie menée entièrement au pointeur ne
 * doit jamais buter sur un écran qui exige le clavier.
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

  /**
   * Géométrie de la boîte, partagée par le rendu et la détection des clics.
   *
   * Elle dépend des dimensions virtuelles courantes et du nombre d'options : la calculer
   * à deux endroits, c'était garantir qu'un jour l'un dérive de l'autre et que les zones
   * cliquables ne soient plus sous les lignes affichées.
   */
  private cadre(): { x: number; y: number; largeur: number; hauteur: number } {
    const hauteur = this.question ? HAUTEUR_BOITE + this.question.options.length * 10 : HAUTEUR_BOITE;
    return {
      x: MARGE,
      y: VIRTUAL_HEIGHT - hauteur - MARGE,
      largeur: VIRTUAL_WIDTH - MARGE * 2,
      hauteur,
    };
  }

  /** Ordonnée du haut de la n-ième option, dans le même repère que le rendu. */
  private ligneOption(index: number, nombre: number, cadre: { y: number; hauteur: number }): number {
    return cadre.y + cadre.hauteur - 8 - (nombre - index) * 10;
  }

  mettreAJour(step: number, entrees: Entrees): void {
    if (!this.actif) return;
    const total = this.totalCaracteres;
    if (this.reveles < total) this.reveles = Math.min(total, this.reveles + VITESSE * step);

    const clic = entrees.cliquePresse();
    const pointeur = entrees.pointeur;

    if (this.question) {
      if (this.reveles < total) {
        // Un clic pendant le défilé révèle tout, comme la touche de validation : sinon
        // il tomberait sur une option qui n'est pas encore à sa place définitive.
        if (entrees.pressee('valider') || clic) this.reveles = total;
        return;
      }
      const nombre = this.question.options.length;
      if (entrees.pressee('sud')) this.selection = (this.selection + 1) % nombre;
      if (entrees.pressee('nord')) this.selection = (this.selection + nombre - 1) % nombre;

      // Le survol déplace la sélection : le clic n'a plus qu'à valider, et l'option
      // visée est mise en évidence avant même qu'on appuie.
      const cadre = this.cadre();
      let vise: number | null = null;
      if (pointeur) {
        for (let index = 0; index < nombre; index++) {
          const ligne = this.ligneOption(index, nombre, cadre);
          if (pointeur.x >= cadre.x && pointeur.x < cadre.x + cadre.largeur && pointeur.y >= ligne - 1 && pointeur.y < ligne + 9) {
            vise = index;
          }
        }
      }
      if (vise !== null) this.selection = vise;

      if (entrees.pressee('valider') || (clic && vise !== null)) {
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

    // Un simple message se passe n'importe où : viser la boîte pour lire la suite
    // serait une exigence sans raison, et le clic est de toute façon consommé ici.
    if (entrees.pressee('valider') || entrees.pressee('annuler') || clic) {
      // Première pression : tout révéler. Seconde : passer au message suivant.
      if (this.reveles < total) this.reveles = total;
      else this.avancer();
    }
  }

  dessiner(): void {
    if (!this.actif) return;
    const peintre = this.peintre;
    const { y, hauteur } = this.cadre();
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
