/**
 * Générateur pseudo-aléatoire déterministe, partagé par le jeu et les outils.
 *
 * Tout ce qui est « aléatoire » dans Terravia passe par ici : la génération du monde,
 * les sprites, les gènes d'une créature, les jets de combat. Aucun appel à Math.random()
 * n'est autorisé ailleurs — un monde doit être reconstructible à l'identique depuis sa seed.
 *
 * Règle de sous-seeds : chaque système dérive sa propre suite via `subSeed(seed, ...parts)`.
 * Sans ça, ajouter un tirage dans la génération du terrain décalerait toutes les positions
 * de PNJ et casserait les sauvegardes existantes.
 */

/** Hachage FNV-1a 32 bits — rapide, stable, sans dépendance. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // hash *= 16777619, en arithmétique 32 bits
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Dérive une seed fille à partir d'une seed mère et d'étiquettes (nombres ou chaînes). */
export function subSeed(seed: number, ...parts: Array<string | number>): number {
  let hash = seed >>> 0;
  for (const part of parts) {
    const value = typeof part === 'number' ? part >>> 0 : hashString(part);
    hash = (hash ^ value) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash = (hash ^ (hash >>> 15)) >>> 0;
  }
  return hash >>> 0;
}

export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number;
  /** Flottant dans [min, max). */
  float(min: number, max: number): number;
  /** Vrai avec la probabilité donnée (0 à 1). */
  chance(probability: number): boolean;
  /** Un élément au hasard. Lève si le tableau est vide. */
  pick<T>(items: readonly T[]): T;
  /** Copie mélangée (Fisher-Yates), l'entrée n'est pas modifiée. */
  shuffle<T>(items: readonly T[]): T[];
  /** Un élément tiré selon des poids relatifs. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
}

/** Crée un générateur mulberry32 à partir d'une seed numérique. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick sur un tableau vide');
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle: (items) => {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
    weighted: (items, weightOf) => {
      if (items.length === 0) throw new Error('rng.weighted sur un tableau vide');
      let total = 0;
      for (const item of items) total += Math.max(0, weightOf(item));
      if (total <= 0) return items[0]!;
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weightOf(item));
        if (roll < 0) return item;
      }
      return items[items.length - 1]!;
    },
  };

  return rng;
}

/** Raccourci : un générateur dérivé d'une seed mère et d'étiquettes. */
export function rngFor(seed: number, ...parts: Array<string | number>): Rng {
  return makeRng(subSeed(seed, ...parts));
}

/**
 * Seed lisible par un humain, du type « brume-3f7a ».
 * Sert d'identité de partie : on peut la partager pour rejouer le même monde.
 */
const SEED_WORDS = [
  'brume',
  'cendre',
  'orage',
  'verdure',
  'givre',
  'silex',
  'aurore',
  'abysse',
  'sylve',
  'braise',
  'ecume',
  'ombre',
  'foudre',
  'roseau',
  'granit',
  'zephyr',
] as const;

/** Convertit une chaîne de seed en valeur numérique utilisable. */
export function seedValue(seedText: string): number {
  return hashString(seedText.trim().toLowerCase());
}

/** Fabrique une seed lisible à partir d'une source d'entropie (0 à 1). */
export function makeSeedText(entropy: number): string {
  const value = Math.floor(entropy * 0xffffffff) >>> 0;
  const word = SEED_WORDS[value % SEED_WORDS.length]!;
  const suffix = (value >>> 8).toString(16).padStart(4, '0').slice(0, 4);
  return `${word}-${suffix}`;
}
