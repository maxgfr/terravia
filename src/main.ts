/**
 * Point d'entrée : charge l'art, câble les entrées et lance la boucle.
 *
 * Tout ce qui peut échouer au démarrage — une planche absente, un canvas indisponible —
 * est rattrapé et affiché en clair. Un écran noir sans explication est le pire résultat
 * possible pour un jeu servi depuis un simple lien.
 */

import { chargerAssets } from './core/assets.ts';
import { creerEntrees } from './core/input.ts';
import { createLoop } from './core/loop.ts';
import { makeSeedText, makeRng } from './core/rng.ts';
import { createViewport } from './core/viewport.ts';
import { Jeu } from './game/jeu.ts';
import { creerPartie } from './game/state.ts';
import { installerDepotFichier, lireLanguePreferee } from './save/storage.ts';
import { SceneTitre } from './scenes/titre.ts';
import { traiterImport } from './scenes/partie.ts';
import { Peintre } from './ui/draw.ts';
import { appliquerLangueAuDocument, langueParDefaut } from './i18n/preference.ts';
import { traduire } from './i18n/index.ts';

/**
 * Le voile de démarrage, retenu dès le chargement.
 *
 * Il est retiré du document 400 ms après un démarrage réussi : le rechercher par son
 * identifiant au moment d'afficher une erreur ne renverrait donc plus rien. En garder la
 * référence permet de le remettre en place, et c'est tout ce qui sépare une panne
 * expliquée d'une page muette.
 */
const voileDemarrage = document.getElementById('boot');

/** Vrai dès qu'une panne a été affichée : le jeu ne redémarre pas par-dessus. */
let enPanne = false;

function afficherErreur(message: string): void {
  enPanne = true;
  if (!voileDemarrage) return;
  voileDemarrage.textContent = message;
  voileDemarrage.classList.remove('gone');
  voileDemarrage.style.color = '#e05a4a';
  voileDemarrage.style.padding = '2rem';
  if (!voileDemarrage.isConnected) document.body.appendChild(voileDemarrage);
}

/** La phrase d'échec, dans la langue du joueur, même si le jeu n'a jamais démarré. */
function messageDechec(erreur: unknown): string {
  const detail = erreur instanceof Error ? erreur.message : String(erreur);
  const langue = langueParDefaut(lireLanguePreferee());
  return `${traduire(langue, 'boot.echec')}\n${detail}`;
}

/**
 * Rattrape ce qui échappe à la boucle : un gestionnaire d'événement, une promesse
 * abandonnée, un rappel de chargement.
 *
 * Il n'y en avait aucun. Après le démarrage, la moindre exception laissait une page
 * muette — le jeu figé sur sa dernière image, sans un mot pour dire ce qui s'était passé.
 */
function installerFiletDeSecurite(): void {
  const signaler = (erreur: unknown): void => {
    afficherErreur(messageDechec(erreur));
    console.error(erreur);
  };
  window.addEventListener('error', (evenement) => signaler(evenement.error ?? evenement.message));
  window.addEventListener('unhandledrejection', (evenement) => signaler(evenement.reason));
}

async function demarrer(): Promise<void> {
  const hote = document.getElementById('app');
  const scene = document.getElementById('scene');
  if (!hote || !scene) throw new Error('#app introuvable');

  // Le canvas est dimensionné d'après #scene, qui ne contient que lui ; les contrôles
  // tactiles sont un frère, pas une superposition.
  const viewport = createViewport(scene);
  const assets = await chargerAssets();
  const peintre = new Peintre(viewport.ctx, assets);
  const entrees = creerEntrees(hote, viewport);

  // La graine de session n'est pas celle du monde : les tirages de combat doivent
  // varier d'une partie à l'autre, contrairement au terrain.
  const graineSession = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  const langue = langueParDefaut(lireLanguePreferee());
  const seedProposee = makeSeedText(makeRng(graineSession).next());

  const jeu = new Jeu(peintre, entrees, creerPartie(seedProposee, langue), graineSession);
  jeu.pousser(new SceneTitre(seedProposee));

  // Un fichier déposé n'importe où sur la page est traité comme un import : c'est le
  // chemin le plus court entre « j'ai reçu une sauvegarde » et « je joue ».
  installerDepotFichier((contenu) => traiterImport(jeu, contenu));

  // La langue est connue : la page peut enfin l'annoncer. Elle était figée à « fr » dans
  // index.html, alors que le jeu s'ouvre en anglais.
  appliquerLangueAuDocument(jeu.langue, jeu.t('a11y.canvas'));

  const boucle = createLoop({
    update: (step) => {
      // `finDeTrame` dans un `finally` : si la mise à jour lève, les entrées seraient
      // sinon figées à « pressée », et la trame suivante repartirait avec.
      try {
        jeu.mettreAJour(step);
      } finally {
        entrees.finDeTrame();
      }
    },
    render: () => jeu.dessiner(),
    onError: (erreur) => {
      afficherErreur(messageDechec(erreur));
      console.error(erreur);
    },
  });
  boucle.start();

  document.getElementById('boot')?.classList.add('gone');
  setTimeout(() => document.getElementById('boot')?.remove(), 400);

  // Une page de jeu ne doit pas tourner quand elle n'est pas visible : sur mobile,
  // c'est de la batterie dépensée pour rien.
  //
  // C'est aussi le moment le plus sûr pour enregistrer. Sur iOS, quitter le navigateur
  // ne déclenche souvent que cet événement-ci ; s'en remettre à `pagehide` seul, c'est
  // perdre la partie de qui bascule d'application.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      jeu.sauvegarderLocalement();
      boucle.stop();
    } else if (!enPanne) {
      // Revenir sur l'onglet ne relance pas un jeu qui s'est arrêté sur une erreur :
      // ce serait effacer le message et repartir dans la même exception.
      boucle.start();
    }
  });

  // Dernier filet : la partie est enregistrée si l'onglet se ferme.
  window.addEventListener('pagehide', () => jeu.sauvegarderLocalement());
}

installerFiletDeSecurite();

demarrer().catch((erreur: unknown) => {
  afficherErreur(messageDechec(erreur));
  console.error(erreur);
});
