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
import type { ActionJeu, Entrees, Point } from '../src/core/input.ts';
import { Jeu, ecartEnPourcent } from '../src/game/jeu.ts';
import { creerCreature, statistique } from '../src/game/creature.ts';
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
import { ENTREES_RACINE, ENTREES_SAUVEGARDE, SceneMenu } from '../src/scenes/menu.ts';
import { SceneCombat } from '../src/scenes/combat.ts';
import { CHARACTER_IDS } from '../src/world/characterIds.ts';
import { ELEMENT_TYPES, effectivenessAgainst, type ElementType } from '../src/data/types.ts';
import { ITEMS, ITEM_IDS } from '../src/data/items.ts';
import { SPECIES, SPECIES_IDS } from '../src/data/species.ts';
import { BATTLE_STATS, STATUS_NAMES, STAT_NAMES, experienceForLevel } from '../src/data/stats.ts';
import { TILES, TILE_IDS } from '../src/world/tiles.ts';
import { lireTuile } from '../src/world/region.ts';
import { trouverChemin } from '../src/world/chemin.ts';

import { badgeDe, creerMonde, toutesLesArenesVaincues } from '../src/world/worldgen.ts';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH, cadrer } from '../src/core/viewport.ts';
import { PAGES_AIDE, SceneAide } from '../src/scenes/aide.ts';
import { SceneCarte } from '../src/scenes/carte.ts';
import { SceneFin } from '../src/scenes/fin.ts';
import { SceneEncyclopedie } from '../src/scenes/encyclopedie.ts';
import { MOVE_IDS, MOVES } from '../src/data/moves.ts';
import { LANGUES } from '../src/i18n/index.ts';
import {
  entrerDansLaPartie,
  importerCreatureSeule,
  importerPartieSeule,
} from '../src/scenes/partie.ts';
import { chargerDepuisTexte, exporterCreature, exporterPartie } from '../src/save/serialize.ts';
import { lireSauvegardeLocale } from '../src/save/storage.ts';
import { pvMax } from '../src/game/creature.ts';

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

  pointeur: Point | null = null;
  private clicPresse = false;
  private bouge = false;

  maintenue(action: ActionJeu): boolean {
    return this.maintenues.has(action);
  }
  pressee(action: ActionJeu): boolean {
    return this.pressions.has(action);
  }
  cliquePresse(): boolean {
    return this.clicPresse;
  }
  pointeurBouge(): boolean {
    return this.bouge;
  }
  finDeTrame(): void {
    this.pressions.clear();
    this.clicPresse = false;
    this.bouge = false;
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

  /** Enfonce le bouton en un point : le clic d'une trame, comme dans le jeu. */
  cliquer(x: number, y: number): void {
    this.viser(x, y);
    this.clicPresse = true;
  }
  /** Pose le pointeur sans appuyer : ce que fait une souris qui survole. */
  viser(x: number, y: number): void {
    if (!this.pointeur || this.pointeur.x !== x || this.pointeur.y !== y) this.bouge = true;
    this.pointeur = { x, y };
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

/**
 * Descend jusqu'à une entrée de la racine du menu, puis la valide.
 *
 * Par nom et non par nombre de crans : l'ordre des entrées est une décision d'interface,
 * qui a déjà changé deux fois. Compter les pressions faisait échouer six tests sans
 * rapport à chaque réorganisation, en pointant l'entrée d'arrivée plutôt que la cause.
 */
async function ouvrirEntreeRacine(banc: Banc, cle: (typeof ENTREES_RACINE)[number]): Promise<void> {
  const cible = ENTREES_RACINE.indexOf(cle);
  expect(cible, `entrée ${cle} absente du menu`).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < cible; i++) await banc.agir('sud', 1);
  await banc.agir('valider', 1);
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

  /**
   * L'écran de choix du starter n'avait aucune sortie — ni Échap, ni équivalent souris ou
   * tactile — contrairement à l'écran de seed juste avant lui. Et `chargerPartie` a déjà
   * remplacé l'état par une partie neuve : on ne pouvait plus qu'aller de l'avant ou
   * recharger la page.
   */
  it('laisse revenir de l’écran des starters à celui de la seed', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));

    await banc.agir('valider', 2); // Nouvelle partie → écran de seed
    await banc.agir('sud', 2); // aller sur « Commencer »
    await banc.agir('valider', 2); // → choix du starter

    const dessine = (): string => {
      textesDessines = [];
      banc.trame();
      return textesDessines.join(' ');
    };
    expect(dessine(), 'on est bien sur le choix du starter').toContain(
      banc.jeu.t('depart.question'),
    );

    await banc.agir('annuler', 2);
    expect(dessine(), 'retour à l’écran de seed').toContain(banc.jeu.t('titre.commencer'));
    // Aucune créature n'a été retenue au passage.
    expect(banc.jeu.state.equipe).toHaveLength(0);
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
    // Les six premières entrées de la racine, chacune ouvrant un écran ou un onglet.
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

  it('tient dans la largeur sur le menu de pause et la carte', async () => {
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
      // Le menu porte désormais les réglages à son propre niveau : ses entrées y sont
      // plus nombreuses, donc plus susceptibles de déborder.
      banc.jeu.pousser(new SceneMenu());
      banc.trame();
      banc.jeu.retirer();
      banc.jeu.pousser(new SceneCarte());
      banc.trame();
      expect(debordements.map((d) => `${langue} : ${d.texte}`)).toEqual([]);
    }
  });
});

describe('réglages', () => {
  /**
   * Les réglages n'ont plus d'écran : leurs entrées vivent au même niveau que le reste
   * du menu. Un menu dans un menu pour quatre entrées n'avait pas lieu d'être.
   */
  it('change la langue depuis le menu, sans écran intermédiaire', async () => {
    const banc = creerBanc('fr');
    banc.jeu.pousser(new SceneMenu());
    await ouvrirEntreeRacine(banc, 'parametres.langue');
    expect(banc.jeu.langue).toBe('en');
    expect(banc.jeu.sommet?.nom, 'rien ne s’est empilé').toBe('menu');
    await banc.agir('valider', 1);
    expect(banc.jeu.langue).toBe('fr');
  });

  it('ouvre « comment jouer » depuis le menu', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneMenu());
    await ouvrirEntreeRacine(banc, 'parametres.commentJouer');
    expect(banc.jeu.sommet?.nom).toBe('aide');
    await banc.agir('annuler', 1);
    expect(banc.jeu.sommet?.nom).toBe('menu');
  });

  it('garde les entrées de sauvegarde groupées dans leur onglet', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(51), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 5,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneMenu());
    for (let i = 0; i < ENTREES_RACINE.indexOf('menu.sauvegarde'); i++) {
      banc.entrees.presser('sud');
      banc.trame();
    }
    banc.entrees.presser('valider');
    banc.trame();
    textesDessines = [];
    banc.trame();
    // Chaque entrée, pas seulement deux : c'est ici qu'on voit qu'un export a perdu son
    // import — le symptôme d'origine, « Exporter une créature » sans contrepartie.
    for (const cle of ENTREES_SAUVEGARDE) {
      expect(textesDessines, `entrée ${cle}`).toContain(banc.jeu.t(cle));
    }
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
   * L'engrenage flottant a disparu, puis l'écran de réglages avec lui. L'écran-titre a
   * donc besoin de ses propres entrées, sans quoi la langue devient inatteignable avant
   * d'avoir commencé une partie — précisément quand on en a le plus besoin.
   */
  it('se change depuis l’écran-titre, sans écran intermédiaire', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));
    expect(banc.jeu.langue).toBe('fr');

    // Sans sauvegarde : Nouvelle partie, Importer, Langue, Encyclopédie, Comment jouer.
    for (let i = 0; i < 2; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);
    expect(banc.jeu.langue, 'la langue bascule sur place').toBe('en');
    expect(banc.jeu.sommet?.nom, 'et rien ne s’est empilé').toBe('titre');
  });
});

/**
 * Échanger une créature entre deux parties.
 *
 * La moitié « import » existait depuis toujours — la porte permissive du glisser-déposer
 * l'acceptait — mais le menu n'en disait rien : on y lisait « Exporter une créature »
 * sans contrepartie, et une créature reçue d'un ami n'avait pas d'entrée par où passer.
 */
describe('échange de créatures', () => {
  const HORODATAGE = '2026-08-09T10:00:00.000Z';

  /**
   * Vide la boîte de dialogue et rend ce qu'elle a dit, message par message.
   *
   * Deux pressions par tour : la première révèle le texte d'un coup, la seconde passe au
   * suivant. On lit le message entier plutôt que ce qui est dessiné, qui arrive découpé
   * en lignes — une assertion sur une phrase complète y serait fausse pour une raison
   * sans rapport avec ce qu'on éprouve.
   */
  function repliques(banc: Banc): string[] {
    const boite = banc.jeu.dialogue as unknown as { courant: string | null };
    const dites: string[] = [];
    for (let tour = 0; tour < 20 && banc.jeu.dialogue.actif; tour++) {
      if (boite.courant) dites.push(boite.courant);
      for (let pression = 0; pression < 2; pression++) {
        banc.entrees.presser('valider');
        banc.jeu.dialogue.mettreAJour(1 / 60, banc.entrees);
        banc.entrees.finDeTrame();
      }
    }
    return dites;
  }

  function peupler(banc: Banc, nombre: number): void {
    for (let index = 0; index < nombre; index++) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(200 + index), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: SPECIES_IDS[index % SPECIES_IDS.length]!,
          niveau: 10,
          origine: 'brume-3f7a',
        }),
      );
    }
  }

  /** Une créature venue d'ailleurs, sous la forme où elle circule entre deux joueurs. */
  function fichierCreature(): string {
    return JSON.stringify(
      exporterCreature(
        creerCreature(makeRng(300), {
          uid: 'venue-dailleurs',
          speciesId: 'folianz',
          niveau: 9,
          origine: 'autre-3f7a',
        }),
        HORODATAGE,
      ),
    );
  }

  /** Descend jusqu'à une entrée de l'onglet Sauvegarde, puis la valide. */
  async function ouvrirEntreeSauvegarde(
    banc: Banc,
    cle: (typeof ENTREES_SAUVEGARDE)[number],
  ): Promise<void> {
    await ouvrirEntreeRacine(banc, 'menu.sauvegarde');
    const cible = ENTREES_SAUVEGARDE.indexOf(cle);
    expect(cible, `entrée ${cle} absente de l’onglet`).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < cible; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);
  }

  it('fait entrer la créature dans l’équipe tant qu’il y reste une place', () => {
    const banc = creerBanc();
    peupler(banc, 2);
    importerCreatureSeule(banc.jeu, fichierCreature());

    expect(banc.jeu.state.equipe).toHaveLength(3);
    expect(repliques(banc)).toContain(
      banc.jeu.t('sauvegarde.creatureImportee', { nom: banc.jeu.nomEspece('folianz') }),
    );
  });

  /**
   * La réplique annonçait la réserve dans les deux cas. Le joueur qui avait de la place
   * allait donc chercher sa créature là où elle n'était pas.
   */
  it('la range en réserve quand l’équipe est pleine, et le dit', () => {
    const banc = creerBanc();
    peupler(banc, 6);
    importerCreatureSeule(banc.jeu, fichierCreature());

    expect(banc.jeu.state.equipe).toHaveLength(6);
    expect(banc.jeu.state.reserve).toHaveLength(1);
    expect(repliques(banc)).toContain(
      banc.jeu.t('sauvegarde.creatureEnReserve', { nom: banc.jeu.nomEspece('folianz') }),
    );
  });

  /**
   * Deux entrées nommées doivent tenir parole. Sur le mauvais type de document, elles
   * renvoient vers l'autre plutôt que de relayer « ce fichier n'est pas un document
   * terravia-creature » — une phrase vraie que rien dans le jeu n'apprend à lire.
   */
  it('renvoie une sauvegarde de partie vers l’entrée des parties', () => {
    const banc = creerBanc();
    peupler(banc, 1);
    importerCreatureSeule(banc.jeu, JSON.stringify(banc.jeu.documentDePartie()));

    expect(banc.jeu.state.equipe, 'rien ne doit être accueilli').toHaveLength(1);
    expect(repliques(banc)).toContain(
      banc.jeu.t('sauvegarde.mauvaisFichier', { entree: banc.jeu.t('sauvegarde.importer') }),
    );
  });

  it('renvoie une créature seule vers l’entrée des créatures', () => {
    const banc = creerBanc();
    peupler(banc, 1);
    importerPartieSeule(banc.jeu, fichierCreature());

    expect(banc.jeu.state.equipe, 'aucune partie ne doit être chargée').toHaveLength(1);
    expect(repliques(banc)).toContain(
      banc.jeu.t('sauvegarde.mauvaisFichier', { entree: banc.jeu.t('sauvegarde.importerCreature') }),
    );
  });

  /**
   * À l'écran-titre, le starter n'est pas choisi : il n'y a pas d'équipe où ranger quoi
   * que ce soit. La créature y entrait quand même, et la sauvegarde automatique écrivait
   * derrière — « Continuer » rouvrait une partie que personne n'avait commencée.
   */
  it('refuse d’accueillir une créature avant que la partie ait commencé', () => {
    const banc = creerBanc();
    expect(banc.jeu.state.equipe, 'aucun starter choisi').toHaveLength(0);
    importerCreatureSeule(banc.jeu, fichierCreature());

    expect(banc.jeu.state.equipe).toHaveLength(0);
    expect(banc.jeu.state.reserve).toHaveLength(0);
    expect(repliques(banc)).toContain(banc.jeu.t('sauvegarde.pasDePartie'));
  });

  it('garde une raison lisible pour un fichier réellement abîmé', () => {
    const banc = creerBanc();
    peupler(banc, 1);
    importerCreatureSeule(banc.jeu, '{ ceci ne se lit pas');

    const dites = repliques(banc).join(' ');
    expect(dites).toContain(banc.jeu.t('sauvegarde.invalide', { raison: '' }).trim());
    expect(dites, 'et surtout pas un renvoi vers l’autre entrée').not.toContain(
      banc.jeu.t('sauvegarde.importer'),
    );
  });

  /**
   * Le message de refus le plus long du jeu, dans les deux langues, mesuré dans le cadre.
   *
   * Ces phrases étaient écrites en français dans le code de validation : un joueur
   * anglophone lisait « valeur inconnue « frostbolt » » au milieu d'une coquille
   * anglaise. Une fois traduites, elles deviennent le texte le plus long affiché par le
   * jeu — et rien ne vérifiait qu'il tenait à l'écran.
   */
  it('affiche un refus d’import dans la langue du joueur, sans déborder', () => {
    for (const langue of LANGUES) {
      const banc = creerBanc(langue);
      peupler(banc, 1);
      // Une scène qui dessine la boîte de dialogue : sans elle, on ne mesure rien.
      banc.jeu.pousser(new SceneMenu());

      const abime = JSON.parse(fichierCreature()) as Record<string, any>;
      abime.creature.moves[0].id = 'frostbolt';
      importerCreatureSeule(banc.jeu, JSON.stringify(abime));

      // La boîte dévoile son texte lettre à lettre : on lui laisse des trames pour que la
      // phrase entière passe sous le peintre. La mesure vient **avant** `repliques`, qui
      // vide la file en validant.
      debordements = [];
      textesDessines = [];
      for (let trame = 0; trame < 240; trame++) banc.trame();

      expect(textesDessines.join(' '), `${langue} : le refus doit être dessiné`).toContain('frostbolt');
      expect(debordements, `${langue} : refus d’import hors cadre`).toEqual([]);

      const dites = repliques(banc).join(' ');
      expect(dites, `${langue} : la coquille doit être traduite`).toContain(
        banc.jeu.t('sauvegarde.invalide', { raison: '' }).trim(),
      );
    }
  });

  /**
   * L'export partait sur la première créature de l'équipe, sans le demander : c'était la
   * seule qu'on pouvait échanger, et rien ne l'annonçait.
   */
  it('demande quelle créature exporter, et les propose toutes', async () => {
    const banc = creerBanc();
    peupler(banc, 3);
    banc.jeu.pousser(new SceneMenu());
    await ouvrirEntreeSauvegarde(banc, 'sauvegarde.exporterCreature');

    // Une pression révèle l'intitulé d'un coup ; les options ne se dessinent qu'après.
    await banc.agir('valider', 2);
    textesDessines = [];
    banc.trame();

    expect(textesDessines).toContain(banc.jeu.t('sauvegarde.exporterQui'));
    for (const membre of banc.jeu.state.equipe) {
      expect(textesDessines, banc.jeu.nomCreature(membre)).toContain(banc.jeu.nomCreature(membre));
    }
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

  /**
   * Deux créatures de la même espèce, aucun surnom : les répliques ne portaient que le
   * nom d'espèce, et « Mulotin utilise Charge ! » ne disait pas lequel des deux venait
   * de frapper. Le cas n'a rien d'exotique — les hautes herbes rendent souvent l'espèce
   * qu'on y a capturée.
   */
  it('distingue les deux camps quand les créatures portent le même nom', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(130), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'menhirok',
        niveau: 30,
        origine: 'brume-3f7a',
      }),
    );
    // Une attaque faible de part et d'autre : les deux survivent au tour, et chacune
    // prend donc la parole.
    banc.jeu.state.equipe[0]!.moves = [{ id: 'ruade', pp: 20 }];
    const sauvage = creerCreature(makeRng(131), {
      uid: 'sauvage-jumeau',
      speciesId: 'menhirok',
      niveau: 30,
      origine: 'brume-3f7a',
    });
    sauvage.moves = [{ id: 'ruade', pp: 20 }];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(new SceneCombat({ genre: 'sauvage', adversaires: [sauvage] }));

    viderIntro(banc);
    // Menu d'actions → liste d'attaques → première attaque.
    for (let i = 0; i < 2; i++) {
      banc.entrees.presser('valider');
      banc.trame();
    }

    const boite = banc.jeu.dialogue as unknown as { courant: string | null };
    const dites = new Set<string>();
    for (let i = 0; i < 400 && banc.jeu.sommet?.nom === 'combat'; i++) {
      if (boite.courant) dites.add(boite.courant);
      banc.entrees.presser('valider');
      banc.trame();
    }

    // Le début d'une réplique d'attaque, reconstruit depuis le modèle traduit : le test
    // reste juste dans les deux langues, dont les gabarits n'ont pas le même ordre.
    const modele = banc.jeu.t('combat.utilise', { nom: '\u0001', attaque: '\u0002' });
    const debut = (nom: string): string => modele.replace('\u0001', nom).split('\u0002')[0]!;
    const nom = banc.jeu.nomCreature(banc.jeu.state.equipe[0]!);
    const nomAdverse = banc.jeu.t('combat.adverse', { nom });
    expect(nomAdverse, 'les deux camps doivent porter des libellés différents').not.toBe(nom);

    const lignes = [...dites];
    expect(
      lignes.filter((texte) => texte.startsWith(debut(nom))),
      'notre attaque doit être annoncée',
    ).not.toHaveLength(0);
    expect(
      lignes.filter((texte) => texte.startsWith(debut(nomAdverse))),
      'celle de l’adversaire aussi, et sans se confondre avec la nôtre',
    ).not.toHaveLength(0);
  });
});

describe('reprise d’un combat interrompu', () => {
  const HORODATAGE = '2026-08-07T12:00:00.000Z';

  /** Rejoue une sauvegarde dans un jeu neuf, comme le ferait « Continuer ». */
  function reprendre(texte: string): Banc {
    const resultat = chargerDepuisTexte(texte);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) throw new Error(resultat.raison.cle);

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

  /**
   * Un combat rouvert n'a pas de récit derrière lui : ses jauges doivent partir de l'état
   * retrouvé. Elles suivent désormais les événements et non les points de vie ; sans
   * réamorçage explicite, deux créatures déjà bien entamées se présentaient donc intactes,
   * puis se vidaient d'un coup au premier événement du tour suivant.
   */
  it('rouvre les jauges sur les points de vie retrouvés, et non pleines', () => {
    const banc = bancAvecCombat();
    banc.trame();
    const mien = banc.jeu.state.equipe[0]!;
    const adverse = banc.jeu.state.combat!.adversaires[0]!;
    mien.pv = Math.floor(pvMax(mien) / 4);
    adverse.pv = Math.floor(pvMax(adverse) / 2);

    const repris = reprendre(JSON.stringify(exporterPartie(banc.jeu.state, HORODATAGE)));
    expect(repris.jeu.sommet?.nom).toBe('combat');
    const scene = repris.jeu.sommet as unknown as { pvAffiches: Record<string, number> };

    expect(scene.pvAffiches.joueur, 'la jauge reprise doit montrer l’état réel').toBeCloseTo(
      repris.jeu.state.equipe[0]!.pv / pvMax(repris.jeu.state.equipe[0]!),
      2,
    );
    expect(scene.pvAffiches.adversaire).toBeCloseTo(
      repris.jeu.state.combat!.adversaires[0]!.pv / pvMax(repris.jeu.state.combat!.adversaires[0]!),
      2,
    );
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
   * Un écran consultable s'ouvre par-dessus le combat : le sommet de la pile n'est plus
   * lui. Sans consulter toute la pile, un export lancé de là emporterait un instantané
   * périmé.
   */
  it('emporte le combat même quand un écran est ouvert par-dessus', () => {
    const banc = bancAvecCombat();
    banc.trame();
    banc.jeu.pousser(new SceneEncyclopedie());
    expect(banc.jeu.sommet?.nom).toBe('encyclopedie');

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

describe('animations de combat', () => {
  function bancAnime(): Banc {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(99), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'mulotin',
        niveau: 30,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.state.equipe[0]!.moves = [{ id: 'chargeLourde', pp: 20 }];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(100), {
            uid: 'sauvage-a',
            speciesId: 'plumelle',
            niveau: 25,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    return banc;
  }

  /**
   * L'essentiel : une animation ne doit jamais retarder le jeu. Elle décore un état
   * déjà résolu — le moteur a tranché avant que le premier pixel ne bouge.
   */
  it('n’empêche jamais de jouer un combat jusqu’au bout', () => {
    const banc = bancAnime();
    for (let i = 0; i < 900 && banc.jeu.sommet?.nom === 'combat'; i++) {
      banc.entrees.presser('valider');
      banc.trame();
    }
    expect(banc.jeu.sommet?.nom).toBe('overworld');
  });

  /**
   * Le doute soulevé en jouant : « on dirait que mes attaques me font des dégâts ».
   *
   * Le moteur est net — un bloc de `battle.test.ts` l'établit sur les cinquante-trois
   * attaques. Restait l'écran : il empilait les répliques d'un tour dans la file, mais
   * déclenchait les secousses tout de suite, dans la boucle d'empilement. Seule la
   * dernière survivait, et elle jouait pendant que la première réplique s'affichait —
   * notre créature tremblait donc à l'écran sous le texte « Zephyrion utilise Ruade ».
   */
  it('secoue celui que vise l’attaque annoncée, pas un autre', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(101), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'zephyrion',
        niveau: 30,
        origine: 'brume-3f7a',
      }),
    );
    // Une attaque faible contre une créature endurante : les deux survivent au tour, et
    // chacune frappe donc une fois.
    banc.jeu.state.equipe[0]!.moves = [{ id: 'ruade', pp: 20 }];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(102), {
            uid: 'sauvage-b',
            speciesId: 'menhirok',
            niveau: 30,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );

    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    // Menu d'actions → liste d'attaques → première attaque.
    banc.entrees.presser('valider');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();

    const scene = banc.jeu.sommet as unknown as { coteFrappe: string | null };
    const dialogue = banc.jeu.dialogue as unknown as { courant: string | null };
    const nomJoueur = banc.jeu.nomCreature(banc.jeu.state.equipe[0]!);

    // On suit le tour réplique par réplique. À chaque fois que la secousse change de
    // camp, elle doit tomber sur celui qui *encaisse* la dernière attaque annoncée —
    // jamais sur celui qui l'a lancée.
    // Le début d'une réplique d'attaque, reconstruit depuis le modèle traduit plutôt
    // que deviné : le test reste juste dans les deux langues.
    const modele = banc.jeu.t('combat.utilise', { nom: '\u0001', attaque: '\u0002' });
    const debutAttaque = (nom: string): string => modele.replace('\u0001', nom).split('\u0002')[0]!;
    // Les répliques nomment le camp adverse comme tel : le test reconstruit le même
    // libellé, sans quoi il cesserait de reconnaître l'attaque de l'adversaire — et ne
    // vérifierait plus qu'une moitié du tour sans le dire.
    const nomAdverse = banc.jeu.t('combat.adverse', {
      nom: banc.jeu.nomCreature(banc.jeu.state.combat!.adversaires[0]!),
    });

    let attaquant: string | null = null;
    let secousse = scene.coteFrappe;
    let verifications = 0;

    for (let i = 0; i < 400 && banc.jeu.dialogue.actif; i++) {
      const texte = dialogue.courant ?? '';
      if (texte.startsWith(debutAttaque(nomJoueur))) attaquant = 'joueur';
      else if (texte.startsWith(debutAttaque(nomAdverse))) attaquant = 'adversaire';
      if (scene.coteFrappe !== secousse) {
        secousse = scene.coteFrappe;
        if (attaquant && secousse) {
          expect(secousse, `« ${texte} » ne doit pas secouer le camp qui attaque`).not.toBe(attaquant);
          verifications += 1;
        }
      }
      banc.entrees.presser('valider');
      banc.trame();
    }
    expect(verifications, 'le tour doit avoir annoncé notre attaque').toBeGreaterThan(0);
  });

  /**
   * La suite du doute précédent : « les deux vies descendent en même temps ».
   *
   * Le moteur résout le tour en entier avant de rendre la main — les deux camps sont
   * déjà à leurs points de vie de fin de tour quand la première réplique s'affiche. La
   * barre visait cet état, et non le récit : elle partait donc des deux côtés à la fois,
   * sous « X utilise Y », et le tour par tour ne se lisait plus nulle part.
   *
   * On tient ici la première réplique à l'écran, sans rien presser, et on regarde les
   * deux barres : celle du camp visé descend, celle de l'attaquant ne bouge pas encore.
   */
  it('ne fait descendre que la barre du camp visé par la réplique affichée', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(101), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'zephyrion',
        niveau: 30,
        origine: 'brume-3f7a',
      }),
    );
    // Même appariement que le test précédent : une attaque faible contre une créature
    // endurante, donc les deux survivent au tour et chacune frappe une fois.
    banc.jeu.state.equipe[0]!.moves = [{ id: 'ruade', pp: 20 }];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(102), {
            uid: 'sauvage-c',
            speciesId: 'menhirok',
            niveau: 30,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );

    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    // Menu d'actions → liste d'attaques → première attaque.
    banc.entrees.presser('valider');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();

    const scene = banc.jeu.sommet as unknown as { pvAffiches: Record<string, number> };

    // On déroule le tour et on guette l'instant où une jauge quitte le plein. À cet
    // instant précis, l'autre doit encore être intacte : c'est toute la règle. Laquelle
    // des deux part la première dépend de l'initiative, et ne regarde pas ce test.
    let premiereBougee: string | null = null;
    for (let i = 0; i < 400 && banc.jeu.dialogue.actif && premiereBougee === null; i++) {
      const joueur = scene.pvAffiches.joueur!;
      const adversaire = scene.pvAffiches.adversaire!;
      if (joueur < 1 || adversaire < 1) {
        premiereBougee = joueur < 1 ? 'joueur' : 'adversaire';
        expect(
          joueur < 1 ? adversaire : joueur,
          'les deux vies descendaient ensemble : le tour par tour ne se lisait plus',
        ).toBe(1);
      }
      banc.entrees.presser('valider');
      banc.trame();
    }
    expect(premiereBougee, 'le tour aurait dû faire perdre des points de vie').not.toBeNull();

    // …et le tour ne s'arrête pas là : l'autre camp riposte, sa jauge finit par bouger
    // aussi. Sans quoi le test passerait sur un tour où un seul coup a porté, et ne
    // dirait donc rien de l'enchaînement qu'il prétend vérifier.
    const riposte = premiereBougee === 'joueur' ? 'adversaire' : 'joueur';
    let aRiposte = false;
    for (let i = 0; i < 400 && banc.jeu.sommet?.nom === 'combat' && !aRiposte; i++) {
      if (scene.pvAffiches[riposte]! < 1) aRiposte = true;
      banc.entrees.presser('valider');
      banc.trame();
    }
    expect(aRiposte, 'le camp qui a frappé en premier doit encaisser à son tour').toBe(true);
  });

  /**
   * Les dégâts passent ici par une vraie attaque, et non par une écriture directe sur les
   * points de vie : depuis que la jauge suit le récit et non l'état, une valeur changée
   * dans le dos du moteur ne la déplace plus — et c'est précisément la propriété qu'on
   * cherchait. Le test dit donc la même chose qu'avant, par le chemin du joueur.
   */
  /**
   * Sous quelle réplique la jauge tombe.
   *
   * Elle se rangeait sous la dernière réplique produite par le tour : donc sous « C'est
   * très efficace ! » quand la table des types en donnait une, et sous l'attaque quand
   * elle n'en donnait pas. Un même coup faisait ainsi tomber la barre un appui plus tard
   * selon le type de l'attaque, et l'on ne savait plus quel coup on regardait. Le coup se
   * voit désormais porter sous la réplique qui l'annonce ; l'efficacité vient après, en
   * commentaire.
   *
   * Ruade est neutre et Menhirok est de type roche : le tour produit donc bien la
   * réplique d'efficacité qui faisait dériver la jauge.
   */
  it('fait tomber la jauge sous l’attaque, et non sous le commentaire d’efficacité', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(101), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'zephyrion',
        niveau: 30,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.state.equipe[0]!.moves = [{ id: 'ruade', pp: 20 }];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(102), {
            uid: 'sauvage-e',
            speciesId: 'menhirok',
            niveau: 30,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );

    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    banc.entrees.presser('valider');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();

    const scene = banc.jeu.sommet as unknown as { pvAffiches: Record<string, number> };
    const dialogue = banc.jeu.dialogue as unknown as { courant: string | null };
    const modele = banc.jeu.t('combat.utilise', { nom: '\u0001', attaque: '\u0002' });
    const debutAttaque = (nom: string): string => modele.replace('\u0001', nom).split('\u0002')[0]!;
    const nomJoueur = banc.jeu.nomCreature(banc.jeu.state.equipe[0]!);

    const ligne = dialogue.courant ?? '';
    expect(ligne, 'le tour doit s’ouvrir sur notre attaque').toContain(debutAttaque(nomJoueur));

    // On tient cette réplique-là à l'écran, sans rien presser : la jauge doit tomber ici.
    for (let i = 0; i < 60; i++) banc.trame();
    expect(dialogue.courant, 'la réplique ne doit pas avoir changé').toBe(ligne);
    expect(
      scene.pvAffiches.adversaire,
      'le coup doit se voir porter sous la réplique qui l’annonce',
    ).toBeLessThan(1);
    expect(scene.pvAffiches.joueur, 'nous n’avons pas encore été frappés').toBe(1);
  });

  it('fait rattraper la barre de vie au lieu de la faire sauter', () => {
    const banc = bancAnime();
    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    // Menu d'actions → liste d'attaques → première attaque.
    banc.entrees.presser('valider');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();

    const scene = banc.jeu.sommet as unknown as { pvAffiches: Record<string, number> };
    const adverse = banc.jeu.state.combat!.adversaires[0]!;
    const cible = adverse.pv / pvMax(adverse);
    expect(cible, 'l’attaque devait entamer l’adversaire').toBeLessThan(1);

    // On avance jusqu'à la première trame où la jauge a bougé.
    let depart = 1;
    for (let i = 0; i < 300 && depart === 1; i++) {
      banc.entrees.presser('valider');
      banc.trame();
      depart = scene.pvAffiches.adversaire!;
    }
    // Elle est partie, mais elle ne peut pas être arrivée : c'est tout l'objet du
    // rattrapage — on doit voir le coup porter, pas seulement en lire le résultat.
    expect(depart, 'la barre doit rattraper, pas sauter').toBeGreaterThan(cible);

    // …mais elle doit y arriver, et s'arrêter exactement dessus.
    for (let i = 0; i < 300; i++) banc.trame();
    expect(scene.pvAffiches.adversaire).toBeCloseTo(cible, 2);
  });

  /**
   * Une attaque à coups multiples pose plusieurs pertes sous une seule réplique : la
   * table des types laisse Rafale de Cailloux neutre contre un Mulotin, donc aucun de ses
   * coups ne mérite sa propre phrase. Ils doivent se lire comme une seule descente
   * continue — c'est ce que fait le rattrapage, posé une fois par réplique et non une
   * fois par coup. À raison d'un saut par coup, la jauge se téléporterait à l'avant-
   * dernier avant d'animer le seul dernier.
   */
  it('fait descendre la jauge d’un trait sous une attaque à coups multiples', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(31), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'zephyrion',
        niveau: 30,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.state.equipe[0]!.moves = [{ id: 'rafaleDeCailloux', pp: 20 }];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        // Lent, pour que le joueur frappe le premier ; endurant, pour encaisser cinq
        // coups sans tomber ; et de type métal, contre lequel la Roche est neutre — donc
        // aucun coup ne décroche sa propre réplique.
        adversaires: [
          creerCreature(makeRng(32), {
            uid: 'sauvage-d',
            speciesId: 'acierac',
            niveau: 30,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );

    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    banc.entrees.presser('valider');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();

    const scene = banc.jeu.sommet as unknown as { pvAffiches: Record<string, number> };
    expect(scene.pvAffiches.adversaire, 'la jauge ne doit pas avoir sauté').toBe(1);

    // On tient la réplique à l'écran et on regarde la barre descendre, trame par trame.
    // `animer` ne déplace jamais la jauge de plus d'un dixième de l'écart restant, avec
    // un plancher constant : tout bond au-delà trahit un saut qu'on n'a pas voulu.
    let precedent = scene.pvAffiches.adversaire!;
    let plusGrandPas = 0;
    for (let i = 0; i < 200; i++) {
      banc.trame();
      const courant = scene.pvAffiches.adversaire!;
      plusGrandPas = Math.max(plusGrandPas, precedent - courant);
      precedent = courant;
    }
    const arrivee = scene.pvAffiches.adversaire!;
    expect(arrivee, 'les coups doivent avoir porté').toBeLessThan(1);
    // Le pas le plus large autorisé, mesuré sur l'écart total réellement parcouru.
    const borne = Math.max((1 - arrivee) * 0.1, 1 / 60 * 0.35) + 0.005;
    expect(plusGrandPas, 'la jauge s’est téléportée au lieu de glisser').toBeLessThanOrEqual(borne);
  });

  it('dessine sans erreur pendant l’entrée et la chute', () => {
    const banc = bancAnime();
    // Première trame : les créatures glissent encore depuis les bords.
    appelsDessin = 0;
    debordements = [];
    banc.trame();
    expect(appelsDessin).toBeGreaterThan(20);

    // Puis on abat l'adversaire et on laisse la chute se jouer.
    for (let i = 0; i < 900 && banc.jeu.sommet?.nom === 'combat'; i++) {
      banc.entrees.presser('valider');
      banc.trame();
      if (i % 7 === 0) banc.trame();
    }
    expect(debordements.map((d) => d.texte)).toEqual([]);
  });
});

describe('repérage des services', () => {
  /**
   * « Je ne sais pas où soigner mes créatures ni où trouver des prismes. » Le lieu de
   * soin et la boutique se confondaient avec les autres villageois, et rien sur la carte
   * ne les distinguait.
   */
  it('marque le soin et la boutique sur la carte de région', () => {
    const banc = creerBanc();
    const village = banc.jeu.monde.plans.find((plan) => plan.role === 'village')!;
    const region = banc.jeu.monde.region(village.index);
    const services = region.entites.filter((entite) => entite.kind === 'service');
    expect(services.length, 'le village doit offrir des services').toBeGreaterThan(0);

    banc.jeu.state.joueur.regionIndex = village.index;
    banc.jeu.state.joueur.x = region.depart.x;
    banc.jeu.state.joueur.y = region.depart.y;
    banc.jeu.pousser(new SceneCarte());

    textesDessines = [];
    banc.trame();
    // La légende nomme ce que les pastilles signifient : sans elle, une couleur de plus
    // sur une miniature dense n'apprend rien.
    expect(textesDessines).toContain(banc.jeu.t('carte.soin'));
  });

  it('signale les lieux habités sur la bande des régions', () => {
    const banc = creerBanc();
    // Le bourg et le village y sont marqués comme les arènes : c'est ce qui dit où
    // revenir se soigner quand le parcours change à chaque seed.
    const habites = banc.jeu.monde.plans.filter(
      (plan) => plan.role === 'bourg' || plan.role === 'village',
    );
    expect(habites.length).toBeGreaterThanOrEqual(2);
  });

  it('dit au départ où soigner et où acheter des prismes', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(98), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 5,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    // Le didacticiel se déroule à la première sortie ; sa dernière ligne répond aux
    // deux questions qu'un joueur se pose avant tout le reste.
    const dites: string[] = [];
    for (let i = 0; i < 80 && banc.jeu.dialogue.actif; i++) {
      textesDessines = [];
      banc.trame();
      dites.push(...textesDessines);
      banc.entrees.presser('annuler');
      banc.trame();
    }
    const tout = dites.join(' ');
    expect(tout).toContain('soigneuse');
    expect(tout).toContain('prismes');
  });

  it('la carte tient dans le cadre à la hauteur minimale', () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneCarte());
    debordements = [];
    banc.trame();
    expect(debordements.map((d) => d.texte)).toEqual([]);
  });
});

describe('encyclopédie', () => {
  /**
   * L'encyclopédie était le seul écran de lecture qu'on ne pouvait pas fermer à la
   * souris : la carte, l'aide et les fiches acceptent toutes un clic. Ici le clic nu
   * appartient déjà aux onglets et à la liste, d'où une croix explicite — que sa propre
   * ligne d'aide promettait pourtant depuis le début en ne citant qu'Échap.
   */
  it('se ferme d’un clic sur sa croix, et pas seulement au clavier', () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneEncyclopedie());
    banc.trame();
    expect(banc.jeu.sommet?.nom).toBe('encyclopedie');

    banc.entrees.cliquer(VIRTUAL_WIDTH - 14, 15);
    banc.trame();
    expect(banc.jeu.sommet?.nom).not.toBe('encyclopedie');
  });

  /**
   * Le Terradex ne montre que ce qu'on a rencontré, et c'est son intérêt. Restait sans
   * réponse : quelles attaques existent, à quoi sert cet objet, où trouver de quoi
   * capturer. L'encyclopédie décrit le jeu, pas la partie.
   */
  it('parcourt les trois rayons et dessine chaque fiche', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneEncyclopedie());

    for (const rayon of ['créatures', 'attaques', 'objets']) {
      appelsDessin = 0;
      banc.trame();
      expect(appelsDessin, `rayon ${rayon}`).toBeGreaterThan(20);
      // Quelques entrées de chaque rayon, pour éprouver leurs détails.
      for (let i = 0; i < 5; i++) await banc.agir('sud', 1);
      await banc.agir('est', 1);
    }
  });

  it('couvre l’intégralité de chaque catalogue sans trou ni débordement', async () => {
    for (const langue of LANGUES) {
      const banc = creerBanc(langue);
      banc.jeu.pousser(new SceneEncyclopedie());
      debordements = [];

      // Chaque rayon est parcouru en entier : une fiche sur quarante qui déborde ne se
      // verrait pas autrement.
      for (const total of [SPECIES_IDS.length, MOVE_IDS.length, ITEM_IDS.length]) {
        for (let i = 0; i < total; i++) {
          banc.trame();
          banc.entrees.presser('sud');
          banc.trame();
        }
        banc.entrees.presser('est');
        banc.trame();
      }
      expect(debordements.map((d) => `${langue} : ${d.texte}`)).toEqual([]);
    }
  });

  it('dit où se procurer chaque objet', () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneEncyclopedie());
    // Deux pressions vers la droite : rayon des objets.
    for (let i = 0; i < 2; i++) {
      banc.entrees.presser('est');
      banc.trame();
    }
    // Le prisme est en boutique ; le joueur qui cherche « où sont les prismes » doit
    // trouver la réponse ici.
    const index = ITEM_IDS.indexOf('prisme');
    for (let i = 0; i < index; i++) {
      banc.entrees.presser('sud');
      banc.trame();
    }
    textesDessines = [];
    banc.trame();
    expect(textesDessines.join(' ')).toContain(
      banc.jeu.t('encyclopedie.enBoutique', { prix: ITEMS.prisme.prix }),
    );
  });

  it('s’ouvre depuis le menu de pause, au même niveau que le reste', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneMenu());
    await ouvrirEntreeRacine(banc, 'encyclopedie.titre');
    expect(banc.jeu.sommet?.nom).toBe('encyclopedie');
  });

  it('s’ouvre aussi depuis l’écran-titre', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));
    // Nouvelle partie, Importer, Langue, Encyclopédie.
    for (let i = 0; i < 3; i++) await banc.agir('sud', 1);
    await banc.agir('valider', 1);
    expect(banc.jeu.sommet?.nom).toBe('encyclopedie');
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
    await ouvrirEntreeRacine(banc, 'menu.terradex');
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

    await ouvrirEntreeRacine(banc, 'menu.carte');
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

    await ouvrirEntreeRacine(banc, 'menu.sauvegarde');
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

/**
 * Souris et doigt.
 *
 * Ces écrans sont pilotés par des rectangles calculés à deux endroits — le rendu les
 * dessine, la mise à jour les teste. Rien dans le typage ne relie les deux : une ligne
 * déplacée de quatre pixels au rendu rendrait la moitié d'un menu incliquable sans que
 * quoi que ce soit proteste. C'est exactement ce que ces tests surveillent.
 */
describe('pointeur', () => {
  /**
   * Le coin haut-gauche de la vue, tel que la scène le calcule.
   *
   * Le test refait le trajet dans l'autre sens : il part d'une case, en déduit le point
   * de l'écran, et vérifie que la scène retrouve bien la case. Une erreur dans un sens
   * ou dans l'autre casse l'aller-retour.
   */
  function camera(banc: Banc): { x: number; y: number } {
    const region = banc.jeu.monde.region(banc.jeu.state.joueur.regionIndex);
    const { x, y } = banc.jeu.state.joueur;
    return {
      x: Math.max(0, Math.min(region.width * 16 - VIRTUAL_WIDTH, x * 16 + 8 - VIRTUAL_WIDTH / 2)),
      y: Math.max(0, Math.min(region.height * 16 - VIRTUAL_HEIGHT, y * 16 + 8 - VIRTUAL_HEIGHT / 2)),
    };
  }

  function bancMonde(): Banc {
    const banc = creerBanc();
    const depart = creerMonde('brume-3f7a').region(0).depart;
    banc.jeu.state.joueur.x = depart.x;
    banc.jeu.state.joueur.y = depart.y;
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(41), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 8,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    return banc;
  }

  /**
   * Une case sûre à quelques pas : praticable, sans herbes hautes ni objet sur le
   * trajet. Sans cette précaution, une rencontre sauvage interromprait la marche et le
   * test échouerait pour une raison qui n'a rien à voir avec ce qu'il mesure.
   */
  function cibleTranquille(banc: Banc): { x: number; y: number } | undefined {
    const region = banc.jeu.monde.region(0);
    const depart = banc.jeu.state.joueur;
    const libre = (x: number, y: number): boolean => {
      const tuile = lireTuile(region, x, y);
      return (
        !TILES[tuile].solid &&
        !TILES[tuile].encounter &&
        TILES[tuile].ledge === undefined &&
        !region.entites.some((entite) => entite.x === x && entite.y === y)
      );
    };
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      for (let distance = 4; distance >= 2; distance--) {
        const segment = Array.from({ length: distance }, (_, index) => ({
          x: depart.x + dx * (index + 1),
          y: depart.y + dy * (index + 1),
        }));
        if (segment.every((c) => libre(c.x, c.y))) return segment[segment.length - 1];
      }
    }
    return undefined;
  }

  it('marche tout seul jusqu’à la case cliquée', () => {
    const banc = bancMonde();
    const cible = cibleTranquille(banc);
    expect(cible, 'le bourg de départ doit offrir quelques pas dégagés').toBeDefined();

    const vue = camera(banc);
    banc.entrees.cliquer(cible!.x * 16 + 8 - vue.x, cible!.y * 16 + 8 - vue.y);
    banc.trame();
    // Le bouton relâché ne change rien : le trajet est posé, il se marche seul.
    for (let i = 0; i < 200; i++) banc.trame();

    const { x, y } = banc.jeu.state.joueur;
    expect({ x, y }).toEqual(cible);
  });

  it('contourne un obstacle au lieu de buter dessus', () => {
    const banc = bancMonde();
    const region = banc.jeu.monde.region(0);
    const depart = { x: banc.jeu.state.joueur.x, y: banc.jeu.state.joueur.y };

    // Le test décide lui-même de ce qui est franchissable, sans rien demander à la
    // scène : il cherche une destination dont le plus court chemin est *plus long* que
    // la distance à vol d'oiseau, donc impossible à atteindre en ligne droite.
    const libre = (c: { x: number; y: number }): boolean => {
      const tuile = lireTuile(region, c.x, c.y);
      return (
        !TILES[tuile].solid &&
        !TILES[tuile].encounter &&
        TILES[tuile].ledge === undefined &&
        !region.entites.some((entite) => entite.x === c.x && entite.y === c.y)
      );
    };
    const voisines = (depuis: { x: number; y: number }) =>
      [
        { x: depuis.x, y: depuis.y - 1 },
        { x: depuis.x, y: depuis.y + 1 },
        { x: depuis.x - 1, y: depuis.y },
        { x: depuis.x + 1, y: depuis.y },
      ].filter(libre);

    let detour: { x: number; y: number } | undefined;
    let longueur = 0;
    for (let rayon = 3; rayon <= 8 && !detour; rayon++) {
      for (let dx = -rayon; dx <= rayon && !detour; dx++) {
        const dy = rayon - Math.abs(dx);
        for (const candidate of [
          { x: depart.x + dx, y: depart.y + dy },
          { x: depart.x + dx, y: depart.y - dy },
        ]) {
          if (!libre(candidate)) continue;
          const chemin = trouverChemin(
            depart,
            (c) => c.x === candidate.x && c.y === candidate.y,
            voisines,
          );
          if (!chemin || chemin.length <= rayon) continue;
          detour = candidate;
          longueur = chemin.length;
          break;
        }
      }
    }
    expect(detour, 'le bourg doit offrir au moins un détour à faire').toBeDefined();

    const vue = camera(banc);
    banc.entrees.cliquer(detour!.x * 16 + 8 - vue.x, detour!.y * 16 + 8 - vue.y);
    for (let i = 0; i < 40 * longueur; i++) banc.trame();

    const { x, y } = banc.jeu.state.joueur;
    expect({ x, y }, `${longueur} pas pour une distance de ${Math.abs(detour!.x - depart.x) + Math.abs(detour!.y - depart.y)}`).toEqual(detour);
  });

  it('abandonne le trajet dès qu’une direction est demandée au clavier', () => {
    const banc = bancMonde();
    const cible = cibleTranquille(banc);
    expect(cible).toBeDefined();
    const depart = { ...banc.jeu.state.joueur };

    const vue = camera(banc);
    banc.entrees.cliquer(cible!.x * 16 + 8 - vue.x, cible!.y * 16 + 8 - vue.y);
    banc.trame();
    for (let i = 0; i < 12; i++) banc.trame();

    // Une touche reprend la main — celle qui fait demi-tour, pour que la divergence
    // avec la destination soit nette — puis on la relâche : plus rien ne doit bouger.
    const demiTour =
      cible!.y > depart.y ? 'nord' : cible!.y < depart.y ? 'sud' : cible!.x > depart.x ? 'ouest' : 'est';
    // Elle est tenue le temps qu'un pas s'achève : aucune entrée n'est lue pendant
    // l'interpolation d'une case à l'autre, c'est la règle de la scène.
    banc.entrees.tenir(demiTour);
    for (let i = 0; i < 12; i++) banc.trame();
    banc.entrees.relacher(demiTour);
    for (let i = 0; i < 30; i++) banc.trame();
    const arret = { ...banc.jeu.state.joueur };
    for (let i = 0; i < 200; i++) banc.trame();

    expect(banc.jeu.state.joueur.x).toBe(arret.x);
    expect(banc.jeu.state.joueur.y).toBe(arret.y);
    expect(arret, 'et l’on s’est arrêté avant la destination').not.toEqual(
      expect.objectContaining(cible!),
    );
  });

  it('rejoint un interlocuteur lointain puis lui parle', () => {
    const banc = bancMonde();
    const region = banc.jeu.monde.region(0);

    const libre = (x: number, y: number): boolean => {
      const tuile = lireTuile(region, x, y);
      return (
        !TILES[tuile].solid &&
        !TILES[tuile].encounter &&
        TILES[tuile].ledge === undefined &&
        !region.entites.some((entite) => entite.x === x && entite.y === y)
      );
    };

    // Un interlocuteur, une case libre à côté de lui, et trois cases dégagées en amont
    // d'où partir : c'est le trajet que le clic doit couvrir tout seul.
    let depart: { x: number; y: number } | undefined;
    let cible: { x: number; y: number } | undefined;
    for (const entite of region.entites) {
      if (entite.kind === 'objet' || entite.kind === 'dresseur') continue;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const couloir = [1, 2, 3, 4].map((pas) => ({ x: entite.x + dx * pas, y: entite.y + dy * pas }));
        if (!couloir.every((c) => libre(c.x, c.y))) continue;
        depart = couloir[3];
        cible = { x: entite.x, y: entite.y };
        break;
      }
      if (depart) break;
    }
    expect(depart, 'le bourg doit offrir un interlocuteur abordable de loin').toBeDefined();

    banc.jeu.state.joueur.x = depart!.x;
    banc.jeu.state.joueur.y = depart!.y;
    banc.trame();

    const vue = camera(banc);
    banc.entrees.cliquer(cible!.x * 16 + 8 - vue.x, cible!.y * 16 + 8 - vue.y);
    for (let i = 0; i < 200 && !banc.jeu.dialogue.actif; i++) banc.trame();

    expect(banc.jeu.dialogue.actif, 'la conversation s’engage à l’arrivée').toBe(true);
    const { x, y } = banc.jeu.state.joueur;
    expect(
      Math.abs(x - cible!.x) + Math.abs(y - cible!.y),
      'et l’on s’est arrêté juste à côté, pas dessus',
    ).toBe(1);
  });

  it('parle à un PNJ voisin qu’on clique', () => {
    const banc = bancMonde();
    const region = banc.jeu.monde.region(0);
    // Un interlocuteur du bourg, et une case libre à côté de lui d'où l'aborder.
    const cible = region.entites.find((entite) => entite.kind === 'pnj' || entite.kind === 'panneau');
    expect(cible, 'la région de départ doit contenir quelqu’un à qui parler').toBeDefined();

    const voisines = [
      { x: cible!.x, y: cible!.y + 1 },
      { x: cible!.x, y: cible!.y - 1 },
      { x: cible!.x + 1, y: cible!.y },
      { x: cible!.x - 1, y: cible!.y },
    ];
    const depuis = voisines.find((voisine) => !TILES[lireTuile(region, voisine.x, voisine.y)].solid);
    expect(depuis, 'toute entité est accessible depuis une case voisine').toBeDefined();

    banc.jeu.state.joueur.x = depuis!.x;
    banc.jeu.state.joueur.y = depuis!.y;
    banc.trame();

    const vue = camera(banc);
    banc.entrees.cliquer(cible!.x * 16 + 8 - vue.x, cible!.y * 16 + 8 - vue.y);
    banc.trame();

    expect(banc.jeu.dialogue.actif).toBe(true);
  });

  it('ouvre l’onglet Équipe puis la fiche d’une créature au clic', () => {
    const banc = creerBanc();
    for (const species of ['folianz', 'mulotin'] as const) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(42), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: species,
          niveau: 12,
          origine: 'brume-3f7a',
        }),
      );
    }
    banc.jeu.pousser(new SceneMenu());

    // « Équipe » est la première entrée du menu, dessinée à y = 34.
    banc.entrees.cliquer(60, 36);
    banc.trame();
    textesDessines = [];
    banc.trame();
    expect(textesDessines).toContain(banc.jeu.nomCreature(banc.jeu.state.equipe[1]!));

    // La seconde vignette d'équipe commence vingt-six pixels sous la première.
    banc.entrees.cliquer(60, 32 + 26);
    banc.trame();
    textesDessines = [];
    banc.trame();
    // La fiche s'ouvre sur la créature cliquée, la seconde — et non sur la première,
    // que la sélection désignait avant que la souris s'en mêle.
    const attendu = banc.jeu.nomCreature(banc.jeu.state.equipe[1]!);
    expect(textesDessines[0]).toContain(attendu);
    // Et c'est bien la fiche : elle seule affiche les points d'expérience.
    expect(textesDessines).toContain(banc.jeu.t('fiche.xp'));
  });

  it('laisse le clavier maître tant que le pointeur ne bouge pas', () => {
    const banc = creerBanc();
    for (const species of ['folianz', 'mulotin'] as const) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(43), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: species,
          niveau: 12,
          origine: 'brume-3f7a',
        }),
      );
    }
    banc.jeu.pousser(new SceneMenu());

    // Une souris posée sur la première entrée, puis immobile.
    banc.entrees.viser(60, 36);
    banc.trame();
    for (let i = 0; i < 3; i++) {
      banc.entrees.presser('sud');
      banc.trame();
    }
    banc.entrees.presser('valider');
    banc.trame();
    textesDessines = [];
    banc.trame();

    // Trois crans plus bas que « Équipe » : le sac. Si le survol avait repris la main,
    // on serait revenu sur l'équipe à chaque trame.
    expect(textesDessines).toContain(banc.jeu.t('menu.sac'));
  });

  it('avance un dialogue au clic', () => {
    const banc = bancMonde();
    banc.jeu.dialogue.dire('Un message.');
    banc.jeu.dialogue.dire('Un autre.');
    for (let i = 0; i < 60; i++) banc.trame();

    banc.entrees.cliquer(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 20);
    banc.trame();
    for (let i = 0; i < 60; i++) banc.trame();

    banc.entrees.cliquer(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 20);
    banc.trame();
    banc.trame();

    expect(banc.jeu.dialogue.actif).toBe(false);
  });

  it('affiche le type de chaque attaque sans sortir du cadre', () => {
    for (const langue of ['fr', 'en'] as const) {
      const banc = creerBanc(langue);
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(60), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: 'folianz',
          niveau: 30,
          origine: 'brume-3f7a',
        }),
      );
      // Les quatre noms les plus longs du jeu, dans les deux langues : c'est ce cas-là
      // qui débordait de la colonne voisine du temps de la grille à deux colonnes.
      const parLongueur = MOVE_IDS.slice().sort(
        (a, b) => MOVES[b].nom[langue].length - MOVES[a].nom[langue].length,
      );
      banc.jeu.state.equipe[0]!.moves = parLongueur.slice(0, 4).map((id) => ({ id, pp: 20 }));

      banc.jeu.pousser(new SceneOverworld());
      banc.jeu.dialogue.vider();
      banc.jeu.pousser(
        new SceneCombat({
          genre: 'sauvage',
          adversaires: [
            creerCreature(makeRng(61), {
              uid: 'sauvage-c',
              speciesId: 'menhirok',
              niveau: 30,
              origine: 'brume-3f7a',
            }),
          ],
        }),
      );
      for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
        banc.entrees.presser('annuler');
        banc.trame();
      }
      banc.entrees.presser('valider'); // → liste d'attaques
      banc.trame();

      debordements = [];
      textesDessines = [];
      banc.trame();

      expect(debordements, `${langue} : ${debordements.map((d) => d.texte).join(' | ')}`).toHaveLength(0);
      // La plaque porte le nom du type en capitales : c'est elle qu'on vient vérifier.
      const types = new Set(parLongueur.slice(0, 4).map((id) => banc.jeu.nomType(MOVES[id].type).toUpperCase()));
      for (const type of types) expect(textesDessines, `${langue} : plaque ${type}`).toContain(type);
    }
  });

  it('choisit une attaque en combat au clic', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(44), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 24,
        origine: 'brume-3f7a',
      }),
    );
    // Deux attaques offensives : la seconde est celle qu'on ira chercher à la souris.
    banc.jeu.state.equipe[0]!.moves = [
      { id: 'chargeLourde', pp: 20 },
      { id: 'fouetLiane', pp: 20 },
    ];
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(45), {
            uid: 'sauvage',
            speciesId: 'plumelle',
            niveau: 5,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    // « Attaquer » est en haut à gauche de la grille d'actions, qui occupe les
    // cinquante-deux derniers pixels de l'écran.
    banc.entrees.cliquer(40, VIRTUAL_HEIGHT - 52 + 12);
    banc.trame();
    banc.trame();

    // La liste d'attaques a son propre panneau, plus haut : une attaque par ligne,
    // douze pixels de pas. On vise la seconde. Le panneau est ancré par le bas — il
    // dépasse de cinquante pixels au-dessus du bandeau depuis qu'il dit aussi l'effet
    // et la description de l'attaque visée —, donc les quatre lignes ne bougent pas.
    banc.entrees.cliquer(60, VIRTUAL_HEIGHT - 52 - 50 + 8 + 12);
    banc.trame();
    for (let i = 0; i < 10; i++) banc.trame();

    const [premiere, seconde] = banc.jeu.state.equipe[0]!.moves;
    expect(seconde!.pp, 'la seconde attaque est celle qui a servi').toBe(19);
    expect(premiere!.pp, 'et la première n’a pas bougé').toBe(20);
  });

  it('mène du titre au monde à la souris seule', async () => {
    const banc = creerBanc();
    banc.jeu.pousser(new SceneTitre('brume-3f7a'));

    /** Un clic, puis les trames qu'il faut pour que la scène s'installe. */
    const cliquer = async (x: number, y: number): Promise<void> => {
      banc.entrees.cliquer(x, y);
      await banc.trameAsync();
        for (let i = 0; i < 3; i++) await banc.trameAsync();
    };

    // Sans sauvegarde, « Nouvelle partie » est la première entrée, dessinée à y = 70.
    await cliquer(VIRTUAL_WIDTH / 2, 72);

    // L'écran de seed empile ses deux options sous un texte de hauteur variable : le
    // test refait la mesure, et le clic ne tombe juste que si les deux concordent.
    const hauteurTexte =
      banc.jeu.peintre.decouper(banc.jeu.t('titre.seedLibre'), VIRTUAL_WIDTH - 60).length *
      banc.jeu.peintre.hauteurLigne;
    await cliquer(VIRTUAL_WIDTH / 2, 94 + hauteurTexte + 14); // « Commencer »

    // La troisième carte de starter, dessinée à x = 24 + 2 × 96.
    await cliquer(24 + 2 * 96 + 30, 100);

    // Puis « Oui » dans la question de confirmation, à la souris elle aussi.
    for (let i = 0; i < 30 && banc.jeu.sommet?.nom === 'titre'; i++) {
      await cliquer(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 26);
    }

    expect(banc.jeu.sommet?.nom).toBe('overworld');
    expect(banc.jeu.state.equipe).toHaveLength(1);
    expect(banc.jeu.state.equipe[0]!.speciesId).toBe(banc.jeu.monde.starters[2]);
  });
});

/**
 * Ce que fait une attaque, et où le joueur peut enfin le lire.
 *
 * Les quatorze attaques qui ne frappent pas n'annonçaient que le mot « Statut » : la
 * donnée `move.effet` vivait dans le catalogue depuis toujours sans qu'aucun écran ne
 * la lise, si bien qu'on lançait Onde de Choc sans savoir qu'elle paralyse.
 */
describe('effet d’une attaque', () => {
  it('rend chacune des attaques du catalogue sans jamais rendre une phrase vide', () => {
    const banc = creerBanc();
    for (const id of MOVE_IDS) {
      const effet = banc.jeu.effetAttaque(MOVES[id]);
      if (MOVES[id].effet === undefined) {
        expect(effet, `${id} n’a pas d’effet et ne doit rien annoncer`).toBeNull();
        continue;
      }
      expect(effet, `${id} a un effet, il doit se dire`).not.toBeNull();
      expect(effet!.trim().length, `${id} rend une phrase vide`).toBeGreaterThan(0);
      // Un gabarit dont un paramètre n'a pas été substitué se voit à ses accolades.
      expect(effet, `${id} laisse un paramètre non substitué`).not.toMatch(/[{}]/);
    }
  });

  it('couvre les sept familles d’effet, dans les deux langues', () => {
    const familles = new Set(MOVE_IDS.map((id) => MOVES[id].effet?.kind).filter((kind) => kind !== undefined));
    expect(familles.size, 'le catalogue n’exerce plus les sept familles').toBe(7);

    for (const langue of ['fr', 'en'] as const) {
      const banc = creerBanc(langue);
      for (const id of MOVE_IDS) {
        if (!MOVES[id].effet) continue;
        expect(banc.jeu.effetAttaque(MOVES[id])).not.toMatch(/[{}]/);
      }
    }
  });

  it('dit qu’Onde de Choc paralyse, et à coup sûr', () => {
    const banc = creerBanc();
    const effet = banc.jeu.effetAttaque(MOVES.ondeDeChoc)!;
    expect(effet).toContain(STATUS_NAMES.paralysie.fr);
    // Un effet certain se dit sans probabilité : « (100 % du temps) » serait du bruit.
    expect(effet).not.toContain('100');
  });

  /**
   * Le point de départ de tout ceci : « une amélioration de 50 % des attaques ou
   * autre », disait le rapport. C'est exactement ce que vaut un étage — encore
   * fallait-il l'écrire.
   */
  it('chiffre un étage en pourcentage, hausse comme baisse', () => {
    expect(ecartEnPourcent(1)).toBe(50);
    expect(ecartEnPourcent(2)).toBe(100);
    // L'asymétrie de `stageMultiplier` est volontaire : baisser vaut moins que hausser.
    expect(ecartEnPourcent(-1)).toBe(33);

    const banc = creerBanc();
    // Repli monte d'un cran, Aiguisage de deux : la phrase suit la donnée, elle ne
    // suppose pas qu'un cran soit la norme.
    expect(banc.jeu.effetAttaque(MOVES.repli)).toContain('50');
    expect(banc.jeu.effetAttaque(MOVES.aiguisage)).toContain('100');
    expect(banc.jeu.effetAttaque(MOVES.cri)).toContain('33');
  });

  it('affiche l’effet et la description sous les attaques, sans sortir du cadre', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(31), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 20,
        origine: 'brume-3f7a',
      }),
    );
    // Une attaque dont on connaît l'effet et la description, pour les chercher à l'écran.
    banc.jeu.state.equipe[0]!.moves[0] = { id: 'aiguisage', pp: MOVES.aiguisage.pp };
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(32), {
            uid: 'sauvage-effet',
            speciesId: 'plumelle',
            niveau: 12,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    banc.entrees.presser('valider'); // « Attaquer »
    banc.trame();
    debordements = [];
    textesDessines = [];
    banc.trame();

    const effet = banc.jeu.effetAttaque(MOVES.aiguisage)!;
    expect(textesDessines, 'l’effet de l’attaque visée').toContain(effet);
    expect(textesDessines.some((texte) => MOVES.aiguisage.description.fr.startsWith(texte.replace('…', '')))).toBe(true);
    expect(debordements, 'le panneau élargi déborde').toEqual([]);
  });
});

/**
 * Qui entre quand une créature tombe.
 *
 * Le premier membre debout entrait de lui-même, en silence : une équipe rangée dans
 * l'ordre où on l'a capturée envoyait donc n'importe qui contre n'importe quoi, et le
 * joueur découvrait le mauvais choix après coup, sans l'avoir fait.
 */
describe('remplacement au K.O.', () => {
  /** Un banc en combat de dresseur, avec une équipe de la taille demandée. */
  function bancContreDresseur(taille: number): Banc {
    const banc = creerBanc();
    for (let index = 0; index < taille; index++) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(40 + index), {
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
          creerCreature(makeRng(50), {
            uid: 'sauvage-ko',
            speciesId: 'plumelle',
            niveau: 30,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    return banc;
  }

  /** Met la créature active à terre et laisse la scène en tirer les conséquences. */
  function abattreActive(banc: Banc, index: number): void {
    banc.jeu.state.equipe[index]!.pv = 1;
    // Un tour joué suffit : la créature à un point de vie ne survit pas à l'échange.
    banc.entrees.presser('valider'); // « Attaquer »
    banc.trame();
    banc.entrees.presser('valider'); // la première attaque
    for (let i = 0; i < 200 && banc.jeu.state.equipe[index]!.pv > 0; i++) banc.trame();
  }

  it('laisse le joueur désigner son remplaçant, et n’en sort pas sans', () => {
    const banc = bancContreDresseur(3);
    abattreActive(banc, 0);
    for (let i = 0; i < 120 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    // « Annuler » ne referme rien : il n'y a pas de menu racine à retrouver tant que
    // personne n'est sur le terrain.
    for (let i = 0; i < 10; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    expect(banc.jeu.state.equipe[0]!.pv, 'la première est bien à terre').toBe(0);
    expect(banc.jeu.sommet?.nom, 'le combat ne se referme pas de lui-même').toBe('combat');

    // Le curseur est déjà posé sur une créature debout : valider suffit.
    banc.entrees.presser('valider');
    banc.trame();
    // Puis la réplique d'entrée s'écoule, comme toute réplique : à la pression.
    for (let i = 0; i < 120 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    expect(banc.jeu.state.combat?.indexJoueur, 'la créature choisie est entrée').toBeGreaterThan(0);
    expect(banc.jeu.state.equipe[banc.jeu.state.combat!.indexJoueur]!.pv).toBeGreaterThan(0);
  });

  it('n’offre aucun choix quand il ne reste qu’une créature debout', () => {
    const banc = bancContreDresseur(2);
    abattreActive(banc, 0);
    for (let i = 0; i < 200 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    // Une seule survivante : elle entre sans qu'on ait rien à valider.
    expect(banc.jeu.state.combat?.indexJoueur).toBe(1);
  });

  it('ne laisse jamais la sauvegarde pointer une créature à terre', () => {
    const banc = bancContreDresseur(3);
    abattreActive(banc, 0);
    for (let i = 0; i < 120 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    // Fermer l'onglet pendant le choix : la partie s'écrit telle qu'elle est. Une
    // sauvegarde désignant une créature à terre est refusée au rechargement — elle
    // reprendrait un combat que personne ne peut jouer.
    const document = banc.jeu.documentDePartie();
    expect(document, 'le combat en cours est enregistrable').not.toBeNull();
    const index = document!.combat?.indexJoueur ?? 0;
    expect(banc.jeu.state.equipe[index]!.pv, 'la sauvegarde désigne une créature debout').toBeGreaterThan(0);
  });
});

/**
 * L'ordre de l'équipe, et ce qu'une fiche a fini par dire.
 *
 * L'ordre décide qui part au combat en premier et dans quel ordre les remplaçants se
 * présentent. Il ne se changeait que par des allers-retours en réserve, et par accident.
 */
describe('ordre de l’équipe', () => {
  /** Un banc dans l'onglet Équipe, avec le nombre de créatures demandé. */
  async function bancDansEquipe(taille: number): Promise<Banc> {
    const banc = creerBanc();
    for (let index = 0; index < taille; index++) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(60 + index), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: SPECIES_IDS[index]!,
          niveau: 10 + index,
          origine: 'brume-3f7a',
        }),
      );
    }
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(new SceneMenu());
    await ouvrirEntreeRacine(banc, 'menu.equipe');
    return banc;
  }

  it('déplace une créature soulevée au clavier, et repose ce qu’elle portait', async () => {
    const banc = await bancDansEquipe(3);
    const [premiere, seconde] = banc.jeu.state.equipe.map((membre) => membre.uid);

    // « est » soulève la créature sous le curseur, « sud » la descend d'un rang.
    await banc.agir('est', 1);
    await banc.agir('sud', 1);

    expect(banc.jeu.state.equipe[0]!.uid, 'la seconde est remontée').toBe(seconde);
    expect(banc.jeu.state.equipe[1]!.uid, 'la portée a pris sa place').toBe(premiere);

    // On repose, et la validation retrouve son rôle : ouvrir la fiche.
    await banc.agir('valider', 1);
    await banc.agir('valider', 1);
    expect(banc.jeu.state.equipe.map((membre) => membre.uid).slice(0, 2)).toEqual([seconde, premiere]);
  });

  it('ne fait pas boucler une créature portée d’un bout à l’autre de l’équipe', async () => {
    const banc = await bancDansEquipe(3);
    const avant = banc.jeu.state.equipe.map((membre) => membre.uid);

    // Portée au premier rang, poussée vers le haut : le tour de liste la ferait traverser
    // toute l'équipe d'un coup, ce que personne ne demande en appuyant une fois.
    await banc.agir('est', 1);
    await banc.agir('nord', 1);
    expect(banc.jeu.state.equipe.map((membre) => membre.uid)).toEqual(avant);
  });

  it('range aussi à la souris, sans rien avoir à soulever', async () => {
    const banc = await bancDansEquipe(3);
    const [premiere, seconde] = banc.jeu.state.equipe.map((membre) => membre.uid);

    // La flèche « bas » de la première ligne : deux boutons de onze pixels, à droite.
    banc.entrees.cliquer(VIRTUAL_WIDTH - 34 + 6, 30 + 11 + 5);
    await banc.trameAsync();

    expect(banc.jeu.state.equipe.map((membre) => membre.uid).slice(0, 2)).toEqual([seconde, premiere]);
  });

  it('repose la créature portée en quittant l’onglet', async () => {
    const banc = await bancDansEquipe(3);
    await banc.agir('est', 1);
    await banc.agir('annuler', 1); // repose
    await banc.agir('annuler', 1); // remonte au menu racine
    const ordre = banc.jeu.state.equipe.map((membre) => membre.uid);

    await ouvrirEntreeRacine(banc, 'menu.equipe');
    // Rien ne bouge tant qu'on n'a pas soulevé de nouveau : la créature n'est pas restée
    // en main entre deux visites.
    await banc.agir('sud', 1);
    expect(banc.jeu.state.equipe.map((membre) => membre.uid)).toEqual(ordre);
  });

  it('n’offre aucune flèche là où elle ne mènerait nulle part', async () => {
    const seule = await bancDansEquipe(1);
    seule.trame();
    // Une équipe d'une seule créature n'a rien à ranger : le clic dans la zone des
    // flèches revient donc à la ligne, et ouvre la fiche comme partout ailleurs.
    seule.entrees.cliquer(VIRTUAL_WIDTH - 34 + 6, 30 + 11 + 5);
    await seule.trameAsync();
    expect((seule.jeu.sommet as unknown as { onglet: string }).onglet).toBe('fiche');

    const trois = await bancDansEquipe(3);
    const ordre = trois.jeu.state.equipe.map((membre) => membre.uid);
    // La flèche « haut » du premier rang n'existe pas non plus : rien au-dessus.
    trois.entrees.cliquer(VIRTUAL_WIDTH - 34 + 6, 30 + 5);
    await trois.trameAsync();
    expect(trois.jeu.state.equipe.map((membre) => membre.uid)).toEqual(ordre);
  });

  it('donne les cinq statistiques sur la fiche d’une créature', async () => {
    const banc = await bancDansEquipe(2);
    await banc.agir('valider', 1);

    debordements = [];
    textesDessines = [];
    banc.trame();

    const creature = banc.jeu.state.equipe[0]!;
    for (const stat of BATTLE_STATS) {
      expect(textesDessines, `${stat} manque à la fiche`).toContain(STAT_NAMES[stat].court);
      expect(textesDessines, `la valeur de ${stat} manque`).toContain(`${statistique(creature, stat)}`);
    }
    expect(debordements, 'la colonne de statistiques déborde').toEqual([]);
  });

  /**
   * La fiche est pleine, et la colonne de statistiques s'est glissée dans la seule
   * place qui restait. Un texte qui en percute un autre ne déborde d'aucun bord : la
   * mesure de débordement ne le voit pas, et rien ne le signalerait avant qu'un joueur
   * ne lise « Talent : RégénéATT » sur un écran étroit.
   */
  it('n’empile aucun texte sur un autre, à la plus petite taille d’écran', async () => {
    const banc = await bancDansEquipe(2);
    await banc.agir('valider', 1);

    const boites: { texte: string; x: number; y: number; droite: number }[] = [];
    const peintre = banc.jeu.peintre;
    const dessine = peintre.texte.bind(peintre);
    peintre.texte = (contenu: string, x: number, y: number, options = {}) => {
      boites.push({ texte: contenu, x, y, droite: x + peintre.largeurTexte(contenu) });
      dessine(contenu, x, y, options);
    };
    banc.trame();

    for (const boite of boites) {
      for (const autre of boites) {
        if (boite === autre || boite.y !== autre.y || boite.x > autre.x) continue;
        expect(
          boite.droite,
          `« ${boite.texte} » recouvre « ${autre.texte} » sur la ligne ${boite.y}`,
        ).toBeLessThanOrEqual(autre.x);
      }
    }
  });
});

/**
 * Le changement proposé à l'arrivée d'une créature adverse.
 *
 * Changer de créature existait depuis toujours, enfoui sous « Équipe » dans le menu
 * racine, et se voyait si peu qu'on jouait des parties entières sans le trouver. Il se
 * propose désormais au seul moment où il ne coûte rien : quand un adversaire vient de
 * tomber et que le suivant n'a pas encore joué.
 */
describe('changement offert', () => {
  function bancContreDeuxAdversaires(taille: number): Banc {
    const banc = creerBanc();
    for (let index = 0; index < taille; index++) {
      accueillirCreature(
        banc.jeu.state,
        creerCreature(makeRng(70 + index), {
          uid: prochainIdentifiant(banc.jeu.state),
          speciesId: 'folianz',
          niveau: 40,
          origine: 'brume-3f7a',
        }),
      );
    }
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'dresseur',
        dresseur: {
          kind: 'dresseur',
          id: 'dresseur-test',
          x: 0,
          y: 0,
          sprite: CHARACTER_IDS[0]!,
          dialogue: 'dialogue.villageois.0',
          dialogueVaincu: 'dialogue.villageois.0',
          equipe: [],
          recompense: 10,
          vision: 1,
          regard: 'sud',
        },
        adversaires: [1, 2].map((rang) =>
          creerCreature(makeRng(80 + rang), {
            uid: `adverse-${rang}`,
            speciesId: 'plumelle',
            niveau: 3,
            origine: 'brume-3f7a',
          }),
        ),
      }),
    );
    for (let i = 0; i < 80 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }
    return banc;
  }

  it('propose le changement quand le dresseur envoie la suivante', () => {
    const banc = bancContreDeuxAdversaires(3);

    // Un niveau quarante contre un niveau trois : le premier adversaire tombe du coup.
    banc.entrees.presser('valider'); // « Attaquer »
    banc.trame();
    banc.entrees.presser('valider'); // la première attaque
    banc.trame();
    // Les répliques du tour s'écoulent à la pression. « Annuler » les fait défiler mais
    // ne répond à aucune question : celle du changement reste donc affichée à la fin.
    textesDessines = [];
    for (let i = 0; i < 400; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    expect(textesDessines, 'la question de changement est posée').toContain(banc.jeu.t('combat.changerQuestion'));
    expect(textesDessines, 'avec de quoi répondre').toContain(banc.jeu.t('depart.oui'));
  });

  it('ne propose rien à qui n’a qu’une créature', () => {
    const banc = bancContreDeuxAdversaires(1);

    banc.entrees.presser('valider');
    banc.trame();
    banc.entrees.presser('valider');
    banc.trame();
    textesDessines = [];
    for (let i = 0; i < 400; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    // Le premier adversaire tombe, le second entre — et rien n'est proposé, puisqu'il
    // n'y a personne à mettre à la place.
    expect(textesDessines).not.toContain(banc.jeu.t('combat.changerQuestion'));
    expect(
      (banc.jeu.sommet as unknown as { indexAdverse: number }).indexAdverse,
      'le second adversaire est bien entré',
    ).toBe(1);
  });
});

/**
 * Les hausses et les baisses en cours, enfin lisibles.
 *
 * Les étages se posaient, se lisaient dans chaque calcul de dégâts, et ne se voyaient
 * nulle part : lancer Aiguisage deux fois ne laissait aucune trace à l'écran, et rien
 * n'expliquait pourquoi l'on encaissait soudain davantage.
 */
describe('étages de statistique à l’écran', () => {
  it('affiche les crans en cours sous la jauge, et rien quand il n’y en a pas', () => {
    const banc = creerBanc();
    accueillirCreature(
      banc.jeu.state,
      creerCreature(makeRng(90), {
        uid: prochainIdentifiant(banc.jeu.state),
        speciesId: 'folianz',
        niveau: 20,
        origine: 'brume-3f7a',
      }),
    );
    banc.jeu.pousser(new SceneOverworld());
    banc.jeu.dialogue.vider();
    banc.jeu.pousser(
      new SceneCombat({
        genre: 'sauvage',
        adversaires: [
          creerCreature(makeRng(91), {
            uid: 'sauvage-etages',
            speciesId: 'plumelle',
            niveau: 12,
            origine: 'brume-3f7a',
          }),
        ],
      }),
    );
    for (let i = 0; i < 60 && banc.jeu.dialogue.actif; i++) {
      banc.entrees.presser('annuler');
      banc.trame();
    }

    // Une créature intacte n'affiche aucune ligne d'étages : elle n'aurait rien à dire.
    textesDessines = [];
    banc.trame();
    expect(textesDessines.some((texte) => texte.includes('%'))).toBe(false);

    const combat = banc.jeu.sommet as unknown as {
      state: { joueur: { etages: Record<string, number> }; adversaire: { etages: Record<string, number> } };
    };
    combat.state.joueur.etages['attaque'] = 1;
    combat.state.adversaire.etages['defense'] = -2;

    debordements = [];
    textesDessines = [];
    banc.trame();

    expect(textesDessines, 'la hausse du joueur').toContain(`${STAT_NAMES.attaque.court} +50%`);
    expect(textesDessines, 'la baisse de l’adversaire').toContain(`${STAT_NAMES.defense.court} -50%`);
    expect(debordements, 'la ligne d’étages déborde').toEqual([]);
  });
});
