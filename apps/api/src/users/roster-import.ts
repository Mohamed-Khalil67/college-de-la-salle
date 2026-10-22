import {
  CLASSES,
  describeSchoolEmails,
  emailNumberReason,
  type ImportPreviewRow,
  type ImportRole,
  type ImportUsersError,
  parseRosterDate,
  ROSTER_HEADERS,
  schoolEmailLocalPart,
  type SectionId,
} from '@cdls/shared';

/**
 * What identifies "the same person again" when there is no student number: role, exact normalised name
 * (accents, case, spaces and apostrophes ignored) and, for students, section and class.
 */
export function identityKey(
  role: ImportRole,
  firstName: string,
  lastName: string,
  sectionCode: string | null,
  classId: string | null,
): string | null {
  const local = schoolEmailLocalPart(firstName, lastName);
  return local ? [role, local, sectionCode ?? '', classId ?? ''].join('|') : null;
}

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

/** Does a line without a student number match an existing account, and is it forced as a homonym? */
function identityMatch(
  context: RosterContext,
  line: number,
  key: string | null,
): { alreadyImported: boolean; matchedBy: 'name' | null; createAnyway: boolean } {
  if (!key || !context.existingByIdentity.has(key))
    return { alreadyImported: false, matchedBy: null, createAnyway: false };
  const force = context.createAnyway.has(line);
  return { alreadyImported: !force, matchedBy: 'name', createAnyway: force };
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
  /**
   * Student numbers already in the school, with the e-mail of that student. A roster line with one of
   * these numbers is the same student again: the account is kept as it is, never renumbered.
   */
  readonly existingByNumber: ReadonlyMap<string, string>;
  /** E-mail of an existing account by `identityKey` (same name, and section and class for students). */
  readonly existingByIdentity: ReadonlyMap<string, string>;
  /** Lines the request asks to create even though the identity matches (genuine homonyms). */
  readonly createAnyway: ReadonlySet<number>;
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
  /** Real line number of each record in the file (a quoted cell may span lines); defaults to index + 2. */
  lineNumbers: readonly number[] = [],
): CheckedRoster {
  const errors: ImportUsersError[] = [];
  const valid: Omit<CheckedRow, 'email' | 'emailNumber' | 'emailNote'>[] = [];
  const numbers = new Set<string>();

  records.forEach((record, i) => {
    const line = lineNumbers[i] ?? i + 2;
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
        ...identityMatch(context, line, identityKey('teacher', firstName, lastName, null, null)),
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
    if (studentNumber && numbers.has(studentNumber))
      return fail(`matricule en double dans le fichier : ${studentNumber}`);
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
      ...(studentNumber
        ? {
            alreadyImported: context.existingByNumber.has(studentNumber),
            matchedBy: context.existingByNumber.has(studentNumber) ? ('studentNumber' as const) : null,
            createAnyway: false,
          }
        : identityMatch(
            context,
            line,
            identityKey('student', firstName, lastName, section, schoolClass.id),
          )),
    });
  });

  // Only new people get an address; students already in the school keep theirs. Numbers are counted
  // after the addresses in the database and the earlier lines of the file.
  const fresh = valid.filter((row) => !row.alreadyImported);
  const generated = describeSchoolEmails(fresh, context.domain, context.takenEmails);
  const byLine = new Map(fresh.map((row, i) => [row.line, generated[i]!] as const));
  // Every valid row has a usable name (checked above), so every address is set.
  const rows = valid.map((row): CheckedRow => {
    if (row.alreadyImported) {
      const existing =
        row.matchedBy === 'studentNumber'
          ? context.existingByNumber.get(row.studentNumber!)!
          : context.existingByIdentity.get(
              identityKey(context.role, row.firstName, row.lastName, row.sectionCode, row.classId)!,
            )!;
      return { ...row, email: existing, emailNumber: 0, emailNote: null };
    }
    const { email, number } = byLine.get(row.line)!;
    return { ...row, email, emailNumber: number, emailNote: emailNumberReason(number) };
  });
  return { rows, errors };
}
