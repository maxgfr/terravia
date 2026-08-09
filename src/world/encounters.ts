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

/**
 * Puissance maximale admise dans une région, d'après le niveau qu'on y croise.
 *
 * Sans ce plafond, une évolution finale pouvait surgir dans la toute première région :
 * bridée au niveau 4, certes, mais avec ses statistiques de bout de lignée. Un starter
 * y perdait un combat sur deux sans avoir rien fait de mal. Le monde montre désormais
 * des créatures à la mesure de l'endroit où l'on se trouve.
 */
function plafondPuissance(niveauMax: number): number {
  return 270 + niveauMax * 9;
}

export interface OptionsTable {
  /** Plafonne la puissance des espèces proposées. Absent, la table n'est pas bridée. */
  readonly niveauMax?: number;
  /**
   * Ajoute les créatures uniques à la table. Réservé au sanctuaire.
   *
   * Elles s'ajoutent à la faune ordinaire du biome, elles ne la remplacent pas : en
   * l'excluant, le sanctuaire rendait introuvables les espèces qui n'habitent que les
   * ruines — Acierac et Noctombre ne pouvaient être attrapés dans aucune partie, puisque
   * les ruines ne sont le biome que des arènes, qui ne sèment aucune herbe.
   */
  readonly uniques?: boolean;
  /**
   * Espèces ajoutées à la table quoi qu'en disent leurs biomes.
   *
   * Le sanctuaire s'en sert pour accueillir ce que le monde tiré n'offrait nulle part :
   * c'est ce qui rend le Terradex complétable dans *chaque* partie, et non dans celles
   * que la seed a bien voulu servir.
   */
  readonly complement?: readonly SpeciesId[];
}

/** Les espèces susceptibles d'apparaître dans un biome à une phase donnée. */
export function tableRencontre(biome: Biome, phase: DayPhase, options: OptionsTable = {}): SpeciesId[] {
  const habitantes = SPECIES_IDS.filter(
    (id) =>
      SPECIES[id].habitats.includes(biome) &&
      visibleA(id, phase) &&
      (options.uniques || SPECIES[id].tauxCapture > SEUIL_UNIQUE),
  );

  if (options.complement?.length) {
    for (const id of options.complement) {
      if (!habitantes.includes(id) && visibleA(id, phase)) habitantes.push(id);
    }
  }

  if (options.niveauMax === undefined || options.uniques) return habitantes;

  const plafond = plafondPuissance(options.niveauMax);
  const admises = habitantes.filter((id) => baseStatTotal(SPECIES[id]) <= plafond);
  // Un biome dont toutes les espèces dépassent le plafond ne doit pas devenir désert :
  // on garde alors la plus modeste, faute de mieux.
  if (admises.length > 0) return admises;
  return habitantes
    .slice()
    .sort((a, b) => baseStatTotal(SPECIES[a]) - baseStatTotal(SPECIES[b]))
    .slice(0, 1);
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
  options: OptionsTable = {},
): Rencontre | null {
  const table = tableRencontre(biome, phase, { niveauMax: niveaux.max, ...options });
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

/**
 * Ce qu'une région apporte au recensement.
 *
 * La forme est décrite ici plutôt qu'importée de `region.ts` pour que le recensement ne
 * fasse pas dépendre les tables de rencontre de la génération de terrain. C'est l'appelant
 * qui renseigne les deux drapeaux, puisque lui seul sait ce que chaque rôle sème.
 */
export interface RegionRecensee {
  readonly biome: Biome;
  readonly niveaux: { readonly max: number };
  /** La région sème des zones de rencontre : la faune de son biome s'y attrape. */
  readonly fauneOrdinaire: boolean;
  /** La région comporte de l'eau : la faune de rivière s'y pêche, canne en main. */
  readonly peche: boolean;
}

/**
 * Les espèces qu'un monde donné laisse effectivement attraper, évolutions comprises.
 *
 * Ne comptent que les moyens qui rendent une créature *possédable* : les zones de
 * rencontre des régions traversées, la pêche partout où il y a de l'eau, puis la clôture
 * par évolution. Une créature aperçue dans l'équipe d'un dresseur ne compte pas — le
 * moteur refuse de la capturer — et les trois créatures de départ non plus, puisqu'on
 * n'en garde qu'une.
 */
export function especesAccessibles(regions: readonly RegionRecensee[]): Set<SpeciesId> {
  const accessibles = new Set<SpeciesId>();
  for (const region of regions) {
    for (const phase of DAY_PHASES) {
      if (region.fauneOrdinaire) {
        for (const id of tableRencontre(region.biome, phase, { niveauMax: region.niveaux.max })) {
          accessibles.add(id);
        }
      }
      // La canne ouvre la faune de rivière sur toute étendue d'eau, quel que soit le biome.
      if (region.peche) {
        for (const id of tableRencontre('riviere', phase, { niveauMax: region.niveaux.max })) {
          accessibles.add(id);
        }
      }
    }
  }

  // Clôture par évolution : ce qu'on attrape mène à ce en quoi cela se transforme.
  for (let ajout = true; ajout; ) {
    ajout = false;
    for (const id of [...accessibles]) {
      const evolution = SPECIES[id].evolution;
      if (evolution && !accessibles.has(evolution.vers)) {
        accessibles.add(evolution.vers);
        ajout = true;
      }
    }
  }
  return accessibles;
}

/**
 * Les espèces ordinaires qu'aucune région du monde ne procure.
 *
 * Le monde tire ses biomes librement : près d'un monde sur deux ne comporte aucune
 * grotte, et plus d'un sur trois aucune rivière. Sans compensation, le Terradex n'était
 * complétable que dans une partie sur quatre. Le sanctuaire — déjà le lieu des créatures
 * qu'on ne voit nulle part ailleurs — accueille donc ce qui manque.
 *
 * Les uniques sont exclues : elles y vivent déjà.
 */
export function especesManquantes(regions: readonly RegionRecensee[]): SpeciesId[] {
  const accessibles = especesAccessibles(regions);
  return SPECIES_IDS.filter(
    (id) => !accessibles.has(id) && SPECIES[id].tauxCapture > SEUIL_UNIQUE,
  );
}
