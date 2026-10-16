import type { Photo, PhotoId } from './model';

const CREDIT = 'Photo : Frères des Écoles Chrétiennes – Proche-Orient';

/**
 * Photographs of Collège de la Salle, Daher, from the archive published by the Brothers of the
 * Christian Schools, Middle East district (lasalle-po.org, posts by George Boghossian). Downloaded
 * with the school's approval for this site; every use shows the credit.
 */
export const PHOTOS: Readonly<Record<PhotoId, Photo>> = {
  'campus-aerien': {
    id: 'campus-aerien',
    src: '/images/school/campus-aerien.jpg',
    width: 1144,
    height: 756,
    alt: 'Vue aérienne du Collège de la Salle à Daher, ses bâtiments et la chapelle, au milieu de la ville',
    caption: 'Le campus de Daher aujourd’hui, vu du ciel.',
    credit: CREDIT,
    sourceUrl: 'https://lasalle-po.org/2026/04/10/de-la-salle-daher-memories-2/',
  },
  'batiment-brique': {
    id: 'batiment-brique',
    src: '/images/school/batiment-brique.jpg',
    width: 625,
    height: 425,
    alt: 'Le bâtiment historique en briques rouges du collège, devant la cour',
    caption: 'Le bâtiment historique en briques rouges.',
    credit: CREDIT,
    sourceUrl: 'https://lasalle-po.org/2026/04/10/de-la-salle-daher-memories-2/',
  },
  'construction-1954': {
    id: 'construction-1954',
    src: '/images/school/construction-1954.jpg',
    width: 587,
    height: 403,
    alt: 'Photographie ancienne en noir et blanc : les nouveaux bâtiments du collège en construction',
    caption: '1954 : les travaux d’agrandissement du campus.',
    credit: CREDIT,
    sourceUrl: 'https://lasalle-po.org/2026/04/10/de-la-salle-daher-memories-2/',
  },
  'inauguration-1955': {
    id: 'inauguration-1955',
    src: '/images/school/inauguration-1955.jpg',
    width: 1153,
    height: 809,
    alt: 'Photographie en noir et blanc : coupure du ruban lors de l’inauguration des nouveaux bâtiments',
    caption: '26 novembre 1955 : inauguration des nouveaux bâtiments.',
    credit: CREDIT,
    sourceUrl: 'https://lasalle-po.org/2026/01/19/de-la-salle-dahermemories-the-inauguration-of-the-new-buildings-built-early-1950s/',
  },
  'inauguration-1955-discours': {
    id: 'inauguration-1955-discours',
    src: '/images/school/inauguration-1955-discours.jpg',
    width: 1153,
    height: 871,
    alt: 'Photographie en noir et blanc : un discours devant les invités lors de l’inauguration de 1955',
    caption: 'Les discours de l’inauguration, en présence des autorités.',
    credit: CREDIT,
    sourceUrl: 'https://lasalle-po.org/2026/01/19/de-la-salle-dahermemories-the-inauguration-of-the-new-buildings-built-early-1950s/',
  },
  'freres-1926': {
    id: 'freres-1926',
    src: '/images/school/freres-1926.jpg',
    width: 1166,
    height: 431,
    alt: 'Grande photographie de groupe en noir et blanc des Frères des écoles d’Égypte, rangés sur plusieurs rangs',
    caption: 'Avril 1926 : les Frères d’Égypte réunis au collège.',
    credit: CREDIT,
    sourceUrl: 'https://lasalle-po.org/2026/03/09/de-la-salle-daher-memories/',
  },
};

export function photo(id: PhotoId): Photo {
  return PHOTOS[id];
}
