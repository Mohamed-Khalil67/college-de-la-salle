import {
  assignSchoolEmails,
  CLASSES,
  type ImportPreviewRow,
  type ImportRole,
  type ImportUsersError,
  parseRosterDate,
  ROSTER_HEADERS,
  schoolEmailLocalPart,
  type SectionId,
} from '@cdls/shared';

/** Every account costs one password hash: 500 rows keep an import well inside a proxy timeout. */
export const MAX_IMPORT_ROWS = 500;
const STUDENT_NUMBER = /^[\w-]{1,32}$/;

/** Accepted column names, French spreadsheet headings included, mapped to the contract's names. */
const ALIASES: Readonly<Record<string, string>> = {
  lastname: 'lastName',
  nom: 'lastName',
  firstname: 'firstName',
  prenom: 'firstName',
  section: 'section',
  filiere: 'section',
  class: 'class',
  classe: 'class',
  studentnumber: 'studentNumber',
  matricule: 'studentNumber',
  birthdate: 'birthDate',
  datenaissance: 'birthDate',
  datedenaissance: 'birthDate',
};

const REQUIRED: Readonly<Record<ImportRole, readonly string[]>> = {
  student: ['lastName', 'firstName', 'section', 'class'],
  teacher: ['lastName', 'firstName'],
};

/** A heading as typed (« Prénom », « date de naissance ») to its column name, or null when unknown. */
export function columnName(heading: string): string | null {
  const key = heading
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  return ALIASES[key] ?? null;
}

/** Problems with the header row as a whole (unknown, repeated or missing columns). */
export function headerProblems(headings: readonly string[], role: ImportRole): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const allowed = new Set(ROSTER_HEADERS[role]);
  for (const heading of headings) {
    const name = columnName(heading);
    if (!name || !allowed.has(name)) problems.push(`colonne inconnue « ${heading} »`);
    else if (seen.has(name)) problems.push(`colonne en double « ${heading} »`);
    else seen.add(name);
  }
  for (const name of REQUIRED[role])
    if (!seen.has(name)) problems.push(`colonne obligatoire manquante : ${name}`);
  return problems;
}

export interface RosterClass {
  readonly id: string;
  readonly label: string;
}

export interface RosterContext {
  readonly role: ImportRole;
  readonly domain: string;
  /** `section/code` of the current year's classes (codes lower-case). */
  readonly classes: ReadonlyMap<string, RosterClass>;
  /** E-mails already used by accounts (lower-case). */
  readonly takenEmails: ReadonlySet<string>;
  /** Student numbers already used. */
  readonly takenNumbers: ReadonlySet<string>;
}

export interface CheckedRow extends ImportPreviewRow {
  readonly classId: string | null;
}

export interface CheckedRoster {
  readonly rows: CheckedRow[];
  readonly errors: ImportUsersError[];
}

/**
 * Checks every line of a roster (records keyed by column name, header on line 1) and builds the login
 * e-mails, numbered against existing accounts and earlier lines. Lines with an error get no e-mail
 * and do not take a number from the valid ones.
 */
export function checkRoster(
  records: readonly Readonly<Record<string, string>>[],
  context: RosterContext,
): CheckedRoster {
  const errors: ImportUsersError[] = [];
  const valid: Omit<CheckedRow, 'email'>[] = [];
  const numbers = new Set<string>();

  records.forEach((record, i) => {
    const line = i + 2;
    const fail = (message: string) => errors.push({ line, message });
    const get = (name: string) => (record[name] ?? '').trim();
    const lastName = get('lastName');
    const firstName = get('firstName');
    if (!lastName || !firstName) return fail('nom et prénom obligatoires');
    if (lastName.length > 80 || firstName.length > 80)
      return fail('nom et prénom comptent 80 caractères au plus');
    if (!schoolEmailLocalPart(firstName, lastName))
      return fail(
        'le nom ou le prénom ne contient aucune lettre latine : écrivez-le en lettres latines',
      );

    if (context.role === 'teacher') {
      valid.push({
        line,
        lastName,
        firstName,
        sectionCode: null,
        classLabel: null,
        classId: null,
        studentNumber: null,
        birthDate: null,
      });
      return;
    }

    const section = get('section').toLowerCase();
    if (!(section in CLASSES)) return fail(`section inconnue « ${get('section')} » (nationale ou bac)`);
    const code = get('class').toLowerCase();
    const schoolClass = context.classes.get(`${section}/${code}`);
    if (!schoolClass)
      return fail(`classe inconnue « ${get('class')} » en ${section} pour l’année en cours`);
    const studentNumber = get('studentNumber') || null;
    if (studentNumber && !STUDENT_NUMBER.test(studentNumber))
      return fail(`matricule invalide « ${studentNumber} » (lettres, chiffres et tirets, 32 au plus)`);
    if (studentNumber && (context.takenNumbers.has(studentNumber) || numbers.has(studentNumber)))
      return fail(`matricule déjà utilisé : ${studentNumber}`);
    const rawDate = get('birthDate');
    const birthDate = rawDate ? parseRosterDate(rawDate) : null;
    if (rawDate && !birthDate)
      return fail(`date de naissance invalide « ${rawDate} » (AAAA-MM-JJ ou JJ/MM/AAAA)`);
    if (studentNumber) numbers.add(studentNumber);
    valid.push({
      line,
      lastName,
      firstName,
      sectionCode: section as SectionId,
      classLabel: schoolClass.label,
      classId: schoolClass.id,
      studentNumber,
      birthDate,
    });
  });

  const emails = assignSchoolEmails(valid, context.domain, context.takenEmails);
  // Every valid row has a usable name (checked above), so every e-mail is set.
  const rows = valid.map((row, i) => ({ ...row, email: emails[i]! }));
  return { rows, errors };
}
