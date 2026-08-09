/**
 * Génération d'une région : de la seed à une grille de tuiles peuplée.
 *
 * Quatre passes, dans cet ordre :
 *   1. terrain   — le relief, tiré d'un bruit fractionnaire propre au biome ;
 *   2. chemins   — un couloir creusé entre l'entrée et chaque sortie ;
 *   3. contenu   — hautes herbes, décor, bordures ;
 *   4. entités   — personnages, dresseurs, objets, sur des cases libres.
 *
 * La passe 2 est la seule non négociable : une région dont la sortie est inatteignable
 * bloque la partie. Elle est donc vérifiée par parcours en largeur, et la région est
 * régénérée tant qu'elle échoue. Un test l'éprouve sur des centaines de seeds.
 *
 * **Choix de portée assumé :** il n'y a pas d'intérieurs de bâtiment. Les portes sont
 * du décor, et les services (soins, boutique) tiennent un étal en extérieur. Modéliser
 * des intérieurs doublerait le code du monde pour un gain de jeu faible.
 */

import { rngFor, type Rng } from '../core/rng.ts';
import type { Biome } from '../data/biomes.ts';
import type { ItemId } from '../data/items.ts';
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species.ts';
import type { ElementType } from '../data/types.ts';
import { fbm, quantile } from './noise.ts';
import { tableRencontre } from './encounters.ts';
import { baseStatTotal } from '../data/species.ts';
import { entiteId, type Dresseur, type Entite, type Position } from './entities.ts';
import { TILES, tileFromIndex, tileIndex, type TileId } from './tiles.ts';

export const REGION_WIDTH = 48;
export const REGION_HEIGHT = 36;

export type RegionRole = 'bourg' | 'route' | 'bois' | 'village' | 'grotte' | 'arene' | 'sanctuaire';

export interface RegionPlan {
  readonly index: number;
  readonly role: RegionRole;
  readonly biome: Biome;
  readonly nom: { readonly fr: string; readonly en: string };
  readonly niveaux: { readonly min: number; readonly max: number };
  readonly precedente: number | null;
  readonly suivante: number | null;
  /** Spécialité du champion, pour une arène. C'est elle qui nomme le badge. */
  readonly typeArene?: ElementType;
  /**
   * Espèces que le reste du monde n'offrait pas, recueillies ici. Le sanctuaire seul en
   * porte : c'est ce qui garantit un Terradex complétable quelle que soit la seed.
   */
  readonly complement?: readonly SpeciesId[];
}

export interface Sortie {
  readonly cote: 'nord' | 'sud';
  readonly x: number;
  readonly y: number;
  readonly vers: number;
}

export interface Region {
  readonly index: number;
  readonly role: RegionRole;
  readonly biome: Biome;
  readonly nom: { readonly fr: string; readonly en: string };
  readonly niveaux: { readonly min: number; readonly max: number };
  /** Spécialité du champion, reprise du plan pour l'affichage et le badge. */
  readonly typeArene?: ElementType;
  /** Espèces recueillies ici faute d'exister ailleurs dans le monde. Sanctuaire seul. */
  readonly complement?: readonly SpeciesId[];
  readonly width: number;
  readonly height: number;
  /** Un index de tuile par case, ligne par ligne. */
  readonly tiles: Uint8Array;
  /** Où le joueur apparaît quand il entre pour la première fois. */
  readonly depart: Position;
  readonly sorties: readonly Sortie[];
  readonly entites: readonly Entite[];
}

// ── Accès à la grille ────────────────────────────────────────────────────────

export function lireTuile(region: Pick<Region, 'tiles' | 'width' | 'height'>, x: number, y: number): TileId {
  if (x < 0 || y < 0 || x >= region.width || y >= region.height) return 'vide';
  return tileFromIndex(region.tiles[y * region.width + x]!);
}

function poser(tiles: Uint8Array, x: number, y: number, tile: TileId): void {
  if (x < 0 || y < 0 || x >= REGION_WIDTH || y >= REGION_HEIGHT) return;
  tiles[y * REGION_WIDTH + x] = tileIndex(tile);
}

function lire(tiles: Uint8Array, x: number, y: number): TileId {
  if (x < 0 || y < 0 || x >= REGION_WIDTH || y >= REGION_HEIGHT) return 'vide';
  return tileFromIndex(tiles[y * REGION_WIDTH + x]!);
}

function marchable(tiles: Uint8Array, x: number, y: number): boolean {
  return !TILES[lire(tiles, x, y)].solid;
}

// ── Palettes de biome ────────────────────────────────────────────────────────

interface PaletteBiome {
  readonly sol: TileId;
  readonly variante: TileId;
  readonly herbe: TileId;
  readonly chemin: TileId;
  readonly bordure: TileId;
  readonly obstacles: readonly TileId[];
  /** Proportion approximative d'eau, de décor bloquant, de zone de rencontre. */
  readonly eau: number;
  readonly densiteObstacles: number;
  readonly densiteHerbe: number;
}

const PALETTES: Record<Biome, PaletteBiome> = {
  prairie: {
    sol: 'herbe',
    variante: 'herbeClaire',
    herbe: 'herbesHautes',
    chemin: 'chemin',
    bordure: 'arbre',
    obstacles: ['arbre', 'buisson', 'rocher', 'fleurs'],
    eau: 0.07,
    densiteObstacles: 0.14,
    densiteHerbe: 0.3,
  },
  foret: {
    sol: 'herbe',
    variante: 'herbeClaire',
    herbe: 'herbesHautes',
    chemin: 'chemin',
    bordure: 'arbre',
    obstacles: ['arbre', 'arbre', 'souche', 'buisson'],
    eau: 0.03,
    densiteObstacles: 0.3,
    densiteHerbe: 0.34,
  },
  riviere: {
    sol: 'herbe',
    variante: 'sable',
    herbe: 'herbesHautes',
    chemin: 'chemin',
    bordure: 'arbre',
    obstacles: ['buisson', 'rocher', 'souche'],
    eau: 0.26,
    densiteObstacles: 0.09,
    densiteHerbe: 0.24,
  },
  lande: {
    sol: 'herbe',
    variante: 'sable',
    herbe: 'herbesHautes',
    chemin: 'chemin',
    bordure: 'rocher',
    obstacles: ['rocher', 'buisson', 'souche'],
    eau: 0.03,
    densiteObstacles: 0.16,
    densiteHerbe: 0.28,
  },
  montagne: {
    sol: 'chemin',
    variante: 'sable',
    herbe: 'herbesHautes',
    chemin: 'chemin',
    bordure: 'rocher',
    obstacles: ['rocher', 'rocher', 'arbre'],
    eau: 0.02,
    densiteObstacles: 0.24,
    densiteHerbe: 0.18,
  },
  grotte: {
    sol: 'solGrotte',
    variante: 'gravier',
    herbe: 'gravier',
    chemin: 'solGrotte',
    bordure: 'murGrotte',
    obstacles: ['murGrotte', 'murGrotte', 'cristal'],
    eau: 0.04,
    densiteObstacles: 0.36,
    densiteHerbe: 0.24,
  },
  ruines: {
    sol: 'chemin',
    variante: 'herbe',
    herbe: 'herbesHautes',
    chemin: 'chemin',
    bordure: 'mur',
    obstacles: ['mur', 'rocher', 'souche'],
    eau: 0,
    densiteObstacles: 0.22,
    densiteHerbe: 0.22,
  },
};

// ── Passe 1 : terrain ────────────────────────────────────────────────────────

function poserTerrain(tiles: Uint8Array, seed: number, palette: PaletteBiome): void {
  const cases = REGION_WIDTH * REGION_HEIGHT;
  const relief = new Float64Array(cases);
  const vegetation = new Float64Array(cases);
  const detail = new Float64Array(cases);

  for (let y = 0; y < REGION_HEIGHT; y++) {
    for (let x = 0; x < REGION_WIDTH; x++) {
      const i = y * REGION_WIDTH + x;
      relief[i] = fbm(seed, x, y, { echelle: 11 });
      vegetation[i] = fbm(seed + 1, x, y, { echelle: 7 });
      detail[i] = fbm(seed + 2, x, y, { echelle: 4, octaves: 2 });
    }
  }

  // Les seuils sont lus dans la distribution obtenue, pas fixés à l'avance : les
  // proportions déclarées par le biome sont donc respectées à la case près.
  const seuilEau = quantile(relief, palette.eau);
  const seuilObstacle = quantile(relief, 1 - palette.densiteObstacles);
  const seuilHerbe = quantile(vegetation, 1 - palette.densiteHerbe);
  const seuilVariante = quantile(detail, 0.7);

  for (let i = 0; i < cases; i++) {
    let tile: TileId;
    if (palette.eau > 0 && relief[i]! <= seuilEau) {
      tile = 'eau';
    } else if (relief[i]! >= seuilObstacle) {
      // Le bruit regroupe les obstacles en bosquets au lieu de les éparpiller :
      // c'est ce qui donne des bois et des éboulis plutôt qu'un semis uniforme.
      const choix = Math.floor(detail[i]! * palette.obstacles.length);
      tile = palette.obstacles[Math.min(choix, palette.obstacles.length - 1)]!;
    } else if (vegetation[i]! >= seuilHerbe) {
      tile = palette.herbe;
    } else {
      tile = detail[i]! > seuilVariante ? palette.variante : palette.sol;
    }
    poser(tiles, i % REGION_WIDTH, Math.floor(i / REGION_WIDTH), tile);
  }
}

/** Ceinture infranchissable : elle empêche de sortir du cadre ailleurs qu'aux portes. */
function poserBordure(tiles: Uint8Array, palette: PaletteBiome): void {
  for (let x = 0; x < REGION_WIDTH; x++) {
    poser(tiles, x, 0, palette.bordure);
    poser(tiles, x, REGION_HEIGHT - 1, palette.bordure);
  }
  for (let y = 0; y < REGION_HEIGHT; y++) {
    poser(tiles, 0, y, palette.bordure);
    poser(tiles, REGION_WIDTH - 1, y, palette.bordure);
  }
}

// ── Passe 2 : chemins ────────────────────────────────────────────────────────

/**
 * Creuse un couloir marchable de trois cases de large entre deux points.
 *
 * La marche est biaisée vers la cible sans l'être totalement : une ligne droite se
 * verrait, un vrai hasard n'arriverait jamais. Le compteur de sécurité borne la boucle —
 * un chemin qui n'aboutit pas doit échouer, pas tourner indéfiniment.
 */
function creuserCouloir(tiles: Uint8Array, rng: Rng, depart: Position, arrivee: Position, sol: TileId): void {
  let { x, y } = depart;
  const maxPas = REGION_WIDTH * REGION_HEIGHT;

  for (let pas = 0; pas < maxPas; pas++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = x + dx;
        const py = y + dy;
        // La bordure reste intacte : seules les portes la percent.
        if (px <= 0 || py <= 0 || px >= REGION_WIDTH - 1 || py >= REGION_HEIGHT - 1) continue;
        poser(tiles, px, py, sol);
      }
    }

    if (x === arrivee.x && y === arrivee.y) return;

    const dx = Math.sign(arrivee.x - x);
    const dy = Math.sign(arrivee.y - y);
    if (dx !== 0 && (dy === 0 || rng.chance(Math.abs(arrivee.x - x) > Math.abs(arrivee.y - y) ? 0.72 : 0.28))) {
      x += dx;
    } else if (dy !== 0) {
      y += dy;
    } else {
      x += dx;
    }
  }
}

/** Parcours en largeur : l'ensemble des cases atteignables depuis un point. */
function zonesAtteignables(tiles: Uint8Array, depart: Position): Set<number> {
  const vus = new Set<number>();
  if (!marchable(tiles, depart.x, depart.y)) return vus;

  const file: Position[] = [depart];
  vus.add(depart.y * REGION_WIDTH + depart.x);

  while (file.length > 0) {
    const { x, y } = file.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;

      // Un rebord ne se franchit que vers le sud, et l'on atterrit une case plus bas —
      // exactement ce que fait `tenterPas`. Le compter comme une case ordinaire ferait
      // croire le nord accessible par en bas, et la garantie de connectivité, qui est
      // tout l'intérêt de ce parcours, mentirait.
      if (TILES[lire(tiles, nx, ny)].ledge === 'sud') {
        if (dy <= 0) continue;
        const arriveeY = ny + 1;
        if (!marchable(tiles, nx, arriveeY)) continue;
        if (TILES[lire(tiles, nx, arriveeY)].ledge === 'sud') continue;
        const cleArrivee = arriveeY * REGION_WIDTH + nx;
        if (vus.has(cleArrivee)) continue;
        vus.add(cleArrivee);
        file.push({ x: nx, y: arriveeY });
        continue;
      }

      const cle = ny * REGION_WIDTH + nx;
      if (vus.has(cle)) continue;
      if (!marchable(tiles, nx, ny)) continue;
      vus.add(cle);
      file.push({ x: nx, y: ny });
    }
  }
  return vus;
}

// ── Passe 3 : bâtiments et aménagements ──────────────────────────────────────

/** Maison : deux rangées de toit, deux de mur, une porte au centre. */
function poserMaison(tiles: Uint8Array, x: number, y: number, largeur: number): void {
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < largeur; dx++) {
      poser(tiles, x + dx, y + dy, dy < 2 ? 'toit' : 'mur');
    }
  }
  poser(tiles, x + Math.floor(largeur / 2), y + 3, 'porte');
}

/** Étal de service : un comptoir avec un dégagement devant pour s'y adresser. */
function poserEtal(tiles: Uint8Array, x: number, y: number, largeur: number): void {
  for (let dx = 0; dx < largeur; dx++) {
    poser(tiles, x + dx, y, 'comptoir');
    poser(tiles, x + dx, y + 1, 'solInterieur');
    poser(tiles, x + dx, y - 1, 'solInterieur');
  }
}

// ── Passe 4 : entités ────────────────────────────────────────────────────────

interface Contexte {
  readonly tiles: Uint8Array;
  readonly rng: Rng;
  readonly plan: RegionPlan;
  readonly occupees: Set<number>;
}

/** Trouve une case libre, marchable et non occupée, au plus près d'un point visé. */
function caseLibre(contexte: Contexte, vise: Position, rayonMax = 12): Position | null {
  for (let rayon = 0; rayon <= rayonMax; rayon++) {
    const candidats: Position[] = [];
    for (let dy = -rayon; dy <= rayon; dy++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rayon) continue;
        const x = vise.x + dx;
        const y = vise.y + dy;
        const cle = y * REGION_WIDTH + x;
        if (contexte.occupees.has(cle)) continue;
        if (!marchable(contexte.tiles, x, y)) continue;
        if (lire(contexte.tiles, x, y) === 'eau') continue;
        // Un rebord se saute, il ne s'habite pas : rien ne doit s'y poser, sinon l'objet
        // ou le personnage se retrouve sur une case où le joueur ne peut pas se tenir.
        if (TILES[lire(contexte.tiles, x, y)].ledge === 'sud') continue;
        candidats.push({ x, y });
      }
    }
    if (candidats.length > 0) {
      const choisie = contexte.rng.pick(candidats);
      contexte.occupees.add(choisie.y * REGION_WIDTH + choisie.x);
      return choisie;
    }
  }
  return null;
}

/**
 * Combien de répliques existent pour chaque famille de dialogue.
 *
 * Exportées parce que le test de complétude du catalogue les recopiait : la copie avait
 * déjà divergé, et augmenter une de ces constantes livrait des clés manquantes sans que
 * rien ne s'en aperçoive.
 */
export const DIALOGUES_VILLAGEOIS = 8;
export const DIALOGUES_DRESSEUR = 6;
export const DIALOGUES_PANNEAU = 5;

/**
 * Compose une équipe de dresseur.
 *
 * `parmi` restreint le vivier : un dresseur de passage puise dans le biome qu'il occupe,
 * un champion dans sa spécialité. Sans ce paramètre, tous les champions du monde
 * aligneraient les mêmes créatures de ruines.
 */
function composerEquipe(
  rng: Rng,
  plan: RegionPlan,
  taille: number,
  bonusNiveau: number,
  parmi?: readonly SpeciesId[],
  /** Espèces déjà alignées. Partagé quand une équipe se compose en plusieurs passes. */
  dejaPrises: Set<SpeciesId> = new Set(),
): Dresseur['equipe'] {
  // Un dresseur de route aligne ce que la région abrite, plafond de puissance compris :
  // il ne sort pas une évolution finale là où le joueur n'en croise pas.
  const local = tableRencontre(plan.biome, 'jour', { niveauMax: plan.niveaux.max });
  // Deux viviers essayés dans l'ordre : celui qu'on a demandé, puis la région en secours.
  // Une fois promues à leur forme finale, les trois espèces d'une lignée n'en font plus
  // qu'une, et une spécialité mince s'épuise en deux tirages.
  const viviers = [parmi ?? local, local, ['mulotin'] as const]
    .filter((vivier) => vivier.length > 0)
    .map((vivier) => rng.shuffle([...vivier]));

  return Array.from({ length: taille }, () => {
    const niveau = Math.max(2, plan.niveaux.max + bonusNiveau + rng.int(-1, 1));
    let species: SpeciesId | null = null;
    for (const vivier of viviers) {
      const libre = vivier.find((id) => !dejaPrises.has(formeAuNiveau(id, niveau)));
      if (libre !== undefined) {
        species = formeAuNiveau(libre, niveau);
        break;
      }
    }
    // Tous les viviers épuisés : on se résout à un doublon plutôt qu'à une équipe courte.
    species ??= formeAuNiveau(viviers[0]![0]!, niveau);
    dejaPrises.add(species);
    return { species, niveau };
  });
}

/**
 * La forme qu'une espèce a réellement atteinte à ce niveau.
 *
 * Le niveau était auparavant rabattu sous le seuil d'évolution, si bien qu'un champion de
 * niveau 35 alignait « folianz 15 » aux côtés d'un « sylvanor 37 ». C'est l'espèce qui
 * doit avancer dans sa lignée, pas le niveau qui doit reculer : un dresseur montre des
 * créatures qu'il a élevées, pas des nouveau-nés bridés.
 */
function formeAuNiveau(id: SpeciesId, niveau: number): SpeciesId {
  let courant = id;
  // La borne protège d'une lignée circulaire ; un test des données l'interdit déjà.
  for (let etape = 0; etape < SPECIES_IDS.length; etape++) {
    const evolution = SPECIES[courant].evolution;
    if (!evolution || niveau < evolution.niveau) return courant;
    courant = evolution.vers;
  }
  return courant;
}

/**
 * Les espèces d'un type donné, les plus abouties d'abord.
 *
 * C'est ce qui donne au champion une équipe qui ressemble à sa spécialité, et une tête
 * d'affiche qui n'est pas un premier stade.
 */
function especesDuType(type: ElementType): SpeciesId[] {
  return SPECIES_IDS.filter((id) => SPECIES[id].types.includes(type) && SPECIES[id].tauxCapture > 5).sort(
    (a, b) => baseStatTotal(SPECIES[b]) - baseStatTotal(SPECIES[a]),
  );
}

const BUTIN_COMMUN: readonly ItemId[] = ['potion', 'prisme', 'baie', 'antidote'];

/**
 * Pose un objet unique dans la région, à une case libre proche de la position visée.
 *
 * La carte, la canne et la pierre d'Éveil existaient dans le catalogue sans qu'aucun
 * générateur ne les distribue : elles n'étaient donc trouvables nulle part. Chacune est
 * désormais placée là où elle a du sens — la carte au bourg, la canne au village, la
 * pierre au fond d'une grotte.
 */
function poserObjetUnique(
  contexte: Contexte,
  entites: Entite[],
  item: ItemId,
  vise: Position,
  compteur: number,
): void {
  const place = caseLibre(contexte, vise);
  if (!place) return;
  entites.push({
    kind: 'objet',
    id: entiteId(contexte.plan.index, 'objet', compteur),
    ...place,
    item,
    quantite: 1,
  });
}

// ── Générateurs par rôle ─────────────────────────────────────────────────────

interface Resultat {
  readonly depart: Position;
  readonly entites: Entite[];
}

type Generateur = (contexte: Contexte, portes: { sud: Position | null; nord: Position | null }) => Resultat;

/** Bourg de départ : pas de rencontre, le laboratoire, quelques habitants. */
const genererBourg: Generateur = (contexte, portes) => {
  const { tiles, rng, plan } = contexte;
  const entites: Entite[] = [];

  // Le bourg est entièrement aménagé : on repart d'une base propre plutôt que de
  // corriger un terrain sauvage.
  for (let y = 1; y < REGION_HEIGHT - 1; y++) {
    for (let x = 1; x < REGION_WIDTH - 1; x++) {
      poser(tiles, x, y, fbm(plan.index + 7, x, y, { echelle: 6 }) > 0.62 ? 'herbeClaire' : 'herbe');
    }
  }

  const centre = { x: Math.floor(REGION_WIDTH / 2), y: Math.floor(REGION_HEIGHT / 2) + 4 };
  poserMaison(tiles, centre.x - 8, 8, 7); // laboratoire
  poserMaison(tiles, centre.x + 4, 10, 5);
  poserMaison(tiles, centre.x - 14, 16, 5);
  poserMaison(tiles, centre.x + 8, 18, 5);

  // Une allée centrale relie la porte nord au cœur du bourg.
  if (portes.nord) creuserCouloir(tiles, rng, centre, portes.nord, 'chemin');
  for (let x = centre.x - 10; x <= centre.x + 10; x++) poser(tiles, x, centre.y, 'chemin');

  // La carte du monde attend au bourg : c'est elle qui ouvre l'écran de carte.
  poserObjetUnique(contexte, entites, 'carte', { x: centre.x + 3, y: centre.y - 2 }, 90);
  // La canne aussi. Réservée au village, elle n'arrivait qu'après le premier champion :
  // tout le premier tiers de la partie se jouait sans que la pêche existe, alors que la
  // moindre mare du bourg la rend utile.
  poserObjetUnique(contexte, entites, 'canne', { x: centre.x - 3, y: centre.y - 2 }, 91);

  const professeur = caseLibre(contexte, { x: centre.x - 5, y: 13 });
  if (professeur) {
    entites.push({
      kind: 'pnj',
      id: entiteId(plan.index, 'pnj', 0),
      ...professeur,
      sprite: 'professeur',
      dialogue: 'dialogue.professeur',
      role: 'professeur',
    });
  }

  // Une soigneuse au bourg de départ. Il n'y en avait aucune : le premier lieu de soin
  // du monde était le village, à mi-parcours, et toute la première moitié de la partie
  // se jouait sans autre recours que les potions achetées d'avance.
  const soigneuse = caseLibre(contexte, { x: centre.x + 5, y: 13 });
  if (soigneuse) {
    entites.push({
      kind: 'service',
      id: entiteId(plan.index, 'service', 0),
      ...soigneuse,
      service: 'soin',
      sprite: 'soigneuse',
      dialogue: 'dialogue.soigneuse',
    });
  }

  // Un marchand au bourg. Le plan du monde tient déjà pour acquis que « le bourg vend
  // déjà » pour justifier de ne pas coller le village à côté — mais aucun étal n'y était
  // posé. On partait donc avec 800 pièces inutilisables et sans moyen de racheter une
  // potion avant la première arène.
  const marchand = caseLibre(contexte, { x: centre.x - 6, y: 17 });
  if (marchand) {
    entites.push({
      kind: 'service',
      id: entiteId(plan.index, 'service', 1),
      ...marchand,
      service: 'boutique',
      sprite: 'marchand',
      dialogue: 'dialogue.marchand',
    });
  }

  for (let i = 0; i < 3; i++) {
    const place = caseLibre(contexte, { x: centre.x + rng.int(-10, 10), y: centre.y + rng.int(-6, 4) });
    if (!place) continue;
    entites.push({
      kind: 'pnj',
      id: entiteId(plan.index, 'pnj', i + 1),
      ...place,
      sprite: rng.pick(['villageois', 'villageoise', 'randonneur'] as const),
      dialogue: `dialogue.villageois.${rng.int(0, DIALOGUES_VILLAGEOIS - 1)}`,
      role: 'villageois',
    });
  }

  const panneau = caseLibre(contexte, { x: centre.x, y: centre.y - 2 });
  if (panneau) {
    poser(tiles, panneau.x, panneau.y, 'panneau');
    entites.push({
      kind: 'panneau',
      id: entiteId(plan.index, 'panneau', 0),
      ...panneau,
      texte: 'dialogue.panneau.bourg',
    });
  }

  return { depart: { x: centre.x, y: centre.y + 1 }, entites };
};

/** Village : ravitaillement. Une boutique, un étal de soins, des habitants. */
const genererVillage: Generateur = (contexte, portes) => {
  const { tiles, rng, plan } = contexte;
  const entites: Entite[] = [];

  for (let y = 1; y < REGION_HEIGHT - 1; y++) {
    for (let x = 1; x < REGION_WIDTH - 1; x++) {
      poser(tiles, x, y, fbm(plan.index + 7, x, y, { echelle: 6 }) > 0.62 ? 'herbeClaire' : 'herbe');
    }
  }

  const centre = { x: Math.floor(REGION_WIDTH / 2), y: Math.floor(REGION_HEIGHT / 2) };
  for (let x = 4; x < REGION_WIDTH - 4; x++) poser(tiles, x, centre.y, 'chemin');
  for (let y = 4; y < REGION_HEIGHT - 4; y++) poser(tiles, centre.x, y, 'chemin');

  poserMaison(tiles, 6, 6, 6);
  poserMaison(tiles, REGION_WIDTH - 14, 6, 6);
  poserMaison(tiles, 8, REGION_HEIGHT - 12, 5);
  poserMaison(tiles, REGION_WIDTH - 15, REGION_HEIGHT - 12, 5);

  poserEtal(tiles, centre.x - 12, centre.y - 5, 5);
  poserEtal(tiles, centre.x + 8, centre.y - 5, 5);

  const soins = caseLibre(contexte, { x: centre.x - 10, y: centre.y - 6 });
  if (soins) {
    entites.push({
      kind: 'service',
      id: entiteId(plan.index, 'service', 0),
      ...soins,
      service: 'soin',
      sprite: 'soigneuse',
      dialogue: 'dialogue.soigneuse',
    });
  }

  const boutique = caseLibre(contexte, { x: centre.x + 10, y: centre.y - 6 });
  if (boutique) {
    entites.push({
      kind: 'service',
      id: entiteId(plan.index, 'service', 1),
      ...boutique,
      service: 'boutique',
      sprite: 'marchand',
      dialogue: 'dialogue.marchand',
    });
  }

  for (let i = 0; i < 4; i++) {
    const place = caseLibre(contexte, { x: centre.x + rng.int(-14, 14), y: centre.y + rng.int(-8, 8) });
    if (!place) continue;
    entites.push({
      kind: 'pnj',
      id: entiteId(plan.index, 'pnj', i),
      ...place,
      sprite: rng.pick(['villageois', 'villageoise', 'randonneur', 'dresseuse'] as const),
      dialogue: `dialogue.villageois.${rng.int(0, DIALOGUES_VILLAGEOIS - 1)}`,
      role: 'villageois',
    });
  }

  if (portes.nord) creuserCouloir(tiles, rng, centre, portes.nord, 'chemin');
  if (portes.sud) creuserCouloir(tiles, rng, centre, portes.sud, 'chemin');

  // La canne est désormais donnée au bourg : la poser une seconde fois ici en offrirait
  // deux. Le village garde sa boutique et sa soigneuse, qui sont sa raison d'être.

  return { depart: portes.sud ?? centre, entites };
};

/** Arène : une enceinte, une allée, le champion au fond. */
/**
 * Le champion d'une arène : sa spécialité, son escorte, sa tête d'affiche.
 *
 * Extrait du générateur pour que la région de secours puisse le poser elle aussi. Sans
 * cela, une arène tombée sur ce dernier recours n'avait aucun champion — donc aucun
 * badge, donc une partie qu'on ne pouvait plus finir.
 */
function creerChampion(rng: Rng, plan: RegionPlan, position: Position): Entite {
  // Le champion tient sa spécialité : son escorte est composée dans son type, et sa tête
  // d'affiche en est la créature la plus aboutie qui n'y figure pas déjà. Sans cette
  // dernière condition, une arène de type mince alignait deux fois la même créature —
  // et la plus puissante du jeu, qui plus est.
  const specialite = especesDuType(plan.typeArene ?? 'neutre');
  // La tête d'affiche se choisit **en premier** — c'est la plus aboutie de sa spécialité,
  // et son escorte se compose ensuite autour d'elle. L'ordre inverse laissait l'escorte
  // épuiser un vivier mince, et la vedette n'avait plus qu'à se doubler elle-même.
  const vedette = formeAuNiveau(specialite[0] ?? 'chatoyan', plan.niveaux.max);
  // Un registre unique pour toutes les passes : sans lui, la créature tirée dans la
  // région pouvait doubler celle tirée dans la spécialité.
  const dejaLa = new Set<SpeciesId>([vedette]);
  // L'escorte s'étale sur plusieurs niveaux au lieu de se masser juste sous la vedette.
  // C'est ce qui rend disponibles les **stades intermédiaires** : la flamme et la foudre
  // n'ont qu'une lignée chacune, et une escorte au même niveau qu'elle n'en proposait
  // qu'une seule forme. Un champion élève des créatures d'âges différents.
  // L'écart est proportionnel : sept niveaux sous une arène de niveau 35 se lit comme
  // une équipe d'âges variés, sous une arène de niveau 13 comme un champion qui
  // promène des nouveau-nés.
  const ecart = Math.max(2, Math.round(plan.niveaux.max * 0.2));
  const escorte = [
    ...composerEquipe(rng, plan, 1, -ecart, specialite, dejaLa),
    ...composerEquipe(rng, plan, 1, -Math.max(1, Math.round(ecart / 2)), specialite, dejaLa),
    ...composerEquipe(rng, plan, 1, -1, undefined, dejaLa),
  ];

  return {
    kind: 'dresseur',
    id: entiteId(plan.index, 'dresseur', 0),
    ...position,
    sprite: 'champion',
    dialogue: 'dialogue.champion',
    dialogueVaincu: 'dialogue.championVaincu',
    // Deux créatures de sa spécialité, une piochée dans la région, et sa tête d'affiche.
    // Une équipe entièrement mono-type se heurtait à deux écueils : les types au vivier
    // mince alignaient quatre fois la même créature, et ceux au vivier large quatre
    // bouts de lignée d'affilée. Un champion a une préférence, pas une exclusivité.
    equipe: [...escorte, { species: vedette, niveau: plan.niveaux.max }],
    recompense: 800 + 90 * plan.niveaux.max,
    champion: true,
    vision: 6,
    regard: 'sud',
  };
}

const genererArene: Generateur = (contexte, portes) => {
  const { tiles, rng, plan } = contexte;
  const entites: Entite[] = [];

  for (let y = 1; y < REGION_HEIGHT - 1; y++) {
    for (let x = 1; x < REGION_WIDTH - 1; x++) poser(tiles, x, y, 'solInterieur');
  }

  // Une enceinte de pierre, ouverte au sud par où l'on entre.
  for (let x = 6; x < REGION_WIDTH - 6; x++) {
    poser(tiles, x, 5, 'mur');
    poser(tiles, x, REGION_HEIGHT - 6, 'mur');
  }
  for (let y = 5; y < REGION_HEIGHT - 5; y++) {
    poser(tiles, 6, y, 'mur');
    poser(tiles, REGION_WIDTH - 7, y, 'mur');
  }

  const centreX = Math.floor(REGION_WIDTH / 2);
  for (let x = centreX - 2; x <= centreX + 2; x++) poser(tiles, x, REGION_HEIGHT - 6, 'tapis');
  for (let y = 8; y < REGION_HEIGHT - 5; y++) {
    for (let x = centreX - 2; x <= centreX + 2; x++) poser(tiles, x, y, 'tapis');
  }

  if (portes.sud) creuserCouloir(tiles, rng, { x: centreX, y: REGION_HEIGHT - 7 }, portes.sud, 'solInterieur');
  // La porte du fond : une arène traversée n'est plus le bout du monde, on en ressort
  // par le nord une fois le champion battu.
  if (portes.nord) {
    for (let x = centreX - 1; x <= centreX + 1; x++) poser(tiles, x, 5, 'tapis');
    for (let y = 1; y <= 9; y++) {
      for (let x = centreX - 1; x <= centreX + 1; x++) poser(tiles, x, y, 'solInterieur');
    }
    creuserCouloir(tiles, rng, { x: centreX, y: 4 }, portes.nord, 'solInterieur');
  }

  const champion = { x: centreX, y: 9 };
  contexte.occupees.add(champion.y * REGION_WIDTH + champion.x);
  entites.push(creerChampion(rng, plan, champion));

  for (let i = 0; i < 2; i++) {
    const place = caseLibre(contexte, { x: centreX + (i === 0 ? -8 : 8), y: 16 });
    if (!place) continue;
    entites.push({
      kind: 'dresseur',
      id: entiteId(plan.index, 'dresseur', i + 1),
      ...place,
      sprite: i === 0 ? 'dresseur' : 'dresseuse',
      dialogue: `dialogue.dresseur.${rng.int(0, DIALOGUES_DRESSEUR - 1)}`,
      dialogueVaincu: `dialogue.dresseurVaincu.${rng.int(0, DIALOGUES_DRESSEUR - 1)}`,
      equipe: composerEquipe(rng, plan, 2, 0),
      recompense: 900,
      vision: 4,
      regard: i === 0 ? 'est' : 'ouest',
    });
  }

  return { depart: portes.sud ?? { x: centreX, y: REGION_HEIGHT - 3 }, entites };
};

/**
 * Sanctuaire : la clairière d'après la victoire.
 *
 * Aucun dresseur, aucun service — seulement des hautes herbes rares et un panneau. C'est
 * le seul endroit où se montrent les créatures uniques, et donc la seule façon de
 * terminer le Terradex. Sans lui, son compteur annonçait un total qu'on ne pouvait pas
 * atteindre.
 */
const genererSanctuaire: Generateur = (contexte, portes) => {
  const { tiles, rng, plan } = contexte;
  const entites: Entite[] = [];
  const palette = PALETTES[plan.biome];

  const centreX = Math.floor(REGION_WIDTH / 2);
  const depart = portes.sud ?? { x: centreX, y: REGION_HEIGHT - 2 };

  // Une allée dallée du seuil jusqu'au cœur, puis des herbes tout autour.
  const coeur = { x: centreX, y: 12 };
  creuserCouloir(tiles, rng, depart, coeur, 'chemin');
  for (let y = coeur.y - 5; y <= coeur.y + 5; y++) {
    for (let x = coeur.x - 8; x <= coeur.x + 8; x++) {
      if (!marchable(tiles, x, y)) continue;
      poser(tiles, x, y, rng.chance(0.45) ? palette.herbe : palette.sol);
    }
  }

  const panneau = caseLibre(contexte, { x: depart.x + 2, y: depart.y - 3 });
  if (panneau) {
    poser(tiles, panneau.x, panneau.y, 'panneau');
    entites.push({
      kind: 'panneau',
      id: entiteId(plan.index, 'panneau', 0),
      ...panneau,
      texte: 'dialogue.sanctuaire',
    });
  }

  const soigneuse = caseLibre(contexte, { x: depart.x - 3, y: depart.y - 2 });
  if (soigneuse) {
    entites.push({
      kind: 'service',
      id: entiteId(plan.index, 'service', 0),
      ...soigneuse,
      service: 'soin',
      sprite: 'soigneuse',
      dialogue: 'dialogue.soigneuse',
    });
  }

  return { depart, entites };
};

/** Route, bois, grotte : terrain sauvage traversé par un chemin. */
/**
 * Sème quelques rebords : des raccourcis à sens unique, qu'on saute vers le sud.
 *
 * Toute la mécanique existait — le saut, son animation, le cas du pathfinding, la couleur
 * sur la carte, le sprite, et deux dialogues qui l'enseignent au joueur — mais aucune
 * palette ne posait la tuile. Le jeu expliquait une règle qu'il n'appliquait nulle part.
 *
 * La pose reste prudente : de courtes corniches horizontales, à l'écart des bords et des
 * chemins déjà creusés, sur une case dont le nord et le sud sont libres. Un rebord ne
 * pouvant plus se remonter, il peut couper une région en deux : c'est la vérification de
 * connectivité — devenue consciente des rebords — qui tranche, et la région se régénère
 * si elle échoue.
 */
function poserRebords(tiles: Uint8Array, rng: Rng, palette: PaletteBiome): void {
  const corniches = rng.int(1, 3);

  for (let i = 0; i < corniches; i++) {
    const longueur = rng.int(2, 5);
    const x0 = rng.int(4, REGION_WIDTH - 5 - longueur);
    const y = rng.int(6, REGION_HEIGHT - 8);

    for (let x = x0; x < x0 + longueur; x++) {
      // On ne pose que sur du sol nu : ni chemin creusé, ni eau, ni décor, ni herbe de
      // rencontre — un rebord qui remplacerait une zone de rencontre la ferait
      // disparaître.
      if (lire(tiles, x, y) !== palette.sol) continue;
      // Il faut de quoi s'élancer au nord, et de quoi retomber au sud.
      if (!marchable(tiles, x, y - 1)) continue;
      if (!marchable(tiles, x, y + 1)) continue;
      if (lire(tiles, x, y + 1) === 'eau') continue;
      poser(tiles, x, y, 'rebord');
    }
  }
}

const genererSauvage: Generateur = (contexte, portes) => {
  const { tiles, rng, plan } = contexte;
  const entites: Entite[] = [];
  const palette = PALETTES[plan.biome];

  const depart = portes.sud ?? { x: Math.floor(REGION_WIDTH / 2), y: REGION_HEIGHT - 2 };
  if (portes.nord) creuserCouloir(tiles, rng, depart, portes.nord, palette.chemin);

  // Une boucle secondaire : elle donne un ailleurs où trouver un objet, plutôt qu'un
  // simple couloir d'un bord à l'autre.
  const detour = { x: rng.int(6, REGION_WIDTH - 7), y: rng.int(6, REGION_HEIGHT - 7) };
  creuserCouloir(tiles, rng, depart, detour, palette.chemin);

  poserRebords(tiles, rng, palette);

  const nombreDresseurs = plan.role === 'grotte' ? 1 : rng.int(1, 3);
  for (let i = 0; i < nombreDresseurs; i++) {
    const place = caseLibre(contexte, {
      x: rng.int(6, REGION_WIDTH - 7),
      y: rng.int(6, REGION_HEIGHT - 7),
    });
    if (!place) continue;
    entites.push({
      kind: 'dresseur',
      id: entiteId(plan.index, 'dresseur', i),
      ...place,
      sprite: rng.pick(['dresseur', 'dresseuse', 'randonneur'] as const),
      dialogue: `dialogue.dresseur.${rng.int(0, DIALOGUES_DRESSEUR - 1)}`,
      dialogueVaincu: `dialogue.dresseurVaincu.${rng.int(0, DIALOGUES_DRESSEUR - 1)}`,
      equipe: composerEquipe(rng, plan, rng.int(1, 2), -1),
      recompense: 120 * plan.niveaux.max,
      vision: 4,
      regard: rng.pick(['nord', 'sud', 'est', 'ouest'] as const),
    });
  }

  const nombreObjets = rng.int(1, 2);
  for (let i = 0; i < nombreObjets; i++) {
    const place = i === 0 ? caseLibre(contexte, detour) : caseLibre(contexte, {
      x: rng.int(4, REGION_WIDTH - 5),
      y: rng.int(4, REGION_HEIGHT - 5),
    });
    if (!place) continue;
    entites.push({
      kind: 'objet',
      id: entiteId(plan.index, 'objet', i),
      ...place,
      item: rng.pick(BUTIN_COMMUN),
      quantite: 1,
    });
  }

  const panneau = caseLibre(contexte, { x: depart.x + 2, y: depart.y - 3 });
  if (panneau) {
    poser(tiles, panneau.x, panneau.y, 'panneau');
    entites.push({
      kind: 'panneau',
      id: entiteId(plan.index, 'panneau', 0),
      ...panneau,
      texte: `dialogue.panneau.${rng.int(0, DIALOGUES_PANNEAU - 1)}`,
    });
  }

  // La pierre d'Éveil dort au fond des grottes, loin du chemin.
  if (plan.role === 'grotte') {
    poserObjetUnique(contexte, entites, 'pierreEvolution', detour, 90);
  }

  return { depart, entites };
};

const GENERATEURS: Record<RegionRole, Generateur> = {
  bourg: genererBourg,
  village: genererVillage,
  arene: genererArene,
  sanctuaire: genererSanctuaire,
  route: genererSauvage,
  bois: genererSauvage,
  grotte: genererSauvage,
};

/**
 * Les rôles qui sèment des zones de rencontre, et donc les seuls où la faune d'un biome
 * s'attrape.
 *
 * Bourg, village et arène n'en posent aucune — une arène partage pourtant le biome des
 * ruines, ce qui a longtemps fait croire cette faune accessible. La liste sert au
 * recensement des espèces d'un monde : la croire plus large qu'elle n'est reviendrait à
 * déclarer complétable un Terradex qui ne l'est pas. Un test la confronte aux régions
 * réellement générées.
 */
export const ROLES_AVEC_FAUNE_ORDINAIRE: readonly RegionRole[] = [
  'route',
  'bois',
  'grotte',
  'sanctuaire',
];

/**
 * Vrai si le biome pose de l'eau, et donc si l'on peut y pêcher.
 *
 * La proportion est tenue par quantile sur toute la grille : dès qu'elle est non nulle,
 * l'eau est présente. Seules les ruines en sont dépourvues.
 */
export function biomeAvecEau(biome: Biome): boolean {
  return PALETTES[biome].eau > 0;
}

// ── Orchestration ────────────────────────────────────────────────────────────

/** Nombre de régénérations avant de se rabattre sur un couloir garanti. */
const TENTATIVES_MAX = 12;

function positionPortes(
  seed: number,
  plan: RegionPlan,
): { sud: Position | null; nord: Position | null } {
  const rng = rngFor(seed, plan.index, 'portes');
  return {
    sud: plan.precedente === null ? null : { x: rng.int(8, REGION_WIDTH - 9), y: REGION_HEIGHT - 2 },
    nord: plan.suivante === null ? null : { x: rng.int(8, REGION_WIDTH - 9), y: 1 },
  };
}

function tenter(seed: number, plan: RegionPlan, tentative: number): Region | null {
  const palette = PALETTES[plan.biome];
  const tiles = new Uint8Array(REGION_WIDTH * REGION_HEIGHT);
  const rng = rngFor(seed, plan.index, 'contenu', tentative);

  poserTerrain(tiles, rngFor(seed, plan.index, 'terrain', tentative).int(0, 0xffffff), palette);
  poserBordure(tiles, palette);

  const portes = positionPortes(seed, plan);
  const contexte: Contexte = { tiles, rng, plan, occupees: new Set() };
  const { depart, entites } = GENERATEURS[plan.role](contexte, portes);

  // Les portes percent la bordure en dernier, une fois tout le reste posé.
  const sorties: Sortie[] = [];
  if (portes.sud && plan.precedente !== null) {
    poser(tiles, portes.sud.x, REGION_HEIGHT - 1, palette.chemin);
    poser(tiles, portes.sud.x, REGION_HEIGHT - 2, palette.chemin);
    sorties.push({ cote: 'sud', x: portes.sud.x, y: REGION_HEIGHT - 1, vers: plan.precedente });
  }
  if (portes.nord && plan.suivante !== null) {
    poser(tiles, portes.nord.x, 0, palette.chemin);
    poser(tiles, portes.nord.x, 1, palette.chemin);
    sorties.push({ cote: 'nord', x: portes.nord.x, y: 0, vers: plan.suivante });
  }

  // Le départ doit être marchable : sinon on apparaît dans un arbre.
  const departValide = marchable(tiles, depart.x, depart.y)
    ? depart
    : trouverProche(tiles, depart) ?? depart;

  const atteignables = zonesAtteignables(tiles, departValide);
  for (const sortie of sorties) {
    if (!atteignables.has(sortie.y * REGION_WIDTH + sortie.x)) return null;
  }
  for (const entite of entites) {
    // On s'adresse à une entité depuis une case voisine, pas depuis la sienne : un
    // panneau occupe une tuile solide, un marchand se tient derrière son comptoir.
    // Le critère est donc « une case adjacente est atteignable », pas « la case
    // elle-même l'est ». Une entité enfermée derrière un rocher, en revanche, est
    // inatteignable et bloque la progression si elle porte un objet : on régénère.
    if (!accessibleDepuis(atteignables, entite)) return null;
  }

  return {
    index: plan.index,
    role: plan.role,
    biome: plan.biome,
    nom: plan.nom,
    niveaux: plan.niveaux,
    typeArene: plan.typeArene,
    complement: plan.complement,
    width: REGION_WIDTH,
    height: REGION_HEIGHT,
    tiles,
    depart: departValide,
    sorties,
    entites,
  };
}

/** Vrai si la case, ou l'une de ses voisines orthogonales, est atteignable. */
export function accessibleDepuis(atteignables: ReadonlySet<number>, position: Position): boolean {
  if (atteignables.has(position.y * REGION_WIDTH + position.x)) return true;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => atteignables.has((position.y + dy!) * REGION_WIDTH + (position.x + dx!)));
}

function trouverProche(tiles: Uint8Array, vise: Position): Position | null {
  for (let rayon = 1; rayon < 12; rayon++) {
    for (let dy = -rayon; dy <= rayon; dy++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        const x = vise.x + dx;
        const y = vise.y + dy;
        if (x <= 0 || y <= 0 || x >= REGION_WIDTH - 1 || y >= REGION_HEIGHT - 1) continue;
        if (marchable(tiles, x, y)) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Génère une région, en réessayant tant que la connectivité n'est pas garantie.
 *
 * Le dernier recours creuse un couloir droit du départ à chaque sortie : moins joli,
 * mais toujours jouable. Mieux vaut une région quelconque qu'une partie bloquée.
 */
export function genererRegion(seed: number, plan: RegionPlan): Region {
  for (let tentative = 0; tentative < TENTATIVES_MAX; tentative++) {
    const region = tenter(seed, plan, tentative);
    if (region) return region;
  }
  return regionDeSecours(seed, plan);
}

function regionDeSecours(seed: number, plan: RegionPlan): Region {
  const palette = PALETTES[plan.biome];
  const tiles = new Uint8Array(REGION_WIDTH * REGION_HEIGHT);
  for (let y = 0; y < REGION_HEIGHT; y++) {
    for (let x = 0; x < REGION_WIDTH; x++) poser(tiles, x, y, palette.sol);
  }
  poserBordure(tiles, palette);

  const portes = positionPortes(seed, plan);
  const depart = portes.sud ?? { x: Math.floor(REGION_WIDTH / 2), y: REGION_HEIGHT - 2 };
  const sorties: Sortie[] = [];

  for (const [cote, porte, vers] of [
    ['sud', portes.sud, plan.precedente],
    ['nord', portes.nord, plan.suivante],
  ] as const) {
    if (!porte || vers === null) continue;
    for (let y = 1; y < REGION_HEIGHT - 1; y++) poser(tiles, porte.x, y, palette.chemin);
    for (let x = Math.min(porte.x, depart.x); x <= Math.max(porte.x, depart.x); x++) {
      poser(tiles, x, REGION_HEIGHT - 2, palette.chemin);
    }
    poser(tiles, porte.x, cote === 'sud' ? REGION_HEIGHT - 1 : 0, palette.chemin);
    sorties.push({ cote, x: porte.x, y: cote === 'sud' ? REGION_HEIGHT - 1 : 0, vers });
  }

  // Une arène sans champion est une partie qu'on ne peut plus finir : pas de badge, donc
  // pas de porte nord, donc pas de sanctuaire. Le dernier recours dessine un couloir nu,
  // mais il ne peut pas se permettre de laisser le champion derrière lui.
  const entites: Entite[] = [];
  if (plan.role === 'arene') {
    const surLeChemin = { x: depart.x, y: Math.max(2, Math.floor(REGION_HEIGHT / 2)) };
    poser(tiles, surLeChemin.x, surLeChemin.y, palette.chemin);
    entites.push(creerChampion(rngFor(seed, plan.index, 'secours'), plan, surLeChemin));
  }

  return {
    index: plan.index,
    role: plan.role,
    biome: plan.biome,
    nom: plan.nom,
    niveaux: plan.niveaux,
    typeArene: plan.typeArene,
    complement: plan.complement,
    width: REGION_WIDTH,
    height: REGION_HEIGHT,
    tiles,
    depart,
    sorties,
    entites,
  };
}

/** Réexporté pour les tests et l'affichage de la carte. */
export { zonesAtteignables };
