/**
 * Le contexte de jeu : ce que toute scène a sous la main.
 *
 * Il rassemble l'état de la partie, le monde, les entrées, le peintre et la pile de
 * scènes. Les scènes ne se connaissent pas entre elles — elles poussent et retirent des
 * scènes sur cette pile, ce qui rend chaque écran remplaçable isolément.
 */

import { makeRng, type Rng } from '../core/rng.ts';
import type { Entrees } from '../core/input.ts';
import { SPECIES, type SpeciesId } from '../data/species.ts';
import { MOVES, type MoveId } from '../data/moves.ts';
import { ITEMS, type ItemId } from '../data/items.ts';
import { TALENTS, type TalentId } from '../data/talents.ts';
import { TYPE_NAMES, type ElementType } from '../data/types.ts';
import { STAT_NAMES, type StatKey } from '../data/stats.ts';
import { traduire, type CleTexte, type Langue, type Params } from '../i18n/index.ts';
import { BoiteDialogue } from '../ui/dialogue.ts';
import type { Peintre } from '../ui/draw.ts';
import { creerMonde, type World } from '../world/worldgen.ts';
import { nomAffiche, type CreatureInstance } from './creature.ts';
import { exporterPartie } from '../save/serialize.ts';
import { empreinte, enregistrerLocalement } from '../save/storage.ts';
import type { SaveFile } from '../save/format.ts';
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
   * cours, si bien qu'une sauvegarde déclenchée à n'importe quel instant — l'engrenage,
   * la fermeture de l'onglet — le capte tel qu'il est, même sous un autre écran.
   */
  avantSauvegarde?(jeu: Jeu): void;
  /** Une scène opaque dispense de dessiner celles du dessous. */
  readonly opaque?: boolean;
}

/** Intervalle minimal entre deux écritures automatiques, en millisecondes. */
const INTERVALLE_SAUVEGARDE_MS = 10_000;

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

  /**
   * Ouvre les réglages, quel que soit l'écran courant.
   *
   * Appelé par l'engrenage du coin supérieur droit, qui vit dans le DOM et non sur le
   * canvas : il reste donc atteignable même pendant un dialogue. On refuse simplement
   * de l'empiler deux fois.
   */
  ouvrirParametres(fabrique: () => Scene): void {
    if (this.sommet?.nom === 'parametres') return;
    this.pousser(fabrique());
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

  // ── Traduction ─────────────────────────────────────────────────────────────

  get langue(): Langue {
    return this.state.langue;
  }

  t(cle: CleTexte, params?: Params): string {
    return traduire(this.langue, cle, params);
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
    // Toute la pile est consultée, pas seulement son sommet : ouvrir l'engrenage pendant
    // un combat pose les réglages par-dessus lui, et c'est le combat, plus bas, qui a
    // quelque chose à déposer.
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

  private ecrire(document: SaveFile): boolean {
    if (!enregistrerLocalement(document)) return false;
    this.derniereEmpreinte = empreinte(document);
    this.depuisDerniereEcriture = 0;
    return true;
  }
}
