/**
 * Le monde : une suite de régions, tirée d'une seed.
 *
 * Ce n'est **plus une topologie fixe**. La seed décide de la longueur du voyage, de
 * l'ordre des lieux traversés, du nombre d'arènes et de leur spécialité, du biome de
 * chaque région et du trio de créatures proposé au départ. Deux seeds donnent deux
 * aventures, pas deux décors sur le même trajet.
 *
 * Ce qu'elle ne décide **pas**, ce sont les invariants qui rendent une partie jouable :
 * un bourg au départ pour recevoir sa créature et se soigner, un village à mi-chemin
 * pour se ravitailler, des arènes espacées qui jalonnent la montée en niveau, et un
 * sanctuaire au bout. Un monde entièrement aléatoire n'aurait pas pu le promettre.
 *
 * Les régions sont générées **à la demande** et mises en cache : une partie n'a besoin
 * que de la région où se tient le joueur, et une sauvegarde ne contient que la seed.
 */

import { rngFor, seedValue, type Rng } from '../core/rng.ts';
import type { Biome } from '../data/biomes.ts';
import { ELEMENT_TYPES, effectivenessAgainst, type ElementType } from '../data/types.ts';
import { SPECIES, SPECIES_IDS, baseStatTotal, type SpeciesId } from '../data/species.ts';
import {
  ROLES_AVEC_FAUNE_ORDINAIRE,
  biomeAvecEau,
  genererRegion,
  type Region,
  type RegionPlan,
  type RegionRole,
} from './region.ts';
import { especesManquantes, tableRencontre } from './encounters.ts';

/**
 * Bornes de la longueur du parcours, sanctuaire compris.
 *
 * `REGIONS_MAX` sert aussi de plafond à la validation des sauvegardes : un index de
 * région venu d'un fichier est comparé à cette constante, et non à la longueur du monde
 * courant — qui, elle, dépend de la seed.
 */
export const REGIONS_MIN = 8;
export const REGIONS_MAX = 12;

/** Niveau visé au dernier champion. La courbe entière s'y accroche. */
const NIVEAU_FINAL = 32;
const NIVEAU_DEPART = 3;
/** Exposant de la courbe de difficulté. Au-dessus de 1, elle démarre en douceur. */
const COURBE = 1.5;

/**
 * Puissance minimale d'une créature de départ.
 *
 * Le seuil ne juge pas de la rareté mais de la robustesse : Plumelle, avec ses 251 points
 * de base, perdait un combat sur deux au niveau 6 face à une faune qui en compte plus de
 * trois cents. Le désavantage de type se joue, la frêleur pure ne se joue pas.
 */
const PUISSANCE_STARTER_MIN = 300;

/** Biomes possibles par rôle. La seed pioche dedans. */
const BIOMES_PAR_ROLE: Record<RegionRole, readonly Biome[]> = {
  bourg: ['prairie'],
  village: ['prairie', 'lande'],
  route: ['prairie', 'lande', 'riviere', 'montagne', 'foret'],
  bois: ['foret', 'riviere'],
  grotte: ['grotte'],
  arene: ['ruines', 'montagne', 'lande'],
  sanctuaire: ['ruines'],
};

/**
 * Biomes autorisés pour la première région sauvage.
 *
 * Elle sert d'apprentissage, et le joueur y arrive avec une seule créature de niveau 6.
 * Une rivière ou une montagne en ouverture condamnerait un starter sur trois par simple
 * désavantage de type — un choix de départ ne doit pas être un piège.
 */
const BIOMES_DEBUT: readonly Biome[] = ['prairie', 'lande', 'foret'];

/** Rôles sauvages, et leur poids : on croise plus de routes que de grottes. */
const SAUVAGES: ReadonlyArray<{ readonly role: RegionRole; readonly poids: number }> = [
  { role: 'route', poids: 5 },
  { role: 'bois', poids: 3 },
  { role: 'grotte', poids: 2 },
];

/** Qualificatifs de lieu. Le nom d'une région change avec la seed, comme son relief. */
const QUALIFICATIFS = {
  fr: ['des Brumes', 'du Levant', 'aux Ronces', 'des Sources', 'du Vieux Pont', 'des Cendres', 'aux Échos', 'du Couchant'],
  en: ['of Mists', 'of Dawn', 'of Brambles', 'of Springs', 'of the Old Bridge', 'of Ashes', 'of Echoes', 'of Dusk'],
} as const;

const NOMS_ROLE = {
  bourg: { fr: 'Bourg', en: 'Hamlet' },
  route: { fr: 'Route', en: 'Route' },
  bois: { fr: 'Bois', en: 'Woods' },
  village: { fr: 'Village', en: 'Village' },
  grotte: { fr: 'Grotte', en: 'Cavern' },
  arene: { fr: 'Arène', en: 'Arena' },
  sanctuaire: { fr: 'Sanctuaire', en: 'Sanctum' },
} as const satisfies Record<RegionRole, { fr: string; en: string }>;

/**
 * Répartit `total` unités sur `parts` segments, chacun en recevant au moins une.
 * Sert à distribuer les régions sauvages entre les arènes sans en laisser aucune vide.
 */
function repartir(rng: Rng, total: number, parts: number): number[] {
  const tranches = Array.from({ length: parts }, () => 1);
  for (let reste = total - parts; reste > 0; reste--) tranches[rng.int(0, parts - 1)]! += 1;
  return tranches;
}

/** Un rôle sauvage pris dans le vivier, en écartant ceux qu'on refuse ici. */
function tirerSauvage(rng: Rng, exclus: readonly RegionRole[]): RegionRole {
  const permis = SAUVAGES.filter((entree) => !exclus.includes(entree.role));
  return rng.weighted(
    permis.map((entree) => entree.role),
    (role) => permis.find((entree) => entree.role === role)!.poids,
  );
}

/** La suite des rôles, du bourg au sanctuaire. */
function composerRoles(rng: Rng): RegionRole[] {
  const nombreArenes = rng.int(2, 3);
  const longueur = rng.int(REGIONS_MIN, REGIONS_MAX);
  // Fixes : le bourg, le sanctuaire, les arènes et l'unique village imposé. Le « +1 »
  // paie la région supplémentaire réservée juste après au premier segment.
  const sauvages = Math.max(nombreArenes + 1, longueur - 3 - nombreArenes);
  // Deux régions sauvages au moins avant le premier champion : avec une seule, on
  // l'affronte avec l'unique créature reçue au bourg, contre les quatre de son équipe.
  const tranches = repartir(rng, sauvages - 1, nombreArenes);
  tranches[0]! += 1;
  // Le village tombe au début d'un segment, jamais le premier : on ne se ravitaille pas
  // à deux pas du bourg, qui vend déjà.
  const segmentVillage = rng.int(1, nombreArenes - 1);

  const roles: RegionRole[] = ['bourg'];
  for (let segment = 0; segment < nombreArenes; segment++) {
    if (segment === segmentVillage) roles.push('village');
    let precedent: RegionRole | null = null;
    for (let i = 0; i < tranches[segment]!; i++) {
      // Jamais de grotte en ouverture — c'est la région d'apprentissage, et son biome
      // n'a rien d'accueillant — ni deux grottes de suite : on ne traverse pas un monde
      // de tunnels.
      const premiereDuMonde = segment === 0 && i === 0;
      precedent = tirerSauvage(rng, premiereDuMonde || precedent === 'grotte' ? ['grotte'] : []);
      roles.push(precedent);
    }
    roles.push('arene');
  }
  roles.push('sanctuaire');
  return roles;
}

/**
 * Courbe de niveaux, étalée sur la longueur réelle du parcours.
 *
 * Elle était écrite en dur, étape par étape ; avec une longueur variable il faut
 * l'interpoler, sinon un monde de onze régions se traverserait avec la difficulté d'un
 * monde de huit.
 */
function niveauxDe(index: number, longueur: number, role: RegionRole): { min: number; max: number } {
  // Le sanctuaire est un après-jeu : il ne suit pas la courbe, il la dépasse.
  if (role === 'sanctuaire') return { min: NIVEAU_FINAL + 4, max: NIVEAU_FINAL + 10 };

  const avancement = longueur > 2 ? index / (longueur - 2) : 1;
  // La montée est volontairement lente au départ puis s'accélère. Une interpolation
  // linéaire poserait la première route à mi-chemin du dernier champion : un starter de
  // niveau 6 y perdrait un combat sur deux, et la partie serait injouable au premier pas.
  const centre = NIVEAU_DEPART + avancement ** COURBE * (NIVEAU_FINAL - NIVEAU_DEPART);
  const min = Math.max(2, Math.round(centre) - 2);
  // Un champion frappe au-dessus de ce qu'on a croisé pour arriver jusqu'à lui.
  return { min, max: Math.round(centre) + (role === 'arene' ? 3 : 2) };
}

/**
 * Vrai si cette espèce peut affronter la faune de départ sans y être condamnée.
 *
 * Le critère : ne pas subir le double sans pouvoir répliquer aussi fort. Un Galetin
 * lâché dans une forêt encaissait ×2 de chaque plante et ne rendait que ×0,5 — il
 * perdait six combats sur dix dès la première région, sans que le joueur ait rien fait
 * de mal. Un choix de départ ne doit jamais être un piège.
 */
function tientTeteA(candidat: SpeciesId, faune: readonly SpeciesId[]): boolean {
  const miens = SPECIES[candidat].types;
  return faune.every((adverse) => {
    const siens = SPECIES[adverse].types;
    const subi = siens.reduce((facteur, type) => facteur * effectivenessAgainst(type, miens), 1);
    const inflige = miens.reduce((meilleur, type) => Math.max(meilleur, effectivenessAgainst(type, siens)), 0);
    return subi <= 1 || inflige >= 2;
  });
}

/**
 * Trois créatures de départ, tirées à la seed parmi les premiers stades.
 *
 * Elles étaient figées ; c'est pourtant le tout premier choix de la partie, et le faire
 * varier change la façon dont on aborde les premières régions. Deux garde-fous : des
 * types distincts pour que le choix reste lisible, et aucune espèce que la faune de la
 * première région écraserait.
 */
function tirerStarters(rng: Rng, faune: readonly SpeciesId[]): SpeciesId[] {
  // Une espèce vers laquelle une autre évolue n'est pas un premier stade : proposer
  // Flamboux au départ, c'est offrir un milieu de lignée et escamoter la moitié de sa
  // progression.
  const evoluees = new Set(SPECIES_IDS.map((id) => SPECIES[id].evolution?.vers).filter(Boolean));
  const premiersStades = SPECIES_IDS.filter((id) => {
    const species = SPECIES[id];
    return (
      species.evolution !== undefined &&
      !evoluees.has(id) &&
      species.types.length === 1 &&
      baseStatTotal(species) >= PUISSANCE_STARTER_MIN
    );
  });

  const choisir = (candidats: readonly SpeciesId[]): SpeciesId[] => {
    const choisis: SpeciesId[] = [];
    const typesPris = new Set<ElementType>();
    for (const id of rng.shuffle([...candidats])) {
      const type = SPECIES[id].types[0];
      if (typesPris.has(type)) continue;
      typesPris.add(type);
      choisis.push(id);
      if (choisis.length === 3) break;
    }
    return choisis;
  };

  const viables = choisir(premiersStades.filter((id) => tientTeteA(id, faune)));
  // Si le filtre ne laisse pas trois types distincts, on préfère un trio complet à un
  // trio parfait : le plafond de puissance de la région limite déjà les dégâts.
  return viables.length === 3 ? viables : choisir(premiersStades);
}

export interface World {
  /** La seed telle que le joueur la voit, du type « brume-3f7a ». */
  readonly seedText: string;
  readonly seed: number;
  readonly plans: readonly RegionPlan[];
  /** Les trois créatures proposées au départ, propres à cette seed. */
  readonly starters: readonly SpeciesId[];
  /** Génère la région demandée, ou la rend depuis le cache. */
  region(index: number): Region;
  /** Vide le cache — utile après un changement de partie. */
  oublier(): void;
}

/** Construit le plan du monde. Étape purement descriptive : aucune tuile n'est posée. */
export function planifierMonde(seedText: string): {
  seed: number;
  plans: RegionPlan[];
  starters: SpeciesId[];
} {
  const seed = seedValue(seedText);
  const rng = rngFor(seed, 'plan');

  const roles = composerRoles(rng);
  // Les types d'arène sont tirés sans remise : deux champions du même élément
  // donneraient deux fois le même combat.
  const typesArene = rng.shuffle([...ELEMENT_TYPES]).filter((type) => type !== 'neutre');
  // Les qualificatifs aussi : « Bois des Brumes » puis « Grotte des Brumes » sonnerait
  // comme une erreur de génération.
  const qualificatifs = rng.shuffle(QUALIFICATIFS.fr.map((_, index) => index));

  let numeroRoute = 0;
  let numeroArene = 0;
  let numeroQualificatif = 0;

  const plans: RegionPlan[] = roles.map((role, index) => {
    if (role === 'route') numeroRoute++;
    const qualificatif = qualificatifs[numeroQualificatif++ % qualificatifs.length]!;
    const nom =
      role === 'route'
        ? { fr: `Route ${numeroRoute}`, en: `Route ${numeroRoute}` }
        : {
            fr: `${NOMS_ROLE[role].fr} ${QUALIFICATIFS.fr[qualificatif]}`,
            en: `${NOMS_ROLE[role].en} ${QUALIFICATIFS.en[qualificatif]}`,
          };

    // Index 1 : la première région sauvage, toujours accueillante.
    const pool = BIOMES_PAR_ROLE[role];
    const permis = index === 1 ? pool.filter((biome) => BIOMES_DEBUT.includes(biome)) : pool;

    return {
      index,
      role,
      biome: rng.pick(permis.length > 0 ? permis : pool),
      nom,
      niveaux: niveauxDe(index, roles.length, role),
      precedente: index === 0 ? null : index - 1,
      suivante: index === roles.length - 1 ? null : index + 1,
      typeArene: role === 'arene' ? typesArene[numeroArene++ % typesArene.length]! : undefined,
    } satisfies RegionPlan;
  });

  // Le sanctuaire recueille ce que les biomes tirés n'offraient nulle part. Le calcul
  // vient après la carte, puisqu'il la lit — et avant les starters, qui n'y changent rien.
  // Seules comptent les régions qui sèment des zones de rencontre : une arène partage le
  // biome des ruines sans jamais y faire apparaître la moindre créature.
  const sanctuaire = plans.at(-1)!;
  const complement = especesManquantes(
    plans.map((plan) => ({
      biome: plan.biome,
      niveaux: plan.niveaux,
      // Une arène partage le biome des ruines sans jamais y faire apparaître la moindre
      // créature : seuls les rôles qui sèment des hautes herbes comptent.
      fauneOrdinaire: ROLES_AVEC_FAUNE_ORDINAIRE.includes(plan.role),
      peche: biomeAvecEau(plan.biome),
    })),
  );
  if (complement.length > 0) {
    plans[plans.length - 1] = { ...sanctuaire, complement };
  }

  // Les starters se choisissent **après** le parcours : ils dépendent de ce qui peuple
  // la première région sauvage.
  const depart = plans.find((plan) => plan.role !== 'bourg')!;
  const faune = tableRencontre(depart.biome, 'jour', { niveauMax: depart.niveaux.max });
  return { seed, plans, starters: tirerStarters(rng, faune) };
}

export function creerMonde(seedText: string): World {
  const { seed, plans, starters } = planifierMonde(seedText);
  const cache = new Map<number, Region>();

  return {
    seedText,
    seed,
    plans,
    starters,
    region(index) {
      const enCache = cache.get(index);
      if (enCache) return enCache;
      const plan = plans[index];
      if (!plan) throw new Error(`Région ${index} inconnue dans ce monde.`);
      const region = genererRegion(seed, plan);
      cache.set(index, region);
      return region;
    },
    oublier() {
      cache.clear();
    },
  };
}

/** Le badge décerné par l'arène d'un type donné. */
export function badgeDe(type: ElementType): string {
  return `badge:${type}`;
}

/**
 * Vrai si tous les champions du monde ont été battus.
 *
 * C'est la condition de victoire. Elle se lit sur les badges plutôt que sur un compteur,
 * parce que le nombre d'arènes dépend de la seed : une partie de deux arènes se termine
 * avec deux insignes, une de trois en demande trois.
 */
export function toutesLesArenesVaincues(
  plans: readonly RegionPlan[],
  badges: readonly string[],
): boolean {
  const arenes = plans.filter((plan) => plan.role === 'arene');
  return (
    arenes.length > 0 &&
    arenes.every((plan) => plan.typeArene !== undefined && badges.includes(badgeDe(plan.typeArene)))
  );
}
