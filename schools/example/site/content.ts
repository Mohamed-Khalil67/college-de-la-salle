import { MATIERES_AR, MATIERES_EN, MATIERES_FR } from '../../../apps/web/src/app/school/matieres-text';
import type { SchoolContent } from '../../../apps/web/src/app/school/school-content';

/*
 * PLACEHOLDER content of the fictional École Exemple, in French (the source), English and Arabic. Every text is made
 * up. English and Arabic are machine-drafted: a real school has them reviewed (docs/i18n.md). The facts that are not
 * words (years, photos, links, counts) are identical in the three languages; the web unit tests check it.
 */

const LINK = 'https://example.org/';

export const CONTENT_FR: SchoolContent = {
  school: {
    place: 'Quartier des Tilleuls, Villeneuve, depuis 1950',
    tagline: 'Une école fictive pour essayer la plateforme.',
    address: '1 rue de l’Exemple, Villeneuve',
  },
  keyFigures: [
    { value: '1950', label: 'Fondation (fictive)' },
    { value: '600', label: 'élèves (chiffre inventé)' },
    { value: '2', label: 'filières de démonstration' },
  ],
  milestones: [
    { year: '1950', title: 'Ouverture de l’école', text: 'Texte de démonstration : l’école ouvre ses portes.', photo: 'campus', source: 'Texte de démonstration' },
    { year: '1975', title: 'Un deuxième bâtiment', text: 'Texte de démonstration : un nouveau bâtiment accueille les classes.', photo: null, source: 'Texte de démonstration' },
    { year: '2000', title: 'Une nouvelle entrée', text: 'Texte de démonstration : l’entrée de l’école est rénovée.', photo: 'entree', source: 'Texte de démonstration' },
    { year: '2020', title: 'La plateforme numérique', text: 'Texte de démonstration : l’école utilise la plateforme.', photo: null, source: 'Texte de démonstration' },
  ],
  historyIntro: [
    'Texte de démonstration : l’École Exemple n’existe pas. Elle sert à vérifier qu’un second établissement se construit, se prérend et s’utilise sans changer le code.',
    'Remplacez ces textes par ceux de votre établissement (docs/new-school.md).',
  ],
  founder: {
    name: 'Une fondatrice fictive',
    dates: '1900 – 1980',
    role: 'fondatrice de l’École Exemple (personnage inventé)',
    facts: [
      { date: '1900', text: 'Naissance (fictive).' },
      { date: '1950', text: 'Fondation de l’école.' },
    ],
    summary: ['Texte de démonstration sur la personne qui a fondé l’établissement.'],
  },
  freres: [
    {
      id: 'reseau',
      title: 'Le réseau de l’école',
      paragraphs: ['Texte de démonstration : présentez ici le réseau ou la fédération auxquels l’établissement appartient.'],
      items: [],
    },
  ],
  directors: {
    roles: { coordinator: 'Coordinatrice', 'coordinator-then-director': 'Coordinatrice, puis directrice' },
    and: 'et',
    today: 'aujourd’hui',
  },
  contactLabels: { standard: 'Standard', generale: 'Filière générale', internationale: 'Filière internationale' },
  links: [{ label: 'Site de démonstration', url: LINK, note: 'Une adresse réservée aux exemples.' }],
  sections: {
    nationale: {
      slug: 'nationale',
      title: 'Filière générale',
      kicker: 'Programme de démonstration',
      intro: 'Texte de démonstration : décrivez ici la première filière de l’établissement, ses programmes et ses examens.',
      photo: 'classe',
      facts: [
        { value: '3', label: 'cycles (inventés)' },
        { value: '300', label: 'élèves (chiffre inventé)' },
      ],
      blocks: [
        { id: 'presentation', title: 'Présentation', paragraphs: ['Texte de démonstration sur la filière générale.'], items: [] },
        { id: 'inscription', title: 'Inscription', paragraphs: ['Texte de démonstration : expliquez comment s’inscrire.'], items: [] },
      ],
      links: [{ label: 'Informations d’inscription', url: LINK, note: 'Lien de démonstration.' }],
      counts: [],
      countsNote: '',
    },
    bac: {
      slug: 'bac',
      title: 'Filière internationale',
      kicker: 'Programme de démonstration',
      intro: 'Texte de démonstration : décrivez ici la seconde filière de l’établissement.',
      photo: 'entree',
      facts: [
        { value: '2000', label: 'ouverture (inventée)' },
        { value: '300', label: 'élèves (chiffre inventé)' },
      ],
      blocks: [
        { id: 'presentation', title: 'Présentation', paragraphs: ['Texte de démonstration sur la filière internationale.'], items: [] },
        { id: 'inscription', title: 'Inscription', paragraphs: ['Texte de démonstration : expliquez comment s’inscrire.'], items: [] },
      ],
      links: [{ label: 'Informations d’inscription', url: LINK, note: 'Lien de démonstration.' }],
      counts: [],
      countsNote: '',
    },
  },
  tracks: {
    nationale: { kicker: 'Filière de démonstration', points: ['Premier point (inventé)', 'Deuxième point (inventé)', 'Troisième point (inventé)'] },
    bac: { kicker: 'Filière de démonstration', points: ['Premier point (inventé)', 'Deuxième point (inventé)', 'Troisième point (inventé)'] },
  },
  photos: {
    campus: { alt: 'Illustration : un bâtiment à toit rouge entouré d’arbres', caption: 'Le bâtiment principal (illustration).' },
    classe: { alt: 'Illustration : une salle de classe avec un tableau vert et trois tables', caption: 'Une salle de classe (illustration).' },
    entree: { alt: 'Illustration : l’entrée voûtée d’un bâtiment', caption: 'L’entrée de l’école (illustration).' },
  },
  photoCredits: { demo: 'Image de démonstration' },
  ...MATIERES_FR,
};

export const CONTENT_EN: SchoolContent = {
  school: {
    place: 'Quartier des Tilleuls, Villeneuve, since 1950',
    tagline: 'A fictional school for trying out the platform.',
    address: '1 Example Street, Villeneuve',
  },
  keyFigures: [
    { value: '1950', label: 'Founded (fictional)' },
    { value: '600', label: 'students (made-up figure)' },
    { value: '2', label: 'demonstration tracks' },
  ],
  milestones: [
    { year: '1950', title: 'The school opens', text: 'Demonstration text: the school opens its doors.', photo: 'campus', source: 'Demonstration text' },
    { year: '1975', title: 'A second building', text: 'Demonstration text: a new building welcomes the classes.', photo: null, source: 'Demonstration text' },
    { year: '2000', title: 'A new entrance', text: 'Demonstration text: the school entrance is renovated.', photo: 'entree', source: 'Demonstration text' },
    { year: '2020', title: 'The digital platform', text: 'Demonstration text: the school uses the platform.', photo: null, source: 'Demonstration text' },
  ],
  historyIntro: [
    'Demonstration text: École Exemple does not exist. It proves that a second school builds, prerenders and runs without code changes.',
    'Replace these texts with your school’s own (docs/new-school.md).',
  ],
  founder: {
    name: 'A fictional founder',
    dates: '1900 – 1980',
    role: 'founder of École Exemple (made-up person)',
    facts: [
      { date: '1900', text: 'Born (fictional).' },
      { date: '1950', text: 'Founds the school.' },
    ],
    summary: ['Demonstration text about the person who founded the school.'],
  },
  freres: [
    {
      id: 'reseau',
      title: 'The school’s network',
      paragraphs: ['Demonstration text: describe here the network or federation the school belongs to.'],
      items: [],
    },
  ],
  directors: {
    roles: { coordinator: 'Coordinator', 'coordinator-then-director': 'Coordinator, then director' },
    and: 'and',
    today: 'present',
  },
  contactLabels: { standard: 'Switchboard', generale: 'General track', internationale: 'International track' },
  links: [{ label: 'Demonstration website', url: LINK, note: 'An address reserved for examples.' }],
  sections: {
    nationale: {
      slug: 'nationale',
      title: 'General track',
      kicker: 'Demonstration programme',
      intro: 'Demonstration text: describe here the school’s first track, its programmes and its exams.',
      photo: 'classe',
      facts: [
        { value: '3', label: 'stages (made up)' },
        { value: '300', label: 'students (made-up figure)' },
      ],
      blocks: [
        { id: 'presentation', title: 'Overview', paragraphs: ['Demonstration text about the general track.'], items: [] },
        { id: 'inscription', title: 'Admissions', paragraphs: ['Demonstration text: explain how to apply.'], items: [] },
      ],
      links: [{ label: 'Admissions information', url: LINK, note: 'Demonstration link.' }],
      counts: [],
      countsNote: '',
    },
    bac: {
      slug: 'bac',
      title: 'International track',
      kicker: 'Demonstration programme',
      intro: 'Demonstration text: describe here the school’s second track.',
      photo: 'entree',
      facts: [
        { value: '2000', label: 'opened (made up)' },
        { value: '300', label: 'students (made-up figure)' },
      ],
      blocks: [
        { id: 'presentation', title: 'Overview', paragraphs: ['Demonstration text about the international track.'], items: [] },
        { id: 'inscription', title: 'Admissions', paragraphs: ['Demonstration text: explain how to apply.'], items: [] },
      ],
      links: [{ label: 'Admissions information', url: LINK, note: 'Demonstration link.' }],
      counts: [],
      countsNote: '',
    },
  },
  tracks: {
    nationale: { kicker: 'Demonstration track', points: ['First point (made up)', 'Second point (made up)', 'Third point (made up)'] },
    bac: { kicker: 'Demonstration track', points: ['First point (made up)', 'Second point (made up)', 'Third point (made up)'] },
  },
  photos: {
    campus: { alt: 'Illustration: a red-roofed building surrounded by trees', caption: 'The main building (illustration).' },
    classe: { alt: 'Illustration: a classroom with a green board and three tables', caption: 'A classroom (illustration).' },
    entree: { alt: 'Illustration: the arched entrance of a building', caption: 'The school entrance (illustration).' },
  },
  photoCredits: { demo: 'Demonstration image' },
  ...MATIERES_EN,
};

export const CONTENT_AR: SchoolContent = {
  school: {
    place: 'حي الزيزفون، فيلنوف، منذ 1950',
    tagline: 'مدرسة وهمية لتجربة المنصة.',
    address: '1 شارع المثال، فيلنوف',
  },
  keyFigures: [
    { value: '1950', label: 'التأسيس (وهمي)' },
    { value: '600', label: 'طالب (رقم مختلق)' },
    { value: '2', label: 'مساران تجريبيان' },
  ],
  milestones: [
    { year: '1950', title: 'افتتاح المدرسة', text: 'نص تجريبي: تفتح المدرسة أبوابها.', photo: 'campus', source: 'نص تجريبي' },
    { year: '1975', title: 'مبنى ثانٍ', text: 'نص تجريبي: مبنى جديد يستقبل الفصول.', photo: null, source: 'نص تجريبي' },
    { year: '2000', title: 'مدخل جديد', text: 'نص تجريبي: تجديد مدخل المدرسة.', photo: 'entree', source: 'نص تجريبي' },
    { year: '2020', title: 'المنصة الرقمية', text: 'نص تجريبي: تستخدم المدرسة المنصة.', photo: null, source: 'نص تجريبي' },
  ],
  historyIntro: [
    'نص تجريبي: مدرسة المثال غير موجودة. تُستخدم للتحقق من أن مدرسة ثانية تُبنى وتعمل دون تغيير الشيفرة.',
    'استبدلوا هذه النصوص بنصوص مدرستكم (docs/new-school.md).',
  ],
  founder: {
    name: 'مؤسِّسة وهمية',
    dates: '1900 – 1980',
    role: 'مؤسِّسة مدرسة المثال (شخصية مختلقة)',
    facts: [
      { date: '1900', text: 'الولادة (وهمية).' },
      { date: '1950', text: 'تأسيس المدرسة.' },
    ],
    summary: ['نص تجريبي عن الشخص الذي أسّس المدرسة.'],
  },
  freres: [
    {
      id: 'reseau',
      title: 'شبكة المدرسة',
      paragraphs: ['نص تجريبي: صِفوا هنا الشبكة أو الاتحاد الذي تنتمي إليه المدرسة.'],
      items: [],
    },
  ],
  directors: {
    roles: { coordinator: 'منسِّقة', 'coordinator-then-director': 'منسِّقة ثم مديرة' },
    and: 'و',
    today: 'حتى اليوم',
  },
  contactLabels: { standard: 'السنترال', generale: 'المسار العام', internationale: 'المسار الدولي' },
  links: [{ label: 'موقع تجريبي', url: LINK, note: 'عنوان مخصص للأمثلة.' }],
  sections: {
    nationale: {
      slug: 'nationale',
      title: 'المسار العام',
      kicker: 'برنامج تجريبي',
      intro: 'نص تجريبي: صِفوا هنا المسار الأول للمدرسة وبرامجه وامتحاناته.',
      photo: 'classe',
      facts: [
        { value: '3', label: 'مراحل (مختلقة)' },
        { value: '300', label: 'طالب (رقم مختلق)' },
      ],
      blocks: [
        { id: 'presentation', title: 'نظرة عامة', paragraphs: ['نص تجريبي عن المسار العام.'], items: [] },
        { id: 'inscription', title: 'التقديم', paragraphs: ['نص تجريبي: اشرحوا كيفية التقديم.'], items: [] },
      ],
      links: [{ label: 'معلومات التقديم', url: LINK, note: 'رابط تجريبي.' }],
      counts: [],
      countsNote: '',
    },
    bac: {
      slug: 'bac',
      title: 'المسار الدولي',
      kicker: 'برنامج تجريبي',
      intro: 'نص تجريبي: صِفوا هنا المسار الثاني للمدرسة.',
      photo: 'entree',
      facts: [
        { value: '2000', label: 'الافتتاح (مختلق)' },
        { value: '300', label: 'طالب (رقم مختلق)' },
      ],
      blocks: [
        { id: 'presentation', title: 'نظرة عامة', paragraphs: ['نص تجريبي عن المسار الدولي.'], items: [] },
        { id: 'inscription', title: 'التقديم', paragraphs: ['نص تجريبي: اشرحوا كيفية التقديم.'], items: [] },
      ],
      links: [{ label: 'معلومات التقديم', url: LINK, note: 'رابط تجريبي.' }],
      counts: [],
      countsNote: '',
    },
  },
  tracks: {
    nationale: { kicker: 'مسار تجريبي', points: ['النقطة الأولى (مختلقة)', 'النقطة الثانية (مختلقة)', 'النقطة الثالثة (مختلقة)'] },
    bac: { kicker: 'مسار تجريبي', points: ['النقطة الأولى (مختلقة)', 'النقطة الثانية (مختلقة)', 'النقطة الثالثة (مختلقة)'] },
  },
  photos: {
    campus: { alt: 'رسم: مبنى بسقف أحمر تحيط به الأشجار', caption: 'المبنى الرئيسي (رسم).' },
    classe: { alt: 'رسم: فصل دراسي بسبورة خضراء وثلاث طاولات', caption: 'فصل دراسي (رسم).' },
    entree: { alt: 'رسم: المدخل المقوّس لمبنى', caption: 'مدخل المدرسة (رسم).' },
  },
  photoCredits: { demo: 'صورة تجريبية' },
  ...MATIERES_AR,
};
