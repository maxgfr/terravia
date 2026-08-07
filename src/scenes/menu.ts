/**
 * Menu de pause : équipe, sac, Terradex, sauvegarde.
 *
 * Il se pose **au-dessus** du monde sans l'effacer — la scène n'est pas opaque, donc
 * l'overworld reste visible derrière un voile. Le joueur ne perd jamais de vue où il se
 * trouve.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { ITEMS } from '../data/items.ts';
import { MOVES } from '../data/moves.ts';
import { SPECIES, SPECIES_IDS } from '../data/species.ts';
import { experienceForLevel } from '../data/stats.ts';
import { TALENTS } from '../data/talents.ts';
import { pvMax, type CreatureInstance } from '../game/creature.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import {
  sacTrie,
  tailleTerradex,
  tempsJoue,
  utiliserObjetSur,
} from '../game/state.ts';
import { exporterCreature, exporterPartie, nomFichier, chargerDepuisTexte, chargerCreatureDepuisTexte, importerCreature } from '../save/serialize.ts';
import { choisirFichier, telecharger } from '../save/storage.ts';
import { accueillirCreature, prochainIdentifiant } from '../game/state.ts';
import { COULEURS } from '../ui/draw.ts';
import { SceneCarte } from './carte.ts';
import { SceneParametres } from './parametres.ts';

type Onglet = 'racine' | 'equipe' | 'fiche' | 'sac' | 'terradex' | 'sauvegarde';

const ENTREES_RACINE = [
  'menu.equipe',
  'menu.sac',
  'menu.carte',
  'menu.terradex',
  'menu.sauvegarde',
  'menu.parametres',
  'menu.fermer',
] as const;
const ENTREES_SAUVEGARDE = [
  'sauvegarde.exporter',
  'sauvegarde.importer',
  'sauvegarde.exporterCreature',
  'menu.retour',
] as const;

export class SceneMenu implements Scene {
  readonly nom = 'menu';

  private onglet: Onglet = 'racine';
  private selection = 0;
  private fiche: CreatureInstance | null = null;
  private defilement = 0;

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
        if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('valider')) this.aller('equipe');
        break;
      case 'sac':
        this.sac(jeu);
        break;
      case 'terradex':
        this.terradex(jeu);
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
  }

  private naviguer(jeu: Jeu, nombre: number): void {
    if (nombre === 0) return;
    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + 1) % nombre;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - 1 + nombre) % nombre;
  }

  private racine(jeu: Jeu): void {
    this.naviguer(jeu, ENTREES_RACINE.length);
    if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('menu')) {
      jeu.retirer();
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;

    switch (ENTREES_RACINE[this.selection]) {
      case 'menu.equipe':
        this.aller('equipe');
        break;
      case 'menu.sac':
        this.aller('sac');
        break;
      case 'menu.carte':
        jeu.pousser(new SceneCarte());
        break;
      case 'menu.terradex':
        this.aller('terradex');
        break;
      case 'menu.sauvegarde':
        this.aller('sauvegarde');
        break;
      case 'menu.parametres':
        jeu.pousser(new SceneParametres());
        break;
      default:
        jeu.retirer();
    }
  }

  private equipe(jeu: Jeu): void {
    this.naviguer(jeu, jeu.state.equipe.length);
    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    if (jeu.entrees.pressee('valider')) {
      this.fiche = jeu.state.equipe[this.selection] ?? null;
      if (this.fiche) this.onglet = 'fiche';
    }
  }

  private sac(jeu: Jeu): void {
    const objets = sacTrie(jeu.state);
    this.naviguer(jeu, objets.length);
    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;

    const choisi = objets[this.selection];
    if (!choisi) return;
    const effet = ITEMS[choisi.item].effet;
    if (effet.kind !== 'soin' && effet.kind !== 'guerison') return;

    // On applique sur la première créature que l'objet peut réellement aider : proposer
    // une cible qui n'en a pas besoin gaspillerait l'objet.
    const cible = jeu.state.equipe.find(
      (membre) => utiliserObjetSurEssai(jeu, choisi.item, membre),
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

  private terradex(jeu: Jeu): void {
    this.naviguer(jeu, SPECIES_IDS.length);
    this.defilement = Math.max(0, Math.min(this.selection - 6, SPECIES_IDS.length - 13));
    if (jeu.entrees.pressee('annuler')) this.aller('racine');
  }

  private sauvegarde(jeu: Jeu): void {
    this.naviguer(jeu, ENTREES_SAUVEGARDE.length);
    if (jeu.entrees.pressee('annuler')) {
      this.aller('racine');
      return;
    }
    if (!jeu.entrees.pressee('valider')) return;

    switch (ENTREES_SAUVEGARDE[this.selection]) {
      case 'sauvegarde.exporter': {
        const horodatage = new Date().toISOString();
        telecharger(exporterPartie(jeu.state, horodatage), nomFichier(jeu.state, horodatage));
        jeu.dialogue.dire(jeu.t('sauvegarde.exportee'));
        break;
      }
      case 'sauvegarde.importer':
        void this.importer(jeu);
        break;
      case 'sauvegarde.exporterCreature': {
        const creature = jeu.state.equipe[0];
        if (!creature) break;
        telecharger(
          exporterCreature(creature, new Date().toISOString()),
          `terravia-${creature.speciesId}-${creature.uid}.json`,
        );
        jeu.dialogue.dire(jeu.t('sauvegarde.exportee'));
        break;
      }
      default:
        this.aller('racine');
    }
  }

  private async importer(jeu: Jeu): Promise<void> {
    const contenu = await choisirFichier();
    if (contenu === null) return;
    traiterImport(jeu, contenu);
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
      case 'sac':
        this.dessinerSac(jeu);
        break;
      case 'terradex':
        this.dessinerTerradex(jeu);
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
    jeu.peintre.texte(
      `${jeu.t('boutique.pieces', { pieces: jeu.state.joueur.pieces })} · ${tempsJoue(jeu.state)}`,
      18,
      VIRTUAL_HEIGHT - 24,
      { couleur: COULEURS.texteAttenue },
    );
  }

  private dessinerEquipe(jeu: Jeu): void {
    this.cadre(jeu, jeu.t('menu.equipe'));
    jeu.state.equipe.forEach((membre, index) => {
      const y = 32 + index * 26;
      const choisi = index === this.selection;
      if (choisi) jeu.peintre.texte('▶', 14, y + 6, { couleur: COULEURS.selection });
      jeu.peintre.creature(membre.speciesId, 'face', 22, y - 4, { echelle: 0.5 });
      jeu.peintre.texte(jeu.nomCreature(membre), 58, y, { couleur: choisi ? COULEURS.texteAccent : COULEURS.texte });
      jeu.peintre.texteDroite(jeu.t('fiche.niveau', { niveau: membre.niveau }), VIRTUAL_WIDTH - 20, y);
      jeu.peintre.barrePv(58, y + 12, 100, membre.pv / pvMax(membre));
      jeu.peintre.texte(`${membre.pv}/${pvMax(membre)}`, 164, y + 10, { couleur: COULEURS.texteAttenue });
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

    peintre.texte(`${jeu.t('fiche.talent')} : ${TALENTS[creature.talentId].nom[jeu.langue]}`, 78, 46, {
      couleur: COULEURS.texteAttenue,
    });
    peintre.texte(
      jeu.t('fiche.taille', { taille: species.taille.toFixed(1), poids: species.poids.toFixed(1) }),
      78,
      56,
      { couleur: COULEURS.texteAttenue },
    );
    peintre.texte(jeu.t('fiche.origine', { seed: creature.origine }), 78, 66, {
      couleur: COULEURS.texteAttenue,
    });

    const bas = experienceForLevel(creature.niveau, species.croissance);
    const haut = experienceForLevel(creature.niveau + 1, species.croissance);
    peintre.texte(jeu.t('fiche.pv'), 16, 92);
    peintre.barrePv(40, 93, 110, creature.pv / pvMax(creature));
    peintre.texte(`${creature.pv}/${pvMax(creature)}`, 156, 92, { couleur: COULEURS.texteAttenue });
    peintre.texte(jeu.t('fiche.xp'), 16, 102);
    peintre.barreXp(40, 104, 110, haut > bas ? (creature.xp - bas) / (haut - bas) : 0);

    peintre.texte(jeu.t('fiche.attaques'), 16, 118, { couleur: COULEURS.texteAccent });
    creature.moves.forEach((slot, index) => {
      const move = MOVES[slot.id];
      const y = 132 + index * 12;
      peintre.texte(move.nom[jeu.langue], 20, y);
      peintre.texteDroite(`${slot.pp}/${move.pp}`, VIRTUAL_WIDTH - 20, y, { couleur: COULEURS.texteAttenue });
      peintre.plaqueType(move.type, jeu.nomType(move.type), 150, y - 1);
    });

    peintre.texte(jeu.t('aide.fermer'), 18, VIRTUAL_HEIGHT - 22, { couleur: COULEURS.texteAttenue });
  }

  private dessinerSac(jeu: Jeu): void {
    this.cadre(jeu, jeu.t('menu.sac'));
    const objets = sacTrie(jeu.state);
    if (objets.length === 0) {
      jeu.peintre.texte(jeu.t('menu.vide'), 28, 34, { couleur: COULEURS.texteAttenue });
      return;
    }
    objets.slice(0, 12).forEach((entree, index) => {
      const y = 32 + index * 13;
      jeu.peintre.icone(entree.item, 26, y - 4);
      this.ligne(jeu, `   ${jeu.nomObjet(entree.item)}`, y, index === this.selection, `× ${entree.nombre}`);
    });
  }

  private dessinerTerradex(jeu: Jeu): void {
    const vus = jeu.state.progression.terradexVus;
    const captures = jeu.state.progression.terradexCaptures;
    this.cadre(
      jeu,
      jeu.t('terradex.progression', { vus: vus.length, total: tailleTerradex(), captures: captures.length }),
    );

    for (let ligne = 0; ligne < 13; ligne++) {
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
function utiliserObjetSurEssai(jeu: Jeu, item: keyof typeof ITEMS, cible: CreatureInstance): boolean {
  const effet = ITEMS[item].effet;
  if (effet.kind === 'soin') return cible.pv > 0 && cible.pv < pvMax(cible);
  if (effet.kind === 'guerison') {
    return cible.statut !== null && (effet.statut === 'tout' || effet.statut === cible.statut);
  }
  void jeu;
  return false;
}

/**
 * Traite un fichier déposé ou choisi : partie complète ou créature seule.
 * Un import de partie passe toujours par une confirmation — on n'écrase jamais en silence.
 */
export function traiterImport(jeu: Jeu, contenu: string): void {
  const creature = chargerCreatureDepuisTexte(contenu);
  if (creature.ok) {
    const importee = importerCreature(creature.valeur, prochainIdentifiant(jeu.state));
    accueillirCreature(jeu.state, importee);
    jeu.sauvegarderLocalement();
    jeu.dialogue.dire(jeu.t('sauvegarde.creatureImportee', { nom: jeu.nomEspece(importee.speciesId) }));
    return;
  }

  const partie = chargerDepuisTexte(contenu);
  if (!partie.ok) {
    jeu.dialogue.dire(jeu.t('sauvegarde.invalide', { raison: partie.raison }));
    return;
  }

  const resume = partie.valeur.resume;
  jeu.dialogue.dire(
    jeu.t('sauvegarde.resume', {
      seed: resume.seed,
      region: String(resume.joueur.regionIndex + 1),
      creatures: resume.equipe.length + resume.reserve.length,
      temps: `${Math.floor(resume.joueur.tempsJeuMs / 60000)} min`,
    }),
  );
  for (const avertissement of partie.valeur.avertissements) {
    jeu.dialogue.dire(jeu.t('sauvegarde.invalide', { raison: avertissement }));
  }

  void jeu.dialogue
    .demander(jeu.t('sauvegarde.confirmerImport'), [jeu.t('depart.oui'), jeu.t('depart.non')])
    .then((choix) => {
      if (choix !== 0) return;
      jeu.chargerPartie(partie.valeur.state);
      jeu.sauvegarderLocalement();
      // On repart de l'overworld : la scène courante décrivait l'ancienne partie.
      window.location.reload();
    });
}
