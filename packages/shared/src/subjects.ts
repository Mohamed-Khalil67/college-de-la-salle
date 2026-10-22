/**
 * The subjects (matières) of the college's two tracks: the list teachers choose from when they
 * publish homework or enter grades, and what the track pages show.
 *
 * For the school space this list is only seed data: the `subjects` table is the catalogue (the admin and
 * coordinators create, rename and archive subjects there), and each class's subjects and coefficients are
 * its class subjects. The public site still reads the blurbs and illustrations below
 * (apps/web/public/images/matieres/, see apps/web/scripts/subject-images.mjs).
 */

export type MatiereGroup = 'Langues' | 'Sciences' | 'Lettres et sciences humaines' | 'Éducation et culture';
export type Track = 'nationale' | 'bac';

export interface Matiere {
  /** Stable id stored in posts, grades and the `subjects` table (never rename it). */
  readonly id: string;
  readonly name: string;
  readonly group: MatiereGroup;
  readonly tracks: readonly Track[];
  readonly blurb: string;
  readonly image: string;
  readonly alt: string;
}

const BOTH: readonly Track[] = ['nationale', 'bac'];

function matiere(id: string, name: string, group: MatiereGroup, tracks: readonly Track[], blurb: string, alt: string): Matiere {
  return { id, name, group, tracks, blurb, image: `/images/matieres/${id}.svg`, alt };
}

export const MATIERE_GROUPS: readonly MatiereGroup[] = ['Langues', 'Sciences', 'Lettres et sciences humaines', 'Éducation et culture'];

export const MATIERES: readonly Matiere[] = [
  matiere('arabe', 'Langue arabe', 'Langues', BOTH, 'Grammaire, rhétorique, littérature et expression écrite.', 'Illustration : un livre ouvert, calligraphie arabe au-dessus'),
  matiere('francais', 'Français', 'Langues', BOTH, 'Langue, lecture et littérature d’expression française.', 'Illustration : un livre ouvert et la lettre F'),
  matiere('anglais', 'Anglais', 'Langues', BOTH, 'Compréhension et expression en langue anglaise.', 'Illustration : un livre ouvert et la lettre A'),
  matiere('espagnol', 'Espagnol', 'Langues', ['bac'], 'Langue vivante complémentaire.', 'Illustration : un livre ouvert et la lettre Ñ'),
  matiere('mathematiques', 'Mathématiques', 'Sciences', BOTH, 'Analyse, algèbre, géométrie et raisonnement.', 'Illustration : des axes, une parabole et un triangle'),
  matiere('physique-chimie', 'Physique-Chimie', 'Sciences', BOTH, 'Électricité, mécanique, réactions et matière.', 'Illustration : un atome et une fiole'),
  matiere('svt', 'SVT (Sciences de la vie et de la Terre)', 'Sciences', BOTH, 'Biologie, géologie et environnement.', 'Illustration : une feuille et ses nervures'),
  matiere('informatique', 'Informatique', 'Sciences', BOTH, 'Algorithmique, programmation et numérique.', 'Illustration : un écran affichant du code'),
  matiere('ses', 'Sciences économiques et sociales', 'Sciences', ['bac'], 'Économie, sociologie et science politique.', 'Illustration : un graphique en barres et une pièce'),
  matiere('histoire-geographie', 'Histoire-Géographie', 'Lettres et sciences humaines', BOTH, 'Le monde, ses territoires et son histoire.', 'Illustration : un globe et un temple à colonnes'),
  matiere('philosophie', 'Philosophie', 'Lettres et sciences humaines', BOTH, 'Réflexion, argumentation et logique.', 'Illustration : une ampoule allumée'),
  matiere('psychologie', 'Psychologie et sociologie', 'Lettres et sciences humaines', ['nationale'], 'Comprendre la personne et la société.', 'Illustration : un profil de tête et une loupe'),
  matiere('humanites', 'Humanités, littérature et philosophie', 'Lettres et sciences humaines', ['bac'], 'Grands textes et questions de culture.', 'Illustration : un parchemin'),
  matiere('education-civique', 'Éducation civique', 'Éducation et culture', BOTH, 'Droits, devoirs et vie en société.', 'Illustration : la balance de la justice'),
  matiere('education-religieuse', 'Éducation religieuse', 'Éducation et culture', ['nationale'], 'Valeurs et culture religieuses.', 'Illustration : un croissant, une étoile et une croix'),
  matiere('eps', 'Éducation physique et sportive', 'Éducation et culture', BOTH, 'Sport, santé et esprit d’équipe.', 'Illustration : un ballon de basket'),
  matiere('arts', 'Arts', 'Éducation et culture', BOTH, 'Arts plastiques et expression artistique.', 'Illustration : une palette de peintre'),
];

const BY_ID = new Map(MATIERES.map((m) => [m.id, m]));

export function matiereById(id: string): Matiere | null {
  return BY_ID.get(id) ?? null;
}

/** Display name for a stored subject id; unknown ids are shown as written. */
export function matiereName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

export function matieresFor(track: Track): readonly Matiere[] {
  return MATIERES.filter((m) => m.tracks.includes(track));
}
