/**
 * Entrées : clavier et tactile réduits à un même vocabulaire d'actions.
 *
 * Le jeu ne connaît ni touches ni doigts — il demande « la direction nord est-elle
 * demandée ? ». C'est ce qui permet d'ajouter le tactile sans toucher une ligne de
 * logique de jeu, et de tester le déplacement en simulant des actions.
 *
 * Deux lectures coexistent volontairement : `maintenue()` pour le déplacement continu,
 * `pressee()` pour les validations. Un menu qui utiliserait `maintenue()` défilerait de
 * dix entrées sur une pression.
 */

export const ACTIONS = ['nord', 'sud', 'est', 'ouest', 'valider', 'annuler', 'menu'] as const;
export type ActionJeu = (typeof ACTIONS)[number];

const TOUCHES: Record<string, ActionJeu> = {
  ArrowUp: 'nord',
  ArrowDown: 'sud',
  ArrowLeft: 'ouest',
  ArrowRight: 'est',
  KeyW: 'nord',
  KeyZ: 'nord',
  KeyS: 'sud',
  KeyA: 'ouest',
  KeyQ: 'ouest',
  KeyD: 'est',
  Enter: 'valider',
  Space: 'valider',
  KeyE: 'valider',
  Escape: 'annuler',
  Backspace: 'annuler',
  KeyX: 'annuler',
  KeyM: 'menu',
  Tab: 'menu',
};

export interface Entrees {
  /** Vrai tant que l'action est demandée — pour le déplacement. */
  maintenue(action: ActionJeu): boolean;
  /** Vrai une seule fois par appui — pour les menus et les validations. */
  pressee(action: ActionJeu): boolean;
  /** À appeler à la fin de chaque trame de logique. */
  finDeTrame(): void;
  /** Vrai si la dernière entrée venait d'un doigt : l'aide affichée s'y adapte. */
  readonly tactile: boolean;
  detruire(): void;
}

interface BoutonTactile {
  readonly action: ActionJeu;
  readonly element: HTMLElement;
}

export function creerEntrees(hote: HTMLElement): Entrees {
  const actives = new Set<ActionJeu>();
  const nouvelles = new Set<ActionJeu>();
  let tactile = false;

  const activer = (action: ActionJeu): void => {
    if (!actives.has(action)) nouvelles.add(action);
    actives.add(action);
  };

  const desactiver = (action: ActionJeu): void => {
    actives.delete(action);
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    const action = TOUCHES[evenement.code];
    if (!action) return;
    // Les flèches et l'espace font défiler la page : dans un jeu, jamais.
    evenement.preventDefault();
    if (evenement.repeat) return;
    tactile = false;
    activer(action);
  };

  const surRelache = (evenement: KeyboardEvent): void => {
    const action = TOUCHES[evenement.code];
    if (!action) return;
    evenement.preventDefault();
    desactiver(action);
  };

  window.addEventListener('keydown', surTouche);
  window.addEventListener('keyup', surRelache);
  // Un changement d'onglet pendant qu'une touche est enfoncée laisserait le personnage
  // courir indéfiniment : on relâche tout dès que la fenêtre perd le focus.
  const surPerteFocus = (): void => actives.clear();
  window.addEventListener('blur', surPerteFocus);

  const boutons = construireTactile(hote, (action, enfonce) => {
    tactile = true;
    if (enfonce) activer(action);
    else desactiver(action);
  });

  return {
    maintenue: (action) => actives.has(action),
    pressee: (action) => nouvelles.has(action),
    finDeTrame: () => nouvelles.clear(),
    get tactile() {
      return tactile;
    },
    detruire() {
      window.removeEventListener('keydown', surTouche);
      window.removeEventListener('keyup', surRelache);
      window.removeEventListener('blur', surPerteFocus);
      for (const bouton of boutons) bouton.element.remove();
    },
  };
}

/**
 * Contrôles tactiles : une croix directionnelle à gauche, deux boutons à droite.
 *
 * Ils vivent dans le DOM plutôt que sur le canvas : ils profitent ainsi de la taille
 * réelle de l'écran plutôt que de la résolution virtuelle de 320 pixels, et restent
 * assez grands pour le pouce sur n'importe quel téléphone.
 */
function construireTactile(
  hote: HTMLElement,
  surAction: (action: ActionJeu, enfonce: boolean) => void,
): BoutonTactile[] {
  const conteneur = document.createElement('div');
  conteneur.className = 'tactile';
  conteneur.innerHTML = `
    <div class="tactile-croix">
      <button data-action="nord" aria-label="Haut">▲</button>
      <button data-action="ouest" aria-label="Gauche">◀</button>
      <button data-action="est" aria-label="Droite">▶</button>
      <button data-action="sud" aria-label="Bas">▼</button>
    </div>
    <div class="tactile-boutons">
      <button data-action="menu" aria-label="Menu">☰</button>
      <button data-action="annuler" aria-label="Retour">B</button>
      <button data-action="valider" aria-label="Valider">A</button>
    </div>`;
  hote.appendChild(conteneur);

  const boutons: BoutonTactile[] = [];
  for (const element of conteneur.querySelectorAll<HTMLElement>('button[data-action]')) {
    const action = element.dataset.action as ActionJeu;
    boutons.push({ action, element });

    const enfoncer = (evenement: PointerEvent): void => {
      evenement.preventDefault();
      element.setPointerCapture(evenement.pointerId);
      element.classList.add('enfonce');
      surAction(action, true);
    };
    const relacher = (evenement: PointerEvent): void => {
      evenement.preventDefault();
      element.classList.remove('enfonce');
      surAction(action, false);
    };

    element.addEventListener('pointerdown', enfoncer);
    element.addEventListener('pointerup', relacher);
    element.addEventListener('pointercancel', relacher);
    // Un doigt qui glisse hors du bouton doit le relâcher, sinon la direction reste
    // active après que le joueur a levé la main ailleurs.
    element.addEventListener('pointerleave', relacher);
  }

  boutons.push({ action: 'valider', element: conteneur });
  return boutons;
}
