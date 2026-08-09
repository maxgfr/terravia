/**
 * Calcul des dégâts.
 *
 * La formule suit le canon du genre, avec les modificateurs appliqués dans un ordre
 * fixé : type, coup critique, aléa, talents. L'ordre compte — appliquer l'aléa avant
 * l'efficacité de type produirait des écarts différents, et les tests de référence ne
 * passeraient plus.
 *
 * Toute la fonction est pure : mêmes entrées, mêmes sorties. C'est ce qui permet de
 * vérifier un coup critique ×4 sans lancer de combat.
 */

import type { Rng } from '../core/rng.ts';
import type { Move } from '../data/moves.ts';
import { stageMultiplier, type BattleStat } from '../data/stats.ts';
import { SPECIES } from '../data/species.ts';
import { TALENTS, type TalentId } from '../data/talents.ts';
import { effectivenessAgainst, effectivenessTier, type EffectivenessTier } from '../data/types.ts';
import { statistique, type CreatureInstance } from '../game/creature.ts';

/** Un coup critique sur seize, doublé par le talent Œil Aiguisé. */
export const TAUX_CRITIQUE = 1 / 16;
/** Une attaque à taux de critique élevé triple ses chances. */
const FACTEUR_CRITIQUE_ELEVE = 3;
/** Multiplicateur d'un coup critique. */
const DEGATS_CRITIQUE = 1.5;
/** La brûlure divise l'Attaque physique par deux. */
const MALUS_BRULURE = 0.5;

export interface Combattant {
  readonly instance: CreatureInstance;
  /** Étages de statistique, de −6 à +6. */
  readonly etages: Record<BattleStat, number>;
  /**
   * Vrai quand le poison qui ronge cette créature a été posé par un talent Venimeux.
   *
   * L'information appartient au poison, pas à l'adversaire présent : sans elle, faire
   * entrer une créature Venimeux doublait rétroactivement un poison qu'elle n'avait pas
   * infligé. Le combat sauvegardé ne la transporte pas — au pire, une reprise ramène le
   * poison à son intensité ordinaire.
   */
  poisonVirulent: boolean;
}

export function creerCombattant(instance: CreatureInstance): Combattant {
  return {
    instance,
    etages: { attaque: 0, defense: 0, attaqueSpe: 0, defenseSpe: 0, vitesse: 0 },
    poisonVirulent: false,
  };
}

/** Statistique effective en combat : base de l'exemplaire, modifiée par les étages. */
export function statEnCombat(combattant: Combattant, stat: BattleStat): number {
  const brute = statistique(combattant.instance, stat);
  let valeur = brute * stageMultiplier(combattant.etages[stat]);
  // La paralysie réduit la vitesse de moitié : c'est ce qui rend l'altération décisive.
  if (stat === 'vitesse' && combattant.instance.statut === 'paralysie') valeur *= 0.5;
  return Math.max(1, Math.floor(valeur));
}

export interface ResultatDegats {
  readonly degats: number;
  readonly efficacite: number;
  readonly palier: EffectivenessTier;
  readonly critique: boolean;
}

function talentDe(combattant: Combattant): (typeof TALENTS)[TalentId] {
  return TALENTS[combattant.instance.talentId];
}

/** Multiplicateur apporté par le talent de l'attaquant sur cette attaque. */
function bonusOffensif(attaquant: Combattant, move: Move): number {
  const effet = talentDe(attaquant).effet;
  if (effet.kind === 'affinite' && effet.type === move.type) return effet.facteur;
  if (effet.kind === 'sursaut' && effet.type === move.type) {
    const ratio = attaquant.instance.pv / statistique(attaquant.instance, 'pv');
    return ratio <= effet.seuil ? effet.facteur : 1;
  }
  return 1;
}

/** Multiplicateur apporté par le talent du défenseur. */
function reductionDefensive(defenseur: Combattant, move: Move): number {
  const effet = talentDe(defenseur).effet;
  if (effet.kind === 'resistance' && effet.types.includes(move.type)) return effet.facteur;
  if (effet.kind === 'voile' && move.categorie === 'special') return effet.facteur;
  return 1;
}

/** Vrai si le défenseur ne peut pas subir de coup critique. */
export function immuniseAuxCritiques(defenseur: Combattant): boolean {
  return talentDe(defenseur).effet.kind === 'blindage';
}

export function tauxCritique(attaquant: Combattant, move: Move): number {
  let taux = TAUX_CRITIQUE;
  if (move.effet?.kind === 'critique') taux *= FACTEUR_CRITIQUE_ELEVE;
  if (talentDe(attaquant).effet.kind === 'precision') taux *= 2;
  return Math.min(0.5, taux);
}

export interface OptionsDegats {
  /** Force le coup critique, ou l'interdit. Utilisé par les tests et les scripts. */
  readonly critique?: boolean;
  /** Remplace le facteur aléatoire (0,85 à 1,00). */
  readonly alea?: number;
}

/**
 * Dégâts d'une attaque offensive.
 *
 *   base = ((2 · niveau / 5 + 2) · puissance · Att / Déf) / 50 + 2
 *   dégâts = base × STAB × type × critique × aléa × talents × brûlure
 */
export function calculerDegats(
  attaquant: Combattant,
  defenseur: Combattant,
  move: Move,
  rng: Rng,
  options: OptionsDegats = {},
): ResultatDegats {
  const typesDefenseur = SPECIES[defenseur.instance.speciesId].types;
  const efficacite = effectivenessAgainst(move.type, typesDefenseur);
  const palier = effectivenessTier(efficacite);

  if (efficacite === 0) {
    return { degats: 0, efficacite: 0, palier, critique: false };
  }

  const physique = move.categorie === 'physique';
  const statAttaque: BattleStat = physique ? 'attaque' : 'attaqueSpe';
  const statDefense: BattleStat = physique ? 'defense' : 'defenseSpe';

  const critique =
    options.critique ??
    (!immuniseAuxCritiques(defenseur) && rng.chance(tauxCritique(attaquant, move)));

  // Un coup critique ignore les hausses de défense de la cible et les baisses
  // d'attaque du lanceur : c'est ce qui en fait un retournement, pas un simple bonus.
  const attaque = critique
    ? Math.max(statistique(attaquant.instance, statAttaque), statEnCombat(attaquant, statAttaque))
    : statEnCombat(attaquant, statAttaque);
  const defense = critique
    ? Math.min(statistique(defenseur.instance, statDefense), statEnCombat(defenseur, statDefense))
    : statEnCombat(defenseur, statDefense);

  const niveau = attaquant.instance.niveau;
  let degats = (((2 * niveau) / 5 + 2) * move.puissance * (attaque / defense)) / 50 + 2;

  // Bonus de type identique : une attaque du type de son lanceur frappe plus fort.
  const typesAttaquant = SPECIES[attaquant.instance.speciesId].types;
  if (typesAttaquant.includes(move.type)) degats *= 1.5;

  degats *= efficacite;
  if (critique) degats *= DEGATS_CRITIQUE;
  degats *= options.alea ?? rng.float(0.85, 1);
  degats *= bonusOffensif(attaquant, move);
  degats *= reductionDefensive(defenseur, move);
  if (physique && attaquant.instance.statut === 'brulure') degats *= MALUS_BRULURE;

  return { degats: Math.max(1, Math.floor(degats)), efficacite, palier, critique };
}

/**
 * Vrai si l'attaque touche. Une précision de 0 signifie « ne peut pas rater » — trois
 * attaques l'utilisent, et c'est leur intérêt principal.
 */
export function toucheLaCible(move: Move, rng: Rng): boolean {
  if (move.precision === 0) return true;
  return rng.next() * 100 < move.precision;
}
