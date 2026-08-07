/**
 * Catalogue de traductions.
 *
 * Le français fait foi : le type des clés en est déduit, si bien qu'une clé anglaise
 * manquante ou en trop ne compile pas. Un test vérifie en plus qu'aucune traduction
 * n'est vide et qu'aucun paramètre ne diffère entre les deux langues.
 *
 * Les noms de contenu — créatures, attaques, talents, objets — ne sont *pas* ici : ils
 * vivent dans les données, avec les valeurs qu'ils décrivent. Ce catalogue ne contient
 * que les textes de l'interface et les dialogues.
 */

export const LANGUES = ['fr', 'en'] as const;
export type Langue = (typeof LANGUES)[number];

const FR = {
  // ── Écran-titre et sauvegardes ─────────────────────────────────────────────
  'titre.sousTitre': 'un monde différent à chaque seed',
  'titre.nouvellePartie': 'Nouvelle partie',
  'titre.continuer': 'Continuer',
  'titre.importer': 'Importer une sauvegarde',
  'titre.langue': 'English',
  'titre.seed': 'Seed : {seed}',
  'titre.seedLibre': 'Cette seed décide du monde entier. Notez-la pour y revenir.',
  'titre.autreSeed': 'Tirer une autre seed',
  'titre.commencer': 'Commencer',
  'titre.retour': 'Échap : retour',

  // ── Choix du starter ───────────────────────────────────────────────────────
  'depart.question': 'Trois créatures vous attendent. Laquelle vous accompagne ?',
  'depart.confirmer': 'Partir avec {nom} ?',
  'depart.oui': 'Oui',
  'depart.non': 'Non',

  // ── Monde ──────────────────────────────────────────────────────────────────
  'monde.entree': '{region}',
  'monde.objetTrouve': 'Vous ramassez {objet} !',
  'monde.sacPlein': 'Votre sac est plein.',
  'monde.rien': 'Il n’y a rien ici.',
  'monde.soinFait': 'Votre équipe est remise sur pied.',
  'monde.boutiqueVide': 'Vous n’avez pas de quoi acheter cela.',
  'monde.acheteOk': '{objet} × {quantite}. Merci !',
  'monde.pasAssez': 'Il vous manque {manque} pièces.',
  'monde.equipeVide': 'Aucune créature en état de se battre.',

  // ── Menu principal ─────────────────────────────────────────────────────────
  'menu.equipe': 'Équipe',
  'menu.sac': 'Sac',
  'menu.terradex': 'Terradex',
  'menu.reserve': 'Réserve',
  'menu.sauvegarde': 'Sauvegarde',
  'menu.options': 'Options',
  'menu.fermer': 'Fermer',
  'menu.vide': 'Rien ici.',
  'menu.retour': 'Retour',

  // ── Sauvegarde ─────────────────────────────────────────────────────────────
  'sauvegarde.exporter': 'Exporter en JSON',
  'sauvegarde.importer': 'Importer un JSON',
  'sauvegarde.exporterCreature': 'Exporter une créature',
  'sauvegarde.enregistree': 'Partie enregistrée dans ce navigateur.',
  'sauvegarde.exportee': 'Fichier téléchargé.',
  'sauvegarde.confirmerImport': 'Charger cette sauvegarde ? La partie en cours sera remplacée.',
  'sauvegarde.resume': 'Seed {seed} · {region} · {creatures} créatures · {temps}',
  'sauvegarde.invalide': 'Sauvegarde illisible : {raison}',
  'sauvegarde.creatureImportee': '{nom} rejoint votre réserve.',
  'sauvegarde.deposer': 'Déposez un fichier de sauvegarde n’importe où sur la page.',

  // ── Combat ─────────────────────────────────────────────────────────────────
  'combat.sauvage': 'Un {nom} sauvage surgit !',
  'combat.dresseur': '{dresseur} veut se battre !',
  'combat.dresseurGenerique': 'Un dresseur',
  'combat.championGenerique': 'Le champion d’arène',
  'combat.envoie': 'En avant, {nom} !',
  'combat.adversaireEnvoie': '{dresseur} envoie {nom} !',
  'combat.attaquer': 'Attaquer',
  'combat.sac': 'Sac',
  'combat.equipe': 'Équipe',
  'combat.fuir': 'Fuir',
  'combat.utilise': '{nom} utilise {attaque} !',
  'combat.rate': 'L’attaque échoue.',
  'combat.critique': 'Coup critique !',
  'combat.efficace.veryStrong': 'C’est dévastateur !',
  'combat.efficace.strong': 'C’est très efficace !',
  'combat.efficace.weak': 'Ce n’est pas très efficace…',
  'combat.efficace.veryWeak': 'Ça ne fait presque rien.',
  'combat.efficace.immune': 'Ça n’a aucun effet.',
  'combat.ko': '{nom} est hors de combat !',
  'combat.talent': 'Son talent se déclenche.',
  'combat.coupsMultiples': 'Touché {coups} fois !',
  'combat.recul': 'Le contrecoup se retourne contre lui.',
  'combat.souffre.brulure': 'La brûlure le ronge.',
  'combat.souffre.poison': 'Le poison fait son œuvre.',
  'combat.statut.brulure': '{nom} est brûlé !',
  'combat.statut.poison': '{nom} est empoisonné !',
  'combat.statut.paralysie': '{nom} est paralysé !',
  'combat.statut.sommeil': '{nom} s’endort !',
  'combat.statut.gel': '{nom} est gelé !',
  'combat.dissipe': '{nom} retrouve ses esprits.',
  'combat.immobilise.sommeil': '{nom} dort profondément.',
  'combat.immobilise.gel': '{nom} est pris dans la glace.',
  'combat.immobilise.paralysie': '{nom} est paralysé et ne peut pas bouger.',
  'combat.statHausse': '{stat} de {nom} augmente !',
  'combat.statBaisse': '{stat} de {nom} baisse !',
  'combat.soin': '{nom} récupère des points de vie.',
  'combat.fuiteReussie': 'Vous prenez la fuite.',
  'combat.fuiteRatee': 'Impossible de s’échapper !',
  'combat.fuiteImpossible': 'On ne fuit pas un dresseur.',
  'combat.lancePrisme': 'Vous lancez {objet} !',
  'combat.captureReussie': '{nom} est scellé dans le prisme !',
  'combat.captureRatee': 'Le prisme s’est ouvert !',
  'combat.secousses': '{secousses} secousses…',
  'combat.victoire': 'Combat gagné.',
  'combat.gainXp': '{nom} gagne {xp} points d’expérience.',
  'combat.niveau': '{nom} passe au niveau {niveau} !',
  'combat.apprend': '{nom} apprend {attaque} !',
  'combat.oublier': '{nom} veut apprendre {attaque}. Quelle attaque oublier ?',
  'combat.evolue': '{nom} évolue en {evolution} !',
  'combat.recompense': 'Vous recevez {pieces} pièces.',
  'combat.dressage': '{nom} gagne {points} en {stat}.',
  'combat.defaite': 'Toutes vos créatures sont hors de combat…',
  'combat.retourBourg': 'Vous reprenez vos esprits au dernier lieu sûr.',
  'combat.plusDePp': 'Plus aucune attaque disponible.',
  'combat.pasDeFuite': 'Choisissez une créature encore debout.',

  // ── Fiche de créature ──────────────────────────────────────────────────────
  'fiche.niveau': 'N. {niveau}',
  'fiche.pv': 'PV',
  'fiche.xp': 'EXP',
  'fiche.talent': 'Talent',
  'fiche.type': 'Type',
  'fiche.genes': 'Gènes',
  'fiche.dressage': 'Dressage',
  'fiche.taille': '{taille} m · {poids} kg',
  'fiche.origine': 'Origine : {seed}',
  'fiche.attaques': 'Attaques',
  'fiche.puissance': 'Puiss.',
  'fiche.precision': 'Préc.',
  'fiche.infaillible': '—',

  // ── Terradex ───────────────────────────────────────────────────────────────
  'terradex.titre': 'Terradex',
  'terradex.progression': '{vus} / {total} rencontrés · {captures} capturés',
  'terradex.inconnu': '???',
  'terradex.faiblesses': 'Faible contre',
  'terradex.resistances': 'Résiste à',

  // ── Boutique et soins ──────────────────────────────────────────────────────
  'boutique.titre': 'Boutique',
  'boutique.acheter': 'Acheter',
  'boutique.quitter': 'Quitter',
  'boutique.pieces': '{pieces} pièces',
  'soin.propose': 'Voulez-vous que je remette votre équipe sur pied ?',

  // ── Cycle jour/nuit ────────────────────────────────────────────────────────
  'heure.aube': 'Aube',
  'heure.jour': 'Jour',
  'heure.crepuscule': 'Crépuscule',
  'heure.nuit': 'Nuit',

  // ── Dialogues ──────────────────────────────────────────────────────────────
  'dialogue.professeur':
    'Terravia change à chaque génération. Notez bien votre seed : c’est la seule façon de retrouver ce monde-ci.',
  'dialogue.marchand': 'Prismes, potions, antidotes. De quoi tenir jusqu’à l’arène.',
  'dialogue.soigneuse': 'Posez vos prismes sur le comptoir, je m’occupe du reste.',
  'dialogue.champion':
    'Personne n’arrive jusqu’ici par hasard. Montrez-moi ce que vous avez appris en chemin.',
  'dialogue.championVaincu':
    'Vous avez gagné. Le monde suivant vous attend — il suffit d’une autre seed.',
  'dialogue.villageois.0': 'Les hautes herbes bougent toutes seules, par ici. Méfiez-vous.',
  'dialogue.villageois.1': 'Mon oncle jure avoir vu une créature dorée au fond des ruines. Il boit beaucoup.',
  'dialogue.villageois.2': 'Une créature endormie se capture bien plus facilement. Tout le monde le sait.',
  'dialogue.villageois.3': 'Certaines espèces ne sortent que la nuit. Patientez donc jusqu’au soir.',
  'dialogue.villageois.4': 'Deux créatures de la même espèce ne se valent jamais tout à fait.',
  'dialogue.villageois.5': 'Le métal ne s’empoisonne pas, et on ne brûle pas le feu. Ça paraît évident, dit comme ça.',
  'dialogue.villageois.6': 'Un rebord se descend, jamais ne se remonte.',
  'dialogue.villageois.7': 'Le champion n’a jamais perdu. Enfin — pas encore.',
  'dialogue.dresseur.0': 'Vous avez l’air de tenir debout. On vérifie ?',
  'dialogue.dresseur.1': 'Je m’entraîne ici depuis l’aube. Vous tombez bien.',
  'dialogue.dresseur.2': 'Pas un pas de plus sans un combat.',
  'dialogue.dresseur.3': 'Mes créatures s’ennuient. Vous ferez l’affaire.',
  'dialogue.dresseur.4': 'On m’a dit qu’un dresseur montait vers l’arène. C’était vous ?',
  'dialogue.dresseur.5': 'Un seul combat. Après, je vous laisse passer.',
  'dialogue.dresseurVaincu.0': 'Bien joué. Sincèrement.',
  'dialogue.dresseurVaincu.1': 'J’ai encore du travail…',
  'dialogue.dresseurVaincu.2': 'Vous irez loin. Plus loin que moi, en tout cas.',
  'dialogue.dresseurVaincu.3': 'Je n’ai rien vu venir.',
  'dialogue.dresseurVaincu.4': 'Reprenez la route, vous l’avez méritée.',
  'dialogue.dresseurVaincu.5': 'La prochaine fois, ce sera différent.',
  'dialogue.panneau.bourg': 'BOURG — Là où tout commence. L’arène est plein nord.',
  'dialogue.panneau.0': 'Attention : hautes herbes. Ne traversez pas sans créature.',
  'dialogue.panneau.1': 'Vers le nord : l’arène. Vers le sud : chez vous.',
  'dialogue.panneau.2': 'Le pont est coupé depuis l’hiver dernier. Contournez.',
  'dialogue.panneau.3': 'Les rebords se descendent d’un saut. Pas dans l’autre sens.',
  'dialogue.panneau.4': 'Ne nourrissez pas les créatures sauvages.',

  // ── Contrôles ──────────────────────────────────────────────────────────────
  'aide.deplacer': 'Flèches ou ZQSD : se déplacer',
  'aide.action': 'Entrée ou E : parler, ramasser',
  'aide.menu': 'Échap ou M : menu',
  'aide.fermer': 'Échap : fermer',
} as const;

export type CleTexte = keyof typeof FR;

const EN: Record<CleTexte, string> = {
  'titre.sousTitre': 'a different world for every seed',
  'titre.nouvellePartie': 'New game',
  'titre.continuer': 'Continue',
  'titre.importer': 'Import a save',
  'titre.langue': 'Français',
  'titre.seed': 'Seed: {seed}',
  'titre.seedLibre': 'This seed decides the whole world. Note it down to come back.',
  'titre.autreSeed': 'Roll another seed',
  'titre.commencer': 'Begin',
  'titre.retour': 'Escape: back',

  'depart.question': 'Three creatures are waiting. Which one comes with you?',
  'depart.confirmer': 'Set out with {nom}?',
  'depart.oui': 'Yes',
  'depart.non': 'No',

  'monde.entree': '{region}',
  'monde.objetTrouve': 'You picked up {objet}!',
  'monde.sacPlein': 'Your bag is full.',
  'monde.rien': 'There is nothing here.',
  'monde.soinFait': 'Your team is back on its feet.',
  'monde.boutiqueVide': 'You cannot afford that.',
  'monde.acheteOk': '{objet} × {quantite}. Thank you!',
  'monde.pasAssez': 'You are {manque} coins short.',
  'monde.equipeVide': 'No creature is fit to fight.',

  'menu.equipe': 'Team',
  'menu.sac': 'Bag',
  'menu.terradex': 'Terradex',
  'menu.reserve': 'Storage',
  'menu.sauvegarde': 'Save',
  'menu.options': 'Options',
  'menu.fermer': 'Close',
  'menu.vide': 'Nothing here.',
  'menu.retour': 'Back',

  'sauvegarde.exporter': 'Export as JSON',
  'sauvegarde.importer': 'Import a JSON',
  'sauvegarde.exporterCreature': 'Export a creature',
  'sauvegarde.enregistree': 'Game saved in this browser.',
  'sauvegarde.exportee': 'File downloaded.',
  'sauvegarde.confirmerImport': 'Load this save? The current game will be replaced.',
  'sauvegarde.resume': 'Seed {seed} · {region} · {creatures} creatures · {temps}',
  'sauvegarde.invalide': 'Unreadable save: {raison}',
  'sauvegarde.creatureImportee': '{nom} joins your storage.',
  'sauvegarde.deposer': 'Drop a save file anywhere on the page.',

  'combat.sauvage': 'A wild {nom} appears!',
  'combat.dresseur': '{dresseur} wants to battle!',
  'combat.dresseurGenerique': 'A trainer',
  'combat.championGenerique': 'The arena champion',
  'combat.envoie': 'Go, {nom}!',
  'combat.adversaireEnvoie': '{dresseur} sends out {nom}!',
  'combat.attaquer': 'Fight',
  'combat.sac': 'Bag',
  'combat.equipe': 'Team',
  'combat.fuir': 'Run',
  'combat.utilise': '{nom} uses {attaque}!',
  'combat.rate': 'The attack misses.',
  'combat.critique': 'A critical hit!',
  'combat.efficace.veryStrong': 'It is devastating!',
  'combat.efficace.strong': 'It is very effective!',
  'combat.efficace.weak': 'It is not very effective…',
  'combat.efficace.veryWeak': 'It barely does anything.',
  'combat.efficace.immune': 'It has no effect.',
  'combat.ko': '{nom} is out of the fight!',
  'combat.talent': 'Its talent kicks in.',
  'combat.coupsMultiples': 'Hit {coups} times!',
  'combat.recul': 'The recoil bites back.',
  'combat.souffre.brulure': 'The burn gnaws at it.',
  'combat.souffre.poison': 'The poison does its work.',
  'combat.statut.brulure': '{nom} is burned!',
  'combat.statut.poison': '{nom} is poisoned!',
  'combat.statut.paralysie': '{nom} is paralyzed!',
  'combat.statut.sommeil': '{nom} falls asleep!',
  'combat.statut.gel': '{nom} is frozen!',
  'combat.dissipe': '{nom} comes back to its senses.',
  'combat.immobilise.sommeil': '{nom} is fast asleep.',
  'combat.immobilise.gel': '{nom} is locked in ice.',
  'combat.immobilise.paralysie': '{nom} is paralyzed and cannot move.',
  'combat.statHausse': '{nom}’s {stat} rises!',
  'combat.statBaisse': '{nom}’s {stat} falls!',
  'combat.soin': '{nom} recovers some HP.',
  'combat.fuiteReussie': 'You got away.',
  'combat.fuiteRatee': 'There is no escape!',
  'combat.fuiteImpossible': 'You cannot run from a trainer.',
  'combat.lancePrisme': 'You throw {objet}!',
  'combat.captureReussie': '{nom} is sealed in the prism!',
  'combat.captureRatee': 'The prism sprang open!',
  'combat.secousses': '{secousses} shakes…',
  'combat.victoire': 'Battle won.',
  'combat.gainXp': '{nom} gains {xp} experience points.',
  'combat.niveau': '{nom} reaches level {niveau}!',
  'combat.apprend': '{nom} learns {attaque}!',
  'combat.oublier': '{nom} wants to learn {attaque}. Which move should it forget?',
  'combat.evolue': '{nom} evolves into {evolution}!',
  'combat.recompense': 'You receive {pieces} coins.',
  'combat.dressage': '{nom} gains {points} in {stat}.',
  'combat.defaite': 'Your whole team is out of the fight…',
  'combat.retourBourg': 'You come to at the last safe place.',
  'combat.plusDePp': 'No move left to use.',
  'combat.pasDeFuite': 'Pick a creature still standing.',

  'fiche.niveau': 'Lv. {niveau}',
  'fiche.pv': 'HP',
  'fiche.xp': 'EXP',
  'fiche.talent': 'Talent',
  'fiche.type': 'Type',
  'fiche.genes': 'Genes',
  'fiche.dressage': 'Training',
  'fiche.taille': '{taille} m · {poids} kg',
  'fiche.origine': 'Origin: {seed}',
  'fiche.attaques': 'Moves',
  'fiche.puissance': 'Pow.',
  'fiche.precision': 'Acc.',
  'fiche.infaillible': '—',

  'terradex.titre': 'Terradex',
  'terradex.progression': '{vus} / {total} seen · {captures} caught',
  'terradex.inconnu': '???',
  'terradex.faiblesses': 'Weak to',
  'terradex.resistances': 'Resists',

  'boutique.titre': 'Shop',
  'boutique.acheter': 'Buy',
  'boutique.quitter': 'Leave',
  'boutique.pieces': '{pieces} coins',
  'soin.propose': 'Shall I put your team back on its feet?',

  'heure.aube': 'Dawn',
  'heure.jour': 'Day',
  'heure.crepuscule': 'Dusk',
  'heure.nuit': 'Night',

  'dialogue.professeur':
    'Terravia is rebuilt for every seed. Write yours down — it is the only way back to this world.',
  'dialogue.marchand': 'Prisms, potions, antidotes. Enough to reach the arena.',
  'dialogue.soigneuse': 'Set your prisms on the counter, I will handle the rest.',
  'dialogue.champion':
    'Nobody reaches this place by accident. Show me what the road taught you.',
  'dialogue.championVaincu':
    'You won. The next world is waiting — all it takes is another seed.',
  'dialogue.villageois.0': 'The tall grass moves on its own around here. Careful.',
  'dialogue.villageois.1': 'My uncle swears he saw a golden creature deep in the ruins. He drinks a lot.',
  'dialogue.villageois.2': 'A sleeping creature is far easier to catch. Everyone knows that.',
  'dialogue.villageois.3': 'Some species only come out at night. Wait until evening.',
  'dialogue.villageois.4': 'No two creatures of the same species are quite alike.',
  'dialogue.villageois.5': 'Metal cannot be poisoned, and fire cannot be burned. Obvious, put that way.',
  'dialogue.villageois.6': 'A ledge goes down. Never up.',
  'dialogue.villageois.7': 'The champion has never lost. Well — not yet.',
  'dialogue.dresseur.0': 'You look like you can take a hit. Shall we check?',
  'dialogue.dresseur.1': 'I have trained here since dawn. Good timing.',
  'dialogue.dresseur.2': 'Not one step further without a battle.',
  'dialogue.dresseur.3': 'My creatures are bored. You will do.',
  'dialogue.dresseur.4': 'They said a trainer was heading for the arena. That you?',
  'dialogue.dresseur.5': 'One battle. Then I let you through.',
  'dialogue.dresseurVaincu.0': 'Well played. Truly.',
  'dialogue.dresseurVaincu.1': 'I still have work to do…',
  'dialogue.dresseurVaincu.2': 'You will go far. Further than me, anyway.',
  'dialogue.dresseurVaincu.3': 'I never saw it coming.',
  'dialogue.dresseurVaincu.4': 'Back to the road — you earned it.',
  'dialogue.dresseurVaincu.5': 'Next time it goes differently.',
  'dialogue.panneau.bourg': 'HAMLET — Where it all starts. The arena lies due north.',
  'dialogue.panneau.0': 'Warning: tall grass. Do not cross without a creature.',
  'dialogue.panneau.1': 'North: the arena. South: home.',
  'dialogue.panneau.2': 'The bridge has been out since last winter. Go around.',
  'dialogue.panneau.3': 'Ledges are a one-jump drop. Not the other way.',
  'dialogue.panneau.4': 'Do not feed the wild creatures.',

  'aide.deplacer': 'Arrows or WASD: move',
  'aide.action': 'Enter or E: talk, pick up',
  'aide.menu': 'Escape or M: menu',
  'aide.fermer': 'Escape: close',
};

const CATALOGUES: Record<Langue, Record<CleTexte, string>> = { fr: FR, en: EN };

export type Params = Record<string, string | number>;

/**
 * Traduit une clé et remplace les paramètres `{nom}`.
 *
 * Un paramètre absent laisse son marqueur visible plutôt que d'afficher « undefined » :
 * l'oubli se voit en jeu au lieu de passer pour du texte.
 */
export function traduire(langue: Langue, cle: CleTexte, params?: Params): string {
  const modele = CATALOGUES[langue][cle];
  if (!params) return modele;
  return modele.replace(/\{(\w+)\}/g, (marqueur, nom: string) => {
    const valeur = params[nom];
    return valeur === undefined ? marqueur : String(valeur);
  });
}

/** Les clés du catalogue, pour les tests de parité. */
export function clesTextes(): CleTexte[] {
  return Object.keys(FR) as CleTexte[];
}

export function catalogue(langue: Langue): Record<CleTexte, string> {
  return CATALOGUES[langue];
}

/** Vrai si la chaîne est une clé connue du catalogue. */
export function estCleConnue(valeur: string): valeur is CleTexte {
  return valeur in FR;
}
