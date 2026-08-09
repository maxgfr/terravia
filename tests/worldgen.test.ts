import { describe, expect, it } from 'vitest';
import { makeRng, makeSeedText } from '../src/core/rng.ts';
import { bruitValeur, fbm } from '../src/world/noise.ts';
import {
  REGION_HEIGHT,
  REGION_WIDTH,
  ROLES_AVEC_FAUNE_ORDINAIRE,
  accessibleDepuis,
  biomeAvecEau,
  lireTuile,
  zonesAtteignables,
} from '../src/world/region.ts';
import { REGIONS_MAX, REGIONS_MIN, creerMonde, planifierMonde } from '../src/world/worldgen.ts';
import { TILES, triggersEncounter } from '../src/world/tiles.ts';
import { CHARACTER_IDS } from '../src/world/characterIds.ts';
import { ITEM_IDS, isKeyItem } from '../src/data/items.ts';
import { SPECIES, SPECIES_IDS, baseStatTotal, type SpeciesId } from '../src/data/species.ts';
import { DAY_PHASES, tableRencontre, tirerRencontre } from '../src/world/encounters.ts';
import { BIOMES } from '../src/data/biomes.ts';

/** Un échantillon de seeds représentatif, tiré de façon reproductible. */
function seeds(nombre: number): string[] {
  const rng = makeRng(20260807);
  return Array.from({ length: nombre }, () => makeSeedText(rng.next()));
}

/** La forme qu'une espèce a atteinte à ce niveau, évolutions comprises. */
function formeFinale(id: SpeciesId, niveau: number): SpeciesId {
  let courant = id;
  for (let etape = 0; etape < SPECIES_IDS.length; etape++) {
    const evolution = SPECIES[courant].evolution;
    if (!evolution || niveau < evolution.niveau) return courant;
    courant = evolution.vers;
  }
  return courant;
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
  /**
   * Les invariants du générateur, éprouvés sur un large échantillon.
   *
   * Le parcours n'est plus une constante : c'est la seed qui décide de sa longueur, de
   * l'ordre des lieux et du nombre d'arènes. Ce sont donc ces règles-là — et non une
   * suite écrite d'avance — qui garantissent qu'une partie reste jouable.
   */
  it('respecte la forme d’une aventure jouable, quelle que soit la seed', () => {
    for (const seedText of seeds(120)) {
      const { plans } = planifierMonde(seedText);
      const contexte = `seed ${seedText}`;

      expect(plans.length, contexte).toBeGreaterThanOrEqual(REGIONS_MIN);
      expect(plans.length, contexte).toBeLessThanOrEqual(REGIONS_MAX);

      expect(plans[0]!.role, contexte).toBe('bourg');
      expect(plans[0]!.precedente, contexte).toBeNull();
      expect(plans.at(-1)!.role, contexte).toBe('sanctuaire');
      expect(plans.at(-1)!.suivante, contexte).toBeNull();
      // Le sanctuaire est un après-jeu : on l'atteint en sortant d'une arène.
      expect(plans.at(-2)!.role, contexte).toBe('arene');

      for (let i = 1; i < plans.length; i++) {
        expect(plans[i]!.precedente, contexte).toBe(i - 1);
        expect(plans[i - 1]!.suivante, contexte).toBe(i);
      }

      const arenes = plans.filter((plan) => plan.role === 'arene');
      expect(arenes.length, contexte).toBeGreaterThanOrEqual(2);
      expect(arenes.length, contexte).toBeLessThanOrEqual(3);
      // Chaque arène porte une spécialité, et deux champions ne partagent pas la leur.
      expect(new Set(arenes.map((plan) => plan.typeArene)).size, contexte).toBe(arenes.length);
      for (const arene of arenes) expect(arene.typeArene, contexte).toBeDefined();

      // Deux arènes de suite ne laisseraient pas le temps de progresser entre elles.
      for (let i = 1; i < arenes.length; i++) {
        expect(arenes[i]!.index - arenes[i - 1]!.index, contexte).toBeGreaterThanOrEqual(2);
      }

      // Un village de ravitaillement, jamais collé au bourg qui vend déjà.
      const villages = plans.filter((plan) => plan.role === 'village');
      expect(villages.length, contexte).toBeGreaterThanOrEqual(1);
      expect(villages[0]!.index, contexte).toBeGreaterThan(1);

      // Pas deux grottes de suite : on ne traverse pas un monde de tunnels.
      for (let i = 1; i < plans.length; i++) {
        expect(`${plans[i - 1]!.role}/${plans[i]!.role}`, contexte).not.toBe('grotte/grotte');
      }

      // La région d'apprentissage : ni grotte, ni biome hostile. On y arrive avec une
      // seule créature de niveau 6, et l'équilibrage de tout le début en dépend.
      const premiere = plans[1]!;
      expect(premiere.role, contexte).not.toBe('grotte');
      expect(['prairie', 'lande', 'foret'], contexte).toContain(premiere.biome);

      // Deux régions sauvages au moins avant le premier champion : on l'affronte sinon
      // avec l'unique créature reçue au bourg, contre les quatre de son équipe.
      expect(arenes[0]!.index, contexte).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * Les bornes annoncées doivent être atteintes, pas seulement respectées.
   *
   * Le tirage s'arrêtait à `REGIONS_MAX - 1` : le README promettait « 8 à 12 régions » et
   * le monde n'en comptait jamais plus de 11. Le test ne vérifiait qu'une inégalité large,
   * assez lâche pour ne rien voir.
   */
  it('atteint réellement les deux bornes de longueur annoncées', () => {
    const longueurs = new Set(seeds(240).map((seedText) => planifierMonde(seedText).plans.length));
    expect(Math.min(...longueurs)).toBe(REGIONS_MIN);
    expect(Math.max(...longueurs)).toBe(REGIONS_MAX);
  });

  it('fait croître la difficulté sans reculer', () => {
    for (const seedText of seeds(60)) {
      const { plans } = planifierMonde(seedText);
      for (let i = 1; i < plans.length; i++) {
        expect(plans[i]!.niveaux.max, `seed ${seedText}, région ${i}`).toBeGreaterThanOrEqual(
          plans[i - 1]!.niveaux.max,
        );
        expect(plans[i]!.niveaux.min).toBeLessThanOrEqual(plans[i]!.niveaux.max);
      }
    }
  });

  it('propose trois créatures de départ de types distincts', () => {
    for (const seedText of seeds(60)) {
      const { starters } = planifierMonde(seedText);
      expect(starters, `seed ${seedText}`).toHaveLength(3);
      const types = starters.map((id) => SPECIES[id].types[0]);
      expect(new Set(types).size, `seed ${seedText}`).toBe(3);
      // Un starter est un **premier** stade : de quoi évoluer devant lui, et personne
      // qui évolue vers lui. Un milieu de lignée escamoterait la moitié du chemin.
      const evoluees = new Set(SPECIES_IDS.map((id) => SPECIES[id].evolution?.vers));
      for (const id of starters) {
        expect(SPECIES[id].evolution, `seed ${seedText} : ${id}`).toBeDefined();
        expect(evoluees.has(id), `seed ${seedText} : ${id} est un stade évolué`).toBe(false);
      }
    }
  });

  it('donne des aventures différentes à des seeds différentes', () => {
    const empreinte = (seedText: string): string =>
      planifierMonde(seedText)
        .plans.map((plan) => `${plan.role}:${plan.biome}`)
        .join('|');
    // Ce n'est plus seulement le décor qui change : la suite des rôles elle-même diffère.
    const empreintes = new Set(seeds(40).map(empreinte));
    expect(empreintes.size).toBeGreaterThan(30);
  });

  it('redonne le même plan pour la même seed, casse et espaces compris', () => {
    expect(planifierMonde('  Brume-3F7A ')).toEqual(planifierMonde('brume-3f7a'));
  });
});

describe('génération des régions', () => {
  it('produit une grille complète de tuiles connues', () => {
    const monde = creerMonde('brume-3f7a');
    for (let index = 0; index < monde.plans.length; index++) {
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
      for (let index = 0; index < monde.plans.length; index++) {
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
      for (let index = 0; index < monde.plans.length; index++) {
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
      for (let index = 0; index < monde.plans.length; index++) {
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
      for (let index = 0; index < monde.plans.length; index++) {
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

  /** Compte les cases où une rencontre peut se déclencher. */
  function casesDeRencontre(region: { tiles: Uint8Array; width: number; height: number }): number {
    let total = 0;
    for (let y = 0; y < REGION_HEIGHT; y++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        if (TILES[lireTuile(region, x, y)].encounter) total++;
      }
    }
    return total;
  }

  it('offre des zones de rencontre dans les régions sauvages', () => {
    // Le contrôle porte sur le rôle et non sur l'index : la place d'une route dans le
    // parcours change à chaque seed.
    for (const seedText of seeds(15)) {
      const monde = creerMonde(seedText);
      for (const plan of monde.plans) {
        if (plan.role !== 'route' && plan.role !== 'bois' && plan.role !== 'grotte') continue;
        expect(
          casesDeRencontre(monde.region(plan.index)),
          `seed ${seedText}, région ${plan.index} sans hautes herbes`,
        ).toBeGreaterThan(20);
      }
    }
  });

  it('n’installe aucune rencontre dans les lieux habités', () => {
    for (const seedText of seeds(15)) {
      const monde = creerMonde(seedText);
      for (const plan of monde.plans) {
        if (plan.role !== 'bourg' && plan.role !== 'village') continue;
        expect(
          casesDeRencontre(monde.region(plan.index)),
          `seed ${seedText}, région ${plan.index}`,
        ).toBe(0);
      }
    }
  });

  it('garnit le sanctuaire de hautes herbes : c’est là que se finit le Terradex', () => {
    for (const seedText of seeds(15)) {
      const monde = creerMonde(seedText);
      const sanctuaire = monde.plans.at(-1)!;
      expect(sanctuaire.role).toBe('sanctuaire');
      expect(casesDeRencontre(monde.region(sanctuaire.index)), `seed ${seedText}`).toBeGreaterThan(20);
    }
  });

  it('ne superpose jamais deux entités', () => {
    for (const seedText of seeds(20)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < monde.plans.length; index++) {
        const region = monde.region(index);
        const places = region.entites.map((entite) => `${entite.x},${entite.y}`);
        expect(new Set(places).size, `seed ${seedText}, région ${index}`).toBe(places.length);
      }
    }
  });

  it('ne référence que des sprites, objets et espèces connus', () => {
    for (const seedText of seeds(20)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < monde.plans.length; index++) {
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
    for (let index = 0; index < monde.plans.length; index++) {
      for (const entite of monde.region(index).entites) {
        expect(tous.has(entite.id), `identifiant dupliqué : ${entite.id}`).toBe(false);
        tous.add(entite.id);
      }
    }
    expect(tous.size).toBeGreaterThan(10);
  });

  it('place un champion dans chaque arène, et nulle part ailleurs', () => {
    for (const seedText of seeds(10)) {
      const monde = creerMonde(seedText);
      const regionsAvecChampion: number[] = [];
      for (const plan of monde.plans) {
        const champions = monde
          .region(plan.index)
          .entites.filter((entite) => entite.kind === 'dresseur' && entite.champion);
        expect(champions.length, `seed ${seedText}, région ${plan.index}`).toBeLessThanOrEqual(1);
        if (champions.length === 1) regionsAvecChampion.push(plan.index);
      }
      const arenes = monde.plans.filter((plan) => plan.role === 'arene').map((plan) => plan.index);
      expect(regionsAvecChampion, `seed ${seedText}`).toEqual(arenes);
    }
  });

  it('donne au champion une équipe marquée par sa spécialité', () => {
    for (const seedText of seeds(15)) {
      const monde = creerMonde(seedText);
      for (const plan of monde.plans.filter((candidat) => candidat.role === 'arene')) {
        const champion = monde
          .region(plan.index)
          .entites.find((entite) => entite.kind === 'dresseur' && entite.champion);
        expect(champion, `seed ${seedText}, région ${plan.index}`).toBeDefined();
        if (champion?.kind !== 'dresseur') continue;
        const contexte = `seed ${seedText}, arène ${plan.typeArene}`;
        expect(champion.equipe.length, contexte).toBeGreaterThanOrEqual(3);

        // Une préférence, pas une exclusivité : sa tête d'affiche porte toujours le type
        // de l'arène, et son escorte autant que le vivier le permet réellement. Un type
        // à lignée unique — la foudre n'en a qu'une — ne fournit qu'une seule créature
        // distincte une fois tout le monde promu à sa forme finale ; exiger davantage
        // reviendrait à réclamer des doublons, ce que le mono-type strict produisait.
        expect(SPECIES[champion.equipe.at(-1)!.species].types, `${contexte} : tête d’affiche`).toContain(
          plan.typeArene,
        );
        const formesDuType = new Set(
          SPECIES_IDS.filter(
            (id) => SPECIES[id].types.includes(plan.typeArene!) && SPECIES[id].tauxCapture > 5,
          ).map((id) => formeFinale(id, plan.niveaux.max)),
        );
        const duType = champion.equipe.filter((membre) =>
          SPECIES[membre.species].types.includes(plan.typeArene!),
        );
        expect(duType.length, contexte).toBeGreaterThanOrEqual(Math.min(2, formesDuType.size));

        // Et pas deux fois la même créature : c'est un champion, pas une collection.
        const especes = champion.equipe.map((membre) => membre.species);
        expect(new Set(especes).size, `${contexte} : ${especes.join(', ')}`).toBe(especes.length);

        // Son escorte s'étale sur plusieurs niveaux, la tête d'affiche au sommet. C'est
        // ce qui rend disponibles les stades intermédiaires — sans quoi la flamme et la
        // foudre, qui n'ont qu'une lignée, ne proposaient qu'une seule forme.
        const niveaux = champion.equipe.map((membre) => membre.niveau);
        const vedette = niveaux.at(-1)!;
        expect(Math.max(...niveaux), `${contexte} : ${niveaux.join(', ')}`).toBe(vedette);
        expect(new Set(niveaux).size, `${contexte} : ${niveaux.join(', ')}`).toBeGreaterThan(1);
        // Mais jamais de nouveau-né derrière un champion : l'écart reste proportionné.
        expect(Math.min(...niveaux), contexte).toBeGreaterThanOrEqual(Math.floor(vedette * 0.6));
      }
    }
  });

  it('propose des services de soin et de boutique au village', () => {
    for (const seedText of seeds(10)) {
      const monde = creerMonde(seedText);
      const village = monde.plans.find((plan) => plan.role === 'village');
      expect(village, `seed ${seedText}`).toBeDefined();
      const services = monde
        .region(village!.index)
        .entites.filter((entite) => entite.kind === 'service')
        .map((entite) => (entite.kind === 'service' ? entite.service : ''));
      expect(services, `seed ${seedText}`).toContain('soin');
      expect(services, `seed ${seedText}`).toContain('boutique');
    }
  });

  /**
   * Le bourg de départ n'avait aucun soigneur : le premier lieu de soin du monde était
   * le village, à mi-parcours. Toute la première moitié d'une partie se jouait donc sans
   * autre recours que les potions, et le joueur cherchait en vain où soigner son équipe.
   */
  it('offre un lieu de soin dès le bourg de départ', () => {
    for (const seedText of seeds(20)) {
      const soins = creerMonde(seedText)
        .region(0)
        .entites.filter((entite) => entite.kind === 'service' && entite.service === 'soin');
      expect(soins.length, `seed ${seedText} : bourg sans soigneuse`).toBeGreaterThan(0);
    }
  });

  it('offre un lieu de soin au sanctuaire : on y revient pour finir le Terradex', () => {
    for (const seedText of seeds(10)) {
      const monde = creerMonde(seedText);
      const sanctuaire = monde.plans.at(-1)!;
      const services = monde
        .region(sanctuaire.index)
        .entites.filter((entite) => entite.kind === 'service');
      expect(services.length, `seed ${seedText}`).toBeGreaterThan(0);
    }
  });

  /**
   * Le bourg tenait une soigneuse mais aucun étal, alors même que le plan du monde
   * justifie l'éloignement du village par le fait que « le bourg vend déjà ». On partait
   * donc avec 800 pièces qu'aucun commerce n'acceptait, et sans moyen de racheter une
   * potion avant la première arène.
   */
  it('tient un étal et donne la canne dès le bourg de départ', () => {
    for (const seedText of seeds(20)) {
      const bourg = creerMonde(seedText).region(0);

      const etals = bourg.entites.filter(
        (entite) => entite.kind === 'service' && entite.service === 'boutique',
      );
      expect(etals.length, `seed ${seedText} : bourg sans marchand`).toBeGreaterThan(0);

      const objets = bourg.entites.filter((entite) => entite.kind === 'objet').map((e) => e.item);
      expect(objets, `seed ${seedText}`).toContain('carte');
      expect(objets, `seed ${seedText}`).toContain('canne');
    }
  });

  /**
   * La canne était posée au bourg *et* au village : on en ramassait deux.
   */
  it('ne pose jamais deux fois le même objet unique dans un monde', () => {
    for (const seedText of seeds(20)) {
      const monde = creerMonde(seedText);
      const uniques: string[] = [];
      for (let index = 0; index < monde.plans.length; index++) {
        for (const entite of monde.region(index).entites) {
          if (entite.kind === 'objet' && isKeyItem(entite.item)) uniques.push(entite.item);
        }
      }
      expect(new Set(uniques).size, `seed ${seedText} : ${uniques.join(', ')}`).toBe(uniques.length);
    }
  });

  /**
   * La tuile « rebord » existait de bout en bout — saut, animation, pathfinding, minimap,
   * sprite, et deux dialogues qui l'enseignent — sans qu'aucune palette ne la pose. Le jeu
   * expliquait une règle qu'il n'appliquait nulle part.
   *
   * Un rebord ne se remonte pas : il peut donc couper une région en deux. C'est
   * `zonesAtteignables`, désormais consciente du sens unique, qui l'interdit — et les
   * invariants d'atteignabilité déjà en place s'en chargent sur tout l'échantillon.
   */
  it('sème des rebords franchissables, et jamais sous une entité', () => {
    let mondesAvecRebord = 0;

    for (const seedText of seeds(20)) {
      const monde = creerMonde(seedText);
      let rebordsDuMonde = 0;

      for (let index = 0; index < monde.plans.length; index++) {
        const region = monde.region(index);
        for (let y = 0; y < REGION_HEIGHT; y++) {
          for (let x = 0; x < REGION_WIDTH; x++) {
            if (lireTuile(region, x, y) !== 'rebord') continue;
            rebordsDuMonde++;

            // On doit pouvoir s'élancer par le nord et retomber au sud, sinon le rebord
            // n'est qu'un obstacle de plus.
            expect(TILES[lireTuile(region, x, y + 1)].solid, `réception en ${x},${y + 1}`).toBe(false);
            expect(lireTuile(region, x, y + 1), `réception en ${x},${y + 1}`).not.toBe('rebord');

            // Rien ne s'y tient : un objet posé là serait inatteignable.
            expect(
              region.entites.some((entite) => entite.x === x && entite.y === y),
              `entité sur un rebord en ${x},${y}, région ${index}`,
            ).toBe(false);
          }
        }
      }
      if (rebordsDuMonde > 0) mondesAvecRebord++;
    }

    expect(mondesAvecRebord, 'aucun monde ne pose de rebord').toBeGreaterThan(0);
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

  /**
   * Le plafond de puissance : une évolution finale ne se montre pas au bord du bourg.
   * Elle y apparaissait, bridée au niveau 4 mais avec ses statistiques de bout de
   * lignée, et coûtait au joueur un combat sur deux dès ses premiers pas.
   */
  it('ne propose pas de créature hors de proportion avec le niveau de la région', () => {
    for (const seedText of seeds(20)) {
      const monde = creerMonde(seedText);
      for (const plan of monde.plans) {
        if (plan.role === 'bourg' || plan.role === 'village' || plan.role === 'sanctuaire') continue;
        for (const phase of DAY_PHASES) {
          for (const species of tableRencontre(plan.biome, phase, { niveauMax: plan.niveaux.max })) {
            expect(
              baseStatTotal(SPECIES[species]),
              `seed ${seedText}, ${plan.biome} niveau ${plan.niveaux.max} : ${species}`,
            ).toBeLessThanOrEqual(270 + plan.niveaux.max * 9);
          }
        }
      }
    }
  });

  it('laisse les lignées abouties apparaître en fin de parcours', () => {
    // L'autre bord du même invariant : le plafond doit s'ouvrir, sinon le monde
    // resterait peuplé de premiers stades du début à la fin.
    const tardives = tableRencontre('foret', 'jour', { niveauMax: 30 });
    expect(tardives.length).toBeGreaterThan(tableRencontre('foret', 'jour', { niveauMax: 6 }).length);
  });

  /**
   * L'invariant qui rend le Terradex honnête.
   *
   * Le test qui gardait cette promesse balayait les sept biomes au plafond `niveauMax:
   * 100`. Or aucun monde ne contient les sept biomes — près d'un sur deux n'a aucune
   * grotte, plus d'un sur trois aucune rivière — et aucune région n'atteint le niveau 100.
   * Il passait donc au vert sur des mondes où le Terradex était incomplétable : mesuré,
   * un monde sur quatre seulement l'était.
   *
   * La vérification porte désormais sur des mondes réellement tirés, et sur les seuls
   * moyens qui rendent une créature possédable.
   */
  it('rend chaque espèce du Terradex capturable dans le monde tiré, quelle que soit la seed', () => {
    for (const seedText of seeds(120)) {
      const { plans } = planifierMonde(seedText);
      const obtenables = new Set<SpeciesId>();

      for (const plan of plans) {
        const sanctuaire = plan.role === 'sanctuaire';
        for (const phase of DAY_PHASES) {
          if (ROLES_AVEC_FAUNE_ORDINAIRE.includes(plan.role)) {
            for (const id of tableRencontre(plan.biome, phase, {
              niveauMax: plan.niveaux.max,
              uniques: sanctuaire,
              complement: sanctuaire ? plan.complement : undefined,
            })) {
              obtenables.add(id);
            }
          }
          // La canne ouvre la faune de rivière sur toute étendue d'eau.
          if (biomeAvecEau(plan.biome)) {
            for (const id of tableRencontre('riviere', phase, { niveauMax: plan.niveaux.max })) {
              obtenables.add(id);
            }
          }
        }
      }

      // Ce qu'on attrape mène à ce en quoi cela se transforme.
      for (let ajout = true; ajout; ) {
        ajout = false;
        for (const id of [...obtenables]) {
          const evolution = SPECIES[id].evolution;
          if (evolution && !obtenables.has(evolution.vers)) {
            obtenables.add(evolution.vers);
            ajout = true;
          }
        }
      }

      const manquantes = SPECIES_IDS.filter((id) => !obtenables.has(id));
      expect(manquantes, `espèces introuvables dans le monde ${seedText}`).toEqual([]);
    }
  });

  /**
   * `ROLES_AVEC_FAUNE_ORDINAIRE` est une liste écrite à la main : rien dans les
   * générateurs ne l'impose. La croire plus large qu'elle n'est déclarerait complétable un
   * Terradex qui ne l'est pas — c'est exactement l'erreur qui rendait Acierac et Noctombre
   * introuvables. On la confronte donc aux régions réellement produites.
   */
  it('n’attribue de faune ordinaire qu’aux rôles qui sèment des zones de rencontre', () => {
    const seme = new Map<string, boolean>();

    for (const seedText of seeds(12)) {
      const monde = creerMonde(seedText);
      for (let index = 0; index < monde.plans.length; index++) {
        const region = monde.region(index);
        const palette = region.role;
        let rencontres = false;
        for (let y = 0; y < REGION_HEIGHT && !rencontres; y++) {
          for (let x = 0; x < REGION_WIDTH; x++) {
            if (triggersEncounter(lireTuile(region, x, y))) {
              rencontres = true;
              break;
            }
          }
        }
        seme.set(palette, (seme.get(palette) ?? false) || rencontres);
      }
    }

    for (const [role, rencontres] of seme) {
      expect(
        ROLES_AVEC_FAUNE_ORDINAIRE.includes(role as never),
        `le rôle « ${role} » ${rencontres ? 'sème' : 'ne sème pas'} de zone de rencontre`,
      ).toBe(rencontres);
    }
  });

  /**
   * Le sanctuaire complète le Terradex, il ne le remplace pas : s'il fallait y attraper la
   * moitié du bestiaire, explorer ne servirait plus à rien.
   */
  it('garde le complément du sanctuaire mesuré', () => {
    let total = 0;
    let maximum = 0;
    const echantillon = seeds(120);

    for (const seedText of echantillon) {
      const taille = (planifierMonde(seedText).plans.at(-1)!.complement ?? []).length;
      total += taille;
      maximum = Math.max(maximum, taille);
    }

    const moyenne = total / echantillon.length;
    expect(moyenne, 'le sanctuaire ne doit pas devenir le bestiaire entier').toBeLessThan(10);
    expect(maximum).toBeLessThan(SPECIES_IDS.length / 2);
  });

  it('réserve les uniques au sanctuaire', () => {
    for (const biome of BIOMES) {
      for (const phase of DAY_PHASES) {
        for (const id of tableRencontre(biome, phase)) {
          expect(SPECIES[id].tauxCapture, `${id} en ${biome}`).toBeGreaterThan(5);
        }
      }
    }

    // Réciproquement, le sanctuaire est le seul à les montrer — mais il ne montre pas
    // qu'elles. Les exclure y rendait introuvables les espèces qui n'habitent que les
    // ruines : ce biome n'est celui que des arènes et du sanctuaire, et une arène ne sème
    // aucune herbe. Acierac et Noctombre n'étaient capturables dans aucune partie.
    const sanctuaire = new Set(
      DAY_PHASES.flatMap((phase) => tableRencontre('ruines', phase, { uniques: true })),
    );
    const uniques = SPECIES_IDS.filter((id) => SPECIES[id].tauxCapture <= 5);
    for (const id of uniques) expect(sanctuaire.has(id), `${id} doit se montrer au sanctuaire`).toBe(true);

    const ordinairesDesRuines = SPECIES_IDS.filter(
      (id) => SPECIES[id].tauxCapture > 5 && SPECIES[id].habitats.includes('ruines'),
    );
    expect(ordinairesDesRuines.length).toBeGreaterThan(0);
    for (const id of ordinairesDesRuines) {
      expect(sanctuaire.has(id), `${id} n'habite que les ruines et doit s'y attraper`).toBe(true);
    }
  });

  /**
   * L'invariant contre la monotonie.
   *
   * La rivière ne comptait que deux espèces sous plafond, si bien qu'une région entière
   * montrait la même bête à chaque pas. Le contrôle porte sur les biomes réellement
   * traversés à l'état sauvage — les ruines n'apparaissent qu'en arène et au sanctuaire,
   * où l'on ne croise rien d'ordinaire.
   */
  it('offre plusieurs espèces dans chaque biome parcouru, à toute heure', () => {
    const parcourus = ['prairie', 'foret', 'riviere', 'grotte', 'lande', 'montagne'] as const;
    for (const biome of parcourus) {
      for (const phase of DAY_PHASES) {
        expect(
          tableRencontre(biome, phase, { niveauMax: 10 }).length,
          `${biome} de ${phase} en début de partie`,
        ).toBeGreaterThanOrEqual(2);
        expect(
          tableRencontre(biome, phase, { niveauMax: 32 }).length,
          `${biome} de ${phase} en fin de partie`,
        ).toBeGreaterThanOrEqual(4);
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
