/**
 * Chargement des planches d'art et de leurs métadonnées.
 *
 * Rien n'est deviné : chaque planche est accompagnée du JSON produit par `npm run art`,
 * qui décrit sa disposition. Le jeu ne suppose donc jamais qu'une créature est à la
 * ligne *n* — il le lit.
 *
 * La police est publiée en blanc pur. Le jeu la **teinte** à l'exécution vers un canvas
 * hors écran, une fois par couleur : une seule image sert à toutes les couleurs de
 * texte, et le coût est payé au chargement, pas à chaque trame.
 */

import type { CharacterId } from '../world/characterIds.ts';
import type { SpeciesId } from '../data/species.ts';
import type { TileId } from '../world/tiles.ts';

export interface MetriquesPolice {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columns: number;
  readonly charset: string;
}

export interface Assets {
  readonly police: {
    readonly image: HTMLImageElement;
    readonly metriques: MetriquesPolice;
    /** Position d'un caractère dans l'atlas ; absent = caractère non dessiné. */
    readonly index: ReadonlyMap<string, number>;
  };
  readonly tileset: {
    readonly image: HTMLImageElement;
    readonly tileSize: number;
    readonly frameCount: number;
    readonly order: readonly TileId[];
    readonly index: ReadonlyMap<TileId, number>;
  };
  readonly cadre: HTMLImageElement;
  readonly plaques: {
    readonly image: HTMLImageElement;
    readonly width: number;
    readonly height: number;
    readonly order: readonly string[];
  };
  readonly icones: {
    readonly image: HTMLImageElement;
    readonly size: number;
    readonly order: readonly string[];
  };
  /** Écussons d'arène, un par type élémentaire. */
  readonly insignes: {
    readonly image: HTMLImageElement;
    readonly size: number;
    readonly order: readonly string[];
  };
  readonly personnages: {
    readonly image: HTMLImageElement;
    readonly width: number;
    readonly height: number;
    readonly frames: number;
    readonly directions: readonly string[];
    readonly order: readonly CharacterId[];
    readonly index: ReadonlyMap<CharacterId, number>;
  };
  readonly creatures: {
    readonly image: HTMLImageElement;
    readonly size: number;
    readonly views: readonly string[];
    readonly order: readonly SpeciesId[];
    readonly index: ReadonlyMap<SpeciesId, number>;
  };
}

function racine(): string {
  // `BASE_URL` vaut « /terravia/ » en production et « / » en développement : passer par
  // lui est ce qui évite des chemins absolus qui renverraient 404 une fois déployés.
  return `${import.meta.env.BASE_URL}art/`;
}

function chargerImage(nom: string): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resoudre(image));
    image.addEventListener('error', () => rejeter(new Error(`Planche introuvable : ${nom}`)));
    image.src = `${racine()}${nom}`;
  });
}

async function chargerJson<T>(nom: string): Promise<T> {
  const reponse = await fetch(`${racine()}${nom}`);
  if (!reponse.ok) throw new Error(`Métadonnées introuvables : ${nom}`);
  return (await reponse.json()) as T;
}

function indexer<T extends string>(order: readonly T[]): Map<T, number> {
  return new Map(order.map((valeur, index) => [valeur, index]));
}

export async function chargerAssets(): Promise<Assets> {
  const [police, tileset, cadre, plaques, icones, insignes, personnages, creatures] = await Promise.all([
    chargerImage('font.png'),
    chargerImage('tileset.png'),
    chargerImage('frame.png'),
    chargerImage('badges.png'),
    chargerImage('icons.png'),
    chargerImage('insignes.png'),
    chargerImage('characters.png'),
    chargerImage('creatures.png'),
  ]);

  const [metriquesPolice, metaTileset, metaUi, metaPersonnages, metaCreatures] = await Promise.all([
    chargerJson<MetriquesPolice>('font.json'),
    chargerJson<{ tileSize: number; frameCount: number; order: TileId[] }>('tileset.json'),
    chargerJson<{
      frameSlice: number;
      badge: { width: number; height: number; order: string[] };
      insigne: { size: number; order: string[] };
      icons: { size: number; order: string[] };
    }>('ui.json'),
    chargerJson<{
      width: number;
      height: number;
      frames: number;
      directions: string[];
      order: CharacterId[];
    }>('characters.json'),
    chargerJson<{ size: number; views: string[]; order: SpeciesId[] }>('creatures.json'),
  ]);

  return {
    police: {
      image: police,
      metriques: metriquesPolice,
      index: new Map([...metriquesPolice.charset].map((char, index) => [char, index])),
    },
    tileset: {
      image: tileset,
      tileSize: metaTileset.tileSize,
      frameCount: metaTileset.frameCount,
      order: metaTileset.order,
      index: indexer(metaTileset.order),
    },
    cadre,
    plaques: {
      image: plaques,
      width: metaUi.badge.width,
      height: metaUi.badge.height,
      order: metaUi.badge.order,
    },
    icones: { image: icones, size: metaUi.icons.size, order: metaUi.icons.order },
    insignes: { image: insignes, size: metaUi.insigne.size, order: metaUi.insigne.order },
    personnages: {
      image: personnages,
      width: metaPersonnages.width,
      height: metaPersonnages.height,
      frames: metaPersonnages.frames,
      directions: metaPersonnages.directions,
      order: metaPersonnages.order,
      index: indexer(metaPersonnages.order),
    },
    creatures: {
      image: creatures,
      size: metaCreatures.size,
      views: metaCreatures.views,
      order: metaCreatures.order,
      index: indexer(metaCreatures.order),
    },
  };
}

/**
 * Recolore une image blanche vers une couleur donnée, en gardant sa transparence.
 * Le résultat est mis en cache : la teinture d'une couleur ne se paie qu'une fois.
 */
export function creerTeinturier(image: HTMLImageElement): (couleur: string) => CanvasImageSource {
  const cache = new Map<string, HTMLCanvasElement>();

  return (couleur) => {
    const existant = cache.get(couleur);
    if (existant) return existant;

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    // `source-in` ne peint que là où l'image est déjà opaque : les contours des glyphes
    // sont donc préservés au pixel près.
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = couleur;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    cache.set(couleur, canvas);
    return canvas;
  };
}
