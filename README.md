# Terravia

RPG de capture de créatures dans un monde généré procéduralement. Tourne entièrement dans
le navigateur, sans serveur ni compte : **https://maxgfr.github.io/terravia**

Le bestiaire, les types, les attaques et les cartes sont originaux — Terravia s'inspire du
genre, il n'emprunte à aucune œuvre existante.

## Ce qui rend Terravia particulier

**Le monde tient dans une seed.** La topologie des régions est fixe — elle porte la
progression du jeu — mais le biome, le relief, le contenu et le placement des personnages
de chaque région sont tirés d'une seed. Deux parties ne se ressemblent pas.

**Une sauvegarde pèse quelques kilo-octets.** Comme le monde se reconstruit depuis sa seed,
un fichier de save ne contient que la seed et l'état du joueur : position, équipe, réserve,
inventaire, progression. Pas une seule tuile.

**L'art est un artefact versionné.** Les sprites ne sont pas dessinés à la main ni générés
à l'exécution : `npm run art` les produit de façon déterministe et les écrit en PNG dans
`public/art/`, qui sont commités. On peut les regarder dans GitHub, en retoucher un, et
voir un diff d'art en revue de code.

## Jouer

**Clavier** — flèches ou ZQSD pour se déplacer, `Entrée` / `E` pour parler et valider,
`Échap` pour revenir, `M` pour le menu.
**Tactile** — une croix directionnelle et deux boutons apparaissent sur les écrans sans
souris.

Une partie tient en une boucle courte : sortir du bourg avec sa créature de départ,
traverser sept régions en capturant et en battant des dresseurs, puis passer l'arène.
Le monde change à chaque seed ; celle de la partie en cours s'affiche dans le menu.

## Contenu

30 créatures en 12 lignées · 12 types avec quatre immunités · 53 attaques · 16 talents
passifs · 8 régions · cycle jour/nuit qui change les rencontres.

## Démarrer

```bash
npm install
npm run dev        # serveur de développement
npm test           # suite de tests
npm run art        # régénère les sprites dans public/art/
npm run build      # typecheck + build de production
```

Node 22.6+ est requis : les outils de génération d'art sont écrits en TypeScript et
exécutés directement par Node, sans étape de compilation ni dépendance.

## Organisation du code

Trois couches, chacune testable seule :

| Dossier | Rôle |
|---|---|
| `src/data/` | Contenu pur : types, attaques, espèces, objets, talents. Aucune logique. |
| `src/world/`, `src/battle/`, `src/save/` | Moteur pur : aucune dépendance au DOM, entièrement testé. |
| `src/core/`, `src/ui/` | Présentation : canvas, entrées, rendu. Ne décide d'aucune règle. |
| `tools/art/` | Générateur de sprites (Node, zéro dépendance, encodeur PNG maison). |

La règle qui tient l'ensemble : **l'interface de combat ne connaît aucune règle de combat**.
Le moteur renvoie une liste d'événements (`damage`, `faint`, `message`) que l'interface joue
en animation. Un combat entier se teste donc sans navigateur, et se rejoue à l'identique.

## Tests

205 tests, exécutés en intégration continue avant chaque déploiement. Les plus utiles ne
vérifient pas des détails mais des **invariants** :

- aucune seed ne produit une région dont la sortie est inatteignable — vérifié sur 60 seeds ;
- tout combat se termine, quelles que soient les deux créatures engagées ;
- une partie exportée puis réimportée redonne un état identique, et le monde se
  reconstruit octet pour octet depuis la seed ;
- chaque caractère des textes du jeu existe dans la police, dans les deux langues ;
- une créature de départ gagne plus de 60 % de ses combats sur la première route, et le
  champion reste un mur à niveau 12 tout en étant franchissable à 42.

Un test de fumée joue les écrans avec un canvas simulé — démarrage, choix du starter,
déplacement, menus, combat complet — pour attraper les erreurs d'affichage qu'aucun test
de logique ne verrait.

## Sauvegarde et échange

La partie est sauvegardée automatiquement dans le navigateur. Depuis le menu, on peut
l'exporter en fichier JSON et la réimporter — par sélection de fichier, glisser-déposer sur
la page, ou collage direct du JSON. Un import invalide affiche l'erreur précise et **n'écrase
jamais la partie en cours** : un écran de confirmation résume la sauvegarde avant de la
charger.

On peut aussi exporter une créature seule et l'importer dans une autre partie.

> **Sur l'échange :** sans serveur, rien n'empêche d'éditer un fichier pour se donner une
> créature de niveau 100. La somme de contrôle détecte la corruption d'un fichier, pas la
> triche. Terravia est un jeu solo — l'échange est un partage entre gens de confiance.

## Licence

Code sous licence MIT. Créatures, noms, designs et univers : originaux, même licence.
