import { MATIERE_GROUPS, MATIERES } from '@cdls/shared';
import type { MatiereId, MatiereText, SchoolContent } from './school-content';

/**
 * The names, blurbs and picture descriptions of the platform's subject catalogue (`MATIERES` of @cdls/shared) in
 * each language, and the names of its groups. The catalogue is the platform's, not the school's, so these texts are
 * shared by every school pack. English and Arabic are MACHINE-DRAFTED from the French (docs/i18n.md).
 */
export type MatieresText = Pick<SchoolContent, 'matieres' | 'matiereGroups'>;

/** French: the catalogue itself. */
export const MATIERES_FR: MatieresText = {
  matieres: Object.fromEntries(MATIERES.map((m) => [m.id, { name: m.name, blurb: m.blurb, alt: m.alt }])) as Record<
    MatiereId,
    MatiereText
  >,
  matiereGroups: Object.fromEntries(MATIERE_GROUPS.map((g) => [g, g])) as SchoolContent['matiereGroups'],
};

/** English (machine-drafted). */
export const MATIERES_EN: MatieresText = {
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

/** Arabic (machine-drafted). */
export const MATIERES_AR: MatieresText = {
  matieres: {
    arabe: { name: 'اللغة العربية', blurb: 'النحو والبلاغة والأدب والتعبير الكتابي.', alt: 'رسم: كتاب مفتوح يعلوه خط عربي' },
    francais: { name: 'اللغة الفرنسية', blurb: 'اللغة والقراءة والأدب الناطق بالفرنسية.', alt: 'رسم: كتاب مفتوح وحرف F' },
    anglais: { name: 'اللغة الإنجليزية', blurb: 'الفهم والتعبير باللغة الإنجليزية.', alt: 'رسم: كتاب مفتوح وحرف A' },
    espagnol: { name: 'اللغة الإسبانية', blurb: 'لغة حية إضافية.', alt: 'رسم: كتاب مفتوح وحرف Ñ' },
    mathematiques: { name: 'الرياضيات', blurb: 'التحليل والجبر والهندسة والاستدلال.', alt: 'رسم: محاور وقطع مكافئ ومثلث' },
    'physique-chimie': { name: 'الفيزياء والكيمياء', blurb: 'الكهرباء والميكانيكا والتفاعلات والمادة.', alt: 'رسم: ذرة وقارورة' },
    svt: { name: 'علوم الحياة والأرض', blurb: 'الأحياء والجيولوجيا والبيئة.', alt: 'رسم: ورقة نبات وعروقها' },
    informatique: { name: 'الحاسب الآلي', blurb: 'الخوارزميات والبرمجة والمهارات الرقمية.', alt: 'رسم: شاشة تعرض شيفرة برمجية' },
    ses: { name: 'العلوم الاقتصادية والاجتماعية', blurb: 'الاقتصاد وعلم الاجتماع والعلوم السياسية.', alt: 'رسم: رسم بياني بالأعمدة وعملة معدنية' },
    'histoire-geographie': { name: 'التاريخ والجغرافيا', blurb: 'العالم وأقاليمه وتاريخه.', alt: 'رسم: كرة أرضية ومعبد ذو أعمدة' },
    philosophie: { name: 'الفلسفة', blurb: 'التفكير والحِجاج والمنطق.', alt: 'رسم: مصباح مضيء' },
    psychologie: { name: 'علم النفس والاجتماع', blurb: 'فهم الإنسان والمجتمع.', alt: 'رسم: رأس من الجانب وعدسة مكبرة' },
    humanites: { name: 'الإنسانيات والأدب والفلسفة', blurb: 'النصوص الكبرى وقضايا الثقافة.', alt: 'رسم: مخطوطة ملفوفة' },
    'education-civique': { name: 'التربية الوطنية', blurb: 'الحقوق والواجبات والحياة في المجتمع.', alt: 'رسم: ميزان العدالة' },
    'education-religieuse': { name: 'التربية الدينية', blurb: 'القيم والثقافة الدينية.', alt: 'رسم: هلال ونجمة وصليب' },
    eps: { name: 'التربية البدنية والرياضية', blurb: 'الرياضة والصحة وروح الفريق.', alt: 'رسم: كرة سلة' },
    arts: { name: 'الفنون', blurb: 'الفنون التشكيلية والتعبير الفني.', alt: 'رسم: لوحة ألوان رسام' },
  },
  matiereGroups: {
    Langues: 'اللغات',
    Sciences: 'العلوم',
    'Lettres et sciences humaines': 'الآداب والعلوم الإنسانية',
    'Éducation et culture': 'التربية والثقافة',
  },
};
