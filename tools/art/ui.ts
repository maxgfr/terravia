/**
 * Éléments d'interface : cadre étirable, plaques de type, icônes d'objets, sphères.
 *
 * Rien de ce qui est écrit ici ne contient de texte. Les plaques de type sont des fonds
 * colorés, pas des étiquettes — le nom est écrit par-dessus à l'exécution, dans la langue
 * choisie. Une image gravée en français aurait rendu la version anglaise impossible.
 */

import { ELEMENT_TYPES, type ElementType } from '../../src/data/types.ts';
import { TYPE_PALETTES, UI_COLORS } from './palette.ts';
import {
  createSurface,
  fillEllipse,
  fillRect,
  hex,
  setPixel,
  shade,
  type Color,
  type MutableSurface,
} from './surface.ts';

/** Taille d'un coin du cadre étirable. L'image fait 3 × 3 tuiles de cette taille. */
export const FRAME_SLICE = 8;
export const BADGE_WIDTH = 34;
export const BADGE_HEIGHT = 11;
export const ICON_SIZE = 16;

/**
 * Cadre en neuf morceaux. Le jeu répète le bord et le centre pour obtenir n'importe
 * quelle taille de boîte de dialogue à partir de ces 24 × 24 pixels.
 */
export function buildFrame(): MutableSurface {
  const size = FRAME_SLICE * 3;
  const frame = createSurface(size, size, UI_COLORS.panel);

  // Bordure extérieure sombre, puis un liseré clair à l'intérieur : le relief vient
  // de ces deux traits, pas d'un dégradé.
  fillRect(frame, 0, 0, size, 1, UI_COLORS.panelBorder);
  fillRect(frame, 0, size - 1, size, 1, UI_COLORS.panelBorder);
  fillRect(frame, 0, 0, 1, size, UI_COLORS.panelBorder);
  fillRect(frame, size - 1, 0, 1, size, UI_COLORS.panelBorder);

  fillRect(frame, 1, 1, size - 2, 1, UI_COLORS.panelHighlight);
  fillRect(frame, 1, 1, 1, size - 2, UI_COLORS.panelHighlight);
  fillRect(frame, 1, size - 2, size - 2, 1, UI_COLORS.panelShadow);
  fillRect(frame, size - 2, 1, 1, size - 2, UI_COLORS.panelShadow);

  // Les quatre coins sont ébréchés d'un pixel : un cadre parfaitement rectangulaire
  // paraît raide, un coin coupé suffit à l'adoucir.
  for (const [x, y] of [
    [0, 0],
    [size - 1, 0],
    [0, size - 1],
    [size - 1, size - 1],
  ] as const) {
    setPixel(frame, x, y, [0, 0, 0, 0]);
  }

  return frame;
}

/** Plaque colorée d'un type : dégradé vertical de la rampe, coins arrondis. */
function buildBadge(type: ElementType): MutableSurface {
  const palette = TYPE_PALETTES[type];
  const badge = createSurface(BADGE_WIDTH, BADGE_HEIGHT);

  for (let y = 0; y < BADGE_HEIGHT; y++) {
    // Du clair en haut vers le sombre en bas : la lumière vient toujours d'en haut.
    const index = y < 2 ? 3 : y < 5 ? 2 : y < 9 ? 1 : 0;
    fillRect(badge, 0, y, BADGE_WIDTH, 1, palette.ramp[index as 0 | 1 | 2 | 3]!);
  }

  fillRect(badge, 0, 0, BADGE_WIDTH, 1, palette.ramp[4]);
  fillRect(badge, 0, BADGE_HEIGHT - 1, BADGE_WIDTH, 1, palette.outline);
  fillRect(badge, 0, 0, 1, BADGE_HEIGHT, palette.outline);
  fillRect(badge, BADGE_WIDTH - 1, 0, 1, BADGE_HEIGHT, palette.outline);

  for (const [x, y] of [
    [0, 0],
    [BADGE_WIDTH - 1, 0],
    [0, BADGE_HEIGHT - 1],
    [BADGE_WIDTH - 1, BADGE_HEIGHT - 1],
  ] as const) {
    setPixel(badge, x, y, [0, 0, 0, 0]);
  }

  return badge;
}

/** Toutes les plaques empilées : une ligne par type, dans l'ordre de `ELEMENT_TYPES`. */
export function buildBadges(): MutableSurface {
  const sheet = createSurface(BADGE_WIDTH, BADGE_HEIGHT * ELEMENT_TYPES.length);
  ELEMENT_TYPES.forEach((type, index) => {
    const badge = buildBadge(type);
    for (let y = 0; y < BADGE_HEIGHT; y++) {
      for (let x = 0; x < BADGE_WIDTH; x++) {
        const offset = (y * BADGE_WIDTH + x) * 4;
        setPixel(sheet, x, index * BADGE_HEIGHT + y, [
          badge.data[offset]!,
          badge.data[offset + 1]!,
          badge.data[offset + 2]!,
          badge.data[offset + 3]!,
        ]);
      }
    }
  });
  return sheet;
}

/** Identifiants des icônes, dans leur ordre d'apparition dans la planche. */
export const ICON_IDS = [
  'potion',
  'superPotion',
  'panacee',
  'antidote',
  'reveil',
  'prisme',
  'prismeAncre',
  'prismeRoyal',
  'baie',
  'pierreEvolution',
  'badge',
  'piece',
  'carte',
  'canne',
] as const;

export type IconId = (typeof ICON_IDS)[number];

const ICON_PAINTERS: Record<IconId, (icon: MutableSurface) => void> = {
  potion: (icon) => flask(icon, hex('#e8607a')),
  superPotion: (icon) => flask(icon, hex('#f0a03c')),
  panacee: (icon) => flask(icon, hex('#7fd4e8')),
  antidote: (icon) => flask(icon, hex('#9fe06a')),
  reveil: (icon) => flask(icon, hex('#dcdcf0')),
  prisme: (icon) => prisme(icon, hex('#7fd4b0'), hex('#a9834f')),
  prismeAncre: (icon) => prisme(icon, hex('#7fb8e0'), hex('#95a8b9')),
  prismeRoyal: (icon) => prisme(icon, hex('#d894d6'), hex('#e6bb3c')),
  baie: (icon) => {
    fillEllipse(icon, 8, 10, 4.5, 4, hex('#c33a4a'));
    fillEllipse(icon, 8, 9.5, 3.5, 3, hex('#e05a4a'));
    fillEllipse(icon, 6.5, 8.5, 1.4, 1.1, hex('#f5a09a'));
    fillRect(icon, 7, 3, 2, 3, hex('#4a7a2c'));
    fillEllipse(icon, 10.5, 4, 2.5, 1.4, hex('#5f9c38'));
  },
  pierreEvolution: (icon) => {
    const body = hex('#7fb8e0');
    for (let y = 3; y < 13; y++) {
      const half = y < 7 ? y - 2 : 13 - y + 2;
      for (let dx = -half; dx <= half; dx++) {
        setPixel(icon, 8 + dx, y, dx < 0 ? hex('#c8ecff') : dx === half ? shade(body, -0.35) : body);
      }
    }
    setPixel(icon, 6, 5, hex('#ffffff'));
  },
  badge: (icon) => {
    const gold = hex('#e6bb3c');
    // Étoile à cinq branches, tracée par rayons : plus lisible qu'un polygone
    // à cette taille.
    for (let branch = 0; branch < 5; branch++) {
      const angle = (branch / 5) * Math.PI * 2 - Math.PI / 2;
      for (let r = 0; r <= 6; r++) {
        const x = Math.round(8 + Math.cos(angle) * r);
        const y = Math.round(8 + Math.sin(angle) * r);
        setPixel(icon, x, y, r > 4 ? shade(gold, -0.2) : gold);
        setPixel(icon, x, y + 1, r > 4 ? shade(gold, -0.2) : gold);
      }
    }
    fillEllipse(icon, 8, 8, 2.6, 2.6, hex('#fff08a'));
  },
  piece: (icon) => {
    fillEllipse(icon, 8, 8, 5.5, 5.5, hex('#a37c1c'));
    fillEllipse(icon, 8, 8, 4.5, 4.5, hex('#e6bb3c'));
    fillEllipse(icon, 6.5, 6.5, 1.6, 1.6, hex('#fff08a'));
    fillRect(icon, 7, 5, 2, 6, hex('#a37c1c'));
  },
  carte: (icon) => {
    fillRect(icon, 2, 3, 12, 10, hex('#e8dcb8'));
    fillRect(icon, 2, 3, 12, 1, hex('#c4b48c'));
    fillRect(icon, 2, 12, 12, 1, hex('#c4b48c'));
    fillRect(icon, 4, 6, 5, 1, hex('#5f9c38'));
    fillRect(icon, 6, 8, 6, 1, hex('#4a9be0'));
    setPixel(icon, 11, 6, hex('#e05a4a'));
    setPixel(icon, 10, 10, hex('#e05a4a'));
  },
  canne: (icon) => {
    for (let i = 0; i < 11; i++) setPixel(icon, 3 + i, 12 - i, hex('#8a5a2c'));
    for (let i = 0; i < 4; i++) setPixel(icon, 13, 2 + i, hex('#dcdcf0'));
    fillEllipse(icon, 13, 7, 1.6, 1.6, hex('#7fc4e8'));
  },
};

function flask(icon: MutableSurface, liquid: Color): void {
  const glass = hex('#dfe7ec');
  fillRect(icon, 6, 2, 4, 3, hex('#b0a89a'));
  fillRect(icon, 5, 5, 6, 9, shade(glass, -0.3));
  fillRect(icon, 6, 5, 4, 8, glass);
  fillRect(icon, 6, 8, 4, 5, liquid);
  fillRect(icon, 6, 8, 4, 1, shade(liquid, 0.3));
  setPixel(icon, 6, 6, hex('#ffffff'));
  setPixel(icon, 6, 7, hex('#ffffff'));
}

/**
 * Prisme de capture : le contenant dans lequel on scelle une créature.
 *
 * C'est un cristal taillé, pas une sphère — Terravia n'emprunte pas non plus ses objets.
 * La lecture tient à trois facettes : la gauche prend la lumière, la droite reste dans
 * l'ombre, et l'arête centrale les sépare.
 */
function prisme(icon: MutableSurface, coeur: Color, monture: Color): void {
  const verre = hex('#cfe3ee');
  const contour = hex('#1c2630');

  /** Demi-largeur du cristal à une hauteur donnée : pointe, ventre, puis base. */
  const demiLargeur = (y: number): number => {
    if (y < 2) return 1;
    if (y < 5) return y - 1;
    if (y < 11) return 5;
    return Math.max(2, 5 - (y - 10));
  };

  for (let y = 1; y <= 14; y++) {
    const demi = demiLargeur(y);
    for (let dx = -demi; dx <= demi; dx++) {
      const x = 8 + dx;
      let couleur: Color;
      if (Math.abs(dx) === demi) couleur = contour;
      else if (dx < -1) couleur = shade(verre, 0.25);
      else if (dx > 1) couleur = shade(verre, -0.42);
      else couleur = verre;
      setPixel(icon, x, y, couleur);
    }
  }

  // Cœur lumineux : un losange, la seule zone saturée de l'icône.
  for (let dy = -3; dy <= 3; dy++) {
    const demi = 3 - Math.abs(dy);
    for (let dx = -demi; dx <= demi; dx++) {
      setPixel(icon, 8 + dx, 8 + dy, dx + dy < 0 ? shade(coeur, 0.35) : coeur);
    }
  }
  setPixel(icon, 7, 7, hex('#ffffff'));

  // Monture métallique à la base : elle donne l'échelle et un point d'appui.
  fillRect(icon, 4, 13, 9, 2, monture);
  fillRect(icon, 4, 13, 9, 1, shade(monture, 0.3));
  fillRect(icon, 3, 14, 11, 1, shade(monture, -0.3));
}

/** Planche d'icônes : une colonne par objet, dans l'ordre de `ICON_IDS`. */
export function buildIcons(): MutableSurface {
  const sheet = createSurface(ICON_IDS.length * ICON_SIZE, ICON_SIZE);
  ICON_IDS.forEach((id, index) => {
    const icon = createSurface(ICON_SIZE, ICON_SIZE);
    ICON_PAINTERS[id](icon);
    for (let y = 0; y < ICON_SIZE; y++) {
      for (let x = 0; x < ICON_SIZE; x++) {
        const offset = (y * ICON_SIZE + x) * 4;
        if (icon.data[offset + 3] === 0) continue;
        setPixel(sheet, index * ICON_SIZE + x, y, [
          icon.data[offset]!,
          icon.data[offset + 1]!,
          icon.data[offset + 2]!,
          icon.data[offset + 3]!,
        ]);
      }
    }
  });
  return sheet;
}
