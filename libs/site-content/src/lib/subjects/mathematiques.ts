import type { SubjectPage } from '../model';

/**
 * Mathématiques — Thanaweya Amma, section scientifique (option mathématiques), programme en français.
 * Outline to be validated by the mathematics department against the Ministry's current syllabus.
 */
export const MATHEMATIQUES: SubjectPage = {
  slug: 'mathematiques',
  lang: 'fr',
  navLabel: 'Mathématiques',
  title: 'Mathématiques',
  kicker: 'Thanaweya Amma · Section scientifique, option mathématiques',
  intro:
    'Analyse, algèbre, géométrie dans l’espace et mécanique : un programme exigeant qui prépare aux études d’ingénieur, d’informatique et de sciences. Chaque chapitre est présenté avec ses objectifs, ses notions clés, ses formules et un exercice type corrigé.',
  photo: 'construction-1954',
  highlights: [
    { value: '6', label: 'chapitres' },
    { value: '2', label: 'branches : pure et appliquée' },
    { value: '5', label: 'exercices types corrigés' },
  ],
  context: null,
  chapters: [
    {
      id: 'derivation',
      part: 'Analyse',
      title: 'Calcul différentiel',
      summary: 'Dérivées des fonctions usuelles, règles de calcul et applications à l’étude des fonctions.',
      objectives: [
        'Calculer la dérivée d’un produit, d’un quotient et d’une fonction composée.',
        'Déterminer l’équation d’une tangente à une courbe.',
        'Étudier les variations, les extremums et la concavité d’une fonction.',
      ],
      notions: ['Nombre dérivé', 'Dérivée implicite', 'Points critiques', 'Point d’inflexion', 'Fonctions exponentielle et logarithme'],
      status: 'prevu',
    },
    {
      id: 'integration',
      part: 'Analyse',
      title: 'Calcul intégral',
      summary: 'Primitives, techniques d’intégration et calcul d’aires et de volumes.',
      objectives: [
        'Trouver une primitive par substitution ou par parties.',
        'Calculer une intégrale définie.',
        'Calculer l’aire entre deux courbes et le volume d’un solide de révolution.',
      ],
      notions: ['Primitive', 'Intégrale définie', 'Intégration par parties', 'Aire', 'Volume de révolution'],
      status: 'prevu',
    },
    {
      id: 'algebre',
      part: 'Algèbre',
      title: 'Dénombrement et nombres complexes',
      summary: 'Permutations, combinaisons et binôme de Newton ; forme algébrique et trigonométrique des complexes.',
      objectives: [
        'Dénombrer des tirages avec ou sans ordre.',
        'Développer (a + b)ⁿ avec le binôme de Newton.',
        'Passer de la forme algébrique à la forme trigonométrique et appliquer la formule de Moivre.',
      ],
      notions: ['Factorielle', 'Arrangements et combinaisons', 'Binôme de Newton', 'Module et argument', 'Racines n-ièmes'],
      status: 'prevu',
    },
    {
      id: 'espace',
      part: 'Algèbre',
      title: 'Géométrie dans l’espace et vecteurs',
      summary: 'Repérage dans l’espace, produits scalaire et vectoriel, droites et plans.',
      objectives: [
        'Calculer un produit scalaire et un produit vectoriel.',
        'Écrire les équations d’une droite et d’un plan.',
        'Calculer des distances et des angles dans l’espace.',
      ],
      notions: ['Repère orthonormé', 'Produit scalaire', 'Produit vectoriel', 'Équation cartésienne d’un plan', 'Distance d’un point à un plan'],
      status: 'prevu',
    },
    {
      id: 'statique',
      part: 'Mécanique',
      title: 'Statique',
      summary: 'Équilibre d’un solide : forces, frottement et moments.',
      objectives: [
        'Écrire les conditions d’équilibre d’un solide.',
        'Utiliser le coefficient de frottement.',
        'Calculer le moment d’une force et d’un couple.',
      ],
      notions: ['Résultante', 'Réaction', 'Frottement', 'Moment d’une force', 'Couple'],
      status: 'prevu',
    },
    {
      id: 'dynamique',
      part: 'Mécanique',
      title: 'Dynamique',
      summary: 'Lois de Newton, travail, énergie et quantité de mouvement.',
      objectives: [
        'Appliquer la deuxième loi de Newton à un mouvement rectiligne.',
        'Calculer un travail, une énergie cinétique et une puissance.',
        'Utiliser la conservation de la quantité de mouvement lors d’un choc.',
      ],
      notions: ['Lois de Newton', 'Travail d’une force', 'Énergie cinétique', 'Puissance', 'Quantité de mouvement'],
      status: 'prevu',
    },
  ],
  formulas: [
    { label: 'Dérivée d’un produit', expression: '(u·v)′ = u′·v + u·v′' },
    { label: 'Dérivée d’un quotient', expression: '(u / v)′ = (u′·v − u·v′) / v²' },
    { label: 'Dérivée d’une composée', expression: '(f ∘ g)′(x) = f′(g(x)) · g′(x)' },
    { label: 'Intégration par parties', expression: '∫ u·v′ dx = u·v − ∫ u′·v dx' },
    { label: 'Aire entre deux courbes', expression: 'A = ∫ₐᵇ |f(x) − g(x)| dx' },
    { label: 'Volume de révolution', expression: 'V = π ∫ₐᵇ f(x)² dx', note: 'rotation autour de l’axe des abscisses' },
    { label: 'Combinaisons', expression: 'C(n, k) = n! / (k! · (n − k)!)' },
    { label: 'Binôme de Newton', expression: '(a + b)ⁿ = Σₖ C(n, k) · aⁿ⁻ᵏ · bᵏ' },
    { label: 'Formule de Moivre', expression: '(cos θ + i sin θ)ⁿ = cos nθ + i sin nθ' },
    { label: 'Deuxième loi de Newton', expression: 'F = m · a' },
    { label: 'Énergie cinétique', expression: 'Ec = ½ · m · v²' },
    { label: 'Travail d’une force constante', expression: 'W = F · d · cos α' },
  ],
  examples: [
    {
      title: 'Dériver un produit',
      statement: 'Calculer la dérivée de f(x) = x² · eˣ.',
      steps: ['On pose u = x² et v = eˣ, donc u′ = 2x et v′ = eˣ.', 'f′(x) = u′v + uv′ = 2x·eˣ + x²·eˣ.'],
      answer: 'f′(x) = x(x + 2)·eˣ',
    },
    {
      title: 'Intégrer par parties',
      statement: 'Calculer I = ∫₀¹ x · eˣ dx.',
      steps: ['On pose u = x et v′ = eˣ, donc u′ = 1 et v = eˣ.', 'I = [x·eˣ]₀¹ − ∫₀¹ eˣ dx = e − (e − 1).'],
      answer: 'I = 1',
    },
    {
      title: 'Dénombrer sans ordre',
      statement: 'De combien de façons peut-on choisir 3 élèves parmi 10 ?',
      steps: ['L’ordre ne compte pas : c’est une combinaison.', 'C(10, 3) = 10! / (3! · 7!) = (10 · 9 · 8) / 6.'],
      answer: '120 façons',
    },
    {
      title: 'Forme trigonométrique',
      statement: 'Écrire z = 1 + i√3 sous forme trigonométrique.',
      steps: ['|z| = √(1² + (√3)²) = 2.', 'cos θ = 1/2 et sin θ = √3/2, donc θ = π/3.'],
      answer: 'z = 2 (cos π/3 + i sin π/3)',
    },
    {
      title: 'Appliquer la deuxième loi de Newton',
      statement: 'Un corps de 2 kg, sur un plan horizontal sans frottement, est tiré par une force horizontale de 10 N. Quelle est son accélération ?',
      steps: ['Sans frottement, la force résultante est F = 10 N.', 'a = F / m = 10 / 2.'],
      answer: 'a = 5 m/s²',
    },
  ],
  tips: [
    { title: 'Rédiger chaque étape', text: 'À l’examen, la démarche est notée autant que le résultat : écrivez la formule utilisée avant de remplacer par les valeurs.' },
    { title: 'Vérifier les unités', text: 'En mécanique, une réponse sans unité est incomplète. Contrôlez que l’unité obtenue correspond à la grandeur demandée.' },
    { title: 'Faire un dessin', text: 'En géométrie dans l’espace comme en statique, un schéma soigné évite la plupart des erreurs de signe et de direction.' },
    { title: 'Réviser par chapitre', text: 'Reprenez chaque exercice type sans regarder la correction, puis comparez étape par étape.' },
  ],
  resources: [
    { title: 'Fiche de formules — Analyse', description: 'Dérivées, primitives usuelles et intégration.', url: null },
    { title: 'Fiche de formules — Algèbre et espace', description: 'Dénombrement, complexes, vecteurs.', url: null },
    { title: 'Annales corrigées', description: 'Sujets d’entraînement des années précédentes.', url: null },
  ],
};
