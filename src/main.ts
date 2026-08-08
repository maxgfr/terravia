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
import { langueParDefaut } from './i18n/preference.ts';

function afficherErreur(message: string): void {
  const boot = document.getElementById('boot');
  if (boot) {
    boot.textContent = message;
    boot.classList.remove('gone');
    boot.style.color = '#e05a4a';
    boot.style.padding = '2rem';
    boot.style.textAlign = 'center';
  }
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

  const boucle = createLoop({
    update: (step) => {
      jeu.mettreAJour(step);
      entrees.finDeTrame();
    },
    render: () => jeu.dessiner(),
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
    } else {
      boucle.start();
    }
  });

  // Dernier filet : la partie est enregistrée si l'onglet se ferme.
  window.addEventListener('pagehide', () => jeu.sauvegarderLocalement());
}

demarrer().catch((erreur: unknown) => {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  afficherErreur(`Terravia n’a pas pu démarrer.\n${message}`);
  console.error(erreur);
});
