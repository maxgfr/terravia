/**
 * Écran-titre : nouvelle partie, reprise, import, choix de la langue.
 *
 * C'est aussi là que se choisit la seed. Elle est proposée mais modifiable — partager
 * une seed est la façon de partager un monde, et l'écran doit le rendre évident.
 */

import { makeSeedText } from '../core/rng.ts';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { STARTER_IDS, SPECIES, type SpeciesId } from '../data/species.ts';
import { creerCreature } from '../game/creature.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import { accueillirCreature, creerPartie, poserDrapeau, prochainIdentifiant } from '../game/state.ts';
import { chargerDepuisTexte } from '../save/serialize.ts';
import { choisirFichier, lireSauvegardeLocale } from '../save/storage.ts';
import { COULEURS } from '../ui/draw.ts';
import { viser, type Colonne } from '../ui/liste.ts';
import { type CleTexte } from '../i18n/index.ts';
import { SceneAide } from './aide.ts';
import { SceneEncyclopedie } from './encyclopedie.ts';
import { entrerDansLaPartie, traiterImport } from './partie.ts';

type Ecran = 'accueil' | 'seed' | 'starter';

export class SceneTitre implements Scene {
  readonly nom = 'titre';
  readonly opaque = true;

  private ecran: Ecran = 'accueil';
  private selection = 0;
  private seedProposee: string;
  private temps = 0;
  private aUneSauvegarde = false;

  constructor(seedInitiale: string) {
    this.seedProposee = seedInitiale;
  }

  entrer(): void {
    this.aUneSauvegarde = lireSauvegardeLocale() !== null;
  }

  /**
   * Les réglages figurent ici en propre.
   *
   * Ils vivaient derrière un engrenage flottant, doublon de l'entrée du menu de pause.
   * L'engrenage retiré, l'écran-titre a besoin de son propre accès : c'est là que se
   * choisit la langue, et un joueur qui ne comprend pas ce premier écran doit pouvoir
   * en changer sans deviner comment naviguer.
   */
  private get entrees(): readonly CleTexte[] {
    return [
      ...(this.aUneSauvegarde ? (['titre.continuer'] as const) : []),
      'titre.nouvellePartie',
      'titre.importer',
      'parametres.langue',
      'encyclopedie.titre',
      'parametres.commentJouer',
    ];
  }

  mettreAJour(jeu: Jeu, step: number): void {
    this.temps += step;
    if (jeu.dialogue.actif) {
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }

    if (this.ecran === 'accueil') this.accueil(jeu);
    else if (this.ecran === 'seed') this.choixSeed(jeu);
    else this.choixStarter(jeu);
  }

  private naviguer(jeu: Jeu, nombre: number): void {
    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + 1) % nombre;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - 1 + nombre) % nombre;
  }

  /**
   * Le panneau d'accueil se dimensionne sur son entrée la plus longue.
   *
   * La mesure sert deux fois — à le dessiner et à savoir où l'on clique — donc elle vit
   * ici plutôt que dans le rendu : une largeur calculée deux fois finit par diverger.
   */
  private cadreAccueil(jeu: Jeu): { gauche: number; largeur: number; hauteur: number } {
    const entrees = this.entrees;
    const largeurTexte = Math.max(...entrees.map((cle) => jeu.peintre.largeurTexte(jeu.t(cle))));
    const largeur = Math.min(VIRTUAL_WIDTH - 24, largeurTexte + 40);
    return {
      gauche: Math.round(VIRTUAL_WIDTH / 2 - largeur / 2),
      largeur,
      hauteur: entrees.length * 14 + 16,
    };
  }

  /** Hauteur du texte d'explication de l'écran de seed : les options s'y accrochent. */
  private hauteurTexteSeed(jeu: Jeu): number {
    const largeurPanneau = VIRTUAL_WIDTH - 40;
    return jeu.peintre.decouper(jeu.t('titre.seedLibre'), largeurPanneau - 20).length * jeu.peintre.hauteurLigne;
  }

  /** Le pointeur sur une liste : il déplace la sélection, son clic la valide. */
  private validee(jeu: Jeu, colonne: Colonne): boolean {
    const { survol, valide } = viser(jeu.entrees, colonne);
    if (survol !== null) this.selection = survol;
    return jeu.entrees.pressee('valider') || valide;
  }

  private accueil(jeu: Jeu): void {
    const entrees = this.entrees;
    this.naviguer(jeu, entrees.length);
    const { gauche, largeur } = this.cadreAccueil(jeu);
    const colonne: Colonne = { x: gauche, largeur, y: 67, pas: 14, lignes: entrees.length };
    if (!this.validee(jeu, colonne)) return;

    switch (entrees[this.selection]) {
      case 'titre.continuer':
        this.reprendre(jeu);
        break;
      case 'titre.nouvellePartie':
        this.ecran = 'seed';
        this.selection = 0;
        break;
      case 'titre.importer':
        void this.importer(jeu);
        break;
      case 'parametres.commentJouer':
        jeu.pousser(new SceneAide());
        break;
      case 'parametres.langue': {
        jeu.basculerLangue();
        break;
      }
      case 'encyclopedie.titre':
        jeu.pousser(new SceneEncyclopedie());
        break;
    }
  }

  private reprendre(jeu: Jeu): void {
    const contenu = lireSauvegardeLocale();
    if (!contenu) return;
    const resultat = chargerDepuisTexte(contenu);
    if (!resultat.ok) {
      jeu.dialogue.dire(jeu.t('sauvegarde.invalide', { raison: jeu.motif(resultat.raison) }));
      this.aUneSauvegarde = false;
      return;
    }
    jeu.chargerPartie(resultat.valeur.state);
    // `entrerDansLaPartie` rouvre le combat que la sauvegarde portait, s'il y en avait un.
    entrerDansLaPartie(jeu);
  }

  private async importer(jeu: Jeu): Promise<void> {
    const contenu = await choisirFichier();
    if (contenu !== null) traiterImport(jeu, contenu);
  }

  private choixSeed(jeu: Jeu): void {
    // Deux entrées : retirer une nouvelle seed, ou commencer avec celle affichée.
    this.naviguer(jeu, 2);
    if (jeu.entrees.pressee('annuler')) {
      this.ecran = 'accueil';
      this.selection = 0;
      return;
    }
    const colonne: Colonne = {
      x: 20,
      largeur: VIRTUAL_WIDTH - 40,
      y: 89 + this.hauteurTexteSeed(jeu),
      pas: 14,
      lignes: 2,
    };
    if (!this.validee(jeu, colonne)) return;
    if (this.selection === 0) {
      this.seedProposee = makeSeedText(jeu.rng.next());
      return;
    }
    jeu.chargerPartie(creerPartie(this.seedProposee, jeu.langue));
    this.ecran = 'starter';
    this.selection = 0;
  }

  /** Le trio de cette seed. Le monde en décide, l'écran ne fait que le montrer. */
  private starters(jeu: Jeu): readonly SpeciesId[] {
    return jeu.monde.starters.length === 3 ? jeu.monde.starters : STARTER_IDS;
  }

  private choixStarter(jeu: Jeu): void {
    const starters = this.starters(jeu);

    // Une sortie, comme sur l'écran de seed. Il n'y en avait aucune : ni au clavier, ni à
    // la souris, ni au doigt. On ne pouvait quitter cet écran qu'en choisissant une
    // créature ou en rechargeant la page — alors que `chargerPartie` a déjà remplacé
    // l'état par une partie neuve.
    if (jeu.entrees.pressee('annuler')) {
      jeu.chargerPartie(creerPartie(this.seedProposee, jeu.langue));
      this.ecran = 'seed';
      this.selection = 0;
      return;
    }

    if (jeu.entrees.pressee('est')) this.selection = (this.selection + 1) % starters.length;
    if (jeu.entrees.pressee('ouest')) {
      this.selection = (this.selection - 1 + starters.length) % starters.length;
    }

    // Les trois starters sont côte à côte, pas empilés : chaque carte est sa propre
    // zone, du cadre de sélection jusqu'à la plaque de type sous le nom.
    let cliquee = false;
    starters.forEach((_, index) => {
      if (!jeu.survole(24 + index * 96 - 4, 66, 72, 100)) return;
      if (jeu.entrees.pointeurBouge()) this.selection = index;
      if (jeu.entrees.cliquePresse()) {
        this.selection = index;
        cliquee = true;
      }
    });

    if (!jeu.entrees.pressee('valider') && !cliquee) return;

    const choisi = starters[this.selection]!;
    void jeu.dialogue
      .demander(jeu.t('depart.confirmer', { nom: jeu.nomEspece(choisi) }), [
        jeu.t('depart.oui'),
        jeu.t('depart.non'),
      ])
      .then((reponse) => {
        if (reponse !== 0) return;
        const starter = creerCreature(jeu.rng, {
          uid: prochainIdentifiant(jeu.state),
          speciesId: choisi,
          niveau: 5,
          origine: jeu.state.seedText,
        });
        accueillirCreature(jeu.state, starter);
        poserDrapeau(jeu.state, 'starterChoisi');

        // Le point de départ vient de la région, pas d'une position codée en dur.
        const depart = jeu.monde.region(0).depart;
        jeu.state.joueur.x = depart.x;
        jeu.state.joueur.y = depart.y;
        jeu.state.joueur.refuge = { regionIndex: 0, x: depart.x, y: depart.y };
        jeu.sauvegarderLocalement();
        entrerDansLaPartie(jeu);
      });
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, COULEURS.fond);

    // Bandeau de créatures en fond : elles défilent lentement, sans distraire.
    const defilement = (this.temps * 8) % (VIRTUAL_WIDTH + 64);
    this.starters(jeu).forEach((species, index) => {
      peintre.creature(species, 'face', VIRTUAL_WIDTH - defilement + index * 90, 118, {
        echelle: 0.8,
        opacite: 0.22,
      });
    });

    // L'écran de choix du starter n'affiche pas le titre : sa question tient sur deux
    // lignes et venait se coller au sous-titre.
    if (this.ecran !== 'starter') {
      peintre.texteCentre('TERRAVIA', VIRTUAL_WIDTH / 2, 26, { couleur: COULEURS.texteInverse });
      peintre.texteCentre(jeu.t('titre.sousTitre'), VIRTUAL_WIDTH / 2, 40, {
        couleur: COULEURS.texteAttenue,
      });
    }

    if (this.ecran === 'accueil') this.dessinerAccueil(jeu);
    else if (this.ecran === 'seed') this.dessinerSeed(jeu);
    else this.dessinerStarter(jeu);

    jeu.dialogue.dessiner();
  }

  private dessinerAccueil(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const entrees = this.entrees;
    const { gauche, largeur, hauteur } = this.cadreAccueil(jeu);

    peintre.panneau(gauche, 62, largeur, hauteur);
    entrees.forEach((cle, index) => {
      const y = 70 + index * 14;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', gauche + 8, y, { couleur: COULEURS.selection });
      peintre.texte(jeu.t(cle), gauche + 20, y, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
    });
    peintre.texteCentre(jeu.t('aide.deplacer'), VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 26, {
      couleur: COULEURS.texteAttenue,
    });
    peintre.texteCentre(jeu.t('aide.action'), VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 15, {
      couleur: COULEURS.texteAttenue,
    });
  }

  private dessinerSeed(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const marge = 20;
    const largeurPanneau = VIRTUAL_WIDTH - marge * 2;
    // Le texte est découpé avant d'être centré : à 320 pixels de large, cette phrase
    // sortait du cadre en français comme en anglais. On mesure d'abord pour que le
    // panneau s'adapte à la hauteur réelle, quelle que soit la langue.
    const hauteurTexte = this.hauteurTexteSeed(jeu);

    peintre.panneau(marge, 62, largeurPanneau, hauteurTexte + 58);
    peintre.texteCentreBloc(jeu.t('titre.seedLibre'), VIRTUAL_WIDTH / 2, 70, largeurPanneau - 20, {
      couleur: COULEURS.texteAttenue,
    });
    peintre.texteCentre(this.seedProposee, VIRTUAL_WIDTH / 2, 74 + hauteurTexte, {
      couleur: COULEURS.texteAccent,
    });

    const options = [jeu.t('titre.autreSeed'), jeu.t('titre.commencer')];
    options.forEach((libelle, index) => {
      const y = 92 + hauteurTexte + index * 14;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', marge + 14, y, { couleur: COULEURS.selection });
      peintre.texte(libelle, marge + 26, y, { couleur: choisi ? COULEURS.texteAccent : COULEURS.texte });
    });
    peintre.texteCentre(jeu.t('titre.retour'), VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 16, {
      couleur: COULEURS.texteAttenue,
    });
  }

  private dessinerStarter(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.texteCentreBloc(jeu.t('depart.question'), VIRTUAL_WIDTH / 2, 24, VIRTUAL_WIDTH - 24, {
      couleur: COULEURS.texteInverse,
      ombre: true,
    });

    this.starters(jeu).forEach((species, index) => {
      const x = 24 + index * 96;
      const choisi = index === this.selection;
      peintre.creature(species, 'face', x, 70, { echelle: 1, opacite: choisi ? 1 : 0.55 });
      peintre.texteCentre(jeu.nomEspece(species), x + 32, 138, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texteAttenue,
        ombre: true,
      });
      const type = SPECIES[species].types[0];
      peintre.plaqueType(type, jeu.nomType(type), x + 32 - peintre.largeurPlaque / 2, 150);
      if (choisi) peintre.contour(x - 4, 66, 72, 100, COULEURS.selection);
    });

    // La même mention que sur l'écran de seed : la sortie existe, encore faut-il le dire.
    peintre.texteCentre(jeu.t('titre.retour'), VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 16, {
      couleur: COULEURS.texteAttenue,
      ombre: true,
    });
  }
}
