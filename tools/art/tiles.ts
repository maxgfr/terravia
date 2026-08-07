/**
 * Générateur du jeu de tuiles 16×16.
 *
 * Chaque tuile est dessinée par une fonction, à partir d'un générateur aléatoire semé
 * par son nom : le mouchetage d'une touffe d'herbe est aléatoire, mais toujours le même
 * aléatoire. Régénérer l'art ne produit donc aucun diff tant que le code ne change pas —
 * condition pour que des PNG commités restent lisibles en revue.
 *
 * L'atlas fait une colonne par tuile et une ligne par trame d'animation. Les tuiles fixes
 * n'occupent que la première ligne.
 */

import { TILE_IDS, TILES, type TileId } from '../../src/world/tiles.ts';
import { makeRng, type Rng } from '../../src/core/rng.ts';
import {
  createSurface,
  drawLine,
  fillEllipse,
  fillRect,
  hex,
  setPixel,
  shade,
  type Color,
  type MutableSurface,
} from './surface.ts';

export const TILE_SIZE = 16;

const GROUND = {
  herbe: hex('#4a8b3a'),
  herbeSombre: hex('#356828'),
  herbeClaire: hex('#6fae52'),
  herbeTresSombre: hex('#28501e'),
  terre: hex('#b89a68'),
  terreSombre: hex('#94794c'),
  terreClaire: hex('#d4bb8c'),
  sable: hex('#e0cd94'),
  sableSombre: hex('#c4ad74'),
  eau: hex('#2f7fc4'),
  eauSombre: hex('#1b5c99'),
  eauClaire: hex('#7fc4e8'),
  pierre: hex('#8a8378'),
  pierreSombre: hex('#635c52'),
  pierreClaire: hex('#b0a89a'),
  grotte: hex('#4a4a55'),
  grotteSombre: hex('#33333d'),
  grotteClaire: hex('#5e5e6b'),
  roc: hex('#25252d'),
  cristal: hex('#7fb8e0'),
  cristalClair: hex('#c8ecff'),
  bois: hex('#7a5330'),
  boisSombre: hex('#573a21'),
  boisClair: hex('#a9834f'),
  muraille: hex('#d8cdb8'),
  murailleJoint: hex('#b09a7c'),
  toit: hex('#b3543f'),
  toitSombre: hex('#8c3f2f'),
  tapis: hex('#b3574f'),
  tapisSombre: hex('#8c3f3a'),
  feuillage: hex('#2f6b34'),
  feuillageSombre: hex('#1e4a24'),
  feuillageClair: hex('#4b8f45'),
} as const;

const FLOWER_COLORS = [hex('#e8607a'), hex('#f0c04a'), hex('#dcdcf0'), hex('#c78ae0')];

/** Mouchetage aléatoire : ce qui empêche un aplat de couleur de ressembler à du carton. */
function speckle(surface: MutableSurface, rng: Rng, color: Color, count: number): void {
  for (let i = 0; i < count; i++) {
    setPixel(surface, rng.int(0, TILE_SIZE - 1), rng.int(0, TILE_SIZE - 1), color);
  }
}

function grassBase(rng: Rng, base: Color = GROUND.herbe): MutableSurface {
  const tile = createSurface(TILE_SIZE, TILE_SIZE, base);
  speckle(tile, rng, shade(base, -0.18), 34);
  speckle(tile, rng, shade(base, 0.16), 26);
  // Quelques brins : deux pixels verticaux suffisent à suggérer une texture.
  for (let i = 0; i < 7; i++) {
    const x = rng.int(1, TILE_SIZE - 2);
    const y = rng.int(1, TILE_SIZE - 3);
    setPixel(tile, x, y, shade(base, -0.3));
    setPixel(tile, x, y + 1, shade(base, -0.22));
  }
  return tile;
}

function dirtBase(rng: Rng, base: Color = GROUND.terre): MutableSurface {
  const tile = createSurface(TILE_SIZE, TILE_SIZE, base);
  speckle(tile, rng, shade(base, -0.16), 40);
  speckle(tile, rng, shade(base, 0.14), 24);
  for (let i = 0; i < 4; i++) {
    const x = rng.int(1, TILE_SIZE - 3);
    const y = rng.int(1, TILE_SIZE - 2);
    fillRect(tile, x, y, 2, 1, shade(base, -0.3));
    setPixel(tile, x, y - 1, shade(base, 0.2));
  }
  return tile;
}

function caveBase(rng: Rng): MutableSurface {
  const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.grotte);
  speckle(tile, rng, GROUND.grotteSombre, 46);
  speckle(tile, rng, GROUND.grotteClaire, 22);
  return tile;
}

/** Une touffe d'herbe haute : trois brins recourbés, plus sombres que le sol. */
function drawBlade(tile: MutableSurface, x: number, baseY: number, height: number, color: Color): void {
  for (let i = 0; i < height; i++) {
    const bend = Math.round(Math.sin((i / height) * 1.4) * 1.6);
    setPixel(tile, x + bend, baseY - i, i === height - 1 ? shade(color, 0.25) : color);
  }
}

const PAINTERS: Record<TileId, (rng: Rng, frame: number) => MutableSurface> = {
  herbe: (rng) => grassBase(rng),

  herbeClaire: (rng) => grassBase(rng, GROUND.herbeClaire),

  herbesHautes: (rng) => {
    // Cette tuile déclenche les rencontres : elle doit se distinguer de l'herbe rase
    // au premier coup d'œil, sans quoi le joueur ne comprend pas d'où viennent les
    // combats. D'où le fond nettement plus sombre et des brins qui montent haut.
    const tile = grassBase(rng, GROUND.herbeTresSombre);
    for (let i = 0; i < 22; i++) {
      drawBlade(
        tile,
        rng.int(0, TILE_SIZE - 1),
        rng.int(TILE_SIZE - 3, TILE_SIZE - 1),
        rng.int(9, 15),
        rng.chance(0.45) ? GROUND.herbe : GROUND.herbeSombre,
      );
    }
    // Quelques pointes claires en haut : elles séparent la touffe du décor derrière.
    for (let i = 0; i < 6; i++) {
      const x = rng.int(0, TILE_SIZE - 1);
      setPixel(tile, x, rng.int(0, 3), GROUND.herbeClaire);
    }
    return tile;
  },

  fleurs: (rng) => {
    const tile = grassBase(rng);
    for (let i = 0; i < 5; i++) {
      const x = rng.int(2, TILE_SIZE - 3);
      const y = rng.int(2, TILE_SIZE - 3);
      const color = rng.pick(FLOWER_COLORS);
      setPixel(tile, x, y, color);
      setPixel(tile, x - 1, y, shade(color, -0.15));
      setPixel(tile, x + 1, y, shade(color, -0.15));
      setPixel(tile, x, y - 1, shade(color, 0.2));
      setPixel(tile, x, y + 1, shade(color, -0.25));
    }
    return tile;
  },

  chemin: (rng) => dirtBase(rng),

  sable: (rng) => dirtBase(rng, GROUND.sable),

  eau: (rng, frame) => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.eau);
    // Le motif est une sinusoïde de période 16 : il se raccorde donc avec lui-même
    // d'une tuile à l'autre, et la trame ne fait que le décaler.
    const offset = (frame / TILES.eau.frames) * TILE_SIZE;
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const wave = Math.sin(((x + offset) / TILE_SIZE) * Math.PI * 2 + y * 0.55);
        if (wave > 0.72) setPixel(tile, x, y, GROUND.eauClaire);
        else if (wave < -0.75) setPixel(tile, x, y, GROUND.eauSombre);
      }
    }
    speckle(tile, rng, shade(GROUND.eau, -0.1), 12);
    return tile;
  },

  arbre: (rng) => {
    const tile = grassBase(rng);
    fillRect(tile, 7, 11, 2, 5, GROUND.boisSombre);
    setPixel(tile, 7, 12, GROUND.bois);
    fillEllipse(tile, 8, 7, 7, 6.5, GROUND.feuillageSombre);
    fillEllipse(tile, 8, 7, 6, 5.5, GROUND.feuillage);
    fillEllipse(tile, 6.5, 5.5, 3.5, 3, GROUND.feuillageClair);
    speckle(tile, rng, GROUND.feuillageSombre, 10);
    return tile;
  },

  buisson: (rng) => {
    const tile = grassBase(rng);
    fillEllipse(tile, 8, 10, 6, 4.5, GROUND.feuillageSombre);
    fillEllipse(tile, 8, 10, 5, 3.5, GROUND.feuillage);
    fillEllipse(tile, 6.5, 9, 2.5, 1.8, GROUND.feuillageClair);
    return tile;
  },

  rocher: (rng) => {
    const tile = grassBase(rng);
    fillEllipse(tile, 8, 10, 6, 4.5, GROUND.pierreSombre);
    fillEllipse(tile, 8, 9.5, 5, 3.6, GROUND.pierre);
    fillEllipse(tile, 6.5, 8, 2.4, 1.6, GROUND.pierreClaire);
    speckle(tile, rng, GROUND.pierreSombre, 6);
    return tile;
  },

  souche: (rng) => {
    const tile = grassBase(rng);
    fillEllipse(tile, 8, 11, 5, 4, GROUND.boisSombre);
    fillEllipse(tile, 8, 10, 4.5, 3, GROUND.bois);
    fillEllipse(tile, 8, 10, 2.6, 1.7, GROUND.boisClair);
    fillEllipse(tile, 8, 10, 1, 0.7, GROUND.boisSombre);
    return tile;
  },

  solGrotte: (rng) => caveBase(rng),

  gravier: (rng) => {
    const tile = caveBase(rng);
    for (let i = 0; i < 7; i++) {
      const x = rng.int(1, TILE_SIZE - 3);
      const y = rng.int(1, TILE_SIZE - 3);
      fillRect(tile, x, y, 2, 2, GROUND.pierreSombre);
      setPixel(tile, x, y, GROUND.pierre);
    }
    return tile;
  },

  murGrotte: (rng) => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.roc);
    speckle(tile, rng, shade(GROUND.roc, 0.22), 30);
    speckle(tile, rng, shade(GROUND.roc, -0.4), 20);
    // Arête éclairée en haut : sans elle, un mur de grotte est un carré noir.
    fillRect(tile, 0, 0, TILE_SIZE, 2, GROUND.grotteSombre);
    fillRect(tile, 0, 0, TILE_SIZE, 1, GROUND.grotte);
    for (let i = 0; i < 3; i++) {
      const x = rng.int(2, TILE_SIZE - 3);
      const y = rng.int(4, TILE_SIZE - 4);
      drawLine(tile, x, y, x + rng.int(-2, 2), y + rng.int(2, 4), shade(GROUND.roc, -0.5));
    }
    return tile;
  },

  cristal: (rng) => {
    const tile = caveBase(rng);
    const shard = (cx: number, top: number, height: number, width: number): void => {
      for (let i = 0; i < height; i++) {
        const half = Math.max(0, Math.round((width * (i + 1)) / height / 2));
        for (let dx = -half; dx <= half; dx++) {
          const color = dx < 0 ? GROUND.cristalClair : dx === half ? shade(GROUND.cristal, -0.3) : GROUND.cristal;
          setPixel(tile, cx + dx, top + i, color);
        }
      }
    };
    shard(8, 3, 11, 7);
    shard(4, 7, 7, 4);
    shard(12, 8, 6, 3);
    return tile;
  },

  mur: (rng) => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.muraille);
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      fillRect(tile, 0, y + 3, TILE_SIZE, 1, GROUND.murailleJoint);
      // Une rangée sur deux est décalée : c'est ce décalage qui fait lire « brique ».
      const shift = row % 2 === 0 ? 0 : 4;
      for (let x = shift; x < TILE_SIZE; x += 8) {
        fillRect(tile, x, y, 1, 3, GROUND.murailleJoint);
      }
    }
    speckle(tile, rng, shade(GROUND.muraille, -0.08), 14);
    return tile;
  },

  toit: (rng) => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.toit);
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const shift = row % 2 === 0 ? 0 : 4;
      fillRect(tile, 0, y, TILE_SIZE, 1, GROUND.toitSombre);
      fillRect(tile, 0, y + 1, TILE_SIZE, 1, shade(GROUND.toit, 0.15));
      for (let x = shift; x < TILE_SIZE; x += 8) {
        fillRect(tile, x, y + 1, 1, 3, GROUND.toitSombre);
      }
    }
    speckle(tile, rng, shade(GROUND.toit, -0.1), 10);
    return tile;
  },

  porte: () => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.muraille);
    fillRect(tile, 2, 1, 12, 15, GROUND.boisSombre);
    fillRect(tile, 3, 2, 10, 14, GROUND.bois);
    fillRect(tile, 3, 2, 10, 1, GROUND.boisClair);
    drawLine(tile, 8, 2, 8, 15, GROUND.boisSombre);
    fillRect(tile, 10, 8, 2, 2, hex('#e0c56a'));
    return tile;
  },

  panneau: (rng) => {
    const tile = grassBase(rng);
    fillRect(tile, 7, 9, 2, 6, GROUND.boisSombre);
    fillRect(tile, 2, 3, 12, 7, GROUND.boisSombre);
    fillRect(tile, 3, 4, 10, 5, GROUND.boisClair);
    for (let i = 0; i < 3; i++) fillRect(tile, 4, 5 + i * 2, rng.int(5, 8), 1, GROUND.boisSombre);
    return tile;
  },

  rebord: (rng) => {
    const tile = dirtBase(rng);
    // Le rebord se lit à sa lèvre : clair au-dessus, ombre portée en dessous.
    fillRect(tile, 0, 9, TILE_SIZE, 2, GROUND.terreSombre);
    fillRect(tile, 0, 8, TILE_SIZE, 1, GROUND.terreClaire);
    fillRect(tile, 0, 11, TILE_SIZE, 5, shade(GROUND.terre, -0.28));
    for (let x = 0; x < TILE_SIZE; x += 4) {
      setPixel(tile, x, 12, shade(GROUND.terre, -0.4));
      setPixel(tile, x + 2, 14, shade(GROUND.terre, -0.4));
    }
    return tile;
  },

  solInterieur: (rng) => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.boisClair);
    for (let y = 0; y < TILE_SIZE; y += 4) {
      fillRect(tile, 0, y, TILE_SIZE, 1, shade(GROUND.boisClair, -0.22));
      fillRect(tile, 0, y + 1, TILE_SIZE, 1, shade(GROUND.boisClair, 0.1));
    }
    const offset = (y: number): number => (y % 8 === 0 ? 0 : 8);
    for (let y = 0; y < TILE_SIZE; y += 4) {
      fillRect(tile, offset(y), y, 1, 4, shade(GROUND.boisClair, -0.3));
    }
    speckle(tile, rng, shade(GROUND.boisClair, -0.1), 12);
    return tile;
  },

  tapis: () => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.tapis);
    fillRect(tile, 0, 0, TILE_SIZE, 1, GROUND.tapisSombre);
    fillRect(tile, 0, TILE_SIZE - 1, TILE_SIZE, 1, GROUND.tapisSombre);
    for (let y = 2; y < TILE_SIZE - 2; y += 4) {
      for (let x = 2; x < TILE_SIZE - 2; x += 4) {
        setPixel(tile, x, y, shade(GROUND.tapis, 0.25));
      }
    }
    return tile;
  },

  comptoir: () => {
    const tile = createSurface(TILE_SIZE, TILE_SIZE, GROUND.boisClair);
    fillRect(tile, 0, 0, TILE_SIZE, 4, GROUND.bois);
    fillRect(tile, 0, 0, TILE_SIZE, 1, shade(GROUND.boisClair, 0.3));
    fillRect(tile, 0, 4, TILE_SIZE, 1, GROUND.boisSombre);
    for (let x = 1; x < TILE_SIZE; x += 5) {
      fillRect(tile, x, 6, 1, TILE_SIZE - 6, shade(GROUND.boisClair, -0.25));
    }
    return tile;
  },

  vide: () => createSurface(TILE_SIZE, TILE_SIZE, hex('#000000')),
};

export interface Tileset {
  surface: MutableSurface;
  /** Nombre de trames de la tuile la plus animée : c'est la hauteur de l'atlas. */
  frameCount: number;
  /** Index de colonne de chaque tuile, dans l'ordre de `TILE_IDS`. */
  order: readonly TileId[];
}

export function buildTileset(): Tileset {
  const frameCount = Math.max(...TILE_IDS.map((id) => TILES[id].frames));
  const surface = createSurface(TILE_IDS.length * TILE_SIZE, frameCount * TILE_SIZE);

  TILE_IDS.forEach((id, column) => {
    const painter = PAINTERS[id];
    for (let frame = 0; frame < frameCount; frame++) {
      // Une tuile fixe répète sa première trame : le moteur de rendu peut donc lire
      // n'importe quelle ligne sans se soucier de savoir si la tuile est animée.
      const sourceFrame = frame % TILES[id].frames;
      const tile = painter(makeRng(hashTile(id, sourceFrame)), sourceFrame);
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          const index = (y * TILE_SIZE + x) * 4;
          const color: Color = [
            tile.data[index]!,
            tile.data[index + 1]!,
            tile.data[index + 2]!,
            tile.data[index + 3]!,
          ];
          setPixel(surface, column * TILE_SIZE + x, frame * TILE_SIZE + y, color);
        }
      }
    }
  });

  return { surface, frameCount, order: TILE_IDS };
}

function hashTile(id: TileId, frame: number): number {
  let hash = 0x9e3779b9;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return (hash ^ Math.imul(frame + 1, 0x85ebca6b)) >>> 0;
}
