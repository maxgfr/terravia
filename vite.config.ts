import { defineConfig } from 'vite';

// Le jeu est publié sur https://maxgfr.github.io/terravia/ — un « project site ».
// Sans ce base, Vite émet des chemins absolus /assets/... qui pointent vers la racine
// du domaine et renvoient 404. C'est l'erreur classique du déploiement Pages.
export default defineConfig({
  base: '/terravia/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0, // les sprites restent des fichiers, jamais des data-URI
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
