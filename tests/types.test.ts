import { describe, expect, it } from 'vitest';
import {
  ELEMENT_TYPES,
  effectivenessAgainst,
  effectivenessTier,
  resists,
  strongAgainst,
  typeEffectiveness,
  weakTo,
} from '../src/data/types.ts';

describe('table des types', () => {
  it('renvoie un multiplicateur valide pour toutes les paires', () => {
    for (const attaquant of ELEMENT_TYPES) {
      for (const defenseur of ELEMENT_TYPES) {
        expect([0, 0.5, 1, 2]).toContain(typeEffectiveness(attaquant, defenseur));
      }
    }
  });

  it('donne à chaque type au moins une faiblesse', () => {
    // Un type que rien ne contre rend une équipe mono-type invincible : c'est
    // l'invariant qui tient tout l'équilibrage du jeu.
    for (const type of ELEMENT_TYPES) {
      expect(weakTo(type), `${type} n’a aucune faiblesse`).not.toHaveLength(0);
    }
  });

  it('donne à chaque type au moins une résistance', () => {
    for (const type of ELEMENT_TYPES) {
      expect(resists(type), `${type} ne résiste à rien`).not.toHaveLength(0);
    }
  });

  it('donne à presque tous les types une cible contre laquelle frapper fort', () => {
    // Neutre fait exception : c'est le type sans avantage offensif, par construction.
    const sansAvantage = ELEMENT_TYPES.filter((type) => strongAgainst(type).length === 0);
    expect(sansAvantage).toEqual(['neutre']);
  });

  it('compose les multiplicateurs sur un double type', () => {
    // Sylve est ×2 sur onde et ×2 sur roche : une créature onde/roche prend ×4.
    expect(effectivenessAgainst('sylve', ['onde', 'roche'])).toBe(4);
    // Flamme est ×2 sur sylve et ×0,5 sur roche : les deux s'annulent.
    expect(effectivenessAgainst('flamme', ['sylve', 'roche'])).toBe(1);
  });

  it('propage l’immunité sur un double type', () => {
    // Métal est immunisé au poison, quel que soit son second type.
    expect(effectivenessAgainst('toxine', ['metal', 'sylve'])).toBe(0);
  });

  it('respecte les quatre immunités prévues', () => {
    expect(typeEffectiveness('neutre', 'ombre')).toBe(0);
    expect(typeEffectiveness('ombre', 'neutre')).toBe(0);
    expect(typeEffectiveness('foudre', 'roche')).toBe(0);
    expect(typeEffectiveness('toxine', 'metal')).toBe(0);
  });

  it('classe les multiplicateurs en paliers de message', () => {
    expect(effectivenessTier(0)).toBe('immune');
    expect(effectivenessTier(0.25)).toBe('veryWeak');
    expect(effectivenessTier(0.5)).toBe('weak');
    expect(effectivenessTier(1)).toBe('neutral');
    expect(effectivenessTier(2)).toBe('strong');
    expect(effectivenessTier(4)).toBe('veryStrong');
  });
});
