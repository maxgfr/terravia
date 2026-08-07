/**
 * Le monde : un graphe de régions, tiré d'une seed.
 *
 * La **topologie est fixe** — bourg, routes, bois, village, grotte, arène — parce
 * qu'elle porte la progression : difficulté croissante, ravitaillement à mi-parcours,
 * boss au bout. Ce que la seed décide, c'est le biome de chaque route, la forme du
 * terrain, le contenu et le placement de tout ce qui s'y trouve.
 *
 * Deux parties ne se ressemblent donc pas, mais aucune n'est injouable — ce qu'un monde
 * entièrement aléatoire ne peut pas promettre.
 *
 * Les régions sont générées **à la demande** et mises en cache : une partie n'a besoin
 * que de la région où se tient le joueur, et une sauvegarde ne contient que la seed.
 */

import { rngFor, seedValue, type Rng } from '../core/rng.ts';
import type { Biome } from '../data/biomes.ts';
import { genererRegion, type Region, type RegionPlan, type RegionRole } from './region.ts';

/** Squelette du monde : rôle et fourchette de niveaux, dans l'ordre du parcours. */
const PARCOURS: ReadonlyArray<{
  readonly role: RegionRole;
  readonly niveaux: readonly [number, number];
  /** Biomes possibles ; la seed en choisit un. */
  readonly biomes: readonly Biome[];
}> = [
  { role: 'bourg', niveaux: [2, 3], biomes: ['prairie'] },
  { role: 'route', niveaux: [3, 6], biomes: ['prairie', 'lande'] },
  { role: 'bois', niveaux: [6, 10], biomes: ['foret'] },
  { role: 'route', niveaux: [9, 14], biomes: ['riviere', 'prairie', 'lande'] },
  { role: 'village', niveaux: [12, 16], biomes: ['prairie'] },
  { role: 'grotte', niveaux: [15, 20], biomes: ['grotte'] },
  { role: 'route', niveaux: [19, 25], biomes: ['montagne', 'lande'] },
  { role: 'arene', niveaux: [26, 30], biomes: ['ruines'] },
];

/** Qualificatifs de lieu. Le nom d'une région change avec la seed, comme son relief. */
const QUALIFICATIFS = {
  fr: ['des Brumes', 'du Levant', 'aux Ronces', 'des Sources', 'du Vieux Pont', 'des Cendres', 'aux Échos', 'du Couchant'],
  en: ['of Mists', 'of Dawn', 'of Brambles', 'of Springs', 'of the Old Bridge', 'of Ashes', 'of Echoes', 'of Dusk'],
} as const;

const NOMS_ROLE = {
  bourg: { fr: 'Bourg', en: 'Hamlet' },
  route: { fr: 'Route', en: 'Route' },
  bois: { fr: 'Bois', en: 'Woods' },
  village: { fr: 'Village', en: 'Village' },
  grotte: { fr: 'Grotte', en: 'Cavern' },
  arene: { fr: 'Arène', en: 'Arena' },
} as const satisfies Record<RegionRole, { fr: string; en: string }>;

function nommer(rng: Rng, role: RegionRole, numeroRoute: number): { fr: string; en: string } {
  if (role === 'route') return { fr: `Route ${numeroRoute}`, en: `Route ${numeroRoute}` };
  const index = rng.int(0, QUALIFICATIFS.fr.length - 1);
  return {
    fr: `${NOMS_ROLE[role].fr} ${QUALIFICATIFS.fr[index]}`,
    en: `${NOMS_ROLE[role].en} ${QUALIFICATIFS.en[index]}`,
  };
}

export interface World {
  /** La seed telle que le joueur la voit, du type « brume-3f7a ». */
  readonly seedText: string;
  readonly seed: number;
  readonly plans: readonly RegionPlan[];
  /** Génère la région demandée, ou la rend depuis le cache. */
  region(index: number): Region;
  /** Vide le cache — utile après un changement de partie. */
  oublier(): void;
}

/** Construit le plan du monde. Étape purement descriptive : aucune tuile n'est posée. */
export function planifierMonde(seedText: string): { seed: number; plans: RegionPlan[] } {
  const seed = seedValue(seedText);
  const rng = rngFor(seed, 'plan');

  let numeroRoute = 0;
  const plans = PARCOURS.map((etape, index) => {
    if (etape.role === 'route') numeroRoute++;
    return {
      index,
      role: etape.role,
      biome: rng.pick(etape.biomes),
      nom: nommer(rng, etape.role, numeroRoute),
      niveaux: { min: etape.niveaux[0], max: etape.niveaux[1] },
      precedente: index === 0 ? null : index - 1,
      suivante: index === PARCOURS.length - 1 ? null : index + 1,
    } satisfies RegionPlan;
  });

  return { seed, plans };
}

export function creerMonde(seedText: string): World {
  const { seed, plans } = planifierMonde(seedText);
  const cache = new Map<number, Region>();

  return {
    seedText,
    seed,
    plans,
    region(index) {
      const enCache = cache.get(index);
      if (enCache) return enCache;
      const plan = plans[index];
      if (!plan) throw new Error(`Région ${index} inconnue dans ce monde.`);
      const region = genererRegion(seed, plan);
      cache.set(index, region);
      return region;
    },
    oublier() {
      cache.clear();
    },
  };
}

/** L'index de la région où commence toute partie. */
export const REGION_DEPART = 0;

/** L'index de l'arène, où l'aventure se conclut. */
export const REGION_ARENE = PARCOURS.length - 1;

export const NOMBRE_REGIONS = PARCOURS.length;
