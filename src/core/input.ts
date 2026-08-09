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
 *
 * S'y ajoute le pointeur, souris ou doigt, exprimé dans le repère virtuel où les scènes
 * dessinent. Il ne se traduit pas en actions : viser un point n'est pas une direction, et
 * une entrée de menu n'est pas au même endroit d'une scène à l'autre. Les scènes le
 * lisent donc directement, via les zones cliquables du jeu.
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
  // Pas de `Tab` : il est le seul moyen d'atteindre les boutons tactiles au clavier, et
  // l'intercepter enfermait le focus dans la page — on ne pouvait plus en sortir.
};

/** Position dans le repère virtuel du jeu, celui dans lequel les scènes dessinent. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Entrees {
  /** Vrai tant que l'action est demandée — pour le déplacement. */
  maintenue(action: ActionJeu): boolean;
  /** Vrai une seule fois par appui — pour les menus et les validations. */
  pressee(action: ActionJeu): boolean;
  /**
   * Dernière position du pointeur, en coordonnées virtuelles, ou `null` s'il n'y en a
   * pas — un écran tactile sans doigt posé, une souris sortie du canvas.
   */
  readonly pointeur: Point | null;
  /** Vrai la trame où le bouton vient d'être enfoncé. */
  cliquePresse(): boolean;
  /**
   * Vrai si le pointeur s'est déplacé depuis la trame précédente.
   *
   * C'est ce qui permet aux listes de ne suivre le survol que lorsqu'il est intentionnel :
   * une souris posée par hasard sur une ligne ne doit pas reprendre la main sur les
   * flèches à chaque trame.
   */
  pointeurBouge(): boolean;
  /** À appeler à la fin de chaque trame de logique. */
  finDeTrame(): void;
  /** Vrai si la dernière entrée venait d'un doigt : l'aide affichée s'y adapte. */
  readonly tactile: boolean;
  detruire(): void;
}

/** Ce dont les entrées ont besoin du canvas pour situer un clic dans le jeu. */
export interface CiblePointeur {
  readonly canvas: HTMLElement;
  pageToVirtual(pageX: number, pageY: number): Point;
}

interface BoutonTactile {
  readonly action: ActionJeu;
  readonly element: HTMLElement;
}

export function creerEntrees(hote: HTMLElement, cible?: CiblePointeur): Entrees {
  const actives = new Set<ActionJeu>();
  const nouvelles = new Set<ActionJeu>();
  let tactile = false;
  let pointeur: Point | null = null;
  let maintenu = false;
  let presse = false;
  let bouge = false;

  const activer = (action: ActionJeu): void => {
    if (!actives.has(action)) nouvelles.add(action);
    actives.add(action);
  };

  const desactiver = (action: ActionJeu): void => {
    actives.delete(action);
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    // Un raccourci du navigateur n'appartient pas au jeu. `S`, `D`, `E` et `M` sont
    // mappés : sans ce filtre, Cmd+S, Cmd+D et Ctrl+A étaient purement et simplement
    // annulés dans la page.
    if (evenement.ctrlKey || evenement.metaKey || evenement.altKey) return;
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

  const detacherPointeur = cible ? brancherPointeur(cible) : () => {};

  return {
    maintenue: (action) => actives.has(action),
    pressee: (action) => nouvelles.has(action),
    get pointeur() {
      return pointeur;
    },
    cliquePresse: () => presse,
    pointeurBouge: () => bouge,
    finDeTrame: () => {
      nouvelles.clear();
      presse = false;
      bouge = false;
    },
    get tactile() {
      return tactile;
    },
    detruire() {
      window.removeEventListener('keydown', surTouche);
      window.removeEventListener('keyup', surRelache);
      window.removeEventListener('blur', surPerteFocus);
      detacherPointeur();
      for (const bouton of boutons) bouton.element.remove();
    },
  };

  /**
   * Suit la souris et le doigt sur le canvas, en coordonnées virtuelles.
   *
   * Les contrôles tactiles vivent à côté du canvas et non dedans : leurs appuis ne
   * passent donc jamais par ici, et appuyer sur la croix directionnelle ne déclenche pas
   * en plus un clic dans le monde.
   */
  function brancherPointeur(ou: CiblePointeur): () => void {
    const situer = (evenement: PointerEvent): void => {
      const vers = ou.pageToVirtual(evenement.clientX, evenement.clientY);
      if (!pointeur || pointeur.x !== vers.x || pointeur.y !== vers.y) bouge = true;
      pointeur = vers;
    };

    const enfoncer = (evenement: PointerEvent): void => {
      evenement.preventDefault();
      tactile = evenement.pointerType !== 'mouse';
      situer(evenement);
      maintenu = true;
      presse = true;
    };

    const deplacer = (evenement: PointerEvent): void => {
      // Un doigt ne « survole » pas : tant qu'il n'est pas posé, il n'y a pas de
      // position à suivre, et l'on ne veut pas laisser de curseur fantôme derrière lui.
      if (evenement.pointerType !== 'mouse' && !maintenu) return;
      situer(evenement);
    };

    const relacher = (evenement: PointerEvent): void => {
      maintenu = false;
      if (evenement.pointerType !== 'mouse') pointeur = null;
    };

    const sortir = (): void => {
      maintenu = false;
      pointeur = null;
    };

    ou.canvas.addEventListener('pointerdown', enfoncer);
    ou.canvas.addEventListener('pointermove', deplacer);
    ou.canvas.addEventListener('pointerup', relacher);
    ou.canvas.addEventListener('pointercancel', sortir);
    ou.canvas.addEventListener('pointerleave', sortir);
    // Un bouton relâché hors du canvas laisserait le personnage marcher sans fin.
    window.addEventListener('pointerup', relacher);
    window.addEventListener('blur', sortir);

    return () => {
      ou.canvas.removeEventListener('pointerdown', enfoncer);
      ou.canvas.removeEventListener('pointermove', deplacer);
      ou.canvas.removeEventListener('pointerup', relacher);
      ou.canvas.removeEventListener('pointercancel', sortir);
      ou.canvas.removeEventListener('pointerleave', sortir);
      window.removeEventListener('pointerup', relacher);
      window.removeEventListener('blur', sortir);
    };
  }
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
  // Un appui long sur le pavé directionnel ouvrait le menu contextuel d'Android — ou la
  // sélection de texte — au beau milieu d'un déplacement.
  conteneur.addEventListener('contextmenu', (evenement) => evenement.preventDefault());

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
