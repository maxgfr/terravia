import { createLoop } from './core/loop.ts';
import { createViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from './core/viewport.ts';
import { makeRng } from './core/rng.ts';

/**
 * Point d'entrée. À ce stade (étape 0) il valide la chaîne complète :
 * canvas → boucle à pas fixe → rendu → déploiement GitHub Pages.
 * L'écran-titre définitif et la machine à états arrivent aux étapes suivantes.
 */

const host = document.getElementById('app');
if (!host) throw new Error('#app introuvable');

const viewport = createViewport(host);
const { ctx } = viewport;

// Un champ d'étoiles fixe, tiré d'une seed constante : le fond est le même à chaque visite.
const stars = (() => {
  const rng = makeRng(0x7e88a);
  return Array.from({ length: 70 }, () => ({
    x: rng.int(0, VIRTUAL_WIDTH - 1),
    y: rng.int(0, VIRTUAL_HEIGHT - 1),
    phase: rng.float(0, Math.PI * 2),
    speed: rng.float(0.4, 1.6),
    bright: rng.float(0.25, 1),
  }));
})();

let time = 0;

function update(step: number): void {
  time += step;
}

function render(): void {
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

  for (const star of stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(time * star.speed + star.phase);
    const alpha = star.bright * twinkle;
    ctx.fillStyle = `rgba(126, 231, 178, ${alpha.toFixed(3)})`;
    ctx.fillRect(star.x, star.y, 1, 1);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#e6edf3';
  ctx.font = 'bold 28px ui-monospace, Menlo, monospace';
  ctx.fillText('TERRAVIA', VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 - 12);

  ctx.fillStyle = '#7d8590';
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillText('un monde différent à chaque seed', VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 14);

  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  ctx.fillStyle = `rgba(126, 231, 178, ${(0.35 + 0.5 * pulse).toFixed(3)})`;
  ctx.font = '8px ui-monospace, Menlo, monospace';
  ctx.fillText('étape 0 — chaîne de déploiement vérifiée', VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 18);
}

const loop = createLoop({ update, render });
loop.start();

// Le voile de démarrage disparaît dès que la première trame est prête.
requestAnimationFrame(() => {
  document.getElementById('boot')?.classList.add('gone');
  setTimeout(() => document.getElementById('boot')?.remove(), 400);
});

// Une page de jeu ne doit pas continuer à tourner quand elle n'est pas visible :
// ça vide la batterie sur mobile pour rien.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.stop();
  else loop.start();
});
