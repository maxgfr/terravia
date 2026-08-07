/**
 * Capture.
 *
 * La formule tient compte des points de vie restants, de l'altération d'état, du taux
 * propre à l'espèce et du prisme employé. Elle renvoie le **nombre de secousses** plutôt
 * qu'un simple succès : l'interface peut ainsi animer le suspense sans recalculer la
 * règle, et deux secousses sur trois se lisent comme un échec de peu.
 */

import type { Rng } from '../core/rng.ts';
import { ITEMS, type ItemId } from '../data/items.ts';
import type { StatusId } from '../data/stats.ts';
import { SPECIES } from '../data/species.ts';
import { pvMax, type CreatureInstance } from '../game/creature.ts';

/** Une créature endormie ou gelée est nettement plus facile à saisir. */
const BONUS_STATUT: Record<StatusId, number> = {
  sommeil: 2.5,
  gel: 2.5,
  paralysie: 1.5,
  brulure: 1.5,
  poison: 1.5,
};

export const SECOUSSES_MAX = 4;

export interface ResultatCapture {
  readonly reussi: boolean;
  /** De 0 à 4. Quatre secousses signifient que le prisme s'est refermé. */
  readonly secousses: number;
}

export function tenterCapture(
  cible: CreatureInstance,
  prisme: ItemId,
  rng: Rng,
): ResultatCapture {
  const effet = ITEMS[prisme].effet;
  const bonusPrisme = effet.kind === 'capture' ? effet.bonus : 1;
  const bonusStatut = cible.statut ? BONUS_STATUT[cible.statut] : 1;
  const max = pvMax(cible);
  const taux = SPECIES[cible.speciesId].tauxCapture;

  // Plus la cible est blessée, plus le facteur monte : à pleins PV il vaut le tiers
  // de ce qu'il vaut à un point de vie près.
  const a = (((3 * max - 2 * cible.pv) * taux * bonusPrisme) / (3 * max)) * bonusStatut;

  if (a >= 255) return { reussi: true, secousses: SECOUSSES_MAX };

  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));

  let secousses = 0;
  for (let i = 0; i < SECOUSSES_MAX; i++) {
    if (rng.int(0, 65535) >= b) return { reussi: false, secousses };
    secousses++;
  }
  return { reussi: true, secousses: SECOUSSES_MAX };
}

/**
 * Probabilité de fuir un combat sauvage.
 *
 * Chaque tentative ratée augmente les chances de la suivante : sans cela, une créature
 * plus rapide que toute l'équipe rendrait la fuite impossible et bloquerait la partie.
 */
export function chanceDeFuite(vitesseJoueur: number, vitesseAdverse: number, tentatives: number): number {
  if (vitesseJoueur > vitesseAdverse) return 1;
  const cote = ((vitesseJoueur * 128) / Math.max(1, vitesseAdverse) + 30 * (tentatives + 1)) % 256;
  return Math.min(1, cote / 256);
}
