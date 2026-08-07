/**
 * Conversion entre l'état de jeu et le document de sauvegarde, dans les deux sens.
 *
 * L'aller-retour doit être exact : exporter puis réimporter une partie rend un état
 * identique. Un test le vérifie sur une partie complète, parce que c'est la promesse
 * faite au joueur quand il clique sur « Exporter ».
 *
 * Les **migrations** sont posées dès la première version. Sans ce mécanisme, la
 * première évolution du format casserait toutes les parties existantes — et il est bien
 * plus difficile de l'ajouter après coup que d'ouvrir le registre vide maintenant.
 */

import { pvMax, type CreatureInstance } from '../game/creature.ts';
import { creerPartie, type GameState } from '../game/state.ts';
import { SPECIES } from '../data/species.ts';
import {
  FORMAT_CREATURE,
  FORMAT_PARTIE,
  VERSION_ACTUELLE,
  signer,
  type CreatureEnregistree,
  type CreatureFile,
  type SaveFile,
} from './format.ts';
import { lireJson, validerCreature, validerPartie, type Validation } from './validate.ts';

/**
 * Registre des migrations : `migrations[n]` fait passer un document de la version `n`
 * à la version `n + 1`. Il est vide tant que le format n'a pas bougé, et c'est très
 * bien — ce qui compte, c'est que le chemin existe.
 */
const MIGRATIONS: Record<number, (document: Record<string, unknown>) => Record<string, unknown>> = {};

/** Applique les migrations successives jusqu'à la version courante. */
export function migrer(document: Record<string, unknown>): Record<string, unknown> {
  let courant = document;
  let version = typeof courant.version === 'number' ? courant.version : 1;
  while (version < VERSION_ACTUELLE) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    courant = migration(courant);
    version += 1;
    courant = { ...courant, version };
  }
  return courant;
}

function enregistrerCreature(instance: CreatureInstance): CreatureEnregistree {
  return {
    uid: instance.uid,
    speciesId: instance.speciesId,
    surnom: instance.surnom,
    niveau: instance.niveau,
    xp: instance.xp,
    genes: { ...instance.genes },
    dressage: { ...instance.dressage },
    talentId: instance.talentId,
    moves: instance.moves.map((slot) => ({ id: slot.id, pp: slot.pp })),
    pv: instance.pv,
    statut: instance.statut,
    sommeil: instance.sommeil,
    origine: instance.origine,
  };
}

function restaurerCreature(enregistree: CreatureEnregistree): CreatureInstance {
  const instance: CreatureInstance = {
    uid: enregistree.uid,
    speciesId: enregistree.speciesId,
    surnom: enregistree.surnom,
    niveau: enregistree.niveau,
    xp: enregistree.xp,
    genes: { ...enregistree.genes },
    dressage: { ...enregistree.dressage },
    talentId: enregistree.talentId,
    moves: enregistree.moves.map((slot) => ({ id: slot.id, pp: slot.pp })),
    pv: enregistree.pv,
    statut: enregistree.statut,
    sommeil: enregistree.sommeil,
    origine: enregistree.origine,
  };
  // Les points de vie sont bornés au maximum réel : un fichier annonçant plus que
  // possible est corrigé plutôt que rejeté, la partie reste jouable.
  instance.pv = Math.min(instance.pv, pvMax(instance));
  // Un talent qui n'appartient plus au pool de l'espèce est ramené au premier du pool :
  // le cas se produit après un rééquilibrage des données.
  if (!SPECIES[instance.speciesId].talents.includes(instance.talentId)) {
    instance.talentId = SPECIES[instance.speciesId].talents[0];
  }
  return instance;
}

/** Construit le document exportable à partir de l'état courant. */
export function exporterPartie(state: GameState, maintenant: string): SaveFile {
  return signer({
    format: FORMAT_PARTIE,
    version: VERSION_ACTUELLE,
    seed: state.seedText,
    langue: state.langue,
    creeLe: maintenant,
    majLe: maintenant,
    joueur: {
      nom: state.joueur.nom,
      regionIndex: state.joueur.regionIndex,
      x: state.joueur.x,
      y: state.joueur.y,
      direction: state.joueur.direction,
      pieces: state.joueur.pieces,
      tempsJeuMs: Math.round(state.joueur.tempsJeuMs),
      refuge: { ...state.joueur.refuge },
    },
    equipe: state.equipe.map(enregistrerCreature),
    reserve: state.reserve.map(enregistrerCreature),
    inventaire: { ...state.inventaire },
    progression: {
      drapeaux: [...state.progression.drapeaux],
      dresseursVaincus: [...state.progression.dresseursVaincus],
      objetsRamasses: [...state.progression.objetsRamasses],
      badges: [...state.progression.badges],
      terradexVus: [...state.progression.terradexVus],
      terradexCaptures: [...state.progression.terradexCaptures],
      regionsVisitees: [...state.progression.regionsVisitees],
    },
    horloge: { minutes: Math.round(state.horloge.minutes) },
    prochainUid: state.prochainUid,
  }) as SaveFile;
}

/** Reconstruit un état de jeu à partir d'un document validé. */
export function importerPartie(document: SaveFile): GameState {
  const state = creerPartie(document.seed, document.langue, document.joueur.nom);
  state.joueur = {
    nom: document.joueur.nom,
    regionIndex: document.joueur.regionIndex,
    x: document.joueur.x,
    y: document.joueur.y,
    direction: document.joueur.direction,
    pieces: document.joueur.pieces,
    tempsJeuMs: document.joueur.tempsJeuMs,
    refuge: { ...document.joueur.refuge },
  };
  state.equipe = document.equipe.map(restaurerCreature);
  state.reserve = document.reserve.map(restaurerCreature);
  state.inventaire = { ...document.inventaire };
  state.progression = {
    drapeaux: [...document.progression.drapeaux],
    dresseursVaincus: [...document.progression.dresseursVaincus],
    objetsRamasses: [...document.progression.objetsRamasses],
    badges: [...document.progression.badges],
    terradexVus: [...document.progression.terradexVus],
    terradexCaptures: [...document.progression.terradexCaptures],
    // Une sauvegarde d'avant ce champ ne connaît que la région où elle s'est arrêtée.
    regionsVisitees:
      document.progression.regionsVisitees.length > 0
        ? [...document.progression.regionsVisitees]
        : [document.joueur.regionIndex],
  };
  state.horloge = { minutes: document.horloge.minutes };
  // L'identifiant suivant doit dépasser tous ceux déjà utilisés, y compris ceux venus
  // d'une créature importée d'une autre partie.
  const maxUid = [...state.equipe, ...state.reserve].reduce((max, membre) => {
    const numero = Number.parseInt(membre.uid.replace(/\D/g, ''), 10);
    return Number.isFinite(numero) ? Math.max(max, numero) : max;
  }, 0);
  state.prochainUid = Math.max(document.prochainUid, maxUid + 1);
  return state;
}

/** Document d'export d'une créature seule, échangeable entre parties. */
export function exporterCreature(instance: CreatureInstance, maintenant: string): CreatureFile {
  return signer({
    format: FORMAT_CREATURE,
    version: VERSION_ACTUELLE,
    exporteLe: maintenant,
    creature: enregistrerCreature(instance),
  }) as CreatureFile;
}

export function importerCreature(document: CreatureFile, nouvelUid: string): CreatureInstance {
  return restaurerCreature({ ...document.creature, uid: nouvelUid });
}

export interface PartieChargee {
  readonly state: GameState;
  readonly avertissements: readonly string[];
  readonly resume: SaveFile;
}

/**
 * Chaîne complète : texte JSON → migration → validation → état de jeu.
 * Aucune étape ne touche à la partie en cours ; l'appelant décide de la remplacer.
 */
export function chargerDepuisTexte(texteBrut: string): Validation<PartieChargee> {
  const analyse = lireJson(texteBrut);
  if (!analyse.ok) return analyse;

  const brut = analyse.valeur;
  if (typeof brut !== 'object' || brut === null) {
    return { ok: false, raison: 'le document devrait être un objet' };
  }

  const migre = migrer(brut as Record<string, unknown>);
  const validation = validerPartie(migre);
  if (!validation.ok) return validation;

  return {
    ok: true,
    valeur: {
      state: importerPartie(validation.valeur),
      avertissements: validation.avertissements,
      resume: validation.valeur,
    },
    avertissements: validation.avertissements,
  };
}

export function chargerCreatureDepuisTexte(texteBrut: string): Validation<CreatureFile> {
  const analyse = lireJson(texteBrut);
  if (!analyse.ok) return analyse;
  const brut = analyse.valeur;
  if (typeof brut !== 'object' || brut === null) {
    return { ok: false, raison: 'le document devrait être un objet' };
  }
  return validerCreature(migrer(brut as Record<string, unknown>));
}

/** Nom de fichier lisible et daté, sans caractère problématique. */
export function nomFichier(state: GameState, horodatage: string): string {
  const date = horodatage.slice(0, 10);
  return `terravia-${state.seedText}-${date}.json`;
}
