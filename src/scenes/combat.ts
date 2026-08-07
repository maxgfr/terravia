/**
 * L'écran de combat.
 *
 * Cette scène **ne connaît aucune règle de combat**. Elle demande une action, la passe
 * au moteur, reçoit une liste d'événements et les joue un par un. Ajouter une animation
 * ici ne peut donc pas modifier un calcul de dégâts, et un combat testé sans écran se
 * déroule exactement de la même façon avec.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { MOVES } from '../data/moves.ts';
import { SPECIES } from '../data/species.ts';
import { STAT_NAMES } from '../data/stats.ts';
import { ITEMS } from '../data/items.ts';
import { choisirAttaque, choisirRemplacant, type NiveauIA } from '../battle/ai.ts';
import { creerCombattant } from '../battle/damage.ts';
import {
  creerCombat,
  evenementsEntree,
  resoudreTour,
  type Action,
  type BattleEvent,
  type BattleState,
} from '../battle/engine.ts';
import {
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
  distribuerDressage,
  donnerBadge,
  equipeDebout,
  marquerDresseurVaincu,
  marquerVu,
  prochainIdentifiant,
  retirerObjet,
  sacTrie,
  soignerEquipe,
} from '../game/state.ts';
import { experienceForLevel } from '../data/stats.ts';
import type { Dresseur } from '../world/entities.ts';
import { COULEURS } from '../ui/draw.ts';

export interface Rencontre {
  readonly genre: 'sauvage' | 'dresseur';
  readonly adversaires: CreatureInstance[];
  readonly dresseur?: Dresseur;
}

type Menu = 'racine' | 'attaques' | 'sac' | 'equipe';

export class SceneCombat implements Scene {
  readonly nom = 'combat';
  readonly opaque = true;

  private state!: BattleState;
  private indexJoueur = 0;
  private indexAdverse = 0;
  private menu: Menu = 'racine';
  private selection = 0;
  private attente = false;
  private tremblement = 0;

  private readonly rencontre: Rencontre;

  constructor(rencontre: Rencontre) {
    this.rencontre = rencontre;
  }

  entrer(jeu: Jeu): void {
    this.indexJoueur = jeu.state.equipe.findIndex((membre) => membre.pv > 0);
    if (this.indexJoueur < 0) this.indexJoueur = 0;
    this.demarrer(jeu);
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
    if (this.tremblement > 0) this.tremblement = Math.max(0, this.tremblement - step * 4);

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

  private naviguer(jeu: Jeu, nombre: number, colonnes = 1): void {
    if (nombre === 0) return;
    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + colonnes) % nombre;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - colonnes + nombre) % nombre;
    if (colonnes > 1) {
      if (jeu.entrees.pressee('est')) this.selection = (this.selection + 1) % nombre;
      if (jeu.entrees.pressee('ouest')) this.selection = (this.selection - 1 + nombre) % nombre;
    }
  }

  private menuRacine(jeu: Jeu): void {
    this.naviguer(jeu, 4, 2);
    if (!jeu.entrees.pressee('valider')) return;
    if (this.selection === 0) {
      this.menu = 'attaques';
      this.selection = 0;
    } else if (this.selection === 1) {
      this.menu = 'sac';
      this.selection = 0;
    } else if (this.selection === 2) {
      this.menu = 'equipe';
      this.selection = 0;
    } else {
      this.agir(jeu, { kind: 'fuite' });
    }
  }

  private menuAttaques(jeu: Jeu): void {
    const attaques = this.creatureJoueur.moves;
    this.naviguer(jeu, attaques.length, 2);
    if (jeu.entrees.pressee('annuler')) {
      this.menu = 'racine';
      this.selection = 0;
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;
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
      this.menu = 'racine';
      this.selection = 0;
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;

    const choisi = objets[this.selection];
    if (!choisi) return;
    const effet = ITEMS[choisi.item].effet;
    if (effet.kind === 'capture') {
      if (this.rencontre.genre === 'dresseur') return;
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
      this.menu = 'racine';
      this.selection = 0;
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;

    const choisi = equipe[this.selection];
    if (!choisi || choisi.pv <= 0 || this.selection === this.indexJoueur) {
      jeu.dialogue.dire(jeu.t('combat.pasDeFuite'));
      return;
    }
    this.indexJoueur = this.selection;
    this.state.joueur = creerCombattant(choisi);
    jeu.dialogue.dire(jeu.t('combat.envoie', { nom: jeu.nomCreature(choisi) }));
    this.agir(jeu, { kind: 'changer' });
  }

  // ── Résolution ─────────────────────────────────────────────────────────────

  private agir(jeu: Jeu, action: Action): void {
    this.menu = 'racine';
    this.selection = 0;
    const choixAdverse = choisirAttaque(this.state.adversaire, this.state.joueur, this.niveauIA, jeu.rng);
    const evenements = resoudreTour(this.state, action, choixAdverse, jeu.rng);
    this.jouer(jeu, evenements);
  }

  /** Traduit chaque événement du moteur en une ligne de dialogue. */
  private jouer(jeu: Jeu, evenements: readonly BattleEvent[]): void {
    for (const evenement of evenements) {
      const message = this.decrire(jeu, evenement);
      if (message) jeu.dialogue.dire(message);
      if (evenement.type === 'degats' && evenement.montant > 0) this.tremblement = 1;
    }
    this.attente = true;
    jeu.dialogue.puis(() => {
      this.attente = false;
      this.apresTour(jeu);
    });
  }

  private decrire(jeu: Jeu, evenement: BattleEvent): string | null {
    const nomDe = (cote: 'joueur' | 'adversaire'): string =>
      jeu.nomCreature(cote === 'joueur' ? this.creatureJoueur : this.adversaire);

    switch (evenement.type) {
      case 'message':
        return jeu.t(evenement.cle as never, evenement.params);
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
    jeu.sauvegarderLocalement();
    jeu.dialogue.puis(() => jeu.retirer());
  }

  private adversaireVaincu(jeu: Jeu): void {
    const vaincu = this.adversaire;
    const gagnante = this.creatureJoueur;

    const xp = experienceGagnee(vaincu, this.rencontre.genre === 'dresseur');
    const avant = gagnante.niveau;
    const gain = gagnerExperience(gagnante, xp);
    jeu.dialogue.dire(jeu.t('combat.gainXp', { nom: jeu.nomCreature(gagnante), xp }));

    const dressage = dressageGagne(vaincu);
    distribuerDressage(jeu.state, dressage.stat, dressage.points);

    if (gain.niveauApres > avant) {
      jeu.dialogue.dire(jeu.t('combat.niveau', { nom: jeu.nomCreature(gagnante), niveau: gain.niveauApres }));
    }
    for (const attaque of gain.nouvellesAttaques) {
      if (gagnante.moves.length < 4) {
        gagnante.moves.push({ id: attaque, pp: MOVES[attaque].pp });
        jeu.dialogue.dire(jeu.t('combat.apprend', { nom: jeu.nomCreature(gagnante), attaque: jeu.nomAttaque(attaque) }));
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
      marquerVu(jeu.state, this.adversaire.speciesId);
      jeu.dialogue.dire(
        jeu.t('combat.adversaireEnvoie', {
          dresseur: this.nomDresseur(jeu),
          nom: jeu.nomCreature(this.adversaire),
        }),
      );
      this.jouer(jeu, evenementsEntree(this.state, 'adversaire'));
      return;
    }

    if (this.rencontre.dresseur) {
      const dresseur = this.rencontre.dresseur;
      marquerDresseurVaincu(jeu.state, dresseur.id);
      jeu.state.joueur.pieces += dresseur.recompense;
      jeu.dialogue.dire(jeu.t('combat.recompense', { pieces: dresseur.recompense }));
      jeu.dialogue.dire(jeu.dialogueDe(dresseur.dialogueVaincu));
      if (dresseur.champion) donnerBadge(jeu.state, 'arene');
    }

    jeu.sauvegarderLocalement();
    jeu.dialogue.puis(() => jeu.retirer());
  }

  private creatureVaincue(jeu: Jeu): void {
    const debout = equipeDebout(jeu.state);
    if (debout.length > 0) {
      const suivant = jeu.state.equipe.indexOf(debout[0]!);
      this.indexJoueur = suivant;
      this.state.joueur = creerCombattant(debout[0]!);
      this.state.issue = null;
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
      jeu.sauvegarderLocalement();
      jeu.retirer();
    });
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, '#1b2430');
    peintre.remplir(0, 96, VIRTUAL_WIDTH, VIRTUAL_HEIGHT - 96, '#2a3a2c');

    const secousse = this.tremblement > 0 ? Math.round(Math.sin(this.tremblement * 26) * 2) : 0;

    peintre.creature(this.adversaire.speciesId, 'face', VIRTUAL_WIDTH - 96 + secousse, 22, { echelle: 1 });
    peintre.creature(this.creatureJoueur.speciesId, 'dos', 26, 76, { echelle: 1.25 });

    this.dessinerJauge(jeu, this.adversaire, 8, 10, false);
    this.dessinerJauge(jeu, this.creatureJoueur, VIRTUAL_WIDTH - 130, 82, true);

    if (!jeu.dialogue.actif && !this.attente) this.dessinerMenu(jeu);
    jeu.dialogue.dessiner();
  }

  private dessinerJauge(jeu: Jeu, creature: CreatureInstance, x: number, y: number, avecXp: boolean): void {
    const peintre = jeu.peintre;
    peintre.panneau(x, y, 122, avecXp ? 40 : 34);
    peintre.texte(jeu.nomCreature(creature), x + 8, y + 6);
    peintre.texteDroite(jeu.t('fiche.niveau', { niveau: creature.niveau }), x + 114, y + 6);

    const ratio = creature.pv / pvMax(creature);
    peintre.texte(jeu.t('fiche.pv'), x + 8, y + 18, { couleur: COULEURS.texteAttenue });
    peintre.barrePv(x + 26, y + 19, 88, ratio);

    if (creature.statut) {
      peintre.texte(STAT_NAMES.pv.court, x + 8, y + 28, { couleur: COULEURS.texteAttenue });
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
    const peintre = jeu.peintre;
    const y = VIRTUAL_HEIGHT - 52;
    peintre.panneau(6, y, VIRTUAL_WIDTH - 12, 46);

    if (this.menu === 'racine') {
      const entrees = [jeu.t('combat.attaquer'), jeu.t('combat.sac'), jeu.t('combat.equipe'), jeu.t('combat.fuir')];
      entrees.forEach((libelle, index) => {
        const colonne = index % 2;
        const ligne = Math.floor(index / 2);
        this.option(jeu, libelle, 20 + colonne * 150, y + 10 + ligne * 14, index === this.selection);
      });
      return;
    }

    if (this.menu === 'attaques') {
      const attaques = this.creatureJoueur.moves;
      attaques.forEach((slot, index) => {
        const colonne = index % 2;
        const ligne = Math.floor(index / 2);
        const move = MOVES[slot.id];
        const libelle = `${move.nom[jeu.langue]}  ${slot.pp}/${move.pp}`;
        this.option(jeu, libelle, 16 + colonne * 152, y + 10 + ligne * 14, index === this.selection);
      });
      return;
    }

    if (this.menu === 'sac') {
      const objets = sacTrie(jeu.state).filter((entree) => ITEMS[entree.item].usage !== 'monde');
      if (objets.length === 0) {
        peintre.texte(jeu.t('menu.vide'), 20, y + 12, { couleur: COULEURS.texteAttenue });
        return;
      }
      objets.slice(0, 3).forEach((entree, index) => {
        const libelle = `${jeu.nomObjet(entree.item)} × ${entree.nombre}`;
        this.option(jeu, libelle, 20, y + 8 + index * 12, index === this.selection);
      });
      return;
    }

    jeu.state.equipe.slice(0, 3).forEach((membre, index) => {
      const libelle = `${jeu.nomCreature(membre)}  ${membre.pv}/${pvMax(membre)}`;
      this.option(jeu, libelle, 20, y + 8 + index * 12, index === this.selection);
    });
  }

  private option(jeu: Jeu, libelle: string, x: number, y: number, choisi: boolean): void {
    if (choisi) jeu.peintre.texte('▶', x - 10, y, { couleur: COULEURS.selection });
    jeu.peintre.texte(libelle, x, y, { couleur: choisi ? COULEURS.texteAccent : COULEURS.texte });
  }

}
