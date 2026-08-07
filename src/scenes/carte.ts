/**
 * Carte : la région courante en miniature, et la progression dans le monde.
 *
 * Elle ne montre que les régions **déjà traversées**. Dévoiler d'avance un monde dont
 * l'intérêt est justement d'être découvert le viderait de son sens ; en revanche, se
 * repérer dans la région où l'on se trouve est un besoin réel dès qu'une carte fait
 * 48 × 36 cases pour un écran qui en montre 20 × 13.
 *
 * Chaque tuile devient un point de couleur. On ne cherche pas la fidélité, mais la
 * lisibilité : un mur doit se distinguer d'un chemin d'un seul coup d'œil.
 */

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/viewport.ts';
import type { Jeu, Scene } from '../game/jeu.ts';
import { objetRamasse, regionVisitee } from '../game/state.ts';
import { NOMBRE_REGIONS } from '../world/worldgen.ts';
import { lireTuile } from '../world/region.ts';
import type { TileId } from '../world/tiles.ts';
import { COULEURS } from '../ui/draw.ts';

/** Un point par tuile : la couleur dit la nature du terrain, pas son dessin. */
const TEINTES: Record<TileId, string> = {
  herbe: '#4a8b3a',
  herbeClaire: '#6fae52',
  herbesHautes: '#28501e',
  fleurs: '#6fae52',
  chemin: '#c4a978',
  sable: '#e0cd94',
  eau: '#2f7fc4',
  arbre: '#1e4a24',
  buisson: '#2f6b34',
  rocher: '#7a736a',
  souche: '#6b4a2c',
  solGrotte: '#5e5e6b',
  gravier: '#3f3f4a',
  murGrotte: '#22222a',
  cristal: '#7fb8e0',
  mur: '#b09a7c',
  toit: '#b3543f',
  porte: '#e0c56a',
  panneau: '#a9834f',
  rebord: '#94794c',
  solInterieur: '#a9834f',
  tapis: '#b3574f',
  comptoir: '#7a5330',
  vide: '#0b0f14',
};

/**
 * Côté d'un point de la miniature, en pixels virtuels.
 *
 * Quatre et pas cinq : à cinq, les 36 lignes de la région occupaient 180 pixels et
 * repoussaient la bande de progression et la légende sous le bord de l'écran, où elles
 * étaient simplement invisibles.
 */
const POINT = 4;

export class SceneCarte implements Scene {
  readonly nom = 'carte';

  private clignotement = 0;

  mettreAJour(jeu: Jeu, step: number): void {
    this.clignotement += step;
    if (jeu.entrees.pressee('annuler') || jeu.entrees.pressee('valider') || jeu.entrees.pressee('menu')) {
      jeu.retirer();
    }
  }

  dessiner(jeu: Jeu): void {
    const peintre = jeu.peintre;
    const region = jeu.monde.region(jeu.state.joueur.regionIndex);
    peintre.remplir(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, COULEURS.fond);
    peintre.panneau(6, 6, VIRTUAL_WIDTH - 12, VIRTUAL_HEIGHT - 12);

    peintre.texte(region.nom[jeu.langue], 16, 12, { couleur: COULEURS.texteAccent });
    peintre.texteDroite(
      jeu.t('carte.progression', {
        index: jeu.state.joueur.regionIndex + 1,
        total: NOMBRE_REGIONS,
      }),
      VIRTUAL_WIDTH - 16,
      12,
      { couleur: COULEURS.texteAttenue },
    );

    // ── Miniature de la région ──────────────────────────────────────────────
    const largeur = region.width * POINT;
    const hauteur = region.height * POINT;
    const originX = Math.round((VIRTUAL_WIDTH - largeur) / 2);
    const originY = 26;

    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        peintre.remplir(
          originX + x * POINT,
          originY + y * POINT,
          POINT,
          POINT,
          TEINTES[lireTuile(region, x, y)],
        );
      }
    }
    peintre.contour(originX - 1, originY - 1, largeur + 2, hauteur + 2, COULEURS.texteAttenue);

    // Sorties : elles indiquent par où continuer.
    for (const sortie of region.sorties) {
      peintre.remplir(originX + sortie.x * POINT - 1, originY + sortie.y * POINT - 1, POINT + 2, POINT + 2, COULEURS.selection);
    }

    // Objets encore au sol : la carte sert aussi à savoir ce qu'on a manqué.
    for (const entite of region.entites) {
      if (entite.kind !== 'objet' || objetRamasse(jeu.state, entite.id)) continue;
      peintre.remplir(originX + entite.x * POINT, originY + entite.y * POINT, POINT, POINT, '#f0d878');
    }

    // Le joueur clignote : sur une miniature dense, un point fixe se perd.
    if (Math.floor(this.clignotement * 3) % 2 === 0) {
      const px = originX + jeu.state.joueur.x * POINT;
      const py = originY + jeu.state.joueur.y * POINT;
      peintre.remplir(px - 2, py - 2, POINT + 4, POINT + 4, '#ffffff');
      peintre.remplir(px - 1, py - 1, POINT + 2, POINT + 2, '#e05a4a');
    }

    // ── Bande des régions du monde ──────────────────────────────────────────
    const bandeY = originY + hauteur + 8;
    const pas = Math.floor((VIRTUAL_WIDTH - 40) / NOMBRE_REGIONS);
    const bandeX = Math.round((VIRTUAL_WIDTH - pas * NOMBRE_REGIONS) / 2);

    for (let index = 0; index < NOMBRE_REGIONS; index++) {
      const x = bandeX + index * pas;
      const visitee = regionVisitee(jeu.state, index);
      const courante = index === jeu.state.joueur.regionIndex;
      peintre.remplir(
        x + 2,
        bandeY,
        pas - 4,
        8,
        courante ? COULEURS.selection : visitee ? COULEURS.pvHaut : COULEURS.pvFond,
      );
      if (index > 0) peintre.remplir(x - 2, bandeY + 3, 4, 2, COULEURS.texteAttenue);
    }

    peintre.texteCentre(jeu.t('carte.legende'), VIRTUAL_WIDTH / 2, bandeY + 12, {
      couleur: COULEURS.texteAttenue,
    });
  }
}
