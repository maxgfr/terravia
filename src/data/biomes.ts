/**
 * Biomes : le vocabulaire commun entre la génération du monde et les tables de rencontre.
 *
 * Une région tirée au sort reçoit un biome ; une espèce déclare les biomes où elle vit.
 * C'est ce qui permet à un monde généré aléatoirement de rester cohérent — on ne croise
 * pas une créature des cavernes en pleine prairie.
 */

export const BIOMES = ['prairie', 'foret', 'riviere', 'grotte', 'lande', 'montagne', 'ruines'] as const;
export type Biome = (typeof BIOMES)[number];

export const BIOME_NAMES: Record<Biome, { fr: string; en: string }> = {
  prairie: { fr: 'Prairie', en: 'Meadow' },
  foret: { fr: 'Forêt', en: 'Forest' },
  riviere: { fr: 'Rivière', en: 'Riverside' },
  grotte: { fr: 'Grotte', en: 'Cavern' },
  lande: { fr: 'Lande', en: 'Moor' },
  montagne: { fr: 'Montagne', en: 'Highlands' },
  ruines: { fr: 'Ruines', en: 'Ruins' },
};

/** Moment de la journée où une créature se montre. */
export const TIME_SLOTS = ['jour', 'nuit', 'toujours'] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];
