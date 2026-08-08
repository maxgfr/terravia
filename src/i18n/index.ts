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
  'monde.objetTrouve': 'Vous ramassez {objet} !',
  'monde.sacPlein': 'Votre sac est plein.',
  'monde.soinFait': 'Votre équipe est remise sur pied.',
  'monde.acheteOk': '{objet} × {quantite}. Merci !',
  'monde.pasAssez': 'Il vous manque {manque} pièces.',
  'monde.equipeVide': 'Aucune créature en état de se battre.',
  'monde.arenePortesCloses': 'La porte du fond est close. Battez le champion {type} pour passer.',
  'monde.eauSansCanne': 'L’eau est profonde. Avec de quoi pêcher, elle serait pleine de promesses.',
  'monde.pecheLance': 'Vous lancez la ligne…',
  'monde.pecheRien': 'Ça ne mord pas.',
  'monde.sanctuaireScelle': 'Le sanctuaire ne s’ouvre qu’aux vainqueurs de toutes les arènes.',

  // ── Menu principal ─────────────────────────────────────────────────────────
  'menu.equipe': 'Équipe',
  'menu.sac': 'Sac',
  'menu.terradex': 'Terradex',
  'menu.reserve': 'Réserve',
  'menu.sauvegarde': 'Sauvegarde',
  'menu.carte': 'Carte',
  'menu.fermer': 'Fermer',
  'menu.vide': 'Rien ici.',
  'menu.retour': 'Retour',
  'menu.reserveVide': 'Personne ici.',
  'menu.deposer': 'Valider : déposer en réserve',
  'menu.reprendre': 'Valider : reprendre dans l’équipe',
  'menu.echanger': 'Valider : échanger avec la gauche',
  'menu.equipeMinimale': 'Vous ne pouvez pas partir sans créature.',
  'menu.rejointEquipe': '{nom} rejoint l’équipe.',
  'menu.echange': '{nom} prend sa place dans l’équipe.',
  'menu.sansCarte': 'Vous n’avez pas de carte. Il y en avait une au bourg.',
  'menu.pierreQui': 'Sur quelle créature poser la Pierre d’Éveil ?',
  'menu.aucuneEvolution': 'Aucune de vos créatures n’a d’évolution devant elle.',

  // ── Paramètres ─────────────────────────────────────────────────────────────
  'parametres.langue': 'Langue : Français',
  'parametres.commentJouer': 'Comment jouer',
  'parametres.recommencer': 'Revenir à l’écran-titre',
  'parametres.confirmerTitre': 'Revenir à l’écran-titre ? La partie en cours est déjà enregistrée.',

  // ── Comment jouer ──────────────────────────────────────────────────────────
  'aide.titre': 'Comment jouer',
  'aide.page': '{page} / {total}',
  'aide.suite': 'Entrée : suite · Échap : fermer',
  'aide.but.titre': 'Le but',
  'aide.but.texte':
    'Vous partez du bourg avec une créature. La route file plein nord, jalonnée d’arènes. Capturez, entraînez, battez chaque champion — le dernier ouvre le sanctuaire.',
  'aide.controles.titre': 'Se déplacer',
  'aide.controles.texte':
    'Flèches ou ZQSD pour marcher. Entrée ou E pour parler, lire un panneau, ramasser. Échap ou M ouvre le menu. À la souris : maintenez le bouton pour marcher vers le curseur, cliquez un voisin pour lui parler, une ligne pour la choisir. Sur téléphone, les boutons à l’écran font la même chose.',
  'aide.herbes.titre': 'Les hautes herbes',
  'aide.herbes.texte':
    'Les touffes sombres cachent des créatures sauvages. Y marcher déclenche parfois un combat. Les chemins et les villages sont sûrs.',
  'aide.capture.titre': 'Capturer',
  'aide.capture.texte':
    'En combat, ouvrez le Sac et lancez un Prisme. Plus la cible est affaiblie ou endormie, plus il se referme. Une créature capturée rejoint votre équipe, ou la réserve si elle est pleine.',
  'aide.seed.titre': 'La seed',
  'aide.seed.texte':
    'Le monde entier est reconstruit à partir de la seed de votre partie. Notez-la : elle suffit à retrouver ce monde-ci, et à le faire découvrir à quelqu’un d’autre.',
  'aide.equipe.titre': 'Équipe et réserve',
  'aide.equipe.texte':
    'Six créatures vous accompagnent au maximum. Les suivantes attendent en réserve — rien n’est perdu. Le menu permet d’y déposer une créature et d’en reprendre une à tout moment.',
  'aide.arenes.titre': 'Arènes et insignes',
  'aide.arenes.texte':
    'Chaque arène a son champion et sa spécialité. Le battre remporte son insigne, et l’insigne ouvre la porte du fond : on ne contourne pas une arène. Le dernier insigne ouvre le sanctuaire.',
  'aide.peche.titre': 'Pêche et objets rares',
  'aide.peche.texte':
    'La canne se trouve au village : face à l’eau, elle remonte des créatures qu’on ne croise pas à pied. La Pierre d’Éveil dort au fond des grottes et précipite une évolution. La carte attend au bourg.',
  'aide.sauvegarde.titre': 'Sauvegarder',
  'aide.sauvegarde.texte':
    'La partie s’enregistre toute seule dans ce navigateur. Depuis le menu, vous pouvez l’exporter en fichier JSON, puis la réimporter ici ou ailleurs — glissez simplement le fichier sur la page.',

  // ── Carte ──────────────────────────────────────────────────────────────────
  'carte.soin': 'Soin',
  'carte.objets': 'Objet',
  'carte.sortie': 'Sortie',
  'carte.vous': 'Vous',
  'carte.legende': 'Bande du bas : le parcours, arènes et villages marqués.',
  'carte.progression': 'Région {index} sur {total}',

  // ── Didacticiel de première partie ─────────────────────────────────────────
  'didacticiel.1':
    'Vous voilà dehors. La route monte plein nord, d’une région à l’autre, jusqu’à la première arène.',
  'didacticiel.2':
    'Marchez avec les flèches. Parlez aux gens et lisez les panneaux avec Entrée : plusieurs donnent de bons conseils.',
  'didacticiel.3':
    'Les hautes herbes sombres abritent des créatures sauvages. Ouvrez le menu avec Échap pour votre équipe, votre sac et la carte.',
  'didacticiel.4':
    'Dans les bourgs et les villages, une soigneuse remet votre équipe sur pied gratuitement, et un marchand vend des prismes de capture. Parlez-leur avec Entrée.',

  // ── Sauvegarde ─────────────────────────────────────────────────────────────
  'sauvegarde.maintenant': 'Enregistrer maintenant',
  'sauvegarde.impossible': 'Ce navigateur refuse d’enregistrer. Exportez un fichier.',
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
  'combat.gainXp': '{nom} gagne {xp} points d’expérience.',
  'combat.niveau': '{nom} passe au niveau {niveau} !',
  'combat.apprend': '{nom} apprend {attaque} !',
  'combat.oublier': '{nom} veut apprendre {attaque}. Quelle attaque oublier ?',
  'combat.oublie': '{nom} oublie {ancienne}.',
  'combat.renoncer': 'Ne rien oublier',
  'combat.renonce': '{nom} n’apprend pas {attaque}.',
  'combat.evolue': '{nom} évolue en {evolution} !',
  'combat.recompense': 'Vous recevez {pieces} pièces.',
  'combat.badge': 'Vous remportez l’insigne {type} !',
  'combat.dressage': '{nom} gagne {points} en {stat}.',
  'combat.defaite': 'Toutes vos créatures sont hors de combat…',
  'combat.retourBourg': 'Vous reprenez vos esprits au dernier lieu sûr.',
  'combat.plusDePp': 'Plus aucune attaque disponible.',
  'combat.pasDeFuite': 'Choisissez une créature encore debout.',
  'combat.dejaEnJeu': '{nom} est déjà sur le terrain.',
  'combat.captureImpossible': 'On ne capture pas la créature d’un dresseur.',
  'combat.reprise': 'Le combat contre {nom} reprend.',

  // ── Encyclopédie ───────────────────────────────────────────────────────────
  'encyclopedie.titre': 'Encyclopédie',
  'encyclopedie.creatures': 'Créatures',
  'encyclopedie.attaques': 'Attaques',
  'encyclopedie.objets': 'Objets',
  'encyclopedie.aide': '◀ ▶ rayon · ▲ ▼ parcourir · Échap : fermer',
  'encyclopedie.puissanceTotale': 'Puissance',
  'encyclopedie.evolue': 'Évolue en {espece} au niveau {niveau}',
  'encyclopedie.lignéeFinale': 'Dernier stade de sa lignée',
  'encyclopedie.pp': 'Utilisations',
  'encyclopedie.priorite': 'Priorité {valeur}',
  'encyclopedie.categorie.physique': 'Physique',
  'encyclopedie.categorie.special': 'Spéciale',
  'encyclopedie.categorie.statut': 'Statut',
  'encyclopedie.usage.combat': 'En combat',
  'encyclopedie.usage.monde': 'Hors combat',
  'encyclopedie.usage.partout': 'En combat et hors combat',
  'encyclopedie.enBoutique': 'En vente à la boutique du village, {prix} pièces',
  'encyclopedie.aTrouver': 'Se trouve dans le monde, pas en boutique',

  // ── Fin de partie ──────────────────────────────────────────────────────────
  'fin.titre': 'TERRAVIA TRAVERSÉE',
  'fin.temps': 'Temps de jeu',
  'fin.terradex': 'Terradex',
  'fin.dresseurs': 'Dresseurs vaincus',
  'fin.seed': 'Seed',
  'fin.sanctuaire': 'Le sanctuaire s’est ouvert au bout de la route. On y croise ce qui ne se montre nulle part ailleurs.',
  'fin.reprendre': 'Reprendre l’aventure',
  'fin.nouvelleSeed': 'Repartir sur une autre seed',

  // ── Fiche de créature ──────────────────────────────────────────────────────
  'fiche.niveau': 'N. {niveau}',
  'fiche.pv': 'PV',
  'fiche.xp': 'EXP',
  'fiche.talent': 'Talent',
  'fiche.genes': 'Gènes',
  'fiche.dressage': 'Dressage',
  'fiche.taille': '{taille} m · {poids} kg',
  'fiche.origine': 'Origine : {seed}',
  'fiche.attaques': 'Attaques',
  'fiche.puissance': 'Puiss.',
  'fiche.precision': 'Préc.',
  'fiche.infaillible': '—',

  // ── Terradex ───────────────────────────────────────────────────────────────
  'terradex.progression': '{vus} / {total} rencontrés · {captures} capturés',
  'terradex.inconnu': '???',
  'terradex.faiblesses': 'Craint',
  'terradex.resistances': 'Encaisse',
  'terradex.aucun': '—',
  'terradex.habitat': 'Vit en {biomes}',
  'terradex.consulter': 'Valider : fiche de l’espèce',

  // ── Boutique et soins ──────────────────────────────────────────────────────
  'boutique.titre': 'Boutique',
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
  'dialogue.sanctuaire':
    'Ici finissent les routes et commencent les légendes. Restez, observez : ce qui se montre le jour n’est pas ce qui rôde la nuit.',
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
  'dialogue.panneau.bourg': 'BOURG — Là où tout commence. La route est plein nord.',
  'dialogue.panneau.0': 'Attention : hautes herbes. Ne traversez pas sans créature.',
  'dialogue.panneau.1': 'Vers le nord : l’arène. Vers le sud : chez vous.',
  'dialogue.panneau.2': 'Le pont est coupé depuis l’hiver dernier. Contournez.',
  'dialogue.panneau.3': 'Les rebords se descendent d’un saut. Pas dans l’autre sens.',
  'dialogue.panneau.4': 'Ne nourrissez pas les créatures sauvages.',

  // ── Contrôles ──────────────────────────────────────────────────────────────
  'aide.deplacer': 'Flèches, ZQSD ou souris : se déplacer',
  'aide.action': 'Entrée, E ou clic : parler, choisir',
  'aide.fermer': 'Échap : fermer',
} as const;

export type CleTexte = keyof typeof FR;

const EN: Record<CleTexte, string> = {
  'titre.sousTitre': 'a different world for every seed',
  'titre.nouvellePartie': 'New game',
  'titre.continuer': 'Continue',
  'titre.importer': 'Import a save',
  'titre.seed': 'Seed: {seed}',
  'titre.seedLibre': 'This seed decides the whole world. Note it down to come back.',
  'titre.autreSeed': 'Roll another seed',
  'titre.commencer': 'Begin',
  'titre.retour': 'Escape: back',

  'depart.question': 'Three creatures are waiting. Which one comes with you?',
  'depart.confirmer': 'Set out with {nom}?',
  'depart.oui': 'Yes',
  'depart.non': 'No',

  'monde.objetTrouve': 'You picked up {objet}!',
  'monde.sacPlein': 'Your bag is full.',
  'monde.soinFait': 'Your team is back on its feet.',
  'monde.acheteOk': '{objet} × {quantite}. Thank you!',
  'monde.pasAssez': 'You are {manque} coins short.',
  'monde.equipeVide': 'No creature is fit to fight.',
  'monde.arenePortesCloses': 'The far door is shut. Beat the {type} champion to pass.',
  'monde.eauSansCanne': 'The water runs deep. With something to fish with, it would be full of promise.',
  'monde.pecheLance': 'You cast the line…',
  'monde.pecheRien': 'Nothing bites.',
  'monde.sanctuaireScelle': 'The sanctum opens only to those who cleared every arena.',

  'menu.equipe': 'Team',
  'menu.sac': 'Bag',
  'menu.terradex': 'Terradex',
  'menu.reserve': 'Storage',
  'menu.sauvegarde': 'Save',
  'menu.carte': 'Map',
  'menu.fermer': 'Close',
  'menu.vide': 'Nothing here.',
  'menu.retour': 'Back',
  'menu.reserveVide': 'Nobody here.',
  'menu.deposer': 'Confirm: send to storage',
  'menu.reprendre': 'Confirm: take into the party',
  'menu.echanger': 'Confirm: swap with the left pick',
  'menu.equipeMinimale': 'You cannot leave without a creature.',
  'menu.rejointEquipe': '{nom} joins the party.',
  'menu.echange': '{nom} takes its place in the party.',
  'menu.sansCarte': 'You have no map. There was one back in the hamlet.',
  'menu.pierreQui': 'Which creature should the Waking Stone touch?',
  'menu.aucuneEvolution': 'None of your creatures has an evolution ahead of it.',

  'parametres.langue': 'Language: English',
  'parametres.commentJouer': 'How to play',
  'parametres.recommencer': 'Back to the title screen',
  'parametres.confirmerTitre': 'Return to the title screen? The current game is already saved.',

  'aide.titre': 'How to play',
  'aide.page': '{page} / {total}',
  'aide.suite': 'Enter: next · Escape: close',
  'aide.but.titre': 'The goal',
  'aide.but.texte':
    'You leave the hamlet with one creature. The road runs due north, marked by arenas. Catch, train, beat every champion — the last one opens the sanctum.',
  'aide.controles.titre': 'Moving around',
  'aide.controles.texte':
    'Arrows or WASD to walk. Enter or E to talk, read a sign, pick things up. Escape or M opens the menu. With a mouse: hold the button to walk toward the cursor, click a neighbour to talk, click a row to pick it. On a phone, the on-screen buttons do the same.',
  'aide.herbes.titre': 'Tall grass',
  'aide.herbes.texte':
    'The dark tufts hide wild creatures. Walking into them sometimes starts a battle. Paths and villages are safe.',
  'aide.capture.titre': 'Catching',
  'aide.capture.texte':
    'In battle, open the Bag and throw a Prism. The weaker or sleepier the target, the better it holds. A caught creature joins your team, or storage if it is full.',
  'aide.seed.titre': 'The seed',
  'aide.seed.texte':
    'The whole world is rebuilt from your game’s seed. Write it down: it is all you need to find this world again, or to show it to someone else.',
  'aide.equipe.titre': 'Party and storage',
  'aide.equipe.texte':
    'Six creatures travel with you at most. The rest wait in storage — nothing is ever lost. The menu lets you send one away and take one back at any time.',
  'aide.arenes.titre': 'Arenas and insignia',
  'aide.arenes.texte':
    'Each arena has its champion and its speciality. Beating one earns its insignia, and the insignia opens the far door: an arena cannot be walked around. The last insignia opens the sanctum.',
  'aide.peche.titre': 'Fishing and rare items',
  'aide.peche.texte':
    'The rod waits in the village: facing water, it brings up creatures you never meet on foot. The Waking Stone sleeps deep in the caves and hastens an evolution. The map waits back in the hamlet.',
  'aide.sauvegarde.titre': 'Saving',
  'aide.sauvegarde.texte':
    'The game saves itself in this browser. From the menu you can export it as a JSON file and import it back here or elsewhere — just drop the file onto the page.',

  'carte.soin': 'Healing',
  'carte.objets': 'Item',
  'carte.sortie': 'Exit',
  'carte.vous': 'You',
  'carte.legende': 'Bottom strip: the route, arenas and towns marked.',
  'carte.progression': 'Region {index} of {total}',

  'didacticiel.1': 'You are outside. The road climbs due north, region after region, up to the first arena.',
  'didacticiel.2':
    'Walk with the arrows. Talk to people and read signs with Enter: several of them give good advice.',
  'didacticiel.3':
    'The dark tall grass hides wild creatures. Open the menu with Escape for your team, your bag and the map.',
  'didacticiel.4':
    'In hamlets and villages a healer puts your party back on its feet for free, and a merchant sells capture prisms. Talk to them with Enter.',

  'sauvegarde.maintenant': 'Save now',
  'sauvegarde.impossible': 'This browser refuses to save. Export a file instead.',
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
  'combat.gainXp': '{nom} gains {xp} experience points.',
  'combat.niveau': '{nom} reaches level {niveau}!',
  'combat.apprend': '{nom} learns {attaque}!',
  'combat.oublier': '{nom} wants to learn {attaque}. Which move should it forget?',
  'combat.oublie': '{nom} forgets {ancienne}.',
  'combat.renoncer': 'Forget nothing',
  'combat.renonce': '{nom} does not learn {attaque}.',
  'combat.evolue': '{nom} evolves into {evolution}!',
  'combat.recompense': 'You receive {pieces} coins.',
  'combat.badge': 'You earn the {type} insignia!',
  'combat.dressage': '{nom} gains {points} in {stat}.',
  'combat.defaite': 'Your whole team is out of the fight…',
  'combat.retourBourg': 'You come to at the last safe place.',
  'combat.plusDePp': 'No move left to use.',
  'combat.pasDeFuite': 'Pick a creature still standing.',
  'combat.dejaEnJeu': '{nom} is already out.',
  'combat.captureImpossible': 'You cannot catch another trainer’s creature.',
  'combat.reprise': 'The battle against {nom} resumes.',

  'encyclopedie.titre': 'Encyclopedia',
  'encyclopedie.creatures': 'Creatures',
  'encyclopedie.attaques': 'Moves',
  'encyclopedie.objets': 'Items',
  'encyclopedie.aide': '◀ ▶ shelf · ▲ ▼ browse · Escape: close',
  'encyclopedie.puissanceTotale': 'Power',
  'encyclopedie.evolue': 'Evolves into {espece} at level {niveau}',
  'encyclopedie.lignéeFinale': 'Last stage of its line',
  'encyclopedie.pp': 'Uses',
  'encyclopedie.priorite': 'Priority {valeur}',
  'encyclopedie.categorie.physique': 'Physical',
  'encyclopedie.categorie.special': 'Special',
  'encyclopedie.categorie.statut': 'Status',
  'encyclopedie.usage.combat': 'In battle',
  'encyclopedie.usage.monde': 'Outside battle',
  'encyclopedie.usage.partout': 'In and out of battle',
  'encyclopedie.enBoutique': 'Sold at the village shop, {prix} coins',
  'encyclopedie.aTrouver': 'Found in the world, not sold',

  'fin.titre': 'TERRAVIA CROSSED',
  'fin.temps': 'Play time',
  'fin.terradex': 'Terradex',
  'fin.dresseurs': 'Trainers beaten',
  'fin.seed': 'Seed',
  'fin.sanctuaire': 'The sanctum has opened at the end of the road. What lives there shows itself nowhere else.',
  'fin.reprendre': 'Carry on',
  'fin.nouvelleSeed': 'Start over on another seed',

  'fiche.niveau': 'Lv. {niveau}',
  'fiche.pv': 'HP',
  'fiche.xp': 'EXP',
  'fiche.talent': 'Talent',
  'fiche.genes': 'Genes',
  'fiche.dressage': 'Training',
  'fiche.taille': '{taille} m · {poids} kg',
  'fiche.origine': 'Origin: {seed}',
  'fiche.attaques': 'Moves',
  'fiche.puissance': 'Pow.',
  'fiche.precision': 'Acc.',
  'fiche.infaillible': '—',

  'terradex.progression': '{vus} / {total} seen · {captures} caught',
  'terradex.inconnu': '???',
  'terradex.faiblesses': 'Weak to',
  'terradex.resistances': 'Shrugs off',
  'terradex.aucun': '—',
  'terradex.habitat': 'Lives in {biomes}',
  'terradex.consulter': 'Confirm: species entry',

  'boutique.titre': 'Shop',
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
  'dialogue.sanctuaire':
    'Here the roads end and the legends begin. Stay, and watch: what shows itself by day is not what prowls at night.',
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
  'dialogue.panneau.bourg': 'HAMLET — Where it all starts. The road runs due north.',
  'dialogue.panneau.0': 'Warning: tall grass. Do not cross without a creature.',
  'dialogue.panneau.1': 'North: the arena. South: home.',
  'dialogue.panneau.2': 'The bridge has been out since last winter. Go around.',
  'dialogue.panneau.3': 'Ledges are a one-jump drop. Not the other way.',
  'dialogue.panneau.4': 'Do not feed the wild creatures.',

  'aide.deplacer': 'Arrows, WASD or mouse: move',
  'aide.action': 'Enter, E or click: talk, choose',
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
