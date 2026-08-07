import { describe, expect, it } from 'vitest';
import { BIOMES, TIME_SLOTS } from '../src/data/biomes.ts';
import { MOVE_IDS, MOVES, isDamaging } from '../src/data/moves.ts';
import {
  SPECIES,
  SPECIES_IDS,
  STARTER_IDS,
  baseStatTotal,
  movesAtLevel,
  SILHOUETTES,
  TRAITS,
} from '../src/data/species.ts';
import { experienceForLevel, GROWTH_RATES, levelForExperience, STAT_KEYS, stageMultiplier } from '../src/data/stats.ts';
import { TALENT_IDS, TALENTS } from '../src/data/talents.ts';
import { ELEMENT_TYPES } from '../src/data/types.ts';

describe('attaques', () => {
  it('déclare des valeurs cohérentes', () => {
    for (const id of MOVE_IDS) {
      const move = MOVES[id];
      expect(ELEMENT_TYPES, id).toContain(move.type);
      expect(move.precision, id).toBeGreaterThanOrEqual(0);
      expect(move.precision, id).toBeLessThanOrEqual(100);
      expect(move.pp, id).toBeGreaterThan(0);
      expect(move.priorite, id).toBeGreaterThanOrEqual(-3);
      expect(move.priorite, id).toBeLessThanOrEqual(3);
      expect(move.nom.fr.length, id).toBeGreaterThan(0);
      expect(move.nom.en.length, id).toBeGreaterThan(0);
    }
  });

  it('n’attribue de puissance qu’aux attaques offensives', () => {
    for (const id of MOVE_IDS) {
      const move = MOVES[id];
      if (move.categorie === 'statut') {
        expect(move.puissance, `${id} est une attaque de statut`).toBe(0);
        expect(isDamaging(move)).toBe(false);
      } else {
        expect(move.puissance, `${id} est offensive`).toBeGreaterThan(0);
        expect(isDamaging(move)).toBe(true);
      }
    }
  });

  it('couvre les douze types', () => {
    const couverts = new Set(MOVE_IDS.map((id) => MOVES[id].type));
    for (const type of ELEMENT_TYPES) {
      expect([...couverts], `aucune attaque de type ${type}`).toContain(type);
    }
  });

  it('garde les probabilités d’effet dans les bornes', () => {
    for (const id of MOVE_IDS) {
      const effet = MOVES[id].effet;
      if (effet && 'chance' in effet) {
        expect(effet.chance, id).toBeGreaterThan(0);
        expect(effet.chance, id).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('espèces', () => {
  it('déclare 30 espèces numérotées sans trou', () => {
    expect(SPECIES_IDS).toHaveLength(30);
    const numeros = SPECIES_IDS.map((id) => SPECIES[id].numero);
    expect(numeros).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('ne référence que des attaques, talents et biomes existants', () => {
    for (const id of SPECIES_IDS) {
      const species = SPECIES[id];
      for (const entry of species.apprentissage) {
        expect(MOVE_IDS, `${id} apprend ${entry.move}`).toContain(entry.move);
        expect(entry.niveau, `${id}/${entry.move}`).toBeGreaterThanOrEqual(1);
        expect(entry.niveau, `${id}/${entry.move}`).toBeLessThanOrEqual(100);
      }
      for (const talent of species.talents) {
        expect(TALENT_IDS, `${id} porte ${talent}`).toContain(talent);
      }
      for (const habitat of species.habitats) {
        expect(BIOMES, `${id} vit en ${habitat}`).toContain(habitat);
      }
      expect(TIME_SLOTS, id).toContain(species.creneau);
      expect(SILHOUETTES, id).toContain(species.apparence.silhouette);
      for (const trait of species.apparence.traits) {
        expect(TRAITS, `${id} porte le trait ${trait}`).toContain(trait);
      }
    }
  });

  it('a des évolutions cohérentes', () => {
    for (const id of SPECIES_IDS) {
      const evolution = SPECIES[id].evolution;
      if (!evolution) continue;
      expect(SPECIES_IDS, `${id} évolue en ${evolution.vers}`).toContain(evolution.vers);
      expect(evolution.vers, `${id} évolue en lui-même`).not.toBe(id);
      // L'évolution doit être un progrès : sinon, évoluer affaiblit la créature.
      expect(baseStatTotal(SPECIES[evolution.vers]), `${evolution.vers} vs ${id}`).toBeGreaterThan(
        baseStatTotal(SPECIES[id]),
      );
    }
  });

  it('n’enferme aucune espèce dans une boucle d’évolution', () => {
    for (const depart of SPECIES_IDS) {
      const vus = new Set<string>([depart]);
      let courant = SPECIES[depart].evolution?.vers;
      while (courant) {
        expect(vus, `boucle d’évolution depuis ${depart}`).not.toContain(courant);
        vus.add(courant);
        courant = SPECIES[courant].evolution?.vers;
      }
    }
  });

  it('tient le budget de statistiques', () => {
    for (const id of SPECIES_IDS) {
      const species = SPECIES[id];
      const total = baseStatTotal(species);
      expect(total, `${id} est hors budget`).toBeGreaterThanOrEqual(250);
      expect(total, `${id} est hors budget`).toBeLessThanOrEqual(610);
      for (const stat of STAT_KEYS) {
        expect(species.base[stat], `${id}.${stat}`).toBeGreaterThanOrEqual(20);
        expect(species.base[stat], `${id}.${stat}`).toBeLessThanOrEqual(150);
      }
    }
  });

  it('garde les taux de capture dans les bornes', () => {
    for (const id of SPECIES_IDS) {
      expect(SPECIES[id].tauxCapture, id).toBeGreaterThanOrEqual(3);
      expect(SPECIES[id].tauxCapture, id).toBeLessThanOrEqual(255);
    }
  });

  it('propose trois créatures de départ de types opposés', () => {
    expect(STARTER_IDS).toHaveLength(3);
    const types = STARTER_IDS.map((id) => SPECIES[id].types[0]);
    expect(new Set(types).size).toBe(3);
    for (const id of STARTER_IDS) {
      expect(SPECIES_IDS).toContain(id);
      expect(SPECIES[id].evolution, `${id} doit pouvoir évoluer`).toBeDefined();
    }
  });

  it('donne au moins une attaque à toute créature dès le niveau 1', () => {
    for (const id of SPECIES_IDS) {
      expect(movesAtLevel(SPECIES[id], 1).length, id).toBeGreaterThan(0);
    }
  });

  it('ne retient jamais plus de quatre attaques', () => {
    for (const id of SPECIES_IDS) {
      expect(movesAtLevel(SPECIES[id], 100).length, id).toBeLessThanOrEqual(4);
    }
  });

  it('couvre tous les biomes par au moins une espèce', () => {
    const occupes = new Set(SPECIES_IDS.flatMap((id) => SPECIES[id].habitats));
    for (const biome of BIOMES) {
      expect([...occupes], `aucune espèce en ${biome}`).toContain(biome);
    }
  });

  it('utilise chaque silhouette au moins une fois', () => {
    const utilisees = new Set(SPECIES_IDS.map((id) => SPECIES[id].apparence.silhouette));
    for (const silhouette of SILHOUETTES) {
      expect([...utilisees], `silhouette ${silhouette} inutilisée`).toContain(silhouette);
    }
  });
});

describe('talents', () => {
  it('sont tous portés par au moins une espèce', () => {
    const portes = new Set(SPECIES_IDS.flatMap((id) => SPECIES[id].talents));
    for (const talent of TALENT_IDS) {
      expect([...portes], `talent ${talent} orphelin`).toContain(talent);
    }
  });

  it('déclarent un nom et une description dans les deux langues', () => {
    for (const id of TALENT_IDS) {
      const talent = TALENTS[id];
      for (const langue of ['fr', 'en'] as const) {
        expect(talent.nom[langue].length, `${id}.nom.${langue}`).toBeGreaterThan(0);
        expect(talent.description[langue].length, `${id}.description.${langue}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('progression', () => {
  it('rend les courbes d’expérience strictement croissantes', () => {
    for (const rate of GROWTH_RATES) {
      for (let level = 1; level < 100; level++) {
        expect(experienceForLevel(level + 1, rate), `${rate} niveau ${level}`).toBeGreaterThan(
          experienceForLevel(level, rate),
        );
      }
    }
  });

  it('fait correspondre niveau et expérience dans les deux sens', () => {
    for (const rate of GROWTH_RATES) {
      for (const level of [1, 5, 16, 34, 50, 99, 100]) {
        expect(levelForExperience(experienceForLevel(level, rate), rate), `${rate}/${level}`).toBe(level);
      }
    }
  });

  it('rend une créature rapide moins coûteuse qu’une lente', () => {
    expect(experienceForLevel(100, 'rapide')).toBeLessThan(experienceForLevel(100, 'moyen'));
    expect(experienceForLevel(100, 'moyen')).toBeLessThan(experienceForLevel(100, 'lent'));
  });

  it('applique des étages de statistique symétriques et bornés', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(-2)).toBe(0.5);
    expect(stageMultiplier(6)).toBe(4);
    expect(stageMultiplier(12)).toBe(stageMultiplier(6));
    expect(stageMultiplier(-12)).toBe(stageMultiplier(-6));
  });
});
