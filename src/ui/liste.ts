/**
 * Zones cliquables d'une liste verticale.
 *
 * Presque tout l'écran de Terravia est une liste : les entrées du menu, l'équipe, la
 * réserve, le sac, le Terradex, les attaques en combat. Elles se ressemblent assez pour
 * partager la géométrie d'un clic, et diffèrent assez pour que chacune décrive la sienne.
 *
 * Le survol déplace la sélection, le clic la valide. Ce partage des rôles est ce qui
 * évite de dupliquer la logique : chaque écran garde son unique `selection`, pilotée
 * indifféremment par les flèches ou par le pointeur, et son code de validation ne change
 * pas — il gagne seulement une seconde façon d'être déclenché.
 */

import type { Entrees, Point } from '../core/input.ts';

export interface Colonne {
  readonly x: number;
  readonly largeur: number;
  /** Ordonnée du haut de la première ligne dessinée. */
  readonly y: number;
  /** Pas vertical entre deux lignes. */
  readonly pas: number;
  /** Nombre de lignes réellement dessinées à l'écran. */
  readonly lignes: number;
  /** Index de la première ligne dessinée, pour une liste qui défile. */
  readonly depuis?: number;
}

export interface Visee {
  /** Index sur lequel aligner la sélection, ou `null` s'il n'y a rien à suivre. */
  readonly survol: number | null;
  /** Vrai si un clic vient de valider la ligne survolée. */
  readonly valide: boolean;
}

/**
 * L'index visé par le pointeur dans cette colonne, ou `null` s'il est ailleurs.
 *
 * L'index renvoyé est celui de la donnée, défilement compris — pas celui de la ligne à
 * l'écran. Une réserve défilée de dix crans renvoie donc bien la onzième créature.
 */
function ligneVisee(pointeur: Point | null, colonne: Colonne): number | null {
  if (!pointeur) return null;
  if (pointeur.x < colonne.x || pointeur.x >= colonne.x + colonne.largeur) return null;
  const rang = Math.floor((pointeur.y - colonne.y) / colonne.pas);
  if (rang < 0 || rang >= colonne.lignes) return null;
  return (colonne.depuis ?? 0) + rang;
}

/**
 * Ce que le pointeur demande à cette liste : quelle ligne suivre, et s'il l'a validée.
 *
 * Le survol n'est suivi que lorsque le pointeur a bougé — ou qu'on a cliqué. Sans cette
 * condition, une souris posée par hasard sur une ligne reprendrait la main sur les
 * flèches à chaque trame, et naviguer au clavier deviendrait impossible tant qu'on ne
 * l'écarte pas de l'écran.
 */
export function viser(entrees: Entrees, colonne: Colonne): Visee {
  return repondre(entrees, ligneVisee(entrees.pointeur, colonne));
}

/** Une liste rangée en plusieurs colonnes : le menu de combat et ses quatre attaques. */
export interface Grille {
  readonly x: number;
  readonly y: number;
  /** Largeur d'une case, du repère de sélection au bord droit du libellé. */
  readonly largeurColonne: number;
  /** Pas vertical entre deux rangées. */
  readonly pas: number;
  readonly colonnes: number;
  /** Nombre de cases occupées : la dernière rangée peut être incomplète. */
  readonly cases: number;
}

/** Comme `viser`, pour une liste remplie de gauche à droite puis de haut en bas. */
export function viserGrille(entrees: Entrees, grille: Grille): Visee {
  const pointeur = entrees.pointeur;
  if (!pointeur) return { survol: null, valide: false };

  const colonne = Math.floor((pointeur.x - grille.x) / grille.largeurColonne);
  const rangee = Math.floor((pointeur.y - grille.y) / grille.pas);
  if (colonne < 0 || colonne >= grille.colonnes || rangee < 0) return { survol: null, valide: false };

  const index = rangee * grille.colonnes + colonne;
  return repondre(entrees, index < grille.cases ? index : null);
}

function repondre(entrees: Entrees, index: number | null): Visee {
  if (index === null) return { survol: null, valide: false };
  const clic = entrees.cliquePresse();
  return { survol: entrees.pointeurBouge() || clic ? index : null, valide: clic };
}
