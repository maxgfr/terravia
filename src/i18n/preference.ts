/**
 * Choix de la langue au démarrage.
 *
 * L'anglais est la langue par défaut : le jeu est publié sur un lien public, et c'est
 * ce que la majorité des visiteurs comprendra. Le français reste complet et se choisit
 * dans les réglages, atteignables depuis l'écran-titre comme depuis le menu de pause.
 *
 * La langue du navigateur n'est **pas** consultée. Elle l'était, et c'était une
 * mauvaise idée : deux personnes ouvrant le même lien voyaient deux jeux différents,
 * sans comprendre pourquoi ni comment revenir en arrière. Un défaut unique, plus un
 * réglage visible, se raisonne mieux qu'une détection automatique.
 */

import { LANGUES, type Langue } from './index.ts';

export const LANGUE_PAR_DEFAUT: Langue = 'en';

/**
 * La langue à utiliser au lancement.
 *
 * Seule une préférence déjà exprimée par le joueur l'emporte sur le défaut ; une valeur
 * inconnue — stockage corrompu, ancienne version — est ignorée plutôt que propagée.
 */
export function langueParDefaut(enregistree: string | null): Langue {
  if (enregistree && (LANGUES as readonly string[]).includes(enregistree)) {
    return enregistree as Langue;
  }
  return LANGUE_PAR_DEFAUT;
}
