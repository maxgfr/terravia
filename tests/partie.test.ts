/**
 * Parcours complet d'une partie, sans navigateur.
 *
 * Les tests précédents vérifient chaque couche isolément. Celui-ci les fait travailler
 * ensemble : créer une partie, traverser le monde, gagner des combats, monter de
 * niveau, évoluer, sauvegarder, recharger. C'est là que se voient les erreurs de
 * raccordement qu'aucun test unitaire ne peut attraper.
 */

import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng.ts';
import { choisirAttaque } from '../src/battle/ai.ts';
import { creerCombat, resoudreTour } from '../src/battle/engine.ts';
import {
  creerCreature,
  evoluer,
  experienceGagnee,
  gagnerExperience,
  pvMax,
  soignerCompletement,
  type CreatureInstance,
} from '../src/game/creature.ts';
import {
  accueillirCreature,
  creerPartie,
  equipeHorsCombat,
  marquerDresseurVaincu,
  phaseDuJour,
  prochainIdentifiant,
  avancerTemps,
  type GameState,
} from '../src/game/state.ts';
import { chargerDepuisTexte, exporterPartie } from '../src/save/serialize.ts';
import { STARTER_IDS } from '../src/data/species.ts';
import { NOMBRE_REGIONS, creerMonde } from '../src/world/worldgen.ts';
import { lireTuile, REGION_WIDTH, zonesAtteignables } from '../src/world/region.ts';
import { TILES } from '../src/world/tiles.ts';
import { tirerRencontre } from '../src/world/encounters.ts';

const SEED = 'brume-3f7a';

function nouvellePartie(): GameState {
  const state = creerPartie(SEED, 'fr', 'Testeur');
  const monde = creerMonde(SEED);
  const depart = monde.region(0).depart;
  state.joueur.x = depart.x;
  state.joueur.y = depart.y;
  state.joueur.refuge = { regionIndex: 0, x: depart.x, y: depart.y };
  accueillirCreature(
    state,
    creerCreature(makeRng(1), {
      uid: prochainIdentifiant(state),
      speciesId: STARTER_IDS[0],
      niveau: 5,
      origine: SEED,
    }),
  );
  return state;
}

/** Joue un combat jusqu'à son terme, les deux camps pilotés par l'IA. */
function jouerCombat(mien: CreatureInstance, adverse: CreatureInstance, seed: number): 'gagne' | 'perdu' | 'nul' {
  const state = creerCombat(mien, adverse, 'sauvage');
  const rng = makeRng(seed);
  for (let tour = 0; tour < 200 && state.issue === null; tour++) {
    const index = choisirAttaque(state.joueur, state.adversaire, 'route', rng);
    const adverseIndex = choisirAttaque(state.adversaire, state.joueur, 'sauvage', rng);
    resoudreTour(state, { kind: 'attaque', index }, adverseIndex, rng);
  }
  if (state.issue === 'adversaireKo') return 'gagne';
  if (state.issue === 'joueurKo') return 'perdu';
  return 'nul';
}

describe('nouvelle partie', () => {
  it('démarre avec une créature debout, sur une case franchissable', () => {
    const state = nouvellePartie();
    expect(state.equipe).toHaveLength(1);
    expect(equipeHorsCombat(state)).toBe(false);
    const region = creerMonde(SEED).region(0);
    expect(TILES[lireTuile(region, state.joueur.x, state.joueur.y)].solid).toBe(false);
  });

  it('donne de quoi capturer et se soigner dès le départ', () => {
    const state = nouvellePartie();
    expect(state.inventaire.prisme).toBeGreaterThan(0);
    expect(state.inventaire.potion).toBeGreaterThan(0);
  });

  it('propose trois créatures de départ jouables', () => {
    for (const species of STARTER_IDS) {
      const creature = creerCreature(makeRng(2), { uid: 'x', speciesId: species, niveau: 5, origine: SEED });
      expect(creature.moves.length).toBeGreaterThan(0);
      expect(creature.moves.some((slot) => slot.pp > 0)).toBe(true);
      expect(creature.pv).toBe(pvMax(creature));
    }
  });
});

describe('traversée du monde', () => {
  it('permet d’aller du bourg à l’arène de proche en proche', () => {
    // Chaque région doit relier son entrée à sa sortie, et les sorties doivent
    // s'enchaîner : c'est la condition pour que la partie soit finissable.
    const monde = creerMonde(SEED);
    for (let index = 0; index < NOMBRE_REGIONS - 1; index++) {
      const region = monde.region(index);
      const versNord = region.sorties.find((sortie) => sortie.cote === 'nord');
      expect(versNord, `région ${index} sans sortie nord`).toBeDefined();
      expect(versNord!.vers).toBe(index + 1);

      const atteignables = zonesAtteignables(region.tiles, region.depart);
      expect(atteignables.has(versNord!.y * REGION_WIDTH + versNord!.x), `région ${index}`).toBe(true);

      // La porte d'arrivée de la région suivante doit être marchable, sinon on
      // apparaîtrait dans un mur.
      const suivante = monde.region(index + 1);
      const porteSud = suivante.sorties.find((sortie) => sortie.cote === 'sud');
      expect(porteSud, `région ${index + 1} sans porte sud`).toBeDefined();
      expect(TILES[lireTuile(suivante, porteSud!.x, porteSud!.y - 1)].solid).toBe(false);
    }
  });

  it('offre des rencontres cohérentes dans chaque région sauvage', () => {
    const monde = creerMonde(SEED);
    const rng = makeRng(77);
    for (const index of [1, 2, 3, 5, 6]) {
      const region = monde.region(index);
      const rencontre = tirerRencontre(rng, region.biome, 'jour', region.niveaux);
      expect(rencontre, `région ${index}`).not.toBeNull();
      expect(rencontre!.niveau).toBeGreaterThanOrEqual(2);
      expect(rencontre!.niveau).toBeLessThanOrEqual(region.niveaux.max);
    }
  });

  it('fait tourner le cycle jour/nuit en douze minutes de jeu', () => {
    const state = nouvellePartie();
    const phases = new Set<string>();
    for (let seconde = 0; seconde < 720; seconde++) {
      avancerTemps(state, 1000);
      phases.add(phaseDuJour(state));
    }
    expect([...phases].sort()).toEqual(['aube', 'crepuscule', 'jour', 'nuit']);
  });
});

describe('progression par le combat', () => {
  it('fait gagner une créature de départ contre la faune locale', () => {
    // Un starter de niveau 5 doit pouvoir battre les rencontres de la première route,
    // sinon la partie est injouable dès le premier pas.
    const monde = creerMonde(SEED);
    const region = monde.region(1);
    let victoires = 0;
    const essais = 20;

    for (let essai = 0; essai < essais; essai++) {
      const rng = makeRng(essai + 100);
      const mien = creerCreature(rng, { uid: 'm', speciesId: STARTER_IDS[0], niveau: 6, origine: SEED });
      const rencontre = tirerRencontre(rng, region.biome, 'jour', region.niveaux);
      if (!rencontre) continue;
      const sauvage = creerCreature(rng, {
        uid: 's',
        speciesId: rencontre.species,
        niveau: rencontre.niveau,
        origine: SEED,
      });
      if (jouerCombat(mien, sauvage, essai + 900) === 'gagne') victoires++;
    }
    expect(victoires).toBeGreaterThan(essais * 0.6);
  });

  it('fait évoluer le starter en enchaînant les victoires', () => {
    const state = nouvellePartie();
    const starter = state.equipe[0]!;
    const rng = makeRng(31);

    let evolutions = 0;
    for (let combat = 0; combat < 40; combat++) {
      const vaincu = creerCreature(rng, { uid: `v${combat}`, speciesId: 'mulotin', niveau: 12, origine: SEED });
      const gain = gagnerExperience(state.equipe[0]!, experienceGagnee(vaincu, false));
      if (gain.evolution) {
        state.equipe[0] = evoluer(state.equipe[0]!, gain.evolution);
        evolutions++;
      }
    }
    expect(evolutions).toBeGreaterThan(0);
    expect(state.equipe[0]!.speciesId).not.toBe(starter.speciesId);
    expect(state.equipe[0]!.niveau).toBeGreaterThan(5);
  });

  it('laisse le champion gagner contre une équipe sous-préparée', () => {
    // Le boss doit constituer un vrai mur : une créature de niveau 12 ne doit pas
    // passer, sinon l'arène n'a aucun intérêt.
    const mien = creerCreature(makeRng(5), { uid: 'm', speciesId: 'frondanz', niveau: 12, origine: SEED });
    const boss = creerCreature(makeRng(6), { uid: 'b', speciesId: 'solarion', niveau: 33, origine: SEED });
    expect(jouerCombat(mien, boss, 4242)).toBe('perdu');
  });

  it('laisse une équipe préparée battre le champion', () => {
    // …mais il doit rester franchissable : une créature de niveau 40 bien typée passe.
    const mien = creerCreature(makeRng(5), { uid: 'm', speciesId: 'maregrand', niveau: 42, origine: SEED });
    const boss = creerCreature(makeRng(6), { uid: 'b', speciesId: 'solarion', niveau: 33, origine: SEED });
    expect(jouerCombat(mien, boss, 4242)).toBe('gagne');
  });
});

describe('cycle complet de sauvegarde', () => {
  it('restaure une partie avancée à l’identique après un rechargement', () => {
    const state = nouvellePartie();
    const rng = makeRng(17);

    // On avance : deux captures, un dresseur battu, du temps de jeu, des dégâts.
    for (const species of ['mulotin', 'luciolin'] as const) {
      accueillirCreature(
        state,
        creerCreature(rng, {
          uid: prochainIdentifiant(state),
          speciesId: species,
          niveau: 9,
          origine: SEED,
        }),
      );
    }
    marquerDresseurVaincu(state, 'r1-dresseur-0');
    state.joueur.regionIndex = 2;
    state.joueur.pieces = 2400;
    avancerTemps(state, 300_000);
    state.equipe[0]!.pv = 7;
    state.equipe[0]!.statut = 'poison';

    const document = exporterPartie(state, '2026-08-07T12:00:00.000Z');
    const recharge = chargerDepuisTexte(JSON.stringify(document));
    expect(recharge.ok).toBe(true);
    if (!recharge.ok) return;

    const apres = recharge.valeur.state;
    expect(apres.seedText).toBe(state.seedText);
    expect(apres.joueur.regionIndex).toBe(2);
    expect(apres.joueur.pieces).toBe(2400);
    expect(apres.equipe.map((membre) => membre.speciesId)).toEqual(
      state.equipe.map((membre) => membre.speciesId),
    );
    expect(apres.equipe[0]!.pv).toBe(7);
    expect(apres.equipe[0]!.statut).toBe('poison');
    expect(apres.progression.dresseursVaincus).toContain('r1-dresseur-0');

    // Le monde se reconstruit à l'identique depuis la seed rechargée.
    const avantMonde = creerMonde(state.seedText).region(2);
    const apresMonde = creerMonde(apres.seedText).region(2);
    expect(apresMonde.tiles).toEqual(avantMonde.tiles);
    expect(apresMonde.entites).toEqual(avantMonde.entites);
  });

  it('remet l’équipe sur pied après une défaite, sans perdre la progression', () => {
    const state = nouvellePartie();
    marquerDresseurVaincu(state, 'r1-dresseur-0');
    for (const membre of state.equipe) membre.pv = 0;
    expect(equipeHorsCombat(state)).toBe(true);

    // Ce que fait la scène de combat en cas de défaite.
    for (const membre of state.equipe) soignerCompletement(membre);
    state.joueur.regionIndex = state.joueur.refuge.regionIndex;

    expect(equipeHorsCombat(state)).toBe(false);
    expect(state.progression.dresseursVaincus).toContain('r1-dresseur-0');
  });
});
