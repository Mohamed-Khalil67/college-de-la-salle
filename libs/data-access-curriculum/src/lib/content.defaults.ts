/**
 * Bundled default content: what every public page shows until a teacher edits it, and what the
 * prerender writes into the static HTML. Teacher edits (Firestore `content_pages`) replace a page
 * wholesale, so these defaults are also the safe fallback for a missing or corrupt document.
 *
 * Editorial notes for the school:
 *  - The dates in the school history come from the school administration's brief (founded 1898,
 *    campus 1905, chapel 1954–1958 inaugurated December 1958, merger with the Khoronfish secondary
 *    sections 1957). The surrounding wording is an introductory draft. The page says so until a
 *    teacher saves it.
 *  - Announcements are samples; the images are illustrations, not photographs.
 *  - Syllabus outlines are indicative: have each department check them against the Ministry's
 *    current-year syllabus.
 */
import type { ContentPage, PageId } from '@exam/contracts';

const empty = {
  summary: '',
  timeline: [],
  chapters: [],
  resources: [],
  announcements: [],
  updatedAt: null,
  updatedBy: null,
} as const;

const HOME: ContentPage = {
  ...empty,
  id: 'home',
  lang: 'ar',
  hero: {
    title: 'الثانوية العامة — القسم العربي',
    subtitle: 'مدرسة لاسالية عريقة، تأسّست في القاهرة عام ١٨٩٨',
    intro:
      'تعليمٌ رصين، وانضباطٌ في التقويم، وعنايةٌ باللغة العربية، مع اختباراتٍ تدريبيةٍ مؤقَّتةٍ تحاكي الامتحان الحقيقي.',
  },
  announcements: [
    {
      id: 'a1',
      date: '2026-10-01',
      title: 'إطلاق بنك الامتحانات التدريبية',
      body: 'يمكن للطلاب الآن التدرّب على اختبارات مؤقَّتة في اللغة العربية والرياضيات والفيزياء والكيمياء.',
    },
    {
      id: 'a2',
      date: '2026-09-20',
      title: 'أسبوع اللغة العربية',
      body: 'مسابقات في الإلقاء والخطّ والكتابة الإبداعية لطلاب المرحلة الثانوية.',
    },
    {
      id: 'a3',
      date: '2026-09-10',
      title: 'جدول الاختبارات التجريبية للفصل الأول',
      body: 'تُعقَد الاختبارات التجريبية على المنصّة وفق جدول يُعلَن لكل شعبة.',
    },
  ],
};

const HISTORY: ContentPage = {
  ...empty,
  id: 'history',
  lang: 'ar',
  hero: {
    title: 'عن المدرسة وتاريخها',
    subtitle: 'Histoire & Patrimoine',
    intro: 'محطاتٌ في مسيرة مدرسة كوليج دي لا سال بالظاهر منذ عام ١٨٩٨.',
  },
  summary:
    'تنتمي المدرسة إلى التقليد التربوي اللاسالي الفرنسي، وقد تأسّست في القاهرة عام ١٨٩٨ بحيّ الظاهر.\n\nويُعِدّ القسم العربي طلابه لامتحانات الثانوية العامة المصرية، مع عناية خاصة باللغة العربية وبالعلوم والرياضيات.',
  timeline: [
    {
      id: 'fondation',
      period: '١٨٩٨',
      sortYear: 1898,
      title: 'تأسيس المدرسة في الظاهر',
      text: 'تأسّست مدرسة كوليج دي لا سال في حيّ الظاهر بالقاهرة.',
    },
    {
      id: 'campus',
      period: '١٩٠٥',
      sortYear: 1905,
      title: 'افتتاح مبنى الظاهر',
      text: 'افتُتح مبنى المدرسة الشهير بالطوب الأحمر، على الطراز الكلاسيكي الجديد، وهو الأيقونة المعمارية للمدرسة.',
    },
    {
      id: 'chapelle',
      period: '١٩٥٤–١٩٥٨',
      sortYear: 1954,
      title: 'التوسعة وكنيسة دي لا سال',
      text: 'شهدت المدرسة توسعةً بين عامَي ١٩٥٤ و١٩٥٨، افتُتحت في ختامها كنيسة دي لا سال التاريخية في ديسمبر ١٩٥٨.',
    },
    {
      id: 'khoronfish',
      period: '١٩٥٧',
      sortYear: 1957,
      title: 'الاندماج مع أقسام خورنفش الثانوية',
      text: 'اندمجت المدرسة مع أقسام خورنفش الثانوية.',
    },
  ],
};

const ARABE: ContentPage = {
  ...empty,
  id: 'arabe',
  lang: 'ar',
  hero: {
    title: 'اللغة العربية',
    subtitle: 'النحو والبلاغة والأدب: لغةٌ تُفهَم وتُتذوَّق',
    intro:
      'مادة مشتركة بين جميع الشُّعب، تبني قدرة الطالب على الفهم الدقيق، والتحليل البلاغي، والتعبير السليم، وتعرّفه بأعلام الأدب العربي ومذاهبه.',
  },
  summary:
    'دخلت العربية مصر مع الفتح الإسلامي في القرن السابع الميلادي، ثم صارت تدريجيًّا لغة الإدارة والعلم والحياة اليومية، حتى غدت مصر من أهم مراكز الثقافة العربية.\n\nأسهم الجامع الأزهر منذ تأسيسه في القرن العاشر الميلادي في حفظ علوم العربية وتدريسها، وتخرّج فيه أجيال من العلماء والأدباء.\n\nوفي العصر الحديث قادت مصر حركة إحياء أدبي ولغوي واسعة، من الترجمة والصحافة إلى الشعر والرواية، وأُسِّس مجمع اللغة العربية بالقاهرة سنة ١٩٣٢م لخدمة العربية ومواكبتها للعصر.',
  timeline: [
    { id: 'h1', period: 'القرن السابع الميلادي', sortYear: 700, title: 'الفتح الإسلامي', text: 'الفتح الإسلامي لمصر وبداية انتشار العربية.' },
    { id: 'h2', period: 'القرن العاشر الميلادي', sortYear: 1000, title: 'الجامع الأزهر', text: 'تأسيس الجامع الأزهر، منارة علوم العربية والدين.' },
    { id: 'h3', period: 'القرن التاسع عشر', sortYear: 1800, title: 'النهضة الحديثة', text: 'نهضة الترجمة والطباعة والصحافة، ومدرسة الألسن.' },
    { id: 'h4', period: '١٩٣٢م', sortYear: 1932, title: 'مجمع اللغة العربية', text: 'إنشاء مجمع اللغة العربية بالقاهرة.' },
    { id: 'h5', period: '١٩٨٨م', sortYear: 1988, title: 'جائزة نوبل', text: 'نجيب محفوظ أول أديب عربي يفوز بجائزة نوبل في الأدب.' },
  ],
  chapters: [
    {
      id: 'nahw',
      title: 'النحو',
      summary: 'مراجعة منظّمة لأبواب النحو المقرّرة مع التطبيق على النصوص.',
      topics: ['الأساليب النحوية: التعجّب والمدح والذم والاختصاص والإغراء والتحذير', 'العدد: تذكيره وتأنيثه وتمييزه وإعرابه', 'الإعراب التطبيقي للجمل المقرّرة'],
    },
    {
      id: 'balagha',
      title: 'البلاغة',
      summary: 'من التشبيه والاستعارة والكناية إلى المحسّنات البديعية.',
      topics: ['علم البيان: التشبيه والاستعارة والمجاز والكناية', 'علم المعاني: الخبر والإنشاء وأغراضهما', 'علم البديع: الطباق والمقابلة والجناس والسجع'],
    },
    {
      id: 'adab',
      title: 'الأدب والنصوص',
      summary: 'مدارس الشعر الحديث، والمقال والقصة، ونصوص مختارة للدراسة والحفظ.',
      topics: ['مدارس الشعر الحديث: الإحياء والديوان وأبولو', 'المقال والقصة والمسرحية', 'تحليل النص فكرةً وأسلوبًا'],
    },
  ],
};

const MATHEMATIQUES: ContentPage = {
  ...empty,
  id: 'mathematiques',
  lang: 'fr',
  hero: {
    title: 'Mathématiques',
    subtitle: 'Thanaweya Amma — programme en français',
    intro:
      "Analyse, algèbre, géométrie dans l'espace et mécanique : un parcours progressif, avec des exercices types et des examens d'entraînement chronométrés.",
  },
  summary:
    "Le programme prépare à l'examen de la Thanaweya Amma (section scientifique, option mathématiques). Chaque chapitre ci-dessous renvoie à des fiches d'exercices et à des examens d'entraînement.",
  chapters: [
    {
      id: 'analyse',
      title: 'Analyse',
      summary: 'Dérivation, étude de fonctions et calcul intégral.',
      topics: ['Limites et continuité', 'Dérivées et applications', 'Primitives et intégrales : ∫ x dx = x²/2 + C', "Calcul d'aires et de volumes"],
    },
    {
      id: 'algebre',
      title: "Algèbre et géométrie dans l'espace",
      summary: 'Dénombrement, nombres complexes et vecteurs.',
      topics: ['Permutations, combinaisons, binôme de Newton', 'Nombres complexes', "Vecteurs, droites et plans dans l'espace"],
    },
    {
      id: 'statique',
      title: 'Statique',
      summary: "Équilibre d'un solide soumis à des forces.",
      topics: ['Frottement', 'Moments de forces', "Conditions d'équilibre"],
    },
    {
      id: 'dynamique',
      title: 'Dynamique',
      summary: 'Lois de Newton, travail et énergie.',
      topics: ['Lois de Newton', 'Travail, énergie et puissance', 'Quantité de mouvement'],
    },
  ],
};

const PHYSIQUE_CHIMIE: ContentPage = {
  ...empty,
  id: 'physique-chimie',
  lang: 'fr',
  hero: {
    title: 'Physique-Chimie',
    subtitle: 'Thanaweya Amma — programme en français',
    intro:
      "De l'électricité à la physique moderne, de l'équilibre chimique à la chimie organique : le programme, les formules clés et des examens d'entraînement.",
  },
  summary:
    "Le programme couvre l'électricité et le magnétisme, la physique moderne, puis la chimie générale, analytique, électrochimique et organique.",
  chapters: [
    {
      id: 'electricite',
      title: 'Électricité et magnétisme',
      summary: 'Courant, circuits et induction électromagnétique.',
      topics: ["Loi d'Ohm : V = I R", 'Lois de Kirchhoff', "Effet magnétique du courant", 'Induction électromagnétique : lois de Faraday et de Lenz'],
    },
    {
      id: 'moderne',
      title: 'Physique moderne',
      summary: "Dualité onde-corpuscule, spectres atomiques et laser.",
      topics: ['Effet photoélectrique', 'Spectres atomiques', 'Laser et électronique'],
    },
    {
      id: 'chimie-generale',
      title: 'Équilibre chimique',
      summary: "Loi d'action de masse et principe de Le Chatelier.",
      topics: ["Constante d'équilibre", 'Principe de Le Chatelier', 'Équilibres ioniques : acides et bases'],
    },
    {
      id: 'analytique',
      title: 'Chimie analytique et éléments de transition',
      summary: 'Analyse qualitative et quantitative, propriétés des métaux de transition.',
      topics: ['Identification des ions', 'Titrages', 'Équations équilibrées : 2H₂ + O₂ → 2H₂O', 'Éléments de transition'],
    },
    {
      id: 'electrochimie',
      title: 'Électrochimie',
      summary: 'Piles et électrolyse.',
      topics: ['Piles galvaniques', 'Cellules électrolytiques', 'Potentiels standard'],
    },
    {
      id: 'organique',
      title: 'Chimie organique',
      summary: 'Hydrocarbures et leurs dérivés.',
      topics: ['Hydrocarbures', 'Alcools, acides carboxyliques et esters', 'Réactions de substitution et d’addition'],
    },
  ],
};

/** All bundled pages, keyed by page id. */
export const DEFAULT_PAGES: Readonly<Record<PageId, ContentPage>> = {
  home: HOME,
  history: HISTORY,
  arabe: ARABE,
  mathematiques: MATHEMATIQUES,
  'physique-chimie': PHYSIQUE_CHIMIE,
};
