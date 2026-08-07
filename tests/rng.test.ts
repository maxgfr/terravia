import { describe, expect, it } from 'vitest';
import { hashString, makeRng, makeSeedText, rngFor, seedValue, subSeed } from '../src/core/rng.ts';

describe('rng', () => {
  it('produit la même suite pour la même seed', () => {
    const a = Array.from({ length: 20 }, () => makeRng(1234).next());
    const b = Array.from({ length: 20 }, () => makeRng(1234).next());
    expect(a).toEqual(b);
  });

  it('produit des suites différentes pour des seeds différentes', () => {
    const a = makeRng(1).next();
    const b = makeRng(2).next();
    expect(a).not.toBe(b);
  });

  it('reste dans [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() couvre les bornes inclusivement et ne les dépasse jamais', () => {
    const rng = makeRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const value = rng.int(3, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('shuffle() ne modifie pas le tableau source et conserve les éléments', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = makeRng(42).shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shuffled.slice().sort((x, y) => x - y)).toEqual(source);
  });

  it('weighted() respecte grossièrement les poids', () => {
    const rng = makeRng(5);
    const items = [
      { id: 'rare', weight: 1 },
      { id: 'commun', weight: 9 },
    ];
    let commun = 0;
    for (let i = 0; i < 10_000; i++) {
      if (rng.weighted(items, (item) => item.weight).id === 'commun') commun++;
    }
    expect(commun / 10_000).toBeGreaterThan(0.85);
    expect(commun / 10_000).toBeLessThan(0.95);
  });

  it('weighted() tolère des poids nuls sans boucler', () => {
    const rng = makeRng(11);
    const items = [{ w: 0 }, { w: 0 }];
    expect(items).toContain(rng.weighted(items, (item) => item.w));
  });
});

describe('sous-seeds', () => {
  it('isole les systèmes les uns des autres', () => {
    // Le cœur du contrat de déterminisme : deux systèmes différents sur la même
    // région ne doivent jamais partager la même suite de tirages.
    const terrain = rngFor(1000, 3, 'terrain').next();
    const npc = rngFor(1000, 3, 'npc').next();
    expect(terrain).not.toBe(npc);
  });

  it('distingue les régions', () => {
    expect(subSeed(1000, 1, 'terrain')).not.toBe(subSeed(1000, 2, 'terrain'));
  });

  it('est stable entre deux appels', () => {
    expect(subSeed(1000, 3, 'terrain')).toBe(subSeed(1000, 3, 'terrain'));
  });
});

describe('seeds lisibles', () => {
  it('hashString est stable et non nul pour du texte usuel', () => {
    expect(hashString('terravia')).toBe(hashString('terravia'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('seedValue ignore la casse et les espaces autour', () => {
    expect(seedValue('  Brume-3F7A ')).toBe(seedValue('brume-3f7a'));
  });

  it('makeSeedText produit un identifiant de la forme mot-hexa', () => {
    for (let i = 0; i < 200; i++) {
      const text = makeSeedText(i / 200);
      expect(text).toMatch(/^[a-z]+-[0-9a-f]{4}$/);
    }
  });
});
