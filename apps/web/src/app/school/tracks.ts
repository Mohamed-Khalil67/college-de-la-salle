import type { SectionPage } from './content.model';

/**
 * The two tracks of the college. Facts come from the college's official site (lasalle-eg.net) and
 * the Bac section's site (bacdelasalle.com); the wording is the website's own.
 */
export const NATIONALE: SectionPage = {
  slug: 'nationale',
  title: 'Bac nationale',
  kicker: 'Programme du ministère égyptien · Thanaweya Amma',
  intro:
    'Établissement bilingue de la maternelle à la Thanaweya Amma : les élèves suivent les programmes du ministère égyptien de l’Éducation, avec le français comme première langue étrangère et l’anglais comme deuxième. Les matières scientifiques sont enseignées en français.',
  photo: 'campus-aerien',
  facts: [
    { value: '2 400', label: 'élèves au collège' },
    { value: 'FR', label: '1re langue étrangère (sciences en français)' },
    { value: '5', label: 'cycles, du jardin d’enfants au secondaire' },
    { value: '3', label: 'années de secondaire (Thanaweya Amma)' },
  ],
  blocks: [
    {
      id: 'presentation',
      title: 'Un collège bilingue, ouvert à tous',
      paragraphs: [
        'Le Collège de la Salle accueille environ 2 400 élèves de toutes confessions et de milieux sociaux variés. Il suit les programmes du ministère égyptien de l’Éducation et prépare à la Thanaweya Amma, l’examen national de fin d’études secondaires.',
        'Le français est la première langue étrangère, l’anglais la deuxième, et les matières scientifiques sont enseignées en français : un atout pour les études supérieures francophones en Égypte et à l’étranger.',
      ],
      items: [],
    },
    {
      id: 'cycles',
      title: 'Les cycles',
      paragraphs: ['Le collège couvre tout le parcours scolaire, avec une direction dédiée à chaque cycle :'],
      items: ['Jardin d’enfants', 'Petit primaire', 'Grand primaire', 'Cycle préparatoire', 'Cycle secondaire (Thanaweya Amma)'],
    },
    {
      id: 'inscription',
      title: 'Inscription',
      paragraphs: [
        'Les ouvertures d’inscription (par exemple le Pré-Jardin) et la liste des pièces à fournir sont publiées, en arabe, sur le site officiel du collège, avec le formulaire de demande. Pour toute question, contactez le secrétariat.',
      ],
      items: [],
    },
  ],
  links: [
    { label: 'Annonces et inscriptions (site officiel)', url: 'http://www.lasalle-eg.net/', note: 'En arabe : conditions, pièces à fournir, formulaire.' },
  ],
  counts: [],
  countsNote: '',
};

export const BAC: SectionPage = {
  slug: 'bac',
  title: 'Bac français',
  kicker: 'Programmes français · Homologuée par l’AEFE',
  intro:
    'Ouverte en septembre 2009, la section française prépare au baccalauréat français. Elle fait partie intégrante du collège et partage son projet éducatif lasallien. Elle a été homologuée par l’AEFE le 10 janvier 2013 pour les classes de Seconde, Première et Terminale.',
  photo: 'batiment-brique',
  facts: [
    { value: '2009', label: 'ouverture de la section' },
    { value: '2013', label: 'homologation AEFE (10 janvier)' },
    { value: '9', label: 'niveaux, de la Moyenne Section à la Terminale' },
    { value: '268', label: 'élèves en 2020-2021' },
  ],
  blocks: [
    {
      id: 'presentation',
      title: 'La section française',
      paragraphs: [
        'La section propose les programmes français et prépare les élèves au baccalauréat français, du même niveau que celui des lycées de France. Elle accueille les élèves de la Moyenne Section à la Terminale.',
        'Le collège fait partie du réseau lasallien, qui compte 900 établissements dans 81 pays, dont six en Égypte.',
      ],
      items: [],
    },
    {
      id: 'aefe',
      title: 'L’homologation AEFE',
      paragraphs: [
        'L’AEFE (Agence pour l’enseignement français à l’étranger) a homologué la section le 10 janvier 2013 pour les Secondes, Premières et Terminales. Les élèves suivent ainsi les mêmes programmes et passent le même diplôme que les élèves de France.',
        'L’homologation permet aussi au collège de recruter des enseignants certifiés de l’Éducation nationale française, en contrat local.',
      ],
      items: [],
    },
    {
      id: 'valeurs',
      title: 'Les valeurs fondamentales',
      paragraphs: ['Le projet éducatif place l’enfant et le jeune au centre, autour de trois valeurs :'],
      items: [
        'La liberté et l’autonomie : comprendre ce qu’est la liberté et l’exercer dans la vie de la classe et de l’école.',
        'La responsabilité : assumer ses actes et exercer, selon son âge, de vraies responsabilités dans des comités et des instances.',
        'Le respect de la dignité de chaque personne : nul ne doit subir humiliation, vexation ou mépris, quels que soient son âge, son origine, sa religion ou ses capacités.',
      ],
    },
    {
      id: 'aide',
      title: 'Accompagner les élèves en difficulté',
      paragraphs: ['Aucun élève ne doit être écarté pour des raisons économiques ni découragé de poursuivre. L’accompagnement repose sur six leviers :'],
      items: [
        'Un travail avec les familles pour comprendre les causes de chaque difficulté.',
        'Une pédagogie participative, motivante, qui redonne confiance.',
        'Des cours de soutien pendant la journée scolaire.',
        'Des groupes de niveau dans certaines classes.',
        'Des classes dédoublées pour travailler en petits groupes.',
        'Un suivi individualisé pour les besoins spécifiques.',
      ],
    },
    {
      id: 'langues',
      title: 'Le renforcement des langues',
      paragraphs: [
        'Le français est renforcé avant l’entrée dans la section : des classes préparatoires accueillent les élèves qui souhaitent la rejoindre. L’espagnol est proposé comme langue complémentaire, et les élèves sont encouragés à s’exprimer en arabe, en anglais et en espagnol.',
      ],
      items: [],
    },
    {
      id: 'developpement',
      title: 'Le développement global de l’élève',
      paragraphs: ['Le collège développe la personnalité de chaque élève par :'],
      items: [
        'des temps, des lieux et des structures où élèves et adultes se rencontrent, s’expriment, prennent des initiatives ;',
        'des terrains de jeux et du matériel d’éducation physique ;',
        'des activités variées valorisant les talents intellectuels, manuels, sportifs et artistiques ;',
        'des projets communs qui aident l’élève à se connaître et à s’impliquer dans sa formation.',
      ],
    },
    {
      id: 'orientation',
      title: 'L’orientation',
      paragraphs: ['Les élèves préparent leur avenir tout au long du lycée :'],
      items: [
        'participation chaque année au forum des métiers organisé par le Lycée français du Caire ;',
        'présentation des filières francophones des universités égyptiennes ;',
        'découverte des départements de l’Université française d’Égypte ;',
        'information sur l’enseignement supérieur en France ;',
        'rencontres avec des personnalités et découverte de projets d’avenir pour le pays.',
      ],
    },
    {
      id: 'inscription',
      title: 'Inscription',
      paragraphs: [
        'Les demandes se font en ligne, sur le site de la section : un formulaire pour la préparation au Bac (« Pre-bac ») et un autre pour le Bac. Il faut indiquer l’identité de l’élève, sa date de naissance, son école précédente, ses coordonnées et celles de ses parents, et joindre une photo.',
      ],
      items: [],
    },
  ],
  links: [
    { label: 'Site de la section Bac français', url: 'https://bacdelasalle.com/', note: 'Règlement, vie scolaire, galerie, contact.' },
    { label: 'Inscription Pre-bac', url: 'https://bacdelasalle.com/inscription/inscription-2/', note: 'Formulaire en ligne.' },
    { label: 'Inscription Bac', url: 'https://bacdelasalle.com/inscription/inscription-2-2/', note: 'Formulaire en ligne.' },
  ],
  counts: [
    { cycle: 'Primaire', levels: [{ level: 'Moyenne Section', students: 29 }, { level: 'CP', students: 28 }, { level: 'CM1', students: 17 }] },
    { cycle: 'Collège', levels: [{ level: '5e', students: 29 }, { level: '4e', students: 29 }, { level: '3e', students: 29 }] },
    { cycle: 'Lycée', levels: [{ level: 'Seconde', students: 46 }, { level: 'Première', students: 33 }, { level: 'Terminale', students: 28 }] },
  ],
  countsNote: 'Effectifs de la section française, année scolaire 2020-2021 (source : site de la section).',
};

export const SECTIONS: readonly SectionPage[] = [NATIONALE, BAC];

export function sectionBySlug(slug: string): SectionPage | null {
  return SECTIONS.find((s) => s.slug === slug) ?? null;
}
