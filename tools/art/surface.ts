/**
 * Surface de dessin logicielle : un buffer RGBA et les quelques primitives nécessaires
 * pour composer du pixel art.
 *
 * Tout est en coordonnées entières et sans anticrénelage — on place des pixels, on ne
 * peint pas des formes lisses. C'est volontaire : un sprite dont les bords sont adoucis
 * perd son aspect pixel dès qu'on l'agrandit.
 */

import type { Surface } from './png.ts';

export type { Surface };

/** Couleur RGBA, canaux 0-255. */
export type Color = readonly [r: number, g: number, b: number, a: number];

export const TRANSPARENT: Color = [0, 0, 0, 0];

export interface MutableSurface extends Surface {
  readonly data: Uint8Array;
}

export function createSurface(width: number, height: number, fill?: Color): MutableSurface {
  const surface: MutableSurface = { width, height, data: new Uint8Array(width * height * 4) };
  if (fill) clear(surface, fill);
  return surface;
}

/** Parse `#rrggbb` ou `#rrggbbaa`. Pratique pour lire des palettes lisibles. */
export function hex(value: string): Color {
  const text = value.replace('#', '');
  const r = parseInt(text.slice(0, 2), 16);
  const g = parseInt(text.slice(2, 4), 16);
  const b = parseInt(text.slice(4, 6), 16);
  const a = text.length >= 8 ? parseInt(text.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

export function withAlpha(color: Color, alpha: number): Color {
  return [color[0], color[1], color[2], Math.round(clamp(alpha, 0, 1) * 255)];
}

/** Éclaircit (amount > 0) ou assombrit (amount < 0) une couleur, alpha inchangé. */
export function shade(color: Color, amount: number): Color {
  const mix = (channel: number): number =>
    Math.round(clamp(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount), 0, 255));
  return [mix(color[0]), mix(color[1]), mix(color[2]), color[3]];
}

export function mixColors(a: Color, b: Color, t: number): Color {
  const ratio = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * ratio),
    Math.round(a[1] + (b[1] - a[1]) * ratio),
    Math.round(a[2] + (b[2] - a[2]) * ratio),
    Math.round(a[3] + (b[3] - a[3]) * ratio),
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clear(surface: MutableSurface, color: Color = TRANSPARENT): void {
  const { data } = surface;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
}

export function inBounds(surface: Surface, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < surface.width && y < surface.height;
}

export function getPixel(surface: Surface, x: number, y: number): Color {
  if (!inBounds(surface, x, y)) return TRANSPARENT;
  const i = (y * surface.width + x) * 4;
  return [surface.data[i]!, surface.data[i + 1]!, surface.data[i + 2]!, surface.data[i + 3]!];
}

/** Écrit le pixel tel quel, en écrasant ce qui s'y trouvait (alpha compris). */
export function setPixel(surface: MutableSurface, x: number, y: number, color: Color): void {
  if (!inBounds(surface, x, y)) return;
  const i = (y * surface.width + x) * 4;
  surface.data[i] = color[0];
  surface.data[i + 1] = color[1];
  surface.data[i + 2] = color[2];
  surface.data[i + 3] = color[3];
}

/** Compose le pixel par-dessus l'existant (source-over classique). */
export function blendPixel(surface: MutableSurface, x: number, y: number, color: Color): void {
  if (!inBounds(surface, x, y)) return;
  if (color[3] === 0) return;
  if (color[3] === 255) return setPixel(surface, x, y, color);

  const i = (y * surface.width + x) * 4;
  const srcAlpha = color[3] / 255;
  const dstAlpha = surface.data[i + 3]! / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
  if (outAlpha === 0) return setPixel(surface, x, y, TRANSPARENT);

  for (let c = 0; c < 3; c++) {
    const src = color[c]! / 255;
    const dst = surface.data[i + c]! / 255;
    surface.data[i + c] = Math.round(((src * srcAlpha + dst * dstAlpha * (1 - srcAlpha)) / outAlpha) * 255);
  }
  surface.data[i + 3] = Math.round(outAlpha * 255);
}

export function fillRect(
  surface: MutableSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color,
): void {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) blendPixel(surface, px, py, color);
  }
}

export function strokeRect(
  surface: MutableSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color,
): void {
  for (let px = x; px < x + width; px++) {
    blendPixel(surface, px, y, color);
    blendPixel(surface, px, y + height - 1, color);
  }
  for (let py = y; py < y + height; py++) {
    blendPixel(surface, x, py, color);
    blendPixel(surface, x + width - 1, py, color);
  }
}

/** Ellipse pleine centrée sur (cx, cy). Les rayons peuvent être fractionnaires. */
export function fillEllipse(
  surface: MutableSurface,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: Color,
): void {
  if (rx <= 0 || ry <= 0) return;
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(surface.height - 1, Math.ceil(cy + ry));
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(surface.width - 1, Math.ceil(cx + rx));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) blendPixel(surface, x, y, color);
    }
  }
}

export function fillCircle(
  surface: MutableSurface,
  cx: number,
  cy: number,
  radius: number,
  color: Color,
): void {
  fillEllipse(surface, cx, cy, radius, radius, color);
}

/** Segment tracé par l'algorithme de Bresenham. */
export function drawLine(
  surface: MutableSurface,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Color,
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  const stepX = x < endX ? 1 : -1;
  const stepY = y < endY ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    blendPixel(surface, x, y, color);
    if (x === endX && y === endY) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}

export interface BlitOptions {
  /** Zone source (par défaut : toute la surface source). */
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  /** Miroir horizontal au moment de la copie. */
  flipX?: boolean;
  /** Multiplie l'alpha de la source (0 à 1). */
  opacity?: number;
}

export function blit(
  destination: MutableSurface,
  source: Surface,
  x: number,
  y: number,
  options: BlitOptions = {},
): void {
  const sx = options.sourceX ?? 0;
  const sy = options.sourceY ?? 0;
  const width = options.sourceWidth ?? source.width - sx;
  const height = options.sourceHeight ?? source.height - sy;
  const opacity = options.opacity ?? 1;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const readX = options.flipX ? sx + width - 1 - col : sx + col;
      const pixel = getPixel(source, readX, sy + row);
      if (pixel[3] === 0) continue;
      const color: Color =
        opacity >= 1 ? pixel : [pixel[0], pixel[1], pixel[2], Math.round(pixel[3] * opacity)];
      blendPixel(destination, x + col, y + row, color);
    }
  }
}

/** Copie la moitié gauche sur la moitié droite. La base de tous les sprites de créatures. */
export function mirrorLeftToRight(surface: MutableSurface): void {
  const half = Math.floor(surface.width / 2);
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < half; x++) {
      setPixel(surface, surface.width - 1 - x, y, getPixel(surface, x, y));
    }
  }
}

export function flipHorizontal(source: Surface): MutableSurface {
  const out = createSurface(source.width, source.height);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      setPixel(out, source.width - 1 - x, y, getPixel(source, x, y));
    }
  }
  return out;
}

/**
 * Cerne les pixels opaques d'un liseré d'un pixel.
 *
 * C'est ce qui sépare un sprite d'une tache de couleur : sans contour, une créature
 * sombre disparaît sur un fond sombre. Le liseré est posé *autour* de la silhouette,
 * jamais dessus, donc il n'ampute pas le dessin.
 */
export function outline(surface: MutableSurface, color: Color, includeDiagonals = false): void {
  const neighbours = includeDiagonals
    ? [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]
    : [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];

  const targets: Array<[number, number]> = [];
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (getPixel(surface, x, y)[3] !== 0) continue;
      const touchesShape = neighbours.some(([dx, dy]) => {
        const nx = x + dx!;
        const ny = y + dy!;
        return inBounds(surface, nx, ny) && getPixel(surface, nx, ny)[3] > 0;
      });
      if (touchesShape) targets.push([x, y]);
    }
  }
  for (const [x, y] of targets) setPixel(surface, x, y, color);
}

/** Applique une fonction à chaque pixel opaque : ombrage, teinte, altération. */
export function mapPixels(
  surface: MutableSurface,
  transform: (color: Color, x: number, y: number) => Color,
): void {
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const current = getPixel(surface, x, y);
      if (current[3] === 0) continue;
      setPixel(surface, x, y, transform(current, x, y));
    }
  }
}

/** Boîte englobante des pixels opaques, ou `null` si la surface est vide. */
export function opaqueBounds(
  surface: Surface,
): { x: number; y: number; width: number; height: number } | null {
  let minX = surface.width;
  let minY = surface.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (getPixel(surface, x, y)[3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Motif de tramage 4×4 (Bayer) : dégradés en pixel art sans dégradé lisse. */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/** Vrai si le pixel doit recevoir la couleur pour représenter l'intensité donnée (0 à 1). */
export function ditherAt(x: number, y: number, intensity: number): boolean {
  const threshold = (BAYER_4X4[y & 3]![x & 3]! + 0.5) / 16;
  return intensity > threshold;
}
