/**
 * L'encyclopédie : tout ce que le jeu contient, consultable hors partie.
 *
 * Le Terradex ne montre que ce qu'on a rencontré — c'est son intérêt, et il le garde.
 * Mais rien nulle part ne répondait aux questions qu'un joueur se pose vraiment : quelles
 * attaques existent, à quoi sert cet objet, où trouve-t-on de quoi capturer. Cet écran y
 * répond sans rien dévoiler d'une partie en cours : il décrit le **jeu**, pas la partie.
 *
 * Trois rayons, une liste à gauche, le détail à droite. La liste défile, le détail suit.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import { ITEMS, ITEM_IDS, SHOP_STOCK, type ItemId } from '../data/items.ts';
import { MOVES, MOVE_IDS, type MoveId } from '../data/moves.ts';
import { SPECIES, SPECIES_IDS, baseStatTotal, type SpeciesId } from '../data/species.ts';
import { BIOME_NAMES } from '../data/biomes.ts';
import { TALENTS } from '../data/talents.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import { COULEURS } from '../ui/draw.ts';
import { viser } from '../ui/liste.ts';
import type { CleTexte } from '../i18n/index.ts';

const RAYONS = ['encyclopedie.creatures', 'encyclopedie.attaques', 'encyclopedie.objets'] as const;

export class SceneEncyclopedie implements Scene {
  readonly nom = 'encyclopedie';
  readonly opaque = true;

  private rayon = 0;
  /** Un curseur par rayon : on retrouve sa page en revenant. */
  private readonly selections = [0, 0, 0];

  private get entrees(): readonly string[] {
    if (RAYONS[this.rayon] === 'encyclopedie.creatures') return SPECIES_IDS;
    if (RAYONS[this.rayon] === 'encyclopedie.attaques') return MOVE_IDS;
    return ITEM_IDS;
  }

  private get selection(): number {
    return this.selections[this.rayon]!;
  }

  private set selection(valeur: number) {
    this.selections[this.rayon] = valeur;
  }

  /** Lignes de liste tenant dans la hauteur courante. */
  private get lignes(): number {
    return Math.max(6, Math.floor((VIRTUAL_HEIGHT - 56) / 12));
  }

  mettreAJour(jeu: Jeu): void {
    if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('menu')) {
      jeu.retirer();
      return;
    }
    // Est et ouest changent de rayon, nord et sud parcourent la liste : deux axes, deux
    // rôles, sans mode ni validation.
    if (jeu.entrees.pressee('est')) this.rayon = (this.rayon + 1) % RAYONS.length;
    if (jeu.entrees.pressee('ouest')) this.rayon = (this.rayon - 1 + RAYONS.length) % RAYONS.length;

    const total = this.entrees.length;
    if (jeu.entrees.pressee('sud')) this.selection = (this.selection + 1) % total;
    if (jeu.entrees.pressee('nord')) this.selection = (this.selection - 1 + total) % total;

    this.viserOnglets(jeu);
    this.viserListe(jeu, total);
  }

  /** Les trois rayons se cliquent comme des onglets, à leur largeur réelle de texte. */
  private viserOnglets(jeu: Jeu): void {
    if (!jeu.entrees.cliquePresse()) return;
    let x = 16;
    RAYONS.forEach((cle, index) => {
      const largeur = jeu.peintre.largeurTexte(jeu.t(cle));
      if (jeu.survole(x - 4, 10, largeur + 8, 13)) this.rayon = index;
      x += largeur + 12;
    });
  }

  /**
   * Le survol de la liste déplace le curseur — il n'y a rien à valider ici.
   *
   * L'encyclopédie n'a pas de validation : le détail de droite suit la sélection en
   * permanence. Survoler une entrée suffit donc à la consulter, et cliquer aussi.
   */
  private viserListe(jeu: Jeu, total: number): void {
    const debut = this.premiereLigneVisible();
    const { survol } = viser(jeu.entrees, {
      x: 10,
      largeur: Math.min(150, Math.floor(VIRTUAL_WIDTH * 0.42)),
      y: 27,
      pas: 12,
      lignes: Math.min(this.lignes, total - debut),
      depuis: debut,
    });
    if (survol !== null) this.selection = survol;
  }

  /**
   * Index de l'entrée dessinée tout en haut de la liste.
   *
   * La liste se recentre sur la sélection : sans ce calcul partagé, un clic sur la
   * troisième ligne désignerait la troisième entrée du rayon, pas la troisième affichée.
   */
  private premiereLigneVisible(): number {
    return Math.max(0, Math.min(this.selection - Math.floor(this.lignes / 2), this.entrees.length - this.lignes));
  }

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, COULEURS.fond);
    peintre.panneau(6, 6, VIRTUAL_WIDTH - 12, VIRTUAL_HEIGHT - 12);

    // Les trois rayons en onglets, le courant surligné.
    let x = 16;
    RAYONS.forEach((cle, index) => {
      const libelle = jeu.t(cle);
      peintre.texte(libelle, x, 13, {
        couleur: index === this.rayon ? COULEURS.texteAccent : COULEURS.texteAttenue,
      });
      x += peintre.largeurTexte(libelle) + 12;
    });
    peintre.texteDroite(`${this.selection + 1}/${this.entrees.length}`, VIRTUAL_WIDTH - 16, 13, {
      couleur: COULEURS.texteAttenue,
    });

    const colonne = Math.min(150, Math.floor(VIRTUAL_WIDTH * 0.42));
    this.dessinerListe(jeu, colonne);
    this.dessinerDetail(jeu, colonne + 12);

    peintre.texte(jeu.t('encyclopedie.aide'), 16, VIRTUAL_HEIGHT - 20, {
      couleur: COULEURS.texteAttenue,
    });
  }

  private dessinerListe(jeu: Jeu, largeur: number): void {
    const peintre = jeu.peintre;
    const lignes = this.lignes;
    const debut = this.premiereLigneVisible();

    for (let ligne = 0; ligne < lignes; ligne++) {
      const index = debut + ligne;
      const id = this.entrees[index];
      if (!id) break;
      const y = 30 + ligne * 12;
      const choisi = index === this.selection;
      if (choisi) peintre.texte('▶', 14, y, { couleur: COULEURS.selection });
      // Coupé à la colonne : « Spores Engourdissantes » passait par-dessus le filet
      // séparateur et mordait sur le détail affiché à droite.
      peintre.texteTronque(this.nomDe(jeu, id), 24, y, largeur - 26, {
        couleur: choisi ? COULEURS.texteAccent : COULEURS.texte,
      });
    }
    peintre.remplir(largeur + 4, 26, 1, VIRTUAL_HEIGHT - 52, COULEURS.texteAttenue);
  }

  private nomDe(jeu: Jeu, id: string): string {
    if (RAYONS[this.rayon] === 'encyclopedie.creatures') return jeu.nomEspece(id as SpeciesId);
    if (RAYONS[this.rayon] === 'encyclopedie.attaques') return jeu.nomAttaque(id as MoveId);
    return jeu.nomObjet(id as ItemId);
  }

  private dessinerDetail(jeu: Jeu, x: number): void {
    const id = this.entrees[this.selection];
    if (!id) return;
    if (RAYONS[this.rayon] === 'encyclopedie.creatures') this.detailCreature(jeu, x, id as SpeciesId);
    else if (RAYONS[this.rayon] === 'encyclopedie.attaques') this.detailAttaque(jeu, x, id as MoveId);
    else this.detailObjet(jeu, x, id as ItemId);
  }

  /**
   * Empile des lignes en les repliant sur la largeur disponible, et rend l'ordonnée
   * suivante. La colonne de détail est étroite dès que l'écran l'est : tout texte posé
   * à coordonnée fixe finissait hors cadre.
   */
  private empiler(jeu: Jeu, x: number, y: number, largeur: number, lignes: readonly string[]): number {
    let courant = y;
    for (const ligne of lignes) {
      if (courant > this.bas(jeu)) break;
      // `texteBloc` rend la hauteur occupée, pas l'ordonnée suivante.
      courant += jeu.peintre.texteBloc(ligne, x, courant, largeur, { couleur: COULEURS.texteAttenue }) + 2;
    }
    return courant;
  }

  /** Dernière ordonnée utilisable avant la ligne d'aide du bas. */
  private bas(jeu: Jeu): number {
    return VIRTUAL_HEIGHT - 26 - jeu.peintre.hauteurLigne;
  }

  /**
   * Description repliée puis **tronquée à la place restante**.
   *
   * Un `texteBloc` non borné écrit sous le bord inférieur, où le texte n'existe tout
   * simplement pas pour le joueur : sur un écran court, la dernière ligne d'une fiche
   * de créature passait à la trappe sans que rien ne le signale.
   */
  private description(jeu: Jeu, contenu: string, x: number, y: number, largeur: number): void {
    const peintre = jeu.peintre;
    const place = Math.floor((this.bas(jeu) - y) / peintre.hauteurLigne) + 1;
    if (place <= 0) return;
    peintre.decouper(contenu, largeur).slice(0, place).forEach((ligne, index) => {
      peintre.texte(ligne, x, y + index * peintre.hauteurLigne, { couleur: COULEURS.texte });
    });
  }

  private detailCreature(jeu: Jeu, x: number, id: SpeciesId): void {
    const peintre = jeu.peintre;
    const species = SPECIES[id];
    const largeur = VIRTUAL_WIDTH - x - 14;

    peintre.creature(id, 'face', x, 24, { echelle: 0.6 });
    species.types.forEach((type, index) => {
      peintre.plaqueType(type, jeu.nomType(type), x, 66 + index * 13);
    });

    const apresTypes = 66 + species.types.length * 13 + 4;
    const suite = this.empiler(jeu, x, apresTypes, largeur, [
      `${jeu.t('encyclopedie.puissanceTotale')} ${baseStatTotal(species)}`,
      `${jeu.t('fiche.talent')} : ${species.talents.map((t) => TALENTS[t].nom[jeu.langue]).join(', ')}`,
      jeu.t('terradex.habitat', {
        biomes: species.habitats.map((b) => BIOME_NAMES[b][jeu.langue]).join(', '),
      }),
      species.evolution
        ? jeu.t('encyclopedie.evolue', {
            espece: jeu.nomEspece(species.evolution.vers),
            niveau: species.evolution.niveau,
          })
        : jeu.t('encyclopedie.lignéeFinale'),
    ]);
    this.description(jeu, species.description[jeu.langue], x, suite + 4, largeur);
  }

  private detailAttaque(jeu: Jeu, x: number, id: MoveId): void {
    const move = MOVES[id];
    const largeur = VIRTUAL_WIDTH - x - 14;

    jeu.peintre.plaqueType(move.type, jeu.nomType(move.type), x, 26);
    const suite = this.empiler(jeu, x, 42, largeur, [
      jeu.t(`encyclopedie.categorie.${move.categorie}` as CleTexte),
      `${jeu.t('fiche.puissance')} ${move.puissance || jeu.t('fiche.infaillible')}`,
      `${jeu.t('fiche.precision')} ${move.precision === 0 ? jeu.t('fiche.infaillible') : move.precision}`,
      `${jeu.t('encyclopedie.pp')} ${move.pp}`,
      ...(move.priorite !== 0 ? [jeu.t('encyclopedie.priorite', { valeur: move.priorite })] : []),
    ]);
    this.description(jeu, move.description[jeu.langue], x, suite + 4, largeur);
  }

  private detailObjet(jeu: Jeu, x: number, id: ItemId): void {
    const item = ITEMS[id];
    const largeur = VIRTUAL_WIDTH - x - 14;

    jeu.peintre.icone(id, x, 24);
    // Où s'en procurer : c'est la question qu'on se pose devant un prisme, et à
    // laquelle rien ne répondait.
    const provenance = SHOP_STOCK.includes(id as (typeof SHOP_STOCK)[number])
      ? jeu.t('encyclopedie.enBoutique', { prix: item.prix })
      : jeu.t('encyclopedie.aTrouver');
    const suite = this.empiler(jeu, x, 44, largeur, [
      jeu.t(`encyclopedie.usage.${item.usage}` as CleTexte),
      provenance,
    ]);
    this.description(jeu, item.description[jeu.langue], x, suite + 4, largeur);
  }
}
