/**
 * Primitives de dessin : texte bitmap, cadres, barres, sprites.
 *
 * Tout le reste de l'interface passe par ici. Aucun autre fichier n'appelle `drawImage`
 * ni ne connaît la disposition des planches — ce qui permet de changer un atlas sans
 * toucher aux écrans.
 */

import type { Assets } from '../core/assets.ts';
import { creerTeinturier } from '../core/assets.ts';
import type { CharacterId, Direction } from '../world/characterIds.ts';
import type { ItemId } from '../data/items.ts';
import type { SpeciesId } from '../data/species.ts';
import type { ElementType } from '../data/types.ts';
import type { TileId } from '../world/tiles.ts';

export const COULEURS = {
  texte: '#2b2b33',
  texteAttenue: '#6d6a7a',
  texteInverse: '#f4f1e6',
  texteAccent: '#a35a1c',
  fond: '#0b0f14',
  panneau: '#f4f1e6',
  selection: '#e0a03c',
  pvHaut: '#4fbf6a',
  pvMoyen: '#e8c33c',
  pvBas: '#e05a4a',
  pvFond: '#3a3a45',
  xp: '#4bb3dd',
  ombre: 'rgba(11, 15, 20, 0.55)',
} as const;

export interface OptionsTexte {
  readonly couleur?: string;
  /** Ombre portée d'un pixel : indispensable pour lire du texte sur le décor. */
  readonly ombre?: boolean;
}

export class Peintre {
  readonly ctx: CanvasRenderingContext2D;
  readonly assets: Assets;
  private readonly teindrePolice: (couleur: string) => CanvasImageSource;

  // Les champs sont affectés explicitement plutôt que déclarés en paramètres : les
  // propriétés de constructeur TypeScript ne survivent pas au simple dépouillement de
  // types de Node, et on tient à ce que chaque fichier reste exécutable sans bundler.
  constructor(ctx: CanvasRenderingContext2D, assets: Assets) {
    this.ctx = ctx;
    this.assets = assets;
    this.teindrePolice = creerTeinturier(assets.police.image);
  }

  // ── Formes ─────────────────────────────────────────────────────────────────

  remplir(x: number, y: number, largeur: number, hauteur: number, couleur: string): void {
    this.ctx.fillStyle = couleur;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(largeur), Math.round(hauteur));
  }

  contour(x: number, y: number, largeur: number, hauteur: number, couleur: string): void {
    this.remplir(x, y, largeur, 1, couleur);
    this.remplir(x, y + hauteur - 1, largeur, 1, couleur);
    this.remplir(x, y, 1, hauteur, couleur);
    this.remplir(x + largeur - 1, y, 1, hauteur, couleur);
  }

  // ── Texte ──────────────────────────────────────────────────────────────────

  largeurTexte(texte: string): number {
    return [...texte].length * this.assets.police.metriques.cellWidth;
  }

  get hauteurLigne(): number {
    return this.assets.police.metriques.cellHeight;
  }

  texte(contenu: string, x: number, y: number, options: OptionsTexte = {}): void {
    if (options.ombre) {
      this.dessinerTexte(contenu, x + 1, y + 1, COULEURS.ombre);
    }
    this.dessinerTexte(contenu, x, y, options.couleur ?? COULEURS.texte);
  }

  private dessinerTexte(contenu: string, x: number, y: number, couleur: string): void {
    const { metriques, index } = this.assets.police;
    const source = this.teindrePolice(couleur);
    let curseur = Math.round(x);
    for (const caractere of contenu) {
      const position = index.get(caractere);
      if (position !== undefined) {
        const sx = (position % metriques.columns) * metriques.cellWidth;
        const sy = Math.floor(position / metriques.columns) * metriques.cellHeight;
        this.ctx.drawImage(
          source,
          sx,
          sy,
          metriques.cellWidth,
          metriques.cellHeight,
          curseur,
          Math.round(y),
          metriques.cellWidth,
          metriques.cellHeight,
        );
      }
      curseur += metriques.cellWidth;
    }
  }

  texteCentre(contenu: string, centreX: number, y: number, options: OptionsTexte = {}): void {
    this.texte(contenu, centreX - this.largeurTexte(contenu) / 2, y, options);
  }

  texteDroite(contenu: string, droiteX: number, y: number, options: OptionsTexte = {}): void {
    this.texte(contenu, droiteX - this.largeurTexte(contenu), y, options);
  }

  /**
   * Découpe un texte en lignes tenant dans une largeur donnée.
   * La coupe se fait aux espaces ; un mot trop long est laissé tel quel plutôt que
   * tronqué — mieux vaut un débordement visible qu'un texte amputé en silence.
   */
  decouper(contenu: string, largeurMax: number): string[] {
    const parLigne = Math.max(1, Math.floor(largeurMax / this.assets.police.metriques.cellWidth));
    const lignes: string[] = [];
    for (const paragraphe of contenu.split('\n')) {
      let ligne = '';
      for (const mot of paragraphe.split(' ')) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if ([...essai].length > parLigne && ligne) {
          lignes.push(ligne);
          ligne = mot;
        } else {
          ligne = essai;
        }
      }
      lignes.push(ligne);
    }
    return lignes;
  }

  /**
   * Texte centré et découpé sur plusieurs lignes. Renvoie la hauteur occupée.
   *
   * À 320 pixels de large, une phrase de plus de cinquante caractères sort du cadre.
   * Tout texte long affiché hors boîte de dialogue doit donc passer par ici — un
   * `texteCentre` brut déborde silencieusement.
   */
  texteCentreBloc(
    contenu: string,
    centreX: number,
    y: number,
    largeurMax: number,
    options: OptionsTexte = {},
  ): number {
    const lignes = this.decouper(contenu, largeurMax);
    lignes.forEach((ligne, index) => {
      this.texteCentre(ligne, centreX, y + index * this.hauteurLigne, options);
    });
    return lignes.length * this.hauteurLigne;
  }

  /** Texte aligné à gauche et découpé. Renvoie la hauteur occupée. */
  texteBloc(contenu: string, x: number, y: number, largeurMax: number, options: OptionsTexte = {}): number {
    const lignes = this.decouper(contenu, largeurMax);
    lignes.forEach((ligne, index) => {
      this.texte(ligne, x, y + index * this.hauteurLigne, options);
    });
    return lignes.length * this.hauteurLigne;
  }

  // ── Cadres ─────────────────────────────────────────────────────────────────

  /** Cadre étirable en neuf morceaux, à n'importe quelle taille. */
  panneau(x: number, y: number, largeur: number, hauteur: number): void {
    const image = this.assets.cadre;
    const c = Math.floor(image.naturalWidth / 3);
    const px = Math.round(x);
    const py = Math.round(y);
    const pw = Math.max(c * 2, Math.round(largeur));
    const ph = Math.max(c * 2, Math.round(hauteur));

    const parts: Array<[number, number, number, number, number, number, number, number]> = [
      [0, 0, c, c, px, py, c, c],
      [c, 0, c, c, px + c, py, pw - 2 * c, c],
      [2 * c, 0, c, c, px + pw - c, py, c, c],
      [0, c, c, c, px, py + c, c, ph - 2 * c],
      [c, c, c, c, px + c, py + c, pw - 2 * c, ph - 2 * c],
      [2 * c, c, c, c, px + pw - c, py + c, c, ph - 2 * c],
      [0, 2 * c, c, c, px, py + ph - c, c, c],
      [c, 2 * c, c, c, px + c, py + ph - c, pw - 2 * c, c],
      [2 * c, 2 * c, c, c, px + pw - c, py + ph - c, c, c],
    ];
    for (const [sx, sy, sw, sh, dx, dy, dw, dh] of parts) {
      if (dw <= 0 || dh <= 0) continue;
      this.ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  // ── Barres ─────────────────────────────────────────────────────────────────

  barre(x: number, y: number, largeur: number, hauteur: number, ratio: number, couleur: string): void {
    const borne = Math.max(0, Math.min(1, ratio));
    this.remplir(x, y, largeur, hauteur, COULEURS.pvFond);
    // Au moins un pixel tant qu'il reste des points de vie : une barre vide sur une
    // créature encore debout se lit comme un bug.
    const remplie = borne > 0 ? Math.max(1, Math.round((largeur - 2) * borne)) : 0;
    this.remplir(x + 1, y + 1, remplie, hauteur - 2, couleur);
  }

  barrePv(x: number, y: number, largeur: number, ratio: number): void {
    const couleur = ratio > 0.5 ? COULEURS.pvHaut : ratio > 0.2 ? COULEURS.pvMoyen : COULEURS.pvBas;
    this.barre(x, y, largeur, 5, ratio, couleur);
  }

  barreXp(x: number, y: number, largeur: number, ratio: number): void {
    this.barre(x, y, largeur, 3, ratio, COULEURS.xp);
  }

  // ── Sprites ────────────────────────────────────────────────────────────────

  tuile(tile: TileId, frame: number, x: number, y: number): void {
    const { image, tileSize, frameCount, index } = this.assets.tileset;
    const colonne = index.get(tile);
    if (colonne === undefined) return;
    this.ctx.drawImage(
      image,
      colonne * tileSize,
      (frame % frameCount) * tileSize,
      tileSize,
      tileSize,
      Math.round(x),
      Math.round(y),
      tileSize,
      tileSize,
    );
  }

  personnage(id: CharacterId, direction: Direction, frame: number, x: number, y: number): void {
    const { image, width, height, frames, directions, index } = this.assets.personnages;
    const bloc = index.get(id);
    if (bloc === undefined) return;
    // L'ouest est le miroir de l'est : dessiner les deux aurait doublé la planche.
    const miroir = direction === 'ouest';
    const nomDirection = miroir ? 'est' : direction;
    const ligneDirection = Math.max(0, directions.indexOf(nomDirection));
    const sx = (frame % frames) * width;
    const sy = (bloc * directions.length + ligneDirection) * height;

    const dx = Math.round(x);
    const dy = Math.round(y);
    if (miroir) {
      this.ctx.save();
      this.ctx.translate(dx + width, dy);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(image, sx, sy, width, height, 0, 0, width, height);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(image, sx, sy, width, height, dx, dy, width, height);
    }
  }

  creature(
    species: SpeciesId,
    vue: 'face' | 'dos',
    x: number,
    y: number,
    options: { readonly echelle?: number; readonly opacite?: number } = {},
  ): void {
    const { image, size, views, index } = this.assets.creatures;
    const ligne = index.get(species);
    if (ligne === undefined) return;
    const colonne = Math.max(0, views.indexOf(vue));
    const echelle = options.echelle ?? 1;
    const taille = Math.round(size * echelle);

    if (options.opacite !== undefined) this.ctx.globalAlpha = options.opacite;
    this.ctx.drawImage(
      image,
      colonne * size,
      ligne * size,
      size,
      size,
      Math.round(x),
      Math.round(y),
      taille,
      taille,
    );
    this.ctx.globalAlpha = 1;
  }

  icone(item: ItemId, x: number, y: number): void {
    const { image, size, order } = this.assets.icones;
    const colonne = order.indexOf(item);
    if (colonne < 0) return;
    this.ctx.drawImage(image, colonne * size, 0, size, size, Math.round(x), Math.round(y), size, size);
  }

  /** Plaque de type, avec son nom écrit par-dessus dans la langue courante. */
  plaqueType(type: ElementType, libelle: string, x: number, y: number): void {
    const { image, width, height, order } = this.assets.plaques;
    const ligne = order.indexOf(type);
    if (ligne < 0) return;
    this.ctx.drawImage(image, 0, ligne * height, width, height, Math.round(x), Math.round(y), width, height);
    this.texteCentre(libelle.toUpperCase(), x + width / 2, y + 1, {
      couleur: COULEURS.texteInverse,
      ombre: true,
    });
  }

  get largeurPlaque(): number {
    return this.assets.plaques.width;
  }
}
