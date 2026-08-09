/**
 * `npm run art` — régénère tout l'art du jeu dans `public/art/`.
 *
 * Le résultat est déterministe : à code identique, les octets produits sont identiques.
 * C'est ce qui rend acceptable de commiter des PNG — une régénération ne pollue pas
 * l'historique, et un vrai changement d'art apparaît comme un vrai diff.
 *
 * Chaque planche est accompagnée de ses métadonnées (taille de cellule, ordre des
 * éléments) pour que le jeu n'ait jamais à supposer une disposition.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng, type Surface } from './png.ts';
import { buildFontAtlas } from './font.ts';
import { buildTileset, TILE_SIZE } from './tiles.ts';
import {
  BADGE_HEIGHT,
  BADGE_WIDTH,
  ICONE_TAILLES,
  INSIGNE_SIZE,
  buildBadges,
  buildFrame,
  buildIcone,
  buildIcons,
  buildInsignes,
  FRAME_SLICE,
  ICON_IDS,
  ICON_SIZE,
} from './ui.ts';
import {
  buildCharacterSheet,
  CHARACTER_DIRECTIONS,
  CHARACTER_FRAMES,
  CHARACTER_HEIGHT,
  CHARACTER_IDS,
  CHARACTER_WIDTH,
} from './characters.ts';
import { buildCreatureSheet, CREATURE_SIZE, CREATURE_VIEWS } from './creature.ts';
import { ELEMENT_TYPES } from '../../src/data/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'public');
const OUTPUT = join(PUBLIC, 'art');

interface Entry {
  file: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

const entries: Entry[] = [];

/**
 * Écrit une planche. `dossier` vaut `public/art/` sauf pour les icônes de l'application,
 * que le navigateur réclame à la racine du site.
 */
function emit(name: string, surface: Surface, dossier: string = OUTPUT): void {
  const png = encodePng(surface);
  const path = join(dossier, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  entries.push({
    file: relative(PUBLIC, path),
    width: surface.width,
    height: surface.height,
    bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex').slice(0, 16),
  });
  console.log(`  ${relative(PUBLIC, path).padEnd(24)} ${surface.width}×${surface.height}  ${formatBytes(png.length)}`);
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} o` : `${(bytes / 1024).toFixed(1)} Kio`;
}

function writeJson(name: string, value: unknown): void {
  const path = join(OUTPUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

console.log('Génération de l’art de Terravia');
console.log(`  cible : ${relative(ROOT, OUTPUT)}/\n`);

// ── Police ───────────────────────────────────────────────────────────────────
const font = buildFontAtlas();
emit('font.png', font.surface);
writeJson('font.json', font.metrics);

// ── Terrain ──────────────────────────────────────────────────────────────────
const tileset = buildTileset();
emit('tileset.png', tileset.surface);
writeJson('tileset.json', {
  tileSize: TILE_SIZE,
  frameCount: tileset.frameCount,
  order: tileset.order,
});

// ── Interface ────────────────────────────────────────────────────────────────
emit('frame.png', buildFrame());
emit('badges.png', buildBadges());
emit('insignes.png', buildInsignes());
emit('icons.png', buildIcons());
writeJson('ui.json', {
  frameSlice: FRAME_SLICE,
  badge: { width: BADGE_WIDTH, height: BADGE_HEIGHT, order: ELEMENT_TYPES },
  insigne: { size: INSIGNE_SIZE, order: ELEMENT_TYPES },
  icons: { size: ICON_SIZE, order: ICON_IDS },
});

// ── Personnages ──────────────────────────────────────────────────────────────
emit('characters.png', buildCharacterSheet());
writeJson('characters.json', {
  width: CHARACTER_WIDTH,
  height: CHARACTER_HEIGHT,
  frames: CHARACTER_FRAMES,
  directions: CHARACTER_DIRECTIONS,
  order: CHARACTER_IDS,
});

// ── Créatures ────────────────────────────────────────────────────────────────
const creatures = buildCreatureSheet();
emit('creatures.png', creatures.surface);
writeJson('creatures.json', {
  size: CREATURE_SIZE,
  views: CREATURE_VIEWS,
  order: creatures.order,
});

// ── Icône de l'application ───────────────────────────────────────────────────
// Elle ne vit pas dans `art/` : le navigateur la réclame à la racine du site, et le
// manifeste comme index.html y renvoient par un chemin fixe.
for (const taille of ICONE_TAILLES) {
  emit(`icone-${taille}.png`, buildIcone(taille), PUBLIC);
}

// ── Manifeste ────────────────────────────────────────────────────────────────
writeJson('manifest.json', { generatedBy: 'npm run art', entries });

const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`\n  ${entries.length} planches, ${formatBytes(total)} au total.`);
