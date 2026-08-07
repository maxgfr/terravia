/**
 * Les attaques.
 *
 * Une attaque est une donnée, pas du code : le moteur lit `effet` et applique une règle
 * générique. Ajouter une attaque ne demande donc jamais de toucher au moteur de combat,
 * tant qu'elle réutilise une famille d'effet existante.
 *
 * Précision : `0` signifie « ne peut pas rater », pas « rate toujours ». Trois attaques
 * l'utilisent, et c'est leur intérêt principal.
 */

import type { ElementType } from './types.ts';
import type { BattleStat, StatusId } from './stats.ts';

export type MoveCategory = 'physique' | 'special' | 'statut';

export type MoveEffect =
  /** Inflige une altération d'état avec une probabilité donnée. */
  | { readonly kind: 'statut'; readonly statut: StatusId; readonly chance: number }
  /** Modifie les étages d'une statistique, sur soi ou sur l'adversaire. */
  | {
      readonly kind: 'stat';
      readonly cible: 'soi' | 'adversaire';
      readonly stat: BattleStat;
      readonly etages: number;
      readonly chance: number;
    }
  /** Frappe plusieurs fois dans le même tour. */
  | { readonly kind: 'coupsMultiples'; readonly min: number; readonly max: number }
  /** L'attaquant subit une fraction des dégâts infligés. */
  | { readonly kind: 'recul'; readonly fraction: number }
  /** Rend une fraction des PV maximum de l'attaquant. */
  | { readonly kind: 'soin'; readonly fraction: number; readonly guerit?: boolean }
  /** L'attaquant récupère une fraction des dégâts infligés. */
  | { readonly kind: 'drain'; readonly fraction: number }
  /** Taux de coup critique augmenté. */
  | { readonly kind: 'critique' };

export interface Move {
  readonly id: MoveId;
  readonly nom: { readonly fr: string; readonly en: string };
  readonly type: ElementType;
  readonly categorie: MoveCategory;
  /** Puissance de base ; `0` pour une attaque de statut. */
  readonly puissance: number;
  /** Précision sur 100 ; `0` pour une attaque qui ne peut pas rater. */
  readonly precision: number;
  readonly pp: number;
  /** Priorité : les valeurs hautes frappent en premier, quelle que soit la vitesse. */
  readonly priorite: number;
  readonly effet?: MoveEffect;
  readonly description: { readonly fr: string; readonly en: string };
}

type MoveDefinition = Omit<Move, 'id'>;

const DEFINITIONS = {
  // ── Neutre ─────────────────────────────────────────────────────────────────
  ruade: {
    nom: { fr: 'Ruade', en: 'Buck' },
    type: 'neutre',
    categorie: 'physique',
    puissance: 40,
    precision: 100,
    pp: 35,
    priorite: 0,
    description: { fr: 'Une charge simple, épaule en avant.', en: 'A plain shoulder charge.' },
  },
  chargeLourde: {
    nom: { fr: 'Charge Lourde', en: 'Heavy Charge' },
    type: 'neutre',
    categorie: 'physique',
    puissance: 78,
    precision: 95,
    pp: 20,
    priorite: 0,
    description: { fr: 'Tout le poids du corps dans un seul élan.', en: 'The whole body thrown forward.' },
  },
  elanTemeraire: {
    nom: { fr: 'Élan Téméraire', en: 'Reckless Rush' },
    type: 'neutre',
    categorie: 'physique',
    puissance: 100,
    precision: 90,
    pp: 10,
    priorite: 0,
    effet: { kind: 'recul', fraction: 0.25 },
    description: {
      fr: 'Un assaut sans retenue. Le lanceur encaisse un quart des dégâts.',
      en: 'An all-out rush. The user takes a quarter of the damage dealt.',
    },
  },
  pisteRapide: {
    nom: { fr: 'Piste Rapide', en: 'Quick Dash' },
    type: 'neutre',
    categorie: 'physique',
    puissance: 40,
    precision: 100,
    pp: 30,
    priorite: 1,
    description: { fr: 'Frappe avant l’adversaire, quelle que soit sa vitesse.', en: 'Always strikes first.' },
  },
  cri: {
    nom: { fr: 'Cri Perçant', en: 'Shrill Cry' },
    type: 'neutre',
    categorie: 'statut',
    puissance: 0,
    precision: 100,
    pp: 40,
    priorite: 0,
    effet: { kind: 'stat', cible: 'adversaire', stat: 'attaque', etages: -1, chance: 100 },
    description: { fr: 'Un cri qui fait reculer l’adversaire. Baisse son Attaque.', en: 'Lowers the target’s Attack.' },
  },
  repli: {
    nom: { fr: 'Repli', en: 'Hunker' },
    type: 'neutre',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 40,
    priorite: 0,
    effet: { kind: 'stat', cible: 'soi', stat: 'defense', etages: 1, chance: 100 },
    description: { fr: 'Le lanceur se ramasse sur lui-même. Augmente sa Défense.', en: 'Raises the user’s Defense.' },
  },
  reposReparateur: {
    nom: { fr: 'Repos Réparateur', en: 'Mending Rest' },
    type: 'neutre',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 10,
    priorite: 0,
    effet: { kind: 'soin', fraction: 0.5 },
    description: { fr: 'Rend la moitié des points de vie maximum.', en: 'Restores half of max HP.' },
  },

  // ── Flamme ─────────────────────────────────────────────────────────────────
  braise: {
    nom: { fr: 'Braise', en: 'Ember' },
    type: 'flamme',
    categorie: 'special',
    puissance: 40,
    precision: 100,
    pp: 25,
    priorite: 0,
    effet: { kind: 'statut', statut: 'brulure', chance: 10 },
    description: { fr: 'Projette une gerbe d’étincelles.', en: 'Flings a spray of sparks.' },
  },
  griffeArdente: {
    nom: { fr: 'Griffe Ardente', en: 'Searing Claw' },
    type: 'flamme',
    categorie: 'physique',
    puissance: 72,
    precision: 100,
    pp: 15,
    priorite: 0,
    effet: { kind: 'statut', statut: 'brulure', chance: 10 },
    description: { fr: 'Des griffes chauffées à blanc.', en: 'Claws heated white-hot.' },
  },
  lanceFlamme: {
    nom: { fr: 'Lance-Flamme', en: 'Flamethrower' },
    type: 'flamme',
    categorie: 'special',
    puissance: 88,
    precision: 95,
    pp: 15,
    priorite: 0,
    effet: { kind: 'statut', statut: 'brulure', chance: 10 },
    description: { fr: 'Un jet de feu continu.', en: 'A sustained jet of fire.' },
  },
  explosionSolaire: {
    nom: { fr: 'Explosion Solaire', en: 'Solar Burst' },
    type: 'flamme',
    categorie: 'special',
    puissance: 115,
    precision: 85,
    pp: 5,
    priorite: 0,
    effet: { kind: 'statut', statut: 'brulure', chance: 20 },
    description: { fr: 'Libère d’un coup toute la chaleur accumulée.', en: 'Releases all stored heat at once.' },
  },
  voileDeCendres: {
    nom: { fr: 'Voile de Cendres', en: 'Ash Veil' },
    type: 'flamme',
    categorie: 'statut',
    puissance: 0,
    precision: 100,
    pp: 20,
    priorite: 0,
    effet: { kind: 'stat', cible: 'adversaire', stat: 'attaqueSpe', etages: -1, chance: 100 },
    description: { fr: 'Un nuage de cendres brouille la vue.', en: 'Ash clouds the target’s sight.' },
  },

  // ── Onde ───────────────────────────────────────────────────────────────────
  jetDEau: {
    nom: { fr: 'Jet d’Eau', en: 'Water Jet' },
    type: 'onde',
    categorie: 'special',
    puissance: 40,
    precision: 100,
    pp: 25,
    priorite: 0,
    description: { fr: 'Un filet d’eau sous pression.', en: 'A thin, high-pressure stream.' },
  },
  coupDeNageoire: {
    nom: { fr: 'Coup de Nageoire', en: 'Fin Slap' },
    type: 'onde',
    categorie: 'physique',
    puissance: 68,
    precision: 100,
    pp: 20,
    priorite: 0,
    description: { fr: 'Une gifle sèche du plat de la nageoire.', en: 'A sharp slap with a broad fin.' },
  },
  torrent: {
    nom: { fr: 'Torrent', en: 'Torrent' },
    type: 'onde',
    categorie: 'special',
    puissance: 88,
    precision: 95,
    pp: 15,
    priorite: 0,
    description: { fr: 'Une trombe d’eau qui emporte tout.', en: 'A surge that sweeps everything away.' },
  },
  deferlante: {
    nom: { fr: 'Déferlante', en: 'Breaker' },
    type: 'onde',
    categorie: 'special',
    puissance: 115,
    precision: 85,
    pp: 5,
    priorite: 0,
    description: { fr: 'Une vague qui s’écroule sur la cible.', en: 'A wave that collapses onto the target.' },
  },
  brumeProtectrice: {
    nom: { fr: 'Brume Protectrice', en: 'Shrouding Mist' },
    type: 'onde',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 20,
    priorite: 0,
    effet: { kind: 'stat', cible: 'soi', stat: 'defenseSpe', etages: 2, chance: 100 },
    description: { fr: 'Une brume dense absorbe les attaques spéciales.', en: 'Dense mist absorbs special attacks.' },
  },

  // ── Sylve ──────────────────────────────────────────────────────────────────
  fouetLiane: {
    nom: { fr: 'Fouet-Liane', en: 'Vine Lash' },
    type: 'sylve',
    categorie: 'physique',
    puissance: 45,
    precision: 100,
    pp: 25,
    priorite: 0,
    description: { fr: 'Une liane claque comme une lanière.', en: 'A vine cracks like a whip.' },
  },
  lameFeuille: {
    nom: { fr: 'Lame-Feuille', en: 'Leaf Blade' },
    type: 'sylve',
    categorie: 'physique',
    puissance: 75,
    precision: 95,
    pp: 15,
    priorite: 0,
    effet: { kind: 'critique' },
    description: { fr: 'Une feuille affûtée. Fait souvent mouche.', en: 'A honed leaf. Crits often.' },
  },
  siphonVital: {
    nom: { fr: 'Siphon Vital', en: 'Vital Siphon' },
    type: 'sylve',
    categorie: 'special',
    puissance: 62,
    precision: 100,
    pp: 15,
    priorite: 0,
    effet: { kind: 'drain', fraction: 0.5 },
    description: { fr: 'Aspire la vitalité de la cible. Rend la moitié des dégâts.', en: 'Drains half the damage as HP.' },
  },
  sporesEngourdissantes: {
    nom: { fr: 'Spores Engourdissantes', en: 'Numbing Spores' },
    type: 'sylve',
    categorie: 'statut',
    puissance: 0,
    precision: 75,
    pp: 20,
    priorite: 0,
    effet: { kind: 'statut', statut: 'paralysie', chance: 100 },
    description: { fr: 'Un nuage de spores qui engourdit les muscles.', en: 'Spores that stiffen the muscles.' },
  },
  croissance: {
    nom: { fr: 'Croissance', en: 'Growth' },
    type: 'sylve',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 20,
    priorite: 0,
    effet: { kind: 'stat', cible: 'soi', stat: 'attaqueSpe', etages: 2, chance: 100 },
    description: { fr: 'Le corps se développe d’un coup.', en: 'The body surges with growth.' },
  },

  // ── Foudre ─────────────────────────────────────────────────────────────────
  etincelle: {
    nom: { fr: 'Étincelle', en: 'Spark' },
    type: 'foudre',
    categorie: 'special',
    puissance: 40,
    precision: 100,
    pp: 25,
    priorite: 0,
    effet: { kind: 'statut', statut: 'paralysie', chance: 10 },
    description: { fr: 'Une décharge courte et sèche.', en: 'A short, dry discharge.' },
  },
  crocElectrique: {
    nom: { fr: 'Croc Électrique', en: 'Volt Fang' },
    type: 'foudre',
    categorie: 'physique',
    puissance: 68,
    precision: 95,
    pp: 15,
    priorite: 0,
    effet: { kind: 'statut', statut: 'paralysie', chance: 20 },
    description: { fr: 'Une morsure chargée d’électricité.', en: 'A bite crackling with charge.' },
  },
  arcElectrique: {
    nom: { fr: 'Arc Électrique', en: 'Arc Bolt' },
    type: 'foudre',
    categorie: 'special',
    puissance: 88,
    precision: 95,
    pp: 15,
    priorite: 0,
    effet: { kind: 'statut', statut: 'paralysie', chance: 10 },
    description: { fr: 'Un arc qui saute d’un point à l’autre.', en: 'An arc that leaps between points.' },
  },
  fulguration: {
    nom: { fr: 'Fulguration', en: 'Fulguration' },
    type: 'foudre',
    categorie: 'special',
    puissance: 115,
    precision: 80,
    pp: 5,
    priorite: 0,
    effet: { kind: 'statut', statut: 'paralysie', chance: 20 },
    description: { fr: 'La foudre tombe droit sur la cible.', en: 'Lightning falls straight down.' },
  },
  ondeDeChoc: {
    nom: { fr: 'Onde de Choc', en: 'Shock Wave' },
    type: 'foudre',
    categorie: 'statut',
    puissance: 0,
    precision: 90,
    pp: 20,
    priorite: 0,
    effet: { kind: 'statut', statut: 'paralysie', chance: 100 },
    description: { fr: 'Une onde qui bloque les nerfs.', en: 'A wave that locks up the nerves.' },
  },

  // ── Givre ──────────────────────────────────────────────────────────────────
  souffleGlace: {
    nom: { fr: 'Souffle de Glace', en: 'Ice Breath' },
    type: 'givre',
    categorie: 'special',
    puissance: 55,
    precision: 100,
    pp: 20,
    priorite: 0,
    effet: { kind: 'statut', statut: 'gel', chance: 10 },
    description: { fr: 'Un souffle qui givre tout sur son passage.', en: 'A breath that frosts everything.' },
  },
  eclatGivre: {
    nom: { fr: 'Éclat de Givre', en: 'Frost Shard' },
    type: 'givre',
    categorie: 'physique',
    puissance: 70,
    precision: 100,
    pp: 15,
    priorite: 0,
    effet: { kind: 'stat', cible: 'adversaire', stat: 'vitesse', etages: -1, chance: 30 },
    description: { fr: 'Des éclats de glace qui ralentissent la cible.', en: 'Ice shards that slow the target.' },
  },
  blizzard: {
    nom: { fr: 'Blizzard', en: 'Blizzard' },
    type: 'givre',
    categorie: 'special',
    puissance: 108,
    precision: 80,
    pp: 5,
    priorite: 0,
    effet: { kind: 'statut', statut: 'gel', chance: 15 },
    description: { fr: 'Une tempête de neige aveuglante.', en: 'A blinding snowstorm.' },
  },
  armureDeGel: {
    nom: { fr: 'Armure de Gel', en: 'Frost Armor' },
    type: 'givre',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 20,
    priorite: 0,
    effet: { kind: 'stat', cible: 'soi', stat: 'defense', etages: 2, chance: 100 },
    description: { fr: 'Une carapace de glace se forme sur le corps.', en: 'A shell of ice forms over the body.' },
  },

  // ── Roche ──────────────────────────────────────────────────────────────────
  jetDePierres: {
    nom: { fr: 'Jet de Pierres', en: 'Stone Throw' },
    type: 'roche',
    categorie: 'physique',
    puissance: 50,
    precision: 90,
    pp: 20,
    priorite: 0,
    description: { fr: 'Projette une pierre bien choisie.', en: 'Hurls a well-chosen stone.' },
  },
  rafaleDeCailloux: {
    nom: { fr: 'Rafale de Cailloux', en: 'Pebble Volley' },
    type: 'roche',
    categorie: 'physique',
    puissance: 22,
    precision: 90,
    pp: 20,
    priorite: 0,
    effet: { kind: 'coupsMultiples', min: 2, max: 5 },
    description: { fr: 'Frappe de deux à cinq fois d’affilée.', en: 'Strikes two to five times.' },
  },
  eboulement: {
    nom: { fr: 'Éboulement', en: 'Rockfall' },
    type: 'roche',
    categorie: 'physique',
    puissance: 88,
    precision: 85,
    pp: 10,
    priorite: 0,
    description: { fr: 'Fait s’effondrer un pan entier de roche.', en: 'Brings down a slab of rock.' },
  },
  seisme: {
    nom: { fr: 'Séisme', en: 'Quake' },
    type: 'roche',
    categorie: 'physique',
    puissance: 105,
    precision: 90,
    pp: 8,
    priorite: 0,
    description: { fr: 'Le sol se déchire sous la cible.', en: 'The ground splits beneath the target.' },
  },
  carapaceDePierre: {
    nom: { fr: 'Carapace de Pierre', en: 'Stone Shell' },
    type: 'roche',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 20,
    priorite: 0,
    effet: { kind: 'stat', cible: 'soi', stat: 'defense', etages: 2, chance: 100 },
    description: { fr: 'La peau se couvre de plaques minérales.', en: 'Mineral plates cover the skin.' },
  },

  // ── Métal ──────────────────────────────────────────────────────────────────
  lameDAcier: {
    nom: { fr: 'Lame d’Acier', en: 'Steel Edge' },
    type: 'metal',
    categorie: 'physique',
    puissance: 72,
    precision: 100,
    pp: 20,
    priorite: 0,
    description: { fr: 'Un tranchant net et froid.', en: 'A clean, cold edge.' },
  },
  poingDeFer: {
    nom: { fr: 'Poing de Fer', en: 'Iron Fist' },
    type: 'metal',
    categorie: 'physique',
    puissance: 95,
    precision: 90,
    pp: 10,
    priorite: 0,
    description: { fr: 'Un coup lourd, porté de tout le bras.', en: 'A heavy blow from the whole arm.' },
  },
  aiguisage: {
    nom: { fr: 'Aiguisage', en: 'Whetting' },
    type: 'metal',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 20,
    priorite: 0,
    effet: { kind: 'stat', cible: 'soi', stat: 'attaque', etages: 2, chance: 100 },
    description: { fr: 'Le lanceur affûte ses arêtes.', en: 'The user hones its edges.' },
  },

  // ── Vent ───────────────────────────────────────────────────────────────────
  bourrasque: {
    nom: { fr: 'Bourrasque', en: 'Gust' },
    type: 'vent',
    categorie: 'special',
    puissance: 55,
    precision: 100,
    pp: 25,
    priorite: 0,
    description: { fr: 'Une rafale sèche et soudaine.', en: 'A sudden, dry blast.' },
  },
  piqueAerienne: {
    nom: { fr: 'Pique Aérienne', en: 'Air Lance' },
    type: 'vent',
    categorie: 'physique',
    puissance: 62,
    precision: 0,
    pp: 20,
    priorite: 0,
    description: { fr: 'Un piqué si rapide qu’il ne peut pas rater.', en: 'A dive too fast to miss.' },
  },
  tempete: {
    nom: { fr: 'Tempête', en: 'Tempest' },
    type: 'vent',
    categorie: 'special',
    puissance: 98,
    precision: 85,
    pp: 10,
    priorite: 0,
    effet: { kind: 'stat', cible: 'adversaire', stat: 'vitesse', etages: -1, chance: 40 },
    description: { fr: 'Des vents contraires clouent la cible au sol.', en: 'Crosswinds pin the target down.' },
  },

  // ── Ombre ──────────────────────────────────────────────────────────────────
  griffeSpectrale: {
    nom: { fr: 'Griffe Spectrale', en: 'Spectral Claw' },
    type: 'ombre',
    categorie: 'physique',
    puissance: 72,
    precision: 100,
    pp: 15,
    priorite: 0,
    effet: { kind: 'critique' },
    description: { fr: 'Une griffe qui traverse la matière.', en: 'A claw that passes through matter.' },
  },
  emprisePenombre: {
    nom: { fr: 'Emprise de Pénombre', en: 'Gloomgrip' },
    type: 'ombre',
    categorie: 'special',
    puissance: 92,
    precision: 90,
    pp: 10,
    priorite: 0,
    effet: { kind: 'statut', statut: 'sommeil', chance: 15 },
    description: { fr: 'L’ombre s’enroule autour de la cible.', en: 'Shadow coils around the target.' },
  },
  voileNoir: {
    nom: { fr: 'Voile Noir', en: 'Black Veil' },
    type: 'ombre',
    categorie: 'statut',
    puissance: 0,
    precision: 100,
    pp: 15,
    priorite: 0,
    effet: { kind: 'stat', cible: 'adversaire', stat: 'attaqueSpe', etages: -2, chance: 100 },
    description: { fr: 'Une obscurité qui étouffe la volonté.', en: 'A darkness that smothers will.' },
  },

  // ── Lumière ────────────────────────────────────────────────────────────────
  rayonPur: {
    nom: { fr: 'Rayon Pur', en: 'Pure Ray' },
    type: 'lumiere',
    categorie: 'special',
    puissance: 65,
    precision: 100,
    pp: 20,
    priorite: 0,
    description: { fr: 'Un trait de lumière parfaitement droit.', en: 'A perfectly straight beam.' },
  },
  eclatSolaire: {
    nom: { fr: 'Éclat Solaire', en: 'Sunflare' },
    type: 'lumiere',
    categorie: 'special',
    puissance: 105,
    precision: 85,
    pp: 8,
    priorite: 0,
    effet: { kind: 'stat', cible: 'adversaire', stat: 'defenseSpe', etages: -1, chance: 30 },
    description: { fr: 'Une lumière aveuglante qui brûle les défenses.', en: 'A blinding light that burns defenses.' },
  },
  benediction: {
    nom: { fr: 'Bénédiction', en: 'Blessing' },
    type: 'lumiere',
    categorie: 'statut',
    puissance: 0,
    precision: 0,
    pp: 8,
    priorite: 0,
    effet: { kind: 'soin', fraction: 0.5, guerit: true },
    description: {
      fr: 'Rend la moitié des points de vie et dissipe les altérations.',
      en: 'Restores half of max HP and cures status.',
    },
  },

  // ── Toxine ─────────────────────────────────────────────────────────────────
  crachatAcide: {
    nom: { fr: 'Crachat Acide', en: 'Acid Spit' },
    type: 'toxine',
    categorie: 'special',
    puissance: 45,
    precision: 100,
    pp: 25,
    priorite: 0,
    effet: { kind: 'statut', statut: 'poison', chance: 20 },
    description: { fr: 'Un jet corrosif.', en: 'A corrosive spray.' },
  },
  dardVenimeux: {
    nom: { fr: 'Dard Venimeux', en: 'Venom Barb' },
    type: 'toxine',
    categorie: 'physique',
    puissance: 62,
    precision: 100,
    pp: 20,
    priorite: 0,
    effet: { kind: 'statut', statut: 'poison', chance: 30 },
    description: { fr: 'Un dard qui injecte son venin.', en: 'A barb that injects venom.' },
  },
  corrosion: {
    nom: { fr: 'Corrosion', en: 'Corrosion' },
    type: 'toxine',
    categorie: 'special',
    puissance: 88,
    precision: 90,
    pp: 10,
    priorite: 0,
    effet: { kind: 'stat', cible: 'adversaire', stat: 'defense', etages: -1, chance: 30 },
    description: { fr: 'Ronge la carapace autant que la chair.', en: 'Eats through shell as well as flesh.' },
  },
  brumeToxique: {
    nom: { fr: 'Brume Toxique', en: 'Toxic Haze' },
    type: 'toxine',
    categorie: 'statut',
    puissance: 0,
    precision: 90,
    pp: 15,
    priorite: 0,
    effet: { kind: 'statut', statut: 'poison', chance: 100 },
    description: { fr: 'Un nuage lourd qui empoisonne à coup sûr.', en: 'A heavy cloud that surely poisons.' },
  },
} as const satisfies Record<string, MoveDefinition>;

export type MoveId = keyof typeof DEFINITIONS;

export const MOVE_IDS = Object.keys(DEFINITIONS) as MoveId[];

export const MOVES: Record<MoveId, Move> = Object.fromEntries(
  MOVE_IDS.map((id) => [id, { id, ...DEFINITIONS[id] }]),
) as Record<MoveId, Move>;

export function getMove(id: MoveId): Move {
  return MOVES[id];
}

/** Vrai si l'attaque inflige des dégâts (par opposition à une attaque de statut). */
export function isDamaging(move: Move): boolean {
  return move.categorie !== 'statut' && move.puissance > 0;
}
