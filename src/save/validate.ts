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
import {
  BATTLE_STATS,
  GENE_MAX,
  STATUSES,
  STAT_KEYS,
  TRAINING_MAX_PER_STAT,
  type BattleStat,
  type StatBlock,
} from '../data/stats.ts';
import { TALENT_IDS, type TalentId } from '../data/talents.ts';
import { LANGUES, traduire, type CleTexte, type Langue } from '../i18n/index.ts';
import { LANGUE_PAR_DEFAUT } from '../i18n/preference.ts';
import { DIRECTIONS } from '../world/characterIds.ts';
import { REGIONS_MAX } from '../world/worldgen.ts';
import {
  FORMAT_CREATURE,
  FORMAT_PARTIE,
  VERSION_ACTUELLE,
  checksumValide,
  type CombatEnregistre,
  type CreatureEnregistree,
  type CreatureFile,
  type SaveFile,
} from './format.ts';

/**
 * Le motif d'un rejet : une clé de texte et ses paramètres, jamais une phrase.
 *
 * Ces messages traversent l'écran-titre et l'écran d'import, tous deux traduits. Écrits
 * en français dans le code, ils s'affichaient tels quels à un joueur anglophone — au
 * milieu d'une coquille anglaise, et alors même que le README vante précisément cette
 * fonctionnalité en anglais.
 *
 * Le `chemin` (`equipe[0].moves[0].id`) reste hors traduction : c'est un repère technique
 * dans le fichier, pas de la prose.
 */
export interface MotifValidation {
  readonly cle: CleTexte;
  readonly params?: Readonly<Record<string, string | number>>;
  /**
   * Le motif imbriqué, quand un rejet en explique un autre — « combat en cours abandonné,
   * parce que `combat.etagesJoueur.attaque` devrait être entre −6 et 6 ». Sans lui, le
   * détail qui rend l'avertissement exploitable se perdait.
   */
  readonly detail?: MotifValidation;
}

/**
 * Le message qu'un joueur de cette langue lira. Seul endroit qui met un motif en phrase :
 * l'interface et les tests s'en servent tous les deux, et ne peuvent donc pas diverger.
 */
export function rendreMotif(langue: Langue, motif: MotifValidation): string {
  const tete = traduire(langue, motif.cle, motif.params);
  return motif.detail ? `${tete} : ${rendreMotif(langue, motif.detail)}` : tete;
}

export type Validation<T> =
  | { readonly ok: true; readonly valeur: T; readonly avertissements: readonly MotifValidation[] }
  | { readonly ok: false; readonly raison: MotifValidation };

class ErreurValidation extends Error {
  // Champ déclaré puis affecté, et non propriété de paramètre : Node exécute le
  // TypeScript du dépôt en mode « strip-only », qui refuse `constructor(readonly x)`.
  readonly motif: MotifValidation;

  constructor(motif: MotifValidation) {
    super(motif.cle);
    this.motif = motif;
  }
}

function echouer(cle: CleTexte, params?: Readonly<Record<string, string | number>>): never {
  throw new ErreurValidation({ cle, params });
}

function objet(valeur: unknown, chemin: string): Record<string, unknown> {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    echouer('sauvegarde.motif.objet', { chemin });
  }
  return valeur as Record<string, unknown>;
}

function tableau(valeur: unknown, chemin: string): unknown[] {
  if (!Array.isArray(valeur)) echouer('sauvegarde.motif.liste', { chemin });
  return valeur;
}

function texte(valeur: unknown, chemin: string, maxLongueur = 200): string {
  if (typeof valeur !== 'string') echouer('sauvegarde.motif.texte', { chemin });
  if (valeur.length > maxLongueur) {
    echouer('sauvegarde.motif.tropLong', { chemin, max: maxLongueur });
  }
  return valeur;
}

function entier(valeur: unknown, chemin: string, min: number, max: number): number {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
    echouer('sauvegarde.motif.nombre', { chemin });
  }
  const arrondi = Math.round(valeur);
  if (arrondi < min || arrondi > max) {
    echouer('sauvegarde.motif.intervalle', { chemin, min, max });
  }
  return arrondi;
}

function parmi<T extends string>(valeur: unknown, chemin: string, permis: readonly T[]): T {
  const brut = texte(valeur, chemin, 64);
  if (!permis.includes(brut as T)) {
    echouer('sauvegarde.motif.inconnue', { chemin, valeur: brut });
  }
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
  if (brut.length > maxElements) echouer('sauvegarde.motif.tropDEntrees', { chemin });
  return brut.map((element, index) => texte(element, `${chemin}[${index}]`, 80));
}

function creature(valeur: unknown, chemin: string): CreatureEnregistree {
  const source = objet(valeur, chemin);
  const speciesId = parmi<SpeciesId>(source.speciesId, `${chemin}.speciesId`, SPECIES_IDS);
  const niveau = entier(source.niveau, `${chemin}.niveau`, 1, 100);

  const moves = tableau(source.moves, `${chemin}.moves`);
  if (moves.length === 0) echouer('sauvegarde.motif.attaquesVides', { chemin });
  if (moves.length > 4) echouer('sauvegarde.motif.attaquesTrop', { chemin });
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

/**
 * Étages de statistique en combat.
 *
 * Ils ne passent pas par `blocStats` : ils portent sur `BATTLE_STATS` — les PV n'ont pas
 * d'étage — et vont de −6 à +6 au lieu de 0 à un plafond.
 */
function blocEtages(valeur: unknown, chemin: string): Record<BattleStat, number> {
  const source = objet(valeur, chemin);
  const bloc = {} as Record<BattleStat, number>;
  for (const stat of BATTLE_STATS) bloc[stat] = entier(source[stat] ?? 0, `${chemin}.${stat}`, -6, 6);
  return bloc;
}

/**
 * Valide le combat interrompu. Lève comme le reste ; l'appelant rattrape.
 *
 * Les incohérences vérifiées ici sont celles qui rendraient l'écran de combat
 * inaffichable : un adversaire déjà hors de combat, une créature du joueur qui n'existe
 * pas ou qui est K.O.
 */
function combatInterrompu(valeur: unknown, equipe: readonly CreatureEnregistree[]): CombatEnregistre {
  const source = objet(valeur, 'combat');

  const adversairesBruts = tableau(source.adversaires, 'combat.adversaires');
  if (adversairesBruts.length === 0) echouer('sauvegarde.motif.adversairesVides');
  if (adversairesBruts.length > 6) echouer('sauvegarde.motif.adversairesTrop');
  const adversaires = adversairesBruts.map((membre, index) =>
    creature(membre, `combat.adversaires[${index}]`),
  );

  const indexAdverse = entier(source.indexAdverse ?? 0, 'combat.indexAdverse', 0, adversaires.length - 1);
  if (adversaires[indexAdverse]!.pv <= 0) echouer('sauvegarde.motif.adversaireKo');

  const indexJoueur = entier(source.indexJoueur ?? 0, 'combat.indexJoueur', 0, equipe.length - 1);
  if (equipe[indexJoueur]!.pv <= 0) echouer('sauvegarde.motif.creatureKo');

  return {
    genre: parmi(source.genre ?? 'sauvage', 'combat.genre', ['sauvage', 'dresseur'] as const),
    adversaires,
    dresseurId:
      source.dresseurId === null || source.dresseurId === undefined
        ? null
        : texte(source.dresseurId, 'combat.dresseurId', 40),
    indexJoueur,
    indexAdverse,
    etagesJoueur: blocEtages(source.etagesJoueur ?? {}, 'combat.etagesJoueur'),
    etagesAdverse: blocEtages(source.etagesAdverse ?? {}, 'combat.etagesAdverse'),
    tour: entier(source.tour ?? 0, 'combat.tour', 0, 9_999),
    tentativesFuite: entier(source.tentativesFuite ?? 0, 'combat.tentativesFuite', 0, 999),
  };
}

function enveloppe(brut: unknown, format: string): Record<string, unknown> {
  const document = objet(brut, 'document');
  if (document.format !== format) {
    echouer('sauvegarde.motif.mauvaisFormat', { format });
  }
  // La borne haute est volontairement large. Plafonner à `VERSION_ACTUELLE` faisait
  // échouer `entier` en premier, et le message qui suit — le seul qui explique vraiment
  // ce qui se passe — n'était jamais atteint : une sauvegarde v3 s'entendait répondre
  // « version devrait être entre 1 et 2 ».
  const version = entier(document.version, 'version', 1, 9999);
  if (version > VERSION_ACTUELLE) {
    echouer('sauvegarde.motif.versionFuture', { version });
  }
  return document;
}

/** Valide une sauvegarde de partie. Les avertissements n'empêchent pas le chargement. */
export function validerPartie(brut: unknown): Validation<SaveFile> {
  try {
    const document = enveloppe(brut, FORMAT_PARTIE);
    const avertissements: MotifValidation[] = [];
    if (!checksumValide(document)) {
      // Une somme de contrôle fausse signale une modification manuelle, pas forcément
      // un fichier inutilisable : on prévient, on ne refuse pas.
      avertissements.push({ cle: 'sauvegarde.motif.checksum' });
    }

    const joueur = objet(document.joueur, 'joueur');
    const refuge = objet(joueur.refuge ?? {}, 'joueur.refuge');

    const equipeBrute = tableau(document.equipe, 'equipe');
    if (equipeBrute.length === 0) echouer('sauvegarde.motif.equipeVide');
    if (equipeBrute.length > 6) echouer('sauvegarde.motif.equipeTrop');
    const reserveBrute = tableau(document.reserve ?? [], 'reserve');
    if (reserveBrute.length > 300) echouer('sauvegarde.motif.reserveTrop');

    const equipe = equipeBrute.map((valeur, index) => creature(valeur, `equipe[${index}]`));
    const reserve = reserveBrute.map((valeur, index) => creature(valeur, `reserve[${index}]`));

    const uids = new Set<string>();
    for (const membre of [...equipe, ...reserve]) {
      if (uids.has(membre.uid)) echouer('sauvegarde.motif.uidDouble', { uid: membre.uid });
      uids.add(membre.uid);
    }

    const inventaireBrut = objet(document.inventaire ?? {}, 'inventaire');
    const inventaire: Partial<Record<ItemId, number>> = {};
    for (const [cle, valeur] of Object.entries(inventaireBrut)) {
      const item = parmi<ItemId>(cle, `inventaire.${cle}`, ITEM_IDS);
      inventaire[item] = entier(valeur, `inventaire.${cle}`, 0, 99);
    }

    const progressionBrute = objet(document.progression ?? {}, 'progression');

    // Un bloc de combat abîmé ne coûte jamais la partie : on le laisse tomber avec un
    // avertissement. Perdre un échange en cours contrarie ; perdre la sauvegarde qui le
    // contient serait sans commune mesure.
    let combat: CombatEnregistre | null = null;
    if (document.combat !== null && document.combat !== undefined) {
      try {
        combat = combatInterrompu(document.combat, equipe);
      } catch (erreur) {
        if (!(erreur instanceof ErreurValidation)) throw erreur;
        avertissements.push({ cle: 'sauvegarde.motif.combatAbandonne', detail: erreur.motif });
      }
    }

    const partie: SaveFile = {
      format: FORMAT_PARTIE,
      version: VERSION_ACTUELLE,
      seed: texte(document.seed, 'seed', 40),
      langue: parmi(document.langue ?? LANGUE_PAR_DEFAUT, 'langue', LANGUES),
      creeLe: texte(document.creeLe ?? '', 'creeLe', 40),
      majLe: texte(document.majLe ?? '', 'majLe', 40),
      joueur: {
        nom: texte(joueur.nom ?? 'Terra', 'joueur.nom', 20),
        regionIndex: entier(joueur.regionIndex, 'joueur.regionIndex', 0, REGIONS_MAX - 1),
        x: entier(joueur.x, 'joueur.x', 0, 255),
        y: entier(joueur.y, 'joueur.y', 0, 255),
        direction: parmi(joueur.direction ?? 'sud', 'joueur.direction', DIRECTIONS),
        pieces: entier(joueur.pieces ?? 0, 'joueur.pieces', 0, 9_999_999),
        tempsJeuMs: entier(joueur.tempsJeuMs ?? 0, 'joueur.tempsJeuMs', 0, 4_000_000_000),
        refuge: {
          regionIndex: entier(refuge.regionIndex ?? 0, 'joueur.refuge.regionIndex', 0, REGIONS_MAX - 1),
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
        // Champ ajouté après la première version publiée : une sauvegarde qui ne le
        // porte pas reste valide, et le joueur retrouve au moins sa région courante.
        regionsVisitees: [
          ...new Set(
            tableau(progressionBrute.regionsVisitees ?? [], 'progression.regionsVisitees').map(
              (valeur, index) =>
                entier(valeur, `progression.regionsVisitees[${index}]`, 0, REGIONS_MAX - 1),
            ),
          ),
        ],
      },
      horloge: { minutes: entier(objet(document.horloge ?? {}, 'horloge').minutes ?? 0, 'horloge.minutes', 0, 1439) },
      prochainUid: entier(document.prochainUid ?? 1, 'prochainUid', 1, 1_000_000),
      combat,
      checksum: typeof document.checksum === 'string' ? document.checksum : '',
    };

    return { ok: true, valeur: partie, avertissements };
  } catch (erreur) {
    if (erreur instanceof ErreurValidation) return { ok: false, raison: erreur.motif };
    throw erreur;
  }
}

/** Valide l'export d'une créature seule. */
export function validerCreature(brut: unknown): Validation<CreatureFile> {
  try {
    const document = enveloppe(brut, FORMAT_CREATURE);
    const avertissements: MotifValidation[] = [];
    if (!checksumValide(document)) avertissements.push({ cle: 'sauvegarde.motif.checksum' });

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
    if (erreur instanceof ErreurValidation) return { ok: false, raison: erreur.motif };
    throw erreur;
  }
}

/** Analyse une chaîne JSON puis la valide, en rapportant les erreurs de syntaxe. */
export function lireJson(texteBrut: string): Validation<unknown> {
  try {
    return { ok: true, valeur: JSON.parse(texteBrut) as unknown, avertissements: [] };
  } catch {
    return { ok: false, raison: { cle: 'sauvegarde.motif.jsonInvalide' } };
  }
}
