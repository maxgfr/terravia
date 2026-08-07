/**
 * Une créature en jeu : l'exemplaire, par opposition à l'espèce.
 *
 * L'espèce donne les statistiques de base, communes à tous les individus. L'exemplaire
 * y ajoute ce qui n'appartient qu'à lui : son niveau, ses **gènes** (tirés à la
 * naissance, jamais modifiables), ses **points de dressage** (gagnés au combat), son
 * talent et ses attaques. Deux Mulotin de niveau 20 ne sont donc pas interchangeables.
 */

import type { Rng } from '../core/rng.ts';
import { MOVES, type MoveId } from '../data/moves.ts';
import {
  GENE_MAX,
  STAT_KEYS,
  TRAINING_MAX_PER_STAT,
  TRAINING_MAX_TOTAL,
  experienceForLevel,
  levelForExperience,
  type StatBlock,
  type StatKey,
  type StatusId,
} from '../data/stats.ts';
import { SPECIES, movesAtLevel, type SpeciesId } from '../data/species.ts';
import type { TalentId } from '../data/talents.ts';

export interface MoveSlot {
  readonly id: MoveId;
  /** Utilisations restantes. */
  pp: number;
}

export interface CreatureInstance {
  /** Identifiant unique dans la partie : c'est lui qui suit la créature entre équipe et réserve. */
  readonly uid: string;
  readonly speciesId: SpeciesId;
  surnom: string | null;
  niveau: number;
  xp: number;
  readonly genes: StatBlock;
  dressage: StatBlock;
  talentId: TalentId;
  moves: MoveSlot[];
  pv: number;
  statut: StatusId | null;
  /** Tours de sommeil restants. Sans compteur, une créature endormie ne se réveille jamais. */
  sommeil: number;
  /** Seed du monde où elle a été rencontrée — sert à repérer les créatures échangées. */
  readonly origine: string;
}

const ZERO_STATS: StatBlock = { pv: 0, attaque: 0, defense: 0, attaqueSpe: 0, defenseSpe: 0, vitesse: 0 };

function statsVides(): StatBlock {
  return { ...ZERO_STATS };
}

/**
 * Statistique effective d'un exemplaire.
 *
 * Les points de dressage comptent pour un quart : c'est ce qui les rend significatifs
 * sans écraser le niveau et les gènes.
 */
export function statistique(instance: CreatureInstance, stat: StatKey): number {
  const base = SPECIES[instance.speciesId].base[stat];
  const brut = 2 * base + instance.genes[stat] + Math.floor(instance.dressage[stat] / 4);
  if (stat === 'pv') return Math.floor((brut * instance.niveau) / 100) + instance.niveau + 10;
  return Math.floor((brut * instance.niveau) / 100) + 5;
}

export function pvMax(instance: CreatureInstance): number {
  return statistique(instance, 'pv');
}

export function estKo(instance: CreatureInstance): boolean {
  return instance.pv <= 0;
}

export function nomAffiche(instance: CreatureInstance, langue: 'fr' | 'en'): string {
  return instance.surnom ?? SPECIES[instance.speciesId].nom[langue];
}

/** Crée un exemplaire sauvage ou offert, avec des gènes et un talent tirés au sort. */
export function creerCreature(
  rng: Rng,
  options: {
    readonly uid: string;
    readonly speciesId: SpeciesId;
    readonly niveau: number;
    readonly origine: string;
    readonly surnom?: string | null;
  },
): CreatureInstance {
  const species = SPECIES[options.speciesId];
  const genes = statsVides();
  for (const stat of STAT_KEYS) genes[stat] = rng.int(0, GENE_MAX);

  const instance: CreatureInstance = {
    uid: options.uid,
    speciesId: options.speciesId,
    surnom: options.surnom ?? null,
    niveau: options.niveau,
    xp: experienceForLevel(options.niveau, species.croissance),
    genes,
    dressage: statsVides(),
    talentId: rng.pick(species.talents) as TalentId,
    moves: movesAtLevel(species, options.niveau).map((id) => ({ id, pp: MOVES[id].pp })),
    pv: 0,
    statut: null,
    sommeil: 0,
    origine: options.origine,
  };

  instance.pv = pvMax(instance);
  return instance;
}

/** Rend tous les PV, restaure les PP et dissipe les altérations. */
export function soignerCompletement(instance: CreatureInstance): void {
  instance.pv = pvMax(instance);
  instance.statut = null;
  instance.sommeil = 0;
  for (const slot of instance.moves) slot.pp = MOVES[slot.id].pp;
}

export interface GainNiveau {
  readonly niveauAvant: number;
  readonly niveauApres: number;
  /** Attaques apprises en montant, dans l'ordre. */
  readonly nouvellesAttaques: MoveId[];
  /** Espèce en laquelle la créature peut désormais évoluer. */
  readonly evolution: SpeciesId | null;
}

/**
 * Ajoute de l'expérience et applique les montées de niveau.
 *
 * Les PV maximum augmentent avec le niveau ; on ajoute la différence aux PV courants
 * plutôt que de soigner, sinon monter de niveau soignerait gratuitement.
 */
export function gagnerExperience(instance: CreatureInstance, montant: number): GainNiveau {
  const species = SPECIES[instance.speciesId];
  const niveauAvant = instance.niveau;
  const pvMaxAvant = pvMax(instance);

  instance.xp += Math.max(0, Math.round(montant));
  const niveauApres = levelForExperience(instance.xp, species.croissance);
  instance.niveau = niveauApres;

  const nouvellesAttaques: MoveId[] = [];
  if (niveauApres > niveauAvant) {
    instance.pv += pvMax(instance) - pvMaxAvant;
    for (const entree of species.apprentissage) {
      if (entree.niveau > niveauAvant && entree.niveau <= niveauApres) {
        if (!instance.moves.some((slot) => slot.id === entree.move)) nouvellesAttaques.push(entree.move);
      }
    }
  }

  const evolution =
    species.evolution && niveauApres >= species.evolution.niveau ? species.evolution.vers : null;

  return { niveauAvant, niveauApres, nouvellesAttaques, evolution };
}

/** Apprend une attaque, en remplaçant celle indiquée si les quatre emplacements sont pris. */
export function apprendreAttaque(instance: CreatureInstance, move: MoveId, remplace: number | null): boolean {
  if (instance.moves.some((slot) => slot.id === move)) return false;
  const nouveau: MoveSlot = { id: move, pp: MOVES[move].pp };
  if (instance.moves.length < 4) {
    instance.moves.push(nouveau);
    return true;
  }
  if (remplace === null || remplace < 0 || remplace >= instance.moves.length) return false;
  instance.moves[remplace] = nouveau;
  return true;
}

/**
 * Fait évoluer la créature. Les gènes, le dressage et les attaques sont conservés :
 * l'évolution est une transformation, pas une nouvelle créature.
 */
export function evoluer(instance: CreatureInstance, vers: SpeciesId): CreatureInstance {
  const pvMaxAvant = pvMax(instance);
  const evolue: CreatureInstance = { ...instance, speciesId: vers };
  // Les PV suivent la nouvelle enveloppe : une créature à mi-vie le reste.
  const ratio = pvMaxAvant > 0 ? instance.pv / pvMaxAvant : 1;
  evolue.pv = Math.max(1, Math.round(pvMax(evolue) * ratio));
  return evolue;
}

/**
 * Répartit des points de dressage dans une statistique, dans la limite du plafond par
 * statistique et du plafond total. Renvoie le nombre de points réellement attribués.
 */
export function entrainer(instance: CreatureInstance, stat: StatKey, points: number): number {
  const total = STAT_KEYS.reduce((somme, cle) => somme + instance.dressage[cle], 0);
  const margeTotale = Math.max(0, TRAINING_MAX_TOTAL - total);
  const margeStat = Math.max(0, TRAINING_MAX_PER_STAT - instance.dressage[stat]);
  const attribues = Math.max(0, Math.min(points, margeStat, margeTotale));
  instance.dressage[stat] += attribues;
  return attribues;
}

/** Expérience gagnée en battant un adversaire. */
export function experienceGagnee(vaincu: CreatureInstance, contreDresseur: boolean): number {
  const base = SPECIES[vaincu.speciesId].gainXp;
  return Math.max(1, Math.floor((base * vaincu.niveau) / 7) * (contreDresseur ? 1.5 : 1));
}

/** Points de dressage accordés par une victoire, répartis sur la statistique dominante. */
export function dressageGagne(vaincu: CreatureInstance): { stat: StatKey; points: number } {
  const base = SPECIES[vaincu.speciesId].base;
  const dominante = STAT_KEYS.reduce((meilleure, stat) =>
    base[stat] > base[meilleure] ? stat : meilleure,
  );
  return { stat: dominante, points: 1 + Math.floor(vaincu.niveau / 12) };
}
