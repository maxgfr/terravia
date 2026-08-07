import { describe, expect, it } from 'vitest';
import { makeRng, type Rng } from '../src/core/rng.ts';
import { MOVES } from '../src/data/moves.ts';
import { SPECIES } from '../src/data/species.ts';
import { experienceForLevel, STAT_KEYS, TRAINING_MAX_TOTAL } from '../src/data/stats.ts';
import { choisirAttaque, noterAttaque } from '../src/battle/ai.ts';
import { chanceDeFuite, tenterCapture } from '../src/battle/capture.ts';
import { calculerDegats, creerCombattant, statEnCombat, toucheLaCible } from '../src/battle/damage.ts';
import { creerCombat, evenementsEntree, ordreDuTour, resoudreTour, type BattleEvent } from '../src/battle/engine.ts';
import {
  apprendreAttaque,
  creerCreature,
  dressageGagne,
  entrainer,
  evoluer,
  experienceGagnee,
  gagnerExperience,
  pvMax,
  soignerCompletement,
  statistique,
  type CreatureInstance,
} from '../src/game/creature.ts';
import type { SpeciesId } from '../src/data/species.ts';

let compteur = 0;
function creature(speciesId: SpeciesId, niveau: number, seed = 1): CreatureInstance {
  compteur += 1;
  return creerCreature(makeRng(seed), {
    uid: `test-${compteur}`,
    speciesId,
    niveau,
    origine: 'test-0000',
  });
}

function evenementsDe(events: BattleEvent[], type: BattleEvent['type']): BattleEvent[] {
  return events.filter((event) => event.type === type);
}

describe('exemplaires', () => {
  it('calcule des statistiques croissantes avec le niveau', () => {
    const bas = creature('folianz', 5);
    const haut = creature('folianz', 50);
    for (const stat of STAT_KEYS) {
      expect(statistique(haut, stat), stat).toBeGreaterThan(statistique(bas, stat));
    }
  });

  it('donne des gènes différents à deux exemplaires', () => {
    const a = creerCreature(makeRng(1), { uid: 'a', speciesId: 'mulotin', niveau: 10, origine: 's' });
    const b = creerCreature(makeRng(2), { uid: 'b', speciesId: 'mulotin', niveau: 10, origine: 's' });
    expect(a.genes).not.toEqual(b.genes);
  });

  it('naît avec tous ses points de vie et jusqu’à quatre attaques', () => {
    const instance = creature('sylvanor', 40);
    expect(instance.pv).toBe(pvMax(instance));
    expect(instance.moves.length).toBeGreaterThan(0);
    expect(instance.moves.length).toBeLessThanOrEqual(4);
    expect(instance.statut).toBeNull();
  });

  it('monte de niveau sans se soigner gratuitement', () => {
    const instance = creature('braisou', 5);
    instance.pv = 3;
    const pvAvant = instance.pv;
    const maxAvant = pvMax(instance);
    const gain = gagnerExperience(instance, experienceForLevel(12, 'moyen'));
    expect(gain.niveauApres).toBeGreaterThan(gain.niveauAvant);
    // Les PV courants montent de l'accroissement du maximum, pas jusqu'au maximum.
    expect(instance.pv).toBe(pvAvant + (pvMax(instance) - maxAvant));
    expect(instance.pv).toBeLessThan(pvMax(instance));
  });

  it('signale les attaques apprises et l’évolution possible', () => {
    const instance = creature('folianz', 5);
    const gain = gagnerExperience(instance, experienceForLevel(20, 'moyen'));
    expect(gain.nouvellesAttaques.length).toBeGreaterThan(0);
    expect(gain.evolution).toBe('frondanz');
  });

  it('conserve gènes, dressage et attaques en évoluant', () => {
    const instance = creature('folianz', 16);
    entrainer(instance, 'attaque', 40);
    const evolue = evoluer(instance, 'frondanz');
    expect(evolue.speciesId).toBe('frondanz');
    expect(evolue.genes).toEqual(instance.genes);
    expect(evolue.dressage).toEqual(instance.dressage);
    expect(evolue.moves).toEqual(instance.moves);
  });

  it('garde la proportion de points de vie en évoluant', () => {
    const instance = creature('folianz', 16);
    instance.pv = Math.floor(pvMax(instance) / 2);
    const evolue = evoluer(instance, 'frondanz');
    const ratio = evolue.pv / pvMax(evolue);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('plafonne le dressage par statistique et au total', () => {
    const instance = creature('mulotin', 30);
    expect(entrainer(instance, 'attaque', 300)).toBe(252);
    expect(entrainer(instance, 'defense', 300)).toBe(252);
    expect(entrainer(instance, 'vitesse', 300)).toBe(TRAINING_MAX_TOTAL - 504);
    const total = STAT_KEYS.reduce((somme, stat) => somme + instance.dressage[stat], 0);
    expect(total).toBe(TRAINING_MAX_TOTAL);
  });

  it('refuse d’apprendre deux fois la même attaque', () => {
    const instance = creature('mulotin', 30);
    const existante = instance.moves[0]!.id;
    expect(apprendreAttaque(instance, existante, 0)).toBe(false);
  });

  it('remplace une attaque quand les quatre emplacements sont pris', () => {
    const instance = creature('mulotin', 40);
    while (instance.moves.length < 4) instance.moves.push({ id: 'repli', pp: 10 });
    expect(apprendreAttaque(instance, 'seisme', 1)).toBe(true);
    expect(instance.moves[1]!.id).toBe('seisme');
    expect(instance.moves).toHaveLength(4);
  });

  it('restaure tout au soin complet', () => {
    const instance = creature('gouttin', 20);
    instance.pv = 1;
    instance.statut = 'brulure';
    instance.moves[0]!.pp = 0;
    soignerCompletement(instance);
    expect(instance.pv).toBe(pvMax(instance));
    expect(instance.statut).toBeNull();
    expect(instance.moves[0]!.pp).toBe(MOVES[instance.moves[0]!.id].pp);
  });

  it('récompense davantage une victoire contre un dresseur', () => {
    const vaincu = creature('mulotin', 20);
    expect(experienceGagnee(vaincu, true)).toBeGreaterThan(experienceGagnee(vaincu, false));
    expect(dressageGagne(vaincu).points).toBeGreaterThan(0);
  });
});

describe('formule de dégâts', () => {
  const rng: Rng = makeRng(7);

  it('inflige au moins un point de dégât', () => {
    const attaquant = creerCombattant(creature('plumelle', 5));
    const defenseur = creerCombattant(creature('menhirok', 60));
    const resultat = calculerDegats(attaquant, defenseur, MOVES.ruade, rng, { critique: false, alea: 0.85 });
    expect(resultat.degats).toBeGreaterThanOrEqual(1);
  });

  it('n’inflige rien contre une immunité de type', () => {
    // Foudre ne peut rien contre Roche : la pierre met la décharge à la terre.
    const attaquant = creerCombattant(creature('luciolin', 30));
    const defenseur = creerCombattant(creature('menhirok', 30));
    const resultat = calculerDegats(attaquant, defenseur, MOVES.etincelle, rng);
    expect(resultat.degats).toBe(0);
    expect(resultat.palier).toBe('immune');
  });

  it('multiplie par quatre sur une double faiblesse', () => {
    // Boréalix est Givre/Vent, et Roche frappe ×2 sur chacun des deux.
    const attaquant = creerCombattant(creature('menhirok', 30));
    const doubleFaible = creerCombattant(creature('borealix', 30));
    const double = calculerDegats(attaquant, doubleFaible, MOVES.eboulement, rng, {
      critique: false,
      alea: 1,
    });
    expect(double.efficacite).toBe(4);
    expect(double.palier).toBe('veryStrong');

    // Contre un type simplement faible, la même attaque ne fait que ×2.
    const simple = creerCombattant(creature('givrelin', 30));
    const resultatSimple = calculerDegats(attaquant, simple, MOVES.eboulement, rng, {
      critique: false,
      alea: 1,
    });
    expect(resultatSimple.efficacite).toBe(2);
  });

  it('frappe plus fort avec un coup critique', () => {
    const attaquant = creerCombattant(creature('braisou', 30));
    const defenseur = creerCombattant(creature('folianz', 30));
    const normal = calculerDegats(attaquant, defenseur, MOVES.braise, rng, { critique: false, alea: 1 });
    const critique = calculerDegats(attaquant, defenseur, MOVES.braise, rng, { critique: true, alea: 1 });
    expect(critique.degats).toBeGreaterThan(normal.degats);
  });

  it('applique le bonus du type identique', () => {
    // Braisou est de type Flamme : Braise (Flamme) frappe plus fort que Ruade (Neutre)
    // à puissance égale, une fois la puissance normalisée.
    const attaquant = creerCombattant(creature('braisou', 30));
    const defenseur = creerCombattant(creature('mulotin', 30));
    const avecStab = calculerDegats(attaquant, defenseur, MOVES.braise, rng, { critique: false, alea: 1 });
    const sansStab = calculerDegats(attaquant, defenseur, MOVES.jetDEau, rng, { critique: false, alea: 1 });
    // Braise et Jet d'Eau ont la même puissance et la même catégorie.
    expect(MOVES.braise.puissance).toBe(MOVES.jetDEau.puissance);
    expect(avecStab.degats).toBeGreaterThan(sansStab.degats);
  });

  it('divise par deux les dégâts physiques d’une créature brûlée', () => {
    const sain = creerCombattant(creature('mulotin', 30, 3));
    const brule = creerCombattant(creature('mulotin', 30, 3));
    brule.instance.statut = 'brulure';
    const defenseur = creerCombattant(creature('gouttin', 30));
    const degatsSain = calculerDegats(sain, defenseur, MOVES.ruade, rng, { critique: false, alea: 1 });
    const degatsBrule = calculerDegats(brule, defenseur, MOVES.ruade, rng, { critique: false, alea: 1 });
    expect(degatsBrule.degats).toBeLessThan(degatsSain.degats);
  });

  it('ne rate jamais une attaque de précision nulle', () => {
    for (let i = 0; i < 500; i++) expect(toucheLaCible(MOVES.piqueAerienne, rng)).toBe(true);
  });

  it('rate parfois une attaque imprécise', () => {
    let rates = 0;
    for (let i = 0; i < 2000; i++) if (!toucheLaCible(MOVES.fulguration, rng)) rates++;
    expect(rates).toBeGreaterThan(200);
    expect(rates).toBeLessThan(600);
  });

  it('halve la vitesse d’une créature paralysée', () => {
    const sain = creerCombattant(creature('zephyrion', 40, 9));
    const paralyse = creerCombattant(creature('zephyrion', 40, 9));
    paralyse.instance.statut = 'paralysie';
    expect(statEnCombat(paralyse, 'vitesse')).toBeLessThan(statEnCombat(sain, 'vitesse'));
  });
});

describe('résolution du tour', () => {
  it('fait frapper la plus rapide en premier', () => {
    const state = creerCombat(creature('zephyrion', 40), creature('menhirok', 40), 'sauvage');
    const ordre = ordreDuTour(state, MOVES.ruade, MOVES.ruade, makeRng(1));
    expect(ordre[0]).toBe('joueur');
  });

  it('fait passer la priorité avant la vitesse', () => {
    const state = creerCombat(creature('menhirok', 40), creature('zephyrion', 40), 'sauvage');
    const ordre = ordreDuTour(state, MOVES.pisteRapide, MOVES.ruade, makeRng(1));
    expect(ordre[0]).toBe('joueur');
  });

  it('décrémente les PP de l’attaque utilisée', () => {
    const state = creerCombat(creature('mulotin', 20), creature('mulotin', 20), 'sauvage');
    const avant = state.joueur.instance.moves[0]!.pp;
    resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(5));
    expect(state.joueur.instance.moves[0]!.pp).toBe(avant - 1);
  });

  it('se rabat sur Lutte quand plus aucune attaque n’a de PP', () => {
    const state = creerCombat(creature('mulotin', 20), creature('mulotin', 20), 'sauvage');
    for (const slot of state.joueur.instance.moves) slot.pp = 0;
    const events = resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(5));
    const attaques = evenementsDe(events, 'attaque');
    expect(attaques.some((event) => 'move' in event && event.move === 'lutte')).toBe(true);
  });

  it('met fin au combat quand une créature tombe', () => {
    const state = creerCombat(creature('mulotin', 50), creature('plumelle', 2), 'sauvage');
    // On impose une attaque offensive : au niveau 50, l'emplacement 0 de Mulotin est
    // Cri, une attaque de statut qui n'aurait jamais mis fin au combat.
    state.joueur.instance.moves = [{ id: 'chargeLourde', pp: 20 }];
    let events: BattleEvent[] = [];
    for (let tour = 0; tour < 12 && state.issue === null; tour++) {
      events = resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(tour + 1));
    }
    expect(state.issue).toBe('adversaireKo');
    expect(evenementsDe(events, 'ko')).toHaveLength(1);
  });

  it('n’émet plus aucun événement une fois le combat terminé', () => {
    const state = creerCombat(creature('mulotin', 50), creature('plumelle', 2), 'sauvage');
    while (state.issue === null) resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(3));
    expect(resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(3))).toEqual([]);
  });

  it('interdit la fuite face à un dresseur', () => {
    const state = creerCombat(creature('mulotin', 20), creature('mulotin', 20), 'dresseur');
    const events = resoudreTour(state, { kind: 'fuite' }, 0, makeRng(1));
    const fuite = events.find((event) => event.type === 'fuite');
    expect(fuite && 'reussi' in fuite && fuite.reussi).toBe(false);
    expect(state.issue).toBeNull();
  });

  it('laisse fuir un combat sauvage face à plus lent', () => {
    const state = creerCombat(creature('zephyrion', 50), creature('galetin', 5), 'sauvage');
    resoudreTour(state, { kind: 'fuite' }, 0, makeRng(1));
    expect(state.issue).toBe('fuite');
  });

  it('applique les dégâts d’altération en fin de tour', () => {
    const state = creerCombat(creature('mulotin', 30), creature('mulotin', 30), 'sauvage');
    state.joueur.instance.statut = 'poison';
    const pvAvant = state.joueur.instance.pv;
    resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(11));
    expect(state.joueur.instance.pv).toBeLessThan(pvAvant);
  });

  it('réveille une créature endormie après quelques tours', () => {
    const state = creerCombat(creature('mulotin', 30), creature('mulotin', 30), 'sauvage');
    state.joueur.instance.statut = 'sommeil';
    state.joueur.instance.sommeil = 2;
    let reveille = false;
    for (let tour = 0; tour < 6 && !reveille; tour++) {
      const events = resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(tour + 20));
      reveille = events.some((event) => event.type === 'statutDissipe');
    }
    expect(reveille).toBe(true);
    expect(state.joueur.instance.statut).toBeNull();
  });

  it('n’empoisonne jamais une créature Métal', () => {
    const state = creerCombat(creature('mulotin', 30), creature('acierac', 30), 'sauvage');
    for (let tour = 0; tour < 40; tour++) {
      const rng = makeRng(tour + 1);
      state.joueur.instance.moves = [{ id: 'brumeToxique', pp: 40 }];
      resoudreTour(state, { kind: 'attaque', index: 0 }, 0, rng);
      state.adversaire.instance.pv = pvMax(state.adversaire.instance);
      state.issue = null;
    }
    expect(state.adversaire.instance.statut).not.toBe('poison');
  });

  it('applique Intimidation à l’entrée en combat', () => {
    const state = creerCombat(creature('flamboux', 30), creature('mulotin', 30), 'sauvage');
    state.joueur.instance.talentId = 'intimidation';
    const events = evenementsEntree(state, 'joueur');
    expect(state.adversaire.etages.attaque).toBe(-1);
    expect(evenementsDe(events, 'stat')).toHaveLength(1);
  });

  it('soigne au lieu de blesser avec le talent Paratonnerre', () => {
    const state = creerCombat(creature('mulotin', 30), creature('luciolin', 30), 'sauvage');
    state.joueur.instance.moves = [{ id: 'etincelle', pp: 20 }];
    state.adversaire.instance.talentId = 'paratonnerre';
    state.adversaire.instance.pv = 5;
    resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(2));
    expect(state.adversaire.instance.pv).toBeGreaterThan(5);
  });

  it('borne les étages de statistique à six', () => {
    const state = creerCombat(creature('mulotin', 30), creature('mulotin', 30), 'sauvage');
    state.joueur.instance.moves = [{ id: 'aiguisage', pp: 40 }];
    // L'adversaire doit frapper plutôt que crier : son emplacement 0 par défaut est
    // Cri, qui rabaisserait l'Attaque d'un cran juste après chaque Aiguisage.
    state.adversaire.instance.moves = [{ id: 'ruade', pp: 40 }];
    for (let tour = 0; tour < 10; tour++) {
      resoudreTour(state, { kind: 'attaque', index: 0 }, 0, makeRng(tour + 30));
      state.issue = null;
      state.joueur.instance.pv = pvMax(state.joueur.instance);
      state.adversaire.instance.pv = pvMax(state.adversaire.instance);
    }
    expect(state.joueur.etages.attaque).toBe(6);
  });

  it('soigne avec un objet en combat', () => {
    const state = creerCombat(creature('gouttin', 30), creature('mulotin', 5), 'sauvage');
    state.joueur.instance.pv = 5;
    resoudreTour(state, { kind: 'objet', item: 'potion' }, 0, makeRng(4));
    expect(state.joueur.instance.pv).toBeGreaterThan(5);
  });
});

describe('capture', () => {
  it('réussit plus souvent sur une cible affaiblie', () => {
    const rng = makeRng(1234);
    const compter = (ratioPv: number): number => {
      let succes = 0;
      for (let i = 0; i < 2000; i++) {
        const cible = creature('mulotin', 10);
        cible.pv = Math.max(1, Math.round(pvMax(cible) * ratioPv));
        if (tenterCapture(cible, 'prisme', rng).reussi) succes++;
      }
      return succes;
    };
    expect(compter(0.1)).toBeGreaterThan(compter(1));
  });

  it('réussit plus souvent sur une cible endormie', () => {
    const rng = makeRng(555);
    const compter = (endormie: boolean): number => {
      let succes = 0;
      for (let i = 0; i < 2000; i++) {
        const cible = creature('mulotin', 10);
        cible.pv = Math.round(pvMax(cible) * 0.5);
        if (endormie) cible.statut = 'sommeil';
        if (tenterCapture(cible, 'prisme', rng).reussi) succes++;
      }
      return succes;
    };
    expect(compter(true)).toBeGreaterThan(compter(false));
  });

  it('réussit plus souvent avec un meilleur prisme', () => {
    const rng = makeRng(99);
    const compter = (prisme: 'prisme' | 'prismeRoyal'): number => {
      let succes = 0;
      for (let i = 0; i < 2000; i++) {
        const cible = creature('chatoyan', 30);
        cible.pv = Math.round(pvMax(cible) * 0.4);
        if (tenterCapture(cible, prisme, rng).reussi) succes++;
      }
      return succes;
    };
    expect(compter('prismeRoyal')).toBeGreaterThan(compter('prisme'));
  });

  it('ne capture presque jamais une créature unique à pleins points de vie', () => {
    const rng = makeRng(31337);
    let succes = 0;
    for (let i = 0; i < 3000; i++) {
      const cible = creature('solarion', 30);
      if (tenterCapture(cible, 'prisme', rng).reussi) succes++;
    }
    expect(succes / 3000).toBeLessThan(0.02);
  });

  it('rend un nombre de secousses cohérent avec le résultat', () => {
    const rng = makeRng(808);
    for (let i = 0; i < 500; i++) {
      const cible = creature('mulotin', 10);
      cible.pv = Math.round(pvMax(cible) * 0.3);
      const resultat = tenterCapture(cible, 'prisme', rng);
      expect(resultat.secousses).toBeGreaterThanOrEqual(0);
      expect(resultat.secousses).toBeLessThanOrEqual(4);
      if (resultat.reussi) expect(resultat.secousses).toBe(4);
      else expect(resultat.secousses).toBeLessThan(4);
    }
  });

  it('garantit la fuite face à plus lent, et l’améliore à chaque essai', () => {
    expect(chanceDeFuite(100, 50, 0)).toBe(1);
    expect(chanceDeFuite(50, 100, 1)).toBeGreaterThan(chanceDeFuite(50, 100, 0));
  });
});

describe('intelligence adverse', () => {
  it('préfère une attaque efficace à une attaque neutre', () => {
    const rng = makeRng(17);
    const attaquant = creerCombattant(creature('braisou', 30));
    const defenseur = creerCombattant(creature('folianz', 30));
    const flamme = noterAttaque(attaquant, defenseur, MOVES.braise, rng);
    const neutre = noterAttaque(attaquant, defenseur, MOVES.ruade, rng);
    expect(flamme).toBeGreaterThan(neutre);
  });

  it('n’accorde aucune valeur à une attaque sans effet', () => {
    const rng = makeRng(17);
    const attaquant = creerCombattant(creature('luciolin', 30));
    const defenseur = creerCombattant(creature('menhirok', 30));
    expect(noterAttaque(attaquant, defenseur, MOVES.etincelle, rng)).toBe(0);
  });

  it('ne repropose pas une altération à une cible déjà atteinte', () => {
    const rng = makeRng(17);
    const attaquant = creerCombattant(creature('luciolin', 30));
    const defenseur = creerCombattant(creature('mulotin', 30));
    defenseur.instance.statut = 'paralysie';
    expect(noterAttaque(attaquant, defenseur, MOVES.ondeDeChoc, rng)).toBe(0);
  });

  it('choisit toujours le meilleur coup au niveau champion', () => {
    const rng = makeRng(21);
    const attaquant = creerCombattant(creature('braisou', 30));
    attaquant.instance.moves = [
      { id: 'ruade', pp: 20 },
      { id: 'braise', pp: 20 },
    ];
    const defenseur = creerCombattant(creature('folianz', 30));
    for (let i = 0; i < 50; i++) {
      expect(choisirAttaque(attaquant, defenseur, 'champion', rng)).toBe(1);
    }
  });

  it('se trompe parfois à un niveau de route', () => {
    const rng = makeRng(21);
    const attaquant = creerCombattant(creature('braisou', 30));
    attaquant.instance.moves = [
      { id: 'ruade', pp: 99 },
      { id: 'braise', pp: 99 },
    ];
    const defenseur = creerCombattant(creature('folianz', 30));
    const choix = new Set<number>();
    for (let i = 0; i < 200; i++) choix.add(choisirAttaque(attaquant, defenseur, 'route', rng));
    expect(choix.size).toBe(2);
  });

  it('ne choisit jamais une attaque sans PP', () => {
    const rng = makeRng(21);
    const attaquant = creerCombattant(creature('braisou', 30));
    attaquant.instance.moves = [
      { id: 'braise', pp: 0 },
      { id: 'ruade', pp: 5 },
    ];
    const defenseur = creerCombattant(creature('folianz', 30));
    for (let i = 0; i < 100; i++) {
      expect(choisirAttaque(attaquant, defenseur, 'route', rng)).toBe(1);
    }
  });
});

describe('reproductibilité', () => {
  it('rejoue un combat entier à l’identique avec la même seed', () => {
    // C'est ce que garantit un moteur sans effet de bord : le même combat, événement
    // par événement. Sans cela, aucun test de combat ne serait stable.
    const jouer = (): BattleEvent[] => {
      const state = creerCombat(creature('folianz', 20, 42), creature('braisou', 20, 43), 'sauvage');
      const rng = makeRng(2024);
      const tous: BattleEvent[] = [];
      for (let tour = 0; tour < 20 && state.issue === null; tour++) {
        tous.push(...resoudreTour(state, { kind: 'attaque', index: 0 }, 0, rng));
      }
      return tous;
    };
    expect(jouer()).toEqual(jouer());
  });

  it('ne fait jamais descendre les points de vie sous zéro', () => {
    for (let seed = 0; seed < 60; seed++) {
      const state = creerCombat(creature('mulotin', 30, seed + 1), creature('acierac', 30, seed + 2), 'sauvage');
      const rng = makeRng(seed);
      for (let tour = 0; tour < 40 && state.issue === null; tour++) {
        resoudreTour(state, { kind: 'attaque', index: tour % 2 }, tour % 2, rng);
        expect(state.joueur.instance.pv).toBeGreaterThanOrEqual(0);
        expect(state.adversaire.instance.pv).toBeGreaterThanOrEqual(0);
        expect(state.joueur.instance.pv).toBeLessThanOrEqual(pvMax(state.joueur.instance));
        expect(state.adversaire.instance.pv).toBeLessThanOrEqual(pvMax(state.adversaire.instance));
      }
    }
  });

  it('finit toujours par se conclure', () => {
    // Un combat qui ne se termine pas bloque la partie : on vérifie que 300 tours
    // suffisent quelles que soient les créatures engagées.
    const especes = Object.keys(SPECIES) as SpeciesId[];
    for (let seed = 0; seed < 40; seed++) {
      const rng = makeRng(seed + 500);
      const state = creerCombat(
        creature(especes[seed % especes.length]!, 25, seed),
        creature(especes[(seed * 7) % especes.length]!, 25, seed + 1),
        'sauvage',
      );
      let tours = 0;
      while (state.issue === null && tours < 300) {
        resoudreTour(state, { kind: 'attaque', index: 0 }, 0, rng);
        tours++;
      }
      expect(state.issue, `seed ${seed}`).not.toBeNull();
    }
  });
});
