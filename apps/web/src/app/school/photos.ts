import type { Photo, PhotoArchive, PhotoId, PhotoText } from './content.model';

const CREDIT = 'Photo : Frères des Écoles Chrétiennes – Proche-Orient';
const CREDIT_EG = 'Photo : Collège De La Salle – Égypte (archives, lasalle-eg.net)';

/** The credit line of each archive, in French (content.en.ts and content.ar.ts translate it). */
export const PHOTO_CREDITS: Readonly<Record<PhotoArchive, string>> = { po: CREDIT, eg: CREDIT_EG };
const ALBUM = 'http://www.lasalle-eg.net/college/album.htm';

/** A photo from the college's own archive album (lasalle-eg.net). */
function archive(id: PhotoId, file: string, width: number, height: number, alt: string, caption: string): Photo {
  return { id, src: `/images/archives/${file}.jpg`, width, height, alt, caption, credit: CREDIT_EG, archive: 'eg', sourceUrl: ALBUM };
}

/**
 * Photographs of Collège de la Salle, Daher, from the archive published by the Brothers of the
 * Christian Schools, Middle East district (lasalle-po.org, posts by George Boghossian). Downloaded
 * with the school's approval for this site; every use shows the credit.
 */
export const PHOTOS: Readonly<Record<PhotoId, Photo>> = {
  'campus-1907': archive('campus-1907', 'campus-1907', 528, 354, 'Photographie ancienne du bâtiment du collège, en 1907', 'Le bâtiment du collège en 1907.'),
  'campus-1954': archive('campus-1954', 'campus-1954', 595, 454, 'Photographie en noir et blanc de la façade du collège, en 1954', 'La façade du collège en 1954.'),
  'chantier-batiments-1': archive('chantier-batiments-1', 'chantier-batiments-1', 646, 301, 'Le chantier des nouveaux bâtiments, charpentes et échafaudages', 'Le chantier des nouveaux bâtiments.'),
  'chantier-batiments-2': archive('chantier-batiments-2', 'chantier-batiments-2', 651, 381, 'Le chantier des nouveaux bâtiments, vu d’en haut', 'Les nouveaux bâtiments sortent de terre.'),
  'chantier-batiments-3': archive('chantier-batiments-3', 'chantier-batiments-3', 641, 381, 'Les ouvriers sur le chantier des nouveaux bâtiments', 'Les travaux avancent.'),
  'chantier-batiments-4': archive('chantier-batiments-4', 'chantier-batiments-4', 646, 306, 'Les structures en béton des nouveaux bâtiments', 'Les structures en béton.'),
  'chapelle-chantier-1': archive('chapelle-chantier-1', 'chapelle-chantier-1', 641, 416, 'La charpente de la coupole de la chapelle en construction', 'La chapelle en construction : la coupole.'),
  'chapelle-chantier-2': archive('chapelle-chantier-2', 'chapelle-chantier-2', 421, 472, 'Les échafaudages de la voûte de la chapelle', 'La voûte de la chapelle sur ses échafaudages.'),
  'chapelle-chantier-3': archive('chapelle-chantier-3', 'chapelle-chantier-3', 463, 405, 'Le coffrage de la chapelle en construction', 'Le coffrage de la chapelle.'),
  'chapelle-coupole': archive('chapelle-coupole', 'chapelle-coupole', 358, 425, 'La coupole de la chapelle De La Salle aujourd’hui', 'La coupole de la chapelle aujourd’hui.'),
  'chapelle-facade': archive('chapelle-facade', 'chapelle-facade', 361, 244, 'La façade de la chapelle De La Salle et la cour du collège', 'La chapelle De La Salle.'),
  automobile: archive('automobile', 'automobile', 631, 466, 'Une automobile d’époque et ses passagers devant le collège', 'Une automobile d’époque devant le collège.'),
  'salle-de-classe': archive('salle-de-classe', 'salle-de-classe', 508, 300, 'Une salle de classe d’autrefois, élèves assis à leurs pupitres', 'Une salle de classe d’autrefois.'),
  bureau: archive('bureau', 'bureau', 461, 724, 'Un bureau d’époque avec son mobilier ancien', 'Un bureau d’époque.'),
  'nef-archive': archive('nef-archive', 'nef-archive', 707, 456, 'L’intérieur d’une chapelle, la nef et ses bancs', 'Une nef, photographie d’archive.'),
  'entree-1': archive('entree-1', 'entree-1', 532, 319, 'L’entrée du collège, vue de l’intérieur', 'L’entrée, vue de l’intérieur.'),
  'entree-2': archive('entree-2', 'entree-2', 455, 720, 'Un porche voûté à l’entrée du collège', 'Un porche d’entrée.'),
  'entree-3': archive('entree-3', 'entree-3', 553, 400, 'La cour du collège vue de l’entrée', 'La cour, vue de l’entrée.'),
  'batiment-ancien': archive('batiment-ancien', 'batiment-ancien', 644, 392, 'Un bâtiment du collège entouré d’arbres, carte postale ancienne', 'Un bâtiment du collège, carte postale ancienne.'),
  terrain: archive('terrain', 'terrain', 562, 289, 'Un terrain boisé, photographie d’archive', 'Un terrain boisé, photographie d’archive.'),
  'campus-aerien': {
    id: 'campus-aerien',
    src: '/images/school/campus-aerien.jpg',
    width: 1144,
    height: 756,
    alt: 'Vue aérienne du Collège de la Salle à Daher, ses bâtiments et la chapelle, au milieu de la ville',
    caption: 'Le campus de Daher aujourd’hui, vu du ciel.',
    credit: CREDIT,
    archive: 'po',
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
    archive: 'po',
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
    archive: 'po',
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
    archive: 'po',
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
    archive: 'po',
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
    archive: 'po',
    sourceUrl: 'https://lasalle-po.org/2026/03/09/de-la-salle-daher-memories/',
  },
};

export function photo(id: PhotoId): Photo {
  return PHOTOS[id];
}

/** The words of every photo in French, the shape the other languages translate. */
export const PHOTO_TEXTS_FR = Object.fromEntries(
  Object.values(PHOTOS).map((p) => [p.id, { alt: p.alt, caption: p.caption }]),
) as Readonly<Record<PhotoId, PhotoText>>;

/** A photo with its alt text, caption and credit in another language. */
export function localizedPhoto(
  id: PhotoId,
  texts: Readonly<Record<PhotoId, PhotoText>>,
  credits: Readonly<Record<PhotoArchive, string>>,
): Photo {
  const p = PHOTOS[id];
  return { ...p, ...texts[id], credit: credits[p.archive] };
}
