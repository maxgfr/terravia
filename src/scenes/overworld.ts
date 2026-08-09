/**
 * Le monde parcouru : déplacement case par case, interactions, rencontres.
 *
 * Le joueur avance d'une case à la fois, avec une interpolation entre les deux — c'est
 * ce qui donne la sensation « grille » du genre tout en restant fluide. Aucune action
 * n'est prise pendant qu'un pas est en cours : les entrées sont lues, mais elles ne
 * font que préparer le pas suivant.
 *
 * Deux façons de mener le personnage cohabitent. Le clavier pousse dans une direction,
 * pas par pas. Le clic pose une destination et le trajet s'y rend seul, en contournant
 * ce qui gêne — et si la case visée est un PNJ ou de l'eau, il s'arrête juste à côté et
 * agit. Toute touche de direction reprend la main sur-le-champ.
 */

import { TILE_SIZE, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { rngFor } from '../core/rng.ts';
import { creerCreature } from '../game/creature.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import {
  aBadge,
  aDrapeau,
  acheter,
  ajouterObjet,
  avancerTemps,
  dresseurVaincu,
  equipeHorsCombat,
  marquerObjetRamasse,
  marquerRegionVisitee,
  objetRamasse,
  phaseDuJour,
  poserDrapeau,
  quantite,
  prochainIdentifiant,
  soignerEquipe,
} from '../game/state.ts';
import { ITEMS, stockBoutique } from '../data/items.ts';
import { DIRECTION_VECTORS, type Direction } from '../world/characterIds.ts';
import { TAUX_RENCONTRE, tirerRencontre } from '../world/encounters.ts';
import type { Dresseur, Entite } from '../world/entities.ts';
import { lireTuile, type Region } from '../world/region.ts';
import { trouverChemin, type Case } from '../world/chemin.ts';
import { badgeDe } from '../world/worldgen.ts';
import { TILES } from '../world/tiles.ts';
import { COULEURS } from '../ui/draw.ts';
import type { CleTexte } from '../i18n/index.ts';
import { SceneCombat } from './combat.ts';
import { SceneFin } from './fin.ts';
import { SceneMenu } from './menu.ts';

/** Durée d'un pas, en secondes. Plus court paraît nerveux, plus long paraît pâteux. */
const DUREE_PAS = 0.15;

/** Chance qu'un lancer de canne accroche quelque chose. */
const TAUX_PECHE = 0.7;

/** Voiles appliqués au monde selon l'heure. */
const VOILES: Record<string, string | null> = {
  aube: 'rgba(255, 178, 122, 0.22)',
  jour: null,
  crepuscule: 'rgba(255, 122, 77, 0.26)',
  nuit: 'rgba(42, 63, 140, 0.45)',
};

interface Pas {
  readonly depuisX: number;
  readonly depuisY: number;
  readonly versX: number;
  readonly versY: number;
  progression: number;
  /** Un saut de rebord se joue plus haut et plus vite qu'un pas ordinaire. */
  readonly saut: boolean;
}

export class SceneOverworld implements Scene {
  readonly nom = 'overworld';
  readonly opaque = true;

  private pas: Pas | null = null;
  private trameMarche = 0;
  private distanceParcourue = 0;
  private annonce: { texte: string; restant: number } | null = null;

  /** Les cases qu'il reste à traverser après un clic, dans l'ordre. */
  private chemin: Case[] = [];
  /**
   * Ce qu'il faudra faire en arrivant au bout du chemin.
   *
   * Cliquer un PNJ à l'autre bout de la place mène jusqu'à lui *et* engage la
   * conversation : sans cette mémoire, il faudrait un second clic une fois sur place,
   * exactement là où le premier voulait déjà dire « va lui parler ».
   */
  private aInteragirEn: Case | null = null;

  entrer(jeu: Jeu): void {
    marquerRegionVisitee(jeu.state, jeu.state.joueur.regionIndex);
    this.annoncerRegion(jeu);
    this.lancerDidacticiel(jeu);
  }

  /**
   * Trois phrases, une seule fois, à la toute première sortie.
   *
   * Un jeu ouvert depuis un lien ne vient avec aucune notice : sans ces lignes, on ne
   * sait ni où aller, ni ce que sont les touffes sombres. Le drapeau vit dans la
   * sauvegarde, donc elles ne réapparaissent jamais.
   */
  private lancerDidacticiel(jeu: Jeu): void {
    if (aDrapeau(jeu.state, 'didacticiel')) return;
    poserDrapeau(jeu.state, 'didacticiel');
    jeu.dialogue.dire(
      jeu.t('didacticiel.1'),
      jeu.t('didacticiel.2'),
      jeu.t('didacticiel.3'),
      jeu.t('didacticiel.4'),
    );
    jeu.dialogue.puis(() => jeu.sauvegarderLocalement());
  }

  /**
   * Ouvre l'écran de fin au retour du dernier champion.
   *
   * Le drapeau est posé en combat, mais l'écran s'ouvre ici : on veut qu'il apparaisse
   * une fois le combat refermé, sur le monde. Le second drapeau évite qu'il revienne à
   * chaque trame — et à chaque retour au monde pour le reste de la partie.
   */
  private celebrerLaVictoire(jeu: Jeu): boolean {
    if (!aDrapeau(jeu.state, 'victoire') || aDrapeau(jeu.state, 'finVue')) return false;
    if (jeu.dialogue.actif) return false;
    poserDrapeau(jeu.state, 'finVue');
    jeu.sauvegarderLocalement();
    jeu.pousser(new SceneFin());
    return true;
  }

  private region(jeu: Jeu): Region {
    return jeu.monde.region(jeu.state.joueur.regionIndex);
  }

  private annoncerRegion(jeu: Jeu): void {
    const region = this.region(jeu);
    this.annonce = { texte: region.nom[jeu.langue], restant: 2.4 };
  }

  // ── Boucle ─────────────────────────────────────────────────────────────────

  mettreAJour(jeu: Jeu, step: number): void {
    avancerTemps(jeu.state, step * 1000);
    if (this.celebrerLaVictoire(jeu)) return;
    // Les autres points de sauvegarde sont événementiels — région franchie, objet
    // ramassé, combat fini. Traverser une grande région n'en déclenche aucun : sans
    // cette écriture régulière, la position et l'horloge ne vivent qu'en mémoire.
    jeu.sauvegarderSiModifie(step * 1000);

    if (this.annonce) {
      this.annonce.restant -= step;
      if (this.annonce.restant <= 0) this.annonce = null;
    }

    if (jeu.dialogue.actif) {
      // Parler interrompt la marche : reprendre le trajet après une conversation, c'est
      // repartir alors qu'on venait justement d'arriver quelque part.
      this.abandonnerChemin();
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }

    if (this.pas) {
      this.avancerPas(jeu, step);
      return;
    }

    // Échap ouvre le menu autant que M. La touche produit « annuler », qui ne servait à
    // rien dans le monde parcouru — pendant que l'aide, le didacticiel et le README
    // promettaient tous les trois qu'elle ouvrait le menu.
    if (jeu.entrees.pressee('menu') || jeu.entrees.pressee('annuler')) {
      this.abandonnerChemin();
      jeu.pousser(new SceneMenu());
      return;
    }
    if (jeu.entrees.pressee('valider')) {
      this.abandonnerChemin();
      this.interagir(jeu);
      return;
    }

    // Le clavier reprend la main sans cérémonie : une direction demandée annule le
    // trajet en cours, sinon il faudrait attendre son terme pour se raviser.
    const direction = this.directionDemandee(jeu);
    if (direction) {
      this.abandonnerChemin();
      this.tenterPas(jeu, direction);
      return;
    }

    this.lireClic(jeu);
    this.suivreChemin(jeu);
  }

  /** La case du monde que le pointeur désigne, ou `null` s'il n'y en a pas. */
  private caseVisee(jeu: Jeu): { x: number; y: number } | null {
    const pointeur = jeu.pointeur;
    if (!pointeur) return null;
    const camera = this.camera(jeu);
    return {
      x: Math.floor((pointeur.x + camera.x) / TILE_SIZE),
      y: Math.floor((pointeur.y + camera.y) / TILE_SIZE),
    };
  }

  private directionDemandee(jeu: Jeu): Direction | null {
    for (const direction of ['nord', 'sud', 'est', 'ouest'] as const) {
      if (jeu.entrees.maintenue(direction)) return direction;
    }
    return null;
  }

  private abandonnerChemin(): void {
    this.chemin = [];
    this.aInteragirEn = null;
  }

  // ── Navigation au clic ─────────────────────────────────────────────────────

  /**
   * Un clic trace un trajet jusqu'à la case visée, et l'y mène tout seul.
   *
   * Trois cas, dans cet ordre : la case est praticable et l'on s'y rend ; elle porte
   * quelque chose à qui parler — ou de l'eau où pêcher — et l'on va se placer à côté
   * avant d'agir ; elle n'est ni l'un ni l'autre, et le clic ne fait rien. Un mur cliqué
   * ne doit pas envoyer marcher ailleurs : le silence est plus lisible qu'un à-peu-près.
   */
  private lireClic(jeu: Jeu): void {
    if (!jeu.entrees.cliquePresse()) return;
    const cible = this.caseVisee(jeu);
    if (!cible) return;

    const region = this.region(jeu);
    const depart: Case = { x: jeu.state.joueur.x, y: jeu.state.joueur.y };
    const voisines = (depuis: Case): Case[] => this.casesAtteignables(jeu, region, depuis);

    if (this.praticable(jeu, region, cible.x, cible.y)) {
      this.chemin = trouverChemin(depart, (c) => c.x === cible.x && c.y === cible.y, voisines) ?? [];
      this.aInteragirEn = null;
      return;
    }

    if (!this.interactive(jeu, region, cible)) return;

    // On vise les quatre voisines de la cible, et le parcours choisit la plus proche.
    const chemin = trouverChemin(
      depart,
      (c) => Math.abs(c.x - cible.x) + Math.abs(c.y - cible.y) === 1,
      voisines,
    );
    if (!chemin) return;
    this.chemin = chemin;
    this.aInteragirEn = cible;
    // Déjà à côté : il n'y a rien à parcourir, seulement à se tourner et à agir.
    if (chemin.length === 0) this.acheverChemin(jeu);
  }

  /** Avance d'une case le long du trajet en cours, s'il en reste un. */
  private suivreChemin(jeu: Jeu): void {
    const prochaine = this.chemin[0];
    if (!prochaine) return;

    const joueur = jeu.state.joueur;
    const dx = prochaine.x - joueur.x;
    const dy = prochaine.y - joueur.y;
    // Un saut de rebord franchit deux cases d'un coup : c'est l'ordonnée qui décide,
    // pas la distance.
    const direction: Direction = dy > 0 ? 'sud' : dy < 0 ? 'nord' : dx > 0 ? 'est' : 'ouest';

    if (!this.tenterPas(jeu, direction)) {
      // Le monde a bougé depuis le tracé — un dresseur s'est mis en travers. Mieux vaut
      // s'arrêter que de piétiner contre lui jusqu'au prochain clic.
      this.abandonnerChemin();
      return;
    }
    // Le pas est seulement *engagé* : la position ne changera qu'au bout de son
    // interpolation. C'est donc `avancerPas`, et non ici, qui constatera l'arrivée.
    this.chemin.shift();
  }

  /**
   * Ce qui se passe une fois le bout du trajet atteint.
   *
   * L'interaction est différée d'ici plutôt que déclenchée au clic : au moment du clic,
   * le joueur est encore à l'autre bout de la place.
   */
  private acheverChemin(jeu: Jeu): void {
    const cible = this.aInteragirEn;
    this.aInteragirEn = null;
    if (!cible) return;

    const joueur = jeu.state.joueur;
    const dx = cible.x - joueur.x;
    const dy = cible.y - joueur.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    joueur.direction = dx === 1 ? 'est' : dx === -1 ? 'ouest' : dy === 1 ? 'sud' : 'nord';
    this.interagir(jeu);
  }

  /** Une case où le joueur peut se tenir : ni solide, ni occupée. */
  private praticable(jeu: Jeu, region: Region, x: number, y: number): boolean {
    const tuile = lireTuile(region, x, y);
    if (TILES[tuile].solid || tuile === 'vide') return false;
    // Un rebord se saute, il ne s'habite pas : viser l'un d'eux, c'est viser sa
    // réception, et le trajet passe par là de lui-même.
    if (TILES[tuile].ledge === 'sud') return false;
    return !this.entiteEn(region, x, y, jeu);
  }

  /** Une case qui répond quand on lui parle : une entité, ou de l'eau où lancer la canne. */
  private interactive(jeu: Jeu, region: Region, cible: Case): boolean {
    if (lireTuile(region, cible.x, cible.y) === 'eau') return true;
    return region.entites.some(
      (entite) =>
        entite.x === cible.x &&
        entite.y === cible.y &&
        entite.kind !== 'objet' &&
        !(entite.kind === 'dresseur' && dresseurVaincu(jeu.state, entite.id)),
    );
  }

  /**
   * Les cases accessibles en un pas, avec exactement les règles du déplacement.
   *
   * Elles sont écrites deux fois — ici et dans `tenterPas` — et c'est assumé : la
   * première décide d'un trajet, la seconde l'exécute case par case. Elles ne peuvent
   * pas fusionner, `tenterPas` ayant des effets. Si elles divergeaient, le trajet
   * buterait, et `suivreChemin` s'arrêterait proprement plutôt que de s'entêter.
   */
  private casesAtteignables(jeu: Jeu, region: Region, depuis: Case): Case[] {
    const cases: Case[] = [];
    for (const direction of ['nord', 'sud', 'est', 'ouest'] as const) {
      const { dx, dy } = DIRECTION_VECTORS[direction];
      const versX = depuis.x + dx;
      const versY = depuis.y + dy;
      const tuile = lireTuile(region, versX, versY);

      if (TILES[tuile].ledge === 'sud') {
        // Un rebord ne se franchit que vers le sud, et l'on atterrit une case plus bas.
        if (direction !== 'sud') continue;
        if (this.praticable(jeu, region, versX, versY + 1)) cases.push({ x: versX, y: versY + 1 });
        continue;
      }
      if (this.praticable(jeu, region, versX, versY)) cases.push({ x: versX, y: versY });
    }
    return cases;
  }

  /** Engage un pas dans cette direction. Faux si elle est barrée. */
  private tenterPas(jeu: Jeu, direction: Direction): boolean {
    const joueur = jeu.state.joueur;
    joueur.direction = direction;

    const { dx, dy } = DIRECTION_VECTORS[direction];
    const versX = joueur.x + dx;
    const versY = joueur.y + dy;
    const region = this.region(jeu);
    const tuile = lireTuile(region, versX, versY);

    // Un rebord ne se franchit que vers le sud, et d'un saut par-dessus la case.
    const rebord = TILES[tuile].ledge === 'sud';
    if (rebord && direction !== 'sud') return false;

    if (TILES[tuile].solid && !rebord) return false;
    if (this.entiteEn(region, versX, versY, jeu)) return false;

    const arriveeY = rebord ? versY + 1 : versY;
    if (rebord && TILES[lireTuile(region, versX, arriveeY)].solid) return false;

    this.pas = {
      depuisX: joueur.x,
      depuisY: joueur.y,
      versX,
      versY: arriveeY,
      progression: 0,
      saut: rebord,
    };
    return true;
  }

  /** L'entité qui bloque cette case, s'il y en a une. */
  private entiteEn(region: Region, x: number, y: number, jeu: Jeu): Entite | null {
    for (const entite of region.entites) {
      if (entite.x !== x || entite.y !== y) continue;
      if (entite.kind === 'objet' && objetRamasse(jeu.state, entite.id)) continue;
      if (entite.kind === 'objet') return null; // on marche dessus pour le ramasser
      return entite;
    }
    return null;
  }

  private avancerPas(jeu: Jeu, step: number): void {
    const pas = this.pas;
    if (!pas) return;
    pas.progression += step / (pas.saut ? DUREE_PAS * 1.6 : DUREE_PAS);
    this.trameMarche += step * 8;

    if (pas.progression < 1) return;

    const joueur = jeu.state.joueur;
    joueur.x = pas.versX;
    joueur.y = pas.versY;
    this.pas = null;
    this.distanceParcourue += 1;

    this.aArriveSurUneCase(jeu);

    // Poser le pied quelque part peut tout changer : une rencontre s'engage, une porte
    // mène ailleurs, un panneau se met à parler. Le reste du trajet n'a alors plus de
    // sens — il a été tracé sur une région, et parfois même sur une autre.
    if (jeu.dialogue.actif || jeu.sommet !== this) {
      this.abandonnerChemin();
      return;
    }
    if (this.chemin.length === 0) this.acheverChemin(jeu);
  }

  // ── Ce qui se déclenche en posant le pied ──────────────────────────────────

  private aArriveSurUneCase(jeu: Jeu): void {
    const region = this.region(jeu);
    const joueur = jeu.state.joueur;

    const sortie = region.sorties.find((candidate) => candidate.x === joueur.x && candidate.y === joueur.y);
    if (sortie) {
      // Une arène se franchit, elle ne se contourne pas : sans son badge, la porte du
      // fond reste close. C'est ce qui fait des champions des paliers plutôt que des
      // combats facultatifs — et ce qui donne enfin un rôle à `progression.badges`.
      if (sortie.cote === 'nord' && region.typeArene && !aBadge(jeu.state, badgeDe(region.typeArene))) {
        // Le sanctuaire mérite son propre refus : c'est la dernière porte du jeu, pas
        // une arène de plus sur la route.
        const versSanctuaire = jeu.monde.plans[sortie.vers]?.role === 'sanctuaire';
        jeu.dialogue.dire(
          versSanctuaire
            ? jeu.t('monde.sanctuaireScelle')
            : jeu.t('monde.arenePortesCloses', { type: jeu.nomType(region.typeArene) }),
        );
        return;
      }
      this.changerDeRegion(jeu, sortie.vers, sortie.cote);
      return;
    }

    const objet = region.entites.find(
      (entite) => entite.kind === 'objet' && entite.x === joueur.x && entite.y === joueur.y,
    );
    if (objet && objet.kind === 'objet' && !objetRamasse(jeu.state, objet.id)) {
      marquerObjetRamasse(jeu.state, objet.id);
      const ajoutes = ajouterObjet(jeu.state, objet.item, objet.quantite);
      jeu.dialogue.dire(
        ajoutes > 0
          ? jeu.t('monde.objetTrouve', { objet: jeu.nomObjet(objet.item) })
          : jeu.t('monde.sacPlein'),
      );
      jeu.sauvegarderLocalement();
      return;
    }

    const dresseur = this.dresseurQuiRepere(jeu, region);
    if (dresseur) {
      this.engagerDresseur(jeu, dresseur);
      return;
    }

    if (TILES[lireTuile(region, joueur.x, joueur.y)].encounter) this.testerRencontre(jeu, region);
  }

  /** Un dresseur non vaincu qui a le joueur dans sa ligne de vue, sans obstacle. */
  private dresseurQuiRepere(jeu: Jeu, region: Region): Dresseur | null {
    const joueur = jeu.state.joueur;
    for (const entite of region.entites) {
      if (entite.kind !== 'dresseur') continue;
      if (dresseurVaincu(jeu.state, entite.id)) continue;

      const { dx, dy } = DIRECTION_VECTORS[entite.regard];
      for (let distance = 1; distance <= entite.vision; distance++) {
        const x = entite.x + dx * distance;
        const y = entite.y + dy * distance;
        // Le regard s'arrête au premier obstacle : un dresseur ne voit pas à travers
        // un arbre.
        if (TILES[lireTuile(region, x, y)].solid) break;
        if (x === joueur.x && y === joueur.y) return entite;
      }
    }
    return null;
  }

  private testerRencontre(jeu: Jeu, region: Region): void {
    if (equipeHorsCombat(jeu.state)) return;
    if (!jeu.rng.chance(TAUX_RENCONTRE)) return;

    // Le sanctuaire est le seul endroit où les créatures uniques se montrent, et le seul
    // à recueillir les espèces qu'aucun biome tiré n'offrait. C'est ce qui rend le
    // Terradex complétable : son compteur annonçait jusqu'ici un total que rien dans le
    // monde ne permettait d'atteindre.
    const sanctuaire = region.role === 'sanctuaire';
    const rencontre = tirerRencontre(jeu.rng, region.biome, phaseDuJour(jeu.state), region.niveaux, {
      uniques: sanctuaire,
      complement: sanctuaire ? region.complement : undefined,
    });
    if (!rencontre) return;

    const sauvage = creerCreature(jeu.rng, {
      uid: prochainIdentifiant(jeu.state),
      speciesId: rencontre.species,
      niveau: rencontre.niveau,
      origine: jeu.state.seedText,
    });
    jeu.pousser(new SceneCombat({ genre: 'sauvage', adversaires: [sauvage] }));
  }

  private engagerDresseur(jeu: Jeu, dresseur: Dresseur): void {
    if (equipeHorsCombat(jeu.state)) return;
    jeu.dialogue.dire(jeu.dialogueDe(dresseur.dialogue));
    jeu.dialogue.puis(() => {
      // Les créatures du dresseur sont tirées d'une suite dérivée de son identifiant :
      // affronter deux fois le même dresseur donne la même équipe.
      const rng = rngFor(jeu.monde.seed, dresseur.id);
      const adversaires = dresseur.equipe.map((membre) =>
        creerCreature(rng, {
          uid: `pnj-${dresseur.id}-${membre.species}-${membre.niveau}`,
          speciesId: membre.species,
          niveau: membre.niveau,
          origine: jeu.state.seedText,
        }),
      );
      jeu.pousser(new SceneCombat({ genre: 'dresseur', adversaires, dresseur }));
    });
  }

  private changerDeRegion(jeu: Jeu, vers: number, cote: 'nord' | 'sud'): void {
    this.abandonnerChemin();
    const joueur = jeu.state.joueur;
    joueur.regionIndex = vers;
    marquerRegionVisitee(jeu.state, vers);
    const cible = jeu.monde.region(vers);

    // On entre par la porte opposée : sortir au nord d'une région, c'est entrer par le
    // sud de la suivante.
    const porteOpposee = cible.sorties.find((sortie) => sortie.cote === (cote === 'nord' ? 'sud' : 'nord'));
    if (porteOpposee) {
      joueur.x = porteOpposee.x;
      joueur.y = porteOpposee.cote === 'sud' ? porteOpposee.y - 1 : porteOpposee.y + 1;
    } else {
      joueur.x = cible.depart.x;
      joueur.y = cible.depart.y;
    }
    joueur.direction = cote === 'nord' ? 'nord' : 'sud';

    // Les lieux habités servent de point de reprise après une défaite.
    if (cible.role === 'bourg' || cible.role === 'village') {
      joueur.refuge = { regionIndex: vers, x: joueur.x, y: joueur.y };
    }

    this.annoncerRegion(jeu);
    jeu.sauvegarderLocalement();
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  private interagir(jeu: Jeu): void {
    const joueur = jeu.state.joueur;
    const { dx, dy } = DIRECTION_VECTORS[joueur.direction];
    const region = this.region(jeu);
    const cible = region.entites.find(
      (entite) => entite.x === joueur.x + dx && entite.y === joueur.y + dy,
    );
    if (!cible) {
      this.tenterPeche(jeu, region, joueur.x + dx, joueur.y + dy);
      return;
    }

    switch (cible.kind) {
      case 'panneau':
        jeu.dialogue.dire(jeu.dialogueDe(cible.texte));
        break;

      case 'pnj':
        jeu.dialogue.dire(jeu.dialogueDe(cible.dialogue));
        if (cible.role === 'professeur' && !aDrapeau(jeu.state, 'conseilProfesseur')) {
          poserDrapeau(jeu.state, 'conseilProfesseur');
          jeu.dialogue.dire(jeu.t('titre.seed', { seed: jeu.state.seedText }));
        }
        break;

      case 'service':
        if (cible.service === 'soin') this.proposerSoin(jeu);
        else this.ouvrirBoutique(jeu);
        break;

      case 'dresseur':
        if (dresseurVaincu(jeu.state, cible.id)) jeu.dialogue.dire(jeu.dialogueDe(cible.dialogueVaincu));
        else this.engagerDresseur(jeu, cible);
        break;

      case 'objet':
        // Un objet au sol se ramasse en marchant dessus, pas en lui parlant.
        break;
    }
  }

  /**
   * Pêche : le second mode de rencontre.
   *
   * La canne promettait la pêche depuis le début sans qu'aucun code ne la lise. Elle
   * ouvre la faune de rivière **partout où il y a de l'eau**, et pas seulement dans les
   * régions de ce biome — la plupart des régions ont un étang ou un ruisseau qui, jusque
   * là, ne servait qu'à barrer le passage.
   */
  private tenterPeche(jeu: Jeu, region: Region, x: number, y: number): void {
    if (lireTuile(region, x, y) !== 'eau') return;
    if (quantite(jeu.state, 'canne') === 0) {
      jeu.dialogue.dire(jeu.t('monde.eauSansCanne'));
      return;
    }
    if (equipeHorsCombat(jeu.state)) {
      jeu.dialogue.dire(jeu.t('monde.equipeVide'));
      return;
    }

    jeu.dialogue.dire(jeu.t('monde.pecheLance'));
    jeu.dialogue.puis(() => {
      const rencontre = jeu.rng.chance(TAUX_PECHE)
        ? tirerRencontre(jeu.rng, 'riviere', phaseDuJour(jeu.state), region.niveaux)
        : null;
      if (!rencontre) {
        jeu.dialogue.dire(jeu.t('monde.pecheRien'));
        return;
      }
      const prise = creerCreature(jeu.rng, {
        uid: prochainIdentifiant(jeu.state),
        speciesId: rencontre.species,
        niveau: rencontre.niveau,
        origine: jeu.state.seedText,
      });
      jeu.pousser(new SceneCombat({ genre: 'sauvage', adversaires: [prise] }));
    });
  }

  private proposerSoin(jeu: Jeu): void {
    void jeu.dialogue
      .demander(jeu.t('soin.propose'), [jeu.t('depart.oui'), jeu.t('depart.non')])
      .then((choix) => {
        if (choix !== 0) return;
        soignerEquipe(jeu.state);
        jeu.dialogue.dire(jeu.t('monde.soinFait'));
        jeu.sauvegarderLocalement();
      });
  }

  private ouvrirBoutique(jeu: Jeu): void {
    // Le rayon s'étoffe avec les badges : le Prisme Royal et la Pierre d'Éveil n'ont rien
    // à faire sur l'étal du bourg de départ.
    const stock = stockBoutique(jeu.state.progression.badges.length);
    const libelles = stock.map(
      (item) => `${jeu.nomObjet(item)}  ${jeu.t('boutique.pieces', { pieces: ITEMS[item].prix })}`,
    );
    void jeu.dialogue
      .demander(jeu.t('boutique.titre'), [...libelles, jeu.t('boutique.quitter')])
      .then((choix) => {
        const item = stock[choix];
        if (!item) return;
        const resultat = acheter(jeu.state, item, 1);
        jeu.dialogue.dire(
          resultat.achete
            ? jeu.t('monde.acheteOk', { objet: jeu.nomObjet(item), quantite: 1 })
            : jeu.t('monde.pasAssez', { manque: resultat.manque }),
        );
        if (resultat.achete) jeu.sauvegarderLocalement();
        jeu.dialogue.puis(() => this.ouvrirBoutique(jeu));
      });
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  /**
   * Coin haut-gauche de la vue, en pixels de région.
   *
   * La caméra suit le joueur mais s'arrête aux bords : on ne montre jamais le vide autour
   * de la carte. Le rendu et la lecture du pointeur l'appellent tous les deux — c'est ce
   * décalage qui relie un point de l'écran à une case du monde, et il ne doit exister
   * qu'en un seul exemplaire.
   */
  private camera(jeu: Jeu): { x: number; y: number } {
    const region = this.region(jeu);
    const joueur = jeu.state.joueur;
    const { pixelX, pixelY } = this.positionPixel(joueur.x, joueur.y);
    return {
      x: Math.max(
        0,
        Math.min(region.width * TILE_SIZE - VIRTUAL_WIDTH, pixelX + TILE_SIZE / 2 - VIRTUAL_WIDTH / 2),
      ),
      y: Math.max(
        0,
        Math.min(region.height * TILE_SIZE - VIRTUAL_HEIGHT, pixelY + TILE_SIZE / 2 - VIRTUAL_HEIGHT / 2),
      ),
    };
  }

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const region = this.region(jeu);
    const joueur = jeu.state.joueur;

    const { pixelX, pixelY } = this.positionPixel(joueur.x, joueur.y);
    const { x: cameraX, y: cameraY } = this.camera(jeu);

    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, COULEURS.fond);

    const trameEau = Math.floor(performance.now() / 320);
    const premiereColonne = Math.floor(cameraX / TILE_SIZE);
    const premiereLigne = Math.floor(cameraY / TILE_SIZE);
    const colonnes = Math.ceil(VIRTUAL_WIDTH / TILE_SIZE) + 1;
    const lignes = Math.ceil(VIRTUAL_HEIGHT / TILE_SIZE) + 1;

    for (let ligne = 0; ligne < lignes; ligne++) {
      for (let colonne = 0; colonne < colonnes; colonne++) {
        const x = premiereColonne + colonne;
        const y = premiereLigne + ligne;
        peintre.tuile(lireTuile(region, x, y), trameEau, x * TILE_SIZE - cameraX, y * TILE_SIZE - cameraY);
      }
    }

    // La case sous la souris, puis la destination du trajet en cours. La première dit
    // ce qu'un clic ferait, la seconde où l'on a déjà envoyé le personnage — sans elle,
    // une marche automatique ressemble à un jeu qui décide tout seul.
    const visee = jeu.entrees.tactile ? null : this.caseVisee(jeu);
    const destination = this.aInteragirEn ?? this.chemin[this.chemin.length - 1] ?? null;
    for (const [repere, couleur] of [
      [destination, COULEURS.texteAccent],
      [visee, COULEURS.selection],
    ] as const) {
      if (!repere) continue;
      peintre.contour(
        repere.x * TILE_SIZE - cameraX,
        repere.y * TILE_SIZE - cameraY,
        TILE_SIZE,
        TILE_SIZE,
        couleur,
      );
    }

    // Entités puis joueur, triés par ordonnée : ce qui est plus bas passe devant.
    const aDessiner = region.entites
      .filter((entite) => !(entite.kind === 'objet' && objetRamasse(jeu.state, entite.id)))
      .map((entite) => ({ entite, y: entite.y }))
      .concat([{ entite: null as unknown as Entite, y: joueur.y }])
      .sort((a, b) => a.y - b.y);

    for (const { entite } of aDessiner) {
      if (!entite) {
        peintre.personnage(
          'heros',
          joueur.direction,
          this.trameActuelle(),
          pixelX - cameraX,
          pixelY - cameraY - 4 - this.hauteurSaut(),
        );
        continue;
      }
      const x = entite.x * TILE_SIZE - cameraX;
      const y = entite.y * TILE_SIZE - cameraY;
      if (entite.kind === 'objet') peintre.icone(entite.item, x, y);
      else if ('sprite' in entite) peintre.personnage(entite.sprite, regardDe(entite), 0, x, y - 4);
    }

    const voile = VOILES[phaseDuJour(jeu.state)];
    if (voile) peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, voile);

    this.dessinerBandeau(jeu);
    jeu.dialogue.dessiner();
  }

  private positionPixel(x: number, y: number): { pixelX: number; pixelY: number } {
    if (!this.pas) return { pixelX: x * TILE_SIZE, pixelY: y * TILE_SIZE };
    const t = Math.min(1, this.pas.progression);
    return {
      pixelX: (this.pas.depuisX + (this.pas.versX - this.pas.depuisX) * t) * TILE_SIZE,
      pixelY: (this.pas.depuisY + (this.pas.versY - this.pas.depuisY) * t) * TILE_SIZE,
    };
  }

  /** Cloche du saut de rebord : le personnage s'élève puis retombe. */
  private hauteurSaut(): number {
    if (!this.pas?.saut) return 0;
    return Math.round(Math.sin(Math.min(1, this.pas.progression) * Math.PI) * 7);
  }

  private trameActuelle(): number {
    return this.pas ? 1 + (Math.floor(this.trameMarche) % 2) : 0;
  }

  private dessinerBandeau(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const heures = Math.floor(jeu.state.horloge.minutes / 60);
    const minutes = Math.floor(jeu.state.horloge.minutes % 60);
    // L'heure seule ne disait rien : c'est la **phase** qui décide de ce qu'on croise, et
    // son nom n'apparaissait nulle part. Un joueur ne pouvait pas relier « il est 21 h »
    // à « les créatures nocturnes sortent ».
    const phase = phaseDuJour(jeu.state);
    const heure = `${jeu.t(`heure.${phase}` as CleTexte)}  ${String(heures).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    peintre.texteDroite(heure, VIRTUAL_WIDTH - 4, 3, { couleur: COULEURS.texteInverse, ombre: true });

    if (this.annonce) {
      const largeur = peintre.largeurTexte(this.annonce.texte) + 16;
      peintre.panneau(4, 3, largeur, 18);
      peintre.texte(this.annonce.texte, 12, 7);
    }
  }
}

function regardDe(entite: Entite): Direction {
  return entite.kind === 'dresseur' ? entite.regard : 'sud';
}

