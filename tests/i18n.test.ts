import { describe, expect, it } from 'vitest';
import { CHARSET } from '../tools/art/font.ts';
import { LANGUES, catalogue, clesTextes, estCleConnue, traduire } from '../src/i18n/index.ts';

/** Les noms de paramètres `{ainsi}` présents dans un modèle. */
function parametres(modele: string): string[] {
  return [...modele.matchAll(/\{(\w+)\}/g)].map((occurrence) => occurrence[1]!).sort();
}

describe('catalogue de traductions', () => {
  it('couvre les mêmes clés dans les deux langues', () => {
    const cles = clesTextes();
    for (const langue of LANGUES) {
      expect(Object.keys(catalogue(langue)).sort(), langue).toEqual([...cles].sort());
    }
  });

  it('ne laisse aucune traduction vide', () => {
    for (const langue of LANGUES) {
      for (const [cle, valeur] of Object.entries(catalogue(langue))) {
        expect(valeur.trim().length, `${langue}/${cle}`).toBeGreaterThan(0);
      }
    }
  });

  it('emploie exactement les mêmes paramètres dans les deux langues', () => {
    // Un paramètre oublié en anglais afficherait « {nom} » en clair dans le jeu.
    for (const cle of clesTextes()) {
      expect(parametres(catalogue('en')[cle]), cle).toEqual(parametres(catalogue('fr')[cle]));
    }
  });

  it('n’emploie que des caractères que la police sait dessiner', () => {
    const disponibles = new Set(CHARSET);
    const manquants = new Set<string>();
    for (const langue of LANGUES) {
      for (const valeur of Object.values(catalogue(langue))) {
        for (const caractere of valeur) if (!disponibles.has(caractere)) manquants.add(caractere);
      }
    }
    expect([...manquants]).toEqual([]);
  });

  it('remplace les paramètres fournis', () => {
    expect(traduire('fr', 'combat.utilise', { nom: 'Folianz', attaque: 'Fouet-Liane' })).toBe(
      'Folianz utilise Fouet-Liane !',
    );
  });

  it('laisse le marqueur visible quand un paramètre manque', () => {
    // Mieux vaut voir « {attaque} » à l'écran que « undefined » : l'oubli se corrige.
    expect(traduire('fr', 'combat.utilise', { nom: 'Folianz' })).toContain('{attaque}');
  });

  it('reconnaît les clés de dialogue posées par le générateur de monde', () => {
    // Le monde référence ses dialogues par chaîne : si une clé disparaissait du
    // catalogue, un personnage afficherait son identifiant technique.
    const clesDuMonde = [
      'dialogue.professeur',
      'dialogue.marchand',
      'dialogue.soigneuse',
      'dialogue.champion',
      'dialogue.championVaincu',
      'dialogue.panneau.bourg',
      ...Array.from({ length: 8 }, (_, i) => `dialogue.villageois.${i}`),
      ...Array.from({ length: 6 }, (_, i) => `dialogue.dresseur.${i}`),
      ...Array.from({ length: 6 }, (_, i) => `dialogue.dresseurVaincu.${i}`),
      ...Array.from({ length: 5 }, (_, i) => `dialogue.panneau.${i}`),
    ];
    for (const cle of clesDuMonde) {
      expect(estCleConnue(cle), `clé absente : ${cle}`).toBe(true);
    }
  });

  it('nomme chaque altération et chaque efficacité utilisée par le combat', () => {
    for (const statut of ['brulure', 'poison', 'paralysie', 'sommeil', 'gel']) {
      expect(estCleConnue(`combat.statut.${statut}`), statut).toBe(true);
    }
    for (const cause of ['sommeil', 'gel', 'paralysie']) {
      expect(estCleConnue(`combat.immobilise.${cause}`), cause).toBe(true);
    }
    for (const palier of ['veryStrong', 'strong', 'weak', 'veryWeak', 'immune']) {
      expect(estCleConnue(`combat.efficace.${palier}`), palier).toBe(true);
    }
    for (const statut of ['brulure', 'poison']) {
      expect(estCleConnue(`combat.souffre.${statut}`), statut).toBe(true);
    }
  });
});
