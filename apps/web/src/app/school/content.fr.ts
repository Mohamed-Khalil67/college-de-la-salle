import { MATIERE_GROUPS, MATIERES } from '@cdls/shared';
import { PHOTO_CREDITS, PHOTO_TEXTS_FR } from './photos';
import {
  CONTACT_LABELS_FR,
  FOUNDER,
  FRERES_EGYPTE,
  KEY_FIGURES,
  MILESTONES,
  SCHOOL,
  SCHOOL_HISTORY_INTRO,
  SCHOOL_LINKS,
} from './school-info';
import type { MatiereId, MatiereText, SchoolContent } from './school-content';
import { BAC, NATIONALE } from './tracks';

/** The French content: the source the other languages translate. It only gathers school-info.ts, tracks.ts and photos.ts. */
export const CONTENT_FR: SchoolContent = {
  school: { place: 'Daher, Le Caire, depuis 1898', tagline: SCHOOL.tagline, address: SCHOOL.address },
  keyFigures: KEY_FIGURES,
  milestones: MILESTONES,
  historyIntro: SCHOOL_HISTORY_INTRO,
  founder: FOUNDER,
  freres: FRERES_EGYPTE,
  directors: {
    roles: { coordinator: 'Coordinateur', 'coordinator-then-director': 'Coordinateur, puis directeur depuis 2014' },
    and: 'et',
    today: 'aujourd’hui',
  },
  contactLabels: CONTACT_LABELS_FR,
  links: SCHOOL_LINKS,
  sections: { nationale: NATIONALE, bac: BAC },
  tracks: {
    nationale: {
      kicker: 'Programme du ministère égyptien, Thanaweya Amma',
      points: [
        'Établissement bilingue, du jardin d’enfants au secondaire',
        'Français première langue étrangère, sciences enseignées en français',
        'Anglais deuxième langue étrangère',
      ],
    },
    bac: {
      kicker: 'Programmes français, section homologuée par l’AEFE',
      points: [
        'Ouverte en septembre 2009, de la Moyenne Section à la Terminale',
        'Homologuée le 10 janvier 2013 pour le lycée',
        'Enseignants certifiés de l’Éducation nationale',
      ],
    },
  },
  photos: PHOTO_TEXTS_FR,
  photoCredits: PHOTO_CREDITS,
  matieres: Object.fromEntries(MATIERES.map((m) => [m.id, { name: m.name, blurb: m.blurb, alt: m.alt }])) as Record<
    MatiereId,
    MatiereText
  >,
  matiereGroups: Object.fromEntries(MATIERE_GROUPS.map((g) => [g, g])) as SchoolContent['matiereGroups'],
};
