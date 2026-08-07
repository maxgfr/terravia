/**
 * Persistance côté navigateur et échange de fichiers.
 *
 * Trois chemins d'entrée pour une sauvegarde — sélecteur de fichier, glisser-déposer
 * sur la page, collage de JSON brut — parce qu'aucun ne convient partout : le
 * glisser-déposer n'existe pas sur téléphone, et le collage dépanne quand un fichier
 * transite par une messagerie.
 *
 * Ce module est le seul du dossier `save/` à toucher au navigateur ; le reste est pur
 * et testable sans DOM.
 */

import { jsonCanonique } from './format.ts';

const CLE_AUTOSAVE = 'terravia.partie';
const CLE_LANGUE = 'terravia.langue';

/** Écrit la sauvegarde automatique. Renvoie `false` si le stockage est indisponible. */
export function enregistrerLocalement(document: unknown): boolean {
  try {
    localStorage.setItem(CLE_AUTOSAVE, JSON.stringify(document));
    return true;
  } catch {
    // Navigation privée, quota dépassé, stockage désactivé : le jeu continue sans
    // sauvegarde automatique, et l'export manuel reste disponible.
    return false;
  }
}

export function lireSauvegardeLocale(): string | null {
  try {
    return localStorage.getItem(CLE_AUTOSAVE);
  } catch {
    return null;
  }
}

export function effacerSauvegardeLocale(): void {
  try {
    localStorage.removeItem(CLE_AUTOSAVE);
  } catch {
    /* rien à faire : l'absence de stockage n'est pas une erreur */
  }
}

export function lireLanguePreferee(): string | null {
  try {
    return localStorage.getItem(CLE_LANGUE);
  } catch {
    return null;
  }
}

export function enregistrerLanguePreferee(langue: string): void {
  try {
    localStorage.setItem(CLE_LANGUE, langue);
  } catch {
    /* préférence non conservée, sans conséquence */
  }
}

/** Déclenche le téléchargement d'un document JSON. */
export function telecharger(document_: unknown, nom: string): void {
  const contenu = JSON.stringify(document_, null, 2);
  const blob = new Blob([contenu], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.style.display = 'none';
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Le navigateur a besoin d'un instant pour lancer le téléchargement avant qu'on
  // libère l'URL ; la libérer immédiatement annule le téléchargement sur Safari.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Ouvre le sélecteur de fichiers et rend le contenu du fichier choisi. */
export function choisirFichier(): Promise<string | null> {
  return new Promise((resoudre) => {
    const entree = document.createElement('input');
    entree.type = 'file';
    entree.accept = 'application/json,.json';
    entree.style.display = 'none';
    entree.addEventListener('change', () => {
      const fichier = entree.files?.[0];
      entree.remove();
      if (!fichier) return resoudre(null);
      void fichier.text().then(resoudre).catch(() => resoudre(null));
    });
    // Un sélecteur annulé ne déclenche pas d'événement fiable partout : on ne bloque
    // donc rien, l'appelant reste utilisable si la promesse ne se résout jamais.
    document.body.appendChild(entree);
    entree.click();
  });
}

/**
 * Installe le glisser-déposer sur toute la page.
 * Renvoie une fonction de désinstallation.
 */
export function installerDepotFichier(surFichier: (contenu: string) => void): () => void {
  const empecher = (evenement: DragEvent): void => {
    evenement.preventDefault();
    if (evenement.dataTransfer) evenement.dataTransfer.dropEffect = 'copy';
  };

  const deposer = (evenement: DragEvent): void => {
    evenement.preventDefault();
    const fichier = evenement.dataTransfer?.files?.[0];
    if (!fichier) return;
    void fichier.text().then(surFichier).catch(() => undefined);
  };

  window.addEventListener('dragover', empecher);
  window.addEventListener('drop', deposer);
  return () => {
    window.removeEventListener('dragover', empecher);
    window.removeEventListener('drop', deposer);
  };
}

/** Lit le presse-papiers, quand le navigateur l'autorise. */
export async function lirePressePapiers(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Empreinte courte d'un document : sert à ne pas réécrire une sauvegarde identique. */
export function empreinte(document_: unknown): string {
  return jsonCanonique(document_);
}
