import { MATIERES_FR } from '../../../apps/web/src/app/school/matieres-text';
import type { SchoolContent } from '../../../apps/web/src/app/school/school-content';

/*
 * PLACEHOLDER content of the fictional École Exemple, in French (the site is French only, docs/i18n.md). Every text is
 * made up.
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
