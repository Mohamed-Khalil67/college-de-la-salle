import { CONTACT_SUBJECTS, CONTACT_TRACKS } from '../school/contact-mail';
import type { SiteMessages } from './messages';

/** The interface in French: the source of messages.en.ts and messages.ar.ts. */
export const MESSAGES_FR: SiteMessages = {
  pages: {
    home: {
      title: '',
      description:
        'Collège de la Salle, Daher (Le Caire, fondé en 1898) : Bac nationale et Bac français. Histoire, patrimoine, matières, espace élève et espace enseignant.',
    },
    history: {
      title: 'Histoire & Patrimoine',
      description:
        'Histoire du Collège de la Salle à Daher depuis 1898 : le bâtiment en briques rouges, les nouveaux bâtiments de 1955, la chapelle de 1958, en photographies d’archives.',
    },
    nationale: {
      title: 'Bac nationale',
      description:
        'Bac nationale (Thanaweya Amma) au Collège de la Salle, Daher : programme du ministère égyptien, matières, espace élève et inscription.',
    },
    bac: {
      title: 'Bac français',
      description:
        'Bac français au Collège de la Salle, Daher : baccalauréat français, homologation AEFE, pédagogie, orientation, effectifs et inscription.',
    },
    contact: {
      title: 'Contact',
      description: 'Adresse, e-mail et numéros de téléphone du Collège de la Salle, Daher, par service et par cycle.',
    },
    accessibility: {
      title: 'Déclaration d’accessibilité',
      description:
        'Déclaration d’accessibilité du site du Collège de la Salle, Daher : ce que nous testons, les limites connues, comment nous signaler un problème.',
    },
    login: {
      title: 'Connexion',
      description: 'Connexion à l’espace élève, à l’espace enseignant et à l’administration du Collège de la Salle, Daher.',
    },
  },

  layout: {
    skipToContent: 'Aller au contenu',
    switchboard: 'Standard',
    menu: 'Menu',
    mainNav: 'Navigation principale',
    nav: { home: 'Accueil', history: 'Histoire', nationale: 'Bac nationale', bac: 'Bac français', contact: 'Contact' },
    signIn: 'Connexion',
    mySpace: 'Mon espace',
    languages: 'Langue du site',
    footerAbout: 'Bac nationale et Bac français, du jardin d’enfants à la Terminale.',
    footerCollege: 'Le collège',
    footerSpaces: 'Espaces',
    studentSpace: 'Espace élève',
    teacherSpace: 'Espace enseignant',
    administration: 'Administration',
    findUs: 'Nous trouver',
    copyright: (year) => `© ${year} Collège de la Salle, Daher. Frères des Écoles chrétiennes.`,
    photoCredits: {
      before: 'Photographies : archives lasalliennes (',
      middle: ') et collège (',
      after: '), avec l’accord du collège.',
    },
    accessibility: 'Accessibilité : non conforme',
  },

  common: {
    breadcrumb: 'Fil d’Ariane',
    home: 'Accueil',
    source: 'Source :',
    motto: '« Signum Fidei », signe de la foi : la devise des Frères des Écoles chrétiennes.',
    prepareRegistration: 'Préparer une inscription',
    colon: ' : ',
    showServerMessages: true,
  },

  home: {
    heroTitle: 'Un collège lasallien au cœur du Caire, depuis 1898',
    heroLead:
      'Du jardin d’enfants à la Terminale, 2 400 élèves préparent la Thanaweya Amma ou le baccalauréat français, dans un même projet éducatif.',
    heroHistory: 'Découvrir notre histoire',
    heroCredit: 'Le campus de Daher vu du ciel.',
    audienceTitle: 'Vous êtes…',
    audiences: [
      {
        id: 'family',
        title: 'Futur élève ou famille',
        text: 'Les deux filières, les inscriptions et le secrétariat à contacter.',
        page: 'contact',
      },
      {
        id: 'student',
        title: 'Élève du collège',
        text: 'Vos notes, devoirs, emploi du temps et bulletins, dans l’espace élève.',
        page: 'login',
      },
      {
        id: 'teacher',
        title: 'Enseignant',
        text: 'L’appel, la saisie des notes, les devoirs et votre emploi du temps.',
        page: 'login',
      },
    ],
    historyTitle: 'Plus d’un siècle à Daher',
    historyLead:
      'Fondé par les Frères des Écoles chrétiennes, l’institut créé par saint Jean-Baptiste de La Salle, le collège appartient au réseau lasallien d’Égypte et à ses 900 établissements dans le monde.',
    historyLink: 'Lire l’histoire du collège',
    tracksTitle: 'Deux baccalauréats, un même projet éducatif',
    tracksLead: 'Les deux filières partagent les mêmes valeurs lasalliennes, la même cour et la même exigence.',
    discoverTrack: (track) => `Découvrir le ${track}`,
    featuresTitle: 'À découvrir',
    features: [
      {
        meta: 'Histoire, 1958',
        title: 'La chapelle De La Salle, inaugurée en décembre 1958',
        text: 'Près de quatre ans de travaux, de 1954 à 1958, pour la chapelle du collège et sa coupole.',
      },
      {
        meta: 'Bac français',
        title: 'Les inscriptions au Bac français se font en ligne',
        text: 'Un formulaire pour la préparation au Bac et un autre pour le Bac, sur le site de la section.',
      },
      {
        meta: 'Archives, avril 1926',
        title: 'Les Frères d’Égypte réunis à Daher',
        text: 'Près de 190 Frères venus de toutes les écoles du pays se retrouvent au collège pour leur retraite annuelle.',
      },
    ],
    contactTitle: 'Inscriptions et contact',
    contactLead:
      'Les ouvertures d’inscription et la liste des pièces à fournir sont publiées par le collège. Écrivez au secrétariat ou appelez directement le cycle concerné.',
    allNumbers: 'Tous les numéros par service',
  },

  history: {
    title: 'Histoire et patrimoine',
    onThisPage: 'Sur cette page',
    anchors: {
      etapes: 'Les grandes étapes',
      fondateur: 'Le fondateur',
      freres: 'Les Frères en Égypte',
      directeurs: 'Les directeurs',
      archives: 'Les archives',
    },
    atAGlance: 'Le collège en bref',
    stepsTitle: 'Les grandes étapes',
    stepsLead:
      'Chaque date indique sa source : l’administration du collège, son site officiel ou les archives lasalliennes. Quand elles diffèrent, la page donne les deux.',
    keyDates: 'Dates clés',
    directorsTitle: 'Ceux qui ont dirigé le collège',
    directorsLead: 'Liste publiée sur le site officiel du collège, depuis l’inauguration de 1905.',
    brothersTable: 'Frères directeurs et coordinateurs',
    layTable: 'Directeurs laïcs',
    name: 'Nom',
    period: 'Période',
    archivesTitle: 'Archives photographiques',
    archivesLead: {
      before: 'Photographies des archives des Frères des Écoles chrétiennes, Proche-Orient (',
      middle: '), et de l’album d’archives du collège (',
      after: ').',
    },
  },

  section: {
    atAGlance: (track) => `${track} en bref`,
    headcount: 'Effectifs',
    cycle: 'Cycle',
    level: 'Niveau',
    students: 'Élèves',
    total: 'Total',
    practical: 'Informations pratiques',
    office: 'Secrétariat',
    writeToOffice: 'Écrire au secrétariat',
    landmarks: 'Repères',
    collegeHistory: 'L’histoire du collège',
    usefulLinks: 'Liens utiles',
    subjectsTitle: 'Les matières',
    subjectsLead: {
      before:
        'Les matières que les enseignants publient dans l’espace de leur classe : devoirs, ressources et notes. Les élèves retrouvent celles de leur classe en se connectant à l’',
      link: 'espace élève',
      after: '.',
    },
  },

  contact: {
    title: 'Contact et inscriptions',
    lead: 'Une question sur la scolarité ou une demande d’inscription ? Écrivez au secrétariat ou appelez directement le cycle concerné.',
    details: 'Coordonnées',
    office: 'Secrétariat',
    seeOnMap: 'Voir sur la carte',
    phonesTitle: 'Téléphones par service',
    registrationTitle: 'Inscriptions',
    registrationNationale:
      'Bac nationale : les ouvertures d’inscription, la liste des pièces à fournir et le formulaire de demande sont publiés en arabe sur le site officiel du collège.',
    registrationNationaleLink: 'Voir les annonces sur lasalle-eg.net',
    registrationBac: 'Bac français : les demandes se font en ligne, sur le site de la section.',
    sitesTitle: 'Sites du collège',
  },

  contactForm: {
    title: 'Écrire au secrétariat',
    sent: { before: 'Merci, votre message a bien été envoyé au secrétariat. La réponse vous parviendra à', after: '.' },
    notSent: 'Votre message n’a pas pu être envoyé pour le moment.',
    sendFromMail: 'Envoyer depuis ma messagerie',
    orWriteTo: 'ou écrivez à',
    name: 'Nom du parent ou de l’élève',
    phone: 'Téléphone (facultatif)',
    email: 'Adresse e-mail',
    emailHelp: 'Pour que le secrétariat puisse vous répondre.',
    subject: 'Objet',
    subjects: CONTACT_SUBJECTS,
    track: 'Filière et classe',
    trackNone: 'Non précisée',
    tracks: CONTACT_TRACKS,
    trap: 'Site web',
    message: 'Message',
    messageHelp: '1 000 caractères au plus.',
    note: 'Le secrétariat du collège lit chaque message et vous répond par e-mail.',
    send: 'Envoyer le message',
    sending: 'Envoi en cours…',
    errors: {
      nameRequired: 'Saisissez votre nom.',
      emailRequired: 'Saisissez votre adresse e-mail.',
      emailInvalid: 'Saisissez une adresse complète, par exemple nom@domaine.com.',
      messageRequired: 'Écrivez votre message.',
      messageTooLong: 'Raccourcissez le message à 1 000 caractères au plus.',
      nameTooLong: 'Raccourcissez le nom à 120 caractères au plus.',
      phoneTooLong: 'Saisissez un seul numéro de téléphone.',
    },
  },

  login: {
    skip: 'Aller au formulaire de connexion',
    college: 'Le collège',
    mottoMeaning: 'Signe de la foi : la devise des Frères des Écoles chrétiennes, fondateurs du collège.',
    title: 'Connexion à votre espace',
    lead: 'Élèves, enseignants et administration du collège.',
    spacesLanguage: null,
    identifier: 'Identifiant',
    identifierHelp: 'L’adresse e-mail fournie par le collège.',
    password: 'Mot de passe',
    show: 'Afficher',
    hide: 'Masquer',
    thePassword: ' le mot de passe',
    forgot: 'Mot de passe oublié ?',
    submit: 'Se connecter',
    submitting: 'Connexion…',
    noEmail: 'Pas d’e-mail reçu ? Le secrétariat de votre cycle peut réinitialiser votre mot de passe.',
    noSignUp: 'Les comptes sont créés par le collège : il n’y a pas d’inscription en ligne.',
    backToSite: 'Retour au site du collège',
    errors: {
      emailRequired: 'Saisissez votre adresse e-mail.',
      emailInvalid: 'Saisissez une adresse e-mail complète, par exemple prenom.nom@lasalle-daher.eg.',
      passwordRequired: 'Saisissez votre mot de passe.',
      wrongCredentials:
        'Identifiant ou mot de passe incorrect. Vérifiez la saisie ou contactez le secrétariat de votre cycle.',
      tooManyAttempts: 'Trop de tentatives. Patientez une minute avant de réessayer.',
      other: 'La connexion n’a pas abouti. Réessayez dans un instant.',
    },
  },

  accessibility: {
    title: 'Déclaration d’accessibilité',
    lead:
      'Le Collège de la Salle veut que chacun, élève, famille ou enseignant, puisse utiliser ce site, quel que soit son handicap ou sa façon de naviguer. Cette déclaration suit le modèle du Référentiel général d’amélioration de l’accessibilité (RGAA 4.1) et dit honnêtement où nous en sommes.',
    updated: 'Déclaration établie le 23 octobre 2026. Elle est mise à jour à chaque version du site.',
    onThisPage: 'Sur cette page',
    summaryTitle: 'En bref',
    summary: [
      { label: 'État RGAA', value: 'Non conforme : pas encore audité' },
      { label: 'Nos tests', value: 'Aucune erreur Axe, sur chaque page, en 3 langues et 2 largeurs d’écran' },
      { label: 'Limite principale', value: 'Les bulletins PDF ne sont pas balisés ; une version web accessible existe' },
      { label: 'Contact', value: 'delasalle@lasalle-eg.net' },
    ],
    sections: [
      {
        id: 'etat',
        title: 'État de conformité',
        paragraphs: [
          {
            text: 'Le site du Collège de la Salle, Daher, n’a pas encore fait l’objet d’un audit de conformité RGAA par un organisme indépendant. Tant que cet audit n’a pas eu lieu, le RGAA demande de déclarer le site « non conforme » : c’est donc son état officiel, même si nos propres tests ne relèvent aucune erreur.',
          },
          {
            text: 'Le collège est un établissement privé égyptien : le RGAA, obligatoire pour les services publics français, s’applique ici volontairement. Nous visons le niveau AA des règles internationales WCAG 2.2.',
          },
        ],
      },
      {
        id: 'tests',
        title: 'Ce que nous testons, à chaque version',
        paragraphs: [{ text: 'Ces vérifications sont automatisées et refaites avant chaque mise en ligne :' }],
        items: [
          'Axe (axe-core 4.14), règles WCAG 2.0, 2.1 et 2.2 niveaux A et AA et bonnes pratiques : aucune erreur sur chaque page publique, en français, en anglais et en arabe, et sur chaque écran des espaces élève, enseignant et administration.',
          'Deux largeurs d’écran pour chaque page : 390 pixels (téléphone) et 1 440 pixels (ordinateur).',
          'Clavier : chaque lien, bouton et champ s’atteint avec la touche Tab, le focus reste visible, le lien « Aller au contenu » mène au contenu, la touche Échap ferme les menus et les fenêtres.',
          'Contrastes : les couleurs du site sont choisies pour un rapport d’au moins 4,5:1 pour le texte (l’or n’est jamais du texte sur fond clair).',
          'Langue : chaque page déclare sa langue ; la version arabe s’affiche de droite à gauche.',
        ],
      },
      {
        id: 'limites',
        title: 'Limites connues',
        paragraphs: [
          {
            text: 'Les tests automatiques ne trouvent qu’une partie des problèmes. Nous n’avons pas encore fait tester le site avec des lecteurs d’écran (NVDA, VoiceOver, TalkBack) par des personnes qui les utilisent au quotidien. Voici ce que nous savons ne pas encore être accessible :',
          },
        ],
        items: [
          'Bulletins en PDF : le fichier téléchargé depuis l’espace élève n’est pas balisé (pas de structure de titres ni de tableaux, langue non déclarée). Son texte est réel et peut être lu, mais l’ordre de lecture n’est pas garanti. Le même bulletin s’affiche en page web accessible dans l’espace élève, et peut s’imprimer depuis cette page.',
          'Versions anglaise et arabe : la traduction est une première version qui doit encore être relue par le collège. Les noms de classes du Bac français (Seconde, Terminale…) restent en français.',
          'Espaces élève, enseignant et administration : ils n’existent qu’en français. Certains messages d’erreur du serveur s’affichent en français.',
          'Sites liés : le site officiel du collège (lasalle-eg.net), celui de la section Bac (bacdelasalle.com) et leurs formulaires d’inscription ne dépendent pas de ce site et ne sont pas couverts par cette déclaration.',
          'Photographies d’archives : leurs descriptions sont rédigées par nous à partir des légendes des archives et peuvent être imprécises.',
        ],
      },
      {
        id: 'environnement',
        title: 'Environnement de test',
        paragraphs: [
          {
            text: 'Tests réalisés avec Playwright 1.64 dans Chromium (profils ordinateur et téléphone), axe-core 4.14. Technologies utilisées par le site : HTML5, CSS, JavaScript (Angular), WAI-ARIA.',
          },
        ],
      },
      {
        id: 'contact',
        title: 'Signaler un problème',
        paragraphs: [
          {
            text: 'Si vous ne pouvez pas accéder à un contenu ou à un service, écrivez-nous en décrivant la page et le problème : nous vous répondrons par e-mail et vous donnerons l’information sous une autre forme.',
          },
          { text: 'Par e-mail, avec l’objet « Accessibilité » :', link: { label: 'delasalle@lasalle-eg.net', href: 'mailto:delasalle@lasalle-eg.net?subject=Accessibilit%C3%A9' } },
          { text: 'Ou par le formulaire de la page', link: { label: 'Contact', page: 'contact' } },
        ],
      },
      {
        id: 'recours',
        title: 'Voies de recours',
        paragraphs: [
          {
            text: 'Si la réponse du secrétariat ne vous satisfait pas, écrivez au Frère Directeur du collège, à la même adresse ou au +20 2 2592 80 70. Vous recevrez une réponse personnelle.',
          },
          {
            text: 'Le recours au Défenseur des droits, prévu par le RGAA pour les services publics français, ne s’applique pas à un établissement égyptien. En Égypte, le Conseil national des personnes handicapées (National Council for Persons with Disabilities) reçoit les réclamations relatives aux droits des personnes handicapées.',
          },
        ],
      },
    ],
  },
};
