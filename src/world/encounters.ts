/**
 * Tables de rencontre.
 *
 * Elles ne sont pas écrites à la main : elles se déduisent de ce que chaque espèce
 * déclare — ses biomes et son créneau horaire. Ajouter une espèce la fait apparaître
 * dans le monde sans toucher à un seul tableau, et une espèce nocturne reste invisible
 * en plein jour sans qu'on ait à y penser.
 */

import type { Rng } from '../core/rng.ts';
import type { Biome } from '../data/biomes.ts';
import { SPECIES, SPECIES_IDS, baseStatTotal, type SpeciesId } from '../data/species.ts';

/** Phase du cycle jour/nuit. Elle décide de la teinte et des rencontres. */
export const DAY_PHASES = ['aube', 'jour', 'crepuscule', 'nuit'] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

/** Les créatures uniques ne se croisent pas au hasard : elles ont leur mise en scène. */
const SEUIL_UNIQUE = 5;

/** Vrai si l'espèce peut se montrer à cette phase de la journée. */
function visibleA(species: SpeciesId, phase: DayPhase): boolean {
  const creneau = SPECIES[species].creneau;
  if (creneau === 'toujours') return true;
  // L'aube et le crépuscule sont des heures de transition : les deux mondes s'y croisent.
  if (phase === 'aube' || phase === 'crepuscule') return true;
  return creneau === phase;
}

/** Les espèces susceptibles d'apparaître dans un biome à une phase donnée. */
export function tableRencontre(biome: Biome, phase: DayPhase): SpeciesId[] {
  return SPECIES_IDS.filter(
    (id) =>
      SPECIES[id].tauxCapture > SEUIL_UNIQUE &&
      SPECIES[id].habitats.includes(biome) &&
      visibleA(id, phase),
  );
}

/**
 * Poids d'une espèce dans le tirage : une créature puissante se croise moins souvent.
 * Sans cette pondération, les évolutions finales seraient aussi communes que les
 * premiers stades, et le monde perdrait toute progression.
 */
function poids(species: SpeciesId): number {
  const total = baseStatTotal(SPECIES[species]);
  if (total >= 500) return 1;
  if (total >= 420) return 3;
  if (total >= 330) return 8;
  return 16;
}

export interface Rencontre {
  readonly species: SpeciesId;
  readonly niveau: number;
}

/**
 * Tire une rencontre. Renvoie `null` si aucune espèce ne vit ici à cette heure — ce qui
 * est un état de jeu valide : certaines zones sont désertes la nuit.
 */
export function tirerRencontre(
  rng: Rng,
  biome: Biome,
  phase: DayPhase,
  niveaux: { readonly min: number; readonly max: number },
): Rencontre | null {
  const table = tableRencontre(biome, phase);
  if (table.length === 0) return null;

  const species = rng.weighted(table, poids);
  let niveau = rng.int(niveaux.min, niveaux.max);

  // Une créature ne peut pas apparaître à l'état sauvage sous le niveau où son espèce
  // apprend sa première attaque, ni au-dessus du niveau où elle aurait évolué.
  const evolution = SPECIES[species].evolution;
  if (evolution && niveau >= evolution.niveau) niveau = evolution.niveau - 1;
  return { species, niveau: Math.max(2, niveau) };
}

/** Probabilité de déclencher une rencontre à chaque pas dans les hautes herbes. */
export const TAUX_RENCONTRE = 0.11;
