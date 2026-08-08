/**
 * Le canvas de jeu et sa mise à l'échelle.
 *
 * Le rendu se fait dans une résolution virtuelle agrandie par un facteur **entier** :
 * c'est ce qui garde les pixels carrés, sans flou d'interpolation.
 *
 * Les **deux dimensions** s'adaptent au format de l'écran. Figées à 320×208, elles
 * laissaient 160 pixels de marge noire de chaque côté en 1080p et 320 en 1440p, et sur
 * un téléphone en portrait le jeu occupait le tiers supérieur de la page. Élargir la
 * vue plutôt que grossir les pixels remplit l'écran sans rien déformer : on voit
 * simplement un peu plus de monde.
 *
 * Aucune scène ne code sa mise en page en dur : toutes lisent ces constantes, ce qui
 * rend les dimensions variables sans surprise. Les liaisons de module ESM étant
 * vivantes, une réaffectation ici se propage à tous les appelants.
 */

export const TILE_SIZE = 16;

/**
 * Bornes des dimensions virtuelles, en pixels.
 *
 * Les minimums sont ceux pour lesquels chaque écran a été dessiné : en dessous, les
 * panneaux ne tiendraient plus. Les maximums ne sont qu'un garde-fou : ils ne mordent
 * qu'à l'échelle 1, donc sur téléphone, là où remplir l'écran importe le plus. Aux
 * échelles supérieures, c'est le facteur entier qui borne naturellement la vue.
 */
const LARGEUR_MIN = 320;
const LARGEUR_MAX = 1024;
const HAUTEUR_MIN = 208;
const HAUTEUR_MAX = 1024;

/**
 * Dimensions virtuelles courantes. Variables, mais jamais pendant une trame : elles ne
 * changent qu'au redimensionnement de la fenêtre.
 */
export let VIRTUAL_WIDTH = LARGEUR_MIN;
export let VIRTUAL_HEIGHT = HAUTEUR_MIN;

export interface Cadrage {
  /** Facteur d'agrandissement, entier dès que la place le permet. */
  readonly scale: number;
  readonly largeur: number;
  readonly hauteur: number;
}

/**
 * Décide de l'échelle et des dimensions virtuelles pour une place donnée.
 *
 * L'échelle est choisie d'abord, entière, comme le plus grand facteur que les deux
 * dimensions minimales peuvent payer. Les dimensions remplissent ensuite tout ce qui
 * reste : c'est ce qui fait la différence entre un jeu qui occupe l'écran et un jeu qui
 * flotte au milieu de bandes noires. Fonction pure, donc éprouvable sans navigateur.
 */
export function cadrer(largeurDispo: number, hauteurDispo: number): Cadrage {
  const brut = Math.min(largeurDispo / LARGEUR_MIN, hauteurDispo / HAUTEUR_MIN);
  const scale = brut >= 1 ? Math.floor(brut) : brut;

  // Pas d'arrondi à la dimension paire : il coûtait jusqu'à un facteur d'échelle de
  // marge résiduelle, pour rien — le peintre arrondit déjà chaque coordonnée, et un
  // centre à la demi-unité ne se voit nulle part.
  return {
    scale,
    largeur: Math.max(LARGEUR_MIN, Math.min(LARGEUR_MAX, Math.floor(largeurDispo / scale))),
    hauteur: Math.max(HAUTEUR_MIN, Math.min(HAUTEUR_MAX, Math.floor(hauteurDispo / scale))),
  };
}

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

  /**
   * Le canvas se dimensionne d'après la place que son conteneur lui laisse réellement,
   * mesurée à chaque changement de taille.
   *
   * Réserver un pourcentage fixe de la fenêtre — la version précédente prenait 62 % de
   * la hauteur en portrait — se trompe dès que les contrôles tactiles changent de
   * taille, que le clavier logiciel s'ouvre ou que la barre d'adresse se rétracte. La
   * mesure directe est juste dans tous ces cas.
   */
  /** Dernière boîte de contenu observée, rembourrage exclu. */
  let contenu: { largeur: number; hauteur: number } | null = null;

  const resize = (): void => {
    // `contentRect` exclut le rembourrage, `clientWidth` non : mesurer avec le second
    // ferait déborder le canvas de la largeur du rembourrage.
    const largeurDispo = contenu?.largeur ?? host.clientWidth ?? window.innerWidth;
    const hauteurDispo = contenu?.hauteur ?? host.clientHeight ?? window.innerHeight;
    if (largeurDispo <= 0 || hauteurDispo <= 0) return;

    const cadrage = cadrer(largeurDispo, hauteurDispo);
    scale = cadrage.scale;
    VIRTUAL_WIDTH = cadrage.largeur;
    VIRTUAL_HEIGHT = cadrage.hauteur;

    // Changer le buffer réinitialise le contexte, filtrage compris : on le réaffirme
    // juste après, sinon le premier rendu qui suit sort flou.
    if (canvas.width !== VIRTUAL_WIDTH) canvas.width = VIRTUAL_WIDTH;
    if (canvas.height !== VIRTUAL_HEIGHT) canvas.height = VIRTUAL_HEIGHT;
    canvas.style.width = `${Math.round(VIRTUAL_WIDTH * scale)}px`;
    canvas.style.height = `${Math.round(VIRTUAL_HEIGHT * scale)}px`;
    ctx.imageSmoothingEnabled = false;
  };

  resize();
  const observateur =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver((entrees) => {
          const rect = entrees[0]?.contentRect;
          if (rect) contenu = { largeur: rect.width, hauteur: rect.height };
          resize();
        })
      : null;
  observateur?.observe(host);
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
      observateur?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      canvas.remove();
    },
  };
}
