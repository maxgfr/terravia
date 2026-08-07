/**
 * Identifiants des sprites de personnages.
 *
 * Cette liste vit du côté du jeu, et non dans le générateur d'art, parce que le monde a
 * besoin de nommer un sprite sans dépendre des outils de construction. Le générateur
 * d'art importe cette liste ; un test vérifie que la planche publiée la couvre.
 */

export const CHARACTER_IDS = [
  'heros',
  'professeur',
  'villageois',
  'villageoise',
  'dresseur',
  'dresseuse',
  'marchand',
  'soigneuse',
  'champion',
  'randonneur',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

/** Les quatre orientations possibles, dans l'ordre utilisé par les entrées. */
export const DIRECTIONS = ['sud', 'nord', 'est', 'ouest'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_VECTORS: Record<Direction, { readonly dx: number; readonly dy: number }> = {
  sud: { dx: 0, dy: 1 },
  nord: { dx: 0, dy: -1 },
  est: { dx: 1, dy: 0 },
  ouest: { dx: -1, dy: 0 },
};

export function directionOpposee(direction: Direction): Direction {
  switch (direction) {
    case 'nord':
      return 'sud';
    case 'sud':
      return 'nord';
    case 'est':
      return 'ouest';
    case 'ouest':
      return 'est';
  }
}
