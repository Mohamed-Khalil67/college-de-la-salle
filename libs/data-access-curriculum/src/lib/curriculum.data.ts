/**
 * Static curriculum and school content, bundled so public pages prerender with no network calls.
 *
 * Editorial notes for the school:
 *  - The school history (`SCHOOL.history`) is an introductory draft written without official
 *    sources. Replace it with the administration's approved text, then set `historyIsDraft: false`.
 *  - `NEWS` items flagged `sample: true` and gallery images flagged `placeholder: true` are
 *    stand-ins; the pages label them as such until replaced.
 *  - Syllabus outlines follow the general Thanaweya Amma structure; have each subject's
 *    department check them against the Ministry of Education's current-year syllabus.
 */
import type { GalleryImage, NewsItem, SchoolProfile, Subject, Track } from './curriculum.model';

export const SCHOOL: SchoolProfile = {
  latinName: 'Collège de la Salle',
  arabicName: 'كوليج دي لا سال',
  section: 'القسم العربي — الثانوية العامة',
  tagline: 'تعليمٌ رصين، وانضباطٌ في التقويم، وعنايةٌ باللغة العربية.',
  historyIsDraft: true,
  history: [
    {
      id: 'origins',
      title: 'النشأة والرسالة',
      paragraphs: [
        'تنتمي المدرسة إلى شبكة مدارس «الفرير» (إخوة المدارس المسيحية) التي أسّسها القديس جان باتيست دي لا سال، وقد ارتبط اسمها في مصر بالتعليم المنضبط والتكوين المتكامل للطالب.',
        'تُقدِّم هذه الصفحة إطارًا تمهيديًّا لتاريخ المدرسة، تستكمله إدارة المدرسة بالتواريخ والمحطات والوثائق المعتمدة.',
      ],
    },
    {
      id: 'arabic-section',
      title: 'القسم العربي',
      paragraphs: [
        'يُعِدّ القسم العربي طلابه لامتحانات الثانوية العامة المصرية، مع عناية خاصة بالعربية لغةً وأدبًا، وبالعلوم والرياضيات بوصفها أساسًا للدراسة الجامعية.',
      ],
    },
    {
      id: 'today',
      title: 'المدرسة اليوم',
      paragraphs: [
        'تجمع المدرسة بين التقاليد التربوية والأدوات الحديثة، ومنها منصّة الاختبارات المؤقَّتة التي تتيح للطلاب التدرّب في ظروف تحاكي الامتحان الحقيقي.',
      ],
    },
  ],
};

export const TRACKS: readonly Track[] = [
  {
    id: 'literary',
    name: 'أدبي',
    description: 'تتقدّم فيها اللغة العربية والمواد الإنسانية.',
    subjects: ['arabic'],
  },
  {
    id: 'science',
    name: 'علمي علوم',
    description: 'للمتّجهين إلى الطب والصيدلة والعلوم.',
    subjects: ['arabic', 'physics', 'chemistry'],
  },
  {
    id: 'math',
    name: 'علمي رياضة',
    description: 'للمتّجهين إلى الهندسة والحاسبات والعلوم الرياضية.',
    subjects: ['arabic', 'physics', 'chemistry', 'mathematics'],
  },
];

const ARABIC_HISTORY_IN_EGYPT = {
  id: 'arabic-in-egypt',
  title: 'تاريخ اللغة العربية في مصر',
  paragraphs: [
    'دخلت العربية مصر مع الفتح الإسلامي في القرن السابع الميلادي، ثم صارت تدريجيًّا لغة الإدارة والعلم والحياة اليومية، حتى غدت مصر من أهم مراكز الثقافة العربية.',
    'أسهم الجامع الأزهر منذ تأسيسه في القرن العاشر الميلادي في حفظ علوم العربية وتدريسها، وتخرّج فيه أجيال من العلماء والأدباء.',
    'وفي العصر الحديث قادت مصر حركة إحياء أدبي ولغوي واسعة، من الترجمة والصحافة إلى الشعر والرواية، وأُسِّس مجمع اللغة العربية بالقاهرة سنة ١٩٣٢م لخدمة العربية ومواكبتها للعصر.',
  ],
  milestones: [
    { period: 'القرن السابع الميلادي', text: 'الفتح الإسلامي لمصر وبداية انتشار العربية.' },
    { period: 'القرن العاشر الميلادي', text: 'تأسيس الجامع الأزهر، منارة علوم العربية والدين.' },
    { period: 'القرن التاسع عشر', text: 'نهضة الترجمة والطباعة والصحافة، ومدرسة الألسن.' },
    { period: '١٩٣٢م', text: 'إنشاء مجمع اللغة العربية بالقاهرة.' },
    { period: '١٩٨٨م', text: 'نجيب محفوظ أول أديب عربي يفوز بجائزة نوبل في الأدب.' },
  ],
} as const;

export const SUBJECTS: readonly Subject[] = [
  {
    id: 'arabic',
    name: 'اللغة العربية',
    tagline: 'النحو والبلاغة والأدب: لغةٌ تُفهَم وتُتذوَّق.',
    tracks: ['literary', 'science', 'math'],
    overview:
      'مادة مشتركة بين جميع الشُّعب، تبني قدرة الطالب على الفهم الدقيق، والتحليل البلاغي، والتعبير السليم، وتعرّفه بأعلام الأدب العربي ومذاهبه.',
    branches: [
      { id: 'nahw', name: 'النحو', summary: 'الإعراب وأحكام الجملة والأساليب النحوية.' },
      { id: 'balagha', name: 'البلاغة', summary: 'علم البيان والمعاني والبديع، وتذوّق الصورة الأدبية.' },
      { id: 'adab', name: 'الأدب', summary: 'تاريخ الأدب ومدارسه الحديثة ونصوصه المختارة.' },
    ],
    syllabus: [
      {
        id: 'nahw-unit',
        title: 'النحو',
        summary: 'مراجعة منظّمة لأبواب النحو المقرّرة مع التطبيق على النصوص.',
        objectives: ['يُعرِب الجمل المقرّرة إعرابًا صحيحًا.', 'يُميِّز الأساليب النحوية ودلالاتها.'],
        children: [
          { id: 'nahw-styles', title: 'الأساليب النحوية', summary: 'التعجّب والمدح والذم والاختصاص والإغراء والتحذير.', objectives: [], children: [] },
          { id: 'nahw-numbers', title: 'العدد', summary: 'تذكير العدد وتأنيثه وتمييزه وإعرابه.', objectives: [], children: [] },
        ],
      },
      {
        id: 'balagha-unit',
        title: 'البلاغة',
        summary: 'من التشبيه والاستعارة والكناية إلى المحسّنات البديعية.',
        objectives: ['يستخرج الصور البيانية ويُبيِّن أثرها.', 'يُفرِّق بين الخبر والإنشاء وأغراضهما.'],
        children: [],
      },
      {
        id: 'adab-unit',
        title: 'الأدب والنصوص',
        summary: 'مدارس الشعر الحديث، والمقال والقصة، ونصوص مختارة للدراسة والحفظ.',
        objectives: ['يُحدِّد خصائص المدرسة الأدبية للنص.', 'يُحلِّل النص فكرةً وأسلوبًا.'],
        children: [],
      },
    ],
    objectives: [
      'قراءة النص العربي قراءة صحيحة مضبوطة.',
      'التحليل البلاغي والنقدي للنصوص.',
      'الكتابة الوظيفية والإبداعية بلغة سليمة.',
    ],
    contextModules: [ARABIC_HISTORY_IN_EGYPT],
    studyGuides: [
      { id: 'i3rab', title: 'دليل الإعراب خطوة بخطوة', description: 'طريقة منهجية لإعراب الجملة وتجنّب الأخطاء الشائعة.' },
      { id: 'balagha-map', title: 'خريطة البلاغة', description: 'أنواع الصور البيانية والمحسّنات مع أمثلة من المقرّر.' },
    ],
    notation: null,
  },
  {
    id: 'physics',
    name: 'الفيزياء',
    tagline: 'من الكهربية إلى الفيزياء الحديثة.',
    tracks: ['science', 'math'],
    overview:
      'تدرس الكهربية والمغناطيسية والحث الكهرومغناطيسي ودوائر التيار المتردد، ثم مدخلًا إلى الفيزياء الحديثة.',
    branches: [
      { id: 'electricity', name: 'الكهربية والمغناطيسية', summary: 'التيار وقانون أوم، والتأثير المغناطيسي للتيار، والحث.' },
      { id: 'modern', name: 'الفيزياء الحديثة', summary: 'ازدواجية الموجة والجسيم، والأطياف الذرية، والليزر، والإلكترونيات.' },
    ],
    syllabus: [
      { id: 'current', title: 'التيار الكهربي وقانون أوم', summary: 'شدة التيار والمقاومة وتوصيل المقاومات وقانونا كيرشوف.', objectives: ['يحلّ دوائر التوصيل على التوالي والتوازي.'], children: [] },
      { id: 'magnetism', title: 'التأثير المغناطيسي للتيار', summary: 'المجال المغناطيسي حول الموصلات وأجهزة القياس.', objectives: [], children: [] },
      { id: 'induction', title: 'الحث الكهرومغناطيسي', summary: 'قانونا فاراداي ولنز، والمولّد والمحوّل.', objectives: [], children: [] },
      { id: 'modern-physics', title: 'الفيزياء الحديثة', summary: 'الكمّ الضوئي والأطياف الذرية والليزر.', objectives: [], children: [] },
    ],
    objectives: ['يطبّق القوانين الفيزيائية في حلّ المسائل.', 'يربط المفاهيم بالتطبيقات التكنولوجية.'],
    contextModules: [],
    studyGuides: [
      { id: 'units', title: 'جدول الوحدات والرموز', description: 'الكميات الفيزيائية ووحداتها الدولية ورموزها.' },
    ],
    notation: 'V = I R',
  },
  {
    id: 'chemistry',
    name: 'الكيمياء',
    tagline: 'العناصر والتفاعلات والكيمياء العضوية.',
    tracks: ['science', 'math'],
    overview:
      'تدرس العناصر الانتقالية، والتحليل الكيميائي، والاتزان الكيميائي، والكيمياء الكهربية، والكيمياء العضوية.',
    branches: [
      { id: 'inorganic', name: 'الكيمياء غير العضوية', summary: 'العناصر الانتقالية والتحليل الكيميائي.' },
      { id: 'physical', name: 'الكيمياء الفيزيائية', summary: 'الاتزان الكيميائي والكيمياء الكهربية.' },
      { id: 'organic', name: 'الكيمياء العضوية', summary: 'المركّبات العضوية وتفاعلاتها.' },
    ],
    syllabus: [
      { id: 'transition', title: 'العناصر الانتقالية', summary: 'خواص عناصر السلسلة الانتقالية الأولى واستخلاص الحديد.', objectives: [], children: [] },
      { id: 'analysis', title: 'التحليل الكيميائي', summary: 'الكشف عن الشقوق، والمعايرة، والتحليل الوزني.', objectives: [], children: [] },
      { id: 'equilibrium', title: 'الاتزان الكيميائي', summary: 'قانون فعل الكتلة، ومبدأ لوشاتلييه، والاتزان الأيوني.', objectives: [], children: [] },
      { id: 'electrochemistry', title: 'الكيمياء الكهربية', summary: 'الخلايا الجلفانية والإلكتروليتية.', objectives: [], children: [] },
      { id: 'organic-unit', title: 'الكيمياء العضوية', summary: 'الهيدروكربونات ومشتقّاتها.', objectives: [], children: [] },
    ],
    objectives: ['يكتب المعادلات الكيميائية الموزونة.', 'يحسب الكميات في التفاعلات والاتزان.'],
    contextModules: [],
    studyGuides: [
      { id: 'equations', title: 'بنك المعادلات', description: 'أهم المعادلات المقرّرة مصنّفة حسب الأبواب.' },
    ],
    notation: '2H₂ + O₂ → 2H₂O',
  },
  {
    id: 'mathematics',
    name: 'الرياضيات',
    tagline: 'التفاضل والتكامل والجبر والميكانيكا.',
    tracks: ['math'],
    overview:
      'مقرّرات شعبة علمي رياضة: التفاضل والتكامل، والجبر والهندسة الفراغية، والاستاتيكا والديناميكا.',
    branches: [
      { id: 'pure', name: 'الرياضيات البحتة', summary: 'التفاضل والتكامل، والجبر والهندسة الفراغية.' },
      { id: 'applied', name: 'الرياضيات التطبيقية', summary: 'الاستاتيكا والديناميكا.' },
    ],
    syllabus: [
      { id: 'calculus', title: 'التفاضل والتكامل', summary: 'الاشتقاق وتطبيقاته، والتكامل وحساب المساحات والحجوم.', objectives: [], children: [] },
      { id: 'algebra', title: 'الجبر والهندسة الفراغية', summary: 'التباديل والتوافيق، ونظرية ذات الحدّين، والأعداد المركّبة، والمتّجهات في الفراغ.', objectives: [], children: [] },
      { id: 'statics', title: 'الاستاتيكا', summary: 'الاحتكاك والعزوم والاتزان.', objectives: [], children: [] },
      { id: 'dynamics', title: 'الديناميكا', summary: 'قوانين نيوتن، والشغل والطاقة والقدرة.', objectives: [], children: [] },
    ],
    objectives: ['يُنمذِج المسائل رياضيًّا ويحلّها.', 'يبرهن ويستدلّ استدلالًا سليمًا.'],
    contextModules: [],
    studyGuides: [
      { id: 'formulas', title: 'ملخّص القوانين', description: 'قوانين التفاضل والتكامل والجبر في صفحة واحدة.' },
    ],
    notation: '∫ x dx = x²⁄2 + C',
  },
];

export const NEWS: readonly NewsItem[] = [
  {
    id: 'practice-platform',
    date: '2026-10-01',
    title: 'إطلاق منصّة الاختبارات التدريبية للقسم العربي',
    summary: 'يمكن للطلاب الآن التدرّب على اختبارات مؤقَّتة في العربية والفيزياء والكيمياء والرياضيات.',
    category: 'announcement',
    sample: true,
  },
  {
    id: 'arabic-week',
    date: '2026-09-20',
    title: 'أسبوع اللغة العربية',
    summary: 'مسابقات في الإلقاء والخطّ والكتابة الإبداعية لطلاب المرحلة الثانوية.',
    category: 'activity',
    sample: true,
  },
  {
    id: 'mock-exams',
    date: '2026-09-10',
    title: 'جدول الاختبارات التجريبية للفصل الأول',
    summary: 'تُعقَد الاختبارات التجريبية على المنصّة وفق جدول يُعلَن لكل شعبة.',
    category: 'academic',
    sample: true,
  },
];

const placeholder = (id: string, alt: string, caption: string): GalleryImage => ({
  id,
  src: `/images/gallery/${id}.svg`,
  width: 1200,
  height: 800,
  alt,
  caption,
  placeholder: true,
});

export const GALLERY: readonly GalleryImage[] = [
  placeholder('courtyard', 'رسم توضيحي لفناء مدرسي بأقواس وزخارف هندسية', 'الفناء'),
  placeholder('library', 'رسم توضيحي لمكتبة برفوف كتب وزخارف', 'المكتبة'),
  placeholder('lab', 'رسم توضيحي لمختبر علوم بأدوات زجاجية', 'المختبر'),
  placeholder('classroom', 'رسم توضيحي لفصل دراسي بسبّورة ومقاعد', 'الفصل'),
  placeholder('calligraphy', 'رسم توضيحي للوحة خطّ عربي', 'الخطّ العربي'),
  placeholder('ceremony', 'رسم توضيحي لحفل تكريم بزخارف ذهبية', 'حفل التكريم'),
];
