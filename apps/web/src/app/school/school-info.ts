import type { Founder } from './school-content';
import type { ContactId, ContactLine, Director, ExternalLink, InfoBlock, KeyFigure, Milestone } from './content.model';

const ADMIN = 'Administration du collège';
const ARCHIVE = 'Archives lasalliennes (lasalle-po.org)';
const OFFICIAL = 'Site officiel du collège (lasalle-eg.net)';

export const SCHOOL = {
  name: 'Collège de la Salle',
  district: 'Daher',
  city: 'Le Caire',
  section: 'Bac nationale & Bac français',
  tagline: 'Un collège lasallien au cœur du Caire depuis 1898.',
  address: '6 El Beshnini St., El-Zaher, Le Caire',
  email: 'delasalle@lasalle-eg.net',
  officialSite: 'http://www.lasalle-eg.net/',
  bacSite: 'https://bacdelasalle.com/',
} as const;

export const KEY_FIGURES: readonly KeyFigure[] = [
  { value: '1898', label: 'Fondation à Daher' },
  { value: '2 400', label: 'élèves de toutes confessions' },
  { value: '2', label: 'filières : Bac nationale et Bac français' },
  { value: '2013', label: 'homologation AEFE du Bac' },
];

/**
 * Milestones, in order. Dates marked « Administration du collège » come from the school; the others
 * are documented in the Lasallian archive or on the college's official site. Where sources differ,
 * the page shows both.
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
    year: '1907',
    title: 'Le collège en 1907',
    text: 'Une photographie d’archive montre le bâtiment deux ans après son inauguration.',
    photo: 'campus-1907',
    source: OFFICIAL,
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
    photo: 'chapelle-coupole',
    source: `${ADMIN} · ${ARCHIVE}`,
  },
  {
    year: '2009',
    title: 'Ouverture de la section française',
    text: 'En septembre 2009, le collège ouvre une section française qui prépare au baccalauréat français.',
    photo: null,
    source: 'Site de la section Bac (bacdelasalle.com)',
  },
  {
    year: '2013',
    title: 'Homologation par l’AEFE',
    text: 'Le 10 janvier 2013, l’Agence pour l’enseignement français à l’étranger homologue la section pour les classes de Seconde, Première et Terminale.',
    photo: null,
    source: 'Site de la section Bac (bacdelasalle.com)',
  },
];

export const SCHOOL_HISTORY_INTRO: readonly string[] = [
  'Fondé en 1898 par les Frères des Écoles chrétiennes — l’institut créé par saint Jean-Baptiste de La Salle —, le collège de Daher appartient au réseau lasallien d’Égypte.',
  'Le Bac nationale prépare les élèves à la Thanaweya Amma, l’examen national de fin d’études secondaires ; le Bac français les prépare au baccalauréat français. Les deux partagent le même projet éducatif lasallien.',
];

/** Saint Jean-Baptiste de La Salle — key dates published on the college's official site. */
export const FOUNDER: Founder = {
  name: 'Saint Jean-Baptiste de La Salle',
  dates: '1651 – 1719',
  role: 'fondateur des Frères des Écoles chrétiennes',
  facts: [
    { date: '30 avril 1651', text: 'Naissance à Reims, aîné de onze enfants.' },
    { date: '9 avril 1678', text: 'Ordination sacerdotale.' },
    { date: '7 avril 1719', text: 'Décès.' },
    { date: '19 février 1888', text: 'Béatification.' },
    { date: '24 mai 1900', text: 'Canonisation.' },
    { date: '15 mai 1950', text: 'Proclamé patron des éducateurs.' },
  ],
  summary: [
    'Prêtre à vingt-sept ans, il prend en charge un groupe de maîtres qui tiennent des écoles paroissiales pour les enfants pauvres, les aide matériellement et améliore leur formation d’éducateurs.',
    'Il renonce à son titre de chanoine et à sa fortune, qu’il distribue pendant la famine de 1683-1684, et fonde une communauté de laïcs consacrés à l’éducation des enfants, en particulier des plus pauvres : l’Institut des Frères des Écoles chrétiennes.',
  ],
};

export const FRERES_EGYPTE: readonly InfoBlock[] = [
  {
    id: 'depuis-1854',
    title: 'Les Frères en Égypte depuis 1854',
    paragraphs: [
      'Depuis 1854, les Frères tiennent des écoles au Caire. Ils s’installent d’abord dans le quartier du Mouski, où ils fondent le collège Saint-Joseph de Khoronfish ; des succursales ouvrent ensuite à Bab el-Louk et à Choubra.',
      'Aujourd’hui, six établissements lasalliens existent en Égypte :',
    ],
    items: [
      'Le Caire — Collège de La Salle, Daher',
      'Le Caire — Collège Saint Jean-Baptiste de La Salle, Bab el-Louk',
      'Le Caire — Collège Saint Paul, Choubra',
      'Le Caire — Collège Saint Joseph, Khoronfish',
      'Alexandrie — Collège Saint Marc, Chatby',
      'Alexandrie — Collège Saint Gabriel, Sporting',
    ],
  },
];

/** Heads of the college since its inauguration, as published on the official site. */
export const DIRECTORS: readonly Director[] = [
  { name: 'Odéric-Gabriel', terms: [[1905, 1913]], kind: 'frere' },
  { name: 'Félix-Augustin', terms: [[1913, 1918]], kind: 'frere' },
  { name: 'Philibert-Eugène', terms: [[1918, 1923]], kind: 'frere' },
  { name: 'Dosithée-Justin', terms: [[1923, 1926]], kind: 'frere' },
  { name: 'Philothée-Jean', terms: [[1926, 1929]], kind: 'frere' },
  { name: 'Clément-Gabriel', terms: [[1929, 1934]], kind: 'frere' },
  { name: 'Ismaël-Gabriel', terms: [[1934, 1936]], kind: 'frere' },
  { name: 'Ithier-Casimir', terms: [[1936, 1944]], kind: 'frere' },
  { name: 'Auguste-Julien', terms: [[1944, 1947]], kind: 'frere' },
  { name: 'Blémond-Urbain', terms: [[1947, 1954]], kind: 'frere' },
  { name: 'André-Léon', terms: [[1954, 1956]], kind: 'frere' },
  { name: 'Louis-Antonin', terms: [[1956, 1961], [1968, 1969]], kind: 'frere' },
  { name: 'Émilien-Cyrille', terms: [[1961, 1966]], kind: 'frere' },
  { name: 'Jean Joucla', terms: [[1966, 1968]], kind: 'frere' },
  { name: 'Didier Albo', terms: [[1969, 1970], [1992, 1995]], kind: 'frere' },
  { name: 'Joseph Cavincy', terms: [[1970, 1971]], kind: 'frere' },
  { name: 'Michel Andrejke', terms: [[1971, 1979]], kind: 'frere' },
  { name: 'Jacques Boulad', terms: [[1979, 1985]], kind: 'frere' },
  { name: 'Claude Robe (Régis)', terms: [[1985, 1992]], kind: 'frere' },
  { name: 'Yves Lecocq', terms: [[1995, 2003]], kind: 'frere', role: 'coordinator' },
  { name: 'Claude Robe (Régis)', terms: [[2003, 2011]], kind: 'frere', role: 'coordinator' },
  { name: 'Georges Absi', terms: [[2011, null]], kind: 'frere', role: 'coordinator-then-director' },
  { name: 'Maurice Antaki', terms: [[1963, 1971]], kind: 'laic' },
  { name: 'Chawki Mittri', terms: [[1971, 1984]], kind: 'laic' },
  { name: 'Magdi Kauzman', terms: [[1985, 2010]], kind: 'laic' },
  { name: 'Medhat Nassif', terms: [[2010, 2014]], kind: 'laic' },
];

/** Telephone numbers by department, from the college's official contact page. */
export const CONTACTS: readonly ContactLine[] = [
  { id: 'standard', phones: ['+20 2 2590 47 40', '+20 2 2590 97 65', '+20 2 2588 56 53'] },
  { id: 'superieur', phones: ['+20 2 2590 43 48'] },
  { id: 'directeur', phones: ['+20 2 2592 80 70'] },
  { id: 'secondaire', phones: ['+20 2 2592 24 03'] },
  { id: 'bac', phones: ['+20 2 2592 95 98'] },
  { id: 'preparatoire', phones: ['+20 2 2588 56 51'] },
  { id: 'grand-primaire', phones: ['+20 2 2588 56 50'] },
  { id: 'petit-primaire', phones: ['+20 2 2588 56 49'] },
  { id: 'jardin', phones: ['+20 2 2588 56 52'] },
];

/** The departments' names in French. */
export const CONTACT_LABELS_FR: Readonly<Record<ContactId, string>> = {
  standard: 'Standard',
  superieur: 'Frère Supérieur',
  directeur: 'Frère Directeur du collège',
  secondaire: 'Cycle secondaire',
  bac: 'Bac français',
  preparatoire: 'Cycle préparatoire',
  'grand-primaire': 'Grand primaire',
  'petit-primaire': 'Petit primaire',
  jardin: 'Jardin d’enfants',
};

export const SCHOOL_LINKS: readonly ExternalLink[] = [
  { label: 'Site officiel du collège', url: 'http://www.lasalle-eg.net/', note: 'Annonces, inscriptions du Bac nationale, vie du collège.' },
  { label: 'Bac français', url: 'https://bacdelasalle.com/', note: 'Le site de la section française.' },
  { label: 'Frères des Écoles chrétiennes — Proche-Orient', url: 'https://lasalle-po.org/', note: 'Archives et actualités lasalliennes.' },
];
