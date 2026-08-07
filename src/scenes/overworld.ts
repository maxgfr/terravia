/**
 * Le monde parcouru : déplacement case par case, interactions, rencontres.
 *
 * Le joueur avance d'une case à la fois, avec une interpolation entre les deux — c'est
 * ce qui donne la sensation « grille » du genre tout en restant fluide. Aucune action
 * n'est prise pendant qu'un pas est en cours : les entrées sont lues, mais elles ne
 * font que préparer le pas suivant.
 */

import { TILE_SIZE, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { rngFor } from '../core/rng.ts';
import { creerCreature } from '../game/creature.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import {
  aDrapeau,
  acheter,
  ajouterObjet,
  avancerTemps,
  dresseurVaincu,
  equipeHorsCombat,
  marquerObjetRamasse,
  objetRamasse,
  phaseDuJour,
  poserDrapeau,
  prochainIdentifiant,
  soignerEquipe,
} from '../game/state.ts';
import { ITEMS, SHOP_STOCK } from '../data/items.ts';
import { DIRECTION_VECTORS, type Direction } from '../world/characterIds.ts';
import { TAUX_RENCONTRE, tirerRencontre } from '../world/encounters.ts';
import type { Dresseur, Entite } from '../world/entities.ts';
import { lireTuile, type Region } from '../world/region.ts';
import { TILES } from '../world/tiles.ts';
import { COULEURS } from '../ui/draw.ts';
import { SceneCombat } from './combat.ts';
import { SceneMenu } from './menu.ts';

/** Durée d'un pas, en secondes. Plus court paraît nerveux, plus long paraît pâteux. */
const DUREE_PAS = 0.15;

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
  private transitionEnCours = false;

  entrer(jeu: Jeu): void {
    this.annoncerRegion(jeu);
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

    if (this.annonce) {
      this.annonce.restant -= step;
      if (this.annonce.restant <= 0) this.annonce = null;
    }

    if (jeu.dialogue.actif) {
      jeu.dialogue.mettreAJour(step, jeu.entrees);
      return;
    }

    if (this.pas) {
      this.avancerPas(jeu, step);
      return;
    }

    if (jeu.entrees.pressee('menu')) {
      jeu.pousser(new SceneMenu());
      return;
    }
    if (jeu.entrees.pressee('valider')) {
      this.interagir(jeu);
      return;
    }

    const direction = this.directionDemandee(jeu);
    if (direction) this.tenterPas(jeu, direction);
  }

  private directionDemandee(jeu: Jeu): Direction | null {
    for (const direction of ['nord', 'sud', 'est', 'ouest'] as const) {
      if (jeu.entrees.maintenue(direction)) return direction;
    }
    return null;
  }

  private tenterPas(jeu: Jeu, direction: Direction): void {
    const joueur = jeu.state.joueur;
    joueur.direction = direction;

    const { dx, dy } = DIRECTION_VECTORS[direction];
    const versX = joueur.x + dx;
    const versY = joueur.y + dy;
    const region = this.region(jeu);
    const tuile = lireTuile(region, versX, versY);

    // Un rebord ne se franchit que vers le sud, et d'un saut par-dessus la case.
    const rebord = TILES[tuile].ledge === 'sud';
    if (rebord && direction !== 'sud') return;

    if (TILES[tuile].solid && !rebord) return;
    if (this.entiteEn(region, versX, versY, jeu)) return;

    const arriveeY = rebord ? versY + 1 : versY;
    if (rebord && TILES[lireTuile(region, versX, arriveeY)].solid) return;

    this.pas = {
      depuisX: joueur.x,
      depuisY: joueur.y,
      versX,
      versY: arriveeY,
      progression: 0,
      saut: rebord,
    };
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
  }

  // ── Ce qui se déclenche en posant le pied ──────────────────────────────────

  private aArriveSurUneCase(jeu: Jeu): void {
    const region = this.region(jeu);
    const joueur = jeu.state.joueur;

    const sortie = region.sorties.find((candidate) => candidate.x === joueur.x && candidate.y === joueur.y);
    if (sortie) {
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

    const rencontre = tirerRencontre(jeu.rng, region.biome, phaseDuJour(jeu.state), region.niveaux);
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
    if (this.transitionEnCours) return;
    this.transitionEnCours = true;

    const joueur = jeu.state.joueur;
    joueur.regionIndex = vers;
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
    this.transitionEnCours = false;
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  private interagir(jeu: Jeu): void {
    const joueur = jeu.state.joueur;
    const { dx, dy } = DIRECTION_VECTORS[joueur.direction];
    const region = this.region(jeu);
    const cible = region.entites.find(
      (entite) => entite.x === joueur.x + dx && entite.y === joueur.y + dy,
    );
    if (!cible) return;

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
        break;
    }
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
    const libelles = SHOP_STOCK.map(
      (item) => `${jeu.nomObjet(item)}  ${jeu.t('boutique.pieces', { pieces: ITEMS[item].prix })}`,
    );
    void jeu.dialogue
      .demander(jeu.t('boutique.titre'), [...libelles, jeu.t('boutique.quitter')])
      .then((choix) => {
        const item = SHOP_STOCK[choix];
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

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const region = this.region(jeu);
    const joueur = jeu.state.joueur;

    const { pixelX, pixelY } = this.positionPixel(joueur.x, joueur.y);
    // La caméra suit le joueur mais s'arrête aux bords : on ne montre jamais le vide
    // autour de la carte.
    const cameraX = Math.max(
      0,
      Math.min(region.width * TILE_SIZE - VIRTUAL_WIDTH, pixelX + TILE_SIZE / 2 - VIRTUAL_WIDTH / 2),
    );
    const cameraY = Math.max(
      0,
      Math.min(region.height * TILE_SIZE - VIRTUAL_HEIGHT, pixelY + TILE_SIZE / 2 - VIRTUAL_HEIGHT / 2),
    );

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
    const heure = `${String(heures).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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

