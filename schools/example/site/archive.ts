import type { Director, Photo } from '../../../apps/web/src/app/school/content.model';

/** The pack's three placeholder pictures (flat illustrations made for this example, no credit owed). */
function picture(id: string, alt: string, caption: string): Photo {
  return { id, src: `/images/example/${id}.svg`, width: 1200, height: 800, alt, caption, credit: 'Image de démonstration', archive: 'demo', sourceUrl: 'https://example.org/' };
}

export const PHOTOS: Readonly<Record<string, Photo>> = {
  campus: picture('campus', 'Illustration : un bâtiment à toit rouge entouré d’arbres', 'Le bâtiment principal (illustration).'),
  classe: picture('classe', 'Illustration : une salle de classe avec un tableau vert et trois tables', 'Une salle de classe (illustration).'),
  entree: picture('entree', 'Illustration : l’entrée voûtée d’un bâtiment', 'L’entrée de l’école (illustration).'),
};

/** Heads of the school (fictional). `kind` only splits the two tables of the history page. */
export const DIRECTORS: readonly Director[] = [
  { name: 'A. Exemple', terms: [[1950, 1975]], kind: 'frere' },
  { name: 'B. Modèle', terms: [[1975, 2005]], kind: 'frere' },
  { name: 'C. Démo', terms: [[2005, null]], kind: 'laic' },
];
