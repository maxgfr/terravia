/**
 * Parcours complet d'une partie, sans navigateur.
 *
 * Les tests précédents vérifient chaque couche isolément. Celui-ci les fait travailler
 * ensemble : créer une partie, traverser le monde, gagner des combats, monter de
 * niveau, évoluer, sauvegarder, recharger. C'est là que se voient les erreurs de
 * raccordement qu'aucun test unitaire ne peut attraper.
 */

import { describe, expect, it } from 'vitest';
import { makeRng, makeSeedText } from '../src/core/rng.ts';
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
import { SPECIES, SPECIES_IDS, STARTER_IDS, baseStatTotal, type SpeciesId } from '../src/data/species.ts';
import { creerMonde } from '../src/world/worldgen.ts';
import { lireTuile, REGION_WIDTH, zonesAtteignables } from '../src/world/region.ts';
import { TILES } from '../src/world/tiles.ts';
import { tableRencontre, tirerRencontre } from '../src/world/encounters.ts';

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
    for (let index = 0; index < monde.plans.length - 1; index++) {
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
  /**
   * Un starter doit pouvoir battre la faune de la première région sauvage, sinon la
   * partie est injouable dès le premier pas.
   *
   * L'épreuve porte maintenant sur **plusieurs seeds** : la longueur du parcours, ses
   * biomes et le trio de départ changent à chaque monde, et un équilibrage vérifié sur
   * un seul d'entre eux ne dirait plus rien du jeu.
   */
  it('fait gagner une créature de départ contre la faune locale, quelle que soit la seed', () => {
    const rngSeeds = makeRng(20260807);
    for (let tirage = 0; tirage < 30; tirage++) {
      const seedText = makeSeedText(rngSeeds.next());
      const monde = creerMonde(seedText);
      const premiere = monde.plans.find((plan) => plan.role !== 'bourg')!;
      const region = monde.region(premiere.index);
      const contexte = `seed ${seedText} (${region.biome}, niveaux ${region.niveaux.min}-${region.niveaux.max})`;

      // Le taux est mesuré starter par starter : le joueur en choisit un, il n'affronte
      // pas la région avec les trois. Ce qui doit être vrai, c'est qu'au moins un bon
      // choix existe — et qu'aucun ne soit un piège.
      const taux = monde.starters.map((starter) => {
        let victoires = 0;
        let combats = 0;
        for (let essai = 0; essai < 24; essai++) {
          const rng = makeRng(essai + 100);
          const mien = creerCreature(rng, { uid: 'm', speciesId: starter, niveau: 6, origine: seedText });
          const rencontre = tirerRencontre(rng, region.biome, 'jour', region.niveaux);
          if (!rencontre) continue;
          const sauvage = creerCreature(rng, {
            uid: 's',
            speciesId: rencontre.species,
            niveau: rencontre.niveau,
            origine: seedText,
          });
          combats++;
          if (jouerCombat(mien, sauvage, essai + 900) === 'gagne') victoires++;
        }
        expect(combats, contexte).toBeGreaterThan(0);
        return victoires / combats;
      });

      expect(Math.max(...taux), `${contexte} : aucun starter viable`).toBeGreaterThan(0.7);
      expect(Math.min(...taux), `${contexte} : un starter condamné`).toBeGreaterThan(0.45);
    }
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

});

/**
 * Le dernier champion : la partie doit pouvoir se terminer.
 *
 * Les deux tests précédents opposaient une créature à un `solarion` écrit en dur — une
 * espèce qui, depuis qu'elle vit au sanctuaire, n'appartient plus à aucune équipe
 * d'arène. Ils ne disaient donc rien du jeu réel. On affronte désormais le champion
 * **généré**, avec un vrai combat de dresseur : chaque camp envoie ses créatures l'une
 * après l'autre, ce qu'un duel isolé ne mesure pas.
 */
describe('finir la partie', () => {
  /** La forme qu'une espèce a atteinte à ce niveau : une équipe de fin est évoluée. */
  function formeAuNiveau(id: SpeciesId, niveau: number): SpeciesId {
    let courant = id;
    for (let etape = 0; etape < SPECIES_IDS.length; etape++) {
      const evolution = SPECIES[courant].evolution;
      if (!evolution || niveau < evolution.niveau) return courant;
      courant = evolution.vers;
    }
    return courant;
  }

  /** Combat de dresseur complet. Rend `true` si le camp du joueur l'emporte. */
  function affronter(equipe: CreatureInstance[], adverses: CreatureInstance[], seed: number): boolean {
    const rng = makeRng(seed);
    let mien = 0;
    let sien = 0;
    for (let tours = 0; tours < 800 && mien < equipe.length && sien < adverses.length; ) {
      const state = creerCombat(equipe[mien]!, adverses[sien]!, 'dresseur');
      while (state.issue === null && tours < 800) {
        tours++;
        resoudreTour(
          state,
          // Le joueur choisit ses coups : le mesurer avec l'IA de route reviendrait à
          // évaluer l'équilibrage sur un joueur distrait.
          { kind: 'attaque', index: choisirAttaque(state.joueur, state.adversaire, 'arene', rng) },
          choisirAttaque(state.adversaire, state.joueur, 'champion', rng),
          rng,
        );
      }
      if (state.issue === 'adversaireKo') sien++;
      else mien++;
    }
    return sien >= adverses.length;
  }

  interface Duel {
    readonly monde: ReturnType<typeof creerMonde>;
    readonly arene: { index: number; niveaux: { min: number; max: number }; typeArene?: string };
    readonly adverses: CreatureInstance[];
    readonly especesDuMonde: SpeciesId[];
  }

  /** Prépare le duel contre le dernier champion d'un monde. */
  function dernierChampion(seedText: string, rng: ReturnType<typeof makeRng>): Duel | null {
    const monde = creerMonde(seedText);
    const arene = monde.plans.filter((plan) => plan.role === 'arene').at(-1)!;
    const champion = monde.region(arene.index).entites.find((e) => e.kind === 'dresseur' && e.champion);
    if (champion?.kind !== 'dresseur') return null;

    return {
      monde,
      arene,
      adverses: champion.equipe.map((membre, index) =>
        creerCreature(rng, {
          uid: `b${index}`,
          speciesId: membre.species,
          niveau: membre.niveau,
          origine: seedText,
        }),
      ),
      especesDuMonde: [
        ...new Set(
          monde.plans.flatMap((plan) =>
            tableRencontre(plan.biome, 'jour', { niveauMax: plan.niveaux.max }),
          ),
        ),
      ],
    };
  }

  /** Six créatures évoluées à ce niveau, les plus abouties que le monde ait offertes. */
  function equipeDeFin(duel: Duel, niveau: number, seedText: string, rng: ReturnType<typeof makeRng>) {
    const promues = [...new Set(duel.especesDuMonde.map((id) => formeAuNiveau(id, niveau)))].sort(
      (a, b) => baseStatTotal(SPECIES[b]) - baseStatTotal(SPECIES[a]),
    );
    return promues
      .slice(0, 6)
      .map((id, index) => creerCreature(rng, { uid: `m${index}`, speciesId: id, niveau, origine: seedText }));
  }

  it('laisse tomber le dernier champion dans la grande majorité des mondes', () => {
    const rngSeeds = makeRng(31337);
    let gagnes = 0;
    let joues = 0;
    const perdus: string[] = [];

    for (let tirage = 0; tirage < 40; tirage++) {
      const seedText = makeSeedText(rngSeeds.next());
      const rng = makeRng(tirage + 1);
      const duel = dernierChampion(seedText, rng);
      if (!duel) continue;
      joues++;

      const equipe = equipeDeFin(duel, duel.arene.niveaux.max, seedText, rng);
      if (affronter(equipe, duel.adverses, tirage + 900)) gagnes++;
      else perdus.push(`${seedText} (${duel.arene.typeArene})`);
    }

    expect(joues).toBeGreaterThan(30);
    expect(gagnes / joues, `mondes invaincus : ${perdus.join(', ')}`).toBeGreaterThan(0.9);
  });

  it('reste un mur pour une équipe restée dix niveaux en dessous', () => {
    // L'autre bord : un champion qui cède à une équipe sous-préparée ne jalonne rien.
    const rngSeeds = makeRng(31337);
    let gagnes = 0;
    let joues = 0;

    for (let tirage = 0; tirage < 20; tirage++) {
      const seedText = makeSeedText(rngSeeds.next());
      const rng = makeRng(tirage + 1);
      const duel = dernierChampion(seedText, rng);
      if (!duel) continue;
      joues++;
      const equipe = equipeDeFin(duel, duel.arene.niveaux.max - 10, seedText, rng);
      if (affronter(equipe, duel.adverses, tirage + 900)) gagnes++;
    }

    expect(joues).toBeGreaterThan(15);
    expect(gagnes / joues).toBeLessThan(0.4);
  });

  it('n’aligne jamais une créature qui aurait dû évoluer', () => {
    // Le niveau était auparavant rabattu sous le seuil d'évolution : un champion de
    // niveau 35 sortait un premier stade bridé au niveau 15, aux côtés d'un bout de
    // lignée. C'est l'espèce qui avance, pas le niveau qui recule.
    const rngSeeds = makeRng(4242);
    for (let tirage = 0; tirage < 15; tirage++) {
      const seedText = makeSeedText(rngSeeds.next());
      const monde = creerMonde(seedText);
      for (const plan of monde.plans) {
        for (const entite of monde.region(plan.index).entites) {
          if (entite.kind !== 'dresseur') continue;
          for (const membre of entite.equipe) {
            const evolution = SPECIES[membre.species].evolution;
            expect(
              evolution === undefined || membre.niveau < evolution.niveau,
              `seed ${seedText}, région ${plan.index} : ${membre.species} niveau ${membre.niveau} aurait dû évoluer`,
            ).toBe(true);
          }
        }
      }
    }
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
