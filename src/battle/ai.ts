/**
 * Intelligence de l'adversaire.
 *
 * L'IA évalue chaque attaque disponible et choisit la meilleure — mais seulement avec
 * une probabilité qui dépend de son niveau de jeu. Un dresseur de route se trompe
 * souvent, le champion d'arène presque jamais. C'est ce curseur, et non des règles
 * différentes, qui fait la différence de difficulté.
 */

import type { Rng } from '../core/rng.ts';
import { MOVES, type Move } from '../data/moves.ts';
import { SPECIES } from '../data/species.ts';
import { effectivenessAgainst } from '../data/types.ts';
import { pvMax } from '../game/creature.ts';
import { calculerDegats, statEnCombat, type Combattant } from './damage.ts';

/** Probabilité de jouer le meilleur coup plutôt qu'un coup au hasard. */
export const NIVEAUX_IA = {
  sauvage: 0.35,
  route: 0.65,
  arene: 0.9,
  champion: 1,
} as const;

export type NiveauIA = keyof typeof NIVEAUX_IA;

/**
 * Note une attaque du point de vue de l'attaquant.
 *
 * Les attaques offensives sont notées par leurs dégâts attendus, plafonnés aux points
 * de vie restants de la cible : achever vaut mieux que surtuer. Les attaques de statut
 * reçoivent une note forfaitaire, plus haute en début de combat qu'à la fin — poser une
 * altération sur une cible presque vaincue est du gâchis.
 */
export function noterAttaque(
  attaquant: Combattant,
  defenseur: Combattant,
  move: Move,
  rng: Rng,
): number {
  const pvCible = defenseur.instance.pv;

  if (move.categorie === 'statut') {
    if (defenseur.instance.statut !== null && move.effet?.kind === 'statut') return 0;
    const ratioCible = pvCible / pvMax(defenseur.instance);
    const note = pvCible * 0.28 * ratioCible;
    return note * (move.precision === 0 ? 1 : move.precision / 100);
  }

  if (effectivenessAgainst(move.type, SPECIES[defenseur.instance.speciesId].types) === 0) return 0;

  // Estimation sans coup critique et sur un jet moyen : l'IA raisonne sur l'espérance,
  // pas sur un coup de chance qu'elle ne peut pas prévoir.
  const estimation = calculerDegats(attaquant, defenseur, move, rng, { critique: false, alea: 0.925 });
  const utile = Math.min(estimation.degats, pvCible);
  const fiabilite = move.precision === 0 ? 1 : move.precision / 100;
  // Achever vaut une prime : le coup qui met K.O. passe devant un coup plus fort mais
  // qui laisse la cible debout.
  const prime = estimation.degats >= pvCible ? 1.35 : 1;
  return utile * fiabilite * prime;
}

/** Index de l'attaque choisie par l'adversaire. */
export function choisirAttaque(
  attaquant: Combattant,
  defenseur: Combattant,
  niveau: NiveauIA,
  rng: Rng,
): number {
  const utilisables = attaquant.instance.moves
    .map((slot, index) => ({ index, slot }))
    .filter((entree) => entree.slot.pp > 0);

  if (utilisables.length === 0) return 0;
  if (utilisables.length === 1) return utilisables[0]!.index;

  if (!rng.chance(NIVEAUX_IA[niveau])) {
    return rng.pick(utilisables).index;
  }

  let meilleur = utilisables[0]!;
  let meilleureNote = -Infinity;
  for (const entree of utilisables) {
    const note = noterAttaque(attaquant, defenseur, MOVES[entree.slot.id], rng);
    if (note > meilleureNote) {
      meilleureNote = note;
      meilleur = entree;
    }
  }
  return meilleur.index;
}

/**
 * Quelle créature un dresseur envoie ensuite : celle dont le meilleur coup fait le plus
 * de dégâts à la créature adverse. Un dresseur ne choisit pas au hasard.
 */
export function choisirRemplacant(
  candidats: readonly Combattant[],
  adversaire: Combattant,
  rng: Rng,
): number {
  let meilleur = 0;
  let meilleureNote = -Infinity;
  candidats.forEach((candidat, index) => {
    if (candidat.instance.pv <= 0) return;
    const note = Math.max(
      ...candidat.instance.moves.map((slot) => noterAttaque(candidat, adversaire, MOVES[slot.id], rng)),
      0,
    );
    // À note égale, la plus rapide passe devant.
    const ajustee = note + statEnCombat(candidat, 'vitesse') * 0.01;
    if (ajustee > meilleureNote) {
      meilleureNote = ajustee;
      meilleur = index;
    }
  });
  return meilleur;
}
