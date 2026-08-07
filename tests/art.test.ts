import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { encodePng } from '../tools/art/png.ts';
import { CHARSET, buildFontAtlas, renderGlyph } from '../tools/art/font.ts';
import { buildTileset } from '../tools/art/tiles.ts';
import { buildCreatureSheet, drawCreature } from '../tools/art/creature.ts';
import { ICON_IDS } from '../tools/art/ui.ts';
import { CHARACTER_IDS } from '../tools/art/characters.ts';
import { createSurface, getPixel } from '../tools/art/surface.ts';

import { SPECIES, SPECIES_IDS } from '../src/data/species.ts';
import { MOVE_IDS, MOVES } from '../src/data/moves.ts';
import { TALENT_IDS, TALENTS } from '../src/data/talents.ts';
import { TYPE_NAMES, ELEMENT_TYPES } from '../src/data/types.ts';
import { STATUS_NAMES, STATUSES, STAT_KEYS, STAT_NAMES } from '../src/data/stats.ts';
import { BIOMES, BIOME_NAMES } from '../src/data/biomes.ts';
import { TILE_IDS } from '../src/world/tiles.ts';

const ART = join(import.meta.dirname, '..', 'public', 'art');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(ART, name), 'utf8')) as T;
}

describe('encodeur PNG', () => {
  it('produit un fichier commençant par la signature PNG', () => {
    const png = encodePng(createSurface(4, 4, [10, 20, 30, 255]));
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('termine par un chunk IEND', () => {
    const png = encodePng(createSurface(2, 2, [0, 0, 0, 255]));
    const fin = new TextDecoder().decode(png.slice(-8, -4));
    expect(fin).toBe('IEND');
  });

  it('refuse un buffer de taille incohérente', () => {
    expect(() => encodePng({ width: 4, height: 4, data: new Uint8Array(10) })).toThrow(/incohérente/);
  });

  it('produit deux fois les mêmes octets pour la même surface', () => {
    const surface = createSurface(8, 8, [1, 2, 3, 255]);
    expect(encodePng(surface)).toEqual(encodePng(surface));
  });
});

describe('génération déterministe', () => {
  it('redonne exactement le même jeu de tuiles', () => {
    expect(buildTileset().surface.data).toEqual(buildTileset().surface.data);
  });

  it('redonne exactement le même sprite pour une espèce', () => {
    const premier = drawCreature(SPECIES.folianz, 'face');
    const second = drawCreature(SPECIES.folianz, 'face');
    expect(premier.data).toEqual(second.data);
  });

  it('donne des sprites différents à deux espèces différentes', () => {
    const folianz = drawCreature(SPECIES.folianz, 'face');
    const braisou = drawCreature(SPECIES.braisou, 'face');
    expect(folianz.data).not.toEqual(braisou.data);
  });

  it('donne des vues face et dos distinctes', () => {
    expect(drawCreature(SPECIES.sylvanor, 'face').data).not.toEqual(
      drawCreature(SPECIES.sylvanor, 'dos').data,
    );
  });
});

describe('sprites de créatures', () => {
  it('dessine chaque espèce sans laisser la case vide', () => {
    for (const id of SPECIES_IDS) {
      for (const view of ['face', 'dos'] as const) {
        const sprite = drawCreature(SPECIES[id], view);
        let opaques = 0;
        for (let i = 3; i < sprite.data.length; i += 4) if (sprite.data[i]! > 0) opaques++;
        // Un sprite quasi vide signale une silhouette dont les proportions ont dérapé.
        expect(opaques, `${id}/${view} est presque vide`).toBeGreaterThan(400);
      }
    }
  });

  it('garde les créatures dans leur cadre', () => {
    for (const id of SPECIES_IDS) {
      const sprite = drawCreature(SPECIES[id], 'face');
      // Le bord du cadre doit rester libre, sinon le sprite paraît coupé en combat.
      for (let x = 0; x < sprite.width; x++) {
        expect(getPixel(sprite, x, 0)[3], `${id} déborde en haut`).toBe(0);
      }
      for (let y = 0; y < sprite.height; y++) {
        expect(getPixel(sprite, 0, y)[3], `${id} déborde à gauche`).toBe(0);
        expect(getPixel(sprite, sprite.width - 1, y)[3], `${id} déborde à droite`).toBe(0);
      }
    }
  });
});

describe('planches publiées', () => {
  it('recense toutes les planches dans le manifeste', () => {
    const manifest = readJson<{ entries: Array<{ file: string; bytes: number }> }>('manifest.json');
    const attendus = [
      'font.png',
      'tileset.png',
      'frame.png',
      'badges.png',
      'icons.png',
      'characters.png',
      'creatures.png',
    ];
    const fichiers = manifest.entries.map((entry) => entry.file);
    for (const attendu of attendus) expect(fichiers).toContain(attendu);
    for (const entry of manifest.entries) expect(entry.bytes, entry.file).toBeGreaterThan(0);
  });

  it('donne à chaque espèce déclarée sa place dans la planche de créatures', () => {
    // C'est le test qui empêche l'écart entre la donnée et l'art : ajouter une espèce
    // sans régénérer les sprites fait échouer l'intégration continue, pas le jeu.
    const meta = readJson<{ order: string[]; size: number; views: string[] }>('creatures.json');
    expect(meta.order).toEqual(SPECIES_IDS);
    expect(meta.views).toEqual(['face', 'dos']);
    const sheet = buildCreatureSheet();
    expect(sheet.surface.height).toBe(SPECIES_IDS.length * meta.size);
    expect(sheet.surface.width).toBe(meta.views.length * meta.size);
  });

  it('donne à chaque tuile déclarée sa colonne', () => {
    const meta = readJson<{ order: string[]; tileSize: number }>('tileset.json');
    expect(meta.order).toEqual([...TILE_IDS]);
  });

  it('publie les icônes et les personnages dans l’ordre déclaré', () => {
    const ui = readJson<{ icons: { order: string[] }; badge: { order: string[] } }>('ui.json');
    expect(ui.icons.order).toEqual([...ICON_IDS]);
    expect(ui.badge.order).toEqual([...ELEMENT_TYPES]);
    const characters = readJson<{ order: string[] }>('characters.json');
    expect(characters.order).toEqual([...CHARACTER_IDS]);
  });
});

describe('couverture de la police', () => {
  /** Tout le texte que le jeu peut afficher à partir de ses données de contenu. */
  function textesDuJeu(): string[] {
    const textes: string[] = [];
    for (const id of SPECIES_IDS) {
      const species = SPECIES[id];
      textes.push(species.nom.fr, species.nom.en, species.description.fr, species.description.en);
    }
    for (const id of MOVE_IDS) {
      const move = MOVES[id];
      textes.push(move.nom.fr, move.nom.en, move.description.fr, move.description.en);
    }
    for (const id of TALENT_IDS) {
      const talent = TALENTS[id];
      textes.push(talent.nom.fr, talent.nom.en, talent.description.fr, talent.description.en);
    }
    for (const type of ELEMENT_TYPES) textes.push(TYPE_NAMES[type].fr, TYPE_NAMES[type].en);
    for (const statut of STATUSES) {
      textes.push(STATUS_NAMES[statut].fr, STATUS_NAMES[statut].en, STATUS_NAMES[statut].court);
    }
    for (const stat of STAT_KEYS) {
      textes.push(STAT_NAMES[stat].fr, STAT_NAMES[stat].en, STAT_NAMES[stat].court);
    }
    for (const biome of BIOMES) textes.push(BIOME_NAMES[biome].fr, BIOME_NAMES[biome].en);
    return textes;
  }

  it('dessine chaque caractère que le contenu du jeu peut afficher', () => {
    // Sans ce test, un caractère absent de la police s'affiche « ? » en jeu et
    // personne ne s'en aperçoit avant de lire la description concernée.
    const disponibles = new Set(CHARSET);
    const manquants = new Map<string, string>();
    for (const texte of textesDuJeu()) {
      for (const char of texte) {
        if (!disponibles.has(char)) manquants.set(char, texte);
      }
    }
    expect([...manquants.entries()]).toEqual([]);
  });

  it('publie un atlas dont la taille correspond au nombre de glyphes', () => {
    const atlas = buildFontAtlas();
    const meta = readJson<{ charset: string; columns: number; cellWidth: number; cellHeight: number }>(
      'font.json',
    );
    expect([...meta.charset]).toEqual([...CHARSET]);
    expect(atlas.surface.width).toBe(meta.columns * meta.cellWidth);
    expect(atlas.surface.height).toBe(Math.ceil(CHARSET.length / meta.columns) * meta.cellHeight);
  });

  it('ne laisse aucun glyphe visible entièrement vide, sauf l’espace', () => {
    const vides = CHARSET.filter((char) => char !== ' ' && pixelsAllumes(char) === 0);
    expect(vides).toEqual([]);
  });

  it('distingue un caractère accentué de sa lettre de base', () => {
    // Si la composition de l'accent échouait silencieusement, « é » rendrait « e ».
    expect(pixelsAllumes('é')).toBeGreaterThan(pixelsAllumes('e'));
    expect(pixelsAllumes('ç')).toBeGreaterThan(pixelsAllumes('c'));
    expect(pixelsAllumes('Ê')).toBeGreaterThan(pixelsAllumes('E'));
  });
});

/** Nombre de pixels allumés dans le glyphe d'un caractère. */
function pixelsAllumes(char: string): number {
  const glyph = renderGlyph(char);
  let allumes = 0;
  for (let i = 3; i < glyph.data.length; i += 4) if (glyph.data[i]! > 0) allumes++;
  return allumes;
}
