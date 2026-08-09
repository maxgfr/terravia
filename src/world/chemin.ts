/**
 * Chemin le plus court d'une case à une autre, sur la grille du monde.
 *
 * Cliquer une case doit y mener, pas simplement pousser le personnage dans sa
 * direction : entre le joueur et l'endroit visé il y a des arbres, des maisons et des
 * dresseurs, et une conduite au curseur reste bloquée contre le premier d'entre eux.
 *
 * Le parcours est en largeur d'abord, sans heuristique : tous les pas coûtent pareil, et
 * une région tient dans quelques milliers de cases — un A* n'y gagnerait rien de
 * mesurable pour le prix d'une file de priorité.
 *
 * Ce module ne connaît ni tuiles ni entités. Ce qui est franchissable lui est décrit par
 * `voisines`, si bien que les rebords — qui ne se sautent que vers le sud et font
 * atterrir deux cases plus bas — s'expriment comme un pas ordinaire un peu plus long.
 */

export interface Case {
  readonly x: number;
  readonly y: number;
}

/**
 * Les cases visitées sont indexées par un entier plutôt que par une chaîne : le parcours
 * en teste des milliers, et `Map<number>` évite autant de concaténations. Aucune région
 * n'approche cette largeur.
 */
const ETALEMENT = 4096;
const cle = (x: number, y: number): number => x * ETALEMENT + y;

/**
 * Les cases à traverser pour aller de `depart` à la première case satisfaisant
 * `arrivee`, celle de départ exclue. `null` si rien n'est atteignable.
 *
 * Le prédicat d'arrivée plutôt qu'une case unique n'est pas de la généralité gratuite :
 * cliquer un PNJ vise ses quatre voisines, cliquer l'eau vise la berge. Sans lui, il
 * faudrait lancer un parcours par voisine et garder le meilleur.
 */
export function trouverChemin(
  depart: Case,
  arrivee: (candidate: Case) => boolean,
  voisines: (depuis: Case) => readonly Case[],
  limite = 8192,
): Case[] | null {
  if (arrivee(depart)) return [];

  const precedent = new Map<number, Case | null>([[cle(depart.x, depart.y), null]]);
  const file: Case[] = [depart];
  let tete = 0;

  while (tete < file.length && precedent.size < limite) {
    const courante = file[tete++]!;
    for (const voisine of voisines(courante)) {
      const identifiant = cle(voisine.x, voisine.y);
      if (precedent.has(identifiant)) continue;
      precedent.set(identifiant, courante);
      if (arrivee(voisine)) return remonter(precedent, voisine);
      file.push(voisine);
    }
  }
  return null;
}

/** Remonte la chaîne des prédécesseurs, puis la retourne dans le sens de la marche. */
function remonter(precedent: Map<number, Case | null>, fin: Case): Case[] {
  const chemin: Case[] = [];
  let courante: Case | null = fin;
  while (courante) {
    chemin.push(courante);
    courante = precedent.get(cle(courante.x, courante.y)) ?? null;
  }
  chemin.pop(); // la case de départ : on y est déjà
  return chemin.reverse();
}
