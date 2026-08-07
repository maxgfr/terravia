# Terravia — spécification de conception

*7 août 2026*

## Problème

Construire un RPG de capture de créatures jouable depuis un simple lien, avec un monde
généré, un bestiaire original et des parties sauvegardables/importables en JSON.

La contrainte structurante est l'hébergement : **GitHub Pages ne sert que des fichiers
statiques**. Ni serveur, ni base de données, ni compte utilisateur. Tout l'état vit dans le
navigateur, et l'export/import JSON *est* le mécanisme de persistance portable — pas une
fonctionnalité annexe qu'on ajoute à la fin.

## Décisions

| Sujet | Choix | Raison |
|---|---|---|
| Stack | Vite + TypeScript + Canvas 2D, moteur maison | Types stricts sur la data volumineuse, aucun runtime tiers à charger |
| Créatures | Bestiaire original | Un repo public utilisant des noms sous marque se fait retirer |
| Cartes | Générées depuis une seed | Rejouabilité, et sauvegardes minuscules |
| Visuels | Générateur Node → PNG commités | Art versionné, relisible, retouchable à la main |
| Langues | FR/EN, catalogue de chaînes | Décidé dès le début : rétro-i18n-iser coûte cher |
| Contrôles | Clavier + tactile | Un lien partagé s'ouvre surtout sur téléphone |

## Architecture

Trois couches, dépendances dirigées vers le bas uniquement :

```
présentation   src/ui/, src/core/        canvas, entrées, animation
     ↓ consomme des événements
moteur pur     src/world/, src/battle/, src/save/, src/game/
     ↓ lit
data pure      src/data/                 tables typées, aucune logique
```

**L'invariant central :** le moteur de combat ne produit pas d'affichage, il produit des
événements (`{type:'damage'}`, `{type:'faint'}`, `{type:'message', key}`). L'interface les
rejoue. Conséquences : un combat se teste sans DOM, se rejoue à l'identique, et l'ajout
d'une animation ne peut pas changer une règle.

**Déterminisme :** aucun appel à `Math.random()` en dehors de la création d'une seed. Chaque
système dérive sa propre suite via `subSeed(seed, regionId, "terrain" | "npc" | …)`. Sans
cette séparation, ajouter un tirage dans la génération du terrain décalerait toutes les
positions de personnages et invaliderait les sauvegardes existantes.

## Contenu

- **12 types** : Neutre, Flamme, Onde, Sylve, Foudre, Givre, Roche, Métal, Vent, Ombre,
  Lumière, Toxine. Table d'efficacité 12×12. Un test refuse qu'un type n'ait aucune faiblesse
  ou aucune résistance — un type sans contre est un type cassé.
- **~45 attaques** : physique / spécial / statut, avec puissance, précision, PP, priorité et
  effet (altération, modificateur de stat, coups multiples, recul, soin).
- **~30 espèces** en 12 lignées : 3 starters à 3 stades, 7 lignées à 2 stades, 5 espèces
  solitaires, 2 créatures uniques. Chacune porte stats de base, types, taux de capture,
  courbe d'XP, table d'apprentissage, condition d'évolution, pool de 2 talents, biomes et
  créneau horaire.
- **Talents** : une capacité passive par créature, tirée du pool de son espèce.
- **Gènes** : 0-31 par statistique, tirés à la génération — deux spécimens de la même espèce
  diffèrent.
- **Dressage** : points gagnés au combat, répartissables dans une statistique, plafonnés.

## Génération du monde

`worldgen(seed)` produit d'abord un graphe de 7 à 9 régions, pas des tuiles :

```
Bourg initial → Route 1 → Bois ⇄ Route 2 → Village (boutique + soin) → Grotte → Route 3 → Arène
```

La topologie est fixe car elle porte la progression : difficulté croissante, ravitaillement
au milieu, boss au bout. Le contenu de chaque région est tiré de la seed.

Chaque région est une grille 48×36 générée en quatre passes :

1. **Terrain** — bruit de valeur + FBM, paramétré par biome.
2. **Connectivité** — creusement d'un chemin entre l'entrée et chaque sortie, puis
   vérification par parcours en largeur. Une région dont une sortie n'est pas atteignable est
   régénérée avec un sous-seed dérivé. Invariant vérifié sur des centaines de seeds en test.
3. **Contenu** — taches d'herbes hautes (zones de rencontre), obstacles, décor.
4. **Entités** — personnages, dresseurs, objets au sol, sur des tuiles marchables.

**Jour/nuit** : horloge interne, teinte de rendu par palette, et tables de rencontre
distinctes — certaines espèces ne sortent que la nuit. L'heure fait partie de la sauvegarde.

## Combat

Résolution par priorité d'attaque puis Vitesse.

```
dégâts = ((2·niveau/5 + 2) · puissance · Att/Déf) / 50 + 2
       × STAB × efficacité_type × critique × aléa(0.85–1.00) × talents
```

Capture : fonction des PV restants, de l'altération d'état, du taux de l'espèce et du type
de sphère. `attemptCapture()` renvoie le nombre de secousses pour que l'interface anime le
suspense sans recalculer la règle.

IA : évalue chaque attaque (dégâts estimés, efficacité, état) et choisit avec une part
d'aléatoire modulée par le niveau du dresseur. Le boss d'arène joue mieux qu'un dresseur de
route.

## Sauvegarde

```jsonc
{
  "format": "terravia-save",
  "version": 1,
  "seed": "brume-3f7a",
  "player": { "name", "regionId", "x", "y", "facing", "money", "playtimeMs" },
  "party": [ /* max 6 */ ], "box": [ /* réserve */ ],
  "inventory": { "potion": 4 },
  "progress": { "flags": [], "defeatedTrainers": [], "badges": [] },
  "clock": { "minutes": 742 },
  "checksum": "fnv1a-…"
}
```

Autosave en `localStorage` aux points naturels (changement de région, fin de combat, achat).
Export par téléchargement d'un fichier daté. Import par sélection de fichier, glisser-déposer
ou collage.

**Validation stricte** à l'import : format, version, bornes de chaque valeur, existence de
chaque identifiant d'espèce, d'attaque et d'objet. Message d'erreur précis, écran de
confirmation résumant la sauvegarde, et **jamais d'écrasement silencieux** de la partie en
cours.

**Migrations par version** dès la v1. Sans ce mécanisme posé d'emblée, la première évolution
du format casse toutes les parties existantes.

**Échange** : export d'une créature seule (`terravia-creature`). Sans serveur, l'échange
repose sur la confiance — la somme de contrôle détecte la corruption, pas la triche. C'est
documenté dans le README plutôt que masqué.

## Génération des visuels

`npm run art` — Node, zéro dépendance, encodeur PNG écrit avec `node:zlib` et un CRC32
maison. Produit dans `public/art/` : sprites de créatures 64×64 (face et dos, assemblage de
parties avec symétrie axiale, palette dérivée du type primaire, seed = identifiant
d'espèce), tileset 16×16, et éléments d'interface (cadre 9-slice, barres, badges de type,
icônes, police bitmap).

Les PNG sont commités. Un `manifest.json` les recense, et un test vérifie que chaque espèce
déclarée a bien ses sprites : l'écart entre data et art se voit en intégration continue, pas
en jeu.

## Vérification

Tests automatisés en intégration continue avant chaque déploiement : cohérence de la table
de types, formule de dégâts sur cas de référence, résolution de tour, déterminisme et
connectivité du worldgen, aller-retour de sauvegarde et refus des fichiers corrompus, parité
des clés FR/EN, complétude du manifest d'art.

Vérification manuelle sur l'URL déployée, desktop et mobile : nouvelle partie jusqu'au boss
d'arène, export puis réimport d'une sauvegarde, import d'un fichier volontairement corrompu,
échange d'une créature, cycle de nuit.
