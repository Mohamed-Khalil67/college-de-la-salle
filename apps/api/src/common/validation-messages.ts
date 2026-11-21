/**
 * French messages for the global ValidationPipe. A DTO's own message (French, written by us) is kept; one of
 * class-validator's English defaults (« x must be a string », « property x should not exist ») is replaced by a
 * French sentence chosen by the constraint's name, with the field's path and the number the default carried.
 * Never the value that was sent. Pure.
 */

/** The parts of class-validator's `ValidationError` this file reads (duck-typed, so it stays pure). */
export interface ValidationIssue {
  readonly property: string;
  readonly constraints?: Readonly<Record<string, string>>;
  readonly children?: readonly ValidationIssue[];
}

/** class-validator's own messages are plain English sentences about the property. */
function isEnglishDefault(message: string): boolean {
  return /^[\x20-\x7E]*$/.test(message) && /\b(must|should|unknown value)\b/.test(message);
}

const number = (message: string): string => /(-?\d+(?:\.\d+)?)/.exec(message)?.[1] ?? '';

const FRENCH: Readonly<Record<string, (field: string, message: string) => string>> = {
  whitelistValidation: (f) => `Le champ « ${f} » n’est pas accepté.`,
  isNotEmpty: (f) => `« ${f} » est obligatoire.`,
  isDefined: (f) => `« ${f} » est obligatoire.`,
  isString: (f) => `« ${f} » doit être un texte.`,
  isEmail: (f) => `« ${f} » doit être une adresse e-mail valide.`,
  isInt: (f) => `« ${f} » doit être un nombre entier.`,
  isNumber: (f) => `« ${f} » doit être un nombre.`,
  isPositive: (f) => `« ${f} » doit être un nombre positif.`,
  isBoolean: (f) => `« ${f} » doit valoir vrai ou faux.`,
  isUuid: (f) => `« ${f} » n’est pas un identifiant valide.`,
  isIn: (f) => `« ${f} » n’a pas une valeur permise.`,
  isEnum: (f) => `« ${f} » n’a pas une valeur permise.`,
  isDateString: (f) => `« ${f} » doit être une date valide.`,
  isIso8601: (f) => `« ${f} » doit être une date valide.`,
  isDay: (f) => `« ${f} » doit être une date écrite AAAA-MM-JJ.`,
  matches: (f) => `« ${f} » n’a pas le format attendu.`,
  minLength: (f, m) => `« ${f} » doit contenir au moins ${number(m)} caractères.`,
  maxLength: (f, m) => `« ${f} » doit contenir au plus ${number(m)} caractères.`,
  min: (f, m) => `« ${f} » doit valoir au moins ${number(m)}.`,
  max: (f, m) => `« ${f} » doit valoir au plus ${number(m)}.`,
  isArray: (f) => `« ${f} » doit être une liste.`,
  arrayMinSize: (f, m) => `« ${f} » doit contenir au moins ${number(m)} élément(s).`,
  arrayMaxSize: (f, m) => `« ${f} » doit contenir au plus ${number(m)} éléments.`,
  arrayUnique: (f) => `« ${f} » ne doit pas contenir deux fois la même valeur.`,
  arrayNotEmpty: (f) => `« ${f} » ne doit pas être vide.`,
  isObject: (f) => `« ${f} » est mal formé.`,
  nestedValidation: (f) => `« ${f} » est mal formé.`,
  unknownValue: () => 'La requête est mal formée.',
};

function french(constraint: string, field: string, message: string): string {
  if (!isEnglishDefault(message)) return message;
  const make = FRENCH[constraint] ?? FRENCH[constraint.charAt(0).toLowerCase() + constraint.slice(1)];
  return make ? make(field, message) : `« ${field} » n’est pas valide.`;
}

/** Every problem of a request, nested ones included (`items.0.name`), as French sentences. */
export function validationMessages(issues: readonly ValidationIssue[], parent = ''): string[] {
  return issues.flatMap((issue) => {
    const field = parent ? `${parent}.${issue.property}` : issue.property;
    const own = Object.entries(issue.constraints ?? {}).map(([name, message]) => french(name, field, message));
    return [...own, ...validationMessages(issue.children ?? [], field)];
  });
}
