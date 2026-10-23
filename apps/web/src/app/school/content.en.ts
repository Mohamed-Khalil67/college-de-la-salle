import type { SchoolContent } from './school-content';

/*
 * English content. MACHINE-DRAFTED from the French source (content.fr.ts): the school must review it before
 * it is published (docs/i18n.md). Keep the facts (years, photos, links, headcounts) identical to the French;
 * school-content.spec.ts checks them.
 */

const ADMIN = 'College administration';
const ARCHIVE = 'Lasallian archives (lasalle-po.org)';
const OFFICIAL = 'College website (lasalle-eg.net)';
const BAC_SITE = 'French Bac section website (bacdelasalle.com)';

export const CONTENT_EN: SchoolContent = {
  school: {
    place: 'Daher, Cairo, since 1898',
    tagline: 'A Lasallian school in the heart of Cairo since 1898.',
    address: '6 El Beshnini St., El-Zaher, Cairo',
  },
  keyFigures: [
    { value: '1898', label: 'Founded in Daher' },
    { value: '2,400', label: 'students of every faith' },
    { value: '2', label: 'tracks: Egyptian and French baccalaureates' },
    { value: '2013', label: 'AEFE accreditation of the French Bac' },
  ],
  milestones: [
    {
      year: '1898',
      title: 'The college opens in Daher',
      text: 'The Brothers of the Christian Schools open the Collège de la Salle in the Daher district of Cairo.',
      photo: null,
      source: ADMIN,
    },
    {
      year: '1905',
      title: 'The red-brick building',
      text: 'The landmark neoclassical red-brick building is inaugurated. It is still the face of the college.',
      photo: 'batiment-brique',
      source: ADMIN,
    },
    {
      year: '1907',
      title: 'The college in 1907',
      text: 'An archive photograph shows the building two years after its inauguration.',
      photo: 'campus-1907',
      source: OFFICIAL,
    },
    {
      year: '1926',
      title: 'The Brothers of Egypt gather in Daher',
      text: 'In April 1926 the Brothers’ Superior General visits Egypt; nearly 190 Brothers from every school in the country meet at the college for their annual retreat.',
      photo: 'freres-1926',
      source: ARCHIVE,
    },
    {
      year: '1954',
      title: 'The great extension',
      text: 'The campus is modernised: new school buildings go up in the early 1950s.',
      photo: 'construction-1954',
      source: ARCHIVE,
    },
    {
      year: '1955',
      title: 'The new buildings are inaugurated',
      text: 'On 26 November 1955 the new buildings are inaugurated in the presence of the Egyptian Minister of Education and the French Ambassador.',
      photo: 'inauguration-1955',
      source: ARCHIVE,
    },
    {
      year: '1957',
      title: 'The Khoronfish sections move to Daher',
      text: 'The secondary sections of Saint-Joseph de Khoronfish join the college. (The Lasallian archives date this move to 1956.)',
      photo: null,
      source: `${ADMIN} · ${ARCHIVE}`,
    },
    {
      year: '1958',
      title: 'The De La Salle chapel',
      text: 'After nearly four years of work (1954–1958), the college chapel is inaugurated in December 1958.',
      photo: 'chapelle-coupole',
      source: `${ADMIN} · ${ARCHIVE}`,
    },
    {
      year: '2009',
      title: 'The French section opens',
      text: 'In September 2009 the college opens a French section that prepares students for the French baccalaureate.',
      photo: null,
      source: BAC_SITE,
    },
    {
      year: '2013',
      title: 'AEFE accreditation',
      text: 'On 10 January 2013 the Agency for French Education Abroad (AEFE) accredits the section for the last three years of secondary school (Seconde, Première and Terminale).',
      photo: null,
      source: BAC_SITE,
    },
  ],
  historyIntro: [
    'Founded in 1898 by the Brothers of the Christian Schools, the institute created by Saint John Baptist de La Salle, the Daher college belongs to the Lasallian network of Egypt.',
    'The Egyptian track prepares students for the Thanaweya Amma, the national secondary school leaving exam; the French track prepares them for the French baccalaureate. Both share the same Lasallian educational project.',
  ],
  founder: {
    name: 'Saint John Baptist de La Salle',
    dates: '1651 – 1719',
    role: 'founder of the Brothers of the Christian Schools',
    facts: [
      { date: '30 April 1651', text: 'Born in Reims, the eldest of eleven children.' },
      { date: '9 April 1678', text: 'Ordained a priest.' },
      { date: '7 April 1719', text: 'Dies.' },
      { date: '19 February 1888', text: 'Beatified.' },
      { date: '24 May 1900', text: 'Canonised.' },
      { date: '15 May 1950', text: 'Proclaimed patron saint of teachers.' },
    ],
    summary: [
      'A priest at twenty-seven, he takes charge of a group of teachers running parish schools for poor children, supports them and improves their training as educators.',
      'He gives up his title of canon and his fortune, which he distributes during the famine of 1683–1684, and founds a community of lay men devoted to the education of children, especially the poorest: the Institute of the Brothers of the Christian Schools.',
    ],
  },
  freres: [
    {
      id: 'depuis-1854',
      title: 'The Brothers in Egypt since 1854',
      paragraphs: [
        'The Brothers have run schools in Cairo since 1854. They first settle in the Mouski district, where they found the Saint-Joseph de Khoronfish college; branches then open in Bab el-Louk and Shubra.',
        'Today there are six Lasallian schools in Egypt:',
      ],
      items: [
        'Cairo: Collège de La Salle, Daher',
        'Cairo: Collège Saint Jean-Baptiste de La Salle, Bab el-Louk',
        'Cairo: Collège Saint Paul, Shubra',
        'Cairo: Collège Saint Joseph, Khoronfish',
        'Alexandria: Collège Saint Marc, Chatby',
        'Alexandria: Collège Saint Gabriel, Sporting',
      ],
    },
  ],
  directors: {
    roles: { coordinator: 'Coordinator', 'coordinator-then-director': 'Coordinator, then director since 2014' },
    and: 'and',
    today: 'present',
  },
  contactLabels: {
    standard: 'Switchboard',
    superieur: 'Brother Superior',
    directeur: 'Brother Director of the college',
    secondaire: 'Secondary school',
    bac: 'French Bac',
    preparatoire: 'Preparatory school',
    'grand-primaire': 'Upper primary',
    'petit-primaire': 'Lower primary',
    jardin: 'Kindergarten',
  },
  links: [
    { label: 'College website', url: 'http://www.lasalle-eg.net/', note: 'News, Egyptian Bac admissions, college life (in Arabic).' },
    { label: 'French Bac', url: 'https://bacdelasalle.com/', note: 'The French section’s website (in French).' },
    { label: 'Brothers of the Christian Schools, Middle East', url: 'https://lasalle-po.org/', note: 'Lasallian archives and news.' },
  ],
  sections: {
    nationale: {
      slug: 'nationale',
      title: 'Egyptian Bac',
      kicker: 'Egyptian Ministry programme, Thanaweya Amma',
      intro:
        'A bilingual school from kindergarten to the Thanaweya Amma: students follow the programmes of the Egyptian Ministry of Education, with French as their first foreign language and English as their second. Science subjects are taught in French.',
      photo: 'campus-aerien',
      facts: [
        { value: '2,400', label: 'students at the college' },
        { value: 'FR', label: '1st foreign language (sciences in French)' },
        { value: '5', label: 'stages, from kindergarten to secondary' },
        { value: '3', label: 'years of secondary school (Thanaweya Amma)' },
      ],
      blocks: [
        {
          id: 'presentation',
          title: 'A bilingual school, open to all',
          paragraphs: [
            'The Collège de la Salle welcomes about 2,400 students of every faith and from a range of backgrounds. It follows the programmes of the Egyptian Ministry of Education and prepares students for the Thanaweya Amma, the national secondary school leaving exam.',
            'French is the first foreign language and English the second, and science subjects are taught in French: an advantage for French-language higher education in Egypt and abroad.',
          ],
          items: [],
        },
        {
          id: 'cycles',
          title: 'School stages',
          paragraphs: ['The college covers the whole of a child’s schooling, with its own head for each stage:'],
          items: ['Kindergarten', 'Lower primary', 'Upper primary', 'Preparatory school', 'Secondary school (Thanaweya Amma)'],
        },
        {
          id: 'inscription',
          title: 'Admissions',
          paragraphs: [
            'Admission periods (for example for Pre-Kindergarten) and the list of documents to provide are published in Arabic on the college’s website, with the application form. For any question, contact the school office.',
          ],
          items: [],
        },
      ],
      links: [
        { label: 'News and admissions (college website)', url: 'http://www.lasalle-eg.net/', note: 'In Arabic: requirements, documents, application form.' },
      ],
      counts: [],
      countsNote: '',
    },
    bac: {
      slug: 'bac',
      title: 'French Bac',
      kicker: 'French programmes, accredited by the AEFE',
      intro:
        'Opened in September 2009, the French section prepares students for the French baccalaureate. It is an integral part of the college and shares its Lasallian educational project. The AEFE accredited it on 10 January 2013 for the last three years of secondary school.',
      photo: 'batiment-brique',
      facts: [
        { value: '2009', label: 'the section opens' },
        { value: '2013', label: 'AEFE accreditation (10 January)' },
        { value: '9', label: 'year groups, from Moyenne Section to Terminale' },
        { value: '268', label: 'students in 2020–2021' },
      ],
      blocks: [
        {
          id: 'presentation',
          title: 'The French section',
          paragraphs: [
            'The section follows the French national curriculum and prepares students for the French baccalaureate, to the same standard as schools in France. It takes students from Moyenne Section (age 4) to Terminale (final year).',
            'The college belongs to the Lasallian network, which has 900 schools in 81 countries, six of them in Egypt.',
          ],
          items: [],
        },
        {
          id: 'aefe',
          title: 'AEFE accreditation',
          paragraphs: [
            'The AEFE (Agency for French Education Abroad) accredited the section on 10 January 2013 for Seconde, Première and Terminale. Students therefore follow the same programmes and sit the same diploma as students in France.',
            'Accreditation also allows the college to recruit teachers certified by the French Ministry of Education, on local contracts.',
          ],
          items: [],
        },
        {
          id: 'valeurs',
          title: 'Core values',
          paragraphs: ['The educational project puts the child and the young person at the centre, around three values:'],
          items: [
            'Freedom and autonomy: understanding what freedom is and exercising it in the life of the class and the school.',
            'Responsibility: owning one’s actions and, according to one’s age, taking on real responsibilities in committees and councils.',
            'Respect for the dignity of every person: no one should suffer humiliation, hurt or contempt, whatever their age, origin, religion or abilities.',
          ],
        },
        {
          id: 'aide',
          title: 'Supporting students who struggle',
          paragraphs: ['No student should be turned away for financial reasons or discouraged from continuing. Support rests on six levers:'],
          items: [
            'Working with families to understand the causes of each difficulty.',
            'Participative, motivating teaching that restores confidence.',
            'Support lessons during the school day.',
            'Ability groups in some classes.',
            'Split classes to work in small groups.',
            'Individual follow-up for specific needs.',
          ],
        },
        {
          id: 'langues',
          title: 'Strengthening languages',
          paragraphs: [
            'French is strengthened before students join the section: preparatory classes welcome those who wish to enter it. Spanish is offered as an additional language, and students are encouraged to speak Arabic, English and Spanish.',
          ],
          items: [],
        },
        {
          id: 'developpement',
          title: 'The whole student',
          paragraphs: ['The college develops each student’s personality through:'],
          items: [
            'times, places and bodies where students and adults meet, speak and take initiatives;',
            'playing fields and physical education equipment;',
            'varied activities that value intellectual, practical, sporting and artistic talents;',
            'shared projects that help students know themselves and take part in their own education.',
          ],
        },
        {
          id: 'orientation',
          title: 'Guidance',
          paragraphs: ['Students prepare their future throughout the lycée years:'],
          items: [
            'a yearly visit to the careers fair organised by the Lycée français du Caire;',
            'presentations of the French-language programmes of Egyptian universities;',
            'visits to the departments of the Université française d’Égypte;',
            'information on higher education in France;',
            'meetings with public figures and projects for the country’s future.',
          ],
        },
        {
          id: 'inscription',
          title: 'Admissions',
          paragraphs: [
            'Applications are made online, on the section’s website: one form for the preparatory year (« Pre-bac ») and another for the Bac. You give the student’s name, date of birth, previous school, contact details and those of the parents, and attach a photo.',
          ],
          items: [],
        },
      ],
      links: [
        { label: 'French Bac section website', url: 'https://bacdelasalle.com/', note: 'Rules, school life, gallery, contact (in French).' },
        { label: 'Pre-bac application', registration: true, url: 'https://bacdelasalle.com/inscription/inscription-2/', note: 'Online form (in French).' },
        { label: 'Bac application', registration: true, url: 'https://bacdelasalle.com/inscription/inscription-2-2/', note: 'Online form (in French).' },
      ],
      counts: [
        { cycle: 'Primary', levels: [{ level: 'Moyenne Section', students: 29 }, { level: 'CP', students: 28 }, { level: 'CM1', students: 17 }] },
        { cycle: 'Collège', levels: [{ level: '5e', students: 29 }, { level: '4e', students: 29 }, { level: '3e', students: 29 }] },
        { cycle: 'Lycée', levels: [{ level: 'Seconde', students: 46 }, { level: 'Première', students: 33 }, { level: 'Terminale', students: 28 }] },
      ],
      countsNote: 'Students of the French section, school year 2020–2021 (source: the section’s website). Year groups keep their French names.',
    },
  },
  tracks: {
    nationale: {
      kicker: 'Egyptian Ministry programme, Thanaweya Amma',
      points: [
        'Bilingual school, from kindergarten to secondary',
        'French as first foreign language, sciences taught in French',
        'English as second foreign language',
      ],
    },
    bac: {
      kicker: 'French programmes, section accredited by the AEFE',
      points: [
        'Opened in September 2009, from Moyenne Section to Terminale',
        'Accredited on 10 January 2013 for the lycée years',
        'Teachers certified by the French Ministry of Education',
      ],
    },
  },
  photos: {
    'campus-1907': { alt: 'Old photograph of the college building in 1907', caption: 'The college building in 1907.' },
    'campus-1954': { alt: 'Black and white photograph of the college façade in 1954', caption: 'The college façade in 1954.' },
    'chantier-batiments-1': { alt: 'The building site of the new buildings, frames and scaffolding', caption: 'Building the new wings.' },
    'chantier-batiments-2': { alt: 'The building site of the new buildings, seen from above', caption: 'The new buildings rise.' },
    'chantier-batiments-3': { alt: 'Workers on the building site of the new buildings', caption: 'Work in progress.' },
    'chantier-batiments-4': { alt: 'The concrete frames of the new buildings', caption: 'The concrete frames.' },
    'chapelle-chantier-1': { alt: 'The frame of the chapel dome under construction', caption: 'The chapel under construction: the dome.' },
    'chapelle-chantier-2': { alt: 'Scaffolding under the chapel vault', caption: 'The chapel vault on its scaffolding.' },
    'chapelle-chantier-3': { alt: 'The formwork of the chapel under construction', caption: 'The chapel formwork.' },
    'chapelle-coupole': { alt: 'The dome of the De La Salle chapel today', caption: 'The chapel dome today.' },
    'chapelle-facade': { alt: 'The façade of the De La Salle chapel and the college courtyard', caption: 'The De La Salle chapel.' },
    automobile: { alt: 'A vintage car and its passengers in front of the college', caption: 'A vintage car in front of the college.' },
    'salle-de-classe': { alt: 'A classroom of the past, students sitting at their desks', caption: 'A classroom of the past.' },
    bureau: { alt: 'An office of the period with its old furniture', caption: 'An office of the period.' },
    'nef-archive': { alt: 'Inside a chapel, the nave and its pews', caption: 'A nave, archive photograph.' },
    'entree-1': { alt: 'The college entrance, seen from inside', caption: 'The entrance, seen from inside.' },
    'entree-2': { alt: 'A vaulted porch at the college entrance', caption: 'An entrance porch.' },
    'entree-3': { alt: 'The college courtyard seen from the entrance', caption: 'The courtyard, seen from the entrance.' },
    'batiment-ancien': { alt: 'A college building surrounded by trees, old postcard', caption: 'A college building, old postcard.' },
    terrain: { alt: 'A wooded plot of land, archive photograph', caption: 'A wooded plot, archive photograph.' },
    'campus-aerien': {
      alt: 'Aerial view of the Collège de la Salle in Daher, its buildings and chapel, in the middle of the city',
      caption: 'The Daher campus today, from the air.',
    },
    'batiment-brique': { alt: 'The college’s historic red-brick building, in front of the courtyard', caption: 'The historic red-brick building.' },
    'construction-1954': {
      alt: 'Old black and white photograph: the college’s new buildings under construction',
      caption: '1954: extending the campus.',
    },
    'inauguration-1955': {
      alt: 'Black and white photograph: cutting the ribbon at the inauguration of the new buildings',
      caption: '26 November 1955: the new buildings are inaugurated.',
    },
    'inauguration-1955-discours': {
      alt: 'Black and white photograph: a speech in front of the guests at the 1955 inauguration',
      caption: 'Speeches at the inauguration, in the presence of the authorities.',
    },
    'freres-1926': {
      alt: 'Large black and white group photograph of the Brothers of the schools of Egypt, standing in several rows',
      caption: 'April 1926: the Brothers of Egypt gathered at the college.',
    },
  },
  photoCredits: {
    po: 'Photo: Brothers of the Christian Schools – Middle East',
    eg: 'Photo: Collège De La Salle – Egypt (archives, lasalle-eg.net)',
  },
  matieres: {
    arabe: { name: 'Arabic', blurb: 'Grammar, rhetoric, literature and writing.', alt: 'Illustration: an open book with Arabic calligraphy above it' },
    francais: { name: 'French', blurb: 'Language, reading and French-language literature.', alt: 'Illustration: an open book and the letter F' },
    anglais: { name: 'English', blurb: 'Understanding and expressing oneself in English.', alt: 'Illustration: an open book and the letter A' },
    espagnol: { name: 'Spanish', blurb: 'Additional modern language.', alt: 'Illustration: an open book and the letter Ñ' },
    mathematiques: { name: 'Mathematics', blurb: 'Analysis, algebra, geometry and reasoning.', alt: 'Illustration: axes, a parabola and a triangle' },
    'physique-chimie': { name: 'Physics and chemistry', blurb: 'Electricity, mechanics, reactions and matter.', alt: 'Illustration: an atom and a flask' },
    svt: { name: 'Life and earth sciences', blurb: 'Biology, geology and the environment.', alt: 'Illustration: a leaf and its veins' },
    informatique: { name: 'Computer science', blurb: 'Algorithms, programming and digital skills.', alt: 'Illustration: a screen showing code' },
    ses: { name: 'Economics and social sciences', blurb: 'Economics, sociology and political science.', alt: 'Illustration: a bar chart and a coin' },
    'histoire-geographie': { name: 'History and geography', blurb: 'The world, its territories and its history.', alt: 'Illustration: a globe and a columned temple' },
    philosophie: { name: 'Philosophy', blurb: 'Reflection, argument and logic.', alt: 'Illustration: a lit light bulb' },
    psychologie: { name: 'Psychology and sociology', blurb: 'Understanding the person and society.', alt: 'Illustration: a head in profile and a magnifying glass' },
    humanites: { name: 'Humanities, literature and philosophy', blurb: 'Great texts and questions of culture.', alt: 'Illustration: a scroll' },
    'education-civique': { name: 'Civic education', blurb: 'Rights, duties and life in society.', alt: 'Illustration: the scales of justice' },
    'education-religieuse': { name: 'Religious education', blurb: 'Religious values and culture.', alt: 'Illustration: a crescent, a star and a cross' },
    eps: { name: 'Physical education and sport', blurb: 'Sport, health and team spirit.', alt: 'Illustration: a basketball' },
    arts: { name: 'Art', blurb: 'Visual arts and artistic expression.', alt: 'Illustration: a painter’s palette' },
  },
  matiereGroups: {
    Langues: 'Languages',
    Sciences: 'Sciences',
    'Lettres et sciences humaines': 'Humanities and social sciences',
    'Éducation et culture': 'Education and culture',
  },
};
