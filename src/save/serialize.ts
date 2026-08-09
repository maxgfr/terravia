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
import { creerPartie, type CombatEnCours, type GameState } from '../game/state.ts';
import { SPECIES } from '../data/species.ts';
import {
  FORMAT_CREATURE,
  FORMAT_PARTIE,
  VERSION_ACTUELLE,
  checksumValide,
  signer,
  type CombatEnregistre,
  type CreatureEnregistree,
  type CreatureFile,
  type SaveFile,
} from './format.ts';
import { lireJson, validerCreature, validerPartie, type Validation } from './validate.ts';
import { planifierMonde } from '../world/worldgen.ts';

/**
 * Registre des migrations : `migrations[n]` fait passer un document de la version `n`
 * à la version `n + 1`.
 */
const MIGRATIONS: Record<number, (document: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2 : une partie enregistrée avant la reprise de combat n'en contenait aucun.
  1: (document) => ({ ...document, combat: null }),
};

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

function enregistrerCombat(combat: CombatEnCours): CombatEnregistre {
  return {
    genre: combat.genre,
    adversaires: combat.adversaires.map(enregistrerCreature),
    dresseurId: combat.dresseurId,
    indexJoueur: combat.indexJoueur,
    indexAdverse: combat.indexAdverse,
    etagesJoueur: { ...combat.etagesJoueur },
    etagesAdverse: { ...combat.etagesAdverse },
    tour: combat.tour,
    tentativesFuite: combat.tentativesFuite,
  };
}

function restaurerCombat(enregistre: CombatEnregistre): CombatEnCours {
  return {
    genre: enregistre.genre,
    adversaires: enregistre.adversaires.map(restaurerCreature),
    dresseurId: enregistre.dresseurId,
    indexJoueur: enregistre.indexJoueur,
    indexAdverse: enregistre.indexAdverse,
    etagesJoueur: { ...enregistre.etagesJoueur },
    etagesAdverse: { ...enregistre.etagesAdverse },
    tour: enregistre.tour,
    tentativesFuite: enregistre.tentativesFuite,
  };
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
    combat: state.combat ? enregistrerCombat(state.combat) : null,
  }) as SaveFile;
}

/** Reconstruit un état de jeu à partir d'un document validé. */
export function importerPartie(document: SaveFile): GameState {
  const state = creerPartie(document.seed, document.langue, document.joueur.nom);

  // La longueur du parcours dépend de la seed : la validation ne peut la borner qu'avec
  // le plafond du générateur. On ramène donc les index dans le monde réellement produit.
  // Le cas se présente quand l'algorithme de génération change — un index qui débordait
  // ferait lever `monde.region()` et rendrait la partie irrécupérable.
  const dernier = planifierMonde(document.seed).plans.length - 1;
  const borner = (index: number): number => Math.max(0, Math.min(index, dernier));

  state.joueur = {
    nom: document.joueur.nom,
    regionIndex: borner(document.joueur.regionIndex),
    x: document.joueur.x,
    y: document.joueur.y,
    direction: document.joueur.direction,
    pieces: document.joueur.pieces,
    tempsJeuMs: document.joueur.tempsJeuMs,
    refuge: { ...document.joueur.refuge, regionIndex: borner(document.joueur.refuge.regionIndex) },
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
        ? [...new Set(document.progression.regionsVisitees.filter((index) => index <= dernier))]
        : [state.joueur.regionIndex],
  };
  state.horloge = { minutes: document.horloge.minutes };
  state.combat = document.combat ? restaurerCombat(document.combat) : null;
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

  // La somme de contrôle se lit sur le document d'origine, avant migration : une
  // migration change le contenu, donc forcément la somme. Sans cette précaution, la
  // première évolution du format ferait crier « fichier corrompu » sur toutes les
  // sauvegardes valides du monde.
  const document = brut as Record<string, unknown>;
  const sommeDorigine = checksumValide(document);
  const migre = migrer(document);
  // On ne resigne que ce qui était sain : un fichier réellement abîmé garde sa somme
  // fausse et continue d'avertir.
  const validation = validerPartie(sommeDorigine && migre !== document ? signer(migre) : migre);
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

/**
 * Le champ `format` du document, sans rien valider d'autre.
 *
 * Il sépare « ce n'est pas le bon type de fichier » de « ce fichier est abîmé ». Les deux
 * échouent à la validation, mais seul le premier a une réponse utile à donner au joueur :
 * l'entrée de menu par laquelle il aurait fallu passer. Renvoie `null` dès que le texte
 * ne se laisse pas lire jusque-là.
 */
export function formatDuDocument(texteBrut: string): string | null {
  const analyse = lireJson(texteBrut);
  if (!analyse.ok) return null;
  const brut = analyse.valeur;
  if (typeof brut !== 'object' || brut === null) return null;
  const format = (brut as Record<string, unknown>).format;
  return typeof format === 'string' ? format : null;
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
