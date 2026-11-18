import type { SchoolMessages } from '../../../apps/web/src/app/i18n/messages';

/*
 * PLACEHOLDER words of the fictional École Exemple that name the school: descriptions, hero, history, the accessibility
 * statement. The shared words (sign-in, contact form, page chrome) are the platform's (apps/web/src/app/i18n/
 * messages-base.<lang>.ts). English and Arabic are machine-drafted: a real school has them reviewed (docs/i18n.md).
 */

export const MESSAGES_FR: SchoolMessages = {
  pageDescriptions: {
    home: 'École Exemple, école fictive de démonstration : filières, histoire, espace élève et espace enseignant.',
    history: 'Histoire (inventée) de l’École Exemple : texte de démonstration.',
    nationale: 'Filière générale de l’École Exemple : texte de démonstration.',
    bac: 'Filière internationale de l’École Exemple : texte de démonstration.',
    contact: 'Adresse, e-mail et numéros de téléphone (inventés) de l’École Exemple.',
    accessibility: 'Déclaration d’accessibilité du site de l’École Exemple (texte de démonstration).',
    login: 'Connexion à l’espace élève, à l’espace enseignant et à l’administration de l’École Exemple.',
  },
  layout: {
    footerAbout: 'Deux filières de démonstration, de la maternelle à la terminale.',
    copyright: (year) => `© ${year} École Exemple (établissement fictif).`,
    photoCredits: { before: 'Illustrations de démonstration', middle: ' – ', after: '.' },
  },
  motto: 'Texte de démonstration.',
  home: {
    heroTitle: 'Une école fictive pour essayer la plateforme',
    heroLead: 'Texte de démonstration : remplacez ces phrases par la présentation de votre établissement.',
    heroCredit: 'Illustration du bâtiment principal.',
    historyTitle: 'Une histoire inventée',
    historyLead: 'Texte de démonstration : quelques lignes sur l’histoire de l’établissement.',
    tracksTitle: 'Deux filières de démonstration',
    tracksLead: 'Texte de démonstration : ce qui rassemble les deux filières.',
    features: [
      { meta: 'Histoire, 1950', title: 'L’ouverture de l’école', text: 'Texte de démonstration sur la fondation.' },
      { meta: 'Filière internationale', title: 'Les inscriptions', text: 'Texte de démonstration sur l’inscription.' },
      { meta: 'Histoire, 2000', title: 'Une nouvelle entrée', text: 'Texte de démonstration sur la rénovation.' },
    ],
    contactLead: 'Texte de démonstration : écrivez au secrétariat ou appelez le service concerné.',
  },
  history: {
    anchors: { etapes: 'Les étapes', fondateur: 'La fondatrice', freres: 'Le réseau', directeurs: 'Les directions', archives: 'Les images' },
    stepsLead: 'Texte de démonstration : chaque date indique sa source.',
    directorsLead: 'Liste inventée des directions successives.',
    brothersTable: 'Premières directions',
    layTable: 'Directions récentes',
    archivesTitle: 'Images de l’école',
    archivesLead: { before: 'Illustrations de démonstration, créées pour cet exemple.', middle: ' – ', after: '.' },
  },
  contact: {
    registrationNationale: 'Filière générale : texte de démonstration sur l’inscription.',
    registrationNationaleLink: 'Informations d’inscription',
    registrationBac: 'Filière internationale : texte de démonstration sur l’inscription.',
  },
  contactTracks: { generale: 'Filière générale', internationale: 'Filière internationale' },
  login: {
    mottoMeaning: 'Texte de démonstration.',
    emailInvalid: 'Saisissez une adresse e-mail complète, par exemple prenom.nom@ecole-exemple.example.',
  },
  accessibility: {
    title: 'Déclaration d’accessibilité',
    lead: 'Texte de démonstration : chaque établissement rédige sa propre déclaration d’accessibilité. Celle-ci n’a aucune valeur.',
    updated: 'Texte de démonstration, sans date.',
    onThisPage: 'Sur cette page',
    summaryTitle: 'En bref',
    summary: [
      { label: 'État RGAA', value: 'Non évalué (établissement fictif)' },
      { label: 'Contact', value: 'secretariat@ecole-exemple.example' },
    ],
    sections: [
      {
        id: 'etat',
        title: 'État de conformité',
        paragraphs: [{ text: 'Texte de démonstration : indiquez ici l’état de conformité de votre site et la façon dont il a été évalué.' }],
      },
      {
        id: 'contact',
        title: 'Signaler un problème',
        paragraphs: [
          { text: 'Par e-mail, avec l’objet « Accessibilité » :', link: { label: 'secretariat@ecole-exemple.example', href: 'mailto:secretariat@ecole-exemple.example?subject=Accessibilit%C3%A9' } },
          { text: 'Ou par le formulaire de la page', link: { label: 'Contact', page: 'contact' } },
        ],
      },
    ],
  },
};

export const MESSAGES_EN: SchoolMessages = {
  pageDescriptions: {
    home: 'École Exemple, a fictional demonstration school: tracks, history, student space and teacher space.',
    history: 'Made-up history of École Exemple: demonstration text.',
    nationale: 'The general track at École Exemple: demonstration text.',
    bac: 'The international track at École Exemple: demonstration text.',
    contact: 'Address, e-mail and (made-up) phone numbers of École Exemple.',
    accessibility: 'Accessibility statement of the École Exemple website (demonstration text).',
    login: 'Sign in to the student space, the teacher space and the administration of École Exemple.',
  },
  layout: {
    footerAbout: 'Two demonstration tracks, from nursery to the final year.',
    copyright: (year) => `© ${year} École Exemple (fictional school).`,
    photoCredits: { before: 'Demonstration illustrations', middle: ' – ', after: '.' },
  },
  motto: 'Demonstration text.',
  home: {
    heroTitle: 'A fictional school for trying out the platform',
    heroLead: 'Demonstration text: replace these sentences with your school’s own introduction.',
    heroCredit: 'Illustration of the main building.',
    historyTitle: 'A made-up history',
    historyLead: 'Demonstration text: a few lines about the school’s history.',
    tracksTitle: 'Two demonstration tracks',
    tracksLead: 'Demonstration text: what the two tracks have in common.',
    features: [
      { meta: 'History, 1950', title: 'The school opens', text: 'Demonstration text about the founding.' },
      { meta: 'International track', title: 'Admissions', text: 'Demonstration text about applying.' },
      { meta: 'History, 2000', title: 'A new entrance', text: 'Demonstration text about the renovation.' },
    ],
    contactLead: 'Demonstration text: write to the school office or call the relevant department.',
  },
  history: {
    anchors: { etapes: 'Milestones', fondateur: 'The founder', freres: 'The network', directeurs: 'The directors', archives: 'The images' },
    stepsLead: 'Demonstration text: each date gives its source.',
    directorsLead: 'Made-up list of successive heads.',
    brothersTable: 'First directors',
    layTable: 'Recent directors',
    archivesTitle: 'Images of the school',
    archivesLead: { before: 'Demonstration illustrations, made for this example.', middle: ' – ', after: '.' },
  },
  contact: {
    registrationNationale: 'General track: demonstration text about admissions.',
    registrationNationaleLink: 'Admissions information',
    registrationBac: 'International track: demonstration text about admissions.',
  },
  contactTracks: { generale: 'General track', internationale: 'International track' },
  login: {
    mottoMeaning: 'Demonstration text.',
    emailInvalid: 'Enter a full e-mail address, for example firstname.lastname@ecole-exemple.example.',
  },
  accessibility: {
    title: 'Accessibility statement',
    lead: 'Demonstration text: every school writes its own accessibility statement. This one has no value.',
    updated: 'Demonstration text, undated.',
    onThisPage: 'On this page',
    summaryTitle: 'At a glance',
    summary: [
      { label: 'RGAA status', value: 'Not assessed (fictional school)' },
      { label: 'Contact', value: 'secretariat@ecole-exemple.example' },
    ],
    sections: [
      {
        id: 'etat',
        title: 'Compliance status',
        paragraphs: [{ text: 'Demonstration text: state here how compliant your website is and how it was assessed.' }],
      },
      {
        id: 'contact',
        title: 'Report a problem',
        paragraphs: [
          { text: 'By e-mail, with the subject “Accessibility”:', link: { label: 'secretariat@ecole-exemple.example', href: 'mailto:secretariat@ecole-exemple.example?subject=Accessibility' } },
          { text: 'Or with the form on the page', link: { label: 'Contact', page: 'contact' } },
        ],
      },
    ],
  },
};

export const MESSAGES_AR: SchoolMessages = {
  pageDescriptions: {
    home: 'مدرسة المثال، مدرسة وهمية للعرض: المسارات والتاريخ ومساحتا الطالب والمعلم.',
    history: 'تاريخ مختلق لمدرسة المثال: نص تجريبي.',
    nationale: 'المسار العام في مدرسة المثال: نص تجريبي.',
    bac: 'المسار الدولي في مدرسة المثال: نص تجريبي.',
    contact: 'عنوان مدرسة المثال وبريدها الإلكتروني وأرقام هواتفها (المختلقة).',
    accessibility: 'بيان إتاحة موقع مدرسة المثال (نص تجريبي).',
    login: 'تسجيل الدخول إلى مساحة الطالب ومساحة المعلم والإدارة في مدرسة المثال.',
  },
  layout: {
    footerAbout: 'مساران تجريبيان، من الروضة حتى السنة النهائية.',
    copyright: (year) => `© ${year} مدرسة المثال (مدرسة وهمية).`,
    photoCredits: { before: 'رسوم تجريبية', middle: ' – ', after: '.' },
  },
  motto: 'نص تجريبي.',
  home: {
    heroTitle: 'مدرسة وهمية لتجربة المنصة',
    heroLead: 'نص تجريبي: استبدلوا هذه الجمل بتعريف مدرستكم.',
    heroCredit: 'رسم للمبنى الرئيسي.',
    historyTitle: 'تاريخ مختلق',
    historyLead: 'نص تجريبي: بضعة أسطر عن تاريخ المدرسة.',
    tracksTitle: 'مساران تجريبيان',
    tracksLead: 'نص تجريبي: ما يجمع بين المسارين.',
    features: [
      { meta: 'التاريخ، 1950', title: 'افتتاح المدرسة', text: 'نص تجريبي عن التأسيس.' },
      { meta: 'المسار الدولي', title: 'التقديم', text: 'نص تجريبي عن التقديم.' },
      { meta: 'التاريخ، 2000', title: 'مدخل جديد', text: 'نص تجريبي عن التجديد.' },
    ],
    contactLead: 'نص تجريبي: راسلوا السكرتارية أو اتصلوا بالقسم المعني.',
  },
  history: {
    anchors: { etapes: 'المحطات', fondateur: 'المؤسِّسة', freres: 'الشبكة', directeurs: 'الإدارات', archives: 'الصور' },
    stepsLead: 'نص تجريبي: يُذكر مصدر كل تاريخ.',
    directorsLead: 'قائمة مختلقة بالإدارات المتعاقبة.',
    brothersTable: 'الإدارات الأولى',
    layTable: 'الإدارات الحديثة',
    archivesTitle: 'صور المدرسة',
    archivesLead: { before: 'رسوم تجريبية أُعدّت لهذا المثال.', middle: ' – ', after: '.' },
  },
  contact: {
    registrationNationale: 'المسار العام: نص تجريبي عن التقديم.',
    registrationNationaleLink: 'معلومات التقديم',
    registrationBac: 'المسار الدولي: نص تجريبي عن التقديم.',
  },
  contactTracks: { generale: 'المسار العام', internationale: 'المسار الدولي' },
  login: {
    mottoMeaning: 'نص تجريبي.',
    emailInvalid: 'اكتب بريدًا إلكترونيًا كاملًا، مثل firstname.lastname@ecole-exemple.example.',
  },
  accessibility: {
    title: 'بيان إتاحة الموقع',
    lead: 'نص تجريبي: تكتب كل مدرسة بيان الإتاحة الخاص بها. هذا البيان بلا قيمة.',
    updated: 'نص تجريبي بلا تاريخ.',
    onThisPage: 'في هذه الصفحة',
    summaryTitle: 'باختصار',
    summary: [
      { label: 'حالة RGAA', value: 'لم تُقيَّم (مدرسة وهمية)' },
      { label: 'التواصل', value: 'secretariat@ecole-exemple.example' },
    ],
    sections: [
      {
        id: 'etat',
        title: 'حالة المطابقة',
        paragraphs: [{ text: 'نص تجريبي: اذكروا هنا حالة مطابقة موقعكم وكيف جرى تقييمه.' }],
      },
      {
        id: 'contact',
        title: 'الإبلاغ عن مشكلة',
        paragraphs: [
          { text: 'بالبريد الإلكتروني، مع كتابة « الإتاحة » في الموضوع:', link: { label: 'secretariat@ecole-exemple.example', href: 'mailto:secretariat@ecole-exemple.example?subject=Accessibility' } },
          { text: 'أو عبر النموذج في صفحة', link: { label: 'اتصل بنا', page: 'contact' } },
        ],
      },
    ],
  },
};
