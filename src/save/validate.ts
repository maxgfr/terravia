/**
 * Validation d'un document importé.
 *
 * Un fichier de sauvegarde vient de l'extérieur : il peut être tronqué, bricolé à la
 * main, ou provenir d'une autre version du jeu. On ne fait donc **aucune** confiance à
 * sa forme. Chaque champ est vérifié, chaque identifiant est confronté au catalogue, et
 * l'erreur renvoyée dit précisément ce qui cloche — « attaque inconnue : frostbolt »
 * plutôt que « fichier invalide ».
 *
 * La validation ne modifie jamais la partie en cours : elle renvoie un résultat, et
 * c'est l'appelant qui décide de charger ou non.
 */

import { ITEM_IDS, type ItemId } from '../data/items.ts';
import { MOVE_IDS, MOVES, type MoveId } from '../data/moves.ts';
import { SPECIES_IDS, type SpeciesId } from '../data/species.ts';
import { GENE_MAX, STATUSES, STAT_KEYS, TRAINING_MAX_PER_STAT, type StatBlock } from '../data/stats.ts';
import { TALENT_IDS, type TalentId } from '../data/talents.ts';
import { LANGUES } from '../i18n/index.ts';
import { DIRECTIONS } from '../world/characterIds.ts';
import { NOMBRE_REGIONS } from '../world/worldgen.ts';
import {
  FORMAT_CREATURE,
  FORMAT_PARTIE,
  VERSION_ACTUELLE,
  checksumValide,
  type CreatureEnregistree,
  type CreatureFile,
  type SaveFile,
} from './format.ts';

export type Validation<T> =
  | { readonly ok: true; readonly valeur: T; readonly avertissements: readonly string[] }
  | { readonly ok: false; readonly raison: string };

class ErreurValidation extends Error {}

function echouer(message: string): never {
  throw new ErreurValidation(message);
}

function objet(valeur: unknown, chemin: string): Record<string, unknown> {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    echouer(`${chemin} devrait être un objet`);
  }
  return valeur as Record<string, unknown>;
}

function tableau(valeur: unknown, chemin: string): unknown[] {
  if (!Array.isArray(valeur)) echouer(`${chemin} devrait être une liste`);
  return valeur;
}

function texte(valeur: unknown, chemin: string, maxLongueur = 200): string {
  if (typeof valeur !== 'string') echouer(`${chemin} devrait être du texte`);
  if (valeur.length > maxLongueur) echouer(`${chemin} dépasse ${maxLongueur} caractères`);
  return valeur;
}

function entier(valeur: unknown, chemin: string, min: number, max: number): number {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
    echouer(`${chemin} devrait être un nombre`);
  }
  const arrondi = Math.round(valeur);
  if (arrondi < min || arrondi > max) echouer(`${chemin} devrait être entre ${min} et ${max}`);
  return arrondi;
}

function parmi<T extends string>(valeur: unknown, chemin: string, permis: readonly T[]): T {
  const brut = texte(valeur, chemin, 64);
  if (!permis.includes(brut as T)) echouer(`${chemin} : valeur inconnue « ${brut} »`);
  return brut as T;
}

function blocStats(valeur: unknown, chemin: string, max: number): StatBlock {
  const source = objet(valeur, chemin);
  const bloc = {} as StatBlock;
  for (const stat of STAT_KEYS) bloc[stat] = entier(source[stat], `${chemin}.${stat}`, 0, max);
  return bloc;
}

function listeUnique<T extends string>(valeur: unknown, chemin: string, permis: readonly T[]): T[] {
  const brut = tableau(valeur, chemin);
  const vus = new Set<T>();
  for (const [index, element] of brut.entries()) {
    vus.add(parmi(element, `${chemin}[${index}]`, permis));
  }
  return [...vus];
}

function listeTextes(valeur: unknown, chemin: string, maxElements = 500): string[] {
  const brut = tableau(valeur, chemin);
  if (brut.length > maxElements) echouer(`${chemin} contient trop d’entrées`);
  return brut.map((element, index) => texte(element, `${chemin}[${index}]`, 80));
}

function creature(valeur: unknown, chemin: string): CreatureEnregistree {
  const source = objet(valeur, chemin);
  const speciesId = parmi<SpeciesId>(source.speciesId, `${chemin}.speciesId`, SPECIES_IDS);
  const niveau = entier(source.niveau, `${chemin}.niveau`, 1, 100);

  const moves = tableau(source.moves, `${chemin}.moves`);
  if (moves.length === 0) echouer(`${chemin}.moves ne peut pas être vide`);
  if (moves.length > 4) echouer(`${chemin}.moves dépasse quatre attaques`);
  const attaques = moves.map((slot, index) => {
    const emplacement = objet(slot, `${chemin}.moves[${index}]`);
    const id = parmi<MoveId>(emplacement.id, `${chemin}.moves[${index}].id`, MOVE_IDS);
    // Les PP ne peuvent pas dépasser le maximum de l'attaque : un fichier bricolé qui
    // en annoncerait mille est rejeté, pas silencieusement accepté.
    const pp = entier(emplacement.pp, `${chemin}.moves[${index}].pp`, 0, MOVES[id].pp);
    return { id, pp };
  });

  const pvDeclares = entier(source.pv, `${chemin}.pv`, 0, 10000);

  return {
    uid: texte(source.uid, `${chemin}.uid`, 40),
    speciesId,
    surnom: source.surnom === null || source.surnom === undefined ? null : texte(source.surnom, `${chemin}.surnom`, 20),
    niveau,
    xp: entier(source.xp, `${chemin}.xp`, 0, 2_000_000),
    genes: blocStats(source.genes, `${chemin}.genes`, GENE_MAX),
    dressage: blocStats(source.dressage, `${chemin}.dressage`, TRAINING_MAX_PER_STAT),
    talentId: parmi<TalentId>(source.talentId, `${chemin}.talentId`, TALENT_IDS),
    moves: attaques,
    pv: pvDeclares,
    statut:
      source.statut === null || source.statut === undefined
        ? null
        : parmi(source.statut, `${chemin}.statut`, STATUSES),
    sommeil: entier(source.sommeil ?? 0, `${chemin}.sommeil`, 0, 7),
    origine: texte(source.origine ?? '', `${chemin}.origine`, 40),
  };
}

function enveloppe(brut: unknown, format: string): Record<string, unknown> {
  const document = objet(brut, 'le document');
  if (document.format !== format) {
    echouer(`ce fichier n’est pas un document « ${format} »`);
  }
  const version = entier(document.version, 'version', 1, VERSION_ACTUELLE);
  if (version > VERSION_ACTUELLE) {
    echouer(`il vient d’une version plus récente du jeu (v${version})`);
  }
  return document;
}

/** Valide une sauvegarde de partie. Les avertissements n'empêchent pas le chargement. */
export function validerPartie(brut: unknown): Validation<SaveFile> {
  try {
    const document = enveloppe(brut, FORMAT_PARTIE);
    const avertissements: string[] = [];
    if (!checksumValide(document)) {
      // Une somme de contrôle fausse signale une modification manuelle, pas forcément
      // un fichier inutilisable : on prévient, on ne refuse pas.
      avertissements.push('somme de contrôle incorrecte');
    }

    const joueur = objet(document.joueur, 'joueur');
    const refuge = objet(joueur.refuge ?? {}, 'joueur.refuge');

    const equipeBrute = tableau(document.equipe, 'equipe');
    if (equipeBrute.length === 0) echouer('l’équipe est vide');
    if (equipeBrute.length > 6) echouer('l’équipe dépasse six créatures');
    const reserveBrute = tableau(document.reserve ?? [], 'reserve');
    if (reserveBrute.length > 300) echouer('la réserve dépasse trois cents créatures');

    const equipe = equipeBrute.map((valeur, index) => creature(valeur, `equipe[${index}]`));
    const reserve = reserveBrute.map((valeur, index) => creature(valeur, `reserve[${index}]`));

    const uids = new Set<string>();
    for (const membre of [...equipe, ...reserve]) {
      if (uids.has(membre.uid)) echouer(`deux créatures partagent l’identifiant « ${membre.uid} »`);
      uids.add(membre.uid);
    }

    const inventaireBrut = objet(document.inventaire ?? {}, 'inventaire');
    const inventaire: Partial<Record<ItemId, number>> = {};
    for (const [cle, valeur] of Object.entries(inventaireBrut)) {
      const item = parmi<ItemId>(cle, `inventaire.${cle}`, ITEM_IDS);
      inventaire[item] = entier(valeur, `inventaire.${cle}`, 0, 99);
    }

    const progressionBrute = objet(document.progression ?? {}, 'progression');

    const partie: SaveFile = {
      format: FORMAT_PARTIE,
      version: VERSION_ACTUELLE,
      seed: texte(document.seed, 'seed', 40),
      langue: parmi(document.langue ?? 'fr', 'langue', LANGUES),
      creeLe: texte(document.creeLe ?? '', 'creeLe', 40),
      majLe: texte(document.majLe ?? '', 'majLe', 40),
      joueur: {
        nom: texte(joueur.nom ?? 'Terra', 'joueur.nom', 20),
        regionIndex: entier(joueur.regionIndex, 'joueur.regionIndex', 0, NOMBRE_REGIONS - 1),
        x: entier(joueur.x, 'joueur.x', 0, 255),
        y: entier(joueur.y, 'joueur.y', 0, 255),
        direction: parmi(joueur.direction ?? 'sud', 'joueur.direction', DIRECTIONS),
        pieces: entier(joueur.pieces ?? 0, 'joueur.pieces', 0, 9_999_999),
        tempsJeuMs: entier(joueur.tempsJeuMs ?? 0, 'joueur.tempsJeuMs', 0, 4_000_000_000),
        refuge: {
          regionIndex: entier(refuge.regionIndex ?? 0, 'joueur.refuge.regionIndex', 0, NOMBRE_REGIONS - 1),
          x: entier(refuge.x ?? 0, 'joueur.refuge.x', 0, 255),
          y: entier(refuge.y ?? 0, 'joueur.refuge.y', 0, 255),
        },
      },
      equipe,
      reserve,
      inventaire,
      progression: {
        drapeaux: listeTextes(progressionBrute.drapeaux ?? [], 'progression.drapeaux'),
        dresseursVaincus: listeTextes(progressionBrute.dresseursVaincus ?? [], 'progression.dresseursVaincus'),
        objetsRamasses: listeTextes(progressionBrute.objetsRamasses ?? [], 'progression.objetsRamasses'),
        badges: listeTextes(progressionBrute.badges ?? [], 'progression.badges', 20),
        terradexVus: listeUnique<SpeciesId>(progressionBrute.terradexVus ?? [], 'progression.terradexVus', SPECIES_IDS),
        terradexCaptures: listeUnique<SpeciesId>(
          progressionBrute.terradexCaptures ?? [],
          'progression.terradexCaptures',
          SPECIES_IDS,
        ),
      },
      horloge: { minutes: entier(objet(document.horloge ?? {}, 'horloge').minutes ?? 0, 'horloge.minutes', 0, 1439) },
      prochainUid: entier(document.prochainUid ?? 1, 'prochainUid', 1, 1_000_000),
      checksum: typeof document.checksum === 'string' ? document.checksum : '',
    };

    return { ok: true, valeur: partie, avertissements };
  } catch (erreur) {
    if (erreur instanceof ErreurValidation) return { ok: false, raison: erreur.message };
    throw erreur;
  }
}

/** Valide l'export d'une créature seule. */
export function validerCreature(brut: unknown): Validation<CreatureFile> {
  try {
    const document = enveloppe(brut, FORMAT_CREATURE);
    const avertissements: string[] = [];
    if (!checksumValide(document)) avertissements.push('somme de contrôle incorrecte');

    return {
      ok: true,
      valeur: {
        format: FORMAT_CREATURE,
        version: VERSION_ACTUELLE,
        exporteLe: texte(document.exporteLe ?? '', 'exporteLe', 40),
        creature: creature(document.creature, 'creature'),
        checksum: typeof document.checksum === 'string' ? document.checksum : '',
      },
      avertissements,
    };
  } catch (erreur) {
    if (erreur instanceof ErreurValidation) return { ok: false, raison: erreur.message };
    throw erreur;
  }
}

/** Analyse une chaîne JSON puis la valide, en rapportant les erreurs de syntaxe. */
export function lireJson(texteBrut: string): Validation<unknown> {
  try {
    return { ok: true, valeur: JSON.parse(texteBrut) as unknown, avertissements: [] };
  } catch {
    return { ok: false, raison: 'ce n’est pas du JSON valide' };
  }
}
