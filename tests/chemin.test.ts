import { describe, expect, it } from 'vitest';
import { trouverChemin, type Case } from '../src/world/chemin.ts';

/**
 * Recherche de chemin.
 *
 * Les cartes sont écrites à la main : `#` est un mur, `.` un passage. C'est la seule
 * façon de vérifier le contournement sans dépendre d'une seed, et de lire le cas
 * d'échec d'un coup d'œil quand un test tombe.
 */
function grille(lignes: readonly string[]) {
  const libre = (c: Case): boolean =>
    c.y >= 0 && c.y < lignes.length && c.x >= 0 && c.x < lignes[c.y]!.length && lignes[c.y]![c.x] !== '#';

  return (depuis: Case): Case[] =>
    [
      { x: depuis.x, y: depuis.y - 1 },
      { x: depuis.x, y: depuis.y + 1 },
      { x: depuis.x - 1, y: depuis.y },
      { x: depuis.x + 1, y: depuis.y },
    ].filter(libre);
}

const versLaCase =
  (x: number, y: number) =>
  (candidate: Case): boolean =>
    candidate.x === x && candidate.y === y;

describe('recherche de chemin', () => {
  it('va tout droit quand rien ne barre', () => {
    const chemin = trouverChemin({ x: 0, y: 0 }, versLaCase(3, 0), grille(['....']));
    expect(chemin).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('ne renvoie aucun pas quand on y est déjà', () => {
    expect(trouverChemin({ x: 1, y: 1 }, versLaCase(1, 1), grille(['...', '...']))).toEqual([]);
  });

  it('contourne un mur au lieu de s’y coller', () => {
    // Un mur vertical percé en bas : le chemin doit descendre, passer, puis remonter.
    const chemin = trouverChemin({ x: 0, y: 0 }, versLaCase(2, 0), grille(['.#.', '.#.', '...']));
    expect(chemin).not.toBeNull();
    expect(chemin!.at(-1)).toEqual({ x: 2, y: 0 });
    // Aucun pas ne traverse le mur, et le détour est le plus court possible.
    expect(chemin!.every((c) => !(c.x === 1 && c.y < 2))).toBe(true);
    expect(chemin).toHaveLength(6);
  });

  it('rend null quand la cible est murée', () => {
    expect(trouverChemin({ x: 0, y: 0 }, versLaCase(2, 0), grille(['.#.']))).toBeNull();
  });

  it('s’arrête à la première case satisfaisant le but, pas à une case précise', () => {
    // C'est ainsi qu'on aborde un PNJ : on vise ses voisines, pas sa case.
    const voisineDe = (x: number, y: number) => (c: Case) => Math.abs(c.x - x) + Math.abs(c.y - y) === 1;
    const chemin = trouverChemin({ x: 0, y: 0 }, voisineDe(3, 0), grille(['....']));
    expect(chemin).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('renonce au-delà de sa limite de cases explorées', () => {
    const vaste = Array.from({ length: 40 }, () => '.'.repeat(40));
    expect(trouverChemin({ x: 0, y: 0 }, versLaCase(39, 39), grille(vaste), 50)).toBeNull();
    expect(trouverChemin({ x: 0, y: 0 }, versLaCase(39, 39), grille(vaste))).not.toBeNull();
  });
});
