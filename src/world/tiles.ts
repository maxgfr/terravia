/**
 * Catalogue des tuiles du monde.
 *
 * Une seule source de vérité, partagée par trois consommateurs : le générateur d'art
 * (qui dessine une image par tuile), le générateur de monde (qui les pose) et le moteur
 * de déplacement (qui décide ce qui bloque). Ajouter une tuile ici suffit à la propager
 * partout ; un test vérifie que chaque tuile déclarée possède bien son image.
 */

export const TILE_IDS = [
  'herbe',
  'herbeClaire',
  'herbesHautes',
  'fleurs',
  'chemin',
  'sable',
  'eau',
  'arbre',
  'buisson',
  'rocher',
  'souche',
  'solGrotte',
  'gravier',
  'murGrotte',
  'cristal',
  'mur',
  'toit',
  'porte',
  'panneau',
  'rebord',
  'solInterieur',
  'tapis',
  'comptoir',
  'vide',
] as const;

export type TileId = (typeof TILE_IDS)[number];

export interface TileKind {
  /** Bloque le déplacement. */
  readonly solid: boolean;
  /** Peut déclencher une rencontre sauvage. */
  readonly encounter: boolean;
  /** Nombre de trames d'animation (1 = fixe). */
  readonly frames: number;
  /**
   * Rebord franchissable dans un seul sens : on saute vers le sud, jamais vers le nord.
   * C'est ce qui donne des raccourcis à sens unique dans les routes.
   */
  readonly ledge?: 'sud';
}

const WALKABLE = { solid: false, encounter: false, frames: 1 } as const;
const BLOCKING = { solid: true, encounter: false, frames: 1 } as const;

export const TILES: Record<TileId, TileKind> = {
  herbe: { ...WALKABLE },
  herbeClaire: { ...WALKABLE },
  herbesHautes: { ...WALKABLE, encounter: true },
  fleurs: { ...WALKABLE },
  chemin: { ...WALKABLE },
  sable: { ...WALKABLE },
  eau: { ...BLOCKING, frames: 3 },
  arbre: { ...BLOCKING },
  buisson: { ...BLOCKING },
  rocher: { ...BLOCKING },
  souche: { ...BLOCKING },
  solGrotte: { ...WALKABLE },
  gravier: { ...WALKABLE, encounter: true },
  murGrotte: { ...BLOCKING },
  cristal: { ...BLOCKING },
  mur: { ...BLOCKING },
  toit: { ...BLOCKING },
  porte: { ...WALKABLE },
  panneau: { ...BLOCKING },
  rebord: { ...WALKABLE, ledge: 'sud' },
  solInterieur: { ...WALKABLE },
  tapis: { ...WALKABLE },
  comptoir: { ...BLOCKING },
  vide: { ...BLOCKING },
};

export function triggersEncounter(tile: TileId): boolean {
  return TILES[tile].encounter;
}

/** Index numérique stable d'une tuile — c'est ce qu'on stocke dans les grilles. */
export function tileIndex(tile: TileId): number {
  return TILE_IDS.indexOf(tile);
}

export function tileFromIndex(index: number): TileId {
  return TILE_IDS[index] ?? 'vide';
}
