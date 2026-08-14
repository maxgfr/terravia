/**
 * Menu de pause : équipe, réserve, sac, Terradex, sauvegarde.
 *
 * Il se pose **au-dessus** du monde sans l'effacer — la scène n'est pas opaque, donc
 * l'overworld reste visible derrière un voile. Le joueur ne perd jamais de vue où il se
 * trouve.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { ITEMS } from '../data/items.ts';
import { MOVES } from '../data/moves.ts';
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species.ts';
import { BIOME_NAMES } from '../data/biomes.ts';
import { ELEMENT_TYPES, effectivenessAgainst, type ElementType } from '../data/types.ts';
import { BATTLE_STATS, STAT_KEYS, experienceForLevel } from '../data/stats.ts';
import { TALENTS } from '../data/talents.ts';
import { evoluer, pvMax, statistique, type CreatureInstance } from '../game/creature.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import {
  TAILLE_EQUIPE,
  deplacerDansEquipe,
  deposerEnReserve,
  quantite,
  retirerObjet,
  echangerAvecReserve,
  retirerDeReserve,
  sacTrie,
  tailleTerradex,
  tempsJoue,
  typesDesBadges,
  utiliserObjetSur,
} from '../game/state.ts';
import { exporterCreature, exporterPartie, nomFichier } from '../save/serialize.ts';
import { choisirFichier, lirePressePapiers, telecharger } from '../save/storage.ts';
import { COULEURS } from '../ui/draw.ts';
import { viser, type Colonne } from '../ui/liste.ts';
import { makeSeedText } from '../core/rng.ts';
import { SceneCarte } from './carte.ts';
import { SceneAide } from './aide.ts';
import { SceneEncyclopedie } from './encyclopedie.ts';
import { SceneTitre } from './titre.ts';
import { importerCreatureSeule, importerPartieSeule, traiterImport } from './partie.ts';

/** Lignes de réserve affichées d'un coup dans la colonne de droite, selon la place. */
function lignesReserve(): number {
  return Math.max(4, Math.floor((VIRTUAL_HEIGHT - 60) / 13));
}

/**
 * Objets visibles d'un coup dans le sac.
 *
 * La description du bas mange trente-quatre pixels : ce sont les lignes restantes qui
 * se comptent ici. Cliquer une ligne exige de savoir laquelle est dessinée — d'où ce
 * calcul sorti du rendu.
 */
const HAUTEUR_DESCRIPTION_SAC = 34;
function lignesSac(): number {
  return Math.max(3, Math.floor((VIRTUAL_HEIGHT - 60 - HAUTEUR_DESCRIPTION_SAC) / 13));
}

/** Espèces visibles d'un coup dans le Terradex. */
function lignesTerradex(): number {
  return Math.max(6, Math.floor((VIRTUAL_HEIGHT - 58) / 12));
}

/**
 * Les types qui frappent fort cette combinaison, et ceux qu'elle encaisse.
 *
 * Le calcul porte sur la combinaison entière, pas type par type : un Onde/Métal résiste
 * à ce que ses deux types résistent, et une double faiblesse annule une résistance.
 * C'est ce que le joueur subit réellement en combat.
 */
function faiblessesDe(types: readonly ElementType[]): ElementType[] {
  return ELEMENT_TYPES.filter((attaque) => effectivenessAgainst(attaque, types) > 1);
}

function resistancesDe(types: readonly ElementType[]): ElementType[] {
  return ELEMENT_TYPES.filter((attaque) => effectivenessAgainst(attaque, types) < 1);
}

type Onglet = 'racine' | 'equipe' | 'fiche' | 'reserve' | 'sac' | 'terradex' | 'espece' | 'sauvegarde';

/**
 * Tout au même niveau, groupé par ce à quoi ça sert.
 *
 * Les réglages vivaient dans un écran poussé par-dessus celui-ci : un menu dans un menu,
 * pour quatre entrées qui tiennent ici. La langue se bascule sur place, le reste ouvre un
 * écran qui a sa raison d'être — l'aide, l'encyclopédie.
 *
 * L'ordre suit trois blocs : ce qu'on emporte, ce qu'on consulte, ce qui touche à la
 * partie elle-même. L'encyclopédie et l'aide suivent donc le Terradex, avec lequel elles
 * forment la documentation du jeu, et la langue descend contre « Fermer », loin de ce
 * qu'on ouvre en cours de partie.
 */
export const ENTREES_RACINE = [
  'menu.equipe',
  'menu.reserve',
  'menu.sac',
  'menu.carte',
  'menu.terradex',
  'encyclopedie.titre',
  'parametres.commentJouer',
  'menu.sauvegarde',
  'parametres.recommencer',
  'parametres.langue',
  'menu.fermer',
] as const;
/**
 * Chaque export en face de son import.
 *
 * « Exporter une créature » n'avait pas de contrepartie : l'import de créature existait
 * — la porte permissive l'accepte depuis toujours — mais rien dans le menu ne le disait,
 * et un joueur qui reçoit une créature d'un ami n'a pas à deviner qu'elle entre par
 * l'entrée nommée « partie ».
 */
export const ENTREES_SAUVEGARDE = [
  'sauvegarde.maintenant',
  'sauvegarde.exporter',
  'sauvegarde.importer',
  // Le README promettait l'import « en collant du JSON brut » depuis le début, et le
  // lecteur de presse-papiers existait — appelé de nulle part. C'est la seule voie
  // d'entrée quand on reçoit une sauvegarde dans un message plutôt qu'en pièce jointe.
  'sauvegarde.coller',
  'sauvegarde.exporterCreature',
  'sauvegarde.importerCreature',
  'menu.retour',
] as const;

export class SceneMenu implements Scene {
  readonly nom = 'menu';

  private onglet: Onglet = 'racine';
  private selection = 0;
  private fiche: CreatureInstance | null = null;
  /** Espèce dont la fiche du Terradex est ouverte. */
  private especeVue: SpeciesId | null = null;
  private defilement = 0;
  /** Colonne active de l'écran de réserve, et curseur de la colonne de droite. */
  private cote: 'equipe' | 'reserve' = 'equipe';
  private selectionReserve = 0;
  /** Rang de la créature soulevée dans l'onglet Équipe, ou `null` si rien n'est porté. */
  private porte: number | null = null;

  mettreAJour(jeu: Jeu, step: number): void {
    if (jeu.dialogue.actif) {
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }

    switch (this.onglet) {
      case 'racine':
        this.racine(jeu);
        break;
      case 'equipe':
        this.equipe(jeu);
        break;
      case 'fiche':
        // Écran de lecture : rien à y choisir, donc n'importe quel clic le referme.
        if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('valider') || jeu.entrees.cliquePresse()) {
          this.aller('equipe');
        }
        break;
      case 'reserve':
        this.reserve(jeu);
        break;
      case 'sac':
        this.sac(jeu);
        break;
      case 'terradex':
        this.terradex(jeu);
        break;
      case 'espece':
        this.espece(jeu);
        break;
      case 'sauvegarde':
        this.sauvegarde(jeu);
        break;
    }
  }

  private aller(onglet: Onglet): void {
    this.onglet = onglet;
    this.selection = 0;
    this.defilement = 0;
    this.cote = 'equipe';
    this.selectionReserve = 0;
    // Quitter l'onglet repose toujours ce qu'on y portait : une créature restée en main
    // reprendrait sa course au retour, sur un curseur qui a bougé entre-temps.
    this.porte = null;
  }

  private naviguer(jeu: Jeu, nombre: number): void {
    if (nombre === 0) return;
    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + 1) % nombre;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - 1 + nombre) % nombre;
  }

  /**
   * Le pointeur sur une liste : il déplace la sélection, et son clic la valide.
   *
   * Renvoie ce que renvoyait jusqu'ici `pressee('valider')` seul, si bien que chaque
   * écran garde son code d'action inchangé — il gagne une seconde façon d'y arriver.
   */
  private validee(jeu: Jeu, colonne: Colonne): boolean {
    const { survol, valide } = viser(jeu.entrees, colonne);
    if (survol !== null) this.selection = survol;
    return jeu.entrees.pressee('valider') || valide;
  }

  /** Géométrie des listes dessinées par `ligne()` : le menu et l'onglet Sauvegarde. */
  private colonneStandard(nombre: number): Colonne {
    return { x: 14, largeur: VIRTUAL_WIDTH - 30, y: 31, pas: 14, lignes: nombre };
  }

  private racine(jeu: Jeu): void {
    this.naviguer(jeu, ENTREES_RACINE.length);
    if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('menu')) {
      jeu.retirer();
      return;
    }
    if (!this.validee(jeu, this.colonneStandard(ENTREES_RACINE.length))) return;

    switch (ENTREES_RACINE[this.selection]) {
      case 'menu.equipe':
        this.aller('equipe');
        break;
      case 'menu.reserve':
        this.aller('reserve');
        break;
      case 'menu.sac':
        this.aller('sac');
        break;
      case 'menu.carte':
        // La carte est un objet, pas un droit acquis : elle attend au bourg. Sans elle,
        // l'entrée du menu ne menait nulle part — et l'objet ne servait à rien.
        if (quantite(jeu.state, 'carte') === 0) {
          jeu.dialogue.dire(jeu.t('menu.sansCarte'));
          break;
        }
        jeu.pousser(new SceneCarte());
        break;
      case 'menu.terradex':
        this.aller('terradex');
        break;
      case 'menu.sauvegarde':
        this.aller('sauvegarde');
        break;
      case 'parametres.langue': {
        // Bascule circulaire, sur place : avec deux langues c'est un aller-retour.
        jeu.basculerLangue();
        break;
      }
      case 'encyclopedie.titre':
        jeu.pousser(new SceneEncyclopedie());
        break;
      case 'parametres.commentJouer':
        jeu.pousser(new SceneAide());
        break;
      case 'parametres.recommencer':
        void this.retournerAuTitre(jeu);
        break;
      default:
        jeu.retirer();
    }
  }

  /**
   * L'équipe : on y lit une fiche, et on y range l'ordre de bataille.
   *
   * L'ordre décide qui part au combat en premier et dans quel ordre les remplaçants se
   * présentent quand une créature tombe. Il ne se changeait que par des allers-retours
   * en réserve, et encore, par accident.
   *
   * Deux voies vers le même geste, parce que le jeu se joue au clavier, au doigt et à la
   * souris. Au clavier on soulève une créature et elle suit le curseur — c'est ce qui
   * rend un déplacement de cinq rangs lisible pendant qu'il se fait. À la souris, deux
   * flèches sur la ligne survolée la montent ou la descendent d'un cran, sans mode à
   * retenir. Les deux appellent `deplacerDansEquipe`.
   */
  private equipe(jeu: Jeu): void {
    const equipe = jeu.state.equipe;

    // Une créature portée suit le curseur au lieu de le laisser filer sans elle.
    if (this.porte !== null) {
      const avant = this.selection;
      this.naviguer(jeu, equipe.length);
      // Le tour de liste ne porte pas : passer du dernier rang au premier ferait
      // traverser toute l'équipe d'un cran, ce que personne ne demande en poussant vers
      // le bas. On repose plutôt la créature là où elle est.
      const pas = this.selection - avant;
      if (pas === 1 || pas === -1) {
        deplacerDansEquipe(jeu.state, avant, this.selection);
        this.porte = this.selection;
      } else if (pas !== 0) {
        this.selection = avant;
      }
      if (jeu.entrees.pressee('valider') || jeu.entrees.pressee('annuler') || jeu.entrees.pressee('est')) {
        this.porte = null;
      }
      return;
    }

    this.naviguer(jeu, equipe.length);
    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    if (jeu.entrees.pressee('est') && equipe.length > 1) {
      this.porte = this.selection;
      return;
    }

    // Les deux flèches de rangement, sur la ligne survolée : c'est la seule voie qui
    // reste à une souris, où « soulever » n'a pas de geste évident.
    const range = this.flechesOrdre(jeu, equipe.length);
    if (range) return;

    // Les vignettes de l'équipe font vingt-six pixels de haut : c'est là qu'on clique
    // une créature pour ouvrir sa fiche.
    if (this.validee(jeu, this.colonneEquipe(equipe.length))) {
      this.fiche = equipe[this.selection] ?? null;
      if (this.fiche) this.onglet = 'fiche';
    }
  }

  /** Géométrie des vignettes de l'équipe, partagée entre le dessin et le clic. */
  private colonneEquipe(nombre: number): Colonne {
    return { x: 14, largeur: VIRTUAL_WIDTH - 30, y: 28, pas: 26, lignes: nombre };
  }

  /**
   * Position des deux flèches de rangement d'une ligne d'équipe.
   *
   * Une seule source pour le dessin et pour le clic : deux jeux de coordonnées qui se
   * ressemblent finissent toujours par diverger, et un bouton qui ne réagit pas là où il
   * est peint ne se diagnostique pas à l'œil.
   */
  private boutonOrdre(index: number, sens: 'haut' | 'bas'): { x: number; y: number; largeur: number; hauteur: number } {
    return {
      x: VIRTUAL_WIDTH - 34,
      y: 30 + index * 26 + (sens === 'haut' ? 0 : 11),
      largeur: 12,
      hauteur: 11,
    };
  }

  /**
   * Une flèche de rangement n'existe que là où elle mène quelque part.
   *
   * Le premier rang n'a rien au-dessus, le dernier rien en dessous, et une équipe d'une
   * seule créature n'a rien à ranger. Le dessin et le clic lisent cette règle au même
   * endroit : une flèche peinte sans zone active, ou l'inverse, ne se voit pas à l'œil.
   */
  private flecheVisible(index: number, sens: 'haut' | 'bas', nombre: number): boolean {
    if (nombre <= 1) return false;
    return sens === 'haut' ? index > 0 : index < nombre - 1;
  }

  /** Traite un clic sur une flèche de rangement. Vrai si le clic lui revenait. */
  private flechesOrdre(jeu: Jeu, nombre: number): boolean {
    for (let index = 0; index < nombre; index++) {
      for (const sens of ['haut', 'bas'] as const) {
        if (!this.flecheVisible(index, sens, nombre)) continue;
        const zone = this.boutonOrdre(index, sens);
        if (!jeu.clique(zone.x, zone.y, zone.largeur, zone.hauteur)) continue;
        const vers = sens === 'haut' ? index - 1 : index + 1;
        if (deplacerDansEquipe(jeu.state, index, vers)) this.selection = vers;
        return true;
      }
    }
    return false;
  }

  /**
   * Réserve : l'équipe à gauche, ce qui dort à droite.
   *
   * Un seul curseur actif, et « valider » fait toujours traverser la créature visée.
   * À droite, quand l'équipe est pleine, elle prend la place de celle qui est
   * surlignée à gauche — les deux curseurs restent donc dessinés en permanence, sans
   * quoi l'échange partirait vers une cible invisible.
   */
  private reserve(jeu: Jeu): void {
    const equipe = jeu.state.equipe;
    const reserve = jeu.state.reserve;

    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    if (jeu.entrees.pressee('est') && reserve.length > 0) this.cote = 'reserve';
    if (jeu.entrees.pressee('ouest')) this.cote = 'equipe';

    // Le pointeur choisit la colonne en même temps que la ligne : passer de l'équipe à
    // la réserve ne lui demande pas de toucher aux flèches.
    const colonnes = this.colonnesReserve(jeu);
    const gauche = viser(jeu.entrees, colonnes.gauche);
    const droite = viser(jeu.entrees, colonnes.droite);
    if (gauche.survol !== null) {
      this.cote = 'equipe';
      this.selection = gauche.survol;
    }
    if (droite.survol !== null) {
      this.cote = 'reserve';
      this.selectionReserve = droite.survol;
    }

    if (this.cote === 'equipe') {
      this.naviguer(jeu, equipe.length);
      if (!jeu.entrees.pressee('valider') && !gauche.valide) return;
      if (!deposerEnReserve(jeu.state, this.selection)) {
        jeu.dialogue.dire(jeu.t('menu.equipeMinimale'));
        return;
      }
      this.selection = Math.min(this.selection, equipe.length - 1);
      jeu.sauvegarderLocalement();
      return;
    }

    if (reserve.length === 0) {
      this.cote = 'equipe';
      return;
    }
    if (jeu.entrees.pressee('sud')) this.selectionReserve = (this.selectionReserve + 1) % reserve.length;
    if (jeu.entrees.pressee('nord')) {
      this.selectionReserve = (this.selectionReserve - 1 + reserve.length) % reserve.length;
    }
    this.defilement = Math.max(0, Math.min(this.selectionReserve - lignesReserve() + 1, reserve.length - lignesReserve()));
    if (!jeu.entrees.pressee('valider') && !droite.valide) return;

    const nom = jeu.nomCreature(reserve[this.selectionReserve]!);
    if (equipe.length < TAILLE_EQUIPE) {
      retirerDeReserve(jeu.state, this.selectionReserve);
      jeu.dialogue.dire(jeu.t('menu.rejointEquipe', { nom }));
    } else {
      echangerAvecReserve(jeu.state, this.selection, this.selectionReserve);
      jeu.dialogue.dire(jeu.t('menu.echange', { nom }));
    }
    this.selectionReserve = Math.min(this.selectionReserve, Math.max(0, jeu.state.reserve.length - 1));
    if (jeu.state.reserve.length === 0) this.cote = 'equipe';
    jeu.sauvegarderLocalement();
  }

  private sac(jeu: Jeu): void {
    const objets = sacTrie(jeu.state);
    this.naviguer(jeu, objets.length);
    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    const colonne: Colonne = {
      x: 14,
      largeur: VIRTUAL_WIDTH - 30,
      y: 29,
      pas: 13,
      lignes: Math.min(objets.length, lignesSac()),
    };
    if (!this.validee(jeu, colonne)) return;

    const choisi = objets[this.selection];
    if (!choisi) return;
    const effet = ITEMS[choisi.item].effet;
    if (effet.kind === 'evolution') {
      this.utiliserPierre(jeu, choisi.item);
      return;
    }
    if (effet.kind !== 'soin' && effet.kind !== 'guerison') return;

    // On applique sur la première créature que l'objet peut réellement aider : proposer
    // une cible qui n'en a pas besoin gaspillerait l'objet.
    const cible = jeu.state.equipe.find(
      (membre) => utiliserObjetSurEssai(choisi.item, membre),
    );
    if (!cible) {
      jeu.dialogue.dire(jeu.t('menu.vide'));
      return;
    }
    const resultat = utiliserObjetSur(jeu.state, choisi.item, cible);
    if (resultat.utilise) {
      jeu.dialogue.dire(jeu.t('combat.soin', { nom: jeu.nomCreature(cible) }));
      jeu.sauvegarderLocalement();
    }
  }

  /**
   * La Pierre d'Éveil, sur une créature choisie.
   *
   * Contrairement à une potion — qu'on applique sur la première créature qu'elle peut
   * aider — une évolution est un choix qu'on ne défait pas. On la demande donc, au lieu
   * de la deviner.
   */
  private utiliserPierre(jeu: Jeu, item: keyof typeof ITEMS): void {
    const eligibles = jeu.state.equipe.filter((membre) => SPECIES[membre.speciesId].evolution);
    if (eligibles.length === 0) {
      jeu.dialogue.dire(jeu.t('menu.aucuneEvolution'));
      return;
    }

    void jeu.dialogue
      .demander(jeu.t('menu.pierreQui'), [
        ...eligibles.map((membre) => jeu.nomCreature(membre)),
        jeu.t('menu.retour'),
      ])
      .then((choix) => {
        const cible = eligibles[choix];
        if (!cible) return;
        const evolution = SPECIES[cible.speciesId].evolution;
        if (!evolution) return;

        const index = jeu.state.equipe.indexOf(cible);
        const avant = SPECIES[cible.speciesId].nom[jeu.langue];
        jeu.state.equipe[index] = evoluer(cible, evolution.vers);
        retirerObjet(jeu.state, item);
        jeu.dialogue.dire(
          jeu.t('combat.evolue', { nom: avant, evolution: jeu.nomEspece(evolution.vers) }),
        );
        jeu.sauvegarderLocalement();
      });
  }

  /**
   * Retour à l'écran-titre, après confirmation. La partie n'est pas perdue : elle vient
   * d'être écrite, et « Continuer » la retrouvera.
   */
  private async retournerAuTitre(jeu: Jeu): Promise<void> {
    jeu.sauvegarderLocalement();
    const choix = await jeu.dialogue.demander(jeu.t('parametres.confirmerTitre'), [
      jeu.t('depart.oui'),
      jeu.t('depart.non'),
    ]);
    if (choix !== 0) return;
    jeu.remplacer(new SceneTitre(makeSeedText(jeu.rng.next())));
  }

  private terradex(jeu: Jeu): void {
    this.naviguer(jeu, SPECIES_IDS.length);
    const lignes = lignesTerradex();
    this.defilement = Math.max(0, Math.min(this.selection - lignes + 4, SPECIES_IDS.length - lignes));
    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    // La liste défile : la colonne cliquable part de l'espèce en haut de l'écran, pas
    // de la première du Terradex.
    const colonne: Colonne = {
      x: 14,
      largeur: VIRTUAL_WIDTH - 30,
      y: 27,
      pas: 12,
      lignes: Math.min(lignes, SPECIES_IDS.length - this.defilement),
      depuis: this.defilement,
    };
    // On n'ouvre la fiche que d'une espèce déjà croisée : le Terradex ne dévoile pas
    // ce qu'on n'a pas rencontré, c'est tout son intérêt.
    if (!this.validee(jeu, colonne)) return;
    const species = SPECIES_IDS[this.selection];
    if (species && jeu.state.progression.terradexVus.includes(species)) {
      this.especeVue = species;
      this.onglet = 'espece';
    }
  }

  /**
   * Fiche d'une espèce rencontrée : à quoi elle ressemble, ce qui la met en danger, ce
   * qu'elle encaisse.
   *
   * Le Terradex n'était qu'une liste de noms. La table des types est pourtant le cœur
   * des combats, et rien dans le jeu ne permettait de la consulter — il fallait la
   * deviner coup par coup.
   */
  private espece(jeu: Jeu): void {
    if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('valider') || jeu.entrees.cliquePresse()) {
      this.onglet = 'terradex';
    }
  }

  private sauvegarde(jeu: Jeu): void {
    this.naviguer(jeu, ENTREES_SAUVEGARDE.length);
    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    if (!this.validee(jeu, this.colonneStandard(ENTREES_SAUVEGARDE.length))) return;

    switch (ENTREES_SAUVEGARDE[this.selection]) {
      case 'sauvegarde.maintenant':
        // L'écriture est automatique et muette. Une confirmation explicite est le seul
        // moyen pour le joueur de savoir que sa partie est à l'abri avant de fermer.
        jeu.dialogue.dire(
          jeu.sauvegarderLocalement() ? jeu.t('sauvegarde.enregistree') : jeu.t('sauvegarde.impossible'),
        );
        break;
      case 'sauvegarde.exporter': {
        const horodatage = new Date().toISOString();
        telecharger(exporterPartie(jeu.state, horodatage), nomFichier(jeu.state, horodatage));
        jeu.dialogue.dire(jeu.t('sauvegarde.exportee'));
        break;
      }
      case 'sauvegarde.importer':
        void this.choisirEtImporter(jeu, importerPartieSeule);
        break;
      case 'sauvegarde.coller':
        void this.collerEtImporter(jeu);
        break;
      case 'sauvegarde.exporterCreature':
        this.exporterUneCreature(jeu);
        break;
      case 'sauvegarde.importerCreature':
        void this.choisirEtImporter(jeu, importerCreatureSeule);
        break;
      default:
        this.aller('racine');
    }
  }

  /**
   * Lit le presse-papiers et le traite comme un fichier déposé.
   *
   * `traiterImport` trie lui-même partie et créature : coller n'a pas à choisir sa porte,
   * pas plus que déposer un fichier sur la page.
   */
  private async collerEtImporter(jeu: Jeu): Promise<void> {
    const contenu = await lirePressePapiers();
    if (contenu === null || contenu.trim().length === 0) {
      jeu.dialogue.dire(jeu.t('sauvegarde.pressePapiersVide'));
      return;
    }
    traiterImport(jeu, contenu);
  }

  /** Ouvre le sélecteur de fichiers, et confie ce qu'on en tire à la porte annoncée. */
  private async choisirEtImporter(
    jeu: Jeu,
    porte: (jeu: Jeu, contenu: string) => void,
  ): Promise<void> {
    const contenu = await choisirFichier();
    if (contenu === null) return;
    porte(jeu, contenu);
  }

  /**
   * Exporter une créature, mais laquelle ?
   *
   * L'export partait sur la première de l'équipe sans le demander : c'était la seule
   * qu'on pouvait échanger, et rien ne l'annonçait. La question se pose donc, comme
   * pour la Pierre d'Éveil.
   *
   * Sur l'équipe seule : la boîte de dialogue grandit avec ses options et ne défile
   * pas — six créatures et « Retour » tiennent dans la hauteur minimale, une réserve
   * que rien ne borne n'y tiendrait pas. Elle se traverse par l'écran Réserve.
   */
  private exporterUneCreature(jeu: Jeu): void {
    const equipe = jeu.state.equipe;
    if (equipe.length === 0) return;
    void jeu.dialogue
      .demander(jeu.t('sauvegarde.exporterQui'), [
        ...equipe.map((membre) => jeu.nomCreature(membre)),
        jeu.t('menu.retour'),
      ])
      .then((choix) => {
        const creature = equipe[choix];
        if (!creature) return;
        telecharger(
          exporterCreature(creature, new Date().toISOString()),
          `terravia-${creature.speciesId}-${creature.uid}.json`,
        );
        jeu.dialogue.dire(jeu.t('sauvegarde.exportee'));
      });
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 'rgba(11, 15, 20, 0.72)');

    switch (this.onglet) {
      case 'racine':
        this.dessinerRacine(jeu);
        break;
      case 'equipe':
        this.dessinerEquipe(jeu);
        break;
      case 'fiche':
        this.dessinerFiche(jeu);
        break;
      case 'reserve':
        this.dessinerReserve(jeu);
        break;
      case 'sac':
        this.dessinerSac(jeu);
        break;
      case 'terradex':
        this.dessinerTerradex(jeu);
        break;
      case 'espece':
        this.dessinerEspece(jeu);
        break;
      case 'sauvegarde':
        this.dessinerSauvegarde(jeu);
        break;
    }
    jeu.dialogue.dessiner();
  }

  private cadre(jeu: Jeu, titre: string): void {
    jeu.peintre.panneau(8, 8, VIRTUAL_WIDTH - 16, VIRTUAL_HEIGHT - 16);
    jeu.peintre.texte(titre, 18, 14, { couleur: COULEURS.texteAccent });
  }

  private ligne(jeu: Jeu, libelle: string, y: number, choisi: boolean, detail?: string): void {
    if (choisi) jeu.peintre.texte('▶', 18, y, { couleur: COULEURS.selection });
    jeu.peintre.texte(libelle, 28, y, { couleur: choisi ? COULEURS.texteAccent : COULEURS.texte });
    if (detail) jeu.peintre.texteDroite(detail, VIRTUAL_WIDTH - 20, y, { couleur: COULEURS.texteAttenue });
  }

  private dessinerRacine(jeu: Jeu): void {
    this.cadre(jeu, `${jeu.state.joueur.nom} · ${jeu.t('titre.seed', { seed: jeu.state.seedText })}`);
    ENTREES_RACINE.forEach((cle, index) => {
      this.ligne(jeu, jeu.t(cle), 34 + index * 14, index === this.selection);
    });

    // Les insignes des arènes remportées : c'est le seul endroit où l'on peut voir
    // d'un coup d'œil où l'on en est de la progression.
    const insignes = typesDesBadges(jeu.state);
    const taille = jeu.peintre.tailleInsigne;
    insignes.forEach((type, index) => {
      jeu.peintre.insigne(type, VIRTUAL_WIDTH - 26 - index * (taille + 2), VIRTUAL_HEIGHT - 28);
    });

    jeu.peintre.texte(
      `${jeu.t('boutique.pieces', { pieces: jeu.state.joueur.pieces })} · ${tempsJoue(jeu.state)}`,
      18,
      VIRTUAL_HEIGHT - 24,
      { couleur: COULEURS.texteAttenue },
    );
  }

  private dessinerEquipe(jeu: Jeu): void {
    this.cadre(jeu, jeu.t('menu.equipe'));
    const peintre = jeu.peintre;

    jeu.state.equipe.forEach((membre, index) => {
      const y = 32 + index * 26;
      const choisi = index === this.selection;
      // Une créature en main se signale par un chevron qui pointe vers le bas : elle ne
      // désigne plus une ligne, elle cherche où se poser.
      const porte = this.porte === index;
      if (choisi) {
        peintre.texte(porte ? '▼' : '▶', 14, y + 6, { couleur: COULEURS.selection });
      }
      peintre.creature(membre.speciesId, 'face', 22, y - 4, { echelle: 0.5 });
      peintre.texte(jeu.nomCreature(membre), 58, y, {
        couleur: porte || choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
      peintre.texteDroite(jeu.t('fiche.niveau', { niveau: membre.niveau }), VIRTUAL_WIDTH - 40, y);
      peintre.barrePv(58, y + 12, 100, membre.pv / pvMax(membre));
      peintre.texte(`${membre.pv}/${pvMax(membre)}`, 164, y + 10, { couleur: COULEURS.texteAttenue });

      // Les deux flèches de rangement, allumées au survol. Sans elles, réordonner
      // l'équipe demandait un clavier : le jeu se joue aussi au doigt et à la souris.
      for (const sens of ['haut', 'bas'] as const) {
        if (!this.flecheVisible(index, sens, jeu.state.equipe.length)) continue;
        const zone = this.boutonOrdre(index, sens);
        const survole = jeu.survole(zone.x, zone.y, zone.largeur, zone.hauteur);
        peintre.texte(sens === 'haut' ? '▲' : '▼', zone.x + 2, zone.y, {
          couleur: survole ? COULEURS.texteAccent : COULEURS.texteAttenue,
        });
      }
    });

    peintre.texte(jeu.t(this.porte === null ? 'menu.ordreAide' : 'menu.ordrePorte'), 18, VIRTUAL_HEIGHT - 22, {
      couleur: COULEURS.texteAttenue,
    });
  }

  private dessinerFiche(jeu: Jeu): void {
    const creature = this.fiche;
    if (!creature) return;
    const species = SPECIES[creature.speciesId];
    const peintre = jeu.peintre;
    this.cadre(jeu, `${jeu.nomCreature(creature)}  ${jeu.t('fiche.niveau', { niveau: creature.niveau })}`);

    peintre.creature(creature.speciesId, 'face', 16, 28, { echelle: 0.85 });

    species.types.forEach((type, index) => {
      peintre.plaqueType(type, jeu.nomType(type), 78 + index * (peintre.largeurPlaque + 4), 30);
    });

    // Les statistiques calculées, en colonne à droite.
    //
    // La fiche disait les gènes et le dressage — les ingrédients — sans jamais donner le
    // résultat : on savait qu'un spécimen était bien né sans pouvoir dire s'il frappait
    // plus fort que son voisin. Le calcul existait pour le combat, et le joueur en était
    // le seul à ne pas y avoir accès.
    //
    // La colonne va à droite parce que c'est la seule place libre : sur deux cent huit
    // pixels de haut, tout ce qui rallongerait la fiche passerait sous le bord. Les
    // lignes de gauche se tronquent d'autant pour ne pas la percuter.
    //
    // Les points de vie ne sont pas du lot : ils ont leur barre plus bas, avec ce qu'il
    // en reste — un maximum répété en chiffres ne dirait rien de plus.
    const colonneStats = VIRTUAL_WIDTH - 96;
    BATTLE_STATS.forEach((stat, index) => {
      peintre.texte(jeu.nomStatCourt(stat), colonneStats, 30 + index * 10, {
        couleur: COULEURS.texteAttenue,
      });
      peintre.texteDroite(`${statistique(creature, stat)}`, VIRTUAL_WIDTH - 20, 30 + index * 10);
    });

    const largeurGauche = colonneStats - 78 - 8;
    peintre.texteTronque(
      `${jeu.t('fiche.talent')} : ${TALENTS[creature.talentId].nom[jeu.langue]}`,
      78,
      46,
      largeurGauche,
      { couleur: COULEURS.texteAttenue },
    );
    peintre.texteTronque(
      jeu.t('fiche.taille', { taille: species.taille.toFixed(1), poids: species.poids.toFixed(1) }),
      78,
      56,
      largeurGauche,
      { couleur: COULEURS.texteAttenue },
    );
    peintre.texteTronque(jeu.t('fiche.origine', { seed: creature.origine }), 78, 66, largeurGauche, {
      couleur: COULEURS.texteAttenue,
    });

    const bas = experienceForLevel(creature.niveau, species.croissance);
    const haut = experienceForLevel(creature.niveau + 1, species.croissance);
    peintre.texte(jeu.t('fiche.pv'), 16, 92);
    peintre.barrePv(40, 93, 110, creature.pv / pvMax(creature));
    peintre.texte(`${creature.pv}/${pvMax(creature)}`, 156, 92, { couleur: COULEURS.texteAttenue });
    peintre.texte(jeu.t('fiche.xp'), 16, 102);
    peintre.barreXp(40, 104, 110, haut > bas ? (creature.xp - bas) / (haut - bas) : 0);

    // Gènes et dressage : tout le système de statistiques repose dessus, et rien ne les
    // montrait. Deux Mulotin de niveau 20 ne sont pas interchangeables — encore
    // faut-il pouvoir le constater.
    const somme = (bloc: Record<string, number>): number =>
      STAT_KEYS.reduce((total, stat) => total + bloc[stat]!, 0);
    peintre.texte(
      `${jeu.t('fiche.genes')} ${somme(creature.genes)}  ·  ${jeu.t('fiche.dressage')} ${somme(creature.dressage)}`,
      16,
      112,
      { couleur: COULEURS.texteAttenue },
    );

    peintre.texte(jeu.t('fiche.attaques'), 16, 126, { couleur: COULEURS.texteAccent });
    creature.moves.forEach((slot, index) => {
      const move = MOVES[slot.id];
      const y = 138 + index * 12;

      // Quatre informations sur une ligne, posées de droite à gauche : les PP au bord,
      // puis les chiffres, puis la plaque de type, et le nom sur ce qui reste. Une
      // colonne fixe pour les chiffres — c'était le cas — faisait passer les noms longs
      // par-dessus, en silence : la mesure de débordement surveille l'écran, pas les
      // colonnes.
      const chiffres = `${jeu.t('fiche.puissance')} ${move.puissance || '—'}  ${jeu.t('fiche.precision')} ${
        move.precision === 0 ? jeu.t('fiche.infaillible') : move.precision
      }`;
      const droiteChiffres = VIRTUAL_WIDTH - 20 - peintre.largeurTexte('00/00') - 8;
      const nomX = 18 + peintre.largeurPlaque + 4;

      peintre.plaqueType(move.type, jeu.nomType(move.type), 18, y - 1);
      peintre.texteTronque(
        move.nom[jeu.langue],
        nomX,
        y,
        droiteChiffres - peintre.largeurTexte(chiffres) - 6 - nomX,
      );
      // Puissance et précision : sans elles, choisir une attaque à oublier se faisait
      // au nom, donc au hasard.
      peintre.texteDroite(chiffres, droiteChiffres, y, { couleur: COULEURS.texteAttenue });
      peintre.texteDroite(`${slot.pp}/${move.pp}`, VIRTUAL_WIDTH - 20, y, { couleur: COULEURS.texteAttenue });
    });

    // La description de l'espèce, quand la hauteur d'écran laisse la place sous les
    // attaques. Elle vit dans les données depuis toujours et ne s'affichait qu'au
    // Terradex, jamais sur sa propre créature.
    const apresAttaques = 138 + creature.moves.length * 12 + 6;
    if (VIRTUAL_HEIGHT - apresAttaques > 40) {
      peintre.texteBloc(species.description[jeu.langue], 16, apresAttaques, VIRTUAL_WIDTH - 40, {
        couleur: COULEURS.texteAttenue,
      });
    }

    peintre.texte(jeu.t('aide.fermer'), 18, VIRTUAL_HEIGHT - 22, { couleur: COULEURS.texteAttenue });
  }

  private dessinerReserve(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const reserve = jeu.state.reserve;
    this.cadre(jeu, jeu.t('menu.reserve'));

    const colonneDroite = Math.round(VIRTUAL_WIDTH / 2) + 4;
    peintre.texte(jeu.t('menu.equipe'), 18, 28, { couleur: COULEURS.texteAttenue });
    peintre.texte(
      `${jeu.t('menu.reserve')} ${reserve.length}`,
      colonneDroite,
      28,
      { couleur: COULEURS.texteAttenue },
    );

    jeu.state.equipe.forEach((membre, index) => {
      const choisi = this.cote === 'equipe' && index === this.selection;
      // Le curseur de gauche reste marqué même quand la main est à droite : c'est lui
      // qui désigne la créature qu'un échange remplacera.
      const cible = this.cote === 'reserve' && index === this.selection;
      const y = 42 + index * 13;
      if (choisi || cible) {
        peintre.texte('▶', 18, y, { couleur: choisi ? COULEURS.selection : COULEURS.texteAttenue });
      }
      peintre.texte(this.ligneCreature(jeu, membre), 28, y, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
    });

    if (reserve.length === 0) {
      peintre.texte(jeu.t('menu.reserveVide'), colonneDroite, 42, { couleur: COULEURS.texteAttenue });
    } else {
      reserve.slice(this.defilement, this.defilement + lignesReserve()).forEach((membre, ligne) => {
        const index = this.defilement + ligne;
        const choisi = this.cote === 'reserve' && index === this.selectionReserve;
        const y = 42 + ligne * 13;
        if (choisi) peintre.texte('▶', colonneDroite - 10, y, { couleur: COULEURS.selection });
        peintre.texte(this.ligneCreature(jeu, membre), colonneDroite, y, {
          couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
        });
      });
    }

    // L'aide dit ce que « valider » fera *ici*, pas ce qu'il fait en général : à droite,
    // l'action change selon qu'il reste ou non une place dans l'équipe.
    const aide =
      this.cote === 'equipe'
        ? jeu.t('menu.deposer')
        : jeu.state.equipe.length < TAILLE_EQUIPE
          ? jeu.t('menu.reprendre')
          : jeu.t('menu.echanger');
    peintre.texte(aide, 18, VIRTUAL_HEIGHT - 24, { couleur: COULEURS.texteAttenue });
  }

  /**
   * Les deux colonnes cliquables de la réserve, dans le repère où elles sont dessinées.
   *
   * La droite défile : son `depuis` est le décalage courant, si bien qu'un clic sur la
   * première ligne visible désigne bien la créature affichée là, et non la première de
   * la réserve.
   */
  private colonnesReserve(jeu: Jeu): { gauche: Colonne; droite: Colonne } {
    const colonneDroite = Math.round(VIRTUAL_WIDTH / 2) + 4;
    const visibles = Math.max(0, Math.min(lignesReserve(), jeu.state.reserve.length - this.defilement));
    return {
      gauche: {
        x: 14,
        largeur: colonneDroite - 26,
        y: 39,
        pas: 13,
        lignes: jeu.state.equipe.length,
      },
      droite: {
        x: colonneDroite - 12,
        largeur: VIRTUAL_WIDTH - colonneDroite - 8,
        y: 39,
        pas: 13,
        lignes: visibles,
        depuis: this.defilement,
      },
    };
  }

  /** Une créature en une ligne : nom tronqué, niveau, points de vie. */
  private ligneCreature(jeu: Jeu, membre: CreatureInstance): string {
    const nom = jeu.nomCreature(membre);
    const court = nom.length > 9 ? `${nom.slice(0, 8)}…` : nom;
    return `${court} N.${membre.niveau} ${membre.pv}/${pvMax(membre)}`;
  }

  private dessinerSac(jeu: Jeu): void {
    this.cadre(jeu, jeu.t('menu.sac'));
    const objets = sacTrie(jeu.state);
    if (objets.length === 0) {
      jeu.peintre.texte(jeu.t('menu.vide'), 28, 34, { couleur: COULEURS.texteAttenue });
      return;
    }
    // La description de l'objet sélectionné occupe le bas du cadre : les lignes se
    // comptent sur ce qui reste au-dessus.
    const hauteurDescription = HAUTEUR_DESCRIPTION_SAC;
    objets.slice(0, lignesSac()).forEach((entree, index) => {
      const y = 32 + index * 13;
      jeu.peintre.icone(entree.item, 26, y - 4);
      this.ligne(jeu, `   ${jeu.nomObjet(entree.item)}`, y, index === this.selection, `× ${entree.nombre}`);
    });

    // Chaque objet porte une description dans les données, et rien ne l'affichait :
    // le joueur devait deviner ce que faisait une Panacée avant de la consommer.
    const choisi = objets[this.selection];
    if (choisi) {
      jeu.peintre.texteBloc(
        ITEMS[choisi.item].description[jeu.langue],
        18,
        VIRTUAL_HEIGHT - hauteurDescription,
        VIRTUAL_WIDTH - 40,
        { couleur: COULEURS.texteAttenue },
      );
    }
  }

  private dessinerTerradex(jeu: Jeu): void {
    const vus = jeu.state.progression.terradexVus;
    const captures = jeu.state.progression.terradexCaptures;
    this.cadre(
      jeu,
      jeu.t('terradex.progression', { vus: vus.length, total: tailleTerradex(), captures: captures.length }),
    );

    const lignes = lignesTerradex();
    for (let ligne = 0; ligne < lignes; ligne++) {
      const index = this.defilement + ligne;
      const species = SPECIES_IDS[index];
      if (!species) break;
      const connu = vus.includes(species);
      const capture = captures.includes(species);
      const numero = String(SPECIES[species].numero).padStart(2, '0');
      const nom = connu ? jeu.nomEspece(species) : jeu.t('terradex.inconnu');
      this.ligne(
        jeu,
        `${numero}  ${nom}`,
        30 + ligne * 12,
        index === this.selection,
        capture ? '♦' : connu ? '·' : '',
      );
    }
    jeu.peintre.texte(jeu.t('terradex.consulter'), 18, VIRTUAL_HEIGHT - 24, {
      couleur: COULEURS.texteAttenue,
    });
  }

  /**
   * Fiche d'espèce : le seul endroit du jeu où consulter la table des types.
   *
   * Elle décide de chaque combat et n'était affichée nulle part — il fallait la deviner
   * coup par coup. Les forces et faiblesses sont calculées, jamais écrites : ajouter un
   * type à la table les met à jour ici sans y toucher.
   */
  private dessinerEspece(jeu: Jeu): void {
    const id = this.especeVue;
    if (!id) return;
    const species = SPECIES[id];
    const peintre = jeu.peintre;
    const capture = jeu.state.progression.terradexCaptures.includes(id);

    this.cadre(
      jeu,
      `${String(species.numero).padStart(2, '0')}  ${jeu.nomEspece(id)}${capture ? '  ♦' : ''}`,
    );

    peintre.creature(id, 'face', 16, 28, { echelle: 0.85 });
    species.types.forEach((type, index) => {
      peintre.plaqueType(type, jeu.nomType(type), 78 + index * (peintre.largeurPlaque + 4), 30);
    });
    peintre.texte(
      jeu.t('fiche.taille', { taille: species.taille.toFixed(1), poids: species.poids.toFixed(1) }),
      78,
      46,
      { couleur: COULEURS.texteAttenue },
    );
    peintre.texte(jeu.t('terradex.habitat', { biomes: species.habitats.map((b) => BIOME_NAMES[b][jeu.langue]).join(', ') }), 78, 58, {
      couleur: COULEURS.texteAttenue,
    });

    // Faiblesses et résistances, en plaques de type : plus lisibles qu'une énumération.
    const rangee = (libelle: string, types: readonly ElementType[], y: number): void => {
      peintre.texte(libelle, 16, y, { couleur: COULEURS.texteAccent });
      if (types.length === 0) {
        peintre.texte(jeu.t('terradex.aucun'), 16, y + 11, { couleur: COULEURS.texteAttenue });
        return;
      }
      types.slice(0, 5).forEach((type, index) => {
        peintre.plaqueType(type, jeu.nomType(type), 16 + index * (peintre.largeurPlaque + 3), y + 10);
      });
    };
    rangee(jeu.t('terradex.faiblesses'), faiblessesDe(species.types), 76);
    rangee(jeu.t('terradex.resistances'), resistancesDe(species.types), 102);

    peintre.texteBloc(species.description[jeu.langue], 16, 130, VIRTUAL_WIDTH - 40, {
      couleur: COULEURS.texte,
    });
    peintre.texte(jeu.t('aide.fermer'), 18, VIRTUAL_HEIGHT - 22, { couleur: COULEURS.texteAttenue });
  }

  private dessinerSauvegarde(jeu: Jeu): void {
    this.cadre(jeu, jeu.t('menu.sauvegarde'));
    ENTREES_SAUVEGARDE.forEach((cle, index) => {
      this.ligne(jeu, jeu.t(cle), 34 + index * 14, index === this.selection);
    });
    const lignes = jeu.peintre.decouper(jeu.t('sauvegarde.deposer'), VIRTUAL_WIDTH - 40);
    lignes.forEach((ligne, index) => {
      jeu.peintre.texte(ligne, 18, VIRTUAL_HEIGHT - 40 + index * 11, { couleur: COULEURS.texteAttenue });
    });
  }
}

/** Vrai si l'objet aurait un effet sur cette créature — sans le consommer. */
function utiliserObjetSurEssai(item: keyof typeof ITEMS, cible: CreatureInstance): boolean {
  const effet = ITEMS[item].effet;
  if (effet.kind === 'soin') return cible.pv > 0 && cible.pv < pvMax(cible);
  if (effet.kind === 'guerison') {
    return cible.statut !== null && (effet.statut === 'tout' || effet.statut === cible.statut);
  }
  return false;
}
