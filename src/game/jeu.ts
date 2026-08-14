/**
 * Le contexte de jeu : ce que toute scène a sous la main.
 *
 * Il rassemble l'état de la partie, le monde, les entrées, le peintre et la pile de
 * scènes. Les scènes ne se connaissent pas entre elles — elles poussent et retirent des
 * scènes sur cette pile, ce qui rend chaque écran remplaçable isolément.
 */

import { makeRng, type Rng } from '../core/rng.ts';
import type { Entrees, Point } from '../core/input.ts';
import { SPECIES, type SpeciesId } from '../data/species.ts';
import { MOVES, type Move, type MoveId } from '../data/moves.ts';
import { ITEMS, type ItemId } from '../data/items.ts';
import { TALENTS, type TalentId } from '../data/talents.ts';
import { TYPE_NAMES, type ElementType } from '../data/types.ts';
import { STAT_NAMES, STATUS_NAMES, stageMultiplier, type StatKey } from '../data/stats.ts';
import { LANGUES, traduire, type CleTexte, type Langue, type Params } from '../i18n/index.ts';
import { appliquerLangueAuDocument } from '../i18n/preference.ts';
import { BoiteDialogue } from '../ui/dialogue.ts';
import type { Peintre } from '../ui/draw.ts';
import { creerMonde, type World } from '../world/worldgen.ts';
import { nomAffiche, type CreatureInstance } from './creature.ts';
import { exporterPartie } from '../save/serialize.ts';
import { empreinte, enregistrerLanguePreferee, enregistrerLocalement } from '../save/storage.ts';
import type { SaveFile } from '../save/format.ts';
import { rendreMotif, type MotifValidation } from '../save/validate.ts';
import type { GameState } from './state.ts';

export interface Scene {
  readonly nom: string;
  entrer?(jeu: Jeu): void;
  quitter?(jeu: Jeu): void;
  mettreAJour(jeu: Jeu, step: number): void;
  dessiner(jeu: Jeu): void;
  /**
   * Appelé sur toute la pile juste avant une écriture de la partie : la scène y dépose
   * ce qu'elle est seule à connaître. Le combat s'en sert pour enregistrer l'échange en
   * cours, si bien qu'une sauvegarde déclenchée à n'importe quel instant — l'écriture
   * périodique, la fermeture de l'onglet — le capte tel qu'il est.
   */
  avantSauvegarde?(jeu: Jeu): void;
  /** Une scène opaque dispense de dessiner celles du dessous. */
  readonly opaque?: boolean;
}

/** Intervalle minimal entre deux écritures automatiques, en millisecondes. */
const INTERVALLE_SAUVEGARDE_MS = 10_000;

/**
 * Ce que vaut un nombre d'étages, en pourcentage de la statistique de départ.
 *
 * Un étage multiplie par 1,5 — c'est-à-dire une moitié en plus, et c'est ce « +50 % »
 * qu'il faut écrire plutôt qu'un « +1 cran » que rien n'explique. Une baisse d'un étage
 * divise par 1,5, soit un tiers en moins : l'asymétrie de `stageMultiplier` est
 * volontaire, et la phrase la reflète sans avoir à la connaître.
 */
export function ecartEnPourcent(etages: number): number {
  return Math.round(Math.abs(stageMultiplier(etages) - 1) * 100);
}

export class Jeu {
  state: GameState;
  monde: World;
  readonly dialogue: BoiteDialogue;
  /**
   * Générateur des tirages de la session : rencontres, jets de combat, gènes.
   * Il n'est volontairement pas dérivé de la seed du monde — un combat doit pouvoir
   * se dérouler différemment d'une partie à l'autre, contrairement au terrain.
   */
  readonly rng: Rng;
  private readonly pile: Scene[] = [];

  /** Cadencement et déduplication de la sauvegarde automatique. */
  private depuisDerniereEcriture = 0;
  private derniereEmpreinte = '';
  /** Le refus d'écrire a déjà été dit : on ne le répète pas à chaque tentative. */
  private echecEcritureSignale = false;

  readonly peintre: Peintre;
  readonly entrees: Entrees;

  constructor(peintre: Peintre, entrees: Entrees, state: GameState, graine: number) {
    this.peintre = peintre;
    this.entrees = entrees;
    this.state = state;
    this.monde = creerMonde(state.seedText);
    this.dialogue = new BoiteDialogue(peintre);
    this.rng = makeRng(graine);
  }

  // ── Pile de scènes ─────────────────────────────────────────────────────────

  get sommet(): Scene | undefined {
    return this.pile[this.pile.length - 1];
  }

  pousser(scene: Scene): void {
    this.pile.push(scene);
    scene.entrer?.(this);
  }

  retirer(): void {
    const scene = this.pile.pop();
    scene?.quitter?.(this);
  }

  remplacer(scene: Scene): void {
    while (this.pile.length > 0) this.retirer();
    this.pousser(scene);
  }

  mettreAJour(step: number): void {
    this.sommet?.mettreAJour(this, step);
  }

  dessiner(): void {
    // On remonte jusqu'à la dernière scène opaque, puis on redescend : une scène
    // translucide (un menu) laisse ainsi voir le monde derrière elle.
    // `Math.max(0, …)` n'est pas décoratif : sur une pile vide, l'index partirait à −1
    // et le rendu planterait au lieu de ne rien dessiner.
    let premier = Math.max(0, this.pile.length - 1);
    while (premier > 0 && !this.pile[premier]!.opaque) premier -= 1;
    for (let i = premier; i < this.pile.length; i++) this.pile[i]?.dessiner(this);
  }

  // ── Changement de partie ───────────────────────────────────────────────────

  chargerPartie(state: GameState): void {
    this.state = state;
    this.monde = creerMonde(state.seedText);
    this.dialogue.vider();
    // L'empreinte décrivait la partie précédente : la garder ferait passer la nouvelle
    // pour inchangée, et la première écriture périodique n'aurait jamais lieu.
    this.derniereEmpreinte = '';
    this.depuisDerniereEcriture = 0;
  }

  // ── Pointeur ───────────────────────────────────────────────────────────────

  /** Position de la souris ou du doigt en coordonnées virtuelles, `null` s'il n'y en a pas. */
  get pointeur(): Point | null {
    return this.entrees.pointeur;
  }

  /**
   * Vrai si le pointeur se trouve dans ce rectangle virtuel.
   *
   * Les scènes s'en servent pour souligner l'entrée visée avant qu'on clique : sans ce
   * retour, une liste cliquable est indiscernable d'une liste qui ne l'est pas.
   */
  survole(x: number, y: number, largeur: number, hauteur: number): boolean {
    const p = this.entrees.pointeur;
    return !!p && p.x >= x && p.x < x + largeur && p.y >= y && p.y < y + hauteur;
  }

  /** Vrai si un clic vient d'être enfoncé dans ce rectangle virtuel. */
  clique(x: number, y: number, largeur: number, hauteur: number): boolean {
    return this.entrees.cliquePresse() && this.survole(x, y, largeur, hauteur);
  }

  // ── Traduction ─────────────────────────────────────────────────────────────

  get langue(): Langue {
    return this.state.langue;
  }

  t(cle: CleTexte, params?: Params): string {
    return traduire(this.langue, cle, params);
  }

  /**
   * Rend lisible un refus de la validation.
   *
   * La validation renvoie une clé et ses paramètres, jamais une phrase : c'est ce qui
   * permet à un joueur anglophone de lire en anglais pourquoi son fichier est refusé.
   */
  motif(motif: MotifValidation): string {
    return rendreMotif(this.langue, motif);
  }

  /**
   * Passe à la langue suivante, la retient, et la répercute sur le document.
   *
   * L'écran-titre et le menu de pause faisaient chacun leur bascule dans leur coin ; le
   * `lang` de la page et l'étiquette du canvas, eux, n'étaient mis à jour nulle part.
   */
  basculerLangue(): void {
    const index = LANGUES.indexOf(this.langue);
    this.state.langue = LANGUES[(index + 1) % LANGUES.length]!;
    enregistrerLanguePreferee(this.state.langue);
    appliquerLangueAuDocument(this.state.langue, this.t('a11y.canvas'));
  }

  /** Traduit une clé de dialogue venue des données du monde, sans planter si absente. */
  dialogueDe(cle: string): string {
    return traduire(this.langue, cle as CleTexte) ?? cle;
  }

  nomCreature(instance: CreatureInstance): string {
    return nomAffiche(instance, this.langue);
  }

  nomEspece(species: SpeciesId): string {
    return SPECIES[species].nom[this.langue];
  }

  nomAttaque(move: MoveId): string {
    return MOVES[move].nom[this.langue];
  }

  nomObjet(item: ItemId): string {
    return ITEMS[item].nom[this.langue];
  }

  nomTalent(talent: TalentId): string {
    return TALENTS[talent].nom[this.langue];
  }

  nomType(type: ElementType): string {
    return TYPE_NAMES[type][this.langue];
  }

  nomStatCourt(stat: StatKey): string {
    return STAT_NAMES[stat].court;
  }

  /**
   * Ce que fait une attaque, en une phrase — ou `null` si elle se contente de frapper.
   *
   * Une attaque de statut ne s'annonçait que par le mot « Statut » : le joueur voyait
   * qu'Onde de Choc ne fait aucun dégât sans jamais apprendre qu'elle paralyse à coup
   * sûr, et lançait Repli sans savoir qu'il vaut la moitié d'une Défense en plus.
   * `move.effet` vivait dans les données depuis toujours, sans un seul lecteur.
   *
   * Les pourcentages viennent de `stageMultiplier`, la formule qu'applique réellement le
   * moteur — pas d'un tableau recopié à la main qui mentirait au premier rééquilibrage.
   */
  effetAttaque(move: Move): string | null {
    const effet = move.effet;
    if (!effet) return null;

    switch (effet.kind) {
      case 'statut':
        return this.avecChance(this.t('effet.statut', { statut: STATUS_NAMES[effet.statut][this.langue] }), effet.chance);
      case 'stat': {
        const hausse = effet.etages > 0;
        const cle = effet.cible === 'soi'
          ? (hausse ? 'effet.soiHausse' : 'effet.soiBaisse')
          : (hausse ? 'effet.cibleHausse' : 'effet.cibleBaisse');
        return this.avecChance(
          this.t(cle, { stat: STAT_NAMES[effet.stat][this.langue], pourcent: ecartEnPourcent(effet.etages) }),
          effet.chance,
        );
      }
      case 'coupsMultiples':
        return this.t('effet.coupsMultiples', { min: effet.min, max: effet.max });
      case 'recul':
        return this.t('effet.recul', { pourcent: Math.round(effet.fraction * 100) });
      case 'soin':
        return this.t(effet.guerit ? 'effet.soinGuerit' : 'effet.soin', {
          pourcent: Math.round(effet.fraction * 100),
        });
      case 'drain':
        return this.t('effet.drain', { pourcent: Math.round(effet.fraction * 100) });
      case 'critique':
        return this.t('effet.critique');
    }
  }

  /** Un effet certain se dit sans probabilité : « Inflige Paralysie », pas « … (100 %) ». */
  private avecChance(effet: string, chance: number): string {
    if (chance >= 1) return effet;
    return this.t('effet.chance', { effet, chance: Math.round(chance * 100) });
  }

  // ── Sauvegarde automatique ─────────────────────────────────────────────────

  /**
   * Le document de la partie courante, ou `null` si elle n'est pas enregistrable.
   *
   * Une partie sans créature ne repasse pas la validation au chargement — « l'équipe est
   * vide ». L'écrire effacerait la précédente et rendrait « Continuer » inutilisable. Le
   * cas se produit vraiment : entre le choix de la seed et celui du starter, l'état est
   * une partie neuve à équipe vide, et fermer l'onglet là détruisait l'ancienne.
   */
  documentDePartie(): SaveFile | null {
    if (this.state.equipe.length === 0) return null;
    // Toute la pile est consultée, pas seulement son sommet : un écran ouvert par-dessus
    // un combat — l'encyclopédie, par exemple — le laisse plus bas dans la pile, et c'est
    // lui qui a quelque chose à déposer.
    for (const scene of this.pile) scene.avantSauvegarde?.(this);
    return exporterPartie(this.state, new Date().toISOString());
  }

  /** Enregistre la partie dans le navigateur. Silencieux : le jeu continue sans. */
  sauvegarderLocalement(): boolean {
    const document = this.documentDePartie();
    if (!document) return false;
    return this.ecrire(document);
  }

  /**
   * Écriture périodique, appelée à chaque trame du monde parcouru.
   *
   * Sans elle, traverser une grande région ne déclenche aucun point de sauvegarde : ni
   * changement de région, ni ramassage, ni combat. Position, horloge et temps de jeu ne
   * vivaient alors qu'en mémoire.
   */
  sauvegarderSiModifie(deltaMs: number): boolean {
    this.depuisDerniereEcriture += deltaMs;
    if (this.depuisDerniereEcriture < INTERVALLE_SAUVEGARDE_MS) return false;
    this.depuisDerniereEcriture = 0;

    const document = this.documentDePartie();
    if (!document || empreinte(document) === this.derniereEmpreinte) return false;
    return this.ecrire(document);
  }

  /**
   * Écrit, et prévient une fois si le navigateur refuse.
   *
   * Le refus était muet partout sauf sur l'entrée « Enregistrer maintenant » du menu :
   * dix-huit autres appels jetaient le booléen. En navigation privée, on jouait une heure
   * sans le moindre signe avant de tout perdre. L'avertissement ne sort qu'une fois — le
   * répéter toutes les dix secondes rendrait le jeu inutilisable.
   */
  private ecrire(document: SaveFile): boolean {
    if (!enregistrerLocalement(document)) {
      if (!this.echecEcritureSignale) {
        this.echecEcritureSignale = true;
        this.dialogue.dire(this.t('sauvegarde.impossible'));
      }
      return false;
    }
    this.echecEcritureSignale = false;
    this.derniereEmpreinte = empreinte(document);
    this.depuisDerniereEcriture = 0;
    return true;
  }
}
