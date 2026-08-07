/**
 * Sprites des personnages du monde : héros, villageois, dresseurs.
 *
 * Chaque personnage occupe 16 × 20 pixels — plus haut qu'une tuile, pour qu'il dépasse
 * légèrement sur la case du dessus et paraisse debout *dans* le décor plutôt que posé
 * dessus.
 *
 * Une planche contient trois directions (sud, nord, est) et trois trames (repos, pas
 * gauche, pas droit). L'ouest est le miroir de l'est, calculé à l'exécution : dessiner
 * les deux doublerait la planche pour rien.
 */

import { CHARACTER_IDS, type CharacterId } from '../../src/world/characterIds.ts';
import {
  createSurface,
  fillEllipse,
  fillRect,
  hex,
  outline,
  setPixel,
  shade,
  type Color,
  type MutableSurface,
} from './surface.ts';

export const CHARACTER_WIDTH = 16;
export const CHARACTER_HEIGHT = 20;
export const CHARACTER_DIRECTIONS = ['sud', 'nord', 'est'] as const;
export const CHARACTER_FRAMES = 3;

export type CharacterDirection = (typeof CHARACTER_DIRECTIONS)[number];

export interface CharacterLook {
  readonly peau: Color;
  readonly cheveux: Color;
  readonly haut: Color;
  readonly bas: Color;
  readonly chaussures: Color;
  readonly accent: Color;
  /** Coiffe ou casquette posée par-dessus les cheveux. */
  readonly coiffe?: Color;
}

export { CHARACTER_IDS, type CharacterId } from '../../src/world/characterIds.ts';

export const CHARACTER_LOOKS: Record<CharacterId, CharacterLook> = {
  heros: {
    peau: hex('#e8b48c'),
    cheveux: hex('#4a2f1c'),
    haut: hex('#3f7fc4'),
    bas: hex('#2b3a55'),
    chaussures: hex('#6b4a2c'),
    accent: hex('#e8dcb8'),
    coiffe: hex('#e05a4a'),
  },
  professeur: {
    peau: hex('#e8c4a0'),
    cheveux: hex('#b0a89a'),
    haut: hex('#f4f1e6'),
    bas: hex('#5f5c52'),
    chaussures: hex('#3b3a36'),
    accent: hex('#7fb8e0'),
  },
  villageois: {
    peau: hex('#d4a078'),
    cheveux: hex('#2c1f14'),
    haut: hex('#5f9c38'),
    bas: hex('#7a5330'),
    chaussures: hex('#4a3222'),
    accent: hex('#e8dcb8'),
  },
  villageoise: {
    peau: hex('#f0c8a8'),
    cheveux: hex('#a34a2c'),
    haut: hex('#e0a03c'),
    bas: hex('#8c3f5a'),
    chaussures: hex('#5c3d22'),
    accent: hex('#f4f1e6'),
  },
  dresseur: {
    peau: hex('#c48c60'),
    cheveux: hex('#1c1c24'),
    haut: hex('#c33a4a'),
    bas: hex('#2b2b33'),
    chaussures: hex('#4a4a55'),
    accent: hex('#f0d878'),
    coiffe: hex('#2b2b33'),
  },
  dresseuse: {
    peau: hex('#f0d0b0'),
    cheveux: hex('#e0c05a'),
    haut: hex('#8a5ad4'),
    bas: hex('#3f3a55'),
    chaussures: hex('#dcdcf0'),
    accent: hex('#f4f1e6'),
  },
  marchand: {
    peau: hex('#d4a078'),
    cheveux: hex('#3b3a36'),
    haut: hex('#4a9be0'),
    bas: hex('#2b3a55'),
    chaussures: hex('#3b3a36'),
    accent: hex('#f0d878'),
  },
  soigneuse: {
    peau: hex('#f0c8a8'),
    cheveux: hex('#e0708c'),
    haut: hex('#f4f1e6'),
    bas: hex('#e0708c'),
    chaussures: hex('#dcdcf0'),
    accent: hex('#e05a4a'),
  },
  champion: {
    peau: hex('#a06840'),
    cheveux: hex('#f0e0b0'),
    haut: hex('#e6bb3c'),
    bas: hex('#4d2163'),
    chaussures: hex('#7c368f'),
    accent: hex('#fff08a'),
    coiffe: hex('#e6bb3c'),
  },
  randonneur: {
    peau: hex('#c48c60'),
    cheveux: hex('#5c3d22'),
    haut: hex('#7a5330'),
    bas: hex('#5f5c52'),
    chaussures: hex('#3b3a36'),
    accent: hex('#9fe06a'),
    coiffe: hex('#5f9c38'),
  },
};

/**
 * Décalage vertical des jambes selon la trame. Le corps monte d'un pixel pendant le pas :
 * c'est ce petit rebond qui fait lire une marche plutôt qu'un glissement.
 */
const STEP: readonly { gauche: number; droite: number; corps: number }[] = [
  { gauche: 0, droite: 0, corps: 0 },
  { gauche: -1, droite: 1, corps: -1 },
  { gauche: 1, droite: -1, corps: -1 },
];

function drawCharacter(look: CharacterLook, direction: CharacterDirection, frame: number): MutableSurface {
  const sprite = createSurface(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const step = STEP[frame]!;
  const bodyTop = 8 + step.corps;

  // Jambes — dessinées en premier pour passer derrière le buste.
  const legColor = look.bas;
  fillRect(sprite, 5, 15 + step.gauche, 3, 3, legColor);
  fillRect(sprite, 8, 15 + step.droite, 3, 3, legColor);
  fillRect(sprite, 5, 18 + step.gauche, 3, 2, look.chaussures);
  fillRect(sprite, 8, 18 + step.droite, 3, 2, look.chaussures);

  // Buste, avec une bande d'accent qui distingue les personnages de loin.
  fillRect(sprite, 4, bodyTop, 8, 8, look.haut);
  fillRect(sprite, 4, bodyTop + 5, 8, 1, look.accent);
  fillRect(sprite, 4, bodyTop, 8, 1, shade(look.haut, 0.22));
  fillRect(sprite, 4, bodyTop + 7, 8, 1, shade(look.haut, -0.25));

  // Bras le long du corps.
  fillRect(sprite, 3, bodyTop + 1, 1, 5, shade(look.haut, -0.15));
  fillRect(sprite, 12, bodyTop + 1, 1, 5, shade(look.haut, -0.15));
  setPixel(sprite, 3, bodyTop + 6, look.peau);
  setPixel(sprite, 12, bodyTop + 6, look.peau);

  // Tête.
  const headY = bodyTop - 5;
  fillEllipse(sprite, 8, headY + 3, 5, 4.5, look.peau);

  if (direction === 'nord') {
    // De dos, les cheveux couvrent toute la tête : pas de visage à dessiner.
    fillEllipse(sprite, 8, headY + 2.5, 5, 4, look.cheveux);
  } else {
    fillEllipse(sprite, 8, headY + 1.5, 5, 3, look.cheveux);
    fillRect(sprite, 3, headY + 1, 2, 4, look.cheveux);
    fillRect(sprite, 11, headY + 1, 2, 4, look.cheveux);

    const eye = hex('#2b2b33');
    if (direction === 'sud') {
      fillRect(sprite, 6, headY + 4, 1, 2, eye);
      fillRect(sprite, 9, headY + 4, 1, 2, eye);
    } else {
      // De profil, un seul œil est visible, poussé vers l'avant du visage.
      fillRect(sprite, 10, headY + 4, 1, 2, eye);
      fillRect(sprite, 3, headY + 1, 3, 5, look.cheveux);
    }
  }

  if (look.coiffe) {
    fillEllipse(sprite, 8, headY + 1, 5.2, 2.6, look.coiffe);
    fillRect(sprite, 3, headY + 1, 11, 1, shade(look.coiffe, -0.2));
    if (direction !== 'nord') {
      // Visière, du côté où le personnage regarde.
      const brimX = direction === 'sud' ? 4 : 8;
      fillRect(sprite, brimX, headY + 2, 6, 1, shade(look.coiffe, -0.35));
    }
  }

  outline(sprite, hex('#1a1a22'));

  // Ombre au sol, posée après le contour pour qu'elle ne soit pas cernée.
  for (let x = 4; x < 12; x++) {
    for (let y = 18; y < 20; y++) {
      const dx = (x + 0.5 - 8) / 4;
      const dy = (y + 0.5 - 19) / 1.2;
      if (dx * dx + dy * dy <= 1 && sprite.data[(y * CHARACTER_WIDTH + x) * 4 + 3] === 0) {
        setPixel(sprite, x, y, [20, 24, 30, 90]);
      }
    }
  }

  return sprite;
}

/**
 * Planche complète : un bloc par personnage, trois lignes de direction, trois colonnes
 * de trame.
 */
export function buildCharacterSheet(): MutableSurface {
  const sheet = createSurface(
    CHARACTER_FRAMES * CHARACTER_WIDTH,
    CHARACTER_IDS.length * CHARACTER_DIRECTIONS.length * CHARACTER_HEIGHT,
  );

  CHARACTER_IDS.forEach((id, characterIndex) => {
    CHARACTER_DIRECTIONS.forEach((direction, directionIndex) => {
      for (let frame = 0; frame < CHARACTER_FRAMES; frame++) {
        const sprite = drawCharacter(CHARACTER_LOOKS[id], direction, frame);
        const originX = frame * CHARACTER_WIDTH;
        const originY =
          (characterIndex * CHARACTER_DIRECTIONS.length + directionIndex) * CHARACTER_HEIGHT;
        for (let y = 0; y < CHARACTER_HEIGHT; y++) {
          for (let x = 0; x < CHARACTER_WIDTH; x++) {
            const offset = (y * CHARACTER_WIDTH + x) * 4;
            if (sprite.data[offset + 3] === 0) continue;
            setPixel(sheet, originX + x, originY + y, [
              sprite.data[offset]!,
              sprite.data[offset + 1]!,
              sprite.data[offset + 2]!,
              sprite.data[offset + 3]!,
            ]);
          }
        }
      }
    });
  });

  return sheet;
}
