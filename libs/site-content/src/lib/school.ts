import type { ContactLine, Director, ExternalLink, InfoBlock, KeyFigure, Milestone } from './model';

const ADMIN = 'Administration du collège';
const ARCHIVE = 'Archives lasalliennes (lasalle-po.org)';
const OFFICIAL = 'Site officiel du collège (lasalle-eg.net)';

export const SCHOOL = {
  name: 'Collège de la Salle',
  district: 'Daher',
  city: 'Le Caire',
  section: 'Section nationale & Bac français',
  tagline: 'Un collège lasallien au cœur du Caire depuis 1898.',
  address: '6 El Beshnini St., El-Zaher, Le Caire',
  email: 'delasalle@lasalle-eg.net',
  officialSite: 'http://www.lasalle-eg.net/',
  bacSite: 'https://bacdelasalle.com/',
} as const;

export const KEY_FIGURES: readonly KeyFigure[] = [
  { value: '1898', label: 'Fondation à Daher' },
  { value: '2 400', label: 'élèves de toutes confessions' },
  { value: '2', label: 'sections : nationale et Bac français' },
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
  'Sa section nationale prépare les élèves à la Thanaweya Amma, l’examen national de fin d’études secondaires ; sa section française les prépare au baccalauréat français. Les deux partagent le même projet éducatif lasallien.',
];

/** Saint Jean-Baptiste de La Salle — key dates published on the college's official site. */
export const FOUNDER: { readonly name: string; readonly dates: string; readonly facts: readonly { readonly date: string; readonly text: string }[]; readonly summary: readonly string[] } = {
  name: 'Saint Jean-Baptiste de La Salle',
  dates: '1651 – 1719',
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
  { name: 'Odéric-Gabriel', period: '1905 – 1913', kind: 'frere' },
  { name: 'Félix-Augustin', period: '1913 – 1918', kind: 'frere' },
  { name: 'Philibert-Eugène', period: '1918 – 1923', kind: 'frere' },
  { name: 'Dosithée-Justin', period: '1923 – 1926', kind: 'frere' },
  { name: 'Philothée-Jean', period: '1926 – 1929', kind: 'frere' },
  { name: 'Clément-Gabriel', period: '1929 – 1934', kind: 'frere' },
  { name: 'Ismaël-Gabriel', period: '1934 – 1936', kind: 'frere' },
  { name: 'Ithier-Casimir', period: '1936 – 1944', kind: 'frere' },
  { name: 'Auguste-Julien', period: '1944 – 1947', kind: 'frere' },
  { name: 'Blémond-Urbain', period: '1947 – 1954', kind: 'frere' },
  { name: 'André-Léon', period: '1954 – 1956', kind: 'frere' },
  { name: 'Louis-Antonin', period: '1956 – 1961 et 1968 – 1969', kind: 'frere' },
  { name: 'Émilien-Cyrille', period: '1961 – 1966', kind: 'frere' },
  { name: 'Jean Joucla', period: '1966 – 1968', kind: 'frere' },
  { name: 'Didier Albo', period: '1969 – 1970 et 1992 – 1995', kind: 'frere' },
  { name: 'Joseph Cavincy', period: '1970 – 1971', kind: 'frere' },
  { name: 'Michel Andrejke', period: '1971 – 1979', kind: 'frere' },
  { name: 'Jacques Boulad', period: '1979 – 1985', kind: 'frere' },
  { name: 'Claude Robe (Régis)', period: '1985 – 1992', kind: 'frere' },
  { name: 'Yves Lecocq', period: '1995 – 2003', kind: 'frere', role: 'Coordinateur' },
  { name: 'Claude Robe (Régis)', period: '2003 – 2011', kind: 'frere', role: 'Coordinateur' },
  { name: 'Georges Absi', period: '2011 – aujourd’hui', kind: 'frere', role: 'Coordinateur, puis directeur depuis 2014' },
  { name: 'Maurice Antaki', period: '1963 – 1971', kind: 'laic' },
  { name: 'Chawki Mittri', period: '1971 – 1984', kind: 'laic' },
  { name: 'Magdi Kauzman', period: '1985 – 2010', kind: 'laic' },
  { name: 'Medhat Nassif', period: '2010 – 2014', kind: 'laic' },
];

/** Telephone numbers by department, from the college's official contact page. */
export const CONTACTS: readonly ContactLine[] = [
  { label: 'Standard', phones: ['+20 2 2590 47 40', '+20 2 2590 97 65', '+20 2 2588 56 53'] },
  { label: 'Frère Supérieur', phones: ['+20 2 2590 43 48'] },
  { label: 'Frère Directeur du collège', phones: ['+20 2 2592 80 70'] },
  { label: 'Cycle secondaire', phones: ['+20 2 2592 24 03'] },
  { label: 'Section Bac français', phones: ['+20 2 2592 95 98'] },
  { label: 'Cycle préparatoire', phones: ['+20 2 2588 56 51'] },
  { label: 'Grand primaire', phones: ['+20 2 2588 56 50'] },
  { label: 'Petit primaire', phones: ['+20 2 2588 56 49'] },
  { label: 'Jardin d’enfants', phones: ['+20 2 2588 56 52'] },
];

export const SCHOOL_LINKS: readonly ExternalLink[] = [
  { label: 'Site officiel du collège', url: 'http://www.lasalle-eg.net/', note: 'Annonces, inscriptions de la section nationale, vie du collège.' },
  { label: 'Section Bac français', url: 'https://bacdelasalle.com/', note: 'Le site de la section française.' },
  { label: 'Frères des Écoles chrétiennes — Proche-Orient', url: 'https://lasalle-po.org/', note: 'Archives et actualités lasalliennes.' },
];
