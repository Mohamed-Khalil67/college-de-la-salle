import type { KeyFigure, Milestone } from './model';

const ADMIN = 'Administration du collège';
const ARCHIVE = 'Archives lasalliennes (lasalle-po.org)';

export const SCHOOL = {
  name: 'Collège de la Salle',
  district: 'Daher',
  city: 'Le Caire',
  section: 'Section arabe · Thanaweya Amma',
  tagline: 'Un collège lasallien au cœur du Caire depuis 1898.',
} as const;

export const KEY_FIGURES: readonly KeyFigure[] = [
  { value: '1898', label: 'Fondation à Daher' },
  { value: '1955', label: 'Inauguration des nouveaux bâtiments' },
  { value: '1958', label: 'Inauguration de la chapelle' },
  { value: '3', label: 'Matières détaillées en ligne' },
];

/**
 * Milestones, in order. Dates marked « Administration du collège » come from the school; the others
 * are documented in the Lasallian archive. Where the two differ, the page shows both.
 */
export const MILESTONES: readonly Milestone[] = [
  {
    year: '1898',
    title: 'Fondation du collège à Daher',
    text: 'Les Frères des Écoles chrétiennes ouvrent le Collège de la Salle dans le quartier de Daher, au Caire.',
    photo: null,
    source: ADMIN,
  },
  {
    year: '1905',
    title: 'Le bâtiment en briques rouges',
    text: 'Inauguration de l’emblématique bâtiment néoclassique en briques rouges, qui reste le visage du collège.',
    photo: 'batiment-brique',
    source: ADMIN,
  },
  {
    year: '1926',
    title: 'Les Frères d’Égypte réunis à Daher',
    text: 'En avril 1926, le Supérieur général des Frères visite l’Égypte ; près de 190 Frères venus de toutes les écoles du pays se réunissent au collège pour leur retraite annuelle.',
    photo: 'freres-1926',
    source: ARCHIVE,
  },
  {
    year: '1954',
    title: 'Le grand agrandissement',
    text: 'Le campus se modernise : de nouveaux bâtiments scolaires sortent de terre au début des années 1950.',
    photo: 'construction-1954',
    source: ARCHIVE,
  },
  {
    year: '1955',
    title: 'Inauguration des nouveaux bâtiments',
    text: 'Le 26 novembre 1955, les nouveaux bâtiments sont inaugurés en présence du ministre égyptien de l’Éducation et de l’ambassadeur de France.',
    photo: 'inauguration-1955',
    source: ARCHIVE,
  },
  {
    year: '1957',
    title: 'Les sections de Khoronfish rejoignent Daher',
    text: 'Les sections secondaires de Saint-Joseph de Khoronfish sont regroupées avec le collège. (Les archives lasalliennes datent ce transfert de 1956.)',
    photo: null,
    source: `${ADMIN} · ${ARCHIVE}`,
  },
  {
    year: '1958',
    title: 'La chapelle De La Salle',
    text: 'Après près de quatre ans de travaux (1954–1958), la chapelle du collège est inaugurée en décembre 1958.',
    photo: 'campus-aerien',
    source: `${ADMIN} · ${ARCHIVE}`,
  },
];

export const SCHOOL_HISTORY_INTRO: readonly string[] = [
  'Fondé en 1898 par les Frères des Écoles chrétiennes — l’institut créé par saint Jean-Baptiste de La Salle —, le collège de Daher appartient au réseau lasallien d’Égypte.',
  'Sa section arabe prépare les élèves à la Thanaweya Amma, l’examen national de fin d’études secondaires, en conservant l’exigence et l’ouverture qui font la tradition lasallienne.',
];
