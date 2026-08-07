/**
 * Écran-titre : nouvelle partie, reprise, import, choix de la langue.
 *
 * C'est aussi là que se choisit la seed. Elle est proposée mais modifiable — partager
 * une seed est la façon de partager un monde, et l'écran doit le rendre évident.
 */

import { makeSeedText } from '../core/rng.ts';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { STARTER_IDS, SPECIES } from '../data/species.ts';
import { creerCreature } from '../game/creature.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import { accueillirCreature, creerPartie, poserDrapeau, prochainIdentifiant } from '../game/state.ts';
import { chargerDepuisTexte } from '../save/serialize.ts';
import { choisirFichier, enregistrerLanguePreferee, lireSauvegardeLocale } from '../save/storage.ts';
import { COULEURS } from '../ui/draw.ts';
import { SceneOverworld } from './overworld.ts';
import { traiterImport } from './menu.ts';

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

  private get entrees(): readonly string[] {
    return this.aUneSauvegarde
      ? ['titre.continuer', 'titre.nouvellePartie', 'titre.importer', 'titre.langue']
      : ['titre.nouvellePartie', 'titre.importer', 'titre.langue'];
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

  private accueil(jeu: Jeu): void {
    const entrees = this.entrees;
    this.naviguer(jeu, entrees.length);
    if (!jeu.entrees.pressee('valider')) return;

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
      case 'titre.langue':
        jeu.state.langue = jeu.langue === 'fr' ? 'en' : 'fr';
        enregistrerLanguePreferee(jeu.state.langue);
        break;
    }
  }

  private reprendre(jeu: Jeu): void {
    const contenu = lireSauvegardeLocale();
    if (!contenu) return;
    const resultat = chargerDepuisTexte(contenu);
    if (!resultat.ok) {
      jeu.dialogue.dire(jeu.t('sauvegarde.invalide', { raison: resultat.raison }));
      this.aUneSauvegarde = false;
      return;
    }
    jeu.chargerPartie(resultat.valeur.state);
    jeu.remplacer(new SceneOverworld());
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
    if (!jeu.entrees.pressee('valider')) return;
    if (this.selection === 0) {
      this.seedProposee = makeSeedText(jeu.rng.next());
      return;
    }
    jeu.chargerPartie(creerPartie(this.seedProposee, jeu.langue));
    this.ecran = 'starter';
    this.selection = 0;
  }

  private choixStarter(jeu: Jeu): void {
    if (jeu.entrees.pressee('est')) this.selection = (this.selection + 1) % STARTER_IDS.length;
    if (jeu.entrees.pressee('ouest')) {
      this.selection = (this.selection - 1 + STARTER_IDS.length) % STARTER_IDS.length;
    }
    if (!jeu.entrees.pressee('valider')) return;

    const choisi = STARTER_IDS[this.selection]!;
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
        jeu.remplacer(new SceneOverworld());
      });
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, COULEURS.fond);

    // Bandeau de créatures en fond : elles défilent lentement, sans distraire.
    const defilement = (this.temps * 8) % (VIRTUAL_WIDTH + 64);
    STARTER_IDS.forEach((species, index) => {
      peintre.creature(species, 'face', VIRTUAL_WIDTH - defilement + index * 90, 118, {
        echelle: 0.8,
        opacite: 0.22,
      });
    });

    peintre.texteCentre('TERRAVIA', VIRTUAL_WIDTH / 2, 26, { couleur: COULEURS.texteInverse });
    peintre.texteCentre(jeu.t('titre.sousTitre'), VIRTUAL_WIDTH / 2, 40, { couleur: COULEURS.texteAttenue });

    if (this.ecran === 'accueil') this.dessinerAccueil(jeu);
    else if (this.ecran === 'seed') this.dessinerSeed(jeu);
    else this.dessinerStarter(jeu);

    jeu.dialogue.dessiner();
  }

  private dessinerAccueil(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const entrees = this.entrees;
    const hauteur = entrees.length * 14 + 16;
    peintre.panneau(VIRTUAL_WIDTH / 2 - 70, 62, 140, hauteur);
    entrees.forEach((cle, index) => {
      const y = 70 + index * 14;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', VIRTUAL_WIDTH / 2 - 60, y, { couleur: COULEURS.selection });
      peintre.texte(jeu.t(cle as never), VIRTUAL_WIDTH / 2 - 48, y, {
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
    peintre.panneau(24, 62, VIRTUAL_WIDTH - 48, 76);
    peintre.texteCentre(jeu.t('titre.seedLibre'), VIRTUAL_WIDTH / 2, 70, { couleur: COULEURS.texteAttenue });
    peintre.texteCentre(this.seedProposee, VIRTUAL_WIDTH / 2, 88, { couleur: COULEURS.texteAccent });

    const options = [jeu.t('titre.autreSeed'), jeu.t('titre.commencer')];
    options.forEach((libelle, index) => {
      const y = 106 + index * 14;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', 40, y, { couleur: COULEURS.selection });
      peintre.texte(libelle, 52, y, { couleur: choisi ? COULEURS.texteAccent : COULEURS.texte });
    });
    peintre.texteCentre(jeu.t('titre.retour'), VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 18, {
      couleur: COULEURS.texteAttenue,
    });
  }

  private dessinerStarter(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.texteCentre(jeu.t('depart.question'), VIRTUAL_WIDTH / 2, 56, { couleur: COULEURS.texteInverse });

    STARTER_IDS.forEach((species, index) => {
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
  }
}
