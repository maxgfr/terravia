/**
 * Le bestiaire : 40 espèces originales en 17 lignées.
 *
 * Chaque espèce déclare tout ce qui la définit, y compris son **apparence** — silhouette
 * et attributs. Le générateur de sprites lit ce champ : il ne devine pas à quoi ressemble
 * une créature, il l'assemble à partir d'un vocabulaire de formes. Ajouter une espèce ici
 * suffit donc à lui donner un sprite, une place dans le Terradex et des rencontres.
 *
 * Budget de statistiques, tenu volontairement serré :
 *   premier stade ~310 · deuxième ~410-460 · troisième ~530 · uniques ~575
 */

import type { Biome, TimeSlot } from './biomes.ts';
import type { MoveId } from './moves.ts';
import type { GrowthRate, StatBlock } from './stats.ts';
import type { TalentId } from './talents.ts';
import type { ElementType } from './types.ts';

/** Formes de base du générateur de sprites. */
export const SILHOUETTES = [
  'quadrupede',
  'bipede',
  'felin',
  'serpentin',
  'aile',
  'blob',
  'mineral',
  'insecte',
  'aquatique',
  'spectre',
] as const;
export type Silhouette = (typeof SILHOUETTES)[number];

/** Attributs ajoutés à la silhouette. Ils se cumulent. */
export const TRAITS = [
  'oreilles',
  'cornes',
  'queue',
  'ailes',
  'nageoires',
  'crete',
  'carapace',
  'aura',
  'crocs',
  'antennes',
  'gemme',
] as const;
export type Trait = (typeof TRAITS)[number];

export interface Apparence {
  readonly silhouette: Silhouette;
  readonly traits: readonly Trait[];
  readonly gabarit: 'petit' | 'moyen' | 'grand';
}

/**
 * L'ordre du Terradex, déclaré explicitement.
 *
 * Il serait tentant de le déduire des clés du catalogue plus bas, mais une espèce
 * référence son évolution par identifiant : le type se définirait alors à partir d'une
 * table qui dépend de lui. La liste explicite rompt le cycle, et se lit d'un coup d'œil.
 */
export const SPECIES_IDS = [
  'folianz',
  'frondanz',
  'sylvanor',
  'braisou',
  'flamboux',
  'pyrogarde',
  'gouttin',
  'ondulin',
  'maregrand',
  'plumelle',
  'zephyrion',
  'galetin',
  'menhirok',
  'luciolin',
  'fulguline',
  'givrelin',
  'borealix',
  'larvenin',
  'dardyle',
  'ferraillon',
  'acierac',
  'spectrin',
  'noctombre',
  'mulotin',
  'chatoyan',
  'bulbrume',
  'pyrite',
  'ecorcin',
  'solarion',
  'nyxaris',
  // ── Lignée de rivière : ce qu'on remonte au bout d'une ligne ────────────────
  'vairelin',
  'harponaz',
  'abyssarque',
  // ── Nocturnes de lande et de ruines ─────────────────────────────────────────
  'lueuvre',
  'falenoire',
  // ── Fond des grottes ────────────────────────────────────────────────────────
  'cavernin',
  'troglodon',
  // ── Prairie et hauteurs ─────────────────────────────────────────────────────
  'cabrilion',
  'alpirok',
  // ── Unique du sanctuaire ────────────────────────────────────────────────────
  'chronaris',
] as const;

export type SpeciesId = (typeof SPECIES_IDS)[number];

export interface LearnEntry {
  readonly niveau: number;
  readonly move: MoveId;
}

export interface Species {
  readonly id: SpeciesId;
  /** Numéro au Terradex, dans l'ordre de déclaration. */
  readonly numero: number;
  readonly nom: { readonly fr: string; readonly en: string };
  readonly types: readonly [ElementType] | readonly [ElementType, ElementType];
  readonly base: StatBlock;
  /** De 3 (presque incapturable) à 255 (trivial). */
  readonly tauxCapture: number;
  readonly gainXp: number;
  readonly croissance: GrowthRate;
  readonly apprentissage: readonly LearnEntry[];
  readonly evolution?: { readonly vers: SpeciesId; readonly niveau: number };
  readonly talents: readonly [TalentId, TalentId];
  readonly habitats: readonly Biome[];
  readonly creneau: TimeSlot;
  readonly taille: number;
  readonly poids: number;
  readonly apparence: Apparence;
  readonly description: { readonly fr: string; readonly en: string };
}

type SpeciesDefinition = Omit<Species, 'id' | 'numero'>;

function stats(pv: number, attaque: number, defense: number, attaqueSpe: number, defenseSpe: number, vitesse: number): StatBlock {
  return { pv, attaque, defense, attaqueSpe, defenseSpe, vitesse };
}

const DEFINITIONS: Record<SpeciesId, SpeciesDefinition> = {
  // ── Lignée Sylve (départ) ──────────────────────────────────────────────────
  folianz: {
    nom: { fr: 'Folianz', en: 'Sproutle' },
    types: ['sylve'],
    base: stats(45, 49, 49, 65, 65, 45),
    tauxCapture: 45,
    gainXp: 64,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'fouetLiane' },
      { niveau: 7, move: 'croissance' },
      { niveau: 10, move: 'siphonVital' },
      { niveau: 15, move: 'lameFeuille' },
      { niveau: 21, move: 'sporesEngourdissantes' },
      { niveau: 27, move: 'reposReparateur' },
    ],
    evolution: { vers: 'frondanz', niveau: 16 },
    talents: ['seve', 'regeneration'],
    habitats: ['prairie', 'foret'],
    creneau: 'toujours',
    taille: 0.6,
    poids: 7.5,
    apparence: { silhouette: 'quadrupede', traits: ['crete', 'queue'], gabarit: 'petit' },
    description: {
      fr: 'La crête de feuilles sur son dos s’oriente vers la lumière, même les yeux fermés.',
      en: 'The leafy crest on its back turns toward light, even with its eyes shut.',
    },
  },
  frondanz: {
    nom: { fr: 'Frondanz', en: 'Frondel' },
    types: ['sylve'],
    base: stats(60, 62, 63, 80, 80, 60),
    tauxCapture: 45,
    gainXp: 142,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'fouetLiane' },
      { niveau: 1, move: 'croissance' },
      { niveau: 12, move: 'siphonVital' },
      { niveau: 18, move: 'lameFeuille' },
      { niveau: 25, move: 'sporesEngourdissantes' },
      { niveau: 32, move: 'reposReparateur' },
      { niveau: 38, move: 'seisme' },
    ],
    evolution: { vers: 'sylvanor', niveau: 32 },
    talents: ['seve', 'regeneration'],
    habitats: ['foret'],
    creneau: 'toujours',
    taille: 1.1,
    poids: 28,
    apparence: { silhouette: 'quadrupede', traits: ['crete', 'queue', 'cornes'], gabarit: 'moyen' },
    description: {
      fr: 'Ses frondaisons filtrent l’air. Là où il dort, la brume se dissipe au matin.',
      en: 'Its fronds filter the air. Where it sleeps, morning mist clears early.',
    },
  },
  sylvanor: {
    nom: { fr: 'Sylvanor', en: 'Sylvanor' },
    types: ['sylve', 'lumiere'],
    base: stats(80, 82, 83, 100, 100, 80),
    tauxCapture: 45,
    gainXp: 236,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'lameFeuille' },
      { niveau: 1, move: 'croissance' },
      { niveau: 1, move: 'siphonVital' },
      { niveau: 34, move: 'rayonPur' },
      { niveau: 42, move: 'benediction' },
      { niveau: 50, move: 'eclatSolaire' },
    ],
    talents: ['seve', 'voileLumineux'],
    habitats: ['foret'],
    creneau: 'toujours',
    taille: 2.2,
    poids: 145,
    apparence: { silhouette: 'quadrupede', traits: ['crete', 'cornes', 'aura', 'queue'], gabarit: 'grand' },
    description: {
      fr: 'On raconte qu’une clairière où Sylvanor s’est reposé ne connaît plus l’hiver.',
      en: 'A glade where a Sylvanor has rested is said to never know winter again.',
    },
  },

  // ── Lignée Flamme (départ) ─────────────────────────────────────────────────
  braisou: {
    nom: { fr: 'Braisou', en: 'Emberkit' },
    types: ['flamme'],
    base: stats(39, 52, 43, 60, 50, 65),
    tauxCapture: 45,
    gainXp: 62,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'braise' },
      { niveau: 8, move: 'cri' },
      { niveau: 13, move: 'griffeArdente' },
      { niveau: 19, move: 'voileDeCendres' },
      { niveau: 26, move: 'lanceFlamme' },
      { niveau: 33, move: 'elanTemeraire' },
    ],
    evolution: { vers: 'flamboux', niveau: 16 },
    talents: ['braise', 'sangFroid'],
    habitats: ['prairie', 'montagne'],
    creneau: 'toujours',
    taille: 0.5,
    poids: 8.2,
    apparence: { silhouette: 'felin', traits: ['oreilles', 'queue'], gabarit: 'petit' },
    description: {
      fr: 'Sa fourrure reste tiède des heures après qu’il s’est endormi.',
      en: 'Its fur stays warm for hours after it falls asleep.',
    },
  },
  flamboux: {
    nom: { fr: 'Flamboux', en: 'Blazemane' },
    types: ['flamme'],
    base: stats(58, 64, 58, 80, 65, 80),
    tauxCapture: 45,
    gainXp: 142,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'braise' },
      { niveau: 1, move: 'griffeArdente' },
      { niveau: 15, move: 'voileDeCendres' },
      { niveau: 22, move: 'lanceFlamme' },
      { niveau: 30, move: 'elanTemeraire' },
      { niveau: 38, move: 'jetDePierres' },
    ],
    evolution: { vers: 'pyrogarde', niveau: 34 },
    talents: ['braise', 'intimidation'],
    habitats: ['montagne', 'lande'],
    creneau: 'toujours',
    taille: 1.2,
    poids: 39,
    apparence: { silhouette: 'felin', traits: ['oreilles', 'queue', 'crete', 'crocs'], gabarit: 'moyen' },
    description: {
      fr: 'Sa crinière change de couleur avec son humeur. Le blanc annonce la charge.',
      en: 'Its mane shifts color with its mood. White means it is about to charge.',
    },
  },
  pyrogarde: {
    nom: { fr: 'Pyrogarde', en: 'Pyrewarden' },
    types: ['flamme', 'roche'],
    base: stats(78, 84, 78, 109, 85, 100),
    tauxCapture: 45,
    gainXp: 240,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'lanceFlamme' },
      { niveau: 1, move: 'griffeArdente' },
      { niveau: 1, move: 'jetDePierres' },
      { niveau: 36, move: 'eboulement' },
      { niveau: 44, move: 'explosionSolaire' },
      { niveau: 52, move: 'seisme' },
    ],
    talents: ['braise', 'blindage'],
    habitats: ['montagne'],
    creneau: 'toujours',
    taille: 1.9,
    poids: 168,
    apparence: { silhouette: 'bipede', traits: ['cornes', 'crete', 'crocs', 'carapace'], gabarit: 'grand' },
    description: {
      fr: 'Les plaques de son dos sont de la roche refroidie. Elles se fendent quand il se met en colère.',
      en: 'The plates on its back are cooled stone. They split open when it grows angry.',
    },
  },

  // ── Lignée Onde (départ) ───────────────────────────────────────────────────
  gouttin: {
    nom: { fr: 'Gouttin', en: 'Dropling' },
    types: ['onde'],
    base: stats(44, 48, 65, 50, 64, 43),
    tauxCapture: 45,
    gainXp: 63,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'jetDEau' },
      { niveau: 8, move: 'repli' },
      { niveau: 14, move: 'coupDeNageoire' },
      { niveau: 20, move: 'brumeProtectrice' },
      { niveau: 27, move: 'torrent' },
      { niveau: 34, move: 'souffleGlace' },
    ],
    evolution: { vers: 'ondulin', niveau: 16 },
    talents: ['ressac', 'blindage'],
    habitats: ['riviere', 'prairie'],
    creneau: 'toujours',
    taille: 0.5,
    poids: 9.5,
    apparence: { silhouette: 'aquatique', traits: ['nageoires', 'carapace'], gabarit: 'petit' },
    description: {
      fr: 'Il retient l’eau dans sa carapace et la relâche goutte à goutte pendant la sécheresse.',
      en: 'It stores water in its shell and releases it drop by drop through droughts.',
    },
  },
  ondulin: {
    nom: { fr: 'Ondulin', en: 'Rippline' },
    types: ['onde'],
    base: stats(59, 63, 80, 65, 80, 58),
    tauxCapture: 45,
    gainXp: 142,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'jetDEau' },
      { niveau: 1, move: 'repli' },
      { niveau: 17, move: 'coupDeNageoire' },
      { niveau: 24, move: 'brumeProtectrice' },
      { niveau: 31, move: 'torrent' },
      { niveau: 39, move: 'souffleGlace' },
    ],
    evolution: { vers: 'maregrand', niveau: 34 },
    talents: ['ressac', 'blindage'],
    habitats: ['riviere'],
    creneau: 'toujours',
    taille: 1,
    poids: 32,
    apparence: { silhouette: 'aquatique', traits: ['nageoires', 'carapace', 'crete'], gabarit: 'moyen' },
    description: {
      fr: 'Il remonte les rivières à contre-courant sans jamais paraître forcer.',
      en: 'It swims upstream against the current without ever seeming to strain.',
    },
  },
  maregrand: {
    nom: { fr: 'Marégrand', en: 'Tidewarden' },
    types: ['onde', 'givre'],
    base: stats(79, 83, 100, 85, 105, 78),
    tauxCapture: 45,
    gainXp: 239,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'torrent' },
      { niveau: 1, move: 'coupDeNageoire' },
      { niveau: 1, move: 'brumeProtectrice' },
      { niveau: 36, move: 'eclatGivre' },
      { niveau: 45, move: 'deferlante' },
      { niveau: 53, move: 'blizzard' },
    ],
    talents: ['ressac', 'fourrureEpaisse'],
    habitats: ['riviere'],
    creneau: 'toujours',
    taille: 2,
    poids: 190,
    apparence: { silhouette: 'aquatique', traits: ['nageoires', 'carapace', 'cornes', 'aura'], gabarit: 'grand' },
    description: {
      fr: 'Là où il passe, l’eau devient si claire qu’on voit le fond des gorges.',
      en: 'Where it passes, the water turns clear enough to see the bottom of gorges.',
    },
  },

  // ── Lignée Vent ────────────────────────────────────────────────────────────
  plumelle: {
    nom: { fr: 'Plumelle', en: 'Fluffle' },
    types: ['vent'],
    base: stats(40, 45, 40, 35, 35, 56),
    tauxCapture: 220,
    gainXp: 50,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 4, move: 'cri' },
      { niveau: 9, move: 'bourrasque' },
      { niveau: 15, move: 'pisteRapide' },
      { niveau: 22, move: 'piqueAerienne' },
      { niveau: 29, move: 'tempete' },
    ],
    evolution: { vers: 'zephyrion', niveau: 18 },
    talents: ['vivacite', 'oeilAiguise'],
    habitats: ['prairie', 'lande'],
    creneau: 'jour',
    taille: 0.3,
    poids: 1.8,
    apparence: { silhouette: 'aile', traits: ['ailes', 'queue'], gabarit: 'petit' },
    description: {
      fr: 'Trop léger pour se poser par grand vent, il dort accroché sous les feuilles.',
      en: 'Too light to land in strong wind, it sleeps clinging beneath leaves.',
    },
  },
  zephyrion: {
    nom: { fr: 'Zéphyrion', en: 'Zephyrion' },
    types: ['vent', 'neutre'],
    base: stats(63, 80, 65, 55, 60, 101),
    tauxCapture: 90,
    gainXp: 159,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'bourrasque' },
      { niveau: 1, move: 'pisteRapide' },
      { niveau: 20, move: 'piqueAerienne' },
      { niveau: 28, move: 'tempete' },
      { niveau: 36, move: 'elanTemeraire' },
    ],
    talents: ['vivacite', 'intimidation'],
    habitats: ['prairie', 'lande', 'montagne'],
    creneau: 'jour',
    taille: 1.1,
    poids: 22,
    apparence: { silhouette: 'aile', traits: ['ailes', 'queue', 'crete', 'crocs'], gabarit: 'moyen' },
    description: {
      fr: 'Il devance les orages. Les bergers le suivent des yeux pour rentrer à temps.',
      en: 'It outruns storms. Shepherds watch it to know when to head home.',
    },
  },

  // ── Lignée Roche ───────────────────────────────────────────────────────────
  galetin: {
    nom: { fr: 'Galetin', en: 'Pebblet' },
    types: ['roche'],
    base: stats(50, 60, 85, 30, 40, 25),
    tauxCapture: 200,
    gainXp: 54,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'repli' },
      { niveau: 8, move: 'jetDePierres' },
      { niveau: 14, move: 'carapaceDePierre' },
      { niveau: 21, move: 'rafaleDeCailloux' },
      { niveau: 30, move: 'eboulement' },
    ],
    evolution: { vers: 'menhirok', niveau: 25 },
    talents: ['blindage', 'fourrureEpaisse'],
    habitats: ['montagne', 'grotte'],
    creneau: 'toujours',
    taille: 0.4,
    poids: 28,
    apparence: { silhouette: 'mineral', traits: ['carapace'], gabarit: 'petit' },
    description: {
      fr: 'Immobile, il est indiscernable d’un caillou. Beaucoup s’en aperçoivent en trébuchant.',
      en: 'Motionless, it is indistinguishable from a rock. Most find out by tripping.',
    },
  },
  menhirok: {
    nom: { fr: 'Menhirok', en: 'Menhirock' },
    types: ['roche'],
    base: stats(85, 100, 130, 40, 60, 35),
    tauxCapture: 75,
    gainXp: 165,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'jetDePierres' },
      { niveau: 1, move: 'carapaceDePierre' },
      { niveau: 26, move: 'rafaleDeCailloux' },
      { niveau: 34, move: 'eboulement' },
      { niveau: 43, move: 'seisme' },
    ],
    talents: ['blindage', 'fourrureEpaisse'],
    habitats: ['montagne', 'grotte'],
    creneau: 'toujours',
    taille: 1.6,
    poids: 310,
    apparence: { silhouette: 'mineral', traits: ['carapace', 'cornes', 'gemme'], gabarit: 'grand' },
    description: {
      fr: 'On l’a longtemps pris pour une pierre levée. Certaines l’ont été, avant lui.',
      en: 'It was long mistaken for a standing stone. Some standing stones were, once.',
    },
  },

  // ── Lignée Foudre ──────────────────────────────────────────────────────────
  luciolin: {
    nom: { fr: 'Luciolin', en: 'Glimwick' },
    types: ['foudre'],
    base: stats(42, 40, 38, 65, 50, 70),
    tauxCapture: 190,
    gainXp: 56,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'etincelle' },
      { niveau: 9, move: 'ondeDeChoc' },
      { niveau: 16, move: 'crocElectrique' },
      { niveau: 24, move: 'arcElectrique' },
      { niveau: 32, move: 'fulguration' },
    ],
    evolution: { vers: 'fulguline', niveau: 22 },
    talents: ['statique', 'paratonnerre'],
    habitats: ['foret', 'prairie'],
    creneau: 'nuit',
    taille: 0.3,
    poids: 2.4,
    apparence: { silhouette: 'insecte', traits: ['antennes', 'ailes', 'aura'], gabarit: 'petit' },
    description: {
      fr: 'Sa lueur pulse au rythme de son souffle. Les nuits d’orage, elle devient continue.',
      en: 'Its glow pulses with its breathing. On stormy nights it turns steady.',
    },
  },
  fulguline: {
    nom: { fr: 'Fulguline', en: 'Fulgurine' },
    types: ['foudre'],
    base: stats(62, 55, 55, 100, 75, 105),
    tauxCapture: 75,
    gainXp: 168,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'etincelle' },
      { niveau: 1, move: 'ondeDeChoc' },
      { niveau: 26, move: 'arcElectrique' },
      { niveau: 34, move: 'tempete' },
      { niveau: 42, move: 'fulguration' },
    ],
    talents: ['statique', 'paratonnerre'],
    habitats: ['foret', 'lande'],
    creneau: 'nuit',
    taille: 0.9,
    poids: 15,
    apparence: { silhouette: 'insecte', traits: ['antennes', 'ailes', 'aura', 'crete'], gabarit: 'moyen' },
    description: {
      fr: 'Un essaim de Fulguline éclaire une clairière entière. On évite de les déranger.',
      en: 'A swarm of Fulgurine lights a whole glade. Best not to disturb them.',
    },
  },

  // ── Lignée Givre ───────────────────────────────────────────────────────────
  givrelin: {
    nom: { fr: 'Givrelin', en: 'Frostkin' },
    types: ['givre'],
    base: stats(50, 45, 55, 62, 60, 40),
    tauxCapture: 190,
    gainXp: 58,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'souffleGlace' },
      { niveau: 10, move: 'armureDeGel' },
      { niveau: 17, move: 'eclatGivre' },
      { niveau: 26, move: 'bourrasque' },
      { niveau: 35, move: 'blizzard' },
    ],
    evolution: { vers: 'borealix', niveau: 24 },
    talents: ['fourrureEpaisse', 'sangFroid'],
    habitats: ['montagne', 'lande'],
    creneau: 'nuit',
    taille: 0.6,
    poids: 12,
    apparence: { silhouette: 'quadrupede', traits: ['oreilles', 'queue', 'gemme'], gabarit: 'petit' },
    description: {
      fr: 'Il souffle sur ses pattes pour les réchauffer. Ce souffle gèle tout le reste.',
      en: 'It breathes on its paws to warm them. That breath freezes everything else.',
    },
  },
  borealix: {
    nom: { fr: 'Boréalix', en: 'Borealix' },
    types: ['givre', 'vent'],
    base: stats(70, 60, 75, 100, 90, 65),
    tauxCapture: 70,
    gainXp: 172,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'souffleGlace' },
      { niveau: 1, move: 'armureDeGel' },
      { niveau: 28, move: 'eclatGivre' },
      { niveau: 36, move: 'tempete' },
      { niveau: 45, move: 'blizzard' },
    ],
    talents: ['fourrureEpaisse', 'voileLumineux'],
    habitats: ['montagne'],
    creneau: 'nuit',
    taille: 1.4,
    poids: 48,
    apparence: { silhouette: 'quadrupede', traits: ['oreilles', 'queue', 'aura', 'cornes'], gabarit: 'moyen' },
    description: {
      fr: 'Les traînées de lumière qu’il laisse dans le ciel d’hiver ont donné son nom au nord.',
      en: 'The light trails it leaves in winter skies gave the north its name.',
    },
  },

  // ── Lignée Toxine ──────────────────────────────────────────────────────────
  larvenin: {
    nom: { fr: 'Larvenin', en: 'Venomite' },
    types: ['toxine'],
    base: stats(45, 50, 45, 40, 40, 35),
    tauxCapture: 255,
    gainXp: 42,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'crachatAcide' },
      { niveau: 9, move: 'brumeToxique' },
      { niveau: 15, move: 'dardVenimeux' },
      { niveau: 24, move: 'corrosion' },
    ],
    evolution: { vers: 'dardyle', niveau: 20 },
    talents: ['epinesToxiques', 'venimeux'],
    habitats: ['foret', 'riviere'],
    creneau: 'toujours',
    taille: 0.3,
    poids: 3.2,
    apparence: { silhouette: 'serpentin', traits: ['antennes', 'crocs'], gabarit: 'petit' },
    description: {
      fr: 'Il mâche les feuilles amères que rien d’autre ne touche, et en tire son venin.',
      en: 'It chews the bitter leaves nothing else will touch, and makes venom from them.',
    },
  },
  dardyle: {
    nom: { fr: 'Dardyle', en: 'Dartyle' },
    types: ['toxine', 'vent'],
    base: stats(65, 90, 60, 55, 60, 95),
    tauxCapture: 90,
    gainXp: 158,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'dardVenimeux' },
      { niveau: 1, move: 'crachatAcide' },
      { niveau: 22, move: 'piqueAerienne' },
      { niveau: 30, move: 'corrosion' },
      { niveau: 38, move: 'tempete' },
    ],
    talents: ['epinesToxiques', 'oeilAiguise'],
    habitats: ['foret', 'lande'],
    creneau: 'toujours',
    taille: 1,
    poids: 18,
    apparence: { silhouette: 'insecte', traits: ['ailes', 'antennes', 'crocs', 'crete'], gabarit: 'moyen' },
    description: {
      fr: 'Son vol est silencieux jusqu’au dernier mètre. Après, il est trop tard.',
      en: 'Its flight is silent until the last metre. After that, it is too late.',
    },
  },

  // ── Lignée Métal ───────────────────────────────────────────────────────────
  ferraillon: {
    nom: { fr: 'Ferraillon', en: 'Scrapling' },
    types: ['metal'],
    base: stats(45, 65, 80, 30, 45, 30),
    tauxCapture: 180,
    gainXp: 57,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'repli' },
      { niveau: 10, move: 'lameDAcier' },
      { niveau: 18, move: 'aiguisage' },
      { niveau: 27, move: 'poingDeFer' },
      { niveau: 35, move: 'eboulement' },
    ],
    evolution: { vers: 'acierac', niveau: 28 },
    talents: ['blindage', 'trancheFine'],
    habitats: ['ruines', 'grotte'],
    creneau: 'toujours',
    taille: 0.5,
    poids: 42,
    apparence: { silhouette: 'mineral', traits: ['carapace', 'crete'], gabarit: 'petit' },
    description: {
      fr: 'Il agrège le métal qu’il trouve. Deux Ferraillon d’une même ruine se ressemblent.',
      en: 'It accretes any metal it finds. Two from the same ruin look alike.',
    },
  },
  acierac: {
    nom: { fr: 'Acierac', en: 'Steelrach' },
    types: ['metal'],
    base: stats(70, 105, 120, 45, 70, 45),
    tauxCapture: 60,
    gainXp: 176,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'lameDAcier' },
      { niveau: 1, move: 'aiguisage' },
      { niveau: 30, move: 'poingDeFer' },
      { niveau: 39, move: 'eboulement' },
      { niveau: 48, move: 'seisme' },
    ],
    talents: ['blindage', 'trancheFine'],
    habitats: ['ruines'],
    creneau: 'toujours',
    taille: 1.7,
    poids: 280,
    apparence: { silhouette: 'bipede', traits: ['carapace', 'crete', 'cornes', 'gemme'], gabarit: 'grand' },
    description: {
      fr: 'Ses articulations grincent. Il ne cherche pas à le cacher : ça fait fuir avant le combat.',
      en: 'Its joints grind. It makes no effort to hide it — the sound ends most fights early.',
    },
  },

  // ── Lignée Ombre ───────────────────────────────────────────────────────────
  spectrin: {
    nom: { fr: 'Spectrin', en: 'Wispkin' },
    types: ['ombre'],
    base: stats(40, 35, 35, 70, 55, 60),
    tauxCapture: 190,
    gainXp: 59,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'cri' },
      { niveau: 1, move: 'griffeSpectrale' },
      { niveau: 11, move: 'voileNoir' },
      { niveau: 19, move: 'emprisePenombre' },
      { niveau: 28, move: 'reposReparateur' },
    ],
    evolution: { vers: 'noctombre', niveau: 27 },
    talents: ['voileLumineux', 'regeneration'],
    habitats: ['ruines', 'grotte'],
    creneau: 'nuit',
    taille: 0.7,
    poids: 1.2,
    apparence: { silhouette: 'spectre', traits: ['aura', 'queue'], gabarit: 'petit' },
    description: {
      fr: 'Il n’a pas d’ombre à lui. Il emprunte celle des autres, poliment.',
      en: 'It casts no shadow of its own. It borrows other people’s, politely.',
    },
  },
  noctombre: {
    nom: { fr: 'Noctombre', en: 'Nocturne' },
    types: ['ombre'],
    base: stats(60, 50, 55, 110, 85, 95),
    tauxCapture: 65,
    gainXp: 174,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'griffeSpectrale' },
      { niveau: 1, move: 'voileNoir' },
      { niveau: 30, move: 'emprisePenombre' },
      { niveau: 40, move: 'reposReparateur' },
    ],
    talents: ['voileLumineux', 'intimidation'],
    habitats: ['ruines'],
    creneau: 'nuit',
    taille: 1.5,
    poids: 4,
    apparence: { silhouette: 'spectre', traits: ['aura', 'queue', 'cornes', 'crocs'], gabarit: 'grand' },
    description: {
      fr: 'Les lampes s’éteignent une à une sur son passage, sans qu’un souffle les touche.',
      en: 'Lamps go out one by one as it passes, with no breath to touch them.',
    },
  },

  // ── Espèces solitaires ─────────────────────────────────────────────────────
  mulotin: {
    nom: { fr: 'Mulotin', en: 'Fieldmun' },
    types: ['neutre'],
    base: stats(60, 70, 60, 40, 50, 75),
    tauxCapture: 235,
    gainXp: 64,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 5, move: 'cri' },
      { niveau: 11, move: 'pisteRapide' },
      { niveau: 18, move: 'chargeLourde' },
      { niveau: 26, move: 'elanTemeraire' },
    ],
    talents: ['vivacite', 'oeilAiguise'],
    habitats: ['prairie', 'lande'],
    creneau: 'toujours',
    taille: 0.4,
    poids: 6.8,
    apparence: { silhouette: 'quadrupede', traits: ['oreilles', 'queue', 'crocs'], gabarit: 'petit' },
    description: {
      fr: 'La créature la plus commune de Terravia, et la première que tout dresseur sous-estime.',
      en: 'The commonest creature in Terravia, and the first every trainer underestimates.',
    },
  },
  chatoyan: {
    nom: { fr: 'Chatoyan', en: 'Lumicat' },
    types: ['lumiere'],
    base: stats(65, 60, 60, 95, 85, 85),
    tauxCapture: 60,
    gainXp: 165,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'rayonPur' },
      { niveau: 1, move: 'cri' },
      { niveau: 16, move: 'benediction' },
      { niveau: 25, move: 'voileDeCendres' },
      { niveau: 36, move: 'eclatSolaire' },
    ],
    talents: ['voileLumineux', 'oeilAiguise'],
    habitats: ['prairie', 'ruines'],
    creneau: 'jour',
    taille: 0.8,
    poids: 14,
    apparence: { silhouette: 'felin', traits: ['oreilles', 'queue', 'aura', 'gemme'], gabarit: 'moyen' },
    description: {
      fr: 'Sa fourrure renvoie la lumière du jour longtemps après le coucher du soleil.',
      en: 'Its fur gives back the day’s light long after sunset.',
    },
  },
  bulbrume: {
    nom: { fr: 'Bulbrume', en: 'Mirebulb' },
    types: ['onde', 'toxine'],
    base: stats(85, 55, 75, 80, 80, 40),
    tauxCapture: 85,
    gainXp: 152,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'jetDEau' },
      { niveau: 1, move: 'crachatAcide' },
      { niveau: 14, move: 'brumeToxique' },
      { niveau: 23, move: 'brumeProtectrice' },
      { niveau: 33, move: 'corrosion' },
      { niveau: 41, move: 'deferlante' },
    ],
    talents: ['venimeux', 'regeneration'],
    habitats: ['riviere'],
    creneau: 'toujours',
    taille: 1.2,
    poids: 62,
    apparence: { silhouette: 'blob', traits: ['aura', 'antennes'], gabarit: 'moyen' },
    description: {
      fr: 'Il filtre les eaux stagnantes. Ce qu’il en retire, il le garde pour ses ennemis.',
      en: 'It filters stagnant water. What it strains out, it saves for its enemies.',
    },
  },
  pyrite: {
    nom: { fr: 'Pyrite', en: 'Pyrite' },
    types: ['metal', 'roche'],
    base: stats(70, 95, 105, 50, 65, 40),
    tauxCapture: 70,
    gainXp: 160,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'jetDePierres' },
      { niveau: 1, move: 'lameDAcier' },
      { niveau: 18, move: 'carapaceDePierre' },
      { niveau: 28, move: 'poingDeFer' },
      { niveau: 38, move: 'seisme' },
    ],
    talents: ['blindage', 'trancheFine'],
    habitats: ['montagne', 'grotte'],
    creneau: 'toujours',
    taille: 1.3,
    poids: 240,
    apparence: { silhouette: 'mineral', traits: ['carapace', 'gemme', 'crete'], gabarit: 'moyen' },
    description: {
      fr: 'Ses facettes dorées ont ruiné plus d’un prospecteur pressé.',
      en: 'Its golden facets have ruined more than one hasty prospector.',
    },
  },
  ecorcin: {
    nom: { fr: 'Écorcin', en: 'Barkin' },
    types: ['sylve', 'roche'],
    base: stats(80, 85, 95, 50, 70, 35),
    tauxCapture: 90,
    gainXp: 155,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'fouetLiane' },
      { niveau: 1, move: 'repli' },
      { niveau: 16, move: 'jetDePierres' },
      { niveau: 25, move: 'lameFeuille' },
      { niveau: 34, move: 'carapaceDePierre' },
      { niveau: 43, move: 'seisme' },
    ],
    talents: ['seve', 'blindage'],
    habitats: ['foret'],
    creneau: 'toujours',
    taille: 1.5,
    poids: 130,
    apparence: { silhouette: 'bipede', traits: ['carapace', 'crete', 'cornes'], gabarit: 'grand' },
    description: {
      fr: 'Son écorce porte les cicatrices de chaque hiver. On peut le dater comme un arbre.',
      en: 'Its bark carries the scar of every winter. You can date it like a tree.',
    },
  },

  // ── Créatures uniques ──────────────────────────────────────────────────────
  solarion: {
    nom: { fr: 'Solarion', en: 'Solarion' },
    types: ['lumiere', 'flamme'],
    base: stats(90, 90, 85, 120, 95, 95),
    tauxCapture: 3,
    gainXp: 300,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'rayonPur' },
      { niveau: 1, move: 'lanceFlamme' },
      { niveau: 1, move: 'benediction' },
      { niveau: 45, move: 'eclatSolaire' },
      { niveau: 55, move: 'explosionSolaire' },
    ],
    talents: ['voileLumineux', 'braise'],
    habitats: ['ruines'],
    creneau: 'jour',
    taille: 2.4,
    poids: 210,
    apparence: { silhouette: 'aile', traits: ['ailes', 'cornes', 'aura', 'crete', 'gemme'], gabarit: 'grand' },
    description: {
      fr: 'Il ne se montre qu’au zénith, et seulement à qui l’a déjà cherché longtemps.',
      en: 'It appears only at zenith, and only to those who have searched a long while.',
    },
  },
  nyxaris: {
    nom: { fr: 'Nyxaris', en: 'Nyxaris' },
    types: ['ombre', 'givre'],
    base: stats(90, 85, 90, 120, 100, 85),
    tauxCapture: 3,
    gainXp: 300,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'griffeSpectrale' },
      { niveau: 1, move: 'souffleGlace' },
      { niveau: 1, move: 'voileNoir' },
      { niveau: 45, move: 'emprisePenombre' },
      { niveau: 55, move: 'blizzard' },
    ],
    talents: ['intimidation', 'sangFroid'],
    // Les ruines s'ajoutent à la grotte : c'est le biome du sanctuaire, seul endroit où
    // les créatures uniques se laissent croiser. Sans cela, Nyxaris n'existait nulle
    // part dans le jeu et le Terradex ne pouvait pas se terminer.
    habitats: ['grotte', 'ruines'],
    creneau: 'nuit',
    taille: 2.1,
    poids: 88,
    apparence: { silhouette: 'spectre', traits: ['aura', 'cornes', 'crocs', 'ailes', 'gemme'], gabarit: 'grand' },
    description: {
      fr: 'Au fond des grottes, il fait plus froid là où il est passé qu’à l’endroit où il se tient.',
      en: 'Deep in the caves, it is colder where it has been than where it stands.',
    },
  },

  // ── Lignée de rivière ────────────────────────────────────────────────────────
  // La rivière était le biome le plus dépeuplé du jeu, et la pêche n'aurait rien eu à
  // remonter. Cette lignée passe de l'eau pure au métal : c'est elle qu'on accroche au
  // bout d'une ligne, et elle grimpe assez haut pour rester intéressante en fin de partie.
  vairelin: {
    nom: { fr: 'Vairelin', en: 'Minnowin' },
    types: ['onde'],
    base: stats(42, 52, 44, 55, 46, 66),
    tauxCapture: 190,
    gainXp: 58,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'jetDEau' },
      { niveau: 9, move: 'pisteRapide' },
      { niveau: 15, move: 'coupDeNageoire' },
      { niveau: 22, move: 'brumeProtectrice' },
      { niveau: 30, move: 'torrent' },
    ],
    evolution: { vers: 'harponaz', niveau: 18 },
    talents: ['ressac', 'vivacite'],
    habitats: ['riviere'],
    creneau: 'toujours',
    taille: 0.3,
    poids: 2.4,
    apparence: { silhouette: 'aquatique', traits: ['nageoires', 'crete'], gabarit: 'petit' },
    description: {
      fr: 'Il remonte les courants les plus vifs à contre-sens, par simple entêtement.',
      en: 'It swims the swiftest currents the wrong way, out of sheer stubbornness.',
    },
  },
  harponaz: {
    nom: { fr: 'Harponaz', en: 'Harpoonaz' },
    types: ['onde', 'metal'],
    base: stats(58, 78, 62, 68, 58, 84),
    tauxCapture: 70,
    gainXp: 122,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'jetDEau' },
      { niveau: 1, move: 'pisteRapide' },
      { niveau: 20, move: 'lameDAcier' },
      { niveau: 26, move: 'coupDeNageoire' },
      { niveau: 33, move: 'aiguisage' },
      { niveau: 40, move: 'torrent' },
      { niveau: 48, move: 'poingDeFer' },
    ],
    evolution: { vers: 'abyssarque', niveau: 36 },
    talents: ['ressac', 'trancheFine'],
    habitats: ['riviere'],
    creneau: 'toujours',
    taille: 1.1,
    poids: 26,
    apparence: { silhouette: 'aquatique', traits: ['nageoires', 'crete', 'crocs'], gabarit: 'moyen' },
    description: {
      fr: 'Son rostre s’est durci au point de fendre la glace d’un seul élan.',
      en: 'Its rostrum has hardened enough to split ice in a single rush.',
    },
  },
  abyssarque: {
    nom: { fr: 'Abyssarque', en: 'Abyssarch' },
    types: ['onde', 'metal'],
    base: stats(84, 108, 92, 88, 80, 96),
    tauxCapture: 30,
    gainXp: 202,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'torrent' },
      { niveau: 1, move: 'lameDAcier' },
      { niveau: 36, move: 'aiguisage' },
      { niveau: 44, move: 'poingDeFer' },
      { niveau: 52, move: 'deferlante' },
      { niveau: 60, move: 'souffleGlace' },
    ],
    talents: ['ressac', 'blindage'],
    habitats: ['riviere'],
    creneau: 'toujours',
    taille: 2.6,
    poids: 168,
    apparence: {
      silhouette: 'aquatique',
      traits: ['nageoires', 'carapace', 'crocs', 'gemme'],
      gabarit: 'grand',
    },
    description: {
      fr: 'On ne le pêche pas : on le rencontre, et c’est lui qui décide de la suite.',
      en: 'You do not catch it: you meet it, and it decides what happens next.',
    },
  },

  // ── Nocturnes de lande et de ruines ──────────────────────────────────────────
  // Quatre espèces seulement étaient strictement diurnes contre sept nocturnes, mais la
  // lande et les ruines restaient vides une fois la nuit tombée sur ces biomes-là.
  lueuvre: {
    nom: { fr: 'Lueuvre', en: 'Glimmoth' },
    types: ['vent'],
    base: stats(46, 44, 42, 68, 56, 62),
    tauxCapture: 175,
    gainXp: 60,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'bourrasque' },
      { niveau: 10, move: 'cri' },
      { niveau: 17, move: 'sporesEngourdissantes' },
      { niveau: 24, move: 'piqueAerienne' },
      { niveau: 32, move: 'voileNoir' },
    ],
    evolution: { vers: 'falenoire', niveau: 24 },
    talents: ['vivacite', 'voileLumineux'],
    habitats: ['lande', 'ruines'],
    creneau: 'nuit',
    taille: 0.4,
    poids: 1.8,
    apparence: { silhouette: 'insecte', traits: ['ailes', 'antennes', 'aura'], gabarit: 'petit' },
    description: {
      fr: 'Ses ailes gardent la lumière du jour et la rendent lentement toute la nuit.',
      en: 'Its wings hold the daylight and give it back slowly all night long.',
    },
  },
  falenoire: {
    nom: { fr: 'Falenoire', en: 'Duskwing' },
    types: ['vent', 'ombre'],
    base: stats(72, 62, 66, 104, 84, 88),
    tauxCapture: 55,
    gainXp: 168,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'bourrasque' },
      { niveau: 1, move: 'voileNoir' },
      { niveau: 28, move: 'emprisePenombre' },
      { niveau: 36, move: 'tempete' },
      { niveau: 44, move: 'griffeSpectrale' },
      { niveau: 52, move: 'brumeToxique' },
    ],
    talents: ['intimidation', 'voileLumineux'],
    habitats: ['lande', 'ruines'],
    creneau: 'nuit',
    taille: 1.4,
    poids: 21,
    apparence: {
      silhouette: 'insecte',
      traits: ['ailes', 'antennes', 'aura', 'crete'],
      gabarit: 'grand',
    },
    description: {
      fr: 'Elle éteint les lanternes en passant, sans qu’on sache jamais si c’est volontaire.',
      en: 'It snuffs lanterns as it passes, and no one can tell whether it means to.',
    },
  },

  // ── Fond des grottes ─────────────────────────────────────────────────────────
  cavernin: {
    nom: { fr: 'Cavernin', en: 'Delvin' },
    types: ['roche'],
    base: stats(58, 62, 78, 38, 52, 34),
    tauxCapture: 185,
    gainXp: 62,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'jetDePierres' },
      { niveau: 11, move: 'repli' },
      { niveau: 18, move: 'carapaceDePierre' },
      { niveau: 26, move: 'rafaleDeCailloux' },
      { niveau: 34, move: 'eboulement' },
    ],
    evolution: { vers: 'troglodon', niveau: 26 },
    talents: ['fourrureEpaisse', 'blindage'],
    habitats: ['grotte'],
    creneau: 'toujours',
    taille: 0.6,
    poids: 34,
    apparence: { silhouette: 'mineral', traits: ['carapace', 'cornes'], gabarit: 'petit' },
    description: {
      fr: 'Il creuse en avalant la roche et la recrache polie, en petits galets réguliers.',
      en: 'It digs by swallowing rock and spits it back polished, in neat little pebbles.',
    },
  },
  troglodon: {
    nom: { fr: 'Troglodon', en: 'Troglodon' },
    types: ['roche', 'ombre'],
    base: stats(96, 98, 118, 52, 78, 46),
    tauxCapture: 45,
    gainXp: 176,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'jetDePierres' },
      { niveau: 1, move: 'carapaceDePierre' },
      { niveau: 30, move: 'griffeSpectrale' },
      { niveau: 38, move: 'eboulement' },
      { niveau: 46, move: 'emprisePenombre' },
      { niveau: 54, move: 'seisme' },
    ],
    talents: ['blindage', 'intimidation'],
    habitats: ['grotte'],
    creneau: 'nuit',
    taille: 2.2,
    poids: 240,
    apparence: {
      silhouette: 'quadrupede',
      traits: ['carapace', 'cornes', 'crocs', 'gemme'],
      gabarit: 'grand',
    },
    description: {
      fr: 'Aveugle depuis si longtemps qu’il entend la forme des salles avant d’y entrer.',
      en: 'Blind so long that it hears the shape of a chamber before stepping into it.',
    },
  },

  // ── Prairie et hauteurs ──────────────────────────────────────────────────────
  cabrilion: {
    nom: { fr: 'Cabrilion', en: 'Kidling' },
    types: ['neutre'],
    base: stats(54, 64, 52, 40, 48, 68),
    tauxCapture: 200,
    gainXp: 56,
    croissance: 'rapide',
    apprentissage: [
      { niveau: 1, move: 'ruade' },
      { niveau: 1, move: 'cri' },
      { niveau: 8, move: 'pisteRapide' },
      { niveau: 16, move: 'jetDePierres' },
      { niveau: 23, move: 'chargeLourde' },
      { niveau: 31, move: 'rafaleDeCailloux' },
    ],
    evolution: { vers: 'alpirok', niveau: 22 },
    talents: ['vivacite', 'fourrureEpaisse'],
    // La lande en plus de la prairie et de la montagne : en plein jour, elle n'offrait
    // qu'une seule espèce, et une route de lande montrait la même bête sans relâche.
    habitats: ['prairie', 'montagne', 'lande'],
    creneau: 'jour',
    taille: 0.7,
    poids: 18,
    apparence: { silhouette: 'quadrupede', traits: ['cornes', 'queue'], gabarit: 'petit' },
    description: {
      fr: 'Il grimpe les pentes que rien d’autre ne grimpe, et redescend sans jamais glisser.',
      en: 'It climbs slopes nothing else climbs, and comes back down without ever slipping.',
    },
  },
  alpirok: {
    nom: { fr: 'Alpirok', en: 'Alpirok' },
    types: ['roche', 'vent'],
    base: stats(82, 104, 88, 56, 72, 96),
    tauxCapture: 50,
    gainXp: 172,
    croissance: 'moyen',
    apprentissage: [
      { niveau: 1, move: 'chargeLourde' },
      { niveau: 1, move: 'jetDePierres' },
      { niveau: 26, move: 'bourrasque' },
      { niveau: 34, move: 'eboulement' },
      { niveau: 42, move: 'piqueAerienne' },
      { niveau: 50, move: 'seisme' },
    ],
    talents: ['intimidation', 'oeilAiguise'],
    habitats: ['montagne'],
    creneau: 'jour',
    taille: 1.8,
    poids: 155,
    apparence: {
      silhouette: 'quadrupede',
      traits: ['cornes', 'crete', 'carapace', 'queue'],
      gabarit: 'grand',
    },
    description: {
      fr: 'Il charge d’un sommet à l’autre, et le vent qu’il lève arrive avant lui.',
      en: 'It charges from peak to peak, and the wind it raises arrives before it does.',
    },
  },

  // ── Unique du sanctuaire ─────────────────────────────────────────────────────
  chronaris: {
    nom: { fr: 'Chronaris', en: 'Chronaris' },
    types: ['lumiere', 'vent'],
    base: stats(94, 90, 92, 116, 104, 106),
    tauxCapture: 3,
    gainXp: 262,
    croissance: 'lent',
    apprentissage: [
      { niveau: 1, move: 'rayonPur' },
      { niveau: 1, move: 'bourrasque' },
      { niveau: 1, move: 'benediction' },
      { niveau: 50, move: 'eclatSolaire' },
      { niveau: 58, move: 'tempete' },
    ],
    talents: ['voileLumineux', 'regeneration'],
    // Les ruines seulement : c'est le biome du sanctuaire, et il ne se montre nulle part
    // ailleurs. À toute heure, contrairement à ses deux pairs.
    habitats: ['ruines'],
    creneau: 'toujours',
    taille: 3.4,
    poids: 74,
    apparence: {
      silhouette: 'aile',
      traits: ['ailes', 'aura', 'gemme', 'crete'],
      gabarit: 'grand',
    },
    description: {
      fr: 'On dit qu’il tourne au-dessus du sanctuaire depuis avant qu’on lui donne un nom.',
      en: 'They say it has circled the sanctum since before anyone gave it a name.',
    },
  },
};

export const SPECIES: Record<SpeciesId, Species> = Object.fromEntries(
  SPECIES_IDS.map((id, index) => [id, { id, numero: index + 1, ...DEFINITIONS[id] }]),
) as Record<SpeciesId, Species>;

export function getSpecies(id: SpeciesId): Species {
  return SPECIES[id];
}

/**
 * Le trio de secours, quand aucune seed n'a encore été tirée.
 *
 * Les créatures réellement proposées au départ dépendent de la seed — c'est
 * `planifierMonde` qui les choisit, et `World.starters` qui les porte. Cette constante
 * ne sert plus qu'à garantir qu'un trio jouable existe en toute circonstance.
 */
export const STARTER_IDS = ['folianz', 'braisou', 'gouttin'] as const satisfies readonly SpeciesId[];

/** Somme des statistiques de base — sert à jauger l'équilibrage et à trier le Terradex. */
export function baseStatTotal(species: Species): number {
  return Object.values(species.base).reduce((sum, value) => sum + value, 0);
}

/** Les attaques connues à un niveau donné : les quatre dernières apprises. */
export function movesAtLevel(species: Species, level: number): MoveId[] {
  const learned = species.apprentissage
    .filter((entry) => entry.niveau <= level)
    .map((entry) => entry.move);
  // Les doublons sont possibles (une attaque apprise au niveau 1 et rappelée plus tard) :
  // on ne garde que la dernière occurrence, puis les quatre dernières attaques.
  const unique = [...new Set(learned.reverse())].reverse();
  return unique.slice(-4);
}
