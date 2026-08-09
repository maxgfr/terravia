/**
 * Entrer dans une partie : la reprendre, ou en accueillir une venue d'un fichier.
 *
 * Ces deux opérations vivent ici plutôt que dans un écran, parce que trois écrans les
 * appellent — le titre, le menu de pause et les réglages — et qu'un module partagé évite
 * le cycle d'imports qui naîtrait à les loger dans l'un d'eux.
 */

import type { Jeu } from '../game/jeu.ts';
import { accueillirCreature, prochainIdentifiant } from '../game/state.ts';
import { FORMAT_CREATURE, FORMAT_PARTIE, type CreatureFile } from '../save/format.ts';
import {
  chargerCreatureDepuisTexte,
  chargerDepuisTexte,
  formatDuDocument,
  importerCreature,
  type PartieChargee,
} from '../save/serialize.ts';
import type { Dresseur } from '../world/entities.ts';
import { SceneCombat } from './combat.ts';
import { SceneOverworld } from './overworld.ts';

/**
 * Empile le monde parcouru, puis le combat interrompu s'il y en a un.
 *
 * C'est la seule porte d'entrée vers une partie en cours : reprendre depuis le titre,
 * démarrer après le choix du starter, ou charger un fichier passent tous par là, et
 * héritent donc tous de la reprise de combat.
 */
export function entrerDansLaPartie(jeu: Jeu): void {
  // Le combat est relevé **avant** de vider la pile : retirer un écran de combat encore
  // ouvert déclenche son `quitter`, qui efface précisément ce champ. Importer une
  // sauvegarde depuis un combat perdait sinon le combat importé.
  const combat = jeu.state.combat;
  jeu.remplacer(new SceneOverworld());
  if (!combat) return;

  // L'entrée dans le monde annonce la région, et peut lancer le didacticiel : ces
  // répliques n'ont rien à faire par-dessus un combat qu'on rouvre.
  jeu.dialogue.vider();

  // Le dresseur n'est pas recopié dans la sauvegarde : on le retrouve dans la région
  // courante, que la seed vient de reconstruire à l'identique.
  const dresseur = combat.dresseurId
    ? (jeu.monde
        .region(jeu.state.joueur.regionIndex)
        .entites.find((entite) => entite.kind === 'dresseur' && entite.id === combat.dresseurId) as
        | Dresseur
        | undefined)
    : undefined;

  jeu.pousser(
    new SceneCombat(
      { genre: combat.genre, adversaires: combat.adversaires, dresseur },
      combat,
    ),
  );
}

/**
 * Trois portes pour un même fichier, parce que l'appelant n'en sait pas toujours autant.
 *
 * Le menu de pause nomme ce qu'il attend — « Importer une partie », « Importer une
 * créature » — et les deux portes strictes tiennent parole : sur le mauvais type de
 * document, elles renvoient vers l'autre entrée au lieu de laisser filtrer un message
 * de validation que le joueur n'a pas de quoi interpréter.
 *
 * `traiterImport` reste la porte permissive, pour le glisser-déposer et l'écran-titre,
 * où rien n'a été choisi : elle lit le format annoncé et aiguille.
 */
export function traiterImport(jeu: Jeu, contenu: string): void {
  if (formatDuDocument(contenu) === FORMAT_CREATURE) {
    importerCreatureSeule(jeu, contenu);
    return;
  }
  // Tout le reste part vers la partie, y compris l'illisible : c'est ce chemin qui
  // rapporte la raison du refus.
  importerPartieSeule(jeu, contenu);
}

/** N'accepte qu'un document de créature, et seulement dans une partie commencée. */
export function importerCreatureSeule(jeu: Jeu, contenu: string): void {
  // Une équipe vide, c'est un starter pas encore choisi — on est à l'écran-titre. La
  // créature y était accueillie quand même, puis écrite sur le disque : « Continuer »
  // rouvrait alors une partie que personne n'avait jamais commencée.
  if (jeu.state.equipe.length === 0) {
    jeu.dialogue.dire(jeu.t('sauvegarde.pasDePartie'));
    return;
  }
  if (formatDuDocument(contenu) === FORMAT_PARTIE) {
    jeu.dialogue.dire(
      jeu.t('sauvegarde.mauvaisFichier', { entree: jeu.t('sauvegarde.importer') }),
    );
    return;
  }
  const creature = chargerCreatureDepuisTexte(contenu);
  if (!creature.ok) {
    jeu.dialogue.dire(jeu.t('sauvegarde.invalide', { raison: jeu.motif(creature.raison) }));
    return;
  }
  accueillirDepuisFichier(jeu, creature.valeur);
}

/**
 * N'accepte qu'une sauvegarde de partie.
 * Elle passe toujours par une confirmation — on n'écrase jamais en silence.
 */
export function importerPartieSeule(jeu: Jeu, contenu: string): void {
  if (formatDuDocument(contenu) === FORMAT_CREATURE) {
    jeu.dialogue.dire(
      jeu.t('sauvegarde.mauvaisFichier', { entree: jeu.t('sauvegarde.importerCreature') }),
    );
    return;
  }
  const partie = chargerDepuisTexte(contenu);
  if (!partie.ok) {
    jeu.dialogue.dire(jeu.t('sauvegarde.invalide', { raison: jeu.motif(partie.raison) }));
    return;
  }
  confirmerPuisCharger(jeu, partie.valeur);
}

/**
 * Fait entrer une créature venue d'un fichier, et annonce où elle atterrit.
 *
 * `accueillirCreature` la range dans l'équipe s'il reste une place, en réserve sinon, et
 * dit laquelle des deux. La réplique le répète — elle annonçait la réserve dans les deux
 * cas, et le joueur allait chercher là où sa créature n'était pas.
 */
function accueillirDepuisFichier(jeu: Jeu, document: CreatureFile): void {
  const importee = importerCreature(document, prochainIdentifiant(jeu.state));
  const place = accueillirCreature(jeu.state, importee);
  jeu.sauvegarderLocalement();
  jeu.dialogue.dire(
    jeu.t(place === 'equipe' ? 'sauvegarde.creatureImportee' : 'sauvegarde.creatureEnReserve', {
      nom: jeu.nomEspece(importee.speciesId),
    }),
  );
}

function confirmerPuisCharger(jeu: Jeu, chargee: PartieChargee): void {
  const resume = chargee.resume;
  jeu.dialogue.dire(
    jeu.t('sauvegarde.resume', {
      seed: resume.seed,
      region: String(resume.joueur.regionIndex + 1),
      creatures: resume.equipe.length + resume.reserve.length,
      temps: `${Math.floor(resume.joueur.tempsJeuMs / 60000)} min`,
    }),
  );
  for (const avertissement of chargee.avertissements) {
    jeu.dialogue.dire(jeu.t('sauvegarde.invalide', { raison: jeu.motif(avertissement) }));
  }

  void jeu.dialogue
    .demander(jeu.t('sauvegarde.confirmerImport'), [jeu.t('depart.oui'), jeu.t('depart.non')])
    .then((choix) => {
      if (choix !== 0) return;
      jeu.chargerPartie(chargee.state);
      jeu.sauvegarderLocalement();
      // On repart du monde : la scène courante décrivait l'ancienne partie. `remplacer`
      // vide toute la pile, y compris l'écran d'où l'import a été lancé — inutile donc
      // de recharger la page comme on le faisait, ce qui coupait aussi le dialogue.
      entrerDansLaPartie(jeu);
    });
}
