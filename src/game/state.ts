/**
 * L'état d'une partie, et les opérations qui le font évoluer.
 *
 * Tout ce qui est ici finit dans la sauvegarde — à une exception près : **le monde n'y
 * est pas**. Il se reconstruit depuis la seed. Une partie tient donc en quelques
 * kilo-octets là où stocker les tuiles en demanderait plusieurs mégaoctets.
 *
 * Les opérations sont écrites comme des fonctions sur l'état plutôt que comme des
 * méthodes : c'est ce qui permet de les tester sans construire d'objet de jeu.
 */

import type { Direction } from '../world/characterIds.ts';
import { ITEMS, isKeyItem, type ItemId } from '../data/items.ts';
import { SPECIES, type SpeciesId } from '../data/species.ts';
import type { BattleStat, StatKey } from '../data/stats.ts';
import { ELEMENT_TYPES, type ElementType } from '../data/types.ts';
import type { Langue } from '../i18n/index.ts';
import type { DayPhase } from '../world/encounters.ts';
import {
  entrainer,
  pvMax,
  soignerCompletement,
  type CreatureInstance,
} from './creature.ts';

export const TAILLE_EQUIPE = 6;
/** Au-delà, le sac refuse un objet de plus du même type. */
export const PILE_MAX = 99;

export interface Progression {
  /** Drapeaux libres : « starter choisi », « arène ouverte »… */
  drapeaux: string[];
  dresseursVaincus: string[];
  objetsRamasses: string[];
  badges: string[];
  terradexVus: SpeciesId[];
  terradexCaptures: SpeciesId[];
  /**
   * Régions déjà traversées. La carte n'affiche que celles-ci : on ne dévoile pas
   * l'itinéraire d'avance. Le champ est suivi explicitement plutôt que déduit de la
   * position, parce qu'une partie importée peut avoir sauté des étapes.
   */
  regionsVisitees: number[];
}

export interface Joueur {
  nom: string;
  regionIndex: number;
  x: number;
  y: number;
  direction: Direction;
  pieces: number;
  tempsJeuMs: number;
  /** Où réapparaître après une défaite. */
  refuge: { regionIndex: number; x: number; y: number };
}

/**
 * Un combat interrompu, tel qu'il se retrouve dans la sauvegarde.
 *
 * Les créatures de l'équipe n'y figurent pas : le combat travaille directement sur les
 * exemplaires de `equipe`, leurs PV et leurs PP y sont donc déjà à jour. Ne reste que ce
 * qui n'existe nulle part ailleurs — l'adversaire, les étages de statistiques, le tour.
 */
export interface CombatEnCours {
  genre: 'sauvage' | 'dresseur';
  /** Les adversaires avec les PV et les PP du moment. */
  adversaires: CreatureInstance[];
  /**
   * Le dresseur est retrouvé par son identifiant plutôt que recopié : le monde se
   * rebâtit depuis la seed, et sa fiche avec. On ne quitte pas une région en plein
   * combat, `joueur.regionIndex` suffit donc à le localiser.
   */
  dresseurId: string | null;
  indexJoueur: number;
  indexAdverse: number;
  etagesJoueur: Record<BattleStat, number>;
  etagesAdverse: Record<BattleStat, number>;
  tour: number;
  tentativesFuite: number;
}

export interface GameState {
  seedText: string;
  langue: Langue;
  joueur: Joueur;
  equipe: CreatureInstance[];
  reserve: CreatureInstance[];
  inventaire: Partial<Record<ItemId, number>>;
  progression: Progression;
  /** Minutes écoulées dans la journée en cours, de 0 à 1439. */
  horloge: { minutes: number };
  /** Compteur d'identifiants : garantit que deux créatures ne partagent jamais un uid. */
  prochainUid: number;
  /** Le combat en cours, s'il y en a un. C'est ce qui permet de reprendre en plein échange. */
  combat: CombatEnCours | null;
}

const MINUTES_PAR_JOUR = 24 * 60;
/** Une seconde réelle vaut deux minutes de jeu : un cycle complet dure douze minutes. */
export const MINUTES_PAR_SECONDE = 2;

export function creerPartie(seedText: string, langue: Langue, nom = 'Terra'): GameState {
  return {
    seedText,
    langue,
    joueur: {
      nom,
      regionIndex: 0,
      x: 0,
      y: 0,
      direction: 'sud',
      pieces: 800,
      tempsJeuMs: 0,
      refuge: { regionIndex: 0, x: 0, y: 0 },
    },
    equipe: [],
    reserve: [],
    inventaire: { prisme: 5, potion: 3 },
    progression: {
      drapeaux: [],
      dresseursVaincus: [],
      objetsRamasses: [],
      badges: [],
      terradexVus: [],
      terradexCaptures: [],
      regionsVisitees: [0],
    },
    // Le jeu commence en milieu de matinée : le joueur voit d'abord le monde en plein
    // jour, et découvre le cycle nocturne plus tard.
    horloge: { minutes: 9 * 60 },
    prochainUid: 1,
    combat: null,
  };
}

// ── Temps ────────────────────────────────────────────────────────────────────

export function avancerTemps(state: GameState, deltaMs: number): void {
  state.joueur.tempsJeuMs += deltaMs;
  state.horloge.minutes =
    (state.horloge.minutes + (deltaMs / 1000) * MINUTES_PAR_SECONDE) % MINUTES_PAR_JOUR;
}

export function phaseDuJour(state: GameState): DayPhase {
  const heure = state.horloge.minutes / 60;
  if (heure < 5 || heure >= 21) return 'nuit';
  if (heure < 8) return 'aube';
  if (heure < 18) return 'jour';
  return 'crepuscule';
}

/** Temps de jeu formaté en heures et minutes. */
export function tempsJoue(state: GameState): string {
  const minutes = Math.floor(state.joueur.tempsJeuMs / 60000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

// ── Identifiants ─────────────────────────────────────────────────────────────

export function prochainIdentifiant(state: GameState): string {
  const uid = `c${state.prochainUid}`;
  state.prochainUid += 1;
  return uid;
}

// ── Équipe et réserve ────────────────────────────────────────────────────────

/**
 * Ajoute une créature : dans l'équipe s'il reste de la place, en réserve sinon.
 * Renvoie où elle a atterri, pour que l'interface puisse le dire au joueur.
 */
export function accueillirCreature(state: GameState, creature: CreatureInstance): 'equipe' | 'reserve' {
  marquerCapture(state, creature.speciesId);
  if (state.equipe.length < TAILLE_EQUIPE) {
    state.equipe.push(creature);
    return 'equipe';
  }
  state.reserve.push(creature);
  return 'reserve';
}

export function equipeDebout(state: GameState): CreatureInstance[] {
  return state.equipe.filter((creature) => creature.pv > 0);
}

export function equipeHorsCombat(state: GameState): boolean {
  return equipeDebout(state).length === 0;
}

export function soignerEquipe(state: GameState): void {
  for (const creature of state.equipe) soignerCompletement(creature);
}

/** Échange deux créatures entre équipe et réserve. */
export function echangerAvecReserve(state: GameState, indexEquipe: number, indexReserve: number): boolean {
  const enEquipe = state.equipe[indexEquipe];
  const enReserve = state.reserve[indexReserve];
  if (!enEquipe || !enReserve) return false;
  state.equipe[indexEquipe] = enReserve;
  state.reserve[indexReserve] = enEquipe;
  return true;
}

/**
 * Déplace une créature dans l'équipe, les autres se refermant derrière elle.
 *
 * L'ordre de l'équipe n'est pas décoratif : il décide qui part au combat en premier, et
 * l'ordre dans lequel les remplaçants sont proposés quand une créature tombe. Rien ne
 * permettait de le changer — seuls les allers-retours par la réserve y arrivaient, et
 * encore, par accident.
 *
 * Retrait puis insertion, et non échange : une créature portée du sixième rang au
 * premier doit décaler les cinq autres d'un cran, pas troquer sa place avec l'une
 * d'elles. Comme l'écran ne la déplace que d'un rang à la fois, les deux reviennent au
 * même sur un pas — la différence n'apparaît que sur un saut, et c'est celle-là qui est
 * juste.
 */
export function deplacerDansEquipe(state: GameState, depuis: number, vers: number): boolean {
  if (depuis === vers) return false;
  if (depuis < 0 || depuis >= state.equipe.length) return false;
  if (vers < 0 || vers >= state.equipe.length) return false;
  const [portee] = state.equipe.splice(depuis, 1);
  if (!portee) return false;
  state.equipe.splice(vers, 0, portee);
  return true;
}

/** Dépose une créature en réserve. Refuse de vider entièrement l'équipe. */
export function deposerEnReserve(state: GameState, index: number): boolean {
  if (state.equipe.length <= 1) return false;
  const [retiree] = state.equipe.splice(index, 1);
  if (!retiree) return false;
  state.reserve.push(retiree);
  return true;
}

/** Reprend une créature de la réserve. Refuse si l'équipe est déjà au complet. */
export function retirerDeReserve(state: GameState, index: number): boolean {
  if (state.equipe.length >= TAILLE_EQUIPE) return false;
  const [reprise] = state.reserve.splice(index, 1);
  if (!reprise) return false;
  state.equipe.push(reprise);
  return true;
}

// ── Sac ──────────────────────────────────────────────────────────────────────

export function quantite(state: GameState, item: ItemId): number {
  return state.inventaire[item] ?? 0;
}

export function ajouterObjet(state: GameState, item: ItemId, nombre = 1): number {
  const actuel = quantite(state, item);
  const ajoute = Math.max(0, Math.min(nombre, PILE_MAX - actuel));
  if (ajoute > 0) state.inventaire[item] = actuel + ajoute;
  return ajoute;
}

export function retirerObjet(state: GameState, item: ItemId, nombre = 1): boolean {
  const actuel = quantite(state, item);
  if (actuel < nombre) return false;
  const reste = actuel - nombre;
  if (reste === 0) delete state.inventaire[item];
  else state.inventaire[item] = reste;
  return true;
}

/** Le sac trié pour l'affichage : objets clés en dernier, dans l'ordre du catalogue. */
export function sacTrie(state: GameState): Array<{ item: ItemId; nombre: number }> {
  return (Object.keys(state.inventaire) as ItemId[])
    .filter((item) => quantite(state, item) > 0)
    .sort((a, b) => Number(isKeyItem(a)) - Number(isKeyItem(b)) || ITEMS[a].prix - ITEMS[b].prix)
    .map((item) => ({ item, nombre: quantite(state, item) }));
}

export interface ResultatAchat {
  readonly achete: boolean;
  /** Pièces manquantes si l'achat échoue faute d'argent. */
  readonly manque: number;
}

export function acheter(state: GameState, item: ItemId, nombre = 1): ResultatAchat {
  const cout = ITEMS[item].prix * nombre;
  if (cout <= 0) return { achete: false, manque: 0 };
  if (state.joueur.pieces < cout) return { achete: false, manque: cout - state.joueur.pieces };
  if (ajouterObjet(state, item, nombre) < nombre) return { achete: false, manque: 0 };
  state.joueur.pieces -= cout;
  return { achete: true, manque: 0 };
}

/**
 * Utilise un objet de soin sur une créature. Renvoie ce qui a réellement changé, pour
 * que l'interface n'annonce pas un soin qui n'a pas eu lieu.
 */
export function utiliserObjetSur(
  state: GameState,
  item: ItemId,
  cible: CreatureInstance,
): { readonly utilise: boolean; readonly pvRendus: number; readonly statutDissipe: boolean } {
  const effet = ITEMS[item].effet;
  if (effet.kind === 'soin') {
    if (cible.pv <= 0 || cible.pv >= pvMax(cible)) return { utilise: false, pvRendus: 0, statutDissipe: false };
    const rendus = Math.min(effet.montant, pvMax(cible) - cible.pv);
    cible.pv += rendus;
    retirerObjet(state, item);
    return { utilise: true, pvRendus: rendus, statutDissipe: false };
  }
  if (effet.kind === 'guerison') {
    const actuel = cible.statut;
    if (!actuel || (effet.statut !== 'tout' && effet.statut !== actuel)) {
      return { utilise: false, pvRendus: 0, statutDissipe: false };
    }
    cible.statut = null;
    cible.sommeil = 0;
    retirerObjet(state, item);
    return { utilise: true, pvRendus: 0, statutDissipe: true };
  }
  return { utilise: false, pvRendus: 0, statutDissipe: false };
}

// ── Progression ──────────────────────────────────────────────────────────────

export function aDrapeau(state: GameState, drapeau: string): boolean {
  return state.progression.drapeaux.includes(drapeau);
}

export function poserDrapeau(state: GameState, drapeau: string): void {
  if (!aDrapeau(state, drapeau)) state.progression.drapeaux.push(drapeau);
}

export function dresseurVaincu(state: GameState, id: string): boolean {
  return state.progression.dresseursVaincus.includes(id);
}

export function marquerDresseurVaincu(state: GameState, id: string): void {
  if (!dresseurVaincu(state, id)) state.progression.dresseursVaincus.push(id);
}

export function objetRamasse(state: GameState, id: string): boolean {
  return state.progression.objetsRamasses.includes(id);
}

export function marquerObjetRamasse(state: GameState, id: string): void {
  if (!objetRamasse(state, id)) state.progression.objetsRamasses.push(id);
}

export function marquerVu(state: GameState, species: SpeciesId): void {
  if (!state.progression.terradexVus.includes(species)) state.progression.terradexVus.push(species);
}

export function marquerCapture(state: GameState, species: SpeciesId): void {
  marquerVu(state, species);
  if (!state.progression.terradexCaptures.includes(species)) {
    state.progression.terradexCaptures.push(species);
  }
}

export function regionVisitee(state: GameState, index: number): boolean {
  return state.progression.regionsVisitees.includes(index);
}

export function marquerRegionVisitee(state: GameState, index: number): void {
  if (!regionVisitee(state, index)) state.progression.regionsVisitees.push(index);
}

export function aBadge(state: GameState, badge: string): boolean {
  return state.progression.badges.includes(badge);
}

export function donnerBadge(state: GameState, badge: string): void {
  if (!aBadge(state, badge)) state.progression.badges.push(badge);
}

/**
 * Les types dont le badge est acquis, dans l'ordre où ils l'ont été.
 *
 * Les badges sont stockés en texte — `badge:flamme` — pour que la sauvegarde reste
 * lisible et qu'un badge inconnu d'une version future n'empêche pas de charger. La
 * conversion vers un type se fait donc ici, en écartant ce qui n'en est pas un.
 */
export function typesDesBadges(state: GameState): ElementType[] {
  return state.progression.badges
    .map((badge) => badge.slice('badge:'.length))
    .filter((type): type is ElementType => (ELEMENT_TYPES as readonly string[]).includes(type));
}

/** Répartit des points de dressage sur toute l'équipe encore debout. */
export function distribuerDressage(state: GameState, stat: StatKey, points: number): void {
  for (const creature of equipeDebout(state)) entrainer(creature, stat, points);
}

/** Nombre d'espèces du Terradex, pour l'affichage de la progression. */
export function tailleTerradex(): number {
  return Object.keys(SPECIES).length;
}
