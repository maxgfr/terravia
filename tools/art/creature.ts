/**
 * Générateur de sprites de créatures.
 *
 * Une créature n'est pas dessinée à la main ni tirée au hasard : elle est **assemblée**
 * à partir de ce que son espèce déclare — une silhouette prise dans un vocabulaire de dix
 * formes, des attributs qui s'y ajoutent, un gabarit. Les couleurs viennent de son type.
 * Le hasard, semé par l'identifiant de l'espèce, ne décide que des détails (l'inclinaison
 * d'une corne, la position d'une tache).
 *
 * Conséquence : deux créatures du même type se ressemblent sans se confondre, et une
 * espèce garde exactement le même sprite d'une génération à l'autre.
 *
 * Le rendu se fait en trois temps, comme en pixel art dessiné :
 *   1. les volumes, posés à plat dans une teinte unique ;
 *   2. l'ombrage, calculé pour tout le corps d'un coup, lumière en haut à gauche ;
 *   3. les détails — yeux, gemmes, marquages — posés par-dessus, donc jamais ombrés.
 */

import { rngFor, type Rng } from '../../src/core/rng.ts';
import { SPECIES, SPECIES_IDS, type Apparence, type Species, type SpeciesId } from '../../src/data/species.ts';
import { TYPE_PALETTES, type Palette } from './palette.ts';
import {
  clamp,
  createSurface,
  drawLine,
  fillEllipse,
  fillRect,
  getPixel,
  hex,
  mapPixels,
  mirrorLeftToRight,
  outline,
  setPixel,
  type Color,
  type MutableSurface,
} from './surface.ts';

export const CREATURE_SIZE = 64;
export const CREATURE_VIEWS = ['face', 'dos'] as const;
export type CreatureView = (typeof CREATURE_VIEWS)[number];

/**
 * Teintes de travail. Tout le corps est posé dans l'une des trois, puis l'ombrage les
 * remplace par la rampe du type.
 *
 * Les deux variantes existent parce que l'ombrage seul, calculé sur la position, ne
 * produit que des dégradés doux : parfait pour un flanc arrondi, inutilisable pour une
 * facette de cristal ou un anneau de serpent. Un peintre qui pose `FLAT_OMBRE` dit « ici
 * c'est une face qui ne prend pas la lumière », quelle que soit la hauteur du pixel.
 */
const FLAT: Color = [255, 0, 255, 255];
const FLAT_OMBRE: Color = [190, 0, 190, 255];
const FLAT_CLAIR: Color = [255, 140, 255, 255];

/** Décalage d'indice dans la rampe pour chaque teinte de travail. */
const MARQUEURS: ReadonlyArray<readonly [Color, number]> = [
  [FLAT, 0],
  [FLAT_OMBRE, -1],
  [FLAT_CLAIR, 1],
];

const EYE_WHITE = hex('#f4f1e6');
const EYE_DARK = hex('#1a1a22');

interface Brush {
  readonly surface: MutableSurface;
  readonly palette: Palette;
  readonly accent: Palette;
  readonly rng: Rng;
  readonly view: CreatureView;
  /** 0,72 pour un petit gabarit, 1 pour un grand. */
  readonly echelle: number;
}

/** Marge conservée en haut du cadre : un sprite qui touche le bord paraît coupé. */
const MARGE_HAUTE = 2;

/**
 * Longueur maximale d'un attribut qui monte, pour qu'il reste dans le cadre.
 *
 * Sans cette limite, une créature de grand gabarit portant crête et cornes voit ses
 * pointes sortir du sprite : elles disparaissent en jeu, tronquées net.
 */
function plafond(depart: number, souhaitee: number, penteVerticale = 1): number {
  return Math.max(2, Math.min(souhaitee, (depart - MARGE_HAUTE) / penteVerticale));
}

/** Ce qu'une silhouette renvoie pour que les attributs sachent où s'accrocher. */
interface Anatomie {
  readonly tete: { x: number; y: number; rx: number; ry: number };
  readonly corps: { x: number; y: number; rx: number; ry: number };
  /** Ligne du sol : où poser l'ombre portée. */
  readonly sol: number;
}

const CENTER = CREATURE_SIZE / 2;
const GROUND = 58;

function ell(brush: Brush, cx: number, cy: number, rx: number, ry: number): void {
  fillEllipse(brush.surface, cx, cy, rx, ry, FLAT);
}

/**
 * Membre vertical. Les pattes sont posées avant le corps et doivent **dépasser** sous
 * lui : c'est la seule chose qui distingue un animal d'une masse posée au sol.
 */
function patte(brush: Brush, x: number, haut: number, largeur: number): void {
  fillRect(brush.surface, Math.round(x - largeur / 2), Math.round(haut), Math.round(largeur), Math.round(GROUND - haut), FLAT);
}

// ── Silhouettes ──────────────────────────────────────────────────────────────

type Silhouettiste = (brush: Brush) => Anatomie;

/**
 * Le quadrupède est la forme de référence : corps horizontal porté haut sur quatre
 * pattes, cou marqué, tête ronde nettement détachée. Les proportions comptent plus que
 * le détail — un corps posé trop bas avale ses pattes et la créature devient une masse.
 */
const quadrupede: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const corpsY = GROUND - 20 * s;
  const corpsRx = 16 * s;
  const corpsRy = 9 * s;

  for (const dx of [-11.5, -5, 5, 11.5]) {
    patte(brush, CENTER + dx * s, corpsY + corpsRy * 0.4, 5 * s);
  }
  ell(brush, CENTER, corpsY, corpsRx, corpsRy);

  const teteRx = 10 * s;
  const teteRy = 8.5 * s;
  const teteY = GROUND - 40 * s;
  // Cou : il relie sans fusionner, en restant plus étroit que la tête et que le corps.
  fillRect(brush.surface, CENTER - 4 * s, teteY, 8 * s, corpsY - teteY, FLAT);
  ell(brush, CENTER, teteY, teteRx, teteRy);

  return {
    tete: { x: CENTER, y: teteY, rx: teteRx, ry: teteRy },
    corps: { x: CENTER, y: corpsY, rx: corpsRx, ry: corpsRy },
    sol: GROUND,
  };
};

/** Le félin est un quadrupède affiné : plus haut sur pattes, corps plus étroit. */
const felin: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const corpsY = GROUND - 24 * s;
  const corpsRx = 13 * s;
  const corpsRy = 7.5 * s;

  for (const dx of [-9.5, -4, 4, 9.5]) {
    patte(brush, CENTER + dx * s, corpsY + corpsRy * 0.3, 4 * s);
  }
  ell(brush, CENTER, corpsY, corpsRx, corpsRy);

  const teteY = GROUND - 42 * s;
  fillRect(brush.surface, CENTER - 3.5 * s, teteY, 7 * s, corpsY - teteY, FLAT);
  ell(brush, CENTER, teteY, 9 * s, 7.5 * s);
  // Museau : une avancée basse qui affine le profil de face.
  ell(brush, CENTER, teteY + 4 * s, 5 * s, 3.5 * s);

  return {
    tete: { x: CENTER, y: teteY, rx: 9 * s, ry: 7.5 * s },
    corps: { x: CENTER, y: corpsY, rx: corpsRx, ry: corpsRy },
    sol: GROUND,
  };
};

const bipede: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const corpsY = GROUND - 26 * s;
  const corpsRx = 13 * s;
  const corpsRy = 12 * s;

  patte(brush, CENTER - 7 * s, GROUND - 15 * s, 8 * s);
  patte(brush, CENTER + 7 * s, GROUND - 15 * s, 8 * s);
  ell(brush, CENTER, corpsY, corpsRx, corpsRy);
  // Bras détachés du buste : sans l'écart, ils disparaissent dans la masse.
  ell(brush, CENTER - 15 * s, corpsY + 2 * s, 4.5 * s, 10 * s);
  ell(brush, CENTER + 15 * s, corpsY + 2 * s, 4.5 * s, 10 * s);

  // La tête reste assez basse pour qu'une crête ou des cornes tiennent dans le cadre :
  // c'est la silhouette la plus haute du jeu, elle donne la contrainte.
  const teteY = GROUND - 42 * s;
  ell(brush, CENTER, teteY, 11 * s, 9 * s);

  return {
    tete: { x: CENTER, y: teteY, rx: 11 * s, ry: 9 * s },
    corps: { x: CENTER, y: corpsY, rx: corpsRx, ry: corpsRy },
    sol: GROUND,
  };
};

const serpentin: Silhouettiste = (brush) => {
  const s = brush.echelle;
  // Anneaux empilés, alternativement clairs et sombres : c'est ce contraste, et non
  // leur contour, qui fait lire un enroulement plutôt qu'un tas.
  const anneaux = [
    { y: GROUND - 6 * s, rx: 19 * s, ry: 6 * s, teinte: FLAT_OMBRE },
    { y: GROUND - 15 * s, rx: 14 * s, ry: 5.5 * s, teinte: FLAT },
    { y: GROUND - 23 * s, rx: 10 * s, ry: 5 * s, teinte: FLAT_CLAIR },
  ];
  for (const anneau of anneaux) {
    fillEllipse(brush.surface, CENTER, anneau.y, anneau.rx, anneau.ry, anneau.teinte);
  }

  const teteY = GROUND - 36 * s;
  fillRect(brush.surface, CENTER - 4 * s, teteY, 8 * s, GROUND - 23 * s - teteY, FLAT);
  ell(brush, CENTER, teteY, 9.5 * s, 7.5 * s);

  return {
    tete: { x: CENTER, y: teteY, rx: 9.5 * s, ry: 7.5 * s },
    corps: { x: CENTER, y: GROUND - 12 * s, rx: 19 * s, ry: 11 * s },
    sol: GROUND,
  };
};

/** Corps compact et vertical : tout l'espace horizontal est réservé aux ailes. */
const aile: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const corpsY = GROUND - 26 * s;

  patte(brush, CENTER - 5 * s, GROUND - 10 * s, 3 * s);
  patte(brush, CENTER + 5 * s, GROUND - 10 * s, 3 * s);
  ell(brush, CENTER, corpsY, 9.5 * s, 13 * s);

  const teteY = GROUND - 44 * s;
  ell(brush, CENTER, teteY, 8 * s, 7 * s);
  // Bec.
  ell(brush, CENTER, teteY + 4 * s, 3 * s, 2.5 * s);

  return {
    tete: { x: CENTER, y: teteY, rx: 8 * s, ry: 7 * s },
    corps: { x: CENTER, y: corpsY, rx: 9.5 * s, ry: 13 * s },
    sol: GROUND,
  };
};

const blob: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const cy = GROUND - 17 * s;
  ell(brush, CENTER, cy, 21 * s, 16 * s);
  // Bosses asymétriques : sans elles, une masse ronde ressemble à un ballon.
  ell(brush, CENTER - 13 * s, cy - 9 * s, 8 * s, 7 * s);
  ell(brush, CENTER + 11 * s, cy - 11 * s, 6.5 * s, 6 * s);
  return {
    tete: { x: CENTER, y: cy - 6 * s, rx: 15 * s, ry: 10 * s },
    corps: { x: CENTER, y: cy, rx: 21 * s, ry: 16 * s },
    sol: GROUND,
  };
};

/**
 * Le minéral n'a pas de courbe : base large, sommet étroit, arêtes droites. C'est
 * l'angularité qui le sépare de l'organique, pas sa couleur.
 */
const mineral: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const hauteur = Math.round(38 * s);
  const sommet = GROUND - hauteur;

  /** Demi-largeur du cristal : sommet étroit, ventre large, base légèrement rentrée. */
  const demiLargeur = (t: number): number =>
    Math.round((t < 0.62 ? 5 + (t / 0.62) * 13 : 18 - ((t - 0.62) / 0.38) * 3) * s);

  for (let i = 0; i < hauteur; i++) {
    const t = i / hauteur;
    const demi = demiLargeur(t);
    for (let dx = -demi; dx <= demi; dx++) {
      // Trois faces plates séparées par des arêtes franches. Un dégradé continu
      // donnerait un galet ; c'est la rupture entre les faces qui fait le cristal.
      const position = dx / demi;
      const teinte = position < -0.34 ? FLAT_CLAIR : position > 0.34 ? FLAT_OMBRE : FLAT;
      setPixel(brush.surface, CENTER + dx, sommet + i, teinte);
    }
  }

  // Éclats saillants, adossés au corps : ils brisent la pyramide.
  for (const [dx, base, h] of [
    [-15, -4, 15],
    [14, -2, 11],
  ] as const) {
    const hauteurEclat = h * s;
    for (let i = 0; i < hauteurEclat; i++) {
      const demi = Math.max(1, Math.round(((hauteurEclat - i) / hauteurEclat) * 4 * s));
      for (let d = -demi; d <= demi; d++) {
        setPixel(
          brush.surface,
          Math.round(CENTER + dx * s + d),
          Math.round(GROUND + base * s - i),
          d < 0 ? FLAT_CLAIR : FLAT_OMBRE,
        );
      }
    }
  }

  return {
    tete: { x: CENTER, y: sommet + 12 * s, rx: 11 * s, ry: 8 * s },
    corps: { x: CENTER, y: GROUND - 13 * s, rx: 18 * s, ry: 11 * s },
    sol: GROUND,
  };
};

const insecte: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const thoraxY = GROUND - 26 * s;
  // Pattes filiformes, trois paires, largement écartées.
  for (const [dy, ecart] of [
    [-3, 20],
    [1, 23],
    [5, 21],
  ] as const) {
    drawLine(brush.surface, CENTER - 7 * s, thoraxY + dy * s, CENTER - ecart * s, GROUND - 2, FLAT);
    drawLine(brush.surface, CENTER - 7 * s, thoraxY + dy * s + 1, CENTER - ecart * s, GROUND - 1, FLAT);
  }
  ell(brush, CENTER, GROUND - 14 * s, 12 * s, 10 * s); // abdomen
  ell(brush, CENTER, thoraxY, 9 * s, 7.5 * s); // thorax
  const teteY = GROUND - 40 * s;
  ell(brush, CENTER, teteY, 7.5 * s, 6.5 * s);
  return {
    tete: { x: CENTER, y: teteY, rx: 7.5 * s, ry: 6.5 * s },
    corps: { x: CENTER, y: thoraxY, rx: 12 * s, ry: 13 * s },
    sol: GROUND,
  };
};

const aquatique: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const cy = GROUND - 16 * s;
  // Palmes, posées avant la coque pour rester derrière.
  ell(brush, CENTER - 19 * s, GROUND - 7 * s, 7 * s, 4.5 * s);
  ell(brush, CENTER + 19 * s, GROUND - 7 * s, 7 * s, 4.5 * s);
  ell(brush, CENTER, cy, 20 * s, 13 * s);

  const teteY = GROUND - 38 * s;
  fillRect(brush.surface, CENTER - 4 * s, teteY, 8 * s, cy - teteY, FLAT);
  ell(brush, CENTER, teteY, 9 * s, 8 * s);

  return {
    tete: { x: CENTER, y: teteY, rx: 9 * s, ry: 8 * s },
    corps: { x: CENTER, y: cy, rx: 20 * s, ry: 13 * s },
    sol: GROUND,
  };
};

/** Le spectre ne touche pas le sol : sa base s'effiloche au lieu de se poser. */
const spectre: Silhouettiste = (brush) => {
  const s = brush.echelle;
  const teteY = GROUND - 40 * s;
  ell(brush, CENTER, teteY, 13 * s, 12 * s);

  const hauteur = Math.round(30 * s);
  for (let i = 0; i < hauteur; i++) {
    const t = i / hauteur;
    const demi = Math.round((13 - t * 5) * s);
    fillRect(brush.surface, CENTER - demi, teteY + 6 * s + i, demi * 2, 1, FLAT);
    // Franges : le bord devient irrégulier vers le bas, jamais net.
    const frange = t > 0.55 ? brush.rng.int(0, Math.round(4 * t)) : 0;
    if (frange > 0) {
      fillRect(brush.surface, CENTER - demi, teteY + 6 * s + i, frange, 1, [0, 0, 0, 0]);
      fillRect(brush.surface, CENTER + demi - frange, teteY + 6 * s + i, frange, 1, [0, 0, 0, 0]);
    }
  }

  return {
    tete: { x: CENTER, y: teteY, rx: 13 * s, ry: 12 * s },
    corps: { x: CENTER, y: teteY + 16 * s, rx: 12 * s, ry: 12 * s },
    // Pas de contact avec le sol : l'ombre portée est plus basse et plus diffuse.
    sol: GROUND + 2,
  };
};

const SILHOUETTES: Record<Apparence['silhouette'], Silhouettiste> = {
  quadrupede,
  felin,
  bipede,
  serpentin,
  aile,
  blob,
  mineral,
  insecte,
  aquatique,
  spectre,
};

// ── Attributs ────────────────────────────────────────────────────────────────

type Attributiste = (brush: Brush, anatomie: Anatomie) => void;

/**
 * Règle commune à tous les attributs : ils doivent **dépasser** la silhouette. Un
 * attribut dessiné à l'intérieur du corps disparaît à l'ombrage — il ne reste qu'une
 * masse. D'où des oreilles hautes, des ailes larges, des crêtes qui saillent au-dessus
 * du crâne.
 */
const ATTRIBUTS: Record<string, Attributiste> = {
  oreilles: (brush, { tete }) => {
    const s = brush.echelle;
    const inclinaison = brush.rng.float(0.35, 0.75);
    const baseY = tete.y - tete.ry * 0.55;
    const longueur = plafond(baseY, 16 * s);
    for (const cote of [-1, 1]) {
      const baseX = tete.x + cote * tete.rx * 0.5;
      for (let i = 0; i < longueur; i++) {
        const t = i / longueur;
        const largeur = Math.max(1, Math.round((6 - t * 5) * s));
        const x = Math.round(baseX + cote * i * inclinaison);
        fillRect(brush.surface, x - Math.floor(largeur / 2), Math.round(baseY - i), largeur, 1, FLAT);
      }
    }
  },

  cornes: (brush, { tete }) => {
    const s = brush.echelle;
    const baseY = tete.y - tete.ry * 0.6;
    const longueur = plafond(baseY, 13 * s, 0.85);
    for (const cote of [-1, 1]) {
      const baseX = tete.x + cote * tete.rx * 0.62;
      for (let i = 0; i < longueur; i++) {
        const t = i / longueur;
        const largeur = Math.max(1, Math.round((5 - t * 4) * s));
        const x = Math.round(baseX + cote * i * 0.75);
        fillRect(brush.surface, x - Math.floor(largeur / 2), Math.round(baseY - i * 0.85), largeur, 1, FLAT);
      }
    }
  },

  queue: (brush, { corps }) => {
    const s = brush.echelle;
    // La queue casse volontairement la symétrie : elle est tracée après le miroir.
    // Elle part **sous** le corps et retombe vers le sol avant de se relever : partie
    // du flanc en montant, elle se lisait comme un bras levé.
    const departX = corps.x + corps.rx * 0.7;
    const departY = corps.y + corps.ry * 0.45;
    const longueur = 15 * s;
    for (let i = 0; i < longueur; i++) {
      const t = i / longueur;
      const x = departX + t * 13 * s;
      const y = departY + Math.sin(t * 2.9) * 6 * s;
      const rayon = Math.max(1, (3.4 - t * 2.2) * s);
      fillEllipse(brush.surface, x, y, rayon, rayon, t > 0.5 ? FLAT_OMBRE : FLAT);
    }
  },

  ailes: (brush, { corps }) => {
    const s = brush.echelle;
    // L'envergure est bornée pour que les pointes ne touchent pas le bord du cadre.
    const envergure = 20 * s;
    for (const cote of [-1, 1]) {
      const baseX = corps.x + cote * corps.rx * 0.75;
      const baseY = corps.y - corps.ry * 0.45;
      for (let i = 0; i < envergure; i++) {
        const t = i / envergure;
        // L'aile monte en s'écartant, puis s'affine : c'est ce profil qui la fait
        // lire comme une aile plutôt que comme une nageoire.
        const haut = baseY - Math.sin(t * 1.5) * 11 * s;
        const hauteur = Math.max(2, Math.round((16 - t * 11) * s));
        // Le bout de l'aile s'assombrit : elle se détache du corps au lieu d'en être
        // le prolongement.
        fillRect(
          brush.surface,
          Math.round(baseX + cote * i),
          Math.round(haut),
          1,
          hauteur,
          t > 0.55 ? FLAT_OMBRE : FLAT,
        );
      }
    }
  },

  nageoires: (brush, { corps }) => {
    const s = brush.echelle;
    const envergure = 12 * s;
    for (const cote of [-1, 1]) {
      const baseX = corps.x + cote * corps.rx * 0.8;
      for (let i = 0; i < envergure; i++) {
        const t = i / envergure;
        const hauteur = Math.max(2, Math.round((13 - t * 9) * s));
        fillRect(
          brush.surface,
          Math.round(baseX + cote * i),
          Math.round(corps.y - hauteur / 2 - t * 3 * s),
          1,
          hauteur,
          FLAT,
        );
      }
    }
  },

  crete: (brush, { tete }) => {
    const s = brush.echelle;
    // Éventail de trois pointes au sommet du crâne, la plus haute au centre.
    const pointes = [
      { dx: 0, h: 13 },
      { dx: -6, h: 9 },
      { dx: 6, h: 9 },
    ];
    const baseY = tete.y - tete.ry * 0.75;
    for (const { dx, h } of pointes) {
      const baseX = tete.x + dx * s;
      const hauteur = plafond(baseY, h * s);
      for (let i = 0; i < hauteur; i++) {
        const demi = Math.max(1, Math.round(((hauteur - i) / 3) * 1.1));
        fillRect(brush.surface, Math.round(baseX - demi), Math.round(baseY - i), demi * 2, 1, FLAT);
      }
    }
  },

  carapace: (brush, { corps }) => {
    // Dôme légèrement décalé vers le haut : il déborde du dos et se voit en silhouette.
    // Marqué clair, il se sépare du corps même sans contour interne.
    fillEllipse(
      brush.surface,
      corps.x,
      corps.y - corps.ry * 0.35,
      corps.rx * 1.02,
      corps.ry * 0.95,
      FLAT_CLAIR,
    );
  },

  crocs: () => {
    // Détail clair posé après l'ombrage — voir `posePetitsDetails`.
  },

  antennes: (brush, { tete }) => {
    const s = brush.echelle;
    const baseY = tete.y - tete.ry * 0.8;
    // Le bulbe terminal déborde de la pointe : on lui réserve son rayon.
    const longueur = plafond(baseY - 3 * s, 16 * s, 0.9);
    for (const cote of [-1, 1]) {
      const baseX = tete.x + cote * tete.rx * 0.35;
      for (let i = 0; i < longueur; i++) {
        const t = i / longueur;
        const x = Math.round(baseX + cote * i * 0.6);
        const y = Math.round(baseY - i * 0.9 + Math.sin(t * 2.2) * 2);
        setPixel(brush.surface, x, y, FLAT);
        setPixel(brush.surface, x + cote, y, FLAT);
      }
      // Bulbe terminal.
      fillEllipse(
        brush.surface,
        baseX + cote * longueur * 0.6,
        baseY - longueur * 0.9 + Math.sin(2.2) * 2,
        2.2 * s,
        2.2 * s,
        FLAT,
      );
    }
  },

  aura: () => {
    // L'aura est une couronne lumineuse : elle se pose après l'ombrage.
  },

  gemme: () => {
    // Idem — une gemme ombrée perdrait son éclat.
  },
};

// ── Ombrage et détails ───────────────────────────────────────────────────────

/**
 * Remplace la teinte de travail par la rampe du type, éclairée depuis le haut à gauche.
 *
 * L'ombrage est calculé sur la position dans le sprite, pas sur une vraie normale : à
 * 64 pixels, la différence ne se voit pas, et le calcul reste trivial.
 */
function ombrer(surface: MutableSurface, palette: Palette, view: CreatureView): void {
  const rampe = palette.ramp;
  mapPixels(surface, (couleur, x, y) => {
    const marqueur = MARQUEURS.find(
      ([teinte]) => couleur[0] === teinte[0] && couleur[1] === teinte[1] && couleur[2] === teinte[2],
    );
    if (!marqueur) return couleur;

    const nx = (x - CENTER) / CENTER;
    const ny = (y - CENTER) / CENTER;
    // Lumière en haut à gauche : plus on descend et va à droite, plus on s'assombrit.
    let lumiere = 0.62 - (nx * 0.34 + ny * 0.52);
    // De dos, la créature est à contre-jour : tout est décalé d'un cran vers l'ombre.
    if (view === 'dos') lumiere -= 0.16;
    const index = clamp(Math.round(lumiere * 4) + marqueur[1], 0, 4);
    return rampe[index]!;
  });
}

function poserYeux(brush: Brush, { tete }: Anatomie): void {
  if (brush.view === 'dos') return;
  const s = brush.echelle;
  const rayon = Math.max(2, 3.2 * s);
  const ecart = tete.rx * 0.42;
  for (const cote of [-1, 1]) {
    const cx = tete.x + cote * ecart;
    const cy = tete.y + tete.ry * 0.05;
    fillEllipse(brush.surface, cx, cy, rayon, rayon * 1.15, EYE_WHITE);
    fillEllipse(brush.surface, cx + cote * 0.4, cy + 0.4, rayon * 0.55, rayon * 0.7, EYE_DARK);
    setPixel(brush.surface, Math.round(cx - 1), Math.round(cy - 1), EYE_WHITE);
  }
}

function posePetitsDetails(brush: Brush, anatomie: Anatomie, apparence: Apparence): void {
  const s = brush.echelle;
  const { tete, corps } = anatomie;

  if (apparence.traits.includes('crocs') && brush.view === 'face') {
    const y = Math.round(tete.y + tete.ry * 0.55);
    for (const cote of [-1, 1]) {
      const x = Math.round(tete.x + cote * tete.rx * 0.3);
      setPixel(brush.surface, x, y, EYE_WHITE);
      setPixel(brush.surface, x, y + 1, EYE_WHITE);
    }
  }

  if (apparence.traits.includes('carapace')) {
    // Deux arcs concentriques : l'ombre du bord et le reflet du sommet. Sans eux, la
    // carapace reste un renflement indistinct une fois ombrée.
    const cx = corps.x;
    const cy = corps.y - corps.ry * 0.35;
    for (const [facteur, couleur] of [
      [0.62, brush.palette.ramp[0]!],
      [0.36, brush.palette.ramp[4]!],
    ] as const) {
      for (let angle = Math.PI * 1.08; angle <= Math.PI * 1.92; angle += 0.06) {
        const x = Math.round(cx + Math.cos(angle) * corps.rx * facteur * 1.6);
        const y = Math.round(cy + Math.sin(angle) * corps.ry * facteur * 1.6);
        if (getPixel(brush.surface, x, y)[3] > 0) setPixel(brush.surface, x, y, couleur);
      }
    }
  }

  if (apparence.traits.includes('gemme')) {
    const cx = Math.round(corps.x);
    const cy = Math.round(corps.y - corps.ry * 0.2);
    const taille = Math.max(2, Math.round(4 * s));
    for (let dy = -taille; dy <= taille; dy++) {
      const demi = taille - Math.abs(dy);
      for (let dx = -demi; dx <= demi; dx++) {
        const couleur = dx + dy < 0 ? brush.accent.ramp[4]! : brush.accent.ramp[2]!;
        setPixel(brush.surface, cx + dx, cy + dy, couleur);
      }
    }
  }

  if (apparence.traits.includes('aura')) {
    // Halo : des pixels d'accent posés autour de la silhouette, en pointillé.
    const halo: Array<[number, number]> = [];
    // Le halo s'arrête à un pixel du bord : une aura tronquée par le cadre se lit
    // comme un défaut de rendu, pas comme une lueur.
    for (let y = 1; y < CREATURE_SIZE - 1; y++) {
      for (let x = 1; x < CREATURE_SIZE - 1; x++) {
        if (getPixel(brush.surface, x, y)[3] !== 0) continue;
        const voisinOpaque = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx, dy]) => getPixel(brush.surface, x + dx!, y + dy!)[3] > 0);
        if (voisinOpaque && brush.rng.chance(0.45)) halo.push([x, y]);
      }
    }
    for (const [x, y] of halo) {
      setPixel(brush.surface, x, y, [
        brush.accent.accent[0],
        brush.accent.accent[1],
        brush.accent.accent[2],
        150,
      ]);
    }
  }

  // Marquages : quelques taches d'accent sur le corps, distinctives sans être bruyantes.
  const taches = brush.rng.int(2, 4);
  for (let i = 0; i < taches; i++) {
    const angle = brush.rng.float(0, Math.PI * 2);
    const rayon = brush.rng.float(0.25, 0.7);
    const x = Math.round(corps.x + Math.cos(angle) * corps.rx * rayon);
    const y = Math.round(corps.y + Math.sin(angle) * corps.ry * rayon);
    if (getPixel(brush.surface, x, y)[3] === 0) continue;
    fillEllipse(brush.surface, x, y, 2.2 * s, 1.8 * s, brush.accent.accent);
  }
}

function poserOmbrePortee(surface: MutableSurface, sol: number, echelle: number): void {
  for (let x = 0; x < CREATURE_SIZE; x++) {
    for (let y = sol; y < sol + 4; y++) {
      const dx = (x - CENTER) / (20 * echelle);
      const dy = (y - (sol + 1.5)) / 2.2;
      if (dx * dx + dy * dy <= 1 && getPixel(surface, x, y)[3] === 0) {
        setPixel(surface, x, y, [16, 20, 26, 70]);
      }
    }
  }
}

const ECHELLES: Record<Apparence['gabarit'], number> = { petit: 0.74, moyen: 0.88, grand: 1 };

export function drawCreature(species: Species, view: CreatureView): MutableSurface {
  const surface = createSurface(CREATURE_SIZE, CREATURE_SIZE);
  const palette = TYPE_PALETTES[species.types[0]];
  const accent = TYPE_PALETTES[species.types[1] ?? species.types[0]];
  // La seed dépend de l'espèce et de la vue, jamais de l'ordre de génération.
  const rng = rngFor(0x7e88a, species.id, view);

  const brush: Brush = { surface, palette, accent, rng, view, echelle: ECHELLES[species.apparence.gabarit] };

  const anatomie = SILHOUETTES[species.apparence.silhouette](brush);

  for (const trait of species.apparence.traits) {
    if (trait === 'queue') continue; // asymétrique : posée après le miroir
    ATTRIBUTS[trait]?.(brush, anatomie);
  }

  // Symétrie axiale : le corps se construit sur la moitié gauche, puis se reflète.
  // C'est ce qui donne aux créatures leur aspect « dessiné » plutôt que bricolé.
  mirrorLeftToRight(surface);

  if (species.apparence.traits.includes('queue')) {
    ATTRIBUTS.queue!(brush, anatomie);
  }

  ombrer(surface, palette, view);
  outline(surface, palette.outline);
  posePetitsDetails(brush, anatomie, species.apparence);
  poserYeux(brush, anatomie);
  poserOmbrePortee(surface, anatomie.sol, brush.echelle);

  return surface;
}

export interface CreatureSheet {
  surface: MutableSurface;
  order: readonly SpeciesId[];
}

/** Planche complète : une colonne par vue, une ligne par espèce. */
export function buildCreatureSheet(): CreatureSheet {
  const surface = createSurface(
    CREATURE_VIEWS.length * CREATURE_SIZE,
    SPECIES_IDS.length * CREATURE_SIZE,
  );

  SPECIES_IDS.forEach((id, ligne) => {
    CREATURE_VIEWS.forEach((view, colonne) => {
      const sprite = drawCreature(SPECIES[id], view);
      for (let y = 0; y < CREATURE_SIZE; y++) {
        for (let x = 0; x < CREATURE_SIZE; x++) {
          const offset = (y * CREATURE_SIZE + x) * 4;
          if (sprite.data[offset + 3] === 0) continue;
          setPixel(surface, colonne * CREATURE_SIZE + x, ligne * CREATURE_SIZE + y, [
            sprite.data[offset]!,
            sprite.data[offset + 1]!,
            sprite.data[offset + 2]!,
            sprite.data[offset + 3]!,
          ]);
        }
      }
    });
  });

  return { surface, order: SPECIES_IDS };
}
