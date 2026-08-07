/**
 * Bruit cohérent, écrit à la main.
 *
 * Le relief d'une région ne peut pas être un tirage indépendant par case : ça donne une
 * neige de télévision, pas un paysage. Il faut que deux cases voisines se ressemblent.
 * C'est ce que fait le bruit de valeur : on tire une valeur aux nœuds d'une grille
 * lâche, puis on interpole entre eux.
 *
 * Aucune table de permutation n'est conservée en mémoire — chaque nœud est haché à la
 * demande depuis la seed. Le bruit est donc infini, sans état, et parfaitement
 * reproductible.
 */

import { subSeed } from '../core/rng.ts';

/** Valeur pseudo-aléatoire dans [0, 1) associée au nœud (x, y) d'une grille. */
function valeurNoeud(seed: number, x: number, y: number): number {
  let hash = subSeed(seed, x * 374761393, y * 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** Courbe en S : elle supprime les cassures de pente aux frontières de cellule. */
function adoucir(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function melanger(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Bruit de valeur bilinéaire en un point réel. Résultat dans [0, 1]. */
export function bruitValeur(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = adoucir(x - x0);
  const fy = adoucir(y - y0);

  const haut = melanger(valeurNoeud(seed, x0, y0), valeurNoeud(seed, x0 + 1, y0), fx);
  const bas = melanger(valeurNoeud(seed, x0, y0 + 1), valeurNoeud(seed, x0 + 1, y0 + 1), fx);
  return melanger(haut, bas, fy);
}

export interface FbmOptions {
  /** Nombre de couches superposées. Trois suffisent pour du terrain à cette échelle. */
  readonly octaves?: number;
  /** Taille des motifs de la première couche, en cases. */
  readonly echelle?: number;
  /** Poids de chaque couche par rapport à la précédente. */
  readonly persistance?: number;
}

/**
 * Bruit fractionnaire : plusieurs couches de bruit de valeur, chacune deux fois plus
 * fine et deux fois moins forte. C'est ce qui donne à la fois de grandes masses et du
 * détail — une seule couche produit des taches molles.
 */
export function fbm(seed: number, x: number, y: number, options: FbmOptions = {}): number {
  const octaves = options.octaves ?? 3;
  const echelle = options.echelle ?? 12;
  const persistance = options.persistance ?? 0.5;

  let somme = 0;
  let amplitude = 1;
  let total = 0;
  let frequence = 1 / echelle;

  for (let octave = 0; octave < octaves; octave++) {
    somme += bruitValeur(subSeed(seed, octave), x * frequence, y * frequence) * amplitude;
    total += amplitude;
    amplitude *= persistance;
    frequence *= 2;
  }

  return somme / total;
}

/**
 * Seuil qui découpe un champ de bruit selon une **proportion** voulue.
 *
 * Comparer le bruit à une constante ne donne pas la proportion qu'on croit : en
 * superposant des octaves, la moyenne resserre les valeurs autour de 0,5, si bien qu'un
 * seuil à 0,07 et un seuil à 0,03 sélectionnent la même queue de distribution. On trie
 * donc les valeurs réellement obtenues et on lit celle qui tombe au bon rang.
 *
 * `proportion` va de 0 à 1 : `quantile(champ, 0.07)` renvoie la valeur en dessous de
 * laquelle se trouvent exactement 7 % des cases.
 */
export function quantile(champ: readonly number[] | Float64Array, proportion: number): number {
  if (champ.length === 0) return 0;
  const trie = Array.from(champ).sort((a, b) => a - b);
  const rang = Math.min(trie.length - 1, Math.max(0, Math.round(proportion * (trie.length - 1))));
  return trie[rang]!;
}
