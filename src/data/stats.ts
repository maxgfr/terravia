/**
 * Statistiques de combat et altérations d'état.
 *
 * Six statistiques, comme le veut le genre : elles se répartissent en une paire
 * offensive/défensive physique, une paire spéciale, la vitesse qui décide de l'ordre du
 * tour, et les points de vie qui ne se modifient pas en combat.
 */

export const STAT_KEYS = ['pv', 'attaque', 'defense', 'attaqueSpe', 'defenseSpe', 'vitesse'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Statistiques modifiables en combat — les PV en sont exclus par construction. */
export const BATTLE_STATS = ['attaque', 'defense', 'attaqueSpe', 'defenseSpe', 'vitesse'] as const;
export type BattleStat = (typeof BATTLE_STATS)[number];

export type StatBlock = Record<StatKey, number>;

export const STAT_NAMES: Record<StatKey, { fr: string; en: string; court: string }> = {
  pv: { fr: 'Points de vie', en: 'Hit Points', court: 'PV' },
  attaque: { fr: 'Attaque', en: 'Attack', court: 'ATT' },
  defense: { fr: 'Défense', en: 'Defense', court: 'DÉF' },
  attaqueSpe: { fr: 'Attaque Spé.', en: 'Sp. Attack', court: 'ATS' },
  defenseSpe: { fr: 'Défense Spé.', en: 'Sp. Defense', court: 'DFS' },
  vitesse: { fr: 'Vitesse', en: 'Speed', court: 'VIT' },
};

/**
 * Multiplicateurs des étages de statistique, de −6 à +6.
 * Un étage positif ajoute une moitié, un étage négatif retire un tiers — l'asymétrie est
 * volontaire : baisser une statistique adverse est moins fort que hausser la sienne.
 */
export function stageMultiplier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  return clamped >= 0 ? (2 + clamped) / 2 : 2 / (2 - clamped);
}

/** Bornes des gènes : deux spécimens d'une même espèce ne sont jamais identiques. */
export const GENE_MAX = 31;
/** Points de dressage, par statistique et au total. */
export const TRAINING_MAX_PER_STAT = 252;
export const TRAINING_MAX_TOTAL = 510;

export const STATUSES = ['brulure', 'poison', 'paralysie', 'sommeil', 'gel'] as const;
export type StatusId = (typeof STATUSES)[number];

export const STATUS_NAMES: Record<StatusId, { fr: string; en: string; court: string }> = {
  brulure: { fr: 'Brûlure', en: 'Burn', court: 'BRÛ' },
  poison: { fr: 'Poison', en: 'Poison', court: 'PSN' },
  paralysie: { fr: 'Paralysie', en: 'Paralysis', court: 'PAR' },
  sommeil: { fr: 'Sommeil', en: 'Sleep', court: 'DOR' },
  gel: { fr: 'Gel', en: 'Freeze', court: 'GEL' },
};

/**
 * Courbes d'expérience. Le total pour atteindre le niveau 100 va d'environ 800 000 points
 * pour une créature rapide à 1 250 000 pour une créature lente.
 */
export const GROWTH_RATES = ['rapide', 'moyen', 'lent'] as const;
export type GrowthRate = (typeof GROWTH_RATES)[number];

/** Expérience totale nécessaire pour atteindre un niveau donné. */
export function experienceForLevel(level: number, rate: GrowthRate): number {
  const n = Math.max(1, Math.min(100, level));
  switch (rate) {
    case 'rapide':
      return Math.floor((4 * n ** 3) / 5);
    case 'lent':
      return Math.floor((5 * n ** 3) / 4);
    case 'moyen':
    default:
      return n ** 3;
  }
}

/** Niveau correspondant à une expérience totale. */
export function levelForExperience(experience: number, rate: GrowthRate): number {
  let level = 1;
  while (level < 100 && experienceForLevel(level + 1, rate) <= experience) level++;
  return level;
}
