/**
 * Moteur de combat.
 *
 * **L'invariant central du projet :** ce fichier ne dessine rien et ne connaît pas
 * l'écran. Il reçoit un état et une action, et renvoie une liste d'**événements** que
 * l'interface rejoue en animation. Un combat entier se teste donc sans navigateur, se
 * rejoue à l'identique, et l'ajout d'une animation ne peut pas modifier une règle.
 *
 * Le moteur ne gère qu'un échange à deux créatures. L'équipe, les remplacements et la
 * fin de la rencontre relèvent de la couche jeu : le moteur signale « la créature du
 * joueur est K.O. », il ne décide pas de qui entre ensuite.
 */

import type { Rng } from '../core/rng.ts';
import { ITEMS, type ItemId } from '../data/items.ts';
import { MOVES, type Move, type MoveId } from '../data/moves.ts';
import type { BattleStat, StatusId } from '../data/stats.ts';
import { SPECIES } from '../data/species.ts';
import { TALENTS } from '../data/talents.ts';
import type { EffectivenessTier } from '../data/types.ts';
import { effectivenessAgainst } from '../data/types.ts';
import { pvMax, statistique, type CreatureInstance } from '../game/creature.ts';
import { chanceDeFuite, tenterCapture } from './capture.ts';
import {
  calculerDegats,
  creerCombattant,
  statEnCombat,
  toucheLaCible,
  type Combattant,
} from './damage.ts';

export type Cote = 'joueur' | 'adversaire';

export type BattleEvent =
  /** Texte à afficher. `cle` désigne une entrée du catalogue de traductions. */
  | { readonly type: 'message'; readonly cle: string; readonly params?: Record<string, string | number> }
  | { readonly type: 'attaque'; readonly acteur: Cote; readonly move: MoveId }
  | { readonly type: 'rate'; readonly acteur: Cote }
  | {
      readonly type: 'degats';
      readonly cible: Cote;
      readonly montant: number;
      readonly palier: EffectivenessTier;
      readonly critique: boolean;
      readonly pvRestants: number;
    }
  | { readonly type: 'soin'; readonly cible: Cote; readonly montant: number; readonly pvRestants: number }
  | { readonly type: 'statut'; readonly cible: Cote; readonly statut: StatusId }
  | { readonly type: 'statutDissipe'; readonly cible: Cote; readonly statut: StatusId }
  | { readonly type: 'stat'; readonly cible: Cote; readonly stat: BattleStat; readonly etages: number }
  | { readonly type: 'immobilise'; readonly acteur: Cote; readonly cause: StatusId }
  | { readonly type: 'ko'; readonly cible: Cote }
  | { readonly type: 'objet'; readonly item: ItemId }
  | { readonly type: 'capture'; readonly secousses: number; readonly reussi: boolean }
  | { readonly type: 'fuite'; readonly reussi: boolean };

export type Issue = 'adversaireKo' | 'joueurKo' | 'capture' | 'fuite';

export type Action =
  | { readonly kind: 'attaque'; readonly index: number }
  | { readonly kind: 'objet'; readonly item: ItemId }
  | { readonly kind: 'capture'; readonly item: ItemId }
  /** Le joueur a changé de créature : il passe son tour, l'adversaire agit. */
  | { readonly kind: 'changer' }
  | { readonly kind: 'fuite' };

export interface BattleState {
  readonly genre: 'sauvage' | 'dresseur';
  joueur: Combattant;
  adversaire: Combattant;
  tour: number;
  tentativesFuite: number;
  issue: Issue | null;
}

export function creerCombat(
  joueur: CreatureInstance,
  adversaire: CreatureInstance,
  genre: BattleState['genre'],
): BattleState {
  return {
    genre,
    joueur: creerCombattant(joueur),
    adversaire: creerCombattant(adversaire),
    tour: 0,
    tentativesFuite: 0,
    issue: null,
  };
}

function autre(cote: Cote): Cote {
  return cote === 'joueur' ? 'adversaire' : 'joueur';
}

function combattant(state: BattleState, cote: Cote): Combattant {
  return cote === 'joueur' ? state.joueur : state.adversaire;
}

/**
 * Événements d'entrée en combat : c'est ici que s'appliquent les talents déclenchés à
 * l'arrivée, comme Intimidation.
 */
export function evenementsEntree(state: BattleState, cote: Cote): BattleEvent[] {
  const evenements: BattleEvent[] = [];
  const acteur = combattant(state, cote);
  if (TALENTS[acteur.instance.talentId].effet.kind === 'intimidation') {
    const cible = combattant(state, autre(cote));
    const applique = modifierEtage(cible, 'attaque', -1);
    if (applique !== 0) {
      evenements.push({ type: 'message', cle: 'combat.talent', params: { talent: acteur.instance.talentId } });
      evenements.push({ type: 'stat', cible: autre(cote), stat: 'attaque', etages: applique });
    }
  }
  return evenements;
}

/** Applique un changement d'étage, borné à ±6. Renvoie le changement réellement subi. */
function modifierEtage(cible: Combattant, stat: BattleStat, etages: number): number {
  const avant = cible.etages[stat];
  const apres = Math.max(-6, Math.min(6, avant + etages));
  cible.etages[stat] = apres;
  return apres - avant;
}

/** Vrai si la créature est protégée de cette altération par son talent ou son type. */
function immuniseAuStatut(cible: Combattant, statut: StatusId): boolean {
  const effet = TALENTS[cible.instance.talentId].effet;
  if (effet.kind === 'immuniteStatut' && effet.statut === statut) return true;

  // Immunités de type : on ne brûle pas le feu, on ne gèle pas la glace, et le métal
  // ne s'empoisonne pas. Sans ces règles, une altération rendrait un type absurde.
  const types = SPECIES[cible.instance.speciesId].types;
  if (statut === 'brulure' && types.includes('flamme')) return true;
  if (statut === 'gel' && types.includes('givre')) return true;
  if (statut === 'poison' && (types.includes('toxine') || types.includes('metal'))) return true;
  if (statut === 'paralysie' && types.includes('foudre')) return true;
  return false;
}

function appliquerStatut(
  state: BattleState,
  cote: Cote,
  statut: StatusId,
  rng: Rng,
  evenements: BattleEvent[],
): void {
  const cible = combattant(state, cote);
  if (cible.instance.statut !== null) return;
  if (immuniseAuStatut(cible, statut)) return;
  cible.instance.statut = statut;
  if (statut === 'sommeil') cible.instance.sommeil = rng.int(1, 3);
  evenements.push({ type: 'statut', cible: cote, statut });
}

function infligerDegats(state: BattleState, cote: Cote, montant: number): number {
  const cible = combattant(state, cote);
  const applique = Math.min(cible.instance.pv, Math.max(0, Math.round(montant)));
  cible.instance.pv -= applique;
  return applique;
}

function rendrePv(state: BattleState, cote: Cote, montant: number): number {
  const cible = combattant(state, cote);
  const max = pvMax(cible.instance);
  const applique = Math.min(max - cible.instance.pv, Math.max(0, Math.round(montant)));
  cible.instance.pv += applique;
  return applique;
}

/**
 * L'attaque effectivement utilisée. Quand tous les emplacements sont vides, la créature
 * se rabat sur Lutte — sinon un combat où les deux camps n'ont plus de PP ne finirait
 * jamais.
 */
function attaqueChoisie(acteur: Combattant, index: number): { move: Move; slot: number | null } {
  const slot = acteur.instance.moves[index];
  if (slot && slot.pp > 0) return { move: MOVES[slot.id], slot: index };
  const disponible = acteur.instance.moves.findIndex((candidat) => candidat.pp > 0);
  if (disponible >= 0) return { move: MOVES[acteur.instance.moves[disponible]!.id], slot: disponible };
  return { move: MOVES.lutte, slot: null };
}

/**
 * Vérifie qu'une altération n'empêche pas d'agir.
 * Renvoie `true` si la créature peut attaquer.
 */
function peutAgir(state: BattleState, cote: Cote, rng: Rng, evenements: BattleEvent[]): boolean {
  const acteur = combattant(state, cote);
  const statut = acteur.instance.statut;
  if (statut === null) return true;

  if (statut === 'sommeil') {
    acteur.instance.sommeil -= 1;
    if (acteur.instance.sommeil <= 0) {
      acteur.instance.statut = null;
      evenements.push({ type: 'statutDissipe', cible: cote, statut: 'sommeil' });
      return true;
    }
    evenements.push({ type: 'immobilise', acteur: cote, cause: 'sommeil' });
    return false;
  }

  if (statut === 'gel') {
    // Une chance sur cinq de dégeler à chaque tour : le gel est puissant, il ne doit
    // pas être définitif.
    if (rng.chance(0.2)) {
      acteur.instance.statut = null;
      evenements.push({ type: 'statutDissipe', cible: cote, statut: 'gel' });
      return true;
    }
    evenements.push({ type: 'immobilise', acteur: cote, cause: 'gel' });
    return false;
  }

  if (statut === 'paralysie' && rng.chance(0.25)) {
    evenements.push({ type: 'immobilise', acteur: cote, cause: 'paralysie' });
    return false;
  }

  return true;
}

function executerAttaque(
  state: BattleState,
  cote: Cote,
  index: number,
  rng: Rng,
  evenements: BattleEvent[],
): void {
  const acteur = combattant(state, cote);
  const coteCible = autre(cote);
  const cible = combattant(state, coteCible);
  if (acteur.instance.pv <= 0 || cible.instance.pv <= 0) return;
  if (!peutAgir(state, cote, rng, evenements)) return;

  const { move, slot } = attaqueChoisie(acteur, index);
  if (slot !== null) acteur.instance.moves[slot]!.pp -= 1;
  evenements.push({ type: 'attaque', acteur: cote, move: move.id });

  // Absorption : le talent annule l'attaque et soigne, avant tout calcul de dégâts.
  const talentCible = TALENTS[cible.instance.talentId].effet;
  if (talentCible.kind === 'absorption' && talentCible.type === move.type && move.categorie !== 'statut') {
    const rendu = rendrePv(state, coteCible, pvMax(cible.instance) * talentCible.soin);
    evenements.push({ type: 'message', cle: 'combat.talent', params: { talent: cible.instance.talentId } });
    evenements.push({ type: 'soin', cible: coteCible, montant: rendu, pvRestants: cible.instance.pv });
    return;
  }

  if (!toucheLaCible(move, rng)) {
    evenements.push({ type: 'rate', acteur: cote });
    return;
  }

  if (move.categorie === 'statut') {
    appliquerEffet(state, cote, move, 0, rng, evenements);
    return;
  }

  const immunise = effectivenessAgainst(move.type, SPECIES[cible.instance.speciesId].types) === 0;
  if (immunise) {
    evenements.push({
      type: 'degats',
      cible: coteCible,
      montant: 0,
      palier: 'immune',
      critique: false,
      pvRestants: cible.instance.pv,
    });
    return;
  }

  const coups =
    move.effet?.kind === 'coupsMultiples' ? rng.int(move.effet.min, move.effet.max) : 1;
  let totalInflige = 0;

  for (let coup = 0; coup < coups; coup++) {
    if (cible.instance.pv <= 0) break;
    const resultat = calculerDegats(acteur, cible, move, rng);
    const inflige = infligerDegats(state, coteCible, resultat.degats);
    totalInflige += inflige;
    evenements.push({
      type: 'degats',
      cible: coteCible,
      montant: inflige,
      palier: resultat.palier,
      critique: resultat.critique,
      pvRestants: cible.instance.pv,
    });
  }

  if (coups > 1) {
    evenements.push({ type: 'message', cle: 'combat.coupsMultiples', params: { coups } });
  }

  appliquerEffet(state, cote, move, totalInflige, rng, evenements);

  // Riposte au contact : seules les attaques physiques touchent la cible de près.
  const riposte = TALENTS[cible.instance.talentId].effet;
  if (
    riposte.kind === 'riposte' &&
    move.categorie === 'physique' &&
    cible.instance.pv > 0 &&
    rng.chance(riposte.chance / 100)
  ) {
    appliquerStatut(state, cote, riposte.statut, rng, evenements);
  }
}

function appliquerEffet(
  state: BattleState,
  cote: Cote,
  move: Move,
  degatsInfliges: number,
  rng: Rng,
  evenements: BattleEvent[],
): void {
  const effet = move.effet;
  if (!effet) return;
  const coteCible = autre(cote);

  switch (effet.kind) {
    case 'statut':
      if (rng.next() * 100 < effet.chance) appliquerStatut(state, coteCible, effet.statut, rng, evenements);
      break;

    case 'stat': {
      if (rng.next() * 100 >= effet.chance) break;
      const vise = effet.cible === 'soi' ? cote : coteCible;
      const applique = modifierEtage(combattant(state, vise), effet.stat, effet.etages);
      if (applique !== 0) evenements.push({ type: 'stat', cible: vise, stat: effet.stat, etages: applique });
      break;
    }

    case 'recul': {
      const recul = infligerDegats(state, cote, degatsInfliges * effet.fraction);
      if (recul > 0) {
        evenements.push({ type: 'message', cle: 'combat.recul' });
        evenements.push({
          type: 'degats',
          cible: cote,
          montant: recul,
          palier: 'neutral',
          critique: false,
          pvRestants: combattant(state, cote).instance.pv,
        });
      }
      break;
    }

    case 'drain': {
      const rendu = rendrePv(state, cote, degatsInfliges * effet.fraction);
      if (rendu > 0) {
        evenements.push({
          type: 'soin',
          cible: cote,
          montant: rendu,
          pvRestants: combattant(state, cote).instance.pv,
        });
      }
      break;
    }

    case 'soin': {
      const acteur = combattant(state, cote);
      const rendu = rendrePv(state, cote, pvMax(acteur.instance) * effet.fraction);
      evenements.push({ type: 'soin', cible: cote, montant: rendu, pvRestants: acteur.instance.pv });
      if (effet.guerit && acteur.instance.statut) {
        evenements.push({ type: 'statutDissipe', cible: cote, statut: acteur.instance.statut });
        acteur.instance.statut = null;
        acteur.instance.sommeil = 0;
      }
      break;
    }

    case 'coupsMultiples':
    case 'critique':
      break;
  }
}

/** Dégâts et soins de fin de tour : altérations, régénération. */
function finDeTour(state: BattleState, rng: Rng, evenements: BattleEvent[]): void {
  void rng;
  for (const cote of ['joueur', 'adversaire'] as const) {
    const acteur = combattant(state, cote);
    if (acteur.instance.pv <= 0) continue;

    const talent = TALENTS[acteur.instance.talentId].effet;
    if (talent.kind === 'regeneration') {
      const rendu = rendrePv(state, cote, pvMax(acteur.instance) * talent.fraction);
      if (rendu > 0) {
        evenements.push({ type: 'soin', cible: cote, montant: rendu, pvRestants: acteur.instance.pv });
      }
    }

    const statut = acteur.instance.statut;
    if (statut !== 'brulure' && statut !== 'poison') continue;

    // Le talent Venimeux double les dégâts du poison qu'il a infligé : on le lit chez
    // l'adversaire, puisque c'est lui qui a empoisonné.
    const empoisonneur = TALENTS[combattant(state, autre(cote)).instance.talentId].effet;
    const facteur = statut === 'poison' && empoisonneur.kind === 'venimeux' ? 2 : 1;
    const degats = Math.max(1, Math.floor((pvMax(acteur.instance) / 16) * facteur));
    const inflige = infligerDegats(state, cote, degats);
    evenements.push({ type: 'message', cle: `combat.souffre.${statut}` });
    evenements.push({
      type: 'degats',
      cible: cote,
      montant: inflige,
      palier: 'neutral',
      critique: false,
      pvRestants: acteur.instance.pv,
    });
  }
}

function verifierKo(state: BattleState, evenements: BattleEvent[]): void {
  if (state.adversaire.instance.pv <= 0) {
    evenements.push({ type: 'ko', cible: 'adversaire' });
    state.issue = 'adversaireKo';
    return;
  }
  if (state.joueur.instance.pv <= 0) {
    evenements.push({ type: 'ko', cible: 'joueur' });
    state.issue = 'joueurKo';
  }
}

/** Applique un objet de soin en combat. */
function utiliserObjet(state: BattleState, item: ItemId, evenements: BattleEvent[]): void {
  const effet = ITEMS[item].effet;
  evenements.push({ type: 'objet', item });
  if (effet.kind === 'soin') {
    const rendu = rendrePv(state, 'joueur', effet.montant);
    evenements.push({ type: 'soin', cible: 'joueur', montant: rendu, pvRestants: state.joueur.instance.pv });
  } else if (effet.kind === 'guerison') {
    const actuel = state.joueur.instance.statut;
    if (actuel && (effet.statut === 'tout' || effet.statut === actuel)) {
      state.joueur.instance.statut = null;
      state.joueur.instance.sommeil = 0;
      evenements.push({ type: 'statutDissipe', cible: 'joueur', statut: actuel });
    }
  }
}

/**
 * Résout un tour complet et renvoie les événements dans l'ordre où l'interface doit
 * les jouer. L'état est modifié sur place.
 */
export function resoudreTour(
  state: BattleState,
  action: Action,
  choixAdverse: number,
  rng: Rng,
): BattleEvent[] {
  const evenements: BattleEvent[] = [];
  if (state.issue !== null) return evenements;
  state.tour += 1;

  // Fuite, capture et objets se produisent avant toute attaque : ce sont des actions
  // du dresseur, pas de la créature.
  if (action.kind === 'fuite') {
    if (state.genre === 'dresseur') {
      evenements.push({ type: 'fuite', reussi: false });
      evenements.push({ type: 'message', cle: 'combat.fuiteImpossible' });
    } else {
      const reussi = rng.chance(
        chanceDeFuite(
          statEnCombat(state.joueur, 'vitesse'),
          statEnCombat(state.adversaire, 'vitesse'),
          state.tentativesFuite,
        ),
      );
      state.tentativesFuite += 1;
      evenements.push({ type: 'fuite', reussi });
      if (reussi) {
        state.issue = 'fuite';
        return evenements;
      }
    }
  } else if (action.kind === 'capture') {
    const resultat = tenterCapture(state.adversaire.instance, action.item, rng);
    evenements.push({ type: 'objet', item: action.item });
    evenements.push({ type: 'capture', secousses: resultat.secousses, reussi: resultat.reussi });
    if (resultat.reussi) {
      state.issue = 'capture';
      return evenements;
    }
  } else if (action.kind === 'objet') {
    utiliserObjet(state, action.item, evenements);
  }

  const joueurAttaque = action.kind === 'attaque';

  if (joueurAttaque) {
    const moveJoueur = attaqueChoisie(state.joueur, action.index).move;
    const moveAdverse = attaqueChoisie(state.adversaire, choixAdverse).move;
    const premier = ordreDuTour(state, moveJoueur, moveAdverse, rng);

    for (const cote of premier) {
      if (state.joueur.instance.pv <= 0 || state.adversaire.instance.pv <= 0) break;
      executerAttaque(state, cote, cote === 'joueur' ? action.index : choixAdverse, rng, evenements);
    }
  } else if (state.joueur.instance.pv > 0 && state.adversaire.instance.pv > 0) {
    // Le joueur a fait autre chose : l'adversaire agit seul.
    executerAttaque(state, 'adversaire', choixAdverse, rng, evenements);
  }

  if (state.joueur.instance.pv > 0 && state.adversaire.instance.pv > 0) {
    finDeTour(state, rng, evenements);
  }

  verifierKo(state, evenements);
  return evenements;
}

/**
 * Qui frappe en premier : la priorité de l'attaque prime sur la vitesse, et l'égalité
 * se départage au hasard plutôt que par un ordre implicite qui avantagerait toujours
 * le même camp.
 */
export function ordreDuTour(
  state: BattleState,
  moveJoueur: Move,
  moveAdverse: Move,
  rng: Rng,
): readonly [Cote, Cote] {
  if (moveJoueur.priorite !== moveAdverse.priorite) {
    return moveJoueur.priorite > moveAdverse.priorite
      ? ['joueur', 'adversaire']
      : ['adversaire', 'joueur'];
  }
  const vitesseJoueur = statEnCombat(state.joueur, 'vitesse');
  const vitesseAdverse = statEnCombat(state.adversaire, 'vitesse');
  if (vitesseJoueur !== vitesseAdverse) {
    return vitesseJoueur > vitesseAdverse ? ['joueur', 'adversaire'] : ['adversaire', 'joueur'];
  }
  return rng.chance(0.5) ? ['joueur', 'adversaire'] : ['adversaire', 'joueur'];
}

/** Statistique brute, exposée pour l'interface (barres, fiche de créature). */
export { statistique, pvMax };
