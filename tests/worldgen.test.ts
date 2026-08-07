import { describe, expect, it } from 'vitest';
import { makeRng, makeSeedText } from '../src/core/rng.ts';
import { bruitValeur, fbm } from '../src/world/noise.ts';
import {
  REGION_HEIGHT,
  REGION_WIDTH,
  accessibleDepuis,
  lireTuile,
  zonesAtteignables,
} from '../src/world/region.ts';
import { NOMBRE_REGIONS, creerMonde, planifierMonde } from '../src/world/worldgen.ts';
import { TILES } from '../src/world/tiles.ts';
import { CHARACTER_IDS } from '../src/world/characterIds.ts';
import { ITEM_IDS } from '../src/data/items.ts';
import { SPECIES, SPECIES_IDS } from '../src/data/species.ts';
import { DAY_PHASES, tableRencontre, tirerRencontre } from '../src/world/encounters.ts';
import { BIOMES } from '../src/data/biomes.ts';

/** Un échantillon de seeds représentatif, tiré de façon reproductible. */
function seeds(nombre: number): string[] {
  const rng = makeRng(20260807);
  return Array.from({ length: nombre }, () => makeSeedText(rng.next()));
}

describe('bruit', () => {
  it('reste dans [0, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const valeur = fbm(42, i * 0.37, i * 0.91);
      expect(valeur).toBeGreaterThanOrEqual(0);
      expect(valeur).toBeLessThanOrEqual(1);
    }
  });

  it('est continu : deux points voisins se ressemblent', () => {
    // C'est toute la différence entre un paysage et de la neige de télévision.
    let ecartMax = 0;
    for (let x = 0; x < 200; x++) {
      for (let y = 0; y < 20; y++) {
        const a = bruitValeur(7, x / 10, y / 10);
        const b = bruitValeur(7, (x + 1) / 10, y / 10);
        ecartMax = Math.max(ecartMax, Math.abs(a - b));
      }
    }
    expect(ecartMax).toBeLessThan(0.35);
  });

  it('est déterministe', () => {
    expect(fbm(1, 3.2, 4.7)).toBe(fbm(1, 3.2, 4.7));
    expect(fbm(1, 3.2, 4.7)).not.toBe(fbm(2, 3.2, 4.7));
  });
});

describe('plan du monde', () => {
  it('enchaîne les régions du bourg à l’arène', () => {
    const { plans } = planifierMonde('brume-3f7a');
    expect(plans).toHaveLength(NOMBRE_REGIONS);
    expect(plans[0]!.role).toBe('bourg');
    expect(plans[0]!.precedente).toBeNull();
    expect(plans.at(-1)!.role).toBe('arene');
    expect(plans.at(-1)!.suivante).toBeNull();
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.precedente).toBe(i - 1);
      expect(plans[i - 1]!.suivante).toBe(i);
    }
  });

  it('fait croître la difficulté sans reculer', () => {
    const { plans } = planifierMonde('orage-11cc');
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.niveaux.max).toBeGreaterThanOrEqual(plans[i - 1]!.niveaux.max);
    }
  });

  it('donne des mondes différents à des seeds différentes', () => {
    const a = planifierMonde('brume-3f7a').plans.map((plan) => `${plan.biome}/${plan.nom.fr}`);
    const b = planifierMonde('cendre-9001').plans.map((plan) => `${plan.biome}/${plan.nom.fr}`);
    expect(a).not.toEqual(b);
  });

  it('redonne le même plan pour la même seed, casse et espaces compris', () => {
    expect(planifierMonde('  Brume-3F7A ')).toEqual(planifierMonde('brume-3f7a'));
  });
});

describe('génération des régions', () => {
  it('produit une grille complète de tuiles connues', () => {
    const monde = creerMonde('brume-3f7a');
    for (let index = 0; index < NOMBRE_REGIONS; index++) {
      const region = monde.region(index);
      expect(region.tiles).toHaveLength(REGION_WIDTH * REGION_HEIGHT);
      for (let y = 0; y < REGION_HEIGHT; y++) {
        for (let x = 0; x < REGION_WIDTH; x++) {
          expect(TILES[lireTuile(region, x, y)], `${index} en ${x},${y}`).toBeDefined();
        }
      }
    }
  });

  it('rend chaque sortie atteignable depuis le point de départ', () => {
    // L'invariant qui empêche une partie de se bloquer. Il est vérifié sur un
    // échantillon large parce qu'une seed sur mille suffirait à ruiner une partie.
    for (const seedText of seeds(60)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < NOMBRE_REGIONS; index++) {
        const region = monde.region(index);
        const atteignables = zonesAtteignables(region.tiles, region.depart);
        for (const sortie of region.sorties) {
          expect(
            atteignables.has(sortie.y * REGION_WIDTH + sortie.x),
            `seed ${seedText}, région ${index}, sortie ${sortie.cote}`,
          ).toBe(true);
        }
      }
    }
  });

  it('rend chaque entité accessible depuis une case voisine', () => {
    // On s'adresse à une entité depuis la case d'à côté : un panneau occupe une tuile
    // solide, un marchand se tient derrière son comptoir. Le critère porte donc sur
    // le voisinage, pas sur la case de l'entité.
    for (const seedText of seeds(25)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < NOMBRE_REGIONS; index++) {
        const region = monde.region(index);
        const atteignables = zonesAtteignables(region.tiles, region.depart);
        for (const entite of region.entites) {
          expect(
            accessibleDepuis(atteignables, entite),
            `seed ${seedText}, région ${index}, entité ${entite.id}`,
          ).toBe(true);
        }
      }
    }
  });

  it('fait apparaître le joueur sur une case franchissable', () => {
    for (const seedText of seeds(40)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < NOMBRE_REGIONS; index++) {
        const region = monde.region(index);
        expect(
          TILES[lireTuile(region, region.depart.x, region.depart.y)].solid,
          `seed ${seedText}, région ${index}`,
        ).toBe(false);
      }
    }
  });

  it('scelle la bordure sauf aux portes', () => {
    for (const seedText of seeds(15)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < NOMBRE_REGIONS; index++) {
        const region = monde.region(index);
        const portes = new Set(region.sorties.map((sortie) => `${sortie.x},${sortie.y}`));
        for (let x = 0; x < REGION_WIDTH; x++) {
          for (const y of [0, REGION_HEIGHT - 1]) {
            if (portes.has(`${x},${y}`)) continue;
            expect(TILES[lireTuile(region, x, y)].solid, `${seedText}/${index} en ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });

  it('redonne exactement la même région pour la même seed', () => {
    const premier = creerMonde('sylve-4242').region(3);
    const second = creerMonde('sylve-4242').region(3);
    expect(second.tiles).toEqual(premier.tiles);
    expect(second.entites).toEqual(premier.entites);
    expect(second.depart).toEqual(premier.depart);
  });

  it('donne des régions différentes à des seeds différentes', () => {
    const a = creerMonde('sylve-4242').region(1);
    const b = creerMonde('givre-8888').region(1);
    expect(a.tiles).not.toEqual(b.tiles);
  });

  it('met la région en cache plutôt que de la régénérer', () => {
    const monde = creerMonde('brume-3f7a');
    expect(monde.region(2)).toBe(monde.region(2));
  });

  it('offre des zones de rencontre dans les régions sauvages', () => {
    const monde = creerMonde('brume-3f7a');
    for (const index of [1, 2, 3, 5, 6]) {
      const region = monde.region(index);
      let rencontres = 0;
      for (let i = 0; i < region.tiles.length; i++) {
        if (TILES[lireTuile(region, i % REGION_WIDTH, Math.floor(i / REGION_WIDTH))].encounter) rencontres++;
      }
      expect(rencontres, `région ${index} sans hautes herbes`).toBeGreaterThan(20);
    }
  });

  it('n’installe aucune rencontre dans le bourg ni au village', () => {
    const monde = creerMonde('brume-3f7a');
    for (const index of [0, 4]) {
      const region = monde.region(index);
      for (let y = 0; y < REGION_HEIGHT; y++) {
        for (let x = 0; x < REGION_WIDTH; x++) {
          expect(TILES[lireTuile(region, x, y)].encounter, `région ${index} en ${x},${y}`).toBe(false);
        }
      }
    }
  });

  it('ne superpose jamais deux entités', () => {
    for (const seedText of seeds(20)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < NOMBRE_REGIONS; index++) {
        const region = monde.region(index);
        const places = region.entites.map((entite) => `${entite.x},${entite.y}`);
        expect(new Set(places).size, `seed ${seedText}, région ${index}`).toBe(places.length);
      }
    }
  });

  it('ne référence que des sprites, objets et espèces connus', () => {
    for (const seedText of seeds(20)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < NOMBRE_REGIONS; index++) {
        for (const entite of monde.region(index).entites) {
          if ('sprite' in entite) expect(CHARACTER_IDS).toContain(entite.sprite);
          if (entite.kind === 'objet') expect(ITEM_IDS).toContain(entite.item);
          if (entite.kind === 'dresseur') {
            expect(entite.equipe.length).toBeGreaterThan(0);
            for (const membre of entite.equipe) {
              expect(SPECIES_IDS).toContain(membre.species);
              expect(membre.niveau).toBeGreaterThanOrEqual(2);
              expect(membre.niveau).toBeLessThanOrEqual(60);
            }
          }
        }
      }
    }
  });

  it('donne des identifiants d’entité uniques et stables', () => {
    const monde = creerMonde('brume-3f7a');
    const tous = new Set<string>();
    for (let index = 0; index < NOMBRE_REGIONS; index++) {
      for (const entite of monde.region(index).entites) {
        expect(tous.has(entite.id), `identifiant dupliqué : ${entite.id}`).toBe(false);
        tous.add(entite.id);
      }
    }
    expect(tous.size).toBeGreaterThan(10);
  });

  it('place un champion et un seul, dans l’arène', () => {
    for (const seedText of seeds(10)) {
      const monde = creerMonde(seedText);
      let champions = 0;
      let regionDuChampion = -1;
      for (let index = 0; index < NOMBRE_REGIONS; index++) {
        for (const entite of monde.region(index).entites) {
          if (entite.kind === 'dresseur' && entite.champion) {
            champions++;
            regionDuChampion = index;
          }
        }
      }
      expect(champions, `seed ${seedText}`).toBe(1);
      expect(monde.plans[regionDuChampion]!.role).toBe('arene');
    }
  });

  it('propose des services de soin et de boutique au village', () => {
    for (const seedText of seeds(10)) {
      const services = creerMonde(seedText)
        .region(4)
        .entites.filter((entite) => entite.kind === 'service')
        .map((entite) => (entite.kind === 'service' ? entite.service : ''));
      expect(services, `seed ${seedText}`).toContain('soin');
      expect(services, `seed ${seedText}`).toContain('boutique');
    }
  });
});

describe('rencontres', () => {
  it('ne propose jamais de créature unique à l’état sauvage', () => {
    for (const biome of BIOMES) {
      for (const phase of DAY_PHASES) {
        for (const species of tableRencontre(biome, phase)) {
          expect(SPECIES[species].tauxCapture, `${species} en ${biome}`).toBeGreaterThan(5);
        }
      }
    }
  });

  it('remplit chaque biome à au moins une phase de la journée', () => {
    for (const biome of BIOMES) {
      const total = DAY_PHASES.reduce((somme, phase) => somme + tableRencontre(biome, phase).length, 0);
      expect(total, `${biome} est désert`).toBeGreaterThan(0);
    }
  });

  it('cache les espèces diurnes en pleine nuit', () => {
    const jour = tableRencontre('prairie', 'jour');
    const nuit = tableRencontre('prairie', 'nuit');
    expect(jour).not.toEqual(nuit);
    for (const species of nuit) expect(SPECIES[species].creneau).not.toBe('jour');
  });

  it('ne fait jamais apparaître une créature au-delà de son niveau d’évolution', () => {
    const rng = makeRng(4242);
    for (let i = 0; i < 4000; i++) {
      const rencontre = tirerRencontre(rng, 'prairie', 'jour', { min: 2, max: 40 });
      if (!rencontre) continue;
      const evolution = SPECIES[rencontre.species].evolution;
      expect(rencontre.niveau).toBeGreaterThanOrEqual(2);
      if (evolution) expect(rencontre.niveau, rencontre.species).toBeLessThan(evolution.niveau);
    }
  });

  it('rend une rencontre reproductible pour une même suite de tirages', () => {
    const a = tirerRencontre(makeRng(99), 'foret', 'nuit', { min: 5, max: 12 });
    const b = tirerRencontre(makeRng(99), 'foret', 'nuit', { min: 5, max: 12 });
    expect(a).toEqual(b);
  });
});
