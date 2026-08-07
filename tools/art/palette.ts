/**
 * Palettes de couleurs, une par type élémentaire.
 *
 * Chaque palette est une rampe de cinq valeurs, de l'ombre la plus profonde à la lumière
 * la plus vive, plus une couleur d'accent pour les marquages. Le générateur de sprites ne
 * choisit jamais une couleur libre : il pioche un indice dans la rampe du type. C'est ce
 * qui fait qu'une créature Flamme et une créature Givre se lisent instantanément comme
 * appartenant au même jeu tout en étant impossibles à confondre.
 */

import type { ElementType } from '../../src/data/types.ts';
import { hex, shade, type Color } from './surface.ts';

export interface Palette {
  /** Cinq teintes, de la plus sombre à la plus claire. */
  readonly ramp: readonly [Color, Color, Color, Color, Color];
  /** Couleur des marquages : motifs, yeux, glyphes. */
  readonly accent: Color;
  /** Liseré du sprite : toujours plus sombre que la rampe, jamais noir pur. */
  readonly outline: Color;
}

function palette(codes: [string, string, string, string, string], accent: string): Palette {
  const ramp = codes.map(hex) as unknown as Palette['ramp'];
  return {
    ramp,
    accent: hex(accent),
    // Le liseré dérive de la teinte la plus sombre : il appartient à la famille
    // chromatique du sprite. Un contour noir pur écrase toujours la couleur.
    outline: shade(ramp[0], -0.55),
  };
}

export const TYPE_PALETTES: Record<ElementType, Palette> = {
  neutre: palette(['#3b3a36', '#5f5c52', '#8b8577', '#b7b1a2', '#dcd7ca'], '#e8b86d'),
  flamme: palette(['#4a1608', '#9c3316', '#e05a1c', '#f79030', '#ffd166'], '#fff0b8'),
  onde: palette(['#0b2740', '#14507f', '#1f7fb8', '#4bb3dd', '#a3e4f5'], '#e2fbff'),
  sylve: palette(['#12331a', '#1f6b32', '#37a04a', '#6ec96a', '#b8eba2'], '#f6f7a1'),
  foudre: palette(['#33260a', '#7a5c0a', '#c99b12', '#f7cf3a', '#fff08a'], '#fffbd8'),
  givre: palette(['#0f3243', '#1d6b85', '#35a3bd', '#79d4e3', '#d3f4fb'], '#ffffff'),
  roche: palette(['#2c2119', '#55402f', '#83674d', '#ae9070', '#d6bd9c'], '#6f6152'),
  metal: palette(['#1e252e', '#3f4c5c', '#66798c', '#95a8b9', '#ccd9e4'], '#e8f2f9'),
  vent: palette(['#193029', '#2f5f57', '#4d9186', '#83c3b5', '#c7ecdf'], '#f2fff9'),
  ombre: palette(['#100d1a', '#271f3c', '#453768', '#6b56a1', '#9e88d5'], '#d9c9ff'),
  lumiere: palette(['#463509', '#a37c1c', '#e6bb3c', '#ffe27a', '#fff8d6'], '#ffffff'),
  toxine: palette(['#210f33', '#4d2163', '#7c368f', '#ab5bb5', '#d894d6'], '#bdf24a'),
};

/**
 * Chrome de l'interface : cadres, panneaux, texte. Volontairement neutre et froid pour
 * ne jamais entrer en concurrence avec les couleurs des créatures.
 */
export const UI_COLORS = {
  panel: hex('#f4f1e6'),
  panelShadow: hex('#c9c3b0'),
  panelBorder: hex('#2b2b33'),
  panelHighlight: hex('#ffffff'),
  text: hex('#2b2b33'),
  textDim: hex('#6d6a7a'),
  textInverse: hex('#f4f1e6'),
  backdrop: hex('#0b0f14'),
  selection: hex('#e0a03c'),
  hpHigh: hex('#4fbf6a'),
  hpMid: hex('#e8c33c'),
  hpLow: hex('#e05a4a'),
  hpBack: hex('#3a3a45'),
  xp: hex('#4bb3dd'),
} as const;

/** Teintes appliquées au monde selon l'heure. Le quatrième canal est l'opacité du voile. */
export const DAY_TINTS = {
  aube: hex('#ffb27a66'),
  jour: hex('#00000000'),
  crepuscule: hex('#ff7a4d59'),
  nuit: hex('#2a3f8c8c'),
} as const;

export type DayPhase = keyof typeof DAY_TINTS;
