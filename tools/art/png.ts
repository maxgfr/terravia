/**
 * Encodeur PNG minimal, sans aucune dépendance.
 *
 * Le seul outil dont on a besoin est `node:zlib`, qui fournit le DEFLATE exigé par le
 * format. Le reste — signature, chunks, CRC32, filtrage des lignes — tient en une page et
 * évite d'installer une bibliothèque d'images pour écrire des sprites de 64×64.
 *
 * Référence : https://www.w3.org/TR/png/ (PNG 3ᵉ édition)
 */

import { deflateSync } from 'node:zlib';

export interface Surface {
  readonly width: number;
  readonly height: number;
  /** RGBA non prémultiplié, 4 octets par pixel, ligne par ligne. */
  readonly data: Uint8Array;
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

/** Assemble un chunk PNG : longueur, type, données, CRC (calculé sur type + données). */
function chunk(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + payload.length);
  writeUint32(out, 0, payload.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  const crc = crc32(out.subarray(4, 8 + payload.length));
  writeUint32(out, 8 + payload.length, crc);
  return out;
}

/**
 * Prédicteur Paeth, tel que défini par la spécification.
 * `a` = pixel de gauche, `b` = pixel du dessus, `c` = pixel en haut à gauche.
 */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Filtre chaque ligne avec la méthode qui minimise la somme des valeurs absolues —
 * l'heuristique recommandée par la spécification. Sur des sprites en aplats, ça divise
 * typiquement le poids du fichier par deux par rapport à un filtrage nul.
 */
function filterScanlines(width: number, height: number, data: Uint8Array): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  const best = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    let bestType = 0;
    let bestScore = Infinity;

    for (let type = 0; type <= 4; type++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const raw = data[rowStart + i]!;
        const left = i >= 4 ? data[rowStart + i - 4]! : 0;
        const up = y > 0 ? data[prevStart + i]! : 0;
        const upLeft = y > 0 && i >= 4 ? data[prevStart + i - 4]! : 0;

        let value: number;
        switch (type) {
          case 0:
            value = raw;
            break;
          case 1:
            value = raw - left;
            break;
          case 2:
            value = raw - up;
            break;
          case 3:
            value = raw - ((left + up) >> 1);
            break;
          default:
            value = raw - paeth(left, up, upLeft);
            break;
        }
        value &= 0xff;
        candidate[i] = value;
        // Les octets sont interprétés en signé pour le score : un écart de -1 coûte 1.
        score += value < 128 ? value : 256 - value;
      }

      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        best.set(candidate);
      }
    }

    out[y * (stride + 1)] = bestType;
    out.set(best, y * (stride + 1) + 1);
  }

  return out;
}

/** Encode une surface RGBA en fichier PNG (couleur vraie avec alpha, 8 bits par canal). */
export function encodePng(surface: Surface): Uint8Array {
  const { width, height, data } = surface;
  if (data.length !== width * height * 4) {
    throw new Error(
      `Taille de buffer incohérente : ${data.length} octets pour ${width}×${height} (attendu ${width * height * 4}).`,
    );
  }

  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header[8] = 8; // profondeur : 8 bits par canal
  header[9] = 6; // type de couleur : 6 = RGBA
  header[10] = 0; // compression : deflate
  header[11] = 0; // filtrage : méthode standard
  header[12] = 0; // entrelacement : aucun

  const compressed = deflateSync(filterScanlines(width, height, data), { level: 9 });

  const chunks = [
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const file = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    file.set(part, offset);
    offset += part.length;
  }
  return file;
}
