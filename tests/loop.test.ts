import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoop } from '../src/core/loop.ts';

/**
 * La boucle n'avait aucun test, alors que sa mécanique décide de tout : combien de fois
 * la logique avance, et ce qu'il advient quand une scène lève.
 *
 * `requestAnimationFrame` est piloté à la main plutôt que par un vrai navigateur — c'est
 * la seule façon de choisir le temps qui s'écoule entre deux trames.
 */
function bancDeTrames(): {
  avancerDe(ms: number): void;
  trames: number;
  restaurer(): void;
} {
  let rappel: ((now: number) => void) | null = null;
  let horloge = 0;
  const banc = {
    trames: 0,
    avancerDe(ms: number): void {
      horloge += ms;
      const aJouer = rappel;
      rappel = null;
      banc.trames += 1;
      aJouer?.(horloge);
    },
    restaurer(): void {
      vi.unstubAllGlobals();
    },
  };

  vi.stubGlobal('requestAnimationFrame', (fn: (now: number) => void) => {
    rappel = fn;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    rappel = null;
  });
  vi.stubGlobal('performance', { now: () => horloge });

  return banc;
}

describe('boucle de jeu', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('avance la logique d’un pas fixe, quelle que soit la durée de la trame', () => {
    const banc = bancDeTrames();
    let pas = 0;
    const boucle = createLoop({ update: () => pas++, render: () => {} });
    boucle.start();

    // Le nombre de pas se déduit du pas fixe, pas d'un nombre écrit à la main : trois pas
    // de 1/60 s font 50,000000000000014 ms, et « 50 » n'en contient donc que deux.
    const PAS_MS = 1000 / 60;
    banc.avancerDe(52);
    expect(pas).toBe(Math.floor(52 / PAS_MS));
  });

  it('abandonne le temps accumulé par un onglet resté en arrière-plan', () => {
    const banc = bancDeTrames();
    let pas = 0;
    const boucle = createLoop({ update: () => pas++, render: () => {} });
    boucle.start();

    // Dix secondes d'absence ne doivent pas déclencher six cents pas de rattrapage.
    banc.avancerDe(10_000);
    expect(pas).toBeLessThanOrEqual(15);
  });

  /**
   * Le défaut que ce fichier existe pour empêcher.
   *
   * La trame suivante était planifiée **avant** l'appel à `update`. Une exception dans
   * une scène ne stoppait donc rien : la même erreur se rejouait soixante fois par
   * seconde sur une image figée, sans un mot pour le joueur.
   */
  it('s’arrête à la première exception, au lieu de la rejouer à chaque trame', () => {
    const banc = bancDeTrames();
    let appels = 0;
    const erreurs: unknown[] = [];

    const boucle = createLoop({
      update: () => {
        appels++;
        throw new Error('une scène a lâché');
      },
      render: () => {},
      onError: (erreur) => erreurs.push(erreur),
    });
    boucle.start();

    banc.avancerDe(20);
    expect(appels).toBe(1);
    expect(boucle.running).toBe(false);
    expect(erreurs).toHaveLength(1);

    // Et plus rien ne tourne ensuite, même si une trame était déjà en vol.
    banc.avancerDe(20);
    expect(appels).toBe(1);
  });

  it('rapporte aussi ce que lève le rendu', () => {
    const banc = bancDeTrames();
    const erreurs: unknown[] = [];
    const boucle = createLoop({
      update: () => {},
      render: () => {
        throw new Error('le peintre a lâché');
      },
      onError: (erreur) => erreurs.push(erreur),
    });
    boucle.start();

    banc.avancerDe(20);
    expect(erreurs).toHaveLength(1);
    expect(boucle.running).toBe(false);
  });

  it('ne démarre pas deux fois, et s’arrête sur demande', () => {
    const banc = bancDeTrames();
    let pas = 0;
    const boucle = createLoop({ update: () => pas++, render: () => {} });

    boucle.start();
    boucle.start();
    banc.avancerDe(20);
    expect(pas).toBe(1);

    boucle.stop();
    expect(boucle.running).toBe(false);
    banc.avancerDe(20);
    expect(pas).toBe(1);
  });
});
