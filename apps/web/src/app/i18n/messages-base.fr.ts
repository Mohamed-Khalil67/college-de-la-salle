import { CONTACT_SUBJECTS } from '../school/contact-mail';
import type { BaseMessages } from './messages';

/**
 * The interface in French that every school shares: the platform's own words (sign-in, contact form, page chrome).
 * What names the school (descriptions, hero, history, accessibility statement…) is the pack's `messages.fr.ts`;
 * `composeMessages` joins the two. The site is French only (docs/i18n.md).
 */
export const BASE_FR: BaseMessages = {
  pageTitles: {
    home: '',
    history: 'Histoire & Patrimoine',
    nationale: '',
    bac: '',
    contact: 'Contact',
    accessibility: 'Déclaration d’accessibilité',
    login: 'Connexion',
  },

  layout: {
    skipToContent: 'Aller au contenu',
    switchboard: 'Standard',
    menu: 'Menu',
    mainNav: 'Navigation principale',
    nav: { home: 'Accueil', history: 'Histoire', contact: 'Contact' },
    signIn: 'Connexion',
    mySpace: 'Mon espace',
    footerCollege: 'Le collège',
    footerSpaces: 'Espaces',
    studentSpace: 'Espace élève',
    teacherSpace: 'Espace enseignant',
    administration: 'Administration',
    findUs: 'Nous trouver',
    accessibility: 'Accessibilité : non conforme',
  },

  common: {
    breadcrumb: 'Fil d’Ariane',
    home: 'Accueil',
    source: 'Source :',
    prepareRegistration: 'Préparer une inscription',
    colon: ' : ',
    showServerMessages: true,
  },

  home: {
    heroHistory: 'Découvrir notre histoire',
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
    historyLink: 'Lire l’histoire du collège',
    discoverTrack: (track) => `Découvrir le ${track}`,
    featuresTitle: 'À découvrir',
    contactTitle: 'Inscriptions et contact',
    allNumbers: 'Tous les numéros par service',
  },

  history: {
    title: 'Histoire et patrimoine',
    onThisPage: 'Sur cette page',
    atAGlance: 'Le collège en bref',
    stepsTitle: 'Les grandes étapes',
    keyDates: 'Dates clés',
    directorsTitle: 'Ceux qui ont dirigé le collège',
    name: 'Nom',
    period: 'Période',
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
    title: 'Connexion à votre espace',
    lead: 'Élèves, enseignants et administration du collège.',
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
    sessionUnavailable:
      'Le serveur est très sollicité et n’a pas pu rouvrir votre session. Elle est peut-être toujours valable : réessayez dans un instant.',
    retry: 'Réessayer',
    retrying: 'Nouvel essai…',
    errors: {
      emailRequired: 'Saisissez votre adresse e-mail.',
      passwordRequired: 'Saisissez votre mot de passe.',
      wrongCredentials:
        'Identifiant ou mot de passe incorrect. Vérifiez la saisie ou contactez le secrétariat de votre cycle.',
      tooManyAttempts: 'Trop de tentatives. Patientez une minute avant de réessayer.',
      other: 'La connexion n’a pas abouti. Réessayez dans un instant.',
    },
  },
};
