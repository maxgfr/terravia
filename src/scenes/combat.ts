/**
 * L'écran de combat.
 *
 * Cette scène **ne connaît aucune règle de combat**. Elle demande une action, la passe
 * au moteur, reçoit une liste d'événements et les joue un par un. Ajouter une animation
 * ici ne peut donc pas modifier un calcul de dégâts, et un combat testé sans écran se
 * déroule exactement de la même façon avec.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { MOVES, type MoveId } from '../data/moves.ts';
import { SPECIES } from '../data/species.ts';
import { effectivenessAgainst, effectivenessTier } from '../data/types.ts';
import type { CleTexte } from '../i18n/index.ts';
import { STAT_NAMES, STATUS_NAMES } from '../data/stats.ts';
import { ITEMS } from '../data/items.ts';
import { TALENTS, type TalentId } from '../data/talents.ts';
import { choisirAttaque, choisirRemplacant, type NiveauIA } from '../battle/ai.ts';
import { creerCombattant } from '../battle/damage.ts';
import {
  creerCombat,
  evenementsEntree,
  resoudreTour,
  type Action,
  type BattleEvent,
  type BattleState,
  type Cote,
} from '../battle/engine.ts';
import {
  apprendreAttaque,
  evoluer,
  experienceGagnee,
  dressageGagne,
  gagnerExperience,
  pvMax,
  type CreatureInstance,
} from '../game/creature.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import {
  accueillirCreature,
  avancerTemps,
  distribuerDressage,
  donnerBadge,
  equipeDebout,
  marquerDresseurVaincu,
  marquerVu,
  poserDrapeau,
  prochainIdentifiant,
  retirerObjet,
  sacTrie,
  soignerEquipe,
  type CombatEnCours,
} from '../game/state.ts';
import { experienceForLevel } from '../data/stats.ts';
import type { Dresseur } from '../world/entities.ts';
import { badgeDe, toutesLesArenesVaincues } from '../world/worldgen.ts';
import { COULEURS } from '../ui/draw.ts';
import { viser, viserGrille, type Colonne, type Grille } from '../ui/liste.ts';

export interface Rencontre {
  readonly genre: 'sauvage' | 'dresseur';
  readonly adversaires: CreatureInstance[];
  readonly dresseur?: Dresseur;
}

type Menu = 'racine' | 'attaques' | 'sac' | 'equipe';

/** Lignes affichées d'un coup dans les menus déroulants du combat. */
const LIGNES_VISIBLES = 3;

/** Hauteur du bandeau d'actions, en bas de l'écran. */
const HAUTEUR_MENU = 52;

export class SceneCombat implements Scene {
  readonly nom = 'combat';
  readonly opaque = true;

  private state!: BattleState;
  private indexJoueur = 0;
  private indexAdverse = 0;
  private menu: Menu = 'racine';
  private selection = 0;
  private defilement = 0;
  private attente = false;

  // ── Animation ──────────────────────────────────────────────────────────────
  // Purement décorative : rien ici ne touche à l'état du combat, qui est déjà résolu
  // quand ces valeurs bougent. Une animation ne peut donc pas changer une règle.
  private tremblement = 0;
  private coteFrappe: Cote | null = null;
  /** Glissement d'entrée, de 1 (hors cadre) à 0 (en place). */
  private entree = 1;
  /** Chute d'une créature vaincue, de 1 (debout) à 0 (à terre). */
  private readonly chute: Record<Cote, number> = { joueur: 0, adversaire: 0 };
  /**
   * Ratio de points de vie **affiché**, qui rattrape le réel.
   *
   * La barre sautait d'un coup à sa nouvelle valeur : on lisait le résultat sans voir
   * le coup porter. La faire glisser est ce qui donne au combat sa lisibilité.
   */
  private readonly pvAffiches: Record<Cote, number> = { joueur: 1, adversaire: 1 };

  private readonly rencontre: Rencontre;
  private readonly reprise: CombatEnCours | null;

  /**
   * @param reprise Combat retrouvé dans la sauvegarde. Il court-circuite l'ouverture :
   *   ni répliques d'entrée, ni talents à déclencher — tout cela a déjà eu lieu avant
   *   que l'onglet ne se ferme.
   */
  constructor(rencontre: Rencontre, reprise: CombatEnCours | null = null) {
    this.rencontre = rencontre;
    this.reprise = reprise;
  }

  entrer(jeu: Jeu): void {
    if (this.reprise) this.reprendre(jeu, this.reprise);
    else {
      this.indexJoueur = jeu.state.equipe.findIndex((membre) => membre.pv > 0);
      if (this.indexJoueur < 0) this.indexJoueur = 0;
      this.demarrer(jeu);
    }
    // Le combat devient enregistrable dès la première trame : fermer l'onglet à
    // l'instant même le retrouvera.
    this.enregistrer(jeu);
  }

  /**
   * Le combat est retiré de la partie en sortant, quelle qu'en soit l'issue — fuite,
   * capture, victoire, défaite. Point de sortie unique, donc rien à oublier.
   */
  quitter(jeu: Jeu): void {
    jeu.state.combat = null;
    jeu.sauvegarderLocalement();
  }

  /** Dépose l'échange en cours dans la partie, sans l'écrire. */
  avantSauvegarde(jeu: Jeu): void {
    if (this.state.issue === null) this.enregistrer(jeu, false);
  }

  private enregistrer(jeu: Jeu, ecrire = true): void {
    jeu.state.combat = {
      genre: this.rencontre.genre,
      adversaires: this.rencontre.adversaires,
      dresseurId: this.rencontre.dresseur?.id ?? null,
      indexJoueur: this.indexJoueur,
      indexAdverse: this.indexAdverse,
      etagesJoueur: { ...this.state.joueur.etages },
      etagesAdverse: { ...this.state.adversaire.etages },
      tour: this.state.tour,
      tentativesFuite: this.state.tentativesFuite,
    };
    if (ecrire) jeu.sauvegarderLocalement();
  }

  private reprendre(jeu: Jeu, reprise: CombatEnCours): void {
    this.indexJoueur = reprise.indexJoueur;
    this.indexAdverse = reprise.indexAdverse;
    this.state = creerCombat(jeu.state.equipe[this.indexJoueur]!, this.adversaire, reprise.genre);
    Object.assign(this.state.joueur.etages, reprise.etagesJoueur);
    Object.assign(this.state.adversaire.etages, reprise.etagesAdverse);
    this.state.tour = reprise.tour;
    this.state.tentativesFuite = reprise.tentativesFuite;
    jeu.dialogue.dire(jeu.t('combat.reprise', { nom: jeu.nomCreature(this.adversaire) }));
  }

  private get adversaire(): CreatureInstance {
    return this.rencontre.adversaires[this.indexAdverse]!;
  }

  private get creatureJoueur(): CreatureInstance {
    return this.state.joueur.instance;
  }

  private demarrer(jeu: Jeu): void {
    const mien = jeu.state.equipe[this.indexJoueur]!;
    this.state = creerCombat(mien, this.adversaire, this.rencontre.genre);
    this.reinitialiserAnimation('joueur');
    this.reinitialiserAnimation('adversaire');
    marquerVu(jeu.state, this.adversaire.speciesId);

    const nom = jeu.nomCreature(this.adversaire);
    if (this.rencontre.genre === 'sauvage') {
      jeu.dialogue.dire(jeu.t('combat.sauvage', { nom }));
    } else {
      jeu.dialogue.dire(jeu.t('combat.dresseur', { dresseur: this.nomDresseur(jeu) }));
      jeu.dialogue.dire(jeu.t('combat.adversaireEnvoie', { dresseur: this.nomDresseur(jeu), nom }));
    }
    jeu.dialogue.dire(jeu.t('combat.envoie', { nom: jeu.nomCreature(mien) }));

    this.jouer(jeu, [
      ...evenementsEntree(this.state, 'adversaire'),
      ...evenementsEntree(this.state, 'joueur'),
    ]);
  }

  /** Les dresseurs générés n'ont pas de nom propre : on les désigne par leur rôle. */
  private nomDresseur(jeu: Jeu): string {
    return jeu.t(this.rencontre.dresseur?.champion ? 'combat.championGenerique' : 'combat.dresseurGenerique');
  }

  private get niveauIA(): NiveauIA {
    if (this.rencontre.genre === 'sauvage') return 'sauvage';
    return this.rencontre.dresseur?.champion ? 'champion' : 'route';
  }

  // ── Boucle ─────────────────────────────────────────────────────────────────

  mettreAJour(jeu: Jeu, step: number): void {
    // L'horloge ne tournait que dans le monde parcouru : un long combat la figeait, et
    // le temps de jeu affiché sous-estimait d'autant. Combattre, c'est jouer.
    avancerTemps(jeu.state, step * 1000);
    this.animer(step);

    if (jeu.dialogue.actif) {
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }
    if (this.attente) return;

    switch (this.menu) {
      case 'racine':
        this.menuRacine(jeu);
        break;
      case 'attaques':
        this.menuAttaques(jeu);
        break;
      case 'sac':
        this.menuSac(jeu);
        break;
      case 'equipe':
        this.menuEquipe(jeu);
        break;
    }
  }

  /**
   * Fait avancer les animations d'une trame.
   *
   * Tout converge vers l'état réel : la barre rattrape les points de vie, la secousse
   * s'éteint, l'entrée se termine. Aucune ne bloque le jeu — si l'on presse une touche,
   * l'action part et l'animation finit toute seule.
   */
  private animer(step: number): void {
    if (this.tremblement > 0) this.tremblement = Math.max(0, this.tremblement - step * 4);
    if (this.entree > 0) this.entree = Math.max(0, this.entree - step * 2.6);

    for (const cote of ['joueur', 'adversaire'] as const) {
      const combattant = cote === 'joueur' ? this.state.joueur : this.state.adversaire;
      const vise = combattant.instance.pv / pvMax(combattant.instance);
      // Rattrapage proportionnel puis plancher constant : sans le plancher, la barre
      // s'approche indéfiniment sans jamais arriver.
      const ecart = vise - this.pvAffiches[cote];
      const pas = Math.sign(ecart) * Math.max(Math.abs(ecart) * step * 6, step * 0.35);
      this.pvAffiches[cote] =
        Math.abs(ecart) < 0.004 ? vise : this.pvAffiches[cote] + Math.max(-Math.abs(ecart), Math.min(Math.abs(ecart), pas));

      if (this.chute[cote] > 0) this.chute[cote] = Math.max(0, this.chute[cote] - step * 1.8);
    }
  }

  /** Remet les animations à leur début quand une créature entre en lice. */
  private reinitialiserAnimation(cote: Cote): void {
    const combattant = cote === 'joueur' ? this.state.joueur : this.state.adversaire;
    this.pvAffiches[cote] = combattant.instance.pv / pvMax(combattant.instance);
    this.chute[cote] = 0;
    this.entree = 1;
  }

  private naviguer(jeu: Jeu, nombre: number, colonnes = 1): void {
    if (nombre === 0) return;
    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + colonnes) % nombre;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - colonnes + nombre) % nombre;
    if (colonnes > 1) {
      if (jeu.entrees.pressee('est')) this.selection = (this.selection + 1) % nombre;
      if (jeu.entrees.pressee('ouest')) this.selection = (this.selection - 1 + nombre) % nombre;
    }
    // Seules les listes en colonne défilent ; les grilles à deux colonnes tiennent en entier.
    if (colonnes === 1) this.defilement = fenetre(this.selection, nombre);
  }

  private allerAu(menu: Menu): void {
    this.menu = menu;
    this.selection = 0;
    this.defilement = 0;
  }

  /**
   * Géométrie de la grille à deux colonnes : les quatre actions, les quatre attaques.
   *
   * Les valeurs suivent celles de `dessinerMenu`. Les décaler de dix pixels vers la
   * gauche n'est pas un détail : c'est là qu'est dessiné le chevron de sélection, et
   * cliquer dessus doit compter.
   */
  private grilleMenu(cases: number, decalage: number, largeurColonne: number): Grille {
    return {
      x: decalage - 10,
      y: VIRTUAL_HEIGHT - HAUTEUR_MENU + 7,
      largeurColonne,
      pas: 14,
      colonnes: 2,
      cases,
    };
  }

  /**
   * Le panneau des attaques déborde vers le haut, contrairement aux autres.
   *
   * Quatre lignes portant chacune un nom, une plaque de type et des PP ne tiennent pas
   * dans les quarante-six pixels du menu ordinaire. Plutôt que de rogner la moitié basse
   * du terrain pour tous les écrans — les créatures et leurs jauges y sont placées —,
   * ce menu-ci seul empiète sur le décor, le temps qu'on choisisse.
   */
  private cadreAttaques(): { x: number; y: number; largeur: number; hauteur: number } {
    return {
      x: 6,
      y: VIRTUAL_HEIGHT - HAUTEUR_MENU - 26,
      largeur: VIRTUAL_WIDTH - 12,
      hauteur: 72,
    };
  }

  /** Géométrie de la tranche visible d'une liste déroulante du panneau de combat. */
  private colonneMenu(nombre: number): Colonne {
    return {
      x: 10,
      largeur: VIRTUAL_WIDTH - 26,
      y: VIRTUAL_HEIGHT - HAUTEUR_MENU + 5,
      pas: 12,
      lignes: Math.min(LIGNES_VISIBLES, nombre - this.defilement),
      depuis: this.defilement,
    };
  }

  /** Le pointeur sur le panneau : il déplace la sélection, son clic la valide. */
  private validee(jeu: Jeu, zone: Colonne | Grille): boolean {
    const { survol, valide } = 'colonnes' in zone ? viserGrille(jeu.entrees, zone) : viser(jeu.entrees, zone);
    if (survol !== null) this.selection = survol;
    return jeu.entrees.pressee('valider') || valide;
  }

  private menuRacine(jeu: Jeu): void {
    this.naviguer(jeu, 4, 2);
    if (!this.validee(jeu, this.grilleMenu(4, 20, Math.floor((VIRTUAL_WIDTH - 40) / 2)))) return;
    if (this.selection === 0) this.allerAu('attaques');
    else if (this.selection === 1) this.allerAu('sac');
    else if (this.selection === 2) this.allerAu('equipe');
    else this.agir(jeu, { kind: 'fuite' });
  }

  private menuAttaques(jeu: Jeu): void {
    const attaques = this.creatureJoueur.moves;
    this.naviguer(jeu, attaques.length);
    // Les quatre attaques sont toujours toutes dessinées : le défilement des listes
    // longues n'a rien à faire ici, et décalerait la liste d'un cran dès la quatrième.
    this.defilement = 0;
    if (jeu.entrees.pressee('annuler')) {
      this.allerAu('racine');
      return;
    }
    const cadre = this.cadreAttaques();
    const colonne: Colonne = {
      x: cadre.x + 4,
      largeur: cadre.largeur - 8,
      y: cadre.y + 5,
      pas: 12,
      lignes: attaques.length,
    };
    if (!this.validee(jeu, colonne)) return;
    if ((attaques[this.selection]?.pp ?? 0) <= 0) {
      jeu.dialogue.dire(jeu.t('combat.plusDePp'));
      return;
    }
    this.agir(jeu, { kind: 'attaque', index: this.selection });
  }

  private menuSac(jeu: Jeu): void {
    const objets = sacTrie(jeu.state).filter((entree) => ITEMS[entree.item].usage !== 'monde');
    this.naviguer(jeu, objets.length);
    if (jeu.entrees.pressee('annuler') || objets.length === 0) {
      this.allerAu('racine');
      return;
    }
    if (!this.validee(jeu, this.colonneMenu(objets.length))) return;

    const choisi = objets[this.selection];
    if (!choisi) return;
    const effet = ITEMS[choisi.item].effet;
    if (effet.kind === 'capture') {
      // On ne capture pas la créature d'un dresseur. Le refus se dit : sans un mot, le
      // joueur croit que sa validation n'a pas été prise.
      if (this.rencontre.genre === 'dresseur') {
        jeu.dialogue.dire(jeu.t('combat.captureImpossible'));
        return;
      }
      retirerObjet(jeu.state, choisi.item);
      this.agir(jeu, { kind: 'capture', item: choisi.item });
    } else {
      retirerObjet(jeu.state, choisi.item);
      this.agir(jeu, { kind: 'objet', item: choisi.item });
    }
  }

  private menuEquipe(jeu: Jeu): void {
    const equipe = jeu.state.equipe;
    this.naviguer(jeu, equipe.length);
    if (jeu.entrees.pressee('annuler')) {
      this.allerAu('racine');
      return;
    }
    if (!this.validee(jeu, this.colonneMenu(equipe.length))) return;

    const choisi = equipe[this.selection];
    if (!choisi) return;
    if (this.selection === this.indexJoueur) {
      jeu.dialogue.dire(jeu.t('combat.dejaEnJeu', { nom: jeu.nomCreature(choisi) }));
      return;
    }
    if (choisi.pv <= 0) {
      jeu.dialogue.dire(jeu.t('combat.pasDeFuite'));
      return;
    }
    this.indexJoueur = this.selection;
    this.state.joueur = creerCombattant(choisi);
    this.reinitialiserAnimation('joueur');
    jeu.dialogue.dire(jeu.t('combat.envoie', { nom: jeu.nomCreature(choisi) }));
    this.agir(jeu, { kind: 'changer' });
  }

  // ── Résolution ─────────────────────────────────────────────────────────────

  private agir(jeu: Jeu, action: Action): void {
    this.allerAu('racine');
    const choixAdverse = choisirAttaque(this.state.adversaire, this.state.joueur, this.niveauIA, jeu.rng);
    const evenements = resoudreTour(this.state, action, choixAdverse, jeu.rng);
    this.jouer(jeu, evenements);
  }

  /** Traduit chaque événement du moteur en une ligne de dialogue. */
  /**
   * Rejoue un tour : ses répliques à la file, ses animations avec elles.
   *
   * Le regroupement est le cœur de la méthode. Un tour produit plus d'événements que de
   * répliques — la moitié des dégâts ne se commentent pas — et chaque animation revient
   * à la dernière réplique annoncée, celle que le joueur est en train de lire. Les
   * déclencher toutes à l'empilement, comme on le faisait, revenait à ne montrer que la
   * dernière, par-dessus le premier texte : notre créature tremblait sous « X utilise Y »,
   * et l'on croyait que ses propres attaques la blessaient.
   */
  private jouer(jeu: Jeu, evenements: readonly BattleEvent[]): void {
    const etapes: { readonly texte: string; readonly effets: (() => void)[] }[] = [];
    const avantToutTexte: (() => void)[] = [];

    for (const evenement of evenements) {
      const message = this.decrire(jeu, evenement);
      if (message) etapes.push({ texte: message, effets: [] });

      const effet = this.animationDe(evenement);
      if (!effet) continue;
      // Une animation sans réplique devant elle n'a rien à attendre : c'est le cas d'un
      // tour entièrement muet, où elle joue tout de suite.
      (etapes[etapes.length - 1]?.effets ?? avantToutTexte).push(effet);
    }

    for (const effet of avantToutTexte) effet();
    for (const etape of etapes) {
      jeu.dialogue.direAvec(etape.texte, () => {
        for (const effet of etape.effets) effet();
      });
    }

    this.attente = true;
    jeu.dialogue.puis(() => {
      this.attente = false;
      this.apresTour(jeu);
    });
  }

  /** Ce qu'un événement fait bouger à l'écran, ou `null` s'il ne bouge rien. */
  private animationDe(evenement: BattleEvent): (() => void) | null {
    // La secousse suit celui qui encaisse : elle s'appliquait à l'adversaire même
    // quand c'était nous qui prenions le coup.
    if (evenement.type === 'degats' && evenement.montant > 0) {
      const cote = evenement.cible;
      return () => {
        this.tremblement = 1;
        this.coteFrappe = cote;
      };
    }
    if (evenement.type === 'ko') {
      const cote = evenement.cible;
      return () => void (this.chute[cote] = 1);
    }
    return null;
  }

  /**
   * Le nom d'une créature dans une réplique, avec son camp.
   *
   * Les répliques ne portaient que le nom d'espèce : deux Mulotin sans surnom donnaient
   * « Mulotin utilise Charge ! » des deux côtés, et rien ne disait lequel des deux venait
   * de frapper. Le camp adverse est donc nommé comme tel — toujours, même quand les noms
   * diffèrent. Une règle sans condition se lit pareil à chaque combat, là où un libellé
   * qui n'apparaît que sur les doublons demanderait au joueur de remarquer qu'il a changé.
   *
   * Le nôtre reste nu : c'est l'asymétrie qui distingue, pas la longueur des deux côtés.
   */
  private nomAuCombat(jeu: Jeu, cote: 'joueur' | 'adversaire'): string {
    if (cote === 'joueur') return jeu.nomCreature(this.creatureJoueur);
    return jeu.t('combat.adverse', { nom: jeu.nomCreature(this.adversaire) });
  }

  private decrire(jeu: Jeu, evenement: BattleEvent): string | null {
    const nomDe = (cote: 'joueur' | 'adversaire'): string => this.nomAuCombat(jeu, cote);

    switch (evenement.type) {
      case 'message': {
        // Le moteur nomme le talent par son identifiant — il ne connaît aucune langue.
        // C'est ici, et seulement ici, qu'il devient un nom lisible.
        const params = evenement.params;
        const talent = params?.['talent'];
        const lisibles =
          typeof talent === 'string' && talent in TALENTS
            ? { ...params, talent: TALENTS[talent as TalentId].nom[jeu.langue] }
            : params;
        return jeu.t(evenement.cle as never, lisibles);
      }
      case 'attaque':
        return jeu.t('combat.utilise', {
          nom: nomDe(evenement.acteur),
          attaque: jeu.nomAttaque(evenement.move),
        });
      case 'rate':
        return jeu.t('combat.rate');
      case 'degats': {
        if (evenement.palier === 'neutral') return evenement.critique ? jeu.t('combat.critique') : null;
        const cle = `combat.efficace.${evenement.palier}` as const;
        return jeu.t(cle as never);
      }
      case 'soin':
        return jeu.t('combat.soin', { nom: nomDe(evenement.cible) });
      case 'statut':
        return jeu.t(`combat.statut.${evenement.statut}` as never, { nom: nomDe(evenement.cible) });
      case 'statutDissipe':
        return jeu.t('combat.dissipe', { nom: nomDe(evenement.cible) });
      case 'stat':
        return jeu.t(evenement.etages > 0 ? 'combat.statHausse' : 'combat.statBaisse', {
          nom: nomDe(evenement.cible),
          stat: STAT_NAMES[evenement.stat][jeu.langue],
        });
      case 'immobilise':
        return jeu.t(`combat.immobilise.${evenement.cause}` as never, { nom: nomDe(evenement.acteur) });
      case 'ko':
        return jeu.t('combat.ko', { nom: nomDe(evenement.cible) });
      case 'objet':
        return jeu.t('combat.lancePrisme', { objet: jeu.nomObjet(evenement.item) });
      case 'capture':
        return evenement.reussi
          ? jeu.t('combat.captureReussie', { nom: nomDe('adversaire') })
          : `${jeu.t('combat.secousses', { secousses: evenement.secousses })} ${jeu.t('combat.captureRatee')}`;
      case 'fuite':
        return evenement.reussi ? jeu.t('combat.fuiteReussie') : jeu.t('combat.fuiteRatee');
    }
  }

  private apresTour(jeu: Jeu): void {
    switch (this.state.issue) {
      case null:
        // La main revient au joueur : c'est le point de reprise naturel, et donc le bon
        // moment pour figer le combat sur le disque.
        this.enregistrer(jeu);
        return;
      case 'fuite':
        jeu.retirer();
        return;
      case 'capture':
        this.capturer(jeu);
        return;
      case 'adversaireKo':
        this.adversaireVaincu(jeu);
        return;
      case 'joueurKo':
        this.creatureVaincue(jeu);
        return;
    }
  }

  private capturer(jeu: Jeu): void {
    const capturee = this.adversaire;
    const nouveau: CreatureInstance = { ...capturee, uid: prochainIdentifiant(jeu.state) };
    accueillirCreature(jeu.state, nouveau);
    // L'écriture a lieu dans `quitter`, une fois le combat retiré de la partie.
    jeu.dialogue.puis(() => jeu.retirer());
  }

  private adversaireVaincu(jeu: Jeu): void {
    const vaincu = this.adversaire;
    const gagnante = this.creatureJoueur;

    const xp = experienceGagnee(vaincu, this.rencontre.genre === 'dresseur');
    const avant = gagnante.niveau;
    const gain = gagnerExperience(gagnante, xp);
    jeu.dialogue.dire(jeu.t('combat.gainXp', { nom: jeu.nomCreature(gagnante), xp }));

    // Le dressage se gagnait en silence : le joueur n'avait aucun moyen de savoir que
    // ses créatures se renforçaient, ni dans quelle direction.
    const dressage = dressageGagne(vaincu);
    distribuerDressage(jeu.state, dressage.stat, dressage.points);
    jeu.dialogue.dire(
      jeu.t('combat.dressage', {
        nom: jeu.nomCreature(gagnante),
        points: dressage.points,
        stat: STAT_NAMES[dressage.stat][jeu.langue],
      }),
    );

    if (gain.niveauApres > avant) {
      jeu.dialogue.dire(jeu.t('combat.niveau', { nom: jeu.nomCreature(gagnante), niveau: gain.niveauApres }));
    }

    // Ce qui rentre est appris tout de suite ; le reste attend que le joueur désigne
    // l'attaque à oublier. Auparavant, une créature à quatre attaques n'en apprenait
    // plus jamais aucune, en silence.
    const aChoisir: MoveId[] = [];
    for (const attaque of gain.nouvellesAttaques) {
      if (apprendreAttaque(gagnante, attaque, null)) {
        jeu.dialogue.dire(jeu.t('combat.apprend', { nom: jeu.nomCreature(gagnante), attaque: jeu.nomAttaque(attaque) }));
      } else if (!gagnante.moves.some((slot) => slot.id === attaque)) {
        aChoisir.push(attaque);
      }
    }

    if (gain.evolution) {
      const evolue = evoluer(gagnante, gain.evolution);
      jeu.state.equipe[this.indexJoueur] = evolue;
      this.state.joueur = creerCombattant(evolue);
      jeu.dialogue.dire(
        jeu.t('combat.evolue', {
          nom: SPECIES[gagnante.speciesId].nom[jeu.langue],
          evolution: jeu.nomEspece(gain.evolution),
        }),
      );
    }

    // Créature suivante du dresseur, s'il lui en reste.
    const restants = this.rencontre.adversaires.filter((membre) => membre.pv > 0);
    if (this.rencontre.genre === 'dresseur' && restants.length > 0) {
      const suivant = choisirRemplacant(restants.map(creerCombattant), this.state.joueur, jeu.rng);
      this.indexAdverse = this.rencontre.adversaires.indexOf(restants[suivant]!);
      this.state.adversaire = creerCombattant(this.adversaire);
      this.state.issue = null;
      this.reinitialiserAnimation('adversaire');
      marquerVu(jeu.state, this.adversaire.speciesId);
      this.apprendreEnsuite(jeu, gagnante, aChoisir, () => {
        jeu.dialogue.dire(
          jeu.t('combat.adversaireEnvoie', {
            dresseur: this.nomDresseur(jeu),
            nom: jeu.nomCreature(this.adversaire),
          }),
        );
        this.jouer(jeu, evenementsEntree(this.state, 'adversaire'));
      });
      return;
    }

    if (this.rencontre.dresseur) {
      const dresseur = this.rencontre.dresseur;
      marquerDresseurVaincu(jeu.state, dresseur.id);
      jeu.state.joueur.pieces += dresseur.recompense;
      jeu.dialogue.dire(jeu.t('combat.recompense', { pieces: dresseur.recompense }));
      jeu.dialogue.dire(jeu.dialogueDe(dresseur.dialogueVaincu));

      // Le badge porte la spécialité de l'arène, lue sur la région courante. C'est lui
      // qui ouvre la route vers le nord, et c'est ce qui fait d'une arène un palier.
      if (dresseur.champion) {
        const type = jeu.monde.region(jeu.state.joueur.regionIndex).typeArene;
        if (type) {
          donnerBadge(jeu.state, badgeDe(type));
          jeu.dialogue.dire(jeu.t('combat.badge', { type: jeu.nomType(type) }));
          // Le dernier insigne clôt l'aventure. On pose un drapeau plutôt que d'empiler
          // l'écran de fin ici : il doit s'ouvrir une fois le combat refermé, sur le
          // monde, et non par-dessus une scène qu'on est en train de quitter.
          if (toutesLesArenesVaincues(jeu.monde.plans, jeu.state.progression.badges)) {
            poserDrapeau(jeu.state, 'victoire');
          }
        }
      }
    }

    this.apprendreEnsuite(jeu, gagnante, aChoisir, () => jeu.retirer());
  }

  /**
   * Fait choisir l'attaque à oublier, une nouvelle attaque après l'autre, puis enchaîne.
   *
   * La récursion passe par le `.then` de la question plutôt que par un `puis` global :
   * c'est ce qui garantit que le remplacement est appliqué avant la suite.
   */
  private apprendreEnsuite(
    jeu: Jeu,
    creature: CreatureInstance,
    aChoisir: MoveId[],
    apres: () => void,
  ): void {
    const attaque = aChoisir.shift();
    if (!attaque) {
      jeu.dialogue.puis(apres);
      return;
    }

    const nom = jeu.nomCreature(creature);
    const options = [...creature.moves.map((slot) => jeu.nomAttaque(slot.id)), jeu.t('combat.renoncer')];
    void jeu.dialogue
      .demander(jeu.t('combat.oublier', { nom, attaque: jeu.nomAttaque(attaque) }), options)
      .then((choix) => {
        const oubliee = creature.moves[choix]?.id;
        if (oubliee !== undefined && apprendreAttaque(creature, attaque, choix)) {
          jeu.dialogue.dire(
            jeu.t('combat.oublie', { nom, ancienne: jeu.nomAttaque(oubliee) }),
            jeu.t('combat.apprend', { nom, attaque: jeu.nomAttaque(attaque) }),
          );
        } else {
          jeu.dialogue.dire(jeu.t('combat.renonce', { nom, attaque: jeu.nomAttaque(attaque) }));
        }
        this.apprendreEnsuite(jeu, creature, aChoisir, apres);
      });
  }

  private creatureVaincue(jeu: Jeu): void {
    const debout = equipeDebout(jeu.state);
    if (debout.length > 0) {
      const suivant = jeu.state.equipe.indexOf(debout[0]!);
      this.indexJoueur = suivant;
      this.state.joueur = creerCombattant(debout[0]!);
      this.state.issue = null;
      this.reinitialiserAnimation('joueur');
      jeu.dialogue.dire(jeu.t('combat.envoie', { nom: jeu.nomCreature(debout[0]!) }));
      this.jouer(jeu, evenementsEntree(this.state, 'joueur'));
      return;
    }

    // Défaite : on soigne tout et on ramène au dernier lieu sûr, sans perdre la partie.
    jeu.dialogue.dire(jeu.t('combat.defaite'), jeu.t('combat.retourBourg'));
    jeu.dialogue.puis(() => {
      soignerEquipe(jeu.state);
      const refuge = jeu.state.joueur.refuge;
      jeu.state.joueur.regionIndex = refuge.regionIndex;
      jeu.state.joueur.x = refuge.x;
      jeu.state.joueur.y = refuge.y;
      jeu.retirer();
    });
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;

    // Le terrain se place en proportion de la hauteur, qui varie avec l'écran. Un
    // horizon fixé à 96 pixels laissait les deux créatures flotter en haut d'un sol
    // démesuré dès que la fenêtre était haute.
    const utile = VIRTUAL_HEIGHT - HAUTEUR_MENU;
    const horizon = Math.round(utile * 0.55);
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, '#1b2430');
    peintre.remplir(0, horizon, VIRTUAL_WIDTH, VIRTUAL_HEIGHT - horizon, '#2a3a2c');

    // Chaque camp entre par son bord et glisse jusqu'à sa place, encaisse en tremblant,
    // et s'affaisse quand il tombe. Trois signaux distincts, sur trois axes distincts.
    const secousse = (cote: Cote): number =>
      this.tremblement > 0 && this.coteFrappe === cote ? Math.round(Math.sin(this.tremblement * 26) * 3) : 0;
    const glissement = (sens: number): number => Math.round(this.entree * sens * (VIRTUAL_WIDTH / 2 + 64));
    // Une créature vaincue s'efface en s'enfonçant. `chute` part de 1 et décroît, donc
    // elle sert directement d'opacité, et son complément de descente.
    const affaissement = (cote: Cote): { opacite: number; bas: number } =>
      this.chute[cote] > 0
        ? { opacite: this.chute[cote], bas: Math.round((1 - this.chute[cote]) * 14) }
        : { opacite: 1, bas: 0 };

    const adverse = affaissement('adversaire');
    peintre.creature(
      this.adversaire.speciesId,
      'face',
      VIRTUAL_WIDTH - 96 + secousse('adversaire') + glissement(1),
      horizon - 74 + adverse.bas,
      { echelle: 1, opacite: adverse.opacite },
    );

    const mien = affaissement('joueur');
    peintre.creature(
      this.creatureJoueur.speciesId,
      'dos',
      26 + secousse('joueur') + glissement(-1),
      utile - 62 + mien.bas,
      { echelle: 1.25, opacite: mien.opacite },
    );

    this.dessinerJauge(jeu, this.adversaire, 8, 10, false, this.pvAffiches.adversaire);
    this.dessinerJauge(jeu, this.creatureJoueur, VIRTUAL_WIDTH - 130, utile - 56, true, this.pvAffiches.joueur);

    if (!jeu.dialogue.actif && !this.attente) this.dessinerMenu(jeu);
    jeu.dialogue.dessiner();
  }

  private dessinerJauge(
    jeu: Jeu,
    creature: CreatureInstance,
    x: number,
    y: number,
    avecXp: boolean,
    ratioAffiche: number,
  ): void {
    const peintre = jeu.peintre;
    peintre.panneau(x, y, 122, avecXp ? 40 : 34);
    peintre.texte(jeu.nomCreature(creature), x + 8, y + 6);
    peintre.texteDroite(jeu.t('fiche.niveau', { niveau: creature.niveau }), x + 114, y + 6);

    peintre.texte(jeu.t('fiche.pv'), x + 8, y + 18, { couleur: COULEURS.texteAttenue });
    peintre.barrePv(x + 26, y + 19, 88, Math.max(0, Math.min(1, ratioAffiche)));

    // L'altération se lit à la jauge : c'est la seule place où le joueur peut vérifier
    // qu'il est toujours empoisonné avant de choisir son tour.
    if (creature.statut) {
      peintre.texte(STATUS_NAMES[creature.statut].court, x + 8, y + 28, {
        couleur: COULEURS.texteAccent,
      });
    }
    if (avecXp) {
      const species = SPECIES[creature.speciesId];
      const bas = experienceForLevel(creature.niveau, species.croissance);
      const haut = experienceForLevel(creature.niveau + 1, species.croissance);
      const progression = haut > bas ? (creature.xp - bas) / (haut - bas) : 0;
      peintre.barreXp(x + 8, y + 30, 106, progression);
    }
  }

  private dessinerMenu(jeu: Jeu): void {
    if (this.menu === 'attaques') {
      this.dessinerAttaques(jeu);
      return;
    }

    const peintre = jeu.peintre;
    const y = VIRTUAL_HEIGHT - HAUTEUR_MENU;
    peintre.panneau(6, y, VIRTUAL_WIDTH - 12, 46);

    if (this.menu === 'racine') {
      const entrees = [jeu.t('combat.attaquer'), jeu.t('combat.sac'), jeu.t('combat.equipe'), jeu.t('combat.fuir')];
      // Les deux colonnes se partagent la largeur : figées à 150 pixels, elles se
      // massaient à gauche d'un écran large.
      const colonneLarge = Math.floor((VIRTUAL_WIDTH - 40) / 2);
      entrees.forEach((libelle, index) => {
        const colonne = index % 2;
        const ligne = Math.floor(index / 2);
        this.option(jeu, libelle, 20 + colonne * colonneLarge, y + 10 + ligne * 14, index === this.selection);
      });
      return;
    }

    // Le panneau ne tient que trois lignes, mais la navigation parcourt toute la liste :
    // sans fenêtre glissante, la quatrième entrée se sélectionnait sans jamais s'afficher.
    if (this.menu === 'sac') {
      const objets = sacTrie(jeu.state).filter((entree) => ITEMS[entree.item].usage !== 'monde');
      if (objets.length === 0) {
        peintre.texte(jeu.t('menu.vide'), 20, y + 12, { couleur: COULEURS.texteAttenue });
        return;
      }
      this.listeDeroulante(jeu, objets, y, (entree) => `${jeu.nomObjet(entree.item)} × ${entree.nombre}`);
      return;
    }

    this.listeDeroulante(
      jeu,
      jeu.state.equipe,
      y,
      (membre) => `${jeu.nomCreature(membre)}  ${membre.pv}/${pvMax(membre)}`,
    );
  }

  /**
   * Les attaques, une par ligne, avec leur type.
   *
   * Le type décide de tout en combat et n'apparaissait nulle part au moment de choisir :
   * il fallait le retenir espèce par espèce, ou aller le lire au Terradex entre deux
   * tours. C'est aussi ce qui a fait abandonner la grille à deux colonnes — un nom long
   * y passait déjà par-dessus la colonne voisine, avant même d'y ajouter une plaque.
   */
  private dessinerAttaques(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const cadre = this.cadreAttaques();
    peintre.panneau(cadre.x, cadre.y, cadre.largeur, cadre.hauteur);

    // De droite à gauche : les PP au bord, la plaque juste avant, le nom sur ce qui reste.
    const bordDroit = cadre.x + cadre.largeur - 10;
    const plaqueX = bordDroit - peintre.largeurTexte('00/00') - 6 - peintre.largeurPlaque;

    this.creatureJoueur.moves.forEach((slot, index) => {
      const move = MOVES[slot.id];
      const ligneY = cadre.y + 8 + index * 12;
      const choisi = index === this.selection;

      if (choisi) peintre.texte('▶', cadre.x + 6, ligneY, { couleur: COULEURS.selection });
      peintre.texteTronque(move.nom[jeu.langue], cadre.x + 16, ligneY, plaqueX - cadre.x - 20, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
      peintre.plaqueType(move.type, jeu.nomType(move.type), plaqueX, ligneY - 1);
      peintre.texteDroite(`${slot.pp}/${move.pp}`, bordDroit, ligneY, {
        // Une attaque sans PP ne part pas : elle doit se voir avant d'être choisie.
        couleur: slot.pp === 0 ? COULEURS.pvBas : COULEURS.texteAttenue,
      });
    });

    this.dessinerDetailAttaque(jeu, cadre.x + 12, cadre.y + 58, bordDroit);
  }

  /**
   * Ce que fait l'attaque visée, et ce qu'elle vaut contre l'adversaire du moment.
   *
   * C'est la réponse à « on se perd » : la plaque dit le type, cette ligne dit ce qu'il
   * change ici et maintenant. Sans elle, comprendre la table des types demandait d'ouvrir
   * le Terradex entre deux tours, ou de l'apprendre par cœur.
   */
  private dessinerDetailAttaque(jeu: Jeu, x: number, y: number, bordDroit: number): void {
    const slot = this.creatureJoueur.moves[this.selection];
    if (!slot) return;
    const move = MOVES[slot.id];
    const peintre = jeu.peintre;

    const chiffres =
      move.categorie === 'statut'
        ? jeu.t('encyclopedie.categorie.statut')
        : `${jeu.t(`encyclopedie.categorie.${move.categorie}` as CleTexte)}  ${jeu.t('fiche.puissance')} ${
            move.puissance || '—'
          }  ${jeu.t('fiche.precision')} ${move.precision === 0 ? jeu.t('fiche.infaillible') : move.precision}`;
    peintre.texte(chiffres, x, y, { couleur: COULEURS.texteAttenue });

    // Une attaque de statut ne se mesure pas à la table des types : l'annoncer
    // « très efficace » induirait en erreur.
    if (move.categorie === 'statut') return;
    const palier = effectivenessTier(effectivenessAgainst(move.type, SPECIES[this.adversaire.speciesId].types));
    if (palier === 'neutral') return;
    peintre.texteDroite(jeu.t(`combat.efficace.${palier}` as CleTexte), bordDroit, y, {
      couleur: palier === 'strong' || palier === 'veryStrong' ? COULEURS.pvHaut : COULEURS.pvBas,
    });
  }

  /** Dessine la tranche visible d'une liste, avec un repère quand elle déborde. */
  private listeDeroulante<T>(jeu: Jeu, entrees: readonly T[], y: number, libelle: (entree: T) => string): void {
    entrees.slice(this.defilement, this.defilement + LIGNES_VISIBLES).forEach((entree, ligne) => {
      const index = this.defilement + ligne;
      this.option(jeu, libelle(entree), 20, y + 8 + ligne * 12, index === this.selection);
    });
    if (entrees.length > LIGNES_VISIBLES) {
      jeu.peintre.texteDroite(`${this.selection + 1}/${entrees.length}`, VIRTUAL_WIDTH - 16, y + 32, {
        couleur: COULEURS.texteAttenue,
      });
    }
  }

  private option(jeu: Jeu, libelle: string, x: number, y: number, choisi: boolean): void {
    if (choisi) jeu.peintre.texte('▶', x - 10, y, { couleur: COULEURS.selection });
    jeu.peintre.texte(libelle, x, y, { couleur: choisi ? COULEURS.texteAccent : COULEURS.texte });
  }
}

/** Premier index visible d'une liste déroulante gardant la sélection dans le cadre. */
function fenetre(selection: number, nombre: number): number {
  if (nombre <= LIGNES_VISIBLES) return 0;
  return Math.max(0, Math.min(selection - LIGNES_VISIBLES + 1, nombre - LIGNES_VISIBLES));
}
