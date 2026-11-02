/**
 * Service worker : rendre Terravia jouable hors ligne.
 *
 * Le jeu est entièrement statique et pèse environ 130 Kio — il n'a besoin du réseau que
 * pour son premier chargement. Sans ce fichier, un lien ouvert dans le métro n'affichait
 * rien du tout.
 *
 * **Réseau d'abord, cache en secours.** La stratégie inverse serait plus rapide, mais
 * l'art est servi depuis `public/` sans empreinte dans son nom, contrairement au JS que
 * Vite hache : un `creatures.png` périmé servi avec un `creatures.json` frais donnerait
 * des sprites décalés, en silence et sans moyen de s'en apercevoir. Tant qu'il y a du
 * réseau, on prend la version du serveur ; le cache ne sert que lorsqu'il n'y en a pas.
 *
 * Le nom du cache porte une version : la changer suffit à faire table rase à la
 * prochaine activation.
 *
 * **Ne toucher qu'à ses propres caches.** Le site est servi depuis `maxgfr.github.io`,
 * une origine partagée par une cinquantaine d'applications : `caches.keys()` y rend les
 * caches de toutes. En supprimer tout ce qui n'est pas `CACHE`, c'était vider le hors
 * ligne de chaque autre site à chaque mise à jour de Terravia. Seuls les noms préfixés
 * `terravia-` sont à nous.
 */

const PREFIXE = 'terravia-';
const CACHE = `${PREFIXE}v1`;

/** La coquille minimale : de quoi démarrer sans réseau. Le reste s'ajoute à l'usage. */
const SOCLE = ['', 'index.html', 'manifest.webmanifest', 'icone-180.png'];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SOCLE.map((chemin) => new URL(chemin, self.registration.scope).href)))
      // Un socle incomplet — une ressource déplacée — ne doit pas empêcher l'installation :
      // le service worker resterait bloqué et la mise en cache à l'usage n'aurait pas lieu.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms.filter((nom) => nom.startsWith(PREFIXE) && nom !== CACHE).map((nom) => caches.delete(nom)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  // On ne s'occupe que de ce que l'on sert soi-même, et seulement en lecture.
  if (requete.method !== 'GET') return;
  if (!requete.url.startsWith(self.registration.scope)) return;

  evenement.respondWith(
    fetch(requete)
      .then((reponse) => {
        // Une réponse partielle ou opaque n'a rien à faire dans le cache.
        if (reponse.ok && reponse.type === 'basic') {
          const copie = reponse.clone();
          void caches.open(CACHE).then((cache) => cache.put(requete, copie));
        }
        return reponse;
      })
      .catch(async () => {
        // Chercher dans notre cache seulement. `caches.match()` parcourt tous les caches de
        // l'origine, ceux des autres sites compris : n'importe lequel pourrait y avoir déposé
        // une réponse pour une adresse de Terravia, que l'on servirait alors comme la nôtre.
        const cache = await caches.open(CACHE);
        const enCache = await cache.match(requete);
        if (enCache) return enCache;
        // Une navigation hors ligne vers une adresse jamais visitée retombe sur la page
        // du jeu : elle sait se reconstruire depuis la sauvegarde locale.
        if (requete.mode === 'navigate') {
          const accueil = await cache.match(new URL('index.html', self.registration.scope).href);
          if (accueil) return accueil;
        }
        throw new Error('hors ligne et absent du cache');
      }),
  );
});
