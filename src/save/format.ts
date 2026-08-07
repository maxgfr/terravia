/**
 * Format de sauvegarde.
 *
 * Deux documents JSON existent : une **partie** (`terravia-save`) et une **créature
 * seule** (`terravia-creature`), échangeable entre parties. Les deux portent un numéro
 * de version et une somme de contrôle.
 *
 * La somme de contrôle détecte une corruption de fichier — une troncature, un copier-
 * coller incomplet. Elle **ne détecte pas la triche** : sans serveur, rien n'empêche de
 * recalculer un fichier modifié. C'est assumé et documenté plutôt que masqué derrière
 * un chiffrement décoratif.
 */

import { hashString } from '../core/rng.ts';
import type { ItemId } from '../data/items.ts';
import type { MoveId } from '../data/moves.ts';
import type { SpeciesId } from '../data/species.ts';
import type { StatBlock, StatusId } from '../data/stats.ts';
import type { TalentId } from '../data/talents.ts';
import type { Langue } from '../i18n/index.ts';
import type { Direction } from '../world/characterIds.ts';

export const FORMAT_PARTIE = 'terravia-save';
export const FORMAT_CREATURE = 'terravia-creature';

/**
 * Version du format. À incrémenter dès qu'un champ change de sens, en ajoutant la
 * migration correspondante — c'est ce qui évite de casser les parties existantes.
 */
export const VERSION_ACTUELLE = 1;

export interface CreatureEnregistree {
  readonly uid: string;
  readonly speciesId: SpeciesId;
  readonly surnom: string | null;
  readonly niveau: number;
  readonly xp: number;
  readonly genes: StatBlock;
  readonly dressage: StatBlock;
  readonly talentId: TalentId;
  readonly moves: ReadonlyArray<{ readonly id: MoveId; readonly pp: number }>;
  readonly pv: number;
  readonly statut: StatusId | null;
  readonly sommeil: number;
  readonly origine: string;
}

export interface SaveFile {
  readonly format: typeof FORMAT_PARTIE;
  readonly version: number;
  /** Le monde entier se reconstruit à partir de là. */
  readonly seed: string;
  readonly langue: Langue;
  readonly creeLe: string;
  readonly majLe: string;
  readonly joueur: {
    readonly nom: string;
    readonly regionIndex: number;
    readonly x: number;
    readonly y: number;
    readonly direction: Direction;
    readonly pieces: number;
    readonly tempsJeuMs: number;
    readonly refuge: { readonly regionIndex: number; readonly x: number; readonly y: number };
  };
  readonly equipe: readonly CreatureEnregistree[];
  readonly reserve: readonly CreatureEnregistree[];
  readonly inventaire: Readonly<Partial<Record<ItemId, number>>>;
  readonly progression: {
    readonly drapeaux: readonly string[];
    readonly dresseursVaincus: readonly string[];
    readonly objetsRamasses: readonly string[];
    readonly badges: readonly string[];
    readonly terradexVus: readonly SpeciesId[];
    readonly terradexCaptures: readonly SpeciesId[];
  };
  readonly horloge: { readonly minutes: number };
  readonly prochainUid: number;
  readonly checksum: string;
}

export interface CreatureFile {
  readonly format: typeof FORMAT_CREATURE;
  readonly version: number;
  readonly exporteLe: string;
  readonly creature: CreatureEnregistree;
  readonly checksum: string;
}

/**
 * Sérialisation stable : les clés sont triées à tous les niveaux.
 *
 * Sans cet ordre, la somme de contrôle dépendrait de l'ordre d'insertion des propriétés,
 * qui varie d'un moteur à l'autre — un fichier valide serait rejeté ailleurs.
 */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur) ?? 'null';
  if (Array.isArray(valeur)) return `[${valeur.map(jsonCanonique).join(',')}]`;
  const entrees = Object.entries(valeur as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entrees.map(([cle, v]) => `${JSON.stringify(cle)}:${jsonCanonique(v)}`).join(',')}}`;
}

/** Somme de contrôle FNV-1a du document, champ `checksum` exclu. */
export function calculerChecksum(document: Record<string, unknown>): string {
  const { checksum: _ignore, ...reste } = document;
  return hashString(jsonCanonique(reste)).toString(16).padStart(8, '0');
}

export function signer<T extends Record<string, unknown>>(document: T): T & { checksum: string } {
  return { ...document, checksum: calculerChecksum(document) };
}

export function checksumValide(document: Record<string, unknown>): boolean {
  return typeof document.checksum === 'string' && document.checksum === calculerChecksum(document);
}
