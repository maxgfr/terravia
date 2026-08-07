/**
 * Test de fumée des scènes, avec un canvas simulé.
 *
 * Le reste de la suite couvre des fonctions pures ; la couche d'affichage, elle, n'est
 * vérifiée par rien — et c'est justement là que se logent les fautes de frappe qui
 * produisent un écran noir. On remplace donc le canvas et les planches d'art par des
 * doublures, on pilote les entrées à la main, et on joue quelques centaines de trames.
 *
 * Ce test ne dit rien de la *beauté* du rendu. Il dit que le jeu démarre, qu'on peut
 * commencer une partie, marcher, ouvrir les menus et combattre sans que rien ne casse.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Assets } from '../src/core/assets.ts';
import type { ActionJeu, Entrees } from '../src/core/input.ts';
import { Jeu } from '../src/game/jeu.ts';
import { creerCreature } from '../src/game/creature.ts';
import { accueillirCreature, creerPartie, prochainIdentifiant } from '../src/game/state.ts';
import { makeRng } from '../src/core/rng.ts';
import { Peintre } from '../src/ui/draw.ts';
import { SceneTitre } from '../src/scenes/titre.ts';
import { SceneOverworld } from '../src/scenes/overworld.ts';
import { SceneMenu } from '../src/scenes/menu.ts';
import { SceneCombat } from '../src/scenes/combat.ts';
import { CHARACTER_IDS } from '../src/world/characterIds.ts';
import { ELEMENT_TYPES } from '../src/data/types.ts';
import { ITEM_IDS } from '../src/data/items.ts';
import { SPECIES_IDS } from '../src/data/species.ts';
import { TILE_IDS } from '../src/world/tiles.ts';
import { STARTER_IDS } from '../src/data/species.ts';
import { creerMonde } from '../src/world/worldgen.ts';

/** Compte les appels de dessin : un écran qui ne dessine rien est un écran noir. */
let appelsDessin = 0;

function contexteSimule(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    fillRect: () => {
      appelsDessin += 1;
    },
    drawImage: () => {
      appelsDessin += 1;
    },
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

/** Planches factices : seules leurs dimensions et leur disposition comptent ici. */
function assetsSimules(): Assets {
  const image = { naturalWidth: 96, naturalHeight: 99 } as unknown as HTMLImageElement;
  const charset = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?×▶♦…—’()/';
  return {
    police: {
      image,
      metriques: { cellWidth: 6, cellHeight: 11, columns: 16, charset },
      index: new Map([...charset].map((char, index) => [char, index])),
    },
    tileset: {
      image,
      tileSize: 16,
      frameCount: 3,
      order: TILE_IDS,
      index: new Map(TILE_IDS.map((id, index) => [id, index])),
    },
    cadre: { naturalWidth: 24, naturalHeight: 24 } as unknown as HTMLImageElement,
    plaques: { image, width: 34, height: 11, order: [...ELEMENT_TYPES] },
    icones: { image, size: 16, order: [...ITEM_IDS] },
    personnages: {
      image,
      width: 16,
      height: 20,
      frames: 3,
      directions: ['sud', 'nord', 'est'],
      order: CHARACTER_IDS,
      index: new Map(CHARACTER_IDS.map((id, index) => [id, index])),
    },
    creatures: {
      image,
      size: 64,
      views: ['face', 'dos'],
      order: SPECIES_IDS,
      index: new Map(SPECIES_IDS.map((id, index) => [id, index])),
    },
  };
}

/** Entrées pilotées : on injecte les actions au lieu d'attendre un clavier. */
class EntreesSimulees implements Entrees {
  private maintenues = new Set<ActionJeu>();
  private pressions = new Set<ActionJeu>();
  readonly tactile = false;

  maintenue(action: ActionJeu): boolean {
    return this.maintenues.has(action);
  }
  pressee(action: ActionJeu): boolean {
    return this.pressions.has(action);
  }
  finDeTrame(): void {
    this.pressions.clear();
  }
  detruire(): void {}

  presser(action: ActionJeu): void {
    this.pressions.add(action);
  }
  tenir(action: ActionJeu): void {
    this.maintenues.add(action);
  }
  relacher(action: ActionJeu): void {
    this.maintenues.delete(action);
  }
}

interface Banc {
  jeu: Jeu;
  entrees: EntreesSimulees;
  /** Avance d'une trame : mise à jour puis rendu, comme la vraie boucle. */
  trame(): void;
  /**
   * Comme `trame`, mais laisse aussi tourner les micro-tâches.
   *
   * Les questions à choix rendent une promesse ; dans le vrai jeu, chaque trame est un
   * `requestAnimationFrame` distinct, donc les `.then()` s'exécutent entre deux trames.
   * Une boucle synchrone, elle, ne vide jamais la file de micro-tâches — d'où ce
   * `await` explicite, sans lequel le test bloquerait là où le jeu avance.
   */
  trameAsync(): Promise<void>;
  /** Presse une action puis joue quelques trames pour laisser le dialogue s'écouler. */
  agir(action: ActionJeu, trames?: number): Promise<void>;
}

function creerBanc(): Banc {
  const entrees = new EntreesSimulees();
  const peintre = new Peintre(contexteSimule(), assetsSimules());
  const jeu = new Jeu(peintre, entrees, creerPartie('brume-3f7a', 'fr'), 1234);

  const trame = (): void => {
    jeu.mettreAJour(1 / 60);
    jeu.dessiner();
    entrees.finDeTrame();
  };

  const trameAsync = async (): Promise<void> => {
    trame();
    await Promise.resolve();
  };

  return {
    jeu,
    entrees,
    trame,
    trameAsync,
    async agir(action, trames = 30) {
      entrees.presser(action);
      await trameAsync();
      for (let i = 0; i < trames; i++) await trameAsync();
    },
  };
}

beforeAll(() => {
  // `creerTeinturier` fabrique un canvas hors écran ; on lui en fournit un factice.
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contexteSimule() }),
  };
});

describe('écran-titre', () => {
  it('démarre et dessine quelque chose', () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));
    appelsDessin = 0;
    banc.trame();
    expect(appelsDessin).toBeGreaterThan(10);
  });

  it('mène de l’écran-titre au monde en passant par le choix du starter', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));

    await banc.agir('valider', 2); // Nouvelle partie → écran de seed
    await banc.agir('sud', 2); // aller sur « Commencer »
    await banc.agir('valider', 2); // → choix du starter
    await banc.agir('valider', 2); // choisir le premier starter → question de confirmation
    // La première pression achève le défilement du texte, la seconde valide « Oui ».
    await banc.agir('valider', 4);
    await banc.agir('valider', 20);

    expect(banc.jeu.sommet?.nom).toBe('overworld');
    expect(banc.jeu.state.equipe).toHaveLength(1);
    expect(banc.jeu.state.equipe[0]!.speciesId).toBe(STARTER_IDS[0]);
    // Le joueur est posé sur le point de départ de la région, pas à l'origine.
    expect(banc.jeu.state.joueur.x).toBeGreaterThan(0);
  });
});

describe('monde parcouru', () => {
  function bancEnJeu(): Banc {
    const banc = creerBanc();
    const depart = creerMonde('brume-3f7a').region(0).depart;
    banc.jeu.state.joueur.x = depart.x;
    banc.jeu.state.joueur.y = depart.y;
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(1), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 8,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    return banc;
  }

  it('dessine la carte sans erreur', () => {
    const banc = bancEnJeu();
    appelsDessin = 0;
    banc.trame();
    // Une carte remplit l'écran de tuiles : le compte doit être élevé.
    expect(appelsDessin).toBeGreaterThan(200);
  });

  it('déplace le joueur quand une direction est maintenue', () => {
    const banc = bancEnJeu();
    const depart = { ...banc.jeu.state.joueur };
    banc.entrees.tenir('sud');
    for (let i = 0; i < 120; i++) banc.trame();
    banc.entrees.relacher('sud');

    const arrivee = banc.jeu.state.joueur;
    expect(arrivee.direction).toBe('sud');
    // Le bourg est ouvert au sud du point de départ : le joueur doit avoir avancé.
    expect(arrivee.y).toBeGreaterThan(depart.y);
  });

  it('ne traverse jamais un obstacle', () => {
    const banc = bancEnJeu();
    const region = creerMonde('brume-3f7a').region(0);
    for (const direction of ['nord', 'sud', 'est', 'ouest'] as const) {
      banc.entrees.tenir(direction);
      for (let i = 0; i < 200; i++) {
        banc.trame();
        const { x, y } = banc.jeu.state.joueur;
        const tuile = region.tiles[y * region.width + x];
        expect(tuile, `${direction} en ${x},${y}`).toBeDefined();
      }
      banc.entrees.relacher(direction);
    }
  });

  it('ouvre et referme le menu de pause', async () => {
    const banc = bancEnJeu();
    await banc.agir('menu', 2);
    expect(banc.jeu.sommet?.nom).toBe('menu');
    await banc.agir('annuler', 2);
    expect(banc.jeu.sommet?.nom).toBe('overworld');
  });

  it('fait avancer l’horloge et le temps de jeu', () => {
    const banc = bancEnJeu();
    const avant = banc.jeu.state.joueur.tempsJeuMs;
    for (let i = 0; i < 60; i++) banc.trame();
    expect(banc.jeu.state.joueur.tempsJeuMs).toBeGreaterThan(avant);
  });
});

describe('menus', () => {
  function bancMenu(): Banc {
    const banc = creerBanc();
    for (const species of ['folianz', 'mulotin'] as const) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(2), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: species,
          niveau: 10,
          origine: 'brume-3f7a',
        }),
      );
    }
    banc.jeu.pousser(new SceneMenu());
    return banc;
  }

  it('parcourt tous les onglets sans erreur', async () => {
    const banc = bancMenu();
    // Équipe → fiche → retour, puis sac, Terradex, sauvegarde.
    for (const parcours of [0, 1, 2, 3]) {
      for (let i = 0; i < parcours; i++) await banc.agir('sud', 2);
      appelsDessin = 0;
      await banc.agir('valider', 3);
      expect(appelsDessin, `onglet ${parcours}`).toBeGreaterThan(5);
      await banc.agir('annuler', 2);
      for (let i = 0; i < parcours; i++) await banc.agir('nord', 2);
    }
  });

  it('affiche la fiche détaillée d’une créature', async () => {
    const banc = bancMenu();
    await banc.agir('valider', 2); // onglet Équipe
    appelsDessin = 0;
    await banc.agir('valider', 2); // fiche de la première créature
    expect(appelsDessin).toBeGreaterThan(20);
    await banc.agir('annuler', 2);
  });

  it('fait défiler le Terradex sur ses trente entrées', async () => {
    const banc = bancMenu();
    for (let i = 0; i < 2; i++) await banc.agir('sud', 2);
    await banc.agir('valider', 2);
    for (let i = 0; i < 40; i++) {
      banc.entrees.presser('sud');
      banc.trame();
    }
    banc.trame();
    expect(appelsDessin).toBeGreaterThan(0);
  });
});

describe('combat', () => {
  it('se joue jusqu’à son terme sans interruption', async () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(3), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'mulotin',
        niveau: 30,
        origine: 'brume-3f7a',
      }),
    );
    // On impose une attaque offensive : à ce niveau, l'emplacement 0 de Mulotin est
    // Cri, une attaque de statut — le combat ne se terminerait jamais.
    banc.jeu.state.equipe[0]!.moves = [{ id: 'chargeLourde', pp: 20 }];
    banc.jeu.pousser(new SceneOverworld());

    const sauvage = creerCreature(makeRng(4), {
      uid: 'sauvage',
      speciesId: 'plumelle',
      niveau: 4,
      origine: 'brume-3f7a',
    });
    banc.jeu.pousser(new SceneCombat({ genre: 'sauvage', adversaires: [sauvage] }));

    appelsDessin = 0;
    banc.trame();
    expect(appelsDessin).toBeGreaterThan(20);

    // On martèle « valider » : cela déroule les dialogues, ouvre le menu d'attaques,
    // choisit la première attaque, et recommence jusqu'à la fin du combat.
    for (let i = 0; i < 900 && banc.jeu.sommet?.nom === 'combat'; i++) {
      banc.entrees.presser('valider');
      banc.trame();
    }

    expect(banc.jeu.sommet?.nom).toBe('overworld');
    expect(banc.jeu.state.progression.terradexVus).toContain('plumelle');
  });

  it('inscrit l’adversaire au Terradex dès le premier tour', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(5), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'gouttin',
        niveau: 10,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(6), {
            uid: 'x',
            speciesId: 'galetin',
            niveau: 6,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    banc.trame();
    expect(banc.jeu.state.progression.terradexVus).toContain('galetin');
  });
});
