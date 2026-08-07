/**
 * Le canvas de jeu et sa mise à l'échelle.
 *
 * Terravia rend toujours dans une résolution virtuelle fixe (320×208, soit 20×13 tuiles
 * de 16 px). Le buffer interne du canvas ne change jamais de taille : c'est le CSS qui
 * l'agrandit, avec `image-rendering: pixelated`. Deux conséquences qu'on veut :
 *
 *   1. toute la mise en page de l'UI (menus, combat) raisonne en coordonnées fixes,
 *      donc aucun calcul responsive dans le code de jeu ;
 *   2. le rendu reste net à toute échelle, sans flou d'interpolation.
 *
 * L'espace laissé libre autour du canvas n'est pas perdu : sur mobile, les contrôles
 * tactiles s'y installent.
 */

export const VIRTUAL_WIDTH = 320;
export const VIRTUAL_HEIGHT = 208;
export const TILE_SIZE = 16;

export interface Viewport {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Facteur d'agrandissement CSS actuel (entier dès que la place le permet). */
  readonly scale: number;
  /** Convertit un point de la page en coordonnées virtuelles. */
  pageToVirtual(pageX: number, pageY: number): { x: number; y: number };
  destroy(): void;
}

export function createViewport(host: HTMLElement): Viewport {
  const canvas = document.createElement('canvas');
  canvas.width = VIRTUAL_WIDTH;
  canvas.height = VIRTUAL_HEIGHT;
  canvas.setAttribute('aria-label', 'Fenêtre de jeu Terravia');
  canvas.setAttribute('role', 'img');

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error("Le canvas 2D n'est pas disponible dans ce navigateur.");
  ctx.imageSmoothingEnabled = false;

  host.appendChild(canvas);

  let scale = 1;

  const resize = (): void => {
    // On réserve une marge verticale sur les écrans étroits (portrait) pour les
    // contrôles tactiles : le jeu occupe alors les deux tiers hauts.
    const isPortrait = window.innerHeight > window.innerWidth;
    const availableWidth = window.innerWidth;
    const availableHeight = isPortrait ? window.innerHeight * 0.62 : window.innerHeight;

    const raw = Math.min(availableWidth / VIRTUAL_WIDTH, availableHeight / VIRTUAL_HEIGHT);
    // Échelle entière dès qu'on a la place : c'est ce qui garde les pixels carrés.
    scale = raw >= 1 ? Math.floor(raw) : raw;

    canvas.style.width = `${Math.round(VIRTUAL_WIDTH * scale)}px`;
    canvas.style.height = `${Math.round(VIRTUAL_HEIGHT * scale)}px`;
    // Le contexte perd son état quand la taille du buffer change ; ici elle ne change
    // pas, mais on réaffirme le filtrage au cas où le navigateur le réinitialise.
    ctx.imageSmoothingEnabled = false;
  };

  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', resize, { passive: true });

  return {
    canvas,
    ctx,
    get scale() {
      return scale;
    },
    pageToVirtual(pageX, pageY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (pageX - rect.left) / (rect.width / VIRTUAL_WIDTH),
        y: (pageY - rect.top) / (rect.height / VIRTUAL_HEIGHT),
      };
    },
    destroy() {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      canvas.remove();
    },
  };
}
