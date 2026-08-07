import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng.ts';
import { creerCreature } from '../src/game/creature.ts';
import {
  accueillirCreature,
  acheter,
  ajouterObjet,
  creerPartie,
  distribuerDressage,
  donnerBadge,
  marquerDresseurVaincu,
  poserDrapeau,
  prochainIdentifiant,
  quantite,
  retirerObjet,
  sacTrie,
  utiliserObjetSur,
  type GameState,
} from '../src/game/state.ts';
import { VERSION_ACTUELLE, calculerChecksum, jsonCanonique, signer } from '../src/save/format.ts';
import {
  chargerCreatureDepuisTexte,
  chargerDepuisTexte,
  exporterCreature,
  exporterPartie,
  importerCreature,
  importerPartie,
  migrer,
  nomFichier,
} from '../src/save/serialize.ts';
import { validerPartie } from '../src/save/validate.ts';

const HORODATAGE = '2026-08-07T12:00:00.000Z';

/** Une partie déjà bien avancée : c'est elle qui doit survivre à l'aller-retour. */
function partieAvancee(): GameState {
  const state = creerPartie('brume-3f7a', 'fr', 'Maxime');
  const rng = makeRng(4242);
  for (const [species, niveau] of [
    ['folianz', 12],
    ['mulotin', 15],
    ['luciolin', 9],
  ] as const) {
    accueillirCreature(
      state,
      creerCreature(rng, { uid: prochainIdentifiant(state), speciesId: species, niveau, origine: 'brume-3f7a' }),
    );
  }
  state.equipe[0]!.pv = 4;
  state.equipe[0]!.statut = 'brulure';
  state.equipe[1]!.surnom = 'Grignote';
  state.equipe[1]!.moves[0]!.pp = 2;
  distribuerDressage(state, 'attaque', 30);

  state.joueur.regionIndex = 3;
  state.joueur.x = 12;
  state.joueur.y = 20;
  state.joueur.direction = 'est';
  state.joueur.pieces = 1450;
  state.joueur.tempsJeuMs = 987_654;
  state.joueur.refuge = { regionIndex: 4, x: 24, y: 18 };
  state.horloge.minutes = 1234;

  ajouterObjet(state, 'superPotion', 4);
  ajouterObjet(state, 'prismeAncre', 7);
  ajouterObjet(state, 'carte', 1);
  poserDrapeau(state, 'starterChoisi');
  marquerDresseurVaincu(state, 'r1-dresseur-0');
  donnerBadge(state, 'arene');
  return state;
}

describe('json canonique', () => {
  it('trie les clés à tous les niveaux', () => {
    expect(jsonCanonique({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('donne le même texte quel que soit l’ordre d’insertion', () => {
    const premier = { alpha: 1, beta: [3, { z: 1, a: 2 }] };
    const second = { beta: [3, { a: 2, z: 1 }], alpha: 1 };
    expect(jsonCanonique(premier)).toBe(jsonCanonique(second));
  });

  it('ignore les propriétés absentes', () => {
    expect(jsonCanonique({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('somme de contrôle', () => {
  it('ne dépend pas de l’ordre des clés', () => {
    expect(calculerChecksum({ a: 1, b: 2 })).toBe(calculerChecksum({ b: 2, a: 1 }));
  });

  it('change dès qu’une valeur change', () => {
    expect(calculerChecksum({ pieces: 100 })).not.toBe(calculerChecksum({ pieces: 101 }));
  });

  it('s’exclut elle-même du calcul', () => {
    const signe = signer({ valeur: 1 });
    expect(calculerChecksum(signe)).toBe(signe.checksum);
  });
});

describe('aller-retour de sauvegarde', () => {
  it('restaure une partie identique', () => {
    // La promesse faite au joueur quand il clique sur « Exporter ».
    const original = partieAvancee();
    const document = exporterPartie(original, HORODATAGE);
    const resultat = chargerDepuisTexte(JSON.stringify(document));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const restaure = resultat.valeur.state;
    expect(restaure.seedText).toBe(original.seedText);
    expect(restaure.joueur).toEqual(original.joueur);
    expect(restaure.horloge.minutes).toBe(Math.round(original.horloge.minutes));
    expect(restaure.inventaire).toEqual(original.inventaire);
    expect(restaure.progression).toEqual(original.progression);
    expect(restaure.equipe).toEqual(original.equipe);
    expect(restaure.reserve).toEqual(original.reserve);
  });

  it('conserve les altérations, les PP entamés et les surnoms', () => {
    const original = partieAvancee();
    const resultat = chargerDepuisTexte(JSON.stringify(exporterPartie(original, HORODATAGE)));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const equipe = resultat.valeur.state.equipe;
    expect(equipe[0]!.statut).toBe('brulure');
    expect(equipe[0]!.pv).toBe(4);
    expect(equipe[1]!.surnom).toBe('Grignote');
    expect(equipe[1]!.moves[0]!.pp).toBe(2);
  });

  it('produit un document signé et relisible', () => {
    const document = exporterPartie(partieAvancee(), HORODATAGE);
    expect(document.format).toBe('terravia-save');
    expect(document.checksum).toHaveLength(8);
    expect(validerPartie(document).ok).toBe(true);
    expect(validerPartie(document)).toMatchObject({ avertissements: [] });
  });

  it('reste léger : le monde n’est pas dans le fichier', () => {
    // L'intérêt du monde procédural : quelques kilo-octets au lieu de mégaoctets.
    const octets = JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE)).length;
    expect(octets).toBeLessThan(8000);
  });

  it('donne un nom de fichier daté et lisible', () => {
    expect(nomFichier(partieAvancee(), HORODATAGE)).toBe('terravia-brume-3f7a-2026-08-07.json');
  });
});

describe('refus des fichiers invalides', () => {
  const cas: Array<[string, unknown, RegExp]> = [
    ['un texte qui n’est pas du JSON', undefined, /JSON valide/],
    ['un autre format', { format: 'autre-jeu', version: 1 }, /terravia-save/],
    ['une version future', { format: 'terravia-save', version: 99 }, /version/],
  ];

  for (const [nom, document, motif] of cas) {
    it(`rejette ${nom} avec un message précis`, () => {
      const texte = document === undefined ? '{pas du json' : JSON.stringify(document);
      const resultat = chargerDepuisTexte(texte);
      expect(resultat.ok).toBe(false);
      if (!resultat.ok) expect(resultat.raison).toMatch(motif);
    });
  }

  it('rejette une sauvegarde sans aucune créature', () => {
    // Un document par ailleurs bien formé : sans équipe, la partie serait injouable
    // dès le premier pas dans les hautes herbes.
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.equipe = [];
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toMatch(/équipe est vide/);
  });

  it('nomme l’attaque inconnue plutôt que de dire « fichier invalide »', () => {
    const document = exporterPartie(partieAvancee(), HORODATAGE) as unknown as Record<string, unknown>;
    const copie = JSON.parse(JSON.stringify(document)) as Record<string, any>;
    copie.equipe[0].moves[0].id = 'frostbolt';
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toContain('frostbolt');
  });

  it('rejette une espèce inconnue', () => {
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.equipe[0].speciesId = 'pikachu';
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toContain('pikachu');
  });

  it('rejette des PP au-delà du maximum de l’attaque', () => {
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.equipe[0].moves[0].pp = 9999;
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toMatch(/pp/i);
  });

  it('rejette des gènes hors bornes', () => {
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.equipe[0].genes.attaque = 999;
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toMatch(/genes\.attaque/);
  });

  it('rejette deux créatures partageant un identifiant', () => {
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.equipe[1].uid = copie.equipe[0].uid;
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toMatch(/identifiant/);
  });

  it('rejette une région qui n’existe pas', () => {
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.joueur.regionIndex = 42;
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toMatch(/regionIndex/);
  });

  it('avertit sans refuser quand la somme de contrôle a été modifiée', () => {
    // Une somme fausse signale une retouche manuelle, pas un fichier inutilisable.
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.joueur.pieces = 999999;
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.avertissements).toContain('somme de contrôle incorrecte');
    expect(resultat.valeur.state.joueur.pieces).toBe(999999);
  });

  it('ramène des points de vie exagérés au maximum réel', () => {
    const copie = JSON.parse(JSON.stringify(exporterPartie(partieAvancee(), HORODATAGE))) as Record<string, any>;
    copie.equipe[0].pv = 9000;
    const resultat = chargerDepuisTexte(JSON.stringify(copie));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const membre = resultat.valeur.state.equipe[0]!;
    expect(membre.pv).toBeLessThan(9000);
    expect(membre.pv).toBeGreaterThan(0);
  });
});

describe('combat en cours', () => {
  /** Une partie arrêtée en plein échange, avec des étages et un tour déjà entamés. */
  function partieEnCombat(): GameState {
    const state = partieAvancee();
    state.combat = {
      genre: 'sauvage',
      adversaires: [
        creerCreature(makeRng(77), {
          uid: prochainIdentifiant(state),
          speciesId: 'plumelle',
          niveau: 11,
          origine: 'brume-3f7a',
        }),
      ],
      dresseurId: null,
      indexJoueur: 1,
      indexAdverse: 0,
      etagesJoueur: { attaque: 2, defense: 0, attaqueSpe: 0, defenseSpe: -1, vitesse: 0 },
      etagesAdverse: { attaque: -1, defense: 0, attaqueSpe: 0, defenseSpe: 0, vitesse: 3 },
      tour: 5,
      tentativesFuite: 2,
    };
    state.combat.adversaires[0]!.pv = 9;
    state.combat.adversaires[0]!.statut = 'paralysie';
    return state;
  }

  it('survit à l’aller-retour sans rien perdre', () => {
    const avant = partieEnCombat();
    const texte = JSON.stringify(exporterPartie(avant, HORODATAGE));
    const resultat = chargerDepuisTexte(texte);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const apres = resultat.valeur.state.combat;
    expect(apres).not.toBeNull();
    expect(apres).toEqual(avant.combat);
  });

  it('retient le dresseur par son identifiant plutôt que par sa fiche', () => {
    const state = partieEnCombat();
    state.combat!.genre = 'dresseur';
    state.combat!.dresseurId = 'r3-dresseur-1';

    const document = exporterPartie(state, HORODATAGE);
    expect(document.combat?.dresseurId).toBe('r3-dresseur-1');
    // La fiche du dresseur se rebâtit depuis la seed : elle n'a rien à faire ici.
    expect(JSON.stringify(document.combat)).not.toContain('recompense');
  });

  it('n’écrit aucun bloc quand la partie n’est pas en combat', () => {
    expect(exporterPartie(partieAvancee(), HORODATAGE).combat).toBeNull();
  });

  /**
   * Le garde-fou qui compte : un échange abîmé coûte l'échange, jamais la partie. Sans
   * lui, un bloc de combat bancal rendrait « Continuer » définitivement inutilisable.
   */
  it('abandonne un combat incohérent sans rejeter la sauvegarde', () => {
    const state = partieEnCombat();
    state.combat!.indexJoueur = 42;
    const resultat = chargerDepuisTexte(JSON.stringify(exporterPartie(state, HORODATAGE)));

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.state.combat).toBeNull();
    expect(resultat.valeur.state.equipe).toHaveLength(3);
    expect(resultat.avertissements.join(' ')).toContain('combat en cours abandonné');
  });

  it('abandonne un combat dont l’adversaire est déjà hors de combat', () => {
    const state = partieEnCombat();
    state.combat!.adversaires[0]!.pv = 0;
    const resultat = chargerDepuisTexte(JSON.stringify(exporterPartie(state, HORODATAGE)));

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.state.combat).toBeNull();
  });

  it('rejette un étage hors des bornes du combat', () => {
    const state = partieEnCombat();
    state.combat!.etagesJoueur.attaque = 9;
    const resultat = chargerDepuisTexte(JSON.stringify(exporterPartie(state, HORODATAGE)));

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.state.combat).toBeNull();
    expect(resultat.avertissements.join(' ')).toContain('etagesJoueur.attaque');
  });
});

describe('migrations', () => {
  it('laisse passer un document déjà à jour', () => {
    const document = { format: 'terravia-save', version: VERSION_ACTUELLE, seed: 's' };
    expect(migrer(document)).toEqual(document);
  });

  it('hisse un document v1 jusqu’à la version courante', () => {
    const document = { format: 'terravia-save', version: 1, seed: 's' };
    expect(migrer(document)).toEqual({ ...document, version: 2, combat: null });
  });

  it('traite un document sans version comme une v1', () => {
    const document = { format: 'terravia-save', seed: 's' };
    expect(migrer(document)).toEqual({ ...document, version: 2, combat: null });
  });

  /**
   * Une migration change le contenu, donc la somme de contrôle. Sans précaution, toute
   * sauvegarde v1 valide se serait mise à crier « fichier corrompu » au premier
   * changement de format — exactement ce que le mécanisme est censé éviter.
   */
  it('ne fait pas passer une v1 saine pour un fichier corrompu', () => {
    const document = exporterPartie(partieAvancee(), HORODATAGE) as unknown as Record<string, unknown>;
    const { combat: _combat, ...sansCombat } = document;
    const v1 = signer({ ...sansCombat, version: 1 });

    const resultat = chargerDepuisTexte(JSON.stringify(v1));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.avertissements).toEqual([]);
    expect(resultat.valeur.state.combat).toBeNull();
  });

  it('avertit quand même sur une v1 réellement modifiée', () => {
    const document = exporterPartie(partieAvancee(), HORODATAGE) as unknown as Record<string, unknown>;
    const { combat: _combat, ...sansCombat } = document;
    const v1 = { ...signer({ ...sansCombat, version: 1 }), prochainUid: 999 };

    const resultat = chargerDepuisTexte(JSON.stringify(v1));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.avertissements).toContain('somme de contrôle incorrecte');
  });
});

describe('échange d’une créature', () => {
  it('exporte puis réimporte une créature avec un nouvel identifiant', () => {
    const state = partieAvancee();
    const document = exporterCreature(state.equipe[1]!, HORODATAGE);
    const resultat = chargerCreatureDepuisTexte(JSON.stringify(document));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const importee = importerCreature(resultat.valeur, 'c999');
    expect(importee.uid).toBe('c999');
    expect(importee.speciesId).toBe(state.equipe[1]!.speciesId);
    expect(importee.genes).toEqual(state.equipe[1]!.genes);
    expect(importee.surnom).toBe('Grignote');
  });

  it('refuse une sauvegarde de partie présentée comme une créature', () => {
    const document = exporterPartie(partieAvancee(), HORODATAGE);
    const resultat = chargerCreatureDepuisTexte(JSON.stringify(document));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.raison).toContain('terravia-creature');
  });

  it('évite la collision d’identifiants après import', () => {
    // Une créature venue d'ailleurs peut porter un identifiant déjà utilisé : le
    // compteur doit repartir au-delà, sinon deux créatures deviendraient une seule.
    const original = partieAvancee();
    const document = exporterPartie(original, HORODATAGE);
    const copie = JSON.parse(JSON.stringify(document)) as Record<string, any>;
    copie.prochainUid = 1;
    copie.equipe[0].uid = 'c57';
    const validation = validerPartie(copie);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(importerPartie(validation.valeur).prochainUid).toBeGreaterThan(57);
  });
});

describe('sac et achats', () => {
  it('empile jusqu’à 99 et pas au-delà', () => {
    const state = creerPartie('s', 'fr');
    expect(ajouterObjet(state, 'potion', 200)).toBe(99 - 3);
    expect(quantite(state, 'potion')).toBe(99);
  });

  it('retire un objet, et refuse d’en retirer plus qu’il n’y en a', () => {
    const state = creerPartie('s', 'fr');
    expect(retirerObjet(state, 'potion', 99)).toBe(false);
    expect(retirerObjet(state, 'potion', 3)).toBe(true);
    expect(quantite(state, 'potion')).toBe(0);
    expect(sacTrie(state).some((entree) => entree.item === 'potion')).toBe(false);
  });

  it('refuse un achat trop cher et dit ce qui manque', () => {
    const state = creerPartie('s', 'fr');
    state.joueur.pieces = 100;
    const resultat = acheter(state, 'prismeRoyal', 1);
    expect(resultat.achete).toBe(false);
    expect(resultat.manque).toBe(1100);
    expect(state.joueur.pieces).toBe(100);
  });

  it('débite exactement le prix à l’achat', () => {
    const state = creerPartie('s', 'fr');
    state.joueur.pieces = 1000;
    expect(acheter(state, 'potion', 2).achete).toBe(true);
    expect(state.joueur.pieces).toBe(600);
    expect(quantite(state, 'potion')).toBe(5);
  });

  it('n’utilise pas une potion sur une créature au maximum', () => {
    const state = creerPartie('s', 'fr');
    const cible = creerCreature(makeRng(1), { uid: 'c1', speciesId: 'mulotin', niveau: 10, origine: 's' });
    const resultat = utiliserObjetSur(state, 'potion', cible);
    expect(resultat.utilise).toBe(false);
    expect(quantite(state, 'potion')).toBe(3);
  });

  it('n’utilise pas un antidote sur une créature saine', () => {
    const state = creerPartie('s', 'fr');
    ajouterObjet(state, 'antidote', 1);
    const cible = creerCreature(makeRng(1), { uid: 'c1', speciesId: 'mulotin', niveau: 10, origine: 's' });
    expect(utiliserObjetSur(state, 'antidote', cible).utilise).toBe(false);
    expect(quantite(state, 'antidote')).toBe(1);
  });

  it('consomme l’objet quand il agit vraiment', () => {
    const state = creerPartie('s', 'fr');
    const cible = creerCreature(makeRng(1), { uid: 'c1', speciesId: 'mulotin', niveau: 10, origine: 's' });
    cible.pv = 1;
    const resultat = utiliserObjetSur(state, 'potion', cible);
    expect(resultat.utilise).toBe(true);
    expect(resultat.pvRendus).toBeGreaterThan(0);
    expect(quantite(state, 'potion')).toBe(2);
  });
});
