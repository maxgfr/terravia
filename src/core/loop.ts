/**
 * Boucle de jeu à pas de temps fixe.
 *
 * La logique avance toujours par pas de 1/60 s, quelle que soit la fréquence de l'écran.
 * Un 120 Hz ne fait pas courir le joueur deux fois plus vite, et un ralentissement ne
 * fait pas traverser les murs. Le rendu, lui, se produit une fois par trame.
 */

const STEP_MS = 1000 / 60;
/** Au-delà, on abandonne le temps écoulé plutôt que de rattraper (onglet en arrière-plan). */
const MAX_CATCHUP_MS = 250;

export interface GameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export interface LoopCallbacks {
  /** Avance la logique d'un pas fixe. `step` vaut toujours STEP_MS / 1000 secondes. */
  update(step: number): void;
  /** Dessine l'état courant. `alpha` est la fraction de pas restant à interpoler. */
  render(alpha: number): void;
  /**
   * Appelé si `update` ou `render` lève. La boucle s'arrête d'abord.
   *
   * Sans cela, une exception dans une scène ne stoppait rien : la trame suivante était
   * déjà planifiée, si bien que la même erreur se rejouait soixante fois par seconde sur
   * une image figée, la console saturait, et le joueur n'avait ni message ni recours.
   */
  onError?(erreur: unknown): void;
}

export function createLoop({ update, render, onError }: LoopCallbacks): GameLoop {
  let frameId = 0;
  let previous = 0;
  let accumulator = 0;
  let running = false;

  const frame = (now: number): void => {
    if (!running) return;
    frameId = requestAnimationFrame(frame);

    let elapsed = now - previous;
    previous = now;
    if (elapsed > MAX_CATCHUP_MS) elapsed = MAX_CATCHUP_MS;
    accumulator += elapsed;

    try {
      while (accumulator >= STEP_MS) {
        update(STEP_MS / 1000);
        accumulator -= STEP_MS;
      }

      render(accumulator / STEP_MS);
    } catch (erreur) {
      running = false;
      cancelAnimationFrame(frameId);
      onError?.(erreur);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      previous = performance.now();
      accumulator = 0;
      frameId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
    },
    get running() {
      return running;
    },
  };
}
