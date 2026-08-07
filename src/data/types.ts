/**
 * Les 12 types élémentaires et leur table d'efficacité.
 *
 * La table est écrite « attaquant → défenseurs qui ne prennent pas ×1 ». Tout ce qui
 * n'est pas listé vaut ×1. Écrire une matrice 12×12 complète à la main invite les fautes
 * de frappe silencieuses ; ici, seule une relation intentionnelle apparaît.
 *
 * Invariant vérifié en test : chaque type possède au moins une faiblesse et au moins une
 * résistance. Un type que rien ne contre déséquilibre tout le jeu.
 */

export const ELEMENT_TYPES = [
  'neutre',
  'flamme',
  'onde',
  'sylve',
  'foudre',
  'givre',
  'roche',
  'metal',
  'vent',
  'ombre',
  'lumiere',
  'toxine',
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export const TYPE_NAMES: Record<ElementType, { fr: string; en: string }> = {
  neutre: { fr: 'Neutre', en: 'Normal' },
  flamme: { fr: 'Flamme', en: 'Flame' },
  onde: { fr: 'Onde', en: 'Wave' },
  sylve: { fr: 'Sylve', en: 'Verdant' },
  foudre: { fr: 'Foudre', en: 'Bolt' },
  givre: { fr: 'Givre', en: 'Frost' },
  roche: { fr: 'Roche', en: 'Stone' },
  metal: { fr: 'Métal', en: 'Metal' },
  vent: { fr: 'Vent', en: 'Gale' },
  ombre: { fr: 'Ombre', en: 'Shade' },
  lumiere: { fr: 'Lumière', en: 'Light' },
  toxine: { fr: 'Toxine', en: 'Venom' },
};

type Efficacy = Partial<Record<ElementType, 0 | 0.5 | 2>>;

/**
 * Quatre immunités structurent la table :
 *   neutre ↔ ombre  — l'ordinaire ne touche pas l'immatériel, et réciproquement
 *   foudre → roche  — la pierre met la foudre à la terre
 *   toxine → métal  — on n'empoisonne pas ce qui n'est pas vivant
 */
const CHART: Record<ElementType, Efficacy> = {
  neutre: { roche: 0.5, metal: 0.5, ombre: 0 },
  flamme: { sylve: 2, givre: 2, metal: 2, toxine: 2, flamme: 0.5, onde: 0.5, roche: 0.5 },
  onde: { flamme: 2, roche: 2, onde: 0.5, sylve: 0.5, foudre: 0.5 },
  sylve: {
    onde: 2,
    roche: 2,
    sylve: 0.5,
    flamme: 0.5,
    givre: 0.5,
    toxine: 0.5,
    vent: 0.5,
    metal: 0.5,
  },
  foudre: { onde: 2, vent: 2, metal: 2, foudre: 0.5, sylve: 0.5, roche: 0 },
  givre: { sylve: 2, vent: 2, roche: 2, givre: 0.5, flamme: 0.5, onde: 0.5, metal: 0.5 },
  // Roche et métal se départagent dans un seul sens : un éboulement écrase une armure,
  // une lame n'entame pas un rocher. Le métal ne résiste donc plus à la roche, et n'est
  // plus efficace contre elle.
  roche: { flamme: 2, givre: 2, vent: 2, foudre: 2, roche: 0.5, onde: 0.5, sylve: 0.5 },
  // Le métal protège, il ne tranche pas. Il cumulait la meilleure défense du jeu — neuf
  // résistances sur douze — avec une offense de premier rang, sans aucun contre-jeu : une
  // arène de ce type se perdait quelle que soit l'équipe alignée. Il perd donc ses coups
  // les plus larges et garde ce qui cède vraiment sous une lame : la glace et l'ordinaire.
  metal: { givre: 2, neutre: 2, metal: 0.5, flamme: 0.5, foudre: 0.5, onde: 0.5 },
  vent: { sylve: 2, toxine: 2, ombre: 2, vent: 0.5, foudre: 0.5, roche: 0.5, metal: 0.5 },
  ombre: { lumiere: 2, toxine: 2, ombre: 0.5, metal: 0.5, neutre: 0 },
  lumiere: { ombre: 2, toxine: 2, lumiere: 0.5, metal: 0.5, sylve: 0.5 },
  toxine: { sylve: 2, lumiere: 2, onde: 2, toxine: 0.5, roche: 0.5, metal: 0 },
};

/** Multiplicateur d'un type d'attaque contre un type de défense. */
export function typeEffectiveness(attacker: ElementType, defender: ElementType): number {
  return CHART[attacker][defender] ?? 1;
}

/**
 * Multiplicateur contre une créature, qui peut porter deux types.
 * Les multiplicateurs se composent : ×2 sur les deux types donne ×4.
 */
export function effectivenessAgainst(
  attacker: ElementType,
  defenderTypes: readonly ElementType[],
): number {
  let multiplier = 1;
  for (const defender of defenderTypes) multiplier *= typeEffectiveness(attacker, defender);
  return multiplier;
}

/** Classe le multiplicateur pour choisir le message affiché en combat. */
export type EffectivenessTier = 'immune' | 'veryWeak' | 'weak' | 'neutral' | 'strong' | 'veryStrong';

export function effectivenessTier(multiplier: number): EffectivenessTier {
  if (multiplier === 0) return 'immune';
  if (multiplier <= 0.25) return 'veryWeak';
  if (multiplier < 1) return 'weak';
  if (multiplier === 1) return 'neutral';
  if (multiplier < 4) return 'strong';
  return 'veryStrong';
}

/** Les types contre lesquels ce type frappe fort — utilisé par l'IA et le Terradex. */
export function strongAgainst(attacker: ElementType): ElementType[] {
  return ELEMENT_TYPES.filter((defender) => typeEffectiveness(attacker, defender) > 1);
}

/** Les types dont ce type encaisse mal les coups — utilisé par le Terradex. */
export function weakTo(defender: ElementType): ElementType[] {
  return ELEMENT_TYPES.filter((attacker) => typeEffectiveness(attacker, defender) > 1);
}

/** Les types dont ce type encaisse bien les coups. */
export function resists(defender: ElementType): ElementType[] {
  return ELEMENT_TYPES.filter((attacker) => typeEffectiveness(attacker, defender) < 1);
}
