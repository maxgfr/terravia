/**
 * Police bitmap 5×7, dessinée à la main.
 *
 * Terravia n'utilise pas les polices du système : à 320 px de large, du texte vectoriel
 * rendu petit devient flou et casse l'unité visuelle avec les sprites. Les glyphes sont
 * donc des grilles de pixels, écrites ici en clair — un `#` allume un pixel.
 *
 * Métriques de la cellule (6 × 11) :
 *   lignes 0-1   accents (é, à, ê, ë…)
 *   lignes 2-8   corps des majuscules, chiffres et hampes ; minuscules à partir de 4
 *   lignes 9-10  jambages (g, j, p, q, y)
 *   colonne 5    gouttière — l'espacement est inclus dans la cellule
 *
 * Les caractères accentués ne sont pas dessinés : ils sont composés en repérant le haut
 * du glyphe de base et en tamponnant l'accent juste au-dessus. Vingt-neuf glyphes de
 * moins à maintenir, et un accent toujours à la bonne hauteur.
 */

import { blit, createSurface, getPixel, opaqueBounds, setPixel, type Color, type MutableSurface } from './surface.ts';

export const GLYPH_WIDTH = 5;
export const CELL_WIDTH = 6;
export const CELL_HEIGHT = 11;
/** Ligne où commence le corps du glyphe dans la cellule. */
const BODY_TOP = 2;
/** Colonnes de l'atlas. */
const ATLAS_COLUMNS = 16;

/** Glyphes de base : lignes séparées par `/`, 5 colonnes par ligne. */
const GLYPHS: Record<string, string> = {
  ' ': '...../...../...../...../...../...../.....',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##',
  '&': '.##../#..#./#..#./.##../#.#.#/#..#./.##.#',
  "'": '..#../..#../...../...../...../...../.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '*': '...../..#../#.#.#/.###./#.#.#/..#../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  ',': '...../...../...../...../...../...../..#../..#../.#...',
  '-': '...../...../...../#####/...../...../.....',
  '.': '...../...../...../...../...../...../..#..',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '#####/...#./..#../...#./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  ':': '...../...../..#../...../...../..#../.....',
  ';': '...../...../..#../...../...../..#../..#../.#.../.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '=': '...../...../#####/...../#####/...../.....',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '###../#..#./#...#/#...#/#...#/#..#./###..',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  '\\': '#..../#..../.#.../..#../...#./....#/....#',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '^': '..#../.#.#./#...#/...../...../...../.....',
  _: '...../...../...../...../...../...../...../#####',
  '`': '.#.../..#../...../...../...../...../.....',
  a: '...../...../.###./....#/.####/#...#/.####',
  b: '#..../#..../####./#...#/#...#/#...#/####.',
  c: '...../...../.####/#..../#..../#..../.####',
  d: '....#/....#/.####/#...#/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.###.',
  f: '..##./.#..#/.#.../###../.#.../.#.../.#...',
  g: '...../...../.####/#...#/#...#/#...#/.####/....#/.###.',
  h: '#..../#..../####./#...#/#...#/#...#/#...#',
  i: '..#../...../.##../..#../..#../..#../.###.',
  j: '...#./...../..##./...#./...#./...#./...#./#..#./.##..',
  k: '#..../#..../#..#./#.#../##.../#.#../#..#.',
  l: '.##../..#../..#../..#../..#../..#../.###.',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '...../...../####./#...#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/#...#/####./#..../#....',
  q: '...../...../.####/#...#/#...#/#...#/.####/....#/....#',
  r: '...../...../#.##./##..#/#..../#..../#....',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '.#.../.#.../###../.#.../.#.../.#..#/..##.',
  u: '...../...../#...#/#...#/#...#/#...#/.####',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/#...#/#...#/.####/....#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####',
  '{': '...##/..#../..#../.#.../..#../..#../...##',
  '|': '..#../..#../..#../..#../..#../..#../..#..',
  '}': '##.../..#../..#../...#./..#../..#../##...',
  '~': '...../...../.#..#/#.#.#/#..#./...../.....',
  // Typographie française : apostrophe courbe, ligature œ, guillemets, points de suspension.
  '’': '...#./..#../...../...../...../...../.....',
  œ: '...../...../.####/#.#.#/#.###/#.#../.####',
  Œ: '.####/#.#../#.#../#.###/#.#../#.#../.####',
  '«': '...../...../.#.#./#.#../.#.#./...../.....',
  '»': '...../...../#.#../.#.#./#.#../...../.....',
  '…': '...../...../...../...../...../...../#.#.#',
  '–': '...../...../...../#####/...../...../.....',
  '—': '...../...../...../#####/...../...../.....',
  '·': '...../...../...../..#../...../...../.....',
  // Symboles propres au jeu : flèche de continuation, curseur de menu, multiplication.
  '→': '...../..#../...#./#####/...#./..#../.....',
  '▶': '.#.../.##../.###./.####/.###./.##../.#...',
  '×': '...../...../#...#/.#.#./..#../.#.#./#...#',
  '♦': '..#../.###./#####/#####/.###./..#../.....',
};

/** Marques diacritiques, tamponnées au-dessus du glyphe de base. */
const ACCENTS: Record<string, string> = {
  aigu: '...#./..#..',
  grave: '.#.../..#..',
  circonflexe: '..#../.#.#.',
  trema: '.#.#./.....',
};

/** Caractère accentué → glyphe de base + marque. La cédille est traitée à part. */
const COMPOSED: Record<string, [base: string, accent: keyof typeof ACCENTS | 'cedille']> = {
  à: ['a', 'grave'],
  â: ['a', 'circonflexe'],
  ä: ['a', 'trema'],
  é: ['e', 'aigu'],
  è: ['e', 'grave'],
  ê: ['e', 'circonflexe'],
  ë: ['e', 'trema'],
  î: ['i', 'circonflexe'],
  ï: ['i', 'trema'],
  ô: ['o', 'circonflexe'],
  ö: ['o', 'trema'],
  ù: ['u', 'grave'],
  û: ['u', 'circonflexe'],
  ü: ['u', 'trema'],
  ç: ['c', 'cedille'],
  Ç: ['C', 'cedille'],
  À: ['A', 'grave'],
  Â: ['A', 'circonflexe'],
  Ä: ['A', 'trema'],
  É: ['E', 'aigu'],
  È: ['E', 'grave'],
  Ê: ['E', 'circonflexe'],
  Ë: ['E', 'trema'],
  Î: ['I', 'circonflexe'],
  Ï: ['I', 'trema'],
  Ô: ['O', 'circonflexe'],
  Ö: ['O', 'trema'],
  Ù: ['U', 'grave'],
  Û: ['U', 'circonflexe'],
  Ü: ['U', 'trema'],
};

const CEDILLA = '...../..#../.##..';

/** Ordre des glyphes dans l'atlas. L'index d'un caractère est sa position ici. */
export const CHARSET: readonly string[] = [...Object.keys(GLYPHS), ...Object.keys(COMPOSED)];

const WHITE: Color = [255, 255, 255, 255];

/** Dessine un glyphe de base dans une cellule vierge de 6 × 11. */
function renderBase(pattern: string): MutableSurface {
  const cell = createSurface(CELL_WIDTH, CELL_HEIGHT);
  const rows = pattern.split('/');
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row]!;
    for (let col = 0; col < GLYPH_WIDTH; col++) {
      if (line[col] === '#') setPixel(cell, col, BODY_TOP + row, WHITE);
    }
  }
  return cell;
}

/** Dessine un caractère, en composant l'accent si nécessaire. */
export function renderGlyph(char: string): MutableSurface {
  const direct = GLYPHS[char];
  if (direct !== undefined) return renderBase(direct);

  const composed = COMPOSED[char];
  if (!composed) return renderBase(GLYPHS['?']!);

  const [baseChar, mark] = composed;
  const cell = renderBase(GLYPHS[baseChar]!);
  const bounds = opaqueBounds(cell);
  if (!bounds) return cell;

  if (mark === 'cedille') {
    // La cédille se pose sous le glyphe, décalée d'une colonne vers la droite.
    const rows = CEDILLA.split('/');
    for (let row = 0; row < rows.length; row++) {
      const line = rows[row]!;
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        if (line[col] === '#') setPixel(cell, col, bounds.y + bounds.height - 1 + row, WHITE);
      }
    }
    return cell;
  }

  // L'accent se pose juste au-dessus du sommet réel du glyphe : une minuscule le porte
  // donc plus bas qu'une majuscule, sans qu'on ait à le dire glyphe par glyphe.
  const rows = ACCENTS[mark]!.split('/');
  const top = bounds.y - rows.length;
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row]!;
    for (let col = 0; col < GLYPH_WIDTH; col++) {
      if (line[col] === '#') setPixel(cell, col, top + row, WHITE);
    }
  }
  return cell;
}

export interface FontAtlas {
  surface: MutableSurface;
  metrics: {
    cellWidth: number;
    cellHeight: number;
    columns: number;
    charset: string;
  };
}

/**
 * Assemble tous les glyphes en une seule image, en blanc pur sur fond transparent.
 * Le jeu la teinte à l'exécution : une image, toutes les couleurs de texte.
 */
export function buildFontAtlas(): FontAtlas {
  const chars = CHARSET;
  const rows = Math.ceil(chars.length / ATLAS_COLUMNS);
  const surface = createSurface(ATLAS_COLUMNS * CELL_WIDTH, rows * CELL_HEIGHT);

  chars.forEach((char, index) => {
    const glyph = renderGlyph(char);
    const x = (index % ATLAS_COLUMNS) * CELL_WIDTH;
    const y = Math.floor(index / ATLAS_COLUMNS) * CELL_HEIGHT;
    blit(surface, glyph, x, y);
  });

  return {
    surface,
    metrics: {
      cellWidth: CELL_WIDTH,
      cellHeight: CELL_HEIGHT,
      columns: ATLAS_COLUMNS,
      charset: chars.join(''),
    },
  };
}

/**
 * Écrit du texte directement sur une surface. Utilisé par le générateur lui-même
 * (planches de contrôle, badges de type), pas par le jeu.
 */
export function drawText(
  target: MutableSurface,
  text: string,
  x: number,
  y: number,
  color: Color,
): void {
  let cursor = x;
  for (const char of text) {
    const glyph = renderGlyph(char);
    for (let gy = 0; gy < CELL_HEIGHT; gy++) {
      for (let gx = 0; gx < CELL_WIDTH; gx++) {
        if (getPixel(glyph, gx, gy)[3] > 0) setPixel(target, cursor + gx, y + gy, color);
      }
    }
    cursor += CELL_WIDTH;
  }
}

export function measureText(text: string): number {
  return [...text].length * CELL_WIDTH;
}
