/**
 * Le canvas de jeu et sa mise à l'échelle.
 *
 * Le rendu se fait dans une résolution virtuelle agrandie par un facteur **entier** :
 * c'est ce qui garde les pixels carrés, sans flou d'interpolation.
 *
 * La hauteur est fixe — toute la mise en page verticale y est réglée. La **largeur**,
 * elle, s'adapte au format de l'écran. Avec une largeur figée à 320, un écran 16:9
 * laissait 160 pixels de marge noire de chaque côté en 1080p, et 320 en 1440p : le jeu
 * flottait au milieu de la page. Élargir la vue plutôt que grossir les pixels remplit
 * l'écran sans rien déformer, et montre simplement un peu plus de monde.
 *
 * Aucune scène ne code sa mise en page en dur : toutes lisent ces constantes, ce qui
 * rend la largeur variable sans surprise. Les liaisons de module ESM étant vivantes,
 * une réaffectation ici se propage à tous les appelants.
 */

/** Hauteur virtuelle, invariable : 13 tuiles de 16 pixels. */
export const VIRTUAL_HEIGHT = 208;
export const TILE_SIZE = 16;

/** Bornes de la largeur virtuelle, en pixels. */
const LARGEUR_MIN = 320;
/**
 * Au-delà, la vue s'étire sans profit : sur un écran ultra-large, on verrait la moitié
 * de la région d'un coup et les panneaux d'interface se perdraient dans le vide.
 */
const LARGEUR_MAX = 448;

/**
 * Largeur virtuelle courante. Variable, mais jamais pendant une trame : elle ne change
 * qu'au redimensionnement de la fenêtre.
 */
export let VIRTUAL_WIDTH = LARGEUR_MIN;

export interface Cadrage {
  /** Facteur d'agrandissement, entier dès que la place le permet. */
  readonly scale: number;
  readonly largeur: number;
}

/**
 * Décide de l'échelle et de la largeur virtuelle pour une place donnée.
 *
 * L'échelle se lit sur la **hauteur** seule, la seule dimension fixe ; la largeur
 * remplit ensuite ce qui reste. Fonction pure, donc éprouvable sans navigateur — c'est
 * là que se joue la différence entre un jeu qui remplit l'écran et un jeu qui flotte au
 * milieu d'une page noire.
 */
export function cadrer(largeurDispo: number, hauteurDispo: number): Cadrage {
  // La hauteur commande, mais un écran étroit — un téléphone tenu en portrait — ne peut
  // pas toujours payer le facteur qu'elle autorise : à s'en tenir à elle, le canvas
  // débordait de la page. On retient donc le plus contraignant des deux.
  const brut = Math.min(hauteurDispo / VIRTUAL_HEIGHT, largeurDispo / LARGEUR_MIN);
  const scale = brut >= 1 ? Math.floor(brut) : brut;
  const voulue = Math.floor(largeurDispo / scale);
  // Largeur paire : une largeur impaire décentrerait d'un demi-pixel tout ce que les
  // scènes centrent sur `VIRTUAL_WIDTH / 2`.
  const largeur = Math.max(LARGEUR_MIN, Math.min(LARGEUR_MAX, voulue - (voulue % 2)));
  return { scale, largeur };
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

    // Changer le buffer réinitialise le contexte, filtrage compris : on le réaffirme
    // juste après, sinon le premier rendu qui suit sort flou.
    if (canvas.width !== VIRTUAL_WIDTH) canvas.width = VIRTUAL_WIDTH;
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
