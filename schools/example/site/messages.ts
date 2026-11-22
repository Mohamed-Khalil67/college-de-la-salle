import type { SchoolMessages } from '../../../apps/web/src/app/i18n/messages';

/*
 * PLACEHOLDER words of the fictional École Exemple that name the school: descriptions, hero, history, the accessibility
 * statement, in French. The shared words (sign-in, contact form, page chrome) are the platform's (apps/web/src/app/i18n/
 * messages-base.fr.ts).
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
