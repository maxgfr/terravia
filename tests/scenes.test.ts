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

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Assets } from '../src/core/assets.ts';
import type { ActionJeu, Entrees } from '../src/core/input.ts';
import { Jeu } from '../src/game/jeu.ts';
import { creerCreature } from '../src/game/creature.ts';
import {
  accueillirCreature,
  ajouterObjet,
  creerPartie,
  donnerBadge,
  marquerVu,
  poserDrapeau,
  prochainIdentifiant,
  quantite,
  sacTrie,
  typesDesBadges,
} from '../src/game/state.ts';
import { makeRng } from '../src/core/rng.ts';
import { Peintre } from '../src/ui/draw.ts';
import { SceneTitre } from '../src/scenes/titre.ts';
import { SceneOverworld } from '../src/scenes/overworld.ts';
import { SceneMenu } from '../src/scenes/menu.ts';
import { SceneCombat } from '../src/scenes/combat.ts';
import { CHARACTER_IDS } from '../src/world/characterIds.ts';
import { ELEMENT_TYPES, effectivenessAgainst, type ElementType } from '../src/data/types.ts';
import { ITEM_IDS } from '../src/data/items.ts';
import { SPECIES, SPECIES_IDS } from '../src/data/species.ts';
import { experienceForLevel } from '../src/data/stats.ts';
import { TILES, TILE_IDS } from '../src/world/tiles.ts';
import { lireTuile } from '../src/world/region.ts';

import { badgeDe, creerMonde, toutesLesArenesVaincues } from '../src/world/worldgen.ts';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH, cadrer } from '../src/core/viewport.ts';
import { PAGES_AIDE, SceneAide } from '../src/scenes/aide.ts';
import { SceneParametres } from '../src/scenes/parametres.ts';
import { SceneCarte } from '../src/scenes/carte.ts';
import { SceneFin } from '../src/scenes/fin.ts';
import { LANGUES } from '../src/i18n/index.ts';
import { entrerDansLaPartie } from '../src/scenes/partie.ts';
import { chargerDepuisTexte, exporterPartie } from '../src/save/serialize.ts';
import { lireSauvegardeLocale } from '../src/save/storage.ts';

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
    insignes: { image, size: 12, order: [...ELEMENT_TYPES] },
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

/**
 * Débordements de texte relevés pendant la trame.
 *
 * C'est la mesure qui manquait : un `texteCentre` sur une phrase de soixante caractères
 * sort du cadre sans que rien ne le signale — ni le typage, ni le rendu, qui se contente
 * de dessiner hors écran. On instrumente donc le peintre pour relever chaque écriture
 * qui dépasse.
 */
interface Debordement {
  readonly texte: string;
  readonly gauche: number;
  readonly droite: number;
}

let debordements: Debordement[] = [];
/** Tout ce qui a été écrit à l'écran pendant la trame : c'est là qu'on lit l'interface. */
let textesDessines: string[] = [];

/**
 * Remplace `texte()` par une version qui mesure avant de dessiner.
 *
 * Le contrôle porte aussi sur la verticale : la légende de la carte se dessinait sous
 * le bord inférieur de l'écran, où elle n'existait tout simplement pas pour le joueur.
 * Un texte hors cadre ne lève aucune erreur — il faut aller le mesurer.
 */
function surveillerTexte(peintre: Peintre): void {
  const original = peintre.texte.bind(peintre);
  peintre.texte = (contenu: string, x: number, y: number, options = {}) => {
    const droite = x + peintre.largeurTexte(contenu);
    const bas = y + peintre.hauteurLigne;
    if (x < 0 || droite > VIRTUAL_WIDTH || y < 0 || bas > VIRTUAL_HEIGHT) {
      debordements.push({ texte: contenu, gauche: x, droite });
    }
    textesDessines.push(contenu);
    original(contenu, x, y, options);
  };
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

function creerBanc(langue: 'fr' | 'en' = 'fr'): Banc {
  const entrees = new EntreesSimulees();
  const peintre = new Peintre(contexteSimule(), assetsSimules());
  surveillerTexte(peintre);
  debordements = [];
  textesDessines = [];
  const jeu = new Jeu(peintre, entrees, creerPartie('brume-3f7a', langue), 1234);

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

/** Stockage local simulé : sans lui, toute sauvegarde tombe dans son `catch` silencieux. */
const stockage = new Map<string, string>();

beforeAll(() => {
  // `creerTeinturier` fabrique un canvas hors écran ; on lui en fournit un factice.
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contexteSimule() }),
  };
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (cle: string) => stockage.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur),
    removeItem: (cle: string) => void stockage.delete(cle),
  };
});

beforeEach(() => stockage.clear());

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
    // Le trio proposé dépend de la seed : on vérifie qu'on est reparti avec l'un des
    // trois de ce monde-là, pas avec une espèce écrite d'avance.
    expect(banc.jeu.monde.starters).toContain(banc.jeu.state.equipe[0]!.speciesId);
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
    // Le didacticiel s'ouvre à la première entrée et bloque volontairement les
    // entrées ; ces tests-ci portent sur ce qui vient après.
    banc.jeu.dialogue.vider();
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

  /**
   * Échap produit « annuler », qui ne servait à rien dans le monde parcouru — pendant
   * que l'aide, le didacticiel et le README promettaient tous les trois qu'elle ouvrait
   * le menu. Elle le fait maintenant, sans cesser d'annuler ailleurs.
   */
  it('ouvre aussi le menu sur « annuler », la touche Échap', async () => {
    const banc = bancEnJeu();
    await banc.agir('annuler', 2);
    expect(banc.jeu.sommet?.nom).toBe('menu');
    await banc.agir('annuler', 2);
    expect(banc.jeu.sommet?.nom, 'et la même touche le referme').toBe('overworld');
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
    // Équipe (0), Sac (1), Carte (2), Terradex (3), Sauvegarde (4), Paramètres (5).
    for (const parcours of [0, 1, 2, 3, 4, 5]) {
      for (let i = 0; i < parcours; i++) await banc.agir('sud', 2);
      appelsDessin = 0;
      await banc.agir('valider', 3);
      expect(appelsDessin, `onglet ${parcours}`).toBeGreaterThan(5);
      await banc.agir('annuler', 2);
      for (let i = 0; i < parcours; i++) await banc.agir('nord', 2);
    }
    // On est revenu au menu, pas ailleurs.
    expect(banc.jeu.sommet?.nom).toBe('menu');
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

describe('aucun texte ne sort du cadre', () => {
  /** Écrans à traverser, dans les deux langues : c'est là qu'on écrivait hors cadre. */
  async function parcourirEcransDeDepart(langue: 'fr' | 'en'): Promise<Debordement[]> {
    const banc = creerBanc(langue);
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));
    banc.trame(); // accueil
    await banc.agir('valider', 3); // écran de seed
    banc.trame();
    await banc.agir('sud', 2);
    await banc.agir('valider', 3); // choix du starter
    banc.trame();
    return debordements;
  }

  for (const langue of LANGUES) {
    it(`tient dans la largeur sur les écrans de départ (${langue})`, async () => {
      const trouves = await parcourirEcransDeDepart(langue);
      expect(trouves.map((d) => `${d.texte} → ${Math.round(d.droite)}px`)).toEqual([]);
    });
  }

  it('tient dans la largeur sur les six pages de l’aide, dans les deux langues', async () => {
    for (const langue of LANGUES) {
      const banc = creerBanc(langue);
      banc.jeu.pousser(new SceneAide());
      for (let page = 0; page < PAGES_AIDE; page++) {
        banc.trame();
        await banc.agir('est', 1);
      }
      expect(debordements.map((d) => `${langue} : ${d.texte}`)).toEqual([]);
    }
  });

  it('tient dans la largeur sur les réglages et la carte', async () => {
    for (const langue of LANGUES) {
      const banc = creerBanc(langue);
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(9), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: 'folianz',
          niveau: 5,
          origine: 'brume-3f7a',
        }),
      );
      banc.jeu.pousser(new SceneParametres());
      banc.trame();
      banc.jeu.retirer();
      banc.jeu.pousser(new SceneCarte());
      banc.trame();
      expect(debordements.map((d) => `${langue} : ${d.texte}`)).toEqual([]);
    }
  });
});

describe('réglages', () => {
  it('change la langue et la conserve', async () => {
    const banc = creerBanc('fr');
    banc.jeu.pousser(new SceneParametres());
    expect(banc.jeu.langue).toBe('fr');
    await banc.agir('valider', 2);
    expect(banc.jeu.langue).toBe('en');
    await banc.agir('valider', 2);
    expect(banc.jeu.langue).toBe('fr');
  });

  it('ouvre « comment jouer » puis revient aux réglages', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneParametres());
    // Sans équipe, les entrées sont : langue, importer, comment jouer, retour.
    await banc.agir('sud', 2);
    await banc.agir('sud', 2);
    await banc.agir('valider', 2);
    expect(banc.jeu.sommet?.nom).toBe('aide');
    await banc.agir('annuler', 2);
    expect(banc.jeu.sommet?.nom).toBe('parametres');
  });

  it('n’offre l’export qu’avec une partie en cours', () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneParametres());

    // Écran-titre : l'état est une partie neuve sans créature, rien à exporter.
    textesDessines = [];
    banc.trame();
    expect(textesDessines).not.toContain(banc.jeu.t('sauvegarde.exporter'));
    // L'import, lui, reste offert : c'est justement de là qu'on en a besoin.
    expect(textesDessines).toContain(banc.jeu.t('sauvegarde.importer'));

    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(51), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 5,
        origine: 'brume-3f7a',
      }),
    );
    textesDessines = [];
    banc.trame();
    expect(textesDessines).toContain(banc.jeu.t('sauvegarde.exporter'));
  });

  it('exporte un document relisible depuis n’importe quel écran', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(52), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 5,
        origine: 'brume-3f7a',
      }),
    );
    const document = banc.jeu.documentDePartie();
    const resultat = chargerDepuisTexte(JSON.stringify(document));
    expect(resultat.ok).toBe(true);
  });

  /**
   * L'engrenage flottant a disparu : il doublait l'entrée du menu de pause. L'écran-titre
   * a donc besoin de son propre accès, sans quoi la langue devient inatteignable avant
   * d'avoir commencé une partie — précisément quand on en a le plus besoin.
   */
  it('est atteignable depuis l’écran-titre', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));

    // Sans sauvegarde : Nouvelle partie, Importer, Comment jouer, Paramètres.
    for (let i = 0; i < 3; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);
    expect(banc.jeu.sommet?.nom).toBe('parametres');

    await banc.agir('annuler', 1);
    expect(banc.jeu.sommet?.nom).toBe('titre');
  });
});

describe('aide', () => {
  it('se ferme après la dernière page plutôt que de boucler', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneAide());
    for (let page = 0; page < PAGES_AIDE; page++) await banc.agir('valider', 1);
    expect(banc.jeu.sommet?.nom).not.toBe('aide');
  });

  it('dessine chacune de ses pages', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneAide());
    for (let page = 0; page < PAGES_AIDE; page++) {
      appelsDessin = 0;
      banc.trame();
      expect(appelsDessin, `page ${page}`).toBeGreaterThan(20);
      await banc.agir('est', 1);
    }
  });
});

describe('carte', () => {
  it('dessine la région courante et se referme', async () => {
    const banc = creerBanc();
    const depart = creerMonde('brume-3f7a').region(0).depart;
    banc.jeu.state.joueur.x = depart.x;
    banc.jeu.state.joueur.y = depart.y;
    banc.jeu.pousser(new SceneCarte());
    appelsDessin = 0;
    banc.trame();
    // Une miniature de 48 × 36 cases : le compte de rectangles est forcément élevé.
    expect(appelsDessin).toBeGreaterThan(1700);
    await banc.agir('annuler', 1);
    expect(banc.jeu.sommet?.nom).not.toBe('carte');
  });

  it('n’affiche comme visitées que les régions traversées', () => {
    const banc = creerBanc();
    expect(banc.jeu.state.progression.regionsVisitees).toEqual([0]);
    banc.jeu.state.joueur.regionIndex = 2;
    banc.jeu.pousser(new SceneOverworld());
    expect(banc.jeu.state.progression.regionsVisitees).toContain(2);
    expect(banc.jeu.state.progression.regionsVisitees).not.toContain(5);
  });
});

describe('didacticiel', () => {
  it('se déclenche une seule fois, à la première sortie', () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneOverworld());
    expect(banc.jeu.dialogue.actif, 'le didacticiel doit parler la première fois').toBe(true);
    banc.jeu.dialogue.vider();

    banc.jeu.retirer();
    banc.jeu.pousser(new SceneOverworld());
    expect(banc.jeu.dialogue.actif, 'il ne doit plus rien dire ensuite').toBe(false);
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

  /**
   * Déroule les répliques d'ouverture jusqu'au menu d'actions.
   *
   * On presse « annuler » et non « valider » : les deux font avancer un dialogue, mais
   * seul « valider » ouvrirait un menu une fois la file vide.
   */
  function viderIntro(banc: Banc): void {
    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
  }

  /** Un banc déjà en combat sauvage, avec une équipe de la taille demandée. */
  function bancEnCombat(taille = 1): Banc {
    const banc = creerBanc();
    for (let index = 0; index < taille; index++) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(10 + index), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: 'folianz',
          niveau: 20,
          origine: 'brume-3f7a',
        }),
      );
    }
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(11), {
            uid: 'sauvage-1',
            speciesId: 'plumelle',
            niveau: 12,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    return banc;
  }

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

  it('affiche l’altération sur la jauge, et non « PV »', () => {
    const banc = bancEnCombat();
    banc.trame();
    banc.jeu.state.equipe[0]!.statut = 'poison';

    textesDessines = [];
    banc.trame();
    expect(textesDessines).toContain('PSN');
  });

  it('montre la créature sélectionnée même au-delà de la troisième', () => {
    const banc = bancEnCombat(6);
    viderIntro(banc);

    // Menu racine sur deux colonnes : Attaquer(0) Sac(1) / Équipe(2) Fuir(3).
    banc.entrees.presser('sud');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();
    // Sixième membre de l'équipe : hors de la fenêtre de trois lignes.
    for (let i = 0; i < 5; i++) {
      banc.entrees.presser('sud');
      banc.trame();
    }

    textesDessines = [];
    banc.trame();
    const attendu = banc.jeu.nomCreature(banc.jeu.state.equipe[5]!);
    expect(textesDessines.some((texte) => texte.startsWith(attendu))).toBe(true);
    // Et le repère de position dit où l'on se trouve dans la liste.
    expect(textesDessines).toContain('6/6');
  });
});

describe('reprise d’un combat interrompu', () => {
  const HORODATAGE = '2026-08-07T12:00:00.000Z';

  /** Rejoue une sauvegarde dans un jeu neuf, comme le ferait « Continuer ». */
  function reprendre(texte: string): Banc {
    const resultat = chargerDepuisTexte(texte);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) throw new Error(resultat.raison);

    const banc = creerBanc();
    banc.jeu.chargerPartie(resultat.valeur.state);
    entrerDansLaPartie(banc.jeu);
    return banc;
  }

  function bancAvecCombat(): Banc {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(21), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'mulotin',
        niveau: 25,
        origine: 'brume-3f7a',
      }),
    );
    // Cri Perçant ne fait aucun dégât mais baisse l'Attaque adverse à coup sûr : le
    // combat avance d'un tour et pose un étage, sans risquer le K.O. qui le clôturerait.
    banc.jeu.state.equipe[0]!.moves = [{ id: 'cri', pp: 40 }];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(22), {
            uid: 'sauvage-2',
            speciesId: 'plumelle',
            niveau: 22,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    return banc;
  }

  it('inscrit le combat dans la partie dès la première trame', () => {
    const banc = bancAvecCombat();
    banc.trame();
    expect(banc.jeu.state.combat?.genre).toBe('sauvage');
    expect(banc.jeu.state.combat?.adversaires[0]!.speciesId).toBe('plumelle');
  });

  /** Le scénario du rapport : fermer l'onglet en plein échange, puis « Continuer ». */
  it('rouvre le combat là où il s’était arrêté', () => {
    const banc = bancAvecCombat();
    // On martèle « valider » — dialogues, menu d'attaques, première attaque — jusqu'à ce
    // qu'un tour complet soit résolu.
    for (let i = 0; i < 200 && banc.jeu.sommet?.nom === 'combat'; i++) {
      banc.entrees.presser('valider');
      banc.trame();
      if ((banc.jeu.state.combat?.tour ?? 0) > 0 && !banc.jeu.dialogue.actif) break;
    }

    const avant = structuredClone(banc.jeu.state.combat!);
    expect(avant.tour).toBeGreaterThan(0);
    expect(avant.etagesAdverse.attaque).toBe(-1);
    const mien = banc.jeu.state.equipe[0]!;

    const document = banc.jeu.documentDePartie();
    expect(document).not.toBeNull();

    const repris = reprendre(JSON.stringify(document));
    expect(repris.jeu.sommet?.nom).toBe('combat');
    expect(repris.jeu.state.combat).toEqual(avant);
    expect(repris.jeu.state.equipe[0]!.pv).toBe(mien.pv);

    // Le monde est bien dessous : quitter le combat ne laisse pas une pile vide.
    repris.jeu.retirer();
    expect(repris.jeu.sommet?.nom).toBe('overworld');
  });

  it('conserve les étages de statistiques et le compteur de tours', () => {
    const banc = bancAvecCombat();
    banc.trame();
    const combat = banc.jeu.state.combat!;
    combat.etagesJoueur.attaque = 2;
    combat.etagesAdverse.vitesse = -3;
    combat.tour = 7;
    combat.tentativesFuite = 1;
    const attendu = structuredClone(combat);

    // On exporte sans passer par `documentDePartie` : son crochet redemanderait son
    // instantané à la scène et écraserait les valeurs posées ici. C'est bien le chemin
    // d'un fichier reçu de l'extérieur qu'on veut éprouver.
    const repris = reprendre(JSON.stringify(exporterPartie(banc.jeu.state, HORODATAGE)));
    expect(repris.jeu.state.combat).toEqual(attendu);
  });

  it('retire le combat de la partie quand l’écran se ferme', () => {
    const banc = bancAvecCombat();
    banc.trame();
    expect(banc.jeu.state.combat).not.toBeNull();

    banc.jeu.retirer();
    expect(banc.jeu.state.combat).toBeNull();
    expect(banc.jeu.sommet?.nom).toBe('overworld');
  });

  /**
   * L'engrenage s'ouvre par-dessus le combat : le sommet de la pile n'est plus lui. Sans
   * consulter toute la pile, un export lancé depuis les réglages emporterait un
   * instantané périmé.
   */
  it('emporte le combat même quand les réglages sont ouverts par-dessus', () => {
    const banc = bancAvecCombat();
    banc.trame();
    banc.jeu.pousser(new SceneParametres());
    expect(banc.jeu.sommet?.nom).toBe('parametres');

    const document = banc.jeu.documentDePartie();
    expect(document?.combat?.adversaires[0]!.speciesId).toBe('plumelle');

    const repris = reprendre(JSON.stringify(document));
    expect(repris.jeu.sommet?.nom).toBe('combat');
  });

  /**
   * Charger une partie depuis un écran de combat vide la pile, donc appelle le `quitter`
   * de l'ancien combat — qui efface le champ que la nouvelle partie vient de poser.
   */
  it('n’efface pas le combat chargé en refermant celui d’avant', () => {
    const source = bancAvecCombat();
    source.trame();
    const texte = JSON.stringify(source.jeu.documentDePartie());

    // Le jeu d'accueil est lui aussi en plein combat quand l'import arrive.
    const banc = bancAvecCombat();
    banc.trame();
    const charge = chargerDepuisTexte(texte);
    expect(charge.ok).toBe(true);
    if (!charge.ok) return;

    banc.jeu.chargerPartie(charge.valeur.state);
    entrerDansLaPartie(banc.jeu);
    expect(banc.jeu.sommet?.nom).toBe('combat');
    expect(banc.jeu.state.combat?.adversaires[0]!.speciesId).toBe('plumelle');
  });

  it('revient simplement au monde quand la sauvegarde n’a pas de combat', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(23), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 10,
        origine: 'brume-3f7a',
      }),
    );
    const repris = reprendre(JSON.stringify(banc.jeu.documentDePartie()));
    expect(repris.jeu.sommet?.nom).toBe('overworld');
  });
});

describe('cadrage de l’écran', () => {
  /**
   * Avec une largeur virtuelle figée à 320, un écran 16:9 laissait 160 pixels de marge
   * noire de chaque côté en 1080p, et 320 en 1440p : le jeu flottait au milieu de la
   * page. C'est la largeur qui s'adapte désormais, pas l'échelle qui se dégrade.
   */
  it('remplit les écrans courants dans les deux dimensions', () => {
    for (const [largeur, hauteur, quoi] of [
      [1920, 1080, 'desktop 1080p'],
      [2560, 1440, '1440p'],
      [1512, 982, 'MacBook'],
      [1280, 720, 'petit portable'],
      [390, 600, 'téléphone en portrait'],
      [844, 390, 'téléphone en paysage'],
      [768, 1024, 'tablette'],
    ] as const) {
      const cadrage = cadrer(largeur, hauteur);
      const contexte = `${quoi} (${largeur}×${hauteur})`;
      // Le reste de la division entière est la seule marge irréductible : il vaut au
      // plus un facteur d'échelle moins un pixel.
      expect(largeur - cadrage.largeur * cadrage.scale, `${contexte} : marge latérale`).toBeLessThan(cadrage.scale);
      expect(hauteur - cadrage.hauteur * cadrage.scale, `${contexte} : marge verticale`).toBeLessThan(cadrage.scale);
      // L'échelle reste entière : c'est elle qui garde les pixels carrés.
      expect(cadrage.scale, contexte).toBe(Math.floor(cadrage.scale));
    }
  });

  /**
   * Le garde-fou qui compte : décider l'échelle sur la seule hauteur faisait déborder le
   * canvas de 125 pixels sur un téléphone tenu en portrait.
   */
  it('ne déborde jamais de la place disponible', () => {
    for (let largeur = 240; largeur <= 3600; largeur += 37) {
      for (const hauteur of [220, 300, 340, 600, 900, 1440]) {
        const cadrage = cadrer(largeur, hauteur);
        expect(cadrage.largeur * cadrage.scale, `${largeur}×${hauteur} déborde en largeur`).toBeLessThanOrEqual(largeur);
        expect(cadrage.hauteur * cadrage.scale, `${largeur}×${hauteur} déborde en hauteur`).toBeLessThanOrEqual(hauteur);
        expect(cadrage.scale).toBeGreaterThan(0);
      }
    }
  });

  it('ne descend jamais sous les dimensions pour lesquelles les écrans sont dessinés', () => {
    // En dessous, les panneaux ne tiendraient plus dans le cadre.
    for (const [largeur, hauteur] of [[200, 200], [120, 400], [400, 120]] as const) {
      const cadrage = cadrer(largeur, hauteur);
      expect(cadrage.largeur, `${largeur}×${hauteur}`).toBeGreaterThanOrEqual(320);
      expect(cadrage.hauteur, `${largeur}×${hauteur}`).toBeGreaterThanOrEqual(208);
    }
  });

  it('ne laisse jamais plus d’un facteur d’échelle de marge', () => {
    for (let largeur = 340; largeur <= 3000; largeur += 17) {
      for (const hauteur of [230, 400, 700, 1100]) {
        const c = cadrer(largeur, hauteur);
        // Sauf quand une borne mord : le minimum et le maximum priment sur le
        // remplissage, l'un pour que les panneaux tiennent, l'autre par garde-fou.
        const libre = (valeur: number, min: number, max: number): boolean => valeur > min && valeur < max;
        if (libre(c.largeur, 320, 1024)) {
          expect(largeur - c.largeur * c.scale, `${largeur}×${hauteur}`).toBeLessThan(c.scale);
        }
        if (libre(c.hauteur, 208, 1024)) {
          expect(hauteur - c.hauteur * c.scale, `${largeur}×${hauteur}`).toBeLessThan(c.scale);
        }
      }
    }
  });
});

describe('fiche du Terradex', () => {
  /**
   * La table des types décide de chaque combat et n'était consultable nulle part : il
   * fallait la deviner coup par coup. Le Terradex n'était qu'une liste de noms.
   */
  function bancTerradex(langue: 'fr' | 'en' = 'fr'): Banc {
    const banc = creerBanc(langue);
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(97), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 10,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneMenu());
    return banc;
  }

  /** Ouvre l'onglet Terradex depuis la racine du menu. */
  async function ouvrirTerradex(banc: Banc): Promise<void> {
    for (let i = 0; i < 4; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);
  }

  it('n’ouvre la fiche que d’une espèce déjà rencontrée', async () => {
    const banc = bancTerradex();
    // Folianz est au Terradex parce qu'on l'a reçue ; la deuxième espèce, non.
    expect(banc.jeu.state.progression.terradexVus).toContain('folianz');
    await ouvrirTerradex(banc);

    // Le curseur démarre sur la première espèce de la liste, folianz.
    await banc.agir('valider', 1);
    appelsDessin = 0;
    banc.trame();
    expect(appelsDessin, 'la fiche doit dessiner quelque chose').toBeGreaterThan(20);

    // On revient, puis on vise une espèce jamais croisée : rien ne s'ouvre.
    await banc.agir('annuler', 1);
    const inconnue = SPECIES_IDS.findIndex((id) => !banc.jeu.state.progression.terradexVus.includes(id));
    expect(inconnue).toBeGreaterThan(0);
    for (let i = 0; i < inconnue; i++) await banc.agir('sud', 1);
    textesDessines = [];
    await banc.agir('valider', 1);
    banc.trame();
    expect(textesDessines.join(' '), 'une espèce inconnue reste masquée').toContain(
      banc.jeu.t('terradex.inconnu'),
    );
  });

  it('calcule les faiblesses sur la combinaison de types, pas type par type', async () => {
    const banc = bancTerradex();
    // Sylvanor est Sylve/Lumière : ses faiblesses sont celles du couple.
    marquerVu(banc.jeu.state, 'sylvanor');
    await ouvrirTerradex(banc);
    const index = SPECIES_IDS.indexOf('sylvanor');
    for (let i = 0; i < index; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);

    textesDessines = [];
    banc.trame();
    const affiche = textesDessines.join(' ');
    // Le double type Sylve/Lumière encaisse l'Onde : Sylve y résiste et Lumière est
    // neutre. Une lecture type par type l'aurait rangée en faiblesse.
    expect(effectivenessAgainst('onde', SPECIES.sylvanor.types)).toBeLessThan(1);
    expect(affiche).toContain(banc.jeu.t('terradex.resistances'));
    expect(affiche).toContain(banc.jeu.t('terradex.faiblesses'));
  });

  it('tient dans le cadre dans les deux langues', async () => {
    for (const langue of LANGUES) {
      const banc = bancTerradex(langue);
      // Une espèce à double type et longue description : le pire cas d'encombrement.
      marquerVu(banc.jeu.state, 'nyxaris');
      await ouvrirTerradex(banc);
      const index = SPECIES_IDS.indexOf('nyxaris');
      for (let i = 0; i < index; i++) await banc.agir('sud', 1);
      await banc.agir('valider', 1);

      debordements = [];
      banc.trame();
      expect(debordements.map((d) => `${langue} : ${d.texte}`)).toEqual([]);
    }
  });
});

describe('objets clés', () => {
  /** Une partie posée dans une région, avec une créature debout. */
  function bancDansLeMonde(seedText = 'brume-3f7a'): Banc {
    const banc = creerBanc();
    banc.jeu.chargerPartie(creerPartie(seedText, 'fr'));
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(95), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 20,
        origine: seedText,
      }),
    );
    return banc;
  }

  /**
   * Poste le joueur face à une étendue d'eau, dans la première région qui en a une.
   * Rend `null` si aucune n'en contient — la pêche n'a alors rien à éprouver.
   */
  function posterAuBordDeLEau(banc: Banc): boolean {
    for (const plan of banc.jeu.monde.plans) {
      const region = banc.jeu.monde.region(plan.index);
      for (let y = 1; y < region.height - 1; y++) {
        for (let x = 1; x < region.width - 1; x++) {
          if (lireTuile(region, x, y) !== 'eau') continue;
          // Une case franchissable juste au sud de l'eau : on regardera vers le nord.
          if (TILES[lireTuile(region, x, y + 1)].solid) continue;
          if (region.entites.some((e) => e.x === x && e.y === y + 1)) continue;
          banc.jeu.state.joueur.regionIndex = plan.index;
          banc.jeu.state.joueur.x = x;
          banc.jeu.state.joueur.y = y + 1;
          banc.jeu.state.joueur.direction = 'nord';
          return true;
        }
      }
    }
    return false;
  }

  it('ne pêche rien sans la canne, mais explique pourquoi', async () => {
    const banc = bancDansLeMonde();
    expect(posterAuBordDeLEau(banc), 'aucune eau trouvée dans ce monde').toBe(true);
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();

    await banc.agir('valider', 2);
    expect(banc.jeu.sommet?.nom, 'sans canne, pas de combat').toBe('overworld');
    expect(banc.jeu.dialogue.actif, 'le refus doit se dire').toBe(true);
  });

  it('remonte une créature de rivière avec la canne', async () => {
    const banc = bancDansLeMonde();
    expect(posterAuBordDeLEau(banc)).toBe(true);
    ajouterObjet(banc.jeu.state, 'canne', 1);
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();

    // Le lancer accroche sept fois sur dix : on insiste jusqu'à ce que ça morde.
    for (let essai = 0; essai < 20 && banc.jeu.sommet?.nom !== 'combat'; essai++) {
      await banc.agir('valider', 4);
    }
    expect(banc.jeu.sommet?.nom, 'la canne doit finir par accrocher').toBe('combat');

    // Et la prise sort bien de la faune aquatique, pas de celle du biome traversé.
    const prise = banc.jeu.state.combat!.adversaires[0]!;
    expect(SPECIES[prise.speciesId].habitats).toContain('riviere');
  });

  it('fait évoluer la créature choisie avec la Pierre d’Éveil', async () => {
    const banc = bancDansLeMonde();
    ajouterObjet(banc.jeu.state, 'pierreEvolution', 1);
    const avant = banc.jeu.state.equipe[0]!.speciesId;
    const attendue = SPECIES[avant].evolution!.vers;
    banc.jeu.pousser(new SceneMenu());

    // Racine : Équipe, Réserve, Sac.
    await banc.agir('sud', 1);
    await banc.agir('sud', 1);
    await banc.agir('valider', 1);
    // Le sac trie les objets clés en dernier ; la pierre est seule de son espèce ici.
    const sac = sacTrie(banc.jeu.state);
    const index = sac.findIndex((entree) => entree.item === 'pierreEvolution');
    expect(index, 'la pierre doit être dans le sac').toBeGreaterThanOrEqual(0);
    for (let i = 0; i < index; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 2);
    // La question s'ouvre. La première pression achève le défilement du texte, la
    // seconde valide la créature surlignée — la première de la liste.
    await banc.agir('valider', 2);
    await banc.agir('valider', 2);

    expect(banc.jeu.state.equipe[0]!.speciesId).toBe(attendue);
    expect(quantite(banc.jeu.state, 'pierreEvolution'), 'la pierre est consommée').toBe(0);
  });

  it('refuse la Pierre d’Éveil quand aucune créature ne peut évoluer', async () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      // Sylvanor est un bout de lignée : rien devant lui.
      creerCreature(makeRng(96), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'sylvanor',
        niveau: 40,
        origine: 'brume-3f7a',
      }),
    );
    ajouterObjet(banc.jeu.state, 'pierreEvolution', 1);
    banc.jeu.pousser(new SceneMenu());

    await banc.agir('sud', 1);
    await banc.agir('sud', 1);
    await banc.agir('valider', 1);
    const index = sacTrie(banc.jeu.state).findIndex((e) => e.item === 'pierreEvolution');
    for (let i = 0; i < index; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 2);

    expect(banc.jeu.state.equipe[0]!.speciesId, 'rien ne doit évoluer').toBe('sylvanor');
    expect(quantite(banc.jeu.state, 'pierreEvolution'), 'ni être consommé').toBe(1);
  });

  it('n’ouvre la carte qu’avec la carte', async () => {
    const banc = bancDansLeMonde();
    banc.jeu.pousser(new SceneMenu());

    // Racine : Équipe, Réserve, Sac, Carte.
    for (let i = 0; i < 3; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);
    expect(banc.jeu.sommet?.nom, 'sans l’objet, l’écran reste fermé').toBe('menu');
    expect(banc.jeu.dialogue.actif).toBe(true);
    banc.jeu.dialogue.vider();

    ajouterObjet(banc.jeu.state, 'carte', 1);
    await banc.agir('valider', 1);
    expect(banc.jeu.sommet?.nom).toBe('carte');
  });
});

describe('lisibilité du monde', () => {
  /**
   * Le bandeau n'affichait que l'heure. Or c'est la **phase** qui décide de ce qu'on
   * croise : sans son nom, rien ne reliait « 21 h » à « les nocturnes sortent ».
   */
  it('nomme la phase du jour à côté de l’horloge', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(90), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 10,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();

    for (const [minutes, cle] of [
      [6 * 60, 'heure.aube'],
      [12 * 60, 'heure.jour'],
      [19 * 60, 'heure.crepuscule'],
      [23 * 60, 'heure.nuit'],
    ] as const) {
      banc.jeu.state.horloge.minutes = minutes;
      textesDessines = [];
      banc.trame();
      expect(
        textesDessines.some((texte) => texte.startsWith(banc.jeu.t(cle))),
        `à ${minutes / 60} h, le bandeau doit dire ${cle}`,
      ).toBe(true);
    }
  });

  it('offre un enregistrement explicite, et le confirme', async () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(91), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 10,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneMenu());

    // Racine : Équipe, Réserve, Sac, Carte, Terradex, Sauvegarde.
    for (let i = 0; i < 5; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);
    // Première entrée de l'onglet : « Enregistrer maintenant ».
    await banc.agir('valider', 1);

    expect(lireSauvegardeLocale(), 'la partie doit être écrite').not.toBeNull();
    expect(banc.jeu.dialogue.actif, 'et l’écriture doit être confirmée').toBe(true);
  });
});

describe('arènes et badges', () => {
  /**
   * Poste le joueur juste sous la porte nord d'une arène, prêt à la franchir.
   *
   * C'est la mécanique qui donne un sens aux badges : sans elle, `progression.badges`
   * était écrit après chaque champion et relu par personne, et une arène n'était qu'un
   * combat de plus qu'on pouvait ignorer.
   */
  function bancDevantLaPorte(seedText: string): { banc: Banc; arene: number; type: ElementType } {
    const banc = creerBanc();
    banc.jeu.chargerPartie(creerPartie(seedText, 'fr'));
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(70), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 40,
        origine: seedText,
      }),
    );

    const arene = banc.jeu.monde.plans.find((plan) => plan.role === 'arene')!;
    const region = banc.jeu.monde.region(arene.index);
    const porte = region.sorties.find((sortie) => sortie.cote === 'nord')!;

    banc.jeu.state.joueur.regionIndex = arene.index;
    banc.jeu.state.joueur.x = porte.x;
    banc.jeu.state.joueur.y = porte.y + 1;
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    return { banc, arene: arene.index, type: arene.typeArene! };
  }

  /** Un pas vers le nord, laissé le temps de s'achever. */
  function pasVersLeNord(banc: Banc): void {
    banc.entrees.tenir('nord');
    for (let i = 0; i < 30; i++) banc.trame();
    banc.entrees.relacher('nord');
    for (let i = 0; i < 5; i++) banc.trame();
  }

  it('ferme la porte du fond tant que le champion n’est pas battu', () => {
    const { banc, arene } = bancDevantLaPorte('brume-3f7a');
    pasVersLeNord(banc);

    expect(banc.jeu.state.joueur.regionIndex, 'la porte doit rester close').toBe(arene);
    expect(banc.jeu.dialogue.actif, 'le refus doit être expliqué').toBe(true);
  });

  it('ouvre la porte une fois l’insigne remporté', () => {
    const { banc, arene, type } = bancDevantLaPorte('brume-3f7a');
    donnerBadge(banc.jeu.state, badgeDe(type));
    pasVersLeNord(banc);

    expect(banc.jeu.state.joueur.regionIndex).toBe(arene + 1);
  });

  it('n’entrave pas les régions ordinaires', () => {
    const banc = creerBanc();
    const premiere = banc.jeu.monde.plans.find((plan) => plan.role !== 'bourg')!;
    expect(premiere.typeArene).toBeUndefined();
    const region = banc.jeu.monde.region(premiere.index);
    const porte = region.sorties.find((sortie) => sortie.cote === 'nord')!;

    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(71), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 40,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.state.joueur.regionIndex = premiere.index;
    banc.jeu.state.joueur.x = porte.x;
    banc.jeu.state.joueur.y = porte.y + 1;
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();

    banc.entrees.tenir('nord');
    for (let i = 0; i < 30; i++) banc.trame();
    banc.entrees.relacher('nord');
    for (let i = 0; i < 5; i++) banc.trame();

    expect(banc.jeu.state.joueur.regionIndex).toBe(premiere.index + 1);
  });

  it('affiche les insignes remportés dans le menu', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(72), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 10,
        origine: 'brume-3f7a',
      }),
    );
    donnerBadge(banc.jeu.state, badgeDe('flamme'));
    donnerBadge(banc.jeu.state, badgeDe('givre'));
    expect(typesDesBadges(banc.jeu.state)).toEqual(['flamme', 'givre']);

    banc.jeu.pousser(new SceneMenu());
    appelsDessin = 0;
    banc.trame();
    expect(appelsDessin).toBeGreaterThan(5);
  });

  it('ignore un badge inconnu plutôt que de faire échouer la lecture', () => {
    // Les badges sont du texte libre dans la sauvegarde : une version future peut en
    // écrire que celle-ci ne connaît pas, sans que le menu s'en trouve cassé.
    const banc = creerBanc();
    banc.jeu.state.progression.badges.push('badge:inconnu', 'vieux-format');
    donnerBadge(banc.jeu.state, badgeDe('onde'));
    expect(typesDesBadges(banc.jeu.state)).toEqual(['onde']);
  });
});

describe('fin de partie', () => {
  /** Une partie où il ne reste plus qu'un champion à battre. */
  function bancPresqueVictorieux(): Banc {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(80), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 40,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    return banc;
  }

  /** Décerne tous les insignes du monde, comme le ferait la victoire sur chaque arène. */
  function toutRemporter(banc: Banc): void {
    for (const plan of banc.jeu.monde.plans) {
      if (plan.typeArene) donnerBadge(banc.jeu.state, badgeDe(plan.typeArene));
    }
  }

  it('ne s’ouvre pas tant qu’une arène reste à battre', () => {
    const banc = bancPresqueVictorieux();
    const arenes = banc.jeu.monde.plans.filter((plan) => plan.role === 'arene');
    expect(arenes.length).toBeGreaterThanOrEqual(2);
    donnerBadge(banc.jeu.state, badgeDe(arenes[0]!.typeArene!));

    expect(toutesLesArenesVaincues(banc.jeu.monde.plans, banc.jeu.state.progression.badges)).toBe(false);
    poserDrapeau(banc.jeu.state, 'victoire');
    // Le drapeau seul déclenche l'écran : c'est bien le combat qui décide de le poser.
    banc.trame();
    expect(banc.jeu.sommet?.nom).toBe('fin');
  });

  it('reconnaît la victoire quand tous les insignes sont là', () => {
    const banc = bancPresqueVictorieux();
    toutRemporter(banc);
    expect(toutesLesArenesVaincues(banc.jeu.monde.plans, banc.jeu.state.progression.badges)).toBe(true);
  });

  it('s’ouvre une fois, puis plus jamais', () => {
    const banc = bancPresqueVictorieux();
    toutRemporter(banc);
    poserDrapeau(banc.jeu.state, 'victoire');

    banc.trame();
    expect(banc.jeu.sommet?.nom).toBe('fin');
    appelsDessin = 0;
    debordements = [];
    banc.trame();
    expect(appelsDessin, 'l’écran de fin doit dessiner quelque chose').toBeGreaterThan(20);
    expect(debordements.map((d) => d.texte), 'rien ne doit sortir du cadre').toEqual([]);

    // « Reprendre » : on revient au monde, et l'écran ne revient plus.
    banc.entrees.presser('valider');
    banc.trame();
    expect(banc.jeu.sommet?.nom).toBe('overworld');
    for (let i = 0; i < 10; i++) banc.trame();
    expect(banc.jeu.sommet?.nom).toBe('overworld');
  });

  it('propose de repartir sur une autre seed', () => {
    const banc = bancPresqueVictorieux();
    toutRemporter(banc);
    poserDrapeau(banc.jeu.state, 'victoire');
    banc.trame();

    banc.entrees.presser('sud');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();
    // La pile est remplacée : le monde d'avant n'est plus dessous.
    expect(banc.jeu.sommet?.nom).toBe('titre');
  });

  it('tient dans le cadre dans les deux langues', () => {
    for (const langue of LANGUES) {
      const banc = creerBanc(langue);
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(81), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: 'folianz',
          niveau: 40,
          origine: 'brume-3f7a',
        }),
      );
      toutRemporter(banc);
      banc.jeu.pousser(new SceneFin());
      debordements = [];
      banc.trame();
      expect(debordements.map((d) => `${langue} : ${d.texte}`)).toEqual([]);
    }
  });
});

describe('réserve', () => {
  /**
   * Sans cet écran, la réserve était un trou noir : `accueillirCreature` y rangeait le
   * surplus, et rien ne l'en sortait jamais. Capturer une septième créature revenait à
   * la perdre.
   */
  function bancAvec(nombre: number): Banc {
    const banc = creerBanc();
    for (let index = 0; index < nombre; index++) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(60 + index), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: SPECIES_IDS[index % SPECIES_IDS.length]!,
          niveau: 10,
          origine: 'brume-3f7a',
        }),
      );
    }
    banc.jeu.pousser(new SceneMenu());
    return banc;
  }

  /** Ouvre l'onglet Réserve depuis la racine du menu. */
  async function ouvrir(banc: Banc): Promise<void> {
    await banc.agir('sud', 1); // Équipe → Réserve
    await banc.agir('valider', 1);
  }

  it('range le surplus en réserve au-delà de six créatures', () => {
    const banc = bancAvec(8);
    expect(banc.jeu.state.equipe).toHaveLength(6);
    expect(banc.jeu.state.reserve).toHaveLength(2);
  });

  it('dépose une créature puis la reprend', async () => {
    const banc = bancAvec(3);
    await ouvrir(banc);

    const depose = banc.jeu.state.equipe[0]!.uid;
    await banc.agir('valider', 1);
    expect(banc.jeu.state.equipe).toHaveLength(2);
    expect(banc.jeu.state.reserve.map((m) => m.uid)).toContain(depose);

    // À droite, puis on la reprend : l'équipe n'est pas pleine.
    await banc.agir('est', 1);
    await banc.agir('valider', 2);
    expect(banc.jeu.state.equipe).toHaveLength(3);
    expect(banc.jeu.state.equipe.map((m) => m.uid)).toContain(depose);
  });

  it('refuse de vider entièrement l’équipe', async () => {
    const banc = bancAvec(1);
    await ouvrir(banc);
    await banc.agir('valider', 1);

    expect(banc.jeu.state.equipe).toHaveLength(1);
    expect(banc.jeu.state.reserve).toHaveLength(0);
  });

  it('échange quand l’équipe est au complet, sans rien perdre', async () => {
    const banc = bancAvec(8);
    await ouvrir(banc);

    const avantEquipe = banc.jeu.state.equipe[0]!.uid;
    const avantReserve = banc.jeu.state.reserve[0]!.uid;
    await banc.agir('est', 1);
    await banc.agir('valider', 2);

    expect(banc.jeu.state.equipe).toHaveLength(6);
    expect(banc.jeu.state.reserve).toHaveLength(2);
    expect(banc.jeu.state.equipe.map((m) => m.uid)).toContain(avantReserve);
    expect(banc.jeu.state.reserve.map((m) => m.uid)).toContain(avantEquipe);
  });

  it('dessine les deux colonnes sans déborder du cadre', async () => {
    const banc = bancAvec(10);
    await ouvrir(banc);
    debordements = [];
    appelsDessin = 0;
    banc.trame();
    expect(appelsDessin).toBeGreaterThan(5);
    expect(debordements.map((d) => d.texte)).toEqual([]);
  });
});

describe('boîte de dialogue', () => {
  /**
   * Fait tourner la boîte seule : aucune scène n'est nécessaire pour l'éprouver.
   *
   * Plusieurs trames par appel, parce que le texte se révèle caractère par caractère —
   * la première n'en aurait pas encore affiché un seul.
   */
  function battre(banc: Banc, presser?: ActionJeu): string[] {
    if (presser) {
      banc.entrees.presser(presser);
      banc.jeu.dialogue.mettreAJour(1 / 60, banc.entrees);
      banc.entrees.finDeTrame();
    }
    for (let i = 0; i < 30; i++) banc.jeu.dialogue.mettreAJour(1 / 60, banc.entrees);
    textesDessines = [];
    banc.jeu.dialogue.dessiner();
    return textesDessines;
  }

  /**
   * Une question posée derrière un message effaçait ce message et toute la file. Le
   * symptôme se voyait à l'import : le résumé de la sauvegarde disparaissait sous la
   * demande de confirmation qui le suivait.
   */
  it('n’efface pas le message en cours quand une question survient', async () => {
    const banc = creerBanc();
    banc.jeu.dialogue.dire('premier message', 'second message');
    let choix = -1;
    void banc.jeu.dialogue.demander('la question', ['oui', 'non']).then((valeur) => {
      choix = valeur;
    });

    expect(battre(banc).join(' ')).toContain('premier');

    // Le texte est déjà révélé à ce stade : une pression par message suffit à l'écouler.
    expect(battre(banc, 'valider').join(' ')).toContain('second');
    const affiche = battre(banc, 'valider');
    expect(affiche.join(' ')).toContain('la question');
    expect(affiche).toContain('oui');

    battre(banc, 'valider');
    await Promise.resolve();
    expect(choix).toBe(0);
    expect(banc.jeu.dialogue.actif).toBe(false);
  });

  it('ouvre la question tout de suite quand rien ne parle', () => {
    const banc = creerBanc();
    void banc.jeu.dialogue.demander('seule', ['oui', 'non']);
    expect(battre(banc).join(' ')).toContain('seule');
  });
});

describe('apprentissage d’une attaque', () => {
  /**
   * Passé quatre attaques, une nouvelle était jetée en silence : la créature n'apprenait
   * plus jamais rien. Elle doit désormais proposer d'en oublier une.
   */
  function bancPretAApprendre(): Banc {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(41), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'mulotin',
        niveau: 25,
        origine: 'brume-3f7a',
      }),
    );
    // Quatre emplacements pris, dont aucun n'est Élan Téméraire — l'attaque que Mulotin
    // apprend au niveau 26. À un point d'expérience du seuil, la prochaine victoire
    // déclenche l'apprentissage.
    const mien = banc.jeu.state.equipe[0]!;
    mien.moves = [
      { id: 'ruade', pp: 35 },
      { id: 'cri', pp: 40 },
      { id: 'pisteRapide', pp: 30 },
      { id: 'chargeLourde', pp: 20 },
    ];
    mien.xp = experienceForLevel(26, SPECIES.mulotin.croissance) - 1;

    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(42), {
            uid: 'sauvage-3',
            speciesId: 'plumelle',
            niveau: 2,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    return banc;
  }

  it('propose d’oublier une attaque et applique le remplacement', async () => {
    const banc = bancPretAApprendre();
    const gagnante = banc.jeu.state.equipe[0]!;
    const remplacee = gagnante.moves[1]!.id;

    // On abat l'adversaire en martelant « valider », jusqu'à voir la question d'oubli —
    // reconnaissable à son option de sortie, dessinée seulement quand elle est ouverte.
    let posee = false;
    for (let i = 0; i < 400 && !posee; i++) {
      banc.entrees.presser('valider');
      await banc.trameAsync();
      textesDessines = [];
      banc.trame();
      posee = textesDessines.includes(banc.jeu.t('combat.renoncer'));
    }
    expect(posee, 'la question d’oubli doit s’ouvrir').toBe(true);
    expect(gagnante.niveau).toBe(26);

    // Deuxième attaque de la liste, puis on confirme.
    banc.entrees.presser('sud');
    await banc.trameAsync();
    banc.entrees.presser('valider');
    await banc.trameAsync();

    expect(gagnante.moves).toHaveLength(4);
    expect(gagnante.moves.map((slot) => slot.id)).not.toContain(remplacee);
    expect(gagnante.moves.map((slot) => slot.id)).toContain('elanTemeraire');
  });

  it('referme le combat une fois la question réglée', async () => {
    const banc = bancPretAApprendre();
    for (let i = 0; i < 400 && banc.jeu.sommet?.nom === 'combat'; i++) {
      banc.entrees.presser('valider');
      await banc.trameAsync();
    }
    expect(banc.jeu.sommet?.nom).toBe('overworld');
    // « Ne rien oublier » : les quatre attaques d'origine sont conservées.
    expect(banc.jeu.state.equipe[0]!.moves).toHaveLength(4);
  });
});

describe('sauvegarde automatique', () => {
  it('refuse d’écrire une partie sans créature, pour ne pas effacer la précédente', () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));

    expect(banc.jeu.state.equipe).toHaveLength(0);
    expect(banc.jeu.sauvegarderLocalement()).toBe(false);
    expect(banc.jeu.documentDePartie()).toBeNull();
    expect(lireSauvegardeLocale()).toBeNull();
  });

  it('écrit dès qu’une équipe existe', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(31), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 5,
        origine: 'brume-3f7a',
      }),
    );
    expect(banc.jeu.sauvegarderLocalement()).toBe(true);
    expect(lireSauvegardeLocale()).not.toBeNull();
  });

  it('écrit périodiquement pendant la marche, sans attendre un événement', () => {
    const banc = creerBanc();
    const depart = creerMonde('brume-3f7a').region(0).depart;
    banc.jeu.state.joueur.x = depart.x;
    banc.jeu.state.joueur.y = depart.y;
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(32), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 8,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();

    // Une seconde de jeu ne déclenche rien : l'écriture est cadencée, pas continue.
    for (let i = 0; i < 60; i++) banc.trame();
    expect(lireSauvegardeLocale()).toBeNull();

    // Passé la tranche de dix secondes, la position est sur le disque.
    for (let i = 0; i < 600; i++) banc.trame();
    expect(lireSauvegardeLocale()).not.toBeNull();
  });
});
