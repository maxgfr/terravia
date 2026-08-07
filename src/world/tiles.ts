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

/** Nature de la surface : sert au choix des sons, des particules et des rencontres. */
export type TileSurface = 'herbe' | 'terre' | 'eau' | 'pierre' | 'bois';

export interface TileKind {
  /** Bloque le déplacement. */
  readonly solid: boolean;
  /** Peut déclencher une rencontre sauvage. */
  readonly encounter: boolean;
  /** Nombre de trames d'animation (1 = fixe). */
  readonly frames: number;
  readonly surface: TileSurface;
  /**
   * Rebord franchissable dans un seul sens : on saute vers le sud, jamais vers le nord.
   * C'est ce qui donne des raccourcis à sens unique dans les routes.
   */
  readonly ledge?: 'sud';
  /** Déclenche une interaction quand on appuie sur le bouton d'action face à la tuile. */
  readonly interactive?: boolean;
}

const WALKABLE = { solid: false, encounter: false, frames: 1 } as const;
const BLOCKING = { solid: true, encounter: false, frames: 1 } as const;

export const TILES: Record<TileId, TileKind> = {
  herbe: { ...WALKABLE, surface: 'herbe' },
  herbeClaire: { ...WALKABLE, surface: 'herbe' },
  herbesHautes: { ...WALKABLE, encounter: true, surface: 'herbe' },
  fleurs: { ...WALKABLE, surface: 'herbe' },
  chemin: { ...WALKABLE, surface: 'terre' },
  sable: { ...WALKABLE, surface: 'terre' },
  eau: { ...BLOCKING, frames: 3, surface: 'eau' },
  arbre: { ...BLOCKING, surface: 'herbe' },
  buisson: { ...BLOCKING, surface: 'herbe' },
  rocher: { ...BLOCKING, surface: 'pierre' },
  souche: { ...BLOCKING, surface: 'bois' },
  solGrotte: { ...WALKABLE, surface: 'pierre' },
  gravier: { ...WALKABLE, encounter: true, surface: 'pierre' },
  murGrotte: { ...BLOCKING, surface: 'pierre' },
  cristal: { ...BLOCKING, surface: 'pierre' },
  mur: { ...BLOCKING, surface: 'pierre' },
  toit: { ...BLOCKING, surface: 'pierre' },
  porte: { ...WALKABLE, surface: 'bois', interactive: true },
  panneau: { ...BLOCKING, surface: 'bois', interactive: true },
  rebord: { ...WALKABLE, surface: 'terre', ledge: 'sud' },
  solInterieur: { ...WALKABLE, surface: 'bois' },
  tapis: { ...WALKABLE, surface: 'bois' },
  comptoir: { ...BLOCKING, surface: 'bois' },
  vide: { ...BLOCKING, surface: 'pierre' },
};

export function isSolid(tile: TileId): boolean {
  return TILES[tile].solid;
}

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
