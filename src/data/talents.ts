/**
 * Talents : la capacité passive que porte chaque créature.
 *
 * Un talent n'est jamais du code non plus — c'est un `effet` que le moteur consulte aux
 * moments prévus (entrée en combat, calcul des dégâts, fin de tour, contact). Deux
 * spécimens de la même espèce peuvent porter des talents différents : c'est le second
 * levier de variété, après les gènes.
 */

import type { ElementType } from './types.ts';
import type { StatusId } from './stats.ts';

export type TalentEffect =
  /** Renforce un type d'attaque quand les PV tombent sous un seuil. */
  | { readonly kind: 'sursaut'; readonly type: ElementType; readonly facteur: number; readonly seuil: number }
  /** Renforce un type d'attaque en permanence. */
  | { readonly kind: 'affinite'; readonly type: ElementType; readonly facteur: number }
  /** Immunise contre une altération d'état. */
  | { readonly kind: 'immuniteStatut'; readonly statut: StatusId }
  /** Annule les dégâts d'un type, et rend éventuellement des PV. */
  | { readonly kind: 'absorption'; readonly type: ElementType; readonly soin: number }
  /** Réduit les dégâts reçus de certains types. */
  | { readonly kind: 'resistance'; readonly types: readonly ElementType[]; readonly facteur: number }
  /** Réduit les dégâts des attaques spéciales. */
  | { readonly kind: 'voile'; readonly facteur: number }
  /** Peut infliger une altération à qui touche la créature au corps à corps. */
  | { readonly kind: 'riposte'; readonly statut: StatusId; readonly chance: number }
  /** Baisse l'Attaque adverse en entrant en combat. */
  | { readonly kind: 'intimidation' }
  /** Récupère une fraction des PV maximum à chaque fin de tour. */
  | { readonly kind: 'regeneration'; readonly fraction: number }
  /** Protège des coups critiques. */
  | { readonly kind: 'blindage' }
  /** Double les chances de coup critique. */
  | { readonly kind: 'precision' }
  /** Le poison infligé fait le double de dégâts. */
  | { readonly kind: 'venimeux' };

export interface Talent {
  readonly id: TalentId;
  readonly nom: { readonly fr: string; readonly en: string };
  readonly description: { readonly fr: string; readonly en: string };
  readonly effet: TalentEffect;
}

const DEFINITIONS = {
  braise: {
    nom: { fr: 'Braise', en: 'Ember Heart' },
    description: {
      fr: 'Sous un tiers de PV, les attaques Flamme gagnent la moitié de leur puissance.',
      en: 'Below a third of HP, Flame moves gain half again their power.',
    },
    effet: { kind: 'sursaut', type: 'flamme', facteur: 1.5, seuil: 1 / 3 },
  },
  ressac: {
    nom: { fr: 'Ressac', en: 'Undertow' },
    description: {
      fr: 'Sous un tiers de PV, les attaques Onde gagnent la moitié de leur puissance.',
      en: 'Below a third of HP, Wave moves gain half again their power.',
    },
    effet: { kind: 'sursaut', type: 'onde', facteur: 1.5, seuil: 1 / 3 },
  },
  seve: {
    nom: { fr: 'Sève', en: 'Sap Surge' },
    description: {
      fr: 'Sous un tiers de PV, les attaques Sylve gagnent la moitié de leur puissance.',
      en: 'Below a third of HP, Verdant moves gain half again their power.',
    },
    effet: { kind: 'sursaut', type: 'sylve', facteur: 1.5, seuil: 1 / 3 },
  },
  trancheFine: {
    nom: { fr: 'Tranche Fine', en: 'Keen Edge' },
    description: { fr: 'Les attaques Métal frappent un cinquième plus fort.', en: 'Metal moves hit a fifth harder.' },
    effet: { kind: 'affinite', type: 'metal', facteur: 1.2 },
  },
  vivacite: {
    nom: { fr: 'Vivacité', en: 'Quickstep' },
    description: { fr: 'Ne peut pas être paralysé.', en: 'Cannot be paralyzed.' },
    effet: { kind: 'immuniteStatut', statut: 'paralysie' },
  },
  sangFroid: {
    nom: { fr: 'Sang-Froid', en: 'Cold Blood' },
    description: { fr: 'Ne peut pas être brûlé.', en: 'Cannot be burned.' },
    effet: { kind: 'immuniteStatut', statut: 'brulure' },
  },
  paratonnerre: {
    nom: { fr: 'Paratonnerre', en: 'Lightning Rod' },
    description: {
      fr: 'Absorbe les attaques Foudre et récupère un quart des PV maximum.',
      en: 'Absorbs Bolt moves and restores a quarter of max HP.',
    },
    effet: { kind: 'absorption', type: 'foudre', soin: 0.25 },
  },
  fourrureEpaisse: {
    nom: { fr: 'Fourrure Épaisse', en: 'Thick Pelt' },
    description: {
      fr: 'Divise par deux les dégâts Flamme et Givre.',
      en: 'Halves damage from Flame and Frost.',
    },
    effet: { kind: 'resistance', types: ['flamme', 'givre'], facteur: 0.5 },
  },
  voileLumineux: {
    nom: { fr: 'Voile Lumineux', en: 'Light Veil' },
    description: { fr: 'Réduit d’un tiers les dégâts des attaques spéciales.', en: 'Cuts special damage by a third.' },
    effet: { kind: 'voile', facteur: 0.67 },
  },
  statique: {
    nom: { fr: 'Statique', en: 'Static' },
    description: {
      fr: 'Peut paralyser l’assaillant qui frappe au corps à corps.',
      en: 'May paralyze attackers that make contact.',
    },
    effet: { kind: 'riposte', statut: 'paralysie', chance: 30 },
  },
  epinesToxiques: {
    nom: { fr: 'Épines Toxiques', en: 'Toxic Spines' },
    description: {
      fr: 'Peut empoisonner l’assaillant qui frappe au corps à corps.',
      en: 'May poison attackers that make contact.',
    },
    effet: { kind: 'riposte', statut: 'poison', chance: 30 },
  },
  intimidation: {
    nom: { fr: 'Intimidation', en: 'Intimidate' },
    description: { fr: 'Baisse l’Attaque adverse en entrant en combat.', en: 'Lowers the foe’s Attack on entry.' },
    effet: { kind: 'intimidation' },
  },
  regeneration: {
    nom: { fr: 'Régénération', en: 'Regrowth' },
    description: { fr: 'Récupère un seizième des PV maximum à chaque tour.', en: 'Restores a sixteenth of max HP each turn.' },
    effet: { kind: 'regeneration', fraction: 1 / 16 },
  },
  blindage: {
    nom: { fr: 'Blindage', en: 'Bulwark' },
    description: { fr: 'Ne subit jamais de coup critique.', en: 'Never takes a critical hit.' },
    effet: { kind: 'blindage' },
  },
  oeilAiguise: {
    nom: { fr: 'Œil Aiguisé', en: 'Sharp Eye' },
    description: { fr: 'Double les chances de coup critique.', en: 'Doubles the critical hit rate.' },
    effet: { kind: 'precision' },
  },
  venimeux: {
    nom: { fr: 'Venimeux', en: 'Virulent' },
    description: { fr: 'Le poison qu’il inflige fait le double de dégâts.', en: 'Poison it inflicts deals double damage.' },
    effet: { kind: 'venimeux' },
  },
} as const satisfies Record<string, Omit<Talent, 'id'>>;

export type TalentId = keyof typeof DEFINITIONS;

export const TALENT_IDS = Object.keys(DEFINITIONS) as TalentId[];

export const TALENTS: Record<TalentId, Talent> = Object.fromEntries(
  TALENT_IDS.map((id) => [id, { id, ...DEFINITIONS[id] }]),
) as Record<TalentId, Talent>;

export function getTalent(id: TalentId): Talent {
  return TALENTS[id];
}
