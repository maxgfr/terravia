/**
 * Ce qui peuple une région : personnages, dresseurs, objets au sol, services.
 *
 * Chaque entité porte un identifiant stable, construit à partir de l'index de la région
 * et d'un compteur. C'est ce que la sauvegarde retient : « ce dresseur est vaincu »,
 * « cet objet est ramassé ». Un identifiant qui changerait d'une partie à l'autre ferait
 * réapparaître les objets déjà pris.
 */

import type { CharacterId } from './characterIds.ts';
import type { ItemId } from '../data/items.ts';
import type { SpeciesId } from '../data/species.ts';

export interface Position {
  readonly x: number;
  readonly y: number;
}

interface EntiteBase extends Position {
  readonly id: string;
}

export interface Pnj extends EntiteBase {
  readonly kind: 'pnj';
  readonly sprite: CharacterId;
  /** Clé du catalogue de traductions. */
  readonly dialogue: string;
  readonly role?: 'professeur' | 'marchand' | 'soigneuse' | 'villageois';
}

export interface MembreEquipe {
  readonly species: SpeciesId;
  readonly niveau: number;
}

export interface Dresseur extends EntiteBase {
  readonly kind: 'dresseur';
  readonly sprite: CharacterId;
  readonly dialogue: string;
  readonly dialogueVaincu: string;
  readonly equipe: readonly MembreEquipe[];
  /** Pièces gagnées à la victoire. */
  readonly recompense: number;
  /** Le champion d'arène : un seul dans la partie, il clôt l'aventure. */
  readonly champion?: boolean;
  /** Portée de vue en cases : un dresseur repère le joueur qui passe devant lui. */
  readonly vision: number;
  readonly regard: 'nord' | 'sud' | 'est' | 'ouest';
}

export interface ObjetAuSol extends EntiteBase {
  readonly kind: 'objet';
  readonly item: ItemId;
  readonly quantite: number;
}

export interface Service extends EntiteBase {
  readonly kind: 'service';
  readonly service: 'soin' | 'boutique';
  readonly sprite: CharacterId;
  readonly dialogue: string;
}

export interface Panneau extends EntiteBase {
  readonly kind: 'panneau';
  readonly texte: string;
}

export type Entite = Pnj | Dresseur | ObjetAuSol | Service | Panneau;

/** Les entités qui occupent physiquement leur case et bloquent le passage. */
export function bloquePassage(entite: Entite): boolean {
  return entite.kind !== 'objet' && entite.kind !== 'panneau';
}

/** Identifiant stable, dérivé de la région et d'un compteur local. */
export function entiteId(region: number, kind: string, compteur: number): string {
  return `r${region}-${kind}-${compteur}`;
}
