/**
 * Entrer dans une partie : la reprendre, ou en accueillir une venue d'un fichier.
 *
 * Ces deux opérations vivent ici plutôt que dans un écran, parce que trois écrans les
 * appellent — le titre, le menu de pause et les réglages — et qu'un module partagé évite
 * le cycle d'imports qui naîtrait à les loger dans l'un d'eux.
 */

import type { Jeu } from '../game/jeu.ts';
import { accueillirCreature, prochainIdentifiant } from '../game/state.ts';
import { chargerCreatureDepuisTexte, chargerDepuisTexte, importerCreature } from '../save/serialize.ts';
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
      // On repart du monde : la scène courante décrivait l'ancienne partie. `remplacer`
      // vide toute la pile, y compris l'écran d'où l'import a été lancé — inutile donc
      // de recharger la page comme on le faisait, ce qui coupait aussi le dialogue.
      entrerDansLaPartie(jeu);
    });
}
