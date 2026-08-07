/**
 * Objets.
 *
 * Chaque objet déclare un `effet` que le moteur applique ; aucun objet n'a de code
 * propre. Les objets clés (`kind: 'cle'`) n'ont pas d'effet en combat : ils débloquent
 * des situations dans le monde, et ne peuvent être ni vendus ni jetés.
 */

import type { StatusId } from './stats.ts';

export type ItemEffect =
  /** Rend des points de vie. */
  | { readonly kind: 'soin'; readonly montant: number }
  /** Guérit une altération précise, ou toutes. */
  | { readonly kind: 'guerison'; readonly statut: StatusId | 'tout' }
  /** Sert à capturer : multiplie les chances. */
  | { readonly kind: 'capture'; readonly bonus: number }
  /** Précipite une évolution que la créature aurait fini par atteindre. */
  | { readonly kind: 'evolution' }
  /** Objet clé : aucun effet direct. */
  | { readonly kind: 'cle' };

export interface Item {
  readonly id: ItemId;
  readonly nom: { readonly fr: string; readonly en: string };
  readonly description: { readonly fr: string; readonly en: string };
  readonly effet: ItemEffect;
  /** Prix d'achat en pièces ; `0` si l'objet ne se vend pas. */
  readonly prix: number;
  /** Utilisable hors combat (soins), en combat, ou les deux. */
  readonly usage: 'combat' | 'monde' | 'partout';
}

export const ITEM_IDS = [
  'potion',
  'superPotion',
  'panacee',
  'antidote',
  'reveil',
  'prisme',
  'prismeAncre',
  'prismeRoyal',
  'baie',
  'pierreEvolution',
  'carte',
  'canne',
] as const;

export type ItemId = (typeof ITEM_IDS)[number];

const DEFINITIONS: Record<ItemId, Omit<Item, 'id'>> = {
  potion: {
    nom: { fr: 'Potion', en: 'Potion' },
    description: { fr: 'Rend 20 points de vie.', en: 'Restores 20 HP.' },
    effet: { kind: 'soin', montant: 20 },
    prix: 200,
    usage: 'partout',
  },
  superPotion: {
    nom: { fr: 'Super Potion', en: 'Super Potion' },
    description: { fr: 'Rend 60 points de vie.', en: 'Restores 60 HP.' },
    effet: { kind: 'soin', montant: 60 },
    prix: 600,
    usage: 'partout',
  },
  baie: {
    nom: { fr: 'Baie Douce', en: 'Sweet Berry' },
    description: { fr: 'Rend 12 points de vie. Pousse un peu partout.', en: 'Restores 12 HP. Grows everywhere.' },
    effet: { kind: 'soin', montant: 12 },
    prix: 60,
    usage: 'partout',
  },
  panacee: {
    nom: { fr: 'Panacée', en: 'Panacea' },
    description: { fr: 'Dissipe toutes les altérations d’état.', en: 'Cures every status condition.' },
    effet: { kind: 'guerison', statut: 'tout' },
    prix: 500,
    usage: 'partout',
  },
  antidote: {
    nom: { fr: 'Antidote', en: 'Antidote' },
    description: { fr: 'Dissipe le poison.', en: 'Cures poison.' },
    effet: { kind: 'guerison', statut: 'poison' },
    prix: 150,
    usage: 'partout',
  },
  reveil: {
    nom: { fr: 'Réveil', en: 'Rouser' },
    description: { fr: 'Tire une créature du sommeil.', en: 'Wakes a sleeping creature.' },
    effet: { kind: 'guerison', statut: 'sommeil' },
    prix: 150,
    usage: 'partout',
  },
  prisme: {
    nom: { fr: 'Prisme', en: 'Prism' },
    description: {
      fr: 'Cristal creux qui scelle une créature affaiblie.',
      en: 'A hollow crystal that seals a weakened creature.',
    },
    effet: { kind: 'capture', bonus: 1 },
    prix: 200,
    usage: 'combat',
  },
  prismeAncre: {
    nom: { fr: 'Prisme Ancré', en: 'Anchor Prism' },
    description: { fr: 'Un prisme dont les facettes retiennent mieux.', en: 'A prism whose facets hold better.' },
    effet: { kind: 'capture', bonus: 1.5 },
    prix: 600,
    usage: 'combat',
  },
  prismeRoyal: {
    nom: { fr: 'Prisme Royal', en: 'Royal Prism' },
    description: { fr: 'Taillé d’une seule pièce. Ne laisse presque rien s’échapper.', en: 'Cut whole. Almost nothing escapes.' },
    effet: { kind: 'capture', bonus: 2.5 },
    prix: 1200,
    usage: 'combat',
  },
  pierreEvolution: {
    nom: { fr: 'Pierre d’Éveil', en: 'Waking Stone' },
    description: { fr: 'Précipite une évolution déjà proche.', en: 'Hastens an evolution already close.' },
    effet: { kind: 'evolution' },
    prix: 0,
    usage: 'monde',
  },
  carte: {
    nom: { fr: 'Carte de Terravia', en: 'Map of Terravia' },
    description: { fr: 'Montre les régions traversées.', en: 'Shows the regions you have crossed.' },
    effet: { kind: 'cle' },
    prix: 0,
    usage: 'monde',
  },
  canne: {
    nom: { fr: 'Canne Usée', en: 'Worn Rod' },
    description: { fr: 'Permet de pêcher au bord de l’eau.', en: 'Lets you fish at the water’s edge.' },
    effet: { kind: 'cle' },
    prix: 0,
    usage: 'monde',
  },
};

export const ITEMS: Record<ItemId, Item> = Object.fromEntries(
  ITEM_IDS.map((id) => [id, { id, ...DEFINITIONS[id] }]),
) as Record<ItemId, Item>;

export function getItem(id: ItemId): Item {
  return ITEMS[id];
}

/** Ce que la boutique du village propose, dans l'ordre d'affichage. */
export const SHOP_STOCK = [
  'prisme',
  'prismeAncre',
  'potion',
  'superPotion',
  'antidote',
  'reveil',
  'panacee',
] as const satisfies readonly ItemId[];

export function isKeyItem(id: ItemId): boolean {
  return ITEMS[id].effet.kind === 'cle';
}
